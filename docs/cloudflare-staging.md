# Cloudflare staging status

The repository contains a Cloudflare edge gateway at
`backend/cloudflare/worker.ts` and a staging Wrangler configuration at
`backend/cloudflare/wrangler.staging.toml`.

The gateway can serve the Vite `dist` output as Worker assets and route `/api/*`
to an explicitly configured `API_ORIGIN`. It intentionally returns `503` when
that origin is missing. This prevents recursive self-fetching and prevents an
apparently healthy but non-functional deployment.

## Current limitation

The application API is still an Express/Node server started by `server.ts`.
It is not yet a Worker `fetch()` handler. Therefore the current staging config
can host the frontend and edge gateway on Cloudflare, but it still requires a
separately hosted staging API origin. Hyperdrive is suitable for PostgreSQL
connectivity from a Worker, but it does not automatically convert Express,
`listen()`, filesystem migration loading, or all Node runtime behavior into a
Worker application.

## Safe staging sequence

1. Build with `bun run build`.
2. Authenticate Wrangler locally with `bunx wrangler login`.
3. Select the intended Cloudflare account and confirm the staging Worker name.
4. Configure `API_ORIGIN` as a staging-only Wrangler secret or variable.
5. Add a Hyperdrive binding only for a dedicated synthetic staging database.
6. Deploy from this directory:

   ```powershell
   & "$env:USERPROFILE\.bun\bin\bun.exe" x wrangler deploy --config backend/cloudflare/wrangler.staging.toml
   ```

Do not use the test Supabase database as production, and do not attach a
production custom domain until the Worker API migration and PostgreSQL staging
verification are complete.
