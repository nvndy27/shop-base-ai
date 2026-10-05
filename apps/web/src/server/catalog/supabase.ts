import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { z } from '@shop/contracts';
import { AppError } from '@shop/domain';
import { readConfig } from '../env';
import { productDto,categoriesDto,type CatalogRepository } from './contracts';
export function catalogRepository():CatalogRepository {
  const config=readConfig();
  const client=createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(7000)})},
  });
  async function rpc<T>(name:string,args:Record<string,unknown>,schema:z.ZodType<T>):Promise<T>{
    const {data,error}=await client.rpc(name,args);
    if(error) throw new AppError(503,'SERVICE_UNAVAILABLE','Dịch vụ sản phẩm tạm thời không khả dụng.');
    const result=schema.safeParse(data);
    if(!result.success) throw new AppError(503,'SERVICE_UNAVAILABLE','Dữ liệu sản phẩm không hợp lệ.');
    return result.data;
  }
  return {
    read:query=>rpc('read_academic_catalog',{p_ids:query.ids??null,p_category:query.category??'',p_after:query.after??'',p_limit:query.limit},z.array(productDto)),
    categories:()=>rpc('academic_catalog_categories',{},categoriesDto),
  };
}
