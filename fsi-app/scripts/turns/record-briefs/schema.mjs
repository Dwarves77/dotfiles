// scripts/turns/record-briefs/schema.mjs
//
// THE record-briefs ARTIFACT CONTRACT (task 3.2, brief-chain-build-plan-2026-09-11). Same shape as
// scripts/turns/ledger-verdicts's own contract (README.md + a pure, dependency-free validator that
// returns human-readable error strings, empty = valid): a session lane authors a batch of full briefs
// for record-grade stub items (task 3.1's --with-pool-text export hands it the pool text to read), this
// module validates the batch BEFORE task 3.4's driver writes anything, and a structural violation fails
// the whole file closed -- a producer bug, never guessed around.
//
// WHY A SEPARATE schema.mjs, NOT AN EMBEDDED VALIDATOR (unlike run-ledger-consume.mjs, which keeps
// validateVerdictsFile inline). Task 3.4 (the brief-apply driver, not yet built) is this contract's own
// consumer, the same relationship consumePortalCandidates/run-ledger-consume.mjs has -- but this task's
// own brief asks for the validator as its own file so 3.4 can `import { validateRecordBriefsFile } from
// "./record-briefs/schema.mjs"` without pulling in a driver's CLI surface (arg parsing, harness-run
// artifacts, fetch helpers) it does not need. Kept pure (no I/O) for the same reason every validator in
// this family is pure: a caller supplies whatever pool text it already has (poolTextByItemId below) --
// this module never fetches or reads a file itself.
//
// REUSE, NOT REIMPLEMENTATION (this task's own explicit instruction). Two things this validator does NOT
// reimplement:
//   (1) METADATA VOCABULARY -- src/lib/agent/parse-output.ts's parseAgentOutput (imported directly, a
//       plain relative .ts import; Node 24's native type-stripping makes this portable to the no-npm-ci
//       discipline job -- the SAME pattern scripts/lib/db.mjs already uses for
//       src/lib/sources/classify-source-role.ts, and scripts/turns/research-sweep.mjs already uses for
//       src/lib/intake/record-facts-research.mjs). parseAgentOutput's own internal vocabulary constants
//       (SEVERITY_VALUES, PRIORITY_VALUES, TOPIC_TAG_VALUES, COMPLIANCE_OBJECT_VALUES, the
//       severity->priority lock, the signal_band/theme format_type gates, THEME_VALUES from the live DB
//       CHECK) are module-private -- not exported -- so the only way to reuse them without copying is to
//       call the ONE exported function that applies them: parseAgentOutput(rawText). This module
//       therefore builds a SYNTHETIC rawText (buildSyntheticRawText, below) from the entry's own `body` +
//       `metadata` JSON and feeds it through the real parser -- exactly the technique task 3.3's own
//       brief names for the write site itself ("parsed = parseAgentOutput(injected.body + frontmatter)"),
//       applied here one task earlier, at validation time, so a batch that would fail the real write site
//       fails HERE first, for free, before any grounding cost is spent on it.
//   (2) VERBATIM-SPAN CHECKING -- src/lib/intake/record-facts.mjs's assertVerbatim (imported directly,
//       plain .mjs, zero transitive npm deps -- confirmed by reading its two imports,
//       src/lib/contracts/vocabularies.mjs and src/lib/entities/decisions.mjs, both plain ESM with no
//       imports of their own). Every FACT claim's source_span is re-checked against the item's own pool
//       text with the SAME case-insensitive-substring guard record-facts.mjs and
//       validate-mint-payload.mjs criterion 3 already use -- never a second, independently-maintained
//       verbatim check that could drift from the real one.
//
// ONE LOCAL VOCABULARY, NAMED AS A DUPLICATE, NOT SILENTLY. CLAIM_KIND_VALUES below (FACT/ANALYSIS/
// LEGAL/GAP) mirrors parse-output.ts's own CLAIM_KIND_VALUES verbatim -- that constant is ALSO
// module-private (parse-output.ts has no exported claims-array validator this task's interface calls
// for; the brief's reuse instruction names parse-output.ts for METADATA and record-facts.mjs for
// VERBATIM spans, not a claims-shape validator). Re-declared locally rather than reached for via a
// parse-output.ts export that does not exist today, the same judgment call record-facts.mjs's own
// assertVerbatim docstring makes for its own re-implementation ("re-implemented locally rather than
// imported so this module stays a single, from-scratch, zero-dependency file"). Exporting
// CLAIM_KIND_VALUES from parse-output.ts is a one-line follow-up if a future task wants zero duplication;
// it is a 4-value, closed, versioned-together vocabulary, not a drift-prone one.
//
// THE SYNTHETIC last_regenerated_at. The record-briefs metadata contract (this task's own Interfaces
// block) does NOT carry last_regenerated_at -- task 3.3's write site stamps the REAL one at persist time,
// the same "the write site owns the timestamp" posture canonical-pipeline.ts already has for a live
// generation. parseAgentOutput's required-field list demands it structurally (any ISO-8601-parseable
// string satisfies it), so buildSyntheticFrontmatter fills in a placeholder purely to satisfy that shape
// check -- it is never read back, never part of the validated entry, and never surfaced in this
// function's own return value.
//
// A KNOWN, NAMED LIMITATION OF THE SHARED FLAT-YAML FORMAT (not a defect introduced here). parseAgentOutput
// / parseYamlFrontmatter is a line-based parser with no multi-line block-scalar or comma-escaping support:
// every scalar field must be exactly one line with no embedded newline, and every inline-array item must
// contain no literal comma (the parser splits an array's inner content on ",", unconditionally). A
// free-text field (what_is_it, why_matters, cost_mechanism, penalty_range, enforcement_body,
// intersection_summary, or an open key_data entry) that violates either constraint cannot be represented
// in this format at all -- not by this validator, and not by task 3.3's own frontmatter builder, which
// will face the identical parser. buildSyntheticFrontmatter refuses such a value with a named error
// (entry + field) rather than silently truncating or mis-splitting it, so a batch that would corrupt at
// the real write site is caught here, honestly, before any grounding cost is spent.

import { parseAgentOutput, AgentOutputParseError } from "../../../src/lib/agent/parse-output.ts";
import { assertVerbatim } from "../../../src/lib/intake/record-facts.mjs";
import { scanBrief } from "../../../src/lib/agent/gate-a-scan.mjs";
import { extractSectionByHeading, extractSectionByNumber } from "../../../src/lib/agent/extract-sections.ts";
import { parseTimeline } from "../../../src/lib/agent/timeline-parse.mjs";
import { buildTimelineRows } from "../../../src/lib/agent/timeline-harvest.mjs";

export const RECORD_BRIEFS_SCHEMA_VERSION = "rb1-2026-09-12.3";
// 2026-09-12.3 (task 6.2b fix round 1, review-6.2b.md): five findings closed.
//   Finding 1 (critical) -- every claim now carries `section` (the canonical section key of the entry's
//     format_type), validated against the format's own section list and against the claim's own
//     source_span actually appearing in that section's extracted text. This replaces the prior
//     text-containment "attachment" heuristic (factClaimsAttachedTo), which had NO correspondent in the
//     live write path: canonical-pipeline.ts:1889 attaches a claim to a section via this SAME explicit
//     `.section` field (`sectionMap[String(c2.section)] || secs[0].id`), a field the record-briefs claim
//     shape never defined until now -- every lane claim landed under section 1, never the section its
//     content described. `factClaimsInSection` (below) replaces `factClaimsAttachedTo` everywhere.
//   Finding 2 (critical) -- the qualification-accounting mirror (MIRROR (e)) was nested inside the
//     depth-accounting line's own success branch, so it never ran when the accounting line was missing --
//     the state of every currently-applied batch. Un-nested: both mirrors now run independently whenever
//     "Substantive Requirements" is present, and both sets of refusals are reported together.
//   Finding 3 (important) -- the accounting line must be the LAST content in the section (a Shortfall
//     line may follow it; nothing else may). Enforced by checking the section's own trailing content after
//     the matched accounting line.
//   Finding 4 (important) -- the qualification "capture" check now matches the keyword in the claim's own
//     `source_span` (never free-form `claim_text`) with a negation guard (a span reading "No party is
//     exempt..." no longer satisfies "exception captured"), and the "absence" sentences now require a
//     named article/section citation ("No exceptions are stated in Articles 1 to 12.") rather than a fixed
//     phrase satisfiable regardless of the source.
//   Finding 5 (minor) -- a regulatory_fact_document entry whose "Substantive Requirements" section cannot
//     be extracted at all is now refused outright (a regulatory brief without that section is not
//     complete) instead of silently skipped; the misleading "same attachment test MIRROR (a) above already
//     uses" comment is corrected (Gate A has no per-section concept at all); RECORD_BRIEFS_SCHEMA_VERSION
//     gains a reader (`apply-record-briefs.mjs` stamps it into the run artifact's own `config`).
//
// 2026-09-12.2 (task 6.2b, brief-chain-build-plan-2026-09-11): two more pre-write refusals, added from
// task-6.1-audit.md's ranked fixes 1 and 2 -- a depth-accounting mirror ("Substantive Requirements" must
// end with an "Obligations surveyed: N; workspace-adjacent: M; extracted as FACT: K." line, K bounded by
// the FACT claims actually attached, a Shortfall line required when K < M or when a large pool (>200,000
// chars) still yields K < 5) and a qualification-accounting mirror (trajectory/exceptions/scope each
// either captured by an attached FACT claim or recorded absent with the README's prescribed sentence).
// Both apply only to regulatory_fact_document entries whose "Substantive Requirements" section is present.
// 2026-09-12.1 (task 6.1b, brief-chain-build-plan-2026-09-11): three new pre-write refusals, added after
// a 10-item pilot batch generated and sectioned cleanly, then quarantined 10/10 at the ground step for
// defects this validator could have caught before any grounding cost was spent -- see the three "MIRROR"
// blocks in validateRecordBriefsEntry below. Quarantine is never the end state of brief-apply (operator
// ruling, 2026-09-12); refusing HERE, naming the exact token or section, is how the lane fixes the source
// before a write is ever attempted.
//
// GUARDED MIRROR (fix round 1 follow-up, 2026-09-12): the criterion 4 mirror's per-format canonical
// section list (`SECTION_DEFS_BY_FORMAT_TYPE`, below) is a second copy of the real format registry
// (src/lib/agent/formats/*.ts via extract-registry.ts), kept here only because the real files import via
// "@/" tsconfig aliases glob-portability.test.mjs cannot resolve. A second copy drifts -- so this mirror's
// exact equality with the real registry (per format: key, heading, headingAlts) is a PROVEN fact, checked
// by `scripts/turns/record-briefs/section-list-drift.npmtest.mjs` (loaded through jiti, run by
// discipline.yml's "App unit tests requiring npm deps" step's named list), not an assumption a future
// registry edit could silently invalidate.

// Mirrors parse-output.ts's own (private) CLAIM_KIND_VALUES -- see header "ONE LOCAL VOCABULARY" above.
const CLAIM_KIND_VALUES = Object.freeze(["FACT", "ANALYSIS", "LEGAL", "GAP"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── criterion-4 mirror vocabulary -- ANOTHER named duplicate (same posture as CLAIM_KIND_VALUES above):
// mirrors scripts/mint/validate-mint-payload.mjs's own (module-private) ANALYSIS_LABEL_RE / LEGAL_CALLOUT
// / UNLABELED_MODAL_RE, itself "ported verbatim from migration 171's c_label_re / c_legal_req_re" per that
// file's own comment. Re-declared here rather than imported because validate-mint-payload.mjs exports
// none of the three (only validateMintPayload itself is exported). This mirror is DELIBERATELY STRICTER
// than the live DB rule: the DB's own unlabeled_assertion check also accepts a FACT claim attached to the
// section (`hasFactInSection`) as an alternative to a label/callout -- that escape is NOT available here,
// because claim-to-section attachment happens at write time (when a real `intelligence_item_sections` row
// exists to attach the claim to) and cannot be known from a record-briefs entry's flat `body` string. A
// batch that would pass the live DB check via that escape can still fail here; see README.md.
const ANALYSIS_LABEL_RE =
  /\*?(per the workspace's reading|analytical inference|industry interpretation|operational implication)(\s*\([^)]*\))?:\*?/i;
const LEGAL_CALLOUT = "*legal confirmation required:*";
const UNLABELED_MODAL_RE = /\b(requires|must|mandates|obligates|prohibits|applies to)\b/i;

// ── depth-accounting + qualification-accounting mirror vocabulary (task 6.2b, fix round 1 of
// task-6.1-audit.md's ranked fixes 1 and 2, 2026-09-12). The pilot audit's own numbers: two of the ten
// pilot items (2.59M and 965k char pools) returned 4-5 FACT claims in "Substantive Requirements" with no
// accounting of what was surveyed, and all ten items scored 0/10 on per-year trajectory and
// calculation-basis language with no way to tell "the source states little" apart from "the lane did not
// look far enough." Both refusals below apply ONLY when format_type is regulatory_fact_document AND the
// "Substantive Requirements" section is present with content -- a record-briefs entry authoring some OTHER
// format, or one that omits the section entirely, has nothing here to check (the omission itself is not
// this fix's scope; see task-6.1-audit.md's own structural-completeness finding, which already confirmed
// the section is present in every live pilot item).
const OBLIGATIONS_ACCOUNTING_RE =
  /Obligations surveyed:\s*(\d+);\s*workspace-adjacent:\s*(\d+);\s*extracted as FACT:\s*(\d+)\.?/i;
const SHORTFALL_LINE_RE = /^Shortfall:\s*\S.*$/im;
const LARGE_POOL_CHAR_THRESHOLD = 200_000;

// Fix round 1, finding 4 (polarity + source blindness): the qualification "capture" check now reads the
// claim's own verbatim `source_span` (never free-form `claim_text` the lane writes itself) and refuses a
// NEGATED span ("No party is exempt from this requirement" asserts the ABSENCE of an exception, not its
// presence). `NEGATION_WINDOW_CHARS` is a short word-count window immediately BEFORE the keyword match --
// it never inspects the match's own text, so "does not apply" (a genuine, correctly-polarized scope
// restriction) is never itself misread as negated by the word "not" it happens to contain.
const NEGATION_TOKEN_RE = /\b(no|not|none|never|nor)\b/i;
const NEGATION_WINDOW_CHARS = 24;
const EXCEPTION_KEYWORD_RE = /\b(except|exempt|carve-?out)\b/i;
const SCOPE_KEYWORD_RE = /\b(scope|does not apply|applies only|limited to)\b/i;

/** True when some claim in `claims` has a `source_span` containing `keywordRe`, with no negation token
 *  (no/not/none/never/nor) in the `NEGATION_WINDOW_CHARS` immediately before the match.
 *  @param {object[]} claims @param {RegExp} keywordRe @returns {boolean} */
function hasUnnegatedKeywordInSpan(claims, keywordRe) {
  for (const c of claims ?? []) {
    const span = String(c?.source_span ?? "");
    const m = keywordRe.exec(span);
    if (!m) continue;
    const before = span.slice(Math.max(0, m.index - NEGATION_WINDOW_CHARS), m.index);
    if (!NEGATION_TOKEN_RE.test(before)) return true;
  }
  return false;
}

// Fix round 1, finding 4: a fixed sentence with zero reference to the source is gameable regardless of
// what the source actually states -- these three now require a named article/section citation ("No
// exceptions are stated in Articles 1 to 12."), so a lane cannot paste the same three sentences into every
// brief unconditionally; the citation is exactly what a lane checking the real text would be able to name.
const ARTICLE_OR_SECTION_CITE = "(?:articles?|sections?)\\s+[^.\\n]+";
const TRAJECTORY_ABSENCE_RE = new RegExp(`\\bno phase-in (?:is|are) stated in ${ARTICLE_OR_SECTION_CITE}\\.`, "i");
const EXCEPTIONS_ABSENCE_RE = new RegExp(`\\bno exceptions? (?:is|are) stated in ${ARTICLE_OR_SECTION_CITE}\\.`, "i");
const SCOPE_ABSENCE_RE = new RegExp(`\\bno scope limits? (?:is|are) stated in ${ARTICLE_OR_SECTION_CITE}\\.`, "i");

/** FACT claims (from an entry's `claims[]`) whose explicit `.section` field equals `sectionKey` (fix round
 *  1, finding 1: replaces the prior text-containment "attachment" heuristic, which had no correspondent in
 *  the live write path -- canonical-pipeline.ts's own claim-to-section attachment keys off this SAME
 *  per-claim `.section` field). NEVER the Gate A mechanism (fix round 1, finding 7: Gate A/`scanBrief` is
 *  a whole-body scan with no section concept at all -- this is an unrelated, section-scoped filter).
 *  @param {object[]} claims @param {string} sectionKey @returns {object[]} */
function factClaimsInSection(claims, sectionKey) {
  if (!Array.isArray(claims)) return [];
  return claims.filter(
    (c) => c && typeof c === "object" && c.claim_kind === "FACT" && String(c.section) === String(sectionKey),
  );
}

function ilikeIncludes(haystack, needle) {
  return String(haystack ?? "").toLowerCase().includes(String(needle ?? "").toLowerCase());
}

// ── criterion-4 mirror section boundaries: the REAL section extraction, not a bespoke splitter (task
// 6.1b, fix round 1, finding 2). A bare `#{1,6}` splitter (the prior version of this file) draws section
// boundaries FINER than the write path does: src/lib/agent/formats/prose-extractor.ts's
// makeProseExtractor -- the ONE section-extractor every format's sectionBrief write actually runs
// through -- only recognises H1/H2 headings matching one of a format's own CANONICAL section names/
// numbers, and an H1-matched section's body runs to the NEXT H1, folding in any H2/H3+ sub-headings
// (extract-sections.ts's own header: "SB 253 et al. emit body sections as H2 sub-headings"). A bespoke
// `#{1,6}` split therefore isolates an early unlabeled sentence from a labeled sub-heading that, at the
// real database row, shares its section -- an over-refusal in the safer direction, but still wrong: a
// compliant lane emitting the documented H1-with-H2-subsections pattern was needlessly refused pre-write.
//
// REUSE, NOT A SECOND COPY OF THE ALGORITHM: extractSectionByNumber/extractSectionByHeading (already
// imported above, from extract-sections.ts, zero further imports) ARE the real boundary-finding
// functions makeProseExtractor itself calls, in the SAME number-first-then-heading-then-alts order.
// What IS duplicated here, of necessity and named as such (the same posture as CLAIM_KIND_VALUES/
// ANALYSIS_LABEL_RE above): the per-FORMAT_TYPE canonical SECTION LIST (heading/key/order/headingAlts),
// mirrored verbatim from each of the five src/lib/agent/formats/*.ts files' own `SECTIONS` arrays.
// extract-registry.ts (the real item_type -> FormatSpec dispatch) and every one of those five files
// import via "@/" tsconfig aliases, which glob-portability.test.mjs treats as a bare specifier the
// no-npm-ci job cannot resolve -- importing them here would break portability, so the (small, rarely-
// changing) DATA is mirrored instead of the (larger, already-reused) ALGORITHM.
// EXPORTED for scripts/turns/record-briefs/section-list-drift.npmtest.mjs -- the coordinator's own fix
// round 1 follow-up: a second copy of the format registry drifts, so this constant's equality with the
// REAL FormatSpec objects (src/lib/agent/formats/*.ts, loaded through jiti since they use "@/" aliases)
// is a proven fact, not an assumption. That test is the one place this mirror is checked against the
// registry; every other consumer (extractCanonicalSections, above) reads this exported constant, kept as
// the runtime source here for glob-portability (no npm deps, no jiti, in the plain `node --test` path).
export const SECTION_DEFS_BY_FORMAT_TYPE = Object.freeze({
  regulatory_fact_document: [
    { key: "1", heading: "Purpose and Scope of This Document" },
    { key: "2", heading: "What This Regulation Is and Why It Applies to the Workspace" },
    { key: "3", heading: "Issues Requiring Immediate Action" },
    { key: "4", heading: "How the Workspace Sits in the Compliance Chain" },
    { key: "5", heading: "Authoritative Guidance Document Analysis" },
    { key: "6", heading: "Anticipated Authoritative Guidance and Pending Regulatory Events" },
    { key: "7", heading: "Threshold Questions" },
    { key: "8", heading: "Substantive Requirements" },
    { key: "9", heading: "Product-Specific Compliance Status" },
    { key: "10", heading: "Registration and Reporting Obligations" },
    { key: "11", heading: "Operational System Requirements" },
    { key: "12", heading: "Exemptions and Edge Cases" },
    { key: "13", heading: "Adjacent Industry Research and Alternatives" },
    { key: "14", heading: "Confirmed Regulatory Timeline" },
    { key: "15", heading: "Sources" },
  ],
  research_summary: [
    { key: "1", heading: "What the Research Found", headingAlts: ["What the Research Is Investigating", "What the Research Found — OR What the Research Is Investigating"] },
    { key: "2", heading: "Why This Finding Matters Operationally and Commercially" },
    { key: "3", heading: "What the Finding Changes for Strategy, Claims, or Decisions" },
    { key: "4", heading: "Client Conversation Talking Points and Public Position" },
    { key: "5", heading: "What the Finding Does Not Resolve", headingAlts: ["What the Finding Does Not Resolve (+ forward timing)", "What the Finding Does Not Resolve + forward timing"] },
    { key: "6", heading: "Sources" },
  ],
  market_signal_brief: [
    { key: "1", heading: "What's Moving and What Triggered It" },
    { key: "2", heading: "Who's Driving It and What They Want" },
    { key: "3", heading: "Expected Trajectory and Conversion Triggers" },
    { key: "4", heading: "Operational and Cost Implications If It Materializes" },
    { key: "5", heading: "Competitive Implications" },
    { key: "6", heading: "Client Conversation Talking Points" },
    { key: "7", heading: "What the Workspace Should Do Now" },
    { key: "8", heading: "Sources" },
  ],
  technology_profile: [
    { key: "1", heading: "What's Being Tested or Deployed and By Whom" },
    { key: "2", heading: "What This Tells Us About Industry Trajectory" },
    { key: "3", heading: "Supplier Access and Procurement Reality" },
    { key: "4", heading: "Operational Fit by Transport Mode and Cargo Vertical" },
    { key: "5", heading: "Competitive Positioning Implications for the Workspace" },
    { key: "6", heading: "Conversational and Strategic Talking Points" },
    { key: "7", heading: "Time-to-Market, Procurement Window, and Action" },
    { key: "8", heading: "Sources" },
  ],
  operations_profile: [
    { key: "1", heading: "Operational Cost Baseline for the Region" },
    { key: "2", heading: "Feasibility of Specific Operational Choices" },
    { key: "3", heading: "Cost Comparison Against Alternatives" },
    { key: "4", heading: "Cross-Regional Strategic Implications" },
    { key: "5", heading: "Competitive Positioning in the Region" },
    { key: "6", heading: "Client Conversation Talking Points" },
    { key: "7", heading: "Pending Changes That Shift the Calculus" },
    { key: "8", heading: "Sources" },
  ],
});

// The canonical section key for "Substantive Requirements" in the regulatory_fact_document format --
// derived from the registry above rather than hand-typed, so a future registry edit that ever renumbered
// this section breaks this lookup LOUDLY (reading `.key` off `undefined`) instead of silently keeping a
// stale "8" the section-list-drift test would not itself catch (that test proves the registry MATCHES the
// real one, not that every literal elsewhere still points at the right entry within it).
const SUBSTANTIVE_REQUIREMENTS_KEY = SECTION_DEFS_BY_FORMAT_TYPE.regulatory_fact_document.find(
  (d) => d.heading === "Substantive Requirements",
).key;

/**
 * Extract the section bodies a real `sectionBrief` write would persist to `intelligence_item_sections`
 * for this `format_type` -- the SAME number-first-then-heading-then-alts walk makeProseExtractor runs,
 * over the SAME canonical section list. Content that falls outside every canonical section (a preamble,
 * a non-canonical heading standing alone) is never returned: the real write path never persists it
 * either, so scanning it here would be a false positive the live database can never reproduce.
 * @param {string} body @param {string|null|undefined} formatType
 * @returns {{heading:string, text:string}[]|null} null when formatType is unrecognised (caller decides)
 */
function extractCanonicalSections(body, formatType) {
  const defs = SECTION_DEFS_BY_FORMAT_TYPE[formatType];
  if (!defs) return null;
  const src = String(body ?? "");
  const rows = [];
  for (const def of defs) {
    let got = extractSectionByNumber(src, def.key);
    if (!(got && (got.contentMarkdown || "").trim())) {
      got = extractSectionByHeading(src, def.heading);
      for (const alt of def.headingAlts ?? []) {
        if (got && (got.contentMarkdown || "").trim()) break;
        got = extractSectionByHeading(src, alt);
      }
    }
    const text = (got?.contentMarkdown || "").trim();
    if (!text) continue;
    if (/^\*?no content for this section/i.test(text)) continue; // honest omission note -> not a row
    rows.push({ heading: def.heading, text });
  }
  return rows;
}

// ── timeline mirror -- the two heading variants extract-regulation-sections.ts's own (module-private)
// SECTION_HEADINGS["14"] accepts, reproduced here as the same two literal strings (never exported from
// that module, so this is the same named-duplicate posture as CLAIM_KIND_VALUES/ANALYSIS_LABEL_RE above).
// The section-sign form is written with a \u escape, never the literal glyph (this repo's own dash/
// section-sign ban), which matches the SAME character the live heading variant uses either way.
const TIMELINE_HEADING_VARIANTS = Object.freeze([
  "Confirmed Regulatory Timeline",
  "\u00A714 Confirmed Regulatory Timeline",
]);
// Only used for buildTimelineRows' is_completed flag, which this mirror never inspects (it only checks
// row COUNT) -- a fixed sentinel keeps this validator pure and deterministic rather than depending on the
// wall clock for a value that plays no part in any refusal decision here.
const TIMELINE_MIRROR_TODAY_ISO = "1970-01-01";

function findTimelineSection(body) {
  for (const variant of TIMELINE_HEADING_VARIANTS) {
    const extracted = extractSectionByHeading(String(body ?? ""), variant);
    if (extracted) return extracted;
  }
  return null;
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function isIsoTimestamp(v) {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

// ── synthetic-frontmatter serialization ─────────────────────────────────────────────────────────────
//
// Turns a record-briefs `metadata` JSON object into the flat-line YAML frontmatter text
// parseYamlFrontmatter (parse-output.ts, private) expects. PURE -- no I/O, throws a plain Error naming
// the offending field on anything the shared line-based format cannot represent (see the file header's
// "KNOWN, NAMED LIMITATION" note); the caller (validateRecordBriefsEntry) attaches the item id.

/** One scalar line's value: `null` for null/undefined, otherwise the trimmed string -- refusing a value
 *  that would be misread by the parser's own generic quote-stripping (a value whose first and last
 *  characters are BOTH `"` or BOTH `'` would have that pair silently stripped, corrupting content that
 *  was never meant to be a quoted literal) or that carries a literal newline (the parser has no
 *  multi-line scalar form; every field is exactly one line). @param {string|null|undefined} v
 *  @param {string} fieldName for the thrown message only */
function yamlScalar(v, fieldName) {
  if (v === null || v === undefined) return "null";
  if (typeof v !== "string") {
    throw new Error(`${fieldName} must be a string or null (got ${JSON.stringify(v)})`);
  }
  if (/\r|\n/.test(v)) {
    throw new Error(`${fieldName} contains a newline, which the shared flat-YAML frontmatter format cannot represent`);
  }
  const t = v.trim();
  if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
    throw new Error(
      `${fieldName} starts and ends with a matching quote character, which the shared parser would strip as a quoted literal`
    );
  }
  return t;
}

/** An inline `[a, b, c]` array line -- every item must be a plain string with no comma (the parser splits
 *  on "," unconditionally, with no escaping) and no newline. `[]` for an empty/absent array.
 *  @param {string[]|null|undefined} items @param {string} fieldName for the thrown message only */
function yamlInlineArray(items, fieldName) {
  if (items === null || items === undefined || items.length === 0) return "[]";
  if (!Array.isArray(items)) throw new Error(`${fieldName} must be an array (got ${JSON.stringify(items)})`);
  for (const item of items) {
    if (typeof item !== "string") throw new Error(`${fieldName} contains a non-string entry: ${JSON.stringify(item)}`);
    if (item.includes(",")) {
      throw new Error(
        `${fieldName} entry ${JSON.stringify(item)} contains a comma, which the shared inline-array format ` +
          `cannot represent (the parser splits on "," with no escaping)`
      );
    }
    if (/\r|\n/.test(item)) throw new Error(`${fieldName} entry ${JSON.stringify(item)} contains a newline`);
  }
  return `[${items.join(", ")}]`;
}

/** An inline-JSON line (requirement_trajectory's shape) -- JSON.stringify always escapes any embedded
 *  newline as `\n`, so this is always representable as one line regardless of the object's own content.
 *  `null` for null/undefined. @param {object|null|undefined} v */
function yamlInlineJson(v) {
  if (v === null || v === undefined) return "null";
  return JSON.stringify(v);
}

/**
 * Build the flat-line YAML frontmatter text parseAgentOutput expects, from a record-briefs `metadata`
 * JSON object. Exported for the test file's own direct coverage of the serialization edge cases (comma
 * guard, quote guard, newline guard) independent of the full validateRecordBriefsFile round trip.
 * @param {object} metadata
 * @returns {string}
 */
export function buildSyntheticFrontmatter(metadata) {
  const m = metadata ?? {};
  const lines = [
    `severity: ${yamlScalar(m.severity, "severity")}`,
    `priority: ${yamlScalar(m.priority, "priority")}`,
    `urgency_tier: ${yamlScalar(m.urgency_tier, "urgency_tier")}`,
    `format_type: ${yamlScalar(m.format_type, "format_type")}`,
    `topic_tags: ${yamlInlineArray(m.topic_tags, "topic_tags")}`,
    `signal_band: ${yamlScalar(m.signal_band, "signal_band")}`,
    `theme: ${yamlScalar(m.theme, "theme")}`,
    `operational_scenario_tags: ${yamlInlineArray(m.operational_scenario_tags, "operational_scenario_tags")}`,
    `compliance_object_tags: ${yamlInlineArray(m.compliance_object_tags, "compliance_object_tags")}`,
    `related_items: ${yamlInlineArray(m.related_items, "related_items")}`,
    `intersection_summary: ${yamlScalar(m.intersection_summary, "intersection_summary")}`,
    `sources_used: ${yamlInlineArray(m.sources_used, "sources_used")}`,
    // Synthetic -- see file header "THE SYNTHETIC last_regenerated_at". Never part of the validated entry.
    `last_regenerated_at: ${new Date().toISOString()}`,
    `regeneration_skill_version: ${yamlScalar(m.regeneration_skill_version, "regeneration_skill_version")}`,
    `what_is_it: ${yamlScalar(m.what_is_it ?? null, "what_is_it")}`,
    `why_matters: ${yamlScalar(m.why_matters ?? null, "why_matters")}`,
    `key_data: ${yamlInlineArray(m.key_data ?? [], "key_data")}`,
    `cost_mechanism: ${yamlScalar(m.cost_mechanism ?? null, "cost_mechanism")}`,
    `requirement_trajectory: ${yamlInlineJson(m.requirement_trajectory ?? null)}`,
    `penalty_range: ${yamlScalar(m.penalty_range ?? null, "penalty_range")}`,
    `enforcement_body: ${yamlScalar(m.enforcement_body ?? null, "enforcement_body")}`,
  ];
  return lines.join("\n");
}

/**
 * Build the synthetic rawText parseAgentOutput expects: `body`, then an opening `---` fence, the
 * frontmatter, then a closing `---` fence. findYamlBlock (parse-output.ts) locates the LAST `---\n`
 * before the trailing `---` as the opening fence -- since this fence is always inserted immediately
 * before the frontmatter with nothing else between, it is always found correctly regardless of whether
 * `body` itself contains its own literal "---" lines (a markdown rule, e.g.) earlier in the text.
 * @param {string} body @param {object} metadata @returns {string}
 */
export function buildSyntheticRawText(body, metadata) {
  const frontmatter = buildSyntheticFrontmatter(metadata);
  return `${body ?? ""}\n\n---\n${frontmatter}\n---\n`;
}

// ── claim validation ────────────────────────────────────────────────────────────────────────────────

/**
 * Validate one claim against the record-briefs claims[] shape, re-checking every FACT source_span
 * verbatim against `poolText` via record-facts.mjs's assertVerbatim (never a second, hand-rolled check).
 * Pure given `poolText` (no I/O of its own -- the caller supplies it, see validateRecordBriefsFile's
 * `poolTextByItemId` option). Every message names the item and the claim index.
 * @param {object} claim @param {number} i @param {string} itemId @param {string|undefined} poolText
 * @returns {string[]}
 */
export function validateRecordBriefsClaim(claim, i, itemId, poolText) {
  const errors = [];
  const at = (msg) => errors.push(`item ${itemId} claims[${i}]: ${msg}`);
  if (claim === null || typeof claim !== "object" || Array.isArray(claim)) {
    return [`item ${itemId} claims[${i}]: must be an object`];
  }
  if (!("slot_key" in claim) || (claim.slot_key !== null && typeof claim.slot_key !== "string")) {
    at("slot_key must be a string or null");
  }
  // Fix round 1, finding 1: every claim carries the canonical section key it attaches to (the SAME
  // per-claim field canonical-pipeline.ts's own write path keys off, `sectionMap[String(c2.section)]`) --
  // required here as a bare non-empty string; membership in the entry's own format_type section list, and
  // presence of this claim's source_span inside that section's own text, are checked at the entry level
  // (validateRecordBriefsEntry), which is where format_type and body are both known.
  if (!isNonEmptyString(claim.section)) {
    at('section must be a non-empty string (the canonical section key of the entry\'s format_type, e.g. "8" for Substantive Requirements)');
  }
  if (!CLAIM_KIND_VALUES.includes(claim.claim_kind)) {
    at(`claim_kind must be one of ${JSON.stringify(CLAIM_KIND_VALUES)} (got ${JSON.stringify(claim.claim_kind)})`);
  }
  if (typeof claim.claim_text !== "string" || claim.claim_text.trim() === "") {
    at("claim_text must be a non-empty string");
  }
  if (claim.source_url !== undefined && claim.source_url !== null && typeof claim.source_url !== "string") {
    at("source_url must be a string or null");
  }
  if (claim.source_id !== undefined && claim.source_id !== null) {
    if (typeof claim.source_id !== "string" || !UUID_RE.test(claim.source_id)) {
      at(`source_id must be a UUID or null (got ${JSON.stringify(claim.source_id)})`);
    }
  }
  if (claim.claim_kind === "FACT") {
    if (typeof claim.source_span !== "string" || claim.source_span.trim() === "") {
      at("FACT claim requires a non-empty source_span");
      return errors; // nothing to verbatim-check
    }
    if (!isNonEmptyString(claim.source_url) && !isNonEmptyString(claim.source_id)) {
      at("FACT claim requires source_url or source_id");
    }
    try {
      assertVerbatim(poolText, claim.source_span);
    } catch (err) {
      at(`source_span is not a verbatim substring of the item's pool text (${err.message})`);
    }
  } else if (claim.source_span !== undefined && claim.source_span !== null && typeof claim.source_span !== "string") {
    at("source_span must be a string or null when claim_kind is not FACT");
  }
  return errors;
}

// ── entry + file validation ─────────────────────────────────────────────────────────────────────────

/**
 * Validate one record-briefs entry: item_id/source_pool_hash/body shape, metadata (via the real
 * parseAgentOutput, see file header), and every claim (via validateRecordBriefsClaim above). Every
 * message names the item id and the offending field or claim index.
 * @param {object} entry @param {number} i @param {{poolTextByItemId?: Record<string,string>}} [opts]
 * @returns {string[]}
 */
export function validateRecordBriefsEntry(entry, i, opts = {}) {
  const poolTextByItemId = opts.poolTextByItemId ?? {};
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return [`entries[${i}]: must be an object`];
  }
  const itemId = isNonEmptyString(entry.item_id) ? entry.item_id : `entries[${i}]`;
  const errors = [];
  const at = (msg) => errors.push(`item ${itemId}: ${msg}`);

  if (!isNonEmptyString(entry.item_id)) at("item_id must be a non-empty string");
  else if (!UUID_RE.test(entry.item_id)) at(`item_id must be a UUID (got ${JSON.stringify(entry.item_id)})`);

  if (!isNonEmptyString(entry.source_pool_hash)) at("source_pool_hash must be a non-empty string");

  if (typeof entry.body !== "string" || entry.body.trim() === "") {
    at("body must be a non-empty string");
  }

  if (entry.metadata === null || typeof entry.metadata !== "object" || Array.isArray(entry.metadata)) {
    at("metadata must be an object");
  } else {
    try {
      const rawText = buildSyntheticRawText(typeof entry.body === "string" ? entry.body : "", entry.metadata);
      parseAgentOutput(rawText);
    } catch (err) {
      const msg = err instanceof AgentOutputParseError ? err.message : err?.message ?? String(err);
      at(`metadata: ${msg}`);
    }
  }

  if (!Array.isArray(entry.claims)) {
    at("claims must be an array");
  } else {
    const poolText = poolTextByItemId[entry.item_id];
    entry.claims.forEach((claim, ci) => {
      errors.push(...validateRecordBriefsClaim(claim, ci, itemId, poolText));
    });
  }

  const hasBody = typeof entry.body === "string" && entry.body.trim() !== "";
  const formatType = entry.metadata && typeof entry.metadata === "object" ? entry.metadata.format_type : null;

  // ── MIRROR (f): claim section attachment -- fix round 1, finding 1. The real write path attaches a
  // claim to a section via an explicit per-claim `.section` field (canonical-pipeline.ts:1889,
  // `sectionMap[String(c2.section)] || secs[0].id`), which the record-briefs claim shape never defined
  // until this task -- every lane claim silently attached to whatever section a live item's row at
  // section_order=1 happens to be, never the section its content actually describes. Requires (per claim,
  // once the basic non-empty-string check in validateRecordBriefsClaim already passed): the section key is
  // a member of the entry's own format_type's canonical section list, AND -- when the claim carries a
  // source_span -- that span is a verbatim (case-insensitive) substring of THAT section's own extracted
  // text (the SAME real extraction MIRRORs (b)/(d)/(e) use), so a claim cannot declare a section its own
  // evidence never actually appears in. Skipped entirely for an unrecognised/missing format_type (the
  // metadata vocabulary check above already refuses that entry on its own terms).
  if (Array.isArray(entry.claims)) {
    const claimSectionDefs = SECTION_DEFS_BY_FORMAT_TYPE[formatType];
    if (claimSectionDefs) {
      const validKeys = new Set(claimSectionDefs.map((d) => d.key));
      const sectionsForClaims = hasBody ? extractCanonicalSections(entry.body, formatType) ?? [] : [];
      const textByKey = new Map(
        claimSectionDefs.map((d) => [d.key, sectionsForClaims.find((s) => s.heading === d.heading)?.text ?? null]),
      );
      entry.claims.forEach((claim, ci) => {
        if (!claim || typeof claim !== "object" || !isNonEmptyString(claim.section)) return; // already refused above
        const atClaim = (msg) => errors.push(`item ${itemId} claims[${ci}]: ${msg}`);
        if (!validKeys.has(claim.section)) {
          atClaim(
            `section ${JSON.stringify(claim.section)} is not a canonical section key for format_type ` +
              `${JSON.stringify(formatType)} (valid: ${JSON.stringify([...validKeys])})`,
          );
          return;
        }
        if (isNonEmptyString(claim.source_span)) {
          const sectionText = textByKey.get(claim.section);
          if (!isNonEmptyString(sectionText) || !ilikeIncludes(sectionText, claim.source_span)) {
            atClaim(
              `source_span is not present in section ${JSON.stringify(claim.section)}'s own extracted text -- ` +
                "a claim's declared section must contain the sentence its source_span comes from",
            );
          }
        }
      });
    }
  }

  // ── MIRROR (a): Gate A -- every figure/date token scanBrief harvests from the body must be covered by
  // some FACT claim's own claim_text or source_span (see gate-a-scan.mjs). No `derivedCovered` set is
  // computed at authoring time (that requires a live DB lookup of grounded DERIVED claims -- see
  // gate-a-derived.mjs -- which this pure, offline validator has no access to and no need for: a
  // record-briefs entry carries no DERIVED claims of its own), so this mirror is scanBrief's LITERAL arm
  // only. README.md's authoring rules state the consequence plainly: every figure/date written in the
  // body is either inside a FACT claim's text or span, verbatim from the pool, or not written at all.
  //
  // [HYPOTHESIS] RESIDUAL (fix round 1, review finding 3, NOT closed by this task): this mirror proves
  // the body against the claims AS AUTHORED, at validate time -- it cannot prove they survive to ground
  // time. A claim can be dropped between mirror-time and ground-time for reasons that have nothing to do
  // with derivedCovered: `buildGateARow` (write-item.ts) scans `full_brief` against the claims that
  // SURVIVED grounding, not the full set the lane submitted. The pilot's own finding C is direct proof
  // this already fired once -- a target-match MISMATCH zeroed all claims for 4 items ("These four also
  // lost their record-grade slot claims to the re-section"), which would re-orphan every Gate A token
  // those claims used to cover, independent of derivedCovered. This task's fix C (own-URL match in
  // target-match.mjs) closes that mechanism for the three `identifierInUrl` forms it recognises (CELEX,
  // UK legislation, Federal Register); it does NOT close it for any item whose own-identifier shape isn't
  // one of those three, or for a claim dropped by a verbatim re-check against a live pool that changed
  // between when THIS validator read `poolTextByItemId` and when `groundBrief` re-checks against
  // whatever the pool is at ground time. MITIGATION (why this is bounded, not open-ended): `assertVerbatim`
  // already runs in THIS validator (validateRecordBriefsClaim, above) against the SAME pool text supplied
  // here, so a claim cannot be dropped for failing verbatim-ness that this validator itself already
  // confirmed passed -- a verbatim-clean claim can still be dropped ONLY by (a) a target-match hold on
  // the item's whole pool, or (b) the pool changing between validate-time and ground-time (a race this
  // validator cannot observe, since it is pure and offline). Ideally, this mirror's Gate A check would
  // also verify each FACT claim's source_span survives the SAME target-match check groundBrief applies,
  // so a claim the ground step would drop is never counted as coverage here either -- not built in this
  // task; tracked here and in README.md, not silently left undocumented.
  if (hasBody && Array.isArray(entry.claims)) {
    const factClaims = entry.claims
      .filter((c) => c && typeof c === "object" && c.claim_kind === "FACT")
      .map((c) => ({ claim_text: c.claim_text, source_span: c.source_span }));
    const gateA = scanBrief(entry.body, factClaims);
    if (gateA.orphan_count > 0) {
      const list = gateA.orphans.map((o) => `${JSON.stringify(o.token)} (${o.class})`).join(", ");
      at(
        `Gate A mirror: ${gateA.orphan_count} orphan token(s) in the body with no covering FACT claim: ${list}. ` +
          "Either add a FACT claim whose claim_text or source_span carries the token verbatim, or remove the token from the body.",
      );
    }
  }

  // ── MIRROR (b): criterion 4 -- every section whose text matches the unlabeled-modal pattern must carry
  // one of the four analysis labels or the legal callout INSIDE that same section, where "section" means
  // the SAME row the real write path would persist (extractCanonicalSections above -- fix round 1,
  // finding 2), not a bespoke finer split that could isolate an unlabeled sentence from a labeled
  // sub-heading the live database folds into the same row. Deliberately STRICTER than the live DB rule in
  // the one way that remains (see the ANALYSIS_LABEL_RE/LEGAL_CALLOUT/UNLABELED_MODAL_RE header comment
  // above): the DB's own check also accepts a FACT claim attached to the section as an alternative, which
  // this validator cannot evaluate pre-write (claim-to-section attachment happens at the real write site,
  // once a real intelligence_item_sections row exists). Content outside every canonical section (a
  // preamble, a non-canonical heading standing alone) is never checked -- the real write path never
  // persists it either. An unrecognised/missing format_type has no canonical section list to check
  // against; the metadata vocabulary check elsewhere in this function already refuses such an entry on
  // its own terms, so criterion 4 is silently skipped here rather than guessing a section list.
  if (hasBody) {
    const sections = extractCanonicalSections(entry.body, formatType);
    for (const section of sections ?? []) {
      if (
        UNLABELED_MODAL_RE.test(section.text) &&
        !(ANALYSIS_LABEL_RE.test(section.text) || ilikeIncludes(section.text, LEGAL_CALLOUT))
      ) {
        at(
          `criterion 4 mirror: unlabeled assertion in section ${JSON.stringify(section.heading)} -- matches /requires|must|mandates|obligates|prohibits|applies to/i ` +
            "with no *Analytical inference:*/*Industry interpretation:*/*Operational implication:* label and no *Legal Confirmation Required:* callout in that section.",
        );
      }
    }
  }

  // ── MIRROR (c): timeline -- the body must contain a "Confirmed Regulatory Timeline" section whose
  // entries, run through the SAME parser (timeline-parse.mjs) and buildTimelineRows (timeline-
  // harvest.mjs) the live write site uses, yield at least one row. "No item should be without some date
  // in the timeline" (operator ruling, 2026-09-12): every brief-apply item ends with at least one
  // item_timelines row, and this refuses BEFORE the write when that would not hold.
  if (hasBody) {
    const timelineSection = findTimelineSection(entry.body);
    if (!timelineSection) {
      at(
        'timeline mirror: body has no "Confirmed Regulatory Timeline" section (heading required -- ' +
          "the instrument's own adoption, publication, or entry-into-force date qualifies when no other dated milestone exists).",
      );
    } else {
      const parsedEntries = parseTimeline(timelineSection.contentMarkdown);
      const { rows, skipped } = buildTimelineRows(parsedEntries, TIMELINE_MIRROR_TODAY_ISO);
      if (rows.length === 0) {
        at(
          `timeline mirror: the "Confirmed Regulatory Timeline" section yields ZERO rows once parsed ` +
            `(the parser's own view: ${parsedEntries.length} raw entr${parsedEntries.length === 1 ? "y" : "ies"} found, ` +
            `${skipped.length} skipped as unparseable: ${JSON.stringify(skipped)}). Section text: ${JSON.stringify(timelineSection.contentMarkdown.slice(0, 500))}`,
        );
      }
    }
  }

  // ── MIRROR (d): depth accounting -- task-6.1-audit.md fix 1. "Substantive Requirements" must end with
  // an accounting line ("Obligations surveyed: N; workspace-adjacent: M; extracted as FACT: K.") so a
  // reader can tell "the source genuinely states little" apart from "the lane did not look far enough."
  // Applies only to regulatory_fact_document entries. Fix round 1, finding 5: a reg-doc entry whose
  // "Substantive Requirements" section cannot be extracted at all is now refused outright (a regulatory
  // brief without that section is not complete), not silently skipped as before.
  const isRegDoc = formatType === "regulatory_fact_document";
  let reqSectionText = null;
  if (isRegDoc && hasBody) {
    const sections = extractCanonicalSections(entry.body, formatType) ?? [];
    const reqSection = sections.find((s) => s.heading === "Substantive Requirements");
    if (reqSection) reqSectionText = reqSection.text;
  }
  if (isRegDoc && hasBody && reqSectionText === null) {
    at(
      'depth accounting: "Substantive Requirements" is not present (or has no extractable content) -- ' +
        "required for every regulatory_fact_document entry; a regulatory brief without this section is not complete.",
    );
  }
  if (reqSectionText !== null) {
    // Fix round 1, finding 1: K is counted against claims whose explicit `.section` field equals the
    // Substantive Requirements canonical key -- never the prior text-containment heuristic.
    const attached = factClaimsInSection(entry.claims, SUBSTANTIVE_REQUIREMENTS_KEY);
    const m = OBLIGATIONS_ACCOUNTING_RE.exec(reqSectionText);
    if (!m) {
      at(
        'depth accounting: "Substantive Requirements" must end with an accounting line in the form ' +
          '"Obligations surveyed: N; workspace-adjacent: M; extracted as FACT: K." -- missing.',
      );
    } else {
      const surveyed = Number(m[1]);
      const workspaceAdjacent = Number(m[2]);
      const extractedAsFact = Number(m[3]);
      const hasShortfallLine = SHORTFALL_LINE_RE.test(reqSectionText);
      if (extractedAsFact > attached.length) {
        at(
          `depth accounting: "extracted as FACT: ${extractedAsFact}" overstates the ${attached.length} FACT ` +
            `claim(s) this entry attaches to section ${JSON.stringify(SUBSTANTIVE_REQUIREMENTS_KEY)} ` +
            "(Substantive Requirements) -- K must not exceed the claims the section actually carries.",
        );
      }
      if (extractedAsFact < workspaceAdjacent && !hasShortfallLine) {
        at(
          `depth accounting: "extracted as FACT: ${extractedAsFact}" is less than "workspace-adjacent: ` +
            `${workspaceAdjacent}" with no "Shortfall: <reason>" line -- each shortfall needs its own ` +
            "one-line reason (e.g. \"duplicative of an already-stated obligation\").",
        );
      }
      const poolText = poolTextByItemId[entry.item_id];
      if (
        isNonEmptyString(poolText) &&
        poolText.length > LARGE_POOL_CHAR_THRESHOLD &&
        extractedAsFact < 5 &&
        !hasShortfallLine
      ) {
        at(
          `depth accounting: source pool is ${poolText.length} chars (over ${LARGE_POOL_CHAR_THRESHOLD}) and ` +
            `"extracted as FACT: ${extractedAsFact}" is under 5 with no "Shortfall: <reason>" line -- a ` +
            "large-pool item this thin needs an explicit accounting for why (also surfaced by N being stated).",
        );
      }
      void surveyed; // N is never fixed by the rule (task-6.1-audit.md fix 1); parsed only so the regex
      // captures it and a caller reading this function's behaviour sees it is read, not silently discarded.

      // Fix round 1, finding 3: the accounting line must be the LAST content in the section -- a
      // Shortfall line (or several) may follow it, nothing else may. A lane that tallies honestly and then
      // keeps writing past the tally (a new, uncounted obligation) is refused here rather than silently
      // accepted, which is what an un-anchored presence check (the prior version of this mirror) allowed.
      const tail = reqSectionText.slice(m.index + m[0].length);
      const tailLines = tail.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
      const extraneousTail = tailLines.filter((l) => !SHORTFALL_LINE_RE.test(l));
      if (extraneousTail.length > 0) {
        at(
          "depth accounting: content follows the accounting line inside \"Substantive Requirements\" " +
            `(${JSON.stringify(extraneousTail[0])}${extraneousTail.length > 1 ? ", ..." : ""}) -- the ` +
            "accounting line (and any Shortfall line) must be the end of the section; move the accounting " +
            "line to the end, or remove the trailing content.",
        );
      }
    }

    // ── MIRROR (e): qualification accounting -- task-6.1-audit.md fix 2. Fix round 1, finding 2: this
    // mirror now runs UNCONDITIONALLY whenever "Substantive Requirements" is present (previously nested
    // inside the depth-accounting line's own success branch above, so it never fired when that line was
    // missing -- the state of every currently-applied batch). Each of per-year trajectory, exceptions/
    // carve-outs, and scope limits is either captured or explicitly recorded absent with an article/
    // section-citing sentence (fix round 1, finding 4: a fixed sentence with no source reference, and a
    // polarity-blind keyword match against free-form claim_text, were both gameable regardless of the
    // source -- see the vocabulary comments above for the tightened forms).
    const trajectoryCaptured =
      entry.metadata &&
      typeof entry.metadata === "object" &&
      entry.metadata.requirement_trajectory !== null &&
      entry.metadata.requirement_trajectory !== undefined;
    if (!trajectoryCaptured && !TRAJECTORY_ABSENCE_RE.test(reqSectionText)) {
      at(
        'qualification accounting: no per-year trajectory captured (metadata.requirement_trajectory) and no ' +
          '"No phase-in is stated in Article(s)/Section(s) <range>." note in "Substantive Requirements" -- ' +
          "state the trajectory or the honest, article-citing absence.",
      );
    }
    if (!hasUnnegatedKeywordInSpan(attached, EXCEPTION_KEYWORD_RE) && !EXCEPTIONS_ABSENCE_RE.test(reqSectionText)) {
      at(
        `qualification accounting: no unnegated exception/carve-out keyword in the source_span of a FACT ` +
          `claim attached to section ${JSON.stringify(SUBSTANTIVE_REQUIREMENTS_KEY)} (Substantive ` +
          'Requirements), and no "No exceptions are stated in Article(s)/Section(s) <range>." note -- state ' +
          "the exception or the honest, article-citing absence.",
      );
    }
    if (!hasUnnegatedKeywordInSpan(attached, SCOPE_KEYWORD_RE) && !SCOPE_ABSENCE_RE.test(reqSectionText)) {
      at(
        `qualification accounting: no unnegated scope-limit keyword in the source_span of a FACT claim ` +
          `attached to section ${JSON.stringify(SUBSTANTIVE_REQUIREMENTS_KEY)} (Substantive Requirements), ` +
          'and no "No scope limits are stated in Article(s)/Section(s) <range>." note -- state the scope ' +
          "limit or the honest, article-citing absence.",
      );
    }
  }

  return errors;
}

/**
 * Validate a whole record-briefs file: `{ batch, generated_at, entries: [...] }` -- the same
 * batch/generated_at/entries wrapper shape scripts/turns/ledger-verdicts's own verdict-file contract
 * uses (README.md's "How a session lane produces a batch" step 4: a committed repo path carrying one
 * named batch). A structural violation (not a JSON object, `entries` not an array) fails the WHOLE file
 * closed, matching validateVerdictsFile's own posture: a malformed file is a producer bug, never guessed
 * around. Per-entry/per-claim violations are collected across every entry (not stopped at the first) so
 * a producer sees every problem in one pass.
 * @param {unknown} json the JSON.parse'd file content
 * @param {{poolTextByItemId?: Record<string,string>}} [opts] `poolTextByItemId`: the pool text (task
 *   3.1's `pool: [{url, text}]`, concatenated by the caller) each item's FACT spans are checked against.
 *   The caller (task 3.4's driver) supplies it from the export parts task 3.1 produced.
 * @returns {{ok: true, entries: object[]} | {ok: false, errors: string[]}}
 */
export function validateRecordBriefsFile(json, opts = {}) {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, errors: ["record-briefs file must be a JSON object"] };
  }
  const errors = [];
  if (!isNonEmptyString(json.batch)) errors.push("batch must be a non-empty string");
  if (!isIsoTimestamp(json.generated_at)) {
    errors.push(`generated_at must be a parseable ISO 8601 timestamp (got ${JSON.stringify(json.generated_at)})`);
  }
  if (!Array.isArray(json.entries)) {
    errors.push("entries must be an array");
    return { ok: false, errors };
  }
  json.entries.forEach((entry, i) => {
    errors.push(...validateRecordBriefsEntry(entry, i, opts));
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, entries: json.entries };
}
