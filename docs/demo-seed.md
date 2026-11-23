# Demo Project Seed

The demo seed creates data only in the intended Supabase project:

- Project reference: `lskvwfxgpoorcnicttaj`
- Project URL: `https://lskvwfxgpoorcnicttaj.supabase.co`

The script uses the Supabase Auth Admin API and the service-role key. Keep the service-role key only in a server environment. Never add it to `VITE_` variables, browser code, logs, commits, or `.env` files that may be committed.

## Required server environment

Set these variables in a server shell or private environment file:

- `SUPABASE_PROJECT_REF`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DEMO_ADMIN_EMAIL`
- `DEMO_ADMIN_PASSWORD`
- `DEMO_GUEST_PASSWORD`

`SUPABASE_PROJECT_REF` must exactly match `lskvwfxgpoorcnicttaj`, and `SUPABASE_URL` must exactly match `https://lskvwfxgpoorcnicttaj.supabase.co`.

The demo administrator email must use the reserved `@example.invalid` domain. Guest accounts use reserved fictional `@example.invalid` addresses. Auth user creation uses confirmed accounts and does not send invitations or arbitrary-address emails.

The password values are initial passwords only. Reruns never update an existing account's password.

## Dry run

PowerShell:

```powershell
$env:SUPABASE_PROJECT_REF="lskvwfxgpoorcnicttaj"
$env:SUPABASE_URL="https://lskvwfxgpoorcnicttaj.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<server-only-service-role-key>"
$env:DEMO_ADMIN_EMAIL="demo.admin@example.invalid"
$env:DEMO_ADMIN_PASSWORD="<initial-admin-password>"
$env:DEMO_GUEST_PASSWORD="<initial-guest-password>"
npm.cmd run seed:demo:dry
```

A dry run requires no database mutations but does require server configuration. Remove secret environment variables from the shell when finished.

## Execution

PowerShell:

```powershell
$env:SUPABASE_PROJECT_REF="lskvwfxgpoorcnicttaj"
$env:SUPABASE_URL="https://lskvwfxgpoorcnicttaj.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<server-only-service-role-key>"
$env:DEMO_ADMIN_EMAIL="demo.admin@example.invalid"
$env:DEMO_ADMIN_PASSWORD="<initial-admin-password>"
$env:DEMO_GUEST_PASSWORD="<initial-guest-password>"
npm.cmd run seed:demo
```

The script reports created and skipped counts. Reruns reuse existing Auth accounts and seed records by exact email, product name, and order reference. Existing passwords are not changed, existing admin status is preserved, guest users are assigned only a missing guest role, and unrelated database records are not reset or deleted.
