# CLINILYNC

> **Connecting Healthcare. Simplifying Care.**  
> Global Healthcare Technology Platform, CRM & Lightweight Electronic Medical Record (EMR)

---

## 1. Executive Summary

**CLINILYNC** (`clinilync.com`) is a secure, modular healthcare technology platform built to seamlessly connect healthcare organizations, clinical professionals, administrative personnel, and patients under one unified ecosystem. 

Designed for global deployment from day one, CLINILYNC supports international healthcare operations without hardcoding country-specific assumptions, currencies, or regulatory constraints.

---

## 2. Core Architectural Principles

- **Unified Same-Domain Routing:** Public portal, staff application (`/app/*`), administrative console (`/admin/*`), patient portal (`/patient/*`), and REST APIs (`/api/v1/*`) operate under the unified primary domain `clinilync.com`.
- **Modular Monolith Foundation:** Clear internal domain boundaries (Routes → Validation → Authorization → Domain Services → Repositories → PostgreSQL Database) enabling future microservice extraction without early distributed complexity.
- **Strict Multi-Tenancy & Data Isolation:** Every organization-owned entity is tied to an `organization_id`. Tenant boundaries and cross-tenant isolation are strictly enforced server-side.
- **Centralized Authorization (RBAC + RLAC):** Zero client-side trust. Granular permissions and resource-level access gates dictate data access.
- **Immutable Server-Side Audit Trail:** Security and clinical actions produce tamper-evident, append-only audit records.
- **API-First Architecture:** The backend exposes a clean REST API consumed by the React web platform and prepared for future native iOS applications (Swift/SwiftUI).

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19, Tailwind CSS | Unified web experience across staff and patient portals |
| **Backend** | Cloudflare Workers / Node.js Express runtime | Edge security, routing, API orchestration, and domain services |
| **Database** | PostgreSQL 16+ | Relational persistence, foreign keys, and transactional migrations |
| **Edge Infrastructure** | Cloudflare | WAF, DDoS protection, rate limiting, and R2 object storage |
| **Mobile (Future)** | Swift / SwiftUI (iOS) | Consuming the exact same centralized REST API |
| **CI/CD** | GitHub Actions | Automated linting, type-checking, unit & tenancy test validation |

---

## 4. Repository Structure

```
/
├── backend/                  # Backend API, middleware, services, security
│   ├── api/                  # REST API routers (/api/v1/*)
│   ├── cloudflare/           # Cloudflare Worker entry point and wrangler.toml
│   ├── config/               # Centralized configuration (dev/staging/prod)
│   ├── middleware/           # Auth, tenant isolation, request-id, error handling
│   ├── modules/              # Modular monolith contracts and domain modules
│   ├── security/             # RBAC engine, resource access control, password, session, audit
│   ├── types/                # Domain type definitions
│   └── validation/           # Server-side request validation engine
│
├── database/                 # PostgreSQL migrations, schema, and seeder
│   ├── migrations/           # Forward, immutable SQL migration scripts
│   ├── schema.sql            # Canonical database schema definition
│   ├── migrator.ts           # Migration runner engine
│   └── seed.ts               # Multi-tenant fixtures and test data seeder
│
├── docs/                     # Architectural, security, database, and dev documentation
│   ├── architecture/         # System, API, multi-tenancy, and deployment specifications
│   ├── database/             # Relational schema, ERD, and migration strategy
│   ├── development/          # Getting started, coding standards, and AI rules
│   └── security/             # Threat models, permissions dictionary, and audit specifications
│
├── src/                      # Unified React web application
│   ├── api/                  # Typed API client and communication layer
│   ├── components/           # Reusable UI primitives and design system components
│   ├── context/              # Authentication and multi-tenant security context
│   └── views/                # Portal views: Staff CRM/EMR, Patient Portal, Admin Console
│
├── tests/                    # Automated test suites
│   ├── auth.test.ts          # PBKDF2 hashing and session lifetime tests
│   ├── rbac.test.ts          # Centralized role and permission validation
│   ├── organization-isolation.test.ts # Cross-tenant isolation verification
│   ├── resource-access.test.ts # Granular clinician vs billing vs nurse RLAC
│   ├── audit-logging.test.ts # Append-only audit integrity tests
│   └── run-tests.ts          # Test runner harness
│
└── .github/                  # CI/CD pipelines
    └── workflows/ci.yml      # Automated GitHub Actions test & build pipeline
```

---

## 5. Quick Start & Development

### Prerequisites
- Node.js 20+
- npm or bun

### Setup & Run
```bash
# 1. Install dependencies
npm install

# 2. Run the application (boots server and applies database migrations)
npm run dev

# 3. Run automated security and test suites
npm test

# 4. Compile and verify production build
npm run build
```

---

## 6. Documentation Directory

- [Getting Started Guide](docs/development/getting-started.md)
- [Project Structure & Architecture](docs/development/project-structure.md)
- [Coding Standards & Conventions](docs/development/coding-standards.md)
- [Testing & Quality Assurance](docs/development/testing.md)
- [AI Agent Development Rules](docs/development/ai-agent-rules.md)
- [System Architecture](docs/architecture/system-architecture.md)
- [API Architecture & Specification](docs/architecture/api-architecture.md)
- [Security Architecture & Permissions](docs/security/security-architecture.md)
- [Database Architecture & Migrations](docs/database/database-architecture.md)

---

## 7. License & Compliance
CLINILYNC is engineered for healthcare compliance (HIPAA, GDPR, and regional health data privacy standards). Passwords use PBKDF2 with SHA-256 (100,000 iterations); all patient access events are immutably audited server-side.


## Runtime security boundaries

Production startup requires DATABASE_URL and refuses the in-process adapter. The in-process adapter is retained only for fast unit tests and local development. HTTP sessions are stored as SHA-256 token hashes in PostgreSQL, with expiry, idle timeout, and revocation enforced server-side. Demonstration seeding is blocked in production unless ALLOW_DEMO_SEED=true is explicitly set for a controlled environment. The Express application is the API origin; the Cloudflare Worker is an edge gateway and must be configured to route to that origin rather than fetch(request) against itself.


## Release runtime prerequisites

The repository uses Bun lockfile format (bun.lock). Install Bun before running the declared scripts; do not regenerate the lockfile with npm. Production and PostgreSQL integration checks require a real PostgreSQL instance and DATABASE_URL. The Cloudflare Worker requires API_ORIGIN to be configured as a Worker secret or environment binding pointing to the Express API origin; requests return 503 when it is absent rather than forwarding to the Worker itself.
