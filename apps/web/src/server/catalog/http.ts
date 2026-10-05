import { randomUUID } from 'node:crypto';
import { AppError } from '@shop/domain';
import { z } from '@shop/contracts';
import type { Product } from './contracts';
import { asin,catalogQuery,type CatalogRepository,type SearchAdapter } from './contracts';
export function isCatalogPath(path:string){return ['/api/v1/products','/api/v1/search','/api/v1/search/suggestions','/api/v1/catalog/categories','/api/v1/catalog/presentation'].includes(path)||/^\/api\/v1\/products\/[^/]+$/.test(path);}
export function createCatalogHandler(deps:{repository:()=>CatalogRepository;search:SearchAdapter;appOrigin:()=>string;presentation?:()=>Promise<unknown>;present?:(items:Awaited<ReturnType<CatalogRepository['read']>>,language:'vi'|'en')=>Promise<(Product & {display_title?:string})[]>}){
  return async(request:Request)=>{
    const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Request-Id':randomUUID(),'Vary':'Origin'});
    const json=(data:unknown,status=200)=>Response.json(data,{status,headers});
    try{
      const url=new URL(request.url);
      if(!isCatalogPath(url.pathname))throw new AppError(404,'NOT_FOUND','Không tìm thấy endpoint.');
      if(request.method!=='GET'){headers.set('Allow','GET');throw new AppError(405,'METHOD_NOT_ALLOWED','Phương thức không được hỗ trợ.');}
      const origin=request.headers.get('origin');
      if(origin&&origin!==deps.appOrigin())throw new AppError(403,'FORBIDDEN','Nguồn yêu cầu không được phép.');
      if(origin)headers.set('Access-Control-Allow-Origin',origin);
      const language=z.enum(['vi','en']).safeParse(url.searchParams.get('language') ?? 'en');
      if(!language.success || url.searchParams.getAll('language').length > 1)throw new AppError(422,'VALIDATION_ERROR','Ngôn ngữ không hợp lệ.');
      const present=(items:Awaited<ReturnType<CatalogRepository['read']>>):Promise<(Product & {display_title?:string})[]>=>deps.present ? deps.present(items,language.data) : Promise.resolve(items);
      if(url.pathname==='/api/v1/catalog/presentation')return json(deps.presentation ? await deps.presentation() : {exchange:null,translation:'unavailable'});
      const detail=url.pathname.match(/^\/api\/v1\/products\/([^/]+)$/);
      if(detail){
        const id=asin.safeParse(detail[1]);
        if(!id.success)throw new AppError(422,'VALIDATION_ERROR','Mã sản phẩm không hợp lệ.');
        const items=await deps.repository().read({ids:[id.data],limit:1});
        if(!items[0])throw new AppError(404,'NOT_FOUND','Sản phẩm không tồn tại.');
        return json((await present(items))[0]);
      }
      if(url.pathname==='/api/v1/catalog/categories')return json({items:await deps.repository().categories()});
      const raw:Record<string,string>={};
      for(const [key,value] of url.searchParams){if(key in raw)throw new AppError(422,'VALIDATION_ERROR','Tham số bị lặp.');raw[key]=value;}
      const input=catalogQuery.safeParse(raw);
      if(!input.success)throw new AppError(422,'VALIDATION_ERROR','Tham số tìm kiếm không hợp lệ.');
      const q=input.data;
      const suggest=url.pathname.endsWith('/suggestions');
      if(suggest&&!q.q)return json({items:[],engine:'elasticsearch'});
      if(q.q||q.sort!=='relevance'||url.pathname==='/api/v1/search'||suggest){
        if(q.after)throw new AppError(422,'VALIDATION_ERROR','Tìm kiếm sử dụng phân trang page.');
        const result=await deps.search.search(q,suggest);
        // Elasticsearch provides only IDs. PostgreSQL remains the authority for returned metadata.
        const rows=result.ids.length?await deps.repository().read({ids:result.ids,category:q.category,limit:suggest?6:q.limit}):[];
        const byId=new Map(rows.map(p=>[p.id,p]));
        const items=result.ids.flatMap(id=>{const product=byId.get(id);return product?[product]:[];});
        if(suggest)return json({items:(await present(items)).map(p=>({id:p.id,label:p.display_title ?? p.title,query:p.title,kind:language.data==='en'?'Product':'Sản phẩm'})),engine:'elasticsearch'});
        return json({items:await present(items),total:result.total,total_source:'index',page:q.page,limit:q.limit,has_more:q.page<80&&q.page*q.limit<result.total,engine:'elasticsearch'});
      }
      if(q.page!==1)throw new AppError(422,'VALIDATION_ERROR','Danh sách sản phẩm sử dụng con trỏ after.');
      const repository=deps.repository();
      const [items,categories]=await Promise.all([repository.read({category:q.category,after:q.after,limit:q.limit}),repository.categories()]);
      const total=categories.filter(c=>!q.category||c.id===q.category).reduce((sum,c)=>sum+c.products,0);
      return json({items:await present(items),total,total_source:'database',next_after:items.at(-1)?.id??null,has_more:items.length===q.limit,engine:'supabase'});
    }catch(error:unknown){
      const safe=error instanceof AppError?error:new AppError(503,'SERVICE_UNAVAILABLE','Dịch vụ sản phẩm tạm thời không khả dụng.');
      return json({error:{code:safe.code,message:safe.message,request_id:headers.get('X-Request-Id'),fields:safe.fields}},safe.status);
    }
  };
}
