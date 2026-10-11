# Last proposer pass -- structured-actions

Per `PROPOSER-RUNBOOK.md` section 2's attestation format. `structured-actions` has **two** artifacts in
this directory (`structured-actions-run-002`, `structured-actions-run-003`); F28's rule (d) requires this
file to name the latest verbatim: **structured-actions-run-003**. Newest pass first. This is the family's
first proposer pass.

## Pass over structured-actions-run-002 and structured-actions-run-003 (2026-10-10, lane PROPOSE-1)

**Artifacts read:** structured-actions-run-002 (dry, started_at 2026-09-29T02:37:41.097Z, harness_version
sha256:622784f74f0d0dd9, two-stage method: a live read-only SQL pass picked 67 candidate items and cut the
do-now section bodies with a heading-bounded regex, then the real `extractActionFromParagraph` ran locally
over those bodies; items_with_at_least_one_action 42, total_actions 162, one defects_found entry with a
fix_ref) and structured-actions-run-003 (dry, started_at 2026-10-10T14:30:07.526Z, governing_hash
sha256:7cf5b60b87514ef8, a full-corpus run through `scripts/turns/dry-run-structured-actions.mjs`: items_scanned
2690, items_with_brief 2690, items_with_actions 43, total_actions 141, actions_with_timeframe_days 6,
actions_with_owner 0, actions_with_due_date 2, defects_found empty, per_item 2690 rows). Also read
`family.json` (registered 2026-09-28, three governing files). run-003's per_item array was read
programmatically in full (2690 rows, 2690 distinct ids, 2647 `no_actions`, 43 `actions_extracted`, no row
with an error, every evidence_refs array empty, the 43 verdict counts sum to 141 and equal metrics.total_actions).
The file is 462 KB, so it was not paged through line by line; every top-level field was inspected and the
per_item array was aggregated, which is a deliberate method, not a skipped read.

**Full traces read:** both artifacts' `full_trace_refs` (identical in the two runs): `docs/plans/build-plan-2026-09-25.md`
(workstream 6, the M4 merge note, the lane-7 sequencing row), `docs/plans/data-machine-tool-gaps-2026-09-25.md`
(the "Structured-action extraction" row and the 2026-09-28 correction paragraph), `docs/specs/07-page-walkthrough.md`
(the obligation-card passage defining "a task with an owner and a due date"). Also read, as the code the runs
exercise: the header and signature region of `src/lib/agent/extract-recommended-actions.mjs`, the git history
of the three governing files, and `scripts/lib/record-harness-run.mjs` (the recorder). Not openable: no
extraction output exists to open, because neither run's artifact points at one (see hypothesis 1); the
extracted action texts of run-002 and run-003 are not preserved anywhere in the repo, and nothing here
claims to know what they said.

**Hypotheses:**

1. `[CONFIRMED]` **Neither run leaves a trace a proposer can audit.** Method: read both `full_trace_refs`
   lists and run-003's per_item. The three refs are planning and spec documents, not run output; per_item
   carries a count per item (`verdict` "count=N") and an empty `evidence_refs`, never the action text, the
   verb, the section or the paragraph. The PROPOSER-RUNBOOK section 1 step 3 rationale (full traces beat
   scores plus summary) cannot be applied to this family: a proposer can see that 141 actions exist and
   cannot see whether any of them is wrong. The one defect run-002 found (the "Commission" institution used
   as a sentence subject) was found during the run and is described in prose only; no recorded trace shows the false positive.
2. `[HYPOTHESIS]` **The drop from 162 actions (run-002) to 141 (run-003) is mostly a method difference; this is unverified and could
   include corpus change.** Evidence for: run-002's `metrics.method` states its section bodies were
   cut by a SQL regex "an approximation of extract-sections.ts's fence/heading-level-aware boundary logic",
   which can include text past the true section end (more paragraphs, more actions); run-003 used the real
   section parser over every item. The corpus size is identical (2690 in both), so item count did not move.
   The diff of the three governing files between the two runs was read (commits 911c3a873, 492dfdb41,
   ab1fc777f): `let` to `const` in two places, an `export` keyword dropped from `runDryRun`, and unused
   exports removed from `extract-sections.ts`; no change to the extractor's matching logic. That is why the
   harness_version hash moved (622784f74f0d0dd9 to 7cf5b60b87514ef8) without a behaviour change `[CONFIRMED]`
   by the diff read. Unverified: whether the stored briefs themselves changed between 2026-09-29 and
   2026-10-10 (no live database access in this lane, and neither artifact records brief content hashes), and no
   per-action comparison is possible because of hypothesis 1. Per-verb deltas to attribute, if ever
   attributed: Assess 63 to 52, Map 31 to 27, Engage 29 to 26, Verify 35 to 33, Commission 4 to 3; per type
   regulation 111 to 97, framework 22 to 18, standard 18 to 14, guidance 7 to 7, directive 3 to 3,
   market_signal 1 to 2. The one verb-and-type pair that moved up (market_signal 1 to 2) is consistent with
   either explanation and is not evidence for either.
3. `[CONFIRMED]` **The extractor honours the no-fabrication rule on owner and due date, and the corpus
   rarely supplies them.** Method: run-003 metrics (owner 0 of 141, due_date 2 of 141, timeframe_days 6 of 141)
   read against the extractor's header (owner and due_date null unless the prose states them; due_date only
   from an explicit date, never derived from a timeframe). Spec 07's obligation card wants "a task with an
   owner and a due date"; 139 of 141 extracted actions carry no due date and none carries an owner, so a
   structured action written today could not fill that card's owner or date slot from extraction alone.
   That is a gap between spec and corpus, not an extractor defect.
4. `[CONFIRMED]` **The write half is the same open stop-and-ask in both runs.** Method: read the
   `proposer_notes` of run-002 and run-003. Both carry the 2026-09-28 coordinator question (which table or
   column receives structured actions; whether non-regulatory formats get a do-now section invented) with no
   fix_ref and no decision recorded in either artifact. Both runs write nothing to any
   customer-data table. The question is carried unchanged, not new.
5. `[CONFIRMED]` **Recorder fact A: the ledger id and the artifact name disagree.** Method: compared the
   committed artifact (`run_id` structured-actions-run-003, file `structured-actions-run-003.json`) with
   `fsi-app/.discipline/governance/harness-ledger-export.json` (exactly one structured-actions row, run_id
   `structured-actions-run-001`, started_at 2026-10-10T14:30:07.526+00:00) and with
   `scripts/lib/record-harness-run.mjs`, which renumbers an artifact to `harness_runs` max+1 for its family and
   returns `renumbered: true` when they differ. The executor observed the recorder return `renumbered: true`.
   The ledger export has no earlier structured-actions row (why run-002 never reached the table is not established by these artifacts), so the table max+1 was
   1 while the local artifact scan gave 3. Consequence: the family directory (002, 003) and the ledger (001)
   number the same history differently, so a reader cannot map a ledger row to its artifact by id; the
   artifact's `started_at` is the only join key. Also in the same ledger row: `finished_at` null and
   `trigger` null, while the artifact carries trigger "manual". `[WORK: HARNESS-1]`
6. `[CONFIRMED]` **Recorder fact B: run-001 has no artifact in this family directory.** Method: listed
   the directory (family.json, run-002, run-003 only). The numbering starts at 002 locally, so the family has
   no local run-001 while the ledger has a "run-001" that is actually the local run-003; the two
   numberings cannot both be right about what "run-001" means. `[WORK: HARNESS-1]`

**Proposal:** No change to the extractor, the driver or the rules is warranted this pass: the only open
question on the extraction half (hypothesis 2) cannot be settled from the artifacts, and proposing a code
change against an unattributed count delta would be inventing a defect. Three items are recorded as work, none
implemented here (this lane's write set is this one file):

- (a) `[WORK: HARNESS-1]` Reconcile ledger and artifact numbering for structured-actions: make the recorder's
  returned run_id the one the artifact file carries (or record the artifact name in the ledger row), and
  record `finished_at` and `trigger` on the ledger row. Basis: hypotheses 5 and 6.
- (b) `[WORK: HARNESS-1]` Give the dry-run driver a real trace: write the extracted actions (item id, verb,
  source_section, action_text, timeframe_days, owner, due_date) to a gitignored trace file and list it in the
  artifact's `full_trace_refs`, so the next proposer pass can read output instead of counts. This changes a
  governing file, so it is a build lane with its own proof. Basis: hypothesis 1. With that trace in place,
  hypothesis 2 becomes testable by diffing two runs' action lists.
- (c) The write-half decision in hypothesis 4 stays with the coordinator; it is an operator-level ruling,
  not a harness change, and is restated here only so this pass does not drop it.

**Family gates status:** the family's own gates for this pass are F28 rules (b) to (d) in CI. This pass
changes no code; CI on PR 1091 is the gate and its result is recorded on the PR, not asserted here.

**Standing metric (PROPOSER-RUNBOOK.md section 3).** `structured-actions` has no registered standing metric
yet. The candidate the two artifacts support: actions extracted per item with at least one action (run-002
162/42 = 3.86 on the approximated sections; run-003 141/43 = 3.28 on the real parser), plus the share of
actions with a stated due date (run-003 2/141). Neither is comparable across the two runs until hypothesis 2
is resolved, so no trend is claimed.
