"use client";

/**
 * ImpactMeter — the one impact meter (UI system handoff 2026-09-06,
 * README §0.4). Four scored dimensions (cost, compliance, client-facing,
 * operational), each 1-3.
 *
 * Row variant: four 9px bars on a 1px baseline, sorted ascending
 * left→right, coloured by value (1 green · 2 orange · 3 red) so green is
 * always left and red always right; the sum N/12 sits beside it in
 * tabular numerals. Unscored = a dashed baseline and the Absence
 * component's small-caps reason, never a second "NOT SCORED" row.
 *
 * Full variant (detail rail, dashboard): one continuous bar per dimension
 * over the full green→orange→red ramp, revealed from the left by the score.
 *
 * Mobile (lane moblist, 2026-09-07, mobile-390 spec "LIST ROW"): below
 * 768px the row variant's bars grow to heights 5/10/16 for scores 1/2/3
 * (from 5/7/9) on a rgba(0,0,0,.25) baseline (from --line-1's rgba(0,0,0,.12))
 * and the unscored baseline narrows from 40px to 30px — a CSS media query on
 * this shared part, never a page-local mobile copy.
 *
 * FOLD-56 (2026-09-07): the spec's "8px bars" is resolved as bar WIDTH — bars
 * widen from 4px to 8px below 768px (desktop 4px untouched), additive to the
 * same media block; see DEVIATION-LOG.md's superseded entry for the prior
 * ambiguity note.
 */

import type { ImpactScores } from "@/types/resource";
import { Absence } from "@/components/ui/Absence";

const VALUE_COLOR: Record<number, string> = {
  1: "var(--awareness)",
  2: "var(--action)",
  3: "var(--immediate)",
};

function isScored(scores: ImpactScores | null | undefined): scores is ImpactScores {
  if (!scores) return false;
  const vals = [scores.cost, scores.compliance, scores.client, scores.operational];
  return vals.some((v) => v >= 1);
}

export interface ImpactMeterProps {
  scores?: ImpactScores | null;
  variant?: "row" | "full";
}

export function ImpactMeter({ scores, variant = "row" }: ImpactMeterProps) {
  const scored = isScored(scores);

  if (!scored) {
    return (
      <span
        className={variant === "row" ? "cl-impact-unscored" : undefined}
        aria-label="Impact not scored"
        title="Impact not scored"
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        {variant === "row" && <style>{MOBILE_CSS}</style>}
        <span
          aria-hidden="true"
          className={variant === "row" ? "cl-impact-baseline" : undefined}
          style={{
            width: variant === "full" ? 96 : 40,
            height: 0,
            borderBottom: "1px dashed var(--line-1)",
          }}
        />
        {variant === "row" ? <Absence reason="unscored" /> : <span style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>—</span>}
      </span>
    );
  }

  const s = scores!;
  const dims = [s.cost, s.compliance, s.client, s.operational].sort((a, b) => a - b);
  const sum = dims.reduce((a, b) => a + b, 0);

  if (variant === "full") {
    const labels: Array<[string, number]> = [
      ["Cost", s.cost],
      ["Compliance", s.compliance],
      ["Client-facing", s.client],
      ["Operational", s.operational],
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {labels.map(([label, v]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", width: 84, flexShrink: 0 }}>
              {label}
            </span>
            <span
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background:
                  "linear-gradient(90deg, var(--awareness), var(--action) 50%, var(--immediate))",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  left: `${(v / 3) * 100}%`,
                  background: "var(--tag)",
                }}
              />
            </span>
            <span
              style={{
                fontSize: "var(--fs-11)",
                fontWeight: 700,
                color: VALUE_COLOR[v] ?? "var(--ink-3)",
                fontVariantNumeric: "tabular-nums",
                width: 14,
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {v}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <span
      className="cl-impact-scored"
      aria-label={`Impact ${sum} of 12`}
      style={{ display: "flex", alignItems: "flex-end", gap: 6 }}
    >
      <style>{MOBILE_CSS}</style>
      <span className="cl-impact-bars" style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 9 }}>
        {dims.map((v, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="cl-impact-bar"
            data-score={v}
            style={{
              width: 4,
              height: `${3 + v * 2}px`,
              alignSelf: "flex-end",
              background: VALUE_COLOR[v] ?? "var(--line-1)",
              borderRadius: 1,
            }}
          />
        ))}
      </span>
      <span
        style={{
          fontSize: "var(--fs-11)",
          fontWeight: 700,
          color: "var(--ink-2)",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {sum}/12
      </span>
    </span>
  );
}

// Mobile-390 spec "LIST ROW" (lane moblist, 2026-09-07): row-variant bars grow to heights
// 5/10/16 for scores 1/2/3 on a rgba(0,0,0,.25) baseline below 768px; unscored baseline
// narrows 40px -> 30px. A CSS media query on this shared part, not a page-local override.
// FOLD-56 (F5): bar width also widens 4px -> 8px below 768px (desktop 4px untouched).
const MOBILE_CSS = `
  @media (max-width: 767px) {
    .cl-impact-bars { height: 16px !important; border-bottom: 1px solid rgba(0,0,0,.25); padding-bottom: 1px; }
    .cl-impact-bar { width: 8px !important; }
    .cl-impact-bar[data-score="1"] { height: 5px !important; }
    .cl-impact-bar[data-score="2"] { height: 10px !important; }
    .cl-impact-bar[data-score="3"] { height: 16px !important; }
    .cl-impact-baseline { width: 30px !important; border-bottom-color: rgba(0,0,0,.25) !important; }
  }
`;
