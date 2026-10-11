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
