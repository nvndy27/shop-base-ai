import CatalogPresentation from '../locale/CatalogPresentation';
import { useText } from '../locale/useLanguage';
import React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import NavIcon from './ui/NavIcon';
import './layout.css';

export default function Layout() {
  const t = useText();
  const location = useLocation();
  return (
    <>
      <header className="header">
        <div className="container">
          <div className="header-content">
            <h1 className="logo" aria-label="ShopBase"><span className="logo-full">ShopBase</span><span className="logo-short" aria-hidden="true">SB</span></h1>
            <nav className="header-nav" aria-label={t("Điều hướng chính")}>
              <Link to="/" aria-label={t("Trang chủ")} title={t("Trang chủ")} className={location.pathname === '/' && !location.hash ? 'active' : ''} aria-current={location.pathname === '/' && !location.hash ? 'page' : undefined}><NavIcon name="home" /><span>{t("Trang chủ")}</span></Link>
              <NavLink to="/cart" aria-label={t("Giỏ hàng")} title={t("Giỏ hàng")}><NavIcon name="cart" /><span>{t("Giỏ hàng")}</span></NavLink>
              <NavLink to="/orders" aria-label={t("Đơn hàng")} title={t("Đơn hàng")}><NavIcon name="orders" /><span>{t("Đơn hàng")}</span></NavLink>
              <NavLink to="/profile" aria-label={t("Tài khoản")} title={t("Tài khoản")}><NavIcon name="user" /><span>{t("Tài khoản")}</span></NavLink>
              <NavLink to="/settings" aria-label={t("Cài đặt")} title={t("Cài đặt")}><NavIcon name="settings" /><span>{t("Cài đặt")}</span></NavLink>
            </nav>
          </div>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container">
          <p>&copy; {new Date().getFullYear()} ShopBase. All rights reserved.</p>
          <CatalogPresentation />
        </div>
      </footer>
    </>
  );
}
