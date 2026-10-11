/** @type {Record<string, string>} closed compliance object vocabulary, lower-case key. */

export const COMPLIANCE_OBJECT_LABELS = Object.freeze({
  "carrier-ocean": "ocean carrier",
  "carrier-air": "air carrier",
  "carrier-road": "road carrier",
  "carrier-rail": "rail carrier",
  "vessel-operator": "vessel operator",
  "aircraft-operator": "aircraft operator",
  "road-fleet-operator": "road fleet operator",
  "freight-forwarder": "freight forwarder",
  "customs-broker": "customs broker",
  nvocc: "NVOCC",
  shipper: "shipper",
  importer: "importer",
  exporter: "exporter",
  "manufacturer-producer": "manufacturer or producer",
  distributor: "distributor",
  "port-operator": "port operator",
  "airport-operator": "airport operator",
  "terminal-operator": "terminal operator",
  "warehouse-operator": "warehouse operator",
});

/** @type {Record<string, string>} core scenario glossary (system-prompt.ts), lower-case key. */
export const SCENARIO_LABELS = Object.freeze({
  "ocean-bunkering": "ocean bunkering",
  "ocean-fuel-blend-mandate": "ocean fuel blend mandates",
  "ocean-emissions-mrv": "ocean emissions monitoring and reporting (MRV)",
  "vessel-port-call": "vessel port calls",
  "vessel-shore-power": "vessel shore power",
  "vessel-cii-rating": "vessel carbon intensity (CII) rating",
  "green-shipping-corridor": "green shipping corridors",
  "air-fueling": "aircraft fuelling",
  "saf-blending": "sustainable aviation fuel (SAF) blending",
  "aircraft-emissions-corsia": "aircraft emissions under CORSIA",
  "aircraft-emissions-ets": "aircraft emissions under emissions trading (ETS)",
  "airport-shore-power": "airport ground power",
  "road-cabotage": "road cabotage",
  drayage: "drayage",
  "urban-truck-zone": "urban truck zones",
  "truck-co2-standard": "truck CO2 standards",
  "road-charging-infrastructure": "road charging infrastructure",
  "cbam-declaration": "CBAM declarations",
  "eudr-due-diligence": "EUDR due diligence",
  "ets-allowance-purchase": "ETS allowance purchase",
  "ets-allowance-surrender": "ETS allowance surrender",
  "carbon-pricing-pass-through": "carbon pricing passed on to customers",
  "carbon-border-adjustment": "carbon border adjustment",
  "emissions-reporting-scope1": "Scope 1 emissions reporting",
  "emissions-reporting-scope3": "Scope 3 emissions reporting",
  "sustainability-report-csrd": "CSRD sustainability reporting",
  "disclosure-issb": "ISSB disclosure",
  "supplier-data-request": "supplier data requests",
  "packaging-epr-registration": "packaging EPR registration",
  "packaging-recyclability-design": "packaging recyclability design",
  "packaging-pfas-restriction": "packaging PFAS restriction",
  "product-due-diligence-csddd": "CSDDD product due diligence",
  // Retired from the prompt glossary by ADR-020 Amendment 1 but still present on stored rows and in the skill.
  "customs-declaration-import": "import customs declarations",
  "customs-declaration-export": "export customs declarations",
  "dangerous-goods-classification": "dangerous goods classification",
});

const ACRONYMS = new Set([
  "eu", "uk", "us", "ets", "imo", "cii", "eexi", "ghg", "co2", "saf", "mrv", "cbam", "eudr", "csrd", "csddd",
  "issb", "epr", "pfas", "lng", "corsia", "iata", "icao", "mepc", "nvocc", "mrv", "ets2",
]);

const key = (s) => String(s).trim().toLowerCase();

function humanise(slug) {
  return key(slug)
    .split("-")
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w))
    .join(" ");
}

/** @param {unknown} slug @returns {string} "" for empty or non-string input. */
export function labelForScenario(slug) {
  if (typeof slug !== "string" || !slug.trim()) return "";
  return SCENARIO_LABELS[key(slug)] ?? humanise(slug);
}

/** @param {unknown} slug @returns {string} */
export function labelForComplianceObject(slug) {
  if (typeof slug !== "string" || !slug.trim()) return "";
  return COMPLIANCE_OBJECT_LABELS[key(slug)] ?? humanise(slug);
}

/** @param {"scenario"|"object"} kind @param {unknown} slug */
export function labelForTag(kind, slug) {
  return kind === "object" ? labelForComplianceObject(slug) : labelForScenario(slug);
}

/** "a", "a and b", "a, b and c". @param {string[]} labels */
export function joinLabels(labels) {
  const l = (Array.isArray(labels) ? labels : []).filter((x) => typeof x === "string" && x);
  if (l.length <= 1) return l.join("");
  return `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`;
}
