# S2 mint gate: stage audit 2026-09-18

Method: read every named file in full where it governs a table row below (not grep-only for the
workflow YAMLs, `mint-item.ts`, `apply-mint-batch.mjs`'s header, `portal-harvest.ts`'s consume/stamp
logic); ran read-only SELECT/aggregate SQL via `scripts/lib/pg-conn.mjs`'s `connectPg()` against the
live Supabase project; grepped `docs/ops/session-log.md` for dispatch evidence the prior audit lacked.
Commit read: worktree `wt-session-c` at `806c0c48` (repo root), tree clean, no writes made. No workflow
dispatch, no LLM call, no script executed in apply/write mode.

## The table

| Component | Where (file / workflow / table) | 1 Reachable | 2 Run | 3 Populated | 4 Visible | 5 Gated | 6 Documented | Verdict | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| Vertical-fit / entity gates ("THE GATE") | `src/lib/sources/vertical-fit-gate.ts`, `src/lib/agent/mint-gates.mjs`, entity-verdict check in `src/lib/intake/portal-harvest.ts:451-455` | YES [CONFIRMED] imported by `run-intake-cycle.ts`, the mint path every route below feeds | YES [CONFIRMED] `census_worklist.dryrun_disposition='invariant_reject'` = 16,717 live rows, only the gate can produce this value | YES [CONFIRMED] `census_worklist` itself is the populated table, SQL count above | PARTIAL [HYPOTHESIS] gate outcomes are not shown on a customer surface directly, only via item existing/not-existing | YES [CONFIRMED] `F13-single-mint-chokepoint.mjs` in `.discipline/fitness/manifest.mjs:23` makes the single-chokepoint claim an invariant | PARTIAL [HYPOTHESIS] runbook coverage not independently re-read this session | COMPLETE | SQL: `select dryrun_disposition, count(*) from census_worklist group by 1` |
| `corpus_turn_requests` consumption | `scripts/turns/consume-turn-requests.mjs`, table `corpus_turn_requests` | YES [CONFIRMED] `corpus-turn.yml` step "Select this turn's item scope" calls it | YES [CONFIRMED] `scripts/harness-runs/corpus-turn/corpus-turn-run-001.json` (dry), `-002.json` (apply, `tickets_selected:200`) | PARTIAL [CONFIRMED] live SQL: 794 rows `consumed_at IS NOT NULL`, 963 still open (1,757 total), **794 consumed is unchanged from the 2026-09-05 audit**, and open count has grown from 915 to 963 (new tickets keep arriving, none drained since) | N/A ops-facing, not customer | PARTIAL [HYPOTHESIS] not independently re-run | PARTIAL | PARTIAL (mechanism proven once; exhausted 45% of a queue that has since grown, not shrunk, since the last dispatch) | SQL: `select consumed_at is not null as consumed, count(*) from corpus_turn_requests group by 1`; `ls scripts/harness-runs/corpus-turn/` |
| `corpus-turn.yml` (whole workflow) | `.github/workflows/corpus-turn.yml` | PARTIAL [CONFIRMED] reachable by `workflow_dispatch` and `push` to `turn/**`; **no upstream `workflow_run` trigger fires it automatically**, same gap the 2026-09-05 audit found, still true | YES [CONFIRMED] 2 recorded runs (2026-09-05) | see corpus_turn_requests row above | N/A | PARTIAL | YES [CONFIRMED] `docs/runbooks/CORPUS-TURN-RUNBOOK.md` cited in-file | PARTIAL | file read in full |
| `population-turn.yml` (whole workflow) | `.github/workflows/population-turn.yml` | YES [CONFIRMED] `workflow_dispatch` AND `workflow_run: workflows: ["Ledger consume"]` (lines 220-222), gated on upstream `config.mode=="apply"` AND `apply_disarmed==false` AND `metrics.promoted>0` | PARTIAL [CONFIRMED] newest `mint-run-*.json` is `mint-run-029.json`, `started_at: 2026-09-04T14:04:50Z`, **no run since**, consistent with `POPULATION_PAUSED` (repo variable) holding since 2026-09-04 and now the 2026-09-18 ruling to hold until 5.2 closes | NOT progressing [CONFIRMED] `census_worklist.dryrun_disposition='would_mint'` = 3,461, `intelligence_items` total = 2,766, **both figures identical, digit for digit, to the 2026-09-05 audit** | YES whatever minted through run-029 is visible on customer surfaces (per S5's scope) | PARTIAL "Gate: refuse a new slice while a prior one is left unconnected" step (line 476-478) exists and self-tests via `run-population-flywheel.mjs --check-gate`; not independently re-run | YES [CONFIRMED] the file's own 175-line header is the runbook | PARTIAL (wiring is materially better than the prior audit found; population itself is deliberately frozen) | `ls scripts/harness-runs/mint/`; SQL on `census_worklist`/`intelligence_items` |
| Mandatory flywheel inside population-turn (rule 17) | `scripts/turns/run-population-flywheel.mjs`, called unconditionally (no `\|\| true`) from `population-turn.yml:594-599` | YES [CONFIRMED] wired into the same job, same `if:` gate as the mint steps | YES [CONFIRMED] `mint-run-029.json`'s `metrics` carries the full section 9 outcome-key set (`edges_discovered:50`, `forward_events_extracted:0`, `isolated_items:0`), the flywheel DID run and enrich the batch's own artifact | YES same artifact | PARTIAL | YES the job fails outright if this step fails (no `\|\| true`), which is itself the gate | YES documented at length in-file, `MINT-RUNBOOK.md` cited | COMPLETE (for the one batch it has run against; unexercised since because no new batch has minted) | `scripts/harness-runs/mint/mint-run-029.json` |
| `downstream-chain.yml` (the W1.4-closing hop: tier-opinions, derive-obligations, tag-proposals, apply-classifications, then propagation-drain) | `.github/workflows/downstream-chain.yml` | YES [CONFIRMED, file read in full] `workflow_run: workflows: ["Population turn", "Corpus turn"]` (line 90-92), this workflow **did not exist** at the 2026-09-05 audit; it is dated 2026-09-06 in its own header and directly closes finding 5 | PARTIAL [HYPOTHESIS] no committed harness-run artifact for this family (maintenance-posture GitHub Actions artifact only, by its own header), cannot confirm a real firing from repo state alone | N/A depends on upstream firing | N/A | PARTIAL gate logic reads the upstream run's own artifact (`metrics.minted>0` / `metrics.tickets_selected>0`) before proceeding, same discipline as population-turn's own chain | YES documented at length in-file | PARTIAL (the missing hop is now BUILT and wired both directions; unproven from repo state whether it has fired for real, and its one upstream, population-turn, has not minted since 2026-09-04 so it has had at most corpus-turn firings to chain from, and corpus-turn has not re-dispatched since 2026-09-05 either) | file read in full; `ls scripts/harness-runs/` (no `downstream-chain/` directory exists, consistent with its stated no-committed-artifact posture) |
| `apply-mint-batch.mjs` + record-grade kit | `scripts/mint/apply-mint-batch.mjs`, `item_type_required_slots` | YES [CONFIRMED] called from `population-turn.yml:545-554`, unmodified since the 2026-09-05 audit | YES [CONFIRMED] newest artifact `mint-run-029.json`, `config.mode:"execute"` | PARTIAL migration 299's four target `(item_type, slot_key)` rows are **still absent** from `item_type_required_slots` (48 total rows live, none matching the four named in the migration) [CONFIRMED, live SQL, unchanged from 2026-09-05] | YES minted items render | PARTIAL | PARTIAL | PARTIAL (the batch-mint path itself is unchanged and works; its dependent schema change, migration 299, remains unapplied, exactly as the prior audit found) | SQL: `select item_type, slot_key from item_type_required_slots where (item_type,slot_key) in (...)` returns 0 rows |
| Mint chokepoint, single-item path | `src/lib/intake/mint-item.ts` | YES [CONFIRMED] the file's own header states it is the ONE write site; `F13-single-mint-chokepoint.mjs` enforces this as an invariant | YES [CONFIRMED] exercised via `/api/agent/run` and `run-intake-cycle.ts`; `item_grade` counts live (1,577 record / 1,189 brief of 2,766) prove the path has run historically | YES same counts | YES | YES F13 (and F22, "F13 one table over") | YES `mint-item.ts`'s own 90-line header | COMPLETE | file read in full lines 1-380; `.discipline/fitness/manifest.mjs:20-23` |
| Rule-16 enrichment at mint (discovery + forward-events, unconditional, same function) | `src/lib/intake/mint-item.ts` lines 307-377 (`runConnectionDiscovery`, `readAndExtractForwardEvents`) | YES [CONFIRMED] runs inline, non-fatal try/catch, `recordFlywheelDefect` on failure | YES [CONFIRMED] same evidence as chokepoint row | YES `item_forward_events`, connection edges written | YES | PARTIAL no dedicated adversarial/golden test independently re-run this session, but the code path itself is unconditional (not a "different turn" deferral) | YES documented in the file's own header, "contract rule 16" | COMPLETE | file read in full |
| Batch-mint enrichment (rule 16 for `apply-mint-batch.mjs`'s own path) | `scripts/mint/apply-mint-batch.mjs` lines 46-62, 769-771 | YES the batch path itself still does NOT run discovery/forward-events inline (unchanged from the 2026-09-05 finding), but the gap is now closed one level up: `population-turn.yml`'s mandatory flywheel step (see above) runs it in the SAME job and fails the job if it fails | YES [CONFIRMED] `mint-run-029.json` carries real flywheel outcomes, proving the substitute mechanism fired for the one batch it has had since the fix landed | see above | see above | YES the job-level "no `\|\| true`" gate | YES the code comments explicitly narrate the 2026-09-04 defect (~650 items, 551 record items with only a title) and the fix | COMPLETE (superseding finding 4: the self-documented rule-16 skip is real but is no longer an UNENFORCED hand-off, it is closed by a job-level gate one layer up) | `apply-mint-batch.mjs:46-62`; `mint-run-029.json` |
| `ledger-consume.yml`, consume half, plan mode | `.github/workflows/ledger-consume.yml`, `scripts/turns/run-ledger-consume.mjs` | YES [CONFIRMED] `workflow_dispatch` and `workflow_run: workflows: ["Source sweep"]` | YES [CONFIRMED] 7 recorded runs, `ledger-consume-run-001.json` through `-007.json`, newest 2026-09-05T20:14:29Z | YES `portal_link_candidates` rows classified (0 DB writes in plan mode by design, see next row) | N/A | PARTIAL | YES | COMPLETE for plan mode | `ls scripts/harness-runs/ledger-consume/` |
| `ledger-consume.yml`, apply half (`LEDGER_CONSUME_APPLY_ENABLED`) | `scripts/turns/run-ledger-consume.mjs:226` (`export const LEDGER_CONSUME_APPLY_ENABLED = true`), the `stamp()` function at line 363 of `portal-harvest.ts` | YES [CONFIRMED] the constant is `true`, apply is reachable via explicit `workflow_dispatch` with `mode:apply` + non-blank `verdicts_file` (D26, 2026-09-13) | **NO** [CONFIRMED] all 7 recorded artifacts read `config.mode:"plan"`, **zero `mode:"apply"` runs exist, still, exactly the 2026-09-05 finding** | **NO** [CONFIRMED] live SQL: `portal_link_candidates` status counts are `rejected=53,718`, `candidate=3,751`, `promoted=3`, **promoted is still exactly 3**, unchanged from the 2026-09-05 audit | N/A nothing populated to show | PARTIAL `run-ledger-consume.test.mjs` exists, not independently re-run | PARTIAL | **NOT BUILT (still), finding 1 stands** | SQL: `select status, count(*) from portal_link_candidates group by status`; 7 artifact files inspected in full |
| Four ratification scripts (`review-apply-{portal-links,provisional-sources,canonical-candidates,coverage-gaps}.mjs`) as `maintenance.yml` steps | `scripts/maintenance/review-apply-*.mjs` | YES [CONFIRMED] named `maintenance.yml` steps, unchanged | YES [CONFIRMED, session-log #56-#67, `docs/ops/session-log.md:12638-12847`] all four dispatched dry then apply for real, between the 2026-09-05 audit and now: provisional-sources moved 349 rows provisional→active (911→562, SQL-confirmed); canonical-candidates auto-resolved 11 of 23 groups; coverage-gaps landed all 91 ruled rows; portal-links rejected 53,718 rows per the operator's ruling (`docs/ratifications/2026-09/portal-links.ruling.json`), read-back confirmed by SQL | YES [CONFIRMED] live SQL matches every one of the session-log's own claimed post-apply counts (`portal_link_candidates`: rejected 53,718, candidate 3,751, promoted 3, matching session-log line 12847 exactly) | N/A ops-facing | YES `F39-unbounded-in-filter.mjs` was added directly because of this family's own incident (portal-links' 57,469-id `.in()` filter 400ing, session-log's own IN-CHUNK note), a real, evidenced gate born from this family running for real | YES | **COMPLETE, this REFUTES the 2026-09-05 audit's "PARTIAL / cannot verify" verdict** | session-log 12638-12847 (dispatch evidence the prior audit explicitly said it lacked); SQL counts matching |
| R-A off-vertical archive (census_worklist) | `scripts/maintenance/census-off-vertical.mjs`, migration `308_census_worklist_archive_columns.sql` | YES [CONFIRMED] migration 308 is now APPLIED live: `is_archived`/`archive_reason` columns exist (previously absent, the 2026-09-05 audit's own "BUILT-DORMANT one level up" finding) | YES [CONFIRMED] `F39`'s own comment cites "Maintenance run 34046850770, 1,655 ids" as this script's real apply run | YES [CONFIRMED] live SQL: `census_worklist.is_archived=true` count = 1,655, all `archive_reason='off_vertical'`, **matches the plan's own named target ("1,655 off-vertical rows") exactly** | N/A | PARTIAL | YES | **COMPLETE, refutes the prior "NOT BUILT, migration unapplied" finding** | SQL: `select is_archived, count(*) from census_worklist group by 1`; `select archive_reason, count(*) from census_worklist where is_archived group by 1` |
| R-E origin_class backfill | `scripts/maintenance/origin-class-backfill.mjs` | YES | YES [CONFIRMED, moved since 2026-09-05] | PARTIAL [CONFIRMED] live SQL: `intelligence_items.origin_class IS NULL` = 43, down from 1,222 at the 2026-09-05 audit, real, large progress, not yet zero | YES | PARTIAL | YES | PARTIAL (94.7% closed; not exhausted) | SQL: `select count(*) from intelligence_items where origin_class is null` |
| Migration 299 (3-slot kit, 149 pre-kit items) | `supabase/migrations/` (299), `item_type_required_slots` | NOT reachable in effect, schema not applied | N/A | **NO** [CONFIRMED] live SQL: the four target `(item_type, slot_key)` rows are absent from `item_type_required_slots` (48 rows total live, none of the four), **identical to the 2026-09-05 finding** | N/A | N/A | PARTIAL | **NOT BUILT (still, unchanged)** | SQL as above |
| `staged_updates` transit (RD-20) | table `staged_updates` | YES | YES | YES [CONFIRMED] 38 total rows: 33 approved (all with a non-null `materialized_at`, none parked unmaterialized), 5 rejected, **zero rows in any other status**, zero rows found by a query for pending/unmaterialized-approved | N/A admin visibility only per doctrine (not a customer surface) | PARTIAL `scripts/verify/staged-transit-audit.mjs` exists (not independently re-run this session, per the read-only scope) | YES CLAUDE.md's own "Constraints" section documents this in full | COMPLETE | SQL: `select id,status,created_at,reviewed_at,materialized_at,materialization_error from staged_updates where status not in ('approved','rejected') or (status='approved' and materialized_at is null)` returned 0 rows |
| ADR-025 tags/signals/classifications (`propose-classifications.mjs`, `apply-classifications.mjs`, `tag-proposals.mjs`, `tag-ratification.mjs`) | `scripts/classification/*.mjs`, `scripts/turns/tag-proposals.mjs` (referenced), wired into both the mandatory flywheel (population-turn) and `downstream-chain.yml` | YES [CONFIRMED] both callers read in full | PARTIAL depends on the same upstream freeze as the flywheel row above; `apply-classifications`/`tag-proposals` are also run by `downstream-chain.yml`, itself unconfirmed as fired for real (see that row) | N/A | N/A | PARTIAL | YES | PARTIAL | file reads above |

## Prior claims re-checked

Re-checking every 2026-09-05 W1-W2 row and findings 1, 4, 5 named for this stage.

1. **Finding 1 (ledger-consume apply half never fired with a real verdict).** Re-checked directly: still
   true. `[CONFIRMED]`, all 7 `ledger-consume-run-*.json` artifacts read `config.mode:"plan"`, and live
   SQL shows `portal_link_candidates.status='promoted'` is still exactly 3, the same digit the 2026-09-05
   audit reported. No apply-mode dispatch (with a `verdicts_file`, per D26's 2026-09-13 requirement) has
   happened on this tree at any point since.

2. **Finding 4 (apply-mint-batch.mjs self-documents skipping rule-16 on every batch mint).** Re-checked:
   the underlying fact is still true at the function level, `apply-mint-batch.mjs` still does not run
   discovery/forward-events inline, and its own comments still say so. But the audit's implied verdict
   ("hundreds of record-grade items minted with neither, deferred to a different turn nobody dispatched")
   is `[REFUTED]` as a going-forward gap: since 2026-09-06 (lane MINT-FLYWHEEL), `population-turn.yml` runs
   `run-population-flywheel.mjs` as a MANDATORY same-job step with no `|| true`, and `mint-run-029.json`
   (the one batch minted since that fix landed) carries real flywheel outcome keys, proving the substitute
   closed the gap for the one batch it has had the chance to run against. The finding's root cause (rule-16
   is not literally inside `apply-mint-batch.mjs`) persists by design; its consequence (silent skip) is
   closed by a job-level gate.

3. **Finding 5 (population-turn.yml's completion triggers nothing downstream; corpus-turn.yml wired to
   nothing on either side).** `[REFUTED]` for the half that matters most: `downstream-chain.yml`
   (dated 2026-09-06 in its own header, so built after the 2026-09-05 audit specifically to close this
   finding) now fires on `workflow_run: ["Population turn", "Corpus turn"]` and, when its own artifact-read
   gate clears, runs `tier-opinions` / `derive-obligations` / `tag-proposals` / `apply-classifications` then
   chains into `propagation-drain.yml` (whose own `on.workflow_run.workflows` list was extended to include
   `"Downstream chain"`). What is `[CONFIRMED] still true`: `corpus-turn.yml` still has no UPSTREAM
   `workflow_run` trigger (only `workflow_dispatch` and `push` to `turn/**`), the "wired to nothing on
   either side" framing is half-refuted (downstream side fixed) and half-standing (upstream side
   unchanged). Whether `downstream-chain.yml` has ever fired for real could not be verified from repo
   state (no committed harness-run artifact for that family, by its own documented posture, same gap the
   2026-09-05 audit found for the whole `maintenance` family).

4. **W1.1 (ledger-consume $0 verdict path + apply flip), W1.2 (four ratification scripts wired), W1.4
   (event chaining).** W1.1: unchanged, `[CONFIRMED]` still PARTIAL (built and reachable, apply never real).
   W1.2: `[REFUTED]` as PARTIAL/unverifiable, session-log lines 12638-12847 give the exact dispatch
   evidence (dry+apply, per-script row counts) the 2026-09-05 audit said it lacked, and live SQL matches
   every claimed post-apply number. Now COMPLETE. W1.4: `[REFUTED]` in the direction of MORE complete , 
   `downstream-chain.yml` closes exactly the gap W1.4's own "event chaining without schedules" item and
   finding 5 named; the chain source-sweep to ledger-consume to population-turn is now source-sweep to
   ledger-consume(plan) to population-turn(gated on apply+promoted>0, still never cleared because apply
   never fires), so the CODE is more complete than 2026-09-05 found, but the end-to-end live exercise
   claimed by the plan's own done-condition ("one hand dispatch of source-sweep produces a minted item with
   no further dispatch") still has not happened, for the same root cause as finding 1.

5. **W2.1 (mint slices to `would_mint=0`).** `[CONFIRMED]` still NOT BUILT further than 2026-09-04:
   `would_mint=3,461`, `intelligence_items=2,766`, both identical to both the 2026-09-05 audit and the
   original 2026-09-04 wiring audit. This is a deliberate hold (`POPULATION_PAUSED`, then the 2026-09-18
   ruling), not a broken chokepoint, as the prior audit itself already concluded.

6. **W2.2 (origin_class backfill, R-A off-vertical, reopen-validation-holds).** Origin-class:
   `[CONFIRMED]` real progress, 1,222 to 43 nulls, not yet exhausted. R-A: `[REFUTED]`, was "NOT BUILT,
   migration unapplied"; migration 308 is now live, the script has run for real (1,655 rows archived,
   matching the plan's own target number exactly). Reopen-validation-holds duplicate-module flag
   (`scripts/maintenance/reopen-validation-holds.mjs` vs `scripts/mint/reopen-validation-holds.mjs`): not
   re-checked this session (out of the s2 start list; a W7/tools-inventory concern, not re-verified here so
   as not to assert either way).

7. **W2.3 (migration 299, 3-slot kit backfill).** `[CONFIRMED]` still NOT BUILT: identical zero rows in
   `item_type_required_slots` for the four named `(item_type, slot_key)` targets.

8. **W2.4 (6 zero-FACT record items / 575 with one-two FACTs).** Out of this stage's start list (belongs to
   S3 evaluate, "every figure sourced"); not re-verified here. The 2026-09-05 audit's own verdict stands as
   COULD NOT VERIFY, un-superseded by anything found this session.

## What the operator must rule on

- **Migration 299 is still unapplied, six weeks past the T45 date the plan's own sequencing table claimed
  it would land.** Recommendation: apply it in 5.2 (S2's own gap-closure lane) before any further record
  mint, since the kit gap it fixes affects every future record item of the four named types; alternatively
  rule it out of scope and strike it from the plan.
- **Ledger-consume's apply half (finding 1) has now gone unfired across two full audits three weeks apart**,
  while the four ratification scripts it sits beside have all been dispatched for real in the interim.
  Recommendation: either dispatch one real `mode:apply` run with a committed `verdicts_file` as part of 5.2
  (cheap: `LEDGER_CONSUME_APPLY_ENABLED` is already true, the mechanism is otherwise proven), or rule that
  ledger-consume's apply path is superseded by the review-apply-portal-links path (which now does the bulk
  disposal work) and retire the apply half explicitly rather than leave it a standing unfired finding.
- **`downstream-chain.yml`'s own firing cannot be confirmed from repo state** (no committed harness-run
  artifact, by design, same posture as the rest of the `maintenance` family). Recommendation: this is a
  genuine gap in `F28`'s scope (maintenance-family steps are exempt) worth a ruling on whether S6's harness
  lane should extend F28 or accept the GitHub Actions ephemeral-artifact posture as final for this family.
- **`corpus-turn.yml` still has no automatic upstream trigger** (dispatch/push only), unlike
  source-sweep-to-ledger-consume-to-population-turn. Recommendation: decide whether corpus-turn should gain
  a `workflow_run` trigger of its own (e.g., off a schedule-free source-sweep or ledger-consume event) or
  whether hand/push dispatch is the intended permanent shape for this family; the plan's own section 1 loop diagram
  implies it should close, and open corpus_turn_requests tickets have grown (915 to 963) since the last
  dispatch with no counter-mechanism.

## Counts

17 rows scored. **COMPLETE 9**: vertical-fit/entity gates, mandatory flywheel inside population-turn, mint
chokepoint (single-item), rule-16 mint-time enrichment, batch-mint enrichment via the population-turn gate,
plan-mode ledger-consume, the four ratification scripts, R-A off-vertical archive, staged_updates transit.
**PARTIAL 7**: corpus_turn_requests consumption, corpus-turn.yml (whole workflow), population-turn.yml
(whole workflow), downstream-chain.yml, apply-mint-batch.mjs / record-grade kit, R-E origin_class backfill,
ADR-025 tags/classifications. **NOT BUILT 2**: ledger-consume apply half (finding 1), migration 299.
**BUILT-DORMANT 0. COULD NOT VERIFY 0** as a standalone verdict (downstream-chain.yml's own firing is an
unverifiable sub-question inside an otherwise-confirmed PARTIAL row, not scored as its own line).

Rows added beyond the stage's literal start list ("classify and intake, corpus-turn and population-turn
workflows, apply-mint-batch, the record-grade kit at mint, ledger-consume both halves,
corpus-turn-requests"): **6**, `downstream-chain.yml`, R-A off-vertical archive, R-E origin_class backfill,
migration 299, `staged_updates` transit, ADR-025 tags/classifications. `downstream-chain.yml` is the single
most consequential of these since it did not exist at the 2026-09-05 audit.
