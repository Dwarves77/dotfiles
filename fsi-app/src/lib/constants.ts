// ── App Identity ──
export const APP_NAME = "Caro's Ledge";
export const APP_TAGLINE = "Freight Sustainability Intelligence";

// ── Transport Modes ──
export const MODES = [
  { id: "air", label: "Air", short: "AIR" },
  { id: "road", label: "Road", short: "ROAD" },
  { id: "ocean", label: "Ocean", short: "OCEAN" },
] as const;

// ── Sustainability Topics ──
export const TOPICS = [
  { id: "emissions", label: "Emissions & Carbon Pricing" },
  { id: "fuels", label: "Sustainable Fuels & Energy" },
  { id: "transport", label: "Green Transport Standards" },
  { id: "reporting", label: "ESG Reporting & Methodology" },
  { id: "packaging", label: "Packaging & Circular Economy" },
  { id: "corridors", label: "Green Corridors & Infrastructure" },
  { id: "research", label: "Research & Intelligence" },
] as const;

// ── Jurisdictions (worldwide) ──
export const JURISDICTIONS = [
  // Americas
  { id: "us", label: "US", region: "Americas" },
  { id: "canada", label: "Canada", region: "Americas" },
  { id: "latam", label: "LatAm", region: "Americas" },
  { id: "brazil", label: "Brazil", region: "Americas" },
  { id: "caribbean", label: "Caribbean", region: "Americas" },
  // Europe
  { id: "eu", label: "EU", region: "Europe" },
  { id: "uk", label: "UK", region: "Europe" },
  { id: "nordic", label: "Nordic", region: "Europe" },
  { id: "switzerland", label: "Switzerland", region: "Europe" },
  { id: "turkey", label: "Turkey", region: "Europe" },
  // Asia-Pacific
  { id: "china", label: "China", region: "Asia-Pacific" },
  { id: "japan", label: "Japan", region: "Asia-Pacific" },
  { id: "korea", label: "South Korea", region: "Asia-Pacific" },
  { id: "india", label: "India", region: "Asia-Pacific" },
  { id: "asean", label: "ASEAN", region: "Asia-Pacific" },
  { id: "hk", label: "Hong Kong", region: "Asia-Pacific" },
  { id: "singapore", label: "Singapore", region: "Asia-Pacific" },
  { id: "australia", label: "Australia/NZ", region: "Asia-Pacific" },
  { id: "pacific", label: "Pacific Islands", region: "Asia-Pacific" },
  // Middle East & Africa
  { id: "gcc", label: "GCC", region: "Middle East & Africa" },
  { id: "uae", label: "UAE", region: "Middle East & Africa" },
  { id: "safrica", label: "South Africa", region: "Middle East & Africa" },
  { id: "wafrica", label: "West Africa", region: "Middle East & Africa" },
  { id: "eafrica", label: "East Africa", region: "Middle East & Africa" },
  { id: "nafrica", label: "North Africa", region: "Middle East & Africa" },
  // Cross-regional
  { id: "global", label: "Global", region: "Global" },
  { id: "imo", label: "IMO", region: "Global" },
  { id: "icao", label: "ICAO", region: "Global" },
] as const;

// ── Cargo Verticals ──
export const VERTICALS = [
  { id: "live-events", label: "Live Events", keywords: ["live event", "events", "concert", "exhibition", "trade show"] },
  { id: "artwork", label: "Artwork", keywords: ["artwork", "art ", "art,", "gallery", "museum", "fine art"] },
  { id: "luxury-goods", label: "Luxury Goods", keywords: ["luxury", "high-value", "premium"] },
  { id: "film-tv", label: "Film / TV", keywords: ["film", "tv", "production", "broadcast", "media"] },
  { id: "automotive", label: "Automotive", keywords: ["automotive", "vehicle", "car ", "cars ", "oem"] },
  { id: "humanitarian", label: "Humanitarian", keywords: ["humanitarian", "aid", "relief", "disaster"] },
] as const;

// ── Priority Levels ──
export const PRIORITIES = ["CRITICAL", "HIGH", "MODERATE", "LOW"] as const;

// ── Color Maps ──
export const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "#FF3B30",
  HIGH: "#FF9500",
  MODERATE: "#8e8e93",
  LOW: "#aeaeb2",
};

export const TOPIC_COLORS: Record<string, string> = {
  emissions: "#5856D6",
  fuels: "#A2845E",
  transport: "#34C759",
  reporting: "#AF52DE",
  packaging: "#FF2D55",
  corridors: "#007AFF",
  research: "#5AC8FA",
};

export const IMPACT_COLORS: Record<string, string> = {
  cost: "#FFD60A",
  compliance: "#E040FB",
  client: "#00C7BE",
  operational: "#64D2FF",
};

export const IMPACT_LABELS: Record<string, string> = {
  cost: "Cost Impact",
  compliance: "Compliance Obligation",
  client: "Client-Facing",
  operational: "Operational",
};

// ── Jurisdiction Weights (for urgency scoring) ──
// Weights reflect regulatory impact on international freight forwarding
export const JURISDICTION_WEIGHTS: Record<string, number> = {
  // Highest — global frameworks + major trade blocs
  global: 1.0, imo: 1.0, icao: 1.0, eu: 1.0,
  // High — major trade partners
  us: 0.9, china: 0.9, uk: 0.8,
  // Medium-high — significant freight markets
  japan: 0.7, korea: 0.7, canada: 0.7, india: 0.7,
  singapore: 0.7, australia: 0.7,
  // Medium — regional influence
  asean: 0.6, hk: 0.6, nordic: 0.6, switzerland: 0.6,
  brazil: 0.6, gcc: 0.6, uae: 0.6, turkey: 0.6,
  // Standard — emerging/regional
  latam: 0.5, safrica: 0.5, wafrica: 0.4, eafrica: 0.4,
  nafrica: 0.4, caribbean: 0.4, pacific: 0.3,
};

// ── Resource Categories (taxonomy) ──
export const CATEGORIES = [
  "law",
  "regulation",
  "policy",
  "standard",
  "innovation",
  "research",
  "market_signal",
  "guidance",
] as const;

// ── Lifecycle Stages ──
export const LIFECYCLE_STAGES = [
  "proposal",
  "consultation",
  "adopted",
  "implementation",
  "enforcement",
  "amendment",
  "superseded",
  "repealed",
] as const;

// ── Provenance Levels ──
export const PROVENANCE_LEVELS = [
  { level: "L1", label: "Primary Legal Text", description: "Official Journal, Federal Register, gazette" },
  { level: "L2", label: "Regulator Guidance", description: "Official FAQ, portal, implementation guide" },
  { level: "L3", label: "Intergovernmental", description: "IGO publication, dataset, tracker" },
  { level: "L4", label: "Expert Analysis", description: "Think-tank, industry body, NGO" },
  { level: "L5", label: "News/Commentary", description: "Law firm alert, trade press, consultancy" },
] as const;

// ── Archive Reasons ──
export const ARCHIVE_REASONS = [
  "Superseded",
  "Expired",
  "Repealed",
  "Consolidated",
  "Manual",
] as const;

// ── Share Detail Levels ──
export const SHARE_LEVELS = {
  summary: {
    label: "Summary",
    description: "Title, priority, 1-line why, source link",
  },
  standard: {
    label: "Standard",
    description: "What it is, why it matters, impact, timeline, source",
  },
  full: {
    label: "Full Detail",
    description: "Everything including key data, disputes, what changed",
  },
} as const;

// ── Type Aliases ──
export type ModeId = (typeof MODES)[number]["id"];
export type TopicId = (typeof TOPICS)[number]["id"];
export type JurisdictionId = (typeof JURISDICTIONS)[number]["id"];
export type Priority = (typeof PRIORITIES)[number];
export type Category = (typeof CATEGORIES)[number];
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];
export type ShareLevel = keyof typeof SHARE_LEVELS;
