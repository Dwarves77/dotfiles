"use client";

/**
 * MapPageView — redesign TEMPLATE 09 (HANDOFF §6.9).
 *
 * The production map component (Leaflet basemap, zoom, fly-to) is KEPT —
 * the mock's schematic SVG is a placeholder and is NOT copied. This view
 * restyles the surrounding chrome to the "Pages - 09 Map" mock:
 *   - filter bar: Modes / Priority / Regions chips + Split / Map / List segment
 *   - the production MapView (real basemap) with marker encoding
 *     (radius = item count, colour = urgency, count numeral inside)
 *   - rail: Active heat · focused-jurisdiction panel · Coverage gaps
 *   - jurisdiction register band under the map (compact auto-fill tiles)
 *   - List view: the jurisdiction register as a table
 *
 * COUNTS: the masthead, Active-heat, register band, and List all read from
 * the regulations-gated aggregation of `resources`; the map is a geographic
 * view of Regulations content (platform-intent §3/§4), so markers, rail, and
 * masthead all gate on the regulations domain.
 *
 * MODE FILTERS (honest-state, HANDOFF §6.9 + §7): items are not yet tagged by
 * transport mode, so the map does NOT filter by mode. Selecting a mode shows
 * an honest pending note that links to the Regulations index (where mode
 * filters work today). Mode filtering is never faked on the map.
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import type { Resource } from "@/types/resource";
import { getJurisdiction } from "@/lib/scoring";
import { JURISDICTIONS } from "@/lib/constants";
import { JURISDICTION_CENTROIDS } from "@/components/map/jurisdictionCentroids";
import type { RegionCoverage } from "@/lib/coverage-gaps";
import { TIER1_PRIORITY_ISOS } from "@/lib/tier1-priority-jurisdictions";
import { REGULATIONS_DOMAIN } from "@/lib/domains";
import type { CommunityActivityRow, JurisdictionTone, MapJurisdiction } from "@/components/map/MapView";

const MapView = dynamic(
  () => import("@/components/map/MapView").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-secondary)",
          fontSize: 13,
        }}
      >
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

// Region chip vocabulary per mock: EU / US / UK / LATAM / APAC / MEAF.
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

type PriorityChipKey = "CRITICAL" | "HIGH" | "MODERATE";
const PRIORITY_CHIP_ORDER: { key: PriorityChipKey; label: string }[] = [
  { key: "CRITICAL", label: "Critical" },
  { key: "HIGH", label: "High" },
  { key: "MODERATE", label: "Moderate" },
];

type ViewMode = "split" | "map" | "list";

// Mode filtering is honest-pending (§6.9): the chips drive the pending note
// only — they never filter the markers/rail.
type Mode = "all" | "ocean" | "air" | "road";
const MODE_CHIP_ORDER: { key: Mode; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ocean", label: "Ocean" },
  { key: "air", label: "Air" },
  { key: "road", label: "Road" },
];

// ── Urgency tone helpers ──

type Tone = "critical" | "high" | "moderate" | "low";

function topPriority(items: Resource[]): Tone {
  if (items.some((r) => r.priority === "CRITICAL")) return "critical";
  if (items.some((r) => r.priority === "HIGH")) return "high";
  if (items.some((r) => r.priority === "MODERATE")) return "moderate";
  return "low";
}

// Severity spectrum per HANDOFF §2 (sev-*). The map encodes colour = urgency.
const TONE_COLOR: Record<Tone, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  moderate: "var(--sev-moderate)",
  low: "var(--sev-low)",
};

const TONE_LABEL: Record<Tone, string> = {
  critical: "Critical",
  high: "High",
  moderate: "Moderate",
  low: "Low",
};

// Number of jurisdiction tiles surfaced in the register band / List before
// the "+ N more" footer points to the full register on the Regulations index.
const REGISTER_TILE_CAP = 12;

// ── Component ──

export function MapPageView(props: MapPageViewProps) {
  const {
    resources,
    coverageGaps,
    initialRegionFilter = null,
    communityActivity = [],
  } = props;

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
  const [priorityChips, setPriorityChips] = useState<Set<PriorityChipKey>>(new Set());
  const [regionChips, setRegionChips] = useState<Set<RegionChipKey>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  // Focused jurisdiction (marker / tile / row click). Drives both the rail
  // focus panel and the map fly-to (via the nonce bump so re-selecting the
  // same jurisdiction re-fires the animation).
  const [selectedJurId, setSelectedJurId] = useState<string | null>(null);
  const [selectNonce, setSelectNonce] = useState(0);

  const focusJurisdiction = (id: string) => {
    setSelectedJurId((prev) => (prev === id ? null : id));
    setSelectNonce((n) => n + 1);
  };
  const clearSelection = () => setSelectedJurId(null);

  const togglePriority = (key: PriorityChipKey) => {
    setPriorityChips((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
    setPriorityChips(new Set());
    setRegionChips(new Set());
  };

  // Resource filter: ISO region (URL) + Priority chips + Region chips. Mode is
  // intentionally NOT applied — mode tagging is a pending backend surface, so
  // the map shows all modes and the honest note explains it (§6.9).
  const filteredResources = useMemo(() => {
    const isoFiltered =
      activeRegionIso === null
        ? resources
        : resources.filter((r) => {
            const isos = (r.jurisdictionIso || []).map((c) => c.toUpperCase());
            return isos.includes(activeRegionIso);
          });

    const priorityFiltered =
      priorityChips.size === 0
        ? isoFiltered
        : isoFiltered.filter((r) => priorityChips.has(r.priority as PriorityChipKey));

    const regionFiltered =
      regionChips.size === 0
        ? priorityFiltered
        : priorityFiltered.filter((r) => {
            const jur = (r.jurisdiction || getJurisdiction(r) || "global").toLowerCase();
            for (const chip of regionChips) {
              if (REGION_CHIP_TO_JURS[chip].includes(jur)) return true;
            }
            return false;
          });

    return regionFiltered;
  }, [resources, activeRegionIso, priorityChips, regionChips]);

  // Regulations-gated aggregation by jurisdiction (map is a Regulations view).
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
      const tone = topPriority(items);
      const topicCounts = new Map<string, number>();
      for (const r of items) {
        const t = r.topic || "";
        if (t) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
      }
      const subtitle = Array.from(topicCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t.charAt(0).toUpperCase() + t.slice(1))
        .join(" · ");

      return {
        id,
        label: def?.label || id.toUpperCase(),
        region: def?.region || "Global",
        count: items.length,
        tone,
        subtitle,
        charted: Boolean(JURISDICTION_CENTROIDS[id]),
      };
    });

    rows.sort((a, b) => b.count - a.count);
    return rows;
  }, [filteredResources]);

  // Regulations-only totals for the masthead / summaries.
  const regulationResources = useMemo(
    () => filteredResources.filter((r) => r.domain === REGULATIONS_DOMAIN),
    [filteredResources]
  );
  const totalActiveCount = regulationResources.length;
  const liveJurisdictions = jurisdictionRows.length;
  const regulationsCriticalCount = new Set(
    regulationResources
      .filter((r) => r.priority === "CRITICAL")
      .map((r) => r.jurisdiction || "global")
  ).size;

  // Active heat.
  const criticalRows = jurisdictionRows.filter((r) => r.tone === "critical");
  const criticalItemCount = useMemo(
    () => regulationResources.filter((r) => r.priority === "CRITICAL").length,
    [regulationResources]
  );

  // Charted (has a centroid → renders as a marker) vs live.
  const chartedRows = jurisdictionRows.filter((r) => r.charted);
  const chartedItemCount = chartedRows.reduce((t, r) => t + r.count, 0);

  const isFiltered =
    priorityChips.size > 0 || regionChips.size > 0 || activeRegionIso !== null;

  const visibleSummary = isFiltered
    ? `${liveJurisdictions} jurisdiction${liveJurisdictions === 1 ? "" : "s"} match · ${totalActiveCount} item${totalActiveCount === 1 ? "" : "s"}`
    : `${chartedRows.length} charted of ${liveJurisdictions} live · ${chartedItemCount} of ${totalActiveCount} items`;

  // Register band / List: top N jurisdictions, honest "+ N more" remainder.
  const registerRows = jurisdictionRows.slice(0, REGISTER_TILE_CAP);
  const shownItems = registerRows.reduce((t, r) => t + r.count, 0);
  const remainderJur = liveJurisdictions - registerRows.length;
  const remainderItems = totalActiveCount - shownItems;
  const remainderNote =
    remainderJur > 0
      ? `+ ${remainderJur} more jurisdiction${remainderJur === 1 ? "" : "s"} · ${remainderItems} item${remainderItems === 1 ? "" : "s"}`
      : null;

  // MapView markers (production Leaflet).
  const mapMarkers: MapJurisdiction[] = useMemo(
    () =>
      jurisdictionRows.map((r) => ({
        id: r.id,
        label: r.label,
        count: r.count,
        tone: r.tone as JurisdictionTone,
      })),
    [jurisdictionRows]
  );

  const selectedRow = jurisdictionRows.find((r) => r.id === selectedJurId) || null;
  const modeNote = mode !== "all";
  const showMap = viewMode !== "list";
  const showRail = viewMode === "split";
  const showList = viewMode === "list";

  return (
    <div style={{ background: "var(--color-background)", minHeight: "100vh" }}>
      <EditorialMasthead
        title="Global Regulatory Map"
        meta={
          <>
            Regulations by jurisdiction. Marker size encodes item count; colour encodes urgency.
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 800 }}>{liveJurisdictions}</b> jurisdictions live
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 800 }}>{totalActiveCount}</b> active items
            {" · "}
            <b style={{ color: "var(--sev-critical)", fontWeight: 800 }}>
              {regulationsCriticalCount} jurisdiction{regulationsCriticalCount === 1 ? "" : "s"} with critical items
            </b>
          </>
        }
      />

      <div style={{ padding: "24px 36px 80px" }}>
        {/* Filter bar — Modes / Priority / Regions + view segment (§6.9). */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            margin: "0 0 14px",
          }}
        >
          <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={chipGroupLabelStyle}>Modes</span>
              {MODE_CHIP_ORDER.map((m) => (
                <Chip key={m.key} on={mode === m.key} onClick={() => setMode(m.key)}>
                  {m.label}
                </Chip>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={chipGroupLabelStyle}>Priority</span>
              <Chip on={priorityChips.size === 0} onClick={() => setPriorityChips(new Set())}>
                All
              </Chip>
              {PRIORITY_CHIP_ORDER.map((p) => (
                <Chip key={p.key} on={priorityChips.has(p.key)} onClick={() => togglePriority(p.key)}>
                  {p.label}
                </Chip>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={chipGroupLabelStyle}>Regions</span>
              <Chip on={regionChips.size === 0} onClick={() => setRegionChips(new Set())}>
                All
              </Chip>
              {REGION_CHIP_ORDER.map((r) => (
                <Chip key={r} on={regionChips.has(r)} onClick={() => toggleRegion(r)}>
                  {r}
                </Chip>
              ))}
            </div>
          </div>

          {/* View segment — Split / Map / List (joined control). */}
          <div
            role="group"
            aria-label="Map view mode"
            style={{
              display: "flex",
              border: "1px solid var(--color-border-medium)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <SegButton on={viewMode === "split"} onClick={() => setViewMode("split")}>Split</SegButton>
            <SegButton on={viewMode === "map"} onClick={() => setViewMode("map")}>Map</SegButton>
            <SegButton on={viewMode === "list"} onClick={() => setViewMode("list")}>List</SegButton>
          </div>
        </div>

        {/* Honest note when a mode filter is picked (mode tagging pending). */}
        {modeNote && (
          <div
            role="status"
            style={{
              border: "1px dashed var(--color-border-strong)",
              borderRadius: 6,
              background: "var(--color-background)",
              padding: "11px 16px",
              margin: "0 0 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
              <b style={{ color: "var(--brass)" }}>Mode view pending.</b> Items on the map are not yet
              tagged by transport mode — markers show all modes until mode tagging lands. Mode filters
              work today on the{" "}
              <Link
                href="/regulations"
                style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}
              >
                Regulations index
              </Link>
              .
            </p>
            <button
              type="button"
              onClick={() => setMode("all")}
              style={{
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 800,
                color: "var(--color-primary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                padding: 0,
              }}
            >
              Back to all modes
            </button>
          </div>
        )}

        {/* SPLIT / MAP view */}
        {showMap && (
          <>
            <div
              className="cl-map-layout"
              style={{
                display: "grid",
                gridTemplateColumns: showRail ? "minmax(0,1fr) 320px" : "minmax(0,1fr)",
                gap: 18,
                alignItems: "start",
              }}
            >
              {/* Map panel (production Leaflet basemap — NOT the mock SVG). */}
              <div
                className="cl-map-frame"
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    padding: "11px 18px",
                    borderBottom: "1px solid var(--color-border-subtle)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.13em",
                      textTransform: "uppercase",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Regulatory map
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{visibleSummary}</span>
                </div>
                <div style={{ position: "relative", height: 540 }}>
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
                <p
                  style={{
                    fontSize: 10.5,
                    color: "var(--color-text-muted)",
                    margin: 0,
                    padding: "9px 18px",
                    background: "var(--color-background)",
                    borderTop: "1px solid var(--color-border-subtle)",
                  }}
                >
                  Real basemap — click a marker or a jurisdiction tile to focus it. Marker size encodes
                  item count; colour encodes urgency.
                </p>
              </div>

              {/* Rail */}
              {showRail && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
                  {/* Active heat */}
                  <div
                    style={{
                      background: "var(--color-bg-ai-strip)",
                      border: "1px solid var(--color-active-border)",
                      borderLeft: "3px solid var(--sev-critical)",
                      borderRadius: 8,
                      padding: "13px 16px",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        letterSpacing: "0.13em",
                        textTransform: "uppercase",
                        color: "var(--sev-critical)",
                        margin: "0 0 4px",
                      }}
                    >
                      Active heat
                    </p>
                    <p style={{ margin: 0 }}>
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 26,
                          color: "var(--sev-critical)",
                        }}
                      >
                        {criticalRows.length}
                      </span>{" "}
                      <span style={{ fontSize: 12.5, fontWeight: 800 }}>
                        jurisdiction{criticalRows.length === 1 ? "" : "s"} with critical
                      </span>
                    </p>
                    <p
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--color-text-muted)",
                        margin: "4px 0 2px",
                      }}
                    >
                      {criticalItemCount} critical item{criticalItemCount === 1 ? "" : "s"} total
                    </p>
                    <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: 0 }}>
                      {criticalRows.length === 0
                        ? "No jurisdictions in a critical state for the current filter."
                        : `${criticalRows
                            .slice(0, 3)
                            .map((r) => r.label)
                            .join(", ")}${criticalRows.length > 3 ? ", and others" : ""} ${
                            criticalRows.length === 1 ? "has" : "have"
                          } critical items in flight.`}
                    </p>
                  </div>

                  {/* Focused jurisdiction */}
                  {selectedRow && (
                    <div
                      style={{
                        background: "var(--color-surface)",
                        border: "2px solid var(--color-text-primary)",
                        borderRadius: 8,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "11px 16px",
                          borderBottom: "1px solid var(--color-border-subtle)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <p
                          style={{
                            fontSize: 9.5,
                            fontWeight: 800,
                            letterSpacing: "0.13em",
                            textTransform: "uppercase",
                            color: "var(--color-text-muted)",
                            margin: 0,
                          }}
                        >
                          Focused jurisdiction
                        </p>
                        <button
                          type="button"
                          onClick={clearSelection}
                          style={{
                            fontFamily: "inherit",
                            fontSize: 11,
                            fontWeight: 800,
                            color: "var(--color-text-secondary)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          Clear ×
                        </button>
                      </div>
                      <div style={{ padding: "14px 16px" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: 10,
                          }}
                        >
                          <p
                            style={{
                              fontFamily: "var(--font-display)",
                              fontSize: 22,
                              letterSpacing: "0.02em",
                              textTransform: "uppercase",
                              margin: 0,
                            }}
                          >
                            {selectedRow.label}
                          </p>
                          <span
                            style={{
                              fontFamily: "var(--font-display)",
                              fontSize: 22,
                              color: TONE_COLOR[selectedRow.tone],
                            }}
                          >
                            {selectedRow.count}
                          </span>
                        </div>
                        <p style={{ margin: "6px 0 8px" }}>
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 800,
                              letterSpacing: "0.09em",
                              textTransform: "uppercase",
                              color: TONE_COLOR[selectedRow.tone],
                              border: `1px solid ${TONE_COLOR[selectedRow.tone]}`,
                              borderRadius: 4,
                              padding: "2px 8px",
                            }}
                          >
                            {TONE_LABEL[selectedRow.tone]}
                          </span>
                        </p>
                        {selectedRow.subtitle ? (
                          <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>
                            Active themes · {selectedRow.subtitle}
                          </p>
                        ) : (
                          <p style={{ fontSize: 11.5, color: "var(--color-text-muted)", margin: "0 0 10px" }}>
                            — no topic tags on record for this jurisdiction
                          </p>
                        )}
                        <Link
                          href={`/regulations?region=${encodeURIComponent(selectedRow.id.toUpperCase())}`}
                          style={{
                            display: "inline-block",
                            fontSize: 11.5,
                            fontWeight: 800,
                            color: "#FFFFFF",
                            background: "var(--color-primary)",
                            borderRadius: 6,
                            padding: "8px 14px",
                            textDecoration: "none",
                          }}
                        >
                          Open in Regulations →
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* Coverage gaps (data-driven; honest dashed frame) */}
                  <div
                    style={{
                      background: "var(--color-surface)",
                      border: "1px dashed var(--color-border-strong)",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "11px 16px",
                        borderBottom: "1px solid var(--color-border-subtle)",
                      }}
                    >
                      <p
                        style={{
                          fontSize: 9.5,
                          fontWeight: 800,
                          letterSpacing: "0.13em",
                          textTransform: "uppercase",
                          color: "var(--brass)",
                          margin: 0,
                        }}
                      >
                        Coverage gaps
                      </p>
                    </div>
                    <div style={{ padding: "6px 16px 12px" }}>
                      {coverageGapsRanked.length === 0 ? (
                        <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: "6px 0" }}>
                          Coverage snapshot unavailable.
                        </p>
                      ) : (
                        coverageGapsRanked.map((row, idx) => (
                          <Link
                            key={row.region.id}
                            href={`/map?region-filter=${encodeURIComponent(row.region.id)}`}
                            aria-label={`Filter map to ${row.region.name} (${row.gap} gaps of ${row.total})`}
                            style={{
                              display: "block",
                              padding: "8px 0",
                              borderBottom:
                                idx === coverageGapsRanked.length - 1
                                  ? "0"
                                  : "1px solid var(--color-border-subtle)",
                              textDecoration: "none",
                              color: "inherit",
                            }}
                          >
                            <p style={{ fontSize: 12, fontWeight: 800, margin: 0 }}>{row.region.name}</p>
                            <p style={{ fontSize: 10.5, color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                              {row.covered} of {row.total} priority jurisdictions covered ·{" "}
                              {row.gap} {row.gap === 1 ? "gap" : "gaps"}
                              {row.partial > 0 ? ` · ${row.partial} partial` : ""}
                            </p>
                          </Link>
                        ))
                      )}
                      <p
                        style={{
                          fontSize: 10.5,
                          color: "var(--color-text-muted)",
                          lineHeight: 1.55,
                          margin: "6px 0 0",
                          borderTop: "1px solid var(--color-border-subtle)",
                          paddingTop: 8,
                        }}
                      >
                        Sub-national coverage is a known gap, stated plainly. The state-level cost facts
                        on{" "}
                        <Link
                          href="/operations"
                          style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}
                        >
                          Operations
                        </Link>{" "}
                        are the first fills.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Jurisdiction register band — under the map, no scroll hunting. */}
            <div
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                overflow: "hidden",
                margin: "18px 0 0",
              }}
            >
              <div
                style={{
                  padding: "11px 18px",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <p
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: "0.13em",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    margin: 0,
                  }}
                >
                  By jurisdiction · click to focus
                </p>
                {remainderNote && (
                  <p style={{ fontSize: 10.5, color: "var(--color-text-muted)", margin: 0 }}>
                    {remainderNote} — full register on the{" "}
                    <Link
                      href="/regulations"
                      style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}
                    >
                      Regulations index
                    </Link>
                  </p>
                )}
              </div>
              {registerRows.length === 0 ? (
                <div style={{ padding: "14px 18px" }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, margin: "0 0 2px" }}>
                    No jurisdictions match this filter.
                  </p>
                  <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: 0 }}>
                    Clear the priority or region filter to see the full register.{" "}
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      style={{
                        fontFamily: "inherit",
                        fontSize: 11.5,
                        fontWeight: 800,
                        color: "var(--color-primary)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Clear filters
                    </button>
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill,minmax(215px,1fr))",
                    gap: 1,
                    background: "var(--color-border-subtle)",
                  }}
                >
                  {registerRows.map((row) => {
                    const selected = row.id === selectedJurId;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => focusJurisdiction(row.id)}
                        aria-pressed={selected}
                        aria-label={`Focus ${row.label} (${row.count} items)`}
                        style={{
                          fontFamily: "inherit",
                          cursor: "pointer",
                          width: "100%",
                          display: "block",
                          textAlign: "left",
                          padding: "10px 14px",
                          background: selected ? "var(--color-bg-ai-strip)" : "var(--color-surface)",
                          border: "none",
                          borderLeft: selected
                            ? "3px solid var(--color-primary)"
                            : "3px solid transparent",
                        }}
                      >
                        <span
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                            <span
                              aria-hidden="true"
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                background: TONE_COLOR[row.tone],
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                fontSize: 12.5,
                                fontWeight: 800,
                                color: "var(--color-text-primary)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {row.label}
                            </span>
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-display)",
                              fontSize: 14,
                              color: TONE_COLOR[row.tone],
                              border: `1px solid ${TONE_COLOR[row.tone]}`,
                              borderRadius: 4,
                              padding: "2px 9px",
                              flexShrink: 0,
                            }}
                          >
                            {row.count}
                          </span>
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: 10.5,
                            color: "var(--color-text-muted)",
                            margin: "4px 0 0",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {row.subtitle || "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* LIST view — the jurisdiction register as a table. */}
        {showList && (
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 20px",
                background: "var(--color-surface-raised)",
                borderBottom: "1px solid var(--color-border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                Jurisdiction register
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-text-muted)" }}>
                {visibleSummary}
              </span>
            </div>
            {registerRows.length === 0 ? (
              <div style={{ padding: "16px 20px" }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, margin: "0 0 2px" }}>
                  No jurisdictions match this filter.
                </p>
                <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: 0 }}>
                  Clear the priority or region filter to see the full register.{" "}
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    style={{
                      fontFamily: "inherit",
                      fontSize: 11.5,
                      fontWeight: 800,
                      color: "var(--color-primary)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Clear filters
                  </button>
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "44px 1.2fr 1.6fr 0.8fr 0.6fr" }}>
                  <span style={listHeadCellStyle} />
                  <span style={{ ...listHeadCellStyle, padding: "10px 14px 10px 0" }}>Jurisdiction</span>
                  <span style={listHeadCellStyle}>Active themes</span>
                  <span style={listHeadCellStyle}>Priority</span>
                  <span style={{ ...listHeadCellStyle, padding: "10px 20px 10px 14px", textAlign: "right" }}>
                    Items
                  </span>
                  {registerRows.map((row) => (
                    <ListRow key={row.id} row={row} />
                  ))}
                </div>
                {remainderNote && (
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-muted)",
                      margin: 0,
                      padding: "10px 20px",
                      background: "var(--color-background)",
                    }}
                  >
                    {remainderNote}. Priority is the highest urgency among a jurisdiction&apos;s active
                    items.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .cl-map-layout {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

// ── List row ──

interface RegisterRow {
  id: string;
  label: string;
  count: number;
  tone: Tone;
  subtitle: string;
}

function ListRow({ row }: { row: RegisterRow }) {
  const cell: React.CSSProperties = {
    borderBottom: "1px solid var(--color-border-subtle)",
    display: "flex",
    alignItems: "center",
    background: "transparent",
  };
  return (
    <>
      <span style={{ ...cell, padding: "12px 0 12px 20px" }}>
        <span
          aria-hidden="true"
          style={{ width: 9, height: 9, borderRadius: 999, background: TONE_COLOR[row.tone], display: "inline-block" }}
        />
      </span>
      <span style={{ ...cell, fontSize: 13, fontWeight: 800, padding: "12px 14px 12px 0" }}>{row.label}</span>
      <span style={{ ...cell, fontSize: 12, color: "var(--color-text-secondary)", padding: "12px 14px" }}>
        {row.subtitle || "—"}
      </span>
      <span style={{ ...cell, padding: "12px 14px" }}>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: TONE_COLOR[row.tone],
            border: `1px solid ${TONE_COLOR[row.tone]}`,
            borderRadius: 4,
            padding: "2px 8px",
          }}
        >
          {TONE_LABEL[row.tone]}
        </span>
      </span>
      <span
        style={{
          ...cell,
          fontFamily: "var(--font-display)",
          fontSize: 16,
          color: TONE_COLOR[row.tone],
          padding: "12px 20px 12px 14px",
          justifyContent: "flex-end",
        }}
      >
        {row.count}
      </span>
    </>
  );
}

const listHeadCellStyle: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: "0.11em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  padding: "10px 14px",
  background: "var(--color-background)",
  borderBottom: "1px solid var(--color-border)",
};

// ── Filter chip + label + segment ──

const chipGroupLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
};

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 13px",
        fontSize: 11.5,
        fontWeight: on ? 800 : 600,
        border: on ? "1px solid var(--color-text-primary)" : "1px solid var(--color-border-medium)",
        background: on ? "var(--color-text-primary)" : "var(--color-surface)",
        color: on ? "#FFFFFF" : "var(--color-text-secondary)",
        borderRadius: 999,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function SegButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        fontFamily: "inherit",
        fontSize: 11.5,
        fontWeight: on ? 800 : 600,
        padding: "7px 16px",
        border: "none",
        background: on ? "var(--color-text-primary)" : "var(--color-surface)",
        color: on ? "#FFFFFF" : "var(--color-text-secondary)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
