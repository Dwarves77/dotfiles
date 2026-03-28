"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/cn";
import { JURISDICTIONS, PRIORITY_COLORS, TOPIC_COLORS } from "@/lib/constants";
import { getJurisdiction, urgencyScore } from "@/lib/scoring";
import { useNavigationStore } from "@/stores/navigationStore";
import { useResourceStore } from "@/stores/resourceStore";
import { ResourceCard } from "@/components/resource/ResourceCard";
import { ResourceDetail } from "@/components/resource/ResourceDetail";
import {
  Search, X, Columns2, Map, List, ChevronRight, ChevronLeft, MapPin,
} from "lucide-react";
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";
import {
  JURISDICTION_CENTROIDS,
  SUB_JURISDICTION_CENTROIDS,
  JURISDICTION_PIN_CODES,
  SUB_JURISDICTION_LABELS,
} from "./jurisdictionCentroids";

// ── Types ──

interface JurisdictionData {
  id: string;
  label: string;
  region: string;
  lat: number;
  lng: number;
  pinCode: string;
  resources: Resource[];
  criticalCount: number;
  highCount: number;
  conflictCount: number;
  topPriority: string;
  isSubJurisdiction: boolean;
  parentJurisdiction?: string;
}

type ViewMode = "split" | "map" | "list";

interface MapViewProps {
  resources: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
  resourceMap: Map<string, Resource>;
  onToast: (msg: string) => void;
}

// ── Custom marker icon builder ──

function createPinIcon(code: string, hasCritical: boolean, hasConflict: boolean, isSub: boolean): L.DivIcon {
  const size = isSub ? 28 : 32;
  const fontSize = isSub ? 9 : 10;
  const bg = isSub ? "#bbe2f5" : "var(--map-pin-bg)";
  const border = isSub ? "rgba(187,226,245,0.5)" : "var(--map-pin-border)";
  return L.divIcon({
    className: "custom-pin",
    html: `
      <div style="
        width:${size}px;height:${size}px;
        background:${bg};
        border:2px solid ${border};
        border-radius:6px;
        display:flex;align-items:center;justify-content:center;
        font-size:${fontSize}px;font-weight:700;font-family:monospace;
        color:#171e19;
        position:relative;
      ">
        ${code}
        ${hasCritical ? `<span style="
          position:absolute;top:-3px;right:-3px;
          width:8px;height:8px;border-radius:50%;
          background:#ff3b30;
        "></span>` : ""}
        ${hasConflict ? `<span style="
          position:absolute;bottom:-3px;right:-3px;
          width:8px;height:8px;border-radius:50%;
          background:#ff9500;
        "></span>` : ""}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// ── Cluster icon builder ──

function createClusterIcon(cluster: any): L.DivIcon {
  const count = cluster.getChildCount();
  return L.divIcon({
    className: "custom-cluster",
    html: `
      <div style="
        width:36px;height:36px;border-radius:50%;
        background:var(--map-cluster-bg);
        border:2px solid var(--map-cluster-border);
        display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:700;
        color:var(--map-cluster-text);
      ">
        ${count}
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

// ── Initial fit: zoom to show all pins on mount ──

function InitialFit({ jurisdictions }: { jurisdictions: JurisdictionData[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || jurisdictions.length === 0) return;
    fitted.current = true;
    const bounds = L.latLngBounds(
      jurisdictions.map((j) => [j.lat, j.lng] as [number, number])
    );
    // Use setTimeout to let the map container settle first
    setTimeout(() => {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 4 });
    }, 200);
  }, [jurisdictions, map]);

  return null;
}

// ── FitBounds on filter change ──

function FitBoundsHelper({ jurisdictions }: { jurisdictions: JurisdictionData[] }) {
  const map = useMap();
  const NON_GEO = ["global", "imo", "icao"];

  useEffect(() => {
    if (jurisdictions.length === 0) return;
    // Filter out non-geographic jurisdictions for map bounds
    const geoJurs = jurisdictions.filter((j) => !NON_GEO.includes(j.id));
    if (geoJurs.length === 0) {
      // Only non-geo jurisdictions selected — show whole world
      map.flyTo([20, 0], 2, { duration: 0.8 });
      return;
    }
    if (geoJurs.length === 1) {
      map.flyTo([geoJurs[0].lat, geoJurs[0].lng], 5, { duration: 0.8 });
      return;
    }
    const bounds = L.latLngBounds(
      geoJurs.map((j) => [j.lat, j.lng] as [number, number])
    );
    map.flyToBounds(bounds, { padding: [40, 40], duration: 0.8 });
  }, [jurisdictions, map]);

  return null;
}

// ── FlyTo on select ──

function FlyToSelected({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 5, { duration: 0.8 });
  }, [lat, lng, map]);
  return null;
}

// ── Popup content with native DOM click handler ──

function PopupContent({ jur, onDrill }: { jur: JurisdictionData; onDrill: (id: string) => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const handler = () => onDrill(jur.id);
    btn.addEventListener("click", handler);
    return () => btn.removeEventListener("click", handler);
  }, [jur.id, onDrill]);

  return (
    <Popup className="custom-popup" closeButton maxWidth={320} minWidth={260}>
      <div
        style={{
          background: "var(--map-popup-bg)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10,
          padding: 16,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          color: "var(--text-primary)",
          fontFamily: "var(--font-jakarta), system-ui, sans-serif",
        }}
      >
        <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "var(--text-primary)" }}>
          {jur.label}
        </h4>
        <span
          style={{
            display: "inline-block", fontSize: 11, fontWeight: 500, padding: "2px 8px",
            borderRadius: 4, border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)", marginBottom: 8,
          }}
        >
          {jur.pinCode}
        </span>
        {jur.isSubJurisdiction && jur.parentJurisdiction && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Part of {jur.region}
          </p>
        )}
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "8px 0" }}>
          {jur.resources.length} active regulation{jur.resources.length !== 1 ? "s" : ""}
        </p>
        {jur.conflictCount > 0 && (
          <div style={{
            fontSize: 11, fontWeight: 600, padding: "4px 8px", borderRadius: 4,
            background: "rgba(255,149,0,0.12)", border: "1px solid rgba(255,149,0,0.3)",
            color: "#ff9500", marginBottom: 8, display: "flex", alignItems: "center", gap: 4,
          }}>
            {jur.conflictCount} regulatory conflict{jur.conflictCount !== 1 ? "s" : ""}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {jur.criticalCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(255,59,48,0.15)", border: "1px solid rgba(255,59,48,0.4)", color: "#ff3b30" }}>
              {jur.criticalCount} CRITICAL
            </span>
          )}
          {jur.highCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(255,149,0,0.15)", border: "1px solid rgba(255,149,0,0.4)", color: "#ff9500" }}>
              {jur.highCount} HIGH
            </span>
          )}
        </div>
        <button
          ref={btnRef}
          style={{
            fontSize: 13, color: "var(--text-accent)", background: "none",
            border: "none", cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          View regulations &rsaquo;
        </button>
      </div>
    </Popup>
  );
}

// ── Main Component ──

export function MapView({
  resources,
  changelog,
  disputes,
  xrefPairs,
  supersessions,
  resourceMap,
  onToast,
}: MapViewProps) {
  const { pushFocusView } = useNavigationStore();
  const { expandedId, setExpanded } = useResourceStore();
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"name" | "count" | "critical">("count");
  const [selectedJurId, setSelectedJurId] = useState<string | null>(null);
  const [drillJurId, setDrillJurId] = useState<string | null>(null);
  const [, setHoveredJurId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef<Record<string, L.Marker>>({});

  // Build jurisdiction data — split sub-jurisdictions into their own pins
  const allJurisdictions = useMemo(() => {
    // Group resources: sub-jurisdiction resources get their own bucket,
    // remaining resources stay in the parent jurisdiction bucket
    const parentMap: Record<string, Resource[]> = {};
    const subMap: Record<string, Resource[]> = {};

    resources.forEach((r) => {
      const jur = r.jurisdiction || getJurisdiction(r);
      if (r.subJurisdiction) {
        const key = r.subJurisdiction;
        if (!subMap[key]) subMap[key] = [];
        subMap[key].push(r);
      } else {
        if (!parentMap[jur]) parentMap[jur] = [];
        parentMap[jur].push(r);
      }
    });

    function buildEntry(
      id: string,
      res: Resource[],
      coords: [number, number],
      label: string,
      region: string,
      isSub: boolean,
      parentJur?: string,
    ): JurisdictionData {
      const criticalCount = res.filter((r) => r.priority === "CRITICAL").length;
      const highCount = res.filter((r) => r.priority === "HIGH").length;
      const conflictCount = res.filter((r) => r.regulatoryConflict).length;
      const topPriority = criticalCount > 0
        ? "CRITICAL"
        : highCount > 0
        ? "HIGH"
        : res.some((r) => r.priority === "MODERATE")
        ? "MODERATE"
        : "LOW";

      return {
        id,
        label,
        region,
        lat: coords[0],
        lng: coords[1],
        pinCode: JURISDICTION_PIN_CODES[id] || id.slice(0, 2).toUpperCase(),
        resources: [...res].sort((a, b) => urgencyScore(b) - urgencyScore(a)),
        criticalCount,
        highCount,
        conflictCount,
        topPriority,
        isSubJurisdiction: isSub,
        parentJurisdiction: parentJur,
      };
    }

    const results: JurisdictionData[] = [];

    // Parent jurisdictions
    for (const [id, res] of Object.entries(parentMap)) {
      const coords = JURISDICTION_CENTROIDS[id];
      if (!coords) continue;
      const jurDef = JURISDICTIONS.find((j) => j.id === id);
      results.push(buildEntry(
        id, res, coords,
        jurDef?.label || id.toUpperCase(),
        jurDef?.region || "Global",
        false,
      ));
    }

    // Sub-jurisdictions as separate pins
    for (const [subId, res] of Object.entries(subMap)) {
      const coords = SUB_JURISDICTION_CENTROIDS[subId];
      if (!coords) continue;
      const label = SUB_JURISDICTION_LABELS[subId] || subId;
      const parentId = subId.split("-")[0]; // e.g. "us" from "us-ca"
      const parentDef = JURISDICTIONS.find((j) => j.id === parentId);
      results.push(buildEntry(
        subId, res, coords,
        label,
        parentDef?.label || parentId.toUpperCase(),
        true,
        parentId,
      ));
    }

    return results;
  }, [resources]);

  // Apply filters
  const filteredJurisdictions = useMemo(() => {
    let items = allJurisdictions;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (j) =>
          j.label.toLowerCase().includes(q) ||
          j.id.toLowerCase().includes(q) ||
          j.region.toLowerCase().includes(q) ||
          j.pinCode.toLowerCase().includes(q)
      );
    }

    if (priorityFilter.length > 0) {
      items = items.filter((j) =>
        j.resources.some((r) => priorityFilter.includes(r.priority))
      );
    }

    if (regionFilter.length > 0) {
      items = items.filter((j) => regionFilter.includes(j.id));
    }

    if (sortBy === "name") {
      items = [...items].sort((a, b) => a.label.localeCompare(b.label));
    } else if (sortBy === "count") {
      items = [...items].sort((a, b) => b.resources.length - a.resources.length);
    } else {
      items = [...items].sort((a, b) => b.criticalCount - a.criticalCount);
    }

    return items;
  }, [allJurisdictions, searchQuery, priorityFilter, regionFilter, sortBy]);

  const hasFilters = searchQuery || priorityFilter.length > 0 || regionFilter.length > 0;

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setPriorityFilter([]);
    setRegionFilter([]);
  }, []);

  const togglePriorityFilter = useCallback((p: string) => {
    setPriorityFilter((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }, []);

  const toggleRegionFilter = useCallback((r: string) => {
    setRegionFilter((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  }, []);

  // Scroll list item into view when pin clicked
  const scrollToListItem = useCallback((jurId: string) => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-jur="${jurId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // Drill into a jurisdiction — show its regulations in the list panel
  const drillInto = useCallback((jurId: string) => {
    setDrillJurId(jurId);
    setSelectedJurId(jurId);
    setExpanded(null);
  }, [setExpanded]);

  // Back to jurisdiction list from drill-down
  const drillBack = useCallback(() => {
    setDrillJurId(null);
    setExpanded(null);
  }, [setExpanded]);

  const handlePinClick = useCallback(
    (jurId: string) => {
      drillInto(jurId);
      scrollToListItem(jurId);
    },
    [drillInto, scrollToListItem]
  );

  const handleCardClick = useCallback((jur: JurisdictionData) => {
    drillInto(jur.id);
  }, [drillInto]);

  // "View all" now uses pushFocusView — preserves nav stack, user can get back
  const handleViewAll = useCallback(
    (jurId: string) => {
      const jur = allJurisdictions.find((j) => j.id === jurId);
      if (!jur) return;
      pushFocusView({
        title: `${jur.label} Regulations`,
        resourceIds: jur.resources.map((r) => r.id),
      });
    },
    [allJurisdictions, pushFocusView]
  );

  const selectedJur = filteredJurisdictions.find((j) => j.id === selectedJurId);
  const drillJur = allJurisdictions.find((j) => j.id === drillJurId);

  // Unique regions for filter pills
  const availableRegions = useMemo(() => {
    const regionIds = new Set(allJurisdictions.map((j) => j.id));
    return JURISDICTIONS.filter((j) => regionIds.has(j.id)).slice(0, 10);
  }, [allJurisdictions]);

  // ── Render ──

  const showMap = viewMode === "split" || viewMode === "map";
  const showList = viewMode === "split" || viewMode === "list";

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 140px)" }}>
      {/* View toggle */}
      <div className="flex items-center justify-end gap-1 px-4 pb-3">
        {([
          { mode: "split" as ViewMode, icon: Columns2, label: "Split" },
          { mode: "map" as ViewMode, icon: Map, label: "Map only" },
          { mode: "list" as ViewMode, icon: List, label: "List only" },
        ] as const).map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            title={label}
            className={cn(
              "p-1.5 rounded transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--text-accent)]/50",
              viewMode === mode
                ? "bg-white/10 text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            <Icon size={16} strokeWidth={2} />
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── Map Panel ── */}
        {showMap && (
          <div
            className={cn("relative border border-border-light rounded-lg overflow-hidden", showList ? "w-1/2" : "w-full")}
            style={{ minHeight: 400 }}
          >
            <MapContainer
              center={[20, 0]}
              zoom={2}
              zoomControl={false}
              className="h-full w-full"
              style={{ background: "#171e19" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              <ZoomControl position="bottomleft" />

              <InitialFit jurisdictions={allJurisdictions} />
              {hasFilters && !drillJurId && <FitBoundsHelper jurisdictions={filteredJurisdictions} />}
              {selectedJur && !["global", "imo", "icao"].includes(selectedJur.id) && <FlyToSelected lat={selectedJur.lat} lng={selectedJur.lng} />}

              <MarkerClusterGroup
                chunkedLoading
                iconCreateFunction={createClusterIcon}
                maxClusterRadius={50}
                spiderfyOnMaxZoom
                showCoverageOnHover={false}
              >
                {filteredJurisdictions
                  .filter((jur) => !["global", "imo", "icao"].includes(jur.id))
                  .map((jur) => (
                  <Marker
                    key={jur.id}
                    position={[jur.lat, jur.lng]}
                    icon={createPinIcon(jur.pinCode, jur.criticalCount > 0, jur.conflictCount > 0, jur.isSubJurisdiction)}
                    ref={(ref) => {
                      if (ref) markerRefs.current[jur.id] = ref;
                    }}
                    eventHandlers={{
                      click: () => handlePinClick(jur.id),
                    }}
                  >
                    <PopupContent jur={jur} onDrill={drillInto} />
                  </Marker>
                ))}
              </MarkerClusterGroup>
            </MapContainer>

            {/* Dark theme override for leaflet UI */}
            <style>{`
              .leaflet-control-zoom a {
                background: var(--surface-card) !important;
                color: var(--text-primary) !important;
                border-color: rgba(255,255,255,0.12) !important;
              }
              .leaflet-control-zoom a:hover {
                background: var(--surface-card-hover) !important;
              }
              .leaflet-control-attribution {
                background: rgba(23,30,25,0.8) !important;
                color: var(--text-muted) !important;
                font-size: 10px !important;
              }
              .leaflet-control-attribution a {
                color: var(--text-muted) !important;
              }
              .leaflet-popup-content-wrapper {
                background: transparent !important;
                box-shadow: none !important;
                padding: 0 !important;
                border-radius: 0 !important;
              }
              .leaflet-popup-content {
                margin: 0 !important;
              }
              .leaflet-popup-tip {
                background: var(--map-popup-bg) !important;
              }
              .leaflet-popup-close-button {
                color: var(--text-muted) !important;
                font-size: 18px !important;
                top: 8px !important;
                right: 8px !important;
              }
              .custom-pin, .custom-cluster {
                background: transparent !important;
                border: none !important;
              }
            `}</style>
          </div>
        )}

        {/* ── Drag Handle ── */}
        {showMap && showList && (
          <div className="w-px bg-border-subtle cursor-col-resize shrink-0 hover:bg-border-light transition-colors" />
        )}

        {/* ── List Panel ── */}
        {showList && (
          <div
            className={cn(
              "flex flex-col min-h-0",
              showMap ? "w-1/2" : "w-full"
            )}
          >
            {/* ── DRILL-DOWN: Jurisdiction Regulations ── */}
            {drillJur ? (
              <>
                {/* Drill-down header */}
                <div className="px-4 pt-3 pb-2 border-b border-border-subtle">
                  <button
                    onClick={drillBack}
                    className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors mb-2"
                  >
                    <ChevronLeft size={14} strokeWidth={2} />
                    Back to regions
                  </button>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded"
                      style={{
                        background: "var(--map-pin-bg)",
                        color: "#171e19",
                        fontFamily: "monospace",
                      }}
                    >
                      {drillJur.pinCode}
                    </span>
                    <h3 className="text-[15px] font-semibold text-text-primary" style={{ letterSpacing: "-0.1px" }}>
                      {drillJur.label}
                    </h3>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {drillJur.criticalCount > 0 && (
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded"
                          style={{
                            background: "rgba(255,59,48,0.15)",
                            border: "1px solid rgba(255,59,48,0.4)",
                            color: "#ff3b30",
                          }}
                        >
                          {drillJur.criticalCount} CRITICAL
                        </span>
                      )}
                      {drillJur.highCount > 0 && (
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded"
                          style={{
                            background: "rgba(255,149,0,0.15)",
                            border: "1px solid rgba(255,149,0,0.4)",
                            color: "#ff9500",
                          }}
                        >
                          {drillJur.highCount} HIGH
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-muted tabular-nums">
                        {drillJur.resources.length} regulation{drillJur.resources.length !== 1 ? "s" : ""}
                      </span>
                      <button
                        onClick={() => handleViewAll(drillJur.id)}
                        className="text-xs text-text-accent hover:underline cursor-pointer flex items-center gap-1"
                      >
                        Open in Explore <ChevronRight size={10} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Regulation list */}
                <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
                  <div className="flex flex-col gap-2">
                    {drillJur.resources.map((r) => {
                      const isExpanded = expandedId === r.id;
                      const topicColor = TOPIC_COLORS[r.topic || ""] || undefined;
                      return (
                        <div
                          key={r.id}
                          id={`resource-${r.id}`}
                          className={cn(
                            "border rounded-lg card-expand",
                            "hover:border-border-light",
                            isExpanded
                              ? "border-border-light bg-surface-card"
                              : "border-border-subtle bg-surface-card hover:bg-surface-card-hover hover:-translate-y-px"
                          )}
                          style={{
                            borderLeftWidth: 4,
                            borderLeftColor: topicColor || "var(--border-subtle)",
                            transitionTimingFunction: "var(--ease-out-expo)",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.18)",
                            transition: "all 150ms ease",
                          }}
                        >
                          <ResourceCard resource={r} embedded />
                          {isExpanded && (
                            <ResourceDetail
                              resource={r}
                              changelog={changelog}
                              disputes={disputes}
                              xrefPairs={xrefPairs}
                              supersessions={supersessions}
                              resourceMap={resourceMap}
                              onToast={onToast}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* ── LEVEL 1: Jurisdiction List ── */}
                {/* Search */}
                <div className="px-4 pt-3 pb-2">
                  <div className="relative">
                    <Search
                      size={14}
                      strokeWidth={2}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
                    />
                    <input
                      type="text"
                      placeholder="Search jurisdictions, regions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-8 h-[42px] text-sm text-text-primary placeholder:text-text-muted bg-white/[0.05] border border-white/[0.12] rounded-lg outline-none focus:border-border-medium transition-colors duration-200"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary cursor-pointer"
                      >
                        <X size={14} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Filters */}
                <div className="px-4 pb-3 space-y-2.5 border-b border-border-subtle">
                  {/* Priority */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold tracking-widest uppercase text-text-primary inline-block min-w-[70px] text-right pr-3 shrink-0">
                      Priority
                    </span>
                    {(["CRITICAL", "HIGH", "MODERATE"] as const).map((pri) => (
                      <button
                        key={pri}
                        onClick={() => togglePriorityFilter(pri)}
                        className={cn(
                          "px-3 py-1 text-xs font-medium rounded-[6px] border transition-all duration-200 cursor-pointer",
                          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--text-accent)]/50",
                          priorityFilter.includes(pri)
                            ? "border-white/25 bg-white/10 text-text-primary font-bold"
                            : "border-white/[0.08] text-text-secondary hover:border-border-medium"
                        )}
                        style={
                          priorityFilter.includes(pri)
                            ? {
                                borderColor: `${PRIORITY_COLORS[pri]}40`,
                                backgroundColor: `${PRIORITY_COLORS[pri]}15`,
                                color: PRIORITY_COLORS[pri],
                              }
                            : {}
                        }
                      >
                        {pri}
                      </button>
                    ))}
                  </div>

                  {/* Region */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold tracking-widest uppercase text-text-primary inline-block min-w-[70px] text-right pr-3 shrink-0">
                      Region
                    </span>
                    {availableRegions.map(({ id, label }) => (
                      <button
                        key={id}
                        onClick={() => toggleRegionFilter(id)}
                        className={cn(
                          "px-3 py-1 text-xs font-medium rounded-[6px] border transition-all duration-200 cursor-pointer",
                          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--text-accent)]/50",
                          regionFilter.includes(id)
                            ? "border-white/25 bg-white/10 text-text-primary font-bold"
                            : "border-white/[0.08] text-text-secondary hover:border-border-medium"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Sort + count */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold tracking-widest uppercase text-text-primary inline-block min-w-[70px] text-right pr-3 shrink-0">
                        Sort
                      </span>
                      {([
                        { key: "name" as const, label: "A-Z" },
                        { key: "count" as const, label: "Most Regs" },
                        { key: "critical" as const, label: "Most Critical" },
                      ] as const).map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setSortBy(key)}
                          className={cn(
                            "px-2.5 py-1 text-xs font-medium rounded-[6px] border transition-all duration-200 cursor-pointer",
                            sortBy === key
                              ? "border-border-medium bg-active-bg text-text-primary"
                              : "border-transparent text-text-secondary hover:text-text-primary"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-text-muted tabular-nums">
                      {filteredJurisdictions.length} jurisdiction
                      {filteredJurisdictions.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {hasFilters && (
                    <button
                      onClick={clearFilters}
                      className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                    >
                      <X size={12} strokeWidth={2} />
                      Clear filters
                    </button>
                  )}
                </div>

                {/* List */}
                <div ref={listRef} className="flex-1 overflow-y-auto px-4 pb-4">
                  {filteredJurisdictions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <MapPin size={32} className="text-text-secondary mb-3 opacity-40" />
                      <p className="text-sm text-text-secondary mb-2">
                        No jurisdictions match
                      </p>
                      <button
                        onClick={clearFilters}
                        className="text-xs text-text-accent hover:underline cursor-pointer"
                      >
                        Clear filters
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {filteredJurisdictions.map((jur) => (
                        <button
                          key={jur.id}
                          data-jur={jur.id}
                          onClick={() => handleCardClick(jur)}
                          onMouseEnter={() => setHoveredJurId(jur.id)}
                          onMouseLeave={() => setHoveredJurId(null)}
                          className={cn(
                            "w-full text-left rounded-lg border bg-surface-card p-3.5",
                            "transition-all duration-150 cursor-pointer",
                            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--text-accent)]/50",
                            "hover:bg-surface-card-hover hover:-translate-y-px",
                            selectedJurId === jur.id
                              ? "border-text-accent/30 ring-1 ring-text-accent/20"
                              : "border-border-subtle"
                          )}
                          style={{
                            borderLeftWidth: 4,
                            borderLeftColor:
                              PRIORITY_COLORS[jur.topPriority] || "var(--border-subtle)",
                            boxShadow:
                              "0 1px 3px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.18)",
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span
                                  className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded"
                                  style={{
                                    background: "var(--map-pin-bg)",
                                    color: "#171e19",
                                    fontFamily: "monospace",
                                  }}
                                >
                                  {jur.pinCode}
                                </span>
                                <span className="text-[15px] font-semibold text-text-primary" style={{ letterSpacing: "-0.1px" }}>
                                  {jur.label}
                                </span>
                              </div>
                              <p className="text-[13px] text-text-secondary mb-2">
                                {jur.isSubJurisdiction ? `${jur.region} — sub-region` : jur.region}
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {jur.criticalCount > 0 && (
                                  <span
                                    className="text-[11px] font-bold px-2 py-0.5 rounded"
                                    style={{
                                      background: "rgba(255,59,48,0.15)",
                                      border: "1px solid rgba(255,59,48,0.4)",
                                      color: "#ff3b30",
                                    }}
                                  >
                                    {jur.criticalCount} CRITICAL
                                  </span>
                                )}
                                {jur.highCount > 0 && (
                                  <span
                                    className="text-[11px] font-bold px-2 py-0.5 rounded"
                                    style={{
                                      background: "rgba(255,149,0,0.15)",
                                      border: "1px solid rgba(255,149,0,0.4)",
                                      color: "#ff9500",
                                    }}
                                  >
                                    {jur.highCount} HIGH
                                  </span>
                                )}
                                {jur.conflictCount > 0 && (
                                  <span
                                    className="text-[11px] font-bold px-2 py-0.5 rounded"
                                    style={{
                                      background: "rgba(255,149,0,0.12)",
                                      border: "1px solid rgba(255,149,0,0.3)",
                                      color: "#ff9500",
                                    }}
                                  >
                                    {jur.conflictCount} CONFLICT{jur.conflictCount !== 1 ? "S" : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-text-muted">
                              <span className="text-xs tabular-nums shrink-0">
                                {jur.resources.length} reg{jur.resources.length !== 1 ? "s" : ""}
                              </span>
                              <ChevronRight size={14} />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
