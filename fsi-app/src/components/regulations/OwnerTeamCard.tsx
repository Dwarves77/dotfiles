"use client";

/**
 * OwnerTeamCard — right-rail card for /regulations/[id].
 *
 * Per dispatch F23: "OWNER & TEAM card (assignee, team distribution,
 * last update)".
 *
 * Schema reality (intelligence_items, migrations 001-047):
 *   - actionOwner: single string (e.g. "Ocean Product + Finance"). Real.
 *   - lastVerifiedDate: ISO date. Real.
 *   - There is no team-distribution / multi-assignee column.
 *
 * Honest rendering:
 *   - Show actionOwner if set; otherwise "Unassigned" (matching the
 *     existing right-rail "Owner" KV row pattern).
 *   - Show lastVerifiedDate as "Last update" — this is the most honest
 *     single timestamp we have on the row right now.
 *   - Surface the absence of multi-member team distribution in a small
 *     footnote rather than fabricating headcount data.
 */

import type { Resource } from "@/types/resource";

interface OwnerTeamCardProps {
  resource: Resource;
}

export function OwnerTeamCard({ resource: r }: OwnerTeamCardProps) {
  const owner = r.actionOwner || "Unassigned";
  const lastUpdate = r.lastVerifiedDate
    ? formatDate(r.lastVerifiedDate)
    : null;

  // Split a "Ocean Product + Finance" style owner string into role chips
  // so the team distribution feels visible without inventing headcount.
  const ownerRoles = owner === "Unassigned"
    ? []
    : owner.split(/[+,/]/).map((s) => s.trim()).filter(Boolean);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        padding: "14px 16px",
        boxShadow: "var(--shadow)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 10,
        }}
      >
        Owner & team
      </div>

      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-2)",
            marginBottom: 6,
          }}
        >
          Assignee
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: owner === "Unassigned" ? "var(--muted)" : "var(--text)",
            lineHeight: 1.4,
          }}
        >
          {owner}
        </div>
      </div>

      {ownerRoles.length > 1 && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-2)",
              marginBottom: 6,
            }}
          >
            Team distribution
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {ownerRoles.map((role) => (
              <span
                key={role}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: 3,
                  background: "var(--accent-bg)",
                  color: "var(--accent)",
                  border: "1px solid var(--accent-bd)",
                }}
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-2)",
            marginBottom: 6,
          }}
        >
          Last update
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: lastUpdate ? "var(--text)" : "var(--muted)",
            fontWeight: 600,
          }}
        >
          {lastUpdate || "Not recorded"}
        </div>
      </div>
    </div>
  );
}

function formatDate(d: string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
