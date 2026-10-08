// statements.mjs: the Operations industry-level statements (lane S8-F2, 2026-10-08).
// PURE: no React, no DOM, no DB, no npm, no clock. Consumed by StatementsBlock.tsx (renders it) through
// OperationsLedger.tsx, which hands it the page's existing `facts` (the `OperationsFact` read shape,
// supabase-server.ts). Nothing is stored, fetched or estimated here.
//
// WHAT A STATEMENT IS. One sentence comparing the SAME fact label across regions for one dimension,
// built only from held `regional_data_facts` rows. It replaces the removed capacity-investment
// calculator (ADR-043): the surface states what wages and costs are, sourced, and says nothing about
// what a reader should do with them. No verdict word is ever generated (see VERDICT_PATTERN).
//
// RULES, in the order the design (docs/dispatches/industry-statements-design-2026-10-08.md, fact
// register, and the S8-F2 brief) states them:
//   1. ELIGIBILITY. A (dimension, fact label) group needs at least two regions holding an ENVELOPED
//      value (`isEnvelopedFact`, region-grid.mjs) whose `origin_class` is official, verified, partner
//      or derived. One eligible region yields the absence line (`NEEDS_SECOND_REGION`) and no
//      sentence; no eligible region yields nothing, because there is nothing sourced to say.
//   2. SENTENCE. "<label>: <Region> <value> <unit> (<source>, <reference period>); <Region> ...".
//      Regions in display order. Roster regions with no eligible value are named at the end, never
//      omitted: "<Regions>: not available."
//   3. UNITS. Native per region, never converted. When every component shares the unit AND the
//      currency, an index "(base <Region> = 100)" is appended per component (`indexAgainstBase`,
//      region-grid.mjs, the one place an index is computed). Otherwise no index at all.
//   4. COMPONENTS. One entry per region component, carrying its own provenance, so the reader sees
//      what the sentence is made of (spec 04 section 6 component 4; CLAUDE.md rule 18).
//   6. GENERALITY (rule 19, examples are not scope). Dimensions and labels are DATA. Nothing here
//      names a dimension, a fact label or a region. The tests cover labour, energy and infrastructure
//      dimensions, a mixed-unit group and an unseen dimension.
//
// THE BASE REGION. The matrix has no exposed base-region state: its "Compare against" control was
// deleted (RegionDimensionMatrix.tsx header) and compare mode implies its base, in MatrixPanel, as the
// first region in column order that carries an enveloped fact. There is no state to lift into a prop,
// so `baseRegionCode` is optional here and, when absent, this module applies the SAME implied rule:
// the first region in display order among the group's eligible components. No second selector exists.
//
// VERDICT WORDS. A fact label is producer-controlled text echoed into the sentence. A label carrying a
// verdict word (VERDICT_PATTERN) is never echoed: the whole group is withheld, so the held fact is
// simply not stated here (the matrix still shows it). ADR-043: "the surface does not say automate or
// hire".
//
// DASH GLYPHS. Discipline rule 022 bans U+2014 and U+2013 in added source; the producers' fact labels
// carry them as a region separator ("EU <em dash> Electricity price ..."), so they are written below as
// escapes, which compile to the same character class without the literal glyph in this file.

import {
  isEnvelopedFact,
  impliedBaseFact,
  indexAgainstBase,
  formatEnvelopedValue,
  originClassLabel,
  originClassStrength,
  derivationLabel,
} from "./region-grid.mjs";

/** The origin classes a statement may state: sourced-grade only. `modelled`, `community` and
 *  `community-corroborated` are estimates or unverified contributions and never enter a sentence. */
export const ELIGIBLE_ORIGIN_CLASSES = Object.freeze(["official", "verified", "partner", "derived"]);

/** The line rendered where a statement would be, when only one region holds a sourced value. */
export const NEEDS_SECOND_REGION = "needs a second sourced region";

/** Words that pose a decision rather than state a fact. Whole words, any case. "Hiring" is a labour
 *  chain term (labour-chain.ts) and is NOT matched: the pattern needs the word itself. */
export const VERDICT_PATTERN =
  /\b(automat(?:e|es|ed|ing)|hire[sd]?|cheap(?:er|est)?|better|worse|superior|inferior|recommend(?:s|ed)?|should|preferable)\b/i;

/** True when `text` carries a verdict word. */
export function hasVerdictWord(text) {
  return typeof text === "string" && VERDICT_PATTERN.test(text);
}

const arr = (x) => (Array.isArray(x) ? x : []);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isText = (x) => typeof x === "string" && x.trim().length > 0;

/**
 * The label a reader sees, and the key facts group on. Producers write "<REGION> <dash> <description>"
 * (bls-oews-parser.mjs, eurostat-*-parser.mjs); that prefix is the row's own region, not part of the
 * fact, so it is stripped, which is what lets one label group across regions. Underscores become
 * spaces and the first letter is capitalised. Pure.
 * @param {string} raw
 * @param {string} [regionCode] the row's own region code
 */
export function humaniseFactLabel(raw, regionCode) {
  let s = typeof raw === "string" ? raw : "";
  if (isText(regionCode)) {
    s = s.replace(new RegExp(`^\\s*${escapeRe(regionCode)}\\s*(?:\\u2014|\\u2013|-|:)\\s*`, "i"), "");
  }
  s = s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** The camelCase shape region-grid.mjs's envelope helpers read, from one OperationsFact. */
function envelopeOf(f) {
  return { valueNumeric: f.value_numeric, unit: f.unit, nObservations: f.n_observations ?? null };
}

function isEligible(f) {
  return isEnvelopedFact(envelopeOf(f)) && ELIGIBLE_ORIGIN_CLASSES.includes(f.origin_class);
}

/** Which of two facts for one (region, group) is stated: strongest origin class, then the later
 *  as-at date, then the better source tier. A total order over the data, so input order never decides. */
function stronger(a, b) {
  const sa = originClassStrength(a.origin_class) ?? 0;
  const sb = originClassStrength(b.origin_class) ?? 0;
  if (sa !== sb) return sa > sb ? a : b;
  const da = a.as_at_date ?? "";
  const db = b.as_at_date ?? "";
  if (da !== db) return da > db ? a : b;
  const ta = Number.isInteger(a.source_tier) ? a.source_tier : 99;
  const tb = Number.isInteger(b.source_tier) ? b.source_tier : 99;
  if (ta !== tb) return ta < tb ? a : b;
  return `${a.fact_label}|${a.value_numeric}` <= `${b.fact_label}|${b.value_numeric}` ? a : b;
}

function componentOf(f, region) {
  return {
    regionCode: region.code,
    regionLabel: region.label,
    value: f.value_numeric,
    unit: f.unit,
    currency: isText(f.currency) ? f.currency : null,
    valueText: formatEnvelopedValue(envelopeOf(f)),
    sourceName: isText(f.source_name) ? f.source_name : isText(f.source_key) ? f.source_key : null,
    sourceUrl: isText(f.source_url) ? f.source_url : null,
    sourceTier: Number.isInteger(f.source_tier) ? f.source_tier : null,
    datasetRef: isText(f.source_ref) ? f.source_ref : null,
    referencePeriod: isText(f.reference_period) ? f.reference_period : null,
    statusFlag: derivationLabel(f.derivation),
    originClass: originClassLabel(f.origin_class),
    asAtDate: isText(f.as_at_date) ? f.as_at_date : null,
    index: null,
  };
}

/** Roster in display order. Honours `displayOrder` when every region carries one; otherwise the roster
 *  order given is the display order. Stable. */
function orderedRoster(regions) {
  const list = arr(regions).filter((r) => r && isText(r.code) && isText(r.label));
  const allOrdered = list.length > 0 && list.every((r) => Number.isFinite(r.displayOrder));
  if (!allOrdered) return list.slice();
  return list
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.displayOrder - b.r.displayOrder || a.i - b.i)
    .map((x) => x.r);
}

/** Apply the index across a group's components, or leave every `index` null. All-or-nothing: a group
 *  is either fully indexed against one base or not indexed. */
function indexGroup(components, roster, baseRegionCode) {
  const first = components[0];
  const sameBasis = components.every((c) => c.unit === first.unit && c.currency === first.currency);
  if (!sameBasis) return undefined;
  const explicit = isText(baseRegionCode) && roster.some((r) => r.code === baseRegionCode);
  // No chosen base: the rule compare mode uses (region-grid.mjs impliedBaseFact), one home for both.
  const envelopes = components.map((c) => ({ valueNumeric: c.value, unit: c.unit }));
  const base = explicit
    ? components.find((c) => c.regionCode === baseRegionCode)
    : components[envelopes.indexOf(impliedBaseFact(envelopes))];
  if (!base) return undefined;
  const indexes = components.map((c) =>
    indexAgainstBase({ valueNumeric: c.value, unit: c.unit }, { valueNumeric: base.value, unit: base.unit }),
  );
  if (indexes.some((i) => i === null)) return undefined;
  components.forEach((c, i) => {
    c.index = Math.round(indexes[i]);
  });
  return { baseRegionCode: base.regionCode, baseRegionLabel: base.regionLabel, unit: base.unit };
}

function clause(c, index) {
  const parens = [c.sourceName, c.referencePeriod].filter(Boolean).join(", ");
  const idx = index && c.index !== null ? `, index ${c.index} (base ${index.baseRegionLabel} = 100)` : "";
  return `${c.regionLabel} ${c.valueText}${parens ? ` (${parens})` : ""}${idx}`;
}

/**
 * @typedef {object} StatementComponent
 * @property {string} regionCode
 * @property {string} regionLabel
 * @property {number} value
 * @property {string} unit
 * @property {string|null} currency
 * @property {string} valueText
 * @property {string|null} sourceName
 * @property {string|null} sourceUrl
 * @property {number|null} sourceTier
 * @property {string|null} datasetRef
 * @property {string|null} referencePeriod
 * @property {string|null} statusFlag
 * @property {string|null} originClass
 * @property {string|null} asAtDate
 * @property {number|null} index
 */

/**
 * @typedef {object} Statement
 * @property {string} dimension
 * @property {string} factLabel
 * @property {string|null} sentence null exactly when `absence` is set
 * @property {StatementComponent[]} components
 * @property {{baseRegionCode: string, baseRegionLabel: string, unit: string}} [index]
 * @property {string} [absence]
 */

/**
 * Build the statements for a page's facts.
 * @param {{facts: Array<object>, regions: Array<{code:string,label:string,displayOrder?:number}>, dimensions?: string[], baseRegionCode?: string|null}} input
 * @returns {Statement[]} ordered by dimension (the order given), then label
 */
export function buildStatements({ facts, regions, dimensions, baseRegionCode } = {}) {
  const roster = orderedRoster(regions);
  const rosterByCode = new Map(roster.map((r) => [r.code, r]));
  const allFacts = arr(facts).filter((f) => f && typeof f === "object" && rosterByCode.has(f.region_code) && isText(f.dimension));
  const dims =
    arr(dimensions).filter(isText).length > 0
      ? arr(dimensions).filter(isText)
      : [...new Set(allFacts.map((f) => f.dimension))].sort();

  /** @type {Map<string, {dimension:string, label:string, byRegion: Map<string, object>}>} */
  const groups = new Map();
  for (const f of allFacts) {
    if (!dims.includes(f.dimension) || !isEligible(f)) continue;
    const label = humaniseFactLabel(f.fact_label, f.region_code);
    if (!label || hasVerdictWord(label)) continue;
    const key = `${f.dimension}|${label.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { dimension: f.dimension, label, byRegion: new Map() });
    const g = groups.get(key);
    const held = g.byRegion.get(f.region_code);
    g.byRegion.set(f.region_code, held ? stronger(held, f) : f);
  }

  const out = [];
  for (const g of groups.values()) {
    const components = roster.filter((r) => g.byRegion.has(r.code)).map((r) => componentOf(g.byRegion.get(r.code), r));
    if (components.length < 2) {
      out.push({ dimension: g.dimension, factLabel: g.label, sentence: null, components, absence: NEEDS_SECOND_REGION });
      continue;
    }
    const index = indexGroup(components, roster, baseRegionCode);
    const missing = roster.filter((r) => !g.byRegion.has(r.code)).map((r) => r.label);
    const sentence =
      `${g.label}: ${components.map((c) => clause(c, index)).join("; ")}.` +
      (missing.length > 0 ? ` ${missing.join(", ")}: not available.` : "");
    out.push({ dimension: g.dimension, factLabel: g.label, sentence, components, ...(index ? { index } : {}) });
  }
  return out.sort((a, b) => dims.indexOf(a.dimension) - dims.indexOf(b.dimension) || a.factLabel.localeCompare(b.factLabel));
}
