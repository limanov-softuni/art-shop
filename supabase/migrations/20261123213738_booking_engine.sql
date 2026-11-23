create unique index orders_one_confirmed_product_idx
  on public.orders (product_id)
  where status = 'confirmed';

drop policy if exists "admins update supported order status"
  on public.orders;

revoke all on table public.orders from anon, authenticated;
grant select on table public.orders to authenticated;

revoke all on table public.order_events from anon, authenticated;
grant select on table public.order_events to authenticated;

create or replace function public.create_order(
  p_product_id uuid,
  p_expected_total numeric,
  p_client_name text,
  p_contact_phone text,
  p_special_requests text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public.products%rowtype;
  v_order public.orders%rowtype;
  v_attempt integer;
  v_reference text;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'status', 'unauthorized',
      'message', 'Authentication is required.'
    );
  end if;

  if p_product_id is null then
    return jsonb_build_object('status', 'invalid', 'message', 'Product is required.');
  end if;

  if p_expected_total is null
    or p_expected_total < 0
    or p_expected_total > 9999999999.99
    or scale(p_expected_total) > 2
  then
    return jsonb_build_object('status', 'invalid', 'message', 'Expected total is invalid.');
  end if;

  if p_client_name is null
    or char_length(p_client_name) not between 1 and 100
  then
    return jsonb_build_object('status', 'invalid', 'message', 'Client name is invalid.');
  end if;

  if p_contact_phone is null
    or char_length(p_contact_phone) not between 3 and 30
  then
    return jsonb_build_object('status', 'invalid', 'message', 'Contact phone is invalid.');
  end if;

  if p_special_requests is not null
    and char_length(p_special_requests) > 2000
  then
    return jsonb_build_object('status', 'invalid', 'message', 'Special requests are too long.');
  end if;

  for v_attempt in 1..5 loop
    begin
      select *
      into v_product
      from public.products
      where id = p_product_id
      for update;

      if not found then
        return jsonb_build_object(
          'status', 'unavailable',
          'message', 'The product does not exist.'
        );
      end if;

      if not v_product.is_active then
        return jsonb_build_object(
          'status', 'unavailable',
          'message', 'The product is not available.'
        );
      end if;

      if exists (
        select 1
        from public.orders
        where product_id = p_product_id
          and status = 'confirmed'
      ) then
        return jsonb_build_object(
          'status', 'unavailable',
          'message', 'The product is already booked.'
        );
      end if;

      if p_expected_total is distinct from v_product.price then
        return jsonb_build_object(
          'status', 'requote',
          'product_id', v_product.id,
          'current_price', v_product.price,
          'currency', 'EUR',
          'message', 'The product price changed. Please review the new quote.'
        );
      end if;

      v_reference := 'AS-' || upper(replace(gen_random_uuid()::text, '-', ''));

      insert into public.orders (
        reference,
        user_id,
        product_id,
        status,
        total_price,
        currency,
        client_name,
        contact_phone,
        special_requests,
        product_name_snapshot
      )
      values (
        v_reference,
        v_user_id,
        v_product.id,
        'confirmed',
        v_product.price,
        'EUR',
        btrim(p_client_name),
        btrim(p_contact_phone),
        nullif(btrim(p_special_requests), ''),
        v_product.name
      )
      returning * into v_order;

      insert into public.order_events (
        order_id,
        actor_id,
        event_type,
        details
      )
      values (
        v_order.id,
        v_user_id,
        'confirmed',
        jsonb_build_object('status', 'confirmed')
      );

      return jsonb_build_object(
        'status', 'success',
        'order_id', v_order.id,
        'reference', v_order.reference,
        'product_id', v_order.product_id,
        'product_name', v_order.product_name_snapshot,
        'total_price', v_order.total_price,
        'currency', v_order.currency,
        'created_at', v_order.created_at
      );
    exception
      when unique_violation then
        if v_attempt = 5 then
          return jsonb_build_object(
            'status', 'unavailable',
            'message', 'The product could not be allocated.'
          );
        end if;
        perform pg_sleep(0.01 * v_attempt);
      when serialization_failure or deadlock_detected then
        if v_attempt = 5 then
          return jsonb_build_object(
            'status', 'unavailable',
            'message', 'The booking request conflicted with another allocation.'
          );
        end if;
        perform pg_sleep(0.01 * v_attempt);
    end;
  end loop;

  return jsonb_build_object(
    'status', 'unavailable',
    'message', 'The booking request could not be completed.'
  );
end;
$$;

revoke execute on function public.create_order(
  uuid,
  numeric,
  text,
  text,
  text
) from public;
revoke execute on function public.create_order(
  uuid,
  numeric,
  text,
  text,
  text
) from anon;
grant execute on function public.create_order(
  uuid,
  numeric,
  text,
  text,
  text
) to authenticated;

create or replace function public.cancel_order(p_order_id uuid)
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
    return jsonb_build_object(
      'status', 'unauthorized',
      'message', 'Authentication is required.'
    );
  end if;

  if p_order_id is null then
    return jsonb_build_object('status', 'invalid', 'message', 'Order is required.');
  end if;

  v_is_admin := public.is_admin();

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found', 'message', 'Order was not found.');
  end if;

  if not v_is_admin and v_order.user_id is distinct from v_user_id then
    return jsonb_build_object(
      'status', 'unauthorized',
      'message', 'This order belongs to another user.'
    );
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object(
      'status', 'already_cancelled',
      'order_id', v_order.id,
      'reference', v_order.reference,
      'cancelled_at', v_order.cancelled_at
    );
  end if;

  if not v_is_admin
    and v_order.created_at > now() - interval '24 hours'
  then
    return jsonb_build_object(
      'status', 'too_soon',
      'message', 'The order can be cancelled after 24 hours.',
      'earliest_cancellation_at', v_order.created_at + interval '24 hours'
    );
  end if;

  update public.orders
  set status = 'cancelled'
  where id = v_order.id;

  select *
  into v_order
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

revoke execute on function public.cancel_order(uuid) from public;
revoke execute on function public.cancel_order(uuid) from anon;
grant execute on function public.cancel_order(uuid) to authenticated;

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
      p.is_active and not exists (
        select 1
        from public.orders o
        where o.product_id = p.id
          and o.status = 'confirmed'
      )
  )
  from public.products p
  where p.id = p_product_id;
$$;

revoke execute on function public.get_product_availability(uuid) from public;
grant execute on function public.get_product_availability(uuid) to anon, authenticated;
