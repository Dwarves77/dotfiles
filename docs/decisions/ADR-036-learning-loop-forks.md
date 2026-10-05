---
id: ADR-036
title: Learning loop forks: $0 question generation, separate inference_records table, ratification-gated reweights
status: accepted
date: 2026-09-29
scope:
  - "docs/plans/learning-loop-design-2026-09-25.md section 6"
  - "fsi-app/src/lib/learning/"
  - "fsi-app/supabase/migrations/338_inference_records.sql"
supersedes: []
related:
  - ADR-024
  - ADR-016
  - "docs/plans/learning-loop-design-2026-09-25.md"
---

> **Decisions 1 and 3 SUPERSEDED 2026-10-05 by [ADR-044](./ADR-044-learning-loop-no-gate.md); decision 2 stands.**

# ADR-036: Learning loop forks

## Context

The learning-loop design (R10, 2026-09-25) names three decision forks it will not pick silently. Wave 2 lane W2-G builds the S and M steps, which need forks 1 and 2 answered. Each answer below follows from a standing rule or an existing ADR; none is a new product judgement, so the coordinator rules them (memory: don't ask what standards answer) and records them here per standing rule 4.

## Decision

1. **Question generation is $0-only.** Template expansion and retrieval against held pools only. Every metered acquisition needs a `trigger_question` row an operator has reviewed and priced (RD-31: operator-priced line; RD-32: no fetch without a cited inventory-miss; decision 6a: no paid research in build mode). Constant: `QUESTION_ACQUISITION = "operator-priced-only"` in `fsi-app/src/lib/learning/constants.mjs`, beside ADR-024's `FLOOR` pattern.
2. **`inference_records` is a separate table**, not a state on `derived_values`. ADR-024 designed `derived_values` for numeric values with `admissibleFor()` floors; a narrative claim with `status_token`, `cited_item_ids[]` (never empty), `origin_class in (derived, modelled)` and a `supersedes` chain is a new shape. It joins the existing `derivation_edges` DAG so invalidation reaches it. Migration 338.
3. **Reliability reweights are ratification-gated.** The `source_reliability_ledger` (L step) never writes `source-credibility-model` tiers; it proposes a reweight the operator ratifies (the L4 pattern in recursive-compounding-discovery-2026-08-10.md). Unchanged from the design's own lean; now binding.

## Consequences

- W2-G ships S (trigger_question generator inside `run-population-flywheel.mjs`, answer-seeking through `seek-more.mjs` + `spend-client.ts`) and M (`inference_records` + drain method `infer-from-question`); the prediction object waits on `signposts` (not live 2026-09-29; migration 339 reserved) and L waits on M landing.
- Rule 17 holds: no new scheduler, no standalone runner; every step rides the flywheel or the drain.
- R14 holds: every step dry by default, `--apply` gated, `harness_runs` row read back.
