// The six shared vocabularies. ONE definition, every surface.
//
// WHY THIS FILE EXISTS (surface spec 00 §3, 2026-08-12). Professional multi-module intelligence
// products use ONE vocabulary across modules; modules differ only in which values they emit. Per-module
// vocabularies are the single most common cause of a five-module product feeling like five products —
// and this repo already had the diagnosis: the 2026-08-11 cross-surface re-verification found counts and
// rows classified by two different populations on every surface, ~17 UI fields bound to producers that
// do not exist, and a severity vocabulary on Operations derived from regulations. Those are all one
// disease: a value's meaning was decided at the render site instead of once, centrally.
//
// SIBLING, NOT A DUPLICATE: src/lib/surface-of.mjs answers "which surface owns this item". This module
// answers "what does this value MEAN, on every surface". Same architectural role (single home, two
// consumers, drift-guarded), different question. surface-of.mjs is the precedent this file follows
// deliberately, down to the plain-ESM constraint.
//
// PLAIN ESM, ZERO DEPENDENCIES. Imported by `node --test` proofs with no tsc and no bundler, and by
// client components. Do not add imports of .ts modules here.
//
// ADOPT, DO NOT INVENT. Four of the six are lifted from published standards rather than designed:
//   - obs_status  → SDMX CL_OBS_STATUS (the UN/Eurostat/ECB/IMF statistical standard)
//   - confidence  → NATO/Admiralty 6x6 for asserted claims; ecoinvent/Weidema pedigree for modelled values
//   - relation    → a closed set modelled on W3C PROV qualified relations
//   - freshness   → derived from the as-of triple, not asserted
// Inventing a bespoke scale here would cost us the one thing these buy: the customer's LCA, assurance
// and procurement people already speak them.

/** Freeze an object and every own object value, one level deep. */
function deepFreeze(obj) {
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") Object.freeze(v);
  }
  return Object.freeze(obj);
}

// ─────────────────────────── 1. obs_status (SDMX CL_OBS_STATUS) ───────────────────────────
//
// Availability of the observation. SDMX deliberately keeps this SEPARATE from confidentiality and from
// comparability, because they are three orthogonal facts; collapsing them into one "data quality" badge
// destroys information. We keep that separation: this enum answers ONLY "does the value exist, and in
// what state".
//
// Codes are SDMX's own letters so a Eurostat/ECB/ILOSTAT payload maps straight through without a
// translation table — which matters because most of the free datasets in surface specs 02 and 04 ship
// SDMX-coded observations natively.

export const OBS_STATUS = deepFreeze({
  A: { code: "A", label: "Normal", order: 1, isPresent: true, isReliable: true },
  P: { code: "P", label: "Provisional", order: 2, isPresent: true, isReliable: true },
  E: { code: "E", label: "Estimated", order: 3, isPresent: true, isReliable: true },
  I: { code: "I", label: "Imputed", order: 4, isPresent: true, isReliable: false },
  F: { code: "F", label: "Forecast", order: 5, isPresent: true, isReliable: false },
  B: { code: "B", label: "Series break", order: 6, isPresent: true, isReliable: true },
  D: { code: "D", label: "Definition differs", order: 7, isPresent: true, isReliable: false },
  U: { code: "U", label: "Low reliability", order: 8, isPresent: true, isReliable: false },
  V: { code: "V", label: "Unvalidated", order: 9, isPresent: true, isReliable: false },
  G: { code: "G", label: "Experimental", order: 10, isPresent: true, isReliable: false },
  // The missing family. Distinguishing WHY a value is absent is the whole point of the six empty
  // states in spec 00 §4 — "not applicable" and "not yet published" are different products of thought
  // and must never render identically.
  M: { code: "M", label: "Missing, reason unknown", order: 11, isPresent: false, isReliable: false },
  O: { code: "O", label: "Missing, not applicable", order: 12, isPresent: false, isReliable: false },
  L: { code: "L", label: "Missing, not covered", order: 13, isPresent: false, isReliable: false },
  H: { code: "H", label: "Missing, not published yet", order: 14, isPresent: false, isReliable: false },
  Q: { code: "Q", label: "Missing, suppressed", order: 15, isPresent: false, isReliable: false },
  N: { code: "N", label: "Not significant", order: 16, isPresent: false, isReliable: false },
});

/** True when the code denotes an absent observation. A missing value is NEVER zero-filled. */
export function isMissing(obsStatus) {
  const e = OBS_STATUS[obsStatus];
  return e ? !e.isPresent : true;
}

// ─────────────────────────── 2. origin_class ───────────────────────────
//
// WHERE THE CONTENT CAME FROM, and the vocabulary that protects every other one. Spec 00 §3.6.
//
// THREE HARD RULES, all mechanised below or in the acceptance gate:
//   (a) non-suppressible in every view, including exports, PDFs and Assistant output;
//   (b) PROPAGATES TO THE WEAKEST CONSTITUENT in any aggregate (weakestOriginClass);
//   (c) survives export as a column, not merely as screen decoration.
//
// UNFIXABLE RETROACTIVELY, which is why this ships before any content growth: content ingested without
// a provenance class cannot be reliably reclassified later, and the moment a community or modelled
// value reaches an Operations figure unlabelled, the product has laundered an estimate into a fact.
//
// `strength` orders the lattice. LOWER IS WEAKER. Ordering is by how much a reader may rely on it, not
// by how much work it took us.

export const ORIGIN_CLASS = deepFreeze({
  community: {
    code: "community", label: "Contributed by a member", strength: 1,
    exportable: true, citableAsFact: false, admissibleInCalculation: false,
    note: "Unverified. Never enters a calculation, an export figure, or an Assistant factual citation.",
  },
  "community-corroborated": {
    code: "community-corroborated", label: "Corroborated by members", strength: 2,
    exportable: true, citableAsFact: false, admissibleInCalculation: false,
    note: "N independent organisations agree. Still unverified. May render as a signal with the distribution shown, never as a point estimate.",
  },
  modelled: {
    code: "modelled", label: "Modelled estimate", strength: 3,
    exportable: true, citableAsFact: false, admissibleInCalculation: true,
    note: "Our estimate where inputs are absent. Must never share a visual slot with a statutory or observed figure.",
  },
  derived: {
    code: "derived", label: "Derived", strength: 4,
    exportable: true, citableAsFact: true, admissibleInCalculation: true,
    note: "Our calculation from stated inputs under a named, versioned method.",
  },
  partner: {
    code: "partner", label: "Licensed source", strength: 5,
    exportable: true, citableAsFact: true, admissibleInCalculation: true,
    note: "Licensed third party. Redistribution limits may apply per source.",
  },
  verified: {
    code: "verified", label: "Verified", strength: 6,
    exportable: true, citableAsFact: true, admissibleInCalculation: true,
    note: "Our editorial, traced to a primary source with a provenance chain.",
  },
  official: {
    code: "official", label: "Official source", strength: 7,
    exportable: true, citableAsFact: true, admissibleInCalculation: true,
    note: "Primary source, unmodified. The strongest class; nothing we do can improve on it.",
  },
});

export const ORIGIN_CLASSES = Object.freeze(Object.keys(ORIGIN_CLASS));

/**
 * Rule (b): an aggregate is only as trustworthy as its weakest input.
 *
 * Total over any iterable of codes, commutative and associative by construction (it is a min over
 * `strength`). Unknown codes collapse to the weakest class rather than being skipped — an
 * unclassified input is strictly worse than a community one, because at least community is honest
 * about what it is. An EMPTY aggregate returns null: there is nothing to label, and returning a
 * default here would invent provenance out of nothing.
 */
export function weakestOriginClass(codes) {
  let weakest = null;
  let sawAny = false;
  for (const c of codes || []) {
    sawAny = true;
    const entry = ORIGIN_CLASS[c];
    if (!entry) return "community"; // unknown input: fail to the weakest, never silently drop
    if (weakest === null || entry.strength < ORIGIN_CLASS[weakest].strength) weakest = entry.code;
  }
  return sawAny ? weakest : null;
}

/** May a value of this class be cited as fact (by the UI, an export, or the Assistant)? */
export function citableAsFact(code) {
  return ORIGIN_CLASS[code]?.citableAsFact === true;
}

/** May a value of this class feed a calculation? Community never can, at any corroboration level. */
export function admissibleInCalculation(code) {
  return ORIGIN_CLASS[code]?.admissibleInCalculation === true;
}

// ─────────────────────────── 3. confidence ───────────────────────────
//
// TWO SCHEMES, because two different kinds of claim need two different questions answered, and one
// merged "confidence" star rating destroys the distinction that matters most.
//
// 3a. ADMIRALTY (NATO) 6x6, for ASSERTED-AND-SOURCED claims: Regulations, Market Intel, Community.
//     Letter = SOURCE reliability. Number = INFORMATION credibility. They are INDEPENDENT: a highly
//     reliable source can carry uncorroborated information (A2), and an unreliable source can carry
//     confirmed information (E1). F and 6 are "cannot be judged", which is NOT the same as "bad" —
//     a brand-new source is F, not E.

export const SOURCE_RELIABILITY = deepFreeze({
  A: { code: "A", label: "Completely reliable", order: 1 },
  B: { code: "B", label: "Usually reliable", order: 2 },
  C: { code: "C", label: "Fairly reliable", order: 3 },
  D: { code: "D", label: "Not usually reliable", order: 4 },
  E: { code: "E", label: "Unreliable", order: 5 },
  F: { code: "F", label: "Reliability cannot be judged", order: 6 },
});

export const INFO_CREDIBILITY = deepFreeze({
  1: { code: "1", label: "Confirmed by independent sources", order: 1 },
  2: { code: "2", label: "Probably true, not confirmed", order: 2 },
  3: { code: "3", label: "Possibly true", order: 3 },
  4: { code: "4", label: "Doubtful", order: 4 },
  5: { code: "5", label: "Improbable", order: 5 },
  6: { code: "6", label: "Credibility cannot be judged", order: 6 },
});

/** Render an Admiralty pair as its canonical two-character code, e.g. "B2". */
export function admiraltyCode(reliability, credibility) {
  if (!SOURCE_RELIABILITY[reliability] || !INFO_CREDIBILITY[String(credibility)]) return null;
  return `${reliability}${credibility}`;
}

// 3b. ECOINVENT / WEIDEMA PEDIGREE, five axes 1..5 (1 best), for MODELLED AND NUMERIC values:
//     Operations cost cells, emission factors, Research quantitative claims. This is the right scheme
//     for numbers because temporal / geographical / technological correlation IS the question a
//     forwarder's assurance provider will ask: "is this EU 2019 road factor valid for my 2026
//     Brazilian lane?" And it is the vocabulary they already speak.

export const PEDIGREE_AXES = Object.freeze([
  "reliability",
  "completeness",
  "temporal_correlation",
  "geographical_correlation",
  "technological_correlation",
]);

/** Validate a pedigree score: all five axes present, each an integer 1..5. */
export function validatePedigree(p) {
  const errors = [];
  if (!p || typeof p !== "object") return ["pedigree must be an object with all five axes"];
  for (const axis of PEDIGREE_AXES) {
    const v = p[axis];
    if (!Number.isInteger(v) || v < 1 || v > 5) errors.push(`${axis} must be an integer 1..5`);
  }
  return errors;
}

// 3c. THE PUBLISHED MAPPING between the two, so ONE chip component can render either. Both schemes are
//     projected onto a shared 5-band ladder. This is a presentation mapping and is deliberately lossy;
//     it never replaces the underlying score, which is always retained and always inspectable.

export const CONFIDENCE_BAND = deepFreeze({
  very_low: { code: "very_low", label: "Very low", order: 1 },
  low: { code: "low", label: "Low", order: 2 },
  medium: { code: "medium", label: "Medium", order: 3 },
  high: { code: "high", label: "High", order: 4 },
  very_high: { code: "very_high", label: "Very high", order: 5 },
});

// Indexed by the WORSE of the two Admiralty axis orders (1 best .. 6 worst), so index 1 is the best
// outcome and index 5+ the worst. Index 0 is unused and null so an off-by-one surfaces as a crash in
// tests rather than as a plausible-looking band. (Written inverted on the first pass; the "A1 must be
// very_high" assertion caught it.)
const BAND_BY_ORDER = [null, "very_high", "high", "medium", "low", "very_low"];

/**
 * Admiralty pair -> band. Uses the WORSE of the two axes, because a confirmed report from an
 * unreliable source and an unconfirmed report from a reliable one are both weak, for different
 * reasons. "Cannot be judged" (F / 6) floors the band at very_low rather than being treated as mid.
 */
export function admiraltyToBand(reliability, credibility) {
  const r = SOURCE_RELIABILITY[reliability];
  const c = INFO_CREDIBILITY[String(credibility)];
  if (!r || !c) return null;
  if (r.code === "F" || c.code === "6") return "very_low";
  const worst = Math.max(r.order, c.order); // 1 best .. 6 worst
  return BAND_BY_ORDER[Math.min(worst, 5)];
}

/**
 * Pedigree -> band. Mean of the five axes (1 best .. 5 worst), then inverted onto the ladder. The mean
 * is defensible here, unlike for source authority, because the five axes are commensurate dimensions
 * of one uncertainty estimate rather than independent voices.
 */
export function pedigreeToBand(p) {
  if (validatePedigree(p).length) return null;
  const mean = PEDIGREE_AXES.reduce((s, a) => s + p[a], 0) / PEDIGREE_AXES.length;
  if (mean <= 1.5) return "very_high";
  if (mean <= 2.5) return "high";
  if (mean <= 3.5) return "medium";
  if (mean <= 4.5) return "low";
  return "very_low";
}

// 3d. LIKELIHOOD is a SEPARATE axis and must never share a sentence with confidence (ICD 203). The
//     ladder is closed and published so that "likely" means the same thing every time.

export const LIKELIHOOD = deepFreeze({
  almost_no_chance: { code: "almost_no_chance", label: "Almost no chance", lo: 1, hi: 5, order: 1 },
  very_unlikely: { code: "very_unlikely", label: "Very unlikely", lo: 5, hi: 20, order: 2 },
  unlikely: { code: "unlikely", label: "Unlikely", lo: 20, hi: 45, order: 3 },
  roughly_even: { code: "roughly_even", label: "Roughly even chance", lo: 45, hi: 55, order: 4 },
  likely: { code: "likely", label: "Likely", lo: 55, hi: 80, order: 5 },
  very_likely: { code: "very_likely", label: "Very likely", lo: 80, hi: 95, order: 6 },
  almost_certainly: { code: "almost_certainly", label: "Almost certainly", lo: 95, hi: 99, order: 7 },
});

/** Map a probability percentage to its ICD-203 band. Returns null outside 1..99 (never say 0 or 100). */
export function likelihoodForProbability(pct) {
  if (typeof pct !== "number" || Number.isNaN(pct) || pct < 1 || pct > 99) return null;
  for (const e of Object.values(LIKELIHOOD)) {
    if (pct >= e.lo && pct <= e.hi) return e.code;
  }
  return null;
}

// ─────────────────────────── 4. impact x applicability ───────────────────────────
//
// TWO SCALES, NEVER MERGED. A jurisdiction-wide instrument can be maximum impact AND not applicable
// simultaneously; a single "severity" scalar hides exactly that, and hiding it is how a compliance
// product cries wolf until it is ignored.

export const IMPACT = deepFreeze({
  none: { code: "none", label: "No impact", order: 0 },
  operational: { code: "operational", label: "Operational", order: 1 },
  cost: { code: "cost", label: "Cost", order: 2 },
  compliance: { code: "compliance", label: "Compliance", order: 3 },
  licence: { code: "licence", label: "Licence to operate", order: 4 },
});

export const APPLICABILITY = deepFreeze({
  confirmed: { code: "confirmed", label: "Confirmed applies", order: 1, isActionable: true },
  likely: { code: "likely", label: "Likely applies", order: 2, isActionable: true },
  monitor: { code: "monitor", label: "Monitor", order: 3, isActionable: false },
  not_applicable: { code: "not_applicable", label: "Not applicable", order: 4, isActionable: false },
  not_assessed: { code: "not_assessed", label: "Not assessed", order: 5, isActionable: false },
});

// `binding_position` — the field spec 01 §1 identifies as the product's core distinction, and the
// reason a generic EHS register is the wrong shape for a freight forwarder. Almost nothing in the
// freight sustainability landscape binds a forwarder directly; conflating a duty, a price and a
// customer data-request over-alarms and under-serves.

export const BINDING_POSITION = deepFreeze({
  direct_duty: {
    code: "direct_duty", label: "Your duty", order: 1,
    note: "Statutory duty falls on the forwarder itself.",
  },
  carrier_passthrough: {
    code: "carrier_passthrough", label: "Carrier pass-through", order: 2,
    note: "Binds the carrier. Reaches you as a price, not a duty.",
  },
  customer_contract: {
    code: "customer_contract", label: "Customer contract", order: 3,
    note: "Binds your customer. Reaches you as a data request or a contract clause.",
  },
  monitoring_only: {
    code: "monitoring_only", label: "Monitor", order: 4,
    note: "Does not currently reach you. Tracked because status may change.",
  },
});

// ─────────────────────────── 5. freshness ───────────────────────────
//
// DERIVED, NEVER ASSERTED. Computed in envelope.mjs from the as-of triple plus expected_refresh. The
// enum lives here so one chip component renders it everywhere.
//
// `frozen` is the state everyone forgets and the one that matters most: the source STOPPED PUBLISHING.
// That is categorically different from "late", and rendering them the same is how a dead feed keeps
// looking alive. Operations' own `regional_data_facts` producer is frozen today, which is precisely
// the case this state exists to make visible.

export const FRESHNESS = deepFreeze({
  current: { code: "current", label: "Current", order: 1, degraded: false },
  ageing: { code: "ageing", label: "Ageing", order: 2, degraded: false },
  stale: { code: "stale", label: "Stale", order: 3, degraded: true },
  frozen: { code: "frozen", label: "No longer updated", order: 4, degraded: true },
  unknown: { code: "unknown", label: "Refresh cadence unknown", order: 5, degraded: true },
});

// ─────────────────────────── 6. relation (typed cross-references) ───────────────────────────
//
// CLOSED SET. Links are entity-mediated and TYPED; untyped "related items" rails built on keyword
// overlap are the mechanism by which every related-content module in the industry became ignorable.
//
// Every relation declares its inverse, so reciprocity is checkable rather than aspirational, and
// `symmetric` marks the two that are their own inverse.

export const RELATION = deepFreeze({
  implements: { code: "implements", label: "Implements", order: 1, inverse: "implemented_by", symmetric: false },
  implemented_by: { code: "implemented_by", label: "Implemented by", order: 2, inverse: "implements", symmetric: false },
  amends: { code: "amends", label: "Amends", order: 3, inverse: "amended_by", symmetric: false },
  amended_by: { code: "amended_by", label: "Amended by", order: 4, inverse: "amends", symmetric: false },
  supersedes: { code: "supersedes", label: "Supersedes", order: 5, inverse: "superseded_by", symmetric: false },
  superseded_by: { code: "superseded_by", label: "Superseded by", order: 6, inverse: "supersedes", symmetric: false },
  is_evidence_for: { code: "is_evidence_for", label: "Is evidence for", order: 7, inverse: "supported_by", symmetric: false },
  supported_by: { code: "supported_by", label: "Supported by", order: 8, inverse: "is_evidence_for", symmetric: false },
  contradicts: { code: "contradicts", label: "Contradicts", order: 9, inverse: "contradicts", symmetric: true },
  quantifies: { code: "quantifies", label: "Quantifies", order: 10, inverse: "quantified_by", symmetric: false },
  quantified_by: { code: "quantified_by", label: "Quantified by", order: 11, inverse: "quantifies", symmetric: false },
  applies_to: { code: "applies_to", label: "Applies to", order: 12, inverse: "subject_of", symmetric: false },
  subject_of: { code: "subject_of", label: "Subject of", order: 13, inverse: "applies_to", symmetric: false },
  affects_corridor: { code: "affects_corridor", label: "Affects corridor", order: 14, inverse: "affected_by", symmetric: false },
  affected_by: { code: "affected_by", label: "Affected by", order: 15, inverse: "affects_corridor", symmetric: false },
  discussed_in: { code: "discussed_in", label: "Discussed in", order: 16, inverse: "discusses", symmetric: false },
  discusses: { code: "discusses", label: "Discusses", order: 17, inverse: "discussed_in", symmetric: false },
  computed_under: { code: "computed_under", label: "Computed under", order: 18, inverse: "governs", symmetric: false },
  governs: { code: "governs", label: "Governs", order: 19, inverse: "computed_under", symmetric: false },
});

/** The inverse relation code, or null. Used to assert reciprocity in the acceptance gate. */
export function inverseRelation(code) {
  return RELATION[code]?.inverse ?? null;
}

// ─────────────────────────── registry + validation ───────────────────────────

/** Every vocabulary, by name. The acceptance gate iterates this rather than a hand-kept list. */
export const VOCABULARIES = Object.freeze({
  obs_status: OBS_STATUS,
  origin_class: ORIGIN_CLASS,
  source_reliability: SOURCE_RELIABILITY,
  info_credibility: INFO_CREDIBILITY,
  confidence_band: CONFIDENCE_BAND,
  likelihood: LIKELIHOOD,
  impact: IMPACT,
  applicability: APPLICABILITY,
  binding_position: BINDING_POSITION,
  freshness: FRESHNESS,
  relation: RELATION,
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// TRANSPORT MODE. Added 2026-08-12, and the reason it lives HERE rather than in either module
// that needs it is the whole point.
//
// corridor-id.mjs shipped a private CORRIDOR_MODES list while the emission-factors table was
// drafted with a DIFFERENT token for the same mode. One product, two names for one mode, and a
// corridor keyed one way would never match a factor scoped the other, silently, with no error
// anywhere, falling through to a worse factor tier while looking like normal operation.
//
// CANONICAL TOKEN IS `ocean`, BY OPERATOR RULING 2026-08-12. An earlier draft of this file chose
// `sea` on the reasoning that ISO 14083, the GLEC Framework and Regulation (EU) 2026/1030 all
// enumerate "maritime". That reasoning confused an OUTPUT concern with an INTERNAL one. This is a
// freight forwarding product; its users, its rate boards, its bookings and its lane names all say
// OCEAN FREIGHT. The internal canonical token follows the domain. Mapping `ocean` to whatever
// wording a given regulatory report demands is a rendering step at the edge of that report, and it
// belongs there, not smeared through the identity layer.
//
// `sea` and `maritime` survive as INPUT ALIASES and are never stored, which is the identifier
// resolution rule already set for the whole product: accept what people write, store one token.
//
// COST OF FIXING IT NOW VERSUS LATER: mode is part of the corridor hash payload, so changing the
// token changes every corridor key. Zero keys are minted, so this costs a test update. After the
// spine unit mints keys it would rewrite every referencing row.
export const TRANSPORT_MODES = Object.freeze({
  road: { code: "road", label: "Road", order: 1, corridorOnly: false },
  rail: { code: "rail", label: "Rail", order: 2, corridorOnly: false },
  ocean: { code: "ocean", label: "Ocean", order: 3, corridorOnly: false },
  inland_waterway: { code: "inland_waterway", label: "Inland waterway", order: 4, corridorOnly: false },
  air: { code: "air", label: "Air", order: 5, corridorOnly: false },
  // A chain, not a mode. A corridor may be multimodal; a factor never is, because a factor is per leg.
  multimodal: { code: "multimodal", label: "Multimodal", order: 6, corridorOnly: true },
});

/** Every mode, corridor-only values included. */
export const MODE_CODES = Object.freeze(
  Object.values(TRANSPORT_MODES).sort((a, b) => a.order - b.order).map((m) => m.code)
);

/** Modes a single leg, and therefore an emission factor, may carry. Excludes `multimodal`. */
export const LEG_MODE_CODES = Object.freeze(
  Object.values(TRANSPORT_MODES).filter((m) => !m.corridorOnly)
    .sort((a, b) => a.order - b.order).map((m) => m.code)
);

/**
 * Input aliases, normalised away at the edge. Never stored.
 *
 * `sea` and `maritime` are here rather than canonical DELIBERATELY: they are the wording the
 * standards use, so they arrive constantly from regulatory text and third-party feeds, and they
 * must resolve rather than be rejected.
 */
export const MODE_ALIASES = Object.freeze({
  sea: "ocean", maritime: "ocean", water: "ocean", vessel: "ocean", marine: "ocean",
  truck: "road", lorry: "road", hgv: "road",
  barge: "inland_waterway", iww: "inland_waterway", "inland-waterway": "inland_waterway",
  freighter: "air", airfreight: "air",
});

/** Canonical mode token, or null when unrecognised. Never guesses. */
export function normaliseMode(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (Object.prototype.hasOwnProperty.call(TRANSPORT_MODES, raw)) return raw;
  return Object.prototype.hasOwnProperty.call(MODE_ALIASES, raw) ? MODE_ALIASES[raw] : null;
}

/** True when `value` is a member of the named vocabulary. */
export function isValid(vocabName, value) {
  const v = VOCABULARIES[vocabName];
  return !!v && Object.prototype.hasOwnProperty.call(v, String(value));
}

/** Members of a vocabulary in declared display order. */
export function orderedValues(vocabName) {
  const v = VOCABULARIES[vocabName];
  if (!v) return [];
  return Object.values(v).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
