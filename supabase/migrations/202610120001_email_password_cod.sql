-- Course MVP decision D038: email/password buyers can place COD orders without SMS.
-- Retains active profile, server prices, owned/validated address, locks and idempotency.
-- No Auth identity fields are updated. Existing migration 003 remains immutable.
-- Recovery: pause checkout and forward-fix this dispatcher to require confirmed phone;
-- keep existing orders/inventory unchanged. Do not reset data or replay old migrations.
begin;
create or replace function public.marketplace(p_op text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid; sid uuid; pid uuid; vid uuid; oid uuid; soid uuid; qid uuid; key uuid;
  product_row commerce.products; variant_row commerce.variants; quote_row commerce.quotes; order_row commerce.orders; sub_row commerce.shop_orders;
  items jsonb; item jsonb; result jsonb; total bigint; v_quantity integer; v_delta integer; target text; r record;
begin
  if p_input is null or octet_length(p_input::text)>16384 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  if p_op='products' then
    perform private.commerce_keys(p_input,array['ids','category','page'],array[]::text[]);
    if (p_input ? 'ids' and (jsonb_typeof(p_input->'ids')<>'array' or jsonb_array_length(p_input->'ids')>40))
      or coalesce((p_input->>'page')::integer,1) not between 1 and 80 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
    select coalesce(jsonb_agg(x.dto),'[]') into result from (
      select private.commerce_product(p.id) dto from commerce.products p join public.shops s on s.id=p.shop_id
      where p.status='published' and s.status='active' and (not p_input ? 'category' or p_input->>'category'='' or p.category=p_input->>'category')
        and (not p_input ? 'ids' or p.id::text in (select jsonb_array_elements_text(p_input->'ids')))
      order by p.created_at desc,p.id limit 24 offset (coalesce((p_input->>'page')::integer,1)-1)*24
    ) x;
    select count(*) into total from commerce.products p join public.shops s on s.id=p.shop_id where p.status='published' and s.status='active'
      and (not p_input ? 'category' or p_input->>'category'='' or p.category=p_input->>'category');
    return jsonb_build_object('items',result,'total',total);
  elsif p_op='product' then
    perform private.commerce_keys(p_input,array['id'],array['id']);
    result:=private.commerce_product((p_input->>'id')::uuid);
    if result is null then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
    return result;
  end if;
  v_actor:=private.require_active();
  if p_op='asset_init' then
    perform private.commerce_keys(p_input,array['shop_id'],array['shop_id']);
    sid:=(p_input->>'shop_id')::uuid;
    perform id from public.shops where id=sid and status='active' for share;
    if not found or not private.has_shop_permission(sid,'catalog:write') then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
    if (select count(*) from commerce.assets where actor=v_actor and created_at>now()-interval '1 day')>=50 then raise exception using errcode='22023',message='ASSET_LIMIT'; end if;
    pid:=gen_random_uuid();
    insert into commerce.assets(id,shop_id,actor,path) values(pid,sid,v_actor,sid::text||'/'||pid::text||'.webp');
    return jsonb_build_object('id',pid,'path',sid::text||'/'||pid::text||'.webp');
  elsif p_op='moderate_list' then
    perform private.commerce_keys(p_input,'{}');
    if not private.has_permission('shops:moderate') or auth.jwt()->>'aal' is distinct from 'aal2' then raise exception using errcode='42501',message='FORBIDDEN'; end if;
    return jsonb_build_object('items',coalesce((select jsonb_agg(private.commerce_product(x.id,true)) from (select p.id from commerce.products p where p.status='pending' and not exists(select 1 from public.shop_members m where m.shop_id=p.shop_id and m.user_id=v_actor and m.active) and not exists(select 1 from public.shops s where s.id=p.shop_id and s.owner_user_id=v_actor) order by p.created_at,p.id limit 40) x),'[]'));
  elsif p_op='cart' then
    perform private.commerce_keys(p_input,'{}'); return jsonb_build_object('items',private.commerce_snapshot(v_actor));
  elsif p_op in ('cart_put','cart_delete') then
    perform private.commerce_keys(p_input,array['variant_id','quantity'],array['variant_id']);
    vid:=(p_input->>'variant_id')::uuid;
    if p_op='cart_delete' then delete from commerce.cart_items where buyer_id=v_actor and variant_id=vid;
    else
      v_quantity:=(p_input->>'quantity')::integer;
      if v_quantity is null or v_quantity not between 1 and 99 or jsonb_typeof(p_input->'quantity')<>'number' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
      select v.* into variant_row from commerce.variants v join commerce.products p on p.id=v.product_id join public.shops s on s.id=p.shop_id
        where v.id=vid and v.active and p.status='published' and s.status='active';
      if variant_row.id is null then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
      if not exists(select 1 from commerce.cart_items where buyer_id=v_actor and variant_id=vid) and (select count(*) from commerce.cart_items where buyer_id=v_actor)>=40 then
        raise exception using errcode='22023',message='CART_LIMIT'; end if;
      if v_quantity>(select on_hand-reserved from commerce.inventory where variant_id=vid) then raise exception using errcode='P0001',message='OUT_OF_STOCK'; end if;
      insert into commerce.cart_items values(v_actor,vid,v_quantity) on conflict(buyer_id,variant_id) do update set quantity=excluded.quantity;
    end if;
    return jsonb_build_object('items',private.commerce_snapshot(v_actor));
  elsif p_op='quote' then
    perform private.commerce_keys(p_input,'{}'); items:=private.commerce_snapshot(v_actor);
    if jsonb_array_length(items)=0 then raise exception using errcode='22023',message='EMPTY_CART'; end if;
    for item in select jsonb_array_elements(items) loop
      if not (item->>'saleable')::boolean then raise exception using errcode='P0001',message='PRODUCT_UNAVAILABLE'; end if;
      if (item->>'quantity')::integer>(item->>'available')::integer then raise exception using errcode='P0001',message='OUT_OF_STOCK'; end if;
    end loop;
    select sum((x->>'price_vnd')::bigint*(x->>'quantity')::integer) into total from jsonb_array_elements(items) x;
    insert into commerce.quotes(buyer_id,items,total) values(v_actor,private.commerce_fingerprint(items),total) returning * into quote_row;
    return jsonb_build_object('id',quote_row.id,'items',items,'subtotal',total,'shipping',0,'total',total,'expires_at',quote_row.expires_at,'currency','VND');
  elsif p_op='order_create' then
    perform private.commerce_keys(p_input,array['quote_id','address_id','request_key','payment_method'],array['quote_id','address_id','request_key','payment_method']);
    if p_input->>'payment_method'<>'cod' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
    -- Course COD: verified email or phone identity is enough. Shipping phone is
    -- validated on the owned address, not falsely marked Auth-verified.
    if not exists(select 1 from auth.users where id=v_actor and
      (email_confirmed_at is not null or phone_confirmed_at is not null))
      then raise exception using errcode='42501',message='IDENTITY_UNVERIFIED'; end if;
    key:=(p_input->>'request_key')::uuid;
    select * into order_row from commerce.orders where buyer_id=v_actor and request_key=key;
    if order_row.id is not null then
      if order_row.request_body<>p_input then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT'; end if;
      return private.commerce_order(order_row.id);
    end if;
    select * into quote_row from commerce.quotes where id=(p_input->>'quote_id')::uuid and buyer_id=v_actor;
    if quote_row.id is null then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
    if quote_row.expires_at<=now() then raise exception using errcode='P0001',message='QUOTE_EXPIRED'; end if;
    select private.address_dto(a) into result from public.addresses a where id=(p_input->>'address_id')::uuid and user_id=v_actor for share;
    if result is null then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
    -- Stable lock order prevents overselling and blocks concurrent price/visibility changes.
    perform s.id from public.shops s where s.id in(select (x->>'shop_id')::uuid from jsonb_array_elements(quote_row.items) x) order by s.id for share;
    perform p.id from commerce.products p where p.id in(select (x->>'product_id')::uuid from jsonb_array_elements(quote_row.items) x) order by p.id for share;
    perform v.id from commerce.variants v where v.id in(select (x->>'variant_id')::uuid from jsonb_array_elements(quote_row.items) x) order by v.id for share;
    perform i.variant_id from commerce.inventory i where i.variant_id in(select (x->>'variant_id')::uuid from jsonb_array_elements(quote_row.items) x) order by i.variant_id for update;
    items:=private.commerce_snapshot(v_actor);
    if private.commerce_fingerprint(items)<>quote_row.items then raise exception using errcode='P0001',message='PRICE_CHANGED'; end if;
    for item in select jsonb_array_elements(items) loop
      if not (item->>'saleable')::boolean then raise exception using errcode='P0001',message='PRODUCT_UNAVAILABLE'; end if;
      if (item->>'quantity')::integer>(item->>'available')::integer then raise exception using errcode='P0001',message='OUT_OF_STOCK'; end if;
    end loop;
    insert into commerce.orders(buyer_id,request_key,request_body,total,address_snapshot) values(v_actor,key,p_input,quote_row.total,result) returning id into oid;
    for r in select (x->>'shop_id')::uuid shop_id,sum((x->>'price_vnd')::bigint*(x->>'quantity')::integer) amount from jsonb_array_elements(items) x group by 1 order by 1 loop
      insert into commerce.shop_orders(order_id,shop_id,total) values(oid,r.shop_id,r.amount) returning id into soid;
      for item in select x from jsonb_array_elements(items) x where (x->>'shop_id')::uuid=r.shop_id loop
        vid:=(item->>'variant_id')::uuid; v_quantity:=(item->>'quantity')::integer;
        insert into commerce.order_items(shop_order_id,variant_id,quantity,title,sku,name,price_vnd,image_url)
          values(soid,vid,v_quantity,item->>'title',item->>'sku',item->>'name',(item->>'price_vnd')::bigint,item->>'image_url');
        update commerce.inventory set reserved=reserved+v_quantity where variant_id=vid;
        insert into commerce.reservations(shop_order_id,variant_id,quantity) values(soid,vid,v_quantity);
      end loop;
      insert into commerce.order_events(shop_order_id,actor,from_status,to_status,reason) values(soid,v_actor,'new','pending','COD order created');
    end loop;
    delete from commerce.cart_items where buyer_id=v_actor;
    return private.commerce_order(oid);
  elsif p_op in ('orders','order') then
    perform private.commerce_keys(p_input,array['id','page']);
    if p_op='order' then
      oid:=(p_input->>'id')::uuid;
      if not exists(select 1 from commerce.orders where id=oid and buyer_id=v_actor) then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
      return private.commerce_order(oid);
    end if;
    return jsonb_build_object('items',coalesce((select jsonb_agg(private.commerce_order(x.id)) from (select id from commerce.orders where buyer_id=v_actor order by created_at desc,id limit 24) x),'[]'));
  elsif p_op='order_cancel' then
    perform private.commerce_keys(p_input,array['id','reason'],array['id','reason']);
    if length(btrim(p_input->>'reason')) not between 3 and 500 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
    oid:=(p_input->>'id')::uuid;
    select * into order_row from commerce.orders where id=oid and buyer_id=v_actor for update;
    if order_row.id is null then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
    perform id from commerce.shop_orders where order_id=oid order by id for update;
    if exists(select 1 from commerce.shop_orders where order_id=oid and status in ('shipped','delivered')) then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
    perform i.variant_id from commerce.inventory i where i.variant_id in(select variant_id from commerce.reservations where shop_order_id in(select id from commerce.shop_orders where order_id=oid)) order by i.variant_id for update;
    for sub_row in select * from commerce.shop_orders where order_id=oid and status<>'cancelled' order by id loop
      perform private.commerce_stock_release(sub_row.id,false);
      update commerce.shop_orders set status='cancelled',version=version+1 where id=sub_row.id;
      insert into commerce.order_events(shop_order_id,actor,from_status,to_status,reason) values(sub_row.id,v_actor,sub_row.status,'cancelled',p_input->>'reason');
    end loop;
    return private.commerce_order(oid);
  elsif p_op like 'seller_%' then
    sid:=(p_input->>'shop_id')::uuid;
    perform id from public.shops where id=sid for share;
    perform shop_id from public.shop_members where shop_id=sid and user_id=v_actor and active for share;
    if not private.has_shop_permission(sid,case when p_op in ('seller_orders','seller_transition') then 'orders:read' when p_op='seller_inventory' then 'inventory:adjust' else 'catalog:write' end) then
      raise exception using errcode='P0002',message='NOT_FOUND'; end if;
    if p_op='seller_orders' then
      perform private.commerce_keys(p_input,array['shop_id']);
      return jsonb_build_object('items',coalesce((select jsonb_agg(private.commerce_order(x.order_id,sid)) from (select order_id from commerce.shop_orders where shop_id=sid order by order_id desc limit 24) x),'[]'));
    elsif p_op='seller_transition' then
      perform private.commerce_keys(p_input,array['shop_id','id','status','version','reason'],array['shop_id','id','status','version','reason']);
      if not private.has_shop_permission(sid,'orders:transition') then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
      target:=p_input->>'status';
      if length(btrim(p_input->>'reason')) not between 3 and 500 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
      select order_id into oid from commerce.shop_orders where id=(p_input->>'id')::uuid and shop_id=sid;
      if oid is null then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
      perform id from commerce.orders where id=oid for update;
      select * into sub_row from commerce.shop_orders where id=(p_input->>'id')::uuid and shop_id=sid for update;
      if sub_row.version<>(p_input->>'version')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
      if not ((sub_row.status='pending' and target in ('confirmed','cancelled')) or (sub_row.status='confirmed' and target in ('shipped','cancelled')) or (sub_row.status='shipped' and target='delivered')) then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
      perform i.variant_id from commerce.inventory i where i.variant_id in(select variant_id from commerce.reservations where shop_order_id=sub_row.id) order by i.variant_id for update;
      if target='shipped' then perform private.commerce_stock_release(sub_row.id,true);
      elsif target='cancelled' then perform private.commerce_stock_release(sub_row.id,false); end if;
      update commerce.shop_orders set status=target,version=version+1 where id=sub_row.id;
      insert into commerce.order_events(shop_order_id,actor,from_status,to_status,reason) values(sub_row.id,v_actor,sub_row.status,target,p_input->>'reason');
      return private.commerce_order(oid,sid);
    end if;
    -- Lock active shop/membership; no seller can publish or assign a different owner.
    perform id from public.shops where id=sid and status='active' for share;
    if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
    perform shop_id from public.shop_members where shop_id=sid and user_id=v_actor and active for share;
    if p_op='seller_products' then
      perform private.commerce_keys(p_input,array['shop_id']);
      return jsonb_build_object('items',coalesce((select jsonb_agg(private.commerce_product(x.id,true)) from (select id from commerce.products where shop_id=sid order by created_at desc,id limit 40) x),'[]'));
    elsif p_op in ('seller_create','seller_update') then
      perform private.commerce_keys(p_input,array['shop_id','id','version','title','description','category','image_urls','sku','name','price_vnd','stock'],array['shop_id','title','description','category','image_urls']);
      if jsonb_typeof(p_input->'image_urls')<>'array' or jsonb_array_length(p_input->'image_urls') not between 1 and 12 or exists(select 1 from jsonb_array_elements_text(p_input->'image_urls') u where length(u)>1000 or
        (u !~ '^https://m[.]media-amazon[.]com/images/I/[A-Za-z0-9_+.,%~-]+[.](jpg|jpeg|png|webp)$' and not exists(select 1 from commerce.assets a where a.shop_id=sid and a.ready and a.public_url=u))) then
        raise exception using errcode='22023',message='INVALID_IMAGE'; end if;
      if p_op='seller_create' then
        insert into commerce.products(shop_id,title,description,category,image_urls) values(sid,p_input->>'title',p_input->>'description',p_input->>'category',p_input->'image_urls') returning id into pid;
        insert into commerce.variants(product_id,sku,name,price_vnd) values(pid,p_input->>'sku',p_input->>'name',(p_input->>'price_vnd')::bigint) returning id into vid;
        v_quantity:=(p_input->>'stock')::integer;
        if v_quantity is null then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
        insert into commerce.inventory(variant_id,on_hand) values(vid,v_quantity);
        insert into commerce.inventory_movements(variant_id,delta,reason,actor,request_key) values(vid,v_quantity,'Initial course stock',v_actor,gen_random_uuid());
      else
        if not p_input ?& array['id','version'] then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
        pid:=(p_input->>'id')::uuid;
        select * into product_row from commerce.products where id=pid and shop_id=sid for update;
        if product_row.id is null then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
        if product_row.version<>(p_input->>'version')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
        if product_row.status='archived' then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
        update commerce.products set title=p_input->>'title',description=p_input->>'description',category=p_input->>'category',image_urls=p_input->'image_urls',status='draft',version=version+1 where id=pid;
      end if;
      perform private.commerce_enqueue(pid); return private.commerce_product(pid,true);
    elsif p_op in ('seller_submit','seller_archive') then
      perform private.commerce_keys(p_input,array['shop_id','id','version'],array['shop_id','id','version']);
      pid:=(p_input->>'id')::uuid;
      select * into product_row from commerce.products where id=pid and shop_id=sid for update;
      if product_row.id is null then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
      if product_row.version<>(p_input->>'version')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
      if p_op='seller_submit' and (product_row.status not in ('draft','rejected') or not exists(select 1 from commerce.variants v where v.product_id=pid and v.active)) then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
      update commerce.products set status=case when p_op='seller_submit' then 'pending' else 'archived' end,version=version+1 where id=pid;
      perform private.commerce_enqueue(pid); return private.commerce_product(pid,true);
    elsif p_op='seller_variant' then
      perform private.commerce_keys(p_input,array['shop_id','product_id','id','version','sku','name','price_vnd','active'],array['shop_id','product_id','sku','name','price_vnd','active']);
      pid:=(p_input->>'product_id')::uuid;
      select * into product_row from commerce.products where id=pid and shop_id=sid for update;
      if product_row.id is null then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
      if product_row.status='archived' then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
      if p_input ? 'id' then
        if not p_input ? 'version' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
        vid:=(p_input->>'id')::uuid;
        select * into variant_row from commerce.variants where id=vid and product_id=pid for update;
        if variant_row.id is null then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
        if variant_row.version<>(p_input->>'version')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
        update commerce.variants set sku=p_input->>'sku',name=p_input->>'name',price_vnd=(p_input->>'price_vnd')::bigint,active=(p_input->>'active')::boolean,version=version+1 where id=vid;
      else
        if (select count(*) from commerce.variants where product_id=pid)>=30 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
        insert into commerce.variants(product_id,sku,name,price_vnd,active) values(pid,p_input->>'sku',p_input->>'name',(p_input->>'price_vnd')::bigint,(p_input->>'active')::boolean) returning id into vid;
        insert into commerce.inventory(variant_id) values(vid);
      end if;
      update commerce.products set version=version+1 where id=pid;
      perform private.commerce_enqueue(pid); return private.commerce_product(pid,true);
    elsif p_op='seller_inventory' then
      perform private.commerce_keys(p_input,array['shop_id','variant_id','delta','reason','request_key'],array['shop_id','variant_id','delta','reason','request_key']);
      vid:=(p_input->>'variant_id')::uuid; v_delta:=(p_input->>'delta')::integer; key:=(p_input->>'request_key')::uuid;
      if v_delta=0 or v_delta is null or abs(v_delta)>1000000 or length(btrim(p_input->>'reason')) not between 3 and 500 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
      select p.id into pid from commerce.variants v join commerce.products p on p.id=v.product_id where v.id=vid and p.shop_id=sid;
      if pid is null then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
      if exists(select 1 from commerce.inventory_movements where actor=v_actor and request_key=key) then
        if not exists(select 1 from commerce.inventory_movements m where m.actor=v_actor and m.request_key=key and m.variant_id=vid and m.delta=v_delta and m.reason=p_input->>'reason') then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT'; end if;
        return private.commerce_product(pid,true);
      end if;
      perform id from commerce.products where id=pid for update;
      update commerce.inventory set on_hand=on_hand+v_delta where variant_id=vid;
      insert into commerce.inventory_movements(variant_id,delta,reason,actor,request_key) values(vid,v_delta,p_input->>'reason',v_actor,key);
      update commerce.products set version=version+1 where id=pid;
      perform private.commerce_enqueue(pid); return private.commerce_product(pid,true);
    end if;
  elsif p_op='moderate' then
    perform private.commerce_keys(p_input,array['id','version','decision','reason'],array['id','version','decision','reason']);
    if not private.has_permission('shops:moderate') or auth.jwt()->>'aal' is distinct from 'aal2' then raise exception using errcode='42501',message='FORBIDDEN'; end if;
    pid:=(p_input->>'id')::uuid;
    select shop_id into sid from commerce.products where id=pid;
    perform id from public.shops where id=sid and status='active' for share;
    if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
    select * into product_row from commerce.products where id=pid for update;
    if product_row.id is null or exists(select 1 from public.shop_members where shop_id=product_row.shop_id and user_id=v_actor and active) or exists(select 1 from public.shops where id=product_row.shop_id and owner_user_id=v_actor) then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
    if product_row.version<>(p_input->>'version')::bigint or product_row.status<>'pending' then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
    if p_input->>'decision' not in ('published','rejected') or length(btrim(p_input->>'reason')) not between 3 and 500 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
    update commerce.products set status=p_input->>'decision',moderation_reason=p_input->>'reason',version=version+1 where id=pid;
    insert into private.audit_logs(actor,action,resource_id,before_data,after_data,reason,request_id) values(v_actor,'product.decision',pid,jsonb_build_object('status',product_row.status),jsonb_build_object('status',p_input->>'decision'),p_input->>'reason',gen_random_uuid());
    perform private.commerce_enqueue(pid); return private.commerce_product(pid,true);
  end if;
  raise exception using errcode='22023',message='INVALID_OPERATION';
end $$;
revoke all on function public.marketplace(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.marketplace(text,jsonb) to anon,authenticated;
commit;
