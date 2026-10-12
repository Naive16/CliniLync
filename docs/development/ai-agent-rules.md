# CLINILYNC AI Agent Development Rules & Governance

All future AI agents (Google AI Studio, Claude, GitHub Copilot, Codex, etc.) working on the CLINILYNC codebase MUST strictly obey the following 14 governance rules:

---

## The 14 Inviolable Rules

1. **Read Architecture First:** Always inspect `docs/architecture/` and `docs/security/` before proposing or making changes to the codebase.
2. **Read Relevant Domain Documentation:** Review the specific domain model and entity catalog in `docs/database/` and `docs/api/` prior to adding domain endpoints.
3. **Never Bypass Authorization:** Client-side checks are purely for UI convenience. Every backend endpoint MUST strictly enforce authentication, tenancy checks, and permission verification.
4. **Never Expose Sensitive Healthcare Data:** Keep Protected Health Information (PHI) masked in application logs and unhandled error responses.
5. **Never Introduce Unnecessary Dependencies:** Do not add third-party libraries without explicit architectural justification. Prefer standard web and Node.js APIs.
6. **Never Change Database Schema Without a Migration:** Manual schema tampering is prohibited. All DDL modifications must be committed as numbered, forward SQL scripts in `database/migrations/`.
7. **Never Modify Security Architecture Casually:** Cryptographic functions, session handling, RBAC, and RLAC must follow established patterns without ad-hoc shortcuts.
8. **Never Remove Audit Logging:** Protected health record reads, writes, finalizations, and billing transactions MUST produce append-only audit records.
9. **Never Destroy Existing Functionality:** Preserve working architectural foundations. If refactoring is necessary, provide architectural rationale first.
10. **Never Implement Unrelated Features:** Keep engineering work strictly bounded to the phase or task requested by the user.
11. **Never Make Assumptions About Healthcare Regulations:** CLINILYNC is a global platform. Do not hardcode US-only (HIPAA/NPI), UK-only (NHS), or country-specific assumptions into core domain tables.
12. **Never Commit Secrets:** API keys, database credentials, and session secrets must reside strictly in environment variables; `.env.example` must contain only placeholders.
13. **Run Relevant Tests Before Completing:** Always execute `npm test` and build checks before concluding an engineering turn.
14. **Keep Changes Scoped:** Do not engage in unsolicited full-repository rewrites. Ensure all edits are modular, surgical, and test-verified.
