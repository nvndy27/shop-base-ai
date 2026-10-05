import React from 'react';
import { Link } from 'react-router-dom';
import './ProductCard.css';
import { useLanguage } from '../../locale/useLanguage';
import { formatProductPrice } from '../../catalog/api';

export default function ProductCard({ product, returnTo }) {
  useLanguage();
  return (
    <Link to={`/product/${product.id}`} state={returnTo ? {returnTo} : undefined} className="product-card">
      <div className="product-image">
        <img src={product.image} alt={product.name} loading="lazy" />
      </div>
      <div className="product-info">
        <h3 className="product-name">{product.name}</h3>
        {product.caption && (
          <div className="product-caption">
            {product.caption}
          </div>
        )}
        <div className="product-price">{formatProductPrice(product)}</div>
        <div className="product-shop">{product.shop}</div>
        {product.rating > 0 && (
          <div className="product-rating">
            {/* Simple star rating - for now just show number */}
            ⭐ {product.rating}
          </div>
        )}
      </div>
    </Link>
  );
}
