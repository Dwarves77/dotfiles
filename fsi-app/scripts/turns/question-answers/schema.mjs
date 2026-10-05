// schema.mjs: the question-answers file contract and its pre-write validator (lane L4-B, 2026-10-05,
// ADR-044 decision 1).
//
// PURE and free of any database, network or model call. A session lane authors a batch
// `question-answers-NNN.json` offline from the export bundle (scripts/turns/export-questions-for-answers.mjs);
// this module is the enforcement the apply step (scripts/turns/apply-question-answers.mjs) runs before any
// write. The README beside this file is the same contract in prose; question-answers.test.mjs is the
// executable spec.
//
// Same family shape as scripts/turns/theme-briefs/ and scripts/turns/record-briefs/: a committed batch file, a
// pure validator, whole-entry refusals. An entry that fails any check is refused in full and never partially
// applied; the reasons are returned so the residue is recorded with its reason. A refused entry never blocks
// the valid entries beside it (no human gate: the decision is made by rule).
//
// REUSE. The verbatim-span check is record-facts.mjs assertVerbatim, the function the record-briefs validator
// calls (case-insensitive substring of the held pool text), not a second copy. The figure-token patterns are
// theme-briefs' figureTokens.

import { assertVerbatim } from "../../../src/lib/intake/record-facts.mjs";
import { figureTokens } from "../theme-briefs/schema.mjs";

export const QUESTION_ANSWERS_SCHEMA_VERSION = "qa1-2026-10-05.1";

/** The two outcomes an entry can carry. */
export const OUTCOMES = Object.freeze(["answered", "unanswerable_from_holdings"]);

/** The status tokens an ANSWER may carry. REFUTED is not an answer to a question. */
export const ANSWER_STATUS_TOKENS = Object.freeze(["HYPOTHESIS", "CONFIRMED"]);

/** Length ceilings in characters. Stated in the README. */
export const CEILINGS = Object.freeze({ answer: 1500, missing: 600, source_span: 600, evidence_entries: 8 });

/** A span shorter than this is not evidence of anything. */
export const MIN_SPAN_CHARS = 20;

const BATCH_RE = /^question-answers-[A-Za-z0-9._-]+$/;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const nonEmptyStr = (x) => typeof x === "string" && x.trim().length > 0;
const absent = (x) => x === undefined || x === null || x === "" || (Array.isArray(x) && x.length === 0);

/** Whitespace-collapsed, lower-cased text for the quotation test. */
function normalise(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The sentences of an answer, each stripped of its closing punctuation and quote marks, blank ones dropped.
 * Splits on a full stop, question mark or exclamation mark followed by whitespace, and on line breaks. An
 * abbreviation ("U.S. law") splits too, which only makes the quotation test below finer, never looser: every
 * piece must still be a quotation.
 * @param {string} text
 * @returns {string[]}
 */
export function sentencesOf(text) {
  return String(text ?? "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim().replace(/^[\s"'(\[]+|[\s"')\].!?;:,]+$/g, ""))
    .filter((s) => s.length > 0);
}

/**
 * The CONFIRMED rule. An answer may carry status CONFIRMED only when EVERY sentence of it is a quotation:
 * after whitespace collapse and lower-casing, the sentence is a substring of at least one evidence
 * `source_span`. The spans themselves are already proven verbatim in the held pool, so a quoted sentence is
 * the source's own words. Returns the sentences that are NOT quotations (empty means CONFIRMED is allowed).
 * Limits (also in the README): a quotation proves the words are the source's, not that they answer the
 * question, and a paraphrase is never CONFIRMED however faithful.
 * @param {string} answer
 * @param {string[]} spans
 * @returns {string[]}
 */
export function unquotedSentences(answer, spans) {
  const hay = (Array.isArray(spans) ? spans : []).map(normalise);
  return sentencesOf(answer).filter((sent) => !hay.some((h) => h.includes(normalise(sent))));
}

/**
 * Validate ONE entry. Returns the list of refusal reasons (empty means valid).
 * @param {object} entry
 * @param {number} i index in the file, for messages
 * @param {{
 *   questions: Map<string, {
 *     open: boolean,
 *     questionText?: string,
 *     answered?: boolean,
 *     itemUnusable?: string|null,
 *     pool_hash: string,
 *     members: Map<string, {title?:string, claim_ids:Set<string>, poolText:string}>,
 *     unusable?: Map<string, string>,
 *   }>
 * }} ctx
 * @returns {string[]}
 */
export function validateAnswerEntry(entry, i, ctx) {
  const where = `entry ${i}`;
  if (!isObj(entry)) return [`${where}: not an object`];
  if (!nonEmptyStr(entry.subject_ref)) return [`${where}: subject_ref is missing`];
  const tag = `${where} (question ${entry.subject_ref})`;
  const q = ctx.questions.get(entry.subject_ref);
  if (!q) return [`${tag}: unknown question (no question flag with this subject_ref)`];
  if (!q.open) return [`${tag}: the question is no longer open`];
  const errs = [];

  if (q.itemUnusable) errs.push(`${tag}: the question's own item is not citable (${q.itemUnusable}); the question is not answered from it`);
  if (!nonEmptyStr(entry.pool_hash)) errs.push(`${tag}: pool_hash is missing`);
  else if (entry.pool_hash !== q.pool_hash) {
    errs.push(`${tag}: pool_hash does not match the live held pool (authored against ${entry.pool_hash}, live ${q.pool_hash}); re-export and re-author`);
  }

  if (!OUTCOMES.includes(entry.outcome)) {
    errs.push(`${tag}: outcome must be one of ${OUTCOMES.join(", ")} (got ${JSON.stringify(entry.outcome)})`);
    return errs;
  }

  if (entry.outcome === "unanswerable_from_holdings") {
    if (q.answered) errs.push(`${tag}: the question was answered earlier; a changed held pool is re-answered, never marked unanswerable`);
    for (const k of ["answer", "status_token", "confidence", "cited_item_ids", "evidence"]) {
      if (!absent(entry[k])) errs.push(`${tag}: an unanswerable entry carries no ${k} (it says what holding would answer the question, nothing else)`);
    }
    if (!nonEmptyStr(entry.missing)) errs.push(`${tag}: an unanswerable entry needs "missing": in plain words, what kind of source about what would answer it`);
    else if (entry.missing.length > CEILINGS.missing) errs.push(`${tag}: missing is ${entry.missing.length} characters, ceiling ${CEILINGS.missing}`);
    else if (UUID_RE.test(entry.missing)) errs.push(`${tag}: missing carries an id; say what the missing source is in words`);
    return errs;
  }

  // ── answered ──────────────────────────────────────────────────────────────────────────────────────────
  if (!absent(entry.missing)) errs.push(`${tag}: an answered entry carries no "missing"`);
  if (!ANSWER_STATUS_TOKENS.includes(entry.status_token)) {
    errs.push(`${tag}: status_token must be one of ${ANSWER_STATUS_TOKENS.join(", ")} (got ${JSON.stringify(entry.status_token)})`);
  }
  if (typeof entry.confidence !== "number" || !Number.isFinite(entry.confidence) || entry.confidence < 0 || entry.confidence > 1) {
    errs.push(`${tag}: confidence must be a number from 0 to 1 (got ${JSON.stringify(entry.confidence)})`);
  }
  if (!nonEmptyStr(entry.answer)) errs.push(`${tag}: an answered entry needs "answer"`);
  else {
    if (entry.answer.length > CEILINGS.answer) errs.push(`${tag}: answer is ${entry.answer.length} characters, ceiling ${CEILINGS.answer}`);
    if (UUID_RE.test(entry.answer)) errs.push(`${tag}: answer carries an id; cite items by title, never by id`);
  }

  const evidence = Array.isArray(entry.evidence) ? entry.evidence : null;
  if (!evidence || evidence.length === 0) {
    errs.push(`${tag}: an answered entry needs at least one evidence record`);
    return errs;
  }
  if (evidence.length > CEILINGS.evidence_entries) errs.push(`${tag}: ${evidence.length} evidence records, ceiling ${CEILINGS.evidence_entries}`);

  const spans = [];
  const evidenceItemIds = new Set();
  evidence.forEach((ev, ei) => {
    const et = `${tag} evidence[${ei}]`;
    if (!isObj(ev)) { errs.push(`${et}: not an object`); return; }
    if (!nonEmptyStr(ev.item_id)) { errs.push(`${et}: item_id is missing`); return; }
    evidenceItemIds.add(ev.item_id);
    const unusableWhy = q.unusable?.get(ev.item_id);
    if (unusableWhy) { errs.push(`${et}: cited item is not citable (${unusableWhy})`); return; }
    const member = q.members.get(ev.item_id);
    if (!member) { errs.push(`${et}: item is neither the question's own item nor an item connected to it in the export`); return; }
    if (!Array.isArray(ev.claim_ids)) errs.push(`${et}: claim_ids must be an array (empty when no grounded claim backs the span)`);
    else {
      for (const id of ev.claim_ids) {
        if (typeof id !== "string" || !member.claim_ids.has(id)) errs.push(`${et}: claim id ${JSON.stringify(id)} is not a grounded claim of the cited item`);
      }
    }
    if (!nonEmptyStr(ev.source_span)) { errs.push(`${et}: source_span is missing`); return; }
    if (ev.source_span.length > CEILINGS.source_span) errs.push(`${et}: source_span is ${ev.source_span.length} characters, ceiling ${CEILINGS.source_span}`);
    else if (ev.source_span.trim().length < MIN_SPAN_CHARS) errs.push(`${et}: source_span is under ${MIN_SPAN_CHARS} characters, too short to be evidence`);
    else {
      try {
        assertVerbatim(member.poolText, ev.source_span);
        spans.push(ev.source_span);
      } catch {
        errs.push(`${et}: source_span is not a verbatim substring of the held pool text of the cited item`);
      }
    }
  });

  // cited_item_ids equals the set of evidence item ids.
  if (!Array.isArray(entry.cited_item_ids) || entry.cited_item_ids.length === 0) errs.push(`${tag}: cited_item_ids must be a non-empty array`);
  else {
    const cited = new Set(entry.cited_item_ids);
    if (cited.size !== entry.cited_item_ids.length) errs.push(`${tag}: cited_item_ids has a duplicate`);
    const same = cited.size === evidenceItemIds.size && [...cited].every((id) => evidenceItemIds.has(id));
    if (!same) errs.push(`${tag}: cited_item_ids must equal the set of evidence item ids`);
  }

  // Figures: a number or an acronym in the answer must come from an evidence span, the question or a cited title.
  if (nonEmptyStr(entry.answer)) {
    const allowed = new Set();
    for (const tk of figureTokens(spans.join(" "))) allowed.add(tk);
    for (const tk of figureTokens(q.questionText ?? "")) allowed.add(tk);
    for (const id of evidenceItemIds) for (const tk of figureTokens(q.members.get(id)?.title ?? "")) allowed.add(tk);
    const loose = [...figureTokens(entry.answer)].filter((tk) => !allowed.has(tk));
    if (loose.length) {
      errs.push(`${tag}: answer states ${loose.slice(0, 6).map((t) => JSON.stringify(t)).join(", ")}${loose.length > 6 ? " and more" : ""} that no evidence span, the question or a cited title carries`);
    }
  }

  // CONFIRMED only when every sentence is a quotation of an evidence span.
  if (entry.status_token === "CONFIRMED" && nonEmptyStr(entry.answer)) {
    const bad = unquotedSentences(entry.answer, spans);
    if (bad.length) {
      errs.push(`${tag}: status_token CONFIRMED needs every sentence quoted from an evidence span; ${bad.length} sentence(s) are not, e.g. ${JSON.stringify(bad[0].slice(0, 80))}; use HYPOTHESIS for a paraphrase`);
    }
  }
  return errs;
}

/** The structural problems of a batch file as a whole; empty when the file can be read entry by entry. */
function fileShapeErrors(json) {
  if (!isObj(json)) return ["file is not a JSON object"];
  const problems = [];
  if (!nonEmptyStr(json.batch) || !BATCH_RE.test(json.batch)) problems.push(`batch must match ${BATCH_RE} (got ${JSON.stringify(json.batch)})`);
  if (!nonEmptyStr(json.generated_at) || Number.isNaN(Date.parse(json.generated_at))) problems.push("generated_at must be an ISO timestamp");
  if (json.authored_by !== "session-lane") problems.push(`authored_by must be "session-lane" (got ${JSON.stringify(json.authored_by)})`);
  if (!Array.isArray(json.entries)) problems.push("entries must be an array");
  return problems;
}

/**
 * Validate a whole batch file. A structural problem fails the whole file closed (`ok: false`); a problem in
 * one entry refuses that entry only. An entry that repeats an earlier entry's subject_ref is refused.
 * @returns {{ok:boolean, fileErrors:string[], valid:object[], refused:Array<{index:number,subject_ref:string|null,errors:string[]}>}}
 */
export function validateQuestionAnswersFile(json, ctx) {
  const shape = fileShapeErrors(json);
  const verdict = { ok: shape.length === 0, fileErrors: shape, valid: [], refused: [] };
  if (!verdict.ok) return verdict;
  const earlier = new Set();
  for (const [index, entry] of json.entries.entries()) {
    const subject_ref = isObj(entry) && typeof entry.subject_ref === "string" ? entry.subject_ref : null;
    const errors = validateAnswerEntry(entry, index, ctx);
    if (!errors.length && subject_ref && earlier.has(subject_ref)) errors.push(`entry ${index} (question ${subject_ref}): duplicate subject_ref in this batch`);
    if (subject_ref) earlier.add(subject_ref);
    if (errors.length) verdict.refused.push({ index, subject_ref, errors });
    else verdict.valid.push(entry);
  }
  return verdict;
}
