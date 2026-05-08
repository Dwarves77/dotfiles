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
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";
import { getJurisdiction } from "@/lib/scoring";
import { JURISDICTIONS } from "@/lib/constants";
import type { RegionCoverage } from "@/lib/coverage-gaps";
import { TIER1_PRIORITY_ISOS } from "@/lib/tier1-priority-jurisdictions";

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
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
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
}

type Mode = "all" | "ocean" | "air" | "road" | "facility";

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
    changelog,
    disputes,
    xrefPairs,
    supersessions,
    coverageGaps,
    initialRegionFilter = null,
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
  // Side-rail jurisdiction selection. We bump a counter alongside the id so
  // clicking the same row twice still triggers MapView's drill effect (the
  // id alone wouldn't change). Kept local; MapView owns the actual drill
  // state and treats this prop as a fire-and-act trigger.
  const [pendingSelectJur, setPendingSelectJur] = useState<{
    id: string | null;
    nonce: number;
  }>({ id: null, nonce: 0 });

  // Filter resources by mode + (PR-N) optional ISO region filter.
  // The ISO filter narrows the resource set BEFORE downstream
  // aggregation (markers, side rail, Active heat) so all map widgets
  // stay coherent.
  const filteredResources = useMemo(() => {
    const isoFiltered =
      activeRegionIso === null
        ? resources
        : resources.filter((r) => {
            const isos = (r.jurisdictionIso || []).map((c) => c.toUpperCase());
            return isos.includes(activeRegionIso);
          });

    if (mode === "all") return isoFiltered;
    if (mode === "facility") {
      // No transport modes implies a facility-style item; preserve the
      // editorial intent ("Facility" in the toolbar) without inventing
      // a column. Includes resources with a domain marker for facilities
      // (domain 6) when present.
      return isoFiltered.filter(
        (r) =>
          r.domain === 6 ||
          (Array.isArray(r.modes) && r.modes.length === 0)
      );
    }
    return isoFiltered.filter(
      (r) =>
        (Array.isArray(r.modes) && r.modes.includes(mode)) ||
        r.cat === mode
    );
  }, [resources, mode, activeRegionIso]);

  // Aggregate by jurisdiction for the side rail list.
  const jurisdictionRows = useMemo(() => {
    const groups = new Map<string, Resource[]>();
    for (const r of filteredResources) {
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

  // Resource map for MapView.
  const resourceMap = useMemo(() => {
    const map = new Map<string, Resource>();
    for (const r of filteredResources) map.set(r.id, r);
    return map;
  }, [filteredResources]);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <EditorialMasthead
        title="Global Regulatory Map"
        meta="Where regulations bite. Click a marker for the open items in that jurisdiction; size and colour encode urgency."
      />

      <div style={{ padding: "28px 36px 60px" }}>
        {/* AI prompt bar */}
        <div style={{ marginBottom: 22 }}>
          <AiPromptBar
            placeholder="Ask anything about coverage — e.g. Which jurisdictions have critical items?"
            chips={[
              "Critical jurisdictions",
              "Corridors with active CBAM",
              "Where coverage is thin",
            ]}
          />
        </div>

        {/* Header + mode filters */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "end",
            marginBottom: 14,
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                fontWeight: 400,
                letterSpacing: "0.02em",
                margin: "0 0 4px",
                color: "var(--text)",
              }}
            >
              Coverage &amp; urgency
            </h3>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.5,
                color: "var(--text-2)",
                margin: 0,
                maxWidth: "64ch",
              }}
            >
              {liveJurisdictions} jurisdictions live · {totalActiveCount} active items.
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {([
              { id: "all" as const, label: "All modes" },
              { id: "ocean" as const, label: "Ocean" },
              { id: "air" as const, label: "Air" },
              { id: "road" as const, label: "Road" },
              { id: "facility" as const, label: "Facility" },
            ]).map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                style={{
                  fontFamily: "inherit",
                  fontSize: 11,
                  padding: "6px 12px",
                  background: mode === m.id ? "var(--accent)" : "var(--surface)",
                  border:
                    mode === m.id
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                  borderRadius: 999,
                  color: mode === m.id ? "#fff" : "var(--text-2)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Layout: map + side rail */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: 18,
            alignItems: "stretch",
          }}
          className="cl-map-layout"
        >
          {/* Map shell */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-sub)",
              borderRadius: "var(--r-lg)",
              overflow: "hidden",
              boxShadow: "var(--shadow)",
              position: "relative",
              height: 640,
            }}
          >
            <div style={{ position: "absolute", inset: 0 }}>
              <MapView
                resources={filteredResources}
                changelog={changelog}
                disputes={disputes}
                xrefPairs={xrefPairs}
                supersessions={supersessions}
                resourceMap={resourceMap}
                onToast={() => {}}
                externalSelectJurId={pendingSelectJur.id}
                externalSelectNonce={pendingSelectJur.nonce}
              />
            </div>
          </div>

          {/* Side rail */}
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
