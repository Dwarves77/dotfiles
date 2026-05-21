// Shared urgency mapping for intelligence_items inserts.
// Source: ADR-008 (urgency_score default behavior; status=accepted 2026-05-21
// per Option C-bias strict). Inserts MUST set urgency_score explicitly; F4
// fitness function enforces. Derived values use the mappings below.
//
// Companion file at fsi-app/scripts/lib/urgency.mjs mirrors these mappings
// for the .mjs module system. Keep both in sync; ADR-008 documents the
// mapping rationale.
//
// urgency_score numeric range: 1-10 (no DB CHECK constraint; client renders
// as numeric badge). Midpoint-of-quartile mappings keep the scale
// interpretable: each input category lands at a sensible midrange value.

// Priority text values match the intelligence_items.priority CHECK constraint
// (migrations: CHECK (priority IN ('CRITICAL', 'HIGH', 'MODERATE', 'LOW'))).
export type IntelligenceItemPriority = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

// Urgency tier text values match the intelligence_items.urgency_tier CHECK constraint
// (migration 018: CHECK (urgency_tier IN ('watch', 'elevated', 'stable', 'informational'))).
export type UrgencyTierLabel = "watch" | "elevated" | "stable" | "informational";

// Operator-set priority text → urgency_score numeric. Used by routes that
// receive an admin/operator priority label and need to persist a numeric
// urgency for downstream sort/filter.
export const PRIORITY_TO_URGENCY_SCORE: Record<IntelligenceItemPriority, number> = {
  LOW: 3,
  MODERATE: 5,
  HIGH: 7,
  CRITICAL: 9,
};

// Haiku-classified urgency_tier text → urgency_score numeric. Used by
// cold-start and any other pipeline that emits the tier category and needs
// to persist the numeric urgency alongside.
export const URGENCY_TIER_TO_SCORE: Record<UrgencyTierLabel, number> = {
  informational: 2,
  stable: 4,
  elevated: 6,
  watch: 8,
};

// Resolve an urgency_score from a priority label. Returns 5 (MODERATE default)
// for unknown values; logs caller's intent in a defensive shape so the
// integrity rule (every brief has SOME numeric urgency for ranking) is
// satisfied even when the input is malformed.
export function urgencyScoreFromPriority(priority: string | null | undefined): number {
  if (priority && priority in PRIORITY_TO_URGENCY_SCORE) {
    return PRIORITY_TO_URGENCY_SCORE[priority as IntelligenceItemPriority];
  }
  return PRIORITY_TO_URGENCY_SCORE.MODERATE;
}

// Resolve an urgency_score from a urgency_tier label. Returns 4 (stable default)
// for unknown values; same defensive shape as above.
export function urgencyScoreFromTier(tier: string | null | undefined): number {
  if (tier && tier in URGENCY_TIER_TO_SCORE) {
    return URGENCY_TIER_TO_SCORE[tier as UrgencyTierLabel];
  }
  return URGENCY_TIER_TO_SCORE.stable;
}
