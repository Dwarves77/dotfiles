"use client";

/**
 * WatchlistSurface — the full /watchlist page. The dashboard rail shows three
 * rows; this shows every row the reader returned, in the same order, with the
 * filters a long list needs.
 *
 * ORDER IS THE SERVER'S. fetchWatchlist returns rows already sorted: the
 * caller's stored drag order first, then recency for anything unplaced. This
 * component MUST NOT re-sort. Filtering preserves relative order (Array.filter
 * is order-preserving), so a filtered view is a subsequence of the canonical
 * one and the rail and the page can never disagree about precedence.
 *
 * NO DRAG HERE, deliberately. The standing ruling is to put drag on the main
 * surfaces (Regulations / Market / Research / Operations). The watchlist rail
 * already consumes the stored `watchlist` order on the read side, so a row
 * dragged on its home surface is reflected here without this page owning a
 * second write path for the same order.
 *
 * LABELS AND HREFS COME FROM watchlist-links.ts, not from a table typed into
 * this file. A component-local map is how the dashboard rail ended up pointing
 * `signal` rows at a fragment that matches nothing and `source` rows at a route
 * that does not exist: nothing ties a hand-typed table to the real route tree.
 * One module, two consumers.
 *
 * HONEST STATES (§4). Three distinct empty conditions, three distinct messages:
 * nothing watched at all (with a recovery CTA to somewhere watchable), nothing
 * matching the current filters (with a clear-filters recovery), and a list
 * standing at the read cap (stated out loud rather than presented as complete).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { WATCHLIST_TYPE_LABEL, watchlistHref } from "@/lib/watchlist-links";
import type { WatchlistItem, WatchlistItemType, WatchlistScope } from "@/lib/data";

type ScopeFilterValue = "all" | WatchlistScope;
type TypeFilterValue = "all" | WatchlistItemType;

export interface WatchlistSurfaceProps {
  items: WatchlistItem[];
  /** The per-scope bound the server read with, so the surface can say so when
   *  the list is standing at it rather than implying the list is complete. */
  limit: number;
}

function ScopeBadge({ scope }: { scope: WatchlistScope }) {
  const isTeam = scope === "team";
  return (
    <span
      title={
        isTeam
          ? "On the workspace watchlist — every member of your organization sees this row."
          : "On your personal watchlist — only you see this row."
      }
      style={{
        display: "inline-block",
        marginLeft: 6,
        padding: "1px 5px",
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        color: isTeam ? "var(--color-primary)" : "var(--color-text-muted)",
        background: "var(--color-bg-raised)",
        border: "1px solid var(--color-border)",
        verticalAlign: "middle",
      }}
    >
      {isTeam ? "Team" : "Personal"}
    </span>
  );
}

/** The row body. Rendered inside a Link when the type has a detail surface, and
 *  bare when it does not — see watchlistHref: null is a real answer there, and
 *  an unlinked row is more honest than a click that dead-ends. */
function RowBody({ item }: { item: WatchlistItem }) {
  return (
    <>
      <p
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: "var(--color-text-muted)",
          margin: 0,
        }}
      >
        {item.source}
        <ScopeBadge scope={item.scope} />
      </p>
      <p
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          margin: "3px 0 0",
          lineHeight: 1.35,
        }}
      >
        {item.title}
      </p>
      <p
        style={{
          fontSize: 11,
          color: "var(--color-text-muted)",
          margin: "4px 0 0",
        }}
      >
        <RelativeTime iso={item.lastChangedAt} /> · {WATCHLIST_TYPE_LABEL[item.type]}
        {item.jurisdiction ? ` · ${item.jurisdiction}` : ""}
        {item.scope === "team" && item.addedBy ? ` · added by ${item.addedBy}` : ""}
      </p>
      {item.scope === "team" && item.note ? (
        <p
          style={{
            fontSize: 11.5,
            color: "var(--color-text-secondary)",
            margin: "4px 0 0",
            lineHeight: 1.4,
          }}
        >
          {item.note}
        </p>
      ) : null}
    </>
  );
}

const SELECT_STYLE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-text-primary)",
  background: "var(--color-bg-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  padding: "6px 10px",
  minHeight: 34,
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  display: "block",
  margin: "0 0 4px",
};

export function WatchlistSurface({ items, limit }: WatchlistSurfaceProps) {
  const [scope, setScope] = useState<ScopeFilterValue>("all");
  const [type, setType] = useState<TypeFilterValue>("all");

  // Only offer type options the user actually has rows for. A select listing
  // five types when the list holds two is a filter that mostly produces empty
  // states. Derived from the loaded corpus, in first-appearance order so the
  // option list inherits the same precedence as the rows.
  const presentTypes = useMemo(() => {
    const seen: WatchlistItemType[] = [];
    for (const item of items) {
      if (!seen.includes(item.type)) seen.push(item.type);
    }
    return seen;
  }, [items]);

  const hasTeamRows = useMemo(
    () => items.some((i) => i.scope === "team"),
    [items]
  );

  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (scope === "all" || i.scope === scope) &&
          (type === "all" || i.type === type)
      ),
    [items, scope, type]
  );

  const filtered = scope !== "all" || type !== "all";
  const atCap = items.length >= limit;

  const mastheadMeta = filtered
    ? `${visible.length} of ${items.length} watched`
    : `${items.length} watched`;

  return (
    <>
      <EditorialMasthead title="Watchlist" meta={mastheadMeta} />

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 36px 80px" }}>
        {atCap ? (
          <p
            role="status"
            style={{
              fontSize: 11.5,
              color: "var(--color-text-secondary)",
              background: "var(--color-bg-raised)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: "8px 12px",
              margin: "0 0 16px",
              lineHeight: 1.5,
            }}
          >
            Showing the most recent {limit} watched items per scope. Older
            watches exist but are not listed here.
          </p>
        ) : null}

        {items.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              gap: 14,
              margin: "0 0 18px",
            }}
          >
            {hasTeamRows ? (
              <div>
                <label htmlFor="watchlist-scope" style={LABEL_STYLE}>
                  Scope
                </label>
                <select
                  id="watchlist-scope"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as ScopeFilterValue)}
                  style={SELECT_STYLE}
                >
                  <option value="all">All scopes</option>
                  <option value="personal">Personal</option>
                  <option value="team">Team</option>
                </select>
              </div>
            ) : null}

            {presentTypes.length > 1 ? (
              <div>
                <label htmlFor="watchlist-type" style={LABEL_STYLE}>
                  Type
                </label>
                <select
                  id="watchlist-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as TypeFilterValue)}
                  style={SELECT_STYLE}
                >
                  <option value="all">All types</option>
                  {presentTypes.map((t) => (
                    <option key={t} value={t}>
                      {WATCHLIST_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {filtered ? (
              <button
                type="button"
                onClick={() => {
                  setScope("all");
                  setType("all");
                }}
                style={{
                  fontSize: 11.5,
                  fontWeight: 800,
                  color: "var(--color-primary)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px 0",
                  minHeight: 34,
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}

        {items.length === 0 ? (
          <div
            style={{
              border: "1px dashed rgba(0,0,0,0.25)",
              borderRadius: 6,
              background: "var(--color-bg-base)",
              padding: "18px 20px",
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: "var(--color-text-secondary)",
                lineHeight: 1.55,
                margin: "0 0 10px",
              }}
            >
              Nothing watched yet. Watch any regulation, market signal, research
              finding, or operations profile to follow its updates here, and use
              the team scope to flag one for the whole workspace.
            </p>
            <Link
              href="/regulations"
              prefetch={false}
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "var(--color-primary)",
                textDecoration: "none",
              }}
            >
              Browse what to watch →
            </Link>
          </div>
        ) : visible.length === 0 ? (
          <div
            style={{
              border: "1px dashed rgba(0,0,0,0.25)",
              borderRadius: 6,
              background: "var(--color-bg-base)",
              padding: "18px 20px",
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: "var(--color-text-secondary)",
                lineHeight: 1.55,
                margin: "0 0 10px",
              }}
            >
              No watched items match these filters. You have {items.length} in
              total.
            </p>
            <button
              type="button"
              onClick={() => {
                setScope("all");
                setType("all");
              }}
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "var(--color-primary)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Clear filters →
            </button>
          </div>
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
            {visible.map((item) => {
              const href = watchlistHref(item);
              return (
                <li
                  key={`${item.scope}:${item.type}:${item.id}`}
                  style={{
                    background: "var(--color-bg-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    padding: "14px 16px",
                  }}
                >
                  {href ? (
                    <Link
                      href={href}
                      prefetch={false}
                      style={{
                        display: "block",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <RowBody item={item} />
                    </Link>
                  ) : (
                    <RowBody item={item} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
