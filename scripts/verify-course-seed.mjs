import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
const db=new PGlite();
try{
  for(const path of ['supabase/tests/bootstrap.sql','supabase/migrations/202610010001_identity_and_shops.sql','supabase/migrations/202610030003_marketplace_cod.sql'])await db.exec(await readFile(new URL('../'+path,import.meta.url),'utf8'));
  await db.exec("insert into auth.users(id,email_confirmed_at) values('10000000-0000-4000-8000-000000000003',now()),('10000000-0000-4000-8000-000000000004',now()); insert into public.shops(id,owner_user_id,name,slug,status) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Course A','course-a','active'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','Course B','course-b','active')");
  const seed=await readFile(new URL('../data/amazon-2023/course-seed.sql',import.meta.url),'utf8');
  await db.exec(seed);await db.exec('drop table course_seed_rows');await db.exec('update commerce.inventory set reserved=1');await db.exec(seed);
  const counts=(await db.query('select count(*)::int products,(select count(*)::int from commerce.variants) variants,(select sum(reserved)::int from commerce.inventory) reserved from commerce.products')).rows[0];
  if(counts.products!==6||counts.variants!==6||counts.reserved!==6)throw new Error('Seed not idempotent');
  console.log('Local seed verified: six products/SKUs across two fixture shops; repeat preserves reserved stock. No cloud writes.');
}finally{await db.close();}
