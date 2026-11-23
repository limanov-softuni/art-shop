create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null or char_length(display_name) between 1 and 100
  ),
  constraint profiles_phone_length check (
    phone is null or char_length(phone) between 3 and 30
  )
);

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  constraint user_roles_role_check check (role in ('guest', 'admin'))
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(12, 2) not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_length check (char_length(name) between 1 and 200),
  constraint products_price_non_negative check (price >= 0)
);

create index products_active_created_idx
  on public.products (is_active, created_at desc);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  storage_path text not null,
  alt_text text not null,
  position integer not null,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  constraint product_images_storage_path_length check (
    char_length(storage_path) between 1 and 1024
  ),
  constraint product_images_alt_text_length check (
    char_length(alt_text) between 1 and 300
  ),
  constraint product_images_position_positive check (position >= 1)
);

create index product_images_product_position_idx
  on public.product_images (product_id, position);

create unique index product_images_one_cover_idx
  on public.product_images (product_id)
  where is_cover;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  status text not null,
  total_price numeric(12, 2) not null,
  currency text not null default 'EUR',
  client_name text not null,
  contact_phone text not null,
  special_requests text,
  product_name_snapshot text not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint orders_reference_length check (char_length(reference) between 3 and 100),
  constraint orders_status_check check (status in ('confirmed', 'cancelled')),
  constraint orders_total_price_non_negative check (total_price >= 0),
  constraint orders_currency_eur check (currency = 'EUR'),
  constraint orders_client_name_length check (
    char_length(client_name) between 1 and 100
  ),
  constraint orders_contact_phone_length check (
    char_length(contact_phone) between 3 and 30
  ),
  constraint orders_special_requests_length check (
    special_requests is null or char_length(special_requests) <= 2000
  ),
  constraint orders_product_name_snapshot_length check (
    char_length(product_name_snapshot) between 1 and 200
  ),
  constraint orders_cancelled_timestamp_check check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status = 'confirmed' and cancelled_at is null)
  )
);

create index orders_user_created_idx
  on public.orders (user_id, created_at desc);

create index orders_status_created_idx
  on public.orders (status, created_at desc);

create index orders_product_idx
  on public.orders (product_id);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint order_events_type_length check (char_length(event_type) between 1 and 100),
  constraint order_events_details_object check (jsonb_typeof(details) = 'object'),
  constraint order_events_details_size check (octet_length(details::text) <= 2000)
);

create index order_events_order_created_idx
  on public.order_events (order_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.initialize_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'guest')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.initialize_auth_user() from public;
revoke execute on function public.initialize_auth_user() from anon;
revoke execute on function public.initialize_auth_user() from authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.initialize_auth_user();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select id, 'guest'
from auth.users
on conflict (user_id) do nothing;

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

  if old.status = 'cancelled' and new.status is distinct from old.status then
    raise exception 'cancelled orders cannot be changed';
  end if;

  if new.status = 'cancelled' then
    new.cancelled_at = coalesce(old.cancelled_at, now());
  else
    new.cancelled_at = null;
  end if;

  return new;
end;
$$;

create trigger orders_guard_integrity
before update on public.orders
for each row execute function public.guard_order_integrity();

create or replace function public.record_order_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'confirmed' and new.status = 'cancelled' then
    insert into public.order_events (
      order_id,
      actor_id,
      event_type,
      details
    )
    values (
      new.id,
      auth.uid(),
      'cancelled',
      jsonb_build_object('status', 'cancelled')
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.record_order_cancellation() from public;
revoke execute on function public.record_order_cancellation() from anon;
revoke execute on function public.record_order_cancellation() from authenticated;

create trigger orders_record_cancellation
after update of status on public.orders
for each row execute function public.record_order_cancellation();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;

create policy "active products are publicly readable"
on public.products
for select
to anon, authenticated
using (is_active);

create policy "admins manage products"
on public.products
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "catalog images are publicly readable"
on public.product_images
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products
    where products.id = product_images.product_id
      and products.is_active
  )
);

create policy "admins manage catalog images"
on public.product_images
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "users read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "users update own permitted profile fields"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "users read own role"
on public.user_roles
for select
to authenticated
using (user_id = auth.uid());

create policy "admins read all roles"
on public.user_roles
for select
to authenticated
using (public.is_admin());

create policy "guests read own orders"
on public.orders
for select
to authenticated
using (user_id = auth.uid());

create policy "admins read all orders"
on public.orders
for select
to authenticated
using (public.is_admin());

create policy "admins update supported order status"
on public.orders
for update
to authenticated
using (public.is_admin())
with check (public.is_admin() and status in ('confirmed', 'cancelled'));

create policy "guests read own order events"
on public.order_events
for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_events.order_id
      and orders.user_id = auth.uid()
  )
);

create policy "admins read all order events"
on public.order_events
for select
to authenticated
using (public.is_admin());

grant usage on schema public to anon, authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to authenticated;

revoke all on table public.user_roles from anon, authenticated;
grant select on table public.user_roles to authenticated;

revoke all on table public.products from anon, authenticated;
grant select on table public.products to anon, authenticated;
grant insert, update, delete on table public.products to authenticated;

revoke all on table public.product_images from anon, authenticated;
grant select on table public.product_images to anon, authenticated;
grant insert, update, delete on table public.product_images to authenticated;

revoke all on table public.orders from anon, authenticated;
grant select on table public.orders to authenticated;
grant update (status) on table public.orders to authenticated;

revoke all on table public.order_events from anon, authenticated;
grant select on table public.order_events to authenticated;
