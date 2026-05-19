"use client";

/**
 * SignalStrength, Market Intel signal strength indicator.
 *
 * Per Q9: signal strength is a primary credibility signal on Market Intel
 * surfaces. The five-step scale ("critical / high / moderate / low /
 * monitoring") matches the environmental-policy-and-innovation severity
 * vocabulary already in use across PolicySignals, WatchlistSidebar, and
 * KeyMetricsRow.
 *
 * Color tokens read from the existing theme CSS variables so the indicator
 * stays in sync with the rest of the platform automatically. References
 * `--critical / --high / --moderate / --low` from theme.css.
 *
 * Stable contract: callers pass one of the five strength values. The
 * component does NOT compute strength from underlying data, that mapping is
 * surface-specific (e.g., Market Intel may derive strength from price-shift
 * magnitude + recency; Operations may derive from applicability). Keeping
 * the component pure-display keeps the contract usable across surfaces.
 */

import type { CSSProperties } from "react";

export type SignalStrengthValue =
  | "critical"
  | "high"
  | "moderate"
  | "low"
  | "monitoring";

export interface SignalStrengthProps {
  strength: SignalStrengthValue;
  /** Visual size. Default 'md'. */
  size?: "sm" | "md";
}

interface StrengthTheme {
  label: string;
  /** Theme CSS var name (no var() wrapping) for text color. */
  colorVar: string;
  /** Theme CSS var name for background tint. */
  bgVar: string;
  /** Theme CSS var name for border. */
  borderVar: string;
}

const STRENGTH_THEME: Record<SignalStrengthValue, StrengthTheme> = {
  critical: {
    label: "ACTION REQUIRED",
    colorVar: "--color-critical",
    bgVar: "--color-critical-bg",
    borderVar: "--color-critical-border",
  },
  high: {
    label: "COST ALERT",
    colorVar: "--color-high",
    bgVar: "--color-high-bg",
    borderVar: "--color-high-border",
  },
  moderate: {
    label: "WATCH",
    colorVar: "--color-moderate",
    bgVar: "--color-moderate-bg",
    borderVar: "--color-moderate-border",
  },
  low: {
    label: "STABLE",
    colorVar: "--color-low",
    bgVar: "--color-low-bg",
    borderVar: "--color-low-border",
  },
  monitoring: {
    label: "MONITORING",
    // Monitoring is intentionally neutral, uses muted text + raised surface
    // so it does not visually compete with the elevated severities. No
    // dedicated theme var pair exists for monitoring, so we map to neutral
    // surface tokens.
    colorVar: "--color-text-muted",
    bgVar: "--color-surface-raised",
    borderVar: "--color-border-subtle",
  },
};

export function SignalStrength({ strength, size = "md" }: SignalStrengthProps) {
  const theme = STRENGTH_THEME[strength];

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    fontSize: size === "sm" ? 9 : 10,
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: `var(${theme.colorVar})`,
    backgroundColor: `var(${theme.bgVar})`,
    border: `1px solid var(${theme.borderVar})`,
    padding: size === "sm" ? "1px 5px" : "2px 7px",
    borderRadius: 999,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  };

  return (
    <span
      role="status"
      aria-label={`Signal strength: ${theme.label}`}
      title={theme.label}
      style={style}
    >
      {theme.label}
    </span>
  );
}

/**
 * Exported for consumers that need the canonical label string (e.g., screen
 * reader summaries, dashboard counts).
 */
export function getStrengthLabel(strength: SignalStrengthValue): string {
  return STRENGTH_THEME[strength].label;
}
