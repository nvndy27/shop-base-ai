import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { inputs, quantity } from '../../apps/web/src/server/sales/contracts';
const db=new PGlite();
const actor='11111111-1111-4111-8111-111111111111';
async function api(table:string,op:string,data:unknown={},id:string|null=null) {
 const rows=await db.query<{result:Record<string,unknown>}>('select public.sales_api($1::jsonb) result',[JSON.stringify({table,op,data,id})]);
 return rows.rows[0]!.result;
}
beforeAll(async()=>{
 await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/202610290001_sales_foundation.sql','utf8'));
 await db.exec(`insert into auth.users(id) values('${actor}'); insert into sales.staff values('${actor}','manager',true); set role authenticated; set request.jwt.claims='{"sub":"${actor}"}';`);
});
afterAll(()=>db.close());
it('KT01/02 normalized codes, uniqueness, invalid inputs and own update',async()=>{
 const c=await api('categories','create',inputs.categories.parse({code:' c-1 ',name:'Nhóm'}));
 await expect(api('categories','create',{code:'C-1',name:'Khác'})).rejects.toThrow();
 for(const code of ['A B','A/B','a'.repeat(21)]) expect(inputs.categories.safeParse({code,name:'Tên'}).success).toBe(false);
 const p=await api('products','create',inputs.products.parse({sku:' sp-001 ',category_id:c.id,name:'Hàng',unit:'cái',current_price:0}));
 await expect(api('products','create',{sku:'SP-001',category_id:c.id,name:'Khác',unit:'cái',current_price:1})).rejects.toThrow();
 await api('products','update',{sku:'SP-001',category_id:c.id,name:'Mới',unit:'cái',current_price:99999999999999},p.id as string);
 await api('products','active',{is_active:false},p.id as string);
 await expect(api('products','create',{sku:'SP-001',category_id:c.id,name:'Khác',unit:'cái',current_price:1})).rejects.toThrow();
});
it('KT03-05 phone, NFC, optional email, unchanged phone and immutable customer code',async()=>{
 const data=inputs.customers.parse({code:'kh1',full_name:'  Nguyễn   An ',phone:'0912 345 678',email:' ',address:' Hà  Nội '});
 const c=await api('customers','create',data);
 expect(c.phone).toBe('+84912345678');expect(c.email).toBeNull();expect(c.full_name).toBe('Nguyễn An');
 await api('customers','update',data,c.id as string);
 await expect(api('customers','create',{...data,code:'KH2',phone:'+84 912-345-678'})).rejects.toThrow();
 await expect(api('customers','update',{...data,code:'KH3'},c.id as string)).rejects.toThrow();
 for(const phone of ['091a234567','0123','+19999999999']) expect(inputs.customers.safeParse({...data,phone}).success).toBe(false);
 expect(inputs.customers.safeParse({...data,full_name:'   '}).success).toBe(false);
 expect(inputs.customers.safeParse({...data,email:'bad'}).success).toBe(false);
 expect(inputs.customers.parse({...data,email:'AbC@EXAMPLE.COM'}).email).toBe('AbC@example.com');
});
it('KT06 refuses invalid price before numeric rounding; quantity contract only',async()=>{
 const c=await api('categories','create',{code:'PRICE',name:'Giá'});
 for(const current_price of [-1,1.5,100000000000000,'1000']) {
  const data={sku:'BAD',category_id:c.id,name:'Hàng',unit:'cái',current_price};
  expect(inputs.products.safeParse(data).success).toBe(false);
  await expect(api('products','create',data)).rejects.toThrow();
 }
 for(const q of [0,-1,1.5]) expect(quantity.safeParse(q).success).toBe(false);
 const list=await api('products','list');expect(JSON.stringify(list)).not.toContain('BAD');
});
it('KT21/22 foundation: referenced category deletion denied, inactive assignment denied',async()=>{
 const c=await api('categories','create',{code:'REF',name:'Nhóm'});
 await api('products','create',{sku:'REF',category_id:c.id,name:'Hàng',unit:'cái',current_price:1});
 await expect(api('categories','delete',{},c.id as string)).rejects.toThrow();
 await api('categories','active',{is_active:false},c.id as string);
 await expect(api('products','create',{sku:'REF2',category_id:c.id,name:'Hàng',unit:'cái',current_price:1})).rejects.toThrow();
 const w=await api('warehouses','create',{code:'K1',name:'Kho',address:'Hà Nội'});
 await api('warehouses','active',{is_active:false},w.id as string);
 await api('warehouses','delete',{},w.id as string);
});
it('all resources enforce roles and deny direct writes and anonymous access',async()=>{
 for(const role of ['sales','warehouse']) {
  await db.exec(`reset role; update sales.staff set role='${role}'; set role authenticated;`);
  for(const table of ['categories','products','customers','warehouses']) {
   await api(table,'list');
   if(role==='sales'&&table==='customers') continue;
   for(const op of ['create','update','active','delete']) await expect(api(table,op)).rejects.toThrow();
   await expect(db.exec(`delete from sales.${table}`)).rejects.toThrow();
  }
 }
 await db.exec('reset role; update sales.staff set is_active=false; set role authenticated;');
 for(const table of ['categories','products','customers','warehouses']) {await expect(api(table,'list')).rejects.toThrow();expect((await db.query(`select * from sales.${table}`)).rows).toHaveLength(0);}
 await db.exec('set role anon');await expect(api('customers','list')).rejects.toThrow();
 await db.exec('reset role; update sales.staff set role=\'manager\',is_active=true; set role authenticated;');
});
it('HTTP routes all four groups, validates before persistence and reports auth failures',async()=>{
 const { createSalesHandler }=await import('../../apps/web/src/server/sales/http');
 const { AppError }=await import('@shop/domain');
 const handler=createSalesHandler({authenticate:async()=>({}),appOrigin:()=> 'http://localhost',rpc:async(_request,input)=>api(String(input.table),String(input.op),input.data,input.id as string|null)});
 for(const table of ['categories','products','customers','warehouses']) {
  const response=await handler(new Request(`http://localhost/api/v1/sales/${table}?page_size=1`));
  expect(response.status).toBe(200);expect((await response.json()).page_size).toBe(1);
  const bad=await handler(new Request(`http://localhost/api/v1/sales/${table}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'manager',is_active:true})}));
  expect(bad.status).toBe(422);
  const denied=createSalesHandler({authenticate:async()=>{throw new AppError(401,'UNAUTHENTICATED','Đăng nhập.');},appOrigin:()=>'',rpc:async()=>{throw Error('must not execute');}});
  expect((await denied(new Request(`http://localhost/api/v1/sales/${table}`))).status).toBe(401);
 }
 for(const path of ['categories?page=0','products?page=1&page=2','customers?unknown=1','warehouses/not-a-uuid']) expect((await handler(new Request(`http://localhost/api/v1/sales/${path}`))).status).toBe(422);
 const unavailable=createSalesHandler({authenticate:async()=>{throw Error('configuration missing');},appOrigin:()=>'',rpc:async()=>null});
 expect((await unavailable(new Request('http://localhost/api/v1/sales/categories'))).status).toBe(503);
});
it('queued two-request collisions: code/SKU/phone persist one row (PGlite single connection only)',async()=>{
 const c=await api('categories','create',{code:'RACE-CATEGORY',name:'Race'});
 for(const [table,data] of [
  ['categories',{code:'RACE',name:'Race'}],
  ['warehouses',{code:'RACE',name:'Race',address:'Hà Nội'}],
  ['products',{sku:'RACE',category_id:c.id,name:'Race',unit:'cái',current_price:1}],
  ['customers',{code:'RACE',full_name:'Race',phone:'+84999999999',address:'Hà Nội'}]
 ] as const) {
  const results=await Promise.allSettled([api(table,'create',data),api(table,'create',table==='customers'?{...data,code:'RACE2'}:data)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  const column=table==='customers'?'phone':table==='products'?'sku':'code';
  const value=table==='customers'?'+84999999999':'RACE';
  expect((await db.query<{count:number}>(`select count(*)::integer count from sales.${table} where ${column}=$1`,[value])).rows[0]!.count).toBe(1);
 }
});
it('manager CRUD/detail/pagination per group, sales customer write and grant boundaries',async()=>{
 const category=await api('categories','create',{code:'CRUD-BASE',name:'Nhóm'});
 const fixtures={categories:{code:'CRUD',name:'Nhóm'},products:{sku:'CRUD',category_id:category.id,name:'Hàng',unit:'hộp',current_price:1000},customers:{code:'CRUD',full_name:'Khách',phone:'0988888888',address:'Hà Nội'},warehouses:{code:'CRUD',name:'Kho',address:'Hà Nội'}};
 for(const table of ['categories','products','customers','warehouses'] as const) {
  const row=await api(table,'create',fixtures[table]);
  expect((await api(table,'get',{},row.id as string)).id).toBe(row.id);
  await api(table,'update',fixtures[table],row.id as string);
  expect((await api(table,'active',{is_active:false},row.id as string)).is_active).toBe(false);
  const page=await api(table,'list',{page:1,page_size:1});expect((page.items as unknown[]).length).toBeLessThanOrEqual(1);
  await api(table,'delete',{},row.id as string);
  await expect(api(table,'get',{},row.id as string)).rejects.toThrow();
  for(const statement of [`insert into sales.${table}(id) values(gen_random_uuid())`,`update sales.${table} set is_active=false`,`delete from sales.${table}`]) await expect(db.exec(statement)).rejects.toThrow();
 }
 await expect(db.exec('select * from sales.staff')).rejects.toThrow();
 await expect(db.exec(`insert into sales.staff values('${actor}','manager',true)`)).rejects.toThrow();
 await db.exec("reset role; update sales.staff set role='sales'; set role authenticated;");
 const c=await api('customers','create',{code:'SALES-OWN',full_name:'Khách',phone:'0977777777',address:'Hà Nội'});
 await api('customers','delete',{},c.id as string);
 await db.exec('set role anon');
 for(const table of ['categories','products','customers','warehouses']) for(const op of ['list','get','create','update','active','delete']) await expect(api(table,op)).rejects.toThrow();
 await db.exec("reset role; update sales.staff set role='manager'; set role authenticated;");
});
