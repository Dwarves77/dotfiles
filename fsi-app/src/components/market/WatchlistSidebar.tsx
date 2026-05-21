"use client";

/**
 * WatchlistSidebar, Highest-Priority Indicators rail for /market.
 *
 * Build 7 honest-rename: the rail used to be labelled "WATCHLIST" with a
 * trailing disclaimer about pending user-pin persistence. Per the platform
 * intent skill Section 11 anti-pattern against shipping phase-language to
 * customer-facing UI, and per the Build 7 dispatch's customer-visible
 * stub closure list, the rail is renamed to "Highest-priority indicators"
 * which is what it actually surfaces today: the highest-lifecycle
 * (Watch + Elevated) items in scope, sorted by priority then recency.
 *
 * No "user-pinned" affordance ships in this dispatch. If/when a
 * user_watchlist table and pin UX lands in a later sprint, the
 * component name and labelling can revert; until then, the label
 * matches the data shape.
 *
 * Build 8.1 + Build 7: Q9 chip mounts (CitationCountChip + RecencyChip)
 * are rendered inline on each row when citationStats is provided. Chip
 * contracts suppress on count zero / null recency, so rows without
 * citation data render unchanged.
 */

import Link from "next/link";
import type { Resource } from "@/types/resource";
import type { SourceCitationStatsMap } from "@/lib/data";
import { CitationCountChip } from "@/components/credibility/CitationCountChip";
import { RecencyChip } from "@/components/credibility/RecencyChip";

interface WatchlistSidebarProps {
  items: Resource[];
  /** Maximum rows to show in the rail. Design uses ~6. */
  limit?: number;
  /**
   * Build 7: per-source citation stats keyed by source_id. When provided,
   * each row renders a CitationCountChip + RecencyChip pair (suppress at
   * count zero / null recency per chip contract). Mirrors Build 8.1 chip
   * pattern from ResearchView.
   */
  citationStats?: SourceCitationStatsMap;
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

export function WatchlistSidebar({ items, limit = 6, citationStats = {} }: WatchlistSidebarProps) {
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
        <span>Highest-priority indicators</span>
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
          No watch-level or elevated items in scope for your workspace
          right now. The most urgent market signals surface here when
          they match your sector profile.
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
            const stat = it.sourceId ? citationStats[it.sourceId] : undefined;
            const showChips = (stat && stat.count >= 1) || stat?.recency;
            return (
              <li
                key={it.id}
                style={{
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--border-sub)",
                }}
              >
                {/* Card-level Link to /regulations/[slug] detail. */}
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
                  {showChips && (
                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                      {stat && stat.count >= 1 && <CitationCountChip count={stat.count} />}
                      {stat?.recency && <RecencyChip timestamp={stat.recency} />}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
