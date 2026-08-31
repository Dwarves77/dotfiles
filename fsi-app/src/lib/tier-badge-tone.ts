/**
 * TIER BADGE TONE — color/background/border ramp for T1–T7 tier chips.
 * Companion to tier-labels.ts (the label vocabulary); this owns only the
 * COLOR ramp, factored out of components/regulations/sections/SourcesList.tsx
 * so it is unit-testable (that file is a client component — JSX can't be
 * imported by the no-npm-ci discipline test runner).
 *
 * full-read-audit-2026-08-31.md §2.4: SourcesList's private TIER_STYLE
 * covered tiers 1-5 only, so a T6/T7 citation rendered NO badge at all
 * (silently vanished). Every other tier-badge component in the repo clamps
 * 1-7 with a fallback — RegulationDetailSurface.tsx's and
 * MarketSignalDetailSurface.tsx's local `TierBadge`/`clampTier`:
 *   t <= 2 -> solid critical/high; t <= 5 -> solid dark; else (6-7) ->
 *   dashed, muted, no fill (the "aggregator / unverified provenance" tone).
 * T6/T7 below reuse that exact dashed-muted convention.
 */

export interface TierTone {
  fg: string;
  bg: string;
  /** Present only for the T6/T7 dashed-muted tone. */
  border?: string;
}

export const TIER_TONE: Record<number, TierTone> = {
  1: { fg: "#fff", bg: "var(--color-critical)" },
  2: { fg: "#fff", bg: "var(--color-high)" },
  3: { fg: "var(--color-text-primary)", bg: "var(--color-moderate-bg)" },
  4: { fg: "var(--color-text-primary)", bg: "var(--color-surface-raised)" },
  5: { fg: "var(--color-text-muted)", bg: "var(--color-surface-raised)" },
  6: { fg: "var(--color-text-muted)", bg: "transparent", border: "1px dashed rgba(0,0,0,0.3)" },
  7: { fg: "var(--color-text-muted)", bg: "transparent", border: "1px dashed rgba(0,0,0,0.3)" },
};

/**
 * Clamp any tier value to the customer-facing 1-7 range (DO-NOT-REVERT
 * convention — matches RegulationDetailSurface.clampTier /
 * MarketSignalDetailSurface.clampTier verbatim) so a malformed, fractional,
 * or future out-of-range tier still renders a badge instead of vanishing.
 */
export function clampTier(n: number): number {
  return Math.min(7, Math.max(1, Math.round(n)));
}

/** Tone for a tier badge. Never undefined — the tier is clamped first. */
export function tierToneFor(tier: number): TierTone {
  return TIER_TONE[clampTier(tier)];
}
