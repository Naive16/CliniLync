# Cloudflare Worker API migration audit

## Current route surface

The application exposes the versioned API under `/api/v1` plus legacy aliases
under `/api/auth`, `/api/patients`, `/api/appointments`, `/api/clinical`,
`/api/billing`, `/api/portal`, `/api/admin`, and `/api/organizations`.
The source contains 229 route/middleware method references across the API
routers; these include authentication, tenant isolation, RBAC, patient,
scheduling, clinical, medication, billing, portal, administration, and
subscription operations. Parity must be tested route-by-route, not inferred
from a health endpoint.

## Runtime findings

- `server.ts` creates an Express app, mounts middleware, and calls
  `app.listen()`. That is a Node server lifecycle and is not a Worker
  `fetch(request, env, ctx)` entrypoint.
- All API routers import Express `Router`, `Request`, `Response`, and
  middleware types. A Worker adapter would need to preserve their behavior or
  replace the routing layer without bypassing security middleware.
- `database/migrator.ts` loads SQL with Node `fs` and `path` and is appropriate
  for deployment tooling, not per-request Worker execution.
- The database client creates a process-global `pg.Pool` from `process.env`.
  Worker code must instead create a client from the Hyperdrive binding's
  connection string and respect Worker connection lifetimes.
- Authentication, audit, and clinical services use Web Crypto-compatible and
  Node-compatible APIs, but they have not yet been exercised inside a real
  Worker runtime.
- `pg` is `8.23.1`, above the Cloudflare Hyperdrive documented minimum for
  node-postgres. This is a favorable database-driver result, not proof of full
  application compatibility.

## Migration decision

The current Worker is a genuine edge gateway and static-asset server, but it
does not claim API parity. The existing Express runtime remains the reference
implementation until a Worker adapter or Worker-native router has passed
authentication, tenant-isolation, clinical-workflow, and PostgreSQL tests.

The next implementation unit should be a Worker-compatible request context and
router adapter that reuses the existing domain services and database interface.
It must not duplicate business rules or expose a route before its middleware
equivalent is covered by tests.
