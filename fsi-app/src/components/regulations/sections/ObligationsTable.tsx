/**
 * ObligationsTable — §8 Substantive Requirements 4-column table.
 *
 * Sprint 3 A5.3 (2026-05-27). Matches the mockup `.ob-table` shape:
 * (Obligation, Deadline, Status, Next action). Returns null when rows
 * is empty so the parent SectionCard can suppress.
 */

import type { ObligationRow } from "@/lib/agent/extract-regulation-sections";
import { dropUnbackedRows } from "@/lib/agent/source-entry-filter.mjs";

export function ObligationsTable({ rows }: { rows: ObligationRow[] }) {
  // F-1 class guard: never render a row whose Obligation cell is empty/header-echo.
  const shown = dropUnbackedRows(rows, "obligation") as ObligationRow[];
  if (shown.length === 0) return null;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead>
          <tr style={{ background: "var(--color-bg-raised)" }}>
            <th style={th}>Obligation</th>
            <th style={th}>Deadline</th>
            <th style={th}>Status</th>
            <th style={th}>Next action</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
              <td style={td}>{r.obligation}</td>
              <td style={td}>{r.deadline}</td>
              <td style={td}>{r.status}</td>
              <td style={td}>{r.nextAction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "top",
  color: "var(--color-text-primary)",
  lineHeight: 1.5,
};
