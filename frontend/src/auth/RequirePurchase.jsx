import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './context';
import { client } from './client';
import { createApi } from './api';
import { authMessage } from './service';

const api = createApi(client);

export default function RequirePurchase({ children }) {
  const { user } = useAuth();
  const key = `${user.id}:${user.phone || ''}:${user.phone_confirmed_at || ''}`;
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api('/api/v1/me/purchase-eligibility', { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted) setResult({ key, revision, allowed: data.eligible === true });
      })
      .catch(error => {
        if (!controller.signal.aborted) setResult({ key, revision, allowed: false, error: authMessage(error) });
      });
    return () => controller.abort();
  }, [key, revision]);
  if (result?.key !== key || result?.revision !== revision) {
    return <div className="container account-page"><p role="status">Đang kiểm tra điều kiện mua hàng...</p></div>;
  }
  if (!result.allowed) {
    return <div className="container account-page">
      <h1>Chưa thể mua hàng</h1>
      <p className="account-page-description" role="alert">{result.error || 'Vui lòng kiểm tra trạng thái tài khoản trước khi mua hàng.'}</p>
      <div className="settings-actions">
        <Link className="button-primary" to="/profile">Xem tài khoản</Link>
        <button className="button-outline" onClick={() => setRevision(value => value + 1)}>Kiểm tra lại</button>
      </div>
    </div>;
  }
  return children;
}
