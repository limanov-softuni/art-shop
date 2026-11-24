create or replace function public.search_catalog(
  p_search text default null,
  p_destination text default null,
  p_max_price numeric default null,
  p_availability text default 'all',
  p_sort text default 'name_asc',
  p_page integer default 1,
  p_page_size integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_available_total integer;
  v_page_count integer;
  v_rows jsonb;
begin
  if p_page < 1 or p_page > 1000 then
    return jsonb_build_object('status','invalid','message','Page is out of range.');
  end if;
  if p_page_size < 1 or p_page_size > 50 then
    return jsonb_build_object('status','invalid','message','Page size is out of range.');
  end if;
  if p_availability not in ('all','available','unavailable') then
    return jsonb_build_object('status','invalid','message','Availability filter is invalid.');
  end if;
  if p_sort not in ('name_asc','name_desc','price_asc','price_desc') then
    return jsonb_build_object('status','invalid','message','Sort option is invalid.');
  end if;

  with catalog as (
    select p.*, p.is_active and not exists (
      select 1
      from public.orders o
      where o.product_id=p.id
        and o.status in ('confirmed','completed')
    ) as is_available
    from public.products p
    where p.is_active
      and (p_search is null or p.name ilike '%'||p_search||'%')
      and (p_destination is null or p.description ilike '%'||'Type: '||p_destination||'.%')
      and (p_max_price is null or p.price<=p_max_price)
  )
  select count(*),count(*) filter(where is_available)
  into v_total,v_available_total
  from catalog
  where p_availability='all'
    or (p_availability='available' and is_available)
    or (p_availability='unavailable' and not is_available);

  v_page_count:=greatest(1,ceil(v_total::numeric/p_page_size)::integer);

  with catalog as (
    select p.*, p.is_active and not exists (
      select 1
      from public.orders o
      where o.product_id=p.id
        and o.status in ('confirmed','completed')
    ) as is_available
    from public.products p
    where p.is_active
      and (p_search is null or p.name ilike '%'||p_search||'%')
      and (p_destination is null or p.description ilike '%'||'Type: '||p_destination||'.%')
      and (p_max_price is null or p.price<=p_max_price)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'description', c.description,
      'price', c.price,
      'is_active', c.is_active,
      'is_available', c.is_available,
      'product_images', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'storage_path', i.storage_path,
            'alt_text', i.alt_text,
            'position', i.position,
            'is_cover', i.is_cover
          )
          order by i.is_cover desc,i.position asc,i.created_at asc,i.id asc
        )
        from public.product_images i
        where i.product_id=c.id
      ), '[]'::jsonb)
    )
  ), '[]'::jsonb)
  into v_rows
  from (
    select c.*
    from catalog c
    where p_availability='all'
      or (p_availability='available' and c.is_available)
      or (p_availability='unavailable' and not c.is_available)
    order by
      case when p_sort='name_asc' then c.name end asc,
      case when p_sort='name_desc' then c.name end desc,
      case when p_sort='price_asc' then c.price end asc,
      case when p_sort='price_desc' then c.price end desc,
      c.id asc
    limit p_page_size
    offset (p_page-1)*p_page_size
  ) c;

  return jsonb_build_object(
    'status','success',
    'total_count',v_total,
    'available_count',v_available_total,
    'unavailable_count',v_total-v_available_total,
    'page',p_page,
    'page_count',v_page_count,
    'products',v_rows
  );
end;
$$;

revoke execute on function public.search_catalog(text,text,numeric,text,text,integer,integer) from public;
grant execute on function public.search_catalog(text,text,numeric,text,text,integer,integer) to anon,authenticated;
