/**
 * OemRoadmapPanelView — the sync, render-only half of OemRoadmapPanel.tsx's VIEW/FETCH split. Separate
 * file for the same reason as SurchargeAuditPanelView.tsx (see that file's header): OemRoadmapPanel.tsx
 * imports `@/lib/supabase-server`, which pulls Next's server request-tracing chain into an esbuild
 * browser bundle (`@opentelemetry/api` unresolved) — keeping this file's import graph free of that
 * module entirely is the reliable fix.
 */

import { tcoCrossoverBand } from "@/lib/spec09/oem-payload.mjs";
import "@/components/market/spec09.css";

export interface OemRoadmapRow {
  roadmap_id: string;
  tech_category: string;
  commercial_stage: string;
  target_year: number | null;
  density_basis: string | null;
  confidence_admiralty: string | null;
  announced_at: string;
}

export const OEM_ROADMAP_GAP_LINE =
  "No rows yet — source: none confirmed, OEM announcements have no $0 structured feed (scripts/spec09/SOURCES.md).";

export function OemRoadmapPanelView({ rows }: { rows: OemRoadmapRow[] }) {
  if (rows.length === 0) {
    return (
      <div data-guard-container="oem-roadmap" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 10px" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
          <strong style={{ color: "var(--color-text-secondary)" }}>OEM equipment roadmap</strong> · {OEM_ROADMAP_GAP_LINE}
        </p>
      </div>
    );
  }

  const tco = tcoCrossoverBand();

  return (
    <div data-guard-container="oem-roadmap" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 28px" }}>
      <div className="spec09-panel-header">
        <h2 className="spec09-panel-title" data-guard-title>
          OEM equipment roadmap
        </h2>
        <span className="spec09-panel-subtitle">
          TRL 7-9 · vendor claims, evidence of intent, never of capability
        </span>
      </div>
      <p className="spec09-row-text" style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>
        Diesel-parity TCO crossover: {tco.reason}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {rows.map((row) => (
          <div key={row.roadmap_id} className="cl-card" style={{ border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg-surface)", padding: "12px 16px" }}>
            <div className="spec09-row-text" style={{ fontSize: 13, fontWeight: 700 }}>{row.tech_category.replace(/_/g, " ")}</div>
            <div className="spec09-row-text" style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "4px 0" }}>
              {row.commercial_stage.replace(/_/g, " ")}{row.target_year ? ` · target ${row.target_year}` : ""}
            </div>
            <div className="spec09-row-text" style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>
              Density basis: {row.density_basis ?? "M (missing)"} · Confidence: {row.confidence_admiralty ?? "M"} (floor not yet set)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
