import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { inputs } from '../../apps/web/src/server/commerce/contracts';
import { marketplaceSearchQuery } from '../../apps/web/src/server/commerce/elasticsearch';
import { createCommerceHandler } from '../../apps/web/src/server/commerce/http';
import { sanitizeImage } from '../../apps/web/src/server/commerce/images';

const shop='20000000-0000-4000-8000-000000000001';
describe('Commerce API boundaries',()=>{
  afterEach(()=>vi.restoreAllMocks());
  it('rejects client money, payment provider, reserved/owner and invalid quantities',()=>{
    expect(inputs.order_create.safeParse({quote_id:shop,address_id:shop,request_key:shop,payment_method:'online'}).success).toBe(false);
    expect(inputs.cart_put.safeParse({variant_id:shop,quantity:0}).success).toBe(false);
    expect(inputs.cart_put.safeParse({variant_id:shop,quantity:1,price:1}).success).toBe(false);
    expect(inputs.seller_variant.safeParse({shop_id:shop,product_id:shop,id:shop,sku:'SKU',name:'Blue',price_vnd:10000,active:true}).success).toBe(false);
  });
  it('rejects cross-origin requests before authentication and prevents path scope overrides',async()=>{
    const authenticate=vi.fn(),rpc=vi.fn();const handler=createCommerceHandler({authenticate,rpc,appOrigin:()=> 'http://localhost:5175',search:vi.fn()});
    const foreign=await handler(new Request('http://localhost/api/v1/cart',{headers:{Origin:'https://evil.invalid'}}));expect(foreign.status).toBe(403);expect(authenticate).not.toHaveBeenCalled();
    const override=await handler(new Request(`http://localhost/api/v1/seller/shops/${shop}/products`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shop_id:shop})}));expect(override.status).toBe(422);expect(rpc).not.toHaveBeenCalled();
  });
  it('bounds raw JSON, rejects unknown query DSL and validates private output',async()=>{
    const handler=createCommerceHandler({authenticate:vi.fn(),rpc:vi.fn().mockResolvedValue({items:[{buyer_id:shop}]}),appOrigin:()=> 'http://localhost:5175',search:vi.fn()});
    expect((await handler(new Request('http://localhost/api/v1/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:' '.repeat(17000)}))).status).toBe(422);
    expect((await handler(new Request('http://localhost/api/v1/marketplace/search?query=raw'))).status).toBe(422);
    expect((await handler(new Request('http://localhost/api/v1/orders'))).status).toBe(503);
  });
  it('search always filters visibility, hydrates published data, does not expose index source',()=>{
    const query=marketplaceSearchQuery({q:'nước hoa',category:'All_Beauty',sort:'price_asc',page:1});
    expect(query._source).toBe(false);expect(query.query.bool.filter).toContainEqual({term:{visible:true}});
    expect(query.query.bool.filter).toContainEqual({term:{category:'All_Beauty'}});
  });
  it('real decoder rejects SVG, fake MIME/garbage and oversized bytes; outputs metadata-free WebP',async()=>{
    const root=process.cwd();const require=createRequire(resolve(root,'apps/web/package.json'));const sharpRequire=createRequire(require.resolve('next/package.json'));
    const sharp=sharpRequire('sharp') as (input:Buffer|{create:{width:number;height:number;channels:3;background:string}})=>{png:()=>{toBuffer:()=>Promise<Buffer>};metadata:()=>Promise<{format:string;exif?:Buffer;orientation?:number}>};
    const png=await sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}}).png().toBuffer();
    vi.spyOn(process,'cwd').mockReturnValue(resolve(root,'apps/web'));
    await expect(sanitizeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).rejects.toMatchObject({code:'INVALID_IMAGE'});
    await expect(sanitizeImage(Buffer.from('not an image'))).rejects.toMatchObject({code:'INVALID_IMAGE'});
    await expect(sanitizeImage(Buffer.alloc(5242881))).rejects.toMatchObject({code:'INVALID_IMAGE'});
    const image=await sanitizeImage(png),metadata=await sharp(image).metadata();
    expect(metadata.format).toBe('webp');expect(metadata.exif).toBeUndefined();expect(metadata.orientation).toBeUndefined();
  });
});
