"use client";

import { useState } from "react";
import { IMPACT_LABELS } from "@/lib/constants";
import type { ImpactScores as ImpactScoresType, ImpactReasoning } from "@/types/resource";
import { ChevronDown } from "lucide-react";

/**
 * ImpactScores — 4-dimension impact assessment card.
 *
 * Sprint 3 A5.4 (2026-05-27). Rebuilt to match the mockup `.impact-card`
 * shape from design_handoff_2026-05/regulations-detail.html lines
 * 356-378:
 *
 *   .impact-row {
 *     display: grid;
 *     grid-template-columns: 200px 1fr 80px;
 *     gap: 14px;
 *     align-items: center;
 *   }
 *   .impact-row .score b { font-family: var(--font-display); }
 *
 * Per locked operator Q4: 3 → High, 2 → Moderate, 1 → Low, 0 → hide row.
 *
 * Reads from `scores` prop (which is the result of `r.impactScores ??
 * scoreResource(r)` per the existing pattern — column-first with
 * derivation fallback). When operator's reasoning JSONB is present,
 * the per-row reasoning blurb expands inline under the bar.
 *
 * Replaces the prior chunky-bar visual. The mockup's gradient bars
 * encode severity via color buckets matching the .fill.low /
 * .fill.moderate / .fill.high classes from tokens.css.
 */

interface ImpactScoresProps {
  scores: ImpactScoresType;
  reasoning?: ImpactReasoning;
}

const DIMS = ["cost", "compliance", "client", "operational"] as const;

// Operator Q4 mapping (locked 2026-05-27).
const LEVEL_LABEL_BY_SCORE: Record<number, string> = {
  3: "High",
  2: "Moderate",
  1: "Low",
  0: "",
};

// Gradient palette per score band — matches mockup .fill.low / .moderate / .high.
function gradientFor(score: number): string {
  if (score >= 3) {
    return "linear-gradient(90deg, #FCD0BD 0%, #F88527 55%, var(--color-critical) 100%)";
  }
  if (score === 2) {
    return "linear-gradient(90deg, #FCD0BD 0%, #FBA66C 60%, #F88527 100%)";
  }
  if (score === 1) {
    return "linear-gradient(90deg, #FFE9DC 0%, #FCD0BD 100%)";
  }
  return "transparent";
}

function colorFor(score: number): string {
  if (score >= 3) return "var(--color-critical)";
  if (score === 2) return "var(--color-high)";
  if (score === 1) return "var(--color-moderate)";
  return "var(--color-text-muted)";
}

export function ImpactScores({ scores, reasoning }: ImpactScoresProps) {
  const [expanded, setExpanded] = useState(false);

  // Operator Q4: score === 0 → hide row entirely. Pre-filter the dims
  // so the layout doesn't reserve space for absent dimensions.
  const visible = DIMS.filter((dim) => (scores[dim] || 0) > 0);

  // If every dim is 0, the whole card collapses to a small note rather
  // than rendering 4 zero-bars (integrity-preserving silence).
  if (visible.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-primary)" }}>
          Impact Assessment
        </span>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic" }}>
          No scored dimensions yet
        </span>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-primary)" }}>
          Impact Assessment
        </span>
        {reasoning && (
          <button
            type="button"
            onClick={() => setExpanded((s) => !s)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
            aria-expanded={expanded}
          >
            {expanded ? "Hide reasoning" : "Show reasoning"}
            <ChevronDown
              size={11}
              style={{
                transition: "transform 200ms var(--ease-out-expo, ease-out)",
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {visible.map((dim) => {
          const score = scores[dim] || 0;
          const label = IMPACT_LABELS[dim];
          const levelLabel = LEVEL_LABEL_BY_SCORE[score] || "";
          const widthPct = (score / 3) * 100;
          return (
            <div key={dim}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "200px 1fr 90px",
                  gap: 14,
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                  {label}
                </span>
                <div
                  style={{
                    height: 10,
                    background: "var(--color-surface-raised)",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                  aria-hidden="true"
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${widthPct}%`,
                      background: gradientFor(score),
                      transition: "width 400ms var(--ease-out-expo, ease-out)",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 12.5,
                    color: colorFor(score),
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  <b style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>{score}/3</b>
                  {" "}
                  · {levelLabel}
                </span>
              </div>
              {expanded && reasoning?.[dim] && (
                <p style={{ fontSize: 12, lineHeight: 1.55, color: "var(--color-text-muted)", margin: "6px 0 0", paddingLeft: 200 + 14 }}>
                  {reasoning[dim]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
