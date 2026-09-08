/**
 * AuxiliaryEnergyPanelView — the sync, render-only half of AuxiliaryEnergyPanel.tsx's VIEW/FETCH split.
 * Separate file for the same reason as market/SurchargeAuditPanelView.tsx (see that file's header).
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
/** The section's own qualifier, rendered by <DetailSection>'s `aside` slot on the profile page. */
export const AUXILIARY_ENERGY_SECTION_ASIDE = "stationary load, never a per-tonne-km factor";

export function AuxiliaryEnergyPanelView({ rows }: { rows: AuxiliaryEnergyRow[] }) {
  if (rows.length === 0) {
    return (
      <div data-guard-container="auxiliary-energy">
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>{AUXILIARY_ENERGY_GAP_LINE}</p>
      </div>
    );
  }

  return (
    <div data-guard-container="auxiliary-energy">
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
