# System remediation plan — fix before data buildout (2026-08-09)

Operator directive: fix the system before building any more data; all flagged
errors get fixed. This plan sequences every finding from the reading audit
(`docs/audits/full-code-reading-audit-2026-08-09.md`) into landable work, grounds
the P0 security cluster in **live verification** (not grep alone), and names the
subset that must land before authorship resumes.

## The gate

**No authorship / data buildout resumes until the DATA-INTEGRITY SUBSET (§3)
lands and is verified.** Building data on an unsound capture+grounding path
produces corrupt data; filling a platform with confirmed anon-callable admin RPCs
exposes it while we fill it. The rest of the findings are fixed in sequence but do
not all block data — §3 says exactly which do.

## §0 — Live verification results (done 2026-08-09, $0 read-only)

Verify-before-fix, applied to the security cluster before any fix is planned:

| Finding | Status | Evidence |
|---|---|---|
| `admin_set_pause_state` anon-callable (201) | **CONFIRMED** | grantees = `anon,authenticated,service_role`; `reorder_user_list_item` beside it is `service_role`-only (238 did the REVOKE) |
| `gate_a_health` anon-callable + CPU-heavy (226) | **CONFIRMED** | grantees include `anon,authenticated` |
| `create_org_for_self` → platform-admin escalation | **CONFIRMED** | granted to `authenticated`; platform-admin predicate is unscoped `role=ANY('owner','admin')` |
| `set_provenance_status` search_path lost (209 vs 160) | **CONFIRMED** | `proconfig` = UNPINNED (contrast: `admin_set_pause_state` = `search_path=public`) |
| `system_state_flag_audit` no-RLS (201) | **DOWNGRADED** | RLS is already ENABLED; the audit claim was stale |
| provenance-flip GUC staleness (118) | **PENDING** | logic bug; needs a written repro test, not introspection |
| capture-worker 202 terminalization | **PENDING** | needs a live cold-fetch replay (≈$0, plain HTTP) before/after |

Rule for the rest of the campaign: **every P0 is confirmed against the live
system or a written repro before its fix ships.** The stale RLS finding is why.

## §1 — Binding method for every fix

1. Verify-before-fix per P0 (§0 shows why).
2. **$0 only.** No metered API call. Data buildout, when it resumes, runs on the
   canonical pipeline via a session-transport seam (`docs/plans/fleet-cost-control-plan-2026-08-08.md`),
   not the fleet — the pipeline touches each document ~once instead of 164 turns.
3. Small PR, CI green, self-merge (repo has no `--auto`; watch + merge on green).
4. Site-code changes need operator sign-off (standing rule).
5. **Class-fix-as-gate.** The root cause is soft gates for hard rules; every phase
   that fixes a class also wires the detector so the class cannot regress.
6. Relay from `wt-adr016-ft`, blocks `&&`-chained (fail-stop).
7. DDL two-track: schema/grant migrations apply via Supabase MCP with an
   inline read-back verification, before/independent of dependent code.

## §2 — Full phased sequence (all findings)

**Phase 1 — Baseline & make the gates real** (do first; $0; protects everything after)
- Establish the CI-green baseline on master; record what is actually wired.
- Turn the **dropped-error probe HARD, diff-gated**: baseline the existing ~60
  instances, fail CI only on NEW ones. (Sweep of the baseline is Phase 6.)
- **Wire the 12 goldens + 13 unrun audits** into CI (report-only first if red,
  promote to hard as each goes green) — closes the "ENFORCED but runs nowhere" class.
- Fix **RD-19 worktree isolation** path compare (`--path-format=absolute`) + add
  the mixed-path fixture the current test lacks.
- Close the **skill-gate / skill-map** bypasses (path normalization; `rm -fr`,
  `sed -i`/`tee`/`>>` on governed files; `node -e` writes; broaden verb forms).
- Proxy `schema`/`storage` in **`db.mjs` readClient()**; add the 3 append-only
  tables to `DELETE_PROTECTED_TABLES`.

**Phase 2 — P0 security** (migration PR + edge-fn PR + one operator decision)
- `admin_set_pause_state` (201) + `gate_a_health` (226): `REVOKE … FROM PUBLIC,
  anon, authenticated` mirroring 238 — **after** confirming no legitimate
  authenticated caller (admin routes call these server-side/service-role; verify
  `gate_a_health`'s callers first, move any client call server-side).
- `set_provenance_status` (209): re-add `SET search_path = public, extensions,
  pg_temp`.
- `create_org_for_self` escalation: **do NOT revoke the grant** (self-service org
  creation is a real feature) — fix the **platform-admin predicate** to an
  explicit allowlist. *Operator decision required: who are the platform admins?*
- `capture-worker` auth: shared-secret header + pause-flag (kill-switch) read +
  `status='active' AND admin_only=false` eligibility gate. *Needs a worker-secret env.*

**Phase 3 — P0 capture (the 202 fix; highest leverage in the audit)**
- Edge fn: classify HTTP 202 / 2xx-warm-up as **re-queue** bounded by
  `attempt_count`; add a stale-`fetching` reaper; charset-aware decode
  (`decodeHtmlBytes`); content-type **allowlist**; compare-and-swap queue claim.
- Src classifier `transport-escalation.mjs`: add the 202 class + delayed-retry rung.
- **Prove live**: replay a cold EUR-Lex fetch before/after; the "dead domain" the
  fleet routed around should reopen. This is the fix that un-blocks the largest corpus.

**Phase 4 — P0 pipeline integrity** (the backstops that decide "verified")
- `generate-brief.ts eraseStep`: capture each write error, throw RetryableError,
  confirm the null by read-back — close the fail-open on the integrity gate.
- Grounding gate-A: compute state from apply-confirmed rows, not the in-memory
  set — close the phantom-coverage pass.
- Provenance-flip GUC (118): write the repro test (§0 PENDING), then clear the GUC
  at stamp-scope end or add a freshness token.

**Phase 5 — P1 dropped-error sweep** (mechanical, file-family PRs, gated by Phase 1)
- `supabase-server.ts` family first (the post-mortem's own file), then the
  community/workspace routes (45 instances), then `canonical-pipeline.ts`, admin
  components, stores. Each: add `error` capture + log; no behavior change beyond
  surfacing failures. The Phase-1 hard probe measures each PR.

**Phase 6 — P1 correctness rulings** (per-area PRs, some need operator calls)
- Timezone/#418 recurrences → route through the one UTC-safe `formatDate`.
- Counts-from-visible-rows violations (dashboard) → bind to RPC aggregates.
- Vocab drift (item_type `law`, severity short-keys, `workflow_gap` in the route
  allowlist) → align to DB CHECK.
- Optimistic-rollback races (stores, useListOrder) → field-wise rollback.
- Index-vs-detail classifier disagreements (market/operations/research) → shared
  classifier module.

**Phase 7 — P2 hygiene** — batched once P0/P1 land.

**Phase 8 — Capabilities inventory** (`docs/inventories/capabilities.md`, no code) —
the living map of what exists, so buildout designs from assets, not from the
problem. Prevents recurrence of the fleet-built-beside-the-pipeline class.

**Then, and only then: data buildout resumes** — via the canonical pipeline's
$0 session-transport path, with per-item `UsageTelemetry` (already built) reporting
exact cost, on a capture path that no longer wedges on a 202.

## §3 — The data-integrity subset (BLOCKS buildout; ~5 small PRs)

Not all 8 phases must land before data resumes. This subset must, because each one
left unfixed corrupts or exposes the data we would build:

1. **Phase 3 (capture 202 + charset)** — else stored captures wedge or store
   mojibake the grounder can't span-match: corrupt data at the source.
2. **Phase 4 (eraseStep + gate-A)** — the backstops that decide what becomes
   `verified`; unsound, every new item's status is untrustworthy.
3. **Phase 2 security (the 3 confirmed grants/predicate + search_path)** — anon can
   drive admin RPCs on the platform while we fill it.
4. **Phase 1 hard dropped-error gate** — so the sweep and every new fix can't
   silently reintroduce the class.

Phases 5–8 proceed in parallel or after; they harden and clean, but the four above
are the wall before authorship.

## §4 — Operator decisions needed to start

1. **Platform-admin allowlist** — who are the platform admins? (org id / profile
   flag) — gates the `create_org_for_self` escalation fix.
2. **Sign-off to apply the grant/search_path DDL** via Supabase MCP (read-back
   verified, reversible).
3. **Worker-secret env** for the capture-worker auth fix (name + set the secret).
4. **Go on Phase 1** — the $0 gate-wiring work needs no decision beyond "start."

Everything here is $0 and reproducible from a clean checkout; nothing rests on this
session's memory.
