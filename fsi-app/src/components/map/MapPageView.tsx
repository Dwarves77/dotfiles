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
import { getJurisdiction } from "@/lib/scoring";
import { JURISDICTIONS } from "@/lib/constants";
import { JURISDICTION_CENTROIDS } from "@/components/map/jurisdictionCentroids";
import type { RegionCoverage } from "@/lib/coverage-gaps";
import { TIER1_PRIORITY_ISOS } from "@/lib/tier1-priority-jurisdictions";
import { REGULATIONS_DOMAIN } from "@/lib/domains";
import { buildRegulationsRegionHref } from "@/lib/url-params/regulations-region-link";
import type { CommunityActivityRow, JurisdictionTone, MapJurisdiction } from "@/components/map/MapView";
import { BAND_ORDER, bandFromPriority, type UrgencyBand, type UrgencyBandKey } from "@/lib/urgency/bands";
import { ListRow } from "@/components/ui/ListRow";
import { StateNote } from "@/components/ui/StateNote";
import { FilterChip, FilterChipGroup } from "@/components/ui/Chips";
import { SectionRule } from "@/components/ui/SectionRule";
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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
      {/* Ruling 5.1 (2026-09-07): the graduated rule above the section title wins, no divider
          below the title — see CardHead below, whose borderBottom this removes. */}
      <SectionRule />
      {children}
    </div>
  );
}

function CardHead({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div style={{ padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
      <p style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 15, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink)", margin: 0 }}>{title}</p>
      {aside && <span style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)" }}>{aside}</span>}
    </div>
  );
}

const railLabelStyle: React.CSSProperties = {
  fontSize: "var(--fs-105)",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  margin: "0 0 10px",
};

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
            const jur = (r.jurisdiction || getJurisdiction(r) || "global").toLowerCase();
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
      const jur = (r.jurisdiction || getJurisdiction(r) || "global").toLowerCase();
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
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "16px 40px 40px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 28, alignItems: "start" }} className="cl-map-outer">
      <style>{`
        @media (max-width: 1280px) {
          .cl-map-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }} className="cl-map-grid" data-testid="map-register-column">
        {/* Filter row — Mode / Band / Region (README §0.4: grouped labelled sets). */}
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
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
        <Card>
          <CardHead
            title="Regulatory map"
            aside={`${chartedRows.length} charted of ${liveJurisdictions} live · ${chartedItemCount} of ${totalActiveCount} items`}
          />
          <div style={{ position: "relative", height: 460 }} data-testid="map-canvas">
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
        </Card>

        {/* Jurisdiction register — one ListRow per jurisdiction. */}
        <Card>
          <CardHead
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
              {registerRows.map((row) => (
                <div key={row.id} onClick={() => focusJurisdiction(row.id)} style={{ cursor: "pointer" }}>
                  <ListRow
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
            <div style={{ padding: 12 }}>
              <StateNote band={BAND_ORDER[0]} action={{ label: "Open the register", href: "/regulations" }}>
                Immediate · {immediateItemCount} item{immediateItemCount === 1 ? "" : "s"} bind within 90
                days across {immediateRows.length} jurisdiction{immediateRows.length === 1 ? "" : "s"}
              </StateNote>
            </div>
          )}
        </Card>
      </div>

      {/* Rail */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card>
          <div style={{ padding: "14px 16px" }}>
            <p style={railLabelStyle}>
              Immediate · {immediateRows.length} jurisdiction{immediateRows.length === 1 ? "" : "s"}
            </p>
            {immediateRows.length === 0 ? (
              <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-2)", margin: 0 }}>
                No jurisdiction is in the Immediate band for the current filter.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {immediateRows.slice(0, 6).map((row) => (
                  <div key={row.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span aria-hidden="true" style={{ width: 3, height: 14, background: "var(--immediate)", flexShrink: 0 }} />
                      <span style={{ fontSize: "var(--fs-125)", fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {row.label}
                      </span>
                    </span>
                    <span style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                      {row.count} immediate item{row.count === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: "14px 16px" }}>
            <p style={railLabelStyle}>Coverage gaps</p>
            {coverageGapsRanked.length === 0 ? (
              <p style={{ fontSize: "var(--fs-115)", color: "var(--ink-2)", margin: 0 }}>Coverage snapshot unavailable.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {coverageGapsRanked.map((row, idx) => (
                  <Link
                    key={row.region.id}
                    href={`/map?region-filter=${encodeURIComponent(row.region.id)}`}
                    aria-label={`Filter map to ${row.region.name} (${row.gap} gaps of ${row.total})`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "8px 0",
                      borderBottom: idx === coverageGapsRanked.length - 1 ? "0" : "1px solid var(--line-3)",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <span style={{ fontSize: "var(--fs-12)", color: "var(--ink)" }}>{row.region.name}</span>
                    <span style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                      {row.covered} of {row.total}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Legend — the same content the dashboard's rail Legend card carries (README's shared
            explanation of Impact/Timeline/Source tier, reused verbatim per artboard 10's own
            rail, not a map-specific marker key — the marker/band key already lives inside the
            map card's own "KEY" box). */}
        <Card>
          <div style={{ padding: "14px 16px" }}>
            <p style={railLabelStyle}>Legend</p>
            <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Impact</dt>
                <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>
                  Four scored dimensions, sorted low to high: green left, red right. Height is the sum, score 1–3.
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Timeline</dt>
                <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>
                  Passed · next · ahead.
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Source tier</dt>
                <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>
                  T1 binding law → T6 commentary.
                </dd>
              </div>
            </dl>
          </div>
        </Card>
      </div>
    </div>
  );
}
