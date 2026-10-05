import { useState } from 'react';
import { Link } from 'react-router-dom';
import { commerceApi,useCommerceResource } from '../commerce/api';
import ResourceStatus from '../commerce/ResourceStatus';
import '../commerce/Commerce.css';
export default function ProductModeration(){const resource=useCommerceResource('/api/v1/admin/products/pending');const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function decide(p,decision){const reason=window.prompt('Lý do duyệt hoặc từ chối:');if(!reason)return;setBusy(true);setError('');try{await commerceApi(`/api/v1/admin/products/${p.id}/decision`,{method:'POST',body:{version:p.version,decision,reason}});resource.reload();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div className="container account-page commerce-page"><Link to="/profile" className="page-back-link">← Về tài khoản</Link><h1>Kiểm duyệt sản phẩm</h1><p className="commerce-note">Yêu cầu quyền quản trị và phiên xác thực hai yếu tố.</p><ResourceStatus {...resource}/>{error&&<p role="alert">{error}</p>}<div className="commerce-stack">{resource.data?.items.map(p=><article className="commerce-panel" key={p.id}><h2>{p.title}</h2><p>{p.shop_name}</p><p>{p.description}</p><div className="commerce-row">{p.image_urls.map(u=><img key={u} src={u} width="100" height="100" alt="Ảnh sản phẩm"/>)}</div><div className="commerce-actions"><button className="button-primary" disabled={busy} onClick={()=>decide(p,'published')}>Duyệt đăng</button><button className="button-outline" disabled={busy} onClick={()=>decide(p,'rejected')}>Từ chối</button></div></article>)}</div>{resource.data?.items.length===0&&<p>Không có sản phẩm chờ duyệt.</p>}</div>;
}
