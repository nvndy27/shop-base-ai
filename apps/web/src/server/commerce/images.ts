import 'server-only';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { z } from '@shop/contracts';
import { AppError } from '@shop/domain';
import { authenticate } from '../adapters/supabase';
import { identityService } from '../identity/service';
import { readConfig } from '../env';
import { commerceRpc } from './supabase';
import { id } from './contracts';

// Reuse Sharp already pinned as a declared Next dependency. No lockfile change.
type Decoder={metadata:()=>Promise<{format?:string;width?:number;height?:number;pages?:number}>;rotate:()=>Decoder;webp:(options:{quality:number})=>Decoder;toBuffer:()=>Promise<Buffer>};
export async function sanitizeImage(input:Buffer){
  try{
    if(!input.length||input.length>5242880)throw new Error('Size');
    const require=createRequire(process.cwd()+'/package.json');
    const nextRequire=createRequire(require.resolve('next/package.json'));
    const decode=nextRequire('sharp') as (input:Buffer,options:{limitInputPixels:number;failOn:string})=>Decoder;
    const image=decode(input,{limitInputPixels:16000000,failOn:'error'});
    const info=await image.metadata();
    if(!['jpeg','png','webp'].includes(info.format||'')||!info.width||!info.height||info.width*info.height>16000000||(info.pages||1)!==1)throw new Error('Image');
    const output=await image.rotate().webp({quality:82}).toBuffer();
    if(output.length>2097152)throw new Error('Output size');
    return output;
  }catch{throw new AppError(422,'INVALID_IMAGE','Chỉ nhận ảnh JPEG, PNG hoặc WebP, tối đa 5 MB và 16 triệu điểm ảnh.');}
}
export async function uploadImage(request:Request,shop:string){
  const config=readConfig();
  if(request.headers.get('origin')&&request.headers.get('origin')!==config.APP_ORIGIN)throw new AppError(403,'FORBIDDEN','Nguồn yêu cầu không được phép.');
  if(!id.safeParse(shop).success||new URL(request.url).search)throw new AppError(422,'VALIDATION_ERROR','ID không hợp lệ.');
  const session=await authenticate(request);await identityService(session).requireShopPermission(shop,'catalog:write');
  const keyFile=process.env.MARKETPLACE_SERVICE_KEY_FILE;
  if(!keyFile)throw new AppError(503,'SERVICE_UNAVAILABLE','Upload ảnh chưa được cấu hình trên server.');
  if(!/^image\/(jpeg|png|webp)$/.test(request.headers.get('content-type')||''))throw new AppError(422,'INVALID_IMAGE','Định dạng ảnh không được hỗ trợ.');
  const reader=request.body?.getReader();if(!reader)throw new AppError(422,'INVALID_IMAGE','Thiếu ảnh.');
  let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5242880){await reader.cancel();throw new AppError(422,'INVALID_IMAGE','Ảnh vượt 5 MB.');}chunks.push(value);}}finally{reader.releaseLock();}
  const asset=z.object({id,path:z.string().regex(/^[0-9a-f-]+\/[0-9a-f-]+\.webp$/)}).parse(await commerceRpc(request,'asset_init',{shop_id:shop}));
  const bytes=await sanitizeImage(Buffer.concat(chunks));
  const key=(await readFile(keyFile,'utf8')).trim();
  const storage=createClient(config.SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
  const bucket=storage.storage.from('course-product-images');
  const result=await bucket.upload(asset.path,bytes,{contentType:'image/webp',upsert:false});
  if(result.error)throw new AppError(503,'SERVICE_UNAVAILABLE','Không lưu được ảnh.');
  const url=bucket.getPublicUrl(asset.path).data.publicUrl;
  const ready=await storage.rpc('marketplace_worker',{p_op:'asset_ready',p_input:{id:asset.id,url}});
  if(ready.error){await bucket.remove([asset.path]);throw new AppError(503,'SERVICE_UNAVAILABLE','Không hoàn tất được ảnh.');}
  return {id:asset.id,url};
}
