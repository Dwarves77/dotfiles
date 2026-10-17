# Session Log

Dated, appended entries. Newest first. Per the operating manual (standing rule #6 +
self-annealing protocol), session state lives here — never in `CLAUDE.md` (doctrine, not state).

---

## 2026-10-08, lane DEAD-3 (dead3-docs): dead index lines, runbook pointers, orphan docs, stale terms

Coordinator docs executor, branch coord/dead3-docs-2026-10-08. Full record and the 935-file orphan table: `docs/ops/session-log.d/2026-10-08-dead3-docs.md`.

- 24 dead INDEX lines removed (targets moved to docs/archive); 9 living docs given INDEX lines (a tenth, ADR-045, gained its line from GATE-0 while this lane was open); steps 64 to 66 added to the MAINTENANCE-RUNBOOK index. [CONFIRMED: INDEX link resolver, 0 dead links]
- Runbook references: 4 stale pointers repointed plus a fifth the census missed; 14 tombstones confirmed. 3 orphans archived. Retired-term references rewritten in 7 files; 3 more comment edits owed because the files are harness governing files (F28 pending markers).
- Gate evaluation and dead-code census landed under docs/audits (strict audit-finding-status run: 0 unlabeled).
- NOT done: step 5, glyph:verbatim removal, because GATE-1 is not merged (board item 41). Owed items 41 to 46 are on the PROGRAM-BOARD.


## 2026-10-02, coordinator (COORD-DOCS lane, docs-only, coordinator authority): audit cleanup queue landed PRs 869 to 884; gate-timing finding; R16b fixture correction; new read-before-build rule

**Audit cleanup queue landed (merged per `gh pr list --state merged`, verified 2026-10-02):**
- PR 869 Lane R11 (clock-fragility F66 + CLI subprocess tests), PR 870 Lane R16-19 (docs batch, archive, followup closures, fixtures moved), PR 871 Audit A6b (discipline engine full-read register), PR 872 Audit consolidation final corrections (CF-BROKEN-1 refuted, injection claim refuted, lint claim refuted, A6b folded into new Lane 23), PR 873 Lane R20 (guard 38 CLI `main()` invocations, F67), PR 874 Lane R12-13 (dead route/component deletion, CSS var-concat fix), PR 875 Lane R6-8 (RLS admin-gate lint F64, bracket-path test guard F65), PR 876 Lane R4-5 (migration header truth pass, F63 standing check, catalog refresh, two drops: migrations 340/341), PR 877 Lane W2-R2 (per-tenant planning-assumption register), PR 878 Lane W2-C (absence wording everywhere, Market Intel label). Full numbering and per-lane disposition against the remediation plan's 22(23) lanes recorded in the "Remediation lanes" thread table in `docs/PROGRAM-BOARD.md`, updated in this same pass. Lanes 7, 10 and 21 remain OPEN (no PR in the 863-884 range touches them); Lanes 22 and 23 are ready to push, held for a landing slot (no PR exists for either as of this check); lane W2-R (the Research dissent-panel/signposts/history-ledger surface) is also not yet pushed.

**Gate timing finding `[CONFIRMED]`:** the full local pre-push discipline gate (consistency, memory gate, discipline rules, fitness, invariant-coverage meta-gate, npm-dependent suites, behavioral goldens, closure gate, `tsc`) measured at 30 to 45 minutes per lane across the merged PRs above, duplicating the same suite CI already runs on push. Operator ruling pending on moving the full suite to CI-only and narrowing the local pre-push gate; not decided by this session.

**R16b fixture correction (PR 884, open, not yet merged):** `extract-forward-events.test.mjs` carried four `t.skip()` branches that self-skipped whenever their gitignored `scripts/_snapshots/*.json` evidence was absent (rule 15: a proof that does not execute is not a proof). All three fixture-backed describe blocks were repointed at committed, tracked fixtures: `fixtures/retext32.json` (3 rows, unchanged, already a genuine excerpt); `fixtures/fwdtext3-synthetic-residue.json`, converted to an explicitly-labeled SYNTHETIC fixture (4 hand-authored rows, since the live residue defect class it locks measured 0/1336 in the corpus and a real re-export was impossible); and the placeholder 118-row capture replaced by `fixtures/feslot2-live-124-2026-10-02.json`, a DB executor's read-only export of 124 real rows (corpus growth), with the four locked regression counts hardcoded against it (baseline 61->65, with-context 90->95, rescued 29->30). `node --test` on the file: 129 pass, 0 fail, 0 skipped.

**New rule: read before you build.** `docs/dispatches/lane-common-contract.md` gains a binding "Read before you build" section (operator ruling 2026-10-02, verbatim: "look at all existing code before you build anything"): every build lane reads, before writing anything, its own write set in full, everything that imports or is imported by it (grep, not assumption), the migrations and generated inventories its change moves, and the governing ADRs/docs; the lane report must carry a "read and reused" line naming what it read and reused, or the report is not accepted.

**Files changed this pass:** `docs/INDEX.md` (no change ,  verified no new living doc is owed by the 2026-10-01/02 addenda; `docs/runbooks/layout-guard-baseline-renewal.md` named in the dispatch does not exist yet, so no line was added for it), `docs/dispatches/lane-common-contract.md` (new section), `docs/PROGRAM-BOARD.md` (remediation thread table resync against `gh pr list`, resume pointer updated), `docs/ops/session-log.md` (this entry).

## 2026-10-02, coordinator (COORD-DOCS lane, follow-up resync): R22/R23 merged, Wave-2 lanes all landed, W2-R pushed CI-red

Rebased `coord/docs-2026-10-02` onto `origin/master` on coordinator instruction. Per coordinator-supplied
PR numbers and a fresh `gh pr list --state merged --limit 40`:

- **Lane 22** merged as PR 885 ("R22: Actions artifact storage budget, docs-only push fast path, DB-shape
  the brief-export queue and dispatch ledger"); landed scope is broader than decision 8's 7-day/13-workflow
  description, flagged for re-read at next audit rather than re-stated here from the PR title alone.
- **Lane 23** merged as PR 886 ("Lane R23: route commit-validation ranges through resolveRange's
  merge-base"). Verified `docs/runbooks/layout-guard-baseline-renewal.md` exists on master before adding
  its `docs/INDEX.md` line (runbooks section, alphabetical before `live-source-anti-fabrication-audit`).
- **All 8 Wave-2 lanes now merged**: W2-B PR 879, W2-C PR 878, W2-D PR 882, W2-E PR 883, W2-F PR 880, W2-G
  PR 863 (W2-A/H were already merged 2026-09-29). Wave-2 sub-table in `docs/PROGRAM-BOARD.md` updated row
  by row against the merged PR titles/bodies.
- **W2-R** (not W2-R2, which is PR 877's per-tenant assumption register, already merged) is pushed as PR
  887; coordinator reports CI red on the rendering guard, fix pending. Row added/kept as "pushed, PR 887,
  CI red", explicitly not marked DONE and no INDEX line added for its doc(s) ,  held for the coordinator's
  separate merge message per instruction.
- PROGRAM-BOARD resume pointer updated: Lanes 7, 10, 21 still OPEN; everything else in the remediation
  queue and both in-flight Wave batches are now on master.

Files changed this pass: `docs/INDEX.md` (new runbooks line for `layout-guard-baseline-renewal`),
`docs/PROGRAM-BOARD.md` (Lane 22/23 rows, Wave-2 sub-table, W2-R row, resume pointer).

## 2026-10-02, coordinator (COORD-DOCS lane, follow-up resync): W2-R merged PR 887, Research briefs PR 888, correction to W2-R's own prior board entry

Rebased `coord/docs-2026-10-02` onto `origin/master` on coordinator instruction (W2-R merged as PR 887).

**New INDEX lines** (both verified present on master before adding): `docs/decisions/ADR-038-research-
built-now.md` (decisions section) and `docs/dispatches/lane-briefs/2026-10-02/README.md` (dispatches
section). PR 887's other changed files (session-log.d addendum, migrations.md, spec-03, harness-run
artifacts, workflow yml) are either not living docs by convention or are edits to already-indexed docs,
so carried no further INDEX line.

**Correction, in place (rule 14):** this lane's own 2026-10-01 resync (the "R23 and W2-R merged" pass)
had mis-described the W2-R row as "Research surface dissent panel / signposts list / assessment history
ledger" ,  that description is complete-build-plan's L5, a distinct and still-unbuilt lane with no short
name assigned. Reading PR 887 directly (title: "Lane W2-R: Research assessment data machine (ADR-038)")
shows W2-R is in fact the `research_assessments` schema + deterministic TRL/CRI/R1-R4 producer + Research
surface rail card (complete-build-plan L1/L2). Corrected in `docs/PROGRAM-BOARD.md`'s W2-R row rather than
silently replaced, per rule 13's corollary (a flag/finding that dissolves under evidence gets a
same-session correction, never a quiet drop).

**New row:** Lane BRIEFS-RESEARCH (PR 888, merged) ,  the L3/L5-L9 dispatch briefs under `docs/dispatches/
lane-briefs/2026-10-02/`, gated on PR 887 merging first (satisfied).

**Lane 7 + two unnamed lint lanes** marked IN PROGRESS per coordinator report; no PR or branch exists yet
to verify independently via `gh pr list`, recorded as coordinator-reported, not `[CONFIRMED]`.

Resume pointer updated accordingly. Files changed this pass: `docs/INDEX.md` (2 new lines), `docs/
PROGRAM-BOARD.md` (W2-R row corrected, BRIEFS-RESEARCH row added, Lane 7 + two lint lanes marked IN
PROGRESS, resume pointer).

## 2026-10-03, coordinator (COORD-DOCS lane, second pass): the Research build day (L3/L5-L9, RA-WF, LINT-A/C, R7, MODEL-IDS)

Fresh worktree/branch (`coord-docs-1003` / `coord/docs-2026-10-03`) from `origin/master`, per coordinator
instruction; the prior `coord-docs-1002` worktree was removed (clean, already merged as PR 889).

**The Research build day.** The six lane briefs under `docs/dispatches/lane-briefs/2026-10-02/` (L3, L5,
L6, L7, L8, L9), gated on PR 887 (W2-R, ADR-038) merging first, dispatched together with RA-WF (research-
assessment workflow hardening) and two lint lanes (LINT-A, LINT-C). Merged today: L3 (PR 891), L6 (PR
890, migration 346 **[CONFIRMED] applied live** via `mcp__supabase__list_migrations`), L8 (PR 896), L9
(PR 894), RA-WF (PR 895), LINT-A (PR 893), LINT-C (PR 892). Pushed but not yet merged, read from their
local branches (not yet on master): L5 (`lane/l5-research-detail-panels-2026-10-02`) and L7
(`lane/l7-research-walker`). In progress, not yet pushed: R7-LINT-CI (remediation Lane 7's own branch,
`lane/r7-lint-ci`) and MODEL-IDS (`lane/model-ids`). Full detail in the new "Research build lanes"
section of `docs/PROGRAM-BOARD.md`, including the independently-reverified first live dry dispatch of
the research-assessment workflow (run `37091503805`: 10 candidates, 4 assessed, 6 refused, 0 written;
the apply run is held pending the operator's data-hold release, by design, not a defect).

**The node_modules wipe incident and fix.** Mid-day, the shared `fsi-app/node_modules` install went
missing from both the main checkout and the lane worktrees' link targets. Root cause per the
coordinator's own diagnosis (recorded in L5's and RA-WF's session-log.d addenda): a detached worktree's
shared-install junction was force-removed. Fix: `npm ci` in the main checkout (952 packages), then
`sh .discipline/hooks/lib/worktree-node-modules.sh --link` re-run per affected worktree. Every lane whose
addendum was read this pass re-ran its gates after the restoration and reported clean results; no lane's
own code is implicated.

**Model-id centralisation.** `src/lib/llm/model-ids.mjs` did not exist before today. L8 created it
(single-constant `HAIKU_MODEL`) as a small, coordinator-directed write-set expansion while wiring
`backfill-themes.mjs`'s Haiku call, after finding the constant independently declared in four separate
files (`haiku-classify.ts`, `first-fetch-classify.ts`, `verification.ts`,
`spot-check/recurring/route.ts`) plus roughly nine further inline literal call sites. The separate
MODEL-IDS lane (in progress) extends that one home with `SONNET_MODEL` and converts the remaining lib,
admin-route, and review-card call sites.

**The L7 duplicate-lane episode.** Coordinator-reported: lane L7 was briefly dispatched twice in this
build day before being caught. This entry is coordinator-reported, not independently re-verifiable from
repo state (only one `lane/l7-research-walker` branch exists as of this check) ,  recorded per rule 14 as
coordinator-sourced, pending any further detail the coordinator wants added.

**New standing rule (coordinator-directed, this build day): a lane in a long gate run must answer a
status request within one round.** When the coordinator asks a lane for status while its own gates
(the full discipline suite, the rendering guard, a background `npm ci`) are still running, the lane
replies within its next turn with what it knows so far (which gate is running, elapsed/expected time,
partial results if any) rather than going silent until the whole run completes. This rule is recorded
here per the coordinator's instruction; it is not yet encoded into `docs/dispatches/lane-common-
contract.md` itself ,  that file is coordinator-only and a candidate location for it, flagged here as a
follow-up rather than added unasked this pass.

**INDEX.md: no new lines this pass.** Checked every 2026-10-02 addendum read above (L3, L5, L6, L7, L8,
L9, RA-WF, LINT-A, LINT-C) for a new living doc; every `docs/decisions/`, `docs/runbooks/` or
`docs/inventories/` reference found is to an already-indexed doc (ADR-038, ADR-039, `migrations.md`).
The research-walker harness family (`scripts/harness-runs/research-walker/`) is a scripts artifact, not
a doc, per the coordinator's own instruction this round ,  no INDEX line for it.

Files changed this pass: `docs/PROGRAM-BOARD.md` (new "Research build lanes" section; Lane 7/lint rows
corrected to name LINT-A/LINT-C/R7-LINT-CI; resume pointer updated), `docs/ops/session-log.md` (this
entry). `docs/INDEX.md` not touched (nothing owed).

## 2026-10-03, coordinator (COORD-DOCS lane, third pass): status-request rule codified in the lane contract

Per the coordinator's follow-up confirmation, the status-within-one-round rule flagged above is now
binding, not just logged: `docs/dispatches/lane-common-contract.md`'s "Where you work" section gains
"A lane answers a coordinator status request within one tool round, even mid-gate; a lane that cannot
be reached for three requests is replaced (added 2026-10-03, binding)." Files changed this pass:
`docs/dispatches/lane-common-contract.md` (one new bullet), `docs/ops/session-log.md` (this entry).

## 2026-10-03, coordinator (COORD-DOCS lane, fourth pass): Research build day closes out, R7-LINT-CI the only lane left

Final merged PR numbers per coordinator report, verified via `gh pr list --state merged --limit 10`: L5
897, L7 898, MODEL-IDS 899 (L3 891, L6 890, L8 896, L9 894, RA-WF 895, LINT-A 893, LINT-C 892 already
recorded). `docs/PROGRAM-BOARD.md`'s "Research build lanes" section and resume pointer updated: all six
dispatched Research lanes plus RA-WF, LINT-A, LINT-C and MODEL-IDS are now DONE. Only R7-LINT-CI
(remediation Lane 7) remains, coordinator-reported "released, pushing" with its PR number to follow in
the next pass. Files changed this pass: `docs/PROGRAM-BOARD.md` (L5/L7/MODEL-IDS/R7 rows, resume
pointer), `docs/ops/session-log.md` (this entry).

## 2026-10-03, coordinator (COORD-DOCS lane, fifth pass): audit remediation closed

Final lane states: R7-LINT-CI merged PR 909 (lint 614 → 0 across fsi-app/, ESLint gate in CI + pre-push, F51 allowlist for 2 coordinator-approved files). Lane 21 merged PR 908 (5 `.or()` sites + 6th in lib/supabase-server.ts fixed; operations/research slug pages gain provenance_status='verified'). Lane 10 confirmed DONE (already required; `gh api .../branches/master/protection/required_status_checks` lists "Consistency layer" as required; last 10 master runs green). Lane 13 migration 343 [CONFIRMED] applied live 2026-10-03 (list_migrations shows 343-346; to_regclass('public.user_list_order') is null). Pre-push hook does not run `next build`, so a prerender defect (useSyncExternalStore without getServerSnapshot) passed local gates and failed CI; added to tech-debt log. Files changed this pass: `docs/PROGRAM-BOARD.md`, `fsi-app/supabase/migrations/343_drop_user_list_order.sql`, `docs/ops/session-log.md`, `docs/tech-debt-log.md`.

## 2026-10-05/06, coordinator: Stage 4 learning loop built; source chain; live check and gates

**Accomplished.** Merged PRs 943 to 952, all fixture-proven and dry, nothing applied to live data: 943 questions on change and ADR-044; 944 customer tier rule, T7, per-claim tier, bias chips; 946 question answers and first inference, holdings-need targets, research walker consumer; 947 grade chip, inferences on detail pages, theme chip labels, OperationsItemsView deleted; 948 source-resolution workflow and loop hops 12 and 13, first dry run green; 950 signposts, prediction scoring, reliability ledger, outcome-driven tier movement; 951 five live defects fixed at their cause; 952 repeated-signup message. Plan stages S1-E and Stage 4 marked built in the buildout plan; INDEX and the maintenance runbook index gained ADR-044 and steps 60 and 61 (coordinator docs lane coord-docs-2026-10-06).

**Decisions.**
- ADR-044: the learning loop runs with no operator gate and no priced request; supersedes ADR-036 decisions 1 and 3, decision 2 stands.
- L4-B and L4-D were re-cut rather than merged as first built, to satisfy F51 check 5 (concurrent edits to shared files).
- `trust-recompute.yml` retirement: Option 1 ruled 2026-10-05 (a `recompute-trust-scores` maintenance step, a pause read in `recompute-tiers`, then delete the workflow and its closure-gate entry); execution by a later lane, not yet done.
- A tier parsed from a brief's own wording never renders as a chip (rule 18): the chip slot shows the Absence part.
- Signposts get no generic trigger.
- Live checks become gates (operator, 2026-10-05): lane GATES-2 builds the Live smoke workflow.
- Smoke user ruling 2026-10-06: the account is a workspace owner and never a platform admin.

**Blockers.** `LIVE_SMOKE_EMAIL` and `LIVE_SMOKE_PASSWORD` pending from the operator. Migrations 351, 352, 353 await the operator's word (schema DDL applies before the dependent code runs live, standing rule 3). GATES-2 not merged at this entry.

**Next steps.** Stage 5 growth, Stage 6 remaining gates, Stage 7 admin correction layer, Stage 8 workspace and pages. Layout baseline renewal fires 2026-10-08 (hard expiry 2026-10-15). Owed items are listed in the PROGRAM-BOARD 2026-10-06 resume pointer.

## 2026-10-06/07, coordinator: Stages 5 to 7 built, chain dry fire, smoke account repaired

**Accomplished.** Merged PRs 954 to 965, fixture-proven and dry: 954 GATES-2 live smoke gate; 955 G7-TIER tier override respected by every automatic writer; 956 G6-GATES queues decide by rule, acceptance tokens off (steps 13 and 14 retired); 957 G7-CORR item data corrections; 958 G6-DRAIN judgement drain planner and kill switch (off); 959 G5-TERMS; 960 AUTH-2 profile heal and no-membership onboarding; 961 P4 first Live smoke findings; 962 G7-UI Corrections panel; 963 C-TOGGLE (ADR-041); 964 G5-NEED; 965 G5-READ. Migrations 354 to 357 applied live; 357 removed `intelligence_items_theme_check`. Chain dry fire on 2026-10-07: 56 chain runs, all mode=dry, 13 of 13 hops fire at run level. The Gmail smoke account was repaired as a Dietl / Rockit member.

**Findings (chain dry fire, verified by run logs).** Population turn and Downstream chain are NO-OP on a chained firing. Brief apply, Theme briefs apply and Question answers apply dispatches skip their driver steps (gate on `PUSH_BATCH_COUNT`, set only on a push). All 386 committed ledger verdicts are stale against the live prompt_version. The exporter maps 6 of 13 hops. Maintenance step=all and Uptime probes ran red.

**Docs this pass.** `db-check-constraints.json` regenerated from the live catalog (read-only); INDEX lines for steps 62 and 63 and the judgement-drain and live-smoke FAMILY.md; MAINTENANCE-RUNBOOK index entries for steps 62 and 63, steps 13 and 14 marked RETIRED; PROGRAM-BOARD 2026-10-07 resume pointer with the register's section 6 owed list copied in; buildout plan Stages 5, 6, 7 marked BUILT and open items added.

**Open.** Lanes CHAIN-1 and OPS-1; G5-SEARCH; verdict re-authoring; Stage 8; layout baseline renewal fires 2026-10-08, hard expiry 2026-10-15.

## 2026-10-08, coordinator: gate repair, privilege closure, the proof stack, and the next wave

Lists only. Written by the DOCS-3 docs pass at origin/master 430d7fce from: `gh pr list --state merged --search "merged:2026-10-08"` (UTC dates), `fsi-app/docs/inventories/applied-migrations.json` (synced 2026-10-08T13:24:44Z), and the Actions jobs API for run 37767977662. Nothing is typed from memory; the operator-only items and the five misses are the coordinator's own statements, carried as given.

**PRs merged 2026-10-08 (49).** Format: PR, lane (branch name), merge commit, title.
- #974 proof2-subset 6f25ffd4 PROOF-2: read-only FK-closed production subset export and local loader
- #975 proof1-stack-and-replay 3d4e7357 PROOF-1: chain-proof workflow, migration replay from zero, loopback-only database access
- #977 rules1-gate-precision bd8d92ed RULES-1: rule 015 detects database writes, F51 check 5 exempts generated files
- #978 baseline-renewal-2026-10-08 35fe1682 Pause layout-guard expiry and 7-day renewal rule until go-live (BUILD_MODE)
- #979 s8c-count-membership ffe44d05 S8-C: membership gate on the two count RPCs (migration 361, not applied)
- #980 trustret 4626cc40 TRUST-RET: retire trust-recompute.yml, keep the trust-score pass as recompute-trust-scores
- #981 s8b-tag-attribution 06d82d74 S8-B: workspace tag attribution (applied by <name> on <date>)
- #982 token1-capture-worker-grants ace778cc TOKEN-1: limit capture_worker_fetch EXECUTE to service_role (migration 363)
- #983 s8f-industry-statements 89226500 S8-F: fact register for industry-level statements (Phase 1)
- #984 g5-search 7438c593 G5-SEARCH: a source need becomes a committed URL batch a session authors, applied by rule
- #986 s8e0-producer-registry 3a637281 S8-E0: producers register from an entry directory
- #987 proof3-chain-steps 93498aa7 PROOF-3: chain steps run in apply mode on the proof stack, with a read-back after every step
- #988 s8a-notes-assignment c1f0db1c S8-A: private workspace notes and assignment with notification on every detail page
- #989 s8f2-statements-build 5d61fa01 S8-F2: industry-level statements under the Operations matrix (ADR-043)
- #990 s8d-portfolio bdc6b7a9 S8-D: the portfolio object under the dashboard (migration 362, NOT APPLIED)
- #991 sec1-profiles-escalation 1d2c5e95 SEC-1: a user cannot change their own platform-admin flag (migration 364)
- #992 proof4-attacks-r2 ee0dd483 PROOF-4: chain-proof attack suite (re-cut after PR 975, supersedes 985)
- #993 sec2-profile-status-columns a236dac3 SEC-2: profile status and tier columns are system-written; verification is requested through an RPC (migration 367)
- #994 gate0-doctrine-2026-10-08 f706ee09 GATE-0: ADR-046, the gate doctrine and the disposition of every gate
- #995 dead2-schema 987a8cb8 DEAD-2: migration 368 per operator ruling 2026-10-08 (NOT APPLIED)
- #996 dead3-docs-2026-10-08 827588fe DEAD-3: dead index lines, runbook pointers, orphan classification, retired-term rewrites
- #997 gate1-rules 7939565c GATE-1: commit rules engine, remove 014/016/020, introduced-lines scope, one diff per run
- #998 gate2-hooks f7bbb79e GATE-2: pre-push step 2c removed, C4 outside-repo note, skill gate rebuilt, UX substring check dropped
- #999 audit-catalogue-2026-10-08 49f98ab7 AUDIT-CAT: audit catalogue, ten lenses, eighteen subsystems, audit-of-audits matrix
- #1000 gate2-hooks-2 82141ad7 GATE-2b: skill gate interpreter arguments, MCP write prefixes, wired check accepts the in-process shim
- #1001 sec3a-functions-views dfb215db SEC-3a: functions, views and grants that let anon or a user write what only the system may write (migration 369, NOT APPLIED)
- #1002 gate3-fitness 57bb5d8f GATE-3: fitness functions and governance gates, remove, repair, replace
- #1003 sec3b-table-policies 5c57faa2 SEC-3b: table policies and triggers that stop a user changing their own standing (migration 370, NOT APPLIED)
- #1004 gate4-ci 53605cae GATE-4: slim push job set, required rendering guard, concurrent unit tests, gate firing artifacts
- #1005 sec4-definer-hygiene 6b1063aa SEC-4: definer hygiene, explicit grants and pinned search_path for every SECURITY DEFINER function (migration 371, NOT APPLIED)
- #1006 sec5-profiles-read 28aef825 SEC-5: who may read which profile columns, built to R8.7 (migration 372, NOT APPLIED)
- #1007 dead1-whole-file cd88250a DEAD-1: delete whole-file dead modules, routes, seed scripts and inert stores
- #1008 proof5-oracle-superuser 6bc09d57 PROOF-5: create the oracle database as the stack's superuser
- #1009 gate5-baseline-and-race 3141ab80 GATE-5: rules engine baseline is the merge base; C3 test isolated from F64
- #1010 proof5b-oracle-statements a35ced3c PROOF-5b: run each oracle database statement as its own psql -c transaction
- #1011 sec3b-recursion 6028b228 SEC-3b: migration 370 amended in place, org_memberships admin policies no longer recurse (42P17)
- #1012 routes1-guard-fixes e23feb02 ROUTES-1: route-guard register fixes (F2 comment-proof, reset-password public, moderation reviewer gate, worker limiter)
- #1013 mighist1-recover 8be0cc9c MIG-HIST-1b: land the migration map (361-row ledger, replay-reader shape)
- #1015 smoke2-content-invariants 1496ed76 SMOKE-2: live smoke asserts content, not only status
- #1016 sec6-admin-flag 197190d2 SEC-6: profiles.is_platform_admin is private, read through is_platform_admin() (migration 375, NOT APPLIED)
- #1018 mkt1-market-components 204d919f MKT-1: Market renders what it already computes (ribbon values and states, shared freshness and provenance parts)
- #1020 cov1-coverage-surface ffbfe670 COV-1: coverage is a first-class, generated, customer-facing surface
- #1021 gate6-guard-container 12c69634 GATE-6: run the Playwright jobs in the pinned official container
- #1022 sec3b-fixtures 36599967 SEC-3b-F: 370 fixture item_type fixed, fixture INSERTs checked statically (shared helper)
- #1023 chain4-downstream-edges 95711970 CHAIN-4: Question answers and Theme briefs chained (hops 14 to 16)
- #1024 audwire1-orphan-audit 98acb516 AUDWIRE-1: ui-orphan audit is hard and enumerates the B-3 register
- #1026 l4e-outbox-entity 430d7fce L4-E: market_series and regional_data_facts outbox rows reach items (migration 373, NOT APPLIED)
- #1027 mig-headers-1 b53b85cc Migration 372 applied: header flip, ledger export, map and inventories regenerated
- #1028 verd1-stale-verdicts 3cb67204 VERD-1: stale ledger verdicts are re-authored through the drain

**PRs open at the cut (7).**
- #1014 mig374-owed-schema: MIG-374: GIN index on cited_item_ids and signposts.lifecycle_applied_at (migration 374, NOT APPLIED)
- #1017 alias1-entity-hierarchy: ALIAS-1: entity hierarchy and alias table (migration 377, NOT APPLIED), resolver, spine coherence test
- #1019 migci-apply-on-stack: MIG-CI: prove each pending migration on a local stack before production sees it
- #1025 obl2-obligation-objects: OBL-2: obligation objects (migration 376, NOT APPLIED), obligation-grain gate, binding banner, classifier
- #1029 s8e5-aux-energy: S8-E5: NESO grid carbon intensity as a regional fact (grid_intensity dimension, migration 378 NOT APPLIED)
- #1030 s8e1-oem-roadmap: S8-E1: registered producer for oem_tech_roadmaps from the EEA HDV CO2 extract (migration 380, NOT APPLIED)
- #1031 s8e6-grid-queue: S8-E6: UK Power Networks capacity heatmap producer for grid_connection_queues (migration 379, NOT APPLIED)

**Migrations applied 2026-10-08 (13 ledger rows; versions are UTC timestamps).** Source: the committed ledger inventory, synced at 13:24:44Z; an apply after that sync is not listed.
- 363_capture_worker_fetch_grants, lane TOKEN-1, PR 982, ledger version 20261008005235
- 361_count_rpc_membership, lane S8-C, PR 979, ledger version 20261008010426
- 362_portfolios, lane S8-D, PR 990, ledger version 20261008022411
- 364_profiles_privilege_columns, lane SEC-1, PR 991, ledger version 20261008030947
- 367_profiles_status_columns, lane SEC-2, PR 993, ledger version 20261008033159
- 358_workspace_item_notes, lane S8-A, PR 988, ledger version 20261008034412
- 359_item_assignments, lane S8-A, PR 988, ledger version 20261008034443
- 368_drop_dead_schema, lane DEAD-2, PR 995, ledger version 20261008041012
- 369_privilege_functions_views, lane SEC-3a, PR 1001, ledger version 20261008072538
- 372_profiles_read, lane SEC-5, PR 1006, ledger version 20261008092141
- 375_admin_flag_private, lane SEC-6, PR 1016, ledger version 20261008131209
- 370_privilege_table_policies, lane SEC-3b, PR 1003, ledger version 20261008131555
- 371_definer_hygiene, lane SEC-4, PR 1005, ledger version 20261008131647
- On master at the cut with no ledger row: 299 (held by design, header LEFT UNAPPLIED) and 373 (PR 1026, NOT APPLIED). In open PRs, NOT APPLIED: 374 (1014), 376 (1025), 377 (1017), 378 (1029), 379 (1031), 380 (1030).

**Misses the coordinator recorded as its own (5).**
- MIG-HIST-1 was reported landed while its files were staged on a lane worktree; PR 1013 (MIG-HIST-1b) landed it. Evidence: `docs/ops/session-log.d/2026-10-07-mighist1-recover.md`, MIG-HIST-1b section.
- Spec 05 was cited over R8.7. Related, read in this pass: PR 1006 (SEC-5, migration 372) is titled as built to R8.7.
- The TRUNCATE, TRIGGER and REFERENCES table privileges were not briefed to the privilege lanes. The census reads them as a grant hygiene item, not scored (`docs/audits/privilege-census-2026-10-08.md`, section 0).
- Common terms rule 10 named the harness pending-marker convention after GATE-3 (PR 1002) retired it; the rule now says the convention is retired.
- The CHAIN-4 and GATE-6 briefs carried premises that were not checked against master. CHAIN-4: its session log records three stale premises as the coordinator's. GATE-6: recorded by the coordinator; this pass did not re-derive the premise.

**GATE-6 guard timings (rendering-guard job of PR 1021's checks, run 37767977662, job 113280185805; measured from the jobs API step timestamps).**
- Container pull (Initialize containers): 25 s
- Checkout: 6 s
- Playwright npm package: 22 s
- Guard run: 406 s
- Job total: 7m45s, against the 15 minute limit

**Operator-only items.**
- IMF PortWatch: commercial reuse needs IMF permission (`docs/audits/prodsrc-public-datasets-2026-10-08.md`, domain 1.7).
- Paid data alternatives: named per domain in the PROD-SRC register; price and terms not disclosed by the vendors it read.
- DESIGN CHANGES OWED (rule 20), for Claude Design: artboard 04 `p4` headline series card (sparkline, 1m, YoY, freshness state, freshness strip, methodology drawer); artboard 04 policy timeline scope line and its two controls; artboard 05 `/market/[slug]` methodology and provenance drawers and freshness badge (all in `docs/ops/session-log.d/2026-10-08-mkt1-market-components.md`); the Coverage page and the six coverage-state treatments, which have no artboard (`docs/ops/session-log.d/2026-10-08-cov1-coverage-surface.md`).

**Docs landed by DOCS-3 (branch coord/docs3-pass).** `docs/audits/`: privilege-census-2026-10-08, aud-at2-route-guard-register-2026-10-08, obl1-obligations-register-2026-10-08, verify1-register-unknowns-2026-10-08, prodsrc-public-datasets-2026-10-08, migration-history-2026-10-07. `docs/runbooks/audit-catalogue.md` (matrix, index, owed list, incident ledger I-5 to I-7), `docs/runbooks/maintenance.d/64-chain-proof.md`, `docs/decisions/ADR-045` (addendum), `docs/PROGRAM-BOARD.md`, `docs/INDEX.md`. Detail: `docs/ops/session-log.d/2026-10-08-docs3-pass.md`.

## 2026-10-08 (later), coordinator: the DOCS-4 docs pass

Lists only. Written by the DOCS-4 docs pass (lane docs4-pass, branch lane/docs4-pass, PR 1044) at origin/master ef87c5e6 from `gh pr list --state merged --search "merged:>=2026-10-08" --limit 100`, `gh pr list --state open`, and `git log`. Nothing is typed from memory.

**Merged after the DOCS-3 landing (df792300, 2026-10-08T16:06:57Z), 8 PRs.**
- PR 1032, DEAD-1b, merged 2026-10-08T16:07:51Z, 492dfdb4
- PR 1039, GATE-8, merged 2026-10-08T21:11:37Z, 62268ab9
- PR 1040, GATE-7, merged 2026-10-08T22:26:52Z, 0a026a85
- PR 1035, MIGTEST-1, merged 2026-10-08T22:37:12Z, 4ee8bbee
- PR 1014, MIG-374, merged 2026-10-08T22:50:10Z, 76ef361c (migration 374, NOT APPLIED per its title)
- PR 1043, RULE-MERGE-1, merged 2026-10-08T23:02:25Z, d97f24e3
- PR 1041, ledger export, merged 2026-10-08T23:03:14Z, 1397fe51
- PR 1046, migration 374 applied, merged 2026-10-08T23:14:45Z, ef87c5e6

**Merged after the DOCS-3 cut (430d7fce) and before its landing, with no board row until this pass, 5 PRs.**
- PR 1017, ALIAS-1, 2026-10-08T14:41:11Z, 48dfb0c3 (listed OPEN in the DOCS-3 board table)
- PR 1038, migrations 373 and 377 applied, 2026-10-08T16:04:05Z, c7d580f4
- PR 1034, DAUDIT-1, 2026-10-08T16:05:13Z, 86665c84
- PR 1036, TESTFIX-1, 2026-10-08T16:06:02Z, af038241
- PR 1033, DOCS-3, 2026-10-08T16:06:57Z, df792300

**Open at the cut (9).**
- PR 1019 MIG-CI, 1025 OBL-2, 1029 S8-E5, 1030 S8-E1, 1031 S8-E6, 1037 SEC-7, 1042 GATE-9, 1044 DOCS-4, 1045 WIRE-1

**Docs landed by DOCS-4 (PR 1044).**
- `docs/audits/`: aud-at1-rls-grants-attacked-2026-10-08 (fixing lane SEC-7, PR 1037, open), aud-at3-gates-attacked-2026-10-08 (GATE-7, PR 1040, merged), aud-at4-gates-attacked-2026-10-08 (GATE-8, PR 1039, merged), aud-at5-gates-attacked-2026-10-08 (GATE-9, PR 1042, open). `scripts/verify/audit-finding-status.mjs` reported 9 unlabeled finding lines across the four (AT1 1, AT3 5, AT4 2, AT5 1) and 0 after each received the token its own section carries; 4 table rows in AT5 carry the `glyph:verbatim` marker.
- `docs/runbooks/audit-catalogue.md`: ATTACKED cells for rows 1, 2, 4 and 5 entered full and rows 7, 8 and 11 entered partial (`~`), per each register's own declaration; counts by the command printed in the catalogue 89/34/44/13 to 93/36/38/13 (filled, partial only, empty, not applicable); ATTACKED 0/4/12/2 to 4/6/6/2; O-005 to O-010 retired, P-032 replaced by P-035, owed-leg entries P-035 to P-041; incident ledger rows I-8 to I-11; section 3c DOCS-3 statements marked superseded with their wording kept.
- `docs/dispatches/lane-common-contract.md`: the migration rule of the 2026-10-04 lane common terms (SQL file only, NOT APPLIED; no regeneration of migrations.md or touch of APPLIED-MAP.json; fixture INSERTs checked by `_lib/fixture-inserts.mjs`; migration-proof job) in the wiring preflight list.
- `docs/PROGRAM-BOARD.md` (later 2026-10-08 pointer and thread rows), `docs/INDEX.md` (four audit lines). Detail: `docs/ops/session-log.d/2026-10-08-docs4-pass.md`.


## 2026-10-09/10, coordinator: the fix wave, chain proof fires 5 to 9, batch 2

Lists only. Written by lane DOCS-5b (branch coord/docs5b-coordinator-files) from the DOCS-5 staging log (`docs/ops/session-log.d/2026-10-10-docs5.md`, PR 1099) and `git log --reverse ef87c5e6..origin/master` at 855ee072d.

**Merged since the DOCS-4 landing, 55 PRs (gh merge commits on master).**
- PR 1029, S8-E5, 2026-10-09, 0289daeea
- PR 1037, SEC-7, 2026-10-09, 70c76c879
- PR 1047, Migrations 378 and 381 applied, 2026-10-09, bbb4a5d24
- PR 1025, OBL-2, 2026-10-09, 6b5e0f946
- PR 1042, GATE-9, 2026-10-09, 3e0637161
- PR 1045, WIRE-1, 2026-10-09, 023d47588
- PR 1044, DOCS-4, 2026-10-09, d71e8fad0
- PR 1048, RULE-RANGE-1, 2026-10-09, 8aa9a2022
- PR 1051, LOOPID-1, 2026-10-09, 88409b476
- PR 1050, Migration 376 applied, 2026-10-09, f354b943e
- PR 1053, QOC-1, 2026-10-09, 54dfef5cf
- PR 1052, SKILL-SLIM-1, 2026-10-09, 9374baa8d
- PR 1049, DAUDIT-2, 2026-10-09, 910f35a75
- PR 1030, S8-E1, 2026-10-09, 452c1fb85
- PR 1031, S8-E6, 2026-10-09, 9044d95a9
- PR 1055, FLAG-1, 2026-10-09, e959a317e
- PR 1019, MIG-CI, 2026-10-09, 65b18aafc
- PR 1058, Migrations 379 and 380 applied, 2026-10-09, 77eade280
- PR 1060, DISPO-2, 2026-10-09, e207047a1
- PR 1057, DAUDIT-3, 2026-10-09, 1ab1eb59a
- PR 1061, DISPO-3, 2026-10-09, c0054856d
- PR 1062, Disposition tokens for the two open DAUD, 2026-10-09, 33dc1541c
- PR 1056, DORMANT-1, 2026-10-09, b98a7632e
- PR 1063, Ledger export, 2026-10-09, a4185acf5
- PR 1064, CI-FIX-1, 2026-10-09, 33682011a
- PR 1066, ENGINE-FIX-1, 2026-10-09, 182435a5c
- PR 1067, GATE-FIX-1, 2026-10-09, 503cb8a53
- PR 1065, PROOF-6, 2026-10-09, 4fe43d5c4
- PR 1059, DFIX-1, 2026-10-09, d64ca4110
- PR 1068, Disposition tokens, 2026-10-09, d91dd582d
- PR 1069, Ledger export, 2026-10-09, 9c303db91
- PR 1072, CHAIN-5, 2026-10-09, eecaa0e9c
- PR 1074, Tokens, 2026-10-09, cce24a3e6
- PR 1071, SEC-8, 2026-10-09, b0fbaef2a
- PR 1073, DFIX-2, 2026-10-09, adf6512dd
- PR 1070, PROOF-7, 2026-10-09, 106dad83a
- PR 1075, Migration 382 applied, 2026-10-10, c92463225
- PR 1076, STACK-1, 2026-10-10, 22c411142
- PR 1077, Ledger export, 2026-10-10, d50531aa3
- PR 1080, Tokens, 2026-10-10, 08aa6f17b
- PR 1081, PROOF-8, 2026-10-10, 0a3c61fc2
- PR 1079, SMOKE-3, 2026-10-10, 9fbe389d4
- PR 1083, Tokens, 2026-10-10, 6c00df17d
- PR 1082, HYDRA-1, 2026-10-10, a47682d16
- PR 1084, PROOF-9, 2026-10-10, be13dcbc8
- PR 1085, MIG-HIST-2, 2026-10-10, f448d14e9
- PR 1086, RULES-X-2, 2026-10-10, 97e543786
- PR 1087, DEAD-1c, 2026-10-10, ab1fc777f
- PR 1088, TESTS-1, 2026-10-10, 4236e2d56
- PR 1089, DORMANT-2, 2026-10-10, 465a6f566
- PR 1090, Migration 383 applied, 2026-10-10, 76bec7b28
- PR 1091, Tokens for the tests1 and DEAD-1c rows; , 2026-10-11, 855ee072d

**Batch 2 lanes merged.**
- PROOF-7 (1070), CHAIN-5 (1072), SEC-8 (1071), DFIX-2 (1073), PROOF-8 (1081), MIG-HIST-2 (1085), PROOF-9 (1084), RULES-X-2 (1086), DEAD-1c (1087), TESTS-1 (1088), DORMANT-2 (1089)

**Batch 2 lanes with no merge commit on master at 855ee072d.**
- PLAN-2 (fact lane, no PR by design), DAUDIT-4 (PR 1092), SEC-9 (PR 1098), GATE-FIX-2 (PR 1096), EXEMPT-1, DEAD-1d (PR 1093), CIFIX-2 (PR 1097), TESTS-2, SMOKE-4 (PR 1094), DOCS-5 (PR 1099); also open: HARNESS-1 (PR 1095), MASTER-RED-1 (PR 1078), DRIFT-1 (PR 1100)

**Chain proof fires 5 to 9.**
- Detail: `docs/runbooks/maintenance.d/64-chain-proof.md` "State at 2026-10-10" (fire 5 37876624407, fire 7 38020216226, fire 8 38032421565, fire 9 38058989236).

**The two standing reds of the window.**
- Production Live smoke: red on the `content-inferences-section` check at `/regulations/g14` on every production deployment from SMOKE-2's commit 1496ed760 (PR 1015, 2026-10-08, content invariants added) until SMOKE-3 (PR 1079, 2026-10-10) made the content invariants conditional on the item class the chooser finds (`docs/ops/session-log.d/2026-10-10-smoke3-conditional-invariants.md`; last pass 95711970a at 2026-10-08T13:42).
- Chain proof: red at the schema oracle gate in fires 6 to 9 (fire 6 and 7 on the roles and the `RESET ALL;` session line, fixed by PROOF-7 and PROOF-8; fire 8 the oracle gate could not run; fire 9 replay 347 of 347 with 562 differing objects in `replay-schema-diff.json` of run 38058989236, classified by DRIFT-1, PR 1100, open).

**Not done.**
- `docs/inventories/db-check-constraints.json` regeneration: the generator reads the live catalog over a direct Postgres connection (`SUPABASE_DB_PASSWORD`) and no lane or session without that secret can run it. Command: `gh workflow run maintenance.yml --ref master -f mode=dry -f step=schema-vocabulary-inventory` (the workflow commits the JSON back to the dispatched ref). [WORK: EXEC-4]
- Staged DOCS-5 code edits with no exact text in the staging log: `.discipline/rendering/audit/spec/bandtile.json` (old stacked label), `fsi-app/src/app/admin/parts/section-index/section-index-fixtures.ts` (bodies for the two new tabs), `.discipline/governance/worktree-isolation.mjs` (home for the narrow branching matcher). [WORK: owed]
- Staged DOCS-5 doc edits to the rest of the gate-removal prose (invariants.d texts, `.discipline` READMEs, a pinned SKILL.md, src and scripts comments, discipline.yml comments, pre-push step 2c) and PROGRAM-BOARD lines for register items 13, 17, 42 and 43. [WORK: owed]
- Dispatch of the `schema-vocabulary-inventory` maintenance step (register row g5-read 99) is the db-check-constraints command above. [WORK: EXEC-4]

## Addendum 2026-10-15 (later), coordinator (Fable): Part 2 wave 1 closed, wave 2a built and merged, wave 2b launched

- Permission flood resolved by the operator (dead global PreToolUse hook removed); a Haiku probe ran git, gh, worktree add/remove and a Write with 0 prompts.
- caros-ledge main: P2-01 core foundation (1,948 lines, 7ecd1af3), H-2 parity baseline (18 of 19 routes; JSON for all, PNG for the four signed-out routes; community-group owed before P2-16), P2-S1 schema forward migrations (12 files, waivers 2 -> 0, 13 property checks each proven by a planted violation; df62faf0), P2-02 workspace (2,302 of 2,500; a2071698), P2-03 sources + capture (6,198 against 4,900; 97519a1e), P2-04 intake + brief (4,718 against 4,000; 9c613f8b). Every slice: diff read by the coordinator, headers resolved by an H-3 Haiku audit (five range overruns found and fixed before merge), invariants proven red-first (25, 14, 67, 44, 101 mutations), one or two CI runs each.
- Budget: wave-2a overages (P2-03 +1,298, P2-04 +718) accepted under the standing rule that a feature is never dropped to fit; src/core after wave 2a about 9,000 of the 25,000 gate (P2-01 903, P2-02 730, P2-03 3,750, P2-04 2,800 core lines; exact table at wave end from loc.mjs).
- Rulings taken (coordinator): wave 2 split into sub-waves 2a/2b/2c by the import graph; workspace UI deferred to P2-02b after the kit; rule tables as JSON data; P2-S1 migrations proven in CI and applied to production only at the cutover window; harness_runs reads platform-admin only; inference_records keeps no outbox; the propagation drain accepts correction events on intelligence_items and section_claim_provenance; verbatim semantics = criterion 3 for every caller; deferrals capped at 14 days; surface_tags from the session verdict file; P2-05 owns the one mint function; INV-167 amended to 503 (LookupError contract); zustand, unpdf and playwright admitted with budget lines.
- Anonymity catch: the parity capture carried the operator's address and name token (the smoke account is personal); tree-checks caught it, H-2 sanitised the JSON and dropped signed-in PNGs; a dedicated smoke account is owed (IMP-016).
- Windows: tests/_support/hooks.mjs used URL.pathname and broke `npm test` on this host for three lanes; fixed in P2-S1's second commit (fileURLToPath); suites now 443/443 locally.
- IMPROVEMENTS.md: IMP-008 to IMP-038 collected with recommendations; none applied beyond the BUILT-IN rows.
- Wave 2b (P2-05 mint, P2-06 connect + propagate + obligations) launched as local Sonnet lanes against main 9c613f8b; P2-07 follows; wave-3 briefs P2-09 and P2-02b drafted.

## Addendum 2026-10-16 (evening), coordinator (Fable): wave 3 closed, wave 4 launched

- Merged: P2-CI2 + P2-02c (24bf3060), P2-08 (ac27656f), P2-08b (ad3de296), P2-08b-ii (f095102), P2-02b (d2061012). Main green after each.
- The parity run the operator saw red (12m49s) had three causes, each named from code and corroborated by a run: an unconditional
  serviceClient() in the bootstrap route; unbounded identity/bootstrap retries; and a document reload on SIGNED_IN that auth-js
  2.118.0 emits before INITIAL_SESSION on every load with a stored session (the loop the old build also had). All fixed at cause
  with red-first tests and a capture-side loop ceiling. Then the first real compare exposed frame landmarks from old list bodies
  (frame scoping extended to landmarks) and real settings/profile differences (built, not waived).
- Rulings: see rulings-2026-10-11.md 2026-10-16 entries; operator: saved views personal per user.
- IMPROVEMENTS 064-076 recorded with dispositions; IMP-069 flywheel half refuted; IMP-074 declined.
- Process edits: lane order merge main, then gates on the merged tree, then push (one red traced to the old order); stop own
  processes by PID only; P2-CI2 pushed a diagnostics commit without skip-ci on my instruction (one red, mine).
- Wave 4 launched: P2-10, P2-11, P2-12, P2-13, P2-14 against d2061012.

## Addendum 2026-10-17, coordinator (Fable): wave 4 closed

- Merged (in order): P2-13, P2-CI3, P2-CI4 (push gate + schema:local), P2-CI5, P2-10, P2-14, P2-CI6a, P2-CI6b (baseline
  recaptured on current data), P2-CI7, P2-12, P2-11. Main cc2bd246, zero open PRs, src 55,167 / core 16,419 of 75k / 25k,
  1,120 tests. Every customer surface compared against the old site: 14 routes PASS (market-detail and regulation-detail
  carry until-migration 0031 waivers that retire at cutover), 2 reported, admin and community-group skipped by policy.
- Operator rulings: "Get this fixed so it doesn't happen again" (migration reds never run locally) became the push gate:
  versioned pre-push hook installed by npm ci, one gates script shared with the ci job, schema chain on an embedded Postgres
  whenever supabase/ changed, skip-ci heads refused, tree-checks fails if the hook is removed. Proven by refusal of a planted
  lint error and a wrong catalog header before it merged.
- Defects found by the gate once drift was removed (all fixed at cause, file:line in rulings-2026-10-11.md): readers
  passing a null org to get_surface_counts (facets fell back to loaded rows); the Workspace tags facet group not mounted;
  DenominatorLine reading a refused census read as zero; AuthProvider reload on SIGNED_IN (yesterday); pg-run exiting
  before a piped stdout drained (CI-only catalog truncation); a dispatch that would have run the turn against production.
- New waiver classes with mechanisms: until-migration (self-retiring via APPLIED.json), SEC-n, order (old order unspecified
  by file:line). Counts normalised in names and row keys; never waived.
- Coordinator misses recorded: the bracketed skip token in a merge body (no main run for 79bdb05a); P2-CI2's diagnostics
  push without skip-ci; launching wave 4 lanes in parallel on P2-10's unmerged barrel (P2-12 copied another lane's clone).
- Next: P2-S4 and P2-16 briefs; then P2-15 cutover (APPLIED.json, until-migration retirement, admin parity on the preview).
