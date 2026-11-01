import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { authMessage, authRetryDelay } from '../auth/service';
import { accountDestination, saveSignupIntent } from '../auth/onboarding';
import './LoginRegister.css';

export default function LoginRegister() {
  const navigate = useNavigate();
  const { user, authService, refreshSession, error: sessionError, loading: checkingSession } = useAuth();
  const [mode, setMode] = useState('login');
  const [accountType, setAccountType] = useState('buyer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const requestPending = useRef(false);

  useEffect(() => {
    if (user) navigate(accountDestination(), { replace: true });
  }, [user, navigate]);

  const coolingDown = retryCountdown > 0;
  useEffect(() => {
    if (!coolingDown) return;
    const interval = setInterval(() => setRetryCountdown(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(interval);
  }, [coolingDown]);

  const busy = loading || checkingSession || Boolean(user);
  const visibleError = error || sessionError;

  const changeMode = next => {
    setMode(next);
    setPassword('');
    setConfirmation('');
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async event => {
    event.preventDefault();
    if (busy || requestPending.current || coolingDown) return;
    if (mode === 'signup' && password !== confirmation) {
      setError('Mật khẩu nhập lại chưa khớp.');
      return;
    }
    requestPending.current = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      saveSignupIntent(mode, accountType);
      if (mode === 'signup') {
        const result = await authService.signupWithPassword(email, password, window.location.origin);
        if (result.confirmationRequired) {
          setPassword('');
          setConfirmation('');
          setNotice('Nếu email đủ điều kiện đăng ký, hãy mở liên kết xác nhận trong hộp thư rồi đăng nhập bằng mật khẩu. Môi trường hiện chưa cấp phiên đăng nhập.');
          setMode('login');
          return;
        }
      } else {
        await authService.loginWithPassword(email, password);
      }
      setPassword('');
      setConfirmation('');
      navigate(accountDestination(), { replace: true });
    } catch (failure) {
      setRetryCountdown(authRetryDelay(failure));
      setError(authMessage(failure));
    } finally {
      requestPending.current = false;
      setLoading(false);
    }
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
      setError('Chưa kiểm tra được phiên đăng nhập. Vui lòng chờ rồi kiểm tra lại.');
    } finally {
      requestPending.current = false;
      setLoading(false);
    }
  };

  if (checkingSession || user) return <div className="container"><div className="auth-form" role="status">
    <p>{user ? 'Đã đăng nhập. Đang mở tài khoản...' : 'Đang kiểm tra phiên đăng nhập...'}</p>
  </div></div>;

  return (
    <div className="container">
      <Link to="/" className="page-back-link"><span aria-hidden="true">←</span> Về trang chủ</Link>
      <div className="auth-form">
        <div className="auth-modes" role="group" aria-label="Đăng nhập hoặc đăng ký">
          <button type="button" aria-pressed={mode === 'login'} disabled={busy} onClick={() => changeMode('login')}>
            <strong>Đăng nhập</strong><span>Đã có tài khoản</span>
          </button>
          <button type="button" aria-pressed={mode === 'signup'} disabled={busy} onClick={() => changeMode('signup')}>
            <strong>Đăng ký</strong><span>Tự tạo tài khoản</span>
          </button>
        </div>
        <h1>{mode === 'signup' ? 'Tạo tài khoản' : 'Chào mừng trở lại'}</h1>
        <p>{mode === 'signup' ? 'Dùng email làm tài khoản và tự chọn mật khẩu.' : 'Đăng nhập bằng email và mật khẩu của bạn.'}</p>
        {mode === 'signup' && <fieldset className="signup-options">
          <legend>Bạn muốn sử dụng tài khoản để</legend>
          <label><input type="radio" name="account-type" value="buyer" checked={accountType === 'buyer'} disabled={busy} onChange={() => setAccountType('buyer')} /><span><strong>Người dùng</strong><span>Mua sắm và theo dõi đơn hàng</span></span></label>
          <label><input type="radio" name="account-type" value="seller" checked={accountType === 'seller'} disabled={busy} onChange={() => setAccountType('seller')} /><span><strong>Người bán</strong><span>Mua sắm và đăng ký shop</span></span></label>
        </fieldset>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="auth-email">Email (tài khoản)</label>
            <input id="auth-email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} maxLength={254} required />
          </div>
          <div className="form-group">
            <label htmlFor="auth-password">Mật khẩu</label>
            <input id="auth-password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} minLength={mode === 'signup' ? 8 : 1} maxLength={1024} required />
          </div>
          {mode === 'signup' && <div className="form-group">
            <label htmlFor="auth-password-confirmation">Nhập lại mật khẩu</label>
            <input id="auth-password-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} minLength={8} maxLength={1024} required />
          </div>}
          <button type="submit" className="button-primary" disabled={busy || coolingDown}>
            {loading ? 'Đang xử lý...' : coolingDown ? `Thử lại sau ${retryCountdown}s` : mode === 'signup' ? 'Tạo tài khoản' : 'Đăng nhập'}
          </button>
        </form>
        {notice && <p role="status">{notice}</p>}
        {visibleError && <div className="alert alert-error" role="alert"><p>{visibleError}</p></div>}
        {sessionError && <button type="button" className="auth-change-contact" disabled={busy} onClick={handleRestoreSession}>Kiểm tra lại phiên đăng nhập</button>}
        <p className="auth-device-note">Tự động ghi nhớ đăng nhập trên trình duyệt này. Bạn có thể đăng xuất trong Cài đặt.</p>
      </div>
    </div>
  );
}
