/**
 * TrajectoryBars · B1 Price signal 12-week trajectory.
 *
 * Sprint 3 A4-3 (2026-05-27). Restored from the H1 Path B strip
 * (2026-05-25) with three structural changes:
 *
 *   1. Data-backed. Reads from item.trajectoryPoints (migration 107
 *      JSONB shape: { points: [{date, value}], base_date, base_label })
 *      instead of the prior hard-coded [35,40,42,...] array. The
 *      operator's integrity rule forbids fabricated data; H1 Path B
 *      stripped the component until schema + ingestion landed.
 *
 *   2. Belt 3 of three. The caller MUST guard on
 *      item.signalBand === 'price' AND item.trajectoryPoints?.points
 *      length before rendering this component. Belts 1 and 2:
 *        Belt 1: migration 107 CHECK constraint (DB)
 *        Belt 2: parse-output.ts validation (agent → DB)
 *      Belt 3 prevents render-side leakage of trajectory UI onto
 *      non-price bands even if the upstream belts fail.
 *
 *   3. Data-derived label. The "Base 100 = …" copy comes from
 *      item.trajectoryPoints.base_label, not a hard-coded string.
 *
 * Visual spec mirrors design_handoff_2026-05/market-intel.html:285-310:
 *   - 12 bars (or fewer if data has fewer points)
 *   - 8px wide, 3px gap, 42px tall container
 *   - Heights = (value / maxValue) * 100, peak bar at 100%
 *   - Gradient palette by height bucket:
 *       ≥ 100      → var(--color-critical)
 *       86-99      → #E8610A
 *       66-85      → #F88527
 *       51-65      → #FBA66C
 *       ≤ 50       → #FCD0BD
 */

import type { Resource } from "@/types/resource";

interface TrajectoryBarsProps {
  trajectoryPoints: NonNullable<Resource["trajectoryPoints"]>;
}

function barColor(heightPct: number): string {
  if (heightPct >= 100) return "var(--color-critical)";
  if (heightPct >= 86) return "#E8610A";
  if (heightPct >= 66) return "#F88527";
  if (heightPct >= 51) return "#FBA66C";
  return "#FCD0BD";
}

export function TrajectoryBars({ trajectoryPoints }: TrajectoryBarsProps) {
  const points = trajectoryPoints.points;
  const max = points.reduce((m, p) => (p.value > m ? p.value : m), 0);
  // Render up to the last 12 points (most recent). Fewer is fine; more
  // gets truncated from the front so the tail (latest data) stays
  // anchored to the right edge.
  const slice = points.length > 12 ? points.slice(points.length - 12) : points;

  return (
    <div
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "10px 12px",
        marginTop: 2,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 800,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          marginBottom: 8,
        }}
      >
        Trajectory · 12 wk
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 3,
          height: 42,
        }}
        role="img"
        aria-label={`Trajectory over ${slice.length} weeks. ${trajectoryPoints.base_label}`}
      >
        {slice.map((p, i) => {
          const heightPct = max > 0 ? Math.round((p.value / max) * 100) : 0;
          return (
            <span
              key={`${p.date}-${i}`}
              style={{
                width: 8,
                background: barColor(heightPct),
                height: `${Math.max(heightPct, 4)}%`,
              }}
              aria-hidden="true"
            />
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--color-text-muted)", marginTop: 6 }}>
        {trajectoryPoints.base_label}
      </div>
    </div>
  );
}
