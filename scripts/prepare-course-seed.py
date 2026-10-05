#!/usr/bin/env python3
"""Generate reviewable course fixture files. Does NOT connect to any database."""
import argparse,json,pathlib,uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--shop-a',required=True,type=uuid.UUID)
parser.add_argument('--shop-b',required=True,type=uuid.UUID)
args=parser.parse_args()
rows=[];groups={}
for line in (ROOT/'data/amazon-2023/products.jsonl').open():
 p=json.loads(line)
 if p['price'] is not None and len(p['title'])<=200 and (len(groups)<3 or p['category'] in groups):
  if p['price'] is None or len(p['title'])>200 or groups.get(p['category'],0)>=2:continue
  groups[p['category']]=groups.get(p['category'],0)+1
  rows.append(p)
 if len(rows)==6:break
prices=[79000,159000,249000,99000,119000,199000]
data=[]
for i,p in enumerate(rows):
 shop=str(args.shop_a if i<3 else args.shop_b)
 pid=str(uuid.uuid5(uuid.NAMESPACE_URL,'shopbase-course:'+shop+':'+p['id']))
 vid=str(uuid.uuid5(uuid.NAMESPACE_URL,pid+':default'))
 data.append({'id':pid,'variant_id':vid,'shop_id':shop,'title':p['title'],'description':p['description'][:5000],
  'category':p['category'],'image_urls':p['images'][:12],'sku':'COURSE-'+p['id'],'name':'Mặc định',
  'price_vnd':prices[i],'stock':20,'source_asin':p['id']})
out=ROOT/'data/amazon-2023';(out/'course-products.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
literal=json.dumps(data,ensure_ascii=False).replace("'","''")
sql="""-- Course fixtures only. Review target database and shop IDs before executing.
-- Uses existing approved shops; never creates users, grants roles or resets stock.
-- VND prices and quantities are declared fixtures, not converted Amazon prices.
begin;
create temporary table course_seed_rows as
select * from jsonb_to_recordset('"""+literal+"""'::jsonb) as x(id uuid,variant_id uuid,shop_id uuid,title text,description text,category text,image_urls jsonb,sku text,name text,price_vnd bigint,stock integer);
do $$ begin
 if exists(select 1 from course_seed_rows r left join public.shops s on s.id=r.shop_id where s.id is null or s.status<>'active') then
   raise exception 'Course seed requires two existing approved shops'; end if;
end $$;
insert into commerce.products(id,shop_id,title,description,category,image_urls,status)
select id,shop_id,title,description,category,image_urls,'published' from course_seed_rows on conflict(id) do nothing;
insert into commerce.variants(id,product_id,sku,name,price_vnd)
select variant_id,id,sku,name,price_vnd from course_seed_rows on conflict(id) do nothing;
insert into commerce.inventory(variant_id,on_hand)
select variant_id,stock from course_seed_rows on conflict(variant_id) do nothing;
insert into commerce.inventory_movements(variant_id,delta,reason,actor,request_key)
select r.variant_id,r.stock,'Initial course fixture inventory',s.owner_user_id,r.variant_id from course_seed_rows r join public.shops s on s.id=r.shop_id
on conflict(actor,request_key) do nothing;
select private.commerce_enqueue(id) from course_seed_rows;
commit;
"""
(out/'course-seed.sql').write_text(sql)
print('Prepared 6 course products and SQL for review. No database changes. Files: data/amazon-2023/course-products.json, course-seed.sql')
