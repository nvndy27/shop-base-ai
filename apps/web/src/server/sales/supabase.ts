import 'server-only';
import { AppError } from '@shop/domain';
import { userClient, databaseError } from '../adapters/supabase';
import { readConfig } from '../env';
export async function salesRpc(request: Request, p_input: Record<string,unknown>): Promise<unknown> {
 const client=userClient(readConfig(),request.headers.get('authorization')!.slice(7));
 const {data,error}=await client.rpc('sales_api',{p_input});
 if (error) {
  if (error.code === '23503') throw new AppError(409,'REFERENCE_CONFLICT','Dữ liệu đang được tham chiếu hoặc tham chiếu không tồn tại.');
  if (error.code === '23505') throw new AppError(409,'DUPLICATE','Mã, SKU hoặc điện thoại đã tồn tại.');
  if (error.code === 'P0001') throw new AppError(409,'CONFLICT','Danh mục ngừng hoạt động hoặc mã khách không được thay đổi.');
  throw databaseError(error);
 }
 return data;
}
