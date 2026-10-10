/**
 * customer-source-tier: the ONE rule for the tier a customer sees for a source (lane P1,
 * 2026-10-05; CLAUDE.md rule 18, "the surface shows the rating").
 *
 * GOVERNING SKILL(S): source-credibility-model
 *
 * THE RULE, from migration 090's stated formula and the skill's Section 7:
 *   customer tier = tier_override when an admin set one, else effective_tier, else base_tier.
 *
 * WHY A HELPER. Every customer loader used to compute `effective_tier ?? base_tier` on its own and
 * none of them selected `tier_override`, so an admin override written to `sources.tier_override`
 * (the tier-override route writes only tier_override, override_reason, override_date) never reached
 * a row chip, the ActionCard or the Sources grid. Reading the override first, in one place, makes an
 * admin edit exactly what the customer sees, and stops the loaders drifting apart again.
 *
 * WHAT THIS IS NOT. The PER-CLAIM tier is a different rule and stays exactly where it is:
 * load-detail-core.ts's `fetchClaimTierMap` derives a claim's tier as `tier_override ?? base_tier`
 * and must never read effective_tier (migration 145, "moat-pure": reputation never confers
 * reg-fact eligibility). This helper is for the SOURCE-level chip only.
 *
 * Pure and isomorphic (no I/O, no clock). A value outside the tier vocabulary is treated as absent,
 * never clamped into a tier the source does not have: an unrateable source returns null and the
 * caller renders the Absence part.
 */

import { TIER_LABELS } from "./tier-labels.ts";

const TIERS = Object.keys(TIER_LABELS).map(Number);

/** Lowest tier in the customer vocabulary (src/lib/tier-labels.ts). */
export const SOURCE_TIER_MIN = Math.min(...TIERS);
/** Highest tier in the customer vocabulary. Derived, never retyped: a tier added to
 *  tier-labels.ts widens every chip clamp and legend that reads this. */
export const SOURCE_TIER_MAX = Math.max(...TIERS);

/** The three tier columns of a `sources` row, as a loader selects them. Every field optional. */
interface SourceTierColumns {
  tier_override?: number | null;
  effective_tier?: number | null;
  base_tier?: number | null;
}

function inVocabulary(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= SOURCE_TIER_MIN && n <= SOURCE_TIER_MAX;
}

/**
 * The tier a customer sees for `src`, or null when none of the three columns holds a valid tier.
 * Override first, then the dynamic effective tier, then the static base tier.
 */
export function customerSourceTier(src: SourceTierColumns | null | undefined): number | null {
  if (!src) return null;
  if (inVocabulary(src.tier_override)) return src.tier_override;
  if (inVocabulary(src.effective_tier)) return src.effective_tier;
  if (inVocabulary(src.base_tier)) return src.base_tier;
  return null;
}

/**
 * The scale in one line for a legend, built from tier-labels.ts so a legend can never say the
 * scale ends at a tier the vocabulary does not: "T1 binding law -> T7 news / commentary".
 * `joiner` is the connecting word or glyph (the dashboard and list legends use the arrow, the
 * detail rail uses "through").
 */
export function tierScaleSpan(joiner: string): string {
  const first = `T${SOURCE_TIER_MIN} ${TIER_LABELS[SOURCE_TIER_MIN].toLowerCase()}`;
  const last = `T${SOURCE_TIER_MAX} ${TIER_LABELS[SOURCE_TIER_MAX].toLowerCase()}`;
  return `${first} ${joiner} ${last}`;
}
