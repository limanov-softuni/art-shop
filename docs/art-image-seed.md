# Art Product Image Seed

The image seed uses public-domain image data and IIIF images from the Art Institute of Chicago.

It creates up to three generated Storage objects per seeded product, with generated UUID paths under:

`<product-id>/<uuid>.jpg`

The script:

- Requires the dedicated Supabase project reference.
- Requires a server-only service-role key.
- Uses no arbitrary local filenames.
- Skips products that already have three or more metadata records.
- Sets the first generated image as cover only when the product has no existing cover.
- Removes an uploaded object if database metadata insertion fails.
- Reports created, skipped, failed, and cleaned counts.

PowerShell:

```powershell
$env:SUPABASE_PROJECT_REF="lskvwfxgpoorcnicttaj"
$env:SUPABASE_URL="https://lskvwfxgpoorcnicttaj.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<server-only-service-role-key>"
npm.cmd run seed:art-images
```

Remove the service-role key from the shell after execution.
