---
id: ADR-008
title: urgency_score default behavior for intelligence_items inserts
status: accepted
date: 2026-05-21
scope:
  - "fsi-app/src/lib/urgency.ts"
  - "fsi-app/scripts/lib/urgency.mjs"
  - "fsi-app/src/app/api/community/posts/[id]/promote/route.ts"
  - "fsi-app/scripts/wave1-cold-start.mjs"
supersedes: null
related: []
---

## Context

F4 fitness function requires every literal-object insert into `intelligence_items` to include `urgency_score`. Two code paths fail F4 with their inserts:

1. `fsi-app/src/app/api/community/posts/[id]/promote/route.ts:358` — community-promoted items insert `priority`, `jurisdictions`, `domain`, but no `urgency_score`. Currently relies on the schema default for the column.

2. `fsi-app/scripts/wave1-cold-start.mjs:457` — cold-start backfill populates `urgency_tier` (text category: watch/elevated/stable/informational) from Haiku classification output but does NOT set `urgency_score` (numeric).

Both currently carry `// fitness-allow: F4 (...; OBS-63)` overrides to allow Sprint Architecture to land cleanly without forcing a product decision.

The question is: what's the canonical urgency_score behavior when not specified by the calling code? Three options surfaced in OBS-63:

- (a) Default to a specific numeric value (e.g., 5 on the 1-10 scale, midpoint)
- (b) Default to NULL with explicit downstream handling (sort/filter must tolerate null)
- (c) Require explicit value, no default, F4 stays strict (forces every insert site to think)

## Decision

**Accepted 2026-05-21 per Option C-bias (strict, no default; derive from existing data).**

The operator selected Option (c) with the refinement that both callers have data they could map to a numeric urgency, so "strict" is operationally easy. Specifically:

- **Caller 1** (`community/posts/[id]/promote/route.ts`): sets `urgency_score: urgencyScoreFromPriority(itemPayload.priority)`. The mapping is defined in `fsi-app/src/lib/urgency.ts` via `PRIORITY_TO_URGENCY_SCORE`:
  - LOW → 3
  - MODERATE → 5
  - HIGH → 7
  - CRITICAL → 9

- **Caller 2** (`scripts/wave1-cold-start.mjs`): sets `urgency_score: urgencyScoreFromTier(cls.urgency_tier)`. The mapping is mirrored in `fsi-app/scripts/lib/urgency.mjs` via `URGENCY_TIER_TO_SCORE`:
  - informational → 2
  - stable → 4
  - elevated → 6
  - watch → 8

- **F4 fitness function**: enforced strict mode through ADR-008's adoption window. The two prior `// fitness-allow: F4` overrides were removed in this commit. F4 was retired on 2026-05-21 (engine slim refactor per ADR-005 postscript B). Future callers should still include `urgency_score` explicitly per this ADR; the discipline is now code-review convention rather than mechanical gate.

- **Shared mapping library**: defined in parallel TS + MJS files (`fsi-app/src/lib/urgency.ts` and `fsi-app/scripts/lib/urgency.mjs`) because the two callers live in different module systems. Both files document each other; keep in sync when extending.

- **Scale chosen**: 1-10 numeric range. No explicit DB CHECK constraint on `urgency_score`; the column is `NUMERIC`. The 1-10 convention is implicit in the consumer surface (`urgencyScore: r.urgency_score` rendered as a numeric badge in `src/lib/supabase-server.ts`). Midpoint-of-quartile mappings keep the scale interpretable: each input category lands at a sensible midrange value.

- **Unknown inputs**: helper functions default to a midrange value (`PRIORITY_TO_URGENCY_SCORE.MODERATE` = 5, `URGENCY_TIER_TO_SCORE.stable` = 4) so the integrity rule (every brief has SOME numeric urgency for ranking) is satisfied even when the input is malformed.

## Consequences (per option)

**Option (a) — numeric default**:
- Pro: simple downstream consumption (sort/filter assume non-null number)
- Con: a default of "5" might mask data-quality issues (everything ranked mid)
- F4 behavior: permit absent field; document that schema default applies

**Option (b) — NULL default**:
- Pro: explicitly signals "no urgency assigned"; honest
- Con: every downstream sort/filter must handle null (more code paths)
- F4 behavior: permit absent field; document that downstream MUST tolerate null

**Option (c) — strict, no default**:
- Pro: forces every insert site to make a deliberate choice
- Con: friction on operational paths (community promotion, cold-start) that may not naturally have urgency information
- F4 behavior: remove existing overrides; require every insert to include urgency_score (potentially with derivation logic, e.g., urgency_tier → numeric mapping)

## Alternatives Considered

The three options above ARE the alternatives. Operator selects.

## References

- F4 fitness function (retired 2026-05-21 per discipline-engine slim refactor; existed at `fsi-app/.discipline/fitness/functions/F4-intelligence-items-urgency-score.mjs` from Sprint Architecture through 2026-05-21)
- Shared urgency mapping (TS): `fsi-app/src/lib/urgency.ts`
- Shared urgency mapping (MJS): `fsi-app/scripts/lib/urgency.mjs`
- OBS-63 (urgency_score deferred product decision; closed 2026-05-21 via this ADR's acceptance)
- environmental-policy-and-innovation skill (urgency-tier vs urgency-score taxonomy)
- Sprint Architecture commit 2494a74 (F4 fitness function + 2 overrides initially landed)
- ADR-008 resolution commit (this commit; closes the loop)

## Related

- [ADR-007-bias-tag-threshold-per-dimension](./ADR-007-bias-tag-threshold-per-dimension.md) — both derive defaults from Haiku classifier output and were retired-to-convention F-functions in the same slim refactor
- [discipline](../inventories/discipline.md) — F4 fitness function (now retired) is tracked in the discipline inventory
- [ADR-005-discipline-enforcement-layered-architecture](./ADR-005-discipline-enforcement-layered-architecture.md) — F4 intelligence-items-urgency-score fitness function was retired in ADR-005's 2026-05-21 slim refactor, which this ADR notes
- [C6-promote-spec](../plans/C6-promote-spec.md) — the community/posts/[id]/promote insert site this ADR fixes is the subject of the promote spec
- [W4-backfill-plan](../plans/W4-backfill-plan.md) — the wave1 cold-start backfill caller that must set urgency_score is a backfill path covered by the backfill plan
