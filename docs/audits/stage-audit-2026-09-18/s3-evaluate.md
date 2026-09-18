# S3 evaluate: stage audit 2026-09-18

Method note: read the plan (`docs/plans/complete-system-build-plan-2026-09-04.md` sections 0, 1, 2 W3/W9,
5), the prior audit (`docs/audits/plan-completion-audit-2026-09-05/README.md` and `W3-W4-sourcing-propagation.md`
in full), `docs/plans/brief-chain-build-plan-2026-09-11.md` Part 7, `docs/ops/session-log.md` (tail +
targeted greps), `docs/ops/dispatch-ledger.jsonl`, `docs/inventories/migrations.md`, and the named source
files under `fsi-app/src/lib/agent/`, `fsi-app/scripts/mint/`, `fsi-app/scripts/maintenance/`,
`fsi-app/scripts/verify/`, `fsi-app/scripts/turns/record-briefs/`, `fsi-app/.discipline/governance/`,
`fsi-app/scripts/harness-runs/brief-apply/PENDING-RUN.md`. Ran read-only SQL (SELECT, aggregates or
stored-length/int columns only, LIMIT on every non-aggregate query) against the live Supabase project via
`scripts/lib/pg-conn.mjs`. Commit read: repo HEAD `806c0c48` (master `3da30b22` + one docs commit), the
commit the common brief names.

## The table

| Component | Where (file / workflow / table) | 1 Reachable | 2 Run | 3 Populated | 4 Visible | 5 Gated | 6 Documented | Verdict | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| Brief runtime core (generate / ground / groundBrief / crossLinkClaimSources) | `fsi-app/src/lib/agent/canonical-pipeline.ts`, driven by `scripts/turns/apply-record-briefs.mjs` via `.github/workflows/brief-apply.yml` | YES [CONFIRMED] imported by the driver, workflow has a live `run:` step | PARTIAL [CONFIRMED] last landed artifact `brief-apply-run-006.json` (2026-09-17 07:00); `scripts/harness-runs/brief-apply/PENDING-RUN.md` shows 4 re-pins since, the two most recent (2026-09-18) naming `canonical-pipeline.ts` itself as a changed governing file with no run landed after | YES [VERIFIED, SQL] `item_grade='brief'` = 1,189 of 2,766 live items; `section_claim_provenance` = 21,382 FACT / 11,082 GAP / 1,394 ANALYSIS / 163 DERIVED / 4 LEGAL rows | N/A not checked this session (S5 owns surface rendering) | YES [CONFIRMED] F28 harness-run-integrity ties this family's hash to its governing files; the non-destructive-grounding invariant (below) covers the ground step specifically | YES brief-chain-build-plan Part 3 | PARTIAL | `PENDING-RUN.md` re-pins 3 and 4; SQL counts above |
| `ledger-apply.mjs` (diffLedger / applyLedgerDiff, non-destructive grounding) | `fsi-app/src/lib/agent/ledger-apply.mjs`, wired into `groundBrief` | YES [CONFIRMED] `.discipline/governance/invariants.mjs` line ~925 names the wiring | YES exercised on every brief-apply run (same PENDING-RUN caveat as the row above) | YES [VERIFIED, SQL] `claim_versions` exists as the append-only history table this mechanism writes to (migration 208) | N/A | YES [CONFIRMED] registered invariant, `enforcedBy: selftest:fsi-app/scripts/verify/non-destructive-grounding.golden.mjs`; doctrine text claims 32/32 checks passing; **not independently re-run this session, so that specific number is [HYPOTHESIS]** | YES `governance/doctrine-register.mjs`, `governance/invariants.mjs` | COMPLETE | `invariants.mjs` grep; migration 208 |
| `validate_item_provenance` (DB function, criteria 1-7) | live Postgres function, migrations 112-141, 202, 326 | YES [VERIFIED, SQL] `select proname from pg_proc where proname ilike '%validate_item_provenance%'` returns 1 row | YES trigger-fired continuously on mint/heal | N/A (function, not a table); its effects populate `item_gate_a_state`/`provenance_status`, counted below | N/A | PARTIAL [CONFIRMED, matches the 2026-09-05 audit] no dedicated fitness function found this session scoped to this function's criteria shape | YES migration headers | COMPLETE (mechanically, matching prior audit) | `pg_proc` query; grep of `.discipline/fitness/functions/` |
| `item_type_required_slots` (criterion 5's required-slot table) | live table | YES | YES | YES [VERIFIED, SQL] 48 rows across all item types | N/A | YES [CONFIRMED] mirrored pre-write in `scripts/turns/record-briefs/schema.mjs` by lane L25 (commit `caa08198`, merged #692, on master) | YES | COMPLETE | SQL count; `git log` for L25 |
| Gate A scanner + `item_gate_a_state` (version currency) | `src/lib/agent/gate-a-scan.mjs` (`GATE_A_VERSION = "2026-09-04.1"`), `item_gate_a_state` table | YES [CONFIRMED] single source since lane DEAD-EXEC (2026-09-04), imported directly by `write-item.ts`, `apply-mint-batch.mjs`, `validate-mint-payload.mjs`, `heal-provenance.mjs` | PARTIAL runs on every new mint/heal write, but nothing has bulk re-scanned the pre-existing corpus to the current version | YES [VERIFIED, SQL] 2,690 rows, one per live item (0 live items missing a row); but split `2026-07-30.1`: 2,088 rows / 423 total orphans across 51 items, `2026-09-04.1`: 602 rows / 323 total orphans across 69 items; **two distinct versions live, not the `distinct(gate_a_version)=1` state the gate-version-bump doctrine requires** | N/A internal | PARTIAL no gate fails CI on version non-uniformity; F28 only measures the harness-family hash, not this table | YES session log confirms the bump and its intent (lane GATE-A-TOKENS) | PARTIAL | SQL: `select gate_a_version, count(*) from item_gate_a_state group by 1` |
| Quarantine disposition / research-or-erase invariant | `fsi-app/scripts/verify/quarantine-disposition-audit.mjs`, `integrity_flags` table, `set_provenance_status` trigger | YES [CONFIRMED] registered invariant per its own header, required by the meta-gate | YES the verifier is read-only and runs in CI-with-secrets / ops; pre-push validates wiring only, not the live count, by the script's own comment | YES [VERIFIED, SQL] 78 live items `provenance_status='quarantined' AND is_archived=false`; enqueue check (a) holds 78/78 carry an open `integrity_flags` row keyed by `subject_ref`; dwell check (b) **53 of 78 (68%) exceed the 14-day `DWELL_BOUND_DAYS` with no recorded disposition**; a live violation of the invariant's own definition | N/A | PARTIAL wired as an invariant the meta-gate requires to stay wired, but nothing in CI fails on the live dwell-violation count itself (only on the mechanism going unwired) | YES script header, remediation-discipline skill | PARTIAL | SQL: dwell/enqueue counts above; script header read |
| `attach-found-sources.mjs` (STEP SOURCE heal, orphan figures) | `scripts/maintenance/attach-found-sources.mjs`, `maintenance.yml` step | YES [CONFIRMED] wired | YES [CONFIRMED, dispatch-ledger.jsonl] apply run `34061606578` on 2026-09-06 (Maintenance #69): grounded 82 of 176 worklist rows; note reads "359 of the original 441 orphan figures remain"; **this REFUTES the 2026-09-05 audit's finding 2 claim that this step "has never been dispatched in apply mode"; it ran the day after that audit's tree was cut** | PARTIAL [VERIFIED, SQL] today's live `item_gate_a_state.orphan_count` sums to 746 across 120 items (a later, broader measure than the 441-figure population the 2026-09-06 run targeted) | N/A | PARTIAL test-only (`attach-found-sources.test.mjs`), no execution-wiring check for run recency | YES | PARTIAL | dispatch-ledger.jsonl entries; SQL orphan sum |
| `tier-opinions.mjs` / `source_tier_opinions` | `scripts/maintenance/tier-opinions.mjs`, `maintenance.yml` step | YES | YES [CONFIRMED, dispatch-ledger.jsonl] apply run `33990256285` on 2026-09-05 (Maintenance #50): "371 source_tier_opinions rows written... live count read back 371"; a 2026-09-07 dry re-run (`34082329193`) correctly found the same 371 disagreements and did not re-apply; **this REFUTES the 2026-09-05 audit's finding 2 claim for this component too** | YES [VERIFIED, SQL] `select count(*) from source_tier_opinions` = 371, matches the ledger read-back exactly | PARTIAL reader exists at `src/app/api/admin/sources/tier-opinions` (admin-only, not independently opened in-browser this session) | PARTIAL test-only | YES migration 309 header | COMPLETE | SQL count; dispatch-ledger.jsonl |
| Institution class table / T4 standards-body override | `scripts/maintenance/institution-canonicalize.mjs` Part C, `src/lib/sources/host-authority.ts` | YES | YES dry+apply landed 2026-09-04 (dispatch ledger, prior audit) | YES [VERIFIED, SQL, re-confirmed live today] IFRS/ISSB, SBTi, CDP/Supply Chain Program all `base_tier=4`; noted in passing: a separate duplicate row "CDP Supply Chain" carries `base_tier=5`; not itself a T4-override defect but a source-record duplication worth a later look | N/A | PARTIAL test-only | YES | COMPLETE | SQL: `select name, base_tier from sources where name ilike '%IFRS%' or ...'` |
| record-briefs pre-write validator, criterion-5 slot mirror | `scripts/turns/record-briefs/schema.mjs`, lane L25 | YES [CONFIRMED] imported by the driver | YES [CONFIRMED] `git log` shows `caa08198` "Lane L25: the record-briefs validator mirrors criterion 5 (required slots) before any write (#692)" on master; exercised by every subsequent brief-apply run per the session log's defect-fix trail (L40, L42 both touch the same file afterward) | N/A (a write-time gate, not a table) | N/A | YES own tests; re-pinned repeatedly in `PENDING-RUN.md` as its governing files changed, which is the F28 mechanism working as designed | YES | COMPLETE | `git log --oneline`; PENDING-RUN.md re-pins |
| `checkBriefContent` (write-side brief-failure gate) | `fsi-app/src/lib/sources/fetch-quality.ts` | YES | YES [CONFIRMED, session log 2026-09-18 coordinator-close entry] "007 8 of 9 (4929e6a9 refused by the write-side brief_failure_gate on its stub note)"; a real refusal fired this week | N/A | N/A | YES exercised at every apply | YES | COMPLETE | session log grep; function read |
| Every-figure-sourced enforcement (orphan exclusion + zero-FACT items) | `validate_item_provenance` + quarantine trigger + `item_gate_a_state` | YES | YES | PARTIAL [VERIFIED, SQL] 0 of 2,546 `verified` items carry `orphan_count > 0` (the exclusion mechanism holds for the orphan class); but **7 `verified`, non-archived items carry zero FACT claims at all** (a distinct, narrower gap: nothing to be orphaned because nothing was ever grounded) | N/A | PARTIAL the orphan-exclusion is enforced by the trigger; nothing found this session that gates the zero-FACT-claim case specifically | YES rule 18 | PARTIAL | SQL: orphan/verified join; zero-FACT-claim count |
| Credibility chips / `RecordGradeBadge` on all four surfaces (W3.4) | `src/components/research/CredibilityChip*.tsx`, `src/components/shell/RecordGradeBadge.tsx` | PARTIAL [VERIFIED, grep of `src/app` and `src/components`] `CredibilityChip*` mounted in Research (`research/page.tsx`) and Operations (`OperationsItemsView.tsx`) only; `RecordGradeBadge` mounted in Operations, Regulations (`RegulationDetailSurface.tsx`) and Research (`ResearchFindingDetailSurface.tsx`), **absent from Market entirely** (no hit under `src/components/market` or `src/app/market`) | N/A (a render, not a dispatch) | N/A | PARTIAL not opened in-browser this session; grep-confirmed absence on Market is the strong half of this finding | N/A | N/A no fitness function found gating chip/badge coverage per surface | PARTIAL | grep of both component names across `src/app` and `src/components` |
| `brief-export.yml` / `brief-apply.yml` workflows | `.github/workflows/brief-export.yml`, `.github/workflows/brief-apply.yml` | YES `workflow_dispatch` wired, `population-report.mjs` runs `if: always()` | PARTIAL last landed brief-apply artifact 2026-09-17 07:00; governing files have since changed twice more with no confirming run (see Gate A/runtime row above; same underlying staleness) | YES (see runtime row) | N/A | YES F28 + PENDING-RUN mechanism itself functioning correctly (it is designed to surface exactly this staleness, and does) | YES workflow header comments are extensive and current | PARTIAL | PENDING-RUN.md |
| Computed-values admissibility path (`statutory_computations`, `estimated_values`); the S3-relevant half of finding 7 | `src/lib/statutory/types.ts`, F32-statutory-purity, migration 286 | YES mechanism built (per 2026-09-05 audit, not re-read line-by-line this session) | N/A no writer has ever produced a row | NO [VERIFIED, SQL, re-confirmed today] `statutory_computations` = 0, `estimated_values` = 0; **finding 7 is still true today, unchanged since 2026-09-05** | N/A nothing to render | YES F32 exists and would fire on any insert (per prior audit's reading, not re-verified) | YES | NOT BUILT (as a live, sourced figure; the every-figure-sourced gate for this class is unexercised because the class has no data) | SQL: `select count(*) from statutory_computations`, `estimated_values` |

## Prior claims re-checked

- **Finding 2** ("attach-found-sources.mjs and tier-opinions.mjs are built, wired, unit-tested, and have
  never been dispatched in apply mode; source_tier_opinions = 0 rows; no attach-found-sources run artifact
  anywhere in the tree"); **[REFUTED]** as of today. Both ran in apply mode: tier-opinions on 2026-09-05
  (run `33990256285`, wrote all 371 live rows, confirmed by live SQL) and attach-found-sources on
  2026-09-06 (run `34061606578`, grounded 82 of 176 worklist rows). Both dispatches are in
  `docs/ops/dispatch-ledger.jsonl`. What is **not** refuted: attach-found-sources has not reached its own
  W3.1 done-when condition ("orphans to 0"); 359 of the original 441 orphan figures remained after that
  one run, and today's broader `item_gate_a_state.orphan_count` sum is 746 across 120 items, with no
  further attach-found-sources dispatch recorded since 2026-09-06.
- **Finding 7, computed-values half** ("statutory_computations and estimated_values remain at 0 rows") ;
  **[CONFIRMED still true]**, re-measured live today: both 0. Unchanged since 2026-09-05.
- **W3-W4 file, "validate_item_provenance criterion 3" row (COMPLETE, chip sub-item PARTIAL, "today
  Research-only")**; the chip sub-item is **[CONFIRMED still true, updated]**: `CredibilityChip*` remains
  Research + Operations only. The finding-3 correction that Research's `RecordGradeBadge` row-mount gap
  had closed is **[CONFIRMED]** (`ResearchFindingDetailSurface.tsx` now mounts it); Market's absence
  (both components) is **[CONFIRMED still true]**.
- **W3-W4 file, "Gate A orphan worklists (386/443)" row** (prior: "NOT BUILT (as closed work)", the exact
  count flagged `[HYPOTHESIS]`, not recomputed); **could not be reproduced at the same scope this
  session** (the corpus has changed since 2026-09-04: more items minted, more quarantined, one real
  attach-found-sources apply landed). The live proxy available read-only, `item_gate_a_state.orphan_count`,
  sums to 746 today across 120 items; still open, still substantial, not closed, but not directly
  comparable to the original 386/443. Flagged `[HYPOTHESIS]` on the comparison, `[VERIFIED]` on the 746/120
  figure itself.
- **Institution class table + T4 override row (prior: COMPLETE)**; **[CONFIRMED]**, re-verified live
  today with fresh SQL against the same source names the prior audit cited.
- **Brief-chain plan Part 7, L30-L44 states**; on master (HEAD `806c0c48`, tip `3da30b22`): L25, L26, L27,
  L28, L30, L31, L32, L33, L34, L35, L40, L42, L44 are landed. **L39 (migrations 326 and 328, the
  regulation/directive `penalty_summary`/`primary_deadline` GAP-satisfiable wording and the three
  provisional-source activations) and L41 (the env-file load guard, F48) are NOT on master**; both
  remain open branches per the session log's 2026-09-18 close ("#704 L39... not pushed", "#706 L41").
  However, live SQL against `item_type_required_slots` today shows the migration-326 GAP-satisfiable
  wording for `regulation`/`directive` `penalty_summary` and `primary_deadline` **already present in the
  live database**, and two migrations timestamped 2026-09-18 exist in `schema_migrations` beyond the last
  one `docs/inventories/migrations.md` documents (325, applied 2026-09-17). This is consistent with rule 3
  (DDL applied by the coordinator ahead of the dependent code merge) and not itself a violation, but it
  means the live schema is currently ahead of what master's own code branch assumes for those two slots
  until L39 lands; a state worth the operator's attention, not a defect in the DDL-first ordering itself.

## What the operator must rule on

- **Gate A version non-uniformity (2,088 items at `2026-07-30.1` vs 602 at `2026-09-04.1`).** The plan's
  section 5.2 sequence names "the Gate A re-scan" as a queued step, and the session log's 2026-09-17 decisions
  record "Gate A re-scan" as ruled-on but not yet executed; today's count shows it genuinely has not run.
  Recommendation: this is the highest-leverage single S3 gap; until it runs, most of the live corpus is
  scored by a superseded scanner version, and any downstream claim about orphan counts is comparing two
  different measuring sticks.
- **Quarantine dwell (53 of 78 live-quarantined items past the 14-day research-or-erase bound).** The
  invariant's own definition treats this as a violation; nothing in CI currently fails on the live count,
  only on the mechanism staying wired. Recommendation: either run the resolver (`regen-quarantined.mjs`)
  against the 53, or explicitly extend/waive the bound with a recorded reason; "quarantined but not
  investigated" is the exact state remediation-discipline forbids as a terminal state.
- **attach-found-sources: finish or re-scope.** It ran once (2026-09-06) and has not been dispatched since,
  leaving 746 live orphan tokens across 120 items today. Recommendation: dispatch it again against a fresh
  worklist now that Gate A version currency is also pending, rather than treating the single 2026-09-06 run
  as having discharged W3.1.
- **Credibility chips / RecordGradeBadge on Market.** Recommendation: finish (mount both on Market); this
  is a small, well-scoped UI wire-up, not a data problem, and it is the last surface missing both
  components entirely.
- **Computed-values path (statutory_computations, estimated_values) at 0 rows.** This is chiefly an S4
  concern (no producer has written a row), but it means S3's every-figure-sourced gate for this class has
  never been exercised on real data. Recommendation: keep-with-reason until S4 produces a first row, then
  this row's verdict should move.
- **L39 migrations live, code not merged.** Recommendation: land L39 promptly; the live schema is currently
  ahead of the code that documents and consumes it, a state that should not persist past the next train.

## Counts

Verdict totals (14 scored rows): COMPLETE 6, PARTIAL 7, NOT BUILT 1, BUILT-DORMANT 0, COULD NOT VERIFY 0.

Rows added beyond the plan's start list: 6 (`ledger-apply.mjs` scored separately from the runtime row;
the record-briefs pre-write validator; `checkBriefContent`; the credibility-chip/RecordGradeBadge coverage
row; the `brief-export.yml`/`brief-apply.yml` staleness row; the computed-values admissibility row as the
S3-relevant half of finding 7).
