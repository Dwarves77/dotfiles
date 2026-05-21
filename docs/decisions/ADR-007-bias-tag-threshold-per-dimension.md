---
id: ADR-007
title: Bias-tag auto-cutoff threshold per dimension (D1 decision)
status: accepted
date: 2026-05-20
scope:
  - "fsi-app/scripts/q4-bias-batch-assign.mjs"
  - "fsi-app/src/app/api/admin/canonical-sources/recommend-classification/route.ts"
  - "fsi-app/src/app/api/admin/sources/recommend-classification/route.ts"
  - "fsi-app/supabase/migrations/097_q4_bias_retune_option_b.sql"
  - "fsi-app/supabase/migrations/092_source_bias_tags.sql"
supersedes: null
related: []
---

## Context

Q4 introduced source_bias_tags with 3 dimensions (funding, methodology, stakeholder) and 22 tags total. A Haiku-based hybrid classifier produces a confidence score per tag. The initial uniform threshold of 0.80 (auto-assign at >=0.80; queue for operator review below) was tuned with sample-scale validation (20 sources); at full-batch scale (798 sources), the methodology dimension over-flagged (~84% queued vs ~26% for funding), pushing the review queue past the 150-source HALT threshold.

The methodology dimension required more sophisticated context evaluation (was the study peer-reviewed, what methodology was used, etc.). The funding and stakeholder dimensions were generally resolvable from institutional context (was the source funded by an industry group, what stakeholder ecosystem produced it). The uniform threshold mixed these dimensions inappropriately.

## Decision

Per-dimension auto-cutoff thresholds (Option B from D1 retune):

- funding: 0.75 (lowered from 0.80)
- methodology: 0.80 (held; genuine judgment cases routed to operator)
- stakeholder: 0.75 (lowered from 0.80)

Implementation: `HIGH_CONFIDENCE_THRESHOLDS` constant in `fsi-app/scripts/q4-bias-batch-assign.mjs`; `autoThresholdFor()` helper resolves per-dimension; migration 097 promoted existing tags meeting the new thresholds (138 rows promoted from operator-review to auto-assigned).

## Consequences

- Review queue dropped from 249 sources (initial) to 225 (post-promote); methodology still drives most queue entries (this is correct per the architectural intent).
- Per-dimension thresholds become operator-tunable independently. Future re-tunes (Option C, D, etc.) update the constant.
- Bias-tag inference quality is now dimension-aware; aggregating bias scores across dimensions (for downstream credibility scoring) must respect dimension semantics.

## Alternatives Considered

- **Hold uniform 0.80**: rejected. Review queue too large; methodology over-represented.
- **Lower uniform to 0.75**: rejected. Methodology would auto-assign too many genuinely-judgment-required cases; operator-trust in the classifier would erode.
- **Per-dimension thresholds (chosen)**: matches the architectural reality that the dimensions have different signal-extraction difficulty.

## References

- source-credibility-model skill Section 4 (bias-tag vocabulary)
- migration 097 (Q4 bias retune Option B)
- D1 Option B retune commit: 598d99b
- OBS-Q4 (in sprint-2 followups; HALT triggered)
