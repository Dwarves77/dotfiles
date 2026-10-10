/**
 * GridQueuePanelView — the sync, render-only half of GridQueuePanel.tsx's VIEW/FETCH split. Separate file
 * for the same reason as market/OemRoadmapPanelView.tsx (see that file's header).
 *
 * DECISION HORIZON: src/lib/spec09/grid-queue.mjs's evaluateGridQueueGate() takes the CALLER's own
 * decision horizon — it is never invented by the calculator. This view is a read-only status board (no
 * per-row decision to make on this screen), so it evaluates every row against one shared, clearly
 * labelled standing horizon (DECISION_HORIZON_MONTHS below) rather than fabricating a per-row horizon the
 * table carries no column for. A caller with a real per-decision horizon should call
 * evaluateGridQueueGate() directly rather than read this view's BLOCKED/CLEAR label as its own answer.
 */
/**
 * SECTION BODY, NOT A PANEL (UI fix round 2026-09-08, item D3). This used to render as a full-width
 * strip below the /operations list, under artboard 08's last card, carrying its own page-frame wrapper
 * (max-width 1180, 36px side padding) and its own `spec09-panel-header` heading. The operator's
 * page-scope ruling moves the material onto the Operations PROFILE page as an S-section, so this file
 * now renders ROWS ONLY: the frame is DetailShell.tsx's <DetailSection>, which supplies the card, the
 * 3px section rule, the heading and the `aside` the subtitle below now fills. The heading element that
 * carries `data-guard-title` (F35's squeezed-title detector) is that <DetailSection> h2 — this file
 * deliberately renders no second title of its own, the same delegation ObligationRegister.tsx states
 * for itself.
 */


import { evaluateGridQueueGate } from "@/lib/spec09/grid-queue.mjs";
import "@/components/market/spec09.css";
import { CoverageState } from "@/components/ui/CoverageState";

export interface GridQueueRow {
  queue_id: string;
  dso_name: string;
  /** NULL on a per-substation headroom row (migration 379): the publisher states no band. */
  capacity_band_mw: string | null;
  queue_months_p50: number | null;
  queue_months_p90: number | null;
  as_of: string;
  /** Per-substation evidence (migration 379, UK Power Networks LTDS Capacity Heatmap). Absent on a band-level row. */
  substation_name?: string | null;
  demand_firm_mw?: number | null;
  demand_available_mw?: number | null;
  demand_constraint?: string | null;
  demand_constraint_limiting_factor?: string | null;
}

/** The one line a per-substation row shows in place of a band: headroom in MW as published (a deficit is
 *  negative and shown as is), the firm capacity it sits against, and the publisher's constraint indicator. */
export function substationEvidenceLine(row: GridQueueRow): string | null {
  if (row.demand_available_mw == null && row.demand_constraint == null) return null;
  const parts: string[] = [];
  if (row.demand_available_mw != null) {
    parts.push(`${row.demand_available_mw} MW demand headroom${row.demand_firm_mw != null ? ` of ${row.demand_firm_mw} MW firm` : ""}`);
  }
  if (row.demand_constraint != null) {
    parts.push(`constraint ${row.demand_constraint}${row.demand_constraint_limiting_factor ? ` (${row.demand_constraint_limiting_factor})` : ""}`);
  }
  return parts.join(", ");
}

const DECISION_HORIZON_MONTHS = 24;
export const GRID_QUEUE_GAP_LINE =
  "No rows yet — source: none confirmed, no $0 feed for demand-side connection-queue months (scripts/spec09/SOURCES.md).";
/** The section's own qualifier, rendered by <DetailSection>'s `aside` slot on the profile page. */
export const GRID_QUEUE_SECTION_ASIDE = `a gate, not a cost line · ${DECISION_HORIZON_MONTHS}-month standing horizon`;

export function GridQueuePanelView({ rows }: { rows: GridQueueRow[] }) {
  if (rows.length === 0) {
    return (
      <div data-guard-container="grid-queue">
        {/* COV-1: the "not covered" state (spec 00 section 4), with the source reason this file already carried. */}
        <CoverageState state="not_covered" variant="inline" subject="Grid connection queue" reason={GRID_QUEUE_GAP_LINE} requestRef="/operations#grid-queue" />
      </div>
    );
  }

  return (
    <div data-guard-container="grid-queue">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row) => {
          const gate = evaluateGridQueueGate({ queueMonthsP90: row.queue_months_p90, horizonMonths: DECISION_HORIZON_MONTHS });
          const status = gate.label === "M" ? "UNKNOWN" : (gate.value as string);
          // Absence rule (2026-09-25 close): a value that cannot exist yet names the data it needs.
          // evaluateGridQueueGate's own UNKNOWN/M branches always carry a `.reason`/`.note` string
          // (grid-queue.mjs); the bare "UNKNOWN" label used to discard it and tell the reader
          // nothing beyond the status word itself.
          const statusDetail = status === "UNKNOWN" ? (gate as { reason?: string }).reason ?? "needs queue_months_p90 for this DSO/capacity band" : null;
          const tone =
            status === "BLOCKED" ? "#b3261e" : status === "CLEAR" ? "var(--color-text-secondary)" : "var(--color-text-muted)";
          return (
            <div key={row.queue_id} className="cl-card" style={{ border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg-surface)", padding: "12px 16px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div className="spec09-row-text">
                <div style={{ fontSize: 13, fontWeight: 700 }}>{row.substation_name ?? row.dso_name}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                  {row.capacity_band_mw ?? (row.substation_name ? `${row.dso_name}. ${substationEvidenceLine(row) ?? ""}` : "")}
                </div>
              </div>
              <div className="spec09-row-text" style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: tone }} title={statusDetail ?? undefined}>{status}</div>
                <div style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>
                  p50 {row.queue_months_p50 ?? "needs p50 queue months"}mo · p90 {row.queue_months_p90 ?? "needs p90 queue months"}mo · as of {row.as_of}
                </div>
                {statusDetail && (
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>{statusDetail}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
