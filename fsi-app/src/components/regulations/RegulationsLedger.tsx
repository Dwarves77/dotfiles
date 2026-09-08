"use client";

/**
 * F35 row-ux-coverage: every row's squeezed-title floor is guarded by the
 * data-guard-title attribute on src/components/ui/ListRow.tsx's title span
 * (added additively this lane), not re-declared per surface.
 *
 * RegulationsLedger — /regulations' list surface (UI system handoff
 * 2026-09-06, artboard 02 "Regulations list": facets always visible with
 * live counts; 56px rows; 15 rows above the fold where there were 7; band
 * tiles filter the list).
 *
 * REWRITTEN this lane (UILISTS, 2026-09-06). Replaces the previous 1,891-
 * line component (severity-vocabulary tiles, a per-page ask bar, drag-
 * reorder rows, a Kanban toggle — none of which the artboard carries) with
 * an assembly of ListSurfaceShell (src/components/list-surface/), which is
 * itself built ONLY from src/components/ui/ parts: BandTile x4, ListRow,
 * ImpactMeter (inside ListRow), MilestoneTimeline (inside ListRow), Chips
 * (TierChip inside ListRow; FilterChip/FilterChipGroup for facets),
 * StateNote, Masthead+CommandBar. The per-page ask bar and old row
 * components (RegRow/SortableRegRow, the drag-reorder Kanban shell) are
 * deleted, not left dormant (CLAUDE.md rule 13) — see this lane's REPORT
 * for the full list.
 *
 * RESTORED (UILISTS2 lane, 2026-09-07, operator ruling: an app feature not
 * shown in the 17 artboards is restored exactly, never removed or
 * restyled): the per-row manual priority retag + Dismiss action
 * (PriorityDropdown.tsx, "card" variant) and the DismissedStash recovery
 * disclosure the UILISTS lane's rebuild dropped. Both live in the
 * artboard's own `⋯` row control (README §0.4: "the ⋯ control is a 28px
 * glyph inside a 44px cell" — exactly where rare/destructive row actions
 * belong), wired to the same `useResourceStore` workspace-override APIs
 * (updatePriority/dismissResource/restoreDismissed) the pre-rebuild
 * component used. The row's Watch toggle is folded into the SAME `⋯`
 * popover via `PriorityDropdown`'s new `menuTopContent` slot — the 8-column
 * row grid has only one 44px action cell, so a second full-size control
 * cannot sit beside it without widening the shared grid (logged in
 * DEVIATION-LOG.md).
 *
 * DATA: unchanged read paths. `initialResources` is regulations/page.tsx's
 * own LIST_FIRST_PAGE_SIZE (60) server-rendered page (toLedgerRowPayload-
 * trimmed); `aggregates` is the single-SoT get_surface_counts('regulations')
 * bundle already fetched there. The after-paint remainder fetch
 * (README/dispatch: "keep LIST_FIRST_PAGE_SIZE = 60 ... and the after-paint
 * fetch of the rest") now also serves "regulations" from /api/listings/rest
 * (extended this lane — see that route's own header) rather than the
 * PERF-12 keyset-cursor `/api/listings/cursor` mechanism, per this lane's
 * explicit dispatch instruction; logged in DEVIATION-LOG.md as a considered
 * reversal of PERF-12's own architecture choice, not an oversight.
 */

import { useMemo, useState } from "react";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";
import { BAND_ORDER, bandFromPriority, type UrgencyBandKey } from "@/lib/urgency/bands";
import { scoreResource } from "@/lib/scoring";
import { formatLocaleDate, formatNumber } from "@/lib/format";
import { nowFrom } from "@/lib/render-now";
import { itemDetailHref } from "@/lib/item-links";
import { dueInfo, jurisdictionCode, metaLine } from "@/lib/dashboard/row-fields";
import { WatchButton } from "@/components/ui/WatchButton";
import { StateNote } from "@/components/ui/StateNote";
import { useResourceStore, mergeWithOverrides } from "@/stores/resourceStore";
import { usePersonalStateHydration } from "@/lib/hooks/usePersonalState";
import { PriorityDropdown } from "@/components/regulations/PriorityDropdown";
import { DismissedStash } from "@/components/regulations/DismissedStash";
import type { PriorityKey } from "@/lib/constants";
import {
  ListSurfaceShell,
  useRemainderFetch,
  type ListSurfaceFacetGroup,
} from "@/components/list-surface/ListSurfaceShell";
import { LegendRailCard, ObligationsRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import { ListSurfaceSortRow, type ListSurfaceSortOption } from "@/components/list-surface/ListSurfaceSortRow";
import { useWorkspaceTagsFacet } from "@/lib/tags/useWorkspaceTagsFacet";
import {
  liveFacetCounts,
  filterRows,
  withListPosition,
  sortResourceRows,
  type ListSurfaceSortKey,
} from "@/components/list-surface/list-surface-helpers";
import { useListSurfaceFilter } from "@/components/list-surface/useListSurfaceFilter";

const PER_BAND_CAP = 5;
const LIST_KEY = "regulations";

// Sort row (artboard 02/id="p2": "Sort Next date | Newest | A-Z | My order", active option
// filled). "My order" is the corpus's own incoming order — this rebuild has no drag-reorder (see
// this file's header comment), so "My order" is honestly the identity/no-op sort, not a
// fabricated manual-order feature.
const SORT_OPTIONS: ListSurfaceSortOption[] = [
  { key: "next-date", label: "Next date" },
  { key: "newest", label: "Newest" },
  { key: "az", label: "A-Z" },
  { key: "my-order", label: "My order" },
];

async function fetchRemainder(): Promise<Resource[]> {
  const res = await fetch(`/api/listings/rest?surface=regulations&offset=60`, { cache: "no-store" });
  if (!res.ok) return [];
  const body = (await res.json()) as { resources?: Resource[] };
  return body.resources ?? [];
}

export interface RegulationsLedgerProps {
  /** Server render instant (src/lib/render-now.ts `renderNowIso()`). Threaded from this
   *  surface's page.tsx so every date this ledger renders comes from ONE instant the SERVER
   *  chose — the SSR pass and the hydration pass then produce identical text by construction
   *  (React #418 class, see render-now.ts). */
  nowIso?: string;
  initialResources: Resource[];
  initialArchived: Resource[];
  aggregates: WorkspaceAggregates;
  /** Whether the corpus is larger than the first-paint page, so the
   *  after-paint remainder fetch should run at all. */
  hasMore: boolean;
  /** `?sort=next-date|newest|az|my-order` deep-link (lane opsclip, train 61, defect 5). The band
   *  and every other FACET now round-trips through useListSurfaceFilter's URL contract
   *  (COUNTS-61), which is why there is no `initialBand` beside this: sort is ORDERING, not a
   *  facet, and is the one piece of view state that hook does not own. Undefined keeps the
   *  surface's own default ordering, so every existing caller is unaffected. */
  initialSort?: ListSurfaceSortKey | null;
}

export function RegulationsLedger({ initialResources, aggregates, hasMore, initialSort = null, nowIso }: RegulationsLedgerProps) {
  const { rows: fetchedRows, loadingMore } = useRemainderFetch(initialResources, fetchRemainder, hasMore);
  // COUNTS-61 (2026-09-08): filter state lives in the URL, so a filtered view can be linked,
  // bookmarked and reloaded. `?band=` is read by this hook rather than resolved server-side and
  // passed down, so there is exactly one copy of the facet state and no second one to drift.
  const { filter, setFacet, toggleFacet } = useListSurfaceFilter();
  const [expanded, setExpanded] = useState<Set<UrgencyBandKey>>(new Set());
  const [sortKey, setSortKey] = useState<ListSurfaceSortKey>(initialSort ?? "next-date");
  const [flat, setFlat] = useState(false);

  // Workspace override layer (priority retag + dismiss) + personal archive layer — restored
  // (UILISTS2, 2026-09-07). Overrides arrive via useWorkspaceOverridesHydration, mounted globally
  // in AppShell.tsx; personalState is per-user, fetched here (same call the old component made).
  const { overrides, updatePriority, dismissResource, restoreDismissed } = useResourceStore();
  const personalState = useResourceStore((s) => s.personalState);
  usePersonalStateHydration();

  const { active, dismissed } = useMemo(
    () => mergeWithOverrides(fetchedRows, overrides, personalState),
    [fetchedRows, overrides, personalState]
  );
  const allRows = active;

  const tagsFacet = useWorkspaceTagsFacet();

  const filtered = useMemo(
    () => sortResourceRows(filterRows(allRows, filter).filter((r) => tagsFacet.matchesSelectedTag(r.id)), sortKey),
    [allRows, filter, tagsFacet.matchesSelectedTag, sortKey]
  );

  // COUNTS-61: ONE derivation for every facet count and the surface total, so every count in the
  // rail moves with the selection. (The Filters card's caption that first stated this was removed
  // sitewide on 2026-09-08; the behaviour it described stands without it.) See liveFacetCounts.
  const counts = useMemo(
    () =>
      liveFacetCounts(allRows, filter, {
        byPriority: aggregates.byPriority as unknown as Record<string, number>,
        byJurisdiction: aggregates.byJurisdiction,
        totalItems: aggregates.totalItems,
      }),
    [allRows, filter, aggregates.byPriority, aggregates.byJurisdiction, aggregates.totalItems],
  );
  const bandCounts = useMemo(
    () => Object.fromEntries(counts.band.map((o) => [o.key, o.count])) as Record<UrgencyBandKey, number>,
    [counts.band],
  );
  const modeOptions = counts.mode;
  const regionOptions = counts.region;
  const topicOptions = counts.topic;
  const tierOptions = counts.tier;

  const facetGroups: ListSurfaceFacetGroup[] = [
    { key: "mode", label: "Mode", options: modeOptions, selected: filter.mode, onSelect: (v) => setFacet("mode", v) },
    {
      key: "region",
      label: "Jurisdiction",
      options: regionOptions,
      selected: filter.region,
      onSelect: (v) => setFacet("region", v),
    },
    {
      key: "topic",
      label: "Topic",
      options: topicOptions,
      selected: filter.topic ?? null,
      onSelect: (v) => setFacet("topic", v),
    },
    {
      key: "tier",
      label: "Source tier",
      options: tierOptions,
      selected: filter.tier ?? null,
      onSelect: (v) => setFacet("tier", v),
    },
  ];

  const workspaceTagFacetGroup: ListSurfaceFacetGroup = {
    key: "workspace-tags",
    label: "Workspace tags",
    options: tagsFacet.tags.map((t) => ({ value: t.id, label: t.name, count: t.itemCount })),
    selected: tagsFacet.selectedTagId,
    onSelect: tagsFacet.setSelectedTagId,
  };

  const rowsByBand = useMemo(() => {
    return BAND_ORDER.map((band) => {
      const bandRows = filter.band && filter.band !== band.key ? [] : filtered.filter((r) => bandFromPriority(r.priority).key === band.key);
      return {
        band,
        total: bandRows.length,
        rows: bandRows.map((r, i) => {
          const due = dueInfo(r);
          const baseHref = itemDetailHref(r);
          return {
            key: r.id,
            href: withListPosition(baseHref, LIST_KEY, i + 1, bandRows.length, {
              prev: bandRows[i - 1]?.id,
              next: bandRows[i + 1]?.id,
            }),
            band,
            jurisdiction: jurisdictionCode(r),
            title: r.title,
            meta: metaLine(r),
            impact: r.impactScores ?? scoreResource(r),
            due: due ? { label: due.label, days: `${due.days}` } : null,
            timeline: r.timeline ?? null,
            tier: r.sourceTier ?? null,
            tags: tagsFacet.tagsForItem(r.id),
            overflow: (
              <PriorityDropdown
                variant="card"
                currentPriority={(overrides.get(r.id)?.priorityOverride as PriorityKey | undefined) ?? (r.priority as PriorityKey)}
                onSetPriority={(p) => updatePriority(r.id, p)}
                onDismiss={() => dismissResource(r.id)}
                menuTopContent={<WatchButton itemType="reg" itemId={r.id} />}
              />
            ),
          };
        }),
      };
    });
  }, [filtered, filter.band, overrides, updatePriority, dismissResource, tagsFacet.tagsForItem]);

  // COUNTS-61: the surface total is the same figure the facets are counted against — the corpus at
  // rest, the current selection under a filter. It used to be `aggregates.totalItems` unconditionally,
  // which is why "1,317 regulations" sat above a list showing 8.
  const total = counts.total;
  const jurisdictionCount = counts.liveSelection
    ? regionOptions.length
    : aggregates.totalJurisdictions || regionOptions.length;

  // Scope line (artboard 02/id="p2" masthead: "1,316 active · 32 jurisdictions · last sync Sep 4 ·
  // next obligation Sep 25 · EU Net-Zero Industry Act"), live fields only — a field this surface
  // cannot source (aggregates.lastUpdatedAt absent pre-apply) is omitted rather than invented.
  const nextObligation = useMemo(() => {
    let soonest: { days: number; due: ReturnType<typeof dueInfo>; title: string } | null = null;
    for (const r of allRows) {
      const due = dueInfo(r);
      if (!due) continue;
      if (!soonest || due.daysNum < soonest.days) soonest = { days: due.daysNum, due, title: r.title };
    }
    return soonest;
  }, [allRows]);
  const scopeLineParts = [
    `${formatNumber(total)} active`,
    `${formatNumber(jurisdictionCount)} jurisdictions`,
    aggregates.lastUpdatedAt
      ? `last sync ${formatLocaleDate(new Date(aggregates.lastUpdatedAt), { month: "short", day: "numeric", timeZone: "UTC" })}`
      : null,
    // Artboard 02/id="p2" writes this segment as "next obligation Sep 25 · EU Net-Zero Industry
    // Act" — a compact month+day, no year, because the scope line is one line beside the command
    // bar and a full "Sep 8, 2026" pushed it wide enough to wrap the bar onto its own row (lane
    // lists60, 2026-09-08, visual pass at 1440). Same date, the artboard's own form.
    nextObligation ? `next obligation ${nextObligation.due!.label.replace(/, \d{4}$/, "")} · ${nextObligation.title}` : null,
  ].filter(Boolean);

  return (
    <ListSurfaceShell
      title="Regulations"
      scopeLine={scopeLineParts.join(" · ")}
      dateLabel={formatLocaleDate(nowFrom(nowIso), { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
      nowIso={nowIso}
      itemCount={total}
      scope="regulations"
      onSearch={(q) => setFacet("query", q)}
      bandCounts={bandCounts}
      selectedBand={filter.band}
      onSelectBand={(key) => toggleFacet("band", key)}
      facetGroups={facetGroups}
      secondaryFacetGroups={[workspaceTagFacetGroup]}
      sortRow={
        <ListSurfaceSortRow
          countLabel={
            <>
              <b style={{ color: "var(--ink)" }}>{formatNumber(total)}</b> regulations · {flat ? "flat" : "grouped by band"}
            </>
          }
          linkLabel={flat ? "Group by band" : "Show as one list"}
          onLink={() => setFlat((f) => !f)}
          controlLabel="Sort"
          options={SORT_OPTIONS}
          active={sortKey}
          onSelect={(k) => setSortKey(k as ListSurfaceSortKey)}
        />
      }
      flat={flat}
      rowsByBand={rowsByBand}
      perBandCap={PER_BAND_CAP}
      expandedBands={expanded}
      onExpandBand={(key) => setExpanded((s) => new Set(s).add(key))}
      loadingMoreRows={loadingMore}
      /* Artboard 02/id="p2" draws NOTHING below the band cards. The corpus total and the
         jurisdiction count the trailing "N regulations tracked across N jurisdictions" line
         restated are both already in the masthead scope line ("1,316 active · 32 jurisdictions ·
         ..."), and the total again in the sort row — a third copy of two figures the artboard
         states once each (lane lists60, 2026-09-08; the same slot is cleared on /market and
         /operations, which share this shared code path). The remainder-fetch note STAYS: it
         reports a live loading state the artboard has no sample for, and it disappears the moment
         the fetch lands. */
      stateNote={loadingMore ? <StateNote>Loading the rest of the regulations corpus in the background.</StateNote> : null}
      belowRows={<DismissedStash dismissed={dismissed} onRestore={restoreDismissed} />}
      /* Artboard 02/id="p2" rail order, top to bottom: Filters (mounted by ListSurfaceShell
         itself), then "Obligations · next 30 days", then Legend. */
      rail={
        <>
          <ObligationsRailCard nowIso={nowIso} />
          <LegendRailCard />
        </>
      }
    />
  );
}
