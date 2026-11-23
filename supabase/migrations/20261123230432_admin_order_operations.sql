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
revoke execute on function public.admin_dashboard(date) from authenticated;
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

  if p_status is not null and p_status not in ('confirmed', 'cancelled') then
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

create or replace function public.cancel_order(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_is_admin boolean;
begin
  if v_user_id is null then
    return jsonb_build_object('status', 'unauthorized', 'message', 'Authentication is required.');
  end if;
  if p_order_id is null then
    return jsonb_build_object('status', 'invalid', 'message', 'Order is required.');
  end if;
  if p_reason is not null and char_length(p_reason) > 500 then
    return jsonb_build_object('status', 'invalid', 'message', 'Cancellation reason is too long.');
  end if;

  v_is_admin := public.is_admin();

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found', 'message', 'Order was not found.');
  end if;

  if not v_is_admin and v_order.user_id is distinct from v_user_id then
    return jsonb_build_object('status', 'unauthorized', 'message', 'This order belongs to another user.');
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object(
      'status', 'already_cancelled',
      'order_id', v_order.id,
      'reference', v_order.reference,
      'cancelled_at', v_order.cancelled_at
    );
  end if;

  if not v_is_admin and v_order.created_at > now() - interval '24 hours' then
    return jsonb_build_object(
      'status', 'too_soon',
      'message', 'The order can be cancelled after 24 hours.',
      'earliest_cancellation_at', v_order.created_at + interval '24 hours'
    );
  end if;

  update public.orders
  set status = 'cancelled'
  where id = v_order.id;

  if v_is_admin then
    insert into public.order_events (
      order_id,
      actor_id,
      event_type,
      details
    )
    values (
      v_order.id,
      v_user_id,
      'admin_cancelled',
      jsonb_build_object(
        'status', 'cancelled',
        'reason', nullif(btrim(coalesce(p_reason, '')), '')
      )
    );
  end if;

  select * into v_order
  from public.orders
  where id = v_order.id;

  return jsonb_build_object(
    'status', 'cancelled',
    'order_id', v_order.id,
    'reference', v_order.reference,
    'cancelled_at', v_order.cancelled_at
  );
end;
$$;

revoke execute on function public.cancel_order(uuid, text) from public;
revoke execute on function public.cancel_order(uuid, text) from anon;
revoke execute on function public.cancel_order(uuid, text) from authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
