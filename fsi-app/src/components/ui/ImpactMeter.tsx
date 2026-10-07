"use client";

/**
 * ImpactMeter, the one impact meter. Four scored dimensions (cost,
 * compliance, client-facing, operational), each 1-3, sum to N/12.
 *
 * ROW VARIANT, REPLACED 2026-10-07 (lane PAR-1, Claude Design artboard 22, ruling B, verbatim:
 * "Twelve equal 12 px segments in four groups of three, filled left to right in the ramp colour.
 * Replaces the stepped four-bar meter everywhere, legend included."). The stepped four-bar fill
 * (2026-09-18, parts brief 2.16) is deleted, not kept beside it: one row meter, one implementation.
 *
 * The row draws the TOTAL N/12 as twelve equal segments in four groups of three. Segment i (0..11)
 * is filled when i < N, so the fill runs left to right and one point is one segment. ALL filled
 * segments share ONE colour, read off the severity ramp at N (linear interpolation between the
 * stops 1 #16A34A, 4 #CA8A04, 7 #F97316, 12 #DC2626), never a per-segment colour, so the
 * composition of the four dimensions never changes the rendered markup for a given N (byte-identical,
 * asserted by ImpactMeter.npmtest.mjs). The unfilled track is #E5E1DB. Unscored draws the same
 * twelve segments as 1px dashed rgba(0,0,0,.3) outlines with no fill, plus an em dash in the score
 * slot (Absence's `dash` variant) and no word. The accessible label states the value in words
 * ("Impact N of 12"), the segments are decoration.
 *
 * GEOMETRY, one reading recorded (see the lane's DESIGN CHANGES OWED entry): the ruling says "12 px
 * segments" and the system sheet gives no gap, so a segment is 12 px TALL and ROW_SEGMENT_WIDTH_PX
 * wide, because the list row's impact track is a fixed 88 px (README 0.4) that must also hold the
 * N/12 figure; twelve segments 12 px WIDE would need about 180 px. Every number is an exported
 * constant, so a ruling that reads the 12 px the other way is a one-line change here and the row
 * grid is untouched either way. No media query: the row variant draws the same at every width.
 *
 * `total` lets a caller with no per-dimension scores render the meter at a known N directly (the
 * legend row, brief 2.16: "the legend row on every list uses this exact meter at 8/12", rendered as
 * `<ImpactMeter total={8} />`). `scores` still derives N as the sum of the four dimensions for
 * every list row, which is the only caller that has dimensions at all.
 *
 * FULL VARIANT (detail rail, dashboard) IS UNCHANGED: one continuous bar per dimension over the
 * full green→orange→red ramp, revealed from the left by the score.
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

/** Geometry of the row variant (artboard 22, ruling B). Exported for the test. */
export const ROW_SEGMENT_COUNT = 12;
export const ROW_SEGMENT_GROUP_SIZE = 3;
export const ROW_SEGMENT_HEIGHT_PX = 12;
export const ROW_SEGMENT_WIDTH_PX = 3;
export const ROW_SEGMENT_GAP_PX = 1;
export const ROW_GROUP_GAP_PX = 3;
export const ROW_SEGMENT_RADIUS_PX = 1;
export const ROW_TRACK_COLOR = "#E5E1DB";

/** Segment i (0-based, left to right) is filled when it is below the total. Exported for the test. */
export function segmentFilled(n: number, i: number): boolean {
  return i < n;
}

/** The segment indexes of each group, [[0,1,2],[3,4,5],[6,7,8],[9,10,11]]. */
const SEGMENT_GROUPS: ReadonlyArray<readonly number[]> = Array.from(
  { length: ROW_SEGMENT_COUNT / ROW_SEGMENT_GROUP_SIZE },
  (_, g) => Array.from({ length: ROW_SEGMENT_GROUP_SIZE }, (_, k) => g * ROW_SEGMENT_GROUP_SIZE + k),
);

/** The twelve segments in four groups of three, drawn by both the scored and the unscored row so the
 *  two can never drift apart. `segment(i)` supplies each segment's own paint. */
function Segments({ segment }: { segment: (i: number) => React.CSSProperties }) {
  return (
    <span
      className="cl-impact-bars"
      style={{ display: "flex", alignItems: "center", gap: ROW_GROUP_GAP_PX, flexShrink: 0 }}
    >
      {SEGMENT_GROUPS.map((group, g) => (
        <span
          key={g}
          aria-hidden="true"
          className="cl-impact-group"
          style={{ display: "flex", alignItems: "center", gap: ROW_SEGMENT_GAP_PX }}
        >
          {group.map((i) => (
            <span
              key={i}
              aria-hidden="true"
              className="cl-impact-bar"
              style={{
                boxSizing: "border-box",
                width: ROW_SEGMENT_WIDTH_PX,
                height: ROW_SEGMENT_HEIGHT_PX,
                borderRadius: ROW_SEGMENT_RADIUS_PX,
                ...segment(i),
              }}
            />
          ))}
        </span>
      ))}
    </span>
  );
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
      style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}
    >
      <Segments segment={(i) => ({ background: segmentFilled(n, i) ? color : ROW_TRACK_COLOR })} />
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
 * B3 (operator, 2026-09-08, carried through the 2026-09-18 and 2026-10-07 rewrites): "the meter column gets ... an em
 * dash in the score slot and NO literal UNSCORED". The dash stays and only the segments beside
 * it change: the same twelve segments as 1px dashed rgba(0,0,0,.3) outlines, no fill, no word.
 */
function RowUnscored() {
  return (
    <span
      className="cl-impact-scored cl-impact-unscored"
      aria-label="Impact not scored"
      title="Impact not scored"
      style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}
    >
      <Segments segment={() => ({ border: "1px dashed rgba(0,0,0,.3)" })} />
      <span style={{ fontSize: "var(--fs-11)" }}>
        <Absence reason="unscored" variant="dash" />
      </span>
    </span>
  );
}

/** Unchanged by the row-meter replacement: one continuous bar per dimension over the full
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
