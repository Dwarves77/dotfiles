/**
 * EudrCustodyPanelView — the sync, render-only half of EudrCustodyPanel.tsx's VIEW/FETCH split. Separate
 * file for the same reason as market/SurchargeAuditPanelView.tsx (see that file's header).
 *
 * TWO TABLES, ONE SHARED SEVERITY CLASSIFICATION, TWO VISUALLY DISTINCT ALERT LANES: spec text is
 * explicit that a `border_hold` (eudr_plot_claims) is a BLOCKING OPERATIONAL ALERT — "a missing polygon
 * does not cost money later, it stops the container now" — and a `conflict_detected` (custody_chains) is
 * a LIABILITY, "not a data-quality flag... a compliance exposure for both [claiming parties]". Neither is
 * a monetary-exposure figure and this view never renders one alongside either — both are rendered in the
 * SAME blocking-alert visual treatment (src/lib/spec09/eudr-custody.mjs's classifyHoldRisk /
 * classifyDoubleCountRisk / isBlockingSeverity is the one place this classification is made), kept as two
 * clearly labelled lanes so a reader never has to guess which liability a given card names.
 */

import { classifyHoldRisk, classifyDoubleCountRisk, isBlockingSeverity } from "@/lib/spec09/eudr-custody.mjs";
import "@/components/market/spec09.css";

export interface PlotClaimRow {
  claim_id: string;
  consignment_ref: string;
  validation_state: string;
  hold_risk: string;
}

export interface CustodyChainRow {
  custody_id: string;
  credit_type: string;
  scheme: string;
  double_count_check: string;
}

export const EUDR_PLOT_GAP = "EUDR plot claims: no rows yet — source: none, TRACES filings are per-consignment, not bulk (scripts/spec09/SOURCES.md).";
export const CUSTODY_GAP = "Custody chains: no rows yet — source: none, certificate registries have no bulk $0 feed confirmed (scripts/spec09/SOURCES.md).";

const cardStyle = (blocking: boolean): React.CSSProperties => ({
  border: blocking ? "1px solid #b3261e" : "1px solid var(--color-border)",
  borderRadius: 8,
  background: blocking ? "rgba(179,38,30,0.06)" : "var(--color-bg-surface)",
  padding: "12px 16px",
});

export function EudrCustodyPanelView({
  plotClaims,
  custodyChains,
}: {
  plotClaims: PlotClaimRow[];
  custodyChains: CustodyChainRow[];
}) {
  if (plotClaims.length === 0 && custodyChains.length === 0) {
    return (
      <div data-guard-container="eudr-custody" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 10px" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
          <strong style={{ color: "var(--color-text-secondary)" }}>EUDR &amp; custody</strong> · No rows yet — source: none (scripts/spec09/SOURCES.md).
        </p>
      </div>
    );
  }

  return (
    <div data-guard-container="eudr-custody" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 28px" }}>
      <div className="spec09-panel-header">
        <h2 className="spec09-panel-title" data-guard-title>
          EUDR &amp; custody
        </h2>
        <span className="spec09-panel-subtitle">
          a border hold, not a later fine
        </span>
      </div>

      <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)", margin: "0 0 8px" }}>
        EUDR plot claims
      </p>
      {plotClaims.length === 0 ? (
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "0 0 16px" }}>{EUDR_PLOT_GAP}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {plotClaims.map((row) => {
            const risk = classifyHoldRisk(row.hold_risk);
            const blocking = isBlockingSeverity(risk);
            return (
              <div key={row.claim_id} className="cl-card" style={cardStyle(blocking)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span className="spec09-row-text" style={{ fontSize: 13, fontWeight: 700 }}>{row.consignment_ref}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: blocking ? "#b3261e" : "var(--color-text-secondary)" }}>
                    {risk.label}
                  </span>
                </div>
                {risk.detail && <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>{risk.detail}</div>}
                <div style={{ fontSize: 10.5, color: "var(--color-text-muted)", marginTop: 4 }}>validation: {row.validation_state}</div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)", margin: "0 0 8px" }}>
        Custody chains
      </p>
      {custodyChains.length === 0 ? (
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>{CUSTODY_GAP}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {custodyChains.map((row) => {
            const conflict = classifyDoubleCountRisk(row.double_count_check);
            const blocking = isBlockingSeverity(conflict);
            return (
              <div key={row.custody_id} className="cl-card" style={cardStyle(blocking)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span className="spec09-row-text" style={{ fontSize: 13, fontWeight: 700 }}>{row.credit_type.replace(/_/g, " ")} · {row.scheme}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: blocking ? "#b3261e" : "var(--color-text-secondary)" }}>
                    {conflict.label}
                  </span>
                </div>
                {conflict.detail && <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>{conflict.detail}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
