alter table public.orders
  add column if not exists completed_at timestamptz;

alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('confirmed', 'cancelled', 'completed'));

alter table public.orders
  drop constraint if exists orders_cancelled_timestamp_check;

alter table public.orders
  add constraint orders_cancelled_timestamp_check
  check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status = 'confirmed' and cancelled_at is null)
    or (status = 'completed' and cancelled_at is null)
  );

alter table public.orders
  add constraint orders_completed_timestamp_check
  check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  );

create or replace function public.guard_order_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.product_id is distinct from old.product_id
    or new.reference is distinct from old.reference
    or new.total_price is distinct from old.total_price
    or new.currency is distinct from old.currency
    or new.client_name is distinct from old.client_name
    or new.contact_phone is distinct from old.contact_phone
    or new.special_requests is distinct from old.special_requests
    or new.product_name_snapshot is distinct from old.product_name_snapshot
    or new.created_at is distinct from old.created_at
  then
    raise exception 'immutable order fields cannot be changed';
  end if;

  if old.status in ('cancelled', 'completed')
    and new.status is distinct from old.status
  then
    raise exception 'terminal orders cannot be changed';
  end if;

  if new.status = 'cancelled' then
    new.cancelled_at = coalesce(old.cancelled_at, now());
    new.completed_at = null;
  elsif new.status = 'completed' then
    new.completed_at = coalesce(old.completed_at, now());
    new.cancelled_at = null;
  else
    new.cancelled_at = null;
    new.completed_at = null;
  end if;

  return new;
end;
$$;

create or replace function public.complete_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('status', 'unauthorized', 'message', 'Authentication is required.');
  end if;
  if not public.is_admin() then
    return jsonb_build_object('status', 'unauthorized', 'message', 'Administrator access is required.');
  end if;
  if p_order_id is null then
    return jsonb_build_object('status', 'invalid', 'message', 'Order is required.');
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found', 'message', 'Order was not found.');
  end if;
  if v_order.status = 'completed' then
    return jsonb_build_object(
      'status', 'already_completed',
      'order_id', v_order.id,
      'reference', v_order.reference,
      'completed_at', v_order.completed_at
    );
  end if;
  if v_order.status <> 'confirmed' then
    return jsonb_build_object(
      'status', 'invalid_state',
      'message', 'Only confirmed orders can be completed.'
    );
  end if;

  update public.orders
  set status = 'completed'
  where id = v_order.id;

  insert into public.order_events (
    order_id,
    actor_id,
    event_type,
    details
  )
  values (
    v_order.id,
    v_user_id,
    'completed',
    jsonb_build_object('status', 'completed')
  );

  select * into v_order
  from public.orders
  where id = v_order.id;

  return jsonb_build_object(
    'status', 'completed',
    'order_id', v_order.id,
    'reference', v_order.reference,
    'completed_at', v_order.completed_at
  );
end;
$$;

revoke execute on function public.complete_order(uuid) from public;
revoke execute on function public.complete_order(uuid) from anon;
revoke execute on function public.complete_order(uuid) from authenticated;
grant execute on function public.complete_order(uuid) to authenticated;

create or replace function public.get_product_availability(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'product_id', p.id,
    'is_active', p.is_active,
    'is_available',
      p.is_active
      and not exists (
        select 1
        from public.orders o
        where o.product_id = p.id
          and o.status in ('confirmed', 'completed')
      )
  )
  from public.products p
  where p.id = p_product_id;
$$;

revoke execute on function public.get_product_availability(uuid) from public;
grant execute on function public.get_product_availability(uuid) to anon, authenticated;

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
          and o.status in ('confirmed', 'completed')
      )
  from public.products p
  where p.id = any(p_product_ids);
$$;

revoke execute on function public.get_products_availability(uuid[]) from public;
grant execute on function public.get_products_availability(uuid[]) to anon, authenticated;
