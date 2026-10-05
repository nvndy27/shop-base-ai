import { languageStore } from '../locale/store';
export async function catalogRequest(path, params = {}, signal) {
  if (/^(products|search|catalog)(\/|$)/.test(path)) params = {...params, language: languageStore?.getSnapshot() || 'vi'};
  const query = new URLSearchParams(Object.entries(params).filter(([,value]) => value !== '' && value != null));
  let response;
  let result;
  try {
    response = await fetch(`/api/v1/${path}${query.size ? `?${query}` : ''}`, { credentials: 'omit', signal });
    result = await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Không kết nối được dịch vụ sản phẩm. Vui lòng thử lại.');
  }
  if (!response.ok) throw new Error(result.error?.message || 'Không tải được sản phẩm. Vui lòng thử lại.');
  return result;
}
export function displayProduct(product) {
  return { id: product.id, name: product.display_title || product.title, image: product.image_urls[0], gallery: product.image_urls,
    originalName: product.title, titleTranslated: product.title_translated, exchange: product.exchange,
    price: product.display_price ?? product.price_usd, currency: product.display_currency || product.currency, shop: product.store_name,
    rating: product.average_rating, description: product.description, features: product.features,
    category: product.category, categoryLabel: product.category_name_vi, variants: [], reviews: [] };
}
export function formatProductPrice(product) {
  return product.price == null ? (languageStore?.getSnapshot() === 'en' ? 'Price unavailable' : 'Chưa có giá') : new Intl.NumberFormat(languageStore?.getSnapshot() === 'en' ? 'en-US' : 'vi-VN', { style: 'currency', currency: product.currency || 'VND' }).format(product.price);
}
