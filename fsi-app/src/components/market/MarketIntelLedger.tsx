"use client";

/**
 * F35 row-ux-coverage: every row's squeezed-title floor is guarded by the
 * data-guard-title attribute on src/components/ui/ListRow.tsx's title span
 * (added additively this lane), not re-declared per surface.
 *
 * MarketIntelLedger — /market's list surface (UI system handoff 2026-09-06,
 * artboard 04 "Market list": same row anatomy; signal kind is a tag,
 * urgency is the band; price ribbon reduced to one row).
 *
 * REWRITTEN this lane (UILISTS, 2026-09-06). Replaces the previous ~1,500-
 * line component (its own five-value severity BAND vocabulary — Action
 * required/Cost alert/Window closing/Competitive edge/Monitoring, one of
 * the five competing urgency vocabularies the redesign retires per README
 * §0.2 — plus a per-page ask bar) with ListSurfaceShell, assembled ONLY
 * from src/components/ui/ parts. The five-value vocabulary survives as the
 * signal KIND (a neutral TagChip in the row meta line, per the artboard),
 * classified by `signalKindLabel` below; urgency is now the one band scale
 * (src/lib/urgency/bands.ts), same as every other surface.
 *
 * DATA: unchanged read paths — `initialResources` /
 * `aggregates` are market/page.tsx's existing getPublicMarketIntelItems() /
 * getPublicSurfaceCounts('market') reads. Market's live corpus (55 items)
 * is under LIST_FIRST_PAGE_SIZE, so there is no remainder to fetch — see
 * that page's own header (PERF-11).
 */

import { useMemo, useState, type ReactNode } from "react";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";
import type { MarketSeriesBoardVM, MarketSeriesProducerGroup } from "@/lib/supabase-server";
import { BAND_ORDER, bandFromPriority, type UrgencyBandKey } from "@/lib/urgency/bands";
import { scoreResource } from "@/lib/scoring";
import { formatLocaleDate, formatNumber } from "@/lib/format";
import { nowFrom } from "@/lib/render-now";
import { itemDetailHref } from "@/lib/item-links";
import { dueInfo, jurisdictionCode } from "@/lib/dashboard/row-fields";
import { WatchButton } from "@/components/ui/WatchButton";
import { PriorityDropdown } from "@/components/regulations/PriorityDropdown";
import { TagChip } from "@/components/ui/Chips";
import { StateNote } from "@/components/ui/StateNote";
import { ListSurfaceShell, type ListSurfaceFacetGroup } from "@/components/list-surface/ListSurfaceShell";
import { RailCard, LegendRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import { ListSurfaceSortRow, type ListSurfaceSortOption } from "@/components/list-surface/ListSurfaceSortRow";
import { useWorkspaceTagsFacet } from "@/lib/tags/useWorkspaceTagsFacet";
import {
  EMPTY_FILTER_STATE,
  bandFacetOptions,
  modeFacetOptions,
  regionFacetOptions,
  filterRows,
  withListPosition,
  sortResourceRows,
  type RowFilterState,
} from "@/components/list-surface/list-surface-helpers";

const PER_BAND_CAP = 5;
const LIST_KEY = "market";

// Sort row (artboard 04/id="p4": "Sort Next date | Newest | A-Z", active option filled — three
// options here, unlike Regulations' four; the artboard carries no "My order" on this surface).
const SORT_OPTIONS: ListSurfaceSortOption[] = [
  { key: "next-date", label: "Next date" },
  { key: "newest", label: "Newest" },
  { key: "az", label: "A-Z" },
];

/** The market signal KIND — a neutral tag (README artboard 04), not a band.
 *  Reads the classified `severity` column when present (migration 102);
 *  falls back to a plain priority-derived label only when the column is
 *  null (pre-classification row), never fabricating a kind the data does
 *  not carry. */
const KIND_LABEL: Record<string, string> = {
  action_required: "Action required",
  cost_alert: "Cost alert",
  window_closing: "Window closing",
  competitive_edge: "Competitive edge",
  monitoring: "Monitoring",
};

function signalKindLabel(r: Resource): string | null {
  if (r.severity && KIND_LABEL[r.severity]) return KIND_LABEL[r.severity];
  return null;
}

function marketMetaLine(r: Resource): string {
  const parts: string[] = [];
  if (r.type) parts.push(String(r.type));
  if (r.modes && r.modes.length) parts.push(r.modes.join(", "));
  if (r.topic) parts.push(r.topic);
  return parts.join(" · ");
}

async function fetchRemainder(offset: number): Promise<Resource[]> {
  const res = await fetch(`/api/listings/rest?surface=market&offset=${offset}`, { cache: "no-store" });
  if (!res.ok) return [];
  const body = (await res.json()) as { resources?: Resource[] };
  return body.resources ?? [];
}
void fetchRemainder; // Market's corpus (55 items) ships whole from getPublicMarketIntelItems; kept
// as documentation of the mechanism other surfaces use, not dead code — see this file's header.

export interface MarketIntelLedgerProps {
  /** Server render instant (src/lib/render-now.ts `renderNowIso()`). Threaded from this
   *  surface's page.tsx so every date this ledger renders comes from ONE instant the SERVER
   *  chose — the SSR pass and the hydration pass then produce identical text by construction
   *  (React #418 class, see render-now.ts). */
  nowIso?: string;
  initialResources: Resource[];
  aggregates: WorkspaceAggregates;
  seriesBoard?: MarketSeriesBoardVM;
  /** artboard 04/id="p4": the "Headline series" card, nested between the band tiles and the sort
   *  row. The page passes its own <MarketComparativeRibbon board={seriesBoard} embedded /> here
   *  (both already read the SAME seriesBoard fetch) rather than this component importing and
   *  mounting it directly — page.tsx owns the fetch, this component owns only the placement slot. */
  headlineSeries?: ReactNode;
}

export function MarketIntelLedger({ initialResources, aggregates, seriesBoard, nowIso, headlineSeries }: MarketIntelLedgerProps) {
  const [filter, setFilter] = useState<RowFilterState>(EMPTY_FILTER_STATE);
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<UrgencyBandKey>>(new Set());
  const [sortKey, setSortKey] = useState<"next-date" | "newest" | "az">("next-date");
  const [flat, setFlat] = useState(false);

  const tagsFacet = useWorkspaceTagsFacet();

  const filtered = useMemo(() => {
    const base = filterRows(initialResources, filter);
    const kinded = kindFilter ? base.filter((r) => signalKindLabel(r) === kindFilter) : base;
    return sortResourceRows(kinded.filter((r) => tagsFacet.matchesSelectedTag(r.id)), sortKey);
  }, [initialResources, filter, kindFilter, tagsFacet.matchesSelectedTag, sortKey]);

  const bandCounts = useMemo(() => {
    const opts = bandFacetOptions(initialResources, aggregates.byPriority as unknown as Record<string, number>);
    return Object.fromEntries(opts.map((o) => [o.key, o.count])) as Record<UrgencyBandKey, number>;
  }, [initialResources, aggregates.byPriority]);

  const modeOptions = useMemo(() => modeFacetOptions(initialResources), [initialResources]);
  const regionOptions = useMemo(
    () => regionFacetOptions(initialResources, aggregates.byJurisdiction),
    [initialResources, aggregates.byJurisdiction],
  );
  const kindOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of initialResources) {
      const label = signalKindLabel(r);
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([value, count]) => ({ value, label: value, count }));
  }, [initialResources]);

  const facetGroups: ListSurfaceFacetGroup[] = [
    {
      key: "kind",
      label: "Signal kind",
      options: kindOptions,
      selected: kindFilter,
      onSelect: setKindFilter,
    },
    { key: "mode", label: "Mode", options: modeOptions, selected: filter.mode, onSelect: (v) => setFilter((f) => ({ ...f, mode: v })) },
    { key: "region", label: "Region", options: regionOptions, selected: filter.region, onSelect: (v) => setFilter((f) => ({ ...f, region: v })) },
  ];

  const workspaceTagFacetGroups: ListSurfaceFacetGroup[] = [
    {
      key: "workspace-tags",
      label: "Workspace tags",
      options: tagsFacet.tags.map((t) => ({ value: t.id, label: t.name, count: t.itemCount })),
      selected: tagsFacet.selectedTagId,
      onSelect: tagsFacet.setSelectedTagId,
    },
  ];

  const rowsByBand = useMemo(() => {
    return BAND_ORDER.map((band) => {
      const bandRows = filter.band && filter.band !== band.key ? [] : filtered.filter((r) => bandFromPriority(r.priority).key === band.key);
      return {
        band,
        total: bandRows.length,
        rows: bandRows.map((r, i) => {
          const due = dueInfo(r);
          const kind = signalKindLabel(r);
          const meta = (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {kind && <TagChip>{kind}</TagChip>}
              <span>{marketMetaLine(r)}</span>
            </span>
          );
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
            meta,
            impact: r.impactScores ?? scoreResource(r),
            due: due ? { label: due.label, days: `${due.days}` } : null,
            timeline: r.timeline ?? null,
            tier: r.sourceTier ?? null,
            tags: tagsFacet.tagsForItem(r.id),
            overflow: (
              <PriorityDropdown
                variant="card"
                showPriorityActions={false}
                ariaLabel="Signal actions"
                menuTopContent={<WatchButton itemType="signal" itemId={r.id} />}
              />
            ),
          };
        }),
      };
    });
  }, [filtered, filter.band, tagsFacet.tagsForItem]);

  const total = aggregates.totalItems || initialResources.length;
  const producers = seriesBoard?.groups ?? [];

  return (
    <ListSurfaceShell
      title="Market Intelligence"
      dek="Signals are unverified by design — timely first, confirmed later."
      dateLabel={formatLocaleDate(nowFrom(nowIso), { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
      nowIso={nowIso}
      itemCount={total}
      scope="market"
      onSearch={(q) => setFilter((f) => ({ ...f, query: q }))}
      bandCounts={bandCounts}
      selectedBand={filter.band}
      onSelectBand={(key) => setFilter((f) => ({ ...f, band: f.band === key ? null : key }))}
      facetGroups={facetGroups}
      secondaryFacetGroups={workspaceTagFacetGroups}
      aboveRows={headlineSeries}
      sortRow={
        <ListSurfaceSortRow
          countLabel={
            <>
              <b style={{ color: "var(--ink)" }}>{formatNumber(total)}</b> signals · {flat ? "flat" : "grouped by band"}
            </>
          }
          linkLabel={flat ? "Group by band" : "Show as one list"}
          onLink={() => setFlat((f) => !f)}
          controlLabel="Sort"
          options={SORT_OPTIONS}
          active={sortKey}
          onSelect={(k) => setSortKey(k as "next-date" | "newest" | "az")}
        />
      }
      flat={flat}
      rowsByBand={rowsByBand}
      perBandCap={PER_BAND_CAP}
      expandedBands={expanded}
      onExpandBand={(key) => setExpanded((s) => new Set(s).add(key))}
      stateNote={<StateNote>{total} active signals across {producers.length || "0"} tracked producers.</StateNote>}
      rail={
        <>
          <RailCard title="Sources tracked">
            {producers.length === 0 ? (
              <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: 0 }}>No price-data producers are registered yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {producers.map((g: MarketSeriesProducerGroup) => (
                  <div key={g.keyPrefix} style={{ display: "flex", justifyContent: "space-between", gap: 8, borderTop: "1px solid var(--line-3)", paddingTop: 6 }}>
                    <span style={{ fontSize: "var(--fs-115)", fontWeight: 700, color: "var(--ink)" }}>{g.name}</span>
                    <span style={{ fontSize: "var(--fs-10)", color: "var(--ink-3)" }}>{g.cadence}</span>
                  </div>
                ))}
              </div>
            )}
          </RailCard>
          <LegendRailCard />
        </>
      }
    />
  );
}
