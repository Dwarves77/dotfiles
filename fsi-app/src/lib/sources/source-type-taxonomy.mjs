// source-type-taxonomy.mjs — vocabulary + classifier for `sources.source_type` (migration 288).
//
// WHY THIS EXISTS. `fsi-app/src/lib/coverage-gaps.ts` carried a STOPGAP: two regex pattern sets
// (env-body, legislature) matched against a source's `name + url` text blob at READ time, on every
// cache miss, to answer "is this source an environmental body?" / "is this source a legislature?" for
// the Map . Coverage gaps card. Per docs/plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md, the durable fix is a
// structured tag populated once and queried by array membership. This module is that tag's vocabulary
// and classifier; migration 288 is the column; scripts/sources/backfill-source-type.mjs is the one-shot
// write pass.
//
// SCOPE OF THE CLASSIFIER — STATED HONESTLY, NOT SILENTLY NARROWED. The proposal names 11 vocabulary
// values (§3); all 11 are registered here AND in migration 288's CHECK constraint, because the CHECK
// constraint and any future admin/manual assignment need the full vocabulary today even though this
// module cannot yet DERIVE all 11 from name/url alone. Only 2 of the 11 — `environmental_body` and
// `legislature` — have a classifier below, and it is the STOPGAP's own two regex sets, PORTED VERBATIM
// (same patterns, same order, same comments) from coverage-gaps.ts — nothing is lost in the port; this
// is exactly what that file's read path needs today, so this is the honest floor, not a placeholder for
// something grander. The proposal's other 9 categories (§6.2) describe URL-host / tier-based heuristics
// with softer confidence bands that were never built or measured against the live registry; classifying
// them without that verification would be a speculative fix this repo's quality bar forbids. Extending
// the classifier later is additive: add a matcher function, flip that value's `classifiable` flag —
// nothing here needs to change shape to grow.
//
// Pure. No DB access, no npm dependency — importable from a DB-less validator or a `node --test` file
// with zero setup, matching the convention this repo uses for its other pure classifiers (e.g.
// scripts/lib/institution-key.mjs).

// ── Vocabulary (proposal §3, verbatim definitions condensed to one line each) ──────────────────────────
// Byte-for-byte, the `value` list below must match migration 288's CHECK constraint array. Guarded by
// this module's own test (source-type-taxonomy.test.mjs reads the migration file and compares).
export const SOURCE_TYPES = Object.freeze([
  {
    value: "environmental_body",
    label: "Environmental body",
    definition: "Government environmental regulator or environment ministry/agency — issues environmental rules, enforces environmental law, publishes air-quality/emissions/inventory data.",
    classifiable: true,
  },
  {
    value: "legislature",
    label: "Legislature",
    definition: "National, sub-national, or supra-national legislative body — passes laws (acts/statutes/directives); the body, not the gazette.",
    classifiable: true,
  },
  {
    value: "gazette",
    label: "Gazette",
    definition: "Official publication of legal text (regulations, decrees, notices) — the journal, not the body.",
    classifiable: false,
  },
  {
    value: "regulatory_executive",
    label: "Regulatory executive",
    definition: "Executive-branch regulator that is NOT environmental (customs, transport, energy, aviation, maritime, occupational safety) — issues binding rules outside the environmental remit.",
    classifiable: false,
  },
  {
    value: "judiciary",
    label: "Judiciary",
    definition: "Courts and tribunals issuing binding rulings on environmental / freight regulation.",
    classifiable: false,
  },
  {
    value: "standards_body",
    label: "Standards body",
    definition: "Standards organizations (de jure or de facto) publishing technical standards relevant to freight emissions accounting / vehicle / fuel / packaging.",
    classifiable: false,
  },
  {
    value: "industry_assoc",
    label: "Industry association",
    definition: "Industry / trade associations representing operators (forwarders, airlines, shippers, road carriers) — positions, interpretation, sometimes voluntary standards.",
    classifiable: false,
  },
  {
    value: "treaty_org",
    label: "Treaty organization",
    definition: "Intergovernmental organizations created by treaty (UN system, OECD, EU institutions acting in a non-regulatory capacity) — multilateral coordination, not direct rulemaking.",
    classifiable: false,
  },
  {
    value: "research_institute",
    label: "Research institute",
    definition: "Universities, national labs, think tanks publishing primary research and policy analysis.",
    classifiable: false,
  },
  {
    value: "news",
    label: "News",
    definition: "Trade press and journalism.",
    classifiable: false,
  },
  {
    value: "data_aggregator",
    label: "Data aggregator",
    definition: "Aggregators / datasets that index across primary sources — closer to tooling than a primary source.",
    classifiable: false,
  },
]);

export const SOURCE_TYPE_VALUES = Object.freeze(SOURCE_TYPES.map((t) => t.value));
export const CLASSIFIABLE_SOURCE_TYPE_VALUES = Object.freeze(
  SOURCE_TYPES.filter((t) => t.classifiable).map((t) => t.value),
);

const SOURCE_TYPE_LABEL_BY_VALUE = new Map(SOURCE_TYPES.map((t) => [t.value, t.label]));

/** Display label for a source_type token; the token itself if unrecognized (never throws). */
export function sourceTypeLabel(value) {
  return SOURCE_TYPE_LABEL_BY_VALUE.get(value) ?? value;
}

/** True iff every element of `arr` is a registered SOURCE_TYPE_VALUES token. Mirrors migration 288's
 *  CHECK constraint (`source_type <@ ARRAY[...]`) so a caller can validate before writing. */
export function isValidSourceTypeArray(arr) {
  if (arr === null || arr === undefined) return true; // NULL passes the CHECK (not yet classified)
  if (!Array.isArray(arr)) return false;
  return arr.every((v) => SOURCE_TYPE_VALUES.includes(v));
}

// ── Classifier — ENV_BODY_PATTERNS / LEGISLATURE_PATTERNS ported VERBATIM from the STOPGAP that lived
// in coverage-gaps.ts (same patterns, same order, same inline comments) — see this file's header for
// why nothing else is classified yet. ─────────────────────────────────────────────────────────────────

const ENV_BODY_PATTERNS = [
  /\bepa\b/i,
  /environment(al)?/i,
  /ecology/i,
  /ecolog\w*/i,
  /climate/i,
  /eccc\b/i,
  /\bdefra\b/i,
  /\beea\b/i,        // European Environment Agency
  // Common state-level environmental conservation departments (e.g.
  // NY DEC, MI DEQ, CT DEEP). Matched only when the URL host begins
  // with one of these tokens so we don't false-positive on common
  // "dec" substrings ("december", "decoder", etc.).
  /\bdec\.[a-z.-]+\.gov\b/i,
  /\bdeep\.[a-z.-]+\.gov\b/i,
  /\bdeq\.[a-z.-]+\.gov\b/i,
  /natural[- ]?resources?/i,
  /conservation/i,
  // Non-English / non-Anglo environmental body names.
  /\bumweltbundesamt\b/i,    // DE/AT federal env agency
  /\bumwelt\b/i,             // DE "environment" stem
  /\bnaturv[åa]rdsverket\b/i, // SE env protection agency
  /\bymp[äa]rist[öo]\b/i,    // FI "environment"
  /\bmilj[øo]\b/i,           // DK/NO/SE "environment"
  /\bmilieu\b/i,             // NL "environment"
  /\bmedio[- ]ambiente\b/i,  // ES/Latam "environment"
  /\bambiente\b/i,           // IT/PT/ES "environment"
  /\bministerio[- ]?(?:del|de la|de)?\s*(?:medio[- ]ambiente|ambiente|ecolog[íi]a)/i,
  /\bminist[èe]re[- ]?(?:de l['’])?\s*(?:environnement|[ée]cologie|transition[- ]?[ée]cologique)/i,
  // Domain-based env-body matchers — government environment ministries
  // tend to use these tokens in URL paths.
  /\bmoe\.[a-z.-]+/i,        // Ministry of Environment (KR/JP/IL etc.)
  /\bmee\.[a-z.-]+/i,        // CN Ministry of Ecology and Environment
  /\benv\.[a-z.-]+/i,
];

const LEGISLATURE_PATTERNS = [
  /legis/i,
  /parliament/i,
  /assembly/i,
  /senate/i,
  /congress/i,
  // English-named legislatures across federations.
  /house of (?:commons|representatives|lords)/i,
  // Non-English legislature names (DE/AT/CH, SE, DK, NO, FR, ES, NL, IE,
  // FI, IT, JP, AT, EE, LV, LT — single-word matchers chosen so the
  // regulator/source name OR URL hostname can match).
  /\bbundestag\b/i,           // DE
  /\bbundesrat\b/i,           // DE/CH/AT
  /\bnationalrat\b/i,         // AT/CH
  /\bduma\b/i,                // RU
  /\bdiet\b/i,                // JP / IE-historical
  /\briksdag\b/i,             // SE
  /\bfolketing\b/i,           // DK
  /\bstorting\b/i,            // NO
  /\beduskunta\b/i,           // FI
  /\bseimas\b/i,              // LT
  /\bsaeima\b/i,              // LV
  /\briigikogu\b/i,           // EE
  /\bcortes\b/i,              // ES
  /\bd[áa]il\b/i,             // IE
  /\boireachtas\b/i,          // IE
  /\btweede[- ]?kamer\b/i,    // NL
  /\beerste[- ]?kamer\b/i,    // NL
  /\bstaten[- ]?generaal\b/i, // NL
  /\bstortinget\b/i,          // NO
  /\bassembl[ée]e[- ]?nationale\b/i, // FR
  /\bs[ée]nat\b/i,            // FR/BE/etc
  /\bcamera[- ]?dei[- ]?deputati\b/i, // IT
  /\bassemblea\b/i,           // IT
  /\bc[áa]mara\b/i,           // ES/Latam
  /\bsejm\b/i,                // PL
  /\bduma\b/i,                // RU
  /\b國會\b/u,                 // ZH/JP "national diet"
  /\b国会\b/u,                 // simplified
  /\b국회\b/u,                 // KR national assembly
  // URL-based matchers — most national legislatures host on these stems.
  /\bparliament\.[a-z.-]+/i,
  /\bgov\.[a-z.-]+\b\/(?:parliament|legis|house)/i,
  /\blegifrance\.gouv\.fr\b/i, // FR primary law portal
  /\blex\.[a-z]{2}\b/i,        // generic per-country lex.* portals
];

function matchesAny(value, patterns) {
  if (!value) return false;
  for (const re of patterns) {
    if (re.test(value)) return true;
  }
  return false;
}

/**
 * Classify a source by name/url into zero or more registered `source_type` tokens. Pure, no I/O.
 * Today derives exactly the 2 CLASSIFIABLE_SOURCE_TYPE_VALUES (environmental_body, legislature) — see
 * this file's header. Multi-type: a source can legitimately match both (proposal §3.1 overlap cases).
 * @param {{ name?: string|null, url?: string|null }} source
 * @returns {string[]}
 */
export function classifySourceType({ name, url } = {}) {
  const text = `${name || ""} ${url || ""}`;
  const types = [];
  if (matchesAny(text, ENV_BODY_PATTERNS)) types.push("environmental_body");
  if (matchesAny(text, LEGISLATURE_PATTERNS)) types.push("legislature");
  return types;
}
