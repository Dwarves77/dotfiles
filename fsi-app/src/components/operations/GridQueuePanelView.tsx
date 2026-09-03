/**
 * GridQueuePanelView — the sync, render-only half of GridQueuePanel.tsx's VIEW/FETCH split. Separate file
 * for the same reason as market/SurchargeAuditPanelView.tsx (see that file's header).
 *
 * DECISION HORIZON: src/lib/spec09/grid-queue.mjs's evaluateGridQueueGate() takes the CALLER's own
 * decision horizon — it is never invented by the calculator. This view is a read-only status board (no
 * per-row decision to make on this screen), so it evaluates every row against one shared, clearly
 * labelled standing horizon (DECISION_HORIZON_MONTHS below) rather than fabricating a per-row horizon the
 * table carries no column for. A caller with a real per-decision horizon should call
 * evaluateGridQueueGate() directly rather than read this view's BLOCKED/CLEAR label as its own answer.
 */

import { evaluateGridQueueGate } from "@/lib/spec09/grid-queue.mjs";
import "@/components/market/spec09.css";

export interface GridQueueRow {
  queue_id: string;
  dso_name: string;
  capacity_band_mw: string;
  queue_months_p50: number | null;
  queue_months_p90: number | null;
  as_of: string;
}

export const DECISION_HORIZON_MONTHS = 24;
export const GRID_QUEUE_GAP_LINE =
  "No rows yet — source: none confirmed, no $0 feed for demand-side connection-queue months (scripts/spec09/SOURCES.md).";

export function GridQueuePanelView({ rows }: { rows: GridQueueRow[] }) {
  if (rows.length === 0) {
    return (
      <div data-guard-container="grid-queue" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 10px" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
          <strong style={{ color: "var(--color-text-secondary)" }}>Grid connection queue</strong> · {GRID_QUEUE_GAP_LINE}
        </p>
      </div>
    );
  }

  return (
    <div data-guard-container="grid-queue" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 28px" }}>
      <div className="spec09-panel-header">
        <h2 className="spec09-panel-title" data-guard-title>
          Grid connection queue
        </h2>
        <span className="spec09-panel-subtitle">
          a gate, not a cost line · {DECISION_HORIZON_MONTHS}-month standing horizon
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row) => {
          const gate = evaluateGridQueueGate({ queueMonthsP90: row.queue_months_p90, horizonMonths: DECISION_HORIZON_MONTHS });
          const status = gate.label === "M" ? "UNKNOWN" : (gate.value as string);
          const tone =
            status === "BLOCKED" ? "#b3261e" : status === "CLEAR" ? "var(--color-text-secondary)" : "var(--color-text-muted)";
          return (
            <div key={row.queue_id} className="cl-card" style={{ border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg-surface)", padding: "12px 16px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div className="spec09-row-text">
                <div style={{ fontSize: 13, fontWeight: 700 }}>{row.dso_name}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{row.capacity_band_mw}</div>
              </div>
              <div className="spec09-row-text" style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: tone }}>{status}</div>
                <div style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>
                  p50 {row.queue_months_p50 ?? "M"}mo · p90 {row.queue_months_p90 ?? "M"}mo · as of {row.as_of}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
