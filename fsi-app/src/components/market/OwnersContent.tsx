"use client";

/**
 * OwnersContent, per-owner feed rail on /market.
 *
 * Build 7 customer-visible stub closure: when no item in scope has a
 * populated actionOwner, the component returns null and the rail
 * collapses (no "coming soon" banner). The component still renders
 * grouped content as soon as actionOwner data lands.
 *
 * Data layer status:
 *   - Resource.actionOwner exists in the schema but is unpopulated on
 *     the seed payload and on intelligence_items in the current data
 *     plane. The owner-backfill work is a separate data dispatch and
 *     not in Build 7 scope; until it lands the rail stays hidden.
 *   - There is no owners or editors staffing table; the named editor
 *     identities in the design source were illustrative.
 *
 * Per the platform-intent skill Section 11 anti-pattern (no phase
 * language to customers), the prior "Per-owner content feed coming
 * soon..." banner is removed. When owner data is present the
 * component renders the grouped feed as before.
 */

import Link from "next/link";
import type { Resource } from "@/types/resource";

interface OwnersContentProps {
  items: Resource[];
  /**
   * Reserved for future per-section copy. The component returns null when
   * no owners are populated, so the prop is currently unused; keeping it
   * optional preserves caller compatibility on /market.
   */
  section?: "tech" | "prices";
}

interface OwnerGroup {
  owner: string;
  items: Resource[];
}

export function OwnersContent({ items }: OwnersContentProps) {
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

  // Build 7: when no items in scope have populated actionOwner, collapse
  // the rail entirely (return null) rather than render a "coming soon"
  // banner. The rail re-appears as soon as owner data lands.
  if (groups.length === 0) return null;

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
        Owners, content
      </div>

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
                      lineHeight: 1.4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {/* Card-level Link → /regulations/[slug] detail */}
                    <Link
                      href={`/regulations/${encodeURIComponent(it.id)}`}
                      prefetch={false}
                      style={{
                        color: "var(--text-2)",
                        textDecoration: "none",
                        display: "block",
                      }}
                      className="hover:text-[var(--text)]"
                    >
                      {it.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ul>
    </div>
  );
}
