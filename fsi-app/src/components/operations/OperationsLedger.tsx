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
 * DROPPED, not left dormant: SeverityTile/RegionCard (the old per-region
 * severity-tile accordion shell — RegionDimensionMatrix replaces it) and the
 * ask bar.
 *
 * REMOVED (UI fix round 2026-09-08, item D3): the US By-state cost sub-list
 * and its `usStateForResource` matcher. It was restored in the UILISTS2 lane
 * on ruling R7 ("a feature no artboard draws is left as it is"); item D3
 * names the "By state · 13 states" strip for removal and a later operator
 * ruling wins. `stateCosts` is still read and still passed in: the COVERAGE
 * GAPS rail card artboard 08 does draw reports the sourced-state tally from
 * it, so the prop is live, not a leftover.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";
import type { OperationsCoverageData, OperationsFact, StateCostFactRow } from "@/lib/supabase-server";
import { STATE_LABELS } from "@/lib/operations/state-roster.mjs";
import { isRegulationItem } from "@/lib/regulation-item-types";
import { LIST_FIRST_PAGE_SIZE } from "@/lib/list-pagination";
import { RegionDimensionMatrix } from "@/components/operations/RegionDimensionMatrix";
import { buildRegionGrid } from "@/lib/operations/region-grid.mjs";
import { resolveRegionCode } from "@/lib/operations/region-crosswalk.mjs";
import { BAND_ORDER, bandFromPriority, type UrgencyBandKey } from "@/lib/urgency/bands";
import { scoreResource } from "@/lib/scoring";
import { formatLocaleDate, formatNumber } from "@/lib/format";
import { nowFrom } from "@/lib/render-now";
import { itemDetailHref } from "@/lib/item-links";
import { dueInfo, jurisdictionCode, metaLine } from "@/lib/dashboard/row-fields";
import { WatchButton } from "@/components/ui/WatchButton";
import { PriorityDropdown } from "@/components/regulations/PriorityDropdown";
import { StateNote } from "@/components/ui/StateNote";
import { ListSurfaceShell, type ListSurfaceFacetGroup } from "@/components/list-surface/ListSurfaceShell";
import { RailCard, LegendRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import { useWorkspaceTagsFacet } from "@/lib/tags/useWorkspaceTagsFacet";
import {
  liveFacetCounts,
  filterRows,
  withListPosition,
  type RowFilterState,
} from "@/components/list-surface/list-surface-helpers";
import { useListSurfaceFilter } from "@/components/list-surface/useListSurfaceFilter";

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
  // Artboard 08/id="p8" names this row "Operational cost" in the matrix and "D6 Operational cost"
  // in the rail; "Operational cost data" was a longer name for the same dimension.
  { num: 6, key: "cost", db: "operational_cost", name: "Operational cost" },
];

// DEFECT-FIX (item 3.3, 2026-09-07): all six dimensions render in the "Regions side by side"
// matrix, D1-D6, same order everywhere — the audit's own words. This used to filter out
// `regulatory` ("D1 has ZERO rows in regional_data_facts — it is derived from regulation
// cross-references", region-grid.mjs's own header), rendering only 5 of 6 dimension rows. The
// audit's binding ruling: add the row back; "when the data has no D6 value the cell renders the
// Absence convention, never a blank, never invented data" — exactly what happens now, since
// `buildRegionGrid` (region-grid.mjs, unchanged, generic over any dimension list) computes
// `state: 'absent'` for every regulatory_feasibility cell (0 rows, always) and
// RegionDimensionMatrix's own empty-cell branch renders the shared `Absence` component for any
// `state === 'absent'` cell (see that file's own header) — no fabricated count, no blank cell.
const MATRIX_DIMENSIONS = DIMENSIONS;

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
  /** Server render instant (src/lib/render-now.ts `renderNowIso()`). Threaded from this
   *  surface's page.tsx so every date this ledger renders comes from ONE instant the SERVER
   *  chose — the SSR pass and the hydration pass then produce identical text by construction
   *  (React #418 class, see render-now.ts). */
  nowIso?: string;
  initialResources: Resource[];
  aggregates?: WorkspaceAggregates;
  regulationsByRegion?: Resource[];
  operationsCoverage?: OperationsCoverageData;
  /** Sourced per-state cost facts (US By-state sub-list, restored). Empty until sourced. */
  stateCosts?: StateCostFactRow[];
}

export function OperationsLedger({
  initialResources,
  aggregates,
  regulationsByRegion = [],
  operationsCoverage,
  stateCosts = [],
  nowIso,
}: OperationsLedgerProps) {
  // Index the sourced per-state facts by state code for the By-state sub-list. One primary
  // figure per state (the first fact — minimum wage today).
  const stateCostByCode = useMemo(() => {
    const m = new Map<string, StateCostFactRow>();
    for (const f of stateCosts) if (!m.has(f.stateCode)) m.set(f.stateCode, f);
    return m;
  }, [stateCosts]);
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
  // Defect D4 (2026-09-07) [CONFIRMED root cause]: the matrix's "N linked regulations" figure is
  // derived from THIS progressively-loaded row set, so before the remainder landed it reported the
  // count over the first LIST_FIRST_PAGE_SIZE rows only, and jumped to the corpus figure the moment
  // the fetch resolved (the audit read that jump as "clicking a region column recomputed 27 -> 777";
  // `crossReferenceCount` does not depend on the selected base region at all — orderRegions only
  // reorders columns, coverageByRegion is keyed by region). A partial count is a WRONG count, and
  // README §0.6 already rules that a count still loading shows a loading affordance, never a
  // number. This flag carries that state to the matrix instead of letting it publish the partial.
  const [restLoaded, setRestLoaded] = useState(false);
  useEffect(() => {
    // HYDRATION-59 note: the once-only guard is `fetchedRestRef`, and there is deliberately NO
    // `cancelled` flag alongside it. The two together were a latent bug: under React's
    // double-invoked development effects the FIRST pass sets the ref and starts the fetch, its
    // cleanup sets `cancelled = true`, the SECOND pass returns early at the ref — and when the one
    // in-flight response lands it is discarded as "cancelled", so the remainder never arrived and
    // (since this lane) the linked-regulations count would sit at "counting…" forever. The ref
    // already guarantees exactly one fetch per mount; a late setState after unmount is a no-op in
    // React 18+, so cancellation buys nothing here and costs the result.
    if (fetchedRestRef.current) return;
    fetchedRestRef.current = true;
    fetch(`/api/listings/rest?surface=operations&offset=${LIST_FIRST_PAGE_SIZE}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`responded ${res.status}`))))
      .then((body: { resources?: Resource[]; error?: string }) => {
        if (!body.error) setRestRegulations((body.resources ?? []).filter(isRegulationItem));
        setRestLoaded(true);
      })
      .catch((err) => {
        console.error("[OperationsLedger] remainder fetch failed:", err instanceof Error ? err.message : err);
        // A failed remainder still RESOLVES the count state: the figure then reflects the rows
        // actually loaded rather than being left mid-flight forever (an honest, resolved state
        // beats a permanent spinner).
        setRestLoaded(true);
      });
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
        sourcedDimensions: MATRIX_DIMENSIONS.map((d) => d.db),
        facts: (operationsCoverage?.facts ?? []).map((f) => ({ regionKey: f.region_code, dimension: f.dimension, factLabel: f.fact_label, lastUpdated: f.last_updated })),
        coverageRows: (operationsCoverage?.coverage ?? []).map((c) => ({ regionKey: c.region_code, dimension: c.dimension, state: c.state, factCount: c.fact_count })),
        crossRefCountsByRegion: Object.fromEntries(regions.map((r) => [r.key, regsByRegion[r.key]?.length ?? 0])),
      }),
    [regions, operationsCoverage, regsByRegion],
  );

  // COUNTS-61 (2026-09-08): filter state lives in the URL, so a filtered view can be linked,
  // bookmarked and reloaded. One contract for every facet — see useListSurfaceFilter.
  const { filter, setFacet, toggleFacet } = useListSurfaceFilter();
  const [expanded, setExpanded] = useState<Set<UrgencyBandKey>>(new Set());

  const tagsFacet = useWorkspaceTagsFacet();

  const filtered = useMemo(
    () => filterRows(initialResources, filter).filter((r) => tagsFacet.matchesSelectedTag(r.id)),
    [initialResources, filter, tagsFacet.matchesSelectedTag]
  );

  // COUNTS-61 (2026-09-08): ONE derivation for every facet count and the surface total, so the
  // Filters card's own caption ("Counts are live for the current selection") is true here too. See
  // liveFacetCounts in list-surface-helpers.ts for the two regimes and why they are what they are.
  const counts = useMemo(
    () =>
      liveFacetCounts(initialResources, filter, {
        byPriority: aggregates?.byPriority as unknown as Record<string, number> | undefined,
        byJurisdiction: aggregates?.byJurisdiction,
        totalItems: aggregates?.totalItems,
      }),
    [initialResources, filter, aggregates],
  );
  const bandCounts = useMemo(
    () => Object.fromEntries(counts.band.map((o) => [o.key, o.count])) as Record<UrgencyBandKey, number>,
    [counts.band],
  );

  const modeOptions = counts.mode;
  const regionOptions = counts.region;

  // DIMENSION facet (artboard 08/id="p8" rail: REGION then DIMENSION, "D1 Regulatory feasibility
  // 3/5 ... D6 Operational cost 4/5"). The count is REAL coverage, not a row count: how many of the
  // matrix's regions hold at least one sourced fact on that dimension, over the region roster.
  // Selecting one narrows the matrix to that dimension row; it does not filter the item rows, which
  // are regional profiles and carry no dimension of their own.
  const [dimensionFilter, setDimensionFilter] = useState<string | null>(null);
  const dimensionOptions = useMemo(() => {
    const sourcedRegions = new Map<string, Set<string>>();
    for (const f of operationsCoverage?.facts ?? []) {
      const set = sourcedRegions.get(f.dimension) ?? new Set<string>();
      set.add(f.region_code);
      sourcedRegions.set(f.dimension, set);
    }
    return MATRIX_DIMENSIONS.map((d) => {
      const sourced = sourcedRegions.get(d.db)?.size ?? 0;
      return {
        value: d.db,
        label: `D${d.num} ${d.name}`,
        count: sourced,
        countLabel: `${sourced}/${regions.length}`,
      };
    });
  }, [operationsCoverage, regions.length]);

  const facetGroups: ListSurfaceFacetGroup[] = [
    { key: "region", label: "Region", options: regionOptions, selected: filter.region, onSelect: (v) => setFacet("region", v) },
    { key: "dimension", label: "Dimension", options: dimensionOptions, selected: dimensionFilter, onSelect: setDimensionFilter },
    // R7: Mode is an app facet artboard 08's rail does not draw. Kept exactly as it was, listed in
    // the lane report, and placed AFTER the two groups the artboard does draw so it never occupies
    // an artboard region's position.
    { key: "mode", label: "Mode", options: modeOptions, selected: filter.mode, onSelect: (v) => setFacet("mode", v) },
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
                showPriorityActions={false}
                ariaLabel="Operations item actions"
                menuTopContent={<WatchButton itemType="operations" itemId={r.id} />}
              />
            ),
          };
        }),
      };
    });
  }, [filtered, filter.band, tagsFacet.tagsForItem]);

  // COUNTS-61: the same figure the facets are counted against — the corpus at rest, the
  // current selection under a filter. It was the corpus total unconditionally, which is how a
  // narrowed list came to sit under a header stating the whole corpus.
  const total = counts.total;

  // Masthead scope line (artboard 08/id="p8": "25 active items · 18 jurisdictions · six dimensions
  // per region · every fact carries a source and date"). Live fields only: the jurisdiction count is
  // the aggregate the surface already receives, falling back to the distinct jurisdictions across
  // the loaded rows — never a typed number.
  const jurisdictionCount = useMemo(() => {
    if (aggregates?.totalJurisdictions) return aggregates.totalJurisdictions;
    return new Set(initialResources.map((r) => r.jurisdiction).filter(Boolean)).size;
  }, [aggregates?.totalJurisdictions, initialResources]);

  // The DIMENSION facet narrows the matrix, which is the only thing a dimension addresses.
  const matrixDimensions = useMemo(
    () => (dimensionFilter ? MATRIX_DIMENSIONS.filter((d) => d.db === dimensionFilter) : MATRIX_DIMENSIONS),
    [dimensionFilter],
  );

  // COVERAGE GAPS rail rows, from the coverage this page already reads: every region holding no
  // sourced fact on at least one dimension, plus the US sub-national roster the By-state sub-list
  // draws from. Both figures are counted, never asserted.
  const coverageGapRows = useMemo(() => {
    const sourcedDims = new Map<string, Set<string>>();
    for (const f of operationsCoverage?.facts ?? []) {
      const set = sourcedDims.get(f.region_code) ?? new Set<string>();
      set.add(f.dimension);
      sourcedDims.set(f.region_code, set);
    }
    const rows: { label: string; figure: string }[] = [];
    const stateRosterSize = Object.keys(STATE_LABELS).length;
    if (stateRosterSize > 0) {
      rows.push({
        label: "US · sub-national",
        figure: `${stateCostByCode.size} of ${stateRosterSize} priority jurisdictions`,
      });
    }
    for (const r of regions) {
      const filled = sourcedDims.get(r.key)?.size ?? 0;
      if (filled < MATRIX_DIMENSIONS.length) {
        rows.push({ label: r.label, figure: `${filled} of ${MATRIX_DIMENSIONS.length} sourced` });
      }
    }
    return rows;
  }, [operationsCoverage, regions, stateCostByCode]);

  return (
    <ListSurfaceShell
      title="Operations Intelligence"
      scopeLine={
        <>
          <b style={{ color: "var(--ink)" }}>{formatNumber(total)}</b> active items ·{" "}
          <b style={{ color: "var(--ink)" }}>{formatNumber(jurisdictionCount)}</b> jurisdictions · six dimensions per
          region · every fact carries a source and date
        </>
      }
      dateLabel={formatLocaleDate(nowFrom(nowIso), { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
      nowIso={nowIso}
      itemCount={total}
      scope="operations"
      searchPlaceholder={'Search regions and dimensions \u2014 or ask "warehouse labor rates, Singapore vs LA?"'}
      onSearch={(q) => setFacet("query", q)}
      bandCounts={bandCounts}
      selectedBand={filter.band}
      onSelectBand={(key) => toggleFacet("band", key)}
      facetGroups={facetGroups}
      secondaryFacetGroups={workspaceTagFacetGroups}
      aboveRows={
        <RegionDimensionMatrix
          regions={regions.map((r) => ({ key: r.key, label: r.label }))}
          dimensions={matrixDimensions.map((d) => ({ key: d.key, db: d.db, name: d.name }))}
          facts={operationsCoverage?.facts ?? []}
          coverageRows={operationsCoverage?.coverage ?? []}
          crossRefCountsByRegion={Object.fromEntries(regions.map((r) => [r.key, regsByRegion[r.key]?.length ?? 0]))}
          crossRefCountsPending={!restLoaded}
        />
      }
      rowsByBand={rowsByBand}
      perBandCap={PER_BAND_CAP}
      expandedBands={expanded}
      onExpandBand={(key) => setExpanded((s) => new Set(s).add(key))}
      /* Artboard 08/id="p8" draws nothing below the band cards; the item total and the
         jurisdiction count this line restated are both in the masthead scope line already ("25
         active items · 18 jurisdictions · ..."). Removed with the same line on /regulations and
         /market, which share this shared slot (lane lists60, 2026-09-08). */
      /* Item D3 (2026-09-08): the capacity-investment calculator moved to its own page, and a page
         nothing links to is unreachable. This is the one link to it — the same text-link geometry the
         band cards' own foot row uses (12px/600, underlined at rgba(0,0,0,.3), 24px minimum box), in
         the slot the removed By-state disclosure vacated. Artboard 08 draws no such row; logged in
         DEVIATION-LOG.md with the two new routes it belongs to. */
      belowRows={
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <Link
            href="/operations/calculator"
            data-audit="calculator-link"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 24,
              padding: "4px 0",
              fontSize: "var(--fs-12)",
              fontWeight: 600,
              color: "var(--ink)",
              textDecoration: "underline",
              textDecorationColor: "rgba(0,0,0,.3)",
            }}
          >
            Capacity investment estimate →
          </Link>
        </div>
      }
      rail={
        <>
          <RailCard title="Coverage gaps" dataAudit="coverage-gaps-rail">
            {/* Artboard 08/id="p8" COVERAGE GAPS card: one label/figure row per gap, then the note.
                Every row here is computed from the SAME coverage the matrix renders (a region that
                holds no sourced fact on a dimension) plus the sourced per-state cost facts — the
                artboard's own example rows (EU member states, Canada, Australia) name rosters this
                product has no table for, and an invented figure is never shown. */}
            {coverageGapRows.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--fs-12)", marginBottom: 8 }}>
                {coverageGapRows.map((row) => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontWeight: 600 }}>{row.label}</span>
                    <span style={{ color: "var(--ink-3)", textAlign: "right" }}>{row.figure}</span>
                  </div>
                ))}
              </div>
            )}
            <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: 0 }}>
              A known gap, stated plainly. State-level cost facts are the first fills.
            </p>
          </RailCard>
          <LegendRailCard />
        </>
      }
    />
  );
}
