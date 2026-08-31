// Approximate centroids for jurisdiction/region pins on the map
// Keys match jurisdiction IDs from constants.ts

// ── Top-level jurisdictions ──

export const JURISDICTION_CENTROIDS: Record<string, [number, number]> = {
  // Americas
  us: [38, -97],
  canada: [56, -96],
  latam: [-15, -60],
  brazil: [-14, -51],
  caribbean: [18, -72],
  // Europe
  eu: [50, 10],
  uk: [54, -2],
  nordic: [62, 15],
  switzerland: [47, 8],
  turkey: [39, 35],
  // Asia-Pacific
  asia: [28, 95],
  china: [34, 100],
  japan: [36, 138],
  korea: [36, 128],
  india: [21, 78],
  asean: [5, 105],
  hk: [22, 114],
  singapore: [1.3, 103.8],
  australia: [-25, 134],
  pacific: [-5, 160],
  // Middle East & Africa
  meaf: [15, 40],
  gcc: [24, 48],
  uae: [24, 54],
  safrica: [-29, 24],
  wafrica: [10, -5],
  eafrica: [0, 35],
  nafrica: [30, 10],
  // Cross-regional
  global: [30, -30],  // Mid-Atlantic — not tied to any continent
  imo: [51.5, -0.1], // London HQ
  icao: [45.5, -73.6], // Montreal HQ
};
