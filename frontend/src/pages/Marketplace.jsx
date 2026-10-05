import { useEffect,useState } from 'react';
import { Link,useLocation,useSearchParams } from 'react-router-dom';
import { catalogRequest } from '../catalog/api';
import { categories,shopProduct } from '../commerce/api';
import ProductCard from '../components/ui/ProductCard';
import CatalogSelect from '../components/ui/CatalogSelect';
import './Home.css';
import '../commerce/Commerce.css';
export default function Marketplace(){const location=useLocation(),[params,setParams]=useSearchParams();const [query,setQuery]=useState(params.get('q')||''),[state,setState]=useState({loading:true,items:[],error:''}),[retry,setRetry]=useState(0);
  const q=params.get('q')||'',category=params.get('category')||'',sort=params.get('sort')||'relevance',page=Number(params.get('page'))||1;
  useEffect(()=>{const controller=new AbortController();setState({loading:true,items:[],error:''});catalogRequest(q||sort!=='relevance'?'marketplace/search':'marketplace/products',q||sort!=='relevance'?{q,category,sort,page}:{category,page},controller.signal)
    .then(data=>setState({loading:false,items:data.items.map(shopProduct),total:data.total,error:''})).catch(e=>{if(e.name!=='AbortError')setState({loading:false,items:[],error:e.message});});return()=>controller.abort();},[q,category,sort,page,retry]);
  useEffect(()=>{setQuery(q);},[q]);
  function change(values){const next={q,category,sort,page:1,...values};setParams(Object.fromEntries(Object.entries(next).filter(([,v])=>v!=='')));}
  return <div className="container home-page commerce-page"><Link to="/" className="page-back-link">← Về trang chủ</Link><h1>Sản phẩm từ các shop</h1>
    <form className="search-bar home-toolbar" onSubmit={e=>{e.preventDefault();change({q:query.trim()});}}><input type="search" aria-label="Tìm sản phẩm của shop" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm sản phẩm..."/><button>Tìm kiếm</button></form>
    <div className="catalog-filters" style={{marginTop:20}}><CatalogSelect id="shop-category" label="Danh mục" value={category} options={[{value:'',label:'Tất cả danh mục'},...categories]} onChange={value=>change({category:value})}/>
      <CatalogSelect id="shop-sort" label="Sắp xếp" value={sort} options={[{value:'relevance',label:'Phù hợp'},{value:'price_asc',label:'Giá tăng dần'},{value:'price_desc',label:'Giá giảm dần'}]} onChange={value=>change({sort:value})}/><span className="catalog-result-count" role="status">{state.loading?'Đang tải...':state.total!=null?`${state.total} sản phẩm`:''}</span></div>
    {state.error&&<div className="commerce-message" role="alert"><p>{state.error}</p><button className="button-outline" onClick={()=>setRetry(v=>v+1)}>Thử lại</button></div>}
    <div className="product-grid grid grid-4-cols">{state.items.map(p=><ProductCard key={p.id} product={p} returnTo={{pathname:'/marketplace',search:location.search}}/>)}</div>
    {!state.loading&&!state.error&&!state.items.length&&<p>Chưa có sản phẩm phù hợp từ các shop.</p>}
    {!state.error&&state.total>24&&<nav className="catalog-pagination" aria-label="Phân trang sản phẩm"><button disabled={page<=1||state.loading} onClick={()=>change({page:page-1})}>Trang trước</button><span>Trang {page}</span><button disabled={page*24>=state.total||state.loading} onClick={()=>change({page:page+1})}>Trang sau</button></nav>}
  </div>;
}
