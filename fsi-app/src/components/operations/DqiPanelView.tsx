/**
 * DqiPanelView — the sync, render-only half of DqiPanel.tsx's VIEW/FETCH split. Separate file for the
 * same reason as market/SurchargeAuditPanelView.tsx (see that file's header): the fetch-only file imports
 * `@/lib/supabase-server`, which pulls Next's server request-tracing chain into an esbuild browser bundle
 * (`@opentelemetry/api` unresolved) — keeping this file's import graph free of that module is the fix.
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
/** The section's own qualifier, rendered by <DetailSection>'s `aside` slot on the profile page. */
export const DQI_SECTION_ASIDE = "per transport chain element, never a mean";

export function DqiPanelView({ rows }: { rows: DqiRow[] }) {
  if (rows.length === 0) {
    return (
      <div data-guard-container="dqi">
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>{DQI_GAP_LINE}</p>
      </div>
    );
  }

  return (
    <div data-guard-container="dqi">
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
