import 'server-only';
import { request } from 'node:https';
import { readFile } from 'node:fs/promises';
import { z } from '@shop/contracts';
import { AppError } from '@shop/domain';
import { asin,type CatalogQuery,type SearchAdapter } from './contracts';
const index='shopbase-amazon-catalog';
export function buildSearchQuery(q:CatalogQuery,suggest=false){
  const match=q.q ? {multi_match:{query:q.q,type:suggest?'bool_prefix':'best_fields',operator:'and',fields:suggest?['suggest_text','suggest_text._2gram','suggest_text._3gram']:['title^5','title.folded^4','category_name_vi^3','description','features']}}:{match_all:{}};
  const sort=q.sort==='price_asc'?[{price:{order:'asc',missing:'_last'}},{id:'asc'}]:q.sort==='price_desc'?[{price:{order:'desc',missing:'_last'}},{id:'asc'}]:q.sort==='rating'?[{average_rating:{order:'desc',missing:'_last'}},{id:'asc'}]:['_score',{id:'asc'}];
  return {size:suggest?6:q.limit,from:suggest?0:(q.page-1)*q.limit,timeout:'2s',track_total_hits:true,_source:false,sort,
    query:{bool:{must:[match],filter:[{range:{price:{gt:0}}},...(q.category?[{term:{category:q.category}}]:[])]}}};
}
const responseSchema=z.object({timed_out:z.boolean(),hits:z.object({total:z.object({value:z.number().int().nonnegative(),relation:z.literal('eq')}),hits:z.array(z.object({_id:asin}))})});
export const elasticsearch:SearchAdapter={async search(query,suggest){
  try{
    const url=new URL(process.env.ELASTIC_URL??'https://localhost:9200');
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash) throw new Error('Invalid search configuration');
    const keyPath=process.env.ELASTIC_SEARCH_KEY_FILE;
    const caPath=process.env.ELASTIC_CA_FILE;
    if(!keyPath||!caPath) throw new Error('Missing search configuration');
    const [key,ca]=await Promise.all([readFile(keyPath,'utf8'),readFile(caPath)]);
    const payload=JSON.stringify(buildSearchQuery(query,suggest));
    const data=await new Promise<unknown>((resolve,reject)=>{
      const req=request(new URL('/'+index+'/_search',url),{method:'POST',ca,rejectUnauthorized:true,signal:AbortSignal.timeout(4000),headers:{Authorization:'ApiKey '+key.trim(),'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)},timeout:4000},res=>{
        const chunks:Buffer[]=[];let bytes=0;
        res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>65536){res.destroy();reject(new Error('Search response too large'));}else chunks.push(chunk);});
        res.on('error',reject);
        res.on('end',()=>{if(res.statusCode!==200)return reject(new Error('Search unavailable'));try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new Error('Invalid search response'));}});
      });
      req.on('timeout',()=>req.destroy(new Error('Search timeout')));req.on('error',reject);req.end(payload);
    });
    const parsed=responseSchema.parse(data);
    if(parsed.timed_out) throw new Error('Search timeout');
    return {ids:parsed.hits.hits.map(h=>h._id),total:parsed.hits.total.value};
  }catch{throw new AppError(503,'SEARCH_UNAVAILABLE','Tìm kiếm tạm thời không khả dụng. Vui lòng thử lại.');}
}};
