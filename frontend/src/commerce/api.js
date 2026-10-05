import { useEffect, useState } from 'react';
import { createApi } from '../auth/api';
import { client } from '../auth/client';
import { useAuth } from '../auth/context';
export const commerceApi=createApi(client);
export const vnd=value=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(value);
export const categories=[{value:'Electronics',label:'Điện tử'},{value:'Cell_Phones_and_Accessories',label:'Điện thoại và phụ kiện'},{value:'All_Beauty',label:'Mỹ phẩm'},{value:'Home_and_Kitchen',label:'Nhà cửa và đồ bếp'},{value:'Grocery_and_Gourmet_Food',label:'Thực phẩm và đồ uống'}];
export function shopProduct(p){return {id:p.id,name:p.title,image:p.image_urls[0],gallery:p.image_urls,price:p.variants.length?Math.min(...p.variants.map(v=>v.price_vnd)):null,currency:'VND',shop:p.shop_name,rating:null,description:p.description,features:[],category:p.category,categoryLabel:categories.find(c=>c.value===p.category)?.label,variants:p.variants,reviews:[]};}
export function useCommerceResource(path){
  const {user}=useAuth();const [revision,setRevision]=useState(0);const [state,setState]=useState({loading:true,data:null,error:''});
  useEffect(()=>{const controller=new AbortController();setState({loading:true,data:null,error:''});
    commerceApi(path,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setState({loading:false,data,error:''});}).catch(e=>{if(!controller.signal.aborted)setState({loading:false,data:null,error:e.message});});
    return()=>controller.abort();
  },[path,revision,user?.id]);
  return {...state,reload:()=>setRevision(v=>v+1)};
}
