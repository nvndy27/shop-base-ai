import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { AppError } from '@shop/domain';
import { databaseError, userClient } from '../adapters/supabase';
import { readConfig } from '../env';
import type { Operation } from './contracts';
const conflicts:Record<string,string>={OUT_OF_STOCK:'Số lượng vượt tồn kho.',PRICE_CHANGED:'Giá hoặc giỏ hàng đã thay đổi. Vui lòng lấy báo giá mới.',
  PRODUCT_UNAVAILABLE:'Sản phẩm hiện không thể đặt mua.',QUOTE_EXPIRED:'Báo giá đã hết hạn. Vui lòng lấy báo giá mới.',IDEMPOTENCY_CONFLICT:'Mã yêu cầu đã được dùng với nội dung khác.',
  VERSION_CONFLICT:'Dữ liệu đã thay đổi. Vui lòng tải lại.',INVALID_TRANSITION:'Không thể chuyển sang trạng thái này.'};
export async function commerceRpc(request:Request|null,p_op:Operation,p_input:unknown):Promise<unknown>{
  const config=readConfig();
  const client=request?userClient(config,request.headers.get('authorization')!.slice(7)):
    createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
  const {data,error}=await client.rpc('marketplace',{p_op,p_input});
  if(error){
    if(error.code==='P0001'&&conflicts[error.message])throw new AppError(409,error.message,conflicts[error.message]!);
    if(error.code==='42501'&&error.message==='PHONE_REQUIRED')throw new AppError(403,'PHONE_REQUIRED','Vui lòng xác minh số điện thoại trước khi đặt hàng.');
    if(error.code==='42501'&&error.message==='IDENTITY_UNVERIFIED')throw new AppError(403,'IDENTITY_UNVERIFIED','Vui lòng xác nhận tài khoản trước khi đặt hàng.');
    throw databaseError(error);
  }
  return data;
}
