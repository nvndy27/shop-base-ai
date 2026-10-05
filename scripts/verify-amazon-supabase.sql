-- Read-only verification for the imported academic catalog. No persistent writes.
begin;
do $verify$
declare
  role_name text;
  denied boolean;
begin
  if (select count(*) from catalog_import.products) <> 20000 then
    raise exception 'Expected 20000 products';
  end if;
  if (select count(price_usd) from catalog_import.products) <> 7803 then
    raise exception 'Price count differs from source';
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='catalog_import' and c.relname in ('datasets','products') and c.relrowsecurity) <> 2 then
    raise exception 'Expected RLS on both catalog tables';
  end if;
  foreach role_name in array array['anon','authenticated'] loop
    denied := false;
    begin
      execute format('set local role %I', role_name);
      perform 1 from catalog_import.products limit 1;
    exception when insufficient_privilege then
      denied := true;
    end;
    reset role;
    if not denied then raise exception 'Unexpected access for %', role_name; end if;
  end loop;
  set local role service_role;
  perform 1 from catalog_import.products limit 1;
  reset role;
  if has_table_privilege('service_role','catalog_import.products','INSERT,UPDATE,DELETE') then
    raise exception 'Service role must only read catalog fixtures';
  end if;
end;
$verify$;
rollback;
select category_name_vi as category, count(*) as products, count(price_usd) as with_price,
       (select count(*) from catalog_import.products) as total_products,
       pg_size_pretty(pg_total_relation_size('catalog_import.products')) as catalog_size,
       pg_size_pretty(pg_database_size(current_database())) as database_size,
       'PASS: RLS, anon/authenticated deny, service_role read only' as permissions
from catalog_import.products group by category_name_vi order by category_name_vi;
