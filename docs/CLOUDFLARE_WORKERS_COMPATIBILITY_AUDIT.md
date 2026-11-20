# Cloudflare Workers compatibility audit

**Audit date:** 20 November 2026  
**Scope:** source-level review of the migration branch; no production changes.

## Executive result

The current codebase is **not ready to deploy as a complete Cloudflare Worker**. Cloudflare does support Express through its Node HTTP server integration, and the repository's `pg` dependency is already newer than Hyperdrive's documented minimum. Those facts make this migration technically plausible, but they do not make the existing server entry point or database adapter Worker-safe.

Do not deploy the existing gateway as the application API. It still proxies API traffic to `API_ORIGIN`; it does not mount CliniLync's Express routers.

## Confirmed compatibility positives

- Cloudflare documents Express on Workers using `cloudflare:node` and `httpServerHandler`: https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/
- Cloudflare documents `node-postgres` (`pg`) as the recommended Hyperdrive PostgreSQL driver, with minimum version `8.16.3`: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/
- The repository declares `pg: ^8.23.1`, which satisfies that minimum.
- The existing API is already composed from Express routers. Reusing those routers is preferable to rewriting clinical/business logic in a second framework.
- Existing GitHub Actions run 44746839846 completed successfully for the migration preparation commit. Type checking, the existing security/architecture test suite, and the frontend build all passed. These tests ran in GitHub's Node environment, not in the Workers runtime.

## Blocking issues found in source

### 1. Server startup is coupled to Node hosting

`server.ts` currently:
- creates the Express app and mounts the API routers in the same bootstrap function;
- runs startup validation and checks the migration ledger;
- may seed development/test data;
- creates Vite middleware in development and serves `dist` through Express in hosted mode;
- calls `app.listen()` and registers process signal handlers.

The Worker needs a side-effect-free app factory. Keep migration, seeding, Vite development middleware, listening, and shutdown in the Node-only entry point. The Worker entry must not run migrations or seed data.

### 2. The database adapter is not request-context aware

`database/db.ts` currently:
- imports `node:fs` and `node:path`;
- reads a Supabase CA certificate from `process.cwd()/certs/supabase-root-2021.crt`;
- reads `process.env.DATABASE_URL` at module/runtime scope;
- constructs a process-global `pg.Pool` and stores one process-global database singleton.

Hyperdrive exposes a binding-specific connection string to each Worker request. A Worker implementation must pass that connection into a request-scoped database client or another concurrency-safe request context. Do not set a global singleton to a request-specific connection: concurrent requests could cross database contexts. The current CA-file loading path must not be used for Hyperdrive.

Cloudflare's documented `pg` example creates a `Client` per request and uses Hyperdrive's own pooling. The app's current `IDatabaseClient` also supports explicit transactions, so the adapter must preserve transaction boundaries and release clients reliably.

### 3. Runtime configuration is evaluated from process.env

`backend/config/index.ts` resolves the environment and most settings when the module is imported. The Worker needs a deliberate mapping from Cloudflare bindings/secrets to application configuration. Do not assume Worker bindings automatically populate every `process.env` value or reuse development defaults for secrets.

### 4. Process-local session cache exists

`backend/security/session.ts` persists HTTP sessions through PostgreSQL-backed async methods, but the same singleton also contains an in-memory `Map` for synchronous sessions and cached security contexts. Audit all call sites before relying on that cache in a horizontally distributed Worker runtime. PostgreSQL must remain authoritative for revocation and session expiry.

### 5. Migration tooling is filesystem-dependent

`database/migrator.ts` reads SQL migration files from disk. It must remain an operator/CI task and must not be imported into or executed by the Worker request path.

### 6. Clinical/security behavior needs runtime tests

The current CI suite validates existing Node behavior. It does not yet test:
- the Cloudflare HTTP adapter's request/response lifecycle and cookie handling;
- request-scoped Hyperdrive connections and transaction isolation;
- Worker runtime import/bundle compatibility for the complete API dependency graph;
- session revocation across concurrent isolates;
- CORS, security headers, and origin behavior at the actual staging URL;
- synthetic multi-organisation clinical CRUD and cross-tenant denial on the deployed Worker.

## Required implementation order

1. **Completed in this branch:** extracted `createApp(options)` into `backend/app.ts`; `server.ts` now owns Node bootstrap, seed/migration policy, Vite/static hosting, listening, and shutdown. This extraction still requires CI and runtime verification.
2. **Implemented in this branch:** `backend/cloudflare/worker.ts` mounts the shared Express app through `cloudflare:node` / `httpServerHandler`; API traffic no longer proxies to `API_ORIGIN`.
3. **Implemented in this branch:** added a per-request `pg.Client` Hyperdrive adapter, AsyncLocalStorage request isolation, transaction support, in-flight query draining, and fail-closed behavior when no request-scoped Worker DB context exists. Needs CI and real Hyperdrive runtime verification.
4. **Partially implemented:** added Cloudflare binding-to-config injection and explicit Worker runtime mode. The session store's synchronous in-memory map remains for non-HTTP/test paths; HTTP auth uses PostgreSQL async methods. Confirm all routes and background tasks do not depend on process-local state.
5. **Partially implemented:** added a concurrent request-context isolation regression test and a Wrangler dry-run bundle step to CI. Both must pass; actual Worker runtime/cookie/clinical tests are still required.
6. Deploy to the `workers.dev` staging hostname only after a dedicated database login and Hyperdrive binding are configured.
7. Run synthetic clinical and security regression tests. Compare database migration ledger and selected baseline counts before/after.
8. Only then request a separate production domain/DNS cutover approval. Keep Render intact for rollback.

## Data and credential safety

- Keep the existing Supabase project and schema; no data copy or reset is required.
- No credentials belong in source control or chat.
- Use a dedicated database login for the Worker, stored in Hyperdrive. Do not reuse an administrative password. Create the Hyperdrive configuration with query caching disabled (`--caching-disabled`); Hyperdrive caches eligible SELECT results by default and does not invalidate cached reads after writes, which is unsuitable for clinical, session, permission, and billing data.
- Preserve the existing server-only Supabase access model. Do not enable public Data API grants or add broad RLS policies as a shortcut.
- Do not deploy a placeholder Worker, a gateway that returns 503 for API routes, or a partially mounted clinical API.

## Current gate status

| Gate | Status |
|---|---|
| Existing Node CI on preparation commit | Passed |
| Express-on-Workers platform support confirmed | Confirmed from Cloudflare docs |
| Existing `pg` version meets Hyperdrive minimum | Confirmed from repository manifest |
| App factory extracted | Implemented in migration branch; CI verification pending |
| Request-scoped Hyperdrive database adapter | Implemented in branch; CI and live binding verification pending |
| Worker runtime dependency audit/tests | Isolation test and Wrangler dry-run added; results pending |
| Dedicated Worker DB login / Hyperdrive binding | Not configured |
| Cloudflare staging deployment | Not deployed |
| Production cutover | Not authorised/performed |

**Conclusion:** The shared API adapter, request-scoped database path, runtime binding injection, and initial CI checks are now implemented in source. They are not yet verified by a fresh CI run or a live Worker deployment. Do not claim the migration complete until those checks and synthetic clinical/security tests pass.
