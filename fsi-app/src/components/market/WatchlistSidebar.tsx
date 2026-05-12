"use client";

/**
 * WatchlistSidebar — pinned indicators rail for /market.
 *
 * Per dispatch G (F11/F11b/Decision #4) and visual reconciliation §3.4:
 *   "Design has WATCHLIST card listing 6 indicators with status pills;
 *    production has no WATCHLIST."
 *
 * Data layer status: NO backend persistence yet. There is no
 * `user_watchlist` or `workspace_watchlist` table in supabase migrations
 * 001-047, and `workspace_settings` does not carry a watchlist column.
 * Per the dispatch's "honest empty-state" rule (#33 banner pattern), we
 * derive a WATCHLIST view from the highest-lifecycle (Watch + Elevated)
 * items in scope. This is a read-only computed view, not user-editable
 * pinning. When backend persistence ships, this component swaps to a
 * subscribed list with the same row shape.
 *
 * NOT a halt condition: the dispatch explicitly authorizes rendering
 * honest empty-state when data is partial. Computed Watch/Elevated rows
 * are real signal, not a placeholder string.
 */

import Link from "next/link";
import type { Resource } from "@/types/resource";

interface WatchlistSidebarProps {
  items: Resource[];
  /** Maximum rows to show in the rail. Design uses ~6. */
  limit?: number;
}

const TONE_COLOR = {
  critical: "var(--critical)",
  high: "var(--high)",
  moderate: "var(--moderate)",
  low: "var(--low)",
} as const;

const LIFECYCLE = {
  CRITICAL: { tone: "critical", label: "WATCH" },
  HIGH:     { tone: "high",     label: "ELEVATED" },
  MODERATE: { tone: "moderate", label: "STABLE" },
  LOW:      { tone: "low",      label: "INFO" },
} as const;

const PRIORITY_RANK: Record<Resource["priority"], number> = {
  CRITICAL: 0,
  HIGH: 1,
  MODERATE: 2,
  LOW: 3,
};

export function WatchlistSidebar({ items, limit = 6 }: WatchlistSidebarProps) {
  // Surface the most urgent items currently being tracked, prioritized
  // by lifecycle severity then by recency.
  const watchlist = [...items]
    .sort((a, b) => {
      const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (p !== 0) return p;
      const aAdded = a.added ? new Date(a.added).getTime() : 0;
      const bAdded = b.added ? new Date(b.added).getTime() : 0;
      return bAdded - aAdded;
    })
    .slice(0, limit);

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
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <span>Watchlist</span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "var(--text-2)",
          }}
        >
          {watchlist.length}/{items.length}
        </span>
      </div>

      {watchlist.length === 0 ? (
        <p
          style={{
            fontSize: 12.5,
            lineHeight: 1.55,
            margin: 0,
            color: "var(--text-2)",
          }}
        >
          No items in scope yet. As market signals are ingested, the most
          urgent ones will appear here.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {watchlist.map((it) => {
            const lc = LIFECYCLE[it.priority];
            return (
              <li
                key={it.id}
                style={{
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--border-sub)",
                }}
              >
                {/* Card-level Link → /regulations/[slug] detail. */}
                <Link
                  href={`/regulations/${encodeURIComponent(it.id)}`}
                  prefetch={false}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                    alignItems: "baseline",
                    textDecoration: "none",
                    color: "inherit",
                    cursor: "pointer",
                    padding: "2px 4px",
                    margin: "-2px -4px",
                    borderRadius: "var(--r-sm)",
                    transition: "background-color 120ms ease",
                  }}
                  className="hover:bg-[var(--raised)]"
                >
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--text)",
                      lineHeight: 1.35,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" as const,
                    }}
                  >
                    {it.title}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      color: TONE_COLOR[lc.tone],
                      whiteSpace: "nowrap",
                    }}
                  >
                    {lc.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p
        style={{
          fontSize: 11,
          color: "var(--text-2)",
          marginTop: 10,
          marginBottom: 0,
          lineHeight: 1.45,
          fontStyle: "italic",
        }}
      >
        User-pinned watchlist persistence pending. Currently shows
        highest-lifecycle items in scope.
      </p>
    </div>
  );
}
