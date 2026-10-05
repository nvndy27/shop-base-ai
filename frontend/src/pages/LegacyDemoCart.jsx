import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Cart.css';

import { demoCartItems } from '../data/commerce-demo';

export default function Cart({ demo = false }) {
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState(() => demo ? demoCartItems : []);
  const [loading] = useState(false);

  const handleQuantityChange = (itemId, newQuantity) => {
    if (newQuantity < 1) return;
    setCartItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  const handleRemoveItem = (itemId) => {
    setCartItems(prev => prev.filter(item => item.id !== itemId));
  };

  const handleCheckout = () => {
    // Check if any item is out of stock or quantity exceeds stock
    const outOfStock = cartItems.some(item => item.quantity > item.stock);
    if (outOfStock) {
      alert('Một số sản phẩm không đủ hàng trong giỏ');
      return;
    }
    // In real app, proceed to checkout
    navigate('/checkout');
  };

  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (loading) {
    return (
      <div className="container account-page cart-page">
        <h1>Giỏ hàng</h1>
        <div className="cart-item skeleton" style={{ height: 100, marginBottom: 16 }}></div>
        <div className="cart-item skeleton" style={{ height: 100, marginBottom: 16 }}></div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="container account-page cart-page">
        <h1>Giỏ hàng</h1>
        <p>Giỏ hàng của bạn đang trống.</p>
        <Link to="/" className="button-secondary">Tiếp tục mua sắm</Link>
      </div>
    );
  }

  return (
    <div className="container account-page cart-page">
      <Link to="/" className="page-back-link"><span aria-hidden="true">←</span> Về trang chủ</Link>
      <h1>Giỏ hàng</h1>
      <p className="account-page-description">{cartItems.length} sản phẩm · Kiểm tra số lượng trước khi thanh toán.</p>
      <div className="cart-layout">
      <div className="cart-items">
        {cartItems.map(item => (
          <div key={item.id} className="cart-item">
            <div className="cart-item-info">
              <div className="cart-item-checkbox">
                <input type="checkbox" aria-label={`Chọn ${item.name}`} checked={true} disabled />
              </div>
              <div className="cart-item-details">
                <img src={item.image} alt={item.name} className="cart-item-thumb" />
                <div className="cart-item-description">
                  <h3 className="cart-item-name">{item.name}</h3>
                  <p className="cart-item-variant">
                    Màu: {item.variant.color}, Kích thước: {item.variant.size}
                  </p>
                  <p className="cart-item-shop">Cửa hàng: {item.shop}</p>
                  {item.stock === 0 && (
                    <p className="cart-item-out-of-stock">Hết hàng</p>
                  )}
                </div>
              </div>
            </div>
            <div className="cart-item-actions">
              <div className="cart-item-quantity">
                <label>Số lượng:</label>
                <div className="quantity-selector">
                  <button
                    onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                  >
                    <span aria-label="Giảm số lượng">−</span>
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                    disabled={item.quantity >= item.stock && item.stock > 0}
                  >
                    <span aria-label="Tăng số lượng">+</span>
                  </button>
                </div>
              </div>
              <div className="cart-item-price">
                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price * item.quantity)}
              </div>
              <div className="cart-item-remove">
                <button onClick={() => handleRemoveItem(item.id)} className="button-link">Xóa</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="cart-summary">
        <h2>Tóm tắt giỏ hàng</h2>
        <div className="cart-total">
          <span>Tổng tiền:</span>
          <span className="cart-total-amount">
            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(total)}
          </span>
        </div>
        <div className="cart-actions">
          <Link to="/" className="button-outline">Tiếp tục mua sắm</Link>
          <button
            className="button-primary"
            onClick={handleCheckout}
            disabled={demo || cartItems.some(item => item.quantity > item.stock)}
          >
            Thanh toán ({cartItems.reduce((count, item) => count + item.quantity, 0)} sản phẩm)
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
