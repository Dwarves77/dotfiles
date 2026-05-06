"use client";

/**
 * OwnersContent — per-owner feed rail on /market.
 *
 * Per dispatch G + visual reconciliation §3.4:
 *   "Design right rail OWNERS, CONTENT with named editors (Rosa Vega,
 *    Tech readiness lead; Jin-soo Kim, Price signals reviewer);
 *    production has no named owners"
 *
 * Data layer status: EMPTY in the workspace.
 * - Resource.actionOwner exists in the schema but is unpopulated in
 *   seed-resources.json (`grep -c actionOwner` returns 0).
 * - intelligence_items.recommended_actions[].owner is also empty in
 *   the wire format consumed by /market.
 * - Named editor identities (Rosa Vega, Jin-soo Kim, Mia Santos) come
 *   from the design source-of-truth handoff, not from a staffing table
 *   in supabase. There is no `owners` or `editors` table.
 *
 * Per #33 banner pattern: a single section banner explains the gap.
 * When actionOwner backfill ships (a separate data dispatch), this
 * component swaps to a grouped feed: items grouped by owner, latest
 * first, with the owner's role shown as a sub-line.
 */

import type { Resource } from "@/types/resource";

interface OwnersContentProps {
  items: Resource[];
  section: "tech" | "prices";
}

interface OwnerGroup {
  owner: string;
  items: Resource[];
}

export function OwnersContent({ items, section }: OwnersContentProps) {
  // Group by actionOwner where populated. Items without actionOwner are
  // not assigned to a row (they would generate noise rows).
  const groups: OwnerGroup[] = (() => {
    const map = new Map<string, Resource[]>();
    for (const it of items) {
      const owner = it.actionOwner?.trim();
      if (!owner) continue;
      const arr = map.get(owner) || [];
      arr.push(it);
      map.set(owner, arr);
    }
    return Array.from(map.entries())
      .map(([owner, items]) => ({ owner, items }))
      .sort((a, b) => b.items.length - a.items.length);
  })();

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
        Owners · Content
      </div>

      {groups.length === 0 ? (
        <p
          style={{
            fontSize: 12.5,
            lineHeight: 1.55,
            margin: 0,
            color: "var(--text-2)",
          }}
        >
          Per-owner content feed pending assignee backfill on{" "}
          {section === "tech"
            ? "technology and innovation items"
            : "market signal items"}
          . As <code style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5 }}>action_owner</code> populates,
          this rail groups items by owner with the owner's role shown
          inline.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {groups.map((g) => (
            <li
              key={g.owner}
              style={{
                paddingBottom: 8,
                borderBottom: "1px solid var(--border-sub)",
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "var(--text)",
                  marginBottom: 4,
                }}
              >
                {g.owner}
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-2)",
                  }}
                >
                  {g.items.length} item{g.items.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                {g.items.slice(0, 4).map((it) => (
                  <li
                    key={it.id}
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-2)",
                      lineHeight: 1.4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.title}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
