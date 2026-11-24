create or replace function public.admin_dashboard(p_day date default current_date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when auth.uid() is null or not public.is_admin()
      then jsonb_build_object('status', 'unauthorized')
      else jsonb_build_object(
        'status', 'success',
        'published_products', (
          select count(*)
          from public.products
          where is_active
        ),
        'confirmed_orders', (
          select count(*)
          from public.orders
          where status = 'confirmed'
        ),
        'completed_orders', (
          select count(*)
          from public.orders
          where status = 'completed'
        ),
        'confirmed_order_value', (
          select coalesce(sum(total_price), 0)
          from public.orders
          where status = 'confirmed'
        ),
        'orders_for_day', (
          select count(*)
          from public.orders
          where (created_at at time zone 'UTC')::date = p_day
        ),
        'selected_day', p_day
      )
    end;
$$;

revoke execute on function public.admin_dashboard(date) from public;
revoke execute on function public.admin_dashboard(date) from anon;
grant execute on function public.admin_dashboard(date) to authenticated;

create or replace function public.admin_search_orders(
  p_status text default null,
  p_product_id uuid default null,
  p_order_date date default null,
  p_reference text default null,
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_page_count integer;
begin
  if auth.uid() is null or not public.is_admin() then
    return jsonb_build_object('status', 'unauthorized');
  end if;
  if p_status is not null and p_status not in ('confirmed', 'cancelled', 'completed') then
    return jsonb_build_object('status', 'invalid', 'message', 'Unsupported order status.');
  end if;
  if p_page < 1 or p_page > 1000 then
    return jsonb_build_object('status', 'invalid', 'message', 'Page is out of range.');
  end if;
  if p_page_size < 1 or p_page_size > 50 then
    return jsonb_build_object('status', 'invalid', 'message', 'Page size is out of range.');
  end if;
  if p_reference is not null and char_length(p_reference) > 100 then
    return jsonb_build_object('status', 'invalid', 'message', 'Reference is too long.');
  end if;

  select count(*)
  into v_total
  from public.orders o
  where (p_status is null or o.status = p_status)
    and (p_product_id is null or o.product_id = p_product_id)
    and (p_order_date is null or (o.created_at at time zone 'UTC')::date = p_order_date)
    and (p_reference is null or o.reference ilike '%' || p_reference || '%');

  v_page_count := greatest(1, ceil(v_total::numeric / p_page_size)::integer);

  return jsonb_build_object(
    'status', 'success',
    'total_count', v_total,
    'page', p_page,
    'page_count', v_page_count,
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'reference', o.reference,
          'product_id', o.product_id,
          'product_name', o.product_name_snapshot,
          'saved_price', o.total_price,
          'currency', o.currency,
          'status', o.status,
          'created_at', o.created_at,
          'cancelled_at', o.cancelled_at,
          'completed_at', o.completed_at,
          'client_name', o.client_name
        )
        order by o.created_at desc, o.id desc
      )
      from (
        select *
        from public.orders o
        where (p_status is null or o.status = p_status)
          and (p_product_id is null or o.product_id = p_product_id)
          and (p_order_date is null or (o.created_at at time zone 'UTC')::date = p_order_date)
          and (p_reference is null or o.reference ilike '%' || p_reference || '%')
        order by o.created_at desc, o.id desc
        limit p_page_size
        offset (p_page - 1) * p_page_size
      ) o
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_search_orders(text, uuid, date, text, integer, integer) from public;
revoke execute on function public.admin_search_orders(text, uuid, date, text, integer, integer) from anon;
revoke execute on function public.admin_search_orders(text, uuid, date, text, integer, integer) from authenticated;
grant execute on function public.admin_search_orders(text, uuid, date, text, integer, integer) to authenticated;
