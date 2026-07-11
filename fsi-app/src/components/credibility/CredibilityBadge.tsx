"use client";

/**
 * CredibilityBadge, canonical tier display.
 *
 * Per Q9 (source-credibility-model SKILL.md Section 8): every customer-facing
 * surface that renders a tier value uses the same badge so the T1-T7 vocabulary
 * is recognized everywhere (Regulations, Research, Market Intel, Operations,
 * Map overlay, Assistant citations).
 *
 * Tier color hierarchy extends environmental-policy-and-innovation's 6-level
 * Source Type Hierarchy. T1 carries the strongest accent (binding law); the
 * accent attenuates down to T6/T7 which uses muted neutrals so low-authority
 * sources do not visually shout.
 *
 * Replaces (going forward) the consumer-side use of `SourceProvenanceBadge` in
 * `src/components/sources/` which couples the badge to the sourceStore lookup.
 * This badge is data-shape-pure: callers pass `tier` directly. Migration of
 * existing consumers is per-build follow-up; see the contract doc.
 *
 * Stable contract: do NOT add coupling to stores, routing, or click handlers.
 * Composition with click semantics (open source URL, expand panel) is the
 * caller's responsibility, wrap the badge in an anchor or button.
 */

import type { CSSProperties } from "react";
// Q-1 fix (2026-07-11): tier labels live in the ONE exported constant. The prior inline
// map labeled T7 "Provisional" — a STATUS word conflated with a TIER — and disagreed with
// the ruled Source Health legend (T5 industry / T6 commercial-intel / T7 news-commentary).
import { TIER_LABELS as TIER_LABEL } from "@/lib/tier-labels";

export interface CredibilityBadgeProps {
  /** Source tier 1-7. Null / undefined renders a neutral "n/a" placeholder. */
  tier: number | null | undefined;
  /** Visual size. Default 'md'. */
  size?: "sm" | "md" | "lg";
  /** When true, append the tier label (e.g., "Binding Law"). Default false. */
  showLabel?: boolean;
}

// Tier accent palette. Anchored to the navy brand accent at T1 and walked
// down through blue, cyan, slate, and slate-muted by T7. Mirrors the palette
// used by the pre-existing SourceProvenanceBadge to preserve recognition
// during the migration window.
const TIER_ACCENT: Record<number, string> = {
  1: "#1E3A8A", // navy       , binding law
  2: "#2563EB", // blue       , regulator implementation
  3: "#0891B2", // cyan       , intergovernmental body
  4: "#475569", // slate      , expert analysis / industry body
  5: "#64748B", // slate-light, industry and standards / news
  6: "#94A3B8", // slate-muted, analysis and commentary
  7: "#94A3B8", // slate-muted, overflow / provisional
};

interface SizeTokens {
  pillFont: number;
  pillPadX: number;
  pillPadY: number;
  labelFont: number;
  gap: number;
}

const SIZE_TOKENS: Record<NonNullable<CredibilityBadgeProps["size"]>, SizeTokens> = {
  sm: { pillFont: 9, pillPadX: 4, pillPadY: 1, labelFont: 10, gap: 4 },
  md: { pillFont: 10, pillPadX: 5, pillPadY: 1, labelFont: 11, gap: 5 },
  lg: { pillFont: 12, pillPadX: 7, pillPadY: 2, labelFont: 13, gap: 6 },
};

function isValidTier(tier: number | null | undefined): tier is number {
  return typeof tier === "number" && tier >= 1 && tier <= 7 && Number.isInteger(tier);
}

export function CredibilityBadge({
  tier,
  size = "md",
  showLabel = false,
}: CredibilityBadgeProps) {
  const tokens = SIZE_TOKENS[size];

  if (!isValidTier(tier)) {
    return (
      <span
        aria-label="Tier unknown"
        title="Tier unknown"
        style={{
          display: "inline-flex",
          alignItems: "center",
          fontSize: tokens.pillFont,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "var(--color-text-muted)",
          padding: `${tokens.pillPadY}px ${tokens.pillPadX}px`,
          border: "1px dashed var(--color-border)",
          borderRadius: 3,
          lineHeight: 1.2,
          textTransform: "uppercase",
        }}
      >
        n/a
      </span>
    );
  }

  const accent = TIER_ACCENT[tier];
  const label = TIER_LABEL[tier];

  const pillStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: tokens.pillFont,
    fontWeight: 800,
    letterSpacing: "0.04em",
    color: accent,
    backgroundColor: `${accent}14`,
    border: `1px solid ${accent}33`,
    padding: `${tokens.pillPadY}px ${tokens.pillPadX}px`,
    borderRadius: 3,
    lineHeight: 1.2,
    fontVariantNumeric: "tabular-nums",
  };

  if (!showLabel) {
    return (
      <span
        aria-label={`Tier ${tier}, ${label}`}
        title={`Tier ${tier}, ${label}`}
        style={pillStyle}
      >
        T{tier}
      </span>
    );
  }

  return (
    <span
      aria-label={`Tier ${tier}, ${label}`}
      title={`Tier ${tier}, ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: tokens.gap,
      }}
    >
      <span style={pillStyle}>T{tier}</span>
      <span
        style={{
          fontSize: tokens.labelFont,
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
    </span>
  );
}

/**
 * Exported for consumers (other credibility components, documentation) that
 * need the canonical label string without rendering the badge.
 */
export function getTierLabel(tier: number | null | undefined): string {
  if (!isValidTier(tier)) return "Tier unknown";
  return TIER_LABEL[tier];
}
