-- Persistent buyer/shop chat: schema, derived membership, read state, text messages.
-- Additive; not applied by this file. Recovery: stop routing /api/v1/chat, forward-fix.
-- Dropping chat.messages destroys conversation history; never roll back that way.
--
-- Slice 1 scope: text-only messages, one conversation per (buyer, shop).
-- Attachments, reports and blocks are later slices and extend private.can_post_conversation.
--
-- Membership is DERIVED, never materialized: a caller is a member when they are the
-- conversation buyer or an active shop member whose role reads orders (owner/fulfillment).
-- Revoking shop_members.active therefore cuts read and write in the same transaction, with
-- no sync trigger to drift. Shop status gates posting only, never reading: a suspended or
-- closed shop keeps its history visible to both sides.
--
-- Column grants deliberately omit conversations.buyer_id and messages.sender_id so a seller
-- can never read a buyer's user id through PostgREST. Every DTO carries `mine` instead.
begin;
create schema chat;
revoke all on schema chat from public, anon, authenticated;
grant usage on schema chat to authenticated;

create table chat.conversations (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(user_id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete restrict,
  context_product_id uuid references commerce.products(id) on delete set null,
  context_order_id uuid references commerce.orders(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (buyer_id, shop_id)
);
create index conversations_buyer_idx on chat.conversations(buyer_id, last_message_at desc, id desc);
create index conversations_shop_idx on chat.conversations(shop_id, last_message_at desc, id desc);

create table chat.messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  conversation_id uuid not null references chat.conversations(id) on delete restrict,
  sender_id uuid not null references public.profiles(user_id) on delete restrict,
  kind text not null default 'text' check (kind in ('text')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  client_message_id uuid not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, sender_id, client_message_id)
);
create index messages_conversation_idx on chat.messages(conversation_id, seq desc);

-- Read cursor only. Absence of a row means "never read" (last_read_seq 0).
create table chat.conversation_members (
  conversation_id uuid not null references chat.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  last_read_seq bigint not null default 0 check (last_read_seq >= 0),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on chat.conversation_members(user_id, conversation_id);

alter table chat.conversations enable row level security;
alter table chat.messages enable row level security;
alter table chat.conversation_members enable row level security;

-- Input coercion helpers. Malformed input is INVALID_INPUT (22023), never a raw cast error.
create function private.chat_uuid(p_value jsonb) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  if p_value is null then return null; end if;
  if jsonb_typeof(p_value) <> 'string'
     or p_value #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  return (p_value #>> '{}')::uuid;
end $$;
create function private.chat_int(p_value jsonb, p_min integer, p_max integer, p_default integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare v_text text;
begin
  if p_value is null then return p_default; end if;
  if jsonb_typeof(p_value) <> 'number' then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  v_text := p_value::text;
  if v_text !~ '^[0-9]{1,9}$' or v_text::integer not between p_min and p_max then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  return v_text::integer;
end $$;
create function private.chat_seq(p_value jsonb) returns bigint
language plpgsql immutable set search_path = '' as $$
begin
  if p_value is null then return null; end if;
  if jsonb_typeof(p_value) <> 'number' or p_value::text !~ '^[0-9]{1,18}$' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  return (p_value::text)::bigint;
end $$;

-- Shop-side read predicate: the orders:read row of private.has_shop_permission, deliberately
-- WITHOUT the shop-status gate, because chat history must stay readable after a shop is
-- suspended or closed. Keep this role list in sync with the matrix in migration 001.
create function private.is_shop_chat_member(p_shop_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active() and exists (
    select 1 from public.shop_members m
    where m.shop_id = p_shop_id and m.user_id = auth.uid() and m.active
      and m.role = any (array['owner', 'fulfillment'])
  );
$$;

-- Read predicate. Shop status is not part of it: history stays readable after a
-- suspension or closure, only posting is gated by can_post_conversation.
create function private.is_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active() and exists (
    select 1 from chat.conversations c
    where c.id = p_conversation_id
      and (c.buyer_id = auth.uid() or private.is_shop_chat_member(c.shop_id))
  );
$$;

-- Write predicate. Slice 2 (blocks) and slice 3 (attachments) extend this, not the policies.
create function private.can_post_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_conversation_member(p_conversation_id) and exists (
    select 1 from chat.conversations c join public.shops s on s.id = c.shop_id
    where c.id = p_conversation_id and s.status in ('active', 'suspended')
  );
$$;

create policy conversations_read_member on chat.conversations for select to authenticated
  using (private.is_conversation_member(id));
create policy messages_read_member on chat.messages for select to authenticated
  using (private.is_conversation_member(conversation_id));
create policy conversation_members_read_self on chat.conversation_members for select to authenticated
  using (user_id = auth.uid() and private.is_active());
-- No insert/update/delete policies and no DML grants: public.chat is the only write path.

revoke all on chat.conversations, chat.messages, chat.conversation_members from public, anon, authenticated;
grant select (id, shop_id, context_product_id, context_order_id, last_message_at, created_at) on chat.conversations to authenticated;
grant select (id, seq, conversation_id, kind, body, client_message_id, created_at) on chat.messages to authenticated;
grant select (conversation_id, user_id, last_read_seq, joined_at) on chat.conversation_members to authenticated;

-- p_actor is always the trusted auth.uid(); the viewer-specific fields (`mine`,
-- `counterpart_name`) are resolved here so no buyer identifier reaches the client.
create function private.chat_conversation_dto(p_id uuid, p_actor uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'shop_id', c.shop_id, 'shop_name', s.name, 'shop_slug', s.slug,
    'counterpart_name', case when c.buyer_id = p_actor then s.name
      else coalesce(nullif(btrim(b.display_name), ''), 'Người mua') end,
    'context_product_id', c.context_product_id, 'context_order_id', c.context_order_id,
    'last_message_at', c.last_message_at, 'created_at', c.created_at,
    'unread_count', (select count(*) from chat.messages m
      where m.conversation_id = c.id and m.seq > coalesce(cm.last_read_seq, 0) and m.sender_id <> p_actor),
    'last_message', (select jsonb_build_object('kind', m.kind, 'body', m.body,
        'mine', m.sender_id = p_actor, 'created_at', m.created_at)
      from chat.messages m where m.conversation_id = c.id order by m.seq desc limit 1)
  )
  from chat.conversations c
  join public.shops s on s.id = c.shop_id
  join public.profiles b on b.user_id = c.buyer_id
  left join chat.conversation_members cm on cm.conversation_id = c.id and cm.user_id = p_actor
  where c.id = p_id
$$;

create function private.chat_conversation_list(p_actor uuid, p_limit integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.chat_conversation_dto(x.id, p_actor) order by x.last_message_at desc, x.id desc), '[]')
  from (
    select c.id, c.last_message_at from chat.conversations c
    where c.buyer_id = p_actor or private.is_shop_chat_member(c.shop_id)
    order by c.last_message_at desc, c.id desc limit p_limit
  ) x;
$$;

-- Newest-first window ending just before p_before_seq, re-sorted ascending for the client.
create function private.chat_messages(p_actor uuid, p_conversation_id uuid, p_before_seq bigint, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_items jsonb; v_min bigint;
begin
  select coalesce(jsonb_agg(x.dto order by x.seq), '[]'), min(x.seq) into v_items, v_min from (
    select m.seq, jsonb_build_object('id', m.id, 'sequence', m.seq, 'kind', m.kind, 'body', m.body,
      'mine', m.sender_id = p_actor, 'client_message_id', m.client_message_id, 'created_at', m.created_at) dto
    from chat.messages m
    where m.conversation_id = p_conversation_id and (p_before_seq is null or m.seq < p_before_seq)
    order by m.seq desc limit p_limit
  ) x;
  return jsonb_build_object('items', v_items, 'has_more',
    v_min is not null and exists (select 1 from chat.messages m where m.conversation_id = p_conversation_id and m.seq < v_min));
end $$;

-- Only this dispatcher is executable by buyers/sellers. The actor comes from auth.uid();
-- membership, shop state and idempotency are rechecked inside the transaction.
create function public.chat(p_op text, p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; cid uuid; sid uuid; pid uuid; oid uuid; mid uuid; cmid uuid;
  v_body text; v_seq bigint; v_before bigint; v_read bigint; v_created timestamptz; v_limit integer;
begin
  if p_input is null or octet_length(p_input::text) > 16384 then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  v_actor := private.require_active();

  if p_op = 'conversations' then
    perform private.commerce_keys(p_input, array['limit'], array[]::text[]);
    v_limit := private.chat_int(p_input -> 'limit', 1, 100, 50);
    return jsonb_build_object('items', private.chat_conversation_list(v_actor, v_limit));

  elsif p_op = 'conversation_open' then
    -- Buyer-initiated only. A shop replies inside an existing conversation.
    perform private.commerce_keys(p_input, array['shop_id', 'context_product_id', 'context_order_id'], array['shop_id']);
    sid := private.chat_uuid(p_input -> 'shop_id');
    pid := private.chat_uuid(p_input -> 'context_product_id');
    oid := private.chat_uuid(p_input -> 'context_order_id');
    perform id from public.shops where id = sid and status = 'active' for share;
    if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
    -- A shop cannot open a conversation against itself; members are the shop side, not a buyer.
    if exists (select 1 from public.shop_members m where m.shop_id = sid and m.user_id = v_actor and m.active)
       or exists (select 1 from public.shops s where s.id = sid and s.owner_user_id = v_actor) then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
    if pid is not null and not exists (select 1 from commerce.products where id = pid and shop_id = sid and status = 'published') then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
    if oid is not null and not exists (
      select 1 from commerce.orders o join commerce.shop_orders so on so.order_id = o.id
      where o.id = oid and o.buyer_id = v_actor and so.shop_id = sid) then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
    insert into chat.conversations(buyer_id, shop_id, context_product_id, context_order_id)
    values (v_actor, sid, pid, oid)
    on conflict (buyer_id, shop_id) do update set
      context_product_id = coalesce(excluded.context_product_id, chat.conversations.context_product_id),
      context_order_id = coalesce(excluded.context_order_id, chat.conversations.context_order_id)
    returning id into cid;
    insert into chat.conversation_members(conversation_id, user_id) values (cid, v_actor) on conflict do nothing;
    return jsonb_build_object('conversation', private.chat_conversation_dto(cid, v_actor));

  elsif p_op = 'messages' then
    perform private.commerce_keys(p_input, array['conversation_id', 'before_seq', 'limit'], array['conversation_id']);
    cid := private.chat_uuid(p_input -> 'conversation_id');
    v_before := private.chat_seq(p_input -> 'before_seq');
    v_limit := private.chat_int(p_input -> 'limit', 1, 100, 30);
    if not private.is_conversation_member(cid) then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
    return private.chat_messages(v_actor, cid, v_before, v_limit);

  elsif p_op = 'message_send' then
    perform private.commerce_keys(p_input, array['conversation_id', 'body', 'client_message_id'], array['conversation_id', 'body', 'client_message_id']);
    cid := private.chat_uuid(p_input -> 'conversation_id');
    cmid := private.chat_uuid(p_input -> 'client_message_id');
    -- ->> on a JSON object/array returns its text form, so a direct RPC call could store
    -- '{"a":1}' as the message body. BFF validation is not a security boundary.
    if jsonb_typeof(p_input -> 'body') <> 'string' then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
    v_body := btrim(p_input ->> 'body');
    if char_length(v_body) not between 1 and 2000 then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
    if not private.can_post_conversation(cid) then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
    -- A retried client_message_id returns the stored row instead of duplicating it.
    insert into chat.messages(conversation_id, sender_id, kind, body, client_message_id)
    values (cid, v_actor, 'text', v_body, cmid)
    on conflict (conversation_id, sender_id, client_message_id) do nothing
    returning id, seq, created_at into mid, v_seq, v_created;
    if mid is null then
      select m.id, m.seq, m.created_at, m.body into mid, v_seq, v_created, v_body
      from chat.messages m
      where m.conversation_id = cid and m.sender_id = v_actor and m.client_message_id = cmid;
    end if;
    update chat.conversations set last_message_at = greatest(last_message_at, v_created) where id = cid;
    return jsonb_build_object('message', jsonb_build_object('id', mid, 'sequence', v_seq, 'kind', 'text',
      'body', v_body, 'mine', true, 'client_message_id', cmid, 'created_at', v_created));

  elsif p_op = 'conversation_read' then
    perform private.commerce_keys(p_input, array['conversation_id', 'up_to_seq'], array['conversation_id', 'up_to_seq']);
    cid := private.chat_uuid(p_input -> 'conversation_id');
    v_read := private.chat_seq(p_input -> 'up_to_seq');
    if v_read is null then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
    if not private.is_conversation_member(cid) then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
    -- Clamp so a client cannot mark unread future messages as read.
    v_read := least(v_read, coalesce((select max(m.seq) from chat.messages m where m.conversation_id = cid), 0));
    insert into chat.conversation_members(conversation_id, user_id, last_read_seq) values (cid, v_actor, v_read)
    on conflict (conversation_id, user_id) do update set last_read_seq = greatest(chat.conversation_members.last_read_seq, excluded.last_read_seq);
    return jsonb_build_object('ok', true);
  end if;

  raise exception using errcode = '22023', message = 'INVALID_OPERATION';
end $$;

revoke all on function public.chat(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.chat(text, jsonb) to authenticated;
-- RLS policy expressions run with the privileges of the role that queries the table, so
-- authenticated needs EXECUTE on the predicate its policies call. It only ever answers
-- "is the caller themself a member", so it leaks nothing.
revoke all on function private.is_conversation_member(uuid) from public, anon, service_role;
grant execute on function private.is_conversation_member(uuid) to authenticated;
revoke all on function private.chat_uuid(jsonb), private.chat_int(jsonb, integer, integer, integer), private.chat_seq(jsonb),
  private.is_shop_chat_member(uuid), private.can_post_conversation(uuid), private.chat_conversation_dto(uuid, uuid),
  private.chat_conversation_list(uuid, integer), private.chat_messages(uuid, uuid, bigint, integer)
  from public, anon, authenticated, service_role;
commit;
