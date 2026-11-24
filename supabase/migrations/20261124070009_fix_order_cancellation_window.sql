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
    return jsonb_build_object('status', 'unauthorized', 'message', 'Authentication is required.');
  end if;
  if p_order_id is null then
    return jsonb_build_object('status', 'invalid', 'message', 'Order is required.');
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

  if not v_is_admin
    and v_order.created_at < now() - interval '24 hours'
  then
    return jsonb_build_object(
      'status', 'too_late',
      'message', 'The 24-hour cancellation window has closed.',
      'cancellation_deadline', v_order.created_at + interval '24 hours'
    );
  end if;

  update public.orders
  set status = 'cancelled'
  where id = v_order.id;

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

revoke execute on function public.cancel_order(uuid) from public;
revoke execute on function public.cancel_order(uuid) from anon;
revoke execute on function public.cancel_order(uuid) from authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;

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

  if not v_is_admin
    and v_order.created_at < now() - interval '24 hours'
  then
    return jsonb_build_object(
      'status', 'too_late',
      'message', 'The 24-hour cancellation window has closed.',
      'cancellation_deadline', v_order.created_at + interval '24 hours'
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
