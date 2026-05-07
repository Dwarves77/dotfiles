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
 *   - Real / Abstract toggle (top-right of map shell)
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
}

type Mode = "all" | "ocean" | "air" | "road" | "facility";
type StyleMode = "real" | "abstract";

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
  const { resources, changelog, disputes, xrefPairs, supersessions } = props;

  const [mode, setMode] = useState<Mode>("all");
  const [styleMode, setStyleMode] = useState<StyleMode>("real");
  // Side-rail jurisdiction selection. We bump a counter alongside the id so
  // clicking the same row twice still triggers MapView's drill effect (the
  // id alone wouldn't change). Kept local; MapView owns the actual drill
  // state and treats this prop as a fire-and-act trigger.
  const [pendingSelectJur, setPendingSelectJur] = useState<{
    id: string | null;
    nonce: number;
  }>({ id: null, nonce: 0 });

  // Filter resources by mode.
  const filteredResources = useMemo(() => {
    if (mode === "all") return resources;
    if (mode === "facility") {
      // No transport modes implies a facility-style item; preserve the
      // editorial intent ("Facility" in the toolbar) without inventing
      // a column. Includes resources with a domain marker for facilities
      // (domain 6) when present.
      return resources.filter(
        (r) =>
          r.domain === 6 ||
          (Array.isArray(r.modes) && r.modes.length === 0)
      );
    }
    return resources.filter(
      (r) =>
        (Array.isArray(r.modes) && r.modes.includes(mode)) ||
        r.cat === mode
    );
  }, [resources, mode]);

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
            {/* Real / Abstract toggle.
                Anchored top-LEFT so it does not overlap MapView's own
                Split/Map/List view-toggle, which sits top-right inside the
                same shell. Higher z-index than the leaflet pane stack
                (Leaflet zoom controls and panes are <= 1000) so the toggle
                stays clickable above the map and the Map Key panel. */}
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                zIndex: 1100,
                display: "flex",
                gap: 0,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: 3,
                boxShadow: "var(--shadow)",
                pointerEvents: "auto",
              }}
            >
              {(["real", "abstract"] as StyleMode[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStyleMode(s)}
                  style={{
                    fontFamily: "inherit",
                    fontSize: 11,
                    padding: "5px 12px",
                    background: styleMode === s ? "var(--accent)" : "transparent",
                    border: 0,
                    color: styleMode === s ? "#fff" : "var(--text-2)",
                    fontWeight: 700,
                    cursor: "pointer",
                    borderRadius: 999,
                    textTransform: "capitalize",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {styleMode === "real" ? (
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
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--raised)",
                  color: "var(--text-2)",
                  fontSize: 12,
                  textAlign: "center",
                  padding: 40,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 22,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "var(--text)",
                      marginBottom: 8,
                    }}
                  >
                    Abstract view
                  </div>
                  <p style={{ margin: 0, maxWidth: "48ch" }}>
                    Flat editorial styling lands in a follow-up. Switch to
                    <b style={{ color: "var(--text)" }}> Real</b> to see the live
                    Leaflet map.
                  </p>
                </div>
              </div>
            )}
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

            {/* Coverage gaps */}
            <SideCard label="Coverage gaps">
              <p
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  margin: 0,
                  color: "var(--text)",
                }}
              >
                <b>Africa</b> — sub-Saharan transport regulators not yet covered.
                Flagged by 2 design partners. Latam ocean partial.
              </p>
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
