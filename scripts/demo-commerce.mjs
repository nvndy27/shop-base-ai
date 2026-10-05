import assert from 'node:assert/strict';

const labels = {
  beauty: 'Mỹ phẩm', fragrances: 'Nước hoa', furniture: 'Nội thất', groceries: 'Thực phẩm',
  'home-decoration': 'Trang trí nhà', 'kitchen-accessories': 'Đồ dùng nhà bếp', laptops: 'Laptop',
  'mens-shirts': 'Áo nam', 'mens-shoes': 'Giày nam', 'mens-watches': 'Đồng hồ nam',
  'mobile-accessories': 'Phụ kiện điện thoại', motorcycle: 'Xe máy', 'skin-care': 'Chăm sóc da',
  smartphones: 'Điện thoại', 'sports-accessories': 'Đồ thể thao', sunglasses: 'Kính mắt',
  tablets: 'Máy tính bảng', tops: 'Áo', vehicle: 'Ô tô', 'womens-bags': 'Túi nữ',
  'womens-dresses': 'Váy nữ', 'womens-jewellery': 'Trang sức nữ', 'womens-shoes': 'Giày nữ', 'womens-watches': 'Đồng hồ nữ',
};
const featured = ['beauty', 'fragrances', 'furniture', 'laptops', 'mens-shirts', 'smartphones', 'womens-bags', 'womens-shoes'];
const shops = ['Shop Làm đẹp · Demo', 'Shop Công nghệ · Demo', 'Shop Đời sống · Demo'];
const text = (value, limit = 180) => {
  assert.equal(typeof value, 'string');
  assert(value.trim().length > 0 && value.length <= limit);
  return value.trim();
};
const integer = (value, min = 0) => { assert(Number.isSafeInteger(value) && value >= min); return value; };
const image = value => {
  const url = new URL(value);
  assert(url.protocol === 'https:' && url.hostname === 'cdn.dummyjson.com' && !url.username && !url.password);
  return url.href;
};

export function normalizeDemo(productSource, cartSource) {
  assert(Array.isArray(productSource.products) && Array.isArray(cartSource.carts));
  const source = new Map();
  for (const item of productSource.products) {
    integer(item.id, 1);
    assert(!source.has(item.id));
    source.set(item.id, item);
  }
  const selected = new Set();
  for (const category of featured) {
    productSource.products.filter(item => item.category === category).slice(0, 3).forEach(item => selected.add(item.id));
  }
  for (const cart of cartSource.carts.slice(0, 3)) {
    assert(Array.isArray(cart.products));
    cart.products.forEach(item => { assert(source.has(item.id)); integer(item.quantity, 1); selected.add(item.id); });
  }
  const products = [...selected].map(id => {
    const item = source.get(id);
    const category = text(item.category, 60);
    assert(Object.hasOwn(labels, category));
    assert(Number.isFinite(item.price) && item.price > 0);
    const price = integer(Math.round(item.price * 25000), 1); // Fixed demo scale, NOT a current FX rate.
    assert(Number.isFinite(item.rating) && item.rating >= 0 && item.rating <= 5);
    const stock = integer(item.stock);
    const gallery = [...new Set(item.images.map(image))];
    assert(gallery.length > 0);
    const shopIndex = ['beauty', 'fragrances', 'skin-care'].includes(category) ? 0
      : ['laptops', 'smartphones', 'tablets', 'mobile-accessories'].includes(category) ? 1 : 2;
    return {
      id, sourceId: id, name: text(item.title), category, categoryLabel: labels[category],
      image: image(item.thumbnail), gallery, price, sourcePrice: item.price, currency: 'VND',
      shopId: `demo-shop-${shopIndex + 1}`, shop: shops[shopIndex], stock, rating: item.rating,
      caption: labels[category], description: `${text(item.title)} — sản phẩm mẫu thuộc danh mục ${labels[category].toLowerCase()}.`,
      variants: [{ id: text(item.sku, 100), color: 'Tiêu chuẩn', size: 'Phiên bản gốc', stock }], reviews: [], demo: true,
    };
  });
  const byId = new Map(products.map(product => [product.id, product]));
  const statuses = [['delivered', 'Đã giao hàng'], ['shipping', 'Đang vận chuyển'], ['pending', 'Chờ xác nhận']];
  const carts = cartSource.carts.slice(0, 3).map(cart => ({
    id: integer(cart.id, 1), demo: true,
    items: cart.products.map(item => {
      const product = byId.get(item.id);
      return { id: product.id, productId: product.id, name: product.name, variant: product.variants[0], quantity: item.quantity, price: product.price, image: product.image, shopId: product.shopId, shop: product.shop, stock: product.stock };
    }),
  }));
  const orders = carts.map((cart, index) => {
    const groups = [...new Set(cart.items.map(item => item.shopId))].map(shopId => {
      const items = cart.items.filter(item => item.shopId === shopId);
      return { shopId, shop: items[0].shop, items, total: integer(items.reduce((sum, item) => sum + item.price * item.quantity, 0)) };
    });
    return { id: `DEMO-${cart.id}`, sourceCartId: cart.id, demo: true, status: statuses[index][0], statusLabel: statuses[index][1], date: `2026-09-${20 + index}`, items: cart.items, suborders: groups, shop: groups.map(group => group.shop).join(', '), total: integer(groups.reduce((sum, group) => sum + group.total, 0)), shippingFee: 0 };
  });
  return { products, carts, orders, categories: [...new Set(products.map(product => product.category))].map(id => ({ id, name: labels[id] })), shops: shops.map((name, index) => ({ id: `demo-shop-${index + 1}`, name, demo: true })) };
}
