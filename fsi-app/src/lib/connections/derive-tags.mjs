// derive-tags.mjs — PURE, deterministic, $0 tag DERIVATION for one item's title, canonical instrument
// key / CELEX descriptor, jurisdiction fields, and grounded brief text. Fixes the August-census-wave
// defect: items minted with EMPTY operational_scenario_tags / compliance_object_tags / topic_tags score
// ZERO edges in discover.mjs (that module reads exactly those three fields — see its own header — plus
// source_id and jurisdiction; a shared_scenario/shared_compliance_object/shared_jurisdiction_topic basis
// can never fire against an empty array). This module NEVER writes a DB row and NEVER decides a tag is
// true — it only PROPOSES candidates, each carrying the evidence span that justified it, for operator
// ratification (propose-tags.mjs / apply-tags.mjs carry the write path; see those files).
//
// NO ASSUMPTIONS, NEVER SILENT AUTO-TAGGING (operator rule, restated structurally here): every proposal
// is traceable to (a) a real matched substring of the item's own title/instrument-key/brief text and
// (b) a tag token that exists in one of the vocabulary SoTs today — never an invented token, never a
// tag emitted with no matched text behind it.
//
// VOCAB SoT BINDING (read this before touching KEYWORD_MAP). This module derives candidates ONLY from
// tokens that exist in the live vocabularies, imported at load time from the files that already own
// them — never a second hand-typed copy of the token list:
//
//   - topic_tags:              TOPIC_TAG_VALUES, an UNEXPORTED `const` in src/lib/agent/parse-output.ts
//   - compliance_object_tags:  COMPLIANCE_OBJECT_VALUES, an UNEXPORTED `const` in the same file
//   - operational_scenario_tags: the "Core glossary (~32 values, prefer these)" prose block in
//     src/lib/agent/system-prompt.ts — this field is OPEN vocabulary (parse-output.ts enforces only
//     kebab-case shape, not a closed list), so the glossary prose IS its de facto SoT; retiring a token
//     from that block (as ADR-020 Amendment 1 did to the customs-declaration-*/dangerous-goods-*
//     families — see .discipline/vocab-drift-guard.test.mjs test 3e) removes it from this module's
//     candidate space on the next parse, automatically, with no edit here.
//
// Both constants above are UNEXPORTED (private to parse-output.ts) — this module cannot `import` them
// as ES bindings without editing a file this lane is forbidden to touch (parse-output.ts belongs to the
// mint/agent family). So it reads parse-output.ts and system-prompt.ts as TEXT and extracts the same
// literal arrays / prose block those files declare, via extractQuotedArray() / extractScenarioGlossary()
// below — the identical "parse the real source, never hand-copy a second list" posture
// .discipline/vocab-drift-guard.test.mjs already uses for migration SQL (see that file's
// renderSurfaceOfSql()/readMigrationSql() pattern). If either upstream file's shape changes in a way
// these extractors can't parse, they throw loudly at import time (fail-closed, never silently derive
// from a stale or empty list) — see the two extractor functions' own guards.
//
// INPUT SHAPE (this module's own contract; the caller — propose-tags.mjs — supplies rows in this
// shape from a live readAll("intelligence_items", ...) select):
//   {
//     id: string,
//     title: string | null,
//     canonical_instrument_key: string | null,     // e.g. "CELEX:32011L0037", "EU-ETS-2023"
//     jurisdiction_iso: string[] | string | null,   // carried through for evidence context; not itself
//     jurisdictions: string[] | null,               // a matching signal in v1 — see "jurisdiction use" below
//     full_brief: string | null,                    // the grounded, sourced brief body (system-prompt.ts:
//                                                    // "full_brief — the markdown body ... under the
//                                                    // integrity rule"). This IS this module's "grounded
//                                                    // section/claim text" input — the brief is a
//                                                    // COMPRESSION of grounded claims/sections per that
//                                                    // same file, so matching against it never invents
//                                                    // text the item's own grounded content doesn't carry.
//   }
//
// CONFIDENCE TIERS (exactly two, per the dispatch):
//   high   — the keyword matched inside the TITLE or the canonical_instrument_key/CELEX descriptor
//            (instrument-level identity text — the strongest, least ambiguous signal on the row).
//   medium — the keyword matched only inside full_brief (section/claim text — real, grounded, but a
//            body mention is weaker evidence than a title/instrument-level match).
// A keyword that matches BOTH is recorded once, at "high" (the stronger tier wins; no double-count).
//
// JURISDICTION USE (v1, honestly scoped): jurisdiction_iso/jurisdictions are carried through and
// returned in a proposal's `evidence` string is NEVER fabricated from jurisdiction alone — jurisdiction
// alone matches no tag in this version (that would be an assumption: "this item is in the EU" does not
// establish "this item concerns CBAM"). It is accepted input so a future disambiguation pass (e.g.
// preferring EU-specific instruments like CSRD/CSDDD/EUDR/CBAM only when jurisdiction confirms EU) has
// the field already threaded through, named here rather than smuggled in later.
//
// HARD CAPS mirror the live vocabulary's own emission caps (system-prompt.ts): operational_scenario_tags
// <= 5, compliance_object_tags <= 4, topic_tags <= 3 per item. Proposals beyond a field's cap are
// dropped, highest-confidence-first (ties broken by tag name, ascending, for determinism) — this module
// never proposes a set the live vocabulary rules would themselves reject at emission time.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PARSE_OUTPUT_PATH = resolve(HERE, "..", "agent", "parse-output.ts");
const SYSTEM_PROMPT_PATH = resolve(HERE, "..", "agent", "system-prompt.ts");

// Exported so a downstream writer (apply-tags.mjs) can respect the SAME emission ceiling when merging
// proposals onto an item's existing arrays, instead of hand-copying these three numbers a second time.
export const FIELD_CAPS = Object.freeze({
  operational_scenario_tags: 5,
  compliance_object_tags: 4,
  topic_tags: 3,
});

/**
 * Extract a `const NAME = [ "a", "b", ... ] as const;` quoted-string array from TypeScript source text.
 * PURE (string in, array out) — the same "read source as text, parse the literal" posture
 * .discipline/vocab-drift-guard.test.mjs uses for migration SQL. Throws if the const is not found (a
 * SoT-shape change this module cannot safely assume the meaning of).
 * @param {string} src
 * @param {string} constName
 * @returns {string[]}
 */
export function extractQuotedArray(src, constName) {
  const re = new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`);
  const m = re.exec(src);
  if (!m) {
    throw new Error(
      `derive-tags: could not find "const ${constName} = [...] as const" in the expected SoT file. ` +
      `The upstream vocabulary shape changed — this module must not guess at a stale/empty list.`,
    );
  }
  const values = [...m[1].matchAll(/"([^"]+)"/g)].map((mm) => mm[1]);
  if (!values.length) {
    throw new Error(`derive-tags: ${constName} parsed to zero values — refusing to derive against an empty vocabulary.`);
  }
  return values;
}

/**
 * Extract the operational_scenario_tags "Core glossary" prose block from system-prompt.ts:
 *   Core glossary (~32 values, prefer these):
 *   Ocean: tag-a, tag-b, ...
 *   Air: tag-c, ...
 *   ...
 *   Empty array allowed when the item has no clear operational scenario ...
 * Returns the flat token list AND the category each token was declared under (for evidence context).
 * PURE. Throws if the block cannot be located (see extractQuotedArray's rationale — same fail-closed
 * posture).
 * @param {string} src
 * @returns {{tag:string, category:string}[]}
 */
export function extractScenarioGlossary(src) {
  const start = src.indexOf("Core glossary (~32 values, prefer these):");
  if (start === -1) {
    throw new Error(
      "derive-tags: could not find the operational_scenario_tags 'Core glossary' block in system-prompt.ts. " +
      "The upstream vocabulary shape changed — this module must not guess at a stale/empty list.",
    );
  }
  const end = src.indexOf("Empty array allowed when the item has no clear operational scenario", start);
  const block = end === -1 ? src.slice(start) : src.slice(start, end);
  const out = [];
  // One category line per non-blank line: "Category name: tag-a, tag-b, tag-c"
  for (const line of block.split("\n")) {
    const m = /^([A-Za-z][A-Za-z0-9 /\-]*):\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const category = m[1].trim();
    for (const tag of m[2].split(",").map((s) => s.trim()).filter(Boolean)) {
      out.push({ tag, category });
    }
  }
  if (!out.length) {
    throw new Error("derive-tags: operational_scenario_tags core glossary block parsed to zero tags — refusing to derive against an empty vocabulary.");
  }
  return out;
}

// ── Load the three vocab SoTs once, at module import time (fail-closed per the extractors above). ──
const _parseOutputSrc = readFileSync(PARSE_OUTPUT_PATH, "utf8");
const _systemPromptSrc = readFileSync(SYSTEM_PROMPT_PATH, "utf8");

/** topic_tags closed vocabulary — imported verbatim from parse-output.ts's TOPIC_TAG_VALUES. */
export const TOPIC_TAG_VALUES = extractQuotedArray(_parseOutputSrc, "TOPIC_TAG_VALUES");
/** compliance_object_tags closed vocabulary — imported verbatim from parse-output.ts's COMPLIANCE_OBJECT_VALUES. */
export const COMPLIANCE_OBJECT_VALUES = extractQuotedArray(_parseOutputSrc, "COMPLIANCE_OBJECT_VALUES");
/** operational_scenario_tags core glossary — imported verbatim from system-prompt.ts's prose block. */
export const SCENARIO_GLOSSARY = extractScenarioGlossary(_systemPromptSrc);
export const SCENARIO_TAG_VALUES = SCENARIO_GLOSSARY.map((e) => e.tag);

const TOPIC_TAG_SET = new Set(TOPIC_TAG_VALUES);
const COMPLIANCE_OBJECT_SET = new Set(COMPLIANCE_OBJECT_VALUES);
const SCENARIO_TAG_SET = new Set(SCENARIO_TAG_VALUES);

/**
 * KEYWORD_MAP — the ONLY place a keyword/phrase is associated with a tag. Every `tag` value here is
 * validated (below, at module load) against the three SoT sets just extracted: an entry naming a tag
 * absent from its field's live vocabulary throws at import time rather than silently proposing a
 * dead/retired token (the exact drift-guard posture this module exists to honor — see file header).
 *
 * Keywords are literal phrases (lower-case; matching is case-insensitive), NOT regexes — kept as plain
 * strings so this table stays a readable data table, not a thicket of hand-escaped patterns. See
 * phraseRegex() for how a phrase becomes a safe, word-bounded matcher.
 */
export const KEYWORD_MAP = [
  // ── operational_scenario_tags — Ocean ──
  { field: "operational_scenario_tags", tag: "ocean-bunkering", keywords: ["bunkering", "bunker fuel", "marine bunker"] },
  { field: "operational_scenario_tags", tag: "ocean-fuel-blend-mandate", keywords: ["fuel blend", "fuel blending mandate", "marine fuel blend"] },
  { field: "operational_scenario_tags", tag: "ocean-emissions-MRV", keywords: ["MRV regulation", "monitoring, reporting and verification", "monitoring reporting and verification"] },
  { field: "operational_scenario_tags", tag: "vessel-port-call", keywords: ["port call", "port state control"] },
  { field: "operational_scenario_tags", tag: "vessel-shore-power", keywords: ["shore power", "cold ironing", "onshore power supply"] },
  { field: "operational_scenario_tags", tag: "vessel-CII-rating", keywords: ["carbon intensity indicator", "CII rating"] },
  { field: "operational_scenario_tags", tag: "green-shipping-corridor", keywords: ["green shipping corridor", "green corridor"] },
  // ── operational_scenario_tags — Air ──
  { field: "operational_scenario_tags", tag: "air-fueling", keywords: ["aviation fuel supply", "jet fuel mandate"] },
  { field: "operational_scenario_tags", tag: "SAF-blending", keywords: ["sustainable aviation fuel", "SAF blending", "SAF mandate"] },
  { field: "operational_scenario_tags", tag: "aircraft-emissions-CORSIA", keywords: ["CORSIA"] },
  { field: "operational_scenario_tags", tag: "aircraft-emissions-ETS", keywords: ["aviation ETS", "EU ETS for aviation", "airline emissions trading"] },
  { field: "operational_scenario_tags", tag: "airport-shore-power", keywords: ["airport shore power", "gate electrification", "ground power unit"] },
  // ── operational_scenario_tags — Road ──
  { field: "operational_scenario_tags", tag: "road-cabotage", keywords: ["cabotage"] },
  { field: "operational_scenario_tags", tag: "drayage", keywords: ["drayage"] },
  { field: "operational_scenario_tags", tag: "urban-truck-zone", keywords: ["low emission zone", "clean air zone", "ultra low emission zone", "urban truck zone"] },
  { field: "operational_scenario_tags", tag: "truck-CO2-standard", keywords: ["heavy-duty CO2 standard", "truck CO2 standard", "HDV CO2 standard"] },
  { field: "operational_scenario_tags", tag: "road-charging-infrastructure", keywords: ["charging infrastructure", "alternative fuels infrastructure"] },
  // ── operational_scenario_tags — Border-carbon/due-diligence ──
  { field: "operational_scenario_tags", tag: "CBAM-declaration", keywords: ["CBAM", "carbon border adjustment mechanism"] },
  { field: "operational_scenario_tags", tag: "EUDR-due-diligence", keywords: ["EUDR", "deforestation-free", "deforestation regulation"] },
  // ── operational_scenario_tags — Carbon/ETS ──
  { field: "operational_scenario_tags", tag: "ETS-allowance-purchase", keywords: ["purchase of allowances", "buy allowances", "ETS allowance purchase"] },
  { field: "operational_scenario_tags", tag: "ETS-allowance-surrender", keywords: ["surrender allowances", "allowance surrender"] },
  { field: "operational_scenario_tags", tag: "carbon-pricing-pass-through", keywords: ["cost pass-through", "carbon cost pass-through", "surcharge pass-through"] },
  { field: "operational_scenario_tags", tag: "carbon-border-adjustment", keywords: ["border carbon adjustment", "carbon border adjustment"] },
  // ── operational_scenario_tags — Reporting ──
  { field: "operational_scenario_tags", tag: "emissions-reporting-Scope1", keywords: ["scope 1 emissions"] },
  { field: "operational_scenario_tags", tag: "emissions-reporting-Scope3", keywords: ["scope 3 emissions", "value chain emissions"] },
  { field: "operational_scenario_tags", tag: "sustainability-report-CSRD", keywords: ["CSRD", "corporate sustainability reporting directive"] },
  { field: "operational_scenario_tags", tag: "disclosure-ISSB", keywords: ["ISSB", "international sustainability standards board"] },
  { field: "operational_scenario_tags", tag: "supplier-data-request", keywords: ["supplier data request", "supplier emissions data collection"] },
  // ── operational_scenario_tags — Packaging/products ──
  { field: "operational_scenario_tags", tag: "packaging-EPR-registration", keywords: ["extended producer responsibility", "EPR registration", "EPR scheme"] },
  { field: "operational_scenario_tags", tag: "packaging-recyclability-design", keywords: ["design for recyclability", "recyclability requirement"] },
  { field: "operational_scenario_tags", tag: "packaging-PFAS-restriction", keywords: ["PFAS restriction", "per- and polyfluoroalkyl", "forever chemicals"] },
  { field: "operational_scenario_tags", tag: "product-due-diligence-CSDDD", keywords: ["CSDDD", "corporate sustainability due diligence directive"] },

  // ── topic_tags (closed, 7) ──
  { field: "topic_tags", tag: "emissions", keywords: ["carbon pricing", "emissions trading", "greenhouse gas strategy"] },
  { field: "topic_tags", tag: "fuels", keywords: ["alternative maritime fuel", "e-fuel", "green hydrogen", "green ammonia"] },
  { field: "topic_tags", tag: "transport", keywords: ["vehicle emission standard", "fleet mandate", "zero emission vehicle"] },
  { field: "topic_tags", tag: "reporting", keywords: ["disclosure framework", "emissions accounting standard"] },
  { field: "topic_tags", tag: "packaging", keywords: ["PPWR", "circular economy packaging"] },
  { field: "topic_tags", tag: "corridors", keywords: ["port sustainability programme", "port sustainability program"] },
  // "research" is deliberately UNMAPPED: system-prompt.ts scopes it to content TYPE ("academic,
  // think-tank, industry news, innovation trackers"), not to a substantive keyword an instrument's own
  // title/brief text would carry — a keyword guess here risks exactly the false-positive class the
  // vocab-drift guard exists to prevent. Left empty on purpose (see the module-load self-check below).

  // ── compliance_object_tags (closed, 19) ──
  { field: "compliance_object_tags", tag: "carrier-ocean", keywords: ["ocean carrier", "shipping line"] },
  { field: "compliance_object_tags", tag: "carrier-air", keywords: ["air carrier", "airline operator"] },
  { field: "compliance_object_tags", tag: "carrier-road", keywords: ["road carrier", "motor carrier"] },
  { field: "compliance_object_tags", tag: "carrier-rail", keywords: ["rail carrier", "railway undertaking"] },
  { field: "compliance_object_tags", tag: "vessel-operator", keywords: ["vessel operator", "shipowner"] },
  { field: "compliance_object_tags", tag: "aircraft-operator", keywords: ["aircraft operator"] },
  { field: "compliance_object_tags", tag: "road-fleet-operator", keywords: ["fleet operator", "vehicle fleet operator"] },
  { field: "compliance_object_tags", tag: "freight-forwarder", keywords: ["freight forwarder"] },
  { field: "compliance_object_tags", tag: "customs-broker", keywords: ["customs broker"] },
  { field: "compliance_object_tags", tag: "nvocc", keywords: ["NVOCC", "non-vessel operating common carrier"] },
  { field: "compliance_object_tags", tag: "shipper", keywords: ["shipper obligation", "shippers must"] },
  { field: "compliance_object_tags", tag: "importer", keywords: ["importer obligation", "importers must"] },
  { field: "compliance_object_tags", tag: "exporter", keywords: ["exporter obligation", "exporters must"] },
  { field: "compliance_object_tags", tag: "manufacturer-producer", keywords: ["manufacturer obligation", "producer obligation"] },
  { field: "compliance_object_tags", tag: "distributor", keywords: ["distributor obligation"] },
  { field: "compliance_object_tags", tag: "port-operator", keywords: ["port operator", "port authority"] },
  { field: "compliance_object_tags", tag: "airport-operator", keywords: ["airport operator"] },
  { field: "compliance_object_tags", tag: "terminal-operator", keywords: ["terminal operator"] },
  { field: "compliance_object_tags", tag: "warehouse-operator", keywords: ["warehouse operator"] },
];

// Self-check: every KEYWORD_MAP entry names a tag that actually exists in its field's live vocabulary,
// TODAY, as just extracted from the real SoT files. A stale/retired token (or a typo) throws at import
// time — this table can never silently drift ahead of or behind the vocabulary it draws from.
for (const entry of KEYWORD_MAP) {
  const set = entry.field === "topic_tags" ? TOPIC_TAG_SET
    : entry.field === "compliance_object_tags" ? COMPLIANCE_OBJECT_SET
    : entry.field === "operational_scenario_tags" ? SCENARIO_TAG_SET
    : null;
  if (!set) throw new Error(`derive-tags: KEYWORD_MAP entry names an unknown field "${entry.field}".`);
  if (!set.has(entry.tag)) {
    throw new Error(
      `derive-tags: KEYWORD_MAP proposes tag "${entry.tag}" for field "${entry.field}", which is not in ` +
      `that field's live vocabulary (extracted from ${entry.field === "operational_scenario_tags" ? "system-prompt.ts" : "parse-output.ts"} ` +
      `just now). The vocabulary changed upstream — update or remove this KEYWORD_MAP entry, never widen the SoT from here.`,
    );
  }
}

/** Escape a literal string for safe embedding inside a RegExp. */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a case-insensitive, word-bounded matcher for a literal keyword phrase. `\b` only applies at a
 * word-char boundary, which is correct for every keyword in KEYWORD_MAP (all start/end alphanumeric). A
 * trailing optional "s" (never invented elsewhere in the phrase) lets a singular role keyword like
 * "vessel operator" also match its plain plural "vessel operators" — a shape difference, not a
 * different fact, so it stays within "the evidence really is text the item carries."
 * @param {string} phrase
 * @returns {RegExp}
 */
function phraseRegex(phrase) {
  return new RegExp(`\\b${escapeRe(phrase)}s?\\b`, "i");
}

/**
 * Derive tag PROPOSALS for one item. PURE, deterministic — same input always produces the same output.
 * Never mutates `item`; never touches a DB; never invents a tag token outside KEYWORD_MAP.
 * @param {{id:string, title?:string|null, canonical_instrument_key?:string|null,
 *   jurisdiction_iso?:string[]|string|null, jurisdictions?:string[]|null, full_brief?:string|null}} item
 * @returns {{itemId:string, proposals:Array<{field:string, tag:string, evidence:string, confidence:"high"|"medium"}>}}
 */
export function deriveTags(item) {
  const it = item || {};
  const titleText = [it.title, it.canonical_instrument_key].filter(Boolean).join(" · ");
  const bodyText = String(it.full_brief || "");

  // key: `${field}|${tag}` -> best proposal found so far (high beats medium; first-found wins a tie)
  const best = new Map();
  for (const entry of KEYWORD_MAP) {
    const key = `${entry.field}|${entry.tag}`;
    for (const kw of entry.keywords) {
      const re = phraseRegex(kw);
      const titleMatch = titleText.match(re);
      if (titleMatch) {
        const existing = best.get(key);
        if (!existing || existing.confidence !== "high") {
          best.set(key, { field: entry.field, tag: entry.tag, evidence: titleMatch[0], confidence: "high" });
        }
        continue; // title match already secures the strongest tier for this keyword; no need to also body-scan it
      }
      const bodyMatch = bodyText.match(re);
      if (bodyMatch && !best.has(key)) {
        best.set(key, { field: entry.field, tag: entry.tag, evidence: bodyMatch[0], confidence: "medium" });
      }
    }
  }

  // Cap per field at the vocabulary's own emission ceiling — highest confidence first, tag name
  // ascending as the deterministic tiebreak (mirrors discover.mjs's PER_TAG_CAP tie-break posture).
  const byField = { operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] };
  for (const p of best.values()) byField[p.field].push(p);
  const rank = { high: 0, medium: 1 };
  const proposals = [];
  for (const field of Object.keys(byField)) {
    byField[field].sort((a, b) => (rank[a.confidence] - rank[b.confidence]) || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
    proposals.push(...byField[field].slice(0, FIELD_CAPS[field]));
  }

  return { itemId: it.id, proposals };
}
