import React from 'react';
import { Outlet } from 'react-router-dom';
import './Profile.css';
import './AccountDemo.css';

export function AccountDemo() {
  return (
    <>
      <Outlet />
    </>
  );
}

export function DemoProfile() {
  return (
    <div className="container account-page profile-page">
      <h1>Hồ sơ</h1>
      <p className="account-page-description">Thông tin cá nhân, địa chỉ và bảo mật tài khoản của bạn.</p>
      <div className="profile-grid">
        <section className="profile-section">
          <h2>Thông tin cá nhân</h2>
          <div className="profile-info-item"><label>Họ và tên</label><p>Người dùng thử</p></div>
          <div className="profile-info-item"><label>Email</label><p>demo@shopbase.invalid</p></div>
          <div className="profile-info-item"><label>Số điện thoại</label><p>Chưa có</p></div>
        </section>
        <section className="profile-section">
          <h2>Địa chỉ</h2>
          <div className="address-list">
            <div className="address-item">
              <div className="address-header"><strong>Địa chỉ giao hàng</strong><span className="address-default">Mặc định</span></div>
              <p className="address-street">Chưa có địa chỉ giao hàng.</p>
              <div className="address-actions"><button disabled>Xóa</button></div>
            </div>
          </div>
        </section>
        <section className="profile-section">
          <h2>Bảo mật & phiên</h2>
          <div className="sessions-list"><p>Chưa có phiên đăng nhập.</p></div>
          <button className="button-outline" disabled>Đăng xuất</button>
        </section>
        <section className="profile-section">
          <h2>Liên kết tài khoản</h2>
          <div className="linked-accounts">
            <div className="linked-account-item"><div className="account-info"><strong>Tài khoản</strong><span>Chưa liên kết dịch vụ</span></div></div>
          </div>
        </section>
      </div>
    </div>
  );
}
