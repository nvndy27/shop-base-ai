import "server-only";
import { authenticate } from "../../../../server/adapters/supabase";
import { readConfig } from "../../../../server/env";
import { createHandler } from "../../../../server/http";
import { createCatalogHandler, isCatalogPath } from "../../../../server/catalog/http";
import { catalogPresentation, presentProducts } from '../../../../server/catalog/presentation';
import { catalogRepository } from "../../../../server/catalog/supabase";
import { elasticsearch } from "../../../../server/catalog/elasticsearch";
import { createCommerceHandler, isCommercePath } from '../../../../server/commerce/http';
import { commerceRpc } from '../../../../server/commerce/supabase';
import { marketplaceSearch } from '../../../../server/commerce/elasticsearch';
import { uploadImage } from '../../../../server/commerce/images';
import { AppError } from '@shop/domain';
import { randomUUID } from 'node:crypto';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const identity = createHandler({ authenticate, appOrigin: () => readConfig().APP_ORIGIN });
const catalog = createCatalogHandler({ repository: catalogRepository, search: elasticsearch, presentation: catalogPresentation, present: presentProducts, appOrigin: () => readConfig().APP_ORIGIN });
const commerce = createCommerceHandler({authenticate,rpc:commerceRpc,search:marketplaceSearch,appOrigin:()=>readConfig().APP_ORIGIN});
const handle = async (request: Request) => {
  const path=new URL(request.url).pathname;
  const image=path.match(/^\/api\/v1\/seller\/shops\/([^/]+)\/images$/);
  if(image&&request.method==='POST'){
    const requestId=randomUUID();const headers={'Cache-Control':'no-store','X-Request-Id':requestId,'X-Content-Type-Options':'nosniff'};
    try{return Response.json(await uploadImage(request,image[1]!),{status:201,headers});}
    catch(error){const safe=error instanceof AppError?error:new AppError(503,'SERVICE_UNAVAILABLE','Dịch vụ ảnh tạm thời không khả dụng.');return Response.json({error:{code:safe.code,message:safe.message,request_id:requestId}},{status:safe.status,headers});}
  }
  return isCommercePath(path) ? commerce(request) : isCatalogPath(path) ? catalog(request) : identity(request);
};
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE, handle as PUT };
