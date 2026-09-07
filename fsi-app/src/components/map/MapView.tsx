"use client";

/**
 * MapView — Leaflet basemap + urgency-band markers, restyled for the UI
 * system handoff (2026-09-06, README screen 10 / artboard "Map"; lane
 * uimapcomm). Country-level only (no sub-jurisdiction pins).
 *
 *   - Round markers, sized by item count, coloured by the ONE urgency
 *     band scale (src/lib/urgency/bands.ts — never a page-local palette;
 *     this file previously kept its own TONE_COLOR table with different
 *     hex values than bands.ts, a defect fixed this lane).
 *   - Community activity dots overlay (7px black) on regions with
 *     active community threads.
 *   - flyTo() on marker click AND on externalSelectJurId change (the
 *     register/rail click triggers the same animation).
 *
 *   Tile layer: OpenStreetMap via react-leaflet TileLayer.
 *   Centroids: JURISDICTION_CENTROIDS (country-level only).
 */

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { JURISDICTION_CENTROIDS } from "./jurisdictionCentroids";
import { BAND_ORDER, type UrgencyBandKey } from "@/lib/urgency/bands";

// ── Public prop types ──

/** Markers use the one urgency band scale (src/lib/urgency/bands.ts) —
 *  never a page-local palette. Renamed from the prior "tone" vocabulary
 *  (critical/high/moderate/low) to the band keys directly (lane
 *  uimapcomm, 2026-09-06). */
export type JurisdictionTone = UrgencyBandKey;

export interface MapJurisdiction {
  id: string;
  label: string;
  count: number;
  tone: JurisdictionTone;
}

export interface CommunityActivityRow {
  regionCode: string;
  count: number;
}

interface MapViewProps {
  jurisdictions: MapJurisdiction[];
  communityActivity?: CommunityActivityRow[];
  /** When this id changes (along with nonce bump), flyTo that jurisdiction. */
  externalSelectJurId?: string | null;
  externalSelectNonce?: number;
  /** Marker click handler (defaults to no-op). */
  onMarkerClick?: (jurisdictionId: string) => void;
}

// ── Visual contract (UI system handoff 2026-09-06, README §0.2) ──

// Colour encodes urgency band, read from the single source of truth —
// never a second palette (the prior TONE_COLOR here duplicated bands.ts
// with different hex values: high #E8610A vs --action #F97316, moderate
// #CA8A04 vs --monitor #2563EB — a visible defect, orange markers where
// the rest of the app draws blue for the same band. Fixed by deriving
// this table from BAND_ORDER at module load.
const TONE_COLOR: Record<JurisdictionTone, string> = Object.fromEntries(
  BAND_ORDER.map((b) => [b.key, b.hex]),
) as Record<JurisdictionTone, string>;

// Marker base sizes follow band severity, hottest band largest.
function markerSize(tone: JurisdictionTone, count: number): number {
  const base = tone === "immediate" ? 22 : tone === "action" ? 16 : tone === "monitor" ? 13 : 11;
  // Count bonus capped to keep the biggest markers from overwhelming the map.
  const bonus = Math.min(count, 80) * (tone === "immediate" ? 0.55 : tone === "action" ? 0.45 : 0.3);
  return Math.round(base + bonus);
}

// Region codes used by community_groups → approximate lat/lng for the dot
// overlay. Subset of JURISDICTION_CENTROIDS keyed to the 8-region community
// vocabulary. GLOBAL falls back to the mid-Atlantic point shared with
// jurisdictions; visually overlaps the "global" marker which is acceptable.
const COMMUNITY_REGION_CENTROIDS: Record<string, [number, number]> = {
  EU: JURISDICTION_CENTROIDS.eu,
  UK: JURISDICTION_CENTROIDS.uk,
  US: JURISDICTION_CENTROIDS.us,
  LATAM: JURISDICTION_CENTROIDS.latam,
  APAC: JURISDICTION_CENTROIDS.asia,
  HK: JURISDICTION_CENTROIDS.hk,
  MEA: JURISDICTION_CENTROIDS.meaf,
  GLOBAL: JURISDICTION_CENTROIDS.global,
};

// ── Marker icon builders ──

function createJurisdictionIcon(tone: JurisdictionTone, count: number): L.DivIcon {
  const size = markerSize(tone, count);
  const color = TONE_COLOR[tone];
  // Label font size scales with the marker; cap so tiny markers don't
  // overflow with 3-digit counts.
  const fontSize = Math.max(9, Math.min(13, Math.round(size * 0.35)));
  // The visible dot stays sized by count (the artboard's own encoding — "marker
  // size = item count"), but the CLICKABLE icon box is floored at 44px (README
  // §0.4's 44px control floor) so a low-count jurisdiction's marker is never
  // smaller than a safe tap target. Floored at 44, not the law-2 fallback 24px
  // -with-8px-clearance: at low zoom, geographically close jurisdictions (e.g.
  // UK/EU) can sit within 8px of each other on screen regardless of any single
  // marker's own hit-box size, so the unconditional 44px floor is the only one
  // that holds regardless of which other markers are nearby. Leaflet's
  // iconSize/iconAnchor define the interactive hit area independent of the
  // inner div's visual size.
  const hit = Math.max(size, 44);
  return L.divIcon({
    className: "cl-map-marker",
    html: `
      <div style="
        width:${hit}px;height:${hit}px;
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;
      ">
        <div style="
          width:${size}px;height:${size}px;
          background:${color};
          border:1.5px solid #fff;
          border-radius:999px;
          display:flex;align-items:center;justify-content:center;
          font-family:var(--font-display,Anton),system-ui,sans-serif;
          font-size:${fontSize}px;font-weight:400;
          color:#fff;
          transition:transform 0.15s ease;
        ">${count}</div>
      </div>
    `,
    iconSize: [hit, hit],
    iconAnchor: [hit / 2, hit / 2],
  });
}

function createCommunityDotIcon(): L.DivIcon {
  return L.divIcon({
    className: "cl-map-community-dot",
    html: `
      <div style="
        width:7px;height:7px;
        border-radius:999px;
        background:#1A1A1A;
        border:1.5px solid #fff;
      "></div>
    `,
    iconSize: [7, 7],
    iconAnchor: [3.5, 3.5],
  });
}

// ── FlyTo helper ──

function FlyToSelected({ lat, lng, nonce }: { lat: number; lng: number; nonce: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 5, { duration: 0.8 });
    // nonce in deps so re-selecting same coords still re-fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, nonce]);
  return null;
}

// ── Main component ──

export function MapView({
  jurisdictions,
  communityActivity = [],
  externalSelectJurId = null,
  externalSelectNonce = 0,
  onMarkerClick,
}: MapViewProps) {
  // Resolve lat/lng for each jurisdiction; drop rows we have no centroid
  // for so the marker layer stays geometrically honest.
  const markers = useMemo(() => {
    return jurisdictions
      .map((j) => {
        const centroid = JURISDICTION_CENTROIDS[j.id];
        if (!centroid) return null;
        return {
          ...j,
          lat: centroid[0],
          lng: centroid[1],
        };
      })
      .filter((m): m is MapJurisdiction & { lat: number; lng: number } => m !== null);
  }, [jurisdictions]);

  // Resolve lat/lng for community activity dots.
  const communityDots = useMemo(() => {
    return communityActivity
      .filter((c) => c.count > 0)
      .map((c) => {
        const centroid = COMMUNITY_REGION_CENTROIDS[c.regionCode];
        if (!centroid) return null;
        return { regionCode: c.regionCode, count: c.count, lat: centroid[0], lng: centroid[1] };
      })
      .filter((d): d is { regionCode: string; count: number; lat: number; lng: number } => d !== null);
  }, [communityActivity]);

  // Resolve flyTo target.
  const selectedCoord = useMemo(() => {
    if (!externalSelectJurId) return null;
    const m = markers.find((mm) => mm.id === externalSelectJurId);
    if (!m) return null;
    return { lat: m.lat, lng: m.lng };
  }, [externalSelectJurId, markers]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      {/* Leaflet's default zoom control renders ~26-30px buttons — below the 44px hit-target
          floor (README §0.4 "Hit targets. 44px minimum on every toggle row and control"). Sized
          up here rather than forking react-leaflet's ZoomControl. */}
      <style>{`
        .leaflet-control-zoom-in, .leaflet-control-zoom-out {
          width: 44px !important;
          height: 44px !important;
          line-height: 44px !important;
          font-size: 18px !important;
        }
      `}</style>
      <MapContainer
        center={[20, 0]}
        zoom={2}
        minZoom={2}
        maxZoom={8}
        worldCopyJump
        zoomControl={false}
        scrollWheelZoom
        style={{ height: "100%", width: "100%", background: "#EAE6DA" }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <ZoomControl position="topright" />

        {selectedCoord && (
          <FlyToSelected
            lat={selectedCoord.lat}
            lng={selectedCoord.lng}
            nonce={externalSelectNonce}
          />
        )}

        {/* Community activity dots render BENEATH urgency markers
            (z-index 1) per mockup layering. */}
        {communityDots.map((d) => (
          <Marker
            key={`comm-${d.regionCode}`}
            position={[d.lat, d.lng]}
            icon={createCommunityDotIcon()}
            interactive={false}
            zIndexOffset={0}
          />
        ))}

        {/* Urgency markers on top (z-index 2). */}
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={createJurisdictionIcon(m.tone, m.count)}
            zIndexOffset={100}
            eventHandlers={{
              click: () => onMarkerClick?.(m.id),
            }}
          />
        ))}
      </MapContainer>

      {/* Map legend, bottom-left absolute per artboard 10. data-map-legend
          is a stable hook for the rendering-guard smoke spec. */}
      <div
        data-map-legend
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          background: "var(--card)",
          padding: "12px 14px",
          border: "1px solid var(--line-1)",
          borderRadius: 6,
          fontSize: 11,
          zIndex: 500,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            marginBottom: 8,
          }}
        >
          Key
        </div>
        {BAND_ORDER.map((b, i) => (
          <LegendRow key={b.key} size={14 - i * 1.5} color={b.hex} label={b.label} />
        ))}
        <LegendRow size={7} color="#1A1A1A" label="Community activity" />
      </div>
    </div>
  );
}

function LegendRow({ size, color, label }: { size: number; color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span
        style={{
          display: "inline-block",
          width: size,
          height: size,
          borderRadius: 999,
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ color: "var(--ink)" }}>{label}</span>
    </div>
  );
}
