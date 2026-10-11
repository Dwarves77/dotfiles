import "@/components/market/spec09.css";
import { CoverageState } from "@/components/ui/CoverageState";

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

const INDEXATION_CLAUSES_GAP_LINE =
  "No rows yet. Index-linked contract terms appear here once an external-source rows file has been loaded.";

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
        {/* COV-1: the "not covered" state, same treatment as every other named gap. */}
        <CoverageState state="not_covered" variant="inline" subject="Contract indexation terms" reason={INDEXATION_CLAUSES_GAP_LINE} requestRef="/market#indexation-clauses" />
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
