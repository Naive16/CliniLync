# CLINILYNC Security Architecture

## 1. Authentication Foundation
- **Credentials Storage:** Passwords hashed using PBKDF2 with SHA-256, 100,000 iterations, unique 16-byte salt per user. Timing-safe byte comparison (`crypto.timingSafeEqual`) prevents timing attacks.
- **Session Architecture:** Cryptographically random session tokens (256-bit entropy).
- **Session Expiration:** Standard 8-hour clinical shift sliding expiry; idle session timeout after 30 minutes of inactivity for compliance.
- **Transport Security:** Strict Bearer token authorization and HTTP-only secure cookie support.

## 2. Multi-Level Authorization Model
Authorization requires passing THREE consecutive gates:
```
Request Incoming
  │
  ▼ Gate 1: Organization Context Gate
  Is the user a member of the requested organization?
  Is the resource owned by this organization?
  [FAIL] ➔ 403 Forbidden + Audit Breach Log
  │
  ▼ Gate 2: RBAC Permission Gate
  Does the user's active role(s) possess the required permission (e.g., clinical.create)?
  [FAIL] ➔ 403 Forbidden + Audit Denied Log
  │
  ▼ Gate 3: Resource-Level Access Gate
  Does the user have a legitimate relationship to the specific resource?
  - Doctor: Assigned to patient or department
  - Patient: Can ONLY access their own patient ID and released records
  - Staff: Restricted by department / shift status
  [FAIL] ➔ 403 Forbidden
  │
  ▼
  Allow Mutation / Query
```

## 3. Immutable Audit Logging
- Every read of PHI (Protected Health Information) and write to clinical/financial data is logged.
- Audit records contain:
  - `actor_id` (User ID)
  - `actor_role`
  - `organization_id`
  - `action` (e.g., `patient.view`, `clinical.finalize`, `auth.login`)
  - `resource_type` (e.g., `Patient`, `ClinicalRecord`, `Invoice`)
  - `resource_id`
  - `timestamp` (ISO 8601 UTC)
  - `ip_address`
  - `user_agent`
  - `metadata` (JSON payload of changed keys or search filters, redacting passwords/keys)
- Audit log records are append-only. No UPDATE or DELETE operations are permitted on `audit_logs`.
