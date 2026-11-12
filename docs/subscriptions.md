# Organization subscriptions

Clinilync now has a provider-neutral organization subscription domain. Migration
`012_organization_subscriptions.sql` creates versioned plans, one subscription
per organization, an append-only subscription event history, and an idempotency
store for future payment webhooks.

## Current behavior

- Monthly plans are selected by the number of active clinic staff: `1–10`,
  `11–20`, `21–50`, `51–100`, and `101+`. Patients and platform administrators
  are excluded from the seat count.
- Default plan prices are configured in `backend/services/subscription.service.ts`
  in GBP minor units and should be confirmed before production launch.
- A trial is exactly seven days and is provisioned transactionally by
  `POST /api/v1/subscriptions/trial` for an organization administrator or owner.
- Repeating the request returns the existing subscription and does not create a
  second trial.
- `POST /api/v1/subscriptions/cancel` records cancellation at period end.
- `GET /api/v1/subscriptions/plans` is organization-scoped and returns the live
  staff count plus the recommended monthly tier.
- Checkout is intentionally unavailable while `PAYMENT_PROVIDER=unconfigured`.
  The API cannot activate a subscription or claim that a payment occurred.

## Payment provider decision required

Before enabling a provider, record the registered business country, settlement
currency/markets, legal entity, and the provider's healthcare/compliance review.
Then implement the provider adapter behind `BillingProvider`, verify signed
webhooks and idempotency in that provider's sandbox, and set secrets only in the
local/staging secret store. Do not put credentials in `.env.example`, source,
fixtures, or logs.

## Local verification

For the isolated PostgreSQL test database only:

```powershell
$env:DATABASE_URL = 'postgresql://<user>:<password>@<test-host>:5432/<test-db>?sslmode=require'
$env:CLINILYNC_ALLOW_TEST_CLEANUP = 'true'
& "$env:USERPROFILE\.bun\bin\bun.exe" run test:postgres:clean
& "$env:USERPROFILE\.bun\bin\bun.exe" run lint
& "$env:USERPROFILE\.bun\bin\bun.exe" run build
```

The cleanup command is restricted to a Supabase pooler hostname, requires the
explicit opt-in variable, preserves `_schema_migrations`, and must only be used
against a dedicated synthetic test database.
