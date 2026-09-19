"use client";

/**
 * ImpactMeter, the one impact meter. Four scored dimensions (cost,
 * compliance, client-facing, operational), each 1-3, sum to N/12.
 *
 * ROW VARIANT, REWRITTEN 2026-09-18 (site-wide parts brief, docs/design/parts-brief-2026-09-18.md
 * section 2.16, "IMPACT METER, ROW VARIANT (revised 2026-09-18)"). The brief replaced the row
 * variant's model outright: the four bars used to be the four SCORED DIMENSIONS, sorted ascending,
 * each its own height and colour, so two rows with the same sum could render visibly different bar
 * patterns (sum 6 as [3,3,0,0] vs [1,1,2,2]), which the parts inventory's own audit named as the
 * defect the brief's acceptance test is built to catch ("group rows by N, every row renders
 * byte-identical markup"). The row now draws a STEPPED FILL OF THE TOTAL N/12: four bars at fixed
 * heights 6/9/12/15px, 8px wide, gap 2, radius 1.5, on an unfilled track #E5E1DB; each bar holds 3
 * of the 12 points and fills bottom-up, left to right:
 *
 *     fill_i = clamp(N - 3*i, 0, 3) / 3   for i = 0..3
 *
 * ALL filled bars share ONE colour, read off the severity ramp at N (linear interpolation between
 * the stops 1 #16A34A, 4 #CA8A04, 7 #F97316, 12 #DC2626), never a per-bar colour, so the composition
 * of the four dimensions never changes the rendered markup for a given N (byte-identical, asserted
 * by ImpactMeter.npmtest.mjs). Unscored draws the same four bars as 1px dashed rgba(0,0,0,.3)
 * outlines with no fill, plus an em dash in the score slot (Absence's `dash` variant) and no word.
 * The 768px mobile geometry is not drawn by the brief; per the coordinator's ruling (lane w10a,
 * 2026-09-18) the row variant's geometry is unchanged at every width, so there is no longer a
 * mobile media query on this file (the prior 5/10/16px score-height swap governed the OLD
 * per-dimension model and does not apply to a stepped total).
 *
 * `total` lets a caller with no per-dimension scores render the meter at a known N directly (the
 * legend row, brief 2.16: "the legend row on every list uses this exact meter at 8/12", rendered as
 * `<ImpactMeter total={8} />`). `scores` still derives N as the sum of the four dimensions for
 * every list row, which is the only caller that has dimensions at all.
 *
 * FULL VARIANT (detail rail, dashboard) IS UNCHANGED by this brief: one continuous bar per
 * dimension over the full green→orange→red ramp, revealed from the left by the score.
 */

import type { ImpactScores } from "@/types/resource";
import { Absence } from "@/components/ui/Absence";

const VALUE_COLOR: Record<number, string> = {
  1: "var(--awareness)",
  2: "var(--action)",
  3: "var(--immediate)",
};

/** The one "is this item scored?" predicate. Exported (lane comp-06, 2026-09-08) so a surface that
 *  must COUNT its unscored rows, /research's band transition strip, artboard 06/id="p6"
 *  ("Awareness · N findings sit below the scoring threshold and are kept for context"), asks the
 *  meter itself rather than re-deriving the threshold beside it. */
export function isImpactScored(scores: ImpactScores | null | undefined): scores is ImpactScores {
  if (!scores) return false;
  const vals = [scores.cost, scores.compliance, scores.client, scores.operational];
  return vals.some((v) => v >= 1);
}

/** Sum the four dimensions to N/12. Exported for the test. */
export function sumScores(scores: ImpactScores): number {
  return scores.cost + scores.compliance + scores.client + scores.operational;
}

/**
 * THE SEVERITY RAMP (brief 2.16, verbatim stops): 1 -> #16A34A, 4 -> #CA8A04, 7 -> #F97316,
 * 12 -> #DC2626, linear interpolation between adjacent stops in RGB space, clamped at the ends.
 * Exported for the test (the brief's own worked examples: 3 -> #8E921B, 5 -> #DA820A, 9 -> #ED541C).
 */
const RAMP_STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [1, [0x16, 0xa3, 0x4a]],
  [4, [0xca, 0x8a, 0x04]],
  [7, [0xf9, 0x73, 0x16]],
  [12, [0xdc, 0x26, 0x26]],
];

function toHex2(v: number): string {
  return Math.round(v).toString(16).padStart(2, "0").toUpperCase();
}

export function rampColor(n: number): string {
  const [minN] = RAMP_STOPS[0];
  const [maxN] = RAMP_STOPS[RAMP_STOPS.length - 1];
  const clamped = Math.min(Math.max(n, minN), maxN);
  for (let i = 0; i < RAMP_STOPS.length - 1; i += 1) {
    const [n0, c0] = RAMP_STOPS[i];
    const [n1, c1] = RAMP_STOPS[i + 1];
    if (clamped >= n0 && clamped <= n1) {
      const t = n1 === n0 ? 0 : (clamped - n0) / (n1 - n0);
      const r = c0[0] + (c1[0] - c0[0]) * t;
      const g = c0[1] + (c1[1] - c0[1]) * t;
      const b = c0[2] + (c1[2] - c0[2]) * t;
      return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
    }
  }
  const [, lastColor] = RAMP_STOPS[RAMP_STOPS.length - 1];
  return `#${toHex2(lastColor[0])}${toHex2(lastColor[1])}${toHex2(lastColor[2])}`;
}

/** Geometry constants for the row variant's stepped fill (brief 2.16, verbatim). Exported for the
 *  test. */
export const ROW_BAR_WIDTH_PX = 8;
export const ROW_BAR_GAP_PX = 2;
export const ROW_BAR_RADIUS_PX = 1.5;
export const ROW_BAR_HEIGHTS_PX: readonly number[] = [6, 9, 12, 15];
export const ROW_TRACK_COLOR = "#E5E1DB";

/** fill_i = clamp(N - 3*i, 0, 3) / 3, the fraction (0..1) of bar i's OWN height that is filled from
 *  the bottom. Exported for the test. */
export function barFillFraction(n: number, i: number): number {
  return Math.min(Math.max(n - 3 * i, 0), 3) / 3;
}

export interface ImpactMeterProps {
  scores?: ImpactScores | null;
  /** A known total (0-12) to render directly, bypassing per-dimension derivation. The legend row
   *  is the one caller with no scores at all: `<ImpactMeter total={8} />` (brief 2.16). */
  total?: number;
  variant?: "row" | "full";
}

export function ImpactMeter({ scores, total, variant = "row" }: ImpactMeterProps) {
  if (variant === "full") {
    return <FullVariant scores={scores} />;
  }
  if (total == null && !isImpactScored(scores)) {
    return <RowUnscored />;
  }
  const n = total ?? sumScores(scores!);
  return <RowScored n={n} />;
}

function RowScored({ n }: { n: number }) {
  const color = rampColor(n);
  return (
    <span
      className="cl-impact-scored"
      aria-label={`Impact ${n} of 12`}
      style={{ display: "flex", alignItems: "flex-end", gap: 6, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}
    >
      <span
        className="cl-impact-bars"
        style={{ display: "flex", alignItems: "flex-end", gap: ROW_BAR_GAP_PX }}
      >
        {ROW_BAR_HEIGHTS_PX.map((h, i) => {
          const fillPx = h * barFillFraction(n, i);
          return (
            <span
              key={i}
              aria-hidden="true"
              className="cl-impact-bar"
              style={{
                position: "relative",
                width: ROW_BAR_WIDTH_PX,
                height: h,
                borderRadius: ROW_BAR_RADIUS_PX,
                background: ROW_TRACK_COLOR,
                overflow: "hidden",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: fillPx,
                  background: color,
                  borderRadius: ROW_BAR_RADIUS_PX,
                }}
              />
            </span>
          );
        })}
      </span>
      <span
        style={{
          fontSize: "var(--fs-11)",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        <b style={{ fontWeight: 700, color: "var(--ink)" }}>{n}</b>
        <span style={{ color: "#7A6E6C" }}>/12</span>
      </span>
    </span>
  );
}

/**
 * B3 (operator, 2026-09-08, carried into the 2026-09-18 rewrite): "the meter column gets ... an em
 * dash in the score slot and NO literal UNSCORED". Brief 2.16 keeps that dash and changes only the
 * bars beside it: the same four bars as 1px dashed rgba(0,0,0,.3) outlines, no fill, no word.
 */
function RowUnscored() {
  return (
    <span
      className="cl-impact-scored cl-impact-unscored"
      aria-label="Impact not scored"
      title="Impact not scored"
      style={{ display: "flex", alignItems: "flex-end", gap: 6, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}
    >
      <span
        className="cl-impact-bars"
        style={{ display: "flex", alignItems: "flex-end", gap: ROW_BAR_GAP_PX }}
      >
        {ROW_BAR_HEIGHTS_PX.map((h, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="cl-impact-bar"
            data-score="unscored"
            style={{
              boxSizing: "border-box",
              width: ROW_BAR_WIDTH_PX,
              height: h,
              borderRadius: ROW_BAR_RADIUS_PX,
              border: "1px dashed rgba(0,0,0,.3)",
            }}
          />
        ))}
      </span>
      <span style={{ fontSize: "var(--fs-11)" }}>
        <Absence reason="unscored" variant="dash" />
      </span>
    </span>
  );
}

/** Unchanged by the 2026-09-18 brief: one continuous bar per dimension over the full
 *  green→orange→red ramp, revealed from the left by the score. */
function FullVariant({ scores }: { scores?: ImpactScores | null }) {
  if (!isImpactScored(scores)) {
    return (
      <span
        aria-label="Impact not scored"
        title="Impact not scored"
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        <span
          aria-hidden="true"
          style={{ width: 96, height: 0, borderBottom: "1px dashed rgba(0,0,0,.3)" }}
        />
        <span style={{ fontSize: "var(--fs-11)" }}>
          <Absence reason="unscored" variant="dash" />
        </span>
      </span>
    );
  }
  const s = scores!;
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
          <span style={{ fontSize: "var(--fs-125)", color: "var(--ink-2)", width: 116, flexShrink: 0 }}>
            {label}
          </span>
          <span
            style={{
              flex: 1,
              height: 8,
              borderRadius: 8,
              background:
                "linear-gradient(90deg, var(--awareness), var(--action) 55%, var(--immediate))",
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
