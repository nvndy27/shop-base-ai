-- Additive sales foundation. Recovery: disable sales entry point, forward-fix; never drop history.
begin;
create schema sales;
revoke all on schema sales from public, anon, authenticated;
create table sales.staff (
 user_id uuid primary key references auth.users(id) on delete restrict,
 role text not null check(role in ('manager','sales','warehouse')),
 is_active boolean not null default true
);
alter table sales.staff enable row level security;
create function sales.allowed(t text, writing boolean) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from sales.staff where user_id=auth.uid() and is_active
 and (role='manager' or not writing or (role='sales' and t='customers')))
$$;
create table sales.categories (id uuid primary key default gen_random_uuid(), code varchar(20) not null unique, name varchar(100) not null, description text,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table sales.categories enable row level security;
create policy staff_read on sales.categories for select to authenticated using(sales.allowed('categories',false));
create index categories_page on sales.categories(created_at,id);
create table sales.products (id uuid primary key default gen_random_uuid(), sku varchar(40) not null unique, category_id uuid not null references sales.categories(id) on delete restrict, name varchar(200) not null, description text, unit varchar(30) not null, current_price numeric(14,0) not null check(current_price>=0),
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table sales.products enable row level security;
create policy staff_read on sales.products for select to authenticated using(sales.allowed('products',false));
create index products_page on sales.products(created_at,id);
create table sales.customers (id uuid primary key default gen_random_uuid(), code varchar(30) not null unique, full_name varchar(150) not null, phone varchar(20) not null unique check(phone ~ '^\+84[1-9][0-9]{8}$'), email varchar(254), address varchar(300) not null,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table sales.customers enable row level security;
create policy staff_read on sales.customers for select to authenticated using(sales.allowed('customers',false));
create index customers_page on sales.customers(created_at,id);
create table sales.warehouses (id uuid primary key default gen_random_uuid(), code varchar(20) not null unique, name varchar(100) not null, address varchar(300) not null,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table sales.warehouses enable row level security;
create policy staff_read on sales.warehouses for select to authenticated using(sales.allowed('warehouses',false));
create index warehouses_page on sales.warehouses(created_at,id);
create index products_category on sales.products(category_id);
-- Defense in depth, including trusted SQL imports. API rejects decimals before numeric coercion.
create function sales.validate_row() returns trigger language plpgsql set search_path='' as $$
declare j jsonb=to_jsonb(new); k text; v text;
begin
 foreach k in array array['code','sku','name','full_name','address','unit','description','email','phone'] loop
  if not j ? k then continue; end if;
  v=j->>k;
  if k in ('code','sku') then
   v=upper(btrim(v));
   if v !~ '^[A-Z0-9][A-Z0-9_-]*$' or v='' then raise check_violation using message='INVALID_CODE'; end if;
  elsif k='phone' then
   if v !~ '^[+0-9 .-]+$' then raise check_violation using message='INVALID_PHONE'; end if;
   v=regexp_replace(v,'[ .-]','','g');
   if left(v,1)='0' then v='+84'||substr(v,2); end if;
  elsif k='email' then
   v=nullif(btrim(v),'');
   if v is not null then
    if v !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise check_violation using message='INVALID_EMAIL'; end if;
    v=split_part(v,'@',1)||'@'||lower(split_part(v,'@',2));
   end if;
  elsif k='description' then v=nullif(btrim(v),'');
  else
   v=btrim(regexp_replace(normalize(v,NFC),'[[:space:]]+',' ','g'));
   if v='' then raise check_violation using message='EMPTY_FIELD'; end if;
  end if;
  j=jsonb_set(j,array[k],coalesce(to_jsonb(v),'null'::jsonb));
 end loop;
 new=jsonb_populate_record(new,j);
 if tg_table_name='customers' and tg_op='UPDATE' and j->>'code' is distinct from to_jsonb(old)->>'code' then raise exception 'IMMUTABLE_CODE'; end if;
 if tg_table_name='products' then
  if tg_op='INSERT' or new.category_id is distinct from old.category_id then
   perform 1 from sales.categories where id=new.category_id and is_active for share;
   if not found then raise exception 'CATEGORY_INACTIVE'; end if;
  end if;
 end if;
 new.updated_at=clock_timestamp();
 return new;
end $$;
create trigger validate_row before insert or update on sales.categories for each row execute function sales.validate_row();
create trigger validate_row before insert or update on sales.products for each row execute function sales.validate_row();
create trigger validate_row before insert or update on sales.customers for each row execute function sales.validate_row();
create trigger validate_row before insert or update on sales.warehouses for each row execute function sales.validate_row();
create function public.sales_api(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t text=p_input->>'table'; op text=p_input->>'op'; d jsonb=coalesce(p_input->'data','{}');
 rid uuid=(p_input->>'id')::uuid; result jsonb; cols text; sets text; allowed text[]; page integer; size integer; fieldkey text; maxlen integer;
begin
 if t is null or t not in ('categories','products','customers','warehouses') then raise invalid_parameter_value; end if;
 if op is null or op not in ('list','get','create','update','active','delete') then raise invalid_parameter_value; end if;
 if not sales.allowed(t,op not in ('list','get')) then raise insufficient_privilege; end if;
 if op='list' then
  page=coalesce((d->>'page')::integer,1); size=coalesce((d->>'page_size')::integer,20);
  if page not between 1 and 100000 or size not between 1 and 100 then raise invalid_parameter_value; end if;
  execute format('select jsonb_build_object(''items'',coalesce(jsonb_agg(x),''[]''::jsonb),''page'',$1,''page_size'',$2) from (select * from sales.%I order by created_at,id limit $2 offset (($1-1)*$2)) x',t) into result using page,size;
  return result;
 end if;
 if op='get' then
  execute format('select to_jsonb(x) from sales.%I x where id=$1',t) into result using rid;
 elsif op='delete' then
  execute format('delete from sales.%I where id=$1 returning jsonb_build_object(''id'',id)',t) into result using rid;
 elsif op='active' then
  if d <> jsonb_build_object('is_active',(d->>'is_active')::boolean) then raise invalid_parameter_value; end if;
  execute format('update sales.%I set is_active=$2 where id=$1 returning to_jsonb(%I.*)',t,t) into result using rid,(d->>'is_active')::boolean;
 else
  allowed=case t when 'categories' then array['code','name','description'] when 'products' then array['sku','category_id','name','description','unit','current_price'] when 'customers' then array['code','full_name','phone','email','address'] else array['code','name','address'] end;
  if jsonb_typeof(d)<>'object' or exists(select 1 from jsonb_object_keys(d) k where not k=any(allowed)) then raise invalid_parameter_value; end if;
  foreach fieldkey in array allowed loop
   if d ? fieldkey and d->fieldkey <> 'null'::jsonb and fieldkey <> 'current_price' and jsonb_typeof(d->fieldkey)<>'string' then raise invalid_parameter_value; end if;
   maxlen=case fieldkey when 'code' then case when t='customers' then 30 else 20 end when 'sku' then 40 when 'name' then case when t='products' then 200 else 100 end when 'full_name' then 150 when 'unit' then 30 when 'address' then 300 when 'email' then 254 when 'phone' then 40 else null end;
   if maxlen is not null and char_length(d->>fieldkey)>maxlen then raise check_violation using message='FIELD_TOO_LONG'; end if;
  end loop;
  if t='products' then
   if jsonb_typeof(d->'current_price') is distinct from 'number' or (d->>'current_price')::numeric<0 or (d->>'current_price')::numeric>99999999999999 or trunc((d->>'current_price')::numeric)<>(d->>'current_price')::numeric then raise check_violation using message='INVALID_PRICE'; end if;
  end if;
  select string_agg(format('%I',k),','),string_agg(format('%I=r.%I',k,k),',') into cols,sets from unnest(allowed) k;
  if op='create' then
   execute format('insert into sales.%I (%s) select %s from jsonb_populate_record(null::sales.%I,$1) returning to_jsonb(%I.*)',t,cols,cols,t,t) into result using d;
  else
   execute format('update sales.%I x set %s from jsonb_populate_record(null::sales.%I,$1) r where x.id=$2 returning to_jsonb(x)',t,sets,t) into result using d,rid;
  end if;
 end if;
 if result is null then raise no_data_found; end if;
 return result;
end $$;
revoke all on all tables in schema sales from public,anon,authenticated;
revoke all on all functions in schema sales from public,anon,authenticated;
revoke all on function public.sales_api(jsonb) from public,anon,authenticated,service_role;
grant usage on schema sales to authenticated;
grant select on sales.categories,sales.products,sales.customers,sales.warehouses to authenticated;
grant execute on function sales.allowed(text,boolean) to authenticated;
grant execute on function public.sales_api(jsonb) to authenticated;
commit;
