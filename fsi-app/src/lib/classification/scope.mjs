// scope.mjs — Axis 4 (scope: topics / modes / verticals) classifiers.
// docs/plans/source-classification-framework-2026-05-10.md, "Axis 4: Scope" — the only MUTABLE axis
// (re-evaluated as a source's content evolves), three sub-fields, each multi-valued, closed vocabulary
// (src/lib/classification/vocab.mjs). Deterministic name/role keyword matching only — no content fetch,
// no LLM. Every function documents the rule it encodes so a reviewer can trace a proposal back to the
// framework text; low-confidence or undeterminable results are returned honestly (never guessed) for
// the calling script to surface as a proposal, not a write.

import { LEG_MODE_CODES } from "../contracts/vocabularies.mjs";
import { SCOPE_TOPICS, SCOPE_VERTICALS } from "./vocab.mjs";

function matchAny(text, patterns) {
  return patterns.some((re) => re.test(text));
}

// ─────────────────────────── 4b. Modes ───────────────────────────
// Framework: "Valid values: air, road, ocean, rail, all, none." / "'all' for sources that cover
// multiple modes regularly (IEA, IMO and ICAO when both relevant)" / "'none' for sources that don't
// address transport (sustainability reporting standards bodies, financial regulators, conservation
// bodies)".

const MODE_KEYWORDS = Object.freeze({
  air: [/\bair\s*(cargo|freight)\b/i, /\baviation\b/i, /\bairline/i, /\bicao\b/i],
  ocean: [/\bocean\b/i, /\bmaritime\b/i, /\bshipping\b/i, /\bvessel/i, /\bport\b/i, /\bimo\b/i, /\bbunkering\b/i],
  road: [/\broad\s*(freight|transport)\b/i, /\btrucking\b/i, /\bhaulage\b/i, /\bhgv\b/i, /\bhighway\b/i],
  rail: [/\brail\s*(freight|transport)?\b/i, /\brailway/i, /\btrain\b/i],
});

// Roles the framework's own worked examples name as "does not address transport" — sustainability
// standards/reporting bodies, financial regulators, conservation bodies. Restricted to roles that are
// UNAMBIGUOUSLY non-modal by the framework's own text; anything else falls through to null (undeterminable)
// rather than guessing "none".
const NO_TRANSPORT_BY_DEFAULT_ROLES = new Set(["standards_body", "statistical_data_agency"]);

/**
 * Axis 4b: classify a source's transport-mode scope from its name (+ role prior). Pure.
 * @param {{ name?: string|null, sourceRole?: string|null }} source
 * @returns {{ value: string[], confidence: "high"|"medium", basis: string } | null}
 */
export function classifyScopeModes({ name, sourceRole } = {}) {
  const n = String(name || "");
  const matched = LEG_MODE_CODES.filter((mode) => matchAny(n, MODE_KEYWORDS[mode] || []));
  if (matched.length > 0) {
    return {
      value: matched,
      confidence: matched.length === 1 ? "high" : "medium",
      basis: `name matches mode keyword(s) for ${matched.join(", ")}`,
    };
  }
  if (sourceRole === "intergovernmental_body" && /\btransport|freight|logistics\b/i.test(n)) {
    return { value: ["all"], confidence: "medium", basis: "intergovernmental body with general transport/freight/logistics remit (framework IEA/IMO/ICAO example)" };
  }
  if (sourceRole && NO_TRANSPORT_BY_DEFAULT_ROLES.has(sourceRole)) {
    return { value: ["none"], confidence: "medium", basis: `role=${sourceRole} does not address transport by the framework's own definition (Axis 4b)` };
  }
  return null; // undeterminable from name/role alone — flag for operator assignment, never guessed
}

// ─────────────────────────── 4c. Verticals ───────────────────────────
// Framework: "Most general sources: freight_general ... or all ... Vertical-specific sources are rare
// and high-value: GCC for fine_art, A Greener Future for live_events, albert for film_tv, UNHRD for
// humanitarian ... 'none' for sources that don't address any commercial vertical."

const VERTICAL_KEYWORDS = Object.freeze({
  fine_art: [/\bfine\s*art\b/i, /\bgallery\b/i, /\bmuseum\b/i, /\bart\s*handl/i, /\bicom\b/i, /\bgallery climate coalition\b/i, /\bantiques?\b/i, /\bheritage conservation\b/i],
  live_events: [/\blive\s*events?\b/i, /\ba greener future\b/i, /\btouring\b/i, /\bfestival\b/i, /\bconcert\s*production\b/i, /\bexhibition\s*production\b/i],
  luxury: [/\bluxury\b/i, /\bhaute\s*couture\b/i, /\bfashion\s*house\b/i],
  film_tv: [/\bfilm\b/i, /\btelevision\b/i, /\balbert\b/i, /\bbafta\b/i, /\bbroadcast(er)?\b/i, /\bstreaming\s*production\b/i],
  automotive: [/\bautomotive\b/i, /\bvehicle\s*manufactur/i, /\boem\b/i],
  humanitarian: [/\bhumanitarian\b/i, /\bunhrd\b/i, /\bdisaster\s*relief\b/i, /\brefugee\s*logistics\b/i],
});

const CROSS_VERTICAL_ROLES = new Set(["standards_body", "intergovernmental_body"]);
const FREIGHT_GENERAL_ROLES = new Set(["primary_legal_authority", "trade_press", "industry_association", "industry_data_provider", "vendor_corporate", "statistical_data_agency", "government_press"]);

/**
 * Axis 4c: classify a source's Caro's Ledge vertical coverage from name (+ role prior). Pure.
 * @param {{ name?: string|null, sourceRole?: string|null }} source
 * @returns {{ value: string[], confidence: "high"|"medium", basis: string } | null}
 */
export function classifyScopeVerticals({ name, sourceRole } = {}) {
  const n = String(name || "");
  const matched = SCOPE_VERTICALS.filter((v) => VERTICAL_KEYWORDS[v] && matchAny(n, VERTICAL_KEYWORDS[v]));
  if (matched.length > 0) {
    return { value: matched, confidence: "high", basis: `name matches vertical keyword(s) for ${matched.join(", ")}` };
  }
  if (sourceRole && CROSS_VERTICAL_ROLES.has(sourceRole)) {
    return { value: ["all"], confidence: "medium", basis: `role=${sourceRole} — sustainability standards/frameworks apply across verticals (framework Axis 4c default)` };
  }
  if (sourceRole && FREIGHT_GENERAL_ROLES.has(sourceRole)) {
    return { value: ["freight_general"], confidence: "medium", basis: `role=${sourceRole} — general freight coverage without vertical specificity (framework Axis 4c default)` };
  }
  return null; // undeterminable — flag for operator assignment, never guessed
}

// ─────────────────────────── 4a. Topics ───────────────────────────
// Framework: "Rule per topic: assigned only if the source provides regular and material coverage."
// Keyword matching only proposes a topic on a real name-level signal; role-based defaults add
// "regulatory" for the two roles whose entire institutional function is regulatory (framework Axis 1
// 1.1/1.10), never invented for other roles.

const TOPIC_KEYWORDS = Object.freeze({
  regulatory: [/\bregulat/i, /\blegislat/i, /\bdirective\b/i, /\bstatute\b/i],
  finance: [/\bfinance\b/i, /\bfinancial\b/i, /\binvestor/i, /\bcapital markets\b/i],
  technology: [/\btechnolog/i, /\binnovation\b/i, /\bdigital\b/i],
  fuel: [/\bfuel\b/i, /\bbunker/i, /\bhydrogen\b/i, /\bsaf\b/i, /\belectrofuel/i],
  labor: [/\blabor\b/i, /\blabour\b/i, /\bworkforce\b/i, /\bemployment\b/i],
  infrastructure: [/\binfrastructure\b/i, /\bport(s)?\s*authority\b/i, /\bcharging\s*infrastructure\b/i],
  environmental: [/\benvironment/i, /\bclimate\b/i, /\becolog/i, /\bemissions?\b/i],
  social: [/\bsocial\b/i, /\bhuman\s*rights\b/i, /\blabou?r\s*rights\b/i],
  governance: [/\bgovernance\b/i, /\bcorporate\s*governance\b/i],
  transport: [/\btransport/i, /\bfreight\b/i, /\blogistics\b/i, /\bshipping\b/i],
  packaging: [/\bpackaging\b/i],
  customs: [/\bcustoms\b/i, /\btariff/i, /\btrade\s*compliance\b/i],
  conservation: [/\bconservation\b/i, /\bheritage\b/i],
  materials_science: [/\bmaterials?\s*science\b/i, /\bmaterials?\s*research\b/i],
});

const REGULATORY_TOPIC_ROLES = new Set(["primary_legal_authority", "government_press"]);

/**
 * Axis 4a: classify a source's topic scope from its name (+ role prior). Pure. Regular/material
 * coverage cannot itself be judged from a name string — every keyword match is returned "medium"
 * confidence by design, deferring the "regular and material" judgment to the operator reviewing the
 * proposal, never asserted as fact.
 * @param {{ name?: string|null, sourceRole?: string|null }} source
 * @returns {{ value: string[], confidence: "medium", basis: string } | null}
 */
export function classifyScopeTopics({ name, sourceRole } = {}) {
  const n = String(name || "");
  const matched = new Set(SCOPE_TOPICS.filter((t) => TOPIC_KEYWORDS[t] && matchAny(n, TOPIC_KEYWORDS[t])));
  if (sourceRole && REGULATORY_TOPIC_ROLES.has(sourceRole)) matched.add("regulatory");
  if (matched.size === 0) return null; // undeterminable — flag for operator assignment, never guessed
  return {
    value: [...matched],
    confidence: "medium",
    basis: `name/role keyword match; "regular and material coverage" per framework Axis 4a needs operator confirmation`,
  };
}
