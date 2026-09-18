"use client";

import { formatRelativeCompact } from "@/lib/relative-time";
import { formatNumber } from "@/lib/format";
import {
  AdminPanelFrame,
  AdminPanelMetaText,
  AdminEmptyDashedFrame,
  adminThStyle,
  adminTdStyle,
} from "@/components/admin/AdminTableView";

// ErrorGroupsView — admin Runtime → Errors surface (Wave-β R0.2).
//
// Presentational read-only list of the most-recently-seen error GROUPS from
// the first-party error_events table (migration 195). One row per
// (stack_hash, release, side, route); `count` is the occurrence tally the
// ingest lib increments on repeat. No client fetch: the /admin server page
// reads the groups (platform-admin RLS) and passes them in, matching the
// MtdSpendTile server-fetch-and-pass pattern.
//
// Read-only by design — error triage is "read the group, go fix the code",
// not an in-surface workflow, so there are no per-row actions to inline (DP-1
// not applicable: no actions to consolidate).

interface ErrorGroupsViewProps {
  groups: ErrorGroupRow[];
}

export interface ErrorGroupRow {
  id: string;
  message: string;
  count: number;
  release: string;
  side: "server" | "client";
  route: string;
  env: string;
  last_seen_at: string;
  occurred_at: string;
}

function shortRelease(release: string): string {
  if (!release || release === "dev") return "dev";
  return release.slice(0, 7);
}


export function ErrorGroupsView({ groups }: ErrorGroupsViewProps) {
  const totalOccurrences = groups.reduce((n, g) => n + (g.count || 0), 0);

  return (
    <AdminPanelFrame
      title="Runtime errors"
      right={
        <AdminPanelMetaText>
          {groups.length} group{groups.length === 1 ? "" : "s"} · {totalOccurrences} occurrence
          {totalOccurrences === 1 ? "" : "s"} · first-party
        </AdminPanelMetaText>
      }
    >
      {groups.length === 0 ? (
        <AdminEmptyDashedFrame title="No runtime errors captured.">
          {
            // Text below is relocated verbatim from the pre-extraction inline JSX (byte-identical
            // rendered string; each `+` join reproduces the single-space line-collapse JSX itself
            // performed on the original multi-line text node).
            "First-party capture (window.onerror + unhandled rejections client-side; wrapped API " +
            "routes server-side) writes grouped errors here. Empty means nothing captured yet — or " + // glyph:verbatim
            "migration 195 (error_events) is not applied."
          }
        </AdminEmptyDashedFrame>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-2)" }}>
                <th style={adminThStyle}>Message</th>
                <th style={adminThStyle}>Count</th>
                <th style={adminThStyle}>Side</th>
                <th style={adminThStyle}>Route</th>
                <th style={adminThStyle}>Release</th>
                <th style={adminThStyle}>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
                  <td style={{ ...adminTdStyle, maxWidth: 380 }}>
                    <span
                      title={g.message}
                      style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "var(--text)",
                        fontWeight: 600,
                      }}
                    >
                      {g.message}
                    </span>
                  </td>
                  <td style={{ ...adminTdStyle, fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>
                    {formatNumber(g.count)}
                  </td>
                  <td style={adminTdStyle}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "1px 7px",
                        borderRadius: 999,
                        background: "var(--raised)",
                        border: "1px solid var(--color-border)",
                        color: g.side === "server" ? "var(--sev-critical)" : "var(--color-primary)",
                      }}
                    >
                      {g.side}
                    </span>
                  </td>
                  <td style={{ ...adminTdStyle, color: "var(--text-2)" }}>{g.route || "—" /* glyph:verbatim */}</td>
                  <td style={{ ...adminTdStyle, color: "var(--text-2)", fontFamily: "var(--font-mono, monospace)" }}>
                    {shortRelease(g.release)}
                  </td>
                  <td style={{ ...adminTdStyle, color: "var(--text-2)" }}>{formatRelativeCompact(g.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPanelFrame>
  );
}
