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

// ── Regulatory Topics (Domain 1 sub-categories) ──
// Covers all freight regulatory categories globally, not just sustainability.
export const TOPICS = [
  // Sustainability & environment
  { id: "emissions", label: "Emissions & Carbon Pricing" },
  { id: "fuels", label: "Sustainable Fuels & Energy" },
  { id: "transport", label: "Green Transport Standards" },
  { id: "reporting", label: "ESG Reporting & Methodology" },
  { id: "packaging", label: "Packaging & Circular Economy" },
  { id: "corridors", label: "Green Corridors & Infrastructure" },
  // Trade & customs
  { id: "customs", label: "Customs & Border Control" },
  { id: "trade", label: "Trade Policy & Tariffs" },
  { id: "sanctions", label: "Sanctions & Export Controls" },
  { id: "origin", label: "Rules of Origin" },
  // Safety & compliance
  { id: "dangerous-goods", label: "Dangerous Goods & Hazmat" },
  { id: "food-safety", label: "Food Safety & Cold Chain" },
  { id: "pharma", label: "Pharmaceutical & GDP" },
  { id: "security", label: "Cargo Security & Screening" },
  // Operations
  { id: "cabotage", label: "Cabotage & Market Access" },
  { id: "labor", label: "Labor & Driver Regulations" },
  { id: "infrastructure", label: "Port & Airport Regulations" },
  { id: "digital", label: "Digital & Data Compliance" },
  { id: "insurance", label: "Insurance & Liability" },
  // Industry standards
  { id: "standards", label: "Industry Standards (ISO, IATA)" },
  { id: "research", label: "Research & Intelligence" },
] as const;

// ── Jurisdictions (global coverage) ──
export const JURISDICTIONS = [
  // Americas — North
  { id: "us", label: "United States", region: "Americas" },
  { id: "canada", label: "Canada", region: "Americas" },
  { id: "mexico", label: "Mexico", region: "Americas" },
  // Americas — South & Central
  { id: "brazil", label: "Brazil", region: "Americas" },
  { id: "argentina", label: "Argentina", region: "Americas" },
  { id: "chile", label: "Chile", region: "Americas" },
  { id: "colombia", label: "Colombia", region: "Americas" },
  { id: "peru", label: "Peru", region: "Americas" },
  { id: "latam", label: "Latin America (other)", region: "Americas" },
  { id: "caribbean", label: "Caribbean", region: "Americas" },
  { id: "central-america", label: "Central America", region: "Americas" },
  // Europe — EU
  { id: "eu", label: "EU", region: "Europe" },
  { id: "germany", label: "Germany", region: "Europe" },
  { id: "france", label: "France", region: "Europe" },
  { id: "netherlands", label: "Netherlands", region: "Europe" },
  { id: "belgium", label: "Belgium", region: "Europe" },
  { id: "italy", label: "Italy", region: "Europe" },
  { id: "spain", label: "Spain", region: "Europe" },
  { id: "poland", label: "Poland", region: "Europe" },
  { id: "ireland", label: "Ireland", region: "Europe" },
  { id: "greece", label: "Greece", region: "Europe" },
  { id: "portugal", label: "Portugal", region: "Europe" },
  { id: "romania", label: "Romania", region: "Europe" },
  // Europe — Non-EU
  { id: "uk", label: "United Kingdom", region: "Europe" },
  { id: "nordic", label: "Nordic", region: "Europe" },
  { id: "switzerland", label: "Switzerland", region: "Europe" },
  { id: "turkey", label: "Turkey", region: "Europe" },
  { id: "ukraine", label: "Ukraine", region: "Europe" },
  { id: "balkans", label: "Balkans", region: "Europe" },
  // Asia — East
  { id: "china", label: "China", region: "Asia-Pacific" },
  { id: "japan", label: "Japan", region: "Asia-Pacific" },
  { id: "korea", label: "South Korea", region: "Asia-Pacific" },
  { id: "taiwan", label: "Taiwan", region: "Asia-Pacific" },
  { id: "hk", label: "Hong Kong", region: "Asia-Pacific" },
  // Asia — South
  { id: "india", label: "India", region: "Asia-Pacific" },
  { id: "bangladesh", label: "Bangladesh", region: "Asia-Pacific" },
  { id: "pakistan", label: "Pakistan", region: "Asia-Pacific" },
  { id: "sri-lanka", label: "Sri Lanka", region: "Asia-Pacific" },
  // Asia — Southeast
  { id: "singapore", label: "Singapore", region: "Asia-Pacific" },
  { id: "malaysia", label: "Malaysia", region: "Asia-Pacific" },
  { id: "indonesia", label: "Indonesia", region: "Asia-Pacific" },
  { id: "thailand", label: "Thailand", region: "Asia-Pacific" },
  { id: "vietnam", label: "Vietnam", region: "Asia-Pacific" },
  { id: "philippines", label: "Philippines", region: "Asia-Pacific" },
  { id: "asean", label: "ASEAN (other)", region: "Asia-Pacific" },
  // Asia — Central & Other
  { id: "asia", label: "Asia (other)", region: "Asia-Pacific" },
  // Oceania
  { id: "australia", label: "Australia", region: "Oceania" },
  { id: "new-zealand", label: "New Zealand", region: "Oceania" },
  { id: "pacific", label: "Pacific Islands", region: "Oceania" },
  // Middle East
  { id: "uae", label: "UAE", region: "Middle East" },
  { id: "saudi", label: "Saudi Arabia", region: "Middle East" },
  { id: "qatar", label: "Qatar", region: "Middle East" },
  { id: "kuwait", label: "Kuwait", region: "Middle East" },
  { id: "bahrain", label: "Bahrain", region: "Middle East" },
  { id: "oman", label: "Oman", region: "Middle East" },
  { id: "gcc", label: "GCC (other)", region: "Middle East" },
  { id: "israel", label: "Israel", region: "Middle East" },
  { id: "jordan", label: "Jordan", region: "Middle East" },
  { id: "iraq", label: "Iraq", region: "Middle East" },
  { id: "iran", label: "Iran", region: "Middle East" },
  { id: "meaf", label: "Middle East (other)", region: "Middle East" },
  // Africa — North
  { id: "egypt", label: "Egypt", region: "Africa" },
  { id: "morocco", label: "Morocco", region: "Africa" },
  { id: "tunisia", label: "Tunisia", region: "Africa" },
  { id: "algeria", label: "Algeria", region: "Africa" },
  { id: "nafrica", label: "North Africa (other)", region: "Africa" },
  // Africa — Sub-Saharan
  { id: "safrica", label: "South Africa", region: "Africa" },
  { id: "nigeria", label: "Nigeria", region: "Africa" },
  { id: "kenya", label: "Kenya", region: "Africa" },
  { id: "ethiopia", label: "Ethiopia", region: "Africa" },
  { id: "ghana", label: "Ghana", region: "Africa" },
  { id: "tanzania", label: "Tanzania", region: "Africa" },
  { id: "wafrica", label: "West Africa (other)", region: "Africa" },
  { id: "eafrica", label: "East Africa (other)", region: "Africa" },
  { id: "cafrica", label: "Central Africa", region: "Africa" },
  { id: "safrica-region", label: "Southern Africa (other)", region: "Africa" },
  // Russia & CIS
  { id: "russia", label: "Russia", region: "Russia & CIS" },
  { id: "cis", label: "CIS (other)", region: "Russia & CIS" },
  { id: "kazakhstan", label: "Kazakhstan", region: "Russia & CIS" },
  // Cross-regional / International bodies
  { id: "global", label: "Global", region: "International" },
  { id: "imo", label: "IMO", region: "International" },
  { id: "icao", label: "ICAO", region: "International" },
  { id: "wto", label: "WTO", region: "International" },
  { id: "un", label: "United Nations", region: "International" },
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
  { id: "fine-art", label: "Fine Art & Museum Logistics", keywords: ["artwork", "art ", "art,", "gallery", "museum", "fine art"] },
  { id: "live-events", label: "Live Events & Touring", keywords: ["live event", "events", "concert", "exhibition", "trade show", "touring"] },
  { id: "luxury-goods", label: "Luxury Goods", keywords: ["luxury", "high-value", "premium"] },
  { id: "film-tv", label: "Film & TV Production", keywords: ["film", "tv", "production", "broadcast", "media"] },
  { id: "automotive", label: "High-Value Automotive", keywords: ["automotive", "vehicle", "car ", "cars ", "oem", "classic car"] },
  { id: "humanitarian", label: "Humanitarian & NGO Cargo", keywords: ["humanitarian", "aid", "relief", "disaster", "ngo"] },
  // General freight sectors
  { id: "bulk-commodity", label: "Bulk Commodity", keywords: ["bulk", "commodity", "grain", "ore", "coal"] },
  { id: "cold-chain", label: "Cold Chain & Perishables", keywords: ["cold chain", "perishable", "refrigerated", "frozen", "temperature"] },
  { id: "pharma", label: "Pharmaceutical & Healthcare", keywords: ["pharma", "pharmaceutical", "medical", "vaccine", "gdp", "healthcare"] },
  { id: "ecommerce", label: "E-Commerce & Parcel", keywords: ["ecommerce", "e-commerce", "parcel", "last mile", "fulfillment"] },
  { id: "industrial", label: "Industrial Equipment & Heavy Lift", keywords: ["industrial", "equipment", "machinery", "heavy lift", "project cargo"] },
  { id: "chemicals", label: "Chemicals & Hazmat", keywords: ["chemical", "hazmat", "toxic", "corrosive"] },
  { id: "electronics", label: "Electronics & High-Tech", keywords: ["electronics", "semiconductor", "high-tech", "technology"] },
  { id: "textiles", label: "Textiles & Fashion", keywords: ["textile", "fashion", "garment", "apparel"] },
  { id: "agriculture", label: "Agriculture & Food", keywords: ["agriculture", "food", "agri", "livestock", "feed"] },
  { id: "energy", label: "Energy & Renewables", keywords: ["energy", "renewable", "battery", "solar", "wind", "hydrogen", "power"] },
  // New sectors
  { id: "dangerous-goods", label: "Dangerous Goods (DG)", keywords: ["dangerous goods", "dg ", "imdg", "iata dg", "un number", "adr ", "rid ", "icao ti", "class 1", "class 2", "class 3"] },
  { id: "general-air", label: "General Air Freight", keywords: ["air freight", "air cargo", "belly cargo", "freighter", "uld", "airline cargo"] },
  { id: "general-ocean", label: "General Ocean FCL/LCL", keywords: ["ocean freight", "fcl", "lcl", "container shipping", "sea freight", "breakbulk"] },
  { id: "oil-gas", label: "Oil & Gas", keywords: ["oil ", "gas ", "lng", "lpg", "petroleum", "crude", "refinery", "pipeline", "drilling", "offshore"] },
];

// ── Sector Adjacency Map ──
// Maps each sector to its neighbors for spillover scoring.
// If a regulation affects an adjacent sector, it still partially matters.
export const SECTOR_ADJACENCY: Record<string, string[]> = {
  "fine-art": ["luxury-goods", "live-events"],
  "live-events": ["fine-art", "film-tv"],
  "luxury-goods": ["fine-art", "electronics", "automotive"],
  "film-tv": ["live-events", "electronics"],
  "automotive": ["industrial", "electronics", "luxury-goods"],
  "humanitarian": ["cold-chain", "pharma"],
  "bulk-commodity": ["agriculture", "general-ocean", "energy", "oil-gas"],
  "cold-chain": ["pharma", "agriculture", "ecommerce"],
  "pharma": ["cold-chain", "chemicals", "dangerous-goods"],
  "ecommerce": ["electronics", "general-air", "textiles"],
  "industrial": ["automotive", "chemicals", "energy", "oil-gas"],
  "chemicals": ["dangerous-goods", "pharma", "industrial"],
  "electronics": ["ecommerce", "general-air", "automotive"],
  "textiles": ["ecommerce", "general-ocean"],
  "agriculture": ["cold-chain", "bulk-commodity"],
  "energy": ["oil-gas", "industrial", "bulk-commodity"],
  "dangerous-goods": ["chemicals", "pharma", "oil-gas", "industrial"],
  "general-air": ["ecommerce", "electronics", "pharma", "luxury-goods"],
  "general-ocean": ["bulk-commodity", "industrial", "textiles", "agriculture"],
  "oil-gas": ["energy", "bulk-commodity", "chemicals", "dangerous-goods"],
};

// Legacy alias — workspace code that still references VERTICALS gets the full master list.
// FilterBar and scoring pull the active subset from workspace_settings.sector_profile.
export const VERTICALS = ALL_SECTORS;

// ── Authority Levels (from environmental-policy-and-innovation skill) ──
// Every claim, summary, or data point must be classified using this hierarchy.
export const AUTHORITY_LEVELS = [
  { id: "primary_text", label: "Primary Legal Text", short: "Primary", description: "Published in Official Journal, Federal Register, or official gazette. This IS the law.", color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  { id: "official_guidance", label: "Official Guidance", short: "Guidance", description: "Regulator FAQ, implementation portal, or official interpretation. Authoritative but not the law itself.", color: "#0891B2", bg: "#ECFEFF", border: "#A5F3FC" },
  { id: "intergovernmental", label: "Intergovernmental Source", short: "IGO", description: "IGO publication, dataset, or tracker (IMO, ICAO, IEA). Frameworks that drive national regulation.", color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  { id: "expert_analysis", label: "Expert Analysis", short: "Analysis", description: "Think-tank, academic, or NGO analysis. Informed interpretation — must verify against primary sources for legal claims.", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  { id: "unconfirmed", label: "Unconfirmed / Industry Read", short: "Unconfirmed", description: "Trade press, consultancy opinion, or forwarder operational interpretation. Useful signal but not legally dispositive.", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
] as const;

export type AuthorityLevel = typeof AUTHORITY_LEVELS[number]["id"];

// ── Briefing Output Sections (from skill) ──
// All briefings must follow this 7-section format.
export const BRIEFING_SECTIONS = [
  "executive_summary",
  "what_changed",
  "operational_impact",
  "compliance_risk_register",
  "recommended_actions",
  "open_questions",
  "source_list",
] as const;

// ── Deep Dive Sections (from skill) ──
export const DEEP_DIVE_SECTIONS = [
  "regulation_identification",
  "source_authority",
  "immediate_actions",
  "compliance_chain",
  "classification_analysis",
  "format_operation_analysis",
  "third_party_exposure",
  "confirmed_timeline",
  "industry_translation",
  "alternatives_innovation",
  "legal_confirmation_required",
  "sources",
] as const;

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
  // Sustainability
  emissions: "var(--topic-emissions)",
  fuels: "var(--topic-fuels)",
  transport: "var(--topic-transport)",
  reporting: "var(--topic-reporting)",
  packaging: "var(--topic-packaging)",
  corridors: "var(--topic-corridors)",
  // Trade & customs
  customs: "#0369A1",
  trade: "#0E7490",
  sanctions: "#B91C1C",
  origin: "#0D9488",
  // Safety & compliance
  "dangerous-goods": "#DC2626",
  "food-safety": "#16A34A",
  pharma: "#7C3AED",
  security: "#475569",
  // Operations
  cabotage: "#EA580C",
  labor: "#CA8A04",
  infrastructure: "#2563EB",
  digital: "#6366F1",
  insurance: "#64748B",
  // Standards & research
  standards: "#0891B2",
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

// ── Jurisdiction Weights (platform defaults for urgency scoring) ──
// These are the global defaults. Workspaces can override via workspace_settings.jurisdiction_weights.
export const JURISDICTION_WEIGHTS: Record<string, number> = {
  // International bodies — highest
  global: 1.0, imo: 1.0, icao: 1.0, wto: 1.0, un: 1.0,
  // Major trade blocs
  eu: 1.0,
  // Major economies
  us: 0.9, china: 0.9, uk: 0.8,
  japan: 0.7, korea: 0.7, canada: 0.7, india: 0.7,
  germany: 0.8, france: 0.7, netherlands: 0.7, italy: 0.7, spain: 0.6,
  belgium: 0.6, ireland: 0.6, poland: 0.6, greece: 0.5, portugal: 0.5, romania: 0.5,
  // Asia-Pacific
  singapore: 0.7, australia: 0.7, "new-zealand": 0.5, taiwan: 0.7, hk: 0.6,
  malaysia: 0.6, indonesia: 0.6, thailand: 0.6, vietnam: 0.6, philippines: 0.5,
  bangladesh: 0.5, pakistan: 0.5, "sri-lanka": 0.4,
  asia: 0.6, asean: 0.6, pacific: 0.3,
  // Europe non-EU
  nordic: 0.6, switzerland: 0.6, turkey: 0.6, ukraine: 0.4, balkans: 0.4,
  // Americas
  mexico: 0.6, brazil: 0.6, argentina: 0.5, chile: 0.5, colombia: 0.5, peru: 0.5,
  latam: 0.5, caribbean: 0.4, "central-america": 0.4,
  // Middle East
  uae: 0.6, saudi: 0.6, qatar: 0.5, kuwait: 0.5, bahrain: 0.5, oman: 0.5,
  gcc: 0.6, israel: 0.5, jordan: 0.4, iraq: 0.4, iran: 0.4, meaf: 0.5,
  // Africa
  egypt: 0.5, morocco: 0.5, tunisia: 0.4, algeria: 0.4, nafrica: 0.4,
  safrica: 0.5, nigeria: 0.5, kenya: 0.5, ethiopia: 0.4, ghana: 0.4, tanzania: 0.4,
  wafrica: 0.4, eafrica: 0.4, cafrica: 0.3, "safrica-region": 0.4,
  // Russia & CIS
  russia: 0.5, cis: 0.3, kazakhstan: 0.4,
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
