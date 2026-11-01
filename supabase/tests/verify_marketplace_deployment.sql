-- Read-only checks on the deployed database. No fixtures, repairs or credential output.
begin;
do $verification$
declare relation regclass;
begin
  foreach relation in array array[
    'commerce.products'::regclass,'commerce.variants'::regclass,'commerce.inventory'::regclass,
    'commerce.cart_items'::regclass,'commerce.quotes'::regclass,'commerce.orders'::regclass,
    'commerce.shop_orders'::regclass,'commerce.order_items'::regclass,
    'commerce.reservations'::regclass,'commerce.assets'::regclass,'commerce.outbox'::regclass
  ] loop
    if not (select relrowsecurity from pg_class where oid=relation) then
      raise exception 'Marketplace verification: RLS disabled';
    end if;
    if has_any_column_privilege('authenticated',relation,'INSERT,UPDATE')
       or has_table_privilege('authenticated',relation,'DELETE,TRUNCATE')
       or has_any_column_privilege('anon',relation,'SELECT,INSERT,UPDATE')
       or has_table_privilege('anon',relation,'DELETE,TRUNCATE') then
      raise exception 'Marketplace verification: direct privilege leak';
    end if;
  end loop;
  if not has_function_privilege('authenticated','public.marketplace(text,jsonb)','EXECUTE')
     or not has_function_privilege('anon','public.marketplace(text,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.marketplace_worker(text,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.marketplace_worker(text,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.marketplace_worker(text,jsonb)','EXECUTE') then
    raise exception 'Marketplace verification: dispatcher/worker grants invalid';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='private' and p.proname like 'commerce_%'
      and (has_function_privilege('authenticated',p.oid,'EXECUTE')
        or (p.prosecdef and not coalesce('search_path=""'=any(p.proconfig),false)))) then
    raise exception 'Marketplace verification: internal helper privilege leak';
  end if;
  if position('IDENTITY_UNVERIFIED' in pg_get_functiondef('public.marketplace(text,jsonb)'::regprocedure))=0
     or position('PHONE_REQUIRED' in pg_get_functiondef('public.marketplace(text,jsonb)'::regprocedure))>0 then
    raise exception 'Marketplace verification: email COD migration missing';
  end if;
  if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass
      and polname='course_images_server_only' and not polpermissive)
     or not exists(select 1 from storage.buckets where id='course-product-images'
       and public and file_size_limit=2097152 and allowed_mime_types=array['image/webp']) then
    raise exception 'Marketplace verification: Storage limits/policy missing';
  end if;
end $verification$;
rollback;
select 'PASS: marketplace RLS, grants, worker, email COD and Storage deployment' as verification;
