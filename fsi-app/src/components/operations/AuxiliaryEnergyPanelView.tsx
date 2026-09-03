/**
 * AuxiliaryEnergyPanelView — the sync, render-only half of AuxiliaryEnergyPanel.tsx's VIEW/FETCH split.
 * Separate file for the same reason as market/SurchargeAuditPanelView.tsx (see that file's header).
 */

import { computeEnergyConsumedKwh } from "@/lib/spec09/auxiliary-energy.mjs";
import "@/components/market/spec09.css";

export interface AuxiliaryEnergyRow {
  profile_id: string;
  load_type: string;
  kw_draw: number;
  duty_cycle: number;
  hours_typical: number;
  setpoint_c: number | null;
  setpoint_rh_pct: number | null;
  grid_intensity_source: string | null;
}

export const AUXILIARY_ENERGY_GAP_LINE =
  "No rows yet — source: none, auxiliary-load facts are asset-specific (scripts/spec09/SOURCES.md).";

export function AuxiliaryEnergyPanelView({ rows }: { rows: AuxiliaryEnergyRow[] }) {
  if (rows.length === 0) {
    return (
      <div data-guard-container="auxiliary-energy" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 10px" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
          <strong style={{ color: "var(--color-text-secondary)" }}>Auxiliary energy load</strong> · {AUXILIARY_ENERGY_GAP_LINE}
        </p>
      </div>
    );
  }

  return (
    <div data-guard-container="auxiliary-energy" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 28px" }}>
      <div className="spec09-panel-header">
        <h2 className="spec09-panel-title" data-guard-title>
          Auxiliary energy load
        </h2>
        <span className="spec09-panel-subtitle">
          stationary load, never a per-tonne-km factor
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {rows.map((row) => {
          const energy = computeEnergyConsumedKwh({
            kwDraw: row.kw_draw,
            dutyCycle: row.duty_cycle,
            hoursTypical: row.hours_typical,
          });
          return (
            <div key={row.profile_id} className="cl-card" style={{ border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg-surface)", padding: "12px 16px" }}>
              <div className="spec09-row-text" style={{ fontSize: 13, fontWeight: 700 }}>{row.load_type.replace(/_/g, " ")}</div>
              <div className="spec09-row-text" style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "4px 0" }}>
                {energy.label === "M" ? "M (missing)" : `${(energy.value as number).toFixed(1)} kWh over ${row.hours_typical}h`}
              </div>
              <div className="spec09-row-text" style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>
                {row.setpoint_c != null ? `${row.setpoint_c}°C` : "no setpoint"}
                {row.setpoint_rh_pct != null ? ` / ${row.setpoint_rh_pct}% RH` : ""} ·{" "}
                gCO2e: {row.grid_intensity_source ? `pending (${row.grid_intensity_source})` : "M — no grid intensity source named"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
