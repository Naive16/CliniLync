# CLINILYNC Testing & Quality Assurance Foundation

Healthcare systems demand rigorous, reproducible test suites covering security invariants, data isolation, and clinical access rules.

---

## 1. Test Pyramid & Scope

CLINILYNC employs a prioritized testing architecture:

1. **Security & Cryptography Tests (`tests/auth.test.ts`):** Validates password hashing, timing-safe equality, token entropy, and session expiry.
2. **RBAC Engine Tests (`tests/rbac.test.ts`):** Tests that granular permissions are evaluated correctly across all system roles.
3. **Multi-Tenancy Isolation Tests (`tests/organization-isolation.test.ts`):** Proves that an actor authenticated in Organization A receives `403 Forbidden` when attempting to access Organization B resources.
4. **Resource-Level Access Control Tests (`tests/resource-access.test.ts`):** Verifies role boundaries within an organization (e.g., Billing staff cannot read clinical encounter notes; Nurses cannot edit financial ledgers).
5. **Audit Logging Tests (`tests/audit-logging.test.ts`):** Ensures that read/write operations generate immutable audit records with sanitized metadata.

---

## 2. Running Automated Tests

```bash
# Execute full automated test harness
npm test

# Expected Output:
# [CLINILYNC Migrations] Applying migrations...
# [CLINILYNC Seed] Seeding organizations...
# [PASS] Auth - PBKDF2 Hashing and Constant-Time Verification
# [PASS] Auth - Session Store Creation and Invalidation
# [PASS] RBAC - Clinician Authorized Permissions Granted
# [PASS] RBAC - Unauthorized Persona Access Rejected
# [PASS] Tenancy - Authorized Intra-Organization Access Allowed
# [PASS] Tenancy - Cross-Organization Resource Access Strictly Blocked (403 Forbidden)
# [PASS] RLAC - Billing Staff Restricted from Clinical Notes
# [PASS] RLAC - Nursing Staff Restricted from Financial Invoices
# [PASS] Audit - Append-Only Logging and Metadata Sanitization
# TEST SUMMARY: 9 Passed, 0 Failed
```

---

## 3. Mandatory Invariants for New Features
Every PR or module addition must verify:
- Cross-tenant boundary enforcement.
- Granular permission check prior to data mutation.
- Audit event generation for clinical, identity, and billing actions.
