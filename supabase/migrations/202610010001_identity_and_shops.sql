-- M1: identity, addresses, shop applications and scoped shop permissions.
-- Additive migration. No existing migration or production data is modified.
-- Rollback: stop routing M1 traffic and forward-fix; do not drop identity/audit data.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null default '' check (char_length(display_name) <= 100),
  status text not null default 'active' check (status in ('active', 'banned', 'closed')),
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  permission text not null check (permission in ('shops:moderate', 'users:manage', 'audit:read', 'finance:refund')),
  granted_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, permission)
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  recipient_name text not null check (char_length(btrim(recipient_name)) between 1 and 100),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  address_line text not null check (char_length(btrim(address_line)) between 1 and 300),
  ward text not null check (char_length(btrim(ward)) between 1 and 100),
  district text not null check (char_length(btrim(district)) between 1 and 100),
  province text not null check (char_length(btrim(province)) between 1 and 100),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_user_created_idx on public.addresses(user_id, created_at, id);
create unique index addresses_one_default_idx on public.addresses(user_id) where is_default;

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(user_id) on delete restrict,
  slug text not null unique check (char_length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'suspended', 'closed')),
  moderation_reason text,
  created_at timestamptz not null default now()
);
create index shops_owner_idx on public.shops(owner_user_id);

create table public.shop_members (
  shop_id uuid not null references public.shops(id) on delete restrict,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  role text not null check (role in ('owner', 'catalog', 'fulfillment')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index shop_members_user_idx on public.shop_members(user_id, shop_id) where active;

create table private.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references public.profiles(user_id) on delete restrict,
  action text not null,
  resource_id uuid not null,
  before_data jsonb not null,
  after_data jsonb not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  request_id uuid not null,
  created_at timestamptz not null default now()
);
create index audit_logs_resource_idx on private.audit_logs(resource_id, created_at);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.addresses enable row level security;
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table private.audit_logs enable row level security;

-- Trusted Auth hook. Never derive privileges or status from raw_user_meta_data.
create function private.create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id) values (new.id);
  return new;
end;
$$;
create trigger auth_user_profile after insert on auth.users
  for each row execute function private.create_profile();
-- Also cover users that existed before applying this migration.
insert into public.profiles(user_id) select id from auth.users on conflict (user_id) do nothing;

create function private.is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.user_id = auth.uid() and p.status = 'active'
  );
$$;

create function private.has_permission(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active() and exists (
    select 1 from public.user_roles r where r.user_id = auth.uid() and r.permission = p_permission
  );
$$;

create function private.is_shop_member(p_shop_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active() and exists (
    select 1 from public.shop_members m
    where m.shop_id = p_shop_id and m.user_id = auth.uid() and m.active
  );
$$;

-- Resource-specific predicate for subsequent catalog/order RPCs and RLS.
-- This returns only a boolean, never another member's identity or private data.
create function private.has_shop_permission(p_shop_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active() and exists (
    select 1 from public.shop_members m join public.shops s on s.id = m.shop_id
    where m.shop_id = p_shop_id and m.user_id = auth.uid() and m.active
    and (s.status = 'active' or (
      s.status = 'suspended' and p_permission in ('orders:read', 'orders:transition')
    ))
    and case m.role
      when 'owner' then p_permission = any(array['catalog:write', 'inventory:adjust', 'orders:read', 'orders:transition'])
      when 'catalog' then p_permission = any(array['catalog:write', 'inventory:adjust'])
      when 'fulfillment' then p_permission = any(array['orders:read', 'orders:transition'])
      else false
    end
  );
$$;

-- Serializes per-user mutations, including concurrent default-address changes.
-- A ban transaction cannot race a write that has already acquired this row lock.
create function private.require_active()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
begin
  select status into v_status from public.profiles where user_id = v_actor for update;
  if v_actor is null or v_status is distinct from 'active' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return v_actor;
end;
$$;

create policy profiles_read_self on public.profiles for select to authenticated
  using (user_id = auth.uid() and private.is_active());
create policy profiles_update_self on public.profiles for update to authenticated
  using (user_id = auth.uid() and private.is_active())
  with check (user_id = auth.uid() and status = 'active');
create policy roles_read_self on public.user_roles for select to authenticated
  using (user_id = auth.uid() and private.is_active());
create policy addresses_read_self on public.addresses for select to authenticated
  using (user_id = auth.uid() and private.is_active());
-- Write policies also enforce scope if column grants are ever deliberately expanded.
-- No direct DML grants exist; atomic RPCs below are the current write path.
create policy addresses_insert_self on public.addresses for insert to authenticated
  with check (user_id = auth.uid() and private.is_active());
create policy addresses_update_self on public.addresses for update to authenticated
  using (user_id = auth.uid() and private.is_active())
  with check (user_id = auth.uid() and private.is_active());
create policy addresses_delete_self on public.addresses for delete to authenticated
  using (user_id = auth.uid() and private.is_active());
create policy shops_read_scoped on public.shops for select to authenticated
  using (private.is_shop_member(id) or private.has_permission('shops:moderate'));
create policy members_read_self on public.shop_members for select to authenticated
  using (user_id = auth.uid() and private.is_active());
create policy audit_read_auditor on private.audit_logs for select to authenticated
  using (private.has_permission('audit:read'));

revoke all on public.profiles, public.user_roles, public.addresses,
  public.shops, public.shop_members, private.audit_logs from public, anon, authenticated;
grant select (user_id, display_name, status) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.addresses to authenticated;
grant select (user_id, permission) on public.user_roles to authenticated;
grant select (id, name, slug, status) on public.shops to authenticated;
grant select (shop_id, user_id, role, active) on public.shop_members to authenticated;
grant select on private.audit_logs to authenticated;

create function private.address_dto(p_address public.addresses)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_address.id, 'recipient_name', p_address.recipient_name,
    'phone', p_address.phone, 'address_line', p_address.address_line,
    'ward', p_address.ward, 'district', p_address.district,
    'province', p_address.province, 'is_default', p_address.is_default
  );
$$;
create function private.shop_dto(p_shop public.shops)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', p_shop.id, 'name', p_shop.name, 'slug', p_shop.slug, 'status', p_shop.status);
$$;

create function private.validate_address_input(p_input jsonb, p_partial boolean)
returns void language plpgsql set search_path = '' as $$
declare
  v_key text;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' or p_input = '{}'::jsonb then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  for v_key in select jsonb_object_keys(p_input) loop
    if v_key not in ('recipient_name', 'phone', 'address_line', 'ward', 'district', 'province', 'is_default')
       or jsonb_typeof(p_input -> v_key) is distinct from
         (case when v_key = 'is_default' then 'boolean' else 'string' end) then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
  end loop;
  if not p_partial and not p_input ?& array['recipient_name', 'phone', 'address_line', 'ward', 'district', 'province'] then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
end;
$$;

create function public.create_address(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.require_active();
  v_row public.addresses;
begin
  perform private.validate_address_input(p_input, false);
  if coalesce((p_input ->> 'is_default')::boolean, false) then
    update public.addresses set is_default = false where user_id = v_actor and is_default;
  end if;
  insert into public.addresses(user_id, recipient_name, phone, address_line, ward, district, province, is_default)
  values (
    v_actor, btrim(p_input ->> 'recipient_name'), p_input ->> 'phone',
    btrim(p_input ->> 'address_line'), btrim(p_input ->> 'ward'),
    btrim(p_input ->> 'district'), btrim(p_input ->> 'province'),
    coalesce((p_input ->> 'is_default')::boolean, false)
  ) returning * into v_row;
  return private.address_dto(v_row);
end;
$$;

create function public.update_address(p_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.require_active();
  v_row public.addresses;
begin
  perform private.validate_address_input(p_input, true);
  select * into v_row from public.addresses where id = p_id and user_id = v_actor for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  if coalesce((p_input ->> 'is_default')::boolean, false) then
    update public.addresses set is_default = false where user_id = v_actor and id <> p_id and is_default;
  end if;
  update public.addresses set
    recipient_name = coalesce(btrim(p_input ->> 'recipient_name'), recipient_name),
    phone = coalesce(p_input ->> 'phone', phone),
    address_line = coalesce(btrim(p_input ->> 'address_line'), address_line),
    ward = coalesce(btrim(p_input ->> 'ward'), ward),
    district = coalesce(btrim(p_input ->> 'district'), district),
    province = coalesce(btrim(p_input ->> 'province'), province),
    is_default = coalesce((p_input ->> 'is_default')::boolean, is_default)
  where id = p_id and user_id = v_actor returning * into v_row;
  return private.address_dto(v_row);
end;
$$;

create function public.delete_address(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.require_active();
begin
  delete from public.addresses where id = p_id and user_id = v_actor;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
end;
$$;

create function public.apply_for_shop(p_name text, p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.require_active();
  v_shop public.shops;
begin
  -- Auth's confirmation timestamps are trusted; user_metadata is not.
  if not exists (
    select 1 from auth.users u where u.id = v_actor
    and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  ) then raise exception using errcode = '42501', message = 'IDENTITY_UNVERIFIED'; end if;
  insert into public.shops(owner_user_id, name, slug)
    values (v_actor, btrim(p_name), p_slug) returning * into v_shop;
  insert into public.shop_members(shop_id, user_id, role) values (v_shop.id, v_actor, 'owner');
  return private.shop_dto(v_shop);
end;
$$;

create function public.decide_shop(p_id uuid, p_decision text, p_reason text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.require_active();
  v_shop public.shops;
  v_before text;
begin
  if not private.has_permission('shops:moderate') or
     (auth.jwt() ->> 'aal') is distinct from 'aal2' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_decision is null or p_decision not in ('active', 'rejected', 'suspended', 'closed')
     or p_reason is null or char_length(btrim(p_reason)) not between 3 and 500
     or p_request_id is null then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  -- Do not allow moderators to approve their own shop application.
  select * into v_shop from public.shops where id = p_id and owner_user_id <> v_actor for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  v_before := v_shop.status;
  if not (
    (v_before = 'pending' and p_decision in ('active', 'rejected')) or
    (v_before = 'active' and p_decision in ('suspended', 'closed')) or
    (v_before = 'suspended' and p_decision in ('active', 'closed'))
  ) then raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION'; end if;
  update public.shops set status = p_decision, moderation_reason = btrim(p_reason)
    where id = p_id returning * into v_shop;
  insert into private.audit_logs(actor, action, resource_id, before_data, after_data, reason, request_id)
    values (v_actor, 'shop.decision', p_id, jsonb_build_object('status', v_before),
      jsonb_build_object('status', p_decision), btrim(p_reason), p_request_id);
  return private.shop_dto(v_shop);
end;
$$;

-- SECURITY DEFINER entry points are never implicitly executable by PUBLIC/anon.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_active(), private.has_permission(text),
  private.is_shop_member(uuid), private.has_shop_permission(uuid, text) to authenticated;
revoke all on function public.create_address(jsonb), public.update_address(uuid, jsonb),
  public.delete_address(uuid), public.apply_for_shop(text, text),
  public.decide_shop(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_address(jsonb), public.update_address(uuid, jsonb),
  public.delete_address(uuid), public.apply_for_shop(text, text),
  public.decide_shop(uuid, text, text, uuid) to authenticated;

commit;
