/**
 * SurchargeAuditPanelView — the sync, render-only half of SurchargeAuditPanel.tsx's VIEW/FETCH split
 * (see that file's header for the split's full rationale). Deliberately a SEPARATE FILE, not a second
 * export in the same module: `SurchargeAuditPanel.tsx` imports `@/lib/supabase-server`, which pulls in
 * Next's server request-tracing chain (transitively requires `@opentelemetry/api`, absent from a plain
 * esbuild browser bundle) — proven live while building `spec09-smoke.mjs` (esbuild: `Could not resolve
 * "@opentelemetry/api"`). Because ESM tree-shaking cannot always drop an import with module-level side
 * effects, keeping the fetch-only imports out of THIS file's module graph entirely is the reliable fix,
 * not a bet on the bundler. This file imports nothing server-only: no `@/lib/supabase-server`, only the
 * pure calculator (`formatDefensibleStatement`) and this panel's own CSS.
 */

import { formatDefensibleStatement } from "@/lib/spec09/surcharge-audit.mjs";
import "@/components/market/spec09.css";

export interface SurchargeAuditRow {
  audit_id: string;
  invoice_line: string;
  billed_eur: number;
  statutory_eur: number;
  statutory_basis: string;
  variance_eur: number;
  corridor_id: string;
  carrier_id: string;
}

export const SURCHARGE_AUDIT_GAP_LINE =
  "No rows yet — source: none, requires a customer-uploaded invoice (scripts/spec09/SOURCES.md).";

export function SurchargeAuditPanelView({ rows }: { rows: SurchargeAuditRow[] }) {
  if (rows.length === 0) {
    return (
      <div data-guard-container="surcharge-audit" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 10px" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
          <strong style={{ color: "var(--color-text-secondary)" }}>Carrier surcharge audit</strong> · {SURCHARGE_AUDIT_GAP_LINE}
        </p>
      </div>
    );
  }

  return (
    <div data-guard-container="surcharge-audit" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 28px" }}>
      <div className="spec09-panel-header">
        <h2 className="spec09-panel-title" data-guard-title>
          Carrier surcharge audit
        </h2>
        <span className="spec09-panel-subtitle">
          billed vs statutory, never a carrier accusation
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row) => (
          <div
            key={row.audit_id}
            className="cl-card"
            style={{ border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg-surface)", padding: "12px 16px" }}
          >
            <div className="spec09-row-text" style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{row.invoice_line}</div>
            <div className="spec09-row-text" style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
              {formatDefensibleStatement({ varianceEur: row.variance_eur, statutoryBasis: row.statutory_basis })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
