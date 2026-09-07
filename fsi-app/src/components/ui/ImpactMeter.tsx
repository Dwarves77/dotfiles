"use client";

/**
 * ImpactMeter — the one impact meter (UI system handoff 2026-09-06,
 * README §0.4). Four scored dimensions (cost, compliance, client-facing,
 * operational), each 1-3.
 *
 * Row variant: four 9px-wide bars (heights 6/12/18 for scores 1/2/3, top
 * corners radiused, square bottom) on an 18px-tall container with a 1px
 * solid rgba(0,0,0,.25) baseline under them, sorted ascending left→right,
 * coloured by value (1 green · 2 orange · 3 red) so green is always left
 * and red always right; the sum N/12 sits margin-left:7px beside it in
 * tabular numerals (audit item B29-B46, 2026-09-07, artboard #sys list-row
 * example). Unscored = a 30px dashed baseline (operator audit item
 * 2.1, 2026-09-07 ruling — one width, desktop and mobile) and the Absence
 * component's small-caps reason, never a second "NOT SCORED" row.
 *
 * Full variant (detail rail, dashboard): one continuous bar per dimension
 * over the full green→orange→red ramp, revealed from the left by the score.
 *
 * Mobile (lane moblist, 2026-09-07, mobile-390 spec "LIST ROW"): below
 * 768px the row variant's bars grow to heights 5/10/16 for scores 1/2/3
 * (from 5/7/9) on a rgba(0,0,0,.25) baseline (from --line-1's rgba(0,0,0,.12))
 * — a CSS media query on this shared part, never a page-local mobile copy.
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
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          // D1 fix (operator report 2026-09-07): the 30px dashed baseline plus the Absence
          // component's small-caps "unscored" reason is wider than the row's 88px impact
          // column at the row variant's original font size/gap. Rather than shrink the fixed
          // 30px baseline (operator ruling: "one width, desktop and mobile") or the Absence
          // vocabulary's own type scale, this wraps to a second line INSIDE the column instead
          // of bleeding into the DUE column — `minWidth: 0` lets the flex item shrink to the
          // grid cell's actual 88px, `maxWidth: 100%` bounds it there, `flexWrap: wrap` drops
          // the reason onto its own line rather than clipping or overflowing it.
          flexWrap: variant === "row" ? "wrap" : undefined,
          rowGap: 2,
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        {variant === "row" && <style>{MOBILE_CSS}</style>}
        <span
          aria-hidden="true"
          className={variant === "row" ? "cl-impact-baseline" : undefined}
          style={{
            // Operator audit item 2.1 (2026-09-07, CLOSED ruling): "Unscored = a 30px dashed
            // baseline ... one row, everywhere the meter renders, desktop and mobile" — the row
            // variant's baseline is 30px at every viewport (was 40px desktop, 30px mobile-only).
            width: variant === "full" ? 96 : 30,
            height: 0,
            borderBottom: "1px dashed rgba(0,0,0,.3)",
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

  return (
    <span
      className="cl-impact-scored"
      aria-label={`Impact ${sum} of 12`}
      style={{ display: "flex", alignItems: "flex-end", gap: 0, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}
    >
      <style>{MOBILE_CSS}</style>
      <span
        className="cl-impact-bars"
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          height: 18,
          borderBottom: "1px solid rgba(0,0,0,.25)",
        }}
      >
        {dims.map((v, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="cl-impact-bar"
            data-score={v}
            style={{
              width: 9,
              height: `${v * 6}px`,
              alignSelf: "flex-end",
              background: VALUE_COLOR[v] ?? "var(--line-1)",
              borderRadius: "1px 1px 0 0",
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
          marginLeft: 7,
        }}
      >
        {sum}/12
      </span>
    </span>
  );
}

// Mobile-390 spec "LIST ROW" (lane moblist, 2026-09-07): row-variant bars grow to heights
// 5/10/16 for scores 1/2/3 on a rgba(0,0,0,.25) baseline below 768px. A CSS media query on this
// shared part, not a page-local override. FOLD-56 (F5): bar width also widens 4px -> 8px below
// 768px (desktop 4px untouched). Operator audit item 2.1 (2026-09-07): the unscored baseline width
// is now 30px at every viewport (set on the base style above), so `.cl-impact-baseline`'s own
// width rule below is a no-op kept only to carry the mobile-only dashed-line colour change.
const MOBILE_CSS = `
  @media (max-width: 767px) {
    .cl-impact-bars { height: 16px !important; border-bottom: 1px solid rgba(0,0,0,.25); padding-bottom: 1px; }
    .cl-impact-bar { width: 8px !important; }
    .cl-impact-bar[data-score="1"] { height: 5px !important; }
    .cl-impact-bar[data-score="2"] { height: 10px !important; }
    .cl-impact-bar[data-score="3"] { height: 16px !important; }
    .cl-impact-baseline { border-bottom-color: rgba(0,0,0,.25) !important; }
  }
`;
