import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { authMessage, authRetryDelay } from '../auth/service';
import { accountDestination, saveSignupIntent } from '../auth/onboarding';
import { createAuthCooldown } from '../auth/cooldown';
import './LoginRegister.css';

export default function LoginRegister() {
  const navigate = useNavigate();
  const { user, authService, refreshSession, error: sessionError, loading: checkingSession } = useAuth();
  const [step, setStep] = useState('email'); // email, phone, otp
  const [mode, setMode] = useState('signup');
  const [accountType, setAccountType] = useState('buyer');
  const [channel, setChannel] = useState('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cooldown] = useState(() => {
    let storage;
    try { storage = window.localStorage; } catch { /* Use memory when blocked. */ }
    return createAuthCooldown(storage);
  });
  const [resendCountdown, setResendCountdown] = useState(() => cooldown.remaining());
  const requestPending = useRef(false);
  const [verifyCountdown, setVerifyCountdown] = useState(0);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (user) navigate(accountDestination(), { replace: true });
  }, [user, navigate]);

  const coolingDown = resendCountdown > 0;
  useEffect(() => {
    if (!coolingDown) return;
    const interval = setInterval(() => setResendCountdown(cooldown.remaining()), 1000);
    return () => clearInterval(interval);
  }, [coolingDown, cooldown]);

  useEffect(() => {
    const sync = () => setResendCountdown(cooldown.remaining());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [cooldown]);
  const verificationCoolingDown = verifyCountdown > 0;
  useEffect(() => {
    if (!verificationCoolingDown) return;
    const interval = setInterval(() => setVerifyCountdown(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(interval);
  }, [verificationCoolingDown]);

  const busy = loading || googleLoading || checkingSession || Boolean(user);
  const visibleError = error?.message || sessionError;

  const handleSendOtp = async () => {
    if (busy || requestPending.current || cooldown.remaining() > 0) return;
    requestPending.current = true;
    setError(null);
    setLoading(true);
    try {
      saveSignupIntent(mode, accountType);
      const normalized = channel === 'email'
        ? await authService.sendEmailOtp(email, mode, window.location.origin) : await authService.sendOtp(phone, mode);
      if (channel === 'email') setEmail(normalized);
      else setPhone(normalized);
      setStep('otp');
      setResendCountdown(cooldown.start(60)); // UI cooldown; provider-side rate limiting is still required.
    } catch (failure) {
      const delay = authRetryDelay(failure);
      if (delay) setResendCountdown(cooldown.start(delay));
      setError({ message: authMessage(failure) });
    } finally {
      requestPending.current = false;
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (busy || requestPending.current || verificationCoolingDown) return;
    requestPending.current = true;
    setError(null);
    setLoading(true);
    try {
      if (channel === 'email') await authService.verifyEmailOtp(email, otp);
      else await authService.verifyOtp(phone, otp);
      navigate(accountDestination(), { replace: true });
    } catch (failure) {
      // A successful sign-in in another tab can make the submitted code obsolete.
      let restored = null;
      try { restored = await refreshSession(); } catch { /* Keep the original failure. */ }
      if (restored) navigate(accountDestination(), { replace: true });
      else {
        const delay = authRetryDelay(failure);
        setVerifyCountdown(delay);
        setError({ message: delay ? 'Tạm thời bị giới hạn xác nhận mã. Giữ mã hiện tại và chờ trước khi thử lại.' : authMessage(failure) });
      }
    } finally {
      requestPending.current = false;
      setLoading(false);
    }
  };

  const handleResendOtp = () => {
    if (resendCountdown > 0) return;
    handleSendOtp();
  };

  const handleRestoreSession = async () => {
    if (busy || requestPending.current) return;
    requestPending.current = true;
    setLoading(true);
    setError(null);
    try {
      const session = await refreshSession();
      if (session) navigate(accountDestination(), { replace: true });
    } catch {
      setError({ message: 'Chưa kiểm tra được phiên đăng nhập. Vui lòng chờ rồi kiểm tra lại.' });
    } finally {
      requestPending.current = false;
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (busy) return;
    setError(null);
    setGoogleLoading(true);
    try {
      saveSignupIntent(mode, accountType);
      await authService.google(window.location.origin);
    } catch (failure) {
      setError({ message: authMessage(failure) });
    } finally {
      setGoogleLoading(false);
    }
  };

  const resendButton = (
    <button type="button" className="button-secondary" onClick={handleResendOtp} disabled={busy || coolingDown}>
      {coolingDown ? `Gửi lại sau ${resendCountdown}s` : 'Gửi lại mã'}
    </button>
  );

  if (checkingSession || user) return <div className="container"><div className="auth-form" role="status">
    <p>{user ? 'Đã đăng nhập. Đang mở tài khoản...' : 'Đang kiểm tra phiên đăng nhập...'}</p>
  </div></div>;

  return (
    <div className="container">
      <Link to="/" className="page-back-link"><span aria-hidden="true">←</span> Về trang chủ</Link>

      <div className="auth-form">
        <div className="auth-modes" role="group" aria-label="Đăng ký hoặc đăng nhập">
          <button type="button" aria-pressed={mode === 'signup'} disabled={busy} onClick={() => { setMode('signup'); setStep(channel); setOtp(''); setError(null); }}>
            <strong>Đăng ký</strong><span>Dành cho người mới</span>
          </button>
          <button type="button" aria-pressed={mode === 'login'} disabled={busy} onClick={() => { setMode('login'); setStep(channel); setOtp(''); setError(null); }}>
            <strong>Đăng nhập</strong><span>Đã có tài khoản</span>
          </button>
        </div>
        {step !== 'otp' && (
          <>
            <h1>{mode === 'signup' ? 'Tạo tài khoản' : 'Chào mừng trở lại'}</h1>
            <p>{mode === 'signup' ? 'Đăng ký bằng liên kết hoặc mã xác nhận gửi tới email, không cần mật khẩu.' : 'Dùng email hoặc số điện thoại đã đăng ký để nhận mã đăng nhập.'}</p>
            {mode === 'signup' && <fieldset className="signup-options">
              <legend>Bạn muốn sử dụng tài khoản để</legend>
              <label><input type="radio" name="account-type" value="buyer" checked={accountType === 'buyer'} disabled={busy} onChange={() => setAccountType('buyer')} /><span><strong>Người dùng</strong><span>Mua sắm và theo dõi đơn hàng</span></span></label>
              <label><input type="radio" name="account-type" value="seller" checked={accountType === 'seller'} disabled={busy} onChange={() => setAccountType('seller')} /><span><strong>Người bán</strong><span>Mua sắm và đăng ký shop</span></span></label>
            </fieldset>}
            <div className="auth-channels" aria-label="Phương thức đăng nhập">
              <button type="button" aria-pressed={channel === 'email'} disabled={busy} onClick={() => { setChannel('email'); setError(null); setOtp(''); }}>Email / Gmail</button>
              <button type="button" aria-pressed={channel === 'phone'} disabled={busy} onClick={() => { setChannel('phone'); setError(null); setOtp(''); }}>Số điện thoại</button>
            </div>
            <button
              className="button-google"
              onClick={handleGoogleLogin}
              disabled={busy}
            >
              {googleLoading ? 'Đang kết nối...' : 'Tiếp tục với Google'}
            </button>
            <p className="or-divider">hoặc</p>
            <form onSubmit={(e) => {
              e.preventDefault();
              handleSendOtp();
            }}>
              <div className="form-group">
                <label htmlFor="auth-contact">{channel === 'email' ? 'Email của bạn' : 'Số điện thoại'}</label>
                <input id="auth-contact"
                  type={channel === 'email' ? 'email' : 'tel'}
                  aria-label={channel === 'email' ? 'Email / Gmail' : 'Số điện thoại'}
                  autoComplete={channel === 'email' ? 'email' : 'tel'}
                  placeholder={channel === 'email' ? 'Email của bạn' : 'Số điện thoại'}
                  value={channel === 'email' ? email : phone}
                  onChange={(e) => channel === 'email' ? setEmail(e.target.value) : setPhone(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="button-primary" disabled={busy || coolingDown}>
                {loading ? 'Đang gửi...' : coolingDown ? `Gửi lại sau ${resendCountdown}s` : mode === 'signup' ? 'Gửi mã đăng ký' : 'Gửi mã đăng nhập'}
              </button>
            </form>
            {visibleError && (
              <div className="alert alert-error" role="alert">
                <p>{visibleError}</p>
              </div>
            )}
          </>
        )}
        {step === 'otp' && (
          <>
            <h1>{channel === 'email' ? 'Kiểm tra hộp thư' : 'Kiểm tra tin nhắn'}</h1>
            <p>{channel === 'email'
              ? <>Đã yêu cầu gửi email tới {email}. Bấm liên kết xác nhận trong email để đăng nhập, hoặc nhập mã OTP nếu email có mã.</>
              : <>Đã yêu cầu gửi mã tới {phone}. Nhập mã xác nhận trong tin nhắn.</>}</p>
            <form onSubmit={(e) => {
              e.preventDefault();
              handleVerifyOtp();
            }}>
              <div className="form-group">
                <label htmlFor="auth-otp">Mã xác nhận</label>
                <input id="auth-otp"
                  type="text"
                  aria-label="Mã OTP"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={channel === 'email' ? 10 : 6}
                  placeholder="Nhập mã OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
              </div>
              <div className="otp-actions">
                <button type="submit" className="button-primary" disabled={busy || verificationCoolingDown}>
                  {loading ? 'Đang xác thực...' : verificationCoolingDown ? `Thử lại sau ${verifyCountdown}s` : mode === 'signup' ? 'Xác nhận đăng ký' : 'Đăng nhập'}
                </button>
                {resendButton}
              </div>
            </form>
            {visibleError && (
              <div className="alert alert-error" role="alert">
                <p>{visibleError}</p>
              </div>
            )}
            <button type="button" className="auth-change-contact" disabled={busy} onClick={() => { setStep(channel); setOtp(''); setError(null); }}>Đổi email hoặc số điện thoại</button>
          </>
        )}
        {sessionError && <button type="button" className="auth-change-contact" disabled={busy} onClick={handleRestoreSession}>Kiểm tra lại phiên đăng nhập</button>}
        <p className="auth-device-note">Tự động ghi nhớ đăng nhập trên trình duyệt này. Bạn có thể đăng xuất trong Cài đặt.</p>
      </div>
    </div>
  );
}
