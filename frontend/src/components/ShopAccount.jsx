import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { client } from '../auth/client';
import { createApi } from '../auth/api';
import { authMessage } from '../auth/service';
import NavIcon from './ui/NavIcon';
import './ShopAccount.css';

const api = createApi(client);
const statuses = { pending: 'Chờ duyệt', active: 'Đã duyệt', rejected: 'Bị từ chối', suspended: 'Tạm ngưng', closed: 'Đã đóng' };

export default function ShopAccount() {
  const location = useLocation();
  const [shops, setShops] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [revision, setRevision] = useState(0);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    api('/api/v1/me/shops', { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) { setShops(result.items); setLoadError(null); }
    }).catch(failure => {
      if (!controller.signal.aborted) setLoadError(authMessage(failure));
    });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (location.hash === '#shop') document.getElementById('shop')?.scrollIntoView();
  }, [location.hash]);

  async function apply(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const created = await api('/api/v1/shop-applications', { method: 'POST', body: { name: name.trim(), slug: slug.trim() } });
      setShops(previous => [...(previous || []), created]);
      setNotice({ success: true, text: 'Đã gửi đăng ký shop. Hồ sơ đang chờ duyệt trước khi bạn có thể bán hàng.' });
      setName('');
      setSlug('');
      setRevision(value => value + 1);
    } catch (failure) { setNotice({ success: false, text: authMessage(failure) }); }
    finally { setSaving(false); }
  }

  return <section id="shop" className="profile-section shop-account">
    <h2><NavIcon name="shop" /> Shop của bạn</h2>
    <p>Người bán vẫn có thể mua sắm. Đăng ký shop tại đây để bắt đầu bán hàng sau khi được duyệt.</p>
    {loadError ? <div className="shop-load-error"><p role="alert">{loadError}</p><button type="button" className="button-outline" onClick={() => setRevision(value => value + 1)}>Tải lại shop</button></div>
      : shops === null ? <p role="status">Đang tải shop...</p>
      : shops.length > 0 ? <ul className="shop-account-list">{shops.map(shop => <li key={shop.id}><div><strong>{shop.name}</strong><span>{shop.slug}</span></div><span className={`badge ${shop.status === 'active' ? 'badge-success' : ''}`}>{statuses[shop.status] || 'Chưa xác định'}</span></li>)}</ul>
      : <p className="shop-empty">Bạn chưa đăng ký shop.</p>}
    {notice && <p className={`alert ${notice.success ? 'alert-success' : 'alert-error'}`} role={notice.success ? 'status' : 'alert'}>{notice.text}</p>}
    <details open={location.hash === '#shop' || shops?.length === 0}>
      <summary>Đăng ký shop mới</summary>
      <form onSubmit={apply}>
        <div><label htmlFor="shop-name">Tên shop</label><input id="shop-name" value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={saving} placeholder="Tên cửa hàng của bạn" /></div>
        <div><label htmlFor="shop-slug">Tên đường dẫn</label><input id="shop-slug" value={slug} onChange={event => setSlug(event.target.value)} minLength={3} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" required disabled={saving} placeholder="vi-du-shop" aria-describedby="shop-slug-hint" /><p id="shop-slug-hint">3–60 ký tự: chữ thường không dấu, số và dấu gạch nối.</p></div>
        <button className="button-primary" disabled={saving} type="submit">{saving ? 'Đang gửi...' : 'Gửi đăng ký shop'}</button>
      </form>
    </details>
  </section>;
}
