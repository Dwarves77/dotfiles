"use client";

/**
 * MapView — Phase 6 rebuild (2026-05-25).
 *
 * Binds to design_handoff_2026-05/map.html. Per operator Path C
 * decision, this rewrite strips substantial functionality from the
 * prior MapView in favor of mockup-fidelity on the visual contract:
 *
 *   STRIPPED (was in prior MapView, not in mockup):
 *     - Internal toolbar: search box, sort selector, viewMode toggle
 *     - Sub-jurisdiction pins (NYC LL97, CA AB-32, etc.) — country-
 *       level only per Q1; sub-jurisdiction visibility is a Sprint 3
 *       enhancement candidate
 *     - Marker cluster grouping (react-leaflet-cluster)
 *     - Square pin icons with monospace pinCode text
 *     - ResourceCard / ResourceDetail right-rail drill expansion
 *     - Multi-level drill (jurisdiction → sub → resource)
 *
 *   BUILT (per mockup):
 *     - Round urgency-tiered colored markers sized by item count
 *       (Critical red large / High orange medium / Moderate amber small)
 *     - Community activity dots overlay (7px black) on regions with
 *       active community threads
 *     - Map legend bottom-left (Critical 14 · High 12 · Moderate 10
 *       · Community 7)
 *     - flyTo() on marker click AND on externalSelectJurId change
 *       (right-rail click triggers same animation)
 *
 *   Tile layer: OpenStreetMap via react-leaflet TileLayer.
 *   Centroids: JURISDICTION_CENTROIDS (country-level only).
 */

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { JURISDICTION_CENTROIDS } from "./jurisdictionCentroids";

// ── Public prop types ──

export type JurisdictionTone = "critical" | "high" | "moderate" | "low";

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

// ── Visual contract per mockup ──

// Severity spectrum per HANDOFF §2 (sev-*): colour encodes urgency.
const TONE_COLOR: Record<JurisdictionTone, string> = {
  critical: "#DC2626",
  high: "#E8610A",
  moderate: "#CA8A04",
  low: "#16A34A",
};

// Mockup legend specifies tier base sizes (Critical 14 / High 12 / Moderate 10).
// Real markers grow with count so the "marker size encodes item count" meta
// line holds; the legend keys document the minimum size for each tier.
function markerSize(tone: JurisdictionTone, count: number): number {
  const base = tone === "critical" ? 22 : tone === "high" ? 16 : tone === "moderate" ? 13 : 11;
  // Count bonus capped to keep the biggest markers from overwhelming the map.
  const bonus = Math.min(count, 80) * (tone === "critical" ? 0.55 : tone === "high" ? 0.45 : 0.3);
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
  return L.divIcon({
    className: "cl-map-marker",
    html: `
      <div style="
        width:${size}px;height:${size}px;
        background:${color};
        border:1.5px solid #fff;
        border-radius:999px;
        display:flex;align-items:center;justify-content:center;
        font-family:var(--font-display,Anton),system-ui,sans-serif;
        font-size:${fontSize}px;font-weight:400;
        color:#fff;
        cursor:pointer;
        transition:transform 0.15s ease;
      ">${count}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
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

      {/* Map legend, bottom-left absolute per mockup positioning. */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          background: "var(--color-surface, #fff)",
          padding: "12px 14px",
          border: "1px solid var(--color-border, rgba(0,0,0,0.12))",
          borderRadius: "var(--radius-sm, 6px)",
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
            color: "var(--color-text-muted, #7A6E6C)",
            marginBottom: 8,
          }}
        >
          Key
        </div>
        <LegendRow size={14} color={TONE_COLOR.critical} label="Critical · 1+ items" />
        <LegendRow size={12} color={TONE_COLOR.high} label="High" />
        <LegendRow size={10} color={TONE_COLOR.moderate} label="Moderate" />
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
      <span style={{ color: "var(--color-text-primary, #1A1A1A)" }}>{label}</span>
    </div>
  );
}
