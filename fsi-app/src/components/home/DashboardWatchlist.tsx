"use client";

/**
 * DashboardWatchlist — rail card. The current user's pinned sources,
 * regulations, and market signals ordered by recent activity.
 *
 * Redesign TEMPLATE 01 (HANDOFF §6.3 + mock): a titled card whose empty state
 * is the honest-state frame (§4) — dashed border, muted copy, a recovery CTA.
 * Populated state lists up to 3 items with their type + relative time.
 */

import { use } from "react";
import Link from "next/link";
import { DashboardRailCard, RailEmptyFrame } from "./DashboardRailCard";
import { RelativeTime } from "@/components/ui/RelativeTime";
import type { WatchlistItem } from "@/lib/data";

export interface DashboardWatchlistProps {
  promise: Promise<WatchlistItem[]>;
}

const TYPE_LABEL: Record<WatchlistItem["type"], string> = {
  source: "Source",
  reg: "Reg",
  signal: "Signal",
};

function hrefFor(item: WatchlistItem): string {
  if (item.type === "reg") return `/regulations/${item.id}`;
  if (item.type === "source") return `/sources/${item.id}`;
  return `/market#${item.id}`;
}

export function DashboardWatchlist({ promise }: DashboardWatchlistProps) {
  const items = use(promise);
  const visible = items.slice(0, 3);

  if (visible.length === 0) {
    return (
      <DashboardRailCard title="Watchlist">
        <RailEmptyFrame
          body="Nothing watched yet. Watch any regulation, source, or market signal to see its updates here."
          cta={{ label: "Browse what to watch →", href: "/regulations" }}
        />
      </DashboardRailCard>
    );
  }

  return (
    <DashboardRailCard title="Watchlist" count={`${visible.length} of ${items.length}`}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.map((item) => (
          <li key={item.id}>
            <Link href={hrefFor(item)} prefetch={false} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-text-muted)", margin: 0 }}>{item.source}</p>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-text-primary)", margin: "2px 0 0", lineHeight: 1.35 }}>
                {item.title}
              </p>
              <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "3px 0 0" }}>
                <RelativeTime iso={item.lastChangedAt} /> · {TYPE_LABEL[item.type]}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </DashboardRailCard>
  );
}
