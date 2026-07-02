"use client";

/**
 * MapPageView — Phase C / Block C surface for /map.
 *
 * Mirrors design_handoff_2026-04/preview/map.html:
 *   - EditorialMasthead: "Global Regulatory Map"
 *   - AiPromptBar (jurisdiction chips)
 *   - Mode-filter toolbar
 *   - 70/30 layout: Leaflet map (left) + side rail (right)
 *   - Side rail: Active heat pulse card · By jurisdiction list · Coverage gaps
 *
 * MapView (Leaflet) is dynamic-imported with ssr:false. Jurisdiction
 * aggregation is done locally over `resources` so the side rail is
 * always in sync with what the map renders.
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import type { Resource } from "@/types/resource";
import { getJurisdiction } from "@/lib/scoring";
import { JURISDICTIONS } from "@/lib/constants";
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
          color: "var(--text-2)",
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
  /**
   * Per-region coverage rollup, fetched server-side via getCoverageGaps()
   * (see lib/coverage-gaps.ts). Optional so the surface degrades to an
   * empty state if the page hasn't passed it yet — Map's PR-J / other
   * in-flight surface PRs may have updated the prop signature elsewhere.
   */
  coverageGaps?: RegionCoverage[];
  /**
   * PR-N (Wave 5): initial Tier 1 ISO region filter from `?region=us-ca`.
   * Lowercase tolerated. Matched case-insensitively against
   * `Resource.jurisdictionIso[]`. Composes with the mode toggle.
   * Passed straight to the resource pre-filter so the map markers,
   * side-rail aggregation, Active heat card, and Coverage gaps panel
   * all align on the same filtered set.
   */
  initialRegionFilter?: string | null;
  /**
   * Phase 6 (2026-05-25): community activity by region for the dot
   * overlay on the map. Optional so the surface renders cleanly when
   * the aggregate query hasn't been fetched yet.
   */
  communityActivity?: CommunityActivityRow[];
}

// Region chip vocabulary per mockup: EU / US / UK / LATAM / APAC / MEAF.
// Maps each chip to the set of jurisdiction IDs that count as "in"
// that region. Click toggles the chip; multiple chips combine as OR.
type RegionChipKey = "EU" | "US" | "UK" | "LATAM" | "APAC" | "MEAF";

const REGION_CHIP_TO_JURS: Record<RegionChipKey, ReadonlyArray<string>> = {
  EU: ["eu"],
  US: ["us"],
  UK: ["uk"],
  LATAM: ["latam", "brazil", "caribbean"],
  APAC: ["asia", "china", "japan", "korea", "india", "asean", "hk", "singapore", "australia", "pacific"],
  MEAF: ["meaf", "gcc", "uae", "safrica", "wafrica", "eafrica", "nafrica"],
};

type PriorityChipKey = "CRITICAL" | "HIGH" | "MODERATE";

// View mode toggle: single concession kept from the prior MapView per
// operator instruction. Controls the layout grid; the H3 stacking
// responsive (cl-two-col @ 960px) handles mobile separately.
type ViewMode = "split" | "map" | "list";

// D14 resolution (2026-05-19): per caros-ledge-platform-intent SKILL.md
// Section 4, Map is a geographic visual layer over Regulations content, NOT
// a separate content category. The "facility" mode option exceeded Map's
// scope (Regulations content covers regulatory items, not facility-level
// operational metadata; facility data belongs on /operations per skill
// Section 3). Removed from toggle. If facility-by-region visualization
// becomes a product need, that is a skill-amendment dispatch (operator-
// authorized) followed by a Map scope-expansion build, not a quiet toggle.
type Mode = "all" | "ocean" | "air" | "road";

// ── Urgency tone helpers ──

type Tone = "critical" | "high" | "moderate" | "low";

function topPriority(items: Resource[]): Tone {
  if (items.some((r) => r.priority === "CRITICAL")) return "critical";
  if (items.some((r) => r.priority === "HIGH")) return "high";
  if (items.some((r) => r.priority === "MODERATE")) return "moderate";
  return "low";
}

const TONE_COLOR: Record<Tone, string> = {
  critical: "var(--critical)",
  high: "var(--high)",
  moderate: "var(--moderate)",
  low: "var(--low)",
};

const TONE_BG: Record<Tone, string> = {
  critical: "var(--critical-bg)",
  high: "var(--high-bg)",
  moderate: "var(--moderate-bg)",
  low: "var(--low-bg)",
};

const TONE_BD: Record<Tone, string> = {
  critical: "var(--critical-bd)",
  high: "var(--high-bd)",
  moderate: "var(--moderate-bd)",
  low: "var(--low-bd)",
};

// ── Component ──

export function MapPageView(props: MapPageViewProps) {
  const {
    resources,
    coverageGaps,
    initialRegionFilter = null,
    communityActivity = [],
  } = props;

  // PR-N (Wave 5): hoist the URL-driven ISO filter into a normalised
  // upper-case code (or null when missing/invalid). Tier 1 priority set
  // is the validation gate; anything outside the known set is silently
  // ignored so the page still renders.
  const activeRegionIso = useMemo<string | null>(() => {
    const raw = (initialRegionFilter || "").trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    return TIER1_PRIORITY_ISOS.has(upper) ? upper : null;
  }, [initialRegionFilter]);

  // Sort the coverage rollup by gap severity (highest gap count first) and
  // surface only the top 5 regions on the side rail. Memo so the sort
  // happens once per coverageGaps reference.
  const coverageGapsRanked = useMemo(() => {
    const list = Array.isArray(coverageGaps) ? coverageGaps : [];
    return [...list]
      .sort((a, b) => {
        if (b.gap !== a.gap) return b.gap - a.gap;
        // Tiebreaker: highest partial first, then alphabetical region name.
        if (b.partial !== a.partial) return b.partial - a.partial;
        return a.region.name.localeCompare(b.region.name);
      })
      .slice(0, 5);
  }, [coverageGaps]);

  const [mode, setMode] = useState<Mode>("all");
  // Phase 6 (2026-05-25): Priority + Regions chips per mockup. Both
  // are sets so multi-select OR-combines (mockup: "Critical" + "High"
  // both active). Empty set = no filter for that dimension.
  const [priorityChips, setPriorityChips] = useState<Set<PriorityChipKey>>(new Set());
  const [regionChips, setRegionChips] = useState<Set<RegionChipKey>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  // Side-rail jurisdiction selection. We bump a counter alongside the id so
  // clicking the same row twice still triggers MapView's drill effect (the
  // id alone wouldn't change). Kept local; MapView owns the actual drill
  // state and treats this prop as a fire-and-act trigger.
  const [pendingSelectJur, setPendingSelectJur] = useState<{
    id: string | null;
    nonce: number;
  }>({ id: null, nonce: 0 });

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

  // Filter resources by mode + ISO region (PR-N) + Priority chips +
  // Regions chips. All four dimensions compose with AND-between,
  // OR-within (multi-select within each chip group). Empty
  // priority/region chip sets pass through (no filter).
  const filteredResources = useMemo(() => {
    const isoFiltered =
      activeRegionIso === null
        ? resources
        : resources.filter((r) => {
            const isos = (r.jurisdictionIso || []).map((c) => c.toUpperCase());
            return isos.includes(activeRegionIso);
          });

    const modeFiltered =
      mode === "all"
        ? isoFiltered
        : isoFiltered.filter(
            (r) =>
              (Array.isArray(r.modes) && r.modes.includes(mode)) ||
              r.cat === mode
          );

    const priorityFiltered =
      priorityChips.size === 0
        ? modeFiltered
        : modeFiltered.filter((r) => priorityChips.has(r.priority as PriorityChipKey));

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
  }, [resources, mode, activeRegionIso, priorityChips, regionChips]);

  // Aggregate by jurisdiction for the side rail list.
  const jurisdictionRows = useMemo(() => {
    const groups = new Map<string, Resource[]>();
    for (const r of filteredResources) {
      // Map is a Regulations view (D-map): gate the side-rail counts AND the markers (derived from these
      // rows) to the regulations domain so they match the masthead's regulations-only count. Was counting
      // all domains → sidebar summed ~216 vs masthead's 94.
      if (r.domain !== REGULATIONS_DOMAIN) continue;
      const jur = (r.jurisdiction || getJurisdiction(r) || "global").toLowerCase();
      const list = groups.get(jur) || [];
      list.push(r);
      groups.set(jur, list);
    }

    const rows = Array.from(groups.entries()).map(([id, items]) => {
      const def = JURISDICTIONS.find((j) => j.id === id);
      const tone = topPriority(items);
      // Build a small subtitle from the most-frequent topics.
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
      };
    });

    rows.sort((a, b) => b.count - a.count);
    return rows;
  }, [filteredResources]);

  // Active heat — jurisdictions whose top-priority is "critical" (i.e.
  // jurisdictions with at least one CRITICAL item) AND total CRITICAL-
  // priority items across all jurisdictions. We surface BOTH counts on
  // the Active-heat card so the metric the per-jurisdiction drill panel
  // shows ("N CRITICAL" = items with priority=CRITICAL in that
  // jurisdiction) is clearly reconciled against the global header.
  const criticalRows = jurisdictionRows.filter((r) => r.tone === "critical");
  const criticalItemCount = useMemo(
    () => filteredResources.filter((r) => r.priority === "CRITICAL").length,
    [filteredResources]
  );

  const totalActiveCount = filteredResources.length;
  const liveJurisdictions = jurisdictionRows.length;

  // Phase 1 Fix 3 reconciliation (2026-05-24): Map is the geographic
  // visual layer over Regulations content per platform-intent SKILL
  // Section 3 (Cross-Cutting Capabilities, Map). The masthead count was
  // rendering the full mixed-domain `filteredResources.length` (645);
  // spec calls for regulations-only count to align with the
  // /regulations index masthead (~394).
  const regulationResources = useMemo(
    () => filteredResources.filter((r) => r.domain === REGULATIONS_DOMAIN),
    [filteredResources]
  );
  const regulationsActiveCount = regulationResources.length;
  const regulationsJurisdictionCount = new Set(
    regulationResources.map((r) => r.jurisdiction || "global")
  ).size;
  // Phase 6 (2026-05-25): mockup masthead says "13 jurisdictions with
  // critical items" — count UNIQUE jurisdictions containing a CRITICAL
  // resource, not the total count of CRITICAL resources. Both metrics
  // were live before; this aligns the masthead label to the actual value.
  const regulationsCriticalCount = new Set(
    regulationResources
      .filter((r) => r.priority === "CRITICAL")
      .map((r) => r.jurisdiction || "global")
  ).size;

  // Phase 6 (2026-05-25): MapView now consumes pre-aggregated
  // jurisdictions, not raw resources. Map the side-rail rows
  // (jurisdictionRows) to the MapView prop shape — same id/label/
  // count/tone projection, just renamed at the boundary.
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

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <EditorialMasthead
        title="Global Regulatory Map"
        meta={
          <>
            Regulations by jurisdiction. Marker size encodes item count; colour encodes urgency.
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{regulationsJurisdictionCount}</b> jurisdictions live
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{regulationsActiveCount}</b> active items
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{regulationsCriticalCount}</b> jurisdictions with critical items
          </>
        }
      />

      <div style={{ padding: "12px 36px 60px" }}>
        {/* Phase 6 (2026-05-25): mockup filter row — Modes / Priority /
            Regions chip groups. AiPromptBar stripped (not in mockup). */}
        <div
          style={{
            display: "flex",
            gap: 18,
            alignItems: "center",
            padding: "12px 0 16px",
            borderBottom: "1px solid var(--border-sub)",
            marginBottom: 18,
            flexWrap: "wrap",
            fontSize: 12,
          }}
        >
          <span style={chipGroupLabelStyle}>Modes</span>
          <Chip on={mode === "all"} onClick={() => setMode("all")}>All</Chip>
          <Chip on={mode === "ocean"} onClick={() => setMode("ocean")}>Ocean</Chip>
          <Chip on={mode === "air"} onClick={() => setMode("air")}>Air</Chip>
          <Chip on={mode === "road"} onClick={() => setMode("road")}>Road</Chip>

          <span style={{ ...chipGroupLabelStyle, marginLeft: 18 }}>Priority</span>
          <Chip on={priorityChips.has("CRITICAL")} onClick={() => togglePriority("CRITICAL")}>Critical</Chip>
          <Chip on={priorityChips.has("HIGH")} onClick={() => togglePriority("HIGH")}>High</Chip>
          <Chip on={priorityChips.has("MODERATE")} onClick={() => togglePriority("MODERATE")}>Moderate</Chip>

          <span style={{ ...chipGroupLabelStyle, marginLeft: 18 }}>Regions</span>
          <Chip on={regionChips.has("EU")} onClick={() => toggleRegion("EU")}>EU</Chip>
          <Chip on={regionChips.has("US")} onClick={() => toggleRegion("US")}>US</Chip>
          <Chip on={regionChips.has("UK")} onClick={() => toggleRegion("UK")}>UK</Chip>
          <Chip on={regionChips.has("LATAM")} onClick={() => toggleRegion("LATAM")}>LATAM</Chip>
          <Chip on={regionChips.has("APAC")} onClick={() => toggleRegion("APAC")}>APAC</Chip>
          <Chip on={regionChips.has("MEAF")} onClick={() => toggleRegion("MEAF")}>MEAF</Chip>

          {/* ViewMode toggle — single concession to mobile escape hatch
              per operator instruction. Pushed to the right via margin
              auto. Mobile responsive (cl-two-col) handles the
              <=960px stacking separately. */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <Chip on={viewMode === "split"} onClick={() => setViewMode("split")}>Split</Chip>
            <Chip on={viewMode === "map"} onClick={() => setViewMode("map")}>Map</Chip>
            <Chip on={viewMode === "list"} onClick={() => setViewMode("list")}>List</Chip>
          </div>
        </div>

        {/* Layout: map + side rail. viewMode = "split" gives the
            mockup layout; "map" hides the rail; "list" hides the map. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              viewMode === "split"
                ? "1fr 320px"
                : viewMode === "map"
                ? "1fr"
                : "1fr",
            gap: 18,
            alignItems: "stretch",
          }}
          className="cl-map-layout"
        >
          {/* Map shell */}
          {viewMode !== "list" && (
          <div
            className="cl-map-frame"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-sub)",
              borderRadius: "var(--r-lg)",
              overflow: "hidden",
              boxShadow: "var(--shadow)",
              position: "relative",
              height: 700,
            }}
          >
            <div style={{ position: "absolute", inset: 0 }}>
              <MapView
                jurisdictions={mapMarkers}
                communityActivity={communityActivity}
                externalSelectJurId={pendingSelectJur.id}
                externalSelectNonce={pendingSelectJur.nonce}
                onMarkerClick={(id) =>
                  setPendingSelectJur((prev) => ({ id, nonce: prev.nonce + 1 }))
                }
              />
            </div>
          </div>
          )}

          {/* Side rail */}
          {viewMode !== "map" && (
          <aside>
            {/* Active heat pulse card.
                Two distinct metrics, both surfaced and labelled to reconcile
                with the per-jurisdiction "N CRITICAL" badge in the drill panel:
                  - criticalRows.length     = jurisdictions with any CRITICAL item
                  - criticalItemCount       = total CRITICAL-priority items across
                                              all jurisdictions (the sum of the
                                              per-jurisdiction CRITICAL badges) */}
            <SideCard
              tone={criticalRows.length > 0 ? "high" : undefined}
              label="Active heat"
            >
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 30,
                  lineHeight: 1,
                  color: "var(--high)",
                  marginBottom: 4,
                }}
              >
                {criticalRows.length}{" "}
                <span style={{ fontSize: 14, letterSpacing: "0.04em" }}>
                  jurisdiction{criticalRows.length === 1 ? "" : "s"} with critical
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-2)",
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                {criticalItemCount} critical item
                {criticalItemCount === 1 ? "" : "s"} total
              </div>
              <p
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  margin: 0,
                  color: "var(--text)",
                }}
              >
                {criticalRows.length === 0
                  ? "No jurisdictions in critical state for the current mode filter."
                  : `${criticalRows
                      .slice(0, 3)
                      .map((r) => r.label)
                      .join(", ")}${
                      criticalRows.length > 3 ? ", and others" : ""
                    } have critical items in flight.`}
              </p>
            </SideCard>

            {/* By jurisdiction list */}
            <SideCard label="By jurisdiction · click to fly">
              {jurisdictionRows.length === 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-2)",
                    margin: 0,
                  }}
                >
                  No jurisdictions match the current filter.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {jurisdictionRows.slice(0, 12).map((row, idx) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() =>
                        setPendingSelectJur((prev) => ({
                          id: row.id,
                          nonce: prev.nonce + 1,
                        }))
                      }
                      aria-label={`Open ${row.label} detail panel`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "26px 1fr auto",
                        gap: 10,
                        padding: "10px 0",
                        borderTop:
                          idx === 0 ? "0" : "1px solid var(--border-sub)",
                        borderLeft: "0",
                        borderRight: "0",
                        borderBottom: "0",
                        background: "transparent",
                        alignItems: "center",
                        textAlign: "left",
                        cursor: "pointer",
                        font: "inherit",
                        color: "inherit",
                        width: "100%",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: TONE_COLOR[row.tone],
                          justifySelf: "center",
                        }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                        {row.label}
                        {row.subtitle && (
                          <small
                            style={{
                              display: "block",
                              fontSize: 11,
                              color: "var(--text-2)",
                              marginTop: 2,
                              fontWeight: 500,
                            }}
                          >
                            {row.subtitle}
                          </small>
                        )}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 16,
                          padding: "2px 9px",
                          borderRadius: 3,
                          color: TONE_COLOR[row.tone],
                          background: TONE_BG[row.tone],
                          border: `1px solid ${TONE_BD[row.tone]}`,
                        }}
                      >
                        {row.count}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </SideCard>

            {/* Coverage gaps — data-driven from sources table.
                Top 5 regions by gap severity (highest gap count first). */}
            <SideCard label="Coverage gaps">
              {coverageGapsRanked.length === 0 ? (
                <p
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    margin: 0,
                    color: "var(--text-2)",
                  }}
                >
                  Coverage snapshot unavailable.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {coverageGapsRanked.map((row, idx) => {
                    const href = `/map?region-filter=${encodeURIComponent(
                      row.region.id
                    )}`;
                    return (
                      <a
                        key={row.region.id}
                        href={href}
                        aria-label={`Filter map to ${row.region.name} (${row.gap} gaps of ${row.total})`}
                        style={{
                          display: "block",
                          padding: "10px 0",
                          borderTop:
                            idx === 0 ? "0" : "1px solid var(--border-sub)",
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: "var(--text)",
                            lineHeight: 1.4,
                          }}
                        >
                          {row.region.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--text-2)",
                            marginTop: 3,
                            lineHeight: 1.5,
                          }}
                        >
                          {row.covered} of {row.total} priority jurisdictions
                          covered, {row.gap} {row.gap === 1 ? "gap" : "gaps"}
                          {row.partial > 0 ? ` · ${row.partial} partial` : ""}
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </SideCard>
          </aside>
          )}
        </div>
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

// ── Filter chip + label ──

const chipGroupLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-2)",
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
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 12px",
        fontSize: 12,
        fontWeight: 600,
        border: on ? "1px solid var(--text)" : "1px solid var(--border)",
        background: on ? "var(--text)" : "var(--surface)",
        color: on ? "#fff" : "var(--text)",
        borderRadius: 999,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

// ── Side rail card ──

function SideCard({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "high";
}) {
  const isPulse = tone === "high";
  return (
    <div
      style={{
        background: isPulse ? "var(--high-bg)" : "var(--surface)",
        border: isPulse
          ? "1px solid var(--high-bd)"
          : "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        padding: "14px 16px",
        boxShadow: "var(--shadow)",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: isPulse ? "var(--high)" : "var(--text-2)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
