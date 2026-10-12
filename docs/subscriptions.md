# Organization subscriptions

Clinilync now has a provider-neutral organization subscription domain. Migration
`012_organization_subscriptions.sql` creates versioned plans, one subscription
per organization, an append-only subscription event history, and an idempotency
store for future payment webhooks.

## Current behavior

- The Standard plan is versioned as `plan_standard_v1`.
- A trial is exactly seven days and is provisioned transactionally by
  `POST /api/v1/subscriptions/trial` for an organization administrator or owner.
- Repeating the request returns the existing subscription and does not create a
  second trial.
- `POST /api/v1/subscriptions/cancel` records cancellation at period end.
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
