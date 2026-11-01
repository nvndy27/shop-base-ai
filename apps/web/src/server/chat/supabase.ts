import 'server-only';
import { AppError } from '@shop/domain';
import { databaseError, userClient } from '../adapters/supabase';
import { readConfig } from '../env';
import type { Operation } from './contracts';
/** Chat always runs as the signed-in user so RLS and auth.uid() apply inside public.chat. */
export async function chatRpc(request:Request,p_op:Operation,p_input:unknown):Promise<unknown>{
  const authorization=request.headers.get('authorization');
  if(!authorization)throw new AppError(401,'UNAUTHORIZED','Cần đăng nhập để sử dụng tin nhắn.');
  const {data,error}=await userClient(readConfig(),authorization.slice(7)).rpc('chat',{p_op,p_input});
  if(error)throw databaseError(error);
  return data;
}
