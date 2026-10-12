# CLINILYNC REST API Specification

All endpoints are hosted on the primary domain under `/api/v1/*` or `/api/*`.

### Headers Contract
- `Authorization: Bearer <session_token>`
- `X-Organization-Id: <organization_uuid>` (Contextual organization identifier)
- `Content-Type: application/json`

### Error Envelope Contract
```json
{
  "error": {
    "code": "FORBIDDEN_ORGANIZATION_ACCESS",
    "message": "User is not authorized to access resources for this organization",
    "status": 403,
    "timestamp": "2026-10-08T16:55:00.000Z"
  }
}
```

### Core API Groups
- `POST /api/auth/login`: Authenticate email/password. Returns token, user, organizations, roles, permissions.
- `POST /api/auth/logout`: Invalidate session.
- `GET /api/auth/me`: Retrieve active security context.
- `POST /api/auth/switch-org`: Switch active organization context.
- `GET /api/organizations`: List organizations accessible to current user.
- `GET /api/patients`: Search/list patients within active organization (RBAC: `patient.view`).
- `GET /api/patients/:id`: Fetch patient details and clinical summary.
- `POST /api/patients`: Register new patient intake (RBAC: `patient.create`).
- `GET /api/appointments`: List appointments with filters for date, provider, status.
- `POST /api/appointments`: Book appointment (RBAC: `appointment.create`).
- `PATCH /api/appointments/:id/status`: Transition appointment status (`checked_in`, `in_consultation`, `completed`, `cancelled`).
- `GET /api/clinical/records`: List encounters for a patient (RBAC: `clinical.view`).
- `POST /api/clinical/records`: Create new encounter / SOAP note (RBAC: `clinical.create`).
- `POST /api/clinical/records/:id/finalize`: Sign and finalize clinical encounter (RBAC: `clinical.finalize`).
- `GET /api/billing/invoices`: List organization invoices (RBAC: `billing.view`).
- `POST /api/billing/invoices`: Create invoice (RBAC: `billing.create_invoice`).
- `POST /api/billing/invoices/:id/payments`: Record payment (RBAC: `billing.record_payment`).
- `GET /api/portal/my-profile`: Patient self-service profile.
- `GET /api/portal/my-appointments`: Patient self-service appointments.
- `GET /api/portal/my-records`: Patient self-service released clinical records & lab results.
- `GET /api/portal/my-invoices`: Patient self-service invoices.
- `GET /api/admin/audit-logs`: Immutable audit log stream (RBAC: `audit.view`).
- `GET /api/admin/users`: List users and assigned roles (RBAC: `user.view`).
