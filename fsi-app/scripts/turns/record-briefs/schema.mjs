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
import { extractSectionByHeading } from "../../../src/lib/agent/extract-sections.ts";
import { parseTimeline } from "../../../src/lib/agent/timeline-parse.mjs";
import { buildTimelineRows } from "../../../src/lib/agent/timeline-harvest.mjs";

export const RECORD_BRIEFS_SCHEMA_VERSION = "rb1-2026-09-12.1";
// 2026-09-12.1 (task 6.1b, brief-chain-build-plan-2026-09-11): three new pre-write refusals, added after
// a 10-item pilot batch generated and sectioned cleanly, then quarantined 10/10 at the ground step for
// defects this validator could have caught before any grounding cost was spent -- see the three "MIRROR"
// blocks in validateRecordBriefsEntry below. Quarantine is never the end state of brief-apply (operator
// ruling, 2026-09-12); refusing HERE, naming the exact token or section, is how the lane fixes the source
// before a write is ever attempted.

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

function ilikeIncludes(haystack, needle) {
  return String(haystack ?? "").toLowerCase().includes(String(needle ?? "").toLowerCase());
}

/** Split a body's markdown into sections at `#`-headings (any level 1-6). The preamble before the first
 *  heading (if any) is its own section with `heading: null` -- checked the same as every other section,
 *  since an unlabeled assertion before the first heading is just as unlabeled as one inside a section.
 *  @param {string} body @returns {{heading:string|null, text:string}[]} */
function splitBodyIntoSections(body) {
  const lines = String(body ?? "").split(/\r?\n/);
  const sections = [];
  let current = { heading: null, lines: [] };
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      sections.push(current);
      current = { heading: line.replace(/^#{1,6}\s+/, "").trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections.map((s) => ({ heading: s.heading, text: s.lines.join("\n") }));
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

  // ── MIRROR (a): Gate A -- every figure/date token scanBrief harvests from the body must be covered by
  // some FACT claim's own claim_text or source_span (see gate-a-scan.mjs). No `derivedCovered` set is
  // computed at authoring time (that requires a live DB lookup of grounded DERIVED claims -- see
  // gate-a-derived.mjs -- which this pure, offline validator has no access to and no need for: a
  // record-briefs entry carries no DERIVED claims of its own), so this mirror is scanBrief's LITERAL arm
  // only. README.md's authoring rules state the consequence plainly: every figure/date written in the
  // body is either inside a FACT claim's text or span, verbatim from the pool, or not written at all.
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
  // one of the four analysis labels or the legal callout INSIDE that same section. Deliberately STRICTER
  // than the live DB rule (see the ANALYSIS_LABEL_RE/LEGAL_CALLOUT/UNLABELED_MODAL_RE header comment
  // above): the DB's own check also accepts a FACT claim attached to the section as an alternative, which
  // this validator cannot evaluate pre-write (claim-to-section attachment happens at the real write site,
  // once a real intelligence_item_sections row exists).
  if (hasBody) {
    for (const section of splitBodyIntoSections(entry.body)) {
      if (!section.text.trim()) continue;
      if (
        UNLABELED_MODAL_RE.test(section.text) &&
        !(ANALYSIS_LABEL_RE.test(section.text) || ilikeIncludes(section.text, LEGAL_CALLOUT))
      ) {
        const where = section.heading ? `section ${JSON.stringify(section.heading)}` : "the preamble before the first heading";
        at(
          `criterion 4 mirror: unlabeled assertion in ${where} -- matches /requires|must|mandates|obligates|prohibits|applies to/i ` +
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
