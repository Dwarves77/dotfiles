import type { Resource, ImpactScores } from "@/types/resource";
import { JURISDICTION_WEIGHTS, ALL_SECTORS } from "./constants";

// ── Jurisdiction Detection ──
// Detects jurisdiction from resource content via keyword matching
export function getJurisdiction(r: Resource): string {
  const t = `${r.title} ${r.note} ${(r.tags || []).join(" ")} ${r.sub || ""}`.toLowerCase();

  if (t.match(/\beu\b|european|fit for 55|fueleu|cbam|csrd|ppwr|ics2|eudr|taxonomy|euro 7|afir|corsia.*eu/)) return "eu";
  if (t.match(/\bus\b|epa|carb|california|dot |nrel|smartway|port of la/)) return "us";
  if (t.match(/\buk\b|british|dft/)) return "uk";
  if (t.match(/\bcanad/)) return "canada";
  if (t.match(/\bjapan|mlit\b/)) return "japan";
  if (t.match(/\bkorea|south korea/)) return "korea";
  if (t.match(/\bindia\b/)) return "india";
  if (t.match(/\bchina\b|chinese/)) return "china";
  if (t.match(/\bsingapore|mpa\b/)) return "singapore";
  if (t.match(/\basean|southeast asia/)) return "asean";
  if (t.match(/\baustrali|new zealand/)) return "australia";
  if (t.match(/\bnordic|scandinav|sweden|norway|denmark|finland/)) return "nordic";
  if (t.match(/\bswitz|swiss/)) return "switzerland";
  if (t.match(/\bturk/)) return "turkey";
  if (t.match(/\bbrazil/)) return "brazil";
  if (t.match(/mexico|colombia|latin|eclac|chile|argentin/)) return "latam";
  if (t.match(/\buae|dubai|abu dhabi/)) return "uae";
  if (t.match(/gcc|saudi|bahrain|qatar|kuwait|oman/)) return "gcc";
  if (t.match(/south africa|safrica/)) return "safrica";
  if (t.match(/nigeria|ghana|west africa/)) return "wafrica";
  if (t.match(/kenya|tanzania|east africa/)) return "eafrica";
  if (t.match(/egypt|morocco|tunisia|north africa/)) return "nafrica";
  if (t.match(/caribbean|jamaica|trinidad/)) return "caribbean";
  if (t.match(/pacific island|fiji|papua/)) return "pacific";
  if (t.match(/imo\b/)) return "imo";
  if (t.match(/icao\b/)) return "icao";
  if (t.match(/wto|unctad|iso |ghg protocol|ipcc|global|world bank|un sdg/)) return "global";
  return "global";
}

// ── Impact Score per Dimension (0–3) ──
export function scoreResource(r: Resource): ImpactScores {
  const tStr = (r.tags || []).join(" ").toLowerCase();
  const isReg = ["regulation", "standard", "legal", "rule", "certification"].includes(r.type);
  const pri = { CRITICAL: 3, HIGH: 2, MODERATE: 1, LOW: 0 }[r.priority] || 1;

  // Cost: directly changes freight pricing
  let cost = 0;
  if (tStr.match(/ets|surcharge|penalty|fuel cost|carbon tax|carbon border|cbam|saf|pricing/)) cost = 3;
  else if (tStr.match(/carbon|cost|fee|allowance|pricing|finance/)) cost = 2;
  else if (r.cat === "cbam") cost = 2;
  else if (pri >= 2 && (r.cat === "ocean" || r.cat === "air")) cost = 1;

  // Compliance: mandatory legal obligation
  let compliance = 0;
  if (isReg && pri >= 2) compliance = 3;
  else if (isReg) compliance = 2;
  else if (r.type === "standard" || r.type === "certification") compliance = 2;
  else if (tStr.match(/mandatory|reporting|regulation|directive|mandate/)) compliance = 2;
  else if (r.cat === "compliance") compliance = Math.min(pri, 2);

  // Client: clients will ask about this
  let client = 0;
  if (tStr.match(/scope 3|cdp|ecovadis|reporting|disclosure|rfq|rfp|tender|csrd|issb|glec|iso 14083/)) client = 3;
  else if (r.cat === "compliance") client = 2;
  else if (tStr.match(/rating|target|sbti|ghg protocol|data request/)) client = 2;
  else if (pri >= 2 && isReg) client = 1;

  // Operational: affects routing, fleet, packaging, documentation
  let operational = 0;
  if (tStr.match(/drayage|port|routing|packaging|customs|carb|zev|fleet|infrastructure|dwell/)) operational = 3;
  else if (tStr.match(/truck|vessel|corridor|bunkering|charging|shore power/)) operational = 2;
  else if (r.cat === "land" || r.cat === "global") operational = Math.min(pri, 2);
  else if (isReg) operational = 1;

  return {
    cost: Math.min(cost, 3),
    compliance: Math.min(compliance, 3),
    client: Math.min(client, 3),
    operational: Math.min(operational, 3),
  };
}

// ── Urgency Score (composite) ──
// Accepts optional workspace jurisdiction weights. If not provided, uses platform defaults.
export function urgencyScore(
  r: Resource,
  workspaceWeights?: Record<string, number> | null
): number {
  const sc = scoreResource(r);
  const total = sc.cost + sc.compliance + sc.client + sc.operational;
  const priW = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 }[r.priority] || 1;

  const weights = workspaceWeights || JURISDICTION_WEIGHTS;
  const jur = r.jurisdiction || getJurisdiction(r);
  const jurW = (weights[jur] || 0.5) / 1.0;

  // Time weight: days to next future milestone
  let timeW = 1;
  if (r.timeline?.length) {
    const now = new Date();
    const future = r.timeline
      .map((m) => new Date(m.date))
      .filter((d) => d > now)
      .sort((a, b) => a.getTime() - b.getTime());
    if (future.length) {
      const days = Math.max(1, Math.floor((future[0].getTime() - now.getTime()) / 864e5));
      timeW = Math.min(5, 365 / days);
    }
  }

  return Math.round(total * priW * timeW * (0.5 + jurW * 0.5) * 10) / 10;
}

// ── Sort Helpers ──
const PRI_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };

export function sortResources(
  resources: Resource[],
  key: "urgency" | "priority" | "alpha" | "added" | "modified"
): Resource[] {
  const sorted = [...resources];
  switch (key) {
    case "urgency":
      return sorted.sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0));
    case "priority":
      return sorted.sort((a, b) => (PRI_ORDER[a.priority] ?? 9) - (PRI_ORDER[b.priority] ?? 9));
    case "alpha":
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case "added":
      return sorted.sort((a, b) => b.added.localeCompare(a.added));
    case "modified":
      return sorted.sort((a, b) => b.added.localeCompare(a.added));
    default:
      return sorted;
  }
}

// ── Filter Helpers ──
export function filterResources(
  resources: Resource[],
  filters: {
    modes: string[];
    topics: string[];
    jurisdictions: string[];
    priorities: string[];
    verticals: string[];
    confidence: string[];
    search: string;
  }
): Resource[] {
  return resources.filter((r) => {
    // Mode filter
    if (filters.modes.length > 0) {
      const resourceModes = r.modes || [r.cat];
      if (!filters.modes.some((m) => resourceModes.includes(m))) return false;
    }

    // Topic filter
    if (filters.topics.length > 0) {
      const resourceTopic = r.topic || r.sub;
      if (!filters.topics.includes(resourceTopic)) return false;
    }

    // Jurisdiction filter
    if (filters.jurisdictions.length > 0) {
      const resourceJur = r.jurisdiction || getJurisdiction(r);
      if (!filters.jurisdictions.includes(resourceJur)) return false;
    }

    // Priority filter
    if (filters.priorities.length > 0) {
      if (!filters.priorities.includes(r.priority)) return false;
    }

    // Cargo vertical filter
    if (filters.verticals.length > 0) {
      const text = `${r.title} ${r.note} ${(r.tags || []).join(" ")} ${r.whatIsIt || ""} ${r.whyMatters || ""}`.toLowerCase();
      const matchesVertical = filters.verticals.some((vId) => {
        const vertical = ALL_SECTORS.find((v) => v.id === vId);
        return vertical?.keywords.some((kw) => text.includes(kw));
      });
      if (!matchesVertical) return false;
    }

    // Search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const searchable = `${r.title} ${r.note} ${(r.tags || []).join(" ")} ${r.whatIsIt || ""} ${r.whyMatters || ""}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }

    return true;
  });
}
