# 2026-10-01, lane W2-R2 (ASSUMPTION-REGISTER)

## Accomplished

Built the per-tenant planning-assumption register (docs/specs/03-research.md section 5): producer,
API, settings UI, and reader for lane W2-R's planning-assumption-shift renderer.

**Correction, surfaced before building (rule 14: a finding is a hypothesis until verified; this one
verified as true and changed the plan).** The dispatch said to grep `assumption_register` and build
against what it found. That table (migration 271, WO-20) is a DIFFERENT object: the register for
modelling constants this product chose (a connection-scorer weight, an idf coefficient), read-only to
authenticated, no `org_id` column at all, no write policy of any kind. Spec 03-research.md section 10
itself says, verbatim: "Assumption register | Absent. Per-tenant object does not exist." Building
member-writable CRUD on top of migration 271's table would have violated its documented posture and
conflated two unrelated registries under one name. Instead this lane adds a NEW table,
`planning_assumption_register` (migration 345), for the per-tenant object, and leaves migration 271
untouched. Recorded in `src/lib/assumptions/contract.mjs`'s header, the migration's own header, and
here.

## Built

- `fsi-app/src/lib/assumptions/contract.mjs` + `contract.test.mjs`: the assumption shape (name,
  quantified value with unit, what it sits under, load-bearing + vulnerable flags, review date,
  source note), `validateAssumptionInput`, `isAtRisk` (spec section 7 #7's load-bearing x vulnerable
  binding). 14 pure tests, all green.
- `fsi-app/src/lib/assumptions/row.mjs` + `row.test.mjs`: DB row <-> API shape mapping. 4 tests.
- `fsi-app/src/lib/assumptions/read.ts`: `readWorkspaceAssumptions` / `readAtRiskAssumptions`, the
  reader for lane W2-R's renderer. Fail-soft to `[]`, bounded read (200 cap, F38 convention).
- `fsi-app/src/app/api/workspace/assumptions/route.ts` + `logic.ts` + `logic.npmtest.mjs`: GET/POST/
  PATCH/DELETE under `requireUserRoute`, org-scoped via `resolveOrgIdFromUserId`, writes through
  `getServiceSupabase()` with explicit `.eq("org_id", ...)` belt-and-suspenders on update/delete. 12
  jiti-backed tests against a fake client (validation-before-write, org-scoping, 404 on cross-org id,
  500 on DB error).
- `fsi-app/src/components/settings/AssumptionRegisterSection.tsx` + `.npmtest.mjs`: list, add form,
  delete, LOAD-BEARING marker gated on `loadBearing && vulnerable`. Mounted in `SettingsPage.tsx` as a
  new anchored section (`id="assumptions"`, ruling R7's "leave it and list it" pattern, no artboard
  region exists for this). 6 structural tests.
- `fsi-app/supabase/migrations/345_planning_assumption_register.sql`: schema-only, NOT applied by this
  lane (two-track policy). SQL below for the coordinator.

## Consumers checked

`grep -rn "assumption_register" fsi-app/src fsi-app/scripts` before building: zero existing readers
or writers of migration 271's table anywhere in application code (only the migration file itself and
its own generator/test, already deleted per that migration's header). No consumer to break by adding
a second, differently-named table.

## ADRs checked

`grep -ril -i assumption docs/decisions/` found `ADR-025-deterministic-derivations-auto-adopt.md`
(unrelated: auto-adoption thresholds for a different pipeline). No ADR governs the per-tenant
assumption register's shape; none blocks this migration.

## Migration 345 SQL

See `fsi-app/supabase/migrations/345_planning_assumption_register.sql`, pasted verbatim in the lane's
final report to the coordinator for apply via the Supabase CLI.

## UX compliance

- **Primary goal**: see and manage the workspace's standing planning assumptions.
- **Path**: Settings -> scroll to "Assumption register" (or jump via the section index) -> read the
  list, or click "Add assumption" -> fill four required fields (what you assume, what it sits under,
  review date, the two flags) -> Save.
- **One primary action**: "Add assumption" (secondary: per-row delete, quieter icon-only control).
- **Feedback states**: loading shows "Loading assumption register..."; save shows "Saving..." then a
  success toast or an inline, draft-preserving error list naming exactly what to fix; delete shows a
  disabled icon while in flight and a toast on completion or failure.
- **Empty state**: names what to enter and why ("Research so-whats bind to these..."), never a bare
  "no data" (ux-laws #10/#15).
- **Size floor**: every button >=44px tall; the one icon-only control (delete) is 24px with an
  `aria-label` (law 2's second branch).

## Open items

- Migration 345 needs the coordinator's apply before the API/UI can read or write anything live (two-
  track policy; this lane cannot touch the live database). [CLOSED: PR 1013]
- Lane W2-R (planning-assumption-shift renderer) can now import `readWorkspaceAssumptions` /
  `readAtRiskAssumptions` from `src/lib/assumptions/read.ts`; file-boundary held, `src/lib/research/**`
  untouched by this lane. [NOT-WORK: fact, no action]
- No sprint-N followups.md applies to this lane (wave-based dispatch, not Sprint 1/2 phase work); DP-2
  (ux-laws) addressed above, DP-1 not applicable (customer-facing settings surface, not an operator
  review surface). [NOT-WORK: fact, no action]
