# AUDIT-B1: MODULES — every `.mjs`/`.ts` module added since 2026-08-21

Scope: `fsi-app/src/lib/**`, `fsi-app/scripts/**` (mint, turns, maintenance, producers, forward-events,
lib, harness-runs, and every other `scripts/` subdirectory a `git log --diff-filter=A` turned up),
`fsi-app/supabase/functions/**`, `fsi-app/.discipline/**`. Window: every commit since 2026-08-21 on
`master` (the 107 PRs in `_prs.txt`), enumerated with `git log --since=2026-08-21 --diff-filter=A
--name-only`, tests/fixtures excluded. **252 non-test modules** were added in the window (one file —
`extract-forward-events.mjs` — was added under `scripts/forward-events/` on 2026-09-01 and renamed the
same day to `src/lib/forward-events/extract-forward-events.mjs`; it is tracked here at its current,
live path, not its now-nonexistent original one). `fsi-app/supabase/functions/**` added nothing in the
window — no Deno edge function was created or touched since 2026-08-21 (`capture-worker` predates it).

## Method

Two of the repo's own resolvers were read in full before use, per instruction, and the census's
definition of "wired" is kept:

- **`node fsi-app/.discipline/governance/execution-wiring.mjs`** answers "does a CI surface actually
  *execute* this proof file?" (run-test-suite.sh globs, the npmtest glob, goldens, the data-audit-lane
  AUDITS list, fitness-function sentinel strings, the rendering guard, and literal paths in
  `discipline.yml`). It is a **proof-execution** resolver — it has nothing to say about whether a
  non-test *runner* module is called by anything, which is most of this window's `scripts/**` additions.
- **`node fsi-app/.discipline/governance/coverage-scan.mjs`** and **F25 (`module-liveness`,**
  `.discipline/fitness/functions/F25-module-liveness.mjs`**)** answer "does this module have a real
  production importer?" via a hand-built import graph (`buildImportGraph`/`resolveSpecifier`, the exact
  logic reused here) — **but F25's own `check()` only scopes `fsi-app/src/**` and
  `fsi-app/scripts/lib/**`.** Every other `scripts/` subdirectory this window touched —
  `scripts/mint`, `scripts/turns`, `scripts/maintenance`, `scripts/review`, `scripts/connections`,
  `scripts/entities`, `scripts/producers`, `scripts/spec09`, `scripts/classification`, `scripts/gen`,
  `scripts/obligations`, `scripts/propagation`, `scripts/community`, `scripts/sources`, `scripts/seed`,
  `scripts/harness-runs` — **is outside F25's enforcement scope.** This is not a nitpick: it is exactly
  why the four `scripts/review/apply-*.mjs` gap below (a real, live, four-queue ratification path with
  zero CI callers) is green on every fitness gate today — nothing is watching that directory. See
  **Gap #1**.

Given that gap, this audit built its own repo-relative **import graph** (this repo's own
`buildImportGraph`/`resolveSpecifier`/`isTestFile`, imported directly from F25 rather than
reimplemented, run over every tracked `.ts/.tsx/.mjs/.cjs/.js/.jsx` file under `src/`, `scripts/`,
`.discipline/`) and cross-referenced every added module against:

1. **the real import graph** — who statically imports it, and whether that importer is itself a test;
2. **every `.github/workflows/*.yml`** — grepped for the file's repo-relative path, since most
   `scripts/**` additions are CLI entry points invoked with `node scripts/x.mjs` from a workflow `run:`
   step, never imported by another module (this is why "importers: 0" is *normal and expected* for a
   correctly-wired `scripts/turns/run-*.mjs` driver — the table's **Reachable from** column is the
   authoritative signal for those, not the importer count);
3. **F25's own `LEGACY_ALLOWLIST`** (for the `src/`/`scripts/lib/` subset it does cover) — a module there
   is DESIGNED-ONLY by an existing operator ruling, not a fresh finding;
4. **live Supabase state** (read-only SELECT, project `kwrsbpiseruzbfwjpvsp`) wherever a module's own
   header made a falsifiable claim about what it does or has done — four such claims were checked and
   are reported as [CONFIRMED] evidence below, not assumed from the code.

Two mechanical blind spots in the import-graph regex were found and corrected by hand, not left as false
positives: (a) four `.discipline/rendering/smoke/stub-*.mjs` files are resolved at bundle time through an
**esbuild module-alias table** (a string constant, e.g. `harness.mjs`'s `NEXT_LINK_STUB`), never a static
`import` specifier — confirmed wired by reading the alias tables directly; (b) `scripts/mint/screen-worklist.mjs`
has zero static importers and no CI step, but three live artifacts —
`scripts/harness-runs/screen/screen-run-{001,002,003}.json` — prove it has actually been run by hand at
least three times as MINT-RUNBOOK.md's documented pre-population-turn procedure. Both are marked WIRED
below with the mechanism named, not left as the resolver's raw (wrong) answer.

**Verdict legend**: WIRED (real importer or CI dispatch, used or usable now) · WIRED-NOT-RUN (wired, but
structurally disarmed or never actually executed) · BUILT-NOT-WIRED (exists, tested, nothing outside its
own test calls it) · DESIGNED-ONLY (F25's own allowlist, or an equivalent documented "no source exists
yet" posture) · DEAD-OR-MANUAL-ONLY (no importer, no CI reference, no allowlist entry, and — where
checked — live DB state does not support "this ran at scale").

## Top-line findings (read this before the tables)

**Nothing in the flywheel loop runs on its own clock right now.** Every one of the seven loop-stage
workflows this window built or extended — `population-turn.yml`, `corpus-turn.yml`, `source-sweep.yml`,
`ledger-consume.yml`, `change-detection.yml`, `propagation-drain.yml`, `producers.yml` — declares only
`workflow_dispatch:` with its `schedule:` block **commented out**, each annotated "BUILD MODE — no
schedule while the site is being built" (operator ruling, 2026-08-30/09-01/09-02, verified by reading
every workflow's `on:` block). So "WIRED" everywhere below means *reachable by a human or agent hitting
dispatch*, not *running unattended*. This is not idle — commit history for TODAY alone
(`train/wave36`) shows three separate `population-turn apply` runs — but it means the loop's cadence is
currently "whenever someone drives it," not "on autopilot," for literally every stage. This is a
system-level fact the operator should have independent of any single component's verdict, so it is not
repeated in every row below.

**Gap #1 — the census/ratification half of the loop has no CI caller at all, and no gate watches for
it.** `scripts/review/apply-{provisional-sources,canonical-candidates,portal-links,coverage-gaps}.mjs` —
four scripts, each named explicitly as "the apply script this digest names" inside
`scripts/review/build-review-digests.mjs` itself (`QUEUES` array, `maintStep` field naming the
maintenance.yml step each is meant to be wired to: `review-apply-provisional-sources`,
`review-apply-canonical-candidates`, `review-apply-portal-links`, `review-apply-coverage-gaps`) — do not
appear anywhere in `.github/workflows/*.yml` (`grep -rn "review-apply\|apply-canonical-candidates\|
apply-coverage-gaps\|apply-portal-links\|apply-provisional-sources" .github/workflows/*.yml` returns
nothing). Only the read-only digest builder (`review-digests` MAINT step) is dispatched. Each apply
script writes through the guarded path and is fully unit-tested (its own `.test.mjs`), but each one's
*only* caller in the whole repo is that test. Live evidence this queue is real and growing:
`portal_link_candidates` carries **1,837 `candidate` rows vs. 3 `promoted`** [CONFIRMED, live SQL,
2026-09-04] — the exact queue `apply-portal-links.mjs` exists to triage, sitting untouched by any
automated caller. This directly names the operator's own `portal_link_candidates` loop stage.

**Gap #2 — `consume-turn-requests.mjs`'s own producer (migration 277's trigger) is live and firing; its
one real consumer has never run.** `corpus_turn_requests` carries **1,709 open rows, 0 consumed**
[CONFIRMED, live SQL: `count(*) filter (where consumed_at is null)` = 1709, `filter (where consumed_at is
not null)` = 0, earliest 2026-09-02, latest 2026-09-04]. `scripts/turns/consume-turn-requests.mjs` — the
only script that reads this table and can mark rows consumed — is not imported by anything, not in any
workflow, and its own header names the intended caller as "the corpus-turn GitHub Actions workflow
another lane owns"; `corpus-turn.yml` was read in full and does not call it — that workflow computes its
own `--since` timestamp via `last-turn-date.mjs` instead of consuming this ticket queue. The trigger that
fills the table is doing its job; nothing drains it. This is squarely the operator's own
**ledger-consume** stage, mechanically distinct from `run-ledger-consume.mjs` (which is CI-dispatched but
structurally apply-disarmed — see Gap #3) and equally unconsumed.

**Gap #3 — `run-ledger-consume.mjs` is CI-wired but self-disarmed.** `LEDGER_CONSUME_APPLY_ENABLED =
false` is a **source constant**, not an env var (`scripts/turns/run-ledger-consume.mjs:95`) — a
`--mode apply` dispatch throws rather than writes, by design, "until an operator flips it in a reviewed
diff (ADR-023)." This is disclosed in the workflow's own comments, not a hidden defect, but it means the
CI-wired path only ever runs read-only today. Corroborating live state: `portal_link_candidates` shows
almost nothing promoted (3 of 1,840) despite 1,709 open turn requests upstream.

**Gap #4 — a shipped, migrated table has zero rows because its one seeder has never run.**
`assumption_register` (migration 271) exists live [CONFIRMED, live SQL] but has **0 rows**
[CONFIRMED, live SQL: `select count(*) from assumption_register` = 0]. Its seeder,
`scripts/gen/assumption-register-seed.mjs`, has zero importers, is in no workflow, and its own header
states "THIS SESSION NEVER RUNS `--apply`" (Sonnet executor lane, wave18/la, dry-run-only by brief). Built
correctly, never executed.

**Gap #5 — 9 of 10 Spec-09 tables are empty by design, not by defect, and say so themselves.**
`scripts/spec09/*-producer.mjs` (7 of 8 added producers) and their governing doc,
`scripts/spec09/SOURCES.md`, both state the same thing this audit's own live SQL confirms: **all ten
Spec-09 tables — `surcharge_audits`, `carrier_compliance_pools`, `oem_tech_roadmaps`,
`indexation_clauses`, `reroute_events`, `tce_data_quality`, `auxiliary_energy_profiles`,
`grid_connection_queues`, `eudr_plot_claims`, `custody_chains` — hold 0 rows** [CONFIRMED, live SQL, all
ten, 2026-09-04]. `reroute-producer.mjs` is the one CI-dispatched Spec-09 producer (`maintenance.yml`
`spec09-reroute` step) and it too ships 0 rows: the table needs two `entities.kind='corridor'` rows and
only one exists in the spine. This is DESIGNED-ONLY, correctly labelled by the code itself, not a hidden
gap — but it means every one of the seven Operations/Market/Regulations **panel components** that render
these calculators (`src/lib/spec09/*.mjs` → `*PanelView.tsx`, all real, wired, imported by live pages) is
currently rendering an empty state in production, because the surface is wired and the data behind it is
not. Listed at UI-surface fidelity, not module fidelity, so it is named once here rather than seven times
below.

**Gap #6 — `src/lib/statutory/types.ts` (`computeStatutory`, the Layer-2 type barrier) passes F25's own
liveness check for a reason that undercuts the check.** Its only importer in the whole repo besides its
own test is `src/lib/statutory/types.contractable-barrier.check.ts` — a compile-time-only proof file
(never executed by Node, only type-checked) that F25's `isTestFile()` does **not** classify as a test
(its suffix is `.check.ts`, not `.test/.selftest/.npmtest.ts`). So F25 mechanically calls `types.ts`
wired, and it is not wrong to — but no page or route in the repo actually calls `computeStatutory()` at
runtime. `StatutoryFigure.tsx` (Layer 4, the render component `computeStatutory`'s output would flow
through) is *already* in F25's own `LEGACY_ALLOWLIST` as DESIGNED-ONLY, "no consuming page landed in
this lane's own scope." The formula and the type barrier are real and tested; the filing surface that
would call either one does not exist yet.

## The harness layer and its 8 families

`scripts/harness-runs/governing-files.mjs` (added 2026-09-04, Wave GOV-SINGLE) is now **the single
source** for every family's `GOVERNING_FILES` — before it, `.discipline/fitness/functions/
F28-harness-run-integrity.mjs`'s own copy and each family's runner-local `*_GOVERNING_FILES` export
could drift, and had (mint's two copies were provably out of sync: the runner's 8-file hash vs. F28's
10-file hash, so mint-run-024–026's stamped `harness_version` could never be honestly discharged against
F28's own re-hash). Verified by reading the module in full: it declares **9** families —
`mint`, `screen`, `fetch-drain`, `forward-events`, `source-sweep`, `ledger-consume`, `change-detection`,
`propagation`, and `meta-harness` itself (the layer's self-referential 9th entry, not one of "the eight"
the brief asks about). Every family's canonical runner (`run-mint-batch.mjs`, `screen-worklist.mjs`,
`run-extraction.mjs`, `run-source-sweep.mjs`, `run-ledger-consume.mjs`, `run-change-detection.mjs`,
`run-propagation-drain.mjs`) now imports its one entry back from here and re-exports it under its
historical name — confirmed live: `run-artifact.mjs` and `F28-harness-run-integrity.mjs` both import
`governing-files.mjs`, and a dedicated contract test (`governing-files.test.mjs`) asserts no runner still
declares a literal array of its own. `fetch-drain`'s governing file is a Deno function
(`supabase/functions/capture-worker/index.ts`) this repo cannot import as a Node module — declared, not
enforced by import.

| Family | Canonical runner | CI-dispatched | Governed by (F28/`governing-files.mjs`) | Live artifacts this window |
|---|---|---|---|---|
| mint | `scripts/mint/run-mint-batch.mjs` | yes (`population-turn.yml`) | 10 files incl. `src/lib/agent/gate-a-{scan,match}.mjs` (single-sourced 2026-09-04) | `scripts/harness-runs/mint/mint-run-024`…`034`+ |
| screen | `scripts/mint/screen-worklist.mjs` | **no** — manual CLI only | `screen-rules.mjs`, `screen-worklist.mjs` | `screen-run-001..003.json` (hand-run) |
| fetch-drain | (Deno, not in this window) | n/a | `supabase/functions/capture-worker/index.ts` | — |
| forward-events | `scripts/forward-events/run-extraction.mjs` | yes (`corpus-turn.yml`) | `extract-forward-events.mjs`, `PROTOCOL.md` | `forward-events-run-029..032` (25.9% yield, per commit) |
| source-sweep | `scripts/turns/run-source-sweep.mjs` | yes (`source-sweep.yml`) | itself + `register-walk.mjs`/`feed-walk.mjs` | present |
| ledger-consume | `scripts/turns/run-ledger-consume.mjs` | yes (`ledger-consume.yml`) — **apply mode structurally disarmed**, see Gap #3 | itself + `portal-harvest.ts`/`first-fetch-classify.ts` | present, plan-mode only |
| change-detection | `scripts/turns/run-change-detection.mjs` | yes (`change-detection.yml`) | itself + `reconcile.ts`/`run-intake-cycle.ts` | present |
| propagation | `scripts/turns/run-propagation-drain.mjs` | yes (`propagation-drain.yml`) | itself + `drain.ts`/`admissible-for.ts` | present |
| meta-harness (the layer itself) | `F28-harness-run-integrity.mjs` + `run-artifact.mjs` + `governing-files.mjs` | n/a (a fitness gate, runs on every push) | self-referential — see header | `meta-harness-run-008` etc. |

`run-population-flywheel.mjs` (CI-dispatched inside `population-turn.yml`, immediately after
`screen-reconcile-records.mjs`) is explicitly **not a 10th family** — its own header states it "registers
no family of its own," instead enriching the existing `mint` artifact and triggering the existing
`forward-events` run. It is the one runtime that chains discovery (`discover-for-items.mjs`), forward
events (`run-extraction.mjs --execute`), tags (`tag-proposals.mjs`/`tag-ratification.mjs`), and
obligations (`derive-obligations.mjs`) into one population-turn pass — read in full, its wiring is real.

---

## Per-component tables

The following tables cover all 252 added modules, grouped by directory (each group states the loop stage
it maps to). "Importers/callers" is the real static-import graph; **for `scripts/**` CLI entry points
"0 importers" is expected** — read the "Reachable from" column, which additionally reflects CI-workflow
dispatch (all seven loop workflows are `workflow_dispatch`-only — see top-line findings).

#### discipline/fitness (F27-F35 fitness functions)

Loop stage: **governance**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `.discipline/fitness/functions/F27-producer-seam-proof.mjs` | 2026-08-30 (3cd2dcfb) | 1: .discipline/fitness/manifest.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/fitness/functions/F28-harness-run-integrity.mjs` | 2026-09-01 (9282aa3c) | 2: .discipline/fitness/manifest.mjs; scripts/verify/verification-audit-report.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/fitness/functions/F30-entity-spine.mjs` | 2026-09-02 (2e1afc76) | 1: .discipline/fitness/manifest.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/fitness/functions/F31-derived-values-gate.mjs` | 2026-09-02 (2e1afc76) | 1: .discipline/fitness/manifest.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/fitness/functions/F32-statutory-purity.mjs` | 2026-09-02 (2e1afc76) | 1: .discipline/fitness/manifest.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/fitness/functions/F33-surface-acceptance.mjs` | 2026-09-02 (65dfeb55) | 1: .discipline/fitness/manifest.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/fitness/functions/F34-bundle-safe-module-evaluation.mjs` | 2026-09-02 (74f303de) | 1: .discipline/fitness/manifest.mjs | imported by a wired caller (see importers) | governance | WIRED (dead exports: FS_CALLS) |
| `.discipline/fitness/functions/F35-row-ux-coverage.mjs` | 2026-09-03 (e8dc50f8) | 1: .discipline/fitness/manifest.mjs | imported by a wired caller (see importers) | governance | WIRED |

#### discipline/governance

Loop stage: **governance**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `.discipline/governance/skill-contract-map.mjs` | 2026-08-29 (28d1f5e0) | 0 (test-only: .discipline/skill-drift-gate.test.mjs) | nothing | governance | BUILT-NOT-WIRED |

#### discipline/rendering (UX smoke-render harness)

Loop stage: **governance**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `.discipline/rendering/fixtures-dash/fixtures.mjs` | 2026-09-02 (d60124b9) | 1: .discipline/rendering/fixtures.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/community-smoke.mjs` | 2026-09-03 (e8dc50f8) | 1: .discipline/rendering/smoke/ux-smoke-specs.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/detail-surfaces-smoke.mjs` | 2026-09-03 (910ee54d) | 1: .discipline/rendering/smoke/ux-smoke-specs.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/guard-assert.mjs` | 2026-09-02 (65dfeb55) | 1: .discipline/rendering/smoke/harness.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/harness.mjs` | 2026-09-02 (65dfeb55) | 9: .discipline/rendering/smoke/community-smoke.mjs; .discipline/rendering/smoke/detail-surfaces-smoke.mjs; .discipline/rendering/smoke/list-order-smoke.mjs; .discipline/rendering/smoke/notifications-smoke.mjs; .discipline/rendering/smoke/personal-archive-smoke.mjs; .discipline/rendering/smoke/regulations-rows-smoke.mjs; +3 more | imported by a wired caller (see importers) | governance | WIRED (dead exports: NEXT_LINK_STUB, SUPABASE_STUB, SMOKE_BASE_URL, fsiAppRoot) |
| `.discipline/rendering/smoke/home-sections-smoke.mjs` | 2026-09-03 (e8dc50f8) | 1: .discipline/rendering/smoke/ux-smoke-specs.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/list-order-smoke.mjs` | 2026-09-02 (65dfeb55) | 1: .discipline/rendering/run-rendering-guard.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/market-rows-smoke.mjs` | 2026-09-03 (e8dc50f8) | 1: .discipline/rendering/smoke/ux-smoke-specs.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/notifications-smoke.mjs` | 2026-09-02 (65dfeb55) | 1: .discipline/rendering/run-rendering-guard.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/operations-rows-smoke.mjs` | 2026-09-03 (e8dc50f8) | 1: .discipline/rendering/smoke/ux-smoke-specs.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/personal-archive-smoke.mjs` | 2026-09-02 (65dfeb55) | 1: .discipline/rendering/run-rendering-guard.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/regulations-rows-smoke.mjs` | 2026-09-03 (e8dc50f8) | 1: .discipline/rendering/smoke/ux-smoke-specs.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/research-rows-smoke.mjs` | 2026-09-03 (e8dc50f8) | 1: .discipline/rendering/smoke/ux-smoke-specs.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/smoke-fixtures.mjs` | 2026-09-02 (65dfeb55) | 10: .discipline/rendering/smoke/detail-surfaces-smoke.mjs; .discipline/rendering/smoke/home-sections-smoke.mjs; .discipline/rendering/smoke/list-order-smoke.mjs; .discipline/rendering/smoke/market-rows-smoke.mjs; .discipline/rendering/smoke/notifications-smoke.mjs; .discipline/rendering/smoke/operations-rows-smoke.mjs; +4 more | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/spec09-smoke.mjs` | 2026-09-03 (e8dc50f8) | 1: .discipline/rendering/smoke/ux-smoke-specs.mjs | imported by a wired caller (see importers) | governance | WIRED (dead exports: XPanel) |
| `.discipline/rendering/smoke/stub-community-css.mjs` | 2026-09-03 (e8dc50f8) | 0 | esbuild module-alias target string (`.discipline/rendering/smoke/community-smoke.mjs`'s STUBS map) — resolved at bundle time, invisible to the static import-specifier scan | governance | WIRED |
| `.discipline/rendering/smoke/stub-next-link.mjs` | 2026-09-02 (65dfeb55) | 0 | esbuild module-alias target string (`harness.mjs`'s `NEXT_LINK_STUB` constant) — resolved at bundle time, invisible to the static import-specifier scan | governance | WIRED |
| `.discipline/rendering/smoke/stub-next-navigation.mjs` | 2026-09-03 (e8dc50f8) | 0 | esbuild module-alias target string (`community-smoke.mjs`'s STUBS map) — resolved at bundle time, invisible to the static import-specifier scan | governance | WIRED |
| `.discipline/rendering/smoke/stub-supabase-browser.mjs` | 2026-09-02 (65dfeb55) | 0 | esbuild module-alias target string (`harness.mjs`'s `SUPABASE_STUB` constant) — resolved at bundle time, invisible to the static import-specifier scan | governance | WIRED |
| `.discipline/rendering/smoke/ux-harness.mjs` | 2026-09-03 (e8dc50f8) | 8: .discipline/rendering/smoke/community-smoke.mjs; .discipline/rendering/smoke/detail-surfaces-smoke.mjs; .discipline/rendering/smoke/home-sections-smoke.mjs; .discipline/rendering/smoke/market-rows-smoke.mjs; .discipline/rendering/smoke/operations-rows-smoke.mjs; .discipline/rendering/smoke/regulations-rows-smoke.mjs; +2 more | imported by a wired caller (see importers) | governance | WIRED (dead exports: UX_VIEWPORTS) |
| `.discipline/rendering/smoke/ux-smoke-specs.mjs` | 2026-09-03 (e8dc50f8) | 1: .discipline/rendering/run-rendering-guard.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/smoke/watchlist-team-smoke.mjs` | 2026-09-02 (65dfeb55) | 1: .discipline/rendering/run-rendering-guard.mjs | imported by a wired caller (see importers) | governance | WIRED |
| `.discipline/rendering/ux-assert.mjs` | 2026-09-03 (e8dc50f8) | 6: .discipline/rendering/run-rendering-guard.mjs; .discipline/rendering/smoke/community-smoke.mjs; .discipline/rendering/smoke/detail-surfaces-smoke.mjs; .discipline/rendering/smoke/regulations-rows-smoke.mjs; .discipline/rendering/smoke/spec09-smoke.mjs; .discipline/rendering/smoke/ux-harness.mjs | imported by a wired caller (see importers) | governance | WIRED (dead exports: TARGET_SELECTOR) |

#### scripts/classification

Loop stage: **population-turn (source classification)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/classification/apply-classifications.mjs` | 2026-09-02 (d60124b9) | 1: scripts/maintenance/apply-classifications.mjs | imported by a wired caller (see importers) | population-turn (source classification) | WIRED |
| `scripts/classification/propose-classifications.mjs` | 2026-09-02 (d60124b9) | 0 (test-only: scripts/classification/propose-classifications.test.mjs) | nothing | population-turn (source classification) | BUILT-NOT-WIRED |

#### scripts/community

Loop stage: **n/a — community feature (adjacent to loop)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/community/seed-benchmark-instruments.mjs` | 2026-09-03 (e8dc50f8) | 0 (test-only: scripts/community/seed-benchmark-instruments.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | n/a — community feature (adjacent to loop) | WIRED |

#### scripts/connections

Loop stage: **connections + forward events + tags**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/connections/apply-tags.mjs` | 2026-09-01 (9ea3bf58) | 1: scripts/maintenance/tag-ratification.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | connections + forward events + tags | WIRED |
| `scripts/connections/discover-for-items.mjs` | 2026-09-01 (9ea3bf58) | 0 (test-only: scripts/connections/discover-for-items.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | connections + forward events + tags | WIRED |
| `scripts/connections/generate-theme-brief.mjs` | 2026-09-01 (9ea3bf58) | 0 (test-only: scripts/connections/generate-theme-brief.test.mjs) | nothing | connections + forward events + tags | BUILT-NOT-WIRED |
| `scripts/connections/propose-tags.mjs` | 2026-09-01 (9ea3bf58) | 3: scripts/classification/propose-classifications.mjs; scripts/maintenance/apply-classifications.mjs; scripts/maintenance/tag-proposals.mjs | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |
| `scripts/connections/ratify-flag-to-census.mjs` | 2026-09-01 (9ea3bf58) | 0 (test-only: scripts/connections/ratify-flag-to-census.test.mjs) | nothing | connections + forward events + tags | BUILT-NOT-WIRED |

#### scripts/entities

Loop stage: **propagation (entity spine)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/entities/backfill-entities.mjs` | 2026-09-02 (2e1afc76) | 1: scripts/propagation/seed-derived-values.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | propagation (entity spine) | WIRED |
| `scripts/entities/backfill-lineage-edges.mjs` | 2026-08-29 (e69d7007) | 0 | nothing | propagation (entity spine) | DEAD-OR-MANUAL-ONLY |
| `scripts/entities/seed-corridors.mjs` | 2026-09-02 (d60124b9) | 1: scripts/maintenance/seed-corridors.mjs | imported by a wired caller (see importers) | propagation (entity spine) | WIRED |

#### scripts/forward-events

Loop stage: **connections + forward events + tags**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/forward-events/run-extraction.mjs` | 2026-09-01 (9ea3bf58) | 0 (test-only: scripts/forward-events/run-extraction.test.mjs; scripts/harness-runs/governing-files.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | connections + forward events + tags | WIRED |

#### scripts/gen (seeders/migration generators)

Loop stage: **sources / population-turn (one-shot seed)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/gen/assumption-register-common.mjs` | 2026-08-30 (9fa9013a) | 1: scripts/gen/assumption-register-seed.mjs | imported by a wired caller (see importers) | sources / population-turn (one-shot seed) | WIRED |
| `scripts/gen/assumption-register-seed.mjs` | 2026-08-30 (9fa9013a) | 0 | nothing | sources / population-turn (one-shot seed) | DEAD-OR-MANUAL-ONLY |
| `scripts/gen/emission-factors-common.mjs` | 2026-08-29 (c6c228ff) | 2: scripts/gen/emission-factors-desnz.mjs; scripts/gen/emission-factors-epa.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | sources / population-turn (one-shot seed) | WIRED |
| `scripts/gen/emission-factors-desnz.mjs` | 2026-08-29 (c6c228ff) | 0 (test-only: scripts/gen/emission-factors-desnz.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | sources / population-turn (one-shot seed) | WIRED |
| `scripts/gen/emission-factors-epa.mjs` | 2026-08-29 (c6c228ff) | 0 | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | sources / population-turn (one-shot seed) | WIRED |
| `scripts/gen/fetch-desnz-factors.mjs` | 2026-09-02 (d60124b9) | 0 (test-only: scripts/gen/fetch-desnz-factors.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | sources / population-turn (one-shot seed) | WIRED (dead exports: AIR_ENERGY_CARRIER, OCEAN_ENERGY_CARRIER, cellNumber) |
| `scripts/gen/migration-267-origin-class-and-envelope.mjs` | 2026-08-29 (e69d7007) | 0 (test-only: src/__tests__/contracts-provenance-envelope.test.mjs) | nothing | sources / population-turn (one-shot seed) | BUILT-NOT-WIRED |
| `scripts/gen/migration-268-market-series.mjs` | 2026-08-29 (c6c228ff) | 0 (test-only: src/__tests__/contracts-market-series-migration.test.mjs) | nothing | sources / population-turn (one-shot seed) | BUILT-NOT-WIRED |
| `scripts/gen/migration-271-assumption-register.mjs` | 2026-08-30 (9fa9013a) | 0 (test-only: src/__tests__/contracts-assumption-register-migration.test.mjs) | nothing | sources / population-turn (one-shot seed) | BUILT-NOT-WIRED |

#### scripts/harness-runs (harness layer)

Loop stage: **harness substrate (all stages)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/harness-runs/governing-files.mjs` | 2026-09-04 (e8cb748f) | 8: .discipline/fitness/functions/F28-harness-run-integrity.mjs; scripts/forward-events/run-extraction.mjs; scripts/mint/run-mint-batch.mjs; scripts/mint/screen-worklist.mjs; scripts/turns/run-change-detection.mjs; scripts/turns/run-ledger-consume.mjs; +2 more | imported by a wired caller (see importers) | harness substrate (all stages) | WIRED |

#### scripts/lib (shared harness/db plumbing)

Loop stage: **harness substrate (all stages)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/lib/institution-key.mjs` | 2026-09-02 (1aa91de6) | 10: scripts/lib/db.mjs; scripts/maintenance/institution-canonicalize.mjs; scripts/maintenance/record-hollow-sweep.mjs; scripts/mint/export-census-rows.mjs; scripts/mint/heal-provenance.mjs; scripts/mint/validate-mint-payload.mjs; +4 more | imported by a wired caller (see importers) | harness substrate (all stages) | WIRED |
| `scripts/lib/revalidate.mjs` | 2026-09-03 (9ebe0bb1) | 1: scripts/mint/apply-mint-batch.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | harness substrate (all stages) | WIRED |
| `scripts/lib/run-artifact.mjs` | 2026-09-01 (9282aa3c) | 12: .discipline/fitness/functions/F28-harness-run-integrity.mjs; scripts/forward-events/run-extraction.mjs; scripts/mint/apply-mint-batch.mjs; scripts/mint/run-mint-batch.mjs; scripts/mint/screen-worklist.mjs; scripts/turns/research-sweep.mjs; +6 more | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | harness substrate (all stages) | WIRED |

#### scripts/maintenance (MAINT wrappers)

Loop stage: **population-turn / census_worklist (maintenance sweeps)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/maintenance/apply-classifications.mjs` | 2026-09-03 (42b3bc0b) | 0 (test-only: scripts/maintenance/apply-classifications.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/canonical-key-dedup.mjs` | 2026-09-04 (f9f6824a) | 0 (test-only: scripts/maintenance/canonical-key-dedup.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/census-off-vertical.mjs` | 2026-09-02 (65dfeb55) | 0 (test-only: scripts/maintenance/census-off-vertical.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/community-topics-seed.mjs` | 2026-09-02 (65dfeb55) | 0 (test-only: scripts/maintenance/community-topics-seed.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/derive-obligations.mjs` | 2026-09-02 (ec6b1b85) | 1: scripts/turns/run-population-flywheel.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/forward-events-retext.mjs` | 2026-09-04 (2f110fea) | 0 (test-only: scripts/maintenance/forward-events-retext.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED (dead exports: IDS_ARG_PREFIX) |
| `scripts/maintenance/institution-canonicalize.mjs` | 2026-09-03 (a9cf6c93) | 0 (test-only: scripts/maintenance/institution-canonicalize.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/lib/cli.mjs` | 2026-09-02 (65dfeb55) | 26: scripts/maintenance/apply-classifications.mjs; scripts/maintenance/canonical-key-dedup.mjs; scripts/maintenance/census-off-vertical.mjs; scripts/maintenance/community-topics-seed.mjs; scripts/maintenance/derive-obligations.mjs; scripts/maintenance/forward-events-retext.mjs; +20 more | imported by a wired caller (see importers) | population-turn / census_worklist (maintenance sweeps) | WIRED (dead exports: parseCliArgs) |
| `scripts/maintenance/lib/origin-class-map.mjs` | 2026-09-02 (65dfeb55) | 1: scripts/maintenance/origin-class-backfill.mjs | imported by a wired caller (see importers) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/origin-class-backfill.mjs` | 2026-09-02 (65dfeb55) | 0 (test-only: scripts/maintenance/origin-class-backfill.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/provenance-heal.mjs` | 2026-09-03 (82681c3c) | 0 (test-only: scripts/maintenance/provenance-heal.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/record-hollow-sweep.mjs` | 2026-09-03 (42b3bc0b) | 0 (test-only: scripts/maintenance/record-hollow-sweep.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/reopen-validation-holds.mjs` | 2026-09-03 (8906e3b7) | 0 (test-only: scripts/maintenance/reopen-validation-holds.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/review-digests.mjs` | 2026-09-02 (65dfeb55) | 0 (test-only: scripts/maintenance/review-digests.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/seed-corridors.mjs` | 2026-09-02 (ec6b1b85) | 0 (test-only: scripts/maintenance/seed-corridors.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/source-type-backfill.mjs` | 2026-09-02 (74f303de) | 0 (test-only: scripts/maintenance/source-type-backfill.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/tag-proposals.mjs` | 2026-09-03 (117e89f2) | 1: scripts/turns/run-population-flywheel.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/tag-ratification.mjs` | 2026-09-02 (65dfeb55) | 1: scripts/turns/run-population-flywheel.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/tier-opinions.mjs` | 2026-09-02 (65dfeb55) | 0 (test-only: scripts/maintenance/tier-opinions.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |
| `scripts/maintenance/w1-dispositions.mjs` | 2026-09-02 (65dfeb55) | 0 (test-only: scripts/maintenance/w1-dispositions.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn / census_worklist (maintenance sweeps) | WIRED |

#### scripts/mint (THE GATE + mint runner)

Loop stage: **population-turn (mint under THE GATE)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/mint/apply-mint-batch.mjs` | 2026-09-02 (2e1afc76) | 0 (test-only: scripts/mint/apply-mint-batch.test.mjs; scripts/producers/market/build-oil-bulletin-rows.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn (mint under THE GATE) | WIRED |
| `scripts/mint/export-census-rows.mjs` | 2026-09-02 (2e1afc76) | 6: scripts/connections/propose-tags.mjs; scripts/maintenance/census-off-vertical.mjs; scripts/maintenance/origin-class-backfill.mjs; scripts/maintenance/provenance-heal.mjs; scripts/mint/heal-provenance.mjs; scripts/mint/screen-reconcile-records.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn (mint under THE GATE) | WIRED |
| `scripts/mint/heal-provenance.mjs` | 2026-09-03 (82681c3c) | 1: scripts/maintenance/provenance-heal.mjs | imported by a wired caller (see importers) | population-turn (mint under THE GATE) | WIRED |
| `scripts/mint/held-classes.mjs` | 2026-09-02 (d60124b9) | 0 (test-only: scripts/mint/held-classes.test.mjs) | nothing | population-turn (mint under THE GATE) | BUILT-NOT-WIRED |
| `scripts/mint/lib/canonicalize-citation-url.mjs` | 2026-08-31 (6227e41f) | 2: scripts/mint/heal-provenance.mjs; scripts/mint/validate-mint-payload.mjs | imported by a wired caller (see importers) | population-turn (mint under THE GATE) | WIRED |
| `scripts/mint/lib/gate-a-match.mjs` | 2026-07-26 (16412f13) | 0 (test-only: src/lib/intake/record-facts.npmtest.mjs) | nothing | population-turn (mint under THE GATE) | BUILT-NOT-WIRED |
| `scripts/mint/lib/gate-a-scan.mjs` | 2026-07-26 (e1806a6b) | 1: scripts/mint/validate-mint-payload.mjs | imported by a wired caller (see importers) | population-turn (mint under THE GATE) | WIRED |
| `scripts/mint/lib/instrument-identity.mjs` | 2026-09-04 (e8cb748f) | 2: scripts/mint/apply-mint-batch.mjs; scripts/mint/export-census-rows.mjs | imported by a wired caller (see importers) | population-turn (mint under THE GATE) | WIRED |
| `scripts/mint/lib/screen-verdict.mjs` | 2026-09-02 (e6a1511f) | 2: scripts/mint/export-census-rows.mjs; scripts/mint/screen-reconcile-records.mjs | imported by a wired caller (see importers) | population-turn (mint under THE GATE) | WIRED (dead exports: MINTABLE_VERDICT) |
| `scripts/mint/lib/tag-presence-check.mjs` | 2026-09-01 (9ea3bf58) | 1: scripts/mint/run-mint-batch.mjs | imported by a wired caller (see importers) | population-turn (mint under THE GATE) | WIRED |
| `scripts/mint/rederive-record-provenance.mjs` | 2026-09-02 (4009ad70) | 0 (test-only: scripts/mint/rederive-record-provenance.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn (mint under THE GATE) | WIRED |
| `scripts/mint/reopen-validation-holds.mjs` | 2026-09-03 (8c5656cc) | 1: scripts/maintenance/reopen-validation-holds.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn (mint under THE GATE) | WIRED |
| `scripts/mint/run-mint-batch.mjs` | 2026-09-01 (9ea3bf58) | 0 (test-only: scripts/harness-runs/governing-files.test.mjs; scripts/mint/run-mint-batch.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn (mint under THE GATE) | WIRED |
| `scripts/mint/screen-reconcile-records.mjs` | 2026-09-02 (e6a1511f) | 0 (test-only: scripts/mint/screen-reconcile-records.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn (mint under THE GATE) | WIRED |
| `scripts/mint/screen-rules.mjs` | 2026-08-31 (6227e41f) | 2: scripts/mint/lib/screen-verdict.mjs; scripts/mint/screen-worklist.mjs | imported by a wired caller (see importers) | population-turn (mint under THE GATE) | WIRED |
| `scripts/mint/screen-worklist.mjs` | 2026-08-31 (6227e41f) | 0 (test-only: scripts/harness-runs/governing-files.test.mjs; scripts/mint/screen-rules.test.mjs) | manual CLI step, MINT-RUNBOOK.md's documented pre-population-turn procedure; NOT imported and NOT CI-dispatched, but `scripts/harness-runs/screen/screen-run-{001,002,003}.json` are live artifacts proving it has actually been run by hand at least 3 times | population-turn (mint under THE GATE) | WIRED (manual-only — no CI step) |
| `scripts/mint/stamp-wo26-archive-reason.mjs` | 2026-09-01 (9ea3bf58) | 0 (test-only: scripts/mint/stamp-wo26-archive-reason.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | population-turn (mint under THE GATE) | WIRED |
| `scripts/mint/validate-mint-payload.mjs` | 2026-08-31 (6227e41f) | 2: scripts/mint/run-mint-batch.mjs; scripts/turns/research-sweep.mjs | imported by a wired caller (see importers) | population-turn (mint under THE GATE) | WIRED |

#### scripts/obligations

Loop stage: **population-turn (derived obligations)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/obligations/derive-obligations.mjs` | 2026-09-02 (d60124b9) | 1: scripts/maintenance/derive-obligations.mjs | imported by a wired caller (see importers) | population-turn (derived obligations) | WIRED |

#### scripts/producers/market

Loop stage: **sources (market_series)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/producers/market/build-oil-bulletin-rows.mjs` | 2026-09-03 (82681c3c) | 0 (test-only: scripts/producers/market/build-oil-bulletin-rows.test.mjs) | nothing | sources (market_series) | BUILT-NOT-WIRED |
| `scripts/producers/market/ecb-fx-producer.mjs` | 2026-08-31 (6227e41f) | 0 (test-only: src/__tests__/market-ecb-fx-parser.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | sources (market_series) | WIRED |
| `scripts/producers/market/eia-v2-petroleum-spot-producer.mjs` | 2026-09-01 (9ea3bf58) | 0 (test-only: src/__tests__/market-eia-v2-petroleum-spot-parser.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | sources (market_series) | WIRED |
| `scripts/producers/market/eu-weekly-oil-bulletin.mjs` | 2026-08-29 (c6c228ff) | 0 | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | sources (market_series) | WIRED |
| `scripts/producers/market/fetch-oil-bulletin.mjs` | 2026-08-30 (899281c3) | 0 (test-only: scripts/producers/market/fetch-oil-bulletin.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | sources (market_series) | WIRED |
| `scripts/producers/market/propose-series-items.mjs` | 2026-09-02 (4946df80) | 1: scripts/producers/market/refresh-published-price-statistics.mjs | imported by a wired caller (see importers) | sources (market_series) | WIRED |
| `scripts/producers/market/ratify-series-items.mjs` | 2026-09-03 (82681c3c) | 0 (test-only: scripts/producers/market/ratify-series-items.test.mjs) | nothing | sources (market_series) | BUILT-NOT-WIRED |
| `scripts/producers/market/refresh-published-price-statistics.mjs` | 2026-08-29 (c6c228ff) | 1: scripts/producers/market/build-oil-bulletin-rows.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | sources (market_series) | WIRED |

#### scripts/producers/regional

Loop stage: **sources (regional_data_facts)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/producers/regional/bls-oews-producer.mjs` | 2026-08-29 (c6c228ff) | 0 | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | sources (regional_data_facts) | WIRED |
| `scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs` | 2026-09-02 (2e1afc76) | 0 (test-only: src/__tests__/regional-eurostat-lc-lci-lev-composition.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | sources (regional_data_facts) | WIRED |
| `scripts/producers/regional/eurostat-nrg-pc-205-producer.mjs` | 2026-08-29 (c6c228ff) | 0 | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | sources (regional_data_facts) | WIRED |
| `scripts/producers/regional/run-envelope-producer.mjs` | 2026-08-29 (c6c228ff) | 3: scripts/producers/regional/bls-oews-producer.mjs; scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs; scripts/producers/regional/eurostat-nrg-pc-205-producer.mjs | imported by a wired caller (see importers) | sources (regional_data_facts) | WIRED |

#### scripts/propagation

Loop stage: **propagation**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/propagation/seed-derived-values.mjs` | 2026-09-02 (2e1afc76) | 0 (test-only: scripts/propagation/seed-derived-values.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | propagation | WIRED |

#### scripts/review (ratification queues)

Loop stage: **portal_link_candidates / census_worklist (ratification)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/review/apply-canonical-candidates.mjs` | 2026-09-02 (65dfeb55) | 0 (test-only: scripts/review/apply-canonical-candidates.test.mjs) | nothing | portal_link_candidates / census_worklist (ratification) | BUILT-NOT-WIRED |
| `scripts/review/apply-coverage-gaps.mjs` | 2026-09-02 (65dfeb55) | 0 (test-only: scripts/review/apply-coverage-gaps.test.mjs) | nothing | portal_link_candidates / census_worklist (ratification) | BUILT-NOT-WIRED |
| `scripts/review/apply-portal-links.mjs` | 2026-09-02 (65dfeb55) | 0 (test-only: scripts/review/apply-portal-links.test.mjs) | nothing | portal_link_candidates / census_worklist (ratification) | BUILT-NOT-WIRED |
| `scripts/review/apply-provisional-sources.mjs` | 2026-09-02 (65dfeb55) | 0 (test-only: scripts/review/apply-provisional-sources.test.mjs) | nothing | portal_link_candidates / census_worklist (ratification) | BUILT-NOT-WIRED |
| `scripts/review/build-review-digests.mjs` | 2026-09-02 (65dfeb55) | 0 (test-only: scripts/review/build-review-digests.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | portal_link_candidates / census_worklist (ratification) | WIRED |
| `scripts/review/lib/apply-core.mjs` | 2026-09-02 (65dfeb55) | 3: scripts/review/apply-coverage-gaps.mjs; scripts/review/apply-portal-links.mjs; scripts/review/apply-provisional-sources.mjs | imported by a wired caller (see importers) | portal_link_candidates / census_worklist (ratification) | WIRED |
| `scripts/review/lib/canonical-candidates.mjs` | 2026-09-02 (65dfeb55) | 2: scripts/review/apply-canonical-candidates.mjs; scripts/review/build-review-digests.mjs | imported by a wired caller (see importers) | portal_link_candidates / census_worklist (ratification) | WIRED |
| `scripts/review/lib/coverage-gaps.mjs` | 2026-09-02 (65dfeb55) | 2: scripts/review/apply-coverage-gaps.mjs; scripts/review/build-review-digests.mjs | imported by a wired caller (see importers) | portal_link_candidates / census_worklist (ratification) | WIRED |
| `scripts/review/lib/digest-core.mjs` | 2026-09-02 (65dfeb55) | 5: scripts/review/build-review-digests.mjs; scripts/review/lib/canonical-candidates.mjs; scripts/review/lib/coverage-gaps.mjs; scripts/review/lib/portal-links.mjs; scripts/review/lib/provisional-sources.mjs | imported by a wired caller (see importers) | portal_link_candidates / census_worklist (ratification) | WIRED |
| `scripts/review/lib/portal-links.mjs` | 2026-09-02 (65dfeb55) | 2: scripts/review/apply-portal-links.mjs; scripts/review/build-review-digests.mjs | imported by a wired caller (see importers) | portal_link_candidates / census_worklist (ratification) | WIRED |
| `scripts/review/lib/provisional-sources.mjs` | 2026-09-02 (65dfeb55) | 2: scripts/review/apply-provisional-sources.mjs; scripts/review/build-review-digests.mjs | imported by a wired caller (see importers) | portal_link_candidates / census_worklist (ratification) | WIRED |
| `scripts/review/lib/ruling.mjs` | 2026-09-02 (65dfeb55) | 2: scripts/review/apply-canonical-candidates.mjs; scripts/review/lib/apply-core.mjs | imported by a wired caller (see importers) | portal_link_candidates / census_worklist (ratification) | WIRED |

#### scripts/seed

Loop stage: **n/a — community feature (adjacent to loop)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/seed/community-topics-seed.mjs` | 2026-08-31 (6227e41f) | 1: scripts/maintenance/community-topics-seed.mjs | imported by a wired caller (see importers) | n/a — community feature (adjacent to loop) | WIRED |

#### scripts/sources

Loop stage: **source sweep / sources**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/sources/backfill-source-type.mjs` | 2026-09-02 (65dfeb55) | 1: scripts/maintenance/source-type-backfill.mjs | imported by a wired caller (see importers) | source sweep / sources | WIRED |
| `scripts/sources/inaccessible-triage.mjs` | 2026-09-02 (65dfeb55) | 0 (test-only: scripts/sources/inaccessible-triage.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | source sweep / sources | WIRED (dead exports: DEFAULT_PER_FETCH_MS) |

#### scripts/spec09 (producers)

Loop stage: **sources (spec09 tables)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/spec09/auxiliary-energy-producer.mjs` | 2026-09-03 (e8dc50f8) | 0 (test-only: scripts/spec09/auxiliary-energy-producer.test.mjs) | nothing | sources (spec09 tables) | BUILT-NOT-WIRED |
| `scripts/spec09/dqi-producer.mjs` | 2026-09-03 (e8dc50f8) | 0 (test-only: scripts/spec09/dqi-producer.test.mjs) | nothing | sources (spec09 tables) | BUILT-NOT-WIRED |
| `scripts/spec09/eudr-custody-producer.mjs` | 2026-09-03 (e8dc50f8) | 0 (test-only: scripts/spec09/eudr-custody-producer.test.mjs) | nothing | sources (spec09 tables) | BUILT-NOT-WIRED |
| `scripts/spec09/grid-queue-producer.mjs` | 2026-09-03 (e8dc50f8) | 0 (test-only: scripts/spec09/grid-queue-producer.test.mjs) | nothing | sources (spec09 tables) | BUILT-NOT-WIRED |
| `scripts/spec09/indexation-producer.mjs` | 2026-09-03 (e8dc50f8) | 0 (test-only: scripts/spec09/indexation-producer.test.mjs) | nothing | sources (spec09 tables) | BUILT-NOT-WIRED |
| `scripts/spec09/oem-roadmap-producer.mjs` | 2026-09-03 (e8dc50f8) | 0 (test-only: scripts/spec09/oem-roadmap-producer.test.mjs) | nothing | sources (spec09 tables) | BUILT-NOT-WIRED |
| `scripts/spec09/reroute-producer.mjs` | 2026-09-03 (e8dc50f8) | 0 (test-only: scripts/spec09/reroute-producer.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | sources (spec09 tables) | WIRED |
| `scripts/spec09/surcharge-audit-producer.mjs` | 2026-09-03 (e8dc50f8) | 0 (test-only: scripts/spec09/surcharge-audit-producer.test.mjs) | nothing | sources (spec09 tables) | BUILT-NOT-WIRED |

#### scripts/turns (harness drivers)

Loop stage: **harness drivers (multiple stages)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/turns/apply-extraction-output.mjs` | 2026-09-01 (9ea3bf58) | 0 (test-only: scripts/turns/apply-extraction-output.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | harness drivers (multiple stages) | WIRED |
| `scripts/turns/consume-turn-requests.mjs` | 2026-09-01 (9ea3bf58) | 0 (test-only: scripts/turns/consume-turn-requests.test.mjs) | nothing | harness drivers (multiple stages) | BUILT-NOT-WIRED |
| `scripts/turns/export-corpus-for-extraction.mjs` | 2026-09-01 (9ea3bf58) | 1: scripts/turns/run-population-flywheel.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | harness drivers (multiple stages) | WIRED |
| `scripts/turns/last-turn-date.mjs` | 2026-09-01 (9ea3bf58) | 1: scripts/turns/run-population-flywheel.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | harness drivers (multiple stages) | WIRED (dead exports: DEFAULT_MARKER_PATH) |
| `scripts/turns/research-sweep.mjs` | 2026-09-02 (d60124b9) | 0 (test-only: scripts/turns/research-sweep.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | harness drivers (multiple stages) | WIRED |
| `scripts/turns/run-change-detection.mjs` | 2026-09-02 (2e1afc76) | 0 (test-only: scripts/harness-runs/governing-files.test.mjs; scripts/turns/run-change-detection.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | harness drivers (multiple stages) | WIRED |
| `scripts/turns/run-ledger-consume.mjs` | 2026-09-02 (2e1afc76) | 0 (test-only: scripts/harness-runs/governing-files.test.mjs; scripts/turns/run-ledger-consume.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | harness drivers (multiple stages) | WIRED |
| `scripts/turns/run-population-flywheel.mjs` | 2026-09-03 (42b3bc0b) | 0 (test-only: scripts/turns/run-population-flywheel.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | harness drivers (multiple stages) | WIRED |
| `scripts/turns/run-propagation-drain.mjs` | 2026-09-02 (2e1afc76) | 0 (test-only: scripts/harness-runs/governing-files.test.mjs; scripts/turns/run-propagation-drain.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | harness drivers (multiple stages) | WIRED |
| `scripts/turns/run-source-sweep.mjs` | 2026-09-01 (9ea3bf58) | 0 (test-only: scripts/harness-runs/governing-files.test.mjs; scripts/turns/run-source-sweep.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | harness drivers (multiple stages) | WIRED (dead exports: DEFAULT_SITEMAP_LIMIT) |

#### scripts/verify

Loop stage: **harness substrate (reporting)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `scripts/verify/population-report.mjs` | 2026-08-30 (c1aa871d) | 0 (test-only: scripts/verify/population-report.test.mjs) | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | harness substrate (reporting) | WIRED |
| `scripts/verify/verification-audit-report.mjs` | 2026-09-02 (65dfeb55) | 0 (test-only: scripts/verify/verification-audit-report.test.mjs) | nothing | harness substrate (reporting) | BUILT-NOT-WIRED |

#### src/lib (misc)

Loop stage: **surfaces (coverage gaps)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/coverage-gaps-rollup.ts` | 2026-09-02 (65dfeb55) | 1: src/lib/coverage-gaps.ts | imported by a wired caller (see importers) | surfaces (coverage gaps) | WIRED |
| `src/lib/tier-badge-tone.ts` | 2026-08-31 (6227e41f) | 1: src/components/regulations/sections/SourcesList.tsx | imported by a wired caller (see importers) | surfaces (coverage gaps) | WIRED |

#### src/lib/agent

Loop stage: **surfaces / population-turn (agent context)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/agent/operations-ask-context.mjs` | 2026-08-30 (19b472bd) | 1: src/app/api/ask/route.ts | imported by a wired caller (see importers) | surfaces / population-turn (agent context) | WIRED |
| `src/lib/agent/parse-record-sections.ts` | 2026-09-03 (5cace829) | 7: src/app/market/[slug]/page.tsx; src/app/regulations/[slug]/page.tsx; src/app/research/[slug]/page.tsx; src/components/pages/MarketSignalDetailSurface.tsx; src/components/regulations/RegulationDetailSurface.tsx; src/components/research/ResearchFindingDetailSurface.tsx; +1 more | imported by a wired caller (see importers) | surfaces / population-turn (agent context) | WIRED |

#### src/lib/auth

Loop stage: **n/a — platform (auth boundary)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/auth/route-policy.ts` | 2026-09-03 (41d9644e) | 1: src/proxy.ts | imported by a wired caller (see importers) | n/a — platform (auth boundary) | WIRED (dead exports: PUBLIC_ROUTES, SCANNER_PROBE_PREFIXES) |

#### src/lib/bootstrap

Loop stage: **n/a — platform (navigation bootstrap)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/bootstrap/rsc-navigation.ts` | 2026-09-03 (82681c3c) | 1: src/app/layout.tsx | imported by a wired caller (see importers) | n/a — platform (navigation bootstrap) | WIRED |

#### src/lib/classification

Loop stage: **population-turn (source classification)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/classification/classify-source.mjs` | 2026-09-02 (d60124b9) | 3: scripts/classification/apply-classifications.mjs; scripts/classification/propose-classifications.mjs; scripts/maintenance/apply-classifications.mjs | imported by a wired caller (see importers) | population-turn (source classification) | WIRED |
| `src/lib/classification/expected-output.mjs` | 2026-09-02 (d60124b9) | 3: scripts/classification/propose-classifications.mjs; scripts/maintenance/apply-classifications.mjs; src/lib/classification/classify-source.mjs | imported by a wired caller (see importers) | population-turn (source classification) | WIRED |
| `src/lib/classification/flags.mjs` | 2026-09-02 (d60124b9) | 3: scripts/classification/apply-classifications.mjs; scripts/classification/propose-classifications.mjs; scripts/maintenance/apply-classifications.mjs | imported by a wired caller (see importers) | population-turn (source classification) | WIRED |
| `src/lib/classification/jurisdiction.mjs` | 2026-09-02 (d60124b9) | 1: src/lib/classification/classify-source.mjs | imported by a wired caller (see importers) | population-turn (source classification) | WIRED |
| `src/lib/classification/routing.mjs` | 2026-09-02 (d60124b9) | 2: scripts/classification/propose-classifications.mjs; scripts/maintenance/apply-classifications.mjs | imported by a wired caller (see importers) | population-turn (source classification) | WIRED |
| `src/lib/classification/scope.mjs` | 2026-09-02 (d60124b9) | 1: src/lib/classification/classify-source.mjs | imported by a wired caller (see importers) | population-turn (source classification) | WIRED |
| `src/lib/classification/vocab.mjs` | 2026-09-02 (d60124b9) | 4: src/lib/classification/expected-output.mjs; src/lib/classification/jurisdiction.mjs; src/lib/classification/routing.mjs; src/lib/classification/scope.mjs | imported by a wired caller (see importers) | population-turn (source classification) | WIRED |

#### src/lib/community

Loop stage: **n/a — community feature (adjacent to loop)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/community/antitrust.mjs` | 2026-09-03 (e8dc50f8) | 2: src/lib/community/benchmark.mjs; src/lib/community/index.mjs | imported by a wired caller (see importers) | n/a — community feature (adjacent to loop) | WIRED |
| `src/lib/community/benchmark.mjs` | 2026-09-03 (e8dc50f8) | 1: src/lib/community/index.mjs | imported by a wired caller (see importers) | n/a — community feature (adjacent to loop) | WIRED |
| `src/lib/community/corroboration.mjs` | 2026-09-03 (e8dc50f8) | 1: src/lib/community/index.mjs | imported by a wired caller (see importers) | n/a — community feature (adjacent to loop) | WIRED |
| `src/lib/community/decay.mjs` | 2026-09-03 (e8dc50f8) | 1: src/lib/community/index.mjs | imported by a wired caller (see importers) | n/a — community feature (adjacent to loop) | WIRED |
| `src/lib/community/identity.mjs` | 2026-09-03 (e8dc50f8) | 3: src/components/community/ProfileForm.tsx; src/lib/community/index.mjs; src/lib/community/profile-policy.mjs | imported by a wired caller (see importers) | n/a — community feature (adjacent to loop) | WIRED |
| `src/lib/community/index.mjs` | 2026-09-03 (e8dc50f8) | 6: src/app/api/community/benchmarks/[key]/respond/route.ts; src/app/api/community/benchmarks/current/route.ts; src/app/api/community/posts/route.ts; src/app/api/community/profile/route.ts; src/app/api/community/profile/verify/route.ts; src/app/api/community/threads/[id]/corroboration/route.ts | imported by a wired caller (see importers) | n/a — community feature (adjacent to loop) | WIRED |
| `src/lib/community/lineage-guard.mjs` | 2026-09-03 (e8dc50f8) | 1: src/lib/community/index.mjs | imported by a wired caller (see importers) | n/a — community feature (adjacent to loop) | WIRED |
| `src/lib/community/organisation-key.mjs` | 2026-09-03 (20a3c02e) | 1: src/lib/community/index.mjs | imported by a wired caller (see importers) | n/a — community feature (adjacent to loop) | WIRED |
| `src/lib/community/organisation-salt.ts` | 2026-09-03 (97eef2c7) | 1: src/app/api/community/profile/verify/route.ts | imported by a wired caller (see importers) | n/a — community feature (adjacent to loop) | WIRED |
| `src/lib/community/profile-policy.mjs` | 2026-09-03 (20a3c02e) | 2: src/components/community/ProfileForm.tsx; src/lib/community/index.mjs | imported by a wired caller (see importers) | n/a — community feature (adjacent to loop) | WIRED |
| `src/lib/community/promotion.mjs` | 2026-09-03 (e8dc50f8) | 1: src/lib/community/index.mjs | imported by a wired caller (see importers) | n/a — community feature (adjacent to loop) | WIRED |
| `src/lib/community/respond.mjs` | 2026-09-03 (20a3c02e) | 1: src/lib/community/index.mjs | imported by a wired caller (see importers) | n/a — community feature (adjacent to loop) | WIRED |

#### src/lib/connections

Loop stage: **connections + forward events + tags**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/connections/anticipate.mjs` | 2026-09-01 (9ea3bf58) | 1: scripts/connections/analyze-corpus.mjs | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |
| `src/lib/connections/brief-candidates.mjs` | 2026-08-31 (6227e41f) | 1: src/lib/agent/canonical-pipeline.ts | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |
| `src/lib/connections/brief-staleness.mjs` | 2026-08-21 (99fd47e4) | 5: scripts/connections/generate-theme-brief.mjs; src/app/api/admin/themes/route.ts; src/components/research/ThemeStrip.tsx; src/lib/connections/brief-candidates.mjs; src/lib/research/theme-brief.mjs | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |
| `src/lib/connections/derive-tags.mjs` | 2026-09-01 (9ea3bf58) | 4: scripts/connections/apply-tags.mjs; scripts/connections/propose-tags.mjs; src/lib/connections/tag-aliases.mjs; src/lib/connections/tag-input.mjs | imported by a wired caller (see importers) | connections + forward events + tags | WIRED (dead exports: SCENARIO_GLOSSARY) |
| `src/lib/connections/flag-namespaces.mjs` | 2026-09-01 (9ea3bf58) | 13: scripts/classification/apply-classifications.mjs; scripts/classification/propose-classifications.mjs; scripts/connections/analyze-corpus.mjs; scripts/connections/apply-tags.mjs; scripts/connections/propose-tags.mjs; scripts/maintenance/apply-classifications.mjs; +7 more | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |
| `src/lib/connections/forward-event-format.mjs` | 2026-09-01 (9ea3bf58) | 3: src/components/admin/UpcomingObligationsPanel.tsx; src/components/regulations/ObligationRegisterFilterBar.tsx; src/components/regulations/UpcomingObligationsStripView.tsx | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |
| `src/lib/connections/run-discovery.mjs` | 2026-09-01 (9ea3bf58) | 2: src/lib/intake/apply-staged-update.ts; src/lib/intake/mint-item.ts | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |
| `src/lib/connections/signal-candidates.mjs` | 2026-09-01 (9ea3bf58) | 1: scripts/connections/analyze-corpus.mjs | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |
| `src/lib/connections/signal-confidence.mjs` | 2026-09-03 (82681c3c) | 1: scripts/connections/analyze-corpus.mjs | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |
| `src/lib/connections/tag-aliases.mjs` | 2026-09-03 (82681c3c) | 1: scripts/connections/propose-tags.mjs | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |
| `src/lib/connections/tag-input.mjs` | 2026-09-03 (82681c3c) | 1: scripts/connections/propose-tags.mjs | imported by a wired caller (see importers) | connections + forward events + tags | WIRED (dead exports: DEFAULT_CONTEXT_CHARS) |
| `src/lib/connections/theme-delta.mjs` | 2026-09-01 (9ea3bf58) | 1: scripts/connections/analyze-corpus.mjs | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |

#### src/lib/contracts

Loop stage: **sources (schema contracts)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/contracts/provenance-envelope.mjs` | 2026-08-29 (e69d7007) | 3: scripts/gen/migration-267-origin-class-and-envelope.mjs; scripts/gen/migration-268-market-series.mjs; scripts/gen/migration-271-assumption-register.mjs | imported by a wired caller (see importers) | sources (schema contracts) | WIRED |

#### src/lib/dashboard

Loop stage: **surfaces (dashboard)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/dashboard/changed-since.ts` | 2026-09-01 (9ea3bf58) | 1: src/components/dashboard/ChangedSinceStrip.tsx | imported by a wired caller (see importers) | surfaces (dashboard) | WIRED |

#### src/lib/detail

Loop stage: **surfaces (detail pages)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/detail/load-detail-core.ts` | 2026-09-03 (9ebe0bb1) | 4: src/app/market/[slug]/page.tsx; src/app/regulations/[slug]/page.tsx; src/app/research/[slug]/page.tsx; src/lib/detail/load-detail.ts | imported by a wired caller (see importers) | surfaces (detail pages) | WIRED |
| `src/lib/detail/load-detail.ts` | 2026-09-03 (9ebe0bb1) | 4: src/app/market/[slug]/page.tsx; src/app/operations/[slug]/page.tsx; src/app/regulations/[slug]/page.tsx; src/app/research/[slug]/page.tsx | imported by a wired caller (see importers) | surfaces (detail pages) | WIRED |
| `src/lib/detail/regulation-obligations-core.ts` | 2026-09-03 (41d9644e) | 1: src/lib/detail/regulation-obligations.ts | imported by a wired caller (see importers) | surfaces (detail pages) | WIRED |
| `src/lib/detail/regulation-obligations.ts` | 2026-09-03 (41d9644e) | 1: src/app/regulations/[slug]/page.tsx | imported by a wired caller (see importers) | surfaces (detail pages) | WIRED |

#### src/lib/entities

Loop stage: **propagation (entity spine)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/entities/crosswalk.mjs` | 2026-09-02 (2e1afc76) | 1: scripts/entities/backfill-entities.mjs | imported by a wired caller (see importers) | propagation (entity spine) | WIRED |
| `src/lib/entities/decisions.mjs` | 2026-09-02 (2e1afc76) | 2: src/lib/intake/record-facts.mjs; src/lib/propagation/admissible-for.ts | imported by a wired caller (see importers) | propagation (entity spine) | WIRED |
| `src/lib/entities/entity-id.mjs` | 2026-09-02 (2e1afc76) | 6: scripts/entities/backfill-entities.mjs; scripts/entities/seed-corridors.mjs; scripts/propagation/seed-derived-values.mjs; src/app/api/community/entities/[entityId]/threads/route.ts; src/app/api/community/posts/route.ts; src/lib/entities/crosswalk.mjs | imported by a wired caller (see importers) | propagation (entity spine) | WIRED |
| `src/lib/entities/lineage-backfill.mjs` | 2026-08-29 (e69d7007) | 1: scripts/entities/backfill-lineage-edges.mjs | imported by a wired caller (see importers) | propagation (entity spine) | WIRED |

#### src/lib/figures

Loop stage: **surfaces (figure rendering)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/figures/format-range.mjs` | 2026-09-02 (489d8902) | 2: src/components/figures/EstimatedFigure.tsx; src/components/market/CarbonCostOverlay.tsx | imported by a wired caller (see importers) | surfaces (figure rendering) | WIRED |

#### src/lib/forward-events

Loop stage: **connections + forward events + tags**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/forward-events/extract-forward-events.mjs` | 2026-09-01 (543e2187) | 3: scripts/forward-events/run-extraction.mjs; scripts/maintenance/forward-events-retext.mjs; src/lib/forward-events/read-and-extract.mjs | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |
| `src/lib/forward-events/read-and-extract.mjs` | 2026-09-01 (9ea3bf58) | 4: scripts/maintenance/forward-events-retext.mjs; scripts/turns/export-corpus-for-extraction.mjs; src/lib/intake/apply-staged-update.ts; src/lib/intake/mint-item.ts | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |
| `src/lib/forward-events/read-upcoming.mjs` | 2026-09-01 (9ea3bf58) | 2: src/components/regulations/UpcomingObligationsStrip.tsx; src/lib/detail/regulation-obligations.ts | imported by a wired caller (see importers) | connections + forward events + tags | WIRED |

#### src/lib/intake

Loop stage: **population-turn (mint under THE GATE)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/intake/flywheel-defect.ts` | 2026-09-01 (9ea3bf58) | 2: src/lib/intake/apply-staged-update.ts; src/lib/intake/mint-item.ts | imported by a wired caller (see importers) | population-turn (mint under THE GATE) | WIRED |
| `src/lib/intake/record-facts-research.mjs` | 2026-09-02 (d60124b9) | 2: scripts/mint/heal-provenance.mjs; scripts/turns/research-sweep.mjs | imported by a wired caller (see importers) | population-turn (mint under THE GATE) | WIRED |
| `src/lib/intake/record-facts.mjs` | 2026-09-01 (9ea3bf58) | 4: scripts/mint/heal-provenance.mjs; scripts/mint/run-mint-batch.mjs; scripts/producers/market/propose-series-items.mjs; src/lib/intake/record-facts-research.mjs | imported by a wired caller (see importers) | population-turn (mint under THE GATE) | WIRED |
| `src/lib/intake/write-item.ts` | 2026-09-02 (65dfeb55) | 3: scripts/mint/apply-mint-batch.mjs; scripts/mint/heal-provenance.mjs; src/lib/agent/canonical-pipeline.ts | imported by a wired caller (see importers) | population-turn (mint under THE GATE) | WIRED |

#### src/lib/market

Loop stage: **surfaces (Market) / sources (market_series)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/market/carbon-cost-per-feu.mjs` | 2026-09-02 (d60124b9) | 1: src/app/market/page.tsx | imported by a wired caller (see importers) | surfaces (Market) / sources (market_series) | WIRED |
| `src/lib/market/carbon-intensity.mjs` | 2026-09-02 (2e1afc76) | 4: scripts/propagation/seed-derived-values.mjs; src/components/pages/MarketSignalDetailSurface.tsx; src/lib/market/carbon-cost-per-feu.mjs; src/lib/propagation/methods/carbon-intensity.ts | imported by a wired caller (see importers) | surfaces (Market) / sources (market_series) | WIRED |
| `src/lib/market/carbon-overlay-view.mjs` | 2026-08-30 (03697e88) | 1: src/components/pages/MarketSignalDetailSurface.tsx | imported by a wired caller (see importers) | surfaces (Market) / sources (market_series) | WIRED |
| `src/lib/market/oil-bulletin-workbook.mjs` | 2026-08-30 (899281c3) | 1: scripts/producers/market/fetch-oil-bulletin.mjs | imported by a wired caller (see importers) | surfaces (Market) / sources (market_series) | WIRED (dead exports: resolveCellValue) |
| `src/lib/market/parsers/eu-weekly-oil-bulletin.mjs` | 2026-08-29 (c6c228ff) | 1: scripts/producers/market/eu-weekly-oil-bulletin.mjs | imported by a wired caller (see importers) | surfaces (Market) / sources (market_series) | WIRED |
| `src/lib/market/refresh-published-price-statistics.mjs` | 2026-08-29 (c6c228ff) | 4: scripts/producers/market/build-oil-bulletin-rows.mjs; scripts/producers/market/propose-series-items.mjs; scripts/producers/market/refresh-published-price-statistics.mjs; src/lib/market/series-board-view-model.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | surfaces (Market) / sources (market_series) | WIRED |
| `src/lib/market/select-modal-factor.mjs` | 2026-08-30 (03697e88) | 2: src/components/pages/MarketSignalDetailSurface.tsx; src/lib/market/carbon-overlay-view.mjs | imported by a wired caller (see importers) | surfaces (Market) / sources (market_series) | WIRED |
| `src/lib/market/series-board-view-model.mjs` | 2026-08-30 (61a08659) | 1: src/lib/supabase-server.ts | imported by a wired caller (see importers) | surfaces (Market) / sources (market_series) | WIRED |
| `src/lib/market/series-deltas.mjs` | 2026-09-02 (2e1afc76) | 1: src/lib/market/series-board-view-model.mjs | imported by a wired caller (see importers) | surfaces (Market) / sources (market_series) | WIRED |
| `src/lib/market/series-freshness.mjs` | 2026-09-02 (2e1afc76) | 1: src/components/market/MarketSeriesBoard.tsx | imported by a wired caller (see importers) | surfaces (Market) / sources (market_series) | WIRED |
| `src/lib/market/series-item-map.mjs` | 2026-09-02 (4946df80) | 1: src/lib/market/refresh-published-price-statistics.mjs | imported by a wired caller (see importers) | surfaces (Market) / sources (market_series) | WIRED |
| `src/lib/market/series-registry.mjs` | 2026-08-29 (c6c228ff) | 8: scripts/mint/validate-mint-payload.mjs; scripts/producers/market/ecb-fx-producer.mjs; scripts/producers/market/eia-v2-petroleum-spot-producer.mjs; scripts/producers/market/eu-weekly-oil-bulletin.mjs; src/components/market/MarketSeriesBoard.tsx; src/lib/market/parsers/eu-weekly-oil-bulletin.mjs; +2 more | imported by a wired caller (see importers) | surfaces (Market) / sources (market_series) | WIRED |
| `src/lib/market/signal-promotion.mjs` | 2026-09-02 (2e1afc76) | 1: src/components/pages/MarketSignalDetailSurface.tsx | imported by a wired caller (see importers) | surfaces (Market) / sources (market_series) | WIRED |
| `src/lib/market/write-market-series.mjs` | 2026-08-29 (c6c228ff) | 3: scripts/producers/market/ecb-fx-producer.mjs; scripts/producers/market/eia-v2-petroleum-spot-producer.mjs; scripts/producers/market/eu-weekly-oil-bulletin.mjs | imported by a wired caller (see importers) | surfaces (Market) / sources (market_series) | WIRED |

#### src/lib/obligations

Loop stage: **surfaces (Regulations obligations)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/obligations/classify-binding-position.mjs` | 2026-09-02 (d60124b9) | 1: scripts/obligations/derive-obligations.mjs | imported by a wired caller (see importers) | surfaces (Regulations obligations) | WIRED |
| `src/lib/obligations/read-register.mjs` | 2026-09-02 (d60124b9) | 3: src/components/regulations/ObligationRegister.tsx; src/components/regulations/ObligationRegisterFilterBar.tsx; src/lib/detail/regulation-obligations.ts | imported by a wired caller (see importers) | surfaces (Regulations obligations) | WIRED (dead exports: BINDING_POSITIONS) |

#### src/lib/operations

Loop stage: **surfaces (Operations)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/operations/automate-vs-hire.mjs` | 2026-09-02 (2e1afc76) | 4: scripts/propagation/seed-derived-values.mjs; src/app/operations/AutomateVsHireCalculator.tsx; src/lib/market/carbon-cost-per-feu.mjs; src/lib/propagation/methods/automate-vs-hire.ts | imported by a wired caller (see importers) | surfaces (Operations) | WIRED |
| `src/lib/operations/region-crosswalk.mjs` | 2026-08-30 (99fe8061) | 1: src/components/operations/OperationsLedger.tsx | imported by a wired caller (see importers) | surfaces (Operations) | WIRED |
| `src/lib/operations/state-roster.mjs` | 2026-08-30 (19b472bd) | 1: src/components/operations/OperationsLedger.tsx | imported by a wired caller (see importers) | surfaces (Operations) | WIRED |

#### src/lib/propagation

Loop stage: **propagation**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/propagation/admissible-for.ts` | 2026-09-02 (2e1afc76) | 2: src/components/figures/EstimatedFigure.tsx; src/components/figures/StatutoryFigure.tsx | imported by a wired caller (see importers) | propagation | WIRED |
| `src/lib/propagation/aggregate-safeguards.mjs` | 2026-09-02 (2e1afc76) | 1: src/lib/community/antitrust.mjs | imported by a wired caller (see importers) | propagation | WIRED |
| `src/lib/propagation/drain.ts` | 2026-09-02 (2e1afc76) | 1: scripts/turns/run-propagation-drain.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | propagation | WIRED |
| `src/lib/propagation/effective-confidence.mjs` | 2026-09-02 (2e1afc76) | 1: src/lib/propagation/admissible-for.ts | imported by a wired caller (see importers) | propagation | WIRED |
| `src/lib/propagation/methods/automate-vs-hire.ts` | 2026-09-02 (2e1afc76) | 1: src/lib/propagation/methods/index.ts | imported by a wired caller (see importers) | propagation | WIRED |
| `src/lib/propagation/methods/carbon-intensity.ts` | 2026-09-02 (2e1afc76) | 3: scripts/propagation/seed-derived-values.mjs; src/components/pages/MarketSignalDetailSurface.tsx; src/lib/propagation/methods/index.ts | imported by a wired caller (see importers) | propagation | WIRED |
| `src/lib/propagation/methods/index.ts` | 2026-09-02 (2e1afc76) | 3: src/lib/propagation/drain.ts; src/lib/propagation/methods/automate-vs-hire.ts; src/lib/propagation/methods/carbon-intensity.ts | imported by a wired caller (see importers) | propagation | WIRED |
| `src/lib/propagation/methods/superseded-notices.ts` | 2026-09-02 (2e1afc76) | 3: src/app/api/notices/logic.ts; src/app/api/notices/route.ts; src/components/figures/RecalculationNotice.tsx | imported by a wired caller (see importers) | propagation | WIRED |
| `src/lib/propagation/register-derivation.ts` | 2026-09-02 (2e1afc76) | 2: scripts/propagation/seed-derived-values.mjs; src/lib/propagation/drain.ts | imported by a wired caller (see importers) | propagation | WIRED |
| `src/lib/propagation/types.ts` | 2026-09-02 (2e1afc76) | 9: src/app/operations/AutomateVsHireCalculator.tsx; src/components/figures/EstimatedFigure.tsx; src/components/figures/StatutoryFigure.tsx; src/components/pages/MarketSignalDetailSurface.tsx; src/lib/propagation/admissible-for.ts; src/lib/propagation/drain.ts; +3 more | imported by a wired caller (see importers) | propagation | WIRED |

#### src/lib/regional

Loop stage: **sources (regional_data_facts)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/regional/bls-oews-parser.mjs` | 2026-08-29 (c6c228ff) | 1: scripts/producers/regional/bls-oews-producer.mjs | imported by a wired caller (see importers) | sources (regional_data_facts) | WIRED |
| `src/lib/regional/eurostat-lc-lci-lev-parser.mjs` | 2026-09-02 (2e1afc76) | 1: scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs | imported by a wired caller (see importers) | sources (regional_data_facts) | WIRED |
| `src/lib/regional/eurostat-nrg-pc-205-parser.mjs` | 2026-08-29 (c6c228ff) | 2: scripts/producers/regional/eurostat-nrg-pc-205-producer.mjs; src/lib/regional/eurostat-lc-lci-lev-parser.mjs | imported by a wired caller (see importers) | sources (regional_data_facts) | WIRED |
| `src/lib/regional/regional-facts-envelope.mjs` | 2026-08-29 (c6c228ff) | 1: scripts/producers/regional/run-envelope-producer.mjs | imported by a wired caller (see importers) | sources (regional_data_facts) | WIRED |

#### src/lib/research

Loop stage: **surfaces (Research)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/research/surface-candidate.mjs` | 2026-08-30 (19b472bd) | 1: src/lib/supabase-server.ts | imported by a wired caller (see importers) | surfaces (Research) | WIRED |
| `src/lib/research/taxonomy.mjs` | 2026-08-30 (99fe8061) | 2: src/components/research/ResearchFindingDetailSurface.tsx; src/components/research/ResearchLedger.tsx | imported by a wired caller (see importers) | surfaces (Research) | WIRED |
| `src/lib/research/theme-brief.mjs` | 2026-08-30 (19b472bd) | 2: src/app/research/[slug]/page.tsx; src/components/research/ResearchFindingDetailSurface.tsx | imported by a wired caller (see importers) | surfaces (Research) | WIRED |

#### src/lib/sources

Loop stage: **source sweep**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/sources/feed-discovery.mjs` | 2026-09-03 (42b3bc0b) | 1: src/lib/sources/sitemap-walk.mjs | imported by a wired caller (see importers) | source sweep | WIRED |
| `src/lib/sources/sitemap-walk.mjs` | 2026-09-03 (42b3bc0b) | 1: scripts/turns/run-source-sweep.mjs | CI workflow (workflow_dispatch, manual/agent-triggered — no cron) | source sweep | WIRED (dead exports: isBotWallStatus, allProbesBotWalled, extractHttpStatus) |
| `src/lib/sources/source-type-taxonomy.mjs` | 2026-09-02 (65dfeb55) | 2: scripts/sources/backfill-source-type.mjs; src/lib/coverage-gaps-rollup.ts | imported by a wired caller (see importers) | source sweep | WIRED |

#### src/lib/spec09 (calculators + panel data)

Loop stage: **surfaces (Operations/Market/Regulations panels)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/spec09/auxiliary-energy.mjs` | 2026-09-03 (e8dc50f8) | 1: src/components/operations/AuxiliaryEnergyPanelView.tsx | imported by a wired caller (see importers) | surfaces (Operations/Market/Regulations panels) | WIRED |
| `src/lib/spec09/dqi.mjs` | 2026-09-03 (e8dc50f8) | 1: src/components/operations/DqiPanelView.tsx | imported by a wired caller (see importers) | surfaces (Operations/Market/Regulations panels) | WIRED |
| `src/lib/spec09/eudr-custody.mjs` | 2026-09-03 (e8dc50f8) | 1: src/components/regulations/EudrCustodyPanelView.tsx | imported by a wired caller (see importers) | surfaces (Operations/Market/Regulations panels) | WIRED |
| `src/lib/spec09/grid-queue.mjs` | 2026-09-03 (e8dc50f8) | 1: src/components/operations/GridQueuePanelView.tsx | imported by a wired caller (see importers) | surfaces (Operations/Market/Regulations panels) | WIRED |
| `src/lib/spec09/indexation.mjs` | 2026-09-03 (e8dc50f8) | 1: scripts/spec09/indexation-producer.mjs | imported by a wired caller (see importers) | surfaces (Operations/Market/Regulations panels) | WIRED |
| `src/lib/spec09/label.mjs` | 2026-09-03 (e8dc50f8) | 7: src/lib/spec09/auxiliary-energy.mjs; src/lib/spec09/dqi.mjs; src/lib/spec09/grid-queue.mjs; src/lib/spec09/indexation.mjs; src/lib/spec09/oem-payload.mjs; src/lib/spec09/reroute.mjs; +1 more | imported by a wired caller (see importers) | surfaces (Operations/Market/Regulations panels) | WIRED |
| `src/lib/spec09/oem-payload.mjs` | 2026-09-03 (e8dc50f8) | 1: src/components/market/OemRoadmapPanelView.tsx | imported by a wired caller (see importers) | surfaces (Operations/Market/Regulations panels) | WIRED |
| `src/lib/spec09/reroute.mjs` | 2026-09-03 (e8dc50f8) | 1: src/components/market/ReroutingPanelView.tsx | imported by a wired caller (see importers) | surfaces (Operations/Market/Regulations panels) | WIRED |
| `src/lib/spec09/surcharge-audit.mjs` | 2026-09-03 (e8dc50f8) | 1: src/components/market/SurchargeAuditPanelView.tsx | imported by a wired caller (see importers) | surfaces (Operations/Market/Regulations panels) | WIRED |

#### src/lib/statutory

Loop stage: **propagation (statutory purity barrier)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/statutory/fueleu-annex-iv.mjs` | 2026-09-02 (2e1afc76) | 1: src/lib/statutory/types.ts | imported by a wired caller (see importers) | propagation (statutory purity barrier) | WIRED |
| `src/lib/statutory/types.contractable-barrier.check.ts` | 2026-09-02 (2e1afc76) | 0 | nothing | propagation (statutory purity barrier) | DESIGNED-ONLY |
| `src/lib/statutory/types.ts` | 2026-09-02 (2e1afc76) | 1: src/lib/statutory/types.contractable-barrier.check.ts | imported by a wired caller (see importers) | propagation (statutory purity barrier) | WIRED |

#### src/lib/watchlist

Loop stage: **surfaces (watchlist)**

| Component | Built (PR, date) | Importers/callers | Reachable from | Loop stage | Verdict |
|---|---|---|---|---|---|
| `src/lib/watchlist-scope.ts` | 2026-08-30 (03697e88) | 2: src/app/api/watchlist/route.ts; src/components/ui/WatchButton.tsx | imported by a wired caller (see importers) | surfaces (watchlist) | WIRED |
| `src/lib/watchlist/membership.ts` | 2026-09-03 (82681c3c) | 7: src/app/market/[slug]/page.tsx; src/app/market/page.tsx; src/app/operations/[slug]/page.tsx; src/app/regulations/[slug]/page.tsx; src/app/research/[slug]/page.tsx; src/components/market/MarketSeriesBoard.tsx; +1 more | imported by a wired caller (see importers) | surfaces (watchlist) | WIRED (dead exports: makeWatchMembershipDeps) |


---

## Appendix A — every module whose ONLY import-graph importer is a test

Mechanical result of the real import graph: 66 modules have at least one importer and **none of them are
non-test**. "In workflow" repeats the CI-dispatch flag from above — a `yes` here means the module is
still a live CLI entry point (correctly wired at runtime; the test relationship is incidental), a `no`
means the module's entire reachability in this repo is its own test (the BUILT-NOT-WIRED / DEAD-OR-MANUAL
rows in the tables above and Gap #1/#2 draw from this `no` subset).

| Module | Test-only importer(s) | In a CI workflow |
|---|---|---|
| `.discipline/governance/skill-contract-map.mjs` | .discipline/skill-drift-gate.test.mjs | no |
| `scripts/classification/propose-classifications.mjs` | scripts/classification/propose-classifications.test.mjs | no |
| `scripts/community/seed-benchmark-instruments.mjs` | scripts/community/seed-benchmark-instruments.test.mjs | yes |
| `scripts/connections/discover-for-items.mjs` | scripts/connections/discover-for-items.test.mjs | yes |
| `scripts/connections/generate-theme-brief.mjs` | scripts/connections/generate-theme-brief.test.mjs | no |
| `scripts/connections/ratify-flag-to-census.mjs` | scripts/connections/ratify-flag-to-census.test.mjs | no |
| `scripts/forward-events/run-extraction.mjs` | scripts/forward-events/run-extraction.test.mjs, scripts/harness-runs/governing-files.test.mjs | yes |
| `scripts/gen/emission-factors-desnz.mjs` | scripts/gen/emission-factors-desnz.test.mjs | yes |
| `scripts/gen/fetch-desnz-factors.mjs` | scripts/gen/fetch-desnz-factors.test.mjs | yes |
| `scripts/gen/migration-267-origin-class-and-envelope.mjs` | src/__tests__/contracts-provenance-envelope.test.mjs | no |
| `scripts/gen/migration-268-market-series.mjs` | src/__tests__/contracts-market-series-migration.test.mjs | no |
| `scripts/gen/migration-271-assumption-register.mjs` | src/__tests__/contracts-assumption-register-migration.test.mjs | no |
| `scripts/maintenance/apply-classifications.mjs` | scripts/maintenance/apply-classifications.test.mjs | yes |
| `scripts/maintenance/canonical-key-dedup.mjs` | scripts/maintenance/canonical-key-dedup.test.mjs | yes |
| `scripts/maintenance/census-off-vertical.mjs` | scripts/maintenance/census-off-vertical.test.mjs | yes |
| `scripts/maintenance/community-topics-seed.mjs` | scripts/maintenance/community-topics-seed.test.mjs | yes |
| `scripts/maintenance/forward-events-retext.mjs` | scripts/maintenance/forward-events-retext.test.mjs | yes |
| `scripts/maintenance/institution-canonicalize.mjs` | scripts/maintenance/institution-canonicalize.test.mjs | yes |
| `scripts/maintenance/origin-class-backfill.mjs` | scripts/maintenance/origin-class-backfill.test.mjs | yes |
| `scripts/maintenance/provenance-heal.mjs` | scripts/maintenance/provenance-heal.test.mjs | yes |
| `scripts/maintenance/record-hollow-sweep.mjs` | scripts/maintenance/record-hollow-sweep.test.mjs | yes |
| `scripts/maintenance/reopen-validation-holds.mjs` | scripts/maintenance/reopen-validation-holds.test.mjs | yes |
| `scripts/maintenance/review-digests.mjs` | scripts/maintenance/review-digests.test.mjs | yes |
| `scripts/maintenance/seed-corridors.mjs` | scripts/maintenance/seed-corridors.test.mjs | yes |
| `scripts/maintenance/source-type-backfill.mjs` | scripts/maintenance/source-type-backfill.test.mjs | yes |
| `scripts/maintenance/tier-opinions.mjs` | scripts/maintenance/tier-opinions.test.mjs | yes |
| `scripts/maintenance/w1-dispositions.mjs` | scripts/maintenance/w1-dispositions.test.mjs | yes |
| `scripts/mint/apply-mint-batch.mjs` | scripts/mint/apply-mint-batch.test.mjs, scripts/producers/market/build-oil-bulletin-rows.test.mjs | yes |
| `scripts/mint/held-classes.mjs` | scripts/mint/held-classes.test.mjs | no |
| `scripts/mint/lib/gate-a-match.mjs` | src/lib/intake/record-facts.npmtest.mjs | no |
| `scripts/mint/rederive-record-provenance.mjs` | scripts/mint/rederive-record-provenance.test.mjs | yes |
| `scripts/mint/run-mint-batch.mjs` | scripts/harness-runs/governing-files.test.mjs, scripts/mint/run-mint-batch.test.mjs, scripts/producers/market/build-oil-bulletin-rows.test.mjs | yes |
| `scripts/mint/screen-reconcile-records.mjs` | scripts/mint/screen-reconcile-records.test.mjs | yes |
| `scripts/mint/screen-worklist.mjs` | scripts/harness-runs/governing-files.test.mjs, scripts/mint/screen-rules.test.mjs, scripts/mint/screen-worklist.test.mjs | no |
| `scripts/mint/stamp-wo26-archive-reason.mjs` | scripts/mint/stamp-wo26-archive-reason.test.mjs | yes |
| `scripts/producers/market/build-oil-bulletin-rows.mjs` | scripts/producers/market/build-oil-bulletin-rows.test.mjs | no |
| `scripts/producers/market/ecb-fx-producer.mjs` | src/__tests__/market-ecb-fx-parser.test.mjs | yes |
| `scripts/producers/market/eia-v2-petroleum-spot-producer.mjs` | src/__tests__/market-eia-v2-petroleum-spot-parser.test.mjs | yes |
| `scripts/producers/market/fetch-oil-bulletin.mjs` | scripts/producers/market/fetch-oil-bulletin.test.mjs | yes |
| `scripts/producers/market/ratify-series-items.mjs` | scripts/producers/market/ratify-series-items.test.mjs | no |
| `scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs` | src/__tests__/regional-eurostat-lc-lci-lev-composition.test.mjs | yes |
| `scripts/propagation/seed-derived-values.mjs` | scripts/propagation/seed-derived-values.test.mjs | yes |
| `scripts/review/apply-canonical-candidates.mjs` | scripts/review/apply-canonical-candidates.test.mjs | no |
| `scripts/review/apply-coverage-gaps.mjs` | scripts/review/apply-coverage-gaps.test.mjs | no |
| `scripts/review/apply-portal-links.mjs` | scripts/review/apply-portal-links.test.mjs | no |
| `scripts/review/apply-provisional-sources.mjs` | scripts/review/apply-provisional-sources.test.mjs | no |
| `scripts/review/build-review-digests.mjs` | scripts/review/build-review-digests.test.mjs | yes |
| `scripts/sources/inaccessible-triage.mjs` | scripts/sources/inaccessible-triage.test.mjs | yes |
| `scripts/spec09/auxiliary-energy-producer.mjs` | scripts/spec09/auxiliary-energy-producer.test.mjs | no |
| `scripts/spec09/dqi-producer.mjs` | scripts/spec09/dqi-producer.test.mjs | no |
| `scripts/spec09/eudr-custody-producer.mjs` | scripts/spec09/eudr-custody-producer.test.mjs | no |
| `scripts/spec09/grid-queue-producer.mjs` | scripts/spec09/grid-queue-producer.test.mjs | no |
| `scripts/spec09/indexation-producer.mjs` | scripts/spec09/indexation-producer.test.mjs | no |
| `scripts/spec09/oem-roadmap-producer.mjs` | scripts/spec09/oem-roadmap-producer.test.mjs | no |
| `scripts/spec09/reroute-producer.mjs` | scripts/spec09/reroute-producer.test.mjs | yes |
| `scripts/spec09/surcharge-audit-producer.mjs` | scripts/spec09/surcharge-audit-producer.test.mjs | no |
| `scripts/turns/apply-extraction-output.mjs` | scripts/turns/apply-extraction-output.test.mjs | yes |
| `scripts/turns/consume-turn-requests.mjs` | scripts/turns/consume-turn-requests.test.mjs | no |
| `scripts/turns/research-sweep.mjs` | scripts/turns/research-sweep.test.mjs | yes |
| `scripts/turns/run-change-detection.mjs` | scripts/harness-runs/governing-files.test.mjs, scripts/turns/run-change-detection.test.mjs | yes |
| `scripts/turns/run-ledger-consume.mjs` | scripts/harness-runs/governing-files.test.mjs, scripts/turns/run-ledger-consume.test.mjs | yes |
| `scripts/turns/run-population-flywheel.mjs` | scripts/turns/run-population-flywheel.test.mjs | yes |
| `scripts/turns/run-propagation-drain.mjs` | scripts/harness-runs/governing-files.test.mjs, scripts/turns/run-propagation-drain.test.mjs | yes |
| `scripts/turns/run-source-sweep.mjs` | scripts/harness-runs/governing-files.test.mjs, scripts/turns/run-source-sweep.test.mjs | yes |
| `scripts/verify/population-report.mjs` | scripts/verify/population-report.test.mjs | yes |
| `scripts/verify/verification-audit-report.mjs` | scripts/verify/verification-audit-report.test.mjs | no |

---

## Appendix B — dead exports in otherwise-wired modules (bounded to this window)

Method: every module with at least one real (non-test) importer or a CI-workflow dispatch had its
top-level `export function` / `export const` / `export class` names extracted, then every tracked file
under `fsi-app/` was tokenized once and checked for each name's occurrence **outside its own defining
file**. An export with zero outside occurrences is listed. This is a mechanical first pass, not a manual
verification of each one — several are genuinely dead single-use constants; a few (marked below) are
exported names used only *within* their own file (i.e., not actually needed as an export, rather than
unused code), which is a smaller defect than a wholly-dead function but still an export nothing outside
the module needs.

| Module | Dead export(s) | Dead / total exports |
|---|---|---|
| `.discipline/fitness/functions/F34-bundle-safe-module-evaluation.mjs` | FS_CALLS | 1/5 |
| `.discipline/rendering/smoke/harness.mjs` | NEXT_LINK_STUB, SUPABASE_STUB, SMOKE_BASE_URL, fsiAppRoot | 4/8 |
| `.discipline/rendering/smoke/spec09-smoke.mjs` | XPanel | 1/2 |
| `.discipline/rendering/smoke/ux-harness.mjs` | UX_VIEWPORTS | 1/4 |
| `.discipline/rendering/ux-assert.mjs` | TARGET_SELECTOR | 1/11 |
| `scripts/gen/fetch-desnz-factors.mjs` | AIR_ENERGY_CARRIER, OCEAN_ENERGY_CARRIER, cellNumber | 3/20 |
| `scripts/maintenance/forward-events-retext.mjs` | IDS_ARG_PREFIX | 1/17 |
| `scripts/maintenance/lib/cli.mjs` | parseCliArgs | 1/5 |
| `scripts/mint/lib/screen-verdict.mjs` | MINTABLE_VERDICT | 1/3 |
| `scripts/sources/inaccessible-triage.mjs` | DEFAULT_PER_FETCH_MS | 1/16 |
| `scripts/turns/last-turn-date.mjs` | DEFAULT_MARKER_PATH | 1/4 |
| `scripts/turns/run-source-sweep.mjs` | DEFAULT_SITEMAP_LIMIT | 1/10 |
| `src/lib/auth/route-policy.ts` | PUBLIC_ROUTES, SCANNER_PROBE_PREFIXES | 2/6 |
| `src/lib/connections/derive-tags.mjs` | SCENARIO_GLOSSARY | 1/11 |
| `src/lib/connections/tag-input.mjs` | DEFAULT_CONTEXT_CHARS | 1/5 |
| `src/lib/market/oil-bulletin-workbook.mjs` | resolveCellValue | 1/9 |
| `src/lib/obligations/read-register.mjs` | BINDING_POSITIONS | 1/9 |
| `src/lib/sources/sitemap-walk.mjs` | isBotWallStatus, allProbesBotWalled, extractHttpStatus | 3/27 |
| `src/lib/watchlist/membership.ts` | makeWatchMembershipDeps | 1/6 |

---

## Ranked gaps

1. **[CONFIRMED] The four `scripts/review/apply-*.mjs` ratification scripts are wired to nothing.** No
   workflow, no importer besides each script's own test. `portal_link_candidates` alone carries 1,837
   untouched `candidate` rows against 3 `promoted` (live SQL). This is the `portal_link_candidates` loop
   stage by name, and the code that would clear it exists, is tested, and has never run automatically.
   Fix is mechanical: four `maintenance.yml` steps named exactly as `build-review-digests.mjs`'s own
   `QUEUES[].maintStep` already specifies.
2. **[CONFIRMED] `consume-turn-requests.mjs` — migration 277's ticket queue has no automated drain.**
   1,709 open, 0 consumed, growing since 2026-09-02. Its stated intended caller
   (corpus-turn.yml) does not call it; that workflow uses a separate `--since` timestamp mechanism
   instead. Two mechanisms exist for the same "what changed" question and only one is wired.
3. **[CONFIRMED] `run-ledger-consume.mjs` apply mode is a source-level kill switch, not an operator
   toggle.** CI-dispatched, but `LEDGER_CONSUME_APPLY_ENABLED = false` is compiled in
   (`run-ledger-consume.mjs:95`); every dispatch runs plan-only until a code change flips it. Disclosed
   in-repo (ADR-023) but worth flagging as the reason the ledger-consume stage shows almost no promotion
   despite being "wired."
4. **[CONFIRMED] `assumption_register` (migration 271, live) has 0 rows; its one seeder has never run.**
   `assumption-register-seed.mjs` — zero importers, no workflow, own header: "THIS SESSION NEVER RUNS
   `--apply`." A schema shipped ahead of any data in it.
5. **[CONFIRMED] `scripts/entities/backfill-lineage-edges.mjs` — a documented whole-corpus $0 backfill,
   very likely never run.** Zero importers, no workflow. Its own header states the pre-check
   (2026-08-29) found 0 non-`related` `item_cross_references` rows; live state today is 5 (3 `amends`,
   2 `implements`) — a count consistent with the rare metered `generate-brief.ts` runtime path alone,
   not a corpus-wide backfill (which this repo's own item volume would put in the hundreds or
   thousands if it had actually run).
6. **[PLAUSIBLE] F25 (`module-liveness`)'s scope gap is systemic, not just Gap #1's cause.** F25 covers
   only `src/**` and `scripts/lib/**`; roughly 180 of this window's 252 added modules live under other
   `scripts/**` subdirectories F25 never scans. Nothing mechanically ratchets against a newly-added,
   never-called `scripts/mint`, `scripts/turns`, `scripts/maintenance`, `scripts/review`, or
   `scripts/producers` file the way F25 ratchets `src/`/`scripts/lib/`. This audit's own workflow-grep +
   import-graph cross-reference is the only check that currently exists for that half of the tree.
7. **[CONFIRMED] Spec-09: 9 of 10 producers/tables are DESIGNED-ONLY by the code's own admission, and
   the 7 UI panels that render them are live and empty.** Not a hidden gap (SOURCES.md names the reason
   per table), but worth the operator's attention as a UX fact: `AuxiliaryEnergyPanelView.tsx`,
   `DqiPanelView.tsx`, `EudrCustodyPanelView.tsx`, `GridQueuePanelView.tsx`, `OemRoadmapPanelView.tsx`,
   `ReroutingPanelView.tsx`, `SurchargeAuditPanelView.tsx` are all real, imported, WIRED components
   rendering a 0-row table today.
8. **[CONFIRMED] `held-classes.mjs`, `verification-audit-report.mjs`, `build-oil-bulletin-rows.mjs`,
   `ratify-series-items.mjs` — one-off dossier/CLI tools with no CI or import path.** Lower severity
   than #1–#5 (these read state and report; none is a required loop-drain step), but each is BUILT and
   its only caller is its own test, same shape as the higher-severity items — listed so they are not
   silently re-discovered later.
9. **[CONFIRMED] Nineteen otherwise-wired modules carry at least one dead export** (Appendix B) — mostly
   single unused constants; `route-policy.ts`'s `PUBLIC_ROUTES`/`SCANNER_PROBE_PREFIXES` and
   `sitemap-walk.mjs`'s three bot-wall helpers are used internally but never by an external importer,
   which is a smaller defect (over-exported, not unused) than the rest of the list.
10. **[PLAUSIBLE] `scripts/mint/lib/gate-a-match.mjs` is a compatibility re-export nothing in production
    actually uses.** Every real Gate-A caller (`heal-provenance.mjs`, `gate-a-scan.mjs`,
    `canonical-pipeline.ts`, `gate-a-derived.mjs`) imports `src/lib/agent/gate-a-match.mjs` directly; the
    `scripts/mint/lib/` shim's only importer is a test (`record-facts.npmtest.mjs`). Not urgent — it is 3
    lines and does no harm — but it is not actually load-bearing despite being named in
    `governing-files.mjs`'s `GOVERNING_FILES.mint` list (that listing is a string-literal hash input, not
    proof of an import).

## What could not be confirmed

- **Exact PR number per module.** `git log --diff-filter=A` gives the adding commit and date reliably
  (used throughout, `Built` column), but this repo's PR waves are large multi-commit merges
  (`train/waveNN`, up to ~9 sub-lane commits per PR) and mapping each of the 252 individual commits back
  to its containing PR number would have required an `is-ancestor` walk against all 107 merge commits
  per file; not done for cost reasons. The commit hash + date given for every row is independently
  verifiable (`git show <hash>`) and sufficient to place each module inside the 2026-08-21–09-04 window,
  which is what the audit needs it for.
- **Whether the four `scripts/review/apply-*.mjs` scripts, `screen-worklist.mjs`, or `held-classes.mjs`
  have ever been run by hand outside CI** (a coordinator's local machine, a Codespace, a browser-driven
  session) in a way that left no artifact this read-only audit could see. `screen-worklist.mjs` was
  upgraded from BUILT-NOT-WIRED to WIRED (manual) specifically because it *does* leave an artifact
  (`scripts/harness-runs/screen/*.json`) — the four `apply-*.mjs` scripts and `held-classes.mjs` leave no
  such trail (they write through the DB directly, not to a harness-runs directory), so "never run" is the
  best-supported reading of the evidence (zero importer, zero CI reference, and for `apply-portal-links.mjs`
  specifically, live `portal_link_candidates` state — 1,837 still-`candidate` rows — is consistent with
  "never run" but is not proof of it; a hand-run that only cleared a handful of rows would look similar).
- **Whether `run-population-flywheel.mjs`'s downstream steps (`tag-proposals.mjs`/`tag-ratification.mjs`/
  `derive-obligations.mjs`, all real importers of it per the tables above) have produced live rows at the
  volume their own code implies.** Confirmed wired and CI-dispatched; not independently re-measured
  against live `integrity_flags`/tag columns beyond what B1's module-level scope covers — that
  measurement belongs to whichever audit lane covers the connections/tags loop stage in detail.
- **Full manual verification of all 19 Appendix B dead-export candidates.** The scan is mechanical
  (whole-word occurrence outside the defining file); a small number could be false positives from a
  dynamic access pattern (`obj[name]`) the word-scan would still catch (it tokenizes the whole file text,
  not just static `import` sites, so this risk is low but not zero) — flagged as [PLAUSIBLE] rather than
  [CONFIRMED] for that reason, except the three spot-checked directly in this audit
  (`route-policy.ts`, `sitemap-walk.mjs`'s three exports — read in full and confirmed internal-only).
