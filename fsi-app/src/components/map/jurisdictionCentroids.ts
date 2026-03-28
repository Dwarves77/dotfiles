// Approximate centroids for jurisdiction/region pins on the map
// Keys match jurisdiction IDs from constants.ts + sub-jurisdiction IDs

export interface JurisdictionCoord {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

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

// ── Sub-jurisdiction centroids ──
// Format: "parent-child" e.g. "us-ca" for California

export const SUB_JURISDICTION_CENTROIDS: Record<string, [number, number]> = {
  // US states
  "us-ca": [36.8, -119.4],      // California
  "us-ny": [42.2, -74.8],       // New York
  "us-tx": [31.0, -100.0],      // Texas
  "us-wa": [47.4, -120.7],      // Washington State
  "us-or": [44.0, -120.5],      // Oregon
  "us-ma": [42.4, -71.4],       // Massachusetts
  "us-co": [39.0, -105.5],      // Colorado
  "us-nj": [40.1, -74.4],       // New Jersey
  "us-ct": [41.6, -72.7],       // Connecticut
  "us-md": [39.0, -76.6],       // Maryland
  "us-vt": [44.0, -72.7],       // Vermont
  "us-ri": [41.6, -71.5],       // Rhode Island
  "us-la-port": [29.9, -90.0],  // Port of Los Angeles area

  // EU member states
  "eu-norway": [62, 10],
  "eu-germany": [51.2, 10.4],
  "eu-france": [46.6, 2.2],
  "eu-netherlands": [52.1, 5.3],
  "eu-spain": [40.5, -3.7],
  "eu-italy": [42.5, 12.5],
  "eu-sweden": [62, 15.5],
  "eu-denmark": [56, 9.5],
  "eu-finland": [64, 26],
  "eu-belgium": [50.5, 4.5],
  "eu-poland": [52, 20],
  "eu-greece": [39, 22],

  // Latin America (future sub-national, e.g. specific states in Brazil)
  "latam-mexico": [23.6, -102.5],
  "latam-colombia": [4.6, -74.1],
};

// ── Display labels ──

export const JURISDICTION_PIN_CODES: Record<string, string> = {
  // Top-level
  us: "US",
  canada: "CA",
  latam: "LA",
  brazil: "BR",
  caribbean: "CB",
  eu: "EU",
  uk: "UK",
  nordic: "NO",
  switzerland: "CH",
  turkey: "TR",
  china: "CN",
  japan: "JP",
  korea: "KR",
  india: "IN",
  asia: "AS",
  asean: "AS",
  hk: "HK",
  singapore: "SG",
  australia: "AU",
  pacific: "PC",
  meaf: "ME",
  gcc: "GC",
  uae: "AE",
  safrica: "ZA",
  wafrica: "WA",
  eafrica: "EA",
  nafrica: "NA",
  global: "GL",
  imo: "IM",
  icao: "IC",

  // Sub-jurisdictions
  "us-ca": "CA",
  "us-ny": "NY",
  "us-tx": "TX",
  "us-wa": "WA",
  "us-or": "OR",
  "us-ma": "MA",
  "us-co": "CO",
  "us-nj": "NJ",
  "us-ct": "CT",
  "us-md": "MD",
  "us-vt": "VT",
  "us-ri": "RI",
  "us-la-port": "LA",
  "eu-norway": "NO",
  "eu-germany": "DE",
  "eu-france": "FR",
  "eu-netherlands": "NL",
  "eu-spain": "ES",
  "eu-italy": "IT",
  "eu-sweden": "SE",
  "eu-denmark": "DK",
  "eu-finland": "FI",
  "eu-belgium": "BE",
  "eu-poland": "PL",
  "eu-greece": "GR",
  "latam-mexico": "MX",
  "latam-colombia": "CO",
};

// ── Labels for sub-jurisdictions ──

export const SUB_JURISDICTION_LABELS: Record<string, string> = {
  "us-ca": "California",
  "us-ny": "New York",
  "us-tx": "Texas",
  "us-wa": "Washington",
  "us-or": "Oregon",
  "us-ma": "Massachusetts",
  "us-co": "Colorado",
  "us-nj": "New Jersey",
  "us-ct": "Connecticut",
  "us-md": "Maryland",
  "us-vt": "Vermont",
  "us-ri": "Rhode Island",
  "us-la-port": "Port of Los Angeles",
  "eu-norway": "Norway",
  "eu-germany": "Germany",
  "eu-france": "France",
  "eu-netherlands": "Netherlands",
  "eu-spain": "Spain",
  "eu-italy": "Italy",
  "eu-sweden": "Sweden",
  "eu-denmark": "Denmark",
  "eu-finland": "Finland",
  "eu-belgium": "Belgium",
  "eu-poland": "Poland",
  "eu-greece": "Greece",
  "latam-mexico": "Mexico",
  "latam-colombia": "Colombia",
};
