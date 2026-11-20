# CliniLync Cloudflare Workers migration — implementation gate

## Objective

Move the existing CliniLync application from the suspended Render web service to Cloudflare Workers and Workers Static Assets while retaining the existing Supabase PostgreSQL project and all application records. This branch is based on `fix/hosted-database-fallback` so hosted runtimes fail closed instead of silently switching to the in-process database.

## Verified infrastructure baseline (20 November 2026)

- GitHub source of truth: `Naive16/CliniLync`, default branch `main`.
- Render service: `clinilync-staging`; suspended because the free-tier usage limit was exceeded. Its last recorded deployment was successful. Keep the service intact until cutover is verified.
- Database: existing Supabase project `Clinilync`, PostgreSQL 17, healthy, with 62 tables and 18 migrations.
- Existing data must be preserved. Read-only counts found an organisation, a user and audit events. The patient, appointment, encounter, clinical-note, observation, prescription, allergy and medication tables queried were empty at inspection time. This is not a claim that every table is empty.
- Cloudflare account has a registered `kelvinmkanda01.workers.dev` subdomain. No CliniLync Worker or Hyperdrive configuration existed at inspection time.
- No production domain/DNS, Render service, Supabase schema, or application data was changed during the audit.

## Existing application shape

- `server.ts` creates and starts the Express application, runs hosted startup checks, mounts API routers, and serves the Vite build. It is not a Worker entry point.
- `backend/cloudflare/worker.ts` was a gateway at baseline. The migration branch now replaces it with a Worker entry that mounts the shared Express API via `httpServerHandler`; this implementation is pending CI and live runtime validation.
- `database/db.ts` currently reads `process.env.DATABASE_URL`, creates a process-global `pg.Pool`, reads a Supabase CA certificate from the local filesystem, and contains an in-process fallback. A Worker cannot simply execute this unchanged.
- The staging Wrangler configuration currently points API traffic to an external origin and has no active Hyperdrive binding. Deploying it without an API origin would produce 503 responses for API routes; that would not be a functioning migration.
- The API uses shared Express routers and middleware for authentication, organization membership, RBAC, tenant checks, audit logging, and clinical operations. These must remain in force; do not expose partial API parity.

## Target topology

Browser -> Cloudflare Worker + Static Assets -> Worker-hosted API adapter -> Hyperdrive -> the existing Supabase PostgreSQL database.

Use the existing API routers and domain services where they are compatible, rather than reimplementing clinical business rules. Extract an app factory from `server.ts` so the same route composition can be used by the Node test/runtime and the Worker adapter. The Worker entry point must adapt requests through Cloudflare's supported Node HTTP/Express compatibility path and must not call `listen()`, run migrations, or seed demo data at request startup.

The database adapter must accept a Worker-provided Hyperdrive connection string without reading certificate files or relying on `process.env`. It must fail closed if the binding is absent or cannot connect. Do not silently instantiate `InProcessRelationalEngine` in staging or production. Do not cache clinical query results at the edge.

## Database and credential boundary

- Keep the current Supabase project and schema. Do not copy, reset, truncate, or migrate patient data to a new database.
- Create a dedicated, least-privilege database login for the Worker rather than reusing an administrative Supabase credential. The credential must be created and stored through a secure dashboard/secret workflow; never paste it into chat, source control, a committed Wrangler file, or a GitHub issue.
- Configure Hyperdrive to use the direct PostgreSQL endpoint and the dedicated login. Keep the connection string in the Hyperdrive resource, not in source.
- Existing migration 017 intentionally revokes Data API access from `anon` and `authenticated` and uses a server-only application role. Preserve that model pending a separate review of application-level authentication and tenant isolation. BYPASSRLS is not a reason to expose the credential to browser code.
- Do not add public Data API grants or broad RLS policies as part of this hosting migration.

## Required implementation and verification gates

1. **App extraction:** create a reusable Express app factory; keep Node startup, Vite dev middleware, migrations, and shutdown logic in the Node-only entry point.
2. **Worker adapter:** use the supported Cloudflare Node HTTP adapter; prove that all required middleware, request bodies, cookies, headers, response streaming, and error handling behave correctly.
3. **Database adapter:** inject Hyperdrive configuration explicitly; remove filesystem CA reads from the Worker path; verify parameterized queries and transactions; fail closed on missing binding/connection errors.
4. **Runtime compatibility audit:** search every API/service import for Node-only filesystem, process, networking, crypto, timers, unsupported native modules, and global mutable state. Test each dependency in the actual Workers runtime.
5. **Security parity:** test login/logout/session expiry, disabled accounts, active organization membership, RBAC, cross-tenant denial, patient/staff boundaries, audit writes, cookie flags, CORS, CSRF protections where applicable, and rate limits.
6. **Clinical regression:** exercise patient, appointment, encounter, clinical note, observation, medication/prescription, allergy, billing, portal, administration, and subscription flows with synthetic test records only. Verify no data leaks across organizations.
7. **Frontend and static assets:** build and serve the real Vite output through Workers Static Assets; verify SPA deep links and API routing.
8. **Database safety:** compare migration history and schema before/after; confirm no startup schema changes or demo seeding; verify existing organisation/user/audit counts are unchanged.
9. **Staging deployment:** deploy only after the Worker API is complete and a dedicated database login/Hyperdrive binding is ready. Use `https://clinilync-staging.kelvinmkanda01.workers.dev`; do not attach the production domain.
10. **Cutover:** only after all gates pass and the user separately confirms domain/DNS changes. Keep Render available for rollback until post-cutover verification is complete.

## Current status

The migration branch now contains an initial Worker-hosted Express API and request-scoped Hyperdrive adapter, plus a CI dry-run build. These changes are not yet verified in the Workers runtime. The Hyperdrive binding and dedicated DB login are not configured, so the Worker must not be deployed yet. No production DNS, Render, or Supabase changes have been made.
