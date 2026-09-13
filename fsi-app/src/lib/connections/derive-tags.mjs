// derive-tags.mjs — PURE, deterministic, $0 tag DERIVATION for one item's title, canonical instrument
// key / CELEX descriptor, jurisdiction fields, and grounded brief text. Fixes the August-census-wave
// defect: items minted with EMPTY operational_scenario_tags / compliance_object_tags / topic_tags score
// ZERO edges in discover.mjs (that module reads exactly those three fields — see its own header — plus
// source_id and jurisdiction; a shared_scenario/shared_compliance_object/shared_jurisdiction_topic basis
// can never fire against an empty array). This module NEVER writes a DB row and NEVER decides a tag is
// true — it only PROPOSES candidates, each carrying the evidence span that justified it AND the
// confidence tier that evidence supports (propose-tags.mjs / apply-tags.mjs carry the write path; see
// those files). As of 2026-09-03 (operator ruling; see apply-tags.mjs's header) the write path no longer
// routes every proposal through operator ratification: a DETERMINISTIC, high-confidence proposal (see
// "CONFIDENCE, EXPOSED" below) auto-adopts with recorded provenance; only the residue this module itself
// marks lower-confidence, or the zero-proposal case, still surfaces as a flag for a human to review.
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
//
// CONFIDENCE, EXPOSED (operator ruling, 2026-09-03 — see apply-tags.mjs's header for the auto-adoption
// path this feeds). Every proposal already carries `confidence: "high"|"medium"` (see "CONFIDENCE TIERS"
// above) — an ordinal signal grounded directly in this module's own evidence: WHERE the matched text
// lives (title/instrument-key identity text vs. full_brief body text), not a fabricated score. That is
// the only independent confidence dimension this module's evidence supports today: a KEYWORD_MAP tag can
// match via several of its own `keywords` phrases at once (see deriveTags' `best` map), but those are
// synonyms for the SAME fact, not independent corroboration, so counting them would inflate confidence
// on the noun-phrase-count of a single keyword list entry rather than on genuinely separate evidence —
// this module deliberately does not do that. CONFIDENCE_RANK/meetsConfidence below make the existing two
// tiers mechanically comparable for a threshold decision, WITHOUT changing deriveTags()'s own output
// shape or values (every existing test in this file's sibling `.test.mjs` still holds byte-for-byte).

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

// CONFIDENCE_RANK / meetsConfidence — see the "CONFIDENCE, EXPOSED" header note above. Ordinal, not a
// probability: "high" (title/instrument-key match) always outranks "medium" (body-only match). An
// unrecognized confidence value ranks 0 (below every real tier) so a caller can filter externally-sourced
// proposals (e.g. a stored PROPOSALS_JSON blob) without a defensive type check at every call site.
export const CONFIDENCE_RANK = Object.freeze({ high: 2, medium: 1 });

/**
 * True when `confidence` is at least as strong as `threshold` on this module's own two-tier ordinal
 * scale (high > medium > anything else). PURE.
 * @param {string} confidence
 * @param {"high"|"medium"} threshold
 * @returns {boolean}
 */
export function meetsConfidence(confidence, threshold) {
  const rank = (c) => CONFIDENCE_RANK[c] ?? 0;
  return rank(confidence) >= rank(threshold);
}

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
/** operational_scenario_tags core glossary — imported verbatim from system-prompt.ts's prose block. NOT
 *  exported (lane DEAD-EXEC, 2026-09-04): used only within this file (SCENARIO_TAG_VALUES below) — no
 *  external importer names it directly, per the wiring audit's Appendix B (dead exports, 2026-09-04);
 *  SCENARIO_TAG_VALUES remains the exported, consumed shape. */
const SCENARIO_GLOSSARY = extractScenarioGlossary(_systemPromptSrc);
export const SCENARIO_TAG_VALUES = SCENARIO_GLOSSARY.map((e) => e.tag);

const TOPIC_TAG_SET = new Set(TOPIC_TAG_VALUES);
const COMPLIANCE_OBJECT_SET = new Set(COMPLIANCE_OBJECT_VALUES);
const SCENARIO_TAG_SET = new Set(SCENARIO_TAG_VALUES);

/**
 * KEYWORD_MAP -- the ONLY place a keyword/phrase is associated with a tag. GENERATED (D21,
 * defect-fix-plan-2026-09-12): built from the three live vocabularies just extracted above, PLUS
 * CURATED_SYNONYMS below, so that every tag the vocabulary carries today -- and every tag a future
 * vocabulary edit adds -- gets at least its own name as a keyword automatically, with no hand-typed
 * KEYWORD_MAP edit required. This replaces the pre-D21 hand-authored array (which left many tags
 * covered only by narrow synonym phrases that never included the tag's own plain name -- the exact
 * defect D21 fixes: an item titled "The Emissions Performance Standard (Enforcement) (Wales)
 * Regulations 2015" carried no derivable topic_tags because "emissions trading"/"carbon pricing" were
 * the only topic_tags:emissions keywords, and neither occurs in that title).
 *
 * ownNameForms(tag) (below) is the GENERATOR half: every tag gets its own literal name as a keyword,
 * and -- for a hyphenated tag -- the hyphen form AND the space form (e.g. "aircraft-operator" and
 * "aircraft operator"), per the dispatch's own example. This alone guarantees the "every vocabulary
 * tag has at least one keyword" invariant independent of CURATED_SYNONYMS ever being updated.
 *
 * CURATED_SYNONYMS is the reviewed half: every phrase this table carried BEFORE D21 (preserved
 * verbatim -- "the existing phrases stay"), plus plain inflections (plural/-ing/-ed forms a bare tag
 * name's own regex trailing-`s?` cannot produce, e.g. "emissions" -> "emission"/"emitting") and the
 * industry synonyms the plan names for aircraft-operator ("air carrier", "airline") and reviewed
 * likewise for its siblings.
 *
 * SUPPRESS_OWN_NAME (below) names the three exceptions, each with its evidence: a bare own-name
 * keyword for these specific tags was checked against this module's own real-corpus regression
 * coverage (tag-yield.fixture.test.mjs's 178-item snapshot; apply-tags.test.mjs; tag-aliases.test.mjs)
 * and found to either duplicate a sibling table's deliberately-narrower design or regress a passing
 * fixture -- see the comment on each entry. Every suppressed tag still carries >= 1 keyword via
 * CURATED_SYNONYMS, so the "never lacks a keyword" invariant still holds for it.
 *
 * Keywords are literal phrases (matching is case-insensitive regardless of the case written here), NOT
 * regexes -- see phraseRegex() for how a phrase becomes a safe, word-bounded matcher.
 */

/**
 * A vocabulary tag's own-name keyword forms: the tag exactly as written, plus -- only when the tag is
 * hyphenated -- the same words joined by spaces instead (e.g. "carrier-ocean" -> ["carrier-ocean",
 * "carrier ocean"]). PURE. This is the GENERATOR half of KEYWORD_MAP: called for every live vocabulary
 * tag (buildKeywordMap below), so a tag added to a vocabulary tomorrow gets this for free.
 * @param {string} tag
 * @returns {string[]}
 */
export function ownNameForms(tag) {
  const spaced = tag.replace(/-/g, " ");
  return spaced === tag ? [tag] : [tag, spaced];
}

// Fix round 1 (review-l13.md, CONDITIONAL FAIL; defect-fix-plan-2026-09-12 D21 fix round 1). Rule: a
// tag's own name may be suppressed only when every corpus-fixture item whose title or text carries that
// bare word still derives the tag through another keyword -- a suppression can never remove a tag's
// only coverage. `topic_tags:packaging` FAILED this rule (a real corpus item, "The Packaging (Essential
// Requirements) (Amendment) Regulations 2009", carried the bare word and derived NOTHING at all through
// the full production pipeline -- exactly the "no derivable tags on an obviously on-topic item" failure
// D21 exists to close) and leaves this list; its own name is a true positive on the corpus.
// `compliance_object_tags:exporter` carried no named measurement to begin with, and a direct check
// against the same 178-item snapshot finds ZERO real bare-"exporter" hits at all, so the analogy that
// justified it (grouped with importer/shipper) is unsupported by this corpus; it leaves the list too.
// Re-checking the remaining nine against the SAME real snapshot for THIS fix round also found
// `compliance_object_tags:shipper` (2 real hits, BOTH genuine on-topic uses -- "A shipper of solid bulk
// cargo... must make a declaration" (Merchant Shipping (Prevention of Pollution by Garbage from Ships)
// Regulations 2020); a FLEGT timber-licence definition naming "a consignor or a shipper") and
// `compliance_object_tags:distributor` (9 real hits, 8 of them genuine EU product-compliance "distributor"
// definitions -- RoHS 2011/65/EU, the UK Producer Responsibility (Packaging Waste) Regulations 2024, the
// F-gas Regulation (EU) 2024/573, tyre-labelling Regulation (EU) 2020/740, the electricity-market
// Directive (EU) 2019/944 -- each of which imposes real "distributor" obligations) carry the SAME defect
// as packaging: their prior grouped justification named only ONE anecdotal air-permitting mention and was
// never checked item-by-item. Both leave the list for the same reason packaging does. The remaining six
// each carry per-tag, item-and-phrase evidence below; "no other change" beyond these four removals plus
// the required evidence comments and the corpus-fixture test (see tag-yield.fixture.test.mjs) is made.
//
// Fix round 2 (review-l13.md, "2026-09-13: Re-review, fix round 1", CONDITIONAL FAIL). The fix-round-1
// corpus-fixture test enforced a WEAKER rule than the coordinator's own: it required only that a
// title-level hit on a suppressed tag's bare name derive SOME tag, not the specific suppressed tag the
// title names. Five real corpus items met that weaker bar while missing the tag their own title is
// actually about: "The Packaging Waste (Data Reporting) (England) Regulations 2023 (revoked)" and its
// 2024 amendment (title names topic_tags:reporting, derived only topic_tags:packaging); "The Sulphur
// Content of Liquid Fuels (England and Wales) (Amendment) Regulations 2014" (title names
// topic_tags:fuels, derived only emissions/reporting); "The Renewable Transport Fuel Obligations
// (Amendment) Order 2009" and its 2011 sibling (title names topic_tags:transport, derived only
// fuels/emissions/reporting). Three curated, title-scoped phrases close all five (see CURATED_SYNONYMS
// below for the per-tag comment and evidence on each): "data reporting" (topic_tags:reporting), "liquid
// fuels" (topic_tags:fuels), and "transport fuel" (added to BOTH topic_tags:fuels and
// topic_tags:transport, per the coordinator's own spec that this phrase derives both tags together).
// Checked directly against all 178 real corpus titles AND full_brief bodies this fix round: none of the
// three phrases matches any OTHER fixture item, so no tag needed to leave SUPPRESS_OWN_NAME this round
// (unlike fix round 1, where packaging/exporter/shipper/distributor did leave it). See
// tag-yield.fixture.test.mjs for the tightened per-tag version of the corpus-fixture test this closes.
export const SUPPRESS_OWN_NAME = new Set([
  // apply-tags.test.mjs's D15 re-derivation fixture ("This instrument establishes new CBAM reporting
  // duties for importers.") is written to derive ONLY operational_scenario_tags:CBAM-declaration from
  // that sentence, independently re-run and confirmed still passing (review-l13.md). A bare "reporting"
  // keyword would also fire on the incidental word "reporting" in that sentence (which is not about the
  // reporting topic at all), changing the test's asserted patch. This is a DIFFERENT evidence kind than
  // the corpus-measured entries below (a synthetic fixture, not a real corpus item), named here exactly
  // as it was reviewed and accepted: review-l13.md's "Checks that passed" lists this suppression, with
  // importer's below, as one of the two "test-tied" (not corpus-measured) exceptions.
  // topic_tags:reporting still gets its plain inflections (report/reports/reported -- see
  // CURATED_SYNONYMS) which do NOT match "reporting" (a different word under \b word-boundary
  // matching), so real "report"/"reports" title/body text is still covered.
  "topic_tags|reporting",
  // Same fixture, same sentence: "...for importers." A bare "importer" keyword would also fire on this
  // incidental plural mention. compliance_object_tags:importer keeps its existing narrower phrases
  // ("importer obligation", "importers must"). Same test-tied evidence kind as reporting above.
  "compliance_object_tags|importer",
  // MEASURED (fix round 1) against the real 178-item record-grade snapshot: item "The Vehicle Excise
  // Duty (Reduced Pollution) Regulations 1998" carries bare "fuel" in "...access to the engine and the
  // fuel and exhaust systems..." -- a vehicle-inspection procedure clause, not fuels-policy content.
  // topic_tags:fuels keeps its pre-D21 curated phrases only.
  "topic_tags|fuels",
  // MEASURED (fix round 1): item "The Vehicle Excise Duty (Reduced Pollution) Regulations 1998" (the
  // same instrument) also carries bare "Transport" in "...Secretary of State for the Environment,
  // Transport and the Regions..." -- a UK government DEPARTMENT NAME, not the transport topic. Bare
  // "transport" is also the platform's own domain word, appearing incidentally in most freight-adjacent
  // documents (measured: 69/178 items). topic_tags:transport keeps its pre-D21 curated phrases only.
  "topic_tags|transport",
  // MEASURED (fix round 1); RE-MEASURED (fix round 2, review-l13.md, 2026-09-13, wide-input method):
  // bare "corridor" hits 51 of 178 items in the snapshot, 50 of them the SAME platform-generated GAP note
  // ("No verbatim UN/LOCODE port-pair and mode were located together in the captured source text for
  // this record-grade item -- corridor identity is only stated when both ends are named together"), e.g.
  // on "Minor New Source Review Program Air Permitting Public Participation Requirements" -- boilerplate
  // the mint pipeline itself writes on any record-grade item lacking a resolved corridor, not real source
  // content. topic_tags:corridors keeps its pre-D21 curated phrases only.
  "topic_tags|corridors",
  // "research" previously had ZERO keywords (D21's evidenced gap). MEASURED (fix round 1); RE-MEASURED
  // (fix round 2, review-l13.md, 2026-09-13, wide-input method): bare "research" hits 85 of 178 items
  // (48%) in the snapshot -- e.g. item "Minor New Source Review Program Air Permitting Public
  // Participation Requirements" carries "...U.S. EPA, Office of State Air Partnerships, Permitting &
  // Program Support Division, ... Research Triangle Park, NC 27711..." -- an EPA office's postal address
  // (a place name in North Carolina), zero connection to research-finding content. CURATED_SYNONYMS gives
  // topic_tags:research the specific two-word phrase "research finding" instead (system-prompt.ts's own
  // term for this item type), which still satisfies "every vocabulary tag has at least one keyword"
  // without the bare word's corpus noise.
  "topic_tags|research",
]);

/**
 * Curated extra keyword phrases per tag, keyed `${field}|${tag}`. Every phrase this table carried
 * before D21 is preserved verbatim (grouped by the same Ocean/Air/Road/... families as before); D21
 * adds plain inflections and the plan's named industry synonyms. A tag with no entry here relies
 * entirely on ownNameForms() (still guaranteed >= 1 keyword).
 * @type {Record<string, string[]>}
 */
const CURATED_SYNONYMS = {
  // ── operational_scenario_tags — Ocean ──
  "operational_scenario_tags|ocean-bunkering": ["bunkering", "bunker fuel", "marine bunker"],
  "operational_scenario_tags|ocean-fuel-blend-mandate": ["fuel blend", "fuel blending mandate", "marine fuel blend"],
  "operational_scenario_tags|ocean-emissions-MRV": ["MRV regulation", "monitoring, reporting and verification", "monitoring reporting and verification"],
  "operational_scenario_tags|vessel-port-call": ["port call", "port state control"],
  "operational_scenario_tags|vessel-shore-power": ["shore power", "cold ironing", "onshore power supply"],
  "operational_scenario_tags|vessel-CII-rating": ["carbon intensity indicator", "CII rating"],
  "operational_scenario_tags|green-shipping-corridor": ["green shipping corridor", "green corridor"],
  // ── operational_scenario_tags — Air ──
  "operational_scenario_tags|air-fueling": ["aviation fuel supply", "jet fuel mandate"],
  "operational_scenario_tags|SAF-blending": ["sustainable aviation fuel", "SAF blending", "SAF mandate"],
  "operational_scenario_tags|aircraft-emissions-CORSIA": ["CORSIA"],
  "operational_scenario_tags|aircraft-emissions-ETS": ["aviation ETS", "EU ETS for aviation", "airline emissions trading"],
  "operational_scenario_tags|airport-shore-power": ["airport shore power", "gate electrification", "ground power unit"],
  // ── operational_scenario_tags — Road ──
  "operational_scenario_tags|road-cabotage": ["cabotage"],
  "operational_scenario_tags|drayage": ["drayage"],
  "operational_scenario_tags|urban-truck-zone": ["low emission zone", "clean air zone", "ultra low emission zone", "urban truck zone"],
  "operational_scenario_tags|truck-CO2-standard": ["heavy-duty CO2 standard", "truck CO2 standard", "HDV CO2 standard"],
  "operational_scenario_tags|road-charging-infrastructure": ["charging infrastructure", "alternative fuels infrastructure"],
  // ── operational_scenario_tags — Border-carbon/due-diligence ──
  "operational_scenario_tags|CBAM-declaration": ["CBAM", "carbon border adjustment mechanism"],
  "operational_scenario_tags|EUDR-due-diligence": ["EUDR", "deforestation-free", "deforestation regulation"],
  // ── operational_scenario_tags — Carbon/ETS ──
  "operational_scenario_tags|ETS-allowance-purchase": ["purchase of allowances", "buy allowances", "ETS allowance purchase"],
  "operational_scenario_tags|ETS-allowance-surrender": ["surrender allowances", "allowance surrender"],
  "operational_scenario_tags|carbon-pricing-pass-through": ["cost pass-through", "carbon cost pass-through", "surcharge pass-through"],
  "operational_scenario_tags|carbon-border-adjustment": ["border carbon adjustment", "carbon border adjustment"],
  // ── operational_scenario_tags — Reporting ──
  "operational_scenario_tags|emissions-reporting-Scope1": ["scope 1 emissions"],
  "operational_scenario_tags|emissions-reporting-Scope3": ["scope 3 emissions", "value chain emissions"],
  "operational_scenario_tags|sustainability-report-CSRD": ["CSRD", "corporate sustainability reporting directive"],
  "operational_scenario_tags|disclosure-ISSB": ["ISSB", "international sustainability standards board"],
  "operational_scenario_tags|supplier-data-request": ["supplier data request", "supplier emissions data collection"],
  // ── operational_scenario_tags — Packaging/products ──
  "operational_scenario_tags|packaging-EPR-registration": ["extended producer responsibility", "EPR registration", "EPR scheme"],
  "operational_scenario_tags|packaging-recyclability-design": ["design for recyclability", "recyclability requirement"],
  "operational_scenario_tags|packaging-PFAS-restriction": ["PFAS restriction", "per- and polyfluoroalkyl", "forever chemicals"],
  "operational_scenario_tags|product-due-diligence-CSDDD": ["CSDDD", "corporate sustainability due diligence directive"],

  // ── topic_tags (closed, 7) ── own name auto-added via ownNameForms() except where SUPPRESS_OWN_NAME
  // says otherwise; entries below are the pre-D21 phrases plus D21's plain inflections.
  "topic_tags|emissions": ["carbon pricing", "emissions trading", "greenhouse gas strategy", "emission", "emitting"],
  // own name "fuels" SUPPRESSED (see SUPPRESS_OWN_NAME, measured corpus noise) -- pre-D21 phrases plus
  // "motor fuel" (fix round 1, review-l13.md's corpus-fixture rule): "The Motor Fuel (Composition and
  // Content) (Amendment) Regulations 2001" carries bare "fuel" in its own title and, pre-fix, derived
  // ZERO tags at all through the full production pipeline -- the same defect class as packaging (D21's
  // own evidenced failure), found while writing the corpus-fixture test below. "motor fuel" is a
  // specific, corpus-verified phrase (not the noisy bare word) that closes this exact gap. Fix round 2
  // (review-l13.md, 2026-09-13): "liquid fuels" added -- the exact title phrase on "The Sulphur Content
  // of Liquid Fuels (England and Wales) (Amendment) Regulations 2014", which previously derived only
  // emissions/reporting despite its own title naming fuels as the subject; "transport fuel" added -- the
  // exact title phrase on both "The Renewable Transport Fuel Obligations (Amendment) Order 2009" and its
  // 2011 sibling (the coordinator's fix-round-2 spec states "transport fuel" derives both fuels and
  // transport, so this same phrase is also added to topic_tags:transport below). Checked against all 178
  // real corpus titles and full_brief bodies: both phrases match only their named items, no misfire.
  "topic_tags|fuels": ["alternative maritime fuel", "e-fuel", "green hydrogen", "green ammonia", "motor fuel", "liquid fuels", "transport fuel"],
  // own name "transport" SUPPRESSED (see SUPPRESS_OWN_NAME) -- pre-D21 phrases plus "transport fuel"
  // (fix round 2, review-l13.md, 2026-09-13): the exact title phrase on both "The Renewable Transport
  // Fuel Obligations (Amendment) Order 2009" and its 2011 sibling, which previously derived only
  // fuels/emissions/reporting despite their own title naming transport as the subject. Checked against
  // all 178 real corpus titles and full_brief bodies: matches only these two items, no misfire.
  "topic_tags|transport": ["vehicle emission standard", "fleet mandate", "zero emission vehicle", "transport fuel"],
  // own name "reporting" SUPPRESSED (see SUPPRESS_OWN_NAME) -- plain inflections still covered, and do
  // not themselves match the word "reporting" (different word under word-boundary matching). Fix round 2
  // (review-l13.md, 2026-09-13): "data reporting" added -- the exact title phrase on "The Packaging
  // Waste (Data Reporting) (England) Regulations 2023 (revoked)" and its 2024 amendment, both of which
  // previously derived topic_tags:packaging only despite their own title naming reporting as the
  // subject. Checked against all 178 real corpus titles and full_brief bodies: matches only these two
  // items, no misfire.
  "topic_tags|reporting": ["disclosure framework", "emissions accounting standard", "report", "reports", "reported", "data reporting"],
  // own name "packaging" SUPPRESSED (see SUPPRESS_OWN_NAME) -- plain inflections still covered.
  "topic_tags|packaging": ["PPWR", "circular economy packaging", "package", "packages", "packaged"],
  // own name "corridors" SUPPRESSED (see SUPPRESS_OWN_NAME, measured corpus noise) -- pre-D21 phrases only.
  "topic_tags|corridors": ["port sustainability programme", "port sustainability program"],
  // "research" previously had ZERO keywords (D21's own evidenced gap) but bare "research" was measured
  // noisy (see SUPPRESS_OWN_NAME) -- "research finding" (system-prompt.ts's own term for this item type)
  // is the one curated keyword, safely specific while still satisfying "at least one keyword."
  "topic_tags|research": ["research finding"],

  // ── compliance_object_tags (closed, 19) ── own name auto-added via ownNameForms() except where
  // SUPPRESS_OWN_NAME says otherwise; entries below are the pre-D21 phrases plus the plan's named
  // synonyms.
  "compliance_object_tags|carrier-ocean": ["ocean carrier", "shipping line"],
  "compliance_object_tags|carrier-air": ["air carrier", "airline operator"],
  "compliance_object_tags|carrier-road": ["road carrier", "motor carrier"],
  "compliance_object_tags|carrier-rail": ["rail carrier", "railway undertaking"],
  "compliance_object_tags|vessel-operator": ["vessel operator", "shipowner", "ship operator"],
  // "air carrier"/"airline" are the plan's own worked example for this tag.
  "compliance_object_tags|aircraft-operator": ["aircraft operator", "air carrier", "airline"],
  "compliance_object_tags|road-fleet-operator": ["fleet operator", "vehicle fleet operator"],
  "compliance_object_tags|freight-forwarder": ["freight forwarder", "forwarder"],
  "compliance_object_tags|customs-broker": ["customs broker"],
  "compliance_object_tags|nvocc": ["NVOCC", "non-vessel operating common carrier"],
  // own name "shipper" SUPPRESSED (see SUPPRESS_OWN_NAME, measured corpus noise) -- pre-D21 phrases only.
  "compliance_object_tags|shipper": ["shipper obligation", "shippers must"],
  // own name "importer" SUPPRESSED (see SUPPRESS_OWN_NAME) -- narrower pre-D21 phrases stay.
  "compliance_object_tags|importer": ["importer obligation", "importers must"],
  // own name "exporter" SUPPRESSED (see SUPPRESS_OWN_NAME, same generic-noun risk as importer/shipper)
  // -- pre-D21 phrases only.
  "compliance_object_tags|exporter": ["exporter obligation", "exporters must"],
  "compliance_object_tags|manufacturer-producer": ["manufacturer obligation", "producer obligation"],
  // own name "distributor" SUPPRESSED (see SUPPRESS_OWN_NAME, measured corpus noise) -- pre-D21 phrase only.
  "compliance_object_tags|distributor": ["distributor obligation"],
  "compliance_object_tags|port-operator": ["port operator", "port authority"],
  "compliance_object_tags|airport-operator": ["airport operator"],
  "compliance_object_tags|terminal-operator": ["terminal operator"],
  "compliance_object_tags|warehouse-operator": ["warehouse operator"],
};

// Self-check: every CURATED_SYNONYMS key names a (field, tag) pair that actually exists in its field's
// live vocabulary, TODAY, as just extracted from the real SoT files. A stale/retired token (or a typo)
// throws at import time -- this table can never silently drift ahead of or behind the vocabulary it
// draws from (same fail-closed posture the pre-D21 table used, applied to the curated half now).
function vocabSetFor(field) {
  return field === "topic_tags" ? TOPIC_TAG_SET
    : field === "compliance_object_tags" ? COMPLIANCE_OBJECT_SET
    : field === "operational_scenario_tags" ? SCENARIO_TAG_SET
    : null;
}
for (const key of [...Object.keys(CURATED_SYNONYMS), ...SUPPRESS_OWN_NAME]) {
  const sep = key.indexOf("|");
  const field = key.slice(0, sep);
  const tag = key.slice(sep + 1);
  const set = vocabSetFor(field);
  if (!set) throw new Error(`derive-tags: CURATED_SYNONYMS/SUPPRESS_OWN_NAME entry names an unknown field "${field}".`);
  if (!set.has(tag)) {
    throw new Error(
      `derive-tags: CURATED_SYNONYMS/SUPPRESS_OWN_NAME references tag "${tag}" for field "${field}", which is not ` +
      `in that field's live vocabulary (extracted from ${field === "operational_scenario_tags" ? "system-prompt.ts" : "parse-output.ts"} ` +
      `just now). The vocabulary changed upstream -- update or remove this entry, never widen the SoT from here.`,
    );
  }
}

/**
 * Dedupe a keyword list case-insensitively, keeping the FIRST spelling seen (order matters: it decides
 * which literal spelling deriveTags() records as "evidence" when several keywords in the same entry
 * would match the same text). PURE.
 * @param {string[]} keywords
 * @returns {string[]}
 */
function dedupeKeywords(keywords) {
  const seen = new Set();
  const out = [];
  for (const kw of keywords) {
    const key = kw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
  }
  return out;
}

/**
 * Build KEYWORD_MAP: for every tag in the three live vocabularies (in vocabulary order -- topic_tags,
 * then compliance_object_tags, then operational_scenario_tags), own-name forms first (unless
 * SUPPRESS_OWN_NAME says otherwise), then that tag's CURATED_SYNONYMS. GENERATED, not hand-typed -- see
 * the KEYWORD_MAP doc comment above for why. PURE.
 * @returns {Array<{field:string, tag:string, keywords:string[]}>}
 */
function buildKeywordMap() {
  const allTags = [
    ...TOPIC_TAG_VALUES.map((tag) => ({ field: "topic_tags", tag })),
    ...COMPLIANCE_OBJECT_VALUES.map((tag) => ({ field: "compliance_object_tags", tag })),
    ...SCENARIO_TAG_VALUES.map((tag) => ({ field: "operational_scenario_tags", tag })),
  ];
  return allTags.map(({ field, tag }) => {
    const key = `${field}|${tag}`;
    const own = SUPPRESS_OWN_NAME.has(key) ? [] : ownNameForms(tag);
    const curated = CURATED_SYNONYMS[key] || [];
    return { field, tag, keywords: dedupeKeywords([...own, ...curated]) };
  });
}

export const KEYWORD_MAP = buildKeywordMap();

// Self-check: every KEYWORD_MAP entry carries at least one keyword -- the invariant this whole
// generator exists to guarantee (D21: "so a new vocabulary tag can never lack a keyword"). Can only
// fail if a future edit adds a vocabulary tag to SUPPRESS_OWN_NAME without also giving it a
// CURATED_SYNONYMS entry; fails loudly rather than silently shipping an unmatchable tag.
for (const entry of KEYWORD_MAP) {
  if (!entry.keywords.length) {
    throw new Error(`derive-tags: KEYWORD_MAP entry ${entry.field}:${entry.tag} has zero keywords -- every vocabulary tag must carry at least one (D21).`);
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
