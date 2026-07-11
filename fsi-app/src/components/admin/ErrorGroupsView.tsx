"use client";

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

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ErrorGroupsView({ groups }: ErrorGroupsViewProps) {
  const totalOccurrences = groups.reduce((n, g) => n + (g.count || 0), 0);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 20px",
          background: "var(--raised)",
          borderBottom: "1px solid var(--color-border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text)",
          }}
        >
          Runtime errors
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-2)" }}>
          {groups.length} group{groups.length === 1 ? "" : "s"} · {totalOccurrences} occurrence
          {totalOccurrences === 1 ? "" : "s"} · first-party
        </span>
      </div>

      {groups.length === 0 ? (
        <div
          style={{
            margin: 16,
            border: "1px dashed var(--color-border-strong)",
            background: "var(--color-background)",
            borderRadius: 8,
            padding: "14px 16px",
          }}
        >
          <p style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", margin: "0 0 4px" }}>
            No runtime errors captured.
          </p>
          <p style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--text-2)", margin: 0 }}>
            First-party capture (window.onerror + unhandled rejections client-side; wrapped API
            routes server-side) writes grouped errors here. Empty means nothing captured yet — or
            migration 195 (error_events) is not applied.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-2)" }}>
                <th style={thStyle}>Message</th>
                <th style={thStyle}>Count</th>
                <th style={thStyle}>Side</th>
                <th style={thStyle}>Route</th>
                <th style={thStyle}>Release</th>
                <th style={thStyle}>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
                  <td style={{ ...tdStyle, maxWidth: 380 }}>
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
                  <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>
                    {g.count.toLocaleString()}
                  </td>
                  <td style={tdStyle}>
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
                  <td style={{ ...tdStyle, color: "var(--text-2)" }}>{g.route || "—"}</td>
                  <td style={{ ...tdStyle, color: "var(--text-2)", fontFamily: "var(--font-mono, monospace)" }}>
                    {shortRelease(g.release)}
                  </td>
                  <td style={{ ...tdStyle, color: "var(--text-2)" }}>{relativeTime(g.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "9px 16px",
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const tdStyle: React.CSSProperties = {
  padding: "9px 16px",
  verticalAlign: "middle",
};
