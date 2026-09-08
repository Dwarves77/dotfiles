"use client";

/**
 * MapPageView — the map + register content body (UI system handoff
 * 2026-09-06, README screen 10 / artboard "Map"; lane uimapcomm,
 * 2026-09-06). Assembled ONLY from shared parts under src/components/ui/
 * plus the production Leaflet MapView: filter row (FilterChip/
 * FilterChipGroup) -> Regulatory map card -> Jurisdiction register card
 * (ListRow, one row per jurisdiction) -> rail (Immediate jurisdictions,
 * Coverage gaps, Legend). <Masthead/> + its <CommandBar/> render one level
 * up in src/app/map/page.tsx, matching the dashboard's split (README §0.3:
 * the command bar is the only search/ask surface — this file carries no
 * second search box).
 *
 * SUPERSEDES the prior TEMPLATE 09 body: EditorialMasthead, the
 * Split/Map/List view segment (the artboard has no such control — map and
 * register are always shown together), the "Active heat"/"Focused
 * jurisdiction" rail cards, and the page-local ListRow/Chip/SegButton
 * definitions duplicating the shared parts. All deleted this lane —
 * CLAUDE.md rule 13 forbids leaving them as unreferenced dormant code.
 *
 * ROW ANATOMY: the jurisdiction register reuses the ONE ListRow (README
 * §0.4) rather than a page-local table. A register row's subject is a
 * JURISDICTION, not a scored item, so it carries no impact/due/timeline/
 * tier of its own — ListRow's new optional `endStat` prop (additive
 * extension, see ListRow.tsx) replaces those four cells with a single
 * band-coloured "highest band + item count" stat, matching the artboard's
 * own HIGHEST BAND / ITEMS columns without forking a second row component.
 *
 * COUNTS: masthead/rail/register all read the regulations-gated
 * aggregation of `resources` (the map is a geographic view of Regulations
 * content) — count derivations kept from the prior body, re-themed only.
 *
 * MODE FILTERS: live on the item's real `transport_modes` tags, same as
 * /regulations. An item with no mode tag is hidden under a specific mode
 * (never faked in); the honest caption states how many of the current set
 * carry a mode tag.
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Resource } from "@/types/resource";
import { jurisdictionKeyOf } from "@/lib/map/jurisdiction-rollup";
import { JURISDICTIONS } from "@/lib/constants";
import { JURISDICTION_CENTROIDS } from "@/components/map/jurisdictionCentroids";
import type { RegionCoverage } from "@/lib/coverage-gaps";
import { TIER1_PRIORITY_ISOS } from "@/lib/tier1-priority-jurisdictions";
import { REGULATIONS_DOMAIN } from "@/lib/domains";
import { buildRegulationsRegionHref } from "@/lib/url-params/regulations-region-link";
import type { CommunityActivityRow, JurisdictionTone, MapJurisdiction } from "@/components/map/MapView";
import { BAND_ORDER, bandFromPriority, type UrgencyBand, type UrgencyBandKey } from "@/lib/urgency/bands";
import { ListRow, ListRowColumnHeader } from "@/components/ui/ListRow";
import { StateNote } from "@/components/ui/StateNote";
import { FilterChip, FilterChipGroup } from "@/components/ui/Chips";
import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { RailCard, LegendRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import { formatNumber } from "@/lib/format";

const MapView = dynamic(
  () => import("@/components/map/MapView").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)", fontSize: 13 }}>
        Loading map…
      </div>
    ),
  }
);

interface MapPageViewProps {
  resources: Resource[];
  coverageGaps?: RegionCoverage[];
  initialRegionFilter?: string | null;
  communityActivity?: CommunityActivityRow[];
}

type RegionChipKey = "EU" | "US" | "UK" | "LATAM" | "APAC" | "MEAF";

const REGION_CHIP_TO_JURS: Record<RegionChipKey, ReadonlyArray<string>> = {
  EU: ["eu"],
  US: ["us"],
  UK: ["uk"],
  LATAM: ["latam", "brazil", "caribbean"],
  APAC: ["asia", "china", "japan", "korea", "india", "asean", "hk", "singapore", "australia", "pacific"],
  MEAF: ["meaf", "gcc", "uae", "safrica", "wafrica", "eafrica", "nafrica"],
};

const REGION_CHIP_ORDER: RegionChipKey[] = ["EU", "US", "UK", "LATAM", "APAC", "MEAF"];

type Mode = "all" | "air" | "road" | "ocean" | "rail";
const MODE_CHIP_ORDER: { key: Mode; label: string }[] = [
  { key: "all", label: "All" },
  { key: "air", label: "Air" },
  { key: "road", label: "Road" },
  { key: "ocean", label: "Ocean" },
  { key: "rail", label: "Rail" },
];

// Register/list cap before the honest "+ N more" remainder note.
const REGISTER_ROW_CAP = 12;

function bandOf(items: Resource[]): UrgencyBand {
  // Highest-urgency band present among a jurisdiction's items — BAND_ORDER
  // is hot->cool, so the first band with a matching item wins.
  for (const b of BAND_ORDER) {
    if (items.some((r) => bandFromPriority(r.priority).key === b.key)) return b;
  }
  return BAND_ORDER[BAND_ORDER.length - 1];
}

export function MapPageView(props: MapPageViewProps) {
  const { resources, coverageGaps, initialRegionFilter = null, communityActivity = [] } = props;

  const activeRegionIso = useMemo<string | null>(() => {
    const raw = (initialRegionFilter || "").trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    return TIER1_PRIORITY_ISOS.has(upper) ? upper : null;
  }, [initialRegionFilter]);

  const coverageGapsRanked = useMemo(() => {
    const list = Array.isArray(coverageGaps) ? coverageGaps : [];
    return [...list]
      .sort((a, b) => {
        if (b.gap !== a.gap) return b.gap - a.gap;
        if (b.partial !== a.partial) return b.partial - a.partial;
        return a.region.name.localeCompare(b.region.name);
      })
      .slice(0, 5);
  }, [coverageGaps]);

  const [mode, setMode] = useState<Mode>("all");
  const [bandFilter, setBandFilter] = useState<UrgencyBandKey | null>(null);
  const [regionChips, setRegionChips] = useState<Set<RegionChipKey>>(new Set());
  const [selectedJurId, setSelectedJurId] = useState<string | null>(null);
  const [selectNonce, setSelectNonce] = useState(0);

  const focusJurisdiction = (id: string) => {
    setSelectedJurId((prev) => (prev === id ? null : id));
    setSelectNonce((n) => n + 1);
  };

  const toggleRegion = (key: RegionChipKey) => {
    setRegionChips((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearAllFilters = () => {
    setBandFilter(null);
    setRegionChips(new Set());
  };

  const preModeResources = useMemo(() => {
    const isoFiltered =
      activeRegionIso === null
        ? resources
        : resources.filter((r) => {
            const isos = (r.jurisdictionIso || []).map((c) => c.toUpperCase());
            return isos.includes(activeRegionIso);
          });

    const bandFiltered =
      bandFilter === null ? isoFiltered : isoFiltered.filter((r) => bandFromPriority(r.priority).key === bandFilter);

    const regionFiltered =
      regionChips.size === 0
        ? bandFiltered
        : bandFiltered.filter((r) => {
            const jur = jurisdictionKeyOf(r);
            for (const chip of regionChips) {
              if (REGION_CHIP_TO_JURS[chip].includes(jur)) return true;
            }
            return false;
          });

    return regionFiltered;
  }, [resources, activeRegionIso, bandFilter, regionChips]);

  const filteredResources = useMemo(
    () => (mode === "all" ? preModeResources : preModeResources.filter((r) => (r.modes || []).includes(mode))),
    [preModeResources, mode]
  );

  const modeTagStats = useMemo(() => {
    let tagged = 0;
    let total = 0;
    for (const r of preModeResources) {
      if (r.domain !== REGULATIONS_DOMAIN) continue;
      total += 1;
      if ((r.modes || []).length > 0) tagged += 1;
    }
    return { tagged, total };
  }, [preModeResources]);

  const jurisdictionRows = useMemo(() => {
    const groups = new Map<string, Resource[]>();
    for (const r of filteredResources) {
      if (r.domain !== REGULATIONS_DOMAIN) continue;
      const jur = jurisdictionKeyOf(r);
      const list = groups.get(jur) || [];
      list.push(r);
      groups.set(jur, list);
    }

    const rows = Array.from(groups.entries()).map(([id, items]) => {
      const def = JURISDICTIONS.find((j) => j.id === id);
      const band = bandOf(items);
      const topicCounts = new Map<string, number>();
      for (const r of items) {
        const t = r.topic || "";
        if (t) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
      }
      const activeThemes = Array.from(topicCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t.charAt(0).toUpperCase() + t.slice(1))
        .join(" · ");

      return {
        id,
        label: def?.label || id.toUpperCase(),
        code: (def?.id || id).slice(0, 3).toUpperCase(),
        count: items.length,
        band,
        activeThemes,
        charted: Boolean(JURISDICTION_CENTROIDS[id]),
      };
    });

    rows.sort((a, b) => b.count - a.count);
    return rows;
  }, [filteredResources]);

  const regulationResources = useMemo(() => filteredResources.filter((r) => r.domain === REGULATIONS_DOMAIN), [filteredResources]);
  const totalActiveCount = regulationResources.length;
  const liveJurisdictions = jurisdictionRows.length;

  const immediateRows = jurisdictionRows.filter((r) => r.band.key === "immediate");
  const immediateItemCount = useMemo(
    () => regulationResources.filter((r) => bandFromPriority(r.priority).key === "immediate").length,
    [regulationResources]
  );

  const chartedRows = jurisdictionRows.filter((r) => r.charted);
  const chartedItemCount = chartedRows.reduce((t, r) => t + r.count, 0);

  const registerRows = jurisdictionRows.slice(0, REGISTER_ROW_CAP);
  const shownItems = registerRows.reduce((t, r) => t + r.count, 0);
  const remainderJur = liveJurisdictions - registerRows.length;
  const remainderItems = totalActiveCount - shownItems;
  const remainderNote =
    remainderJur > 0
      ? `+ ${remainderJur} more jurisdiction${remainderJur === 1 ? "" : "s"} · ${remainderItems} item${remainderItems === 1 ? "" : "s"}`
      : null;

  const mapMarkers: MapJurisdiction[] = useMemo(
    () => jurisdictionRows.map((r) => ({ id: r.id, label: r.label, count: r.count, tone: r.band.key as JurisdictionTone })),
    [jurisdictionRows]
  );

  const modeNote = mode !== "all";

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 40px 40px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 28, alignItems: "start" }} className="cl-map-outer">
      <style>{`
        /* D-M3 (lane mobfix61, 2026-09-08, operator mobile report: "map page complete overlaps
           sections") [CONFIRMED root cause, twice over]. The rule here named .cl-map-grid, and
           .cl-map-grid is the INNER content column below — which is a display:flex element, so
           grid-template-columns on it was inert even on its own terms. The element that actually
           holds the two-column layout is THIS one, .cl-map-outer, and nothing addressed it: the
           300px rail track survived at every width, so at 390 the rail cards were laid out on top
           of the MODE / BAND / REGION chip rows. A media query naming a class no element in the
           file carries is a silent no-op, which is why this shipped; F41 in
           .discipline/fitness/functions is the mechanical check that the class named in an @media
           block exists on an element in the same file, so this class of defect cannot come back.

           Below 1280 the rail folds under the content — the same one-track rule every other page
           shell uses (ListSurfaceShell's own .cl-list-surface-grid), with minmax(0, 1fr) rather
           than a bare 1fr so the single track cannot grow past the viewport on its content's
           min-content width. Below 768 the page padding drops to the mobile 390 spec's measures
           (14px 16px 16px), replacing the hardcoded 40px sides. */
        @media (max-width: 1280px) {
          .cl-map-outer { grid-template-columns: minmax(0, 1fr) !important; }
        }
        @media (max-width: 767px) {
          .cl-map-outer { padding: 14px 16px 16px !important; gap: 16px !important; }
        }
      `}</style>

      {/* Filter row, Mode / Band / Region (README §0.4: grouped labelled sets). dc.html p10 puts
          this row at `grid-column:1/-1` in the content grid, spanning the rail as well as the
          content column, as ONE flex row with `gap:10px` and `flex-wrap:wrap` and `padding:0 4px`:
          at 1440 that lands MODE and BAND on the first line and REGION on the second, which is
          exactly what the artboard draws. Before lane map60 this row lived INSIDE the content
          column at gap 20, so the three groups stacked on three lines (postscript 14's own
          finding, "MODE/BAND/REGION are on three lines where the artboard puts MODE and BAND on
          one"). */}
      <div
        data-audit="map-filter-row"
        style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "0 4px" }}
      >
        <FilterChipGroup label="Mode">
          {MODE_CHIP_ORDER.map((m) => (
            <FilterChip key={m.key} active={mode === m.key} onClick={() => setMode(m.key)}>
              {m.label}
            </FilterChip>
          ))}
        </FilterChipGroup>
        <FilterChipGroup label="Band">
          <FilterChip active={bandFilter === null} onClick={() => setBandFilter(null)}>
            All
          </FilterChip>
          {BAND_ORDER.map((b) => (
            <FilterChip key={b.key} active={bandFilter === b.key} onClick={() => setBandFilter(b.key)}>
              {b.label}
            </FilterChip>
          ))}
        </FilterChipGroup>
        <FilterChipGroup label="Region">
          <FilterChip active={regionChips.size === 0} onClick={() => setRegionChips(new Set())}>
            All
          </FilterChip>
          {REGION_CHIP_ORDER.map((r) => (
            <FilterChip key={r} active={regionChips.has(r)} onClick={() => toggleRegion(r)}>
              {r}
            </FilterChip>
          ))}
        </FilterChipGroup>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }} className="cl-map-grid" data-testid="map-register-column">
        {modeNote && (
          <StateNote
            action={{ label: "Back to all modes", onClick: () => setMode("all") }}
          >
            Filtering to {MODE_CHIP_ORDER.find((m) => m.key === mode)?.label ?? mode}. Items without a
            transport-mode tag are hidden while a mode is selected —{" "}
            <strong>{modeTagStats.tagged}</strong> of {modeTagStats.total} charted item
            {modeTagStats.total === 1 ? "" : "s"} in the current view carr
            {modeTagStats.tagged === 1 ? "ies" : "y"} a mode tag.
          </StateNote>
        )}

        {/* Regulatory map */}
        <SectionCard>
          <SectionHeading
            title="Regulatory map"
            aside={`${chartedRows.length} charted of ${liveJurisdictions} live · ${chartedItemCount} of ${totalActiveCount} items`}
          />
          {/* dc.html p10: the map canvas is 420px tall.
              `data-guard-clip` DECLARES this box a clipping viewport to the rendering guard: Leaflet
              lays a tile grid deliberately wider than this frame and pans it inside the frame's own
              overflow, so a tile's unclipped rect can read as past the page's right edge while nothing
              the reader is meant to read is cut off. A tile is rendering substrate, not a run of words.
              The declaration is narrow by construction: it carries only this frame's descendants, and
              only while the frame itself sits inside the viewport (ux-assert.mjs, measureUx). */}
          <div
            style={{ position: "relative", height: 420, overflow: "hidden" }}
            data-testid="map-canvas"
            data-guard-clip
          >
            <div style={{ position: "absolute", inset: 0 }}>
              <MapView
                jurisdictions={mapMarkers}
                communityActivity={communityActivity}
                externalSelectJurId={selectedJurId}
                externalSelectNonce={selectNonce}
                onMarkerClick={(id) => focusJurisdiction(id)}
              />
            </div>
          </div>
        </SectionCard>

        {/* Jurisdiction register — one ListRow per jurisdiction. */}
        <SectionCard>
          <SectionHeading
            title="Jurisdiction register"
            aside={
              <>
                {liveJurisdictions} jurisdiction{liveJurisdictions === 1 ? "" : "s"} · click to focus the
                map
              </>
            }
          />
          {registerRows.length === 0 ? (
            <div style={{ padding: 16 }}>
              <StateNote action={{ label: "Clear filters", onClick: clearAllFilters }}>
                No jurisdictions match this filter.
              </StateNote>
            </div>
          ) : (
            <div data-testid="jurisdiction-register-rows">
              {/* dc.html p10's own column header row over the register grid (lane map60:
                  ListRowColumnHeader's additive `variant="register"`, not a page-local header). */}
              <ListRowColumnHeader variant="register" />
              {registerRows.map((row) => (
                <div key={row.id} onClick={() => focusJurisdiction(row.id)} style={{ cursor: "pointer" }}>
                  <ListRow
                    variant="register"
                    href={buildRegulationsRegionHref([row.id])}
                    band={row.band}
                    jurisdiction={row.code}
                    title={row.label}
                    meta={row.activeThemes || "—"}
                    endStat={{ label: row.band.label, value: formatNumber(row.count), band: row.band }}
                    minHeight={44}
                  />
                </div>
              ))}
            </div>
          )}
          {remainderNote && (
            <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", margin: 0, padding: "10px 16px", borderTop: "1px solid var(--line-3)" }}>
              {remainderNote} — full register on the{" "}
              <Link href="/regulations" style={{ color: "var(--ink)", fontWeight: 700 }}>
                Regulations index
              </Link>
              .
            </p>
          )}
          {immediateItemCount > 0 && (
            // dc.html p10: the foot strip sits at `margin:0 16px 14px` inside the card, and its
            // link carries the arrow in its own label (the convention artboard 11's "Review
            // changes →" uses, which WatchlistSurface already follows).
            <div style={{ padding: "0 16px 14px" }}>
              <StateNote band={BAND_ORDER[0]} action={{ label: "Open the register →", href: "/regulations" }}>
                Immediate · {immediateItemCount} item{immediateItemCount === 1 ? "" : "s"} bind within 90
                days across {immediateRows.length} jurisdiction{immediateRows.length === 1 ? "" : "s"}
              </StateNote>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Rail, the SHARED RailCard/LegendRailCard (src/components/list-surface/
          ListSurfaceRailCards.tsx), not a page-local card. Before lane map60 this file carried its
          own card shell, its own rail title style and a verbatim copy of the Legend card's three
          definitions: three duplications of shared parts, which CLAUDE.md rule 13 forbids. Order
          per artboard 10: Immediate jurisdictions, Coverage gaps, Legend. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <RailCard
          dataAudit="map-immediate-rail"
          title={`Immediate · ${immediateRows.length} jurisdiction${immediateRows.length === 1 ? "" : "s"}`}
        >
          {immediateRows.length === 0 ? (
            <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-2)", margin: 0 }}>
              No jurisdiction is in the Immediate band for the current filter.
            </p>
          ) : (
            // dc.html p10: rows are `grid-template-columns:3px 1fr auto`, gap 10, 8px between
            // rows, 12px type; the name is weight 600 and the count is ink at weight 700.
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "var(--fs-12)" }}>
              {immediateRows.slice(0, 6).map((row) => (
                <div key={row.id} style={{ display: "grid", gridTemplateColumns: "3px 1fr auto", gap: 10, alignItems: "center" }}>
                  <span aria-hidden="true" style={{ background: "var(--immediate)", borderRadius: 2, height: "100%" }} />
                  <span style={{ fontWeight: 600, color: "var(--ink)", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {row.label}
                  </span>
                  <span style={{ color: "var(--ink)", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {row.count} immediate item{row.count === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </RailCard>

        <RailCard dataAudit="map-coverage-rail" title="Coverage gaps">
          {coverageGapsRanked.length === 0 ? (
            <p style={{ fontSize: "var(--fs-115)", color: "var(--ink-2)", margin: 0 }}>Coverage snapshot unavailable.</p>
          ) : (
            // dc.html p10: a 6px-gap list of 12px rows, name weight 600 left, "N of N" muted
            // right, no dividers and no row padding. Each row stays the region link it already
            // was (a real filter action, not decoration), sized to the 24px minimum box.
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--fs-12)" }}>
              {coverageGapsRanked.map((row) => (
                <Link
                  key={row.region.id}
                  href={`/map?region-filter=${encodeURIComponent(row.region.id)}`}
                  aria-label={`Filter map to ${row.region.name} (${row.gap} gaps of ${row.total})`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    minHeight: 24,
                    alignItems: "center",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{row.region.name}</span>
                  <span style={{ color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                    {row.covered} of {row.total}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </RailCard>

        {/* Artboard 10's third rail card is the SAME Legend every list surface draws (Impact,
            Timeline, Source tier), the shared card, not a copy. The marker/band key is a
            different thing and lives inside the map card's own KEY box. */}
        <LegendRailCard />
      </div>
    </div>
  );
}
