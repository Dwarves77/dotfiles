/**
 * OemRoadmapPanelView — the sync, render-only half of OemRoadmapPanel.tsx's VIEW/FETCH split. Separate
 * file, not a second export in the same module: OemRoadmapPanel.tsx imports `@/lib/supabase-server`, which
 * pulls Next's server request-tracing chain (transitively requires `@opentelemetry/api`, absent from a
 * plain esbuild browser bundle; proven live while building `spec09-smoke.mjs`). Because ESM tree-shaking
 * cannot always drop an import with module-level side effects, keeping the fetch-only imports out of THIS
 * file's module graph entirely is the reliable fix. This is the canonical statement of the split's
 * rationale that every other spec-09 panel view and the corridors-applied strip point to.
 */

import { tcoCrossoverBand } from "@/lib/spec09/oem-payload.mjs";
import "@/components/market/spec09.css";
import { CoverageState } from "@/components/ui/CoverageState";

export interface OemRoadmapRow {
  roadmap_id: string;
  tech_category: string;
  commercial_stage: string;
  target_year: number | null;
  density_basis: string | null;
  confidence_admiralty: string | null;
  announced_at: string;
}

const OEM_ROADMAP_GAP_LINE =
  "No rows yet — source: none confirmed, OEM announcements have no $0 structured feed (scripts/spec09/SOURCES.md).";

export function OemRoadmapPanelView({ rows }: { rows: OemRoadmapRow[] }) {
  if (rows.length === 0) {
    return (
      <div data-guard-container="oem-roadmap" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 10px" }}>
        {/* COV-1: an empty roadmap is the "not covered" state (spec 00 section 4): a named gap, the source reason
            this file already carried, and the Request coverage action. */}
        <CoverageState state="not_covered" variant="inline" subject="OEM equipment roadmap" reason={OEM_ROADMAP_GAP_LINE} requestRef="/market#oem-roadmap" />
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
