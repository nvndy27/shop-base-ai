import { useState } from 'react';
import { Link } from 'react-router-dom';
import LegacyDemoOrders from './LegacyDemoOrders';
import { commerceApi,useCommerceResource } from '../commerce/api';
import ResourceStatus from '../commerce/ResourceStatus';
import OrderCard from '../commerce/OrderCard';
import './Orders.css';
import '../commerce/Commerce.css';
export default function Orders({demo=false}){return demo?<LegacyDemoOrders demo/>:<AccountOrders/>;}
function AccountOrders(){const resource=useCommerceResource('/api/v1/orders');const [busy,setBusy]=useState(false),[error,setError]=useState('');
async function cancel(order){const reason=window.prompt('Lý do hủy đơn:');if(!reason)return;setBusy(true);setError('');try{await commerceApi(`/api/v1/orders/${order.id}/cancel`,{method:'POST',body:{reason}});resource.reload();}catch(e){setError(e.message);}finally{setBusy(false);}}
return <div className="container account-page commerce-page"><Link to="/" className="page-back-link">← Về trang chủ</Link><h1>Đơn hàng</h1><ResourceStatus {...resource}/>{error&&<p role="alert">{error}</p>}<div className="orders-list">{resource.data?.items.map(order=><OrderCard key={order.id} order={order}>{order.shops.some(s=>s.status!=='cancelled')&&order.shops.every(s=>['pending','confirmed','cancelled'].includes(s.status))&&<button className="button-outline" disabled={busy} onClick={()=>cancel(order)}>Hủy đơn</button>}</OrderCard>)}</div>{resource.data?.items.length===0&&<p>Bạn chưa có đơn hàng.</p>}</div>;}
