# CLINILYNC Project Structure & Repository Layout

This document details the modular monolith organization of the CLINILYNC platform repository.

---

## 1. Directory Tree & Responsibilities

```
/
├── apps/
│   └── web/                  # Web application boundaries (unified React frontend in src/)
│
├── backend/                  # Platform Core Backend
│   ├── api/                  # Express REST routes & controllers (/api/v1/*)
│   ├── cloudflare/           # Cloudflare Worker edge gateway & wrangler configuration
│   ├── config/               # Centralized multi-environment configuration
│   ├── middleware/           # Pipeline middlewares (Auth, Tenancy, Permissions, Request ID, Error)
│   ├── modules/              # Domain module boundaries and contracts
│   ├── security/             # Cryptographic services, RBAC, RLAC, and Audit Trail
│   ├── types/                # Domain TypeScript interfaces and security context
│   └── validation/           # Server-side request schema validation
│
├── database/                 # Relational PostgreSQL Layer
│   ├── migrations/           # Forward, versioned DDL migration scripts
│   ├── documentation/        # Schema entity dictionaries and diagrams
│   ├── schema.sql            # Canonical full schema reference DDL
│   ├── migrator.ts           # Sequential transactional migration runner
│   └── seed.ts               # Test fixtures and multi-organization seeder
│
├── docs/                     # Canonical Engineering Documentation
│   ├── api/                  # REST endpoint specs and OpenAPI definitions
│   ├── architecture/         # High-level topology, multi-tenancy, and routing specs
│   ├── database/             # Relational modeling, ERD, and migration rules
│   ├── development/          # Onboarding, coding standards, test plans, and AI rules
│   ├── product/              # Product requirements document (PRD)
│   └── security/             # Threat models, permissions registry, audit specs
│
├── src/                      # Unified Frontend (React SPA)
│   ├── api/                  # Centralized typed HTTP client
│   ├── components/           # Reusable design system primitives (Button, Input, Modal, Badge)
│   ├── context/              # SecurityContext provider and active tenant state
│   ├── views/                # Views: Staff EMR/CRM, Patient Portal, Platform Admin
│   ├── App.tsx               # Primary layout and route coordination
│   ├── main.tsx              # React DOM mounting
│   └── index.css             # Tailwind CSS imports & theme definitions
│
├── tests/                    # Verification & Automated Test Suites
│   ├── auth.test.ts          # PBKDF2 hashing, constant-time validation, sessions
│   ├── rbac.test.ts          # Centralized role-based access control engine
│   ├── organization-isolation.test.ts # Multi-tenant isolation enforcement
│   ├── resource-access.test.ts # Resource-level access control (RLAC)
│   ├── audit-logging.test.ts # Tamper-evident audit logging verification
│   └── run-tests.ts          # Test runner suite entry point
│
├── .github/
│   └── workflows/ci.yml      # Continuous Integration automation workflow
│
├── .env.example              # Environment variable documentation (no secrets)
├── package.json              # Dependencies and development scripts
├── tsconfig.json             # TypeScript compiler configuration
└── vite.config.ts            # Vite bundler & Tailwind configuration
```

---

## 2. Architectural Boundaries

1. **Client Isolation:** React UI code does not make security or tenant decisions; all security contexts originate from authenticated server sessions.
2. **Domain Separation:** API routes delegate to validation, authorization gates, and domain services. Handlers do not directly execute raw SQL queries.
3. **Database Immutability:** Schema changes must proceed through versioned migrations in `database/migrations/`.
