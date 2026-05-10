"use client";

/**
 * DashboardWatchlist — rail widget (top). Shows the current user's pinned
 * sources, regulations, and market signals ordered by recent activity.
 *
 * - Reads the watchlist promise via React 19 use() inside a Suspense
 *   boundary set by the caller (HomeSurface).
 * - First item gets `.fresh` styling on the pulse dot (animated,
 *   --critical color).
 * - Empty + error states use spec-verbatim copy; the user has approved
 *   the exact strings, do not paraphrase.
 *
 * CSS in src/app/globals.css under the "Dashboard sidebar widgets" block:
 *   .cl-wl-item, .pulse-dot, .cl-typetag, .cl-typeset-* (via TypesetSection).
 */

import { use } from "react";
import Link from "next/link";
import { TypesetSection } from "./TypesetSection";
import type { WatchlistItem } from "@/lib/data";

export interface DashboardWatchlistProps {
  promise: Promise<WatchlistItem[]>;
}

const TYPE_LABEL: Record<WatchlistItem["type"], string> = {
  source: "Source",
  reg: "Reg",
  signal: "Signal",
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const now = Date.now();
  const diffMs = Math.max(0, now - t);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} mo ago`;
}

function hrefFor(item: WatchlistItem): string {
  if (item.type === "reg") return `/regulations/${item.id}`;
  if (item.type === "source") return `/sources/${item.id}`;
  return `/market#${item.id}`;
}

export function DashboardWatchlist({ promise }: DashboardWatchlistProps) {
  const items = use(promise);
  const total = items.length;
  const visible = items.slice(0, 3);

  if (visible.length === 0) {
    return (
      <TypesetSection eyebrow="Tracked by you" title="Watchlist">
        <p
          style={{
            fontSize: 12,
            color: "var(--text-2)",
            lineHeight: 1.5,
            margin: "4px 0 12px",
          }}
        >
          Watch any source, regulation, or market signal to see updates here.
        </p>
        <Link
          href="/regulations"
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          Browse what to watch →
        </Link>
      </TypesetSection>
    );
  }

  return (
    <TypesetSection
      eyebrow="Tracked by you"
      title="Watchlist"
      count={`${visible.length} of ${total}`}
      footer={<Link href="/watchlist">View all {total} →</Link>}
    >
      <ul className="cl-typeset-list">
        {visible.map((item, idx) => {
          const isFresh = idx === 0;
          return (
            <li key={item.id} className={`cl-wl-item${isFresh ? " fresh" : ""}`}>
              <Link
                href={hrefFor(item)}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div className="src">{item.source}</div>
                <div className="t">{item.title}</div>
                <div className="meta">
                  <span className={`pulse-dot${isFresh ? " fresh" : ""}`} />
                  <span>{relativeTime(item.lastChangedAt)}</span>
                  <span className="cl-typetag">{TYPE_LABEL[item.type]}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </TypesetSection>
  );
}
