# CLINILYNC Multi-Tenancy Architecture

## 1. Principles of Tenant Isolation

CLINILYNC is an enterprise multi-tenant platform where multiple healthcare systems, hospitals, and outpatient clinics coexist on a shared relational infrastructure while maintaining complete logical, operational, and clinical isolation.

### The Golden Tenancy Rule
**No user or client request can ever query, mutate, or observe another organization's records unless an explicit, auditable authorization relationship is established.**

---

## 2. Organization Context Resolution

A critical vulnerability in multi-tenant SaaS occurs when systems blindly trust a client-supplied parameter (such as `X-Organization-Id` or query string `?orgId=...`). CLINILYNC implements server-side membership validation:

```mermaid
sequenceDiagram
    autonumber
    Client as Browser / iOS App
    participant Edge as Edge Gateway
    participant TenantGuard as Tenancy Guard Middleware
    participant SessionStore as Session Store
    participant DB as PostgreSQL 16+

    Client->>Edge: Request with Header: X-Organization-Id: org_metro_health
    Edge->>TenantGuard: Pass Session Token & Target Org ID
    TenantGuard->>SessionStore: Validate Session & Retrieve User ID
    TenantGuard->>DB: Query Membership (user_id, organization_id, status)
    alt User is ACTIVE Member of Target Org
        DB-->>TenantGuard: Membership Confirmed (Role, Permissions)
        TenantGuard->>TenantGuard: Bind Active Org Context to Request Context
        TenantGuard-->>Edge: Proceed to Domain Services
    else User is NOT Member of Target Org
        DB-->>TenantGuard: Zero Rows Returned
        TenantGuard->>DB: Log CRITICAL "security.tenant_breach_attempt"
        TenantGuard-->>Client: 403 Forbidden (FORBIDDEN_ORGANIZATION_ISOLATION_VIOLATION)
    end
```

---

## 3. Database-Level Isolation Safeguards

1. **Mandatory Foreign Key Column:** Every organization-owned table contains a non-nullable foreign key `organization_id UUID NOT NULL REFERENCES organizations(id)`.
2. **Query Parameter Injection:** Domain repositories automatically append `WHERE organization_id = $1` to every `SELECT`, `UPDATE`, and `DELETE` query, pulling the UUID directly from the verified server-side `SecurityContext`.
3. **Compound Unique Constraints:** Natural identifiers are scoped to the tenant:
   - `UNIQUE (organization_id, mrn)` on `patients`
   - `UNIQUE (organization_id, invoice_number)` on `invoices`
   - `UNIQUE (organization_id, code)` on `departments` and `services`

---

## 4. PostgreSQL Row-Level Security (RLS) Integration

For defense-in-depth against accidental application developer omissions, CLINILYNC supports native PostgreSQL Row-Level Security (RLS):

```sql
-- Enable RLS on core clinical and financial tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policy using connection-local session settings
CREATE POLICY tenant_isolation_policy ON patients
    FOR ALL
    USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
```

When connecting via connection pools (Cloudflare Hyperdrive / PgBouncer), each transactional checkout sets the transaction-local variable:
```sql
SET LOCAL app.current_organization_id = 'c1f7b029-4c6e-4c3e-8c34-7c2a792d04a1';
```
Any query attempting to touch a row with a different `organization_id` returns an empty set or error at the database engine level, rendering SQL injection or application-level filtering bugs harmless.
