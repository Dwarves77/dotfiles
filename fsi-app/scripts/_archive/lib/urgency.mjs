// Shared urgency mapping for intelligence_items inserts from .mjs scripts.
// Mirror of fsi-app/src/lib/urgency.ts; keep both in sync.
// Source: ADR-008 (urgency_score default behavior; status=accepted 2026-05-21
// per Option C-bias strict). F4 fitness function enforces.

// Operator-set priority text → urgency_score numeric.
// Matches intelligence_items.priority CHECK ('CRITICAL', 'HIGH', 'MODERATE', 'LOW').
export const PRIORITY_TO_URGENCY_SCORE = Object.freeze({
  LOW: 3,
  MODERATE: 5,
  HIGH: 7,
  CRITICAL: 9,
});

// Haiku-classified urgency_tier text → urgency_score numeric.
// Matches intelligence_items.urgency_tier CHECK ('watch', 'elevated', 'stable', 'informational').
export const URGENCY_TIER_TO_SCORE = Object.freeze({
  informational: 2,
  stable: 4,
  elevated: 6,
  watch: 8,
});

export function urgencyScoreFromPriority(priority) {
  if (priority && Object.prototype.hasOwnProperty.call(PRIORITY_TO_URGENCY_SCORE, priority)) {
    return PRIORITY_TO_URGENCY_SCORE[priority];
  }
  return PRIORITY_TO_URGENCY_SCORE.MODERATE;
}

export function urgencyScoreFromTier(tier) {
  if (tier && Object.prototype.hasOwnProperty.call(URGENCY_TIER_TO_SCORE, tier)) {
    return URGENCY_TIER_TO_SCORE[tier];
  }
  return URGENCY_TIER_TO_SCORE.stable;
}
