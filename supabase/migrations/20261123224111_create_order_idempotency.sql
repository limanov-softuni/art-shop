create unique index order_events_confirmed_request_idx
  on public.order_events ((details->>'request_id'))
  where event_type = 'confirmed'
    and details ? 'request_id';

create or replace function public.create_order(
  p_product_id uuid,
  p_expected_total numeric,
  p_client_name text,
  p_contact_phone text,
  p_special_requests text default null,
  p_request_id uuid default null
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
    return jsonb_build_object('status', 'unauthorized', 'message', 'Authentication is required.');
  end if;

  if p_request_id is null then
    return jsonb_build_object('status', 'invalid', 'message', 'Request identifier is required.');
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

  if p_contact_phone is not null
    and char_length(p_contact_phone) > 30
  then
    return jsonb_build_object('status', 'invalid', 'message', 'Contact phone is invalid.');
  end if;

  if p_special_requests is not null
    and char_length(p_special_requests) > 2000
  then
    return jsonb_build_object('status', 'invalid', 'message', 'Special requests are too long.');
  end if;

  select o.*
  into v_order
  from public.order_events e
  join public.orders o on o.id = e.order_id
  where e.event_type = 'confirmed'
    and e.details->>'request_id' = p_request_id::text
    and o.user_id = v_user_id
  limit 1;

  if found then
    return jsonb_build_object(
      'status', 'success',
      'order_id', v_order.id,
      'reference', v_order.reference,
      'product_id', v_order.product_id,
      'product_name', v_order.product_name_snapshot,
      'total_price', v_order.total_price,
      'currency', v_order.currency,
      'created_at', v_order.created_at,
      'idempotent', true
    );
  end if;

  for v_attempt in 1..5 loop
    begin
      select *
      into v_product
      from public.products
      where id = p_product_id
      for update;

      if not found then
        return jsonb_build_object('status', 'unavailable', 'message', 'The product does not exist.');
      end if;

      if not v_product.is_active then
        return jsonb_build_object('status', 'unavailable', 'message', 'The product is not available.');
      end if;

      if exists (
        select 1
        from public.orders
        where product_id = p_product_id
          and status = 'confirmed'
      ) then
        return jsonb_build_object('status', 'unavailable', 'message', 'The product is already booked.');
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
        nullif(btrim(p_contact_phone), ''),
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
        jsonb_build_object(
          'status', 'confirmed',
          'request_id', p_request_id
        )
      );

      return jsonb_build_object(
        'status', 'success',
        'order_id', v_order.id,
        'reference', v_order.reference,
        'product_id', v_order.product_id,
        'product_name', v_order.product_name_snapshot,
        'total_price', v_order.total_price,
        'currency', v_order.currency,
        'created_at', v_order.created_at,
        'idempotent', false
      );
    exception
      when unique_violation then
        select o.*
        into v_order
        from public.order_events e
        join public.orders o on o.id = e.order_id
        where e.event_type = 'confirmed'
          and e.details->>'request_id' = p_request_id::text
          and o.user_id = v_user_id
        limit 1;

        if found then
          return jsonb_build_object(
            'status', 'success',
            'order_id', v_order.id,
            'reference', v_order.reference,
            'product_id', v_order.product_id,
            'product_name', v_order.product_name_snapshot,
            'total_price', v_order.total_price,
            'currency', v_order.currency,
            'created_at', v_order.created_at,
            'idempotent', true
          );
        end if;

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

drop function if exists public.create_order(uuid, numeric, text, text, text);

revoke execute on function public.create_order(uuid, numeric, text, text, text, uuid) from public;
revoke execute on function public.create_order(uuid, numeric, text, text, text, uuid) from anon;
grant execute on function public.create_order(uuid, numeric, text, text, text, uuid) to authenticated;
