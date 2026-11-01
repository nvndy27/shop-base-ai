-- Read-only deployment checks. Run after the dependency migrations on isolated dev.
-- Does not create fixtures or repair migration history; JWT A/B acceptance is separate.
begin;
do $verification$
declare
  v_table regclass;
  v_count bigint;
begin
  if to_regclass('commerce.products') is null or to_regclass('commerce.orders') is null
     or to_regclass('catalog_import.products') is null then
    raise exception 'Chat verification: dependency schemas missing';
  end if;
  if not exists (select 1 from storage.buckets where id = 'course-product-images'
      and public and allowed_mime_types = array['image/webp']::text[]) then
    raise exception 'Chat verification: product Storage dependency missing';
  end if;
  foreach v_table in array array[
    'chat.conversations'::regclass, 'chat.messages'::regclass, 'chat.conversation_members'::regclass
  ] loop
    if not (select relrowsecurity from pg_class where oid = v_table) then
      raise exception 'Chat verification: RLS disabled on %', v_table;
    end if;
    if has_any_column_privilege('authenticated', v_table, 'INSERT,UPDATE')
       or has_table_privilege('authenticated', v_table, 'DELETE,TRUNCATE')
       or has_any_column_privilege('anon', v_table, 'SELECT,INSERT,UPDATE')
       or has_table_privilege('anon', v_table, 'DELETE,TRUNCATE') then
      raise exception 'Chat verification: direct privilege leak on %', v_table;
    end if;
  end loop;
  if has_column_privilege('authenticated', 'chat.conversations', 'buyer_id', 'SELECT')
     or has_column_privilege('authenticated', 'chat.messages', 'sender_id', 'SELECT') then
    raise exception 'Chat verification: private identity columns exposed';
  end if;
  if not has_function_privilege('authenticated', 'public.chat(text,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.chat(text,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'private.is_conversation_member(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.can_post_conversation(uuid)', 'EXECUTE') then
    raise exception 'Chat verification: unexpected RPC/predicate privileges';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'chat.messages'::regclass
      and contype = 'u' and conkey = array[
        (select attnum from pg_attribute where attrelid = 'chat.messages'::regclass and attname = 'conversation_id'),
        (select attnum from pg_attribute where attrelid = 'chat.messages'::regclass and attname = 'sender_id'),
        (select attnum from pg_attribute where attrelid = 'chat.messages'::regclass and attname = 'client_message_id')
      ]::smallint[]) then
    raise exception 'Chat verification: retry uniqueness constraint missing';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.chat(text,jsonb)'::regprocedure
      and prosecdef and coalesce('search_path=""' = any(proconfig), false)) then
    raise exception 'Chat verification: dispatcher security settings incorrect';
  end if;
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  begin
    execute 'select public.chat(''conversations'')';
    raise exception 'Chat verification: anonymous RPC unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  execute 'set local role authenticated';
  foreach v_table in array array[
    'chat.conversations'::regclass, 'chat.messages'::regclass, 'chat.conversation_members'::regclass
  ] loop
    execute format('select count(*) from %s', v_table) into v_count;
    if v_count <> 0 then raise exception 'Chat verification: subjectless row leak'; end if;
  end loop;
  begin
    execute 'select public.chat(''conversations'')';
    raise exception 'Chat verification: subjectless RPC unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$verification$;
rollback;
select 'PASS: chat deployment schema, grants and subjectless deny; JWT A/B still required' as verification;
