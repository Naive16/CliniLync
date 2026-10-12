# Clinilync staging deployment

The repository includes a non-production Render Blueprint at
`render.yaml`. It defines `clinilync-api-staging` and
`clinilync-postgres-staging` in the Frankfurt region, wires `DATABASE_URL` to
Render's internal Postgres connection string, and disables automatic deploys.
Render's Blueprint format supports this `fromDatabase` connection reference;
the actual URL is never committed to the repository.

## Request flow

```text
Browser
  -> Cloudflare Worker/static assets and same-origin /api/* edge route
  -> private or access-controlled Express API origin
  -> dedicated synthetic-data PostgreSQL staging database
```

Cloudflare remains the public edge and frontend host. The Express service is
the authoritative API and should run on a managed Node host that supports a
long-lived HTTP process and PostgreSQL pooling (for example, Render, Railway,
Fly.io, or an equivalent private container service). The API origin must not be
placed in browser configuration or exposed through a public DNS record unless
the selected host requires it. If a public origin is unavoidable, restrict it
with provider firewall/access controls and accept that Cloudflare cannot make
the origin completely undiscoverable.

## API runtime

Hosted staging and production startup now:

- fail closed when `DATABASE_URL`, a non-default `SESSION_SECRET`, HTTPS
  `APP_URL`, or `CORS_ORIGINS` is missing;
- verify that migrations already exist, but do not run migrations or seed data;
- bind to `HOST` and `PORT`;
- honor `TRUST_PROXY` only when the API is reachable exclusively through the
  trusted reverse proxy;
- close the HTTP server and PostgreSQL pool on SIGTERM/SIGINT.

Apply migrations separately with `bun run db:migrate`. Seed synthetic staging
fixtures separately with `bun run db:seed` only after confirming the database
is the dedicated staging database. Never set `ALLOW_DEMO_SEED=true` on a
production database.

## Required API environment

Use secret-manager values, not committed files:

```text
NODE_ENV=staging
HOST=0.0.0.0
PORT=3000
APP_URL=https://<staging-frontend-domain>
DATABASE_URL=postgresql://<staging-user>:<password>@<staging-host>:5432/<staging-db>?sslmode=require
DATABASE_SSL=true
SESSION_SECRET=<random-secret>
SESSION_EXPIRY_SECONDS=86400
CORS_ORIGINS=https://<staging-frontend-domain>
TRUST_PROXY=true
ALLOW_DEMO_SEED=false
```

The connection string and secret values must never be printed, committed, or
placed in Wrangler configuration.

The Blueprint supplies `DATABASE_URL`, `NODE_ENV`, `HOST`, `PORT`,
`DATABASE_SSL`, `DB_MAX_CONNECTIONS`, `SESSION_EXPIRY_SECONDS`,
`TRUST_PROXY`, and `ALLOW_DEMO_SEED`. Render generates `SESSION_SECRET`.
The dashboard must supply the real staging `APP_URL` and `CORS_ORIGINS` after
the Cloudflare staging hostname is selected.

Render uses the repository's existing scripts through npm-compatible commands:

```text
Build: npm install && npm run build
Start: npm run start
Health: GET /api/health
```

Local development and verification remain Bun-based:

```powershell
& "$env:USERPROFILE\.bun\bin\bun.exe" install --frozen-lockfile
& "$env:USERPROFILE\.bun\bin\bun.exe" run build
& "$env:USERPROFILE\.bun\bin\bun.exe" run start
```

`npm run start` invokes the same `tsx server.ts` script as `bun run start`;
the Blueprint does not introduce a different application entrypoint.

## Render setup runbook

1. Push this repository to a GitHub repository without `.env`, credentials,
   generated secrets, or database URLs.
2. In Render, choose **New → Blueprint**, select the repository, and review
   the two resources before creating them. Confirm this is a staging workspace.
3. Keep the generated `SESSION_SECRET`. Enter only the real staging values for
   `APP_URL` and `CORS_ORIGINS` in the Render dashboard.
4. Confirm the API and database are both in Frankfurt and that the database is
   the newly created synthetic staging database.
5. After creation, run the migration command from a controlled shell using the
   Render internal database URL, or use a one-off Render shell. Verify database
   identity first; then run `bun run db:migrate` (or the equivalent installed
   project command). The web service does not run migrations on startup.
6. Only after explicit approval, run `bun run db:seed` against that verified
   staging database. This creates synthetic fixtures; never run it for
   production.
7. Set Cloudflare's `API_ORIGIN` secret to the actual Render staging service
   URL. Do not put that URL in this repository until it exists.
8. Verify `/api/health` through Render and through the Cloudflare Worker, then
   test login/logout, session persistence, organization switching, cross-tenant
   denial, patient registration, scheduling, encounter documentation, and
   subscription trial behavior.

The Blueprint has not been applied and no Render or Cloudflare deployment has
been performed by this task.

## Cloudflare edge configuration

Build the frontend, then configure the staging Worker with:

```powershell
& "$env:USERPROFILE\.bun\bin\bun.exe" run build
& "$env:USERPROFILE\.bun\bin\bun.exe" x wrangler secret put API_ORIGIN --config backend/cloudflare/wrangler.staging.toml
& "$env:USERPROFILE\.bun\bin\bun.exe" x wrangler deploy --config backend/cloudflare/wrangler.staging.toml
```

`API_ORIGIN` must be the staging Express origin, not the Worker URL. Verify
`/api/health` through the Worker and directly against the API origin before
testing authenticated flows. No deployment is considered verified until both
paths return the expected health response and the Worker logs show no routing
errors.

## Current blockers

- Cloudflare account authentication and account selection are unavailable.
- Wrangler requires Node.js 22+; this machine currently has Node.js 20.18.1.
- A staging Express host and API origin have not been selected.
- `DATABASE_URL` is not configured in the current shell, so real PostgreSQL
  verification is not runnable here.
- Migration 012 still requires validation against the dedicated staging
  PostgreSQL database.
- The Blueprint's `free` plans are staging defaults only; confirm current
  Render plan availability and persistence characteristics in the dashboard
  before using this environment for anything beyond synthetic QA.
