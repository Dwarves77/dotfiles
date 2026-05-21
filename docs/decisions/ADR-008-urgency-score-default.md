---
id: ADR-008
title: urgency_score default behavior for intelligence_items inserts
status: proposed
date: 2026-05-20
scope:
  - "fsi-app/src/app/api/community/posts/[id]/promote/route.ts"
  - "fsi-app/scripts/wave1-cold-start.mjs"
  - "fsi-app/supabase/migrations/"
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

PROPOSED — awaiting operator decision.

Once operator decides, ADR-008 transitions to status=accepted; the chosen option is codified; F4 either tightens (option c: removes overrides; requires every insert site to set urgency_score) OR accommodates (options a/b: documents the default; F4 may permit absent field when schema default is present).

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

- F4 fitness function: `fsi-app/.discipline/fitness/functions/F4-intelligence-items-urgency-score.mjs`
- OBS-63 (urgency_score deferred product decision)
- environmental-policy-and-innovation skill (urgency-tier vs urgency-score taxonomy)
- Sprint Architecture commit 2494a74 (F4 fitness function + 2 overrides landed)
