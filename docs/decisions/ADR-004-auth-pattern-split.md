---
id: ADR-004
title: Auth pattern split (isPlatformAdmin vs WORKER_SECRET)
status: accepted
date: 2026-05-20
scope:
  - "fsi-app/src/app/api/admin/"
  - "fsi-app/src/app/api/worker/"
# future_scope (auth helper files may consolidate here when extracted):
#   - fsi-app/src/lib/auth.ts
#   - fsi-app/src/lib/auth-server.ts
# Today, auth gates live inline at each route or via the requireAuth/isPlatformAdmin
# functions that route handlers import. F2 fitness function enforces the dichotomy
# regardless of where the auth functions are defined.
supersedes: null
related: []
---

## Context

The fsi-app/ codebase has two architecturally distinct request shapes hitting `/api/admin/*` routes:

1. **User-initiated admin actions**: an authenticated human operator clicks "approve" in CanonicalSourceReview; the browser POSTs to /api/admin/canonical-sources/decide; the request carries an Authorization Bearer token from Supabase auth.

2. **Scheduled internal jobs**: Vercel Cron POSTs to /api/admin/q7-daily-recompute on a schedule; no human user; the request carries an `x-worker-secret` header matching `process.env.WORKER_SECRET`.

These have different threat models. User actions need session-bound authentication + role check. Scheduled jobs need a single-secret bypass for server-to-server traffic that can't carry a user session.

Some routes are explicitly worker-secret-gated by design (Q7 cron, recompute-trust, spot-check/recurring). F2 fitness function would have flagged them as missing isPlatformAdmin without an exemption.

## Decision

Two parallel auth patterns, intentionally:

- **User-admin routes** (most of /api/admin/*): require `isPlatformAdmin` gate after `requireAuth`. Enforced by F2 fitness function.
- **Cron/internal routes** (3 explicitly enumerated): require `x-worker-secret` header matching `WORKER_SECRET` env var. Listed in F2's `WORKER_SECRET_ALLOWLIST`. Adding a new worker-secret route requires updating the allowlist.

The exemption list is finite and explicit:
- `/api/admin/recompute-trust`
- `/api/admin/q7-daily-recompute`
- `/api/admin/spot-check/recurring`

The shared route prefix (`/api/admin/`) for both patterns is a historical accident from before this distinction was named; renaming the worker-secret routes to `/api/worker/*` was considered but rejected (would break the Vercel Cron config without proportional benefit). The path-based allowlist preserves the boundary.

## Consequences

- F2 fitness function enforces the dichotomy mechanically. Adding a new admin route without isPlatformAdmin fails. Adding a new worker-secret route requires updating F2's allowlist (visible in code review).
- Worker-secret rotation is one ENV var change; isPlatformAdmin role changes require Supabase profile updates. Different operational shapes.
- Threat model: worker-secret-gated routes are exposed publicly but only callable with the secret. Leaking the secret = full access to those routes. Operator rotates if leaked.

## Alternatives Considered

- **Single auth pattern (isPlatformAdmin for everything)**: rejected. Cron jobs can't carry user sessions; would require fake service-account auth, more complex.
- **JWT for worker auth (signed token)**: deferred. Single secret is simpler; revocation is rotate-the-env-var. JWT becomes worthwhile when worker count grows or per-job scoping matters.
- **Separate /api/worker/* prefix**: considered, rejected for path-rewrite cost.

## References

- F2 fitness function: `fsi-app/.discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.mjs`
- WORKER_SECRET env var (set in Vercel deployment + local .env.local)
- Q7 daily cron config: `fsi-app/vercel.json` crons array
- Track B-code admin gating sweep: commit 4c7b546 (the canonical enumeration that surfaced this distinction)

## Related

- [[ADR-005-discipline-enforcement-layered-architecture]] — F2 admin-routes-isPlatformAdmin is a surviving Layer-2 fitness function in ADR-005's discipline engine
- [[discipline]] — F2 fitness function enforcing the dichotomy is tracked in the discipline inventory
- [[SPOT-CHECK-PROCEDURE]] — the /api/admin/spot-check/recurring worker-secret-gated route in this ADR's allowlist is run per this runbook
- [[WORKER-ACTIVATION-AUDIT-2026-05-08]] — shared WORKER_SECRET / worker-route surface that this ADR's cron exemption list gates
- [[auth-architecture-audit-2026-05-10]] — same auth subsystem; audit of the admin-route auth architecture this ADR formalizes
