/**
 * Impact scoring constants and scoring functions.
 * Extracted from freight_sustainability_dashboard.jsx (lines ~202-268)
 */

// ── Dimension metadata ──

export type ImpactDimension = "cost" | "compliance" | "client" | "operational";

export const IMPACT_DIMS: Record<ImpactDimension, string> = {
  cost: "\u{1F4B0}",
  compliance: "\u2696\uFE0F",
  client: "\u{1F91D}",
  operational: "\u{1F527}",
};

export const DIM_LABELS: Record<ImpactDimension, string> = {
  cost: "Cost Impact",
  compliance: "Compliance Obligation",
  client: "Client-Facing",
  operational: "Operational",
};

export const DIM_COLORS: Record<ImpactDimension, string> = {
  cost: "#FFD60A",
  compliance: "#E040FB",
  client: "#00C7BE",
  operational: "#64D2FF",
};

// ── Status definitions ──

export interface StatusDef {
  l: string;
  c: string;
  i: string;
}

export const STATUS_DEF: Record<string, StatusDef> = {
  action: { l: "Action Required", c: "#FF3B30", i: "\u{1F534}" },
  tracking: { l: "Tracking", c: "#FF9500", i: "\u{1F7E1}" },
  compliant: { l: "Compliant", c: "#10b981", i: "\u{1F7E2}" },
  parked: { l: "Parked", c: "#64748b", i: "\u26AA" },
};

// ── Jurisdiction weighting ──

export type Jurisdiction =
  | "EU"
  | "US"
  | "UK"
  | "Global"
  | "Asia"
  | "LatAm"
  | "National";

export const JURISDICTIONS: Record<Jurisdiction, number> = {
  EU: 3,
  US: 2,
  UK: 2,
  Global: 3,
  Asia: 1,
  LatAm: 1,
  National: 1,
};

// ── Minimal resource shape needed by scoring functions ──

export interface ScoringResource {
  title: string;
  note: string;
  tags?: string[];
  sub?: string;
  priority: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  type: string;
  cat: string;
  timeline?: { date: string }[];
}

export interface DimensionScores {
  cost: number;
  compliance: number;
  client: number;
  operational: number;
}

// ── Jurisdiction detection ──

export const getJurisdiction = (r: ScoringResource): Jurisdiction => {
  const t =
    `${r.title} ${r.note} ${(r.tags || []).join(" ")} ${r.sub || ""}`.toLowerCase();
  if (
    t.match(
      /\beu\b|european|fit for 55|fueleu|cbam|csrd|ppwr|ics2|eudr|taxonomy|euro 7|afir|corsia.*eu/,
    )
  )
    return "EU";
  if (
    t.match(
      /\bus\b|epa|carb|california|dot |nrel|smartway|port of la/,
    )
  )
    return "US";
  if (t.match(/\buk\b|british|dft/)) return "UK";
  if (
    t.match(
      /imo|icao|wto|unctad|iso |ghg protocol|ipcc|global|world bank|un sdg/,
    )
  )
    return "Global";
  if (t.match(/japan|korea|singapore|china|asean|india|asia/))
    return "Asia";
  if (t.match(/brazil|mexico|colombia|latin|eclac/)) return "LatAm";
  return "National";
};

// ── Score 0-3 per dimension based on resource attributes ──

export const scoreResource = (r: ScoringResource): DimensionScores => {
  const pri =
    ({ CRITICAL: 3, HIGH: 2, MODERATE: 1, LOW: 0 } as Record<string, number>)[
      r.priority
    ] || 1;
  const tStr = (r.tags || []).join(" ").toLowerCase();
  const isReg = ["regulation", "standard", "legal", "rule", "certification"].includes(
    r.type,
  );
  const isData = [
    "tool",
    "data",
    "tracker",
    "news",
    "blog",
    "journal",
    "academic",
  ].includes(r.type);

  // Cost: directly changes freight pricing
  let cost = 0;
  if (
    tStr.match(
      /ets|surcharge|penalty|fuel cost|carbon tax|carbon border|cbam|saf|pricing/,
    )
  )
    cost = 3;
  else if (tStr.match(/carbon|cost|fee|allowance|pricing|finance/)) cost = 2;
  else if (r.cat === "cbam") cost = 2;
  else if (pri >= 2 && (r.cat === "ocean" || r.cat === "air")) cost = 1;

  // Compliance: mandatory legal obligation
  let compliance = 0;
  if (isReg && pri >= 2) compliance = 3;
  else if (isReg) compliance = 2;
  else if (r.type === "standard" || r.type === "certification") compliance = 2;
  else if (tStr.match(/mandatory|reporting|regulation|directive|mandate/))
    compliance = 2;
  else if (r.cat === "compliance") compliance = Math.min(pri, 2);

  // Client: clients will ask about this
  let client = 0;
  if (
    tStr.match(
      /scope 3|cdp|ecovadis|reporting|disclosure|rfq|rfp|tender|csrd|issb|glec|iso 14083/,
    )
  )
    client = 3;
  else if (r.cat === "compliance") client = 2;
  else if (tStr.match(/rating|target|sbti|ghg protocol|data request/))
    client = 2;
  else if (pri >= 2 && isReg) client = 1;

  // Operational: affects routing, fleet, packaging, documentation
  let operational = 0;
  if (
    tStr.match(
      /drayage|port|routing|packaging|customs|carb|zev|fleet|infrastructure|dwell/,
    )
  )
    operational = 3;
  else if (
    tStr.match(/truck|vessel|corridor|bunkering|charging|shore power/)
  )
    operational = 2;
  else if (r.cat === "land" || r.cat === "global")
    operational = Math.min(pri, 2);
  else if (isReg) operational = 1;

  return {
    cost: Math.min(cost, 3),
    compliance: Math.min(compliance, 3),
    client: Math.min(client, 3),
    operational: Math.min(operational, 3),
  };
};

// ── Urgency score — composite of dimensions, priority, jurisdiction, time ──

export const urgencyScore = (r: ScoringResource): number => {
  const sc = scoreResource(r);
  const total = sc.cost + sc.compliance + sc.client + sc.operational;
  const priW =
    ({ CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 } as Record<string, number>)[
      r.priority
    ] || 1;
  const jurW = (JURISDICTIONS[getJurisdiction(r)] || 1) / 3; // normalize 0.33-1.0

  // Time weight: days to next future milestone
  let timeW = 1;
  if (r.timeline?.length) {
    const now = new Date();
    const future = r.timeline
      .map((m) => new Date(m.date))
      .filter((d) => d > now)
      .sort((a, b) => a.getTime() - b.getTime());
    if (future.length) {
      const days = Math.max(
        1,
        Math.floor((future[0].getTime() - now.getTime()) / 864e5),
      );
      timeW = Math.min(5, 365 / days);
    }
  }
  return Math.round(total * priW * timeW * (0.5 + jurW * 0.5) * 10) / 10;
};
