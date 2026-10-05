import data from './commerce-demo.json';

const displayShop = shop => shop.replaceAll(' · Demo', '');
export const demoProducts = data.products.map(product => ({ ...product, shop: displayShop(product.shop), description: product.description.replace('sản phẩm mẫu thuộc', 'thuộc') }));
export const demoCartItems = data.carts[2].items.map(item => ({ ...item, shop: displayShop(item.shop) }));
export const demoOrders = data.orders.map(order => ({ ...order, shop: displayShop(order.shop) }));
export const demoCategories = data.categories;
const fold = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
export function filterDemoProducts(query, category = '') {
  const needle = fold(query.trim());
  return demoProducts.filter(product => (!category || product.category === category)
    && fold(`${product.name} ${product.categoryLabel} ${product.shop}`).includes(needle));
}

export function getSearchSuggestions(query, category = '') {
  const needle = fold(query.trim());
  if (!needle) return [];
  const categories = demoCategories
    .filter(item => (!category || category === item.id) && fold(item.name).includes(needle))
    .map(item => ({ id: `category-${item.id}`, label: item.name, kind: 'Danh mục' }));
  const products = demoProducts
    .filter(item => (!category || category === item.category) && fold(item.name).includes(needle))
    .map(item => ({ id: `product-${item.id}`, label: item.name, kind: 'Sản phẩm' }));
  return [...categories, ...products].sort((a, b) => Number(fold(b.label).startsWith(needle)) - Number(fold(a.label).startsWith(needle))).slice(0, 6);
}
