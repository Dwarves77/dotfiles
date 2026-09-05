# Plan-completion audit — W1 (intake) and W2 (population to record grade) — 2026-09-05

**Tree audited:** `1e6d9e8b` (train 47, REBASE-47: train 47 merged with train 46 master) — the tree
this lane's worktree (`/root/work/lanes/auditw12`, branch `audit/auditw12-2026-09-05`) is checked out
against. This is the tree T46 validation runs against, per the operator's instruction.

**Method.** Read-then-verify, never read-then-report: for every module, workflow step, table and RPC the
build plan names under W1/W2, I read the file in full (not grep-only) where it governs a claim in this
report, traced its callers (`.github/workflows/*.yml` `run:`/`workflow_run:` lines, imports), located its
family's newest harness-run artifact under `fsi-app/scripts/harness-runs/<family>/` and opened it,
counted the tables it feeds with a live read-only SQL query (Supabase MCP `execute_sql`, project
`kwrsbpiseruzbfwjpvsp`, 2026-09-05 evening UTC), and checked the customer-visible column/table state
against what the corresponding migration file on disk claims to add. No write of any kind was made to
the database. No full test suite, `npm run build`, or GitHub Actions dispatch was run from this lane —
per instructions, this is a read-only audit lane running alongside other lanes on the same container.

**Trust boundary.** `docs/PROGRAM-BOARD.md`, `docs/ops/session-log.md`, and prior lane reports are
treated throughout as CLAIMS, not evidence. Where a board row or commit message is cited below, it is
cited as a claim being checked, and the checking evidence (file:line, artifact, or SQL count) is named
separately. Every finding below carries a status token per CLAUDE.md rule 14.

**Files read in full for this audit:** `CLAUDE.md`; `docs/plans/complete-system-build-plan-2026-09-04.md`;
`docs/dispatches/lane-common-contract.md`; `docs/audits/wiring-audit-2026-09-04.md`;
`.github/workflows/source-sweep.yml`; `.github/workflows/ledger-consume.yml`;
`.github/workflows/population-turn.yml` (both jobs, including the chaining/gate step);
`.github/workflows/migration-299-precheck.mjs`/`scripts/mint/migration-299-precheck.mjs`;
`supabase/migrations/308_census_worklist_archive_columns.sql` header. Grepped and spot-read (not full-read):
`producers.yml`, `propagation-drain.yml`, `corpus-turn.yml`, `maintenance.yml`, the `ledger-consume`,
`corpus-turn` and `mint` harness-run JSON artifacts, `docs/PROGRAM-BOARD.md` (targeted grep on my scope's
identifiers only, per rule 11 — not bulk-loaded).

---

## Scope W1 — intake: close the loop in front of mint

| Item | Plan ref | §0 (1 Reachable / 2 Run / 3 Populated / 4 Visible / 5 Gated / 6 Documented) | Verdict | What is missing |
|---|---|---|---|---|
| **ledger-consume $0 verdict path + apply flip** | W1.1 | 1 DONE — `run-ledger-consume.mjs` reads `scripts/turns/ledger-verdicts/ledger-verdicts-*.json`; `LEDGER_CONSUME_APPLY_ENABLED` reads `true` in `ledger-consume.yml`'s own header comment [CONFIRMED, file read in full]. 2 DONE (plan only) / **NOT** (apply) — two harness artifacts exist, `ledger-consume-run-001.json` and `-002.json` (2026-09-04T18:09 / 18:26), both `config.requested_mode:"plan"`, both `metrics.promoted:0`, `with_verdict:0`, `verdicts_file:null` [CONFIRMED, read both artifacts]. The two verdict batches (`ledger-verdicts-001.json`, `-002.json`) were committed 2026-09-04T18:57 and 2026-09-05 (per session-log train 45's "verdicts batch 002 (356, $0)") — **after** both recorded runs, so neither run ever consumed a verdict; no run using `--verdicts` exists on this tree [CONFIRMED, `git log -1` on the verdicts files vs artifact timestamps]. 3 NOT — `portal_link_candidates`: `status='promoted'` count is **3** total, ever, live SQL, against 57,469 rows still `status='candidate'` [CONFIRMED, live SQL]. 4 N-A (nothing populated to show). 5 DONE — `run-ledger-consume.test.mjs` exists and its family is inside `execution-wiring.mjs`'s widened scope per commit `e0fc5c18` [HYPOTHESIS — test file exists, gate coverage not independently re-run]. 6 PARTIAL — `docs/runbooks/CORPUS-TURN-RUNBOOK.md` documents the mechanism per the workflow header; `ledger-consume/PENDING-RUN.md` still present in the harness dir, meaning the family's own marker still records itself as pending [CONFIRMED, file present]. | **PARTIAL (BUILT, wired, apply reachable but never fired with a real verdict)** | The apply half of the mechanism has never actually promoted a candidate: both recorded runs predate the committed verdict batches. Nothing has moved `portal_link_candidates` from candidate to promoted at any real scale (3 of 57,469 ever). A `mode:apply` dispatch (or a fresh `workflow_run` firing after a source-sweep) with the now-committed verdict batches has not happened on this tree. |
| **Four ratification scripts wired as maintenance steps** | W1.2 | 1 DONE — `maintenance.yml` has named steps `review-apply-provisional-sources`, `review-apply-canonical-candidates`, `review-apply-portal-links`, `review-apply-coverage-gaps`, each `if: env.RUN_STEP == '<name>' || (dry && all)`, each calling the matching `scripts/maintenance/review-apply-*.mjs` [CONFIRMED, grep + line read of `maintenance.yml`]. 2 UNVERIFIED — `maintenance.yml`'s step-artifact upload (`actions/upload-artifact`, name `maintenance-${step}-${run_id}`) is an ephemeral GitHub Actions artifact, not committed to the repo the way `mint`/`source-sweep`/`ledger-consume` are; no committed harness-run JSON exists for this family under `scripts/harness-runs/`, so I cannot confirm a run happened from repo state alone [could not verify — see "could not verify" below]. 3 PARTIAL — `portal_link_candidates.status='promoted'` = 3 (the only channel that would move this column); this is consistent with review-apply-portal-links having run at most a handful of times, or with the 3 promotions coming from ledger-consume's pre-audit apply rather than review-apply at all — I cannot attribute the 3 rows to one mechanism over the other from the DB alone [CONFIRMED count; HYPOTHESIS on attribution]. 4 N-A. 5 DONE — each script has a matching `.test.mjs` beside it (`review-apply-portal-links.test.mjs` etc., all present, all dated the same commit). 6 PARTIAL — the wiring audit itself flagged 4 undocumented maintenance steps at the time; I did not find a "review-apply" section in `docs/runbooks/MAINTENANCE-RUNBOOK.md` distinct from the wiring — [HYPOTHESIS, not exhaustively read]. | **PARTIAL (wired into the dispatch surface; real-world effect on the queues is unproven from repo state)** | No committed run artifact for this family exists to confirm a dispatch has ever fired one of the four steps for real; the one live signal (`portal_link_candidates.status='promoted'=3`) is too small and unattributed to call this DONE against §0.2/§0.3. |
| **`corpus_turn_requests` consumed** | W1.3 | 1 DONE — `corpus-turn.yml` step "Select this turn's scope" calls `node scripts/turns/consume-turn-requests.mjs --out ... --limit ...` in ticket-queue mode (default), and a later step calls `--mark-file ... --by corpus-turn-<run_id>` [CONFIRMED, `corpus-turn.yml` grep+read]. 2 DONE — `corpus-turn-run-001.json`, `-002.json` exist under `scripts/harness-runs/corpus-turn/` [CONFIRMED, directory listing]. 3 DONE — live SQL: `corpus_turn_requests` has 794 rows with `consumed_at IS NOT NULL` against 915 still open (1,709 total, matching the audit's original 1,709) [CONFIRMED, live SQL]. 4 DONE — corpus-turn's own downstream (discovery/forward-events) feeds the same tables W1.4/W4 render on customer surfaces (see below). 5 UNVERIFIED (not independently re-run). 6 PARTIAL. | **COMPLETE for the mechanism, PARTIAL for exhaustion** (46% of the original queue consumed; the plan's own "one mechanism" goal is met — `last-turn-date.mjs`'s parallel path is not what fires here) | This is the one W1 item that has genuinely moved data at scale since the audit. Still 915 open tickets; not all consumed. |
| **Event chaining without schedules (`workflow_run`)** | W1.4 | 1 DONE — read in full: `source-sweep.yml` has no auto-trigger (dispatch-only by design, confirmed in its own header); `ledger-consume.yml` has `workflow_run: workflows: ["Source sweep"], types: [completed]`; `population-turn.yml` has `workflow_run: workflows: ["Ledger consume"], types: [completed]` plus a first job step that reads the upstream run's own artifact from its `ledger-consume/<run_id>` branch and requires `config.mode=="apply"`, `config.apply_disarmed==false`, AND `metrics.promoted>0` before proceeding, else sets `RUN_SKIP=true` (a named no-op, job still exits green) [CONFIRMED, full read of both files' chaining logic]; `producers.yml`→`propagation-drain.yml` is chained the same way (`workflow_run: workflows: ["Data producers"]`) and explicitly does **not** honour `POPULATION_PAUSED` (its own header states this) [CONFIRMED, grep+line read]. `POPULATION_PAUSED` is a GitHub Actions repository variable, not a DB flag; `population-turn.yml`'s own comment and `docs/ops/session-log.md` (train 38/39 entries) both state `POPULATION_PAUSED=true` was set 2026-09-04 and is meant to stay true until T46 passes — I cannot read the live repository-variable value from this worktree (no `gh` API access is part of my read-only scope) [HYPOTHESIS that it is still true — consistent with every downstream number below being frozen at 2026-09-04 values, but not independently read from the Actions API]. 2 **NOT for the full chain** — the population-turn hop of the chain requires an upstream `apply` ledger-consume run with `promoted>0`; no such run exists (see W1.1), so the chain source-sweep→ledger-consume→population-turn has never fired end-to-end with a live gate pass; only the source-sweep→ledger-consume hop has actually fired (train 42 session-log: "first automatic `workflow_run` chain (Source sweep → ledger-consume plan) on record"), and it only ever produces a `plan` run, which the next hop's own gate refuses by design. 3/4 NOT for the chained path (nothing chained through). Producers→propagation-drain DID move: `derivation_edges` 6→24 live rows, consistent with session-log train 39 ("edges 6→24, values 6→22, 500 events drained") [CONFIRMED, live SQL count 24]. 5 UNVERIFIED. 6 DONE — the chaining contract is documented in-file at length (both workflow headers) and in `docs/runbooks/POPULATION-TURN-RUNBOOK.md`'s existence (not fully read). | **PARTIAL — wired hop-by-hop in code exactly as W1.4 specifies, but the gate on the second hop has never been cleared by a real run, so "one hand dispatch of source-sweep produces a minted item with no further dispatch" (the plan's own done-condition) has never happened** | The mechanism is real and correctly guards against a stale/no-op chain (verified by reading the guard logic itself, which fails closed on missing/malformed data). What is missing is a single ledger-consume `apply` dispatch (with the now-committed verdict batches) that clears `promoted>0`, which would be the first real test of the full chain. The producers→propagation-drain hop is real and has moved data once. |
| **Sitemaps and feeds to 100%** | W1.5 | 1 DONE — `sitemap-walk.mjs` wired via `run-source-sweep.mjs --walker sitemap --all-hosts`. 2 DONE — `source-sweep-run-018.json` is the newest of 18 recorded runs. 3 PARTIAL — live SQL on `sources.sitemap_walk_outcome`: 140 `walked`, 120 `feed_only`, 90 `no_sitemap`, 21 `bot_wall`, **2,192 still NULL** (never attempted) out of ~2,563 total sources [CONFIRMED, live SQL]. That is roughly 14.5% of sources with any recorded outcome. 4 N-A (an ops-facing coverage report, not a customer surface). 5 UNVERIFIED. 6 PARTIAL. | **NOT BUILT to the plan's own bar ("every active host walked", "100%")** | 85% of sources have never been sitemap/feed-walked. The mechanism runs and records real progress each dispatch (18 runs so far), but at the observed per-dispatch host budget this is nowhere near complete. |
| **Artifact branches land themselves** | W1.6 | 1 DONE — `deliver-artifact-branch.sh` exists and is called from every family's workflow. 2 N-A. 3 N-A. 4 N-A. 5 UNVERIFIED. 6 UNVERIFIED. Live check: `git ls-remote --heads origin` shows **19** branches matching `source-sweep/*`, `population/*`, `ledger-consume/*`, `propagation/*`, `turn/*` [CONFIRMED by `git ls-remote`, read-only]. | **PARTIAL / cannot fully verify** | 19 such branches still exist on origin, the same order of magnitude the audit called "dead" (they found 19 too). I could not diff each branch's artifact against master's committed copy to confirm which, if any, are genuinely stale rather than in-flight (other lanes are actively running trains on this container right now) — reported as a count, not a verdict on staleness. |

## Scope W2 — population to record grade ($0)

| Item | Plan ref | §0 status | Verdict | What is missing |
|---|---|---|---|---|
| **Mint chokepoint / slices to `would_mint`=0** | W2.1 | 1 DONE — `export-census-rows.mjs` → `run-mint-batch.mjs --census-rows --grade record --execute` → `apply-mint-batch.mjs`, reused unmodified inside `population-turn.yml`. 2 DONE (historically) — newest artifact is `mint-run-029.json`, `started_at: 2026-09-04T14:04:50Z`; **no mint-run artifact newer than that exists on this tree**, despite trains 38 through 47 landing after that timestamp [CONFIRMED, directory listing + per-file timestamps]. 3 **NOT progressed** — live SQL on `census_worklist.dryrun_disposition`: `would_mint=3461`, `hold=1425`, `invariant_reject=16717`, `dedup_hit=5` — **identical, digit for digit, to the wiring-audit's 2026-09-04 numbers** [CONFIRMED, live SQL, cross-checked against `wiring-audit-2026-09-04.md` line 39]. `intelligence_items` total = 2,766, also unchanged from the figure the audit and the origin-class ruling both cite. 4 Whatever was minted through run-029 is visible (customer surfaces read live tables, per the wiring audit's own A2 surface row); nothing new since. 5 UNVERIFIED. 6 DONE (`docs/plans/population-pass-2026-09-03.md` and PROGRAM-BOARD's train rows narrate every run's own numbers, consistent with what I found live). | **NOT BUILT further than 2026-09-04** — the plan's own target ("`census_worklist` has no `would_mint`") is not met, and is not closer than it was at the audit | `would_mint` is exactly where it was on 2026-09-04 (3,461 rows). This is consistent with the operator's own ruling recorded in the build plan itself ("Population slices are stopped until T46 passes") and `POPULATION_PAUSED=true` (session-log, train 38/39) — so this is very likely a deliberate hold, not a broken chokepoint, but under the plan's own §0 test (Populated: read-only SQL count) it is **NOT done**, and this audit is evidence that the hold is real and total: not one slice has run in 46 hours of subsequent train activity. |
| **Holds resolved — R-E `origin_class` backfill (1,222 null)** | W2.2 | 1 DONE — `scripts/maintenance/origin-class-backfill.mjs` exists, has a test, is a named `maintenance.yml` step. 2 UNVERIFIED from repo state (no committed family artifact; see W1.2's same gap). 3 **NOT** — live SQL: `intelligence_items.origin_class IS NULL` = **1,222**, exactly the wiring-audit's 2026-09-04 figure [CONFIRMED, live SQL, exact match to audit's "1,222 of 2,766 items null"]. PROGRAM-BOARD itself (Addendum 85 ps 17, a claim, not evidence) narrates an EARLIER pass that took nulls "1,160 → 211" on 2026-09-03, i.e. before the audit's own 1,222 figure — meaning the 1,222 the audit and I both independently measured is **already inclusive of new null rows arriving faster than the backfill runs** (every new census slice / ledger-consume promotion adds un-backfilled nulls). 4/5/6 not reached. | **NOT BUILT (stalled, not merely paused)** | Unlike W2.1 (frozen by an explicit pause), origin-class nulls are a *moving* population (every new item is born null) that the backfill step is supposed to keep draining. It has not run since before 2026-09-04, so the null count is exactly where a no-op tool would leave it. |
| **R-A off-vertical archive (1,655–1,676 rows)** | W2.2 | 1 **NOT reachable** — `scripts/maintenance/census-off-vertical.mjs`'s own apply path depends on `census_worklist.is_archived`/`archive_reason`, which migration `308_census_worklist_archive_columns.sql` adds — but that migration is **not applied live**: `information_schema.columns` for `census_worklist` has no `is_archived`/`archive_reason`/anything `%archiv%` column [CONFIRMED, live SQL against `information_schema.columns`, cross-checked against the migration file's own header, which states verbatim: "census_worklist carries no is_archived/archive_reason columns... `arg=archive` apply path has therefore always returned NOT RUNNABLE"]. 2–6 N-A (cannot run). Live check: 0 census_worklist rows carry an off-vertical-flavoured `hold_reason` string [CONFIRMED, live SQL]. | **NOT BUILT — BUILT-DORMANT one level up (migration written, never applied)** | This is a clean, mechanically checkable gap: the migration file exists on disk (`308_...sql`), its own header names exactly why it's needed and what it fixes, and the live schema does not have the columns. Applying it is a schema-DDL step (CLI, per CLAUDE.md rule 3) that has not happened on this tree. |
| **Migration 299 (3-slot kit backfill, 149 pre-kit items)** | W2.3 | 1 DONE — `scripts/mint/migration-299-precheck.mjs` (read in full) is an executable pre-check for the migration's own self-check SQL; `eedd87b7` (commit in this tree's history) claims to add "executable migration-299 guard + kit-backfill selection". 2 UNVERIFIED whether the precheck script has been run for real (no committed artifact). 3 **NOT** — the migration's own four target `(item_type, slot_key)` rows (`market_signal`/`corridor_identity`, `initiative`/`corridor_identity`, `research_finding`/`evidence_agreement_signal`, `research_finding`/`source_authority_signal`) are **absent from the live `item_type_required_slots` table** — zero rows match [CONFIRMED, live SQL]. 4/5/6 N-A (nothing to show; the kit isn't live). | **NOT BUILT** | Migration 299 itself has not been applied to the live database. The commit that claims to build "the guard" built a pre-check script, correctly, but the schema change it gates has not landed — this is exactly the two-track migration policy (rule 3: DDL via CLI before dependent code) working as designed, mid-sequence, not finished. |
| **Reopen-validation-holds** | W2.2 | 1 DONE — session-log (train, "REOPEN-STEP 2026-09-04") and the file `scripts/maintenance/reopen-validation-holds.mjs` (+ duplicate at `scripts/mint/reopen-validation-holds.mjs` — **two files with the same name in two directories**, see note below) both exist, wired as a `maintenance.yml` step taking `--arg <reason-contains>`. 2 UNVERIFIED (no committed family artifact). 3 Live SQL: only 1 row in `census_worklist` currently carries an `ungrounded_url`-flavoured `hold_reason` [CONFIRMED, live SQL] — consistent with either the reopen step having worked, or with there never having been many in the first place; I cannot distinguish those from the DB alone. 4/5/6 not reached. | **PARTIAL / UNVERIFIED** | Cannot confirm from repo+DB state alone whether the low current count reflects the reopen step's own effect or a small original population. Flagging the **duplicate module** (`scripts/maintenance/reopen-validation-holds.mjs` and `scripts/mint/reopen-validation-holds.mjs`, both present with `.test.mjs` siblings) as a likely case of the exact "tool built twice, not reused" pattern the operator's brief calls out — [HYPOTHESIS: did not diff the two files' contents byte-for-byte to confirm they are true duplicates rather than a thin wrapper and its core; naming and directory placement alone make this worth the coordinator's attention]. |
| **Kit backfill for 149 pre-kit items** | W2.3 | Same evidence as migration 299 above: the backfill's *reason to exist* (the kit gap) is still live (0 of the 4 new required-slot rows exist), so whatever selection logic `eedd87b7` built has nothing to have run against yet in the schema sense. | **NOT BUILT (blocked on the same unapplied migration)** | Same missing schema-apply step as migration 299 above. |
| **6 zero-FACT record-verified items / 575 with one-two FACTs re-extracted** | W2.4 | 1/2/3 **could not verify** — I attempted a live SQL re-check joining `intelligence_items`/`intelligence_item_sections`/`section_claim_provenance` and the join column names on this schema did not match my query's assumption (`section_claim_provenance.section_id` does not exist under that name); re-deriving the correct join within this audit's remaining budget was not done. | **COULD NOT VERIFY** | I do not have a live-SQL-confirmed current count for this item and am not reporting the audit's original "6 / 575" figures as still-true without a fresh count — flagged here as unverified rather than asserted either way. |

---

## Findings against the operator's three concerns

**1. Tools built but unused or duplicated.**
- [CONFIRMED] `reopen-validation-holds.mjs` exists in **two** locations (`scripts/maintenance/` and
  `scripts/mint/`), each with its own `.test.mjs`. This is exactly the "not using existing tools" pattern
  the operator named — a second implementation was written where one already existed, or one is a stale
  copy left behind a directory reorganisation. I have not diffed their contents to determine which (if
  either) is dead; this is a same-session, decision-ready flag for the coordinator (CLAUDE.md rule 13):
  diff the two, delete the loser, and confirm `maintenance.yml`'s "reopen-validation-holds" step is calling
  the surviving one (it currently references it by relative script path, so this needs a one-line check).
- [CONFIRMED] `run-ledger-consume.mjs`'s apply path, `--export-candidates`, the four `review-apply-*.mjs`
  scripts, `origin-class-backfill.mjs`, and `census-off-vertical.mjs` are all **built and reachable** but
  their real-world effect (measured live) is at or near zero: 3 candidates ever promoted out of 57,469; the
  origin-class null count identical to the audit's own snapshot; the off-vertical archive path structurally
  unable to run because its own migration is unapplied. These are not "unwired" in the sense the 2026-09-04
  audit found (BUILT, WIRED, NEVER RUN) — they are wired and dispatchable — but they are also not doing the
  work their names promise, which is the same failure mode one layer further along: a tool that runs and
  writes nothing is indistinguishable from a tool that was never run, from the surface's point of view.
- [HYPOTHESIS] The `docs/plans/` directory itself is an instance of the pattern: five overlapping
  system-completion plans exist before this one (`system-remediation-plan-2026-08-09`,
  `surface-rebuild-plan-2026-08-11`, `system-completion-plan-2026-09-02`, `wave2-lanes-2026-09-02`,
  `wave3-lanes-2026-09-03`) each re-describing the same unfinished work, which the 2026-09-04 plan itself
  names as the reason it exists. I did not re-litigate those five plans' contents against current code (out
  of my W1/W2 scope) but flag this as the meta-instance of "not making the entire system work as one single
  unit" the operator is asking about.

**2. Flywheel and harness gaps.**
- [CONFIRMED] The harness convention itself is honoured for the families with real writers (`mint`,
  `source-sweep`, `ledger-consume`, `corpus-turn`, `propagation`, `forward-events`, `change-detection`,
  `screen`, `meta-harness` all have committed, incrementing `*-run-NNN.json` files with real timestamps
  spread across the last several days, not fixture-shaped single files). The `maintenance.yml` family
  (18 named steps, including every W1/W2 item above that routes through it) has **no equivalent committed
  artifact directory** — it uploads an ephemeral `actions/upload-artifact` per dispatch instead, which does
  not survive past 90 days and is not readable from this git-only worktree. This means every maintenance
  step's own §0.2 ("Run": harness-run artifact) is currently **unverifiable from the repository itself**,
  for the entire family, which is a harness gap the plan's own §0 definition does not currently catch
  (F28 governs the 9 harness families named in the plan; `maintenance` is a dispatcher over other
  families' scripts, not itself one of the 9, so nothing fails CI when a maintenance step has silently
  never run).
- [CONFIRMED] `run-population-flywheel.mjs`'s gate logic (read in full inside `population-turn.yml`) is a
  genuine, well-built defense against exactly the defect rule 17 names (a population apply that "ends
  without triggering its downstream"): it scans every mint-run artifact and refuses a new export if any
  prior one lacks the flywheel's own outcome keys. That gate is real and would have caught the
  September 3/4 defect the plan's own rule 17 cites (six slices, ~650 items, no flywheel pass) had it
  existed then.

**3. Things that run alone without triggering their downstream (rule 17).**
- [CONFIRMED] The chain as designed does **not** currently violate rule 17 in its own logic: every hop
  checks its own upstream's real effect (not just completion) before proceeding, and refuses (green,
  named no-op) rather than silently doing partial work. The violation instead is at the boundary the code
  cannot see: **ledger-consume's apply mode has simply never been dispatched with real verdicts**, so there
  is no "runs alone" defect to find in the chain itself — there is an absent first domino. Once an apply
  dispatch with `promoted>0` happens, the chain as read is designed to run population-turn's mint +
  flywheel + producers + propagation-drain in the connected way rule 17 requires, [HYPOTHESIS pending a
  live test — I read the logic; I did not and could not execute it].
- [CONFIRMED] `producers.yml → propagation-drain.yml` is explicitly exempted from `POPULATION_PAUSED` (its
  own header states this) and did fire for real (derivation_edges 6→24), which is consistent with rule 17
  in that this pairing has in fact triggered its downstream.

## Prior claims refuted

- **PROGRAM-BOARD, Addendum 85 ps 12 / ps 17, and commit `221b6958`'s message** ("Lane ATTACH-SOURCES:
  attach-found-sources step + tier-opinions writer (W3.1/W3.3)") imply `source_tier_opinions` gained a
  working write path. [REFUTED against that implication] — live SQL: `source_tier_opinions` has **0 rows**,
  identical to the wiring-audit's original "0 rows, not runnable" finding. (Outside my strict W1/W2 scope,
  reported here only because it shares evidence with the origin-class/tier-adjacent checks above; the
  coordinator should have W3's own lane re-verify this directly.)
- **`docs/plans/complete-system-build-plan-2026-09-04.md`'s own T38/T39 sequencing table claim** that
  W1.4 (event chaining) was "landed in T38" and W2.3 (migration 299 + kit backfill) was "landed in T45" —
  read as an implicit claim of completion. [REFUTED, partially]: the chaining *code* is landed (confirmed
  above), but the chain has never been exercised end-to-end with a promoting ledger-consume run, and
  migration 299 is still not applied to the live database as of this tree (T47) — later than T45 claimed
  it would land.
- **The wiring audit's own §2.1 "would_mint 3,461" and origin-class "1,222 of 2,766 items null" figures**,
  cited in the build plan as the *starting* count W2 would work down from: [CONFIRMED, not refuted] — both
  numbers are, as of this tree, **exactly unchanged**, which is itself the most load-bearing single fact in
  this report: two days and roughly a dozen "trains" after the audit, the population-to-completion loop's
  core metric has not moved by one row.

## What I could not verify, and why

- Whether `maintenance.yml`'s review-apply/origin-class-backfill/census-off-vertical/reopen-validation-holds
  steps have ever actually been dispatched: the family uploads only an ephemeral Actions artifact, not a
  committed harness-run JSON, so repo state cannot answer this; I did not have GitHub Actions API/log
  access from this worktree (out of scope: "read-only... do not run the full test suite or next build").
- The live value of the `POPULATION_PAUSED` repository variable: inferred from workflow-file comments and
  `docs/ops/session-log.md` narration (both cited as claims, corroborated by the fact that every population
  metric is frozen at its 2026-09-04 value) but not read directly from the GitHub Actions API.
- Whether the 3 promoted `portal_link_candidates` rows came from ledger-consume's apply mode or from
  review-apply-portal-links: both write the same `status` column and I did not have a `promoted_by`/audit
  trail column to disambiguate in the time available.
- The current live count behind "6 record-verified items with zero FACT claims / 575 with one-two FACTs"
  (W2.4): my SQL join against `section_claim_provenance` failed on a column-name assumption and I did not
  re-derive the correct schema within this audit's scope; reported as unverified, not asserted.
- Whether the 19 `source-sweep/*`, `population/*`, `ledger-consume/*`, `propagation/*`, `turn/*` branches on
  origin are genuinely stale (fully landed on master already) or in-flight from other lanes running
  concurrently on this container: I did not diff branch contents against master, both because other lanes
  are actively writing to some of these families right now and because diffing 19 branches was outside the
  effort this lane's scope justifies against the reward of the answer.
