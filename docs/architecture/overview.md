# CLINILYNC System Architecture Overview

## 1. High-Level Architecture
CLINILYNC is structured as a unified, same-domain full-stack platform:
```
                    [ clinilync.com ]
                           │
      ┌────────────────────┴────────────────────┐
      ▼                                         ▼
[ Web Application (React SPA) ]          [ API & Services (REST) ]
  • /login   - Auth Portal                 • /api/v1/auth/*
  • /app/*   - Staff Platform              • /api/v1/patients/*
  • /admin/* - Org & System Admin          • /api/v1/appointments/*
  • /patient/* - Patient Portal            • /api/v1/clinical/*
                                           • /api/v1/billing/*
                                           • /api/v1/audit/*
                                                │
                                                ▼
                                    [ Security Engine ]
                                      • Tenancy Isolation
                                      • RBAC Permission Guard
                                      • Resource Access Gate
                                      • Immutable Audit Logger
                                                │
                                                ▼
                                    [ PostgreSQL Relational DB ]
```

## 2. Same-Domain Routing Policy
All user experiences operate on the single domain `clinilync.com`:
- `/` - Landing & Platform Overview
- `/login` - Unified Sign-in Portal
- `/app` - Healthcare Staff Experience (CRM, EMR, Schedule, Billing)
- `/admin` - System & Organization Administration
- `/patient` - Patient Portal (Self-Service Care Portal)
- `/api/*` - API Layer

## 3. Edge & Cloudflare Infrastructure Strategy
CLINILYNC leverages Cloudflare as its primary edge infrastructure:
- **Cloudflare Workers**: Edge API gateway, TLS termination, DDoS defense, WAF rules.
- **Security Headers**: HSTS, CSP, X-Frame-Options (`DENY` for clinical data, frame-ancestors for approved integrations), Referrer-Policy.
- **Edge Rate Limiting**: Token-bucket rate limiting at the edge to protect login endpoints from brute-force attempts.
- **Cloudflare Hyperdrive / TCP Proxy**: Low-latency pooled database access to PostgreSQL.

## 4. Mobile Architecture (Future iOS / Android)
- Native mobile applications (e.g., Swift/SwiftUI iOS app, Kotlin Android app) connect directly to `/api/v1/*`.
- Token-based Bearer authentication (same session engine).
- Zero mobile-specific backend silos: The same domain model, permissions, and audit trails apply uniformly.
