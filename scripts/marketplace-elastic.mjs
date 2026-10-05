import { request } from 'node:https';
import { readFile } from 'node:fs/promises';
export const marketplaceIndex='shopbase-marketplace-v1';
export async function elasticCall(path,body,keyFile,method='POST'){
  const url=new URL(process.env.ELASTIC_URL||'https://localhost:9200');
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Invalid Elastic configuration');
  if(!keyFile||!process.env.ELASTIC_CA_FILE)throw new Error('Missing Elastic credential/CA file');
  const [key,ca]=await Promise.all([readFile(keyFile,'utf8'),readFile(process.env.ELASTIC_CA_FILE)]);
  const payload=body===undefined?'':JSON.stringify(body);
  return new Promise((resolve,reject)=>{
    const req=request(new URL(path,url),{method,ca,rejectUnauthorized:true,signal:AbortSignal.timeout(10000),headers:{Authorization:'ApiKey '+key.trim(),'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{
      let size=0;const parts=[];res.on('data',part=>{size+=part.length;if(size>1048576){res.destroy();reject(new Error('Response limit'));}else parts.push(part);});
      res.on('error',reject);res.on('end',()=>{try{const data=JSON.parse(Buffer.concat(parts).toString('utf8'));resolve({status:res.statusCode,data});}catch{reject(new Error('Invalid Elastic response'));}});
    });req.on('error',reject);req.end(payload);
  });
}
export function indexDocument(event){
  const p=event.product;
  const prices=p?.variants.filter(v=>v.active).map(v=>v.price_vnd)||[];
  // Keep a versioned tombstone document. Physical deletion allows an old retry
  // to recreate a product after Elastic's deleted-version retention expires.
  return {id:event.id,visible:Boolean(p&&prices.length),title:p?.title||'',description:p?.description||'',category:p?.category||'',price:prices.length?Math.min(...prices):0};
}
export async function indexEvent(event,call=elasticCall){
  const result=await call(`/${marketplaceIndex}/_doc/${event.id}?version=${event.version}&version_type=external_gte`,indexDocument(event),process.env.ELASTIC_MARKETPLACE_WORKER_KEY_FILE,'PUT');
  if(![200,201,409].includes(result.status))throw new Error('Index write failed');
}
