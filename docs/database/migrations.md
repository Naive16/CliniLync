# CLINILYNC Database Migrations Strategy

## 1. Principles
- **Immutable History:** Never modify an executed migration script. Always create a forward migration to apply changes.
- **Transactional Execution:** Each migration runs inside `BEGIN ... COMMIT`. If any DDL fails, the entire transaction rolls back.
- **Migration Tracking Table:** `_schema_migrations` records `id`, `name`, `checksum`, `applied_at`, and `execution_time_ms`.
- **Zero-Downtime Design:** Additive changes first (add nullable columns or default values), backfill data, and only subsequently apply constraints in later migrations.

## 2. Directory Structure
```
database/
├── schema.sql              # Canonical base DDL reference
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_rbac_and_tenancy.sql
│   └── 003_audit_logging_and_indexes.sql
├── migrator.ts             # Programmatic migration runner
└── seed.ts                 # Idempotent fixture seeding
```
