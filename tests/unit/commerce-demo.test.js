import { describe, expect, it } from 'vitest';
import data from '../../frontend/src/data/commerce-demo.json';
import { filterDemoProducts, getSearchSuggestions } from '../../frontend/src/data/commerce-demo.js';
import { normalizeDemo } from '../../scripts/demo-commerce.mjs';

describe('offline commerce dataset boundaries', () => {
  it('keeps cart/order references, VND totals and per-shop totals consistent', () => {
    const products = new Map(data.products.map(product => [product.id, product]));
    expect(products.size).toBe(data.products.length);
    for (const product of data.products) {
      expect(Number.isSafeInteger(product.price)).toBe(true);
      expect(product.price).toBeGreaterThan(0);
      expect(product.currency).toBe('VND');
      expect(product.variants[0].stock).toBe(product.stock);
    }
    for (const order of data.orders) {
      expect(order.demo).toBe(true);
      const cart = data.carts.find(item => item.id === order.sourceCartId);
      expect(order.items).toEqual(cart.items);
      expect(order.total).toBe(order.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
      expect(order.total).toBe(order.suborders.reduce((sum, shop) => sum + shop.total, 0));
      for (const shop of order.suborders) {
        for (const item of shop.items) {
          expect(item.shopId).toBe(shop.shopId);
          expect(item.price).toBe(products.get(item.productId).price);
          expect(item.image).toBe(products.get(item.productId).image);
        }
      }
    }
    expect(data.orders.some(order => order.suborders.length > 1)).toBe(true);
  });
  it('searches Vietnamese category names with and without accents and combines category filters', () => {
    expect(filterDemoProducts('my pham')).toEqual(filterDemoProducts('MỸ PHẨM'));
    expect(filterDemoProducts('my pham').length).toBeGreaterThan(0);
    expect(filterDemoProducts('my pham', 'smartphones')).toEqual([]);
    expect(filterDemoProducts('khong-co-san-pham-nay')).toEqual([]);
  });
  it('suggests existing category/product names without accents, capped and scoped to the selected category', () => {
    expect(getSearchSuggestions('nuoc')).toEqual(getSearchSuggestions('NƯỚC'));
    expect(getSearchSuggestions('nước').map(item => item.label)).toContain('Nước hoa');
    expect(getSearchSuggestions('nước').map(item => item.label)).not.toContain('Nước lọc');
    expect(getSearchSuggestions('nước', 'smartphones')).toEqual([]);
    expect(getSearchSuggestions('  ')).toEqual([]);
    expect(getSearchSuggestions('iphone', 'smartphones').length).toBeGreaterThan(0);
    expect(getSearchSuggestions('a').length).toBeLessThanOrEqual(6);
    expect(getSearchSuggestions('khong-co-san-pham-nay')).toEqual([]);
  });
  it('imports no reviewer/user contact data, credentials or payment records', () => {
    const privateKeys = new Set(['email', 'phone', 'reviewerEmail', 'userId', 'access_token', 'refresh_token', 'address', 'payment']);
    function visit(value) {
      if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) { expect(privateKeys.has(key)).toBe(false); visit(item); }
      }
    }
    visit(data);
  });
  it('rejects unknown references, unsafe image origins and negative prices before producing a fixture', () => {
    const product = { id: 1, title: 'Test', category: 'beauty', price: 10, stock: 5, rating: 4, sku: 'TEST-1', images: ['https://cdn.dummyjson.com/test.webp'], thumbnail: 'https://cdn.dummyjson.com/test.webp' };
    const source = { products: [product] };
    const carts = { carts: [{ id: 1, products: [{ id: 1, quantity: 1 }] }] };
    expect(() => normalizeDemo(source, { carts: [{ id: 1, products: [{ id: 2, quantity: 1 }] }] })).toThrow();
    expect(() => normalizeDemo({ products: [{ ...product, price: -1 }] }, carts)).toThrow();
    expect(() => normalizeDemo({ products: [{ ...product, images: ['http://localhost/private'] }] }, carts)).toThrow();
  });
});
