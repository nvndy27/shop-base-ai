import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { catalogRequest, displayProduct, formatProductPrice } from '../catalog/api';
import { commerceApi,shopProduct } from '../commerce/api';
import { useAuth } from '../auth/context';
import { useLanguage, useText } from '../locale/useLanguage';
import './ProductDetail.css';

export default function ProductDetail() {
  const t = useText();
  const [language] = useLanguage();
  const { id } = useParams();
  const location = useLocation();
  const saleable = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);
  const returnTo = ['/', '/marketplace'].includes(location.state?.returnTo?.pathname) ? location.state.returnTo : null;
  const backLink = <Link to={returnTo ? {pathname: returnTo.pathname, search: returnTo.search} : saleable ? '/marketplace' : '/'} state={returnTo?.state} className="page-back-link"><span aria-hidden="true">←</span> {returnTo?.search ? t("Quay lại kết quả") : t("Quay lại danh sách")}</Link>;
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setProduct(null);
    catalogRequest(`${saleable ? 'marketplace/' : ''}products/${encodeURIComponent(id)}`, {}, controller.signal)
      .then(data => setProduct(saleable ? shopProduct(data) : displayProduct(data)))
      .catch(e => {if (e.name !== 'AbortError') setError(e.message);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [id,saleable,language]);
  if (loading) return <div className="container">{backLink}<p role="status">{t("Đang tải sản phẩm...")}</p></div>;
  if (!product) return <div className="container">{backLink}<h1>{error || t("Sản phẩm không tồn tại")}</h1></div>;
  return <ProductDetailContent key={id} product={product} backLink={backLink} />;
}

function ProductDetailContent({ product, backLink }) {
  const t = useText();
  const [language] = useLanguage();
  const [selectedImage, setSelectedImage] = useState(product.image);
  const [variantId,setVariantId] = useState(product.variants[0]?.id||'');
  const [quantity,setQuantity] = useState(1),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[actionError,setActionError]=useState('');
  const {user}=useAuth(),navigate=useNavigate(),location=useLocation();
  const variant=product.variants.find(v=>v.id===variantId);
  async function add(buy=false){if(!user){navigate('/auth',{state:{from:location.pathname}});return;}setBusy(true);setMessage('');setActionError('');try{
    await commerceApi(`/api/v1/cart/items/${variant.id}`,{method:'PUT',body:{quantity}});
    if(buy)navigate('/checkout');else setMessage(t("Đã cập nhật sản phẩm trong giỏ hàng."));
  }catch(e){setActionError(e.message);}finally{setBusy(false);}}
  return <div className="container product-detail-page">
    <div className="product-detail-navigation">{backLink}</div>
    <div className="product-detail">
      <div className="product-images"><div className="main-image"><img src={selectedImage} alt={product.name} /></div></div>
      <div className="product-info">
        <h1 className="product-title">{product.name}</h1>
        <div className="product-shop">{product.shop}</div>
        {product.titleTranslated && <div className="product-original-title"><span>{language === 'en' ? 'Automatic translation · Original title' : 'Bản dịch tự động · Tên gốc'}</span><p lang="en">{product.originalName}</p></div>}
        <div className="product-price">{formatProductPrice(product)}</div>
        <p>{product.currency === 'USD' && language === 'en' ? product.category.replaceAll('_',' ') : product.categoryLabel}</p>
        <section className="product-gallery" aria-label={t("Ảnh sản phẩm")}>
          <h2>{t("Ảnh sản phẩm")}</h2>
          <div className="thumbnail-list">{product.gallery.map((image,index) => <button
            key={image} type="button" className={`thumbnail-button ${image === selectedImage ? 'active' : ''}`}
            aria-label={`${language === 'en' ? 'View image' : 'Xem ảnh'} ${index + 1}: ${product.name}`} aria-pressed={image === selectedImage}
            onClick={() => setSelectedImage(image)}><img src={image} alt="" /></button>)}</div>
        </section>
        {variant&&<div className="commerce-form"><label>{t("Biến thể")}<select value={variantId} onChange={e=>{setVariantId(e.target.value);setQuantity(1);}}>{product.variants.map(v=><option key={v.id} value={v.id}>{v.name} · {formatProductPrice({price:v.price_vnd,currency:'VND'})}</option>)}</select></label><p>{language === 'en' ? 'Available' : 'Có sẵn'}: {variant.available}</p><label>{t("Số lượng")}<input type="number" min={1} max={Math.min(99,variant.available)} value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label></div>}
        <div className="product-actions"><div className="action-buttons">
          <button className="button-primary" disabled={busy||!variant||quantity<1||!Number.isInteger(quantity)||quantity>Math.min(99,variant.available)} onClick={()=>add()}>{t("Thêm vào giỏ")}</button>
          <button className="button-secondary" disabled={busy||!variant||quantity<1||!Number.isInteger(quantity)||quantity>Math.min(99,variant.available)} onClick={()=>add(true)}>{t("Mua ngay")}</button>
        </div>{!variant&&<p>{t("Chưa có phiên bản để đặt mua.")}</p>}{message&&<p role="status">{message} <Link to="/cart">{t("Xem giỏ hàng")}</Link></p>}{actionError&&<p role="alert">{actionError}</p>}</div>
        {product.rating != null && <div className="product-rating">⭐ {product.rating}/5</div>}
      </div>
    </div>
    <div className="product-detail-sections">
      <section className="product-description" aria-labelledby="product-description-title">
        <h2 id="product-description-title">{t("Mô tả sản phẩm")}</h2>
        <p>{product.description || t("Chưa có mô tả chi tiết.")}</p>
        {product.features.length > 0 && <ul>{product.features.map((feature,index) => <li key={index}>{feature}</li>)}</ul>}
      </section>
      <section className="product-reviews" aria-labelledby="product-reviews-title">
        <h2 id="product-reviews-title">{t("Đánh giá của người dùng")}</h2>
        <p className="reviews-empty">{t("Chưa có bài đánh giá cho sản phẩm này.")}</p>
      </section>
    </div>
  </div>;
}
