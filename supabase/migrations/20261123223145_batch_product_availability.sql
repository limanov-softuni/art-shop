create or replace function public.get_products_availability(p_product_ids uuid[])
returns table(product_id uuid, is_available boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.is_active
      and not exists (
        select 1
        from public.orders o
        where o.product_id = p.id
          and o.status = 'confirmed'
      )
  from public.products p
  where p.id = any(p_product_ids);
$$;

revoke execute on function public.get_products_availability(uuid[]) from public;
grant execute on function public.get_products_availability(uuid[]) to anon, authenticated;
