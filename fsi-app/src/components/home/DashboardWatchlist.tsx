"use client";

/**
 * DashboardWatchlist — rail card. The current user's watched items, personal
 * and team-shared, ordered by recent activity.
 *
 * Redesign TEMPLATE 01 (HANDOFF §6.3 + mock): a titled card whose empty state
 * is the honest-state frame (§4) — dashed border, muted copy, a recovery CTA.
 * Populated state lists up to 3 items with their type + relative time.
 *
 * Dual scope (2026-08-02): rows now arrive from two tables, user_watchlist
 * (personal, owner-visible) and org_watchlist (team, member-visible). A team
 * row carries a "Team" badge and, when resolvable, who added it — the rail is
 * where a member learns an item was flagged for the whole workspace.
 *
 * The label and href maps USED to live in this file. They now live in
 * lib/watchlist-links.ts, shared with the /watchlist page, because a
 * component-local table has nothing tying it to the app's real route tree: this
 * one pointed `signal` rows at /market#{id}, a fragment no element on that page
 * carries, and `source` rows at /sources/{id}, a route that does not exist.
 * Copying it into a second surface would have doubled the blast radius of the
 * next drift.
 *
 * The card title is the entry point to the full list (titleHref), so the rail
 * stays a three-row preview and the watchlist needs no sidebar entry of its own.
 */

import { use } from "react";
import Link from "next/link";
import { DashboardRailCard, RailEmptyFrame } from "./DashboardRailCard";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { WATCHLIST_TYPE_LABEL, watchlistHref } from "@/lib/watchlist-links";
import type { WatchlistItem } from "@/lib/data";

function TeamBadge() {
  return (
    <span
      title="On the workspace watchlist — every member sees this"
      style={{
        display: "inline-block",
        marginLeft: 6,
        padding: "1px 5px",
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        color: "var(--color-primary)",
        background: "var(--color-bg-raised)",
        border: "1px solid var(--color-border)",
        verticalAlign: "middle",
      }}
    >
      Team
    </span>
  );
}

export interface DashboardWatchlistProps {
  promise: Promise<WatchlistItem[]>;
}

export function DashboardWatchlist({ promise }: DashboardWatchlistProps) {
  const items = use(promise);
  const visible = items.slice(0, 3);

  if (visible.length === 0) {
    return (
      <DashboardRailCard title="Watchlist" titleHref="/watchlist">
        <RailEmptyFrame
          body="Nothing watched yet. Watch any regulation, source, or market signal to see its updates here."
          cta={{ label: "Browse what to watch →", href: "/regulations" }}
        />
      </DashboardRailCard>
    );
  }

  return (
    <DashboardRailCard
      title="Watchlist"
      titleHref="/watchlist"
      count={`${visible.length} of ${items.length}`}
    >
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.map((item) => {
          // null means the type has no detail surface (see watchlistHref). The
          // row renders unlinked rather than offering a click that dead-ends.
          const href = watchlistHref(item);
          const body = (
            <>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-text-muted)", margin: 0 }}>
                {item.source}
                {item.scope === "team" ? <TeamBadge /> : null}
              </p>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-text-primary)", margin: "2px 0 0", lineHeight: 1.35 }}>
                {item.title}
              </p>
              <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "3px 0 0" }}>
                <RelativeTime iso={item.lastChangedAt} /> · {WATCHLIST_TYPE_LABEL[item.type]}
                {item.scope === "team" && item.addedBy ? ` · added by ${item.addedBy}` : ""}
              </p>
              {item.scope === "team" && item.note ? (
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "3px 0 0", lineHeight: 1.35 }}>
                  {item.note}
                </p>
              ) : null}
            </>
          );
          return (
            <li key={`${item.scope}:${item.type}:${item.id}`}>
              {href ? (
                <Link href={href} prefetch={false} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </DashboardRailCard>
  );
}
