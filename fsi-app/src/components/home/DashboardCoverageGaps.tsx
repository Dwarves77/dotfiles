"use client";

/**
 * DashboardCoverageGaps — Housekeeping card (left). Potentially-missing
 * regulations the system would expect to track for the workspace's active
 * sectors, each with a recommended action.
 *
 * Redesign TEMPLATE 01 (HANDOFF §6.3 + mock). Every gap renders inside the
 * honest-state frame (§4, dashed) because a gap IS an absence. The card is
 * explicitly labeled "Our analysis — severity is a recommendation, not a
 * precise score" (labeled analysis, epistemic grammar §3). Empty state is the
 * honest "coverage looks complete" copy.
 */

import { use } from "react";
import type { CoverageGap } from "@/lib/data";

export interface DashboardCoverageGapsProps {
  promise: Promise<CoverageGap[]>;
}

const SEV_LABEL: Record<CoverageGap["severity"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const SEV_COLOR: Record<CoverageGap["severity"], string> = {
  high: "var(--reg-band-action)",
  medium: "var(--reg-band-monitor)",
  low: "var(--reg-band-awareness)",
};

const CAVEAT = "We're still expanding our source registry; check back as jurisdictions are added.";

const cardStyle = {
  background: "var(--color-bg-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "16px 18px",
} as const;

const eyebrowStyle = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  margin: "0 0 2px",
} as const;

const titleStyle = {
  fontFamily: "var(--font-display)",
  fontWeight: 400,
  fontSize: 19,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  margin: 0,
} as const;

export function DashboardCoverageGaps({ promise }: DashboardCoverageGapsProps) {
  const items = use(promise);

  if (items.length === 0) {
    return (
      <div style={cardStyle}>
        <p style={eyebrowStyle}>What you might be missing</p>
        <h3 style={{ ...titleStyle, margin: "0 0 8px" }}>Coverage gaps</h3>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: "0 0 8px" }}>
          Coverage looks complete for your active sectors.
        </p>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.5, margin: 0 }}>{CAVEAT}</p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>What you might be missing</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "0 0 4px" }}>
        <h3 style={titleStyle}>Coverage gaps</h3>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)" }}>{items.length} flagged</span>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
        Our analysis — severity is a recommendation, not a precise score.
      </p>
      {items.map((g) => (
        <div
          key={g.id}
          style={{
            border: "1px dashed rgba(0,0,0,0.25)",
            borderRadius: 6,
            background: "var(--color-bg-base)",
            padding: "12px 14px",
            margin: "0 0 10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0 }}>{g.title}</p>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: SEV_COLOR[g.severity],
                whiteSpace: "nowrap",
              }}
            >
              {SEV_LABEL[g.severity]}
            </span>
          </div>
          <p
            style={{ fontSize: 11.5, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: "4px 0 8px" }}
            // Description is editor-curated in the coverage_gaps table; allows a
            // small subset of inline tags (<i>) per the source data contract.
            dangerouslySetInnerHTML={{ __html: g.description }}
          />
          <a
            href={g.suggestedAction.href}
            style={{ fontSize: 11.5, fontWeight: 800, color: "var(--color-primary)", textDecoration: "none" }}
          >
            {g.suggestedAction.label} →
          </a>
        </div>
      ))}
      <p style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.5, margin: 0 }}>{CAVEAT}</p>
    </div>
  );
}
