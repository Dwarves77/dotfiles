"use client";

/**
 * WatchlistSurface — /watchlist, composed region for region against artboard
 * 11 (docs/design/handoff-2026-09-06/screens/11-watchlist.png, dc.html
 * id="p11"), top to bottom and left to right:
 *
 *   masthead card ...... VOL line · "WATCHLIST" · scope line
 *                        ("N watched · personal · M shared by the workspace")
 *                        · command bar with the watchlist-scoped placeholder
 *   content column ..... Watched card: SectionHeading ("Watched · N" /
 *                        "Sorted by next date") · ListRowColumnHeader
 *                        ("Juris. / Title · type · modes / Impact low → high /
 *                        Next date / Timeline / Tier") · ListRows · CardFoot
 *                        ("Watch an item from its ⋯ menu on any list page..."
 *                        / "Browse regulations →") · the changed-in-window
 *                        StateNote
 *                        Recalculation notices card: SectionHeading
 *                        ("Recalculation notices" / "Since <the feed's own
 *                        window start>") · the /api/notices feed with its
 *                        honest empty line
 *   rail (300px) ....... Filters · Share with workspace · Legend
 *
 * COMPOSITION LANE comp-11 (2026-09-08), against the operator's audit of
 * 2026-09-07 ("the filters were not above the regulations, they were on the
 * right... you are NOT matching the images directly"). What that pass changed
 * here, and why:
 *
 *   - The masthead scope line and the watchlist-scoped command-bar
 *     placeholder were absent; both are artboard regions with live fields.
 *   - The Scope/Type controls (native selects) and the Workspace-tags chip
 *     card sat in the CONTENT COLUMN above the rows. Artboard 11 has nothing
 *     there. They are an app feature the artboard does not draw (ruling R7),
 *     so they move to the rail's `FiltersRailCard` — the same card, the same
 *     data, the same single-select semantics the other four list surfaces
 *     already use, rather than a watchlist-local filter UI. Logged.
 *   - The column-header row, the card foot strip and the Recalculation
 *     notices card were missing entirely; all three are built from shared
 *     parts (`ListRowColumnHeader`, `CardFoot`, `SectionHeading` +
 *     `RecalculationNotice`), never page-local copies.
 *   - The card head was a page-local div at the wrong size; it is now the
 *     shared `SectionHeading`, promoted out of DashboardBrief this lane.
 *
 * DATA: unchanged read path (fetchWatchlist via getWatchlistFull) plus the
 * pre-existing GET /api/notices feed, read through NoticesRail's own
 * `useRecalculationNotices` hook — no new query, no second copy of that fetch.
 * The band/impact/timeline/tier fields on each row are additive columns on the
 * SAME bounded lookup (see WatchlistItem's header in src/lib/supabase-server.ts).
 * source/market_series rows carry none of them and render the Absence
 * convention.
 *
 * Artboard fields the DATA does not carry, rendered as an omission rather than
 * invented (logged in DEVIATION-LOG.md): the row meta's "All modes ·
 * packaging" segments (WatchlistItem has no modes or topic field), and the
 * state note's "changed BAND" wording (no band-change history exists;
 * /api/notices is the app's only "what changed on watched items since your
 * last visit" feed, so the strip states what that feed actually reports).
 *
 * NO DRAG HERE, unchanged from the previous version.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Masthead } from "@/components/ui/Masthead";
import { ListRow, ListRowColumnHeader } from "@/components/ui/ListRow";
import { StateNote } from "@/components/ui/StateNote";
import { Absence } from "@/components/ui/Absence";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CardFoot } from "@/components/ui/CardFoot";
import { WatchButton } from "@/components/ui/WatchButton";
import { PriorityDropdown } from "@/components/regulations/PriorityDropdown";
import { RailCard, LegendRailCard, FiltersRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import type { ListSurfaceFacetGroup } from "@/components/list-surface/ListSurfaceShell";
import { SectionRule } from "@/components/ui/SectionRule";
import { SkeletonListRow } from "@/components/ui/Skeleton";
import { useWorkspaceTagsFacet } from "@/lib/tags/useWorkspaceTagsFacet";
import { useRecalculationNotices } from "@/components/figures/NoticesRail";
import { RecalculationNotice } from "@/components/figures/RecalculationNotice";
import { withListPosition } from "@/components/list-surface/list-surface-helpers";
import { bandFromPriority } from "@/lib/urgency/bands";
import { scoreResource } from "@/lib/scoring";
import { nowFrom } from "@/lib/render-now";
import { countNoun, formatLocaleDate } from "@/lib/format";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { WATCHLIST_TYPE_LABEL, watchlistHref } from "@/lib/watchlist-links";
import type { WatchlistItem, WatchlistItemType, WatchlistScope } from "@/lib/data";
import type { Resource, TimelineEntry } from "@/types/resource";

type ScopeFilterValue = "all" | WatchlistScope;
type TypeFilterValue = "all" | WatchlistItemType;

const LIST_KEY = "watchlist";

const SCOPE_LABEL: Record<WatchlistScope, string> = { personal: "Personal", team: "Team" };

export interface WatchlistSurfaceProps {
  items: WatchlistItem[];
  limit: number;
  /** Server render instant (src/lib/render-now.ts) — every date this surface renders derives from
   *  it, never from the host clock during render (React #418 class). */
  nowIso?: string;
}

/** Days until an item's compliance deadline, or null when it carries none —
 *  same UTC day math as src/lib/dashboard/row-fields.ts's dueInfo, kept
 *  local since WatchlistItem is not a Resource (no timeline array to also
 *  scan). */
function dueInfo(deadline: string | null | undefined, now: Date): { label: string; days: string } | null {
  if (!deadline) return null;
  // HYDRATION-59: floored to UTC midnight from an INJECTED instant, matching row-fields.ts's own
  // dueInfo. `Date.now()` here was doubly unsafe — it read this client component's own clock in
  // render (SSR instant != hydration instant), and it compared against a sub-second instant rather
  // than a day boundary, so `Math.round` could bucket the same deadline to a different "N days" in
  // the two passes.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const d = new Date(deadline + (deadline.length === 10 ? "T00:00:00Z" : ""));
  const ms = d.getTime();
  if (Number.isNaN(ms) || ms < today) return null;
  const diff = Math.round((ms - today) / 86400000);
  const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(ms);
  return { label, days: `${diff} day${diff === 1 ? "" : "s"}` };
}

/**
 * WatchlistItem's timeline in the shape ListRow's `MilestoneTimeline` takes.
 * The artboard's row carries a populated TIMELINE cell (dc.html p11 lines
 * 96-105) and the read has carried this field all along; the surface was
 * passing a hardcoded `null` and drawing an empty track.
 *
 * Two real differences between the two shapes, neither invented over:
 * an entry with no date is dropped (it cannot be placed on a track), and the
 * read's extra "ahead" status maps to `TimelineEntry`'s "future", the same
 * thing said in the row vocabulary. `label` is empty because this read
 * genuinely carries no milestone labels — the row variant never renders them,
 * and an empty one stays visibly absent anywhere else rather than becoming a
 * fabricated milestone name.
 */
function rowTimeline(entries: WatchlistItem["timeline"]): TimelineEntry[] | null {
  if (!entries || entries.length === 0) return null;
  const mapped = entries
    .filter((e): e is { date: string; status?: "past" | "current" | "future" | "ahead" } => typeof e.date === "string" && e.date.length > 0)
    .map((e) => ({ date: e.date, label: "", status: e.status === "ahead" ? ("future" as const) : e.status }));
  return mapped.length > 0 ? mapped : null;
}

/** The section card both content-column regions sit in — the shared card
 *  chrome plus the one `SectionRule` ruling 5.1 puts above every panel. Same
 *  five declarations `ListSurfaceShell`'s own `Card` uses; two uses inside one
 *  file, not a second definition of a shared part. */
function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />
      {children}
    </div>
  );
}

export function WatchlistSurface({ items, limit, nowIso }: WatchlistSurfaceProps) {
  const now = nowFrom(nowIso);
  const [scope, setScope] = useState<ScopeFilterValue>("all");
  const [type, setType] = useState<TypeFilterValue>("all");
  const [query, setQuery] = useState("");

  const presentTypes = useMemo(() => {
    const seen: WatchlistItemType[] = [];
    for (const item of items) if (!seen.includes(item.type)) seen.push(item.type);
    return seen;
  }, [items]);

  const personalCount = useMemo(() => items.filter((i) => i.scope === "personal").length, [items]);
  const teamCount = items.length - personalCount;

  const tagsFacet = useWorkspaceTagsFacet();
  const { notices, loading: noticesLoading, since: noticesSince } = useRecalculationNotices();

  // COUNTS-61: ONE label for the recalculation window, derived from the instant the FEED itself
  // reports, so the two places that name the window cannot say different things and neither claims
  // a "last visit" the product does not track. Absent while the feed is in flight (and if the route
  // ever stops reporting it), the label states the window's length instead of inventing a date.
  const noticesWindowLabel = noticesSince
    ? `Since ${formatLocaleDate(new Date(noticesSince), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`
    : "Recent changes";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (scope === "all" || i.scope === scope) &&
        (type === "all" || i.type === type) &&
        (!q || i.title.toLowerCase().includes(q) || (i.jurisdiction ?? "").toLowerCase().includes(q)) &&
        tagsFacet.matchesSelectedTag(i.id),
    );
  }, [items, scope, type, query, tagsFacet.matchesSelectedTag]);

  const atCap = items.length >= limit;

  /**
   * The rail's facet groups — the SAME single-select contract
   * `FiltersRailCard` already renders for Regulations/Market/Research/
   * Operations, so the watchlist's filters live where every other list
   * surface's filters live and no watchlist-local filter chrome exists. A
   * group with fewer than two options is dropped: a "Scope" list on a
   * personal-only watchlist filters nothing.
   */
  const facetGroups: ListSurfaceFacetGroup[] = useMemo(() => {
    const groups: ListSurfaceFacetGroup[] = [];
    const scopeOptions = (["personal", "team"] as WatchlistScope[])
      .map((s) => ({ value: s, label: SCOPE_LABEL[s], count: items.filter((i) => i.scope === s).length }))
      .filter((o) => o.count > 0);
    if (scopeOptions.length > 1) {
      groups.push({
        key: "scope",
        label: "Scope",
        options: scopeOptions,
        selected: scope === "all" ? null : scope,
        onSelect: (v) => setScope((v as WatchlistScope | null) ?? "all"),
      });
    }
    if (presentTypes.length > 1) {
      groups.push({
        key: "type",
        label: "Type",
        options: presentTypes.map((t) => ({
          value: t,
          label: WATCHLIST_TYPE_LABEL[t],
          count: items.filter((i) => i.type === t).length,
        })),
        selected: type === "all" ? null : type,
        onSelect: (v) => setType((v as WatchlistItemType | null) ?? "all"),
      });
    }
    if (tagsFacet.tags.length > 0) {
      groups.push({
        key: "tags",
        label: "Workspace tags",
        options: tagsFacet.tags.map((t) => ({ value: t.id, label: t.name, count: t.itemCount })),
        selected: tagsFacet.selectedTagId,
        onSelect: (v) => tagsFacet.setSelectedTagId(v),
      });
    }
    return groups;
  }, [items, presentTypes, scope, type, tagsFacet.tags, tagsFacet.selectedTagId, tagsFacet.setSelectedTagId]);

  return (
    <>
      <div style={{ padding: "20px 40px 0" }}>
        <Masthead
          title="Watchlist"
          dateLabel={formatLocaleDate(now, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
          nowIso={nowIso}
          dek={
            <span data-audit="scope-line">
              <b style={{ color: "var(--ink)" }}>{personalCount}</b> watched · personal ·{" "}
              <b style={{ color: "var(--ink)" }}>{teamCount}</b> shared by the workspace
            </span>
          }
          commandBar={{
            itemCount: items.length,
            onSearch: setQuery,
            scope: "watchlist",
            placeholder: 'Search your watchlist — or ask "what changed on my watched items?"',
          }}
        />
      </div>
      <div
        style={{ padding: "20px 40px 40px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 28, alignItems: "start" }}
        className="cl-list-surface-grid"
      >
        <style>{`@media (max-width: 1280px) { .cl-list-surface-grid { grid-template-columns: 1fr !important; } }`}</style>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <div data-audit="watched-card">
            <Card>
              {/* Ruling 5.1 (2026-09-07): the graduated rule above the section title wins and there
                  is no divider below the title — the artboard still draws one, the later ruling
                  does not. */}
              <SectionHeading title={`Watched · ${items.length}`} aside="Sorted by next date" />

              {atCap && (
                <div style={{ padding: "0 16px 10px" }}>
                  <StateNote>
                    Showing the most recent {limit} watched items per scope. Older watches exist but are not listed here.
                  </StateNote>
                </div>
              )}

              {items.length === 0 ? (
                <div style={{ padding: 16 }}>
                  <StateNote action={{ label: "Browse what to watch →", href: "/regulations" }}>
                    Nothing watched yet. Watch an item from its ⋯ menu on any list page, or the Watch
                    button on a detail page, to follow it here.
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
                        tagsFacet.setSelectedTagId(null);
                      },
                    }}
                  >
                    No watched items match these filters. You have {items.length} in total.
                  </StateNote>
                </div>
              ) : (
                <>
                  <ListRowColumnHeader titleLabel="Title · type · modes" dueLabel="Next date" />
                  {visible
                    .map((item) => {
                      const href = watchlistHref(item);
                      const band = item.priority ? bandFromPriority(item.priority) : null;
                      const due = dueInfo(item.complianceDeadline, now);
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
                            // dc.html p11 row meta: "Regulation · All modes · packaging · watched 1
                            // mo ago · personal". Modes and topic are not fields WatchlistItem
                            // carries, so those two segments are omitted rather than invented; the
                            // scope segment the artboard ends on is live and now rendered.
                            <span>
                              {metaParts.join(" · ")} · watched <RelativeTime iso={item.lastChangedAt} /> · {item.scope}
                            </span>
                          }
                          impact={impact}
                          due={due}
                          timeline={rowTimeline(item.timeline)}
                          tier={item.sourceTier ?? null}
                          tags={tagsFacet.tagsForItem(item.id)}
                          overflow={
                            // Artboard 11/id="p11" ends every row with the SAME `⋯` overflow glyph
                            // artboard 02's regulation rows end with — not a star (lane lists60,
                            // 2026-09-08: the row previously rendered WatchButton's glyph-only
                            // "icon" variant here, which put a second star in the product where the
                            // star belongs to the detail action row's Watch control alone). The
                            // control is the one the other four list surfaces already use:
                            // PriorityDropdown's 44px kebab with `showPriorityActions={false}`
                            // (there is no manual priority retag on a watchlist row), holding the
                            // WatchButton in its popover. Every row here is watched by definition,
                            // so `initialWatched` skips the per-row GET and satisfies ruling 3.5 —
                            // the menu item reads "Watching" at rest and "Unwatch" on hover, never
                            // "Watch".
                            <PriorityDropdown
                              variant="card"
                              showPriorityActions={false}
                              ariaLabel={`Actions for ${item.title}`}
                              menuTopContent={
                                <WatchButton variant="row" itemType={item.type} itemId={item.id} initialWatched />
                              }
                            />
                          }
                        />
                      ) : (
                        <div
                          key={`${item.scope}:${item.type}:${item.id}`}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line-3)" }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span data-guard-title style={{ fontSize: "var(--fs-14)", fontWeight: 600, color: "var(--ink)" }}>
                              {item.title}
                            </span>
                            <span style={{ display: "block", fontSize: "var(--fs-11)", color: "var(--ink-2)" }}>
                              {WATCHLIST_TYPE_LABEL[item.type]} · watched <RelativeTime iso={item.lastChangedAt} /> · {item.scope}
                            </span>
                          </span>
                          <Absence reason="not in primary source" />
                        </div>
                      ),
                    )}
                </>
              )}

              <CardFoot
                // COUNTS-61: this said "any row's ⋯ menu", which reads as a control on THIS page,
                // where watched rows carry a star and no ⋯ menu. The menu is on the list pages.
                left="Watch an item from its ⋯ menu on any list page, or the Watch button on a detail page."
                right={
                  <a
                    href="/regulations"
                    style={{
                      color: "var(--ink)",
                      fontWeight: 600,
                      textDecoration: "underline",
                      textDecorationColor: "rgba(0,0,0,.3)",
                      display: "inline-block",
                      padding: "4px 0",
                    }}
                  >
                    Browse regulations →
                  </a>
                }
              />

              {/* dc.html p11: the changed-since-last-visit strip, inside the card, below its foot.
                  The artboard says "changed band"; no band-change history exists in this product,
                  so the strip states the count the app's actual "what changed on watched items"
                  feed (/api/notices) reports. Absent while that feed is in flight, and absent when
                  it is empty — the artboard draws this strip only in its has-changes state, and
                  the Recalculation notices card below carries the empty case. */}
              {!noticesLoading && notices.length > 0 && (
                <div style={{ margin: "10px 16px 14px" }} data-audit="changed-note">
                  <StateNote band={bandFromPriority("HIGH")} action={{ label: "Review changes →", href: "#recalculation-notices" }}>
                    <b>Action</b> · {countNoun(notices.length, "watched item")} changed in {noticesWindowLabel.toLowerCase()}
                  </StateNote>
                </div>
              )}
            </Card>
          </div>

          <div id="recalculation-notices" data-audit="recalculation-notices">
            <Card>
              {/* COUNTS-61 (production defect, click-through audit 2026-09-08): this card printed
                  "SINCE YOUR LAST VISIT" here AND again in its own empty line, and never gave a
                  date. Root cause [CONFIRMED]: the phrase was wrong twice over — GET /api/notices
                  covers a fixed 30-day window (its own DEFAULT_WINDOW_DAYS) and no caller sends
                  `?since=`, so there is no last-visit instant behind it, and the route's own
                  `since` was discarded by the hook. The window is now stated once, with its real
                  start date, and the empty line below says only whether there is anything in it. */}
              <SectionHeading title="Recalculation notices" aside={noticesWindowLabel} />
              {noticesLoading ? (
                <SkeletonListRow />
              ) : (
                <RecalculationNotice notices={notices} bare emptyMessage="No recalculations on watched items in this window." />
              )}
            </Card>
          </div>
        </div>

        {/* Rail — artboard 11 draws exactly two cards (Share with workspace, Legend). The Filters
            card holds the app's own scope/type/tag facets, which the artboard does not draw at
            all: ruling R7 keeps the feature, and the operator's 2026-09-07 audit fixes where
            filters live sitewide ("they were on the right"), so they sit first in the rail here
            exactly as they do on the other four list surfaces. Logged in DEVIATION-LOG.md. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FiltersRailCard groups={facetGroups} />
          {/* Artboard 11 draws a "Create shared watchlist" button under this prose. NOT BUILT (lane
              lists60, 2026-09-08), and the reason is the ruling's own: a control with no function
              behind it is a defect (operator audit P0 1.1). Checked for one — `src/app/api` has a
              single `watchlist` route (GET/POST/DELETE over `user_watchlist`/`org_watchlist` for one
              item at a time), `src/lib/watchlist-scope.ts` holds the whole personal/team vocabulary,
              and `src/lib/watchlist-links.ts`/`watchlist-order.ts` hold the rest; nothing anywhere
              creates a shared watchlist AS AN OBJECT. What the product actually has is a per-item
              TEAM SCOPE: watching a row at `scope=team` puts it on every member's list. The prose
              therefore states that real action instead of promising a creation flow that does not
              exist. Logged in DEVIATION-LOG.md; the button returns with the function. */}
          <RailCard title="Share with workspace" dataAudit="share-rail">
            <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-2)", margin: 0, lineHeight: 1.5 }}>
              A shared watchlist puts the same rows on every member&apos;s dashboard. Team-watch any row to add it.
            </p>
          </RailCard>
          <LegendRailCard />
        </div>
      </div>
    </>
  );
}
