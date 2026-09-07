"use client";

/**
 * ImpactMeter — the one impact meter (UI system handoff 2026-09-06,
 * README §0.4). Four scored dimensions (cost, compliance, client-facing,
 * operational), each 1-3.
 *
 * Row variant: four 9px bars on a 1px baseline, sorted ascending
 * left→right, coloured by value (1 green · 2 orange · 3 red) so green is
 * always left and red always right; the sum N/12 sits beside it in
 * tabular numerals. Unscored = a dashed baseline and an em dash, never a
 * second "NOT SCORED" row.
 *
 * Full variant (detail rail, dashboard): one continuous bar per dimension
 * over the full green→orange→red ramp, revealed from the left by the score.
 */

import type { ImpactScores } from "@/types/resource";

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
        aria-label="Impact not scored"
        title="Impact not scored"
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        <span
          aria-hidden="true"
          style={{
            width: variant === "full" ? 96 : 40,
            height: 0,
            borderBottom: "1px dashed var(--line-1)",
          }}
        />
        <span style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>—</span>
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
      aria-label={`Impact ${sum} of 12`}
      style={{ display: "flex", alignItems: "flex-end", gap: 6 }}
    >
      <span style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 9 }}>
        {dims.map((v, i) => (
          <span
            key={i}
            aria-hidden="true"
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
