import { randomUUID } from 'node:crypto';
import { AppError } from '@shop/domain';
import { z } from '@shop/contracts';
import { inputs, outputs, type Operation } from './contracts';
import { parseBody } from '../http';
type Rpc=(request:Request|null,operation:Operation,input:unknown)=>Promise<unknown>;
type Dependencies={rpc:Rpc;authenticate:(request:Request)=>Promise<unknown>;appOrigin:()=>string;search:(input:unknown)=>Promise<{ids:string[];total:number}>};
export function isCommercePath(path:string){return /^\/api\/v1\/(marketplace(?:\/|$)|cart(?:\/|$)|checkout\/quote$|orders(?:\/|$)|seller\/|admin\/products\/)/.test(path);}
function route(path:string,method:string):{op:Operation;extra:Record<string,string>;public?:boolean}|null{
  const simple:Record<string,Partial<Record<string,Operation>>>={
    '/api/v1/marketplace/products':{GET:'products'},'/api/v1/marketplace/search':{GET:'search'},
    '/api/v1/cart':{GET:'cart'},'/api/v1/checkout/quote':{POST:'quote'},'/api/v1/orders':{GET:'orders',POST:'order_create'},
    '/api/v1/admin/products/pending':{GET:'moderate_list'},
  };
  const op=simple[path]?.[method];if(op)return {op,extra:{},public:op==='products'||op==='search'};
  let m=path.match(/^\/api\/v1\/marketplace\/products\/([^/]+)$/);
  if(m&&method==='GET')return {op:'product',extra:{id:m[1]!},public:true};
  m=path.match(/^\/api\/v1\/cart\/items\/([^/]+)$/);
  if(m&&['PUT','DELETE'].includes(method))return {op:method==='PUT'?'cart_put':'cart_delete',extra:{variant_id:m[1]!}};
  m=path.match(/^\/api\/v1\/orders\/([^/]+)(\/cancel)?$/);
  if(m&&((!m[2]&&method==='GET')||(m[2]&&method==='POST')))return {op:m[2]?'order_cancel':'order',extra:{id:m[1]!}};
  m=path.match(/^\/api\/v1\/seller\/shops\/([^/]+)\/(products|inventory-adjustments|orders)(?:\/([^/]+))?(?:\/(submit|archive|variants|transitions))?$/);
  if(m){const shop_id=m[1]!,resource=m[2],item=m[3],action=m[4];
    if(resource==='products'&&!item&&method==='GET')return {op:'seller_products',extra:{shop_id}};
    if(resource==='products'&&!item&&method==='POST')return {op:'seller_create',extra:{shop_id}};
    if(resource==='products'&&item&&!action&&method==='PATCH')return {op:'seller_update',extra:{shop_id,id:item}};
    if(resource==='products'&&item&&method==='POST'&&['submit','archive','variants'].includes(action||''))return {op:action==='variants'?'seller_variant':action==='submit'?'seller_submit':'seller_archive',extra:action==='variants'?{shop_id,product_id:item}:{shop_id,id:item}};
    if(resource==='inventory-adjustments'&&!item&&method==='POST')return {op:'seller_inventory',extra:{shop_id}};
    if(resource==='orders'&&!item&&method==='GET')return {op:'seller_orders',extra:{shop_id}};
    if(resource==='orders'&&item&&action==='transitions'&&method==='POST')return {op:'seller_transition',extra:{shop_id,id:item}};
  }
  m=path.match(/^\/api\/v1\/admin\/products\/([^/]+)\/decision$/);
  if(m&&method==='POST')return {op:'moderate',extra:{id:m[1]!}};
  return null;
}
export function createCommerceHandler(deps:Dependencies){return async(request:Request)=>{
  const requestId=randomUUID();const headers={'Cache-Control':'no-store','X-Request-Id':requestId,'X-Content-Type-Options':'nosniff'};
  try{
    const url=new URL(request.url),r=route(url.pathname,request.method);
    if(!r)throw new AppError(404,'NOT_FOUND','Không tìm thấy endpoint.');
    if(request.headers.get('origin')&&request.headers.get('origin')!==deps.appOrigin())throw new AppError(403,'FORBIDDEN','Nguồn yêu cầu không được phép.');
    if(!r.public)await deps.authenticate(request);
    let body:unknown={};
    if(['products','search'].includes(r.op)){
      const query:Record<string,string>={};for(const [k,v] of url.searchParams){if(k in query)throw new AppError(422,'VALIDATION_ERROR','Tham số bị lặp.');query[k]=v;}body=query;
    }else if(url.search)throw new AppError(422,'VALIDATION_ERROR','Endpoint không nhận tham số truy vấn.');
    else if(request.method!=='GET'&&request.method!=='DELETE'){
      body=await parseBody(request,z.record(z.string(),z.unknown()));
      if(Object.keys(r.extra).some(key=>key in (body as Record<string,unknown>)))throw new AppError(422,'VALIDATION_ERROR','Không được đổi phạm vi tài nguyên.');
    }
    const raw=inputs[r.op].safeParse({...body as Record<string,unknown>,...r.extra});
    if(!raw.success)throw new AppError(422,'VALIDATION_ERROR','Dữ liệu không hợp lệ.');
    let data:unknown;
    if(r.op==='search'){
      const found=await deps.search(raw.data);
      const hydrated=await deps.rpc(null,'products',{ids:found.ids,category:(raw.data as {category:string}).category});
      const checked=outputs.products.parse(hydrated) as {items:{id:string}[];total:number};
      const rows=new Map(checked.items.map(item=>[item.id,item]));
      data={items:found.ids.flatMap(id=>rows.has(id)?[rows.get(id)!]:[]),total:found.total};
    }else data=await deps.rpc(r.public?null:request,r.op,raw.data);
    const result=outputs[r.op].safeParse(data);if(!result.success)throw new AppError(503,'SERVICE_UNAVAILABLE','Phản hồi dữ liệu không hợp lệ.');
    return Response.json(result.data,{headers,status:r.op==='order_create'||r.op==='seller_create'?201:200});
  }catch(error){const safe=error instanceof AppError?error:new AppError(503,'SERVICE_UNAVAILABLE','Dịch vụ tạm thời không khả dụng.');
    return Response.json({error:{code:safe.code,message:safe.message,request_id:requestId,fields:safe.fields}},{status:safe.status,headers});}
};}
