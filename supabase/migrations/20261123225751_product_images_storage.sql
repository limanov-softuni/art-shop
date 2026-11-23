insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']::text[];

create or replace function public.set_product_image_cover(p_image_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_image public.product_images%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    return jsonb_build_object('status', 'unauthorized', 'message', 'Administrator access is required.');
  end if;

  select * into v_image
  from public.product_images
  where id = p_image_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found', 'message', 'Image was not found.');
  end if;

  update public.product_images
  set is_cover = false
  where product_id = v_image.product_id;

  update public.product_images
  set is_cover = true
  where id = p_image_id;

  return jsonb_build_object(
    'status', 'updated',
    'product_id', v_image.product_id,
    'image_id', p_image_id
  );
end;
$$;

revoke execute on function public.set_product_image_cover(uuid) from public;
revoke execute on function public.set_product_image_cover(uuid) from anon;
revoke execute on function public.set_product_image_cover(uuid) from authenticated;
grant execute on function public.set_product_image_cover(uuid) to authenticated;

create or replace function public.reorder_product_images(
  p_product_id uuid,
  p_image_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_image_id uuid;
  v_position integer := 1;
  v_count integer;
begin
  if auth.uid() is null or not public.is_admin() then
    return jsonb_build_object('status', 'unauthorized', 'message', 'Administrator access is required.');
  end if;

  if p_product_id is null or p_image_ids is null then
    return jsonb_build_object('status', 'invalid', 'message', 'Product and image order are required.');
  end if;

  select count(*) into v_count
  from public.product_images
  where product_id = p_product_id;

  if v_count <> cardinality(p_image_ids) then
    return jsonb_build_object('status', 'invalid', 'message', 'The complete image order is required.');
  end if;

  if exists (
    select 1
    from unnest(p_image_ids) supplied_id
    where supplied_id is null
      or not exists (
        select 1
        from public.product_images
        where id = supplied_id
          and product_id = p_product_id
      )
  ) then
    return jsonb_build_object('status', 'invalid', 'message', 'Only images from this product may be reordered.');
  end if;

  foreach v_image_id in array p_image_ids
  loop
    update public.product_images
    set position = v_position
    where id = v_image_id
      and product_id = p_product_id;
    v_position := v_position + 1;
  end loop;

  return jsonb_build_object(
    'status', 'updated',
    'product_id', p_product_id
  );
end;
$$;

revoke execute on function public.reorder_product_images(uuid, uuid[]) from public;
revoke execute on function public.reorder_product_images(uuid, uuid[]) from anon;
revoke execute on function public.reorder_product_images(uuid, uuid[]) from authenticated;
grant execute on function public.reorder_product_images(uuid, uuid[]) to authenticated;

create or replace function public.remove_product_image(p_image_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_image public.product_images%rowtype;
  v_fallback public.product_images%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    return jsonb_build_object('status', 'unauthorized', 'message', 'Administrator access is required.');
  end if;

  select * into v_image
  from public.product_images
  where id = p_image_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found', 'message', 'Image was not found.');
  end if;

  delete from public.product_images
  where id = p_image_id;

  if v_image.is_cover then
    select * into v_fallback
    from public.product_images
    where product_id = v_image.product_id
    order by position, created_at, id
    limit 1;

    if found then
      update public.product_images
      set is_cover = true
      where id = v_fallback.id;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'removed',
    'image_id', p_image_id,
    'storage_path', v_image.storage_path,
    'product_id', v_image.product_id
  );
end;
$$;

revoke execute on function public.remove_product_image(uuid) from public;
revoke execute on function public.remove_product_image(uuid) from anon;
revoke execute on function public.remove_product_image(uuid) from authenticated;
grant execute on function public.remove_product_image(uuid) to authenticated;

drop policy if exists "public view product images" on storage.objects;
create policy "public view product images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'product-images');

drop policy if exists "admins upload product images" on storage.objects;
create policy "admins upload product images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and public.is_admin()
);

drop policy if exists "admins replace product images" on storage.objects;
create policy "admins replace product images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and public.is_admin()
)
with check (
  bucket_id = 'product-images'
  and public.is_admin()
);

drop policy if exists "admins delete product images" on storage.objects;
create policy "admins delete product images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and public.is_admin()
);
