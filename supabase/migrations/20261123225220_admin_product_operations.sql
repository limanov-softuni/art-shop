create or replace function public.delete_unreferenced_product(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean := public.is_admin();
  v_product public.products%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('status', 'unauthorized', 'message', 'Authentication is required.');
  end if;

  if not v_is_admin then
    return jsonb_build_object('status', 'unauthorized', 'message', 'Administrator access is required.');
  end if;

  if p_product_id is null then
    return jsonb_build_object('status', 'invalid', 'message', 'Product is required.');
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found', 'message', 'Product was not found.');
  end if;

  if exists (
    select 1
    from public.orders
    where product_id = p_product_id
  ) then
    return jsonb_build_object(
      'status', 'referenced',
      'message', 'This product has order history and must be deactivated instead of deleted.'
    );
  end if;

  delete from public.product_images
  where product_id = p_product_id;

  delete from public.products
  where id = p_product_id;

  return jsonb_build_object(
    'status', 'deleted',
    'product_id', p_product_id
  );
end;
$$;

revoke execute on function public.delete_unreferenced_product(uuid) from public;
revoke execute on function public.delete_unreferenced_product(uuid) from anon;
revoke execute on function public.delete_unreferenced_product(uuid) from authenticated;
grant execute on function public.delete_unreferenced_product(uuid) to authenticated;
