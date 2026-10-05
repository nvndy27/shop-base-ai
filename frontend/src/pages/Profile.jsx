import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { client } from '../auth/client';
import { createApi } from '../auth/api';
import { authMessage } from '../auth/service';
import ShopAccount from '../components/ShopAccount';
import './Profile.css';

const api = createApi(client);
const mapAddress = address => ({
  id: address.id,
  label: address.recipient_name,
  street: [address.address_line, address.ward, address.district, address.province].filter(Boolean).join(', '),
  isDefault: address.is_default,
});

export default function Profile() {
  const navigate = useNavigate();
  const { user, authService } = useAuth();
  const [loaded, setLoaded] = useState(null);
  const [mutationError, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState(null);
  const loadKey = `${user.id}:${revision}`;
  const loading = loaded?.key !== loadKey;
  const profile = !loading ? loaded.profile : null;
  const error = mutationError?.actorId === user.id ? mutationError : (!loading ? loaded.error : null);

  function setProfile(update) {
    // Late responses from a previous account must never replace the current account's data.
    setLoaded(previous => previous?.key === loadKey && previous.profile
      ? { ...previous, profile: update(previous.profile) } : previous);
  }

  function reportError(failure) {
    setError({ actorId: user.id, message: authMessage(failure) });
  }

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api('/api/v1/me', { signal: controller.signal }),
      api('/api/v1/me/addresses', { signal: controller.signal }),
    ]).then(([me, addresses]) => {
      if (controller.signal.aborted) return;
      if (me.user_id !== user.id) throw new Error('Identity mismatch');
      setLoaded({
        key: loadKey, error: null,
        profile: {
          userId: me.user_id,
          displayName: me.display_name || 'Chưa đặt tên',
          addresses: addresses.items.map(mapAddress),
        },
      });
    }).catch(failure => {
      if (!controller.signal.aborted) {
        setLoaded({ key: loadKey, profile: null, error: { message: authMessage(failure) } });
      }
    });
    return () => controller.abort();
  }, [user.id, loadKey]);

  const handleLogout = async (scope = 'local') => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await authService.logout(scope);
      navigate('/auth', { replace: true });
    } catch (failure) {
      reportError(failure);
    } finally {
      setSaving(false);
    }
  };

  const handleMakeDefault = async (addressId) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await api('/api/v1/me/addresses', { method: 'PATCH', body: { id: addressId, is_default: true } });
      const addresses = await api('/api/v1/me/addresses');
      setProfile(prev => ({ ...prev, addresses: addresses.items.map(mapAddress) }));
    } catch (failure) {
      reportError(failure);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAddress = (addressId) => {
    setAddressToDelete(addressId);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDeleteAddress = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await api('/api/v1/me/addresses', { method: 'DELETE', body: { id: addressToDelete } });
      setProfile(prev => ({ ...prev, addresses: prev.addresses.filter(addr => addr.id !== addressToDelete) }));
      setShowDeleteConfirm(false);
    } catch (failure) {
      reportError(failure);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelDeleteAddress = () => {
    setShowDeleteConfirm(false);
  };

  if (loading || (profile && profile.userId !== user.id)) {
    return (
      <div className="container account-page profile-page">
        <h1>Hồ sơ</h1>
        <div className="profile-section skeleton" style={{ height: 200 }}></div>
        <div className="profile-section skeleton" style={{ height: 200 }}></div>
        <div className="profile-section skeleton" style={{ height: 200 }}></div>
      </div>
    );
  }

  if (!profile) {
    return <div className="container account-page profile-page"><h1>Hồ sơ</h1>
      <div className="alert alert-error" role="alert"><p>{error?.message || 'Không tải được hồ sơ.'}</p></div>
      <button className="button-outline" onClick={() => setRevision(value => value + 1)}>Thử lại</button>
      <button className="button-outline" disabled={saving} onClick={() => handleLogout()}>Đăng xuất</button>
    </div>;
  }

  const isVerified = Boolean(user.email_confirmed_at || user.phone_confirmed_at);
  const providers = [...new Set((user.identities || []).map(identity => identity.provider))];

  return (
    <div className="container account-page profile-page">
      <Link to="/" className="page-back-link"><span aria-hidden="true">←</span> Về trang chủ</Link>

      <h1>Hồ sơ</h1>
      <p className="account-page-description">Thông tin cá nhân, địa chỉ và bảo mật tài khoản của bạn.</p>
      <Link className="page-back-link" to="/settings">Cài đặt tài khoản / Thêm số điện thoại</Link>
      <div className="commerce-actions"><Link className="button-outline" to="/seller">Quản lý shop</Link><Link className="button-outline" to="/addresses">Quản lý địa chỉ</Link></div>
      {error && (
        <div className="alert alert-error" role="alert">
          <p>{error.message}</p>
        </div>
      )}

      <div className="profile-grid">
        <ShopAccount key={user.id} />
        <div className="profile-section">
          <h2>Thông tin cá nhân</h2>
          <div className="profile-info-item">
            <label>Họ và tên</label>
            <p>{profile.displayName}</p>
          </div>
          <div className="profile-info-item">
            <label>Số điện thoại</label>
            <p>{user.phone || 'Chưa có'}</p>
          </div>
          <div className="profile-info-item">
            <label>Email</label>
            <p>{user.email || 'Chưa có'}</p>
          </div>
          <div className="profile-info-item">
            <label>Email/SĐT đã xác minh</label>
            <span className={`badge ${isVerified ? 'badge-success' : ''}`}>
              {isVerified ? 'Có' : 'Chưa'}
            </span>
          </div>
          <p>Xác minh email/SĐT không phải xác minh giấy tờ danh tính.</p>
        </div>

        <div className="profile-section">
          <h2>Địa chỉ</h2>
          {profile.addresses.length === 0 ? (
            <p>Bạn chưa có địa chỉ nào.</p>
          ) : (
            <div className="address-list">
              {profile.addresses.map(address => (
                <div key={address.id} className="address-item">
                  <div className="address-header">
                    <span className={address.isDefault ? 'address-default' : ''}>
                      {address.isDefault ? 'Mặc định' : ''}
                    </span>
                    <strong>{address.label}</strong>
                  </div>
                  <p className="address-street">{address.street}</p>
                  <div className="address-actions">
                    {!address.isDefault && (
                      <button
                        className="button-link"
                        disabled={saving}
                        onClick={() => handleMakeDefault(address.id)}
                      >
                        Đặt làm mặc định
                      </button>
                    )}
                    <button
                      className="button-link"
                      disabled={saving}
                      onClick={() => handleDeleteAddress(address.id)}
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link className="button-link" to="/addresses">Thêm hoặc sửa địa chỉ</Link>
        </div>

        <div className="profile-section">
          <h2>Bảo mật & phiên</h2>
          <div className="profile-info-item">
            <label>Đăng xuất tất cả các thiết bị</label>
            <button
              className="button-outline"
              disabled={saving}
              onClick={() => {
                if (window.confirm('Bạn có chắc chắn muốn đăng xuất khỏi tất cả các thiết bị?')){
                  handleLogout('global');
                }
              }}
            >
              Đăng xuất tất cả
            </button>
          </div>
          <div className="sessions-list">
            <p>Đăng nhập được ghi nhớ trên trình duyệt này. Chưa hỗ trợ liệt kê từng thiết bị.</p>
            <p>Đăng xuất thu hồi refresh token; access token đã cấp có thể còn hiệu lực đến khi hết hạn.</p>
          </div>
          <button
            className="button-outline"
            disabled={saving}
            onClick={() => handleLogout()}
          >
            Đăng xuất
          </button>
        </div>

        <div className="profile-section">
          <h2>Liên kết tài khoản</h2>
          <div className="linked-accounts">
            {providers.map(provider => (
              <div key={provider} className="linked-account-item">
                <div className="account-info">
                  <strong>{provider}</strong>
                  <span className="account-connected">
                    Đã liên kết
                  </span>
                </div>
              </div>
            ))}
            <p>Liên kết thêm provider chưa được hỗ trợ.</p>
          </div>
        </div>
      </div>

      {/* Delete address confirmation modal */}
      {showDeleteConfirm && (
        <div className="modal-backdrop" onClick={handleCancelDeleteAddress}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Xác nhận xóa địa chỉ</h3>
            <p>Bạn có chắc chắn muốn xóa địa chỉ này?</p>
            <div className="modal-actions">
              <button className="button-outline" onClick={handleCancelDeleteAddress}>
                Hủy
              </button>
              <button className="button-primary" disabled={saving} onClick={handleConfirmDeleteAddress}>
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
