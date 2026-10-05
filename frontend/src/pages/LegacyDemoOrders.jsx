import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './Orders.css';

import { demoOrders } from '../data/commerce-demo';

export default function Orders({ demo = false }) {
  const [activeTab, setActiveTab] = useState('all'); // all, pending, shipping, delivered
  const [loading] = useState(false);
  const [orders, setOrders] = useState(() => demo ? demoOrders : []);

  const filteredOrders = activeTab === 'all'
    ? orders
    : orders.filter(order => order.status === activeTab);

  const handleCancelOrder = (orderId) => {
    // In real app, call API to cancel order
    if (window.confirm('Bạn có chắc chắn muốn hủy đơn hàng này?')) {
      setOrders(prev => prev.filter(order => order.id !== orderId));
    }
  };

  const handleReturnOrder = () => {
    // In real app, call API to initiate return
    alert('Yêu cầu trả hàng đã được gửi. Chúng tôi sẽ liên hệ với bạn trong thời gian sớm nhất.');
  };

  if (loading) {
    return (
      <div className="container">
        <h1>Đơn hàng của tôi</h1>
        <div className="orders-list skeleton" style={{ height: 400 }}></div>
      </div>
    );
  }

  return (
    <div className="container account-page orders-page">
      <Link to="/" className="page-back-link"><span aria-hidden="true">←</span> Về trang chủ</Link>

      <h1>Đơn hàng của tôi</h1>
      <p className="account-page-description">Theo dõi đơn hàng và xem trạng thái giao hàng.</p>
      <div className="orders-tabs">
        <button
          className={activeTab === 'all' ? 'tab-active' : 'tab-inactive'}
          onClick={() => setActiveTab('all')}
        >
          Tất cả ({orders.length})
        </button>
        <button
          className={activeTab === 'pending' ? 'tab-active' : 'tab-inactive'}
          onClick={() => setActiveTab('pending')}
        >
          Chờ xác nhận ({orders.filter(o => o.status === 'pending').length})
        </button>
        <button
          className={activeTab === 'shipping' ? 'tab-active' : 'tab-inactive'}
          onClick={() => setActiveTab('shipping')}
        >
          Đang vận chuyển ({orders.filter(o => o.status === 'shipping').length})
        </button>
        <button
          className={activeTab === 'delivered' ? 'tab-active' : 'tab-inactive'}
          onClick={() => setActiveTab('delivered')}
        >
          Đã giao hàng ({orders.filter(o => o.status === 'delivered').length})
        </button>
      </div>

      {filteredOrders.length === 0 ? (
        <p>Không có đơn hàng nào trong trạng thái này.</p>
      ) : (
        <div className="orders-list">
          {filteredOrders.map(order => (
            <div key={order.id} className="order-card">
              <div className="order-header">
                <div className="order-info">
                  <h3>Đơn hàng #{order.id}</h3>
                  <p className="order-date">{new Date(order.date).toLocaleDateString('vi-VN')}</p>
                </div>
                <div className="order-status">
                  <span className={`status-badge status-${order.status}`}>
                    {order.statusLabel}
                  </span>
                </div>
              </div>
              <div className="order-shop">
                <h4>Cửa hàng: {order.shop}</h4>
              </div>
              <div className="order-items">
                {order.items.map(item => (
                  <div key={item.id} className="order-item">
                    <img src={item.image} alt={item.name} className="order-item-thumb" />
                    <div className="order-item-details">
                      <p className="order-item-name">{item.name}</p>
                      <p className="order-item-quantity">Số lượng: {item.quantity}</p>
                      <p className="order-item-price">
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="order-total">
                <span>Tổng cộng:</span>
                <span className="order-total-amount">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(order.total)}
                </span>
              </div>
              <div className="order-actions">
                {order.status === 'pending' && (
                  <button
                    className="button-outline"
                    disabled={demo}
                    onClick={() => handleCancelOrder(order.id)}
                  >
                    Hủy đơn
                  </button>
                )}
                {order.status === 'delivered' && (
                  <button
                    className="button-outline"
                    disabled={demo}
                    onClick={() => handleReturnOrder()}
                  >
                    Trả hàng
                  </button>
                )}
                <button className="button-secondary" disabled title="Chi tiết đơn hàng chưa được hỗ trợ">Xem chi tiết</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
