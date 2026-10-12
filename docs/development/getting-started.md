# CLINILYNC Development & Engineering Guide

## 1. Quick Start
```bash
# Install dependencies
npm install

# Run database migrations and seed data
npm run dev

# Run automated test suites (Auth, RBAC, Tenancy, Resource Access, Audit)
npm test
```

## 2. Environment Variables (`.env`)
- `PORT`: Dev server port (defaults to 3000)
- `NODE_ENV`: `development` | `test` | `production`
- `DATABASE_URL`: Required for PostgreSQL-backed development, integration testing, staging, and production. Use an isolated database such as `postgres://user:pass@host:5432/clinilync_test`. Without it, the application uses a lightweight in-process test adapter; that adapter is not PostgreSQL and is not evidence of PostgreSQL constraints, isolation, or migration correctness.
- `SESSION_SECRET`: Cryptographic key for signing sessions.
