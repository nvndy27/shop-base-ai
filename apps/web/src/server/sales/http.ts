import { randomUUID } from 'node:crypto';
import { AppError } from '@shop/domain';
import { z } from '@shop/contracts';
import { inputs, resource, pagination } from './contracts';
import { parseBody } from '../http';
type Dependencies = { authenticate: (request: Request) => Promise<unknown>; appOrigin: () => string; rpc: (request: Request, input: Record<string, unknown>) => Promise<unknown> };
export function createSalesHandler(deps: Dependencies) { return async (request: Request) => {
 const requestId = randomUUID();
 const headers = {'Cache-Control':'no-store','X-Request-Id':requestId,'X-Content-Type-Options':'nosniff'};
 try {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/v1\/sales\/(categories|products|customers|warehouses)(?:\/([^/]+))?(?:\/(active))?$/);
  if (!match) throw new AppError(404,'NOT_FOUND','Không tìm thấy endpoint.');
  if (request.headers.get('origin') && request.headers.get('origin') !== deps.appOrigin()) throw new AppError(403,'FORBIDDEN','Nguồn không được phép.');
  await deps.authenticate(request);
  const table = resource.parse(match[1]);
  const id = match[2] ? z.uuid().parse(match[2]) : null;
  const method = request.method;
  const op = match[3] && id && method === 'PATCH' ? 'active' : !match[3] && method === 'GET' ? (id ? 'get' : 'list') : !match[3] && method === 'POST' && !id ? 'create' : !match[3] && method === 'PUT' && id ? 'update' : !match[3] && method === 'DELETE' && id ? 'delete' : null;
  if (!op) throw new AppError(404,'NOT_FOUND','Không tìm thấy endpoint.');
  let data: unknown = {};
  if (op === 'list') {
   const query: Record<string,string> = {};
   for (const [key,value] of url.searchParams) { if (key in query) throw new AppError(422,'VALIDATION_ERROR','Tham số bị lặp.'); query[key]=value; }
   data=pagination.parse(query);
  } else {
   if (url.search) throw new AppError(422,'VALIDATION_ERROR','Không nhận tham số truy vấn.');
   if (op === 'create' || op === 'update') data=await parseBody<unknown>(request,inputs[table]);
   if (op === 'active') data=await parseBody(request,z.strictObject({is_active:z.boolean()}));
  }
  return Response.json(await deps.rpc(request,{table,op,id,data}),{status:op === 'create' ? 201 : 200,headers});
 } catch (error) {
  const safe = error instanceof AppError ? error : error instanceof z.ZodError ? new AppError(422,'VALIDATION_ERROR','Dữ liệu không hợp lệ.') : new AppError(503,'SERVICE_UNAVAILABLE','Dịch vụ chưa khả dụng.');
  return Response.json({error:{code:safe.code,message:safe.message,fields:safe.fields,request_id:requestId}},{status:safe.status,headers});
 }
}; }
