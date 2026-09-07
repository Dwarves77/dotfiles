"use client";

/**
 * F35 row-ux-coverage: every row's squeezed-title floor is guarded by the
 * data-guard-title attribute on src/components/ui/ListRow.tsx's title span
 * (added additively this lane), not re-declared per surface.
 *
 * ResearchLedger — /research's list surface (UI system handoff 2026-09-06,
 * artboard 06 "Research list": themes are a second facet row, not a second
 * tile system; same bands, same rows; "NOT SCORED" chips gone).
 *
 * REWRITTEN this lane (UILISTS, 2026-09-06). The previous ~1,500-line
 * component rendered its own four-value "research relevance" severity as
 * TILES (a second, competing tile system per the artboard's own note) over
 * a `ResearchPipelineItem` shape that carries no priority/impact/timeline
 * fields at all. This version consumes `getPublicResearchItems()`'s full
 * `Resource[]` (the SAME category-routed, verified-gated read the old page
 * already fetched in parallel to intersect against — see research/page.tsx)
 * instead, so the row gets the one real urgency band (src/lib/urgency/
 * bands.ts), the real ImpactMeter/MilestoneTimeline/TierChip every other
 * surface's row carries, and Themes become a facet (THEME_KEYS, the shared
 * src/lib/research/taxonomy.mjs classifier already used by
 * ResearchFindingDetailSurface.tsx) instead of a second tile row.
 *
 * Assembled ONLY from src/components/ui/ parts via ListSurfaceShell. The
 * per-page ask bar and the old severity-tile system are deleted, not left
 * dormant.
 */

import { useMemo, useState } from "react";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";
import { BAND_ORDER, bandFromPriority, type UrgencyBandKey } from "@/lib/urgency/bands";
import { scoreResource } from "@/lib/scoring";
import { formatLocaleDate } from "@/lib/format";
import { itemDetailHref } from "@/lib/item-links";
import { dueInfo, jurisdictionCode, metaLine } from "@/lib/dashboard/row-fields";
import { WatchButton } from "@/components/ui/WatchButton";
import { StateNote } from "@/components/ui/StateNote";
import { ListSurfaceShell, type ListSurfaceFacetGroup } from "@/components/list-surface/ListSurfaceShell";
import { RailCard, LegendRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import { useWorkspaceTagsFacet } from "@/lib/tags/useWorkspaceTagsFacet";
import {
  EMPTY_FILTER_STATE,
  bandFacetOptions,
  modeFacetOptions,
  regionFacetOptions,
  filterRows,
  withListPosition,
  type RowFilterState,
} from "@/components/list-surface/list-surface-helpers";
import { THEME_KEYS, THEME_LABELS, THEME_COLUMN_TO_KEY, assignTheme } from "@/lib/research/taxonomy.mjs";

const PER_BAND_CAP = 5;
const LIST_KEY = "research";

function themeKeyOf(r: Resource): string | null {
  const column = r.theme && (THEME_COLUMN_TO_KEY as Record<string, string>)[r.theme] ? r.theme : undefined;
  const text = [r.title, r.whatIsIt, r.whyMatters].filter(Boolean).join(" ");
  return assignTheme(text, column) as string | null;
}

export interface ResearchSourceCoverageCellProp {
  transportMode: string;
  jurisdictionIso: string;
  sourceCount: number;
}

export interface ResearchLedgerProps {
  resources: Resource[];
  aggregates: WorkspaceAggregates;
  sourceCoverage?: ResearchSourceCoverageCellProp[];
}

export function ResearchLedger({ resources, aggregates, sourceCoverage }: ResearchLedgerProps) {
  const [filter, setFilter] = useState<RowFilterState>(EMPTY_FILTER_STATE);
  const [theme, setTheme] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<UrgencyBandKey>>(new Set());

  const tagsFacet = useWorkspaceTagsFacet();

  const filtered = useMemo(() => {
    const base = filterRows(resources, filter);
    const themed = theme ? base.filter((r) => themeKeyOf(r) === theme) : base;
    return themed.filter((r) => tagsFacet.matchesSelectedTag(r.id));
  }, [resources, filter, theme, tagsFacet.matchesSelectedTag]);

  const bandCounts = useMemo(() => {
    const opts = bandFacetOptions(resources, aggregates.byPriority as unknown as Record<string, number>);
    return Object.fromEntries(opts.map((o) => [o.key, o.count])) as Record<UrgencyBandKey, number>;
  }, [resources, aggregates.byPriority]);

  const modeOptions = useMemo(() => modeFacetOptions(resources), [resources]);
  const regionOptions = useMemo(() => regionFacetOptions(resources, aggregates.byJurisdiction), [resources, aggregates.byJurisdiction]);

  const themeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of resources) {
      const key = themeKeyOf(r);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return (THEME_KEYS as string[])
      .filter((k) => counts.has(k))
      .map((k) => ({ value: k, label: (THEME_LABELS as Record<string, string>)[k] ?? k, count: counts.get(k) ?? 0 }));
  }, [resources]);

  const facetGroups: ListSurfaceFacetGroup[] = [
    { key: "mode", label: "Mode", options: modeOptions, selected: filter.mode, onSelect: (v) => setFilter((f) => ({ ...f, mode: v })) },
    { key: "region", label: "Region", options: regionOptions, selected: filter.region, onSelect: (v) => setFilter((f) => ({ ...f, region: v })) },
  ];

  const themeFacetGroups: ListSurfaceFacetGroup[] = [
    { key: "theme", label: "Theme", options: themeOptions, selected: theme, onSelect: setTheme },
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
          const baseHref = itemDetailHref(r);
          return {
            key: r.id,
            href: withListPosition(baseHref, LIST_KEY, i + 1, bandRows.length),
            band,
            jurisdiction: jurisdictionCode(r),
            title: r.title,
            meta: metaLine(r),
            impact: r.impactScores ?? scoreResource(r),
            due: due ? { label: due.label, days: `${due.days}` } : null,
            timeline: r.timeline ?? null,
            tier: r.sourceTier ?? null,
            tags: tagsFacet.tagsForItem(r.id),
            overflow: <WatchButton itemType="research" itemId={r.id} />,
          };
        }),
      };
    });
  }, [filtered, filter.band, tagsFacet.tagsForItem]);

  const total = aggregates.totalItems || resources.length;
  const coverageBySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of sourceCoverage ?? []) map.set(c.transportMode, (map.get(c.transportMode) ?? 0) + c.sourceCount);
    return Array.from(map.entries());
  }, [sourceCoverage]);

  return (
    <ListSurfaceShell
      title="Research"
      dek="Peer-reviewed journals, think tanks, quantified-climate research, analytical press."
      dateLabel={formatLocaleDate(new Date(), { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
      itemCount={total}
      scope="research"
      onSearch={(q) => setFilter((f) => ({ ...f, query: q }))}
      bandCounts={bandCounts}
      selectedBand={filter.band}
      onSelectBand={(key) => setFilter((f) => ({ ...f, band: f.band === key ? null : key }))}
      facetGroups={facetGroups}
      secondaryFacetGroups={themeFacetGroups}
      rowsByBand={rowsByBand}
      perBandCap={PER_BAND_CAP}
      expandedBands={expanded}
      onExpandBand={(key) => setExpanded((s) => new Set(s).add(key))}
      stateNote={<StateNote>{total} findings tracked across {themeOptions.length} themes.</StateNote>}
      rail={
        <>
          <RailCard title="Source coverage">
            {coverageBySource.length === 0 ? (
              <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: 0 }}>No coverage matrix populated yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {coverageBySource.map(([mode, count]) => (
                  <div key={mode} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-11)", color: "var(--ink-2)" }}>
                    <span>{mode}</span>
                    <span style={{ fontWeight: 700, color: "var(--ink)" }}>{count}</span>
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
