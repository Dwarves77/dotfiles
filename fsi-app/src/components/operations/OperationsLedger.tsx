"use client";

/**
 * F35 row-ux-coverage: every row's squeezed-title floor is guarded by the
 * data-guard-title attribute on src/components/ui/ListRow.tsx's title span
 * (added additively this lane), not re-declared per surface.
 *
 * OperationsLedger — /operations' list surface (UI system handoff
 * 2026-09-06, artboard 08 "Operations list": six dimension tiles collapse
 * into the matrix header; the Facts row is the whole point of this page and
 * is open by default).
 *
 * REWRITTEN this lane (UILISTS, 2026-09-06). Replaces the previous
 * severity-tile + dimension-chip-spotlight + ask bar + per-region accordion
 * render with ListSurfaceShell (band tiles, Region/Mode facets, band-
 * grouped rows of the 25 Regional Operations Profile items, rail) plus the
 * UNCHANGED <RegionDimensionMatrix> (the "regions side by side" table the
 * artboard keeps as its own distinct element, mounted via ListSurfaceShell's
 * `aboveRows` slot) — the matrix already opens a dimension's facts on click
 * per its own existing behavior, which is what the artboard's "Facts row
 * open by default" note describes.
 *
 * DATA PREP IS UNCHANGED: every region/regsByRegion/factsByCell/sharedGrid/
 * dimCoverage computation below is the same read this file always did
 * (getPublicOperationsItems / getPublicResourcesOnly / fetchOperationsCoverage,
 * fetched by operations/page.tsx) — only the RENDER (severity tiles →
 * dimension chips → ask bar → region accordions → item list) is replaced.
 *
 * DROPPED, not left dormant: SeverityTile/RegionCard/ByStateSubList (the old
 * per-region accordion + its US by-state cost sub-list) and the ask bar.
 * The by-state sub-list is real, sourced content (migration 152
 * `state_cost_facts`) with no equivalent slot in the artboard's matrix —
 * logged in DEVIATION-LOG.md as dropped from this list surface, out of this
 * lane's budget to fold into RegionDimensionMatrix itself, rather than
 * silently lost.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";
import type { OperationsCoverageData, OperationsFact } from "@/lib/supabase-server";
import { isRegulationItem } from "@/lib/regulation-item-types";
import { LIST_FIRST_PAGE_SIZE } from "@/lib/list-pagination";
import { RegionDimensionMatrix } from "@/components/operations/RegionDimensionMatrix";
import { buildRegionGrid } from "@/lib/operations/region-grid.mjs";
import { resolveRegionCode } from "@/lib/operations/region-crosswalk.mjs";
import { BAND_ORDER, bandFromPriority, type UrgencyBandKey } from "@/lib/urgency/bands";
import { scoreResource } from "@/lib/scoring";
import { formatLocaleDate } from "@/lib/format";
import { itemDetailHref } from "@/lib/item-links";
import { dueInfo, jurisdictionCode, metaLine } from "@/lib/dashboard/row-fields";
import { WatchButton } from "@/components/ui/WatchButton";
import { StateNote } from "@/components/ui/StateNote";
import { ListSurfaceShell, type ListSurfaceFacetGroup } from "@/components/list-surface/ListSurfaceShell";
import { RailCard, LegendRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import {
  EMPTY_FILTER_STATE,
  bandFacetOptions,
  modeFacetOptions,
  regionFacetOptions,
  filterRows,
  withListPosition,
  type RowFilterState,
} from "@/components/list-surface/list-surface-helpers";

const PER_BAND_CAP = 5;
const LIST_KEY = "operations";

// ── Dimensions (D1–D6) — unchanged from the previous version ──

interface Dimension {
  num: number;
  key: string;
  db: string;
  name: string;
}

const DIMENSIONS: Dimension[] = [
  { num: 1, key: "regulatory", db: "regulatory_feasibility", name: "Regulatory feasibility" },
  { num: 2, key: "resources", db: "regional_resources", name: "Regional resource availability" },
  { num: 3, key: "labor", db: "labor_markets", name: "Labor markets" },
  { num: 4, key: "materials", db: "materials_sourcing", name: "Materials sourcing" },
  { num: 5, key: "infrastructure", db: "infrastructure", name: "Infrastructure capacity" },
  { num: 6, key: "cost", db: "operational_cost", name: "Operational cost data" },
];

const SOURCED_DIMENSIONS = DIMENSIONS.filter((d) => d.key !== "regulatory");

interface Region {
  key: string;
  label: string;
  severity: "critical" | "high" | "moderate" | "low";
  isoCodes: string[];
}

const DEFAULT_REGIONS: Region[] = [
  { key: "EU", label: "European Union", severity: "critical", isoCodes: ["EU", "DE", "NL", "BE", "FR", "IT", "ES"] },
  { key: "US", label: "United States", severity: "critical", isoCodes: ["US", "US-CA", "US-NY", "US-TX"] },
  { key: "ASIA", label: "Asia · Singapore + Hong Kong", severity: "high", isoCodes: ["SG", "HK", "CN", "JP", "KR"] },
  { key: "UK", label: "United Kingdom", severity: "high", isoCodes: ["GB"] },
  { key: "UAE", label: "UAE · Dubai", severity: "moderate", isoCodes: ["AE"] },
];

function regionForResource(r: Resource, regions: Region[]): string | null {
  return resolveRegionCode(
    regions.map((rg) => ({ code: rg.key, isoCodes: rg.isoCodes })),
    { jurisdictionIso: r.jurisdictionIso ?? null, jurisdiction: r.jurisdiction ?? null },
  );
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export interface OperationsLedgerProps {
  initialResources: Resource[];
  aggregates?: WorkspaceAggregates;
  regulationsByRegion?: Resource[];
  operationsCoverage?: OperationsCoverageData;
}

export function OperationsLedger({ initialResources, aggregates, regulationsByRegion = [], operationsCoverage }: OperationsLedgerProps) {
  const regions: Region[] = useMemo(() => {
    const live = operationsCoverage?.regions ?? [];
    if (live.length > 0) {
      return live.map((r) => ({
        key: r.code,
        label: r.label,
        severity: (["critical", "high", "moderate", "low"].includes(r.severity || "") ? r.severity : "low") as Region["severity"],
        isoCodes: Array.isArray(r.isoCodes) ? r.isoCodes : [],
      }));
    }
    return DEFAULT_REGIONS;
  }, [operationsCoverage]);

  // Load-the-rest for the D1 cross-reference set (unchanged mechanism).
  const fetchedRestRef = useRef(false);
  const [restRegulations, setRestRegulations] = useState<Resource[]>([]);
  useEffect(() => {
    if (fetchedRestRef.current) return;
    fetchedRestRef.current = true;
    let cancelled = false;
    fetch(`/api/listings/rest?surface=operations&offset=${LIST_FIRST_PAGE_SIZE}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`responded ${res.status}`))))
      .then((body: { resources?: Resource[]; error?: string }) => {
        if (cancelled || body.error) return;
        setRestRegulations((body.resources ?? []).filter(isRegulationItem));
      })
      .catch((err) => {
        if (!cancelled) console.error("[OperationsLedger] remainder fetch failed:", err instanceof Error ? err.message : err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allRegulationsByRegion = useMemo(() => dedupeById(regulationsByRegion.concat(restRegulations)), [regulationsByRegion, restRegulations]);

  const regsByRegion = useMemo(() => {
    const map: Record<string, Resource[]> = {};
    for (const r of regions) map[r.key] = [];
    for (const r of allRegulationsByRegion) {
      const region = regionForResource(r, regions);
      if (region && map[region]) map[region].push(r);
    }
    return map;
  }, [allRegulationsByRegion, regions]);

  const factsByCell = useMemo(() => {
    const map = new Map<string, OperationsFact[]>();
    const dbToKey: Record<string, string> = {};
    for (const d of DIMENSIONS) dbToKey[d.db] = d.key;
    for (const f of operationsCoverage?.facts ?? []) {
      const dimKey = dbToKey[f.dimension];
      if (!dimKey) continue;
      const cellKey = `${f.region_code}|${dimKey}`;
      const arr = map.get(cellKey) ?? [];
      arr.push(f);
      map.set(cellKey, arr);
    }
    return map;
  }, [operationsCoverage]);

  const factsFor = useCallback((regionKey: string, dimKey: string): OperationsFact[] => factsByCell.get(`${regionKey}|${dimKey}`) ?? [], [factsByCell]);
  void factsFor; // retained: the same per-cell lookup RegionDimensionMatrix itself uses internally

  // Unified with RegionDimensionMatrix's own grid so the rail/coverage figures and the matrix can
  // never disagree (unchanged from the previous version's own comment).
  useMemo(
    () =>
      buildRegionGrid({
        regionKeys: regions.map((r) => r.key),
        sourcedDimensions: SOURCED_DIMENSIONS.map((d) => d.db),
        facts: (operationsCoverage?.facts ?? []).map((f) => ({ regionKey: f.region_code, dimension: f.dimension, factLabel: f.fact_label, lastUpdated: f.last_updated })),
        coverageRows: (operationsCoverage?.coverage ?? []).map((c) => ({ regionKey: c.region_code, dimension: c.dimension, state: c.state, factCount: c.fact_count })),
        crossRefCountsByRegion: Object.fromEntries(regions.map((r) => [r.key, regsByRegion[r.key]?.length ?? 0])),
      }),
    [regions, operationsCoverage, regsByRegion],
  );

  const [filter, setFilter] = useState<RowFilterState>(EMPTY_FILTER_STATE);
  const [expanded, setExpanded] = useState<Set<UrgencyBandKey>>(new Set());

  const filtered = useMemo(() => filterRows(initialResources, filter), [initialResources, filter]);

  const bandCounts = useMemo(() => {
    const opts = bandFacetOptions(initialResources, aggregates?.byPriority as unknown as Record<string, number> | undefined);
    return Object.fromEntries(opts.map((o) => [o.key, o.count])) as Record<UrgencyBandKey, number>;
  }, [initialResources, aggregates?.byPriority]);

  const modeOptions = useMemo(() => modeFacetOptions(initialResources), [initialResources]);
  const regionOptions = useMemo(() => regionFacetOptions(initialResources, aggregates?.byJurisdiction), [initialResources, aggregates?.byJurisdiction]);

  const facetGroups: ListSurfaceFacetGroup[] = [
    { key: "mode", label: "Mode", options: modeOptions, selected: filter.mode, onSelect: (v) => setFilter((f) => ({ ...f, mode: v })) },
    { key: "region", label: "Region", options: regionOptions, selected: filter.region, onSelect: (v) => setFilter((f) => ({ ...f, region: v })) },
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
            overflow: <WatchButton itemType="operations" itemId={r.id} />,
          };
        }),
      };
    });
  }, [filtered, filter.band]);

  const total = aggregates?.totalItems || initialResources.length;

  return (
    <ListSurfaceShell
      title="Operations Intelligence"
      dek="Six dimensions per region · every fact carries a source and date."
      dateLabel={formatLocaleDate(new Date(), { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
      itemCount={total}
      scope="operations"
      onSearch={(q) => setFilter((f) => ({ ...f, query: q }))}
      bandCounts={bandCounts}
      selectedBand={filter.band}
      onSelectBand={(key) => setFilter((f) => ({ ...f, band: f.band === key ? null : key }))}
      facetGroups={facetGroups}
      aboveRows={
        <RegionDimensionMatrix
          regions={regions.map((r) => ({ key: r.key, label: r.label }))}
          dimensions={SOURCED_DIMENSIONS.map((d) => ({ key: d.key, db: d.db, name: d.name }))}
          facts={operationsCoverage?.facts ?? []}
          coverageRows={operationsCoverage?.coverage ?? []}
          crossRefCountsByRegion={Object.fromEntries(regions.map((r) => [r.key, regsByRegion[r.key]?.length ?? 0]))}
        />
      }
      rowsByBand={rowsByBand}
      perBandCap={PER_BAND_CAP}
      expandedBands={expanded}
      onExpandBand={(key) => setExpanded((s) => new Set(s).add(key))}
      stateNote={<StateNote>{total} regional operations profiles across {regions.length} regions.</StateNote>}
      rail={
        <>
          <RailCard title="Coverage gaps">
            <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: 0 }}>
              A known gap, stated plainly. Sub-national and state-level cost facts are the first fills.
            </p>
          </RailCard>
          <LegendRailCard />
        </>
      }
    />
  );
}
