export class AuthUiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function authRetryDelay(error) {
  return error?.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit', 'over_sms_send_rate_limit'].includes(error?.code) ? 60 : 0;
}

export function authMessage(error) {
  if (error instanceof AuthUiError) return error.message;
  if (error?.code === 'over_email_send_rate_limit') return 'Dịch vụ đã đạt giới hạn gửi email. Hãy dùng mã đã nhận hoặc thử lại sau; gửi lại ngay sẽ không có mã mới.';
  if (error?.status === 429) return 'Bạn đã thử quá nhiều lần. Vui lòng chờ rồi thử lại.';
  if (['otp_expired', 'bad_code_verifier', 'flow_state_expired', 'flow_state_not_found'].includes(error?.code)) {
    return 'Mã xác thực đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.';
  }
  if (['email_address_not_authorized', 'email_send_failed'].includes(error?.code)) {
    return 'Dịch vụ gửi mã email chưa sẵn sàng. Quản trị viên cần kiểm tra SMTP và mẫu email OTP.';
  }
  if (['provider_disabled', 'phone_provider_disabled', 'sms_send_failed'].includes(error?.code)) {
    return 'Dịch vụ đăng nhập chưa được cấu hình. Vui lòng liên hệ quản trị viên.';
  }
  return 'Không thể xác thực. Vui lòng kiểm tra cấu hình provider hoặc thử lại sau.';
}

export function normalizePhone(input) {
  const value = input.trim().replace(/[\s()-]/g, '');
  const normalized = /^0[35789]\d{8}$/.test(value) ? `+84${value.slice(1)}` : value;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new AuthUiError('Vui lòng nhập số điện thoại hợp lệ, ví dụ 09xxxxxxxx hoặc +84xxxxxxxxx.');
  }
  return normalized;
}

export function normalizeEmail(input) {
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthUiError('Vui lòng nhập địa chỉ email hợp lệ.');
  }
  return email;
}

function validateOtp(otp, email = false) {
  if (!(email ? /^\d{6,10}$/ : /^\d{6}$/).test(otp)) {
    throw new AuthUiError(email ? 'Vui lòng nhập mã email gồm 6–10 chữ số.' : 'Vui lòng nhập mã OTP gồm đúng 6 chữ số.');
  }
}

export function callbackUrl(origin) {
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new AuthUiError('Địa chỉ callback không hợp lệ.');
  }
  return `${origin}/auth/callback`;
}

function dataOf(result) {
  if (result.error) throw new AuthUiError(authMessage(result.error), { status: result.error.status, code: result.error.code });
  return result.data;
}

function sessionOf(result) {
  const data = dataOf(result);
  if (!data?.session?.access_token || !data.session.user?.id) {
    throw new AuthUiError('Không nhận được phiên xác thực. Vui lòng thử lại.');
  }
  return data.session;
}

const exchanges = new WeakMap();
const restores = new WeakMap();
const emailLinks = new WeakMap();

export function createAuthService(client, checkProvider = async () => {}) {
  function auth() {
    if (!client) throw new AuthUiError('Supabase chưa được cấu hình. Không thể đăng nhập.');
    return client.auth;
  }
  return {
    async sendEmailOtp(email, mode = 'signup', origin) {
      if (!['signup', 'login'].includes(mode)) throw new AuthUiError('Vui lòng chọn đăng ký hoặc đăng nhập.');
      const normalized = normalizeEmail(email);
      const sdk = auth();
      await checkProvider('email');
      const options = { shouldCreateUser: mode === 'signup' };
      if (origin) options.emailRedirectTo = callbackUrl(origin);
      dataOf(await sdk.signInWithOtp({ email: normalized, options }));
      return normalized;
    },
    async verifyEmailOtp(email, otp) {
      validateOtp(otp, true);
      return sessionOf(await auth().verifyOtp({ email: normalizeEmail(email), token: otp, type: 'email' }));
    },
    async beginPhoneChange(phone, actorId) {
      const normalized = normalizePhone(phone);
      const sdk = auth();
      const current = dataOf(await sdk.getUser());
      if (!current?.user?.id) throw new AuthUiError('Vui lòng đăng nhập trước khi thêm số điện thoại.');
      if (!actorId || current.user.id !== actorId) throw new AuthUiError('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
      await checkProvider('phone');
      const changed = dataOf(await sdk.updateUser({ phone: normalized }));
      if (changed?.user?.id !== current.user.id) throw new AuthUiError('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
      return { phone: normalized, actorId: current.user.id };
    },
    async verifyPhoneChange(phone, otp, actorId) {
      validateOtp(otp);
      const sdk = auth();
      const current = dataOf(await sdk.getUser());
      if (!actorId || current?.user?.id !== actorId) throw new AuthUiError('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
      const session = sessionOf(await sdk.verifyOtp({ phone: normalizePhone(phone), token: otp, type: 'phone_change' }));
      if (session.user.id !== actorId) throw new AuthUiError('Phiên đăng nhập không hợp lệ.');
      const verified = dataOf(await sdk.getUser());
      if (verified?.user?.id !== actorId || !verified.user.phone || !verified.user.phone_confirmed_at ||
          normalizePhone(`+${verified.user.phone.replace(/^\+/, '')}`) !== normalizePhone(phone)) {
        throw new AuthUiError('Số điện thoại chưa được xác minh. Vui lòng thử lại.');
      }
      return { ...session, user: verified.user };
    },
    async sendOtp(phone, mode = 'signup') {
      if (!['signup', 'login'].includes(mode)) throw new AuthUiError('Vui lòng chọn đăng ký hoặc đăng nhập.');
      const normalized = normalizePhone(phone);
      const sdk = auth();
      await checkProvider('phone');
      dataOf(await sdk.signInWithOtp({
        phone: normalized,
        options: { shouldCreateUser: mode === 'signup' },
      }));
      return normalized;
    },
    async verifyOtp(phone, otp) {
      validateOtp(otp);
      return sessionOf(await auth().verifyOtp({ phone: normalizePhone(phone), token: otp, type: 'sms' }));
    },
    async google(origin) {
      const redirectTo = callbackUrl(origin);
      const sdk = auth();
      await checkProvider('google');
      const data = dataOf(await sdk.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, scopes: 'openid email profile' },
      }));
      if (!data?.url) throw new AuthUiError('Không nhận được địa chỉ đăng nhập Google.');
    },
    exchangeCode(code) {
      const sdk = auth();
      if (!code || code.length > 4096) throw new AuthUiError('Callback thiếu mã xác thực hợp lệ.');
      // React StrictMode must not redeem the same one-time code twice.
      if (exchanges.get(client)?.code === code) return exchanges.get(client).promise;
      const promise = sdk.exchangeCodeForSession(code).then(sessionOf);
      exchanges.set(client, { code, promise });
      return promise;
    },
    acceptEmailLink(accessToken, refreshToken) {
      const sdk = auth();
      const previous = emailLinks.get(client);
      if (previous?.accessToken === accessToken && previous?.refreshToken === refreshToken) return previous.promise;
      const promise = (async () => {
        // Validate with this project's Auth before persisting a legacy email-link session.
        const verified = dataOf(await sdk.getUser(accessToken));
        if (!verified?.user?.id || !verified.user.email_confirmed_at) {
          throw new AuthUiError('Email chưa được xác nhận. Vui lòng yêu cầu liên kết mới.');
        }
        const session = sessionOf(await sdk.setSession({ access_token: accessToken, refresh_token: refreshToken }));
        if (session.user.id !== verified.user.id) {
          await sdk.signOut({ scope: 'local' });
          throw new AuthUiError('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
        }
        return { ...session, user: verified.user };
      })();
      emailLinks.set(client, { accessToken, refreshToken, promise });
      // Retain only the short-lived promise needed for StrictMode's second effect.
      promise.finally(() => setTimeout(() => {
        if (emailLinks.get(client)?.promise === promise) emailLinks.delete(client);
      }, 1000)).catch(() => {});
      return promise;
    },
    restore() {
      const sdk = auth();
      if (restores.has(client)) return restores.get(client);
      const pending = (async () => {
        const data = dataOf(await sdk.getSession());
        if (!data.session) return null;
        // Cached browser data is not authoritative identity.
        const verified = dataOf(await sdk.getUser());
        if (!verified?.user?.id || verified.user.id !== data.session.user.id) {
          throw new AuthUiError('Phiên đăng nhập không hợp lệ.');
        }
        return { ...data.session, user: verified.user };
      })().finally(() => restores.delete(client));
      restores.set(client, pending);
      return pending;
    },
    async logout(scope = 'local') {
      if (!['local', 'global'].includes(scope)) throw new AuthUiError('Phạm vi đăng xuất không hợp lệ.');
      dataOf(await auth().signOut({ scope }));
    },
  };
}
