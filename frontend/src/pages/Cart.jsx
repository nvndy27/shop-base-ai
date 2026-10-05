import { useState } from 'react';
import { Link } from 'react-router-dom';
import LegacyDemoCart from './LegacyDemoCart';
import { commerceApi,useCommerceResource,vnd } from '../commerce/api';
import ResourceStatus from '../commerce/ResourceStatus';
import './Cart.css';
import '../commerce/Commerce.css';
export default function Cart({demo=false}){return demo?<LegacyDemoCart demo/>:<AccountCart/>;}
function AccountCart(){
  const resource=useCommerceResource('/api/v1/cart');const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const items=resource.data?.items||[];
  async function update(item,quantity){setBusy(true);setError('');try{await commerceApi(`/api/v1/cart/items/${item.variant_id}`,quantity?{method:'PUT',body:{quantity}}:{method:'DELETE'});resource.reload();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div className="container account-page commerce-page"><Link to="/marketplace" className="page-back-link">← Tiếp tục mua sắm</Link><h1>Giỏ hàng</h1><ResourceStatus {...resource}/>{error&&<p role="alert" className="commerce-message">{error}</p>}
    {!resource.loading&&!resource.error&&(items.length?<div className="cart-layout"><div className="cart-items">{items.map(item=><article className="cart-item" key={item.variant_id}><div className="cart-item-info"><img className="cart-item-thumb" src={item.image_url} alt=""/><div><Link className="cart-item-name" to={`/product/${item.product_id}`}>{item.title}</Link><p>{item.name}</p><p className="commerce-note">{item.shop_name}</p>{!item.saleable&&<p role="alert">Sản phẩm hiện không thể đặt mua.</p>}<strong>{vnd(item.price_vnd)}</strong></div></div><div className="cart-item-actions"><div className="quantity-selector"><button aria-label={`Giảm số lượng ${item.title}`} disabled={busy||item.quantity<=1} onClick={()=>update(item,item.quantity-1)}>−</button><span>{item.quantity}</span><button aria-label={`Tăng số lượng ${item.title}`} disabled={busy||item.quantity>=Math.min(item.available,99)} onClick={()=>update(item,item.quantity+1)}>+</button></div><button className="button-link" disabled={busy} onClick={()=>update(item,0)}>Xóa</button></div></article>)}</div><aside className="cart-summary"><h2>Tóm tắt</h2><div className="cart-total"><span>Tạm tính</span><strong>{vnd(items.reduce((sum,i)=>sum+i.price_vnd*i.quantity,0))}</strong></div><p className="commerce-note">Giá và tồn kho sẽ được kiểm tra lại khi đặt hàng.</p><Link className="button-primary" to="/checkout">Tiến hành đặt hàng</Link></aside></div>:<div className="commerce-panel"><p>Giỏ hàng của bạn đang trống.</p><Link to="/marketplace" className="button-primary">Chọn sản phẩm</Link></div>)}</div>;
}
