-- Non-destructive verification of an already-applied M1 migration.
-- Uses the actual anon/authenticated PostgreSQL roles, not service_role.
-- No fixtures, user creation, grants or persistent data changes.
-- Expected-deny RPC probes run in a transaction that is always rolled back.
begin;

do $verification$
declare
  v_count integer;
  v_rpc regprocedure;
begin
  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and c.relrowsecurity
    and (n.nspname || '.' || c.relname) = any(array[
      'public.profiles', 'public.user_roles', 'public.addresses',
      'public.shops', 'public.shop_members', 'private.audit_logs'
    ]);
  if v_count <> 6 then
    raise exception 'M1 verification: expected six RLS-enabled tables';
  end if;

  if not exists (
    select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'addresses_one_default_idx'
      and i.indisunique and i.indpred is not null
  ) then
    raise exception 'M1 verification: default-address unique partial index missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'auth.users'::regclass and tgname = 'auth_user_profile'
      and not tgisinternal and tgenabled <> 'D'
  ) then
    raise exception 'M1 verification: Auth profile trigger missing or disabled';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'status', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'user_id', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
     or has_table_privilege('authenticated', 'public.shops', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.shop_members', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.user_roles', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.addresses', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'private.audit_logs', 'INSERT,UPDATE,DELETE') then
    raise exception 'M1 verification: unexpected direct mutation privileges';
  end if;
  if has_function_privilege('authenticated', 'private.require_active()', 'EXECUTE')
     or has_function_privilege('anon', 'private.is_active()', 'EXECUTE')
     or has_schema_privilege('anon', 'private', 'USAGE') then
    raise exception 'M1 verification: internal helper/schema privilege leak';
  end if;
  for v_rpc in
    select unnest(array[
      'public.create_address(jsonb)'::regprocedure,
      'public.update_address(uuid,jsonb)'::regprocedure,
      'public.delete_address(uuid)'::regprocedure,
      'public.apply_for_shop(text,text)'::regprocedure,
      'public.decide_shop(uuid,text,text,uuid)'::regprocedure
    ])
  loop
    if has_function_privilege('anon', v_rpc, 'EXECUTE')
       or not has_function_privilege('authenticated', v_rpc, 'EXECUTE') then
      raise exception 'M1 verification: unexpected RPC privileges for %', v_rpc;
    end if;
  end loop;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not coalesce('search_path=""' = any(p.proconfig), false)
  ) then
    raise exception 'M1 verification: SECURITY DEFINER without fixed search_path';
  end if;

  -- Both claims settings are cleared; no trusted user subject is forged.
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  begin
    execute 'select count(*) from public.profiles';
    raise exception 'M1 verification: anon unexpectedly read private profiles';
  exception when insufficient_privilege then
    null;
  end;
  begin
    execute 'select public.create_address(''{}''::jsonb)';
    raise exception 'M1 verification: anon unexpectedly executed mutation RPC';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  execute 'select count(*) from public.profiles' into v_count;
  if v_count <> 0 then
    raise exception 'M1 verification: subjectless session read profiles';
  end if;
  execute 'select count(*) from public.addresses' into v_count;
  if v_count <> 0 then
    raise exception 'M1 verification: subjectless session read addresses';
  end if;
  execute 'select count(*) from public.shops' into v_count;
  if v_count <> 0 then
    raise exception 'M1 verification: subjectless session read shops';
  end if;
  begin
    execute 'select public.create_address(''{}''::jsonb)';
    raise exception 'M1 verification: subjectless session executed mutation RPC';
  exception when insufficient_privilege then
    null;
  end;
  begin
    execute 'select private.require_active()';
    raise exception 'M1 verification: user executed internal mutation helper';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
end;
$verification$;

rollback;

-- This result is reached only if all preceding assertions passed.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count,
  'PASS: M1 schema / grants / anon and subjectless deny checks' as verification
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and (n.nspname || '.' || c.relname) = any(array[
  'public.profiles', 'public.user_roles', 'public.addresses',
  'public.shops', 'public.shop_members', 'private.audit_logs'
])
order by n.nspname, c.relname;
