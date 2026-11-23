# Art Shop System Implementation Plan

## 1. Project Goal

Build a genuine multi-page Art Shop System for the SoftUni "Software Technologies with AI" capstone project. The application will expose public browsing and search, guest account flows, shopping and checkout, order history and cancellation, and administrative product and order management.

## 2. Current Repository State

- Supabase project `art-shop` is connected to reference `lskvwfxgpoorcnicttaj`.
- The browser client uses the public project URL and publishable key environment variables.
- The initial database migration creates profiles, guest/admin roles, published catalog products and images, historical orders, and order events.
- Access roles and boundaries are documented in `docs/access-model.md`.

## 3. Technology and Architecture

### Technology

- HTML, CSS, and vanilla JavaScript ES modules
- Bootstrap
- Node.js, npm, and Vite
- Supabase Database, Auth, and Storage
- Render Static Site deployment
- No TypeScript, React, Vue, or server-side framework

### Multi-Page Application

Use separate Vite HTML entry files rather than client-side routing. Shared behavior will live in reusable modules under `src/`.

Milestone 1 initial structure:

```text
index.html
products/index.html
product/index.html
login/index.html
register/index.html
order/index.html
order-confirmation/index.html
my-orders/index.html
order-details/index.html
account/index.html
admin/
  index.html
  products/index.html
  product-edit/index.html
  images/index.html
  orders/index.html
src/
  components/
  services/
  utils/
  styles/
supabase/
  migrations/
docs/
```

Additional entries may be added only when a current milestone requires them.

### Supabase Boundaries

- Use the Supabase browser client only with public configuration and publishable/anonymous keys.
- Never place service-role keys or privileged credentials in browser code or committed configuration.
- Enforce identity and authorization with Row Level Security, policies, and database constraints.
- Use signed or narrowly scoped Storage operations where appropriate.
- Render all database-backed user content safely.
- Keep SQL migrations committed and synchronized with remote migration history.

## 4. Milestones

### Milestone 1: Project Foundation

Deliver:

- Vite project configuration and npm scripts.
- Bootstrap and shared CSS setup.
- Shared JavaScript modules for environment configuration, Supabase access, navigation, and safe UI helpers.
- Shared page shell components or templates.
- Accessibly structured base pages and responsive navigation.
- Environment variable documentation with no real credentials.
- Initial implementation documentation and `.gitignore`.
- Reusable responsive header, footer, page shell, product card, button, badge,
  form, skeleton, empty-state, confirmation-dialog, and toast primitives.
- Public navigation for Home, Products, Login, and Register.
- Authenticated navigation for My Orders, Account, and Logout; no admin route
  link until server-backed role checking is implemented.

Acceptance criteria:

- `npm install` works.
- `npm run dev` starts locally.
- `npm run build` completes.
- The app builds as separate HTML entry pages.
- No privileged credentials or deployment URLs are committed.

### Milestone 2: Database Schema and Access Control

Deliver:

- Committed Supabase migration for products, inventory, profiles, orders, order items, and admin roles.
- Database constraints for positive prices and quantities, valid inventory, and valid order state transitions.
- RLS policies for public product browsing and role/user-specific order access.
- Policies that restrict product and order administration to authorized admins.
- Seed data only through migration-safe, non-production sample records.
- Database integrity coverage or focused verification where supported.

Acceptance criteria:

- Migration can be applied in a clean environment.
- Anonymous users can read only the public product catalog.
- Authenticated users can read and manage only their allowed data.
- Inventory and order integrity are enforced independently of UI behavior.
- Admin privileges are not derived from a browser-only role flag.

### Milestone 3: Public Catalog and Search

Deliver:

- Public product list and search interface.
- Product detail view with safe rendering.
- Responsive product cards and high-resolution product image display.
- Loading, empty, and error states.
- EUR currency formatting.

Acceptance criteria:

- Unauthenticated users can browse products and search.
- Product details and public images render from database/storage data.
- No user content is inserted through unsafe HTML.
- Inventory availability is visible without exposing privileged information.

### Milestone 4: Authentication

Deliver:

- Guest registration and login.
- Session state across pages.
- Logout and protected-page handling.
- Clear validation and authentication errors.
- Navigation states for guest and signed-in users.

Acceptance criteria:

- Supabase Auth is the source of identity and session state.
- Protected pages redirect or present an appropriate signed-in requirement.
- Password and account data are never logged or stored in custom browser code.
- Auth UI is accessible and usable at mobile widths.

### Milestone 5: Cart and Checkout

Deliver:

- Multi-product cart with quantity controls.
- Inventory validation for available quantities.
- Checkout page for EUR totals and PayPal payment initiation.
- Server/database-enforced atomic order creation and inventory reservation or update.
- Immediate confirmation after successful available-inventory payment/order handling.
- Safe PayPal configuration from environment values and documented serverless or provider-supported integration behavior.

Acceptance criteria:

- A cart may contain multiple products and quantities.
- The database rejects overselling and inconsistent order items.
- Only confirmed, inventory-valid orders are created.
- EUR totals are consistent from database prices.
- Browser code contains no secret PayPal credentials.
- Payment success and failure states are explicit and recoverable.

### Milestone 6: Customer Orders

Deliver:

- Order history for the signed-in customer.
- Order detail view.
- Order cancellation within allowed state and inventory rules.
- Cancellation confirmation and clear state changes.

Acceptance criteria:

- Customers see only their own orders.
- Database policies and constraints enforce ownership and state transitions.
- Cancellable inventory is restored safely without negative stock.
- Cancelled orders cannot be cancelled repeatedly.

### Milestone 7: Administration

Deliver:

- Admin product list and create/edit management.
- Hi-res product image upload with validation and storage organization.
- Admin customer-order list and status management.
- Admin route/data guards backed by database authorization.

Acceptance criteria:

- Non-admin users cannot access or mutate admin resources.
- Product updates maintain database integrity.
- Image uploads have appropriate type, size, and access controls.
- Order changes use valid state transitions.

### Milestone 8: Quality and Deployment

Deliver:

- Responsive cross-page styling and accessibility review.
- Loading, validation, confirmation, and error state coverage.
- Production build configuration for Render Static Site.
- Supabase migration deployment instructions and version verification.
- Final project documentation.

Acceptance criteria:

- Relevant checks pass and the production build succeeds.
- The reviewed diff contains only the milestone scope.
- Environment variables and setup steps are documented without invented credentials or URLs.
- Changes are committed and pushed to the configured remote when available.

## 5. Delivery Rules

For every milestone:

1. Inspect the current workspace and preserve unrelated work.
2. Implement only the milestone's scope.
3. Add focused tests or verification artifacts when behavior is introduced.
4. Run relevant checks and `npm run build` when available.
5. Review the diff for secrets, unrelated edits, unsafe rendering, and authorization gaps.
6. Commit only milestone changes with a clear message and required co-author trailer.
7. Push to the configured remote if available.

Do not force-push or rewrite existing history. Do not invent deployment URLs, credentials, migration baselines, or API details.

## 6. Verification and API Policy

- Verify Supabase, Vite, Bootstrap, and PayPal APIs against official version-specific documentation.
- Treat browser SDK behavior and database behavior as two separate concerns.
- Prefer database functions or RLS-backed operations for inventory and booking integrity.
- Check the configured package versions before selecting APIs or option names.
- Report unavailable external services or unverified integrations honestly.
