---
id: ADR-038
title: Research is built now; the data machine (producer + assessment model) is the deliverable, ahead of the four-question design structure
status: accepted
date: 2026-10-01
scope: docs/specs/03-research.md's assessment model; src/lib/research/assess.mjs; scripts/producers/research/research-assessment-producer.mjs; migration 344 (research_assessments); the Research surface's rendering of a maturity triple, horizon band and the planning-assumption-shift absence state
supersedes: build-plan-2026-09-25.md's decision 4 ("Research model design: DESIGN now, BUILD after the four-question structure (section 4 sequence) lands. Do not build ahead of this gate.") and the corresponding workstream 13 row ("DESIGN ONLY - a lane that starts building before the four-question structure lands has skipped decision 4's gate; stop.")
related: docs/specs/03-research.md (the design this builds against), docs/doctrine research-is-horizon-scan, docs/plans/build-8-research-surface.md, ADR-023 (producer execution model), CLAUDE.md rules 1, 2, 13-17, 19, 20
---

# ADR-038 - Research is built now

## Context

Decision 4 of the 2026-09-25 build plan held Research to DESIGN ONLY until a four-question structure
(section 4 sequence of that plan) landed. The plan's own workstream 13 row stated it plainly: "a lane
that starts building before the four-question structure lands has skipped decision 4's gate; stop."

Operator ruling, 2026-10-01, verbatim: "Why is research have a design but not a build? Fix this." This
overrides decision 4 directly. Research's design (docs/specs/03-research.md) had sat drafted since
2026-08-12 with its own gap table (section 10) naming every required component as Absent - a maturity
triple, a horizon band and trigger, split credibility, the planning-assumption shift - while every other
surface moved ahead. The operator's ruling removes the build-after-design gate for this surface
specifically; it does not reopen or relitigate the four-question structure itself, which may still land
on its own schedule for whatever it was meant to decide beyond what this ADR covers.

## Decision

Research is built now, data machine first (R14: the producer that computes an assessment is the core
deliverable; the surface renders what it produces, never the reverse). Lane W2-R
(RESEARCH-ASSESSMENT-MODEL) delivers:

1. **`src/lib/research/assess.mjs`** - a pure, deterministic function from an item's own existing data
   (its recorded text, its forward events, its source tier, its citation count) to docs/specs/03-research.md's
   assessment shape: a two-axis maturity read (technical TRL 1-11, commercial CRI 1-6; the adoption-barrier
   and MRL axes are NOT modeled - no data path exists for the 17-dimension ARL risk vector or supply-
   constraint signals, and this module never fabricates one where none exists), a horizon read via the
   spec's own R1-R4 cascade (dated statutory instrument, diffusion/cost-curve model [not modeled - no
   market_series time series is wired into this input shape], named institutional roadmap, maturity-to-
   horizon prior), and a split credibility read (evidence score from citation count, authority score as a
   degenerate one-source distribution from source tier). No LLM call, anywhere in this module or its
   caller.
2. **Migration 344 (`research_assessments`)** - one current row per item, `supersedes`-chained for
   append-only history (spec section 7 row 11), RLS mirroring `derived_values` (migration 285): raw table
   denied, `research_assessments_current` view granted.
3. **`scripts/producers/research/research-assessment-producer.mjs`** - dry by default, `--apply` gated
   behind the same three-gate ADR-023 shape (reviewed-code `ENABLED`, a runtime kill switch, the CLI
   flag), writing through `guardedInsert`/`guardedUpdateByIds`. Registered as the `research-assessment`
   harness family (`scripts/harness-runs/research-assessment/family.json`); its first run artifact
   (`research-assessment-run-001.json`) was produced against committed fixtures, no DB credential of any
   kind, proving the full R1/R3/R4 ladder and the mandatory refusal state end to end.
4. **Reader + rendering** - `src/lib/research/read-assessments.mjs` (pure view-model, absence/refusal
   wording) wired into `/research` (horizon band joins the row's meta line) and `/research/[slug]`
   (a new "Horizon assessment" rail card: maturity corridors, horizon kind/band/rule/confidence, the
   mandatory refusal state when the ladder cannot produce a band, and the planning-assumption-shift
   section's absence wording).

## What this ADR does NOT decide

- It does not model the adoption-barrier (DOE ARL) or MRL axes spec section 2 names - no data source for
  either exists in this lane's input shape. A future lane with a real 17-dimension risk input, or a
  supply-constraint signal, extends `assess.mjs`'s ladder without touching this ADR's decision.
- It does not implement the R2 horizon rule (diffusion/cost-curve crossover modeling) - this requires a
  `market_series` time-series join this producer's input shape does not carry. Named in `assess.mjs`'s
  own header as a documented, never-fires-today branch.
- It does not wire a per-tenant planning-assumption register, pending a cross-dispatch merge.
  **Finding [CONFIRMED, then CORRECTED IN PLACE per CLAUDE.md rule 14 - not silently dropped]:** the
  dispatch that authorized this build named `assumption_register` (0 live rows) as the backing store
  for spec section 5's "planning-assumption shift." That table (migration 271) is a DIFFERENT concept
  - a registry of internal MODELLING CONSTANTS this product chose (a scorer weight, a confidence
  cutoff), explicitly documented in its own migration header as "distinct from `emission_factors`...
  never a runtime read path for the code that embodies each constant." It carries no `item_id`, no
  `workspace_id`, no load-bearing/vulnerable columns - this half of the finding stands, re-verified.
  **Correction (coordinator, lane W2-R2 cross-dispatch, 2026-10-02):** the real per-tenant store
  already exists under a DIFFERENT name - `planning_assumption_register` (migration 345), owned by
  lane W2-R2 (branch `lane/w2r2-assumption-register`), exposed as `readAtRiskAssumptions`/
  `readWorkspaceAssumptions` in `src/lib/assumptions/read.ts`. This ADR's original closing line ("a
  future ADR should name that store explicitly") is superseded by that lane's own existence; no new
  ADR is needed for the store itself. This lane (W2-R) consumes that reader by import once lane W2-R2
  merges and this branch rebases onto it - not yet done at authoring time (the module does not exist
  in this worktree) - so the rendered surface shows the absence state unconditionally
  ("needs a planning assumption registered for this workspace (Settings)") until that rebase lands.
  See `ResearchAssessmentCard` in `ResearchFindingDetailSurface.tsx` for the exact pending wiring.
- It does not touch the four-question structure itself (build-plan-2026-09-25.md section 4 sequence,
  workstream 13's design-only scope). That structure may still land for whatever else it was meant to
  decide; this ADR's override is scoped to "build now" for the assessment model specifically, per the
  operator's own framing of the ruling.

## Consequences

- `docs/specs/03-research.md`'s section 10 gap table changes for two rows ("Maturity triple", "Horizon
  band and trigger") from Absent to Built, cited to this ADR and the files above (see that spec's own
  "Built 2026-10-01" note).
- The surface now has a real, if partial, data machine: an item with no classifiable maturity or dated
  signal correctly reports the mandatory refusal state rather than a silently absent axis.
- Workstream 13's own row in build-plan-2026-09-25.md is superseded for Research specifically; the plan
  file itself is not rewritten by this ADR (CLAUDE.md rule 10: the plan is dated point-in-time content;
  this ADR is the record of the ruling that overrides it).
