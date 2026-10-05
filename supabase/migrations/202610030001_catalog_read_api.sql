-- Bounded public projection of the public Amazon source dataset only.
-- No access to account/shop/order data; original tables retain RLS and deny grants.
-- Rollback: revoke EXECUTE, then drop these new functions after removing API usage.
begin;
create function public.read_academic_catalog(p_ids text[] default null, p_category text default '', p_after text default '', p_limit integer default 24)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 40 or p_category is null or p_after is null
     or (p_after <> '' and p_after !~ '^[A-Z0-9]{10}$')
     or p_category not in ('','All_Beauty','Electronics','Cell_Phones_and_Accessories','Home_and_Kitchen','Grocery_and_Gourmet_Food')
     or (p_ids is not null and (cardinality(p_ids) > 40 or exists(select 1 from unnest(p_ids) id where id is null or id !~ '^[A-Z0-9]{10}$'))) then
    raise exception using errcode='22023', message='Invalid catalog query';
  end if;
  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) into result from (
    select p.source_id as id,p.title,p.category,p.category_name_vi,p.description,p.features,
           p.image_urls,p.price_usd,p.source_currency as currency,p.store_name,p.average_rating
    from catalog_import.products p
    where p.dataset_key='amazon-2023-0dac845f97a1'
      and (p_category='' or p.category=p_category)
      and (p_ids is null or p.source_id=any(p_ids))
      and p.source_id>p_after
    order by p.source_id limit p_limit
  ) row;
  return result;
end;
$$;
create function public.academic_catalog_categories()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(row) order by row.name),'[]'::jsonb) from (
    select category as id,category_name_vi as name,count(*)::integer as products
    from catalog_import.products where dataset_key='amazon-2023-0dac845f97a1'
    group by category,category_name_vi
  ) row;
$$;
revoke all on function public.read_academic_catalog(text[],text,text,integer) from public,anon,authenticated;
revoke all on function public.academic_catalog_categories() from public,anon,authenticated;
grant execute on function public.read_academic_catalog(text[],text,text,integer) to anon,authenticated;
grant execute on function public.academic_catalog_categories() to anon,authenticated;
comment on function public.read_academic_catalog(text[],text,text,integer) is 'Read-only public Amazon metadata projection; historical USD prices; not checkout inventory.';
notify pgrst, 'reload schema';
commit;
