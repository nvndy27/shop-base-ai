import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { authMessage } from '../auth/service';
import { useTheme } from '../theme/useTheme';
import { useLanguage, useText } from '../locale/useLanguage';
import './Profile.css';
import './Settings.css';

export default function Settings() {
  const t = useText();
  const [language, setLanguage] = useLanguage();
  const [theme, setTheme] = useTheme();
  const { user, authService, loading, error: sessionError } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const coolingDown = cooldown > 0;
  useEffect(() => {
    if (!coolingDown) return;
    const timer = setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [coolingDown]);
  const actorPending = pending?.actorId === user?.id ? pending : null;

  async function sendPhoneCode(event) {
    event.preventDefault();
    if (busy || coolingDown || !user) return;
    setBusy(true);
    setNotice(null);
    try {
      const next = await authService.beginPhoneChange(phone, user.id);
      setPending(next);
      setPhone(next.phone);
      setOtp('');
      setCooldown(60);
      setNotice({ success: true, message: t("Đã yêu cầu gửi mã SMS. Nhập mã để xác minh số điện thoại.") });
    } catch (failure) {
      setNotice({ success: false, message: authMessage(failure) });
    } finally { setBusy(false); }
  }
  async function verifyPhoneCode(event) {
    event.preventDefault();
    if (busy || !actorPending) return;
    setBusy(true);
    setNotice(null);
    try {
      await authService.verifyPhoneChange(actorPending.phone, otp, actorPending.actorId);
      setPending(null);
      setOtp('');
      setNotice({ success: true, message: t("Đã xác minh số điện thoại. Bạn có thể tiếp tục kiểm tra mua hàng.") });
    } catch (failure) {
      setNotice({ success: false, message: authMessage(failure) });
    } finally { setBusy(false); }
  }
  async function logout() {
    if (busy) return;
    setBusy(true);
    try { await authService.logout(); navigate('/auth'); }
    catch (failure) { setNotice({ success: false, message: authMessage(failure) }); }
    finally { setBusy(false); }
  }

  return <div className="container account-page settings-page">
    <Link className="page-back-link" to="/">{t("← Về trang chủ")}</Link>
    <h1>{t("Cài đặt")}</h1>
    <p className="account-page-description">{t("Tùy chỉnh giao diện, tài khoản và số điện thoại dùng để mua hàng.")}</p>
    <section className="profile-section appearance-section">
      <h2>{t("Giao diện")}</h2>
      <p>{t("Chọn giao diện bạn thấy thoải mái. Lựa chọn được lưu trên trình duyệt này.")}</p>
      <fieldset className="theme-options">
        <legend className="theme-legend">{t("Chế độ hiển thị")}</legend>
        {[
          { value: 'light', label: t("Sáng"), detail: t("Tông kem nhẹ nhàng") },
          { value: 'dark', label: t("Tối"), detail: t("Dịu mắt trong buổi tối") },
          { value: 'system', label: t("Theo hệ thống"), detail: t("Theo cài đặt thiết bị") },
        ].map(option => <label className="theme-option" key={option.value}>
          <input type="radio" name="theme" value={option.value} checked={theme === option.value} onChange={() => setTheme(option.value)} />
          <span><strong>{option.label}</strong><span className="theme-option-detail">{option.detail}</span></span>
        </label>)}
      </fieldset>
    </section>
    <section className="profile-section appearance-section">
      <h2>{language === 'en' ? 'Language & prices' : 'Ngôn ngữ và giá'}</h2>
      <p>{language === 'en' ? 'Choose how to view the source catalog. Your choice is saved on this browser.' : 'Lựa chọn được lưu trên trình duyệt này và áp dụng cho catalog sản phẩm nguồn.'}</p>
      <fieldset className="theme-options language-options">
        <legend className="theme-legend">{language === 'en' ? 'Language' : 'Ngôn ngữ'}</legend>
        {[{value:'vi',label:'Tiếng Việt',detail:'Tên tiếng Việt · Giá quy đổi VND'}, {value:'en',label:'English',detail:'Original titles · USD prices'}].map(option => <label className="theme-option" key={option.value}>
          <input type="radio" name="language" checked={language === option.value} onChange={() => setLanguage(option.value)} />
          <span><strong>{option.label}</strong><span className="theme-option-detail">{option.detail}</span></span>
        </label>)}
      </fieldset>
      </section>
    {loading ? <p role="status">{t("Đang kiểm tra phiên đăng nhập...")}</p> : !user ? (
      <section className="profile-section">
        <h2>{t("Tài khoản của bạn")}</h2>
        <p>{t("Đăng ký bằng mã gửi tới email, không cần mật khẩu. Bạn có thể thêm số điện thoại sau.")}</p>
        <Link className="button-primary" to="/auth">{t("Đăng nhập / Tạo tài khoản")}</Link>
        {sessionError && <p role="alert">{sessionError}</p>}
      </section>
    ) : <div className="profile-grid">
      <section className="profile-section">
        <h2>{t("Tài khoản")}</h2>
        <div className="profile-info-item"><label>Email</label><p>{user.email || t("Chưa có")}</p></div>
        <div className="profile-info-item"><label>{t("Số điện thoại")}</label><p>{user.phone || t("Chưa thêm")}</p></div>
        <p>{user.phone && user.phone_confirmed_at ? t("Số điện thoại đã xác minh.") : t("Cần thêm và xác minh số điện thoại trước khi mua hàng.")}</p>
        <div className="settings-actions">
          <Link className="button-outline" to="/profile">{t("Xem hồ sơ")}</Link>
          <button className="button-secondary" disabled={busy} onClick={logout}>{t("Đăng xuất")}</button>
        </div>
      </section>
      <section className="profile-section">
        <h2>{user.phone ? t("Cập nhật số điện thoại") : t("Thêm số điện thoại")}</h2>
        <p>{t("Mã SMS giúp xác minh số điện thoại thuộc về bạn. Email đăng nhập được giữ trên cùng tài khoản.")}</p>
        <form onSubmit={sendPhoneCode}>
          <label htmlFor="settings-phone">{t("Số điện thoại")}</label>
          <input id="settings-phone" type="tel" autoComplete="tel" placeholder="09xxxxxxxx" value={phone} onChange={event => { setPhone(event.target.value); setPending(null); }} disabled={busy} required />
          <button className="button-outline" disabled={busy || coolingDown} type="submit">{coolingDown ? `${language === 'en' ? 'Resend in' : 'Gửi lại sau'} ${cooldown}s` : t("Gửi mã xác minh")}</button>
        </form>
        {actorPending && <form onSubmit={verifyPhoneCode}>
          <label htmlFor="settings-otp">{t("Mã SMS gồm 6 chữ số")}</label>
          <input id="settings-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={event => setOtp(event.target.value)} disabled={busy} required />
          <button className="button-primary" disabled={busy} type="submit">{t("Xác minh số điện thoại")}</button>
        </form>}
      </section>
    </div>}
    {notice && <p className={`alert ${notice.success ? 'alert-success' : 'alert-error'}`} role={notice.success ? 'status' : 'alert'}>{notice.message}</p>}
    {import.meta.env.DEV && <div className="settings-preview"><Link to="/demo/cart">{t("Xem giỏ hàng, đơn hàng và hồ sơ")}</Link></div>}
  </div>;
}
