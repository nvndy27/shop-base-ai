// Trusted worker only. Never import this script into frontend/API user handlers.
import { readFile } from 'node:fs/promises';
import { indexEvent } from './marketplace-elastic.mjs';
async function rpc(op,input={}){
  const url=new URL(process.env.SUPABASE_URL||'');
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Invalid database URL');
  const file=process.env.MARKETPLACE_SERVICE_KEY_FILE;if(!file)throw new Error('Missing worker service credential file');
  const key=(await readFile(file,'utf8')).trim();
  const response=await fetch(new URL('/rest/v1/rpc/marketplace_worker',url),{method:'POST',signal:AbortSignal.timeout(15000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({p_op:op,p_input:input})});
  if(!response.ok)throw new Error('Worker database operation failed');return response.json();
}
try{
  if(process.argv.includes('--reindex'))await rpc('reindex');
  await rpc('expire');
  const {items}=await rpc('claim');let indexed=0,failed=0;
  for(const event of items){
    const ref={id:event.id,version:event.version,lease:event.lease};
    try{await indexEvent(event);await rpc('ack',ref);indexed++;}
    catch{await rpc('retry',ref);failed++;}
  }
  console.log(JSON.stringify({indexed,failed}));if(failed)process.exitCode=1;
}catch{console.error('Marketplace worker unavailable. Check database, private credential files and TLS configuration.');process.exitCode=1;}
