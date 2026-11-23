# Trusted First-Admin Bootstrap

The bootstrap script is a server-only operation. It does not expose a browser endpoint or an application “become admin” operation.

The script:

- Requires the dedicated project reference and URL.
- Requires an explicit existing Supabase Auth UUID.
- Uses the server-only service-role key.
- Assigns only that UUID the `admin` role.
- Skips safely if the UUID is already an admin.
- Never promotes all users or accepts role selection from browser input.

PowerShell example:

```powershell
$env:SUPABASE_PROJECT_REF="lskvwfxgpoorcnicttaj"
$env:SUPABASE_URL="https://lskvwfxgpoorcnicttaj.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<server-only-service-role-key>"
$env:FIRST_ADMIN_USER_ID="<existing-auth-user-uuid>"
npm.cmd run bootstrap:first-admin
```

Remove the environment variables from the shell after use. Never add the service-role key or password to `VITE_` variables, frontend code, logs, or Git.
