// ── App Identity ──
export const APP_NAME = "Caro's Ledge";
export const APP_TAGLINE = "Freight Sustainability Intelligence";

// ── Intelligence Domains (primary navigation) ──
export const DOMAINS = [
  { id: 1, label: "Regulatory & Legislative", short: "Regulations", icon: "Scale" },
  { id: 2, label: "Energy & Technology Innovation", short: "Technology", icon: "Zap" },
  { id: 3, label: "Regional Operations Intelligence", short: "Regional", icon: "Globe" },
  { id: 4, label: "Geopolitical & Market Signals", short: "Geopolitical", icon: "TrendingUp" },
  { id: 5, label: "Source Intelligence", short: "Sources", icon: "Database" },
  { id: 6, label: "Warehouse & Facility Optimization", short: "Facilities", icon: "Building" },
  { id: 7, label: "University & Research Pipeline", short: "Research", icon: "GraduationCap" },
] as const;

export type DomainId = (typeof DOMAINS)[number]["id"];

// ── Transport Modes ──
export const MODES = [
  { id: "air", label: "Air", short: "AIR" },
  { id: "road", label: "Road", short: "ROAD" },
  { id: "ocean", label: "Ocean", short: "OCEAN" },
  { id: "rail", label: "Rail", short: "RAIL" },
] as const;

// ── Sustainability Topics (Domain 1 sub-categories) ──
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
  { id: "asia", label: "Asia", region: "Asia-Pacific" },
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
  { id: "meaf", label: "ME & Africa", region: "Middle East & Africa" },
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

// ── Freight Sectors ──
// Master list of all available sectors. Workspaces select which apply
// to their operations via workspace_settings.sector_profile.
// This list is extensible — new sectors are added here as the platform
// expands to serve more freight verticals globally.

export interface SectorDefinition {
  id: string;
  label: string;
  keywords: string[];
}

export const ALL_SECTORS: SectorDefinition[] = [
  // Specialized cargo
  { id: "fine-art", label: "Fine Art & Museums", keywords: ["artwork", "art ", "art,", "gallery", "museum", "fine art"] },
  { id: "live-events", label: "Live Events & Touring", keywords: ["live event", "events", "concert", "exhibition", "trade show", "touring"] },
  { id: "luxury-goods", label: "Luxury Goods", keywords: ["luxury", "high-value", "premium"] },
  { id: "film-tv", label: "Film & TV Production", keywords: ["film", "tv", "production", "broadcast", "media"] },
  { id: "automotive", label: "Automotive", keywords: ["automotive", "vehicle", "car ", "cars ", "oem"] },
  { id: "humanitarian", label: "Humanitarian & Aid", keywords: ["humanitarian", "aid", "relief", "disaster"] },
  // General freight sectors
  { id: "bulk-commodity", label: "Bulk Commodity", keywords: ["bulk", "commodity", "grain", "ore", "coal"] },
  { id: "cold-chain", label: "Cold Chain & Perishables", keywords: ["cold chain", "perishable", "refrigerated", "frozen", "temperature"] },
  { id: "pharma", label: "Pharmaceuticals", keywords: ["pharma", "pharmaceutical", "medical", "vaccine", "gdp"] },
  { id: "ecommerce", label: "E-Commerce & Parcels", keywords: ["ecommerce", "e-commerce", "parcel", "last mile", "fulfillment"] },
  { id: "industrial", label: "Industrial & Heavy Equipment", keywords: ["industrial", "equipment", "machinery", "heavy lift", "project cargo"] },
  { id: "chemicals", label: "Chemicals & Hazmat", keywords: ["chemical", "hazmat", "dangerous goods", "dg", "imdg"] },
  { id: "electronics", label: "Electronics & High-Tech", keywords: ["electronics", "semiconductor", "high-tech", "technology"] },
  { id: "textiles", label: "Textiles & Fashion", keywords: ["textile", "fashion", "garment", "apparel"] },
  { id: "agriculture", label: "Agriculture & Food", keywords: ["agriculture", "food", "agri", "livestock", "feed"] },
  { id: "energy", label: "Energy & Oil/Gas", keywords: ["energy", "oil", "gas", "lng", "petroleum", "pipeline"] },
];

// Legacy alias — workspace code that still references VERTICALS gets the full master list.
// FilterBar and scoring pull the active subset from workspace_settings.sector_profile.
export const VERTICALS = ALL_SECTORS;

// ── Confidence Levels ──
export const CONFIDENCE_LEVELS = ["confirmed", "unconfirmed"] as const;

// ── Priority Levels ──
export const PRIORITIES = ["CRITICAL", "HIGH", "MODERATE", "LOW"] as const;

// ── Color Maps ──
export const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "var(--critical)",
  HIGH: "var(--high)",
  MODERATE: "var(--moderate)",
  LOW: "var(--low)",
};

export const TOPIC_COLORS: Record<string, string> = {
  emissions: "var(--topic-emissions)",
  fuels: "var(--topic-fuels)",
  transport: "var(--topic-transport)",
  reporting: "var(--topic-reporting)",
  packaging: "var(--topic-packaging)",
  corridors: "var(--topic-corridors)",
  research: "var(--topic-research)",
};

export const IMPACT_COLORS: Record<string, string> = {
  cost: "var(--impact-cost)",
  compliance: "var(--impact-compliance)",
  client: "var(--impact-client)",
  operational: "var(--impact-operational)",
};

export const IMPACT_LABELS: Record<string, string> = {
  cost: "Cost Impact",
  compliance: "Compliance Obligation",
  client: "Client-Facing",
  operational: "Operational",
};

// ── Domain Colors ──
export const DOMAIN_COLORS: Record<number, string> = {
  1: "var(--topic-emissions)",    // Regulatory
  2: "var(--topic-fuels)",        // Technology
  3: "var(--topic-transport)",    // Regional
  4: "var(--topic-reporting)",    // Geopolitical
  5: "var(--topic-corridors)",    // Sources
  6: "var(--topic-packaging)",    // Facilities
  7: "var(--topic-research)",     // Research
};

// ── Jurisdiction Weights (for urgency scoring) ──
export const JURISDICTION_WEIGHTS: Record<string, number> = {
  global: 1.0, imo: 1.0, icao: 1.0, eu: 1.0,
  us: 0.9, china: 0.9, uk: 0.8,
  japan: 0.7, korea: 0.7, canada: 0.7, india: 0.7,
  singapore: 0.7, australia: 0.7,
  asia: 0.7, asean: 0.6, hk: 0.6, nordic: 0.6, switzerland: 0.6, meaf: 0.5,
  brazil: 0.6, gcc: 0.6, uae: 0.6, turkey: 0.6,
  latam: 0.5, safrica: 0.5, wafrica: 0.4, eafrica: 0.4,
  nafrica: 0.4, caribbean: 0.4, pacific: 0.3,
};

// ── Resource Categories (taxonomy) ──
export const CATEGORIES = [
  "law", "regulation", "policy", "standard",
  "innovation", "research", "market_signal", "guidance",
] as const;

// ── Lifecycle Stages ──
export const LIFECYCLE_STAGES = [
  "proposal", "consultation", "adopted", "implementation",
  "enforcement", "amendment", "superseded", "repealed",
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
  "Superseded", "Expired", "Repealed", "Consolidated", "Manual",
] as const;

// ── Share Detail Levels ──
export const SHARE_LEVELS = {
  summary: { label: "Summary", description: "Title, priority, 1-line why, source link" },
  standard: { label: "Standard", description: "What it is, why it matters, impact, timeline, source" },
  full: { label: "Full Detail", description: "Everything including key data, disputes, what changed" },
} as const;

// ── Type Aliases ──
export type ModeId = (typeof MODES)[number]["id"];
export type TopicId = (typeof TOPICS)[number]["id"];
export type JurisdictionId = (typeof JURISDICTIONS)[number]["id"];
export type Priority = (typeof PRIORITIES)[number];
export type Category = (typeof CATEGORIES)[number];
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];
export type ShareLevel = keyof typeof SHARE_LEVELS;
