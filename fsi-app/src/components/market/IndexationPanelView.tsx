/**
 * IndexationPanelView — the sync, render-only half of IndexationPanel.tsx's VIEW/FETCH split (same
 * rationale as SurchargeAuditPanelView.tsx's header: keeps every server-only import, including
 * `@/lib/supabase-server`, out of this file's module graph so an esbuild-bundled UX smoke spec can still
 * import it without pulling in `@opentelemetry/api`).
 *
 * MECHANICS ONLY, NEVER DRAFTED TEXT (spec 09 §1.3/§5 open decision 2's conservative default,
 * indexation.mjs's own draftClauseText() throws on purpose): this view renders the STORED clause terms —
 * base value/date, passthrough, floor/cap band, review cadence, rounding rule — never a computed
 * "indexed value today" figure. Rendering a live figure would need a current index reading
 * (indexCurrent) this table does not carry and no market_series feed currently populates (0 rows,
 * wiring-audit-2026-09-04) — showing a stale or fabricated "current" number would be exactly the kind of
 * confident-but-ungrounded figure CLAUDE.md rule 18 forbids. src/lib/spec09/indexation.mjs's
 * computeIndexedValue() is exercised by the worked example in scripts/spec09/indexation-producer.mjs's own
 * summary, not by this render path.
 */

import "@/components/market/spec09.css";

export interface IndexationClauseRow {
  clause_id: string;
  contract_ref: string | null;
  corridor_id: string | null;
  index_id: string;
  base_value: number;
  base_date: string;
  passthrough_pct: number;
  cap_pct: number | null;
  floor_pct: number | null;
  review_cadence: string;
  rounding_rule: string;
}

export const INDEXATION_CLAUSES_GAP_LINE =
  "No rows yet for your organization — upload your own contract clause terms from Settings → Data, or via POST /api/workspace/spec09-upload.";

function formatBand(floorPct: number | null, capPct: number | null): string {
  if (floorPct === null && capPct === null) return "no floor/cap";
  if (floorPct !== null && capPct !== null) return `${floorPct}% to ${capPct}%`;
  if (floorPct !== null) return `floor ${floorPct}%, no cap`;
  return `cap ${capPct}%, no floor`;
}

export function IndexationPanelView({ rows }: { rows: IndexationClauseRow[] }) {
  if (rows.length === 0) {
    return (
      <div data-guard-container="indexation-clauses" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 10px" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
          <strong style={{ color: "var(--color-text-secondary)" }}>Contract indexation terms</strong> · {INDEXATION_CLAUSES_GAP_LINE}
        </p>
      </div>
    );
  }

  return (
    <div data-guard-container="indexation-clauses" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 28px" }}>
      <div className="spec09-panel-header">
        <h2 className="spec09-panel-title" data-guard-title>
          Contract indexation terms
        </h2>
        <span className="spec09-panel-subtitle">
          mechanics and arithmetic only — the product supplies the computation, your counsel supplies the contract
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row) => (
          <div
            key={row.clause_id}
            className="cl-card"
            style={{ border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg-surface)", padding: "12px 16px" }}
          >
            <div className="spec09-row-text" style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              {row.contract_ref || "(no contract reference given)"} · indexed to {row.index_id}
            </div>
            <div className="spec09-row-text" style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
              Base {row.base_value} at {row.base_date} · {row.passthrough_pct}% passthrough · band {formatBand(row.floor_pct, row.cap_pct)} · reviewed {row.review_cadence} · rounding: {row.rounding_rule}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
