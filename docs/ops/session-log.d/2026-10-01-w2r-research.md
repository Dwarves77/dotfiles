# 2026-10-01 - Lane W2-R (RESEARCH-ASSESSMENT-MODEL)

## Accomplished

Operator ruling 2026-10-01 ("Why is research have a design but not a build? Fix this.") overrides
build-plan-2026-09-25's decision 4. Built the Research surface's assessment data machine, producer
first (R14):

- `src/lib/research/assess.mjs` - pure, deterministic, no LLM: technical maturity (TRL 1-11) and
  commercial maturity (CRI 1-6) corridors read from an item's own text; the R1-R4 horizon cascade
  (dated statutory instrument / institutional roadmap / maturity-to-horizon prior); split credibility
  (evidence score from citation count, authority distribution from source tier); the mandatory refusal
  state when nothing on the ladder can fire. 22 unit tests, one fixture per rule plus the refusal state.
- `supabase/migrations/344_research_assessments.sql` - DDL sketch only, not applied (two-track policy).
  `research_assessments` (24 columns, supersede-chained, RLS mirrors `derived_values`) +
  `research_assessments_current` view.
- `scripts/producers/research/research-assessment-producer.mjs` - dry by default, `--apply` gated
  (ENABLED const + `RESEARCH_ASSESSMENT_PRODUCER_ENABLED` env + `--apply`), writes through
  `guardedInsert`/`guardedUpdateByIds`. Harness family `research-assessment` registered
  (`scripts/harness-runs/research-assessment/family.json`); first run artifact
  (`research-assessment-run-001.json`) produced against committed fixtures, zero DB credentials,
  exercising every rule in the ladder. 14 unit tests on the orchestration (narrowing, diffing, dry/apply
  split, the three-gate decision).
- `.github/workflows/research-assessment.yml` - one explicit-dispatch workflow (no schedule, rule 16),
  chained-dry-guard step included for parity with the other producer workflows.
- `src/lib/research/read-assessments.mjs` - pure view-model + absence/refusal wording. 8 unit tests.
- Reader + rendering wired into `/research` (horizon band joins the row's meta line, batched read,
  soft-fails to nothing) and `/research/[slug]` (new "Horizon assessment" rail card: maturity corridors,
  horizon kind/band/rule/confidence, the refusal state, and the planning-assumption-shift absence
  wording).
- `docs/decisions/ADR-038-research-built-now.md`. `docs/specs/03-research.md` "Built 2026-10-01" note
  + section 10 gap-table update for the two closed rows.
- Migration renumbered 336 -> 344 (coordinator-caught collision with lane W2-B) and its self-check
  column count corrected 20 -> 24 (coordinator-caught: CREATE TABLE declares 24, self-check said 20 -
  an apply would have aborted at its own RAISE EXCEPTION). Added
  `344_research_assessments.test.mjs`, a text-parsing proof that the self-check's literal and the
  CREATE TABLE's real column count can never drift apart again; verified red-then-green against the
  file.
- **Planning-assumption shift wired to the real reader** (lane W2-R2 merged, PR 877,
  `planning_assumption_register`, migration 345). `ResearchAssessmentCard` now fetches
  `GET /api/workspace/assumptions` client-side via `authedFetch` (F40's sanctioned path) and narrows to
  the at-risk subset with `isAtRisk` (imported directly from `src/lib/assumptions/contract.mjs`, never
  re-implemented) - that route already calls read.ts's own `readWorkspaceAssumptions` (see
  `logic.ts`'s `listAssumptions`), so the real reader is reached with zero new query logic. The absence
  copy renders only when the resolved list is genuinely empty; a distinct "checking..." state renders
  while the fetch is in flight (DP-2). `formatAssumptionShift` (pure, `read-assessments.mjs`) renders
  name/boundTo/quantified-value/review-date; 4 new unit tests including the coordinator-requested
  fixture for one load-bearing, vulnerable assumption.
  **Named finding, not followed literally:** the coordinator's instruction described wiring via a
  server-side import; this lane used a CLIENT-SIDE fetch instead and is flagging why rather than
  silently picking one. [CONFIRMED by reading the tree]: `loadDetail`'s `loadViewerScoped` hook
  resolves `orgId` via `resolveOrgIdFromCookies`, a Dynamic API that forces the WHOLE route dynamic
  under this app's classical (non-PPR) rendering. Every `[slug]` detail page in this codebase has
  deliberately avoided that hook for exactly this reason (regulations and market each removed their
  own prior usage under PERF-10, 2026-09-04; operations and research never adopted it) - zero live
  call sites remained before this change. Using it here would have been the first reintroduction of a
  regression class closed twice already, for a feature this lane was not asked to perf-tune. The
  client-side fetch reaches the identical real reader (read.ts, via the already-wired route) with zero
  cost to the cached item-scoped render - same posture `RelevanceBadgeClient.tsx` already uses on this
  exact page. Full reasoning in `read-assessments.mjs`'s own header.

## Finding, corrected in place (not worked around, not silently dropped - CLAUDE.md rule 14)

The dispatch named `assumption_register` (migration 271, 0 live rows) as the backing store for spec
section 5's "planning-assumption shift." That table is a DIFFERENT concept - internal modelling
constants (a scorer weight, a confidence cutoff), explicitly documented in its own header as "never a
runtime read path for the code that embodies each constant," with no `item_id`/`workspace_id`/load-
bearing columns. [CONFIRMED - this half stands.] Per CLAUDE.md rule 2, this lane did NOT wire a query
against that table pretending it answers the per-tenant question.

**Correction, mid-session (coordinator, lane W2-R2 cross-dispatch, 2026-10-02):** the real per-tenant
store already exists under a different name, `planning_assumption_register` (migration 345), owned by
lane W2-R2 (`lane/w2r2-assumption-register`), reader at `src/lib/assumptions/read.ts`
(`readAtRiskAssumptions`/`readWorkspaceAssumptions`). Verified live on disk in this session
(`.claude/worktrees/w2r2-assumptions/fsi-app/src/lib/assumptions/{read.ts,row.mjs,contract.mjs}`): a
real org-scoped register with `load_bearing`/`vulnerable`/`bound_to` columns, exactly spec section 5's
shape. This lane's absence-copy string is updated to the coordinator's exact wording ("... (Settings)")
and `ResearchAssessmentCard` carries a named pending-wiring comment; the actual `import` is deferred
until lane W2-R2 merges and this branch rebases (the module does not exist in this worktree yet - adding
the import now would break this branch's own build). ADR-038 corrected in place with the same facts.

## Defects folded in from lane W2-C (coordinator cross-dispatch, 2026-10-02, "fixed, not worked around")

1. **`src/lib/research/taxonomy.mjs`'s `deriveSeverity` never matched the live DB enum.** The prior
   short-circuit compared the stored `severity` column against the literal strings
   "action"/"cost"/"monitor"/"background" - none of which migration 102's real 13-value CHECK
   constraint stores except "background" by coincidence - so every live row with a populated severity
   value fell through to the text/recency heuristic. Fixed with `SEVERITY_COLUMN_TO_KEY`, a documented
   map from all 13 real values (`action_required`, `cost_alert`, `window_closing`, `competitive_edge`,
   `monitoring`, `critical`, `high`, `moderate`, `low`, `immediate`, `watch`, `reference`,
   `background`) to this module's 4-key display band; null/unrecognized still falls through to the
   heuristic (the honest absence case, unchanged). Table test over all 13 plus null in
   `taxonomy.npmtest.mjs`.
2. **`ResearchFindingDetailSurface.tsx` computed `severity` but never rendered it.** Checked
   `docs/specs/03-research.md` section 7 ("Required components") per the coordinator's instruction -
   severity is not named anywhere in that spec; it is a list-row concept only (`ResearchLedger`'s
   `kind` chip, artboard 06). Removed the dead computation (the `deriveSeverity`/`classifySeverity`
   wrapper, the unused `severity` variable, the now-unused `SEVERITY_LABELS` import) rather than
   inventing a masthead render the spec does not ask for.

## Decisions

- Maturity corridor reading is keyword-ladder based on the item's OWN text (never a guessed midpoint);
  R2 (diffusion/cost-curve modeling) and the ARL/MRL axes are named, not modeled - no data path exists
  in this lane's input shape for either.
- `ResearchAssessmentCard` is a rail/section card (ThemeBriefCard's own shape), not a list row - F35's
  `ROW_COMPONENTS` governs title-beside-aside row shapes; this card carries no such shape and is not
  added to that registry (consistent with `ThemeBriefCard` itself, which also carries no
  `data-guard-title`/F35 entry).

## UX compliance

- **`/research` (ResearchLedger rows).** Primary goal: scan findings by urgency band. Path: unchanged  - 
  this lane only appends an optional horizon-band segment to the existing meta line (`type · theme ·
  modes · horizon`), omitted when unassessed. No new interactive element, no new async action.
- **`/research/[slug]` (new "Horizon assessment" rail card).** Primary goal: see the finding's maturity
  and horizon read at a glance. Path: zero steps - the card renders server-fetched data inline in the
  existing rail, no click required. No async action on this card (server-rendered, read-only); the
  honest-absence and refusal states render as plain text with the same typographic treatment as
  `ThemeBriefCard`'s own absence handling, never a blank or a spinner.

## Open items / needs operator attention

- **NEEDS WRITE-SET EXPANSION (none actually hit):** no file outside the declared write set was needed. [NOT-WORK: fact, no action]
- **COORDINATOR ACTION NEEDED - docs/INDEX.md line** (lane-common-contract forbids a lane editing this
  file directly; F51 caught a draft commit that did, reverted in this session). Please add:
  `- [ADR-038-research-built-now](./decisions/ADR-038-research-built-now.md) - operator ruling
  2026-10-01 overrides build-plan-2026-09-25's decision 4 (design-only gate); Research's assessment
  model (maturity triple, horizon R1-R4 ladder, split credibility) is built now via assess.mjs +
  migration 344 (research_assessments) + the research-assessment producer; names the
  assumption_register mismatch (migration 271 is internal modelling constants, not a per-tenant
  planning-assumption store) rather than wiring a query against the wrong table (accepted 2026-10-01)` [CLOSED: PR 889]
- **COORDINATOR ACTION NEEDED - meta-harness pending file** (F28: registering the `research-assessment`
  harness family changed `scripts/harness-runs/research-assessment/family.json`, which is itself one of
  the meta-harness family's own governing files per family-registry.mjs's "the loop applies to itself"
  design). This lane added
  `fsi-app/scripts/harness-runs/meta-harness/pending/2026-10-02-w2r-research.md` naming the change; it
  discharges when a meta-harness run lands, or the coordinator may judge it already covered. [CLOSED: PR 1002]
- Migration 344 is DDL-sketch-only; the coordinator applies it via the Supabase CLI before `--live`
  reads will resolve. The producer's fixture/dry CLI run requires no migration and was run and verified
  (`scripts/harness-runs/research-assessment/research-assessment-run-001.json`). [CLOSED: PR 1013]
- `tsc --noEmit` is clean throughout. `node fsi-app/.discipline/fitness/runner.mjs` final state: 58
  functions checked, 0 violations (every violation found during this session was fixed in the same
  session: F23 staging artifact, F27 composition proof, F39 chunked reads, F51 the INDEX.md edit
  reverted, F28 the meta-harness pending file added). The rendering guard (Playwright) was NOT run in
  this session (no new row component needing F35 registration - `ResearchAssessmentCard` is a rail
  card, `ThemeBriefCard`'s own shape, not a list row). [NOT-WORK: fact, no action]
