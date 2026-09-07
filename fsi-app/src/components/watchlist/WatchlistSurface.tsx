"use client";

/**
 * WatchlistSurface — /watchlist (UI system handoff 2026-09-06, artboard 11
 * "Watchlist": the SAME row anatomy, but ONE flat block sorted by next
 * date — no band tiles, no band grouping. This is the one place this
 * lane's dispatch's "all five use BandTile x4" instruction conflicts with
 * the artboard; the artboard wins per README's own rule ("where README
 * prose and a page artboard disagree, the artboard wins") and the
 * operator's "just as the page renderings look" ruling — logged in
 * DEVIATION-LOG.md.
 *
 * REWRITTEN this lane (UILISTS, 2026-09-06). Assembled from
 * src/components/ui/ parts directly (Masthead+CommandBar, ListRow,
 * StateNote) rather than ListSurfaceShell, since the layout genuinely
 * differs (flat list, no tiles/facets) — see list-surface-helpers.ts's
 * `withListPosition` reused here for the same detail-return contract the
 * other four surfaces use.
 *
 * DATA: unchanged read path (fetchWatchlist via getWatchlistFull). The
 * band/impact/timeline/tier fields on each row are additive columns this
 * lane added to that SAME bounded lookup — see WatchlistItem's own header
 * in src/lib/supabase-server.ts — never a second query. source/
 * market_series rows carry none of them and render the Absence convention.
 *
 * NO DRAG HERE, unchanged from the previous version (see its own note,
 * preserved below).
 */

import { useMemo, useState } from "react";
import { Masthead } from "@/components/ui/Masthead";
import { ListRow } from "@/components/ui/ListRow";
import { StateNote } from "@/components/ui/StateNote";
import { Absence } from "@/components/ui/Absence";
import { WatchButton } from "@/components/ui/WatchButton";
import { RailCard, LegendRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import { withListPosition } from "@/components/list-surface/list-surface-helpers";
import { bandFromPriority } from "@/lib/urgency/bands";
import { scoreResource } from "@/lib/scoring";
import { formatLocaleDate } from "@/lib/format";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { WATCHLIST_TYPE_LABEL, watchlistHref } from "@/lib/watchlist-links";
import type { WatchlistItem, WatchlistItemType, WatchlistScope } from "@/lib/data";
import type { Resource } from "@/types/resource";

type ScopeFilterValue = "all" | WatchlistScope;
type TypeFilterValue = "all" | WatchlistItemType;

const LIST_KEY = "watchlist";

export interface WatchlistSurfaceProps {
  items: WatchlistItem[];
  limit: number;
}

/** Days until an item's compliance deadline, or null when it carries none —
 *  same UTC day math as src/lib/dashboard/row-fields.ts's dueInfo, kept
 *  local since WatchlistItem is not a Resource (no timeline array to also
 *  scan). */
function dueInfo(deadline: string | null | undefined): { label: string; days: string } | null {
  if (!deadline) return null;
  const today = Date.now();
  const d = new Date(deadline + (deadline.length === 10 ? "T00:00:00Z" : ""));
  const ms = d.getTime();
  if (Number.isNaN(ms) || ms < today) return null;
  const diff = Math.round((ms - today) / 86400000);
  const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(ms);
  return { label, days: `${diff} day${diff === 1 ? "" : "s"}` };
}

export function WatchlistSurface({ items, limit }: WatchlistSurfaceProps) {
  const [scope, setScope] = useState<ScopeFilterValue>("all");
  const [type, setType] = useState<TypeFilterValue>("all");
  const [query, setQuery] = useState("");

  const presentTypes = useMemo(() => {
    const seen: WatchlistItemType[] = [];
    for (const item of items) if (!seen.includes(item.type)) seen.push(item.type);
    return seen;
  }, [items]);

  const hasTeamRows = useMemo(() => items.some((i) => i.scope === "team"), [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (scope === "all" || i.scope === scope) &&
        (type === "all" || i.type === type) &&
        (!q || i.title.toLowerCase().includes(q) || (i.jurisdiction ?? "").toLowerCase().includes(q)),
    );
  }, [items, scope, type, query]);

  const filtered = scope !== "all" || type !== "all" || query.trim().length > 0;
  const atCap = items.length >= limit;

  return (
    <>
      <div style={{ padding: "20px 40px 0" }}>
        <Masthead
          title="Watchlist"
          dateLabel={formatLocaleDate(new Date(), { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
          commandBar={{ itemCount: items.length, onSearch: setQuery, scope: "watchlist" }}
        />
      </div>
      <div
        style={{ padding: "20px 40px 40px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 28, alignItems: "start" }}
        className="cl-list-surface-grid"
      >
        <style>{`@media (max-width: 1280px) { .cl-list-surface-grid { grid-template-columns: 1fr !important; } }`}</style>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {items.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 14 }}>
              {hasTeamRows && (
                <label style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)" }}>
                  Scope{" "}
                  <select id="watchlist-scope" value={scope} onChange={(e) => setScope(e.target.value as ScopeFilterValue)} style={{ fontFamily: "inherit" }}>
                    <option value="all">All</option>
                    <option value="personal">Personal</option>
                    <option value="team">Team</option>
                  </select>
                </label>
              )}
              {presentTypes.length > 1 && (
                <label style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)" }}>
                  Type{" "}
                  <select id="watchlist-type" value={type} onChange={(e) => setType(e.target.value as TypeFilterValue)} style={{ fontFamily: "inherit" }}>
                    <option value="all">All</option>
                    {presentTypes.map((t) => (
                      <option key={t} value={t}>
                        {WATCHLIST_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          <div style={{ background: "var(--card)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--line-2)" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: "0.02em", textTransform: "uppercase", color: "var(--ink)" }}>
                Watched · {items.length}
              </span>
              <span style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Sorted by next date</span>
            </div>

            {atCap && (
              <div style={{ padding: "10px 16px" }}>
                <StateNote>Showing the most recent {limit} watched items per scope. Older watches exist but are not listed here.</StateNote>
              </div>
            )}

            {items.length === 0 ? (
              <div style={{ padding: 16 }}>
                <StateNote action={{ label: "Browse what to watch →", href: "/regulations" }}>
                  Nothing watched yet. Watch any row&apos;s ⋯ menu, or a Watch button on a detail page, to follow it here.
                </StateNote>
              </div>
            ) : visible.length === 0 ? (
              <div style={{ padding: 16 }}>
                <StateNote
                  action={{
                    label: "Clear filters",
                    onClick: () => {
                      setScope("all");
                      setType("all");
                      setQuery("");
                    },
                  }}
                >
                  No watched items match these filters. You have {items.length} in total.
                </StateNote>
              </div>
            ) : (
              visible
                .map((item) => {
                  const href = watchlistHref(item);
                  const band = item.priority ? bandFromPriority(item.priority) : null;
                  const due = dueInfo(item.complianceDeadline);
                  const impact =
                    item.impactScores ??
                    (item.priority ? scoreResource({ type: item.type, priority: item.priority, tags: [], cat: "global" } as unknown as Resource) : null);
                  const metaParts = [WATCHLIST_TYPE_LABEL[item.type]];
                  if (item.scope === "team" && item.addedBy) metaParts.push(`added by ${item.addedBy}`);
                  return { item, href, band, due, impact, metaParts };
                })
                .map(({ item, href, band, due, impact, metaParts }, i) =>
                  href && band ? (
                    <ListRow
                      key={`${item.scope}:${item.type}:${item.id}`}
                      href={withListPosition(href, LIST_KEY, i + 1, visible.length)}
                      band={band}
                      jurisdiction={(item.jurisdiction || "global").slice(0, 6).toUpperCase()}
                      title={item.title}
                      meta={
                        <span>
                          {metaParts.join(" · ")} · watched <RelativeTime iso={item.lastChangedAt} />
                        </span>
                      }
                      impact={impact}
                      due={due}
                      timeline={null}
                      tier={item.sourceTier ?? null}
                      overflow={<WatchButton itemType={item.type} itemId={item.id} />}
                    />
                  ) : (
                    <div
                      key={`${item.scope}:${item.type}:${item.id}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line-3)" }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span data-guard-title style={{ fontSize: "var(--fs-14)", fontWeight: 600, color: "var(--ink)" }}>{item.title}</span>
                        <span style={{ display: "block", fontSize: "var(--fs-11)", color: "var(--ink-2)" }}>
                          {WATCHLIST_TYPE_LABEL[item.type]} · watched <RelativeTime iso={item.lastChangedAt} />
                        </span>
                      </span>
                      <Absence reason="not in primary source" />
                    </div>
                  ),
                )
            )}

            <div style={{ padding: "10px 16px" }}>
              <StateNote>Watch from any row&apos;s ⋯ menu or the Watch button on a detail page.</StateNote>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <RailCard title="Share with workspace">
            <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: 0 }}>
              A shared watchlist puts the same rows on every member&apos;s dashboard. Team-watch any row to add it.
            </p>
          </RailCard>
          <LegendRailCard />
        </div>
      </div>
    </>
  );
}
