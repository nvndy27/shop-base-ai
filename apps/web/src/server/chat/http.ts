import { randomUUID } from 'node:crypto';
import { AppError } from '@shop/domain';
import { z } from '@shop/contracts';
import { inputs, outputs, type Operation } from './contracts';
import { parseBody } from '../http';
type Rpc=(request:Request,operation:Operation,input:unknown)=>Promise<unknown>;
type Dependencies={rpc:Rpc;authenticate:(request:Request)=>Promise<unknown>;appOrigin:()=>string};
export function isChatPath(path:string){return /^\/api\/v1\/chat(?:\/|$)/.test(path);}
const queryOps:Partial<Record<Operation,true>>={conversations:true,messages:true};
function route(path:string,method:string):{op:Operation;extra:Record<string,string>}|null{
  if(path==='/api/v1/chat/conversations'){
    if(method==='GET')return {op:'conversations',extra:{}};
    if(method==='POST')return {op:'conversation_open',extra:{}};
    return null;
  }
  const m=path.match(/^\/api\/v1\/chat\/conversations\/([^/]+)(?:\/(messages|read))?$/);
  if(!m)return null;
  const conversation_id=m[1]!,action=m[2];
  if(!action&&method==='GET')return {op:'messages',extra:{conversation_id}};
  if(action==='messages'&&method==='POST')return {op:'message_send',extra:{conversation_id}};
  if(action==='read'&&method==='POST')return {op:'conversation_read',extra:{conversation_id}};
  return null;
}
export function createChatHandler(deps:Dependencies){return async(request:Request)=>{
  const requestId=randomUUID();const headers={'Cache-Control':'no-store','X-Request-Id':requestId,'X-Content-Type-Options':'nosniff'};
  try{
    const url=new URL(request.url),r=route(url.pathname,request.method);
    if(!r)throw new AppError(404,'NOT_FOUND','Không tìm thấy endpoint.');
    if(request.headers.get('origin')&&request.headers.get('origin')!==deps.appOrigin())throw new AppError(403,'FORBIDDEN','Nguồn yêu cầu không được phép.');
    await deps.authenticate(request);
    let body:unknown={};
    if(queryOps[r.op]){
      const query:Record<string,string>={};for(const [k,v] of url.searchParams){if(k in query)throw new AppError(422,'VALIDATION_ERROR','Tham số bị lặp.');query[k]=v;}body=query;
    }else if(url.search)throw new AppError(422,'VALIDATION_ERROR','Endpoint không nhận tham số truy vấn.');
    else if(request.method!=='GET')body=await parseBody(request,z.record(z.string(),z.unknown()));
    if(Object.keys(r.extra).some(key=>key in (body as Record<string,unknown>)))throw new AppError(422,'VALIDATION_ERROR','Không được đổi phạm vi tài nguyên.');
    const raw=inputs[r.op].safeParse({...body as Record<string,unknown>,...r.extra});
    if(!raw.success)throw new AppError(422,'VALIDATION_ERROR','Dữ liệu không hợp lệ.');
    const result=outputs[r.op].safeParse(await deps.rpc(request,r.op,raw.data));
    if(!result.success)throw new AppError(503,'SERVICE_UNAVAILABLE','Phản hồi dữ liệu không hợp lệ.');
    return Response.json(result.data,{headers,status:r.op==='conversation_open'||r.op==='message_send'?201:200});
  }catch(error){const safe=error instanceof AppError?error:new AppError(503,'SERVICE_UNAVAILABLE','Dịch vụ tạm thời không khả dụng.');
    return Response.json({error:{code:safe.code,message:safe.message,request_id:requestId,fields:safe.fields}},{status:safe.status,headers});}
};}
