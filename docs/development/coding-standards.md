# CLINILYNC Coding Standards & Engineering Conventions

To maintain healthcare-grade security, readability, and long-term maintainability, all engineers and AI agents must adhere to the following standards.

---

## 1. Core Principles
- **Security Over Speed:** Never bypass authentication, authorization, tenant isolation, or audit logging.
- **Data Integrity Over Convenience:** Always maintain foreign key constraints and transactional integrity.
- **Predictable Error Handling:** Never expose SQL errors, database credentials, internal traces, or unmasked patient health data to clients.

---

## 2. TypeScript & Code Style
- Use standard TypeScript with strict type checking.
- Do not use `any` when explicit domain types or generics can be written.
- File and directory names: Use lowercase kebab-case for files (e.g., `resource-access.ts`, `patient-details.tsx`).
- Variables and functions: Use `camelCase`.
- Classes and React components: Use `PascalCase`.
- Constants and Enums: Use `UPPER_SNAKE_CASE` or typed object maps (e.g., `Permissions.PATIENT_VIEW`).

---

## 3. Server-Side Module Flow
Every backend feature must follow the unidirectional modular pattern:
```
HTTP Request
  ↓
1. Request ID & Correlation Middleware
  ↓
2. Authentication & Session Validation
  ↓
3. Organization Context Verification (Tenant Isolation)
  ↓
4. Request Body / Query Validation (Validation Layer)
  ↓
5. Authorization Check (RBAC & RLAC)
  ↓
6. Domain Service Execution
  ↓
7. Repository Layer (PostgreSQL Query Execution)
  ↓
8. Audit Trail Emission (for security/clinical/financial events)
  ↓
HTTP Response (with correlation ID)
```

---

## 4. Frontend Architecture Standards
- Centralized API Client: Components must use the typed API client (`src/api/client.ts`) rather than executing ad-hoc `fetch()` calls.
- Role-Aware UI: The `<Can permission="...">` component conditionally renders UI elements for visual clarity, but never replaces server-side authorization.
- Design System: Reuse components from `src/components/` (Button, Input, Card, Badge, Modal) rather than creating divergent ad-hoc components.

---

## 5. Security & Cryptography
- Passwords must be hashed using PBKDF2 with SHA-256 and unique salts.
- String comparisons for credentials or security tokens must use `crypto.timingSafeEqual` to prevent timing attacks.
- Never log patient personal identification or health data in plaintext server logs.
