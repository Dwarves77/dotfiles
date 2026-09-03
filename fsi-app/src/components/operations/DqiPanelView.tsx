/**
 * DqiPanelView — the sync, render-only half of DqiPanel.tsx's VIEW/FETCH split. Separate file for the
 * same reason as market/SurchargeAuditPanelView.tsx (see that file's header): the fetch-only file imports
 * `@/lib/supabase-server`, which pulls Next's server request-tracing chain into an esbuild browser bundle
 * (`@opentelemetry/api` unresolved) — keeping this file's import graph free of that module is the fix.
 */

import { isPrimaryLeg } from "@/lib/spec09/dqi.mjs";
import "@/components/market/spec09.css";

export interface DqiRow {
  dqi_id: string;
  tce_id: string;
  reliability: number;
  completeness: number;
  temporal_correlation: number;
  geographical_correlation: number;
  technological_correlation: number;
  primary_data_share: number;
}

export const DQI_GAP_LINE = "No rows yet — source: none, DQI evidence is shipment-specific (scripts/spec09/SOURCES.md).";

export function DqiPanelView({ rows }: { rows: DqiRow[] }) {
  if (rows.length === 0) {
    return (
      <div data-guard-container="dqi" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 10px" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
          <strong style={{ color: "var(--color-text-secondary)" }}>Data quality index</strong> · {DQI_GAP_LINE}
        </p>
      </div>
    );
  }

  return (
    <div data-guard-container="dqi" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 28px" }}>
      <div className="spec09-panel-header">
        <h2 className="spec09-panel-title" data-guard-title>
          Data quality index
        </h2>
        <span className="spec09-panel-subtitle">
          per transport chain element, never a mean
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((row) => (
          <div key={row.dqi_id} className="cl-card" style={{ border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg-surface)", padding: "10px 14px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span className="spec09-row-text" style={{ fontSize: 12, fontWeight: 700 }}>{row.tce_id}</span>
            <span className="spec09-row-text" style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
              {Math.round(row.primary_data_share * 100)}% primary {isPrimaryLeg(row.primary_data_share) ? "(primary leg)" : ""}
            </span>
            <span className="spec09-row-text" style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>
              R{row.reliability} C{row.completeness} T{row.temporal_correlation} G{row.geographical_correlation} Tech{row.technological_correlation}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
