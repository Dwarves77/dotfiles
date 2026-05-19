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
//
// Sources with no earned data signals would all score a neutral 40
// (20+10+10+0). That's mathematically honest but uninformative — a
// tier-1 institutional gazette would render identically to a
// provisional tier-7 candidate. We blend the earned score with a
// tier-derived prior so the UI shows differentiated authority
// immediately, and earned data takes over as it accumulates. See
// computeOverallScore.

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

// ── Earned Score (0-100) ──
// Sum of the four weighted components; what computeTrustScore.overall
// returns. Exposed so the prior-blend caller can reuse it without
// recomputing components.

export function computeEarnedScore(metrics: TrustMetrics): number {
  return Math.round(
    computeAccuracyComponent(metrics) +
    computeTimelinessComponent(metrics) +
    computeReliabilityComponent(metrics) +
    computeCitationComponent(metrics)
  );
}

// ── Tier-Derived Prior (0-100) ──
// What we'd assign if we had zero earned data. Encodes "institutional
// authority" — tier 1 is a state gazette, tier 7 is provisional. The
// prior decays as earned data accumulates (see computeOverallScore).

const TIER_PRIORS: Record<SourceTier, number> = {
  1: 85,
  2: 75,
  3: 65,
  4: 55,
  5: 45,
  6: 35,
  7: 25,
};

export function tierPrior(tier: SourceTier): number {
  return TIER_PRIORS[tier] ?? 25;
}

// ── Bayesian-Prior-Blend Overall Score (0-100) ──
//
//   overall = (prior_weight × tier_prior) + ((1 − prior_weight) × earned_score)
//   prior_weight = max(0, 1 − data_signal_count / 10)
//   data_signal_count = independent_citers + total_checks +
//                       confirmation_count + conflict_count
//
// At zero signals: overall = tier_prior. At ≥10 signals: overall =
// earned_score. In between, smooth linear transition. A low-tier
// source can earn up; a high-tier source can fall if it accumulates
// conflicts or loses accessibility.

export function computeOverallScore(metrics: TrustMetrics, tier: SourceTier): number {
  const earned = computeEarnedScore(metrics);
  const prior = tierPrior(tier);
  const signalCount =
    (metrics.independent_citers || 0) +
    (metrics.total_checks || 0) +
    (metrics.confirmation_count || 0) +
    (metrics.conflict_count || 0);
  const priorWeight = Math.max(0, 1 - signalCount / 10);
  return Math.round(priorWeight * prior + (1 - priorWeight) * earned);
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

// ══════════════════════════════════════════════════════════════
// Citation-Network Tier Weights + Recency Decay (Q6 / Q7)
// ══════════════════════════════════════════════════════════════
//
// Per source-credibility-model skill Section 4 (the canonical
// citation-network semantics):
//
//   weighted_sum(source_id) = SUM(
//     tier_weight(citing_source.effective_tier) * decay_factor(detected_at)
//   ) FOR each row in source_citations WHERE cited_source_id = source_id
//
// TIER_WEIGHTS are verbatim from Q7. T7 = 0 per operator Flag 2:
// an overflow/uncategorized source has no established authority and
// therefore propagates no credibility signal when it cites others.
//
// HALF_LIFE_MONTHS is operator-tunable per the decisions doc Open
// Sub-Decision (operator range: 18-24 months). Starting parameter:
// 20 months (midpoint). Tune by editing this constant or by passing
// an explicit halfLifeMonths argument to applyRecencyDecay.
//
// Decay scope (Section 4 of the skill):
//   APPLIES to citation-network contribution to effective_tier
//   DOES NOT apply to base_tier (structural, time-invariant)
//   DOES NOT apply to accessibility decay (separate logic, this file)
//   DOES NOT apply to tier_history (immutable audit trail)

export const TIER_WEIGHTS: Record<number, number> = {
  1: 1.0,
  2: 0.85,
  3: 0.7,
  4: 0.5,
  5: 0.3,  // Q7 extension
  6: 0.15, // Q7 extension
  7: 0,    // Q7 confirmed: T7 = no signal (overflow tier doesn't propagate credibility)
};

export const HALF_LIFE_MONTHS = 20; // Operator-tunable (decisions doc Open Sub-Decision, range 18-24)

// Average days per month over a 4-year window (Gregorian): 30.44.
const DAYS_PER_MONTH = 30.44;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// applyRecencyDecay
//
// Returns the multiplier in [0, 1] to apply to a citation's tier weight
// based on how old the citation is. A citation observed `now` returns
// 1.0; a citation observed `halfLifeMonths` ago returns 0.5; two
// half-lives ago returns 0.25; and so on.
//
// Formula: 0.5 ^ (ageMonths / halfLifeMonths)
export function applyRecencyDecay(
  detectedAt: Date,
  halfLifeMonths: number = HALF_LIFE_MONTHS
): number {
  const ageMonths =
    (Date.now() - detectedAt.getTime()) / (MS_PER_DAY * DAYS_PER_MONTH);
  return Math.pow(0.5, ageMonths / halfLifeMonths);
}

// ── Citation Component (0-20) ──
// Based on how many independent T1-T3 sources cite this one.
// Self-citations are excluded. Citation from higher tiers
// counts more than from lower tiers.
//
// This is the aggregate-metrics path: it consumes the rolled-up
// `independent_citers` + `highest_citing_tier` columns on the sources
// row. Per-citation tier-weighted + decayed scoring (the canonical
// formula per skill Section 4) is in computeCitationComponentFromRows
// below; the daily batch recompute will migrate to that path as the
// source_citations edge table becomes the source of truth.

function computeCitationComponent(metrics: TrustMetrics): number {
  const MAX = 20;

  // No citations at all
  if (metrics.independent_citers === 0) {
    return 0;
  }

  // Weight by highest citing tier per Q7 verbatim weights (TIER_WEIGHTS).
  const tierMultiplier = metrics.highest_citing_tier
    ? TIER_WEIGHTS[metrics.highest_citing_tier] ?? 0
    : 0;

  // Scale: 1 citer = 6, 3 citers = 12, 5 citers = 16, 10+ = 20
  const citerScore = Math.min(1, metrics.independent_citers / 10);
  const base = MAX * Math.sqrt(citerScore);

  return base * tierMultiplier;
}

// computeCitationComponentFromRows
//
// Per-citation tier-weighted + recency-decayed citation score (skill
// Section 4 canonical formula). Each row contributes
// TIER_WEIGHTS[citingTier] * applyRecencyDecay(detected_at) to the
// weighted sum. The sum is then squashed into the 0-20 component band
// via the same sqrt curve the aggregate path uses, so both paths
// produce comparable component scores during the migration window.
//
// Input rows are expected to come from a query against source_citations
// joined to sources on source_id (the citing source) to read its
// effective_tier (preferred) or base_tier (fallback). detected_at is
// already present on source_citations (migration 004) and only needs to
// be selected by the caller.

export interface CitationRow {
  citing_tier: number;       // effective_tier of the citing source (1-7)
  detected_at: Date;         // when the citation edge was observed
}

export function computeCitationComponentFromRows(
  rows: CitationRow[],
  halfLifeMonths: number = HALF_LIFE_MONTHS
): number {
  const MAX = 20;

  if (rows.length === 0) {
    return 0;
  }

  let weightedSum = 0;
  for (const row of rows) {
    const tierWeight = TIER_WEIGHTS[row.citing_tier] ?? 0;
    if (tierWeight === 0) continue; // T7 or unknown: no contribution
    weightedSum += tierWeight * applyRecencyDecay(row.detected_at, halfLifeMonths);
  }

  if (weightedSum === 0) return 0;

  // Squash to 0-20 via sqrt curve so the per-row path produces a
  // component value comparable to the aggregate path. Saturation at
  // weighted_sum = 10 (roughly: 10 recent T1 citations, or
  // proportionally more of lower-tier or older citations).
  const normalized = Math.min(1, weightedSum / 10);
  return MAX * Math.sqrt(normalized);
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

// ══════════════════════════════════════════════════════════════
// Q7: Discovery Loop Promotion Thresholds + Daily Recompute
// ══════════════════════════════════════════════════════════════
//
// Per Q7 (docs/sprint-2/source-credibility-model-decisions-2026-05-19.md)
// and the source-credibility-model skill, Section 4 and Section 5.
//
// This block defines:
//   1. Q7_CONFIG: thresholds for review-queue surfacing, citation-
//      frequency promotion, weighted-sum promotion, tier-opinion
//      disagreement flagging.
//   2. TIER_WEIGHTS: per-tier citation weight (T1=1.0 ... T7=0).
//      A T1 citation contributes weight 1.0; a T7 citation contributes 0
//      because T7 means "authority unestablished" and amplifying T7
//      citations would amplify uncertainty.
//   3. evaluateCandidatePromotion(): given a source_id, sums the
//      tier-weighted, decayed citation contributions and reports
//      whether the source clears the Q7 promotion threshold.
//   4. recomputeEffectiveTier(): given a source_id, derives the
//      effective tier per the model formula
//      COALESCE(tier_override, computed_dynamic_tier, base_tier).
//
// Schema note (Q7 worktree predates Q2 + Q5):
//   - Current sources schema has `tier` (INT 1-7); not yet
//     `base_tier`/`effective_tier` (Q2) or `tier_override` (Q5).
//   - Until Q2/Q5 land, both functions read `tier` as base_tier and
//     skip the override branch. The COALESCE shape is preserved so
//     the swap at migration time is mechanical.
//   - source_trust_events.event_type CHECK constraint currently
//     restricts values to a fixed set; 'effective_tier_recompute'
//     is NOT in the set. The daily batch uses the existing
//     'tier_promotion' / 'tier_demotion' values to log tier changes;
//     adding a recompute-specific event_type is a separate migration.
//
// Q6 conflict note: Q6 dispatch lands the recency-decay function on
// the same file. When merged, Q6 owns decayFactor() and TIER_WEIGHTS
// MUST resolve to the same Q7 values defined below (T1=1.0 ... T7=0);
// if Q6 lands first with TIER_WEIGHTS, this block references the
// existing constant.

export const Q7_CONFIG = {
  /** Classifier confidence above which a discovered candidate surfaces to the operator review queue. */
  CLASSIFIER_CONFIDENCE_REVIEW_THRESHOLD: 0.65,
  /** Number of independent citations above which a candidate promotes to operator review regardless of confidence. */
  CITATION_FREQUENCY_PROMOTION_THRESHOLD: 3,
  /** Tier-weighted, decayed citation sum above which a candidate is eligible for tier elevation. */
  PROMOTION_WEIGHTED_SUM_THRESHOLD: 2.5,
  /** Lookback window for the tier-opinion disagreement aggregation, in days. */
  TIER_OPINION_DISAGREEMENT_WINDOW_DAYS: 90,
  /** Count of disagreeing opinions within the window that triggers operator review of the source's tier. */
  TIER_OPINION_DISAGREEMENT_COUNT_THRESHOLD: 5,
  /** Expected operator review queue arrival rate per week, [min, max]. Used to calibrate thresholds. */
  EXPECTED_QUEUE_RATE_PER_WEEK: [5, 15] as [number, number],
} as const;

/**
 * Per-tier citation weight used in the tier-weighted citation sum.
 * T7 = 0: a source whose authority is unestablished does not contribute
 * credibility signal to anything it cites (amplifying T7 would amplify
 * uncertainty, not credibility).
 *
 * Verbatim per Q7 decision. Q6 dispatch will add decay; the weights
 * here MUST match whatever Q6 defines (Q7 is the authoritative source
 * for the weight values per the decisions doc).
 */
export const TIER_WEIGHTS: Record<SourceTier, number> = {
  1: 1.0,
  2: 0.85,
  3: 0.7,
  4: 0.5,
  5: 0.3,
  6: 0.15,
  7: 0,
};

/**
 * Recency decay factor for a citation timestamp.
 *
 * Half-life curve: a citation at `now` contributes 1.0; at `now - half_life`
 * contributes 0.5; at `now - 2 * half_life` contributes 0.25.
 *
 * Q6 owns the canonical implementation; this is a placeholder that uses
 * the upper end of the Q7 documented range (24 months) until Q6 merges.
 * When Q6 lands, the merge resolution removes this stub and imports the
 * Q6 export instead.
 */
export const Q7_DEFAULT_HALF_LIFE_DAYS = 24 * 30; // 24 months, upper end of Q7's 18-24 month tunable range.

export function decayFactor(
  detectedAt: string | Date,
  now: Date = new Date(),
  halfLifeDays: number = Q7_DEFAULT_HALF_LIFE_DAYS
): number {
  const detectedTime = typeof detectedAt === "string" ? new Date(detectedAt).getTime() : detectedAt.getTime();
  const ageDays = (now.getTime() - detectedTime) / 86400000;
  if (ageDays <= 0) return 1.0;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

// ── Supabase-like client shape used by the Q7 functions ──
// Kept minimal so the functions are usable from both the Next.js
// runtime (admin client) and the daily batch script (service-role
// client). Both expose the same .from().select()/update()/insert() API.

export interface SupabaseLikeClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

export interface CitationRow {
  citing_source_id: string;
  cited_source_id: string;
  detected_at: string;
}

export interface PromotionEvaluationResult {
  source_id: string;
  should_promote: boolean;
  weighted_sum: number;
  citation_count: number;
  reasoning: string;
}

/**
 * Sum tier-weighted, decayed citation contributions for a single cited source.
 *
 * Reads source_citations rows where cited_source_id = sourceId, joins each
 * citing source to its tier, applies TIER_WEIGHTS and decayFactor, sums.
 *
 * Returns { weighted_sum, citation_count, should_promote, reasoning }.
 */
export async function evaluateCandidatePromotion(
  client: SupabaseLikeClient,
  sourceId: string,
  now: Date = new Date(),
  halfLifeDays: number = Q7_DEFAULT_HALF_LIFE_DAYS
): Promise<PromotionEvaluationResult> {
  // Fetch citations into this source.
  const { data: citations, error: citErr } = await client
    .from("source_citations")
    .select("citing_source_id, cited_source_id, detected_at")
    .eq("cited_source_id", sourceId);

  if (citErr) {
    throw new Error(`evaluateCandidatePromotion: failed to read source_citations for ${sourceId}: ${citErr.message}`);
  }

  const rows = (citations ?? []) as CitationRow[];
  const citation_count = rows.length;

  if (citation_count === 0) {
    return {
      source_id: sourceId,
      should_promote: false,
      weighted_sum: 0,
      citation_count: 0,
      reasoning: "no citations",
    };
  }

  // Fetch tier for each unique citing source. After Q2 lands the read
  // column becomes effective_tier; today it is tier.
  const citingIds = Array.from(new Set(rows.map((r) => r.citing_source_id)));
  const { data: citerSources, error: srcErr } = await client
    .from("sources")
    .select("id, tier")
    .in("id", citingIds);

  if (srcErr) {
    throw new Error(`evaluateCandidatePromotion: failed to read sources for citers of ${sourceId}: ${srcErr.message}`);
  }

  const tierById = new Map<string, number>();
  for (const s of (citerSources ?? []) as Array<{ id: string; tier: number }>) {
    tierById.set(s.id, s.tier);
  }

  let weighted_sum = 0;
  for (const row of rows) {
    const tier = tierById.get(row.citing_source_id);
    if (tier == null) continue; // Citer source not found (deleted or RLS-filtered); skip.
    if (tier < 1 || tier > 7) continue; // Defensive: out-of-range tier; skip.
    const weight = TIER_WEIGHTS[tier as SourceTier];
    const decay = decayFactor(row.detected_at, now, halfLifeDays);
    weighted_sum += weight * decay;
  }

  const should_promote =
    weighted_sum >= Q7_CONFIG.PROMOTION_WEIGHTED_SUM_THRESHOLD &&
    citation_count >= Q7_CONFIG.CITATION_FREQUENCY_PROMOTION_THRESHOLD;

  const reasoning = should_promote
    ? `weighted_sum=${weighted_sum.toFixed(3)} >= ${Q7_CONFIG.PROMOTION_WEIGHTED_SUM_THRESHOLD} AND citations=${citation_count} >= ${Q7_CONFIG.CITATION_FREQUENCY_PROMOTION_THRESHOLD} (promote)`
    : `weighted_sum=${weighted_sum.toFixed(3)} citations=${citation_count} below thresholds (sum>=${Q7_CONFIG.PROMOTION_WEIGHTED_SUM_THRESHOLD}, citations>=${Q7_CONFIG.CITATION_FREQUENCY_PROMOTION_THRESHOLD})`;

  return {
    source_id: sourceId,
    should_promote,
    weighted_sum,
    citation_count,
    reasoning,
  };
}

export interface EffectiveTierRecomputeResult {
  source_id: string;
  before_tier: SourceTier;
  after_tier: SourceTier;
  changed: boolean;
  base_tier: SourceTier;
  computed_dynamic_tier: SourceTier;
  tier_override: SourceTier | null;
  weighted_sum: number;
  citation_count: number;
  reasoning: string;
}

/**
 * Recompute the effective tier for a single source.
 *
 * Formula: effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier).
 *
 * computed_dynamic_tier is derived from base_tier plus the network signal:
 *   - if weighted_sum >= PROMOTION_WEIGHTED_SUM_THRESHOLD and base_tier > 1,
 *     promote one tier (lower number = higher tier).
 *   - otherwise computed_dynamic_tier = base_tier.
 *
 * The Q7 promotion logic intentionally promotes by ONE tier per recompute.
 * Multi-tier jumps are deliberate operator decisions, not batch outcomes.
 * Demotion is OUT OF SCOPE for Q7 (owned by the existing evaluateDemotion
 * path in this module, which fires on conflicts/inaccessibility).
 *
 * Schema note (pre-Q2 / pre-Q5): we read `tier` as base_tier and treat
 * tier_override as always-null. When Q2/Q5 land, the read becomes
 * { base_tier, tier_override } and the COALESCE wires through.
 */
export async function recomputeEffectiveTier(
  client: SupabaseLikeClient,
  sourceId: string,
  now: Date = new Date(),
  halfLifeDays: number = Q7_DEFAULT_HALF_LIFE_DAYS
): Promise<EffectiveTierRecomputeResult> {
  // Read the source row. Pre-Q2: only `tier` exists. Post-Q2/Q5 the
  // select list extends to base_tier, effective_tier, tier_override.
  const { data: src, error: srcErr } = await client
    .from("sources")
    .select("id, tier")
    .eq("id", sourceId)
    .single();

  if (srcErr) {
    throw new Error(`recomputeEffectiveTier: failed to read source ${sourceId}: ${srcErr.message}`);
  }
  if (!src) {
    throw new Error(`recomputeEffectiveTier: source ${sourceId} not found`);
  }

  const baseTierNum = (src as { tier: number }).tier;
  if (baseTierNum < 1 || baseTierNum > 7) {
    throw new Error(`recomputeEffectiveTier: source ${sourceId} has out-of-range tier=${baseTierNum}`);
  }
  const base_tier = baseTierNum as SourceTier;
  const tier_override: SourceTier | null = null; // Pre-Q5; will read column when Q5 lands.

  // before_tier is the currently-stored effective signal. Pre-Q2 this
  // is just `tier`; post-Q2 it becomes effective_tier.
  const before_tier = base_tier;

  // Sum citation network signal.
  const promo = await evaluateCandidatePromotion(client, sourceId, now, halfLifeDays);

  // Promote by one tier if eligible and not already T1.
  let computed_dynamic_tier: SourceTier = base_tier;
  if (promo.should_promote && base_tier > 1) {
    computed_dynamic_tier = (base_tier - 1) as SourceTier;
  }

  // COALESCE(tier_override, computed_dynamic_tier, base_tier).
  const after_tier: SourceTier = tier_override ?? computed_dynamic_tier ?? base_tier;

  const changed = after_tier !== before_tier;

  const reasoning = changed
    ? `effective_tier ${before_tier} -> ${after_tier}: base=${base_tier} override=${tier_override ?? "null"} computed=${computed_dynamic_tier} (${promo.reasoning})`
    : `effective_tier unchanged at ${after_tier}: base=${base_tier} override=${tier_override ?? "null"} computed=${computed_dynamic_tier} (${promo.reasoning})`;

  return {
    source_id: sourceId,
    before_tier,
    after_tier,
    changed,
    base_tier,
    computed_dynamic_tier,
    tier_override,
    weighted_sum: promo.weighted_sum,
    citation_count: promo.citation_count,
    reasoning,
  };
}
