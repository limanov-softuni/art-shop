# Art Shop Supabase Access Model

## Project boundary

- Supabase project reference: `lskvwfxgpoorcnicttaj`
- Project URL: `https://lskvwfxgpoorcnicttaj.supabase.co`
- The browser application uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Public publishable configuration is not a substitute for authorization. RLS policies and database operations must enforce access.
- Service-role keys, database passwords, signing secrets, and other privileged credentials must remain outside browser code and `VITE_` environment variables.
- Privileged Supabase development tools are separate from application data access. They may be used for project inspection and migrations, not as browser-side authority.

## Confirmed project state

The project has application tables for profiles, database guest/admin roles, products, catalog images, orders, and order events. The database role value `guest` represents a registered customer-facing account. The project also has a public `product-images` Storage bucket and migration history for catalog search, booking, image management, administration and completed-order states.

## Visitor

Visitors are unauthenticated users.

Visitors may:

- Read published products.
- Read catalog images and other intentionally public product media.
- Search and read aggregate product availability.
- Browse public catalog information.

Visitors may not:

- Read or modify orders.
- Read customer profiles.
- Create or cancel orders.
- Access administrative product or order operations.

## Customer

A customer is a visitor who has registered and signed in through Supabase Auth.

Customers inherit all visitor permissions and may additionally:

- Read and update only permitted fields of their own profile.
- Create orders through an authorized database operation that validates ownership and physical-product availability.
- Read only their own orders.
- Cancel their own cancellable orders through an authorized database operation that validates state and releases the physical product safely.

Customers may not:

- Read another customer's profile or orders.
- Update protected profile fields or administrator fields.
- Change order rows or state by direct privileged table access.
- Perform administration through a browser-only role flag.

## Admin

Admins have application privileges established by server/database authorization, not by browser-only state.

Admins may:

- Create, update, publish, and retire products.
- Manage catalog images and storage objects.
- Read all orders.
- Perform supported order administration and valid order-state transitions.

Admins may not rely on direct browser role values for authorization. Database RLS, constraints, and privileged RPC functions must remain the enforcement boundary.

## Implementation boundaries

- Public catalog and availability reads should use narrowly scoped application queries.
- Profile and order ownership must be derived from the authenticated Supabase user identity.
- Order creation and cancellation use authorized database operations that enforce ownership, availability and state transitions atomically.
- Product and image administration is enforced by database-backed admin authorization.
- This document describes the implemented access model and does not create additional privileges.

## Booking operations

- New orders are allocated only through `public.create_order`.
- The function derives the customer identity from `auth.uid()`, computes the current EUR price server-side, verifies activity and availability while holding the product row lock, and compares the supplied quote before insertion.
- `public.get_product_availability` returns only aggregate active/available state. It does not expose orders or order events.
- Cancellation is handled only through `public.cancel_order`. The owner may cancel only within 24 hours after placement; after that deadline, the order is processed and the owner cannot cancel it. Admins may cancel supported orders regardless of age.
- Cancellation preserves the order row, sets a server timestamp, and records one server-generated cancellation event.
- Repeated cancellation returns an idempotent already-cancelled result.
- A confirmed order is marked `completed` only through the admin `complete_order` operation after shipment. Completed orders are terminal and remain unavailable.
