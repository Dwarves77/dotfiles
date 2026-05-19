"use client";

/**
 * BiasBadge, bias tag chip group.
 *
 * Per source-credibility-model SKILL.md Section 6: bias tags carry three
 * orthogonal dimensions (Funding / Methodology / Stakeholder Position). A
 * single source can carry multiple tags within each dimension; the combination
 * is informative ("foundation-funded + methodologically-transparent +
 * environmental-advocate" reads as "rigorous third-party research with
 * explicit advocacy framing").
 *
 * Per Section 9 anti-patterns: bias tags apply to external publisher sources
 * ONLY. NEVER render bias tags on user-generated Community content; Community
 * uses the author-identity model instead.
 *
 * Scope: Research, Operations, and Assistant provenance panels are the
 * primary consumers per Q9. Regulations and Market Intel cards do not
 * foreground bias by default (per signal-set asymmetry) but may surface it on
 * expand-on-click panels.
 *
 * Stable contract: tag strings are passed through verbatim from the bias
 * vocabulary in Section 6. This component does NOT validate tag membership;
 * upstream classification is responsible for vocabulary discipline.
 */

import type { CSSProperties } from "react";

export type BiasDimension = "funding" | "methodology" | "stakeholder";

export interface BiasTag {
  dimension: BiasDimension;
  /** Tag text from the Section 6 vocabulary (e.g., "industry-funded"). */
  tag: string;
  /** Optional classifier confidence 0-1; not rendered, available for tooltips. */
  confidence?: number;
}

export interface BiasBadgeProps {
  /** Empty array renders nothing. */
  tags: BiasTag[];
  /**
   * 'inline' = chips flow as a single horizontal group.
   * 'grouped' = chips are clustered per dimension with a small dimension label.
   * Default 'inline'.
   */
  layout?: "inline" | "grouped";
}

// Per-dimension visual differentiation. Tints are intentionally subtle so the
// bias signal does not visually compete with tier (which is the primary
// authority signal). The icon glyph is a single character so chips stay compact
// on dense surfaces (Research result list, Operations sidebar).
const DIMENSION_THEME: Record<BiasDimension, { tint: string; border: string; text: string; icon: string; label: string }> = {
  funding: {
    tint: "rgba(202, 138, 4, 0.08)",   // amber wash, money / institutional
    border: "rgba(202, 138, 4, 0.28)",
    text: "#854D0E",
    icon: "$",
    label: "Funding",
  },
  methodology: {
    tint: "rgba(8, 145, 178, 0.08)",   // cyan wash, method / rigor
    border: "rgba(8, 145, 178, 0.28)",
    text: "#155E75",
    icon: "M",
    label: "Methodology",
  },
  stakeholder: {
    tint: "rgba(147, 51, 234, 0.08)",  // purple wash, position / lens
    border: "rgba(147, 51, 234, 0.28)",
    text: "#6B21A8",
    icon: "S",
    label: "Stakeholder",
  },
};

const DIMENSION_ORDER: BiasDimension[] = ["funding", "methodology", "stakeholder"];

function Chip({ tag, dimension }: { tag: string; dimension: BiasDimension }) {
  const theme = DIMENSION_THEME[dimension];
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.02em",
    color: theme.text,
    backgroundColor: theme.tint,
    border: `1px solid ${theme.border}`,
    padding: "2px 6px",
    borderRadius: 3,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  };
  return (
    <span style={style} title={`${theme.label}: ${tag}`}>
      <span
        aria-hidden="true"
        style={{
          fontSize: 9,
          fontWeight: 800,
          opacity: 0.6,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        }}
      >
        {theme.icon}
      </span>
      {tag}
    </span>
  );
}

export function BiasBadge({ tags, layout = "inline" }: BiasBadgeProps) {
  if (!tags || tags.length === 0) {
    return null;
  }

  if (layout === "inline") {
    return (
      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
        {tags.map((t, i) => (
          <Chip key={`${t.dimension}-${t.tag}-${i}`} tag={t.tag} dimension={t.dimension} />
        ))}
      </span>
    );
  }

  // grouped layout
  const grouped = DIMENSION_ORDER.map((dim) => ({
    dim,
    items: tags.filter((t) => t.dimension === dim),
  })).filter((g) => g.items.length > 0);

  return (
    <span
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      {grouped.map((g) => (
        <span
          key={g.dim}
          style={{
            display: "inline-flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            {DIMENSION_THEME[g.dim].label}
          </span>
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
            {g.items.map((t, i) => (
              <Chip key={`${t.tag}-${i}`} tag={t.tag} dimension={t.dimension} />
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
