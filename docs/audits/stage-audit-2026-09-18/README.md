# Stage audit, 2026-09-18: is the machine wired, and does it run on its own

## What this audit is

The operator's ruling, 2026-09-18, verbatim intent: "before we continue updating the data and eating tokens
doing it, I want to make sure we have fully finished building the system that collects, evaluates and uses
the data and puts it into the site; I do not think that is complete and we will just have to go back and fix
the data again." And, on the first draft of this report: "the system is the focus right now, NOT the data;
then after we fix the system and make sure it works, we fix the data."

Seven owners ran in parallel, read-only (no writes, no migrations, no workflow dispatches, no full builds,
SELECT-only SQL under the IO budget, no paid calls), against the tree named below, each scoring one stage of
the loop in `docs/plans/complete-system-build-plan-2026-09-04.md` section 1 against the six criteria of
section 0 (reachable, run, populated, visible, gated, documented). The 2026-09-05 audit
(`../plan-completion-audit-2026-09-05/`) was a claim to re-check, never evidence. Rule 14 tokens on every
cell. The coordinator re-ran the headline queries and file reads before writing this README; the marks below
say which.

Tree audited: master `3da30b22` (L44, 2026-09-18). Stage files: [s1-collect](./s1-collect.md),
[s2-mint-gate](./s2-mint-gate.md), [s3-evaluate](./s3-evaluate.md), [s4-propagate](./s4-propagate.md),
[s5-publish](./s5-publish.md), [s6-gates-harness](./s6-gates-harness.md). The design inventory the parts
brief demands is [docs/design/parts-inventory.md](../../design/parts-inventory.md).

## The answer: every hop exists as code; the loop has never run end to end on its own

Read down the loop. "Trigger" is what starts the hop today. "Fired on its own" is whether the hop has ever
run from its upstream trigger rather than from a person dispatching it.

| Hop | Trigger today | Fired on its own | Evidence |
|---|---|---|---|
| Source sweep (sitemap, register, feed walkers) | `workflow_dispatch` only; nothing upstream | never; last hand run 2026-09-05 (`source-sweep-run-018`); sitemap backfill never completed | s1 rows 2 to 4 [CONFIRMED by artifact listing, coordinator re-read] |
| Capture worker (fetch-drain) | no workflow file; a person issues the `pg_net` call | never; last hand call 2026-09-01 (`fetch-drain-run-003`) | s1 rows 7 and 8 [CONFIRMED] |
| Change detection | `change-detection.yml`; check-sources off by operator ruling (rule 16) | last run 2026-09-04 (`change-detection-run-005`) | s1 rows 5 and 6 [CONFIRMED] |
| Sweep to ledger-consume | wired: `workflow_run` on "Source sweep" | plan mode only, all 7 runs; the apply half has never been enabled, so nothing promotes a candidate without a person. The bulk promotion that did happen was the four review-apply maintenance scripts run by hand (349 sources activated, 53,718 links rejected) | s2 rows 11 to 13 [CONFIRMED by SQL, coordinator re-run: rejected 53,718, candidate 3,751, promoted 3] |
| Ledger-consume to population-turn (mint) | wired: `workflow_run` on "Ledger consume", gated by `POPULATION_PAUSED` | last mint `mint-run-029`, 2026-09-04 | s2 row 4 [CONFIRMED by artifact listing, coordinator re-read] |
| Corpus-turn | `workflow_dispatch` or a push to `turn/`; no upstream `workflow_run` | 2 hand runs, 2026-09-05 | s2 row 3 [CONFIRMED] |
| Mint or corpus-turn to downstream-chain (tier opinions, derive-obligations, tag proposals, apply-classifications) | wired since 2026-09-06: `workflow_run` on "Population turn" and "Corpus turn", chains into the drain | never for real; no harness artifact for the family | s2 row 6 [CONFIRMED by file read, coordinator re-read] |
| Downstream-chain and data producers to propagation drain | wired: `workflow_run` on "Data producers" and "Downstream chain" | fires: 8 recorded runs 2026-09-02 to 09-11; recomputed anything once (run 004, the hand backfill) | s4 row 6 [CONFIRMED by artifacts] |
| Producers to DAG edges | wired in code for all three families, unconditional after the guarded write | emission_factors 20 edges, regional 4, market_series 0 even after the ecb-fx run of 2026-09-16 | s4 rows 1 to 3 [CONFIRMED by SQL, coordinator re-run] |
| Mint to brief chain (W9's "wired at mint") | not wired: mint leaves a stub `full_brief`; `brief-export.yml` and `brief-apply.yml` are `workflow_dispatch` with authoring lanes between them | never automatic | s3 rows 1 and 14 [CONFIRMED] |
| Gate A bulk re-scan; quarantine disposition | the scanner runs per write; the bulk re-scan and the disposition verifier have no invoker but a maintenance dispatch | never; 2,088 items scanned under the superseded version, 602 under the current one | s3 rows 5 and 6 [CONFIRMED by SQL, coordinator re-run] |
| Statutory, estimated, spec-09 writers | wired as opt-in drain and maintenance steps that no-op without a reviewed rows-file | never with real input; the only input path is a hand-made file that does not exist | s4 rows 8, 9, 11 to 13 [CONFIRMED by SQL: all four tables 0 rows, coordinator re-run] |
| Publish | every customer read passes `_workspace_active_items` (verified only); `item_grade` projects on all 11 listing RPCs (migration 310 applied) | the grade badge is mounted nowhere reachable (its one JSX mount is in an unimported file); notices depend on superseded pairs that never form | s5 rows 13 to 15 [CONFIRMED by grep, coordinator re-run] |
| Harness and gates | 9 families record artifacts; fitness and closure gate green on CI today | dispatch ledger last row 2026-09-07 while 24 maintenance steps landed | s6 rows [CONFIRMED by file read, coordinator re-run] |

## The six wiring gaps, in loop order (the section 5.2 backlog)

1. **No head of the loop.** Nothing starts a sweep or a fetch drain; the collect stage is a set of dispatch
   buttons, and one of them (fetch-drain) is not even a workflow. Owner stage S1.
2. **Ledger-consume apply never enabled.** Candidates never become worklist without a person. Owner S2.
3. **Corpus-turn has no upstream and downstream-chain has never fired.** Nobody has proven mint to drain with
   one real run. Owner S2 with S4.
4. **The brief chain sits outside the loop.** Mint leaves a stub and nothing upgrades it; W9 has been a hand
   loop of export, author, apply, and every apply fix sent items back through it. Owner S3.
5. **Market-series edge authorship writes nothing**, so the drain has nothing to recompute for the
   highest-volume producer. Needs a traced apply run to diagnose; read-only could not. Owner S4.
6. **The last mile is unmounted or unfed.** Grade badge, notices, and the computed-values writers have no
   live mount or no input path. Owner S5 with S4.

Also in scope for 5.2 because a later stage depends on them: migration 299 (the 3-slot kit) unapplied;
L39's migrations live with its code unmerged (#704); the Gate A re-scan and the quarantine disposition
verifier need an invoker, not a dispatch.

The corpus numbers (verified 1,440, quarantined 78 of which 53 past the 14-day bound, Gate A version split,
orphan tokens 746 across 120 items, four empty computed-values tables) are the shadow these gaps cast. They
are recorded in the stage files and in the appendix below; they are not the work. The data passes run once,
after 5.2, per plan section 5.3.

## Verdict totals by stage (the owners' tables, six criteria)

| Stage | Rows | COMPLETE | PARTIAL | BUILT-DORMANT | NOT BUILT | COULD NOT VERIFY | Other |
|---|---|---|---|---|---|---|---|
| S1 collect | 14 | 0 | 9 | 3 | 1 | 1 | |
| S2 mint gate | 17 | 9 | 7 | 0 | 2 | 0 | |
| S3 evaluate | 14 | 6 | 7 | 0 | 1 | 0 | |
| S4 propagate | 15 | 2 | 6 | 1 | 5 | 0 | 1 retired |
| S5 publish | 19 | 2 | 15 | 2 | 0 | 0 | |
| S6 gates and harness | 19 | 12 | 5 | 3 | 0 | 0 | 1 N/A |
| Total | 98 | 31 | 49 | 9 | 9 | 1 | 2 |

Read against 2026-09-05 (53 rows: 12 complete, 22 partial, 7 dormant, 11 not built): the gates and the mint
chokepoint are sound and the count of things that exist grew; the count of things that run on their own did
not.

## The eleven 2026-09-05 findings, re-checked

| # | Finding | Today |
|---|---|---|
| 1 | Ledger-consume apply half never fired | still true, unchanged across two audits [CONFIRMED] |
| 2 | attach-found-sources and tier-opinions never dispatched | partly [REFUTED]: both ran in apply 2026-09-05/06 (371 opinion rows; 82 of 176 worklist rows grounded); not dispatched since |
| 3 | Migration 310 unapplied, item_grade absent from RPCs | [REFUTED] on the data side (applied, all 11 RPCs project it); the visible side regressed (badge unmounted) |
| 4 | apply-mint-batch skips rule 16 | still true on the batch path; the mint chokepoint's single-item path runs it [CONFIRMED] |
| 5 | population-turn completion triggers nothing downstream; corpus-turn has no upstream | half [REFUTED]: downstream-chain.yml (2026-09-06) now fires after both turns; it has never fired for real; corpus-turn still has no upstream |
| 6 | DAG authorship reaches 2 of 9 producer families | re-cut: all three families wired in code; market_series authors 0 edges [CONFIRMED] |
| 7 | statutory_computations and estimated_values at 0 rows | still true; the writers no-op without a rows-file that does not exist [CONFIRMED] |
| 8 | Two community promotion mechanisms, one wired | still true as wiring; both tables 0 rows, so "the live path" overstated it [CONFIRMED] |
| 9 | Rooms not region-bound | still true: `region: "GLOBAL"` hardcoded [CONFIRMED] |
| 10 | Closure gate one landing from seven stale entries red | [REFUTED]: resolved before this session; allowlists empty; CI green today |
| 11 | Spec-09 CSV insert would error live | [REFUTED]: migration 311 applied, `org_id` exists |

## What the operator rules on (collected from the stage files' section 4)

Finish, delete, or keep with reason, one line each. The owners' recommendations are in their files.

- S1: sitemap backfill (finish: dispatch to 100% as the plan says, or delete the directive); feed walker
  (one retry, then finish or delete); research walker (never dispatched: finish or delete); fetch-drain
  trigger (finish: a workflow, or keep manual with reason); maintenance.yml harness artifacts (finish).
- S2: migration 299 (apply or retire); ledger-consume apply (enable with a bounded first run, or delete the
  half); downstream-chain proof run (finish); corpus-turn upstream (finish or keep dispatch-only with reason).
- S3: Gate A bulk re-scan invoker (finish); quarantine disposition gate (finish: measure it in CI);
  attach-found-sources (finish the 94 remaining or re-scope); chips and badge on Market (finish); land L39
  (#704).
- S4: market_series edge authorship (finish: traced run, then fix); backfill-derivation-edges re-dispatch;
  statutory writer and rows-file (finish or drop); estimated_values writer (finish or drop); reroute, grid
  queue, OEM roadmap rows-files (finish or drop); carrier_compliance_pools dropped (keep with reason).
- S5: grade badge remount on the list row (finish); layout-guard baseline regenerate (finish); admin tabs
  wired to live tables (finish per tab).
- S6: community promotion A vs B (retire one, zero-cost now); dispatch ledger (resume or retire with reason);
  closure gate wall-clock (finish: make it finish locally again); rooms region binding (finish or keep).
- D1 (design): eight cases not drawn, in the parts inventory section 4, including artboard 21 missing from the
  bundle, a conflict between brief 2.3 and the 2026-09-07 SectionHeading ruling, the brief reversing the
  2026-09-09 CommandBar ruling, and a `/market/series` destination that does not exist.

## Appendix: corpus state at audit time (symptoms, not the work)

Coordinator re-run, SELECT only, 2026-09-18: live items verified 1,440, quarantined 78; item_grade among
verified: record 983, brief 457; item_gate_a_state: 2,088 at `2026-07-30.1`, 602 at `2026-09-04.1`;
portal_link_candidates: rejected 53,718, candidate 3,751, promoted 3; derivation_edges: emission_factors
20, regional_data_facts 4, market_series 0; statutory_computations, estimated_values, post_promotions,
community_promotion_transitions: 0 rows each. Owners' own measurements not re-run by the coordinator carry
their owner's token in the stage files.

## Gate

Rule 14 tokens throughout; `scripts/verify/audit-finding-status.mjs` reports no unlabeled finding in this
folder. Glyphs in the owners' prose were normalized to house style before landing (an em dash to a comma,
an en dash to a hyphen). No product code changed in this audit.
