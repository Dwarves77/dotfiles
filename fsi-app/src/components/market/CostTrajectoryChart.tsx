"use client";

/**
 * CostTrajectoryChart — multi-line per cargo vertical chart on /market.
 *
 * Per dispatch G + visual reconciliation §3.4:
 *   "Design includes COST TRAJECTORY prose ... POLICY ACCELERATION
 *    SIGNALS list with sourced badges ..."
 *
 * Data layer status: EMPTY.
 * - No time-series tables in supabase migrations 001-047.
 * - intelligence_items has no historical price snapshots; marketData.priceDate
 *   is a single-point timestamp, not a series.
 * - intelligence_changes (migration 009) is empty (0 rows).
 *
 * Per #33 banner pattern: render a single section banner, NOT
 * per-cell placeholder strings. The banner explains what data
 * powers this chart and the gap between the schema and population.
 */

interface CostTrajectoryChartProps {
  /** Optional list of cargo verticals known to the workspace (drives axis legend
   *  when populated). Currently unused since data is empty; reserved for G2. */
  verticals?: string[];
}

export function CostTrajectoryChart({ verticals = [] }: CostTrajectoryChartProps) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          margin: "16px 0 10px",
        }}
      >
        Cost trajectory
      </div>
      <div
        style={{
          background: "var(--surface)",
          border: "1px dashed var(--border-sub)",
          borderRadius: "var(--r-md)",
          padding: "20px 22px",
          boxShadow: "var(--shadow)",
        }}
      >
        <p
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text)",
            margin: "0 0 6px",
          }}
        >
          Multi-vertical cost trajectory pending time-series population
        </p>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--text-2)",
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          A multi-line chart of cost-per-unit trends across cargo verticals
          (Air, Ocean, Road, Fine Art, Live Events, Luxury Goods,
          Automotive, etc.) requires historical price snapshots not yet
          captured by the agent or worker pipelines. Single-point
          marketData snapshots on each item populate the KEY METRICS rows
          above; aggregation across periods is a follow-up data layer
          dispatch.
          {verticals.length > 0 && (
            <>
              {" "}
              <b style={{ color: "var(--text)", fontWeight: 600 }}>
                Verticals scoped:
              </b>{" "}
              {verticals.slice(0, 6).join(", ")}
              {verticals.length > 6 && ", ..."}.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
