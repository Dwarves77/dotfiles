# Lane L04-api-B — Full-Read Audit Report

Repo: /root/work/dotfiles/fsi-app. 16 files, all read in full.

---

## Per-file verdicts

### src/app/api/orgs/[org_id]/invitations/[id]/route.ts — WORKING-WIRED — DELETE: admin revokes a pending org invitation (status='revoked' via `revoke_invitation` RPC, not a row delete)
- WIRING: refs=0 is expected — this is a Next.js file-route entry point (App Router), not a symbol anything imports. Reached via `DELETE /api/orgs/[org_id]/invitations/[id]`.
- NOTE: `org_invitations` has 0 live rows (table-usage.txt) — this revoke path, and the RPC + defense-in-depth org-match check it exercises (lines 33-66), has not run against real data in production.

### src/app/api/orgs/[org_id]/invitations/route.ts — WORKING-WIRED — POST creates an org invitation, GET lists an org's invitations (both admin-gated by RLS)
- WIRING: refs=0 expected (file-route entry point).
- NOTE (line 6-10, 112-119): email delivery goes through `sendInvitationEmail`; the header states "No provider is configured today," so delivery honestly reports not-configured and the admin UI falls back to a copy-link. Documented, not a defect.
- NOTE: `org_invitations` has 0 live rows — this create/list path has not been exercised with real data in production (consistent with the [id]/route.ts finding above — the whole invitation feature appears unused).
- Lazy-expiry computation on GET (lines 168-175) is presentation-only (does not write the row); correctly scoped.

### src/app/api/orgs/[org_id]/members/route.ts — WORKING-WIRED — GET/PATCH/POST/DELETE/PUT: org membership roster, role changes, org-scoped ban, revoke, add-by-email
- WIRING: refs=0 expected (file-route entry point).
- NOTE: dual-authority model (workspace owner OR platform admin) documented and consistently applied via `requireOwnerOrPlatformAdmin` across PATCH/POST/DELETE/PUT.
- No defects found. Last-owner demotion/ban/revoke guards all fail-closed on unverifiable owner counts (lines 255-262, 379-384, 502-509) rather than defaulting a swallowed count to 0/pass.
- Ban-then-delete ordering (lines 393-418) is correctly sequenced so a delete cannot succeed while a ban insert fails (would allow rejoin).

### src/app/api/orgs/[org_id]/route.ts — WORKING-WIRED — GET returns org identity + owner/member-count, PATCH updates name/slug (owner-only)
- WIRING: refs=0 expected (file-route entry point).
- No defects found. Slug uniqueness violation (23505) is mapped to 409 with the verbatim message (lines 236-244); empty-patch is rejected (222-227) rather than silently bumping `updated_at`.

### src/app/api/orgs/route.ts — WORKING-WIRED — POST: self-service org creation via `create_org_for_self` RPC (owner + default workspace_settings seeded transactionally)
- WIRING: refs=0 expected (file-route entry point).
- No defects found.

### src/app/api/telemetry/error/route.ts — WORKING-WIRED — POST: client-side error ingest into `error_events` via `captureError`
- WIRING: refs=0 expected (file-route entry point).
- NOTE (lines 10-12): pre-auth pages (/login, /signup) are explicitly NOT covered — documented as an accepted deviation, not a defect.
- NOTE (lines 20-23): capture failures are swallowed inside `captureError` by design ("permitted telemetry-loss swallow class"), route always returns 204. This is a documented, intentional fail-open for telemetry only (not a customer-data write path).

### src/app/api/user/list-order/route.ts — WORKING-WIRED — GET/PATCH/DELETE: personal (non-org-scoped) drag ordering over `user_list_order`
- WIRING: refs=0 expected (file-route entry point); wrapped by `withErrorCapture`.
- NOTE: `list_key` is an explicit allowlist (`LIST_KEYS`, lines 29-38) rather than free text, preventing unbounded key growth. `p_user_id` is always taken from the authenticated session, never the body (documented rationale lines 19-23) — correct, since the RPC is SECURITY DEFINER.
- NOTE: `user_list_order` has 0 live rows (table-usage.txt) — this fully-implemented feature (migrations 237/238) has not been exercised in production.
- No defects found.

### src/app/api/version/route.ts — WORKING-WIRED — GET: deployed build identity (commit/ref/repo/env), public/unauthenticated by design
- WIRING: refs=0 expected (file-route entry point). Justification for unauthenticated access is documented in-file (lines 6-11) per the stated API Security Policy exception process.
- No defects found.

### src/app/api/watchlist/route.npmtest.mjs — TEST — pins `ITEM_TYPES`, `TEAM_ONLY_TYPES`, `isTeamOnlyScopeViolation`, and `teamOnlyError` exported from the real route.ts (not a reimplementation)
- Not vacuous: asserts `market_series` is present in `ITEM_TYPES` (would fail if removed), asserts `TEAM_ONLY_TYPES` contains exactly `market_series` (would fail if the set changed), asserts the violation predicate returns true/false correctly for both scopes, asserts every other item_type is unaffected, and asserts `teamOnlyError`'s status/body content (not just structural shape) names the real item_type and "scope=team" and does NOT read as a generic "invalid type" message. Each assertion has a plausible failure mode it would catch.

### src/app/api/watchlist/route.ts — WORKING-WIRED — GET/POST/DELETE: dual-scope (personal `user_watchlist` / team `org_watchlist`) watchlist reader+writer
- WIRING: refs=0 expected (file-route entry point); wrapped by `withErrorCapture`. Exports `ITEM_TYPES`/`TEAM_ONLY_TYPES`/`isTeamOnlyScopeViolation`/`teamOnlyError` — consumed by the co-located test and (per its own comment, lines 77-86) by `src/lib/watchlist-scope.ts`, which a client component (`WatchButton.tsx`) also imports; this file itself is correctly not imported by client code (server-only deps: `getServiceSupabase`, `revalidateTag`, `requireAuth`).
- NOTE: team-scope write (POST/DELETE with `scope=team`) targets `org_watchlist`, which has 0 live rows (table-usage.txt) despite src=3 references (this route, archive-impact, overrides) — the team-watch feature has not actually been exercised with real writes in production, even though the code path (including the `market_series` team-only gate, lines 58-137) is fully implemented and unit-tested. `user_watchlist` (personal scope) has 1 live row — personal watching is in light real use.
- No defects found. GET deliberately does not apply the team-only gate (documented lines 69-75) since it always reads both scopes regardless of the `scope` query param — consistent with its own stated contract.

### src/app/api/worker/check-sources/route.ts — WORKING-WIRED — POST: cron-invoked monitoring-queue worker; per-source accessibility check + status update + content-change fingerprinting + portal-link discovery
- WIRING: not reachable via static import graph (refs=0, as expected for a worker route) — invoked externally by a scheduled cron job per header comment (line 135) and gated by `workerAuthGuard` (WORKER_SECRET header), consistent with GRAPH:UNREACHABLE-style operator/system invocation.
- NOTE (lines 19-29): comment documents a prior bug fix in this same function — a non-answer (429/5xx/timeout) was previously misclassified as evictable; now routed through `decideSourceAssessment` so only a definitive DEAD (404/410) with a 0 accessible-streak reaches the eviction guard. As currently written this is correct (isAccessible/evictEligible split, lines 55-88).
- NOTE (lines 58-64): `change_detected` was "previously HARDCODED false" and is now computed via `contentFingerprint`/`isContentChange`; downstream auto-action on a detected change is explicitly NOT wired here by design — it is picked up by `/api/worker/reconcile` (below).
- NOTE (lines 106-125): portal-link crawl failure is caught and logged, never fails the accessibility check — correct non-fatal-by-design scoping.
- No defects found in the code as read.

### src/app/api/worker/reconcile/route.ts — WORKING-WIRED — POST: cron-invoked reconcile-loop consumer; claims `monitoring_queue` rows with `change_detected=true` and records `intelligence_changes` via `recordSourceChangeTrigger`
- WIRING: not reachable via static import graph (refs=0) — invoked externally by cron, gated by `workerAuthGuard`, same pattern as check-sources.
- NOTE: idempotency via `reconciled_at` stamping (lines 62-68) is correctly ordered after per-item processing, so a re-run only reprocesses genuinely-unreconciled rows.
- NOTE: `intelligence_changes` (the table this route's per-item work records into, per header comment lines 10-12) has 0 live rows (table-usage.txt). This route itself only reads/writes `monitoring_queue`; the actual `intelligence_changes` insert happens inside `recordSourceChangeTrigger` (src/lib/sources/reconcile.ts), which is outside this lane's file list — I did not read that file, so I cannot confirm from this lane alone whether the insert path is broken or simply has never had a real `change_detected=true` row to process. AMBIGUOUS: flagging for cross-lane follow-up rather than asserting a cause.
- Errors during per-item processing are collected into an `errors` array and returned in the response (not swallowed) — correct.

### src/app/api/workspace/archive-impact/route.ts — WORKING-WIRED — GET: pre-archive warning showing watchers/owner/criticality for an item before a workspace-wide archive
- WIRING: refs=0 expected (file-route entry point); wrapped by `withErrorCapture`.
- NOTE (lines 21-23): explicitly documents that the role check here is advisory UI state only — the real enforcement is in `/api/workspace/overrides`. Correctly framed as non-authoritative.
- NOTE (lines 82-92): comment records a previously-live cross-tenant disclosure bug — an earlier revision filtered watchers by `item_id` alone across the GLOBAL `intelligence_items` corpus, which could return watchers from every org, not just the caller's. The comment states it "never fired" in production (single org, both watchlist tables were empty at the time) but the vulnerable shape was live on master. As read here, the code IS correctly scoped to `org_memberships` intersection (lines 93-125) — this is now fixed, documented as historical.
- No defects found in current code.

### src/app/api/workspace/members/route.ts — WORKING-WIRED — GET: caller-scoped, read-only membership roster for the assignee picker (distinct from the governed `/api/orgs/[org_id]/members`)
- WIRING: refs=0 expected (file-route entry point).
- No defects found.

### src/app/api/workspace/overrides/route.ts — WORKING-WIRED — POST/DELETE: upserts/deletes `workspace_item_overrides` (workspace-wide priority override, archive, dismiss, owner assignment) with role-gated workspace archive + watcher/owner notification fan-out
- WIRING: refs=0 expected (file-route entry point); wrapped by `withErrorCapture`.
- NOTE (lines 89-125): workspace archive correctly role-gates (admin/owner only, fail-closed on `roleErr`), requires a non-empty `archiveReason`, and stamps `archived_by`; restore is deliberately ungated (any member), matching the documented ruling.
- NOTE (lines 141-167): assignee (`ownerUserId`) must hold a membership in the caller's own org — cross-org assignment is refused with a fail-closed 500 on an unverifiable membership lookup, not a silent pass.
- NOTE (lines 187-201): comment records a previously-live cross-tenant disclosure bug in the notification fan-out — the write path used to filter watchers by `item_id` alone (same class of bug as archive-impact.ts above), so watchers in ANY org on the same global `intelligence_items` row could receive a notification containing this org's archive reason/title/archiver identity. States it was "CONFIRMED 2026-08-09" by a prior audit. As read here (lines 195-213), the fan-out is now correctly intersected against `org_memberships` for the caller's org before dispatch — fixed, documented as historical, not a current defect.
- NOTE: `notifications` table has 0 live rows (table-usage.txt) despite this route's `dispatchNotification` call path (POST archive branch, lines 184-240) — consistent with no real workspace-archive-with-watchers event having occurred yet in production (org_watchlist/user_item_state/etc. all show similarly low real usage), not necessarily a dispatch defect. Not independently confirmable from this lane.
- No current defects found.

### src/app/api/workspace/personal-state/route.ts — WORKING-WIRED — GET/POST/DELETE: `user_item_state` reader+writer for per-user (ungated) archive
- WIRING: refs=0 expected (file-route entry point); wrapped by `withErrorCapture`.
- NOTE (lines 24-27): writes always scoped to the authenticated caller's `user_id`, never accepted from the body — correct, matches the "personal action, never a team action" framing in the header.
- NOTE: `user_item_state` has 0 live rows (table-usage.txt) — this fully-implemented personal-archive path has not been exercised in production.
- No defects found.

---

## Lane summary

**Counts by status:**
- WORKING-WIRED: 15
- TEST: 1
- (No DEFECTIVE, INCOMPLETE, STUB, DEAD-HISTORICAL, OPERATOR-TOOL, WORKING-UNWIRED, or TEST-ONLY files in this lane.)

**Findings, ranked by what matters most:**

1. **Four fully-implemented, correctly-authored features have zero live production data**, despite this lane's routes fully implementing read+write for them: `org_invitations` (0 rows, invitation create/list/revoke), `org_watchlist` (0 rows, team-scope watchlist read/write), `user_list_order` (0 rows, personal drag ordering), `user_item_state` (0 rows, personal archive). None of these are code defects — the routes are well-guarded and, where testable, unit-tested — but the org-invitation and team-watchlist features in particular appear never to have been used by a real operator, which is worth an owner sanity-check on whether they're actually reachable/discoverable in the UI.

2. **Two routes carry in-code comments documenting previously-fixed cross-tenant data-disclosure bugs** — `workspace/archive-impact/route.ts` (lines 82-92, watcher lookup scoped by item_id alone across the global item corpus) and `workspace/overrides/route.ts` (lines 187-201, same class of bug in notification fan-out, explicitly tagged "audit finding 17, CONFIRMED 2026-08-09"). As read in this pass, both are now correctly scoped via `org_memberships` intersection. Flagging because the pattern (filtering a cross-org-shared table like `user_watchlist`/`intelligence_items` by `item_id` alone) recurred twice — worth a targeted search of the rest of the codebase for a third instance, outside this lane's scope.

3. **`intelligence_changes` (0 live rows) is the target of `worker/reconcile/route.ts`'s per-item write**, but the actual insert happens inside `recordSourceChangeTrigger` (`src/lib/sources/reconcile.ts`), which is outside this lane. I cannot confirm from this lane alone whether the write path is broken or simply has never had a real `change_detected=true` row to process (change detection itself was "previously HARDCODED false" per `check-sources/route.ts` line 62-64, i.e. a recent addition) — flagged AMBIGUOUS for a lane that reads `src/lib/sources/reconcile.ts`.

4. **`notifications` table (0 live rows) is the target of `workspace/overrides/route.ts`'s archive-notify fan-out** (lines 184-240). Consistent with no real workspace-archive-with-watchers event yet, given the near-zero real usage of the adjacent watchlist/override tables — not independently confirmable as a defect from this lane.

5. Both worker routes (`check-sources`, `reconcile`) are unreachable via the static import graph (refs=0) by design — they are cron-invoked system endpoints gated by `WORKER_SECRET` (`workerAuthGuard`), not code-path dead ends. Confirmed from the routes' own header comments and auth-guard usage, not inferred.

6. Consistent, deliberate fail-closed pattern across every write route touching ownership/role: last-owner demotion/ban/revoke guards in `orgs/[org_id]/members/route.ts` all treat a DB-error or unverifiable count as a refusal (500), never as an implicit pass — no instance of a swallowed error silently permitting a privileged mutation was found in this lane.

7. Org invitation email delivery is honestly not-configured in this environment (`send-invitation-email.ts` seam, per header of `invitations/route.ts`) — the response always carries `email_delivery` so the caller sees the real state rather than a silent no-op; documented by design, not a defect.

8. The co-located test (`route.npmtest.mjs`) is non-vacuous: it imports and exercises the real exported decision functions from `watchlist/route.ts` (not a reimplementation) and asserts both positive and negative cases plus response content, so it would fail on a regression to the `market_series` team-only gating logic.

**Coverage attestation:** files read in full: 16/16, lines read: 3138.
