import React, { useState, useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ui/ProductCard';
import { catalogRequest, displayProduct } from '../catalog/api';
import SearchBox from '../components/ui/SearchBox';
import CatalogSelect from '../components/ui/CatalogSelect';
import { useLanguage, useText } from '../locale/useLanguage';
import './Home.css';

export default function Home() {
  const t = useText();
  const [language] = useLanguage();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const appliedQuery = params.get('q') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'relevance';
  const page = Math.max(1, Math.min(80, Number(params.get('page')) || 1));
  const after = params.get('after') || '';
  const history = location.state?.catalogHistory || [];
  const catalogBack = location.state?.catalogBack || [];
  const previousScreen = catalogBack.at(-1);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const usingSearch = Boolean(appliedQuery.trim() || sort !== 'relevance');
  useEffect(() => {
    const controller = new AbortController();
    catalogRequest('catalog/categories', {}, controller.signal).then(data => setCategories(data.items)).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [retry, language]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setResult(null);
    catalogRequest(usingSearch ? 'search' : 'products', {q: appliedQuery, category, sort, limit: 24,
      ...(usingSearch ? {page} : {after})}, controller.signal)
      .then(data => {setProducts(data.items.map(displayProduct)); setResult(data);})
      .catch(e => {if(e.name !== 'AbortError') {setProducts([]); setError(e.message);}})
      .finally(() => {if(!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [appliedQuery, category, sort, page, after, retry, usingSearch, language]);
  useEffect(() => {
    if (location.hash === '#products') document.getElementById('products')?.scrollIntoView();
  }, [location.hash]);
  const navigateCatalog = (changes, catalogHistory = []) => {
    const values = {q: appliedQuery, category, sort, page: 1, after: '', ...changes};
    const nextParams = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value && !(key === 'sort' && value === 'relevance') && !(key === 'page' && value === 1)) nextParams.set(key, String(value));
    }
    const backScreens = nextParams.toString() === params.toString() ? catalogBack
      : [...catalogBack, {search: location.search, catalogHistory: history}].slice(-20);
    setParams(nextParams, {state: {catalogHistory, catalogBack: backScreens}});
  };
  const next = () => navigateCatalog({page: page + 1, after: result.next_after || ''}, [...history, {page, after}]);
  const previous = () => navigateCatalog(history.at(-1), history.slice(0,-1));
  const returnTo = {pathname: '/', search: location.search, state: location.state};
  return <div className="container home-page">
    {location.search && <nav className="catalog-back-navigation" aria-label={t("Quay lại danh sách trước")}>
      <Link to={{pathname: '/', search: previousScreen?.search || ''}} replace
        state={{catalogHistory: previousScreen?.catalogHistory || [], catalogBack: catalogBack.slice(0,-1)}}
        className="page-back-link"><span aria-hidden="true">←</span> {t("Quay lại")}</Link>
    </nav>}
    <header className="page-header"><h1>{t("Trang chủ")}</h1><div className="home-toolbar">
      <SearchBox key={location.key} initialQuery={appliedQuery} category={category} onSearch={value => navigateCatalog({q: value.trim()})} />
    </div></header>
    <div className="commerce-tabs"><Link className="button-outline" to="/marketplace">{t("Sản phẩm từ các shop")}</Link></div>
    <div className="catalog-filters">
      <CatalogSelect id="catalog-category" label={t("Danh mục")} value={category}
        options={[{value: '', label: t("Tất cả danh mục")}, ...categories.map(item => ({value: item.id, label: language === 'en' ? item.id.replaceAll('_', ' ') : item.name}))]}
        onChange={value => navigateCatalog({category: value})} />
      <CatalogSelect id="catalog-sort" label={t("Sắp xếp")} value={sort}
        options={[{value: 'relevance', label: t("Phù hợp")}, {value: 'price_asc', label: t("Giá tăng dần")}, {value: 'price_desc', label: t("Giá giảm dần")}, {value: 'rating', label: t("Đánh giá cao")}]}
        onChange={value => navigateCatalog({sort: value})} />
      <span className="catalog-result-count" role="status">{loading ? t("Đang tải...") : result ? `${result.total.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')} ${language === 'en' ? 'products' : 'sản phẩm'}` : ''}</span>
    </div>
    {error && <div className="alert alert-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>{t("Thử lại")}</button></div>}
    <div id="products" className="product-grid grid grid-4-cols" aria-label={t("Sản phẩm")} aria-busy={loading}>
      {!loading && products.map(product => <ProductCard key={product.id} product={product} returnTo={returnTo} />)}
    </div>
    {!loading && !error && products.length === 0 && <p className="catalog-empty">{t("Không tìm thấy sản phẩm phù hợp.")}</p>}
    {result && <nav className="catalog-pagination" aria-label={t("Phân trang sản phẩm")}>
      <button type="button" className="button-secondary" disabled={!history.length || loading} onClick={previous}>{t("Trang trước")}</button>
      <span>{language === 'en' ? 'Page' : 'Trang'} {page}</span>
      <button type="button" className="button-secondary" disabled={!result.has_more || loading} onClick={next}>{t("Trang sau")}</button>
    </nav>}
  </div>;
}
