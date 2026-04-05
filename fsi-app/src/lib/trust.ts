// ══════════════════════════════════════════════════════════════
// Source Trust Scoring Engine
// ══════════════════════════════════════════════════════════════
//
// Computes trust scores from metrics and evaluates sources
// against promotion/demotion criteria.
//
// Trust is earned through verified accuracy over time.
// Citation count gets a source noticed. Accuracy gets it promoted.
// ══════════════════════════════════════════════════════════════

import type {
  TrustMetrics,
  TrustScore,
  SourceTier,
  SourceConflict,
  Source,
  ProvisionalSource,
  PromotionCriteria,
  DemotionTrigger,
} from "@/types/source";

import { PROMOTION_CRITERIA, DEMOTION_TRIGGERS } from "@/types/source";

// ── Trust Score Computation ──
// Weights:
//   Accuracy:    40% — being right is the most important thing
//   Timeliness:  20% — reporting early AND accurately is valuable
//   Reliability: 20% — being consistently accessible matters
//   Citation:    20% — being recognized by credible sources matters

export function computeTrustScore(metrics: TrustMetrics): TrustScore {
  const accuracy = computeAccuracyComponent(metrics);
  const timeliness = computeTimelinessComponent(metrics);
  const reliability = computeReliabilityComponent(metrics);
  const citation = computeCitationComponent(metrics);

  return {
    overall: Math.round(accuracy + timeliness + reliability + citation),
    accuracy_component: Math.round(accuracy * 10) / 10,
    timeliness_component: Math.round(timeliness * 10) / 10,
    reliability_component: Math.round(reliability * 10) / 10,
    citation_component: Math.round(citation * 10) / 10,
    computed_at: new Date().toISOString(),
  };
}

// ── Accuracy Component (0-40) ──
// Based on confirmation rate and conflict rate.
// A source with zero conflicts and many confirmations scores highest.
// A source with no data scores neutral (20/40).

function computeAccuracyComponent(metrics: TrustMetrics): number {
  const MAX = 40;

  // Not enough data — return neutral
  if (metrics.confirmation_count + metrics.conflict_count < 1) {
    return MAX * 0.5;
  }

  // Accuracy rate: confirmations / (confirmations + conflicts lost)
  // Already stored in metrics.accuracy_rate but we recompute for safety
  const total = metrics.confirmation_count + metrics.conflict_count;
  const rate = total > 0 ? metrics.confirmation_count / total : 0.5;

  // Scale: 0% accuracy = 0, 50% = 20, 100% = 40
  // But penalize heavily below 50% — a source that's wrong more
  // than it's right is worse than one with no data at all
  if (rate < 0.5) {
    return MAX * rate; // Linear 0-20 for bad accuracy
  }

  // Above 50%, scale with diminishing returns
  // 50% = 20, 75% = 30, 90% = 36, 100% = 40
  const aboveHalf = (rate - 0.5) * 2; // Normalize 0.5-1.0 to 0-1
  return MAX * 0.5 + MAX * 0.5 * Math.sqrt(aboveHalf);
}

// ── Timeliness Component (0-20) ──
// Based on how far ahead of T1 confirmation this source reports.
// Positive lead time = reports early = more valuable.
// Zero or negative = reports same time or after T1 = still useful but less so.

function computeTimelinessComponent(metrics: TrustMetrics): number {
  const MAX = 20;

  // Not enough data — return neutral
  if (metrics.lead_time_samples < 2) {
    return MAX * 0.5;
  }

  const lead = metrics.avg_lead_time_days;

  // Negative lead time (reports after T1): penalize but not to zero
  // A source that reports 30 days late still has some value
  if (lead < 0) {
    return MAX * Math.max(0.1, 0.5 + lead / 60); // Floor at 10%
  }

  // Zero lead time: neutral
  if (lead === 0) {
    return MAX * 0.5;
  }

  // Positive lead time: reward with diminishing returns
  // 1 day early = 12, 7 days = 16, 30 days = 18, 90+ days = 20
  const normalized = Math.min(1, lead / 90);
  return MAX * 0.5 + MAX * 0.5 * Math.sqrt(normalized);
}

// ── Reliability Component (0-20) ──
// Based on accessibility rate and consistency.

function computeReliabilityComponent(metrics: TrustMetrics): number {
  const MAX = 20;

  // Not enough data
  if (metrics.total_checks < 3) {
    return MAX * 0.5;
  }

  const rate = metrics.accessibility_rate;

  // Below 50% accessible: severely penalized
  if (rate < 0.5) {
    return MAX * rate; // 0-10
  }

  // 50-100%: scale with emphasis on high reliability
  // 50% = 10, 80% = 14, 95% = 18, 100% = 20
  const aboveHalf = (rate - 0.5) * 2;
  return MAX * 0.5 + MAX * 0.5 * Math.pow(aboveHalf, 0.7);
}

// ── Citation Component (0-20) ──
// Based on how many independent T1-T3 sources cite this one.
// Self-citations are excluded. Citation from higher tiers
// counts more than from lower tiers.

function computeCitationComponent(metrics: TrustMetrics): number {
  const MAX = 20;

  // No citations at all
  if (metrics.independent_citers === 0) {
    return 0;
  }

  // Weight by highest citing tier
  // T1 citation = 1.0x, T2 = 0.8x, T3 = 0.6x, T4+ = 0.4x
  const tierMultiplier = metrics.highest_citing_tier
    ? { 1: 1.0, 2: 0.85, 3: 0.7, 4: 0.5, 5: 0.4, 6: 0.3, 7: 0.2 }[metrics.highest_citing_tier] ?? 0.2
    : 0.2;

  // Scale: 1 citer = 6, 3 citers = 12, 5 citers = 16, 10+ = 20
  const citerScore = Math.min(1, metrics.independent_citers / 10);
  const base = MAX * Math.sqrt(citerScore);

  return base * tierMultiplier;
}

// ═════════════════════════════════════════════════════════���════
// Promotion / Demotion Evaluation
// ══════════════════════════════════════════════════════════════

export interface PromotionEvaluation {
  eligible: boolean;
  target_tier: SourceTier;
  criteria: PromotionCriteria;
  met: Record<string, boolean>;    // Which criteria are met
  blocking: string[];              // Which criteria are NOT met (human-readable)
}

export interface DemotionEvaluation {
  triggered: boolean;
  triggers_fired: {
    trigger: DemotionTrigger;
    current_value: string;         // What the actual value is
  }[];
  recommended_tier: SourceTier;
}

// Evaluate whether a source is eligible for promotion

export function evaluatePromotion(source: Source): PromotionEvaluation | null {
  // T1 sources cannot be promoted further
  if (source.tier === 1) return null;

  // Find the criteria for promoting from this tier
  const criteria = PROMOTION_CRITERIA.find(
    (c) => c.from_tier === source.tier
  );
  if (!criteria) return null;

  const m = source.trust_metrics;
  const s = source.trust_score;
  const ageDays = Math.floor(
    (Date.now() - new Date(source.created_at).getTime()) / 86400000
  );

  const met: Record<string, boolean> = {
    trust_score: s.overall >= criteria.min_trust_score,
    confirmation_count: m.confirmation_count >= criteria.min_confirmation_count,
    conflict_rate:
      m.conflict_total === 0
        ? true
        : m.conflict_count / m.conflict_total <= criteria.max_conflict_rate,
    independent_citers: m.independent_citers >= criteria.min_independent_citers,
    accessibility_rate: m.accessibility_rate >= criteria.min_accessibility_rate,
    age_days: ageDays >= criteria.min_age_days,
    lead_time_samples: m.lead_time_samples >= criteria.min_lead_time_samples,
  };

  const blocking = Object.entries(met)
    .filter(([, v]) => !v)
    .map(([k]) => {
      switch (k) {
        case "trust_score": return `Trust score ${s.overall} < required ${criteria.min_trust_score}`;
        case "confirmation_count": return `Confirmations ${m.confirmation_count} < required ${criteria.min_confirmation_count}`;
        case "conflict_rate": return `Conflict rate ${m.conflict_total > 0 ? ((m.conflict_count / m.conflict_total) * 100).toFixed(1) : 0}% > max ${criteria.max_conflict_rate * 100}%`;
        case "independent_citers": return `Independent citers ${m.independent_citers} < required ${criteria.min_independent_citers}`;
        case "accessibility_rate": return `Accessibility ${(m.accessibility_rate * 100).toFixed(1)}% < required ${criteria.min_accessibility_rate * 100}%`;
        case "age_days": return `Age ${ageDays} days < required ${criteria.min_age_days} days`;
        case "lead_time_samples": return `Lead time samples ${m.lead_time_samples} < required ${criteria.min_lead_time_samples}`;
        default: return k;
      }
    });

  return {
    eligible: blocking.length === 0,
    target_tier: criteria.to_tier,
    criteria,
    met,
    blocking,
  };
}

// Evaluate whether a source should be demoted

export function evaluateDemotion(source: Source): DemotionEvaluation {
  const m = source.trust_metrics;
  const triggers_fired: DemotionEvaluation["triggers_fired"] = [];

  for (const trigger of DEMOTION_TRIGGERS) {
    // Only check triggers that apply to this tier
    if (!trigger.tiers_affected.includes(source.tier)) continue;

    let fired = false;
    let currentValue = "";

    switch (trigger.trigger) {
      case "high_conflict_rate":
        if (m.conflict_total >= 3 && m.conflict_count / m.conflict_total > 0.3) {
          fired = true;
          currentValue = `${((m.conflict_count / m.conflict_total) * 100).toFixed(1)}% conflict rate (${m.conflict_count}/${m.conflict_total})`;
        }
        break;

      case "critical_conflict":
        // This requires checking conflict records — handled at the conflict resolution level
        // Here we check if the conflict_count against T1 sources is > 0
        // (Would need conflict detail data passed in for full check)
        break;

      case "extended_inaccessibility":
        if (m.last_accessible) {
          const daysSince = Math.floor(
            (Date.now() - new Date(m.last_accessible).getTime()) / 86400000
          );
          if (daysSince > 30) {
            fired = true;
            currentValue = `${daysSince} days since last accessible`;
          }
        }
        break;

      case "chronic_inaccessibility":
        if (m.total_checks >= 10 && m.accessibility_rate < 0.5) {
          fired = true;
          currentValue = `${(m.accessibility_rate * 100).toFixed(1)}% accessibility over ${m.total_checks} checks`;
        }
        break;

      case "paywall_introduced":
        // This is event-driven, not metric-driven — checked when paywall_change event occurs
        break;

      case "no_substantive_update":
        if (source.last_substantive_change) {
          const daysSince = Math.floor(
            (Date.now() - new Date(source.last_substantive_change).getTime()) / 86400000
          );
          const expectedDays = frequencyToDays(source.update_frequency);
          if (expectedDays > 0 && daysSince > expectedDays * 3) {
            fired = true;
            currentValue = `${daysSince} days since update (expected every ${expectedDays} days)`;
          }
        }
        break;

      case "self_citation_only":
        if (m.independent_citers === 0 && m.self_citation_count > 0) {
          const ageDays = Math.floor(
            (Date.now() - new Date(source.created_at).getTime()) / 86400000
          );
          if (ageDays > 90) {
            fired = true;
            currentValue = `${m.self_citation_count} self-citations, 0 independent citers, ${ageDays} days old`;
          }
        }
        break;
    }

    if (fired) {
      triggers_fired.push({ trigger, current_value: currentValue });
    }
  }

  // Recommended tier: one step down from current
  const recommendedTier = Math.min(7, source.tier + 1) as SourceTier;

  return {
    triggered: triggers_fired.length > 0,
    triggers_fired,
    recommended_tier: triggers_fired.length > 0 ? recommendedTier : source.tier,
  };
}

// ══════════════════════════════════════════════════════════════
// Provisional Source Evaluation
// ══════════════════════════════════════════════════════════════

export interface ProvisionalEvaluation {
  ready_for_review: boolean;
  recommended_action: "confirm" | "reject" | "needs_more_data";
  recommended_tier: SourceTier;
  reasons: string[];
}

export function evaluateProvisionalSource(
  ps: ProvisionalSource
): ProvisionalEvaluation {
  const reasons: string[] = [];
  let recommended_tier: SourceTier = 7;
  let ready = false;

  // Basic checks
  if (!ps.accessibility_verified) {
    reasons.push("URL has not been verified as accessible");
    return { ready_for_review: false, recommended_action: "needs_more_data", recommended_tier: 7, reasons };
  }

  if (!ps.entity_identified) {
    reasons.push("Publishing entity has not been identified");
    return { ready_for_review: false, recommended_action: "needs_more_data", recommended_tier: 7, reasons };
  }

  // Citation analysis
  if (ps.independent_citers >= 3 && ps.highest_citing_tier <= 2) {
    recommended_tier = 5;
    reasons.push(`Cited by ${ps.independent_citers} independent sources, highest citer is T${ps.highest_citing_tier}`);
    ready = true;
  } else if (ps.independent_citers >= 2 && ps.highest_citing_tier <= 3) {
    recommended_tier = 6;
    reasons.push(`Cited by ${ps.independent_citers} independent sources, highest citer is T${ps.highest_citing_tier}`);
    ready = true;
  } else if (ps.independent_citers >= 1) {
    recommended_tier = 6;
    reasons.push(`Cited by ${ps.independent_citers} source(s), sufficient for T6 entry`);
    ready = true;
  } else {
    reasons.push("No independent citations yet — needs more data");
  }

  // Content quality
  if (ps.publishes_structured_content) {
    reasons.push("Publishes structured, parseable content");
  } else {
    reasons.push("Content is not structured — will require manual extraction");
    if (recommended_tier < 6) recommended_tier = 6 as SourceTier;
  }

  // Rejection signals
  if (ps.citation_count > 0 && ps.independent_citers === 0) {
    // All citations are from the same source — suspicious
    reasons.push("All citations come from a single source — possible echo chamber");
    return { ready_for_review: true, recommended_action: "reject", recommended_tier: 7, reasons };
  }

  return {
    ready_for_review: ready,
    recommended_action: ready ? "confirm" : "needs_more_data",
    recommended_tier,
    reasons,
  };
}

// ══════════════════════════════════════════════════════════════
// Conflict Resolution Impact
// ══════════════════════════════════════════════════════════════

// When a conflict is resolved, update trust metrics for both sources

export interface ConflictResolutionImpact {
  winner_source_id: string | null;
  loser_source_id: string | null;
  winner_metrics_delta: Partial<TrustMetrics>;
  loser_metrics_delta: Partial<TrustMetrics>;
}

export function computeConflictResolutionImpact(
  conflict: SourceConflict
): ConflictResolutionImpact {
  switch (conflict.resolution) {
    case "source_a_correct":
      return {
        winner_source_id: conflict.source_a_id,
        loser_source_id: conflict.source_b_id,
        winner_metrics_delta: { confirmation_count: 1 },
        loser_metrics_delta: { conflict_count: 1 },
      };

    case "source_b_correct":
      return {
        winner_source_id: conflict.source_b_id,
        loser_source_id: conflict.source_a_id,
        winner_metrics_delta: { confirmation_count: 1 },
        loser_metrics_delta: { conflict_count: 1 },
      };

    case "both_partially_correct":
      // Neither wins, neither loses — but we note the conflict happened
      return {
        winner_source_id: null,
        loser_source_id: null,
        winner_metrics_delta: {},
        loser_metrics_delta: {},
      };

    case "inconclusive":
    case "superseded":
      // No trust impact — the conflict was mooted
      return {
        winner_source_id: null,
        loser_source_id: null,
        winner_metrics_delta: {},
        loser_metrics_delta: {},
      };

    default:
      return {
        winner_source_id: null,
        loser_source_id: null,
        winner_metrics_delta: {},
        loser_metrics_delta: {},
      };
  }
}

// ══════════════════════════════════════════════════════════════
// Utility: Default Trust Metrics
// ══════════════════════════════════════════════════════════════

export function createDefaultTrustMetrics(): TrustMetrics {
  return {
    confirmation_count: 0,
    conflict_count: 0,
    conflict_total: 0,
    accuracy_rate: 0.5,            // Neutral — no data yet
    avg_lead_time_days: 0,
    lead_time_samples: 0,
    consecutive_accessible: 0,
    total_checks: 0,
    accessibility_rate: 1.0,       // Assume accessible until proven otherwise
    successful_checks: 0,
    last_accessible: null,
    last_inaccessible: null,
    independent_citers: 0,
    total_citations: 0,
    highest_citing_tier: null,
    self_citation_count: 0,
  };
}

// Compute baseline trust score for a source being added at a known tier
// T1 sources start with high trust. T7 sources start with minimal trust.

export function computeBaselineTrustScore(tier: SourceTier): TrustScore {
  const baselines: Record<SourceTier, number> = {
    1: 95,  // T1 is the law itself — starts near-perfect
    2: 85,  // T2 is the regulator — high trust
    3: 70,  // T3 is intergovernmental — strong trust
    4: 50,  // T4 is expert analysis — moderate trust, must be earned
    5: 40,  // T5 is industry/standards — moderate, growing
    6: 25,  // T6 is news/commentary — low, must prove itself
    7: 10,  // T7 is provisional — minimal trust
  };

  const overall = baselines[tier];

  return {
    overall,
    accuracy_component: overall * 0.4,
    timeliness_component: overall * 0.2,
    reliability_component: overall * 0.2,
    citation_component: overall * 0.2,
    computed_at: new Date().toISOString(),
  };
}

// ── Utility: Convert update frequency string to days ──

function frequencyToDays(frequency: string): number {
  switch (frequency.toLowerCase()) {
    case "continuous": return 1;
    case "daily": return 1;
    case "business-daily": return 1;
    case "weekly": return 7;
    case "biweekly": return 14;
    case "monthly": return 30;
    case "quarterly": return 90;
    case "annual": return 365;
    case "ad-hoc": return 0; // Can't compute staleness for ad-hoc
    default: return 0;
  }
}
