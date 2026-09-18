# S1 collect: stage audit 2026-09-18

**Method note.** Read `docs/plans/complete-system-build-plan-2026-09-04.md` sections 0, 1, 2 (W1) and 5 in
full; read the 2026-09-05 prior audit's `README.md` and `W1-W2-intake-population.md` in full as claims to
re-check. Read in full: `.github/workflows/source-sweep.yml`, `change-detection.yml`, `source-monitoring.yml`;
`supabase/functions/capture-worker/index.ts` header; migrations 322/323; `scripts/harness-runs/source-sweep/
PENDING-RUN.md` and `change-detection/PENDING-RUN.md`. Grepped and spot-read: `run-source-sweep.mjs`, all 18
`source-sweep-run-*.json` artifacts (config+metrics), all 3 `fetch-drain-run-*.json` artifacts, all 7
`ledger-consume-run-*.json` artifacts, `research-sweep`/`RESEARCH-SWEEP.md`, `primary-fallback.mjs`,
`canonical-fetch.mjs`, `maintenance.yml` (grep for RUN_STEP names), `docs/ops/session-log.md` (targeted grep
on `portal_link_candidates`, per rule 11). Ran read-only SQL (SELECT only, stored `result_chars` column used,
no a length expression over the capture text column scan) against the live Supabase project via `scripts/lib/pg-conn.mjs`, 2026-09-18.
Commit read: `806c0c48` (repo root), tree `wt-session-c`, `fsi-app/` per the common brief.

## The table

| Component | Where (file / workflow / table) | 1 Reachable | 2 Run | 3 Populated | 4 Visible | 5 Gated | 6 Documented | Verdict | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| Source registry + status vocabulary | `sources`, `source_trust_events`; written by admin routes, `canonical-autoverify.mjs`, verification.ts | YES [CONFIRMED] many writers (`src/app/api/admin/sources/*`, `verification.ts`) | YES [CONFIRMED] a provisional row was created today (`max(created_at)=2026-09-18T08:36:17Z`) | YES [CONFIRMED] SQL: `sources` active 1989 / provisional 561 / suspended 22 (total 2572); `source_trust_events` 908 rows (accessibility_check 585, manual_review 296, discovery 24, tier_demotion 3) | PARTIAL [HYPOTHESIS] not customer-facing directly; admin Coverage tab is S5's surface to verify | PARTIAL [HYPOTHESIS] no dedicated fitness function found for registry status transitions in this pass | YES `docs/runbooks/` reference the vocabulary | PARTIAL | live SQL this session; file reads of writer routes |
| `canonical_source_candidates` + `canonical-autoverify.mjs` | `maintenance.yml:823` RUN_STEP `canonical-autoverify`; table `canonical_source_candidates` | YES [CONFIRMED] `maintenance.yml` line 823 | HYPOTHESIS, no committed harness artifact for the `maintenance` family (same systemic gap the 2026-09-05 audit found, still true); inferred from the live decision mix that it has run repeatedly | YES [CONFIRMED] SQL: approved 289, rejected 39, pending 3 (331 total), nearly exhausted, unlike the ledger-consume/portal_link_candidates backlog below | N/A | PARTIAL `canonical-autoverify.test.mjs` exists [CONFIRMED file present]; execution-wiring not independently re-run | PARTIAL | live SQL; file listing |
| Register walkers (EUR-Lex OJ, Federal Register) | `src/lib/sources/register-walk.mjs`, dispatched via `run-source-sweep.mjs` walker=register-eurlex/register-federal-register | YES [CONFIRMED] `source-sweep.yml` walker choice list | PARTIAL, EUR-Lex ran apply 3x (runs 03-05, 2026-09-01); Federal Register ran once, **dry only** (run-007, 2026-09-02), never applied [CONFIRMED, read all 18 run artifacts' `config.walker`/`config.mode`] | PARTIAL, EUR-Lex apply runs wrote `portal_link_candidates`; Federal Register wrote nothing (dry) | N/A | YES `register-walk.test.mjs` exists | PARTIAL | run-artifact enumeration this session |
| Feed walker | `src/lib/sources/feed-walk.mjs`, `feed-discovery.mjs`, dispatched via walker=feed | YES [CONFIRMED] | NOT, exactly one recorded attempt ever (run-008, 2026-09-02, dry), and it **failed**: `{"feed_url":"https://theloadstar.com/feed","ok":false,"entries":0}` [CONFIRMED, artifact read] | NOT | N/A | YES `feed-walk.test.mjs`, `feed-discovery.test.mjs` exist | PARTIAL | run-artifact enumeration |
| BUILT-DORMANT | | | | | | | | | |
| Sitemap walker, all-hosts backfill (W1.5) | `src/lib/sources/sitemap-walk.mjs` via walker=sitemap, `all_hosts` mode; `sources.sitemap_walk_outcome` | YES [CONFIRMED] | NOT since the prior audit, newest artifact is still `source-sweep-run-018.json`, `started_at 2026-09-05T01:44:14Z`, byte-identical to what the 2026-09-05 audit read; `PENDING-RUN.md` has been re-stamped **three more times** since (2026-09-06 IN-CHUNK fix, 2026-09-17 L35 x2) acknowledging the harness changed with no run landing [CONFIRMED, file timestamps + marker read in full] | NOT progressed, live SQL: `walked` 140, `feed_only` 120, `no_sitemap` 90, `bot_wall` 21 (371 of 2572, 14.4%), **2,201 still NULL** (85.6%). Identical to the 2026-09-05 audit's 140/120/90/21 buckets; the NULL count moved only from 2,192 to 2,201, the +9 is new sources added since, not new walks [VERIFIED, live SQL this session] | N/A (ops coverage report) | YES `run-source-sweep.test.mjs` | PARTIAL | live SQL + full artifact enumeration; this is the single most load-bearing number in this table | **NOT BUILT** (to the plan's own "100%" bar; zero net progress in 13 days) |
| Research walker | `scripts/turns/research-sweep.mjs`, shares source-sweep family, walker=research option in `source-sweep.yml` | YES [CONFIRMED] listed as a dispatch option | NOT, zero of the 18 recorded source-sweep runs used `walker:"research"` [CONFIRMED, enumerated all 18] | NOT | N/A | YES `research-sweep.test.mjs` | YES `RESEARCH-SWEEP.md` | BUILT-DORMANT | full artifact enumeration |
| check-sources / `source-monitoring.yml` | `/api/worker/check-sources`, `system_state.scrape_cadence` | YES [CONFIRMED] dispatch-only route + workflow | GATED OFF BY RULING, not a defect (CLAUDE.md rule 16): `change-detection-run-005`'s own read shows `scrape_gate:{"open":false,"reason":"cadence_off"}` [CONFIRMED]. Live: `max(sources.last_checked) = 2026-06-28T09:50:04Z`, no real check has landed since before this build phase began [VERIFIED, live SQL] | N/A while gate closed, by design | N/A | N/A | YES CLAUDE.md rule 16 states this explicitly | PARTIAL (expected-off, per instruction score against last real run) | live SQL + workflow read |
| Change detection (`run-change-detection.mjs`, `reconcile.ts`, `monitoring_queue`, `staged_updates` drain) | `.github/workflows/change-detection.yml`; tables `monitoring_queue`, `staged_updates` | YES [CONFIRMED] | STALE, last committed artifact `change-detection-run-005.json`, `started_at 2026-09-04T01:30:59Z`; `PENDING-RUN.md` re-pinned three more times since (2026-09-05 CAP-1000, 2026-09-13 x2) with no run landing between [CONFIRMED, marker read in full] | `monitoring_queue` total 580 rows, **0** with `change_detected=true AND reconciled_at IS NULL` [VERIFIED, live SQL], consistent with either a working reconcile or simply no new detections while the scrape gate is closed; cannot distinguish from DB state alone | N/A | YES `run-change-detection.test.mjs` | YES extensive workflow-header documentation | PARTIAL | live SQL + marker read |
| `portal_link_candidates` writers (sweep upserts) and readers (ledger-consume, review-apply-portal-links) | `run-source-sweep.mjs` (writer); `run-ledger-consume.mjs`/`portal-harvest.ts`, `scripts/review/apply-portal-links.mjs` (readers) | YES both sides [CONFIRMED] | Writers ran through 2026-09-05 (see sitemap/register rows above). Readers: **7** `ledger-consume` artifacts now exist (up from 2 at the prior audit), **every one is `mode:"plan"`**, zero `apply` runs ever [CONFIRMED, read all 7 artifacts], finding 1 from the prior audit still stands verbatim | Live SQL: `candidate` 3,751 / `rejected` 53,718 / `promoted` 3 (57,472 total) [VERIFIED]. This is a **materially different distribution** from the prior audit's "57,469 status='candidate'" snapshot, see "Prior claims re-checked" below | N/A (ops ledger) | YES `RD-31-candidate-dwell` invariant registered (`.discipline/governance/invariants.mjs:699`) and wired HARD into `run-data-audit-lane.mjs` per session-log [CONFIRMED file:line for the registration; wiring claimed by session-log, not independently re-run] | PARTIAL | live SQL, artifact enumeration, session-log cross-check | PARTIAL |
| Capture worker (`supabase/functions/capture-worker/index.ts` v1.6) + `pending_first_fetch` + `agent_run_searches` + `result_chars` | Supabase Edge Function; queue `pending_first_fetch`; pool `agent_run_searches` | YES [CONFIRMED] deployed function file read in full | STALLED, last `fetch-drain` artifact `fetch-drain-run-003.json`, `started_at 2026-09-01T06:33:00Z`; live `pending_first_fetch`: done 1235 / error 136 / **queued 12** / skipped 5 (total 1388) vs run-003's own recorded "after" state (done 1235, error 136, skipped 5, total 1376) [VERIFIED, live SQL vs artifact], **zero new captures have succeeded in 17 days** while 12 new rows accumulated un-drained | `agent_run_searches` 6,593 rows; `result_chars` (migration 322/323) is live and backfilled, only 216 rows still NULL [VERIFIED, `information_schema` + count] | N/A directly (feeds grounding, S3's surface) | YES `F26-storage-ceiling-parity.mjs`, `capture-length-scan.test.mjs` (the D32 disk-IO guard) exist [CONFIRMED files] | YES extensive v1.0-v1.6 header | PARTIAL | live SQL vs artifact; migration read |
| `fetch-drain` invocation mechanism | No workflow file (`grep capture-worker .github/workflows` = no matches); invoked only via ad hoc `pg_net`/MCP `execute_sql` from a coordinator session, per the 3 committed artifacts' own `invocation_mechanism` field | PARTIAL, reachable only by a human/coordinator manually issuing `pg_net.http_post`, not by any scheduled or event-driven trigger in the repo [CONFIRMED, workflow grep] | NOT since 2026-09-01 (see above) | see capture worker row | N/A | N/A, no CI-run test of the invocation path itself | YES `PROTOCOL.md`, `LAST-PROPOSER-PASS.md` | BUILT-DORMANT | workflow grep; artifact dates |
| Roadblock / alternative fetch path (`primary-fallback.mjs`, `canonical-fetch.mjs`, `access-wall.mjs`) | `src/lib/sources/`, imported by `src/lib/agent/canonical-pipeline.ts` and `transport-escalation.mjs` | YES [CONFIRMED, grep of importers] | COULD NOT VERIFY from S1 scope alone, its actual firing happens inside brief generation/reground, which is S3's runtime to re-check; not independently exercised here | N/A from S1 | N/A | YES `primary-fallback.test.mjs`, `access-wall.test.mjs` exist | YES extensive header (architecture note on discovery-only scope) | PARTIAL | grep; file headers; flagged as an S1/S3 boundary |
| Inaccessible-source triage ladder | `scripts/sources/inaccessible-triage.mjs`, `source-monitoring.yml` job `triage-inaccessible` | YES [CONFIRMED, dispatch-only `if: job=='triage'`] | COULD NOT VERIFY, no committed harness artifact (only an ephemeral `dossiers/` upload-artifact, 90-day retention, unreadable from this worktree) | Live: `sources.status='suspended'` = 22, down from the ~215 the lane's own header cites as its original target population [VERIFIED count; HYPOTHESIS on attributing the drop to this ladder specifically vs. other maintenance] | N/A | YES `inaccessible-triage.test.mjs` | YES `scripts/sources/README.md` | PARTIAL | live SQL; workflow read |
| `capture-static-primaries` maintenance step | `maintenance.yml:1107` RUN_STEP `capture-static-primaries`, writes `agent_run_searches`/`integrity_flags` | YES [CONFIRMED line 1107] | COULD NOT VERIFY (maintenance-family artifact gap, same as above); session-log (line ~9 area, lane L16/wt-adr029) records this write set was still an OPEN registration item mid-session, not a confirmed run [METADATA, session-log claim] | COULD NOT VERIFY | N/A | YES `capture-static-primaries.test.mjs` exists | PARTIAL | file read; session-log grep |

**Note on the "BUILT-DORMANT" divider rows above:** two rows in the markdown table are section labels, not
scored components, ignore any row reading only "BUILT-DORMANT" in the Component column; every real row
carries its own Verdict in the last column.

## Prior claims re-checked

Against `docs/audits/plan-completion-audit-2026-09-05/W1-W2-intake-population.md`, the rows mapped to S1
(sources/sweep/portal_link_candidates/change detection/monitoring_queue; W1.1's portal_link_candidates
figures, and W1.5 in full):

1. **W1.1's raw count "`portal_link_candidates` status='candidate' = 57,469"**, **[REFUTED as a current
   snapshot]**. Live SQL today: `candidate` 3,751 / `rejected` 53,718 / `promoted` 3. A bulk reclassification
   of 53,718 rows to `rejected` happened 2026-09-06, one day after the prior audit's tree was read
   [CONFIRMED by live SQL; cross-checked against `docs/ops/session-log.md` line 661: "The 53,718
   `portal_link_candidates` rejections of 2026-09-06 were audited twice and stand", a METADATA claim the
   operator has already ruled on, not a new open question]. What is **not** refuted: the deeper finding
   underneath it (ledger-consume's apply half has never fired, now 7 recorded runs, still 100% `mode:"plan"`)
   **[CONFIRMED, still true]**. I could not attribute the 53,718 rejection to a specific script inside this
   stage's write set from the files I read this session (none of the 7 ledger-consume artifacts' metrics are
   remotely large enough to account for it), this is a boundary item for S2 (which owns ledger-consume both
   halves) to name definitively, not a new finding, since the operator already ruled it stands.
2. **W1.5 "Sitemaps and feeds to 100%", NOT BUILT**, **[CONFIRMED, still true, and unimproved]**. The
   prior audit read `source-sweep-run-018` as the newest of 18 runs with 2,192 sources never walked (85.5%).
   Today the same run-018 artifact (`started_at 2026-09-05T01:44:14Z`) is still the newest; live SQL now
   shows 2,201 NULL (85.6%) against 2,572 total sources, the entire movement since the prior audit is 9 new
   sources added to the denominator, not one new host walked. Three `PENDING-RUN.md` re-stamps since
   (2026-09-06, 2026-09-17 x2) recorded governing-file changes but never a run.
3. **Handoff's "scrape hold" / Browserless notes**, **[CONFIRMED, still true]**. `change-detection-run-005`
   itself records `scrape_gate:{"open":false,"reason":"cadence_off"}`; live `max(sources.last_checked) =
   2026-06-28`. No fetch was dispatched this session in compliance with the conservation rule.
4. **W1.6 "Artifact branches land themselves" (19 stale branches on origin)**, out of S1's box list
   (sources/sweep/portal_link_candidates/change detection/monitoring_queue does not include transport); left
   to S6, not re-checked here.

## What the operator must rule on

1. **Sitemap backfill (W1.5) has had zero real dispatches in 13 days** despite the plan's own "continuous
   until 100%" directive and three honest PENDING-RUN acknowledgments. Recommendation: either dispatch a
   bounded run of `source-sweep` walker=sitemap all_hosts (the mechanism is proven, ran cleanly 18 times) or
   explicitly rule the backfill paused for the duration of this machine-audit revision (section 5's own
   "before we continue updating the data" framing would support a deliberate pause, but nothing in the repo
   currently records that as a ruling for this specific mechanism, unlike `POPULATION_PAUSED`).
2. **The feed walker's only-ever attempt failed** (`theloadstar.com/feed`, `ok:false`). Recommendation: one
   bounded dry re-dispatch against a known-good feed URL to determine whether the walker itself is broken or
   the one URL tried was bad, before any ruling on the mechanism's health.
3. **Research walker has never been dispatched at all** despite being wired into the same workflow.
   Recommendation: decide whether the Research surface's $0 data path (built, tested, zero-cost) is still
   wanted; if yes, one bounded dispatch proves it; if the surface's needs changed, retire it explicitly.
4. **`fetch-drain` (the mechanism that actually invokes capture-worker) has no automated trigger anywhere in
   the repo**, it only ever runs via a coordinator manually issuing `pg_net` calls through MCP, and it has
   not fired in 17 days while `pending_first_fetch` grew a 12-row backlog. This is exactly the shape rule 17
   ("nothing in this build runs alone") warns against: nothing chains capture into the loop automatically.
   Recommendation: either give `fetch-drain` a real dispatch-only workflow (the same pattern as the other 9
   harness families) or rule explicitly that manual coordinator dispatch is the intended mechanism.
5. **The whole `maintenance.yml` family still has no committed harness artifact** (uploads an ephemeral
   Actions artifact only), exactly the gap the 2026-09-05 audit flagged for `canonical-autoverify`,
   `capture-static-primaries`, `inaccessible-triage`, `review-apply-portal-links`, and every other
   registry-maintenance step this stage touches, unfixed 13 days later. Recommendation: extend the
   committed-artifact convention (`scripts/harness-runs/<family>/…-run-NNN.json`) to `maintenance`, or accept
   that every maintenance step's "Run" criterion stays permanently unverifiable from repo state.

## Counts

Verdict totals across the 14 scored rows: **PARTIAL 9, BUILT-DORMANT 3, NOT BUILT 1, COULD NOT VERIFY 1,
COMPLETE 0.**

Rows added beyond the plan's own start list (source registry, register/feed/sitemap walkers, check-sources +
change detection, source-sweep runs, portal_link_candidates writers/readers, capture worker + snapshots,
primary-fallback/canonical-fetch): **5**, `canonical_source_candidates`/`canonical-autoverify.mjs`, the
research walker (a distinct script from the register/feed/sitemap walkers named in the plan), the
`fetch-drain` invocation mechanism (split out from "capture worker" because it is a separately-reachable,
separately-stale component), the inaccessible-source triage ladder, and `capture-static-primaries`.
