---
id: ADR-002
title: Tier model (base_tier + effective_tier)
status: accepted
date: 2026-05-20
scope:
  - "fsi-app/src/lib/trust.ts"
  - "fsi-app/src/lib/supabase-server.ts"
  - "fsi-app/src/lib/sources/"
  - "fsi-app/src/lib/agent/source-pool.ts"
  - "fsi-app/src/types/source.ts"
  - "fsi-app/src/stores/sourceStore.ts"
  - "fsi-app/supabase/migrations/"
supersedes: null
related:
  - ADR-003
---

## Context

Sources have a tier classification (T1 binding regulator through T7 other). Q2 architectural decisions surfaced that "tier" served two distinct semantics: a structural classification (provenance, set at registration time) and a dynamic credibility signal (Q7-recomputed via citation network, recency decay, override semantics). Conflating them produced subtle bugs: classifier prompts wanted the structural value, customer-facing displays wanted the dynamic one, scoring loops oscillated when the dynamic value fed back into the criteria that produced it.

## Decision

Split into two columns on `sources` table:

- `base_tier` (NOT NULL, 1-7): structural classification set by operator at source registration. Stable; never changes except via explicit operator override.
- `effective_tier` (1-7, nullable initial): dynamic credibility signal. Q7 daily batch recomputes from citation network + recency decay; on Day 1 equals `base_tier`.

Default rule for consumer migration:

- Customer-facing surfaces → `effective_tier` with `?? base_tier` fallback (the dynamic credibility signal; falls back to structural if effective hasn't been recomputed)
- Admin / audit surfaces → `base_tier` (the canonical operator decision; doesn't shift under their feet)
- Scoring internals (promotion/demotion criteria, source pool weights) → `base_tier` (avoid feedback loops where the criteria depend on what they produce)

Deprecated: standalone `tier` column. Renamed to `base_tier` in migration 090.

## Consequences

- Phase 1.5 migrated ~32 consumer sites across the codebase, applying the default rule per file.
- F1 fitness function (Sprint Architecture) mechanically enforced the migration through the consumer-migration window; retired on 2026-05-21 after Phase 1.5 completion (no standalone `tier` selects remained; future regression risk judged low given the column rename to `base_tier`).
- Trust.ts promotion/demotion criteria deliberately use `base_tier` (not `effective_tier`) per operator-confirmed feedback-loop reasoning.
- The audit log payload preserves `tier: body.tier` (or `body.assignedTier ?? body.tier`) as a payload field, not a column reference; the distinction is documented in the routes.

## Alternatives Considered

- **Single column with dynamic semantics**: rejected. Classifier prompts and admin tools needed the structural value; oscillating their input made them unpredictable.
- **Single column with static semantics + separate credibility_score**: rejected. Customer-facing surfaces wanted ONE number to display per source, not two; the static-vs-dynamic decision had to be at the column, not the rendering layer.
- **Split chosen (base_tier + effective_tier)**: makes the structural-vs-dynamic distinction explicit at the schema layer; every consumer makes an explicit choice; F1 enforces.

## References

- source-credibility-model skill Section 3 (Tier semantics)
- migration 090 (Q2 tier schema split)
- Phase 1.5 consumer migration list: `docs/sprint-2/Phase-1.5-consumer-migration-list.md`
- Phase 1.5 closure commit: 9a95afb
- F1 fitness function (retired 2026-05-21 per discipline-engine slim refactor; existed at `fsi-app/.discipline/fitness/functions/F1-sources-tier-columns.mjs` from Sprint Architecture through 2026-05-21)
