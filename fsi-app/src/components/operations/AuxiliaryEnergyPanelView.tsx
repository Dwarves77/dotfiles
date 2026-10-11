import { computeEnergyConsumedKwh } from "@/lib/spec09/auxiliary-energy.mjs";
import "@/components/market/spec09.css";
import { CoverageState } from "@/components/ui/CoverageState";

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
        {/* COV-1: the "not covered" state (spec 00 section 4), with the source reason this file already carried. */}
        <CoverageState state="not_covered" variant="inline" subject="Auxiliary energy loads" reason={AUXILIARY_ENERGY_GAP_LINE} requestRef="/operations#auxiliary-energy" />
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
                {/* Absence rule (2026-09-25 close): a value that cannot exist yet names the data it
                    needs. `energy.reason` (label.mjs's `missing()`) already carries that fact; the
                    old bare-M placeholder discarded it and told the reader nothing. */}
                {energy.label === "M" ? `needs ${energy.reason}` : `${(energy.value as number).toFixed(1)} kWh over ${row.hours_typical}h`}
              </div>
              <div className="spec09-row-text" style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>
                {row.setpoint_c != null ? `${row.setpoint_c}°C` : "no setpoint"}
                {row.setpoint_rh_pct != null ? ` / ${row.setpoint_rh_pct}% RH` : ""} ·{" "}
                gCO2e: {row.grid_intensity_source ? `needs grid-intensity conversion (${row.grid_intensity_source})` : "needs a grid-intensity source"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
