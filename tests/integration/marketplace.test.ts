import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDatabase, setActor, users, shops, addressFixture } from '../helpers/database';

type Product = {id:string;version:number;variants:{id:string;version:number}[]};
type Order = {id:string;total:number;shops:{id:string;shop_id:string;status:string;version:number;items:{price_vnd:number}[]}[]};
let db:PGlite;
let a:Product,b:Product,address:string;
const input={title:'Nước hoa thử nghiệm',description:'Sản phẩm cho dự án môn học',category:'All_Beauty',image_urls:['https://m.media-amazon.com/images/I/test.jpg'],sku:'COURSE-001',name:'100ml',price_vnd:100000,stock:5};
async function rpc<T=Record<string,unknown>>(op:string,body:unknown={}){
  return (await db.query<{result:T}>('select public.marketplace($1,$2) result',[op,body])).rows[0]!.result;
}
async function publish(shop:string,seller:string){
  await setActor(db,seller);
  const p=await rpc<Product>('seller_create',{...input,shop_id:shop});
  const pending=await rpc<Product>('seller_submit',{shop_id:shop,id:p.id,version:p.version});
  await setActor(db,users.moderator,'aal2');
  return rpc<Product>('moderate',{id:p.id,version:pending.version,decision:'published',reason:'Course fixture reviewed'});
}
async function quoteOrder(){
  await setActor(db,users.buyerA);
  await rpc('cart_put',{variant_id:a.variants[0]!.id,quantity:1});
  const q=await rpc<{id:string}>('quote');
  const body={quote_id:q.id,address_id:address,request_key:randomUUID(),payment_method:'cod'};
  return {body,order:await rpc<Order>('order_create',body)};
}
describe('Persisted course marketplace: money, stock and authorization',()=>{
  beforeAll(async()=>{
    db=await createDatabase();
    await db.exec(await readFile(new URL('../../supabase/migrations/202610030003_marketplace_cod.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../../supabase/migrations/202610120001_email_password_cod.sql',import.meta.url),'utf8'));
    a=await publish(shops.a,users.sellerA); b=await publish(shops.b,users.sellerB);
    await setActor(db,users.buyerA);
    address=(await db.query<{result:{id:string}}>('select public.create_address($1) result',[addressFixture])).rows[0]!.result.id;
  },30000);
  afterAll(async()=>{await db?.close();});
  it('anon sees only published active shops, cannot mutate or run workers',async()=>{
    await setActor(db,null);
    expect((await rpc<{items:Product[]}>('products')).items).toHaveLength(2);
    await expect(rpc('cart')).rejects.toMatchObject({code:'42501'});
    await expect(db.query("select public.marketplace_worker('claim')")).rejects.toMatchObject({code:'42501'});
  });
  it('rejects cross-shop writes, publication mass assignment and revoked staff',async()=>{
    await setActor(db,users.sellerB);
    await expect(rpc('seller_archive',{shop_id:shops.a,id:a.id,version:a.version})).rejects.toMatchObject({code:'P0002'});
    await expect(rpc('seller_create',{...input,shop_id:shops.b,status:'published'})).rejects.toMatchObject({code:'22023'});
    await db.exec('reset role'); await db.query('update public.shop_members set active=false where user_id=$1',[users.staff]);
    await setActor(db,users.staff);
    await expect(rpc('seller_products',{shop_id:shops.a})).rejects.toMatchObject({code:'P0002'});
  });
  it('multi-shop order uses server prices, snapshot and one idempotent reservation',async()=>{
    await setActor(db,users.buyerA);
    await rpc('cart_put',{variant_id:b.variants[0]!.id,quantity:2});
    await rpc('cart_put',{variant_id:a.variants[0]!.id,quantity:1});
    const q=await rpc<{id:string;total:number}>('quote'); expect(q.total).toBe(300000);
    const body={quote_id:q.id,address_id:address,request_key:randomUUID(),payment_method:'cod'};
    await expect(rpc('order_create',{...body,total:1})).rejects.toMatchObject({code:'22023'});
    const order=await rpc<Order>('order_create',body); expect(order.total).toBe(300000); expect(order.shops).toHaveLength(2);
    expect(await rpc('order_create',body)).toEqual(order);
    await expect(rpc('order_create',{...body,quote_id:randomUUID()})).rejects.toMatchObject({message:'IDEMPOTENCY_CONFLICT'});
    await setActor(db,users.buyerB); await expect(rpc('order',{id:order.id})).rejects.toMatchObject({code:'P0002'});
    expect((await db.query('select id from commerce.orders')).rows).toHaveLength(0);
    await setActor(db,users.sellerA);
    const seller=await rpc<{items:Order[]}>('seller_orders',{shop_id:shops.a});
    expect(seller.items[0]!.shops).toHaveLength(1); expect(seller.items[0]!.total).toBe(100000);
    await expect(db.query('select id from commerce.orders')).resolves.toMatchObject({rows:[]});
    await setActor(db,users.buyerA); await rpc('order_cancel',{id:order.id,reason:'Course cancellation'});
    await rpc('order_cancel',{id:order.id,reason:'Course cancellation retry'});
    await db.exec('reset role'); expect((await db.query<{reserved:number}>('select reserved from commerce.inventory')).rows.every(x=>x.reserved===0)).toBe(true);
  });
  it('stale quote creates no order; unconfirmed identity blocks direct RPC',async()=>{
    await setActor(db,users.buyerA); await rpc('cart_put',{variant_id:a.variants[0]!.id,quantity:1});
    const q=await rpc<{id:string}>('quote');
    await setActor(db,users.sellerA);
    a=await rpc<Product>('seller_variant',{shop_id:shops.a,product_id:a.id,id:a.variants[0]!.id,version:a.variants[0]!.version,sku:input.sku,name:input.name,price_vnd:120000,active:true});
    await setActor(db,users.buyerA);
    await expect(rpc('order_create',{quote_id:q.id,address_id:address,request_key:randomUUID(),payment_method:'cod'})).rejects.toMatchObject({message:'PRICE_CHANGED'});
    await setActor(db,users.unverified);
    await expect(rpc('order_create',{quote_id:q.id,address_id:address,request_key:randomUUID(),payment_method:'cod'})).rejects.toMatchObject({message:'IDENTITY_UNVERIFIED'});
  });
  it('email-only COD still rejects foreign addresses and banned accounts',async()=>{
    await setActor(db,users.buyerB);
    await rpc('cart_put',{variant_id:a.variants[0]!.id,quantity:1});
    const q=await rpc<{id:string}>('quote');
    const body={quote_id:q.id,address_id:address,request_key:randomUUID(),payment_method:'cod'};
    await expect(rpc('order_create',body)).rejects.toMatchObject({code:'P0002'});
    await db.exec('reset role');
    await db.query("update public.profiles set status='banned' where user_id=$1",[users.buyerB]);
    await setActor(db,users.buyerB);
    await expect(rpc('order_create',body)).rejects.toMatchObject({code:'42501'});
    await db.exec('reset role');
    await db.query("update public.profiles set status='active' where user_id=$1",[users.buyerB]);
  });
  it('valid transitions consume stock once; buyer cannot cancel shipped and seller cannot forge version',async()=>{
    const {order}=await quoteOrder(); const sub=order.shops[0]!;
    await setActor(db,users.sellerA);
    const body={shop_id:shops.a,id:sub.id,version:sub.version,status:'confirmed',reason:'Confirmed course order'};
    const confirmed=await rpc<Order>('seller_transition',body);
    await expect(rpc('seller_transition',body)).rejects.toMatchObject({message:'VERSION_CONFLICT'});
    const shipped=await rpc<Order>('seller_transition',{...body,version:confirmed.shops[0]!.version,status:'shipped'});
    await expect(rpc('seller_transition',{...body,version:shipped.shops[0]!.version,status:'confirmed'})).rejects.toMatchObject({message:'INVALID_TRANSITION'});
    await setActor(db,users.buyerA); await expect(rpc('order_cancel',{id:order.id,reason:'Too late'})).rejects.toMatchObject({message:'INVALID_TRANSITION'});
    await db.exec('reset role'); expect((await db.query<{on_hand:number;reserved:number}>('select on_hand,reserved from commerce.inventory where variant_id=$1',[a.variants[0]!.id])).rows[0]).toEqual({on_hand:4,reserved:0});
  });
  it('stock adjustments are idempotent, cannot lower below held inventory, reject payload tampering',async()=>{
    await setActor(db,users.sellerA);
    const body={shop_id:shops.a,variant_id:a.variants[0]!.id,delta:1,reason:'Restock course inventory',request_key:randomUUID()};
    await rpc('seller_inventory',body); await rpc('seller_inventory',body);
    await expect(rpc('seller_inventory',{...body,delta:2})).rejects.toMatchObject({message:'IDEMPOTENCY_CONFLICT'});
    await expect(rpc('seller_inventory',{...body,reserved:0})).rejects.toMatchObject({code:'22023'});
    await expect(db.query('update commerce.inventory set reserved=0')).rejects.toMatchObject({code:'42501'});
  });
  it('shop suspension hides public records and supersedes old worker leases',async()=>{
    await db.exec('reset role; set role service_role');
    const claimed=(await db.query<{result:{items:{id:string;version:number;lease:string}[]}}>("select public.marketplace_worker('claim') result")).rows[0]!.result.items;
    await db.exec('reset role'); await db.query("update public.shops set status='suspended' where id=$1",[shops.b]);
    await db.exec('set role service_role');
    const stale=claimed.find(x=>x.id===b.id)!;
    await db.query("select public.marketplace_worker('ack',$1)",[stale]);
    await db.exec('reset role'); expect((await db.query('select product_id from commerce.outbox where product_id=$1',[b.id])).rows).toHaveLength(1);
    await setActor(db,null); await expect(rpc('product',{id:b.id})).rejects.toMatchObject({code:'P0002'});
  });
  it('two previously valid quotes cannot consume the last unit twice; expiry releases once',async()=>{
    await db.exec('reset role');await db.query('update commerce.inventory set on_hand=1 where variant_id=$1',[a.variants[0]!.id]);

    await setActor(db,users.buyerA);await rpc('cart_put',{variant_id:a.variants[0]!.id,quantity:1});const qa=await rpc<{id:string}>('quote');
    await setActor(db,users.buyerB);const ab=(await db.query<{result:{id:string}}>('select public.create_address($1) result',[addressFixture])).rows[0]!.result.id;
    await rpc('cart_put',{variant_id:a.variants[0]!.id,quantity:1});const qb=await rpc<{id:string}>('quote');
    await setActor(db,users.buyerA);const order=await rpc<Order>('order_create',{quote_id:qa.id,address_id:address,request_key:randomUUID(),payment_method:'cod'});
    await setActor(db,users.buyerB);await expect(rpc('order_create',{quote_id:qb.id,address_id:ab,request_key:randomUUID(),payment_method:'cod'})).rejects.toMatchObject({message:'OUT_OF_STOCK'});
    await db.exec('reset role');await db.query("update commerce.reservations set expires_at=now()-interval '1 minute' where shop_order_id=$1",[order.shops[0]!.id]);
    await db.exec('set role service_role');await db.query("select public.marketplace_worker('expire')");await db.query("select public.marketplace_worker('expire')");
    await db.exec('reset role');expect((await db.query<{on_hand:number;reserved:number}>('select on_hand,reserved from commerce.inventory where variant_id=$1',[a.variants[0]!.id])).rows[0]).toEqual({on_hand:1,reserved:0});
  });
  it('image assets cannot be finalized by a user or attached to another shop',async()=>{
    await setActor(db,users.sellerA);const asset=await rpc<{id:string;path:string}>('asset_init',{shop_id:shops.a});
    const url=`https://testproject.supabase.co/storage/v1/object/public/course-product-images/${asset.path}`;
    await expect(db.query("select public.marketplace_worker('asset_ready',$1)",[{id:asset.id,url}])).rejects.toMatchObject({code:'42501'});
    await db.exec('reset role; set role service_role');await db.query("select public.marketplace_worker('asset_ready',$1)",[{id:asset.id,url}]);
    await db.exec('reset role');await db.query("update public.shops set status='active' where id=$1",[shops.b]);
    await setActor(db,users.sellerB);await expect(rpc('seller_create',{...input,shop_id:shops.b,image_urls:[url]})).rejects.toMatchObject({message:'INVALID_IMAGE'});
    await setActor(db,users.sellerA);expect((await rpc<Product>('seller_create',{...input,shop_id:shops.a,image_urls:[url]})).id).toBeTruthy();
    await expect(rpc('seller_update',{shop_id:shops.a,id:a.id,...input,version:null})).rejects.toMatchObject({code:'22023'});
  });
  it('all commerce tables have RLS; internal definers and worker are not executable by clients',async()=>{
    await db.exec('reset role');
    const tables=await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='commerce' and c.relkind='r'");
    expect(tables.rows.length).toBeGreaterThan(10);expect(tables.rows.every(x=>x.relrowsecurity)).toBe(true);
    const functions=await db.query<{allowed:boolean;proconfig:string[]}>("select has_function_privilege('authenticated',p.oid,'execute') allowed,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'commerce_%'");
    expect(functions.rows.every(f=>!f.allowed&&f.proconfig.includes('search_path=\"\"'))).toBe(true);
  });
  it('Storage restrictive policy prevents direct uploads even with broad permissive user grants',async()=>{
    await db.exec(`reset role; create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;
      create policy broad_test_policy on storage.objects for all to anon,authenticated using(true) with check(true);`);
    await db.exec(await readFile(new URL('../../supabase/migrations/202610030004_product_image_storage.sql',import.meta.url),'utf8'));
    await setActor(db,users.sellerA);
    await expect(db.query("insert into storage.objects(bucket_id) values('course-product-images')")).rejects.toMatchObject({code:'42501'});
    await expect(db.query("insert into storage.objects(bucket_id) values('unrelated-bucket')")).resolves.toBeDefined();
    await setActor(db,null);await expect(db.query("insert into storage.objects(bucket_id) values('course-product-images')")).rejects.toMatchObject({code:'42501'});
  });
});
