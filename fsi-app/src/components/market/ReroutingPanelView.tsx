/**
 * ReroutingPanelView — the sync, render-only half of ReroutingPanel.tsx's VIEW/FETCH split. Separate file
 * for the same reason as SurchargeAuditPanelView.tsx (see that file's header).
 */

import { applyFuelBurnMultiplier, compoundingChain } from "@/lib/spec09/reroute.mjs";
import "@/components/market/spec09.css";

export interface RerouteRow {
  reroute_id: string;
  baseline_corridor_id: string;
  reroute_corridor_id: string;
  cause: string;
  fuel_burn_multiplier: number;
  effective_from: string;
  effective_to: string | null;
}

const NOMINAL_BASELINE = 100;
export const REROUTE_GAP_LINE =
  "No rows yet — source: entity spine has fewer than two distinct corridor entities to pair as baseline+reroute (scripts/spec09/SOURCES.md).";

export function ReroutingPanelView({ rows }: { rows: RerouteRow[] }) {
  if (rows.length === 0) {
    return (
      <div data-guard-container="rerouting" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 10px" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
          <strong style={{ color: "var(--color-text-secondary)" }}>Rerouting multipliers</strong> · {REROUTE_GAP_LINE}
        </p>
      </div>
    );
  }

  const chain = compoundingChain();

  return (
    <div data-guard-container="rerouting" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 28px" }}>
      <div className="spec09-panel-header">
        <h2 className="spec09-panel-title" data-guard-title>
          Rerouting multipliers
        </h2>
        <span className="spec09-panel-subtitle">
          five surfaces move from one event
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {rows.map((row) => {
          const scaled = applyFuelBurnMultiplier({ baselineFuelBurn: NOMINAL_BASELINE, fuelBurnMultiplier: row.fuel_burn_multiplier });
          return (
            <div key={row.reroute_id} className="cl-card" style={{ border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg-surface)", padding: "12px 16px" }}>
              <div className="spec09-row-text" style={{ fontSize: 13, fontWeight: 700 }}>{row.cause}</div>
              <div className="spec09-row-text" style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "4px 0" }}>
                {row.baseline_corridor_id} → {row.reroute_corridor_id}
              </div>
              <div className="spec09-row-text" style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>
                Fuel burn ×{row.fuel_burn_multiplier} ({scaled.label === "M" ? "M" : `${scaled.deltaPct >= 0 ? "+" : ""}${scaled.deltaPct.toFixed(0)}%`})
              </div>
            </div>
          );
        })}
      </div>
      <p className="spec09-row-text" style={{ fontSize: 10.5, color: "var(--color-text-muted)", margin: 0 }}>
        Compounding chain: {chain.map((s) => s.detail).join(" → ")}
      </p>
    </div>
  );
}
