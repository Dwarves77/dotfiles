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
  Source,
  ProvisionalSource,
  PromotionCriteria,
  DemotionTrigger,
} from "@/types/source";

import { PROMOTION_CRITERIA, DEMOTION_TRIGGERS } from "@/types/source";
import { fetchAllRows } from "@/lib/db/paginate.mjs";

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
  halfLifeMonths: number = HALF_LIFE_MONTHS,
  now: number = Date.now()
): number {
  const ageMonths =
    (now - detectedAt.getTime()) / (MS_PER_DAY * DAYS_PER_MONTH);
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

export function computeCitationComponent(metrics: TrustMetrics): number {
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
  /** Triggers that fired but were suppressed by the caller (opts.suppressTriggers); never counted in `triggered`. */
  held_triggers?: DemotionTrigger["trigger"][];
}

// Evaluate whether a source is eligible for promotion

export function evaluatePromotion(source: Source): PromotionEvaluation | null {
  // Phase 1.5: base_tier per scoring-internals default rule (promotion
  // evaluates the structural classification, not the dynamic credibility
  // signal; promoting effective_tier would create feedback loops with Q7).
  // T1 sources cannot be promoted further
  if (source.base_tier === 1) return null;

  // Find the criteria for promoting from this tier
  const criteria = PROMOTION_CRITERIA.find(
    (c) => c.from_tier === source.base_tier
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

export function evaluateDemotion(
  source: Source,
  opts: { suppressTriggers?: ReadonlyArray<DemotionTrigger["trigger"]> } = {}
): DemotionEvaluation {
  const m = source.trust_metrics;
  const triggers_fired: DemotionEvaluation["triggers_fired"] = [];
  const held_triggers: DemotionTrigger["trigger"][] = [];

  for (const trigger of DEMOTION_TRIGGERS) {
    // Phase 1.5: base_tier per scoring-internals default rule.
    // Only check triggers that apply to this tier
    if (!trigger.tiers_affected.includes(source.base_tier)) continue;

    let fired = false;
    let currentValue = "";

    switch (trigger.trigger) {
      case "high_conflict_rate":
        if (m.conflict_total >= 3 && m.conflict_count / m.conflict_total > 0.3) {
          fired = true;
          currentValue = `${((m.conflict_count / m.conflict_total) * 100).toFixed(1)}% conflict rate (${m.conflict_count}/${m.conflict_total})`;
        }
        break;

      case "extended_inaccessibility":
        // The declared condition (DEMOTION_TRIGGERS) is "last_accessible older than 30 days AND
        // status = 'inaccessible'". The status half was never checked, so a source that is simply not
        // being scanned (stale last_accessible, status still active) would fire. Now that a fired
        // trigger moves effective_tier, the code matches the declared condition.
        if (source.status === "inaccessible" && m.last_accessible) {
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
      if (opts.suppressTriggers?.includes(trigger.trigger)) {
        held_triggers.push(trigger.trigger);
      } else {
        triggers_fired.push({ trigger, current_value: currentValue });
      }
    }
  }

  // Phase 1.5: base_tier per scoring-internals default rule.
  // Recommended tier: one step down from current
  const recommendedTier = Math.min(7, source.base_tier + 1) as SourceTier;

  return {
    triggered: triggers_fired.length > 0,
    triggers_fired,
    recommended_tier: triggers_fired.length > 0 ? recommendedTier : source.base_tier,
    ...(held_triggers.length > 0 ? { held_triggers } : {}),
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

// TIER_WEIGHTS, HALF_LIFE_MONTHS, and applyRecencyDecay live in the Q6
// block above (lines ~226-257). Q7 functions below consume them directly.
// The Q7 dispatch initially declared its own copies as placeholders; the
// Q6/Q7 merge resolution removed the duplicates per operator-specified
// shape ("keep Q6's canonical decay implementation plus Q7's promotion
// logic plus Q7_CONFIG").

// ── Supabase-like client shape used by the Q7 functions ──
// Kept minimal so the functions are usable from both the Next.js
// runtime (admin client) and the daily batch script (service-role
// client). Both expose the same .from().select()/update()/insert() API.

export interface SupabaseLikeClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

// Renamed from CitationRow at merge time to avoid collision with the
// Q6 CitationRow above (which is the post-join { citing_tier, detected_at }
// shape used by computeCitationComponentFromRows). CitationEdgeRow is the
// raw source_citations row shape Q7's evaluateCandidatePromotion fetches
// before resolving citing tiers via a follow-up query.
export interface CitationEdgeRow {
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
 * Pure scoring core of evaluateCandidatePromotion: given the raw citation edges into one source and a
 * citing-source-id to tier map, sum the tier-weighted, decayed contributions and apply the Q7 promotion
 * thresholds. Split out so the per-source path (evaluateCandidatePromotion) and the batch tier-movement
 * planner (planTierMovements) share one calculation.
 */
export function scoreCitationEdges(
  rows: CitationEdgeRow[],
  tierById: Map<string, number>,
  halfLifeMonths: number = HALF_LIFE_MONTHS,
  now: number = Date.now()
): { weighted_sum: number; citation_count: number; should_promote: boolean; reasoning: string } {
  const citation_count = rows.length;
  let weighted_sum = 0;
  for (const row of rows) {
    const tier = tierById.get(row.citing_source_id);
    if (tier == null) continue; // Citer source not found (deleted or RLS-filtered); skip.
    if (tier < 1 || tier > 7) continue; // Defensive: out-of-range tier; skip.
    const weight = TIER_WEIGHTS[tier as SourceTier];
    weighted_sum += weight * applyRecencyDecay(new Date(row.detected_at), halfLifeMonths, now);
  }

  const should_promote =
    weighted_sum >= Q7_CONFIG.PROMOTION_WEIGHTED_SUM_THRESHOLD &&
    citation_count >= Q7_CONFIG.CITATION_FREQUENCY_PROMOTION_THRESHOLD;

  const reasoning = should_promote
    ? `weighted_sum=${weighted_sum.toFixed(3)} >= ${Q7_CONFIG.PROMOTION_WEIGHTED_SUM_THRESHOLD} AND citations=${citation_count} >= ${Q7_CONFIG.CITATION_FREQUENCY_PROMOTION_THRESHOLD} (promote)`
    : `weighted_sum=${weighted_sum.toFixed(3)} citations=${citation_count} below thresholds (sum>=${Q7_CONFIG.PROMOTION_WEIGHTED_SUM_THRESHOLD}, citations>=${Q7_CONFIG.CITATION_FREQUENCY_PROMOTION_THRESHOLD})`;

  return { weighted_sum, citation_count, should_promote, reasoning };
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
  halfLifeMonths: number = HALF_LIFE_MONTHS
): Promise<PromotionEvaluationResult> {
  // Fetch citations into this source.
  const { data: citations, error: citErr } = await client
    .from("source_citations")
    .select("citing_source_id, cited_source_id, detected_at")
    .eq("cited_source_id", sourceId);

  if (citErr) {
    throw new Error(`evaluateCandidatePromotion: failed to read source_citations for ${sourceId}: ${citErr.message}`);
  }

  const rows = (citations ?? []) as CitationEdgeRow[];
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

  // Phase 1.5: Q2 read is effective_tier per skill Section 4 (citation
  // network weight reflects the citing source's current credibility signal).
  // Fall back to base_tier if effective_tier is null.
  const citingIds = Array.from(new Set(rows.map((r) => r.citing_source_id)));
  const { data: citerSources, error: srcErr } = await client
    .from("sources")
    .select("id, base_tier, effective_tier")
    // fitness-allow: F39 (scoped to one item's own claim/section/search rows — small by construction, not corpus-scale)
    .in("id", citingIds);

  if (srcErr) {
    throw new Error(`evaluateCandidatePromotion: failed to read sources for citers of ${sourceId}: ${srcErr.message}`);
  }

  const tierById = new Map<string, number>();
  for (const s of (citerSources ?? []) as Array<{ id: string; base_tier: number; effective_tier: number | null }>) {
    tierById.set(s.id, s.effective_tier ?? s.base_tier);
  }

  const scored = scoreCitationEdges(rows, tierById, halfLifeMonths);
  const { weighted_sum, should_promote, reasoning } = scored;

  return {
    source_id: sourceId,
    should_promote,
    weighted_sum,
    citation_count,
    reasoning,
  };
}

// ══════════════════════════════════════════════════════════════
// Tier movement (S1-C, 2026-10-04): the machine moves effective_tier
// ══════════════════════════════════════════════════════════════
//
// base_tier is the institution class tier; it changes only through the class table or an admin and is
// never written here. effective_tier is the dynamic column the machine moves. The single calculator is
// decideEffectiveTier (pure): tier_override wins; else base_tier adjusted by evidence; else base_tier.
//
// Evidence, each applied automatically and each reversible on the next recompute (the decision is
// recomputed from base_tier every time, never accumulated on top of the stored effective_tier):
//   a. citation promotion (scoreCitationEdges / evaluateCandidatePromotion): one tier better
//   b. evaluatePromotion eligible: one tier better
//   c. evaluateDemotion triggered: one tier worse
//   d. tier opinions: 3 or more non-dismissed opinions in the last 90 days from at least 2 distinct
//      opining sources, whose median differs from base_tier, move one step toward the median.
//      Class-table opinions (host_class_table) are not evidence here; institution-canonicalize owns them.
//   e. scored prediction outcomes (lane L4-D, ADR-044 decision 4): the source_reliability_ledger holds one
//      row per source per scored prediction (held, refuted, partial). With at least OUTCOME_MIN_SAMPLE scored
//      outcomes inside OUTCOME_WINDOW_DAYS, refuted over held moves one step toward demotion, and held with no
//      refuted moves one step toward promotion (outcomeMovement). It is one more delta inside the same clamp;
//      the ledger itself never writes a tier.
// Net movement is clamped to one tier either side of base_tier. A dismissed opinion never counts.

export const TIER_MOVEMENT = {
  /** Opinions inside the window needed before opinions move a tier. */
  OPINION_MIN_COUNT: 3,
  /** Distinct opining sources needed among those opinions. */
  OPINION_MIN_DISTINCT_OPINERS: 2,
  /** Lookback window, days. Shares the Q7 disagreement window. */
  OPINION_WINDOW_DAYS: Q7_CONFIG.TIER_OPINION_DISAGREEMENT_WINDOW_DAYS,
  /** Largest net movement either side of base_tier. */
  MAX_NET_STEP: 1,
  /** Scored outcomes (held + refuted + partial) a source needs inside the window before outcomes move its tier. */
  OUTCOME_MIN_SAMPLE: 5,
  /** Lookback window for scored outcomes, days. Predictions are about dated horizons, so the window is a year. */
  OUTCOME_WINDOW_DAYS: 365,
} as const;

/** Opinion sources that are not evidence for tier movement. */
const NON_EVIDENCE_OPINION_SOURCES: ReadonlyArray<string> = ["host_class_table"];

export interface TierOpinionRow {
  target_source_id?: string;
  opined_tier: number;
  opining_source_id: string | null;
  opined_at: string;
  dismissed_at: string | null;
  opinion_source: string | null;
}

export interface OpinionMovement {
  delta: -1 | 0 | 1;
  counted: number;
  distinct_opiners: number;
  median: number | null;
  reason: string;
}

/** Pure: the one-step movement the tier opinions argue for, relative to base_tier. */
export function opinionMovement(
  baseTier: SourceTier,
  opinions: TierOpinionRow[],
  now: Date = new Date()
): OpinionMovement {
  const since = now.getTime() - TIER_MOVEMENT.OPINION_WINDOW_DAYS * MS_PER_DAY;
  const counted = (opinions ?? []).filter(
    (o) =>
      o.dismissed_at == null &&
      !NON_EVIDENCE_OPINION_SOURCES.includes(o.opinion_source ?? "") &&
      new Date(o.opined_at).getTime() >= since &&
      o.opined_tier >= 1 &&
      o.opined_tier <= 7
  );
  const distinct = new Set(counted.map((o) => o.opining_source_id).filter((id): id is string => !!id)).size;
  if (counted.length < TIER_MOVEMENT.OPINION_MIN_COUNT || distinct < TIER_MOVEMENT.OPINION_MIN_DISTINCT_OPINERS) {
    return {
      delta: 0,
      counted: counted.length,
      distinct_opiners: distinct,
      median: null,
      reason: `opinions=${counted.length} distinct_opiners=${distinct} below thresholds (n>=${TIER_MOVEMENT.OPINION_MIN_COUNT}, distinct>=${TIER_MOVEMENT.OPINION_MIN_DISTINCT_OPINERS})`,
    };
  }
  const sorted = counted.map((o) => o.opined_tier).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const delta = median < baseTier ? -1 : median > baseTier ? 1 : 0;
  return {
    delta,
    counted: counted.length,
    distinct_opiners: distinct,
    median,
    reason: `opinions=${counted.length} distinct_opiners=${distinct} median=${median} base=${baseTier}`,
  };
}

/** A source's tally of scored prediction outcomes over the window (lane L4-D). */
export interface OutcomeTally {
  held: number;
  refuted: number;
  partial: number;
}

export interface OutcomeMovement {
  delta: -1 | 0 | 1;
  held: number;
  refuted: number;
  partial: number;
  sample: number;
  window_days: number;
  reason: string;
}

/**
 * Pure: the one-step movement a source's scored prediction outcomes argue for. Rule, in order:
 *   sample (held + refuted + partial) below OUTCOME_MIN_SAMPLE            -> 0 (too little evidence)
 *   refuted greater than held                                             -> +1 (toward demotion)
 *   refuted is zero and held is at least one                              -> -1 (toward promotion)
 *   anything else (a mixed record, a tie, all partial)                    -> 0
 */
export function outcomeMovement(tally: OutcomeTally | null | undefined): OutcomeMovement {
  const held = tally?.held ?? 0;
  const refuted = tally?.refuted ?? 0;
  const partial = tally?.partial ?? 0;
  const sample = held + refuted + partial;
  const base = { held, refuted, partial, sample, window_days: TIER_MOVEMENT.OUTCOME_WINDOW_DAYS };
  if (sample < TIER_MOVEMENT.OUTCOME_MIN_SAMPLE) {
    return { ...base, delta: 0, reason: `outcomes=${sample} below minimum sample (n>=${TIER_MOVEMENT.OUTCOME_MIN_SAMPLE})` };
  }
  if (refuted > held) return { ...base, delta: 1, reason: `outcomes held=${held} refuted=${refuted} partial=${partial}: refuted over held` };
  if (refuted === 0 && held > 0) return { ...base, delta: -1, reason: `outcomes held=${held} refuted=0 partial=${partial}: held with no refuted` };
  return { ...base, delta: 0, reason: `outcomes held=${held} refuted=${refuted} partial=${partial}: mixed record` };
}

export interface OutcomeRow {
  source_id: string;
  outcome: string;
  scored_at: string;
}

/** Pure: per-source tally of the ledger rows inside the window. Rows with another outcome value are ignored. */
export function tallyOutcomes(rows: OutcomeRow[], now: Date = new Date()): Map<string, OutcomeTally> {
  const since = now.getTime() - TIER_MOVEMENT.OUTCOME_WINDOW_DAYS * MS_PER_DAY;
  const out = new Map<string, OutcomeTally>();
  for (const r of rows ?? []) {
    if (r.outcome !== "held" && r.outcome !== "refuted" && r.outcome !== "partial") continue;
    if (new Date(r.scored_at).getTime() < since) continue;
    const t = out.get(r.source_id) ?? { held: 0, refuted: 0, partial: 0 };
    t[r.outcome] += 1;
    out.set(r.source_id, t);
  }
  return out;
}

/** The ONE reader of the reliability ledger window, shared by the maintenance step (recompute-tiers.mjs) and the
 *  admin route, so a route-triggered recompute carries the same outcome evidence as the step. Paginated, bounded
 *  by the window. `client` is any Supabase-shaped client. */
export function outcomeReaderFor(client: SupabaseLikeClient) {
  return (sinceIso: string): Promise<OutcomeRow[]> =>
    fetchAllRows((from: number, to: number) =>
      client
        .from("source_reliability_ledger")
        .select("source_id, outcome, scored_at")
        .gte("scored_at", sinceIso)
        .order("id", { ascending: true })
        .range(from, to)
    ) as Promise<OutcomeRow[]>;
}

export interface TierEvidence {
  citation_promote: boolean;
  citation_reasoning: string;
  promotion: PromotionEvaluation | null;
  demotion: DemotionEvaluation | null;
  opinion: OpinionMovement;
  /** Scored prediction outcomes (lane L4-D). Optional: a caller that does not read the ledger contributes 0. */
  outcome?: OutcomeMovement;
}

export interface TierMovementDecision {
  before_tier: SourceTier;
  after_tier: SourceTier;
  changed: boolean;
  base_tier: SourceTier;
  /** base_tier moved by the clamped net evidence, before the override is considered. */
  computed_dynamic_tier: SourceTier;
  tier_override: SourceTier | null;
  /** True when an admin override is set: the machine writes nothing for this source. */
  override_held: boolean;
  deltas: { citation: number; promotion: number; demotion: number; opinion: number; outcome: number };
  net: number;
  /** True when the movement exists because of scored prediction outcomes: without that delta the source would
   *  not have landed on this tier. Lets a report separate outcome-driven movements from the rest. */
  outcome_driven: boolean;
  rules: string[];
  inputs: Record<string, unknown>;
  reasoning: string;
}

const clampTier = (n: number): SourceTier => Math.max(1, Math.min(7, n)) as SourceTier;

/**
 * THE calculator for effective_tier. Pure.
 *   effective_tier = tier_override, else clamp(base_tier + clamp(sum of evidence deltas, -1, +1)).
 * With an override set, after_tier reports the override but changed is false: an automatic writer never
 * writes over an admin override.
 */
export function decideEffectiveTier(input: {
  base_tier: SourceTier;
  effective_tier: SourceTier | null;
  tier_override: SourceTier | null;
  evidence: TierEvidence;
}): TierMovementDecision {
  const { base_tier, effective_tier, tier_override, evidence } = input;
  const before_tier = (effective_tier ?? base_tier) as SourceTier;

  const deltas = {
    citation: evidence.citation_promote ? -1 : 0,
    promotion: evidence.promotion?.eligible ? -1 : 0,
    demotion: evidence.demotion?.triggered ? 1 : 0,
    opinion: evidence.opinion.delta as number,
    outcome: (evidence.outcome?.delta ?? 0) as number,
  };
  const rules: string[] = [];
  if (deltas.citation) rules.push("citation_promotion");
  if (deltas.promotion) rules.push("evaluate_promotion");
  if (deltas.demotion) rules.push("evaluate_demotion");
  if (deltas.opinion) rules.push("tier_opinions");
  if (deltas.outcome) rules.push("prediction_outcomes");

  const sum = deltas.citation + deltas.promotion + deltas.demotion + deltas.opinion + deltas.outcome;
  const clampNet = (n: number) => Math.max(-TIER_MOVEMENT.MAX_NET_STEP, Math.min(TIER_MOVEMENT.MAX_NET_STEP, n));
  const net = clampNet(sum);
  const computed_dynamic_tier = clampTier(base_tier + net);
  // The tier the other four evidence kinds alone would give: outcomes are the reason for a movement only when
  // taking them away changes where the source lands.
  const tier_without_outcome = clampTier(base_tier + clampNet(sum - deltas.outcome));

  const override_held = tier_override != null;
  const after_tier: SourceTier = override_held ? (tier_override as SourceTier) : computed_dynamic_tier;
  const changed = !override_held && after_tier !== before_tier;
  const outcome_driven = changed && deltas.outcome !== 0 && tier_without_outcome !== after_tier;

  const inputs: Record<string, unknown> = {
    citation: { promote: evidence.citation_promote, reasoning: evidence.citation_reasoning },
    promotion: evidence.promotion
      ? { eligible: evidence.promotion.eligible, target_tier: evidence.promotion.target_tier, blocking: evidence.promotion.blocking }
      : null,
    demotion: evidence.demotion
      ? {
          triggered: evidence.demotion.triggered,
          triggers: evidence.demotion.triggers_fired.map((t) => ({ trigger: t.trigger.trigger, current_value: t.current_value })),
        }
      : null,
    opinion: {
      counted: evidence.opinion.counted,
      distinct_opiners: evidence.opinion.distinct_opiners,
      median: evidence.opinion.median,
      window_days: TIER_MOVEMENT.OPINION_WINDOW_DAYS,
    },
    outcome: evidence.outcome
      ? { held: evidence.outcome.held, refuted: evidence.outcome.refuted, partial: evidence.outcome.partial, sample: evidence.outcome.sample, window_days: evidence.outcome.window_days }
      : null,
  };

  const outcomeNote = evidence.outcome ? `; ${evidence.outcome.reason}` : "";
  const reasoning = override_held
    ? `effective_tier held at admin override ${tier_override}: base=${base_tier} (no machine write)`
    : changed
      ? `effective_tier ${before_tier} -> ${after_tier}: base=${base_tier} net=${net} rules=${rules.join("+") || "none"} (${evidence.citation_reasoning}; ${evidence.opinion.reason}${outcomeNote})`
      : `effective_tier unchanged at ${after_tier}: base=${base_tier} net=${net} rules=${rules.join("+") || "none"} (${evidence.citation_reasoning}; ${evidence.opinion.reason}${outcomeNote})`;

  return {
    before_tier,
    after_tier,
    changed,
    base_tier,
    computed_dynamic_tier,
    tier_override,
    override_held,
    deltas,
    net,
    outcome_driven,
    rules,
    inputs,
    reasoning,
  };
}

// Source row to evidence

/** The sources columns the tier calculator reads. */
export const TIER_SOURCE_COLUMNS =
  "id, name, base_tier, effective_tier, tier_override, status, processing_paused, confirmation_count, conflict_count, accuracy_rate, accessibility_rate, total_checks, lead_time_samples, avg_lead_time_days, independent_citers, highest_citing_tier, total_citations, self_citation_count, conflict_total, last_checked, last_accessible, created_at, last_substantive_change, update_frequency";

export interface TierSourceRow {
  id: string;
  name?: string | null;
  base_tier: number;
  effective_tier: number | null;
  tier_override: number | null;
  status?: string | null;
  /** A source intentionally on hold keeps its last-known tier: it is read (it still weighs as a citer) but never moved. */
  processing_paused?: boolean | null;
  confirmation_count: number | null;
  conflict_count: number | null;
  accuracy_rate: number | null;
  accessibility_rate: number | null;
  total_checks: number | null;
  lead_time_samples: number | null;
  avg_lead_time_days: number | null;
  independent_citers: number | null;
  highest_citing_tier: number | null;
  total_citations: number | null;
  self_citation_count: number | null;
  conflict_total: number | null;
  last_checked: string | null;
  last_accessible: string | null;
  created_at: string;
  last_substantive_change: string | null;
  update_frequency: string | null;
}

/** Build a TrustMetrics shape from the flat sources columns. Fields not on the row default to 0 / null. */
export function trustMetricsFromRow(s: TierSourceRow): TrustMetrics {
  return {
    confirmation_count: s.confirmation_count || 0,
    conflict_count: s.conflict_count || 0,
    conflict_total: s.conflict_total || 0,
    accuracy_rate: s.accuracy_rate ?? 0,
    total_checks: s.total_checks || 0,
    successful_checks: 0, // not read; not used by the formula
    consecutive_accessible: 0,
    accessibility_rate: s.accessibility_rate ?? 0,
    last_accessible: s.last_accessible ?? null,
    last_inaccessible: null,
    lead_time_samples: s.lead_time_samples || 0,
    avg_lead_time_days: s.avg_lead_time_days || 0,
    independent_citers: s.independent_citers || 0,
    total_citations: s.total_citations || 0,
    self_citation_count: s.self_citation_count || 0,
    highest_citing_tier: (s.highest_citing_tier || null) as SourceTier | null,
  };
}

/**
 * Cadence hold (CLAUDE.md rule 16). While system_state.scrape_cadence is 'off', scan timestamps cannot
 * advance, so a trigger that reads them (no_substantive_update) would fire on every unscanned source.
 * It contributes no delta during the hold and is counted as held. Any other cadence value, or no value
 * given, suppresses nothing.
 */
export const CADENCE_HELD_TRIGGERS: ReadonlyArray<DemotionTrigger["trigger"]> = ["no_substantive_update"];
function cadenceHeldTriggers(scrapeCadence?: string | null): ReadonlyArray<DemotionTrigger["trigger"]> {
  return scrapeCadence === "off" ? CADENCE_HELD_TRIGGERS : [];
}

/** evaluatePromotion + evaluateDemotion over one sources row. Both read only the narrow object built here. */
export function evaluateTierEvidenceForRow(
  s: TierSourceRow,
  opts: { scrapeCadence?: string | null } = {}
): { promotion: PromotionEvaluation | null; demotion: DemotionEvaluation } {
  const metrics = trustMetricsFromRow(s);
  const base = s.base_tier as SourceTier;
  const narrow = {
    base_tier: base,
    status: s.status ?? undefined,
    created_at: s.created_at,
    last_substantive_change: s.last_substantive_change,
    update_frequency: s.update_frequency ?? "ad-hoc",
    trust_metrics: metrics,
    trust_score: { overall: computeOverallScore(metrics, base) },
    // evaluatePromotion and evaluateDemotion read only the fields above; every other Source field is
    // irrelevant to their verdicts.
  } as unknown as Source;
  return {
    promotion: evaluatePromotion(narrow),
    demotion: evaluateDemotion(narrow, { suppressTriggers: cadenceHeldTriggers(opts.scrapeCadence) }),
  };
}

// Per-source recompute (used by source-growth's end-of-cycle reputation step)

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
  rules: string[];
  decision: TierMovementDecision;
}

/**
 * Recompute the effective tier for a single source from all four evidence kinds (see the block header).
 * Reads the source row, its citation edges and its non-dismissed tier opinions inside the window, then
 * defers to decideEffectiveTier. Does not write.
 */
export async function recomputeEffectiveTier(
  client: SupabaseLikeClient,
  sourceId: string,
  halfLifeMonths: number = HALF_LIFE_MONTHS,
  opts: { scrapeCadence?: string | null } = {}
): Promise<EffectiveTierRecomputeResult> {
  const { data: src, error: srcErr } = await client
    .from("sources")
    .select(TIER_SOURCE_COLUMNS)
    .eq("id", sourceId)
    .single();

  if (srcErr) {
    throw new Error(`recomputeEffectiveTier: failed to read source ${sourceId}: ${srcErr.message}`);
  }
  if (!src) {
    throw new Error(`recomputeEffectiveTier: source ${sourceId} not found`);
  }

  const row = src as TierSourceRow;
  if (row.base_tier < 1 || row.base_tier > 7) {
    throw new Error(`recomputeEffectiveTier: source ${sourceId} has out-of-range base_tier=${row.base_tier}`);
  }
  const base_tier = row.base_tier as SourceTier;

  const now = new Date();
  const promo = await evaluateCandidatePromotion(client, sourceId, halfLifeMonths);

  const { data: opinionRows, error: opErr } = await client
    .from("source_tier_opinions")
    .select("opined_tier, opining_source_id, opined_at, dismissed_at, opinion_source")
    .eq("target_source_id", sourceId);
  // Dismissed rows and rows outside the window are dropped by opinionMovement itself; the per-source set is small.
  if (opErr) {
    throw new Error(`recomputeEffectiveTier: failed to read source_tier_opinions for ${sourceId}: ${opErr.message}`);
  }

  // Cadence hold (rule 16). A caller that already holds the cadence passes it; otherwise it is read once
  // here, failing closed to 'off' on any read error (the same default src/lib/api/pause.ts uses).
  let scrapeCadence = opts.scrapeCadence;
  if (scrapeCadence === undefined) {
    try {
      const { data: st, error: stErr } = await client.from("system_state").select("scrape_cadence").eq("id", true).maybeSingle();
      scrapeCadence = stErr ? "off" : ((st as { scrape_cadence?: string } | null)?.scrape_cadence ?? "off");
    } catch {
      scrapeCadence = "off";
    }
  }
  const { promotion, demotion } = evaluateTierEvidenceForRow(row, { scrapeCadence });

  // Scored prediction outcomes (lane L4-D): this source's ledger rows inside the window. The ledger may not
  // exist yet (migration 353 unapplied), so a failed read contributes no outcome evidence and never throws.
  let outcome: OutcomeMovement | undefined;
  try {
    const sinceIso = new Date(now.getTime() - TIER_MOVEMENT.OUTCOME_WINDOW_DAYS * MS_PER_DAY).toISOString();
    const { data: ledgerRows, error: ledgerErr } = await client
      .from("source_reliability_ledger")
      .select("source_id, outcome, scored_at")
      .eq("source_id", sourceId)
      .gte("scored_at", sinceIso);
    if (!ledgerErr) outcome = outcomeMovement(tallyOutcomes((ledgerRows ?? []) as OutcomeRow[], now).get(sourceId));
  } catch {
    outcome = undefined;
  }

  const decision = decideEffectiveTier({
    base_tier,
    effective_tier: row.effective_tier == null ? null : (row.effective_tier as SourceTier),
    tier_override: row.tier_override == null ? null : (row.tier_override as SourceTier),
    evidence: {
      citation_promote: promo.should_promote,
      citation_reasoning: promo.reasoning,
      promotion,
      demotion,
      opinion: opinionMovement(base_tier, (opinionRows ?? []) as TierOpinionRow[], now),
      outcome,
    },
  });

  return {
    source_id: sourceId,
    before_tier: decision.before_tier,
    after_tier: decision.after_tier,
    changed: decision.changed,
    base_tier,
    computed_dynamic_tier: decision.computed_dynamic_tier,
    tier_override: decision.tier_override,
    weighted_sum: promo.weighted_sum,
    citation_count: promo.citation_count,
    reasoning: decision.reasoning,
    rules: decision.rules,
    decision,
  };
}

// Batch plan and apply (used by the recompute-trust route and scripts/maintenance/recompute-tiers.mjs)

export interface TierMovementReaders {
  readSources(): Promise<TierSourceRow[]>;
  /** Non-dismissed opinions with opined_at at or after sinceIso, every target. */
  readOpinions(sinceIso: string): Promise<TierOpinionRow[]>;
  readCitations(): Promise<CitationEdgeRow[]>;
  /** Scored prediction outcomes (source_reliability_ledger rows) with scored_at at or after sinceIso, every
   *  source (lane L4-D). Optional: a caller without it contributes no outcome evidence. */
  readOutcomes?(sinceIso: string): Promise<OutcomeRow[]>;
}

export interface TierMovementPlan {
  scanned: number;
  override_held: number;
  /** Sources whose cadence-held demotion trigger was suppressed (scrape cadence off). */
  held_cadence_off: number;
  skipped: Array<{ source_id: string; reason: string }>;
  /** Only the sources whose effective_tier would change. */
  movements: Array<{ source_id: string; name: string | null; decision: TierMovementDecision }>;
  /** How many of those movements exist because of scored prediction outcomes (lane L4-D). */
  outcome_driven_movements: number;
  /** The error text when the outcome read failed (the run continues without outcome evidence), else null. */
  outcome_read_error: string | null;
}

/** Pure over its readers: decides every source, returns the ones that move. Never writes. */
export async function planTierMovements(
  readers: TierMovementReaders,
  opts: { now?: Date; halfLifeMonths?: number; scrapeCadence?: string | null } = {}
): Promise<TierMovementPlan> {
  const now = opts.now ?? new Date();
  const halfLife = opts.halfLifeMonths ?? HALF_LIFE_MONTHS;
  const sources = await readers.readSources();
  const sinceIso = new Date(now.getTime() - TIER_MOVEMENT.OPINION_WINDOW_DAYS * MS_PER_DAY).toISOString();
  const [opinions, citations] = await Promise.all([readers.readOpinions(sinceIso), readers.readCitations()]);
  // One bounded read of the ledger window (lane L4-D). A failure (migration 353 unapplied) is recorded on the
  // plan and the run continues with no outcome evidence.
  let outcomeTallies = new Map<string, OutcomeTally>();
  let outcome_read_error: string | null = null;
  if (readers.readOutcomes) {
    try {
      const outcomeSince = new Date(now.getTime() - TIER_MOVEMENT.OUTCOME_WINDOW_DAYS * MS_PER_DAY).toISOString();
      outcomeTallies = tallyOutcomes(await readers.readOutcomes(outcomeSince), now);
    } catch (e) {
      outcome_read_error = e instanceof Error ? e.message : String(e);
    }
  }

  const opinionsByTarget = new Map<string, TierOpinionRow[]>();
  for (const o of opinions) {
    if (!o.target_source_id) continue;
    const list = opinionsByTarget.get(o.target_source_id) ?? [];
    list.push(o);
    opinionsByTarget.set(o.target_source_id, list);
  }
  const citationsByCited = new Map<string, CitationEdgeRow[]>();
  for (const c of citations) {
    const list = citationsByCited.get(c.cited_source_id) ?? [];
    list.push(c);
    citationsByCited.set(c.cited_source_id, list);
  }
  const tierById = new Map<string, number>();
  for (const s of sources) tierById.set(s.id, s.effective_tier ?? s.base_tier);

  const plan: TierMovementPlan = { scanned: sources.length, override_held: 0, held_cadence_off: 0, skipped: [], movements: [], outcome_driven_movements: 0, outcome_read_error };
  for (const row of sources) {
    if (row.processing_paused === true) {
      plan.skipped.push({ source_id: row.id, reason: "processing_paused" });
      continue;
    }
    if (row.base_tier < 1 || row.base_tier > 7) {
      plan.skipped.push({ source_id: row.id, reason: `out-of-range base_tier=${row.base_tier}` });
      continue;
    }
    const base_tier = row.base_tier as SourceTier;
    const edges = citationsByCited.get(row.id) ?? [];
    const cited =
      edges.length === 0
        ? { should_promote: false, reasoning: "no citations" }
        : scoreCitationEdges(edges, tierById, halfLife, now.getTime());
    const { promotion, demotion } = evaluateTierEvidenceForRow(row, { scrapeCadence: opts.scrapeCadence });
    if (demotion.held_triggers?.length) plan.held_cadence_off += 1;
    const decision = decideEffectiveTier({
      base_tier,
      effective_tier: row.effective_tier == null ? null : (row.effective_tier as SourceTier),
      tier_override: row.tier_override == null ? null : (row.tier_override as SourceTier),
      evidence: {
        citation_promote: cited.should_promote,
        citation_reasoning: cited.reasoning,
        promotion,
        demotion,
        opinion: opinionMovement(base_tier, opinionsByTarget.get(row.id) ?? [], now),
        outcome: readers.readOutcomes && !outcome_read_error ? outcomeMovement(outcomeTallies.get(row.id)) : undefined,
      },
    });
    if (decision.override_held) plan.override_held += 1;
    if (decision.changed) {
      plan.movements.push({ source_id: row.id, name: row.name ?? null, decision });
      if (decision.outcome_driven) plan.outcome_driven_movements += 1;
    }
  }
  return plan;
}

/** The source_trust_events row recorded for one applied movement. */
export function tierMovementEvent(sourceId: string, decision: TierMovementDecision) {
  return {
    source_id: sourceId,
    event_type: decision.after_tier < decision.before_tier ? ("tier_promotion" as const) : ("tier_demotion" as const),
    details: {
      applied: true,
      rule: decision.rules.join("+"),
      rules: decision.rules,
      before_tier: decision.before_tier,
      after_tier: decision.after_tier,
      base_tier: decision.base_tier,
      deltas: decision.deltas,
      outcome_driven: decision.outcome_driven,
      inputs: decision.inputs,
    },
    created_by: "worker" as const,
  };
}

export interface TierMovementWriters {
  setEffectiveTier(sourceId: string, tier: SourceTier): Promise<void>;
  insertEvent(event: ReturnType<typeof tierMovementEvent>): Promise<void>;
}

export interface TierMovementApplyResult {
  attempted: number;
  applied: number;
  promotions: number;
  demotions: number;
  write_failed: number;
  event_failed: number;
  failures: string[];
}

/**
 * Applies planned movements. Each movement is a tier write followed by its audit event. A failed tier
 * write records no event (nothing changed); a failed event after a good write is counted separately and
 * never rolled back (the tier is already correct, the next run reads the same stored value and stays
 * quiet). Fail-soft per source.
 */
export async function applyTierMovements(
  movements: TierMovementPlan["movements"],
  writers: TierMovementWriters
): Promise<TierMovementApplyResult> {
  const result: TierMovementApplyResult = {
    attempted: movements.length,
    applied: 0,
    promotions: 0,
    demotions: 0,
    write_failed: 0,
    event_failed: 0,
    failures: [],
  };
  for (const m of movements) {
    const label = m.name ?? m.source_id;
    try {
      await writers.setEffectiveTier(m.source_id, m.decision.after_tier);
    } catch (e) {
      result.write_failed += 1;
      result.failures.push(`${label}: effective_tier write failed: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    result.applied += 1;
    if (m.decision.after_tier < m.decision.before_tier) result.promotions += 1;
    else result.demotions += 1;
    try {
      await writers.insertEvent(tierMovementEvent(m.source_id, m.decision));
    } catch (e) {
      result.event_failed += 1;
      result.failures.push(`${label}: source_trust_events insert failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}
