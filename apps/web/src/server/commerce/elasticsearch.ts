import 'server-only';
import { readFile } from 'node:fs/promises';
import { request } from 'node:https';
import { AppError } from '@shop/domain';
import { z } from '@shop/contracts';
import { inputs } from './contracts';
export function marketplaceSearchQuery(input:unknown){
  const q=inputs.search.parse(input);
  return {size:24,from:(q.page-1)*24,timeout:'2s',track_total_hits:true,_source:false,
    sort:q.sort==='relevance'?['_score',{id:'asc'}]:[{price:q.sort==='price_asc'?'asc':'desc'},{id:'asc'}],
    query:{bool:{must:[q.q?{multi_match:{query:q.q,fields:['title^4','description'],operator:'and'}}:{match_all:{}}],
      filter:[{term:{visible:true}},...(q.category?[{term:{category:q.category}}]:[])]}}};
}
const response=z.object({timed_out:z.boolean(),hits:z.object({total:z.object({value:z.number().int().nonnegative(),relation:z.literal('eq')}),hits:z.array(z.object({_id:z.uuid()}))})});
export async function marketplaceSearch(input:unknown){
  try{
    const url=new URL(process.env.ELASTIC_URL||'https://localhost:9200');
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Invalid configuration');
    const keyFile=process.env.ELASTIC_MARKETPLACE_SEARCH_KEY_FILE,caFile=process.env.ELASTIC_CA_FILE;
    if(!keyFile||!caFile)throw new Error('Missing configuration');
    const [key,ca]=await Promise.all([readFile(keyFile,'utf8'),readFile(caFile)]);
    const payload=JSON.stringify(marketplaceSearchQuery(input));
    const data=await new Promise<unknown>((resolve,reject)=>{
      const req=request(new URL('/shopbase-marketplace-v1/_search',url),{method:'POST',ca,rejectUnauthorized:true,signal:AbortSignal.timeout(4000),headers:{Authorization:'ApiKey '+key.trim(),'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{
        let size=0;const chunks:Buffer[]=[];res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>65536){res.destroy();reject(new Error('Response limit'));}else chunks.push(chunk);});
        res.on('error',reject);res.on('end',()=>{if(res.statusCode!==200)return reject(new Error('Search unavailable'));try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new Error('Invalid response'));}});
      });req.on('error',reject);req.end(payload);
    });
    const parsed=response.parse(data);if(parsed.timed_out)throw new Error('Search timeout');
    return {ids:parsed.hits.hits.map(h=>h._id),total:parsed.hits.total.value};
  }catch{throw new AppError(503,'SEARCH_UNAVAILABLE','Tìm kiếm shop tạm thời không khả dụng.');}
}
