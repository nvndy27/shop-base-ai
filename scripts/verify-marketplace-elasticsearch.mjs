import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { indexEvent,elasticCall,marketplaceIndex } from './marketplace-elastic.mjs';
// Only a local hidden tombstone fixture. It is never returned by public search.
const env=await readFile(new URL('../apps/web/.env.local',import.meta.url),'utf8');
for(const line of env.split('\n')){const i=line.indexOf('=');const key=line.slice(0,i);if(['ELASTIC_URL','ELASTIC_CA_FILE','ELASTIC_MARKETPLACE_SEARCH_KEY_FILE','ELASTIC_MARKETPLACE_WORKER_KEY_FILE'].includes(key))process.env[key]=line.slice(i+1);}
if(!['localhost','127.0.0.1'].includes(new URL(process.env.ELASTIC_URL).hostname))throw new Error('Local verification only');
const id=randomUUID();
await indexEvent({id,version:1,product:null});
await indexEvent({id,version:3,product:null});
const old=await elasticCall(`/${marketplaceIndex}/_doc/${id}?version=2&version_type=external_gte`,{id,visible:true,title:'stale fixture',description:'',category:'All_Beauty',price:10000},process.env.ELASTIC_MARKETPLACE_WORKER_KEY_FILE,'PUT');
if(old.status!==409)throw new Error('Old event accepted');
const check=await elasticCall(`/${marketplaceIndex}/_doc/${id}`,undefined,process.env.ELASTIC_MARKETPLACE_SEARCH_KEY_FILE,'GET');
if(check.status!==200||check.data._version!==3||check.data._source.visible!==false)throw new Error('Tombstone check failed');
console.log('Local Elastic verified: external versions reject stale resurrection; hidden tombstone retained.');
