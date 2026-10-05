// schema.mjs: the theme-briefs file contract and its pre-write validator (lane S3-C, 2026-10-04).
//
// PURE and dependency-free apart from the one hash recipe (src/lib/connections/brief-staleness.mjs): no
// database, no network, no model call. A session lane authors a batch `theme-briefs-NNN.json` offline from
// the export bundle (scripts/turns/export-themes-for-briefs.mjs); this module is the enforcement the apply
// step (scripts/turns/apply-theme-briefs.mjs) runs before any write. The README beside this file is the same
// contract in prose; theme-briefs.test.mjs is the executable spec.
//
// Same family shape as scripts/turns/record-briefs/schema.mjs (a committed batch file, a pure validator,
// whole-entry refusals), narrowed to what a THEME brief is: the system saying what a connection between
// items on several pages means over the long term, and what follows from it for a reader of each page.
//
// WHOLE-ENTRY REFUSAL. An entry that fails any check below is refused in full and never partially applied;
// the refusal reasons are returned so the residue is recorded with its reason. A refused entry never blocks
// the valid entries beside it (no human gate: the decision is made by rule, the residue is reported).

import { computeMemberHash } from "../../../src/lib/connections/brief-staleness.mjs";

export const THEME_BRIEFS_SCHEMA_VERSION = "tb1-2026-10-04.1";

/** The five sections, in render order. */
export const THEME_BRIEF_SECTIONS = Object.freeze(["connection", "meaning", "ramifications", "watch", "gaps"]);

/** Fixed headings the sections are rendered under in brief_md. */
export const SECTION_HEADINGS = Object.freeze({
  connection: "Connection",
  meaning: "What it means",
  ramifications: "Ramifications",
  watch: "Watch",
  gaps: "Gaps",
});

/** Length ceilings in characters, per section (and for the title). Stated in the README. */
export const SECTION_CEILINGS = Object.freeze({ connection: 2000, meaning: 2500, ramifications: 5000, watch: 3000, gaps: 1500 });
export const TITLE_CEILING = 160;

/** connection_themes.surfaces value to the subsection heading a ramifications block uses for it. */
export const SURFACE_HEADING = Object.freeze({
  regulations: "Regulations",
  market: "Market Intel",
  research: "Research",
  operations: "Operations",
});

const REQUIRED_NONEMPTY = Object.freeze(["connection", "meaning", "ramifications", "watch"]);
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const BATCH_RE = /^theme-briefs-[A-Za-z0-9._-]+$/;

// A paragraph or list line that opens with one of these labels is a labelled analysis block (the labels the
// analysis-construction and environmental-policy skills prescribe). Everything inside it is exempt from the
// uncited-figure check: it is the author's analysis, labelled as such, not a stated fact.
const ANALYSIS_LABEL_RE = /^\s*(?:[-*]\s+|\d+[.)]\s+)?[*_]{0,3}(?:Analytical inference|Operational implication|Legal Confirmation Required)\s*:/i;

// All-caps words that are labels, not instruments.
const LABEL_WORDS = new Set(["ACTION", "REQUIRED", "COST", "ALERT", "WINDOW", "CLOSING", "COMPETITIVE", "EDGE", "MONITORING", "FACT", "ANALYSIS", "LEGAL", "GAP", "NOT", "AND", "THE", "FOR"]);

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const nonEmptyStr = (x) => typeof x === "string" && x.trim().length > 0;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every [start, end) range where `needle` occurs in `text`, whitespace-flexible. */
function rangesOf(text, needle, flags = "g") {
  const out = [];
  const n = typeof needle === "string" ? needle.trim() : "";
  if (!n) return out;
  const re = new RegExp(n.split(/\s+/).map(escapeRe).join("\\s+"), flags);
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

/** Ranges of labelled analysis blocks and of heading lines: blank-line paragraphs and list lines. */
function exemptBlockRanges(text) {
  const out = [];
  let offset = 0;
  let inAnalysis = false;
  for (const line of text.split("\n")) {
    const start = offset;
    const end = offset + line.length;
    offset = end + 1;
    if (line.trim() === "") {
      inAnalysis = false;
      continue;
    }
    if (/^\s*#{1,6}\s/.test(line)) {
      out.push([start, end]);
      inAnalysis = false;
      continue;
    }
    const startsNewItem = /^\s*(?:[-*]\s+|\d+[.)]\s+)/.test(line);
    if (ANALYSIS_LABEL_RE.test(line)) inAnalysis = true;
    else if (startsNewItem) inAnalysis = false;
    if (inAnalysis) out.push([start, end]);
  }
  return out;
}

const within = (ranges, pos) => ranges.some(([a, b]) => pos >= a && pos < b);

/**
 * The narrowest honest uncited-figure check. Returns the figure tokens in `text` that are neither inside a
 * listed claim's text, nor inside a labelled analysis block or a heading, nor part of a cited member title,
 * nor inside a verbatim bundle gap description, nor a token the bundle's own intra-theme edge basis names
 * (allowedTokens: the connection's shared scenarios and objects are system facts the author is told to
 * name). A "figure token" is:
 *   - a number, which includes every year and date (a run of digits with optional , . separators and %);
 *   - an acronym of three or more capitals (CBAM, IMO, CORSIA), the lexical stand-in for a named instrument
 *     or body. Label words (ACTION REQUIRED and the like) are ignored.
 * Limits (also in the README): a fact written without digits and without an acronym (a spelled-out
 * instrument, "the second phase") is NOT detected; a two-letter acronym is not detected; coverage is by text
 * position, so it proves a figure sits inside a listed claim's text, not that the claim is true. Truth is
 * held by the claim_ids check (the cited claims are real grounded claims of that member).
 * @param {string} text
 * @param {{claimTexts?:string[], memberTitles?:string[], gapDescriptions?:string[]}} cover
 * @returns {string[]}
 */
export function findUncitedFigures(text, { claimTexts = [], memberTitles = [], gapDescriptions = [], allowedTokens = null } = {}) {
  if (typeof text !== "string" || !text) return [];
  const covered = [...exemptBlockRanges(text)];
  for (const c of claimTexts) covered.push(...rangesOf(text, c));
  for (const t of memberTitles) covered.push(...rangesOf(text, t, "gi"));
  for (const g of gapDescriptions) covered.push(...rangesOf(text, g));

  const found = [];
  const numRe = /\d+(?:[.,]\d+)*%?/g;
  let m;
  while ((m = numRe.exec(text)) !== null) {
    const pos = m.index;
    const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
    const before = text.slice(lineStart, pos);
    const after = text.slice(pos + m[0].length, pos + m[0].length + 2);
    if (/^\s*$/.test(before) && /^[.)]\s/.test(after)) continue; // an ordered-list marker, not a figure
    if (!within(covered, pos) && !allowedTokens?.has(m[0])) found.push(m[0]);
  }
  const acrRe = /\b[A-Z][A-Z0-9&]{2,}\b/g;
  while ((m = acrRe.exec(text)) !== null) {
    if (LABEL_WORDS.has(m[0])) continue;
    if (!within(covered, m.index) && !allowedTokens?.has(m[0])) found.push(m[0]);
  }
  return found;
}

/** The number and acronym tokens inside a piece of text, by the same patterns findUncitedFigures flags. */
export function figureTokens(text) {
  const out = new Set();
  for (const m of String(text ?? "").matchAll(/\d+(?:[.,]\d+)*%?/g)) out.add(m[0]);
  for (const m of String(text ?? "").matchAll(/\b[A-Z][A-Z0-9&]{2,}\b/g)) if (!LABEL_WORDS.has(m[0])) out.add(m[0]);
  return out;
}

/** Parse a ramifications block into { heading -> body } plus structural problems. */
export function parseRamifications(text) {
  const problems = [];
  const subs = new Map();
  let current = null;
  let preamble = "";
  for (const line of String(text ?? "").split("\n")) {
    const h = /^###\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = h[1];
      if (subs.has(current)) problems.push(`duplicate ramifications subsection "${current}"`);
      else subs.set(current, "");
      continue;
    }
    if (current === null) preamble += line;
    else subs.set(current, `${subs.get(current)}${line}\n`);
  }
  if (preamble.trim()) problems.push("ramifications text before the first '### <Surface>' subsection");
  return { subs, problems };
}

/**
 * Validate ONE entry. Returns the list of refusal reasons (empty means valid).
 * @param {object} entry
 * @param {number} i - index in the file, for messages
 * @param {{
 *   themesById: Map<string,{id:string,member_ids:string[],surfaces?:string[]}>,
 *   membersById: Map<string,{title?:string,claim_ids:Set<string>,event_ids?:Set<string>}>,
 *   gapsByTheme?: Map<string,Array<{description:string}>>,
 *   basisTokensByTheme?: Map<string,Set<string>>,
 * }} ctx
 * @returns {string[]}
 */
export function validateThemeBriefEntry(entry, i, ctx) {
  const where = `entry ${i}`;
  if (!isObj(entry)) return [`${where}: not an object`];
  if (!nonEmptyStr(entry.theme_id)) return [`${where}: theme_id is missing`];
  const tag = `${where} (theme ${entry.theme_id})`;
  const theme = ctx.themesById.get(entry.theme_id);
  if (!theme) return [`${tag}: unknown theme (no live connection_themes row with this id)`];
  const errs = [];

  if (!nonEmptyStr(entry.member_hash)) errs.push(`${tag}: member_hash is missing`);
  else if (entry.member_hash !== computeMemberHash(theme.member_ids)) {
    errs.push(`${tag}: member_hash does not match the live membership (authored against ${entry.member_hash}, live ${computeMemberHash(theme.member_ids)}); re-export the bundle and re-author`);
  }
  if (!nonEmptyStr(entry.title)) errs.push(`${tag}: title is missing`);
  else if (entry.title.length > TITLE_CEILING) errs.push(`${tag}: title is ${entry.title.length} characters, ceiling ${TITLE_CEILING}`);
  else if (UUID_RE.test(entry.title)) errs.push(`${tag}: title carries an id; cite members by title`);

  if (!isObj(entry.sections)) {
    errs.push(`${tag}: sections must be an object with ${THEME_BRIEF_SECTIONS.join(", ")}`);
    return errs;
  }
  for (const k of Object.keys(entry.sections)) {
    if (!THEME_BRIEF_SECTIONS.includes(k)) errs.push(`${tag}: unknown section "${k}"`);
  }
  for (const k of THEME_BRIEF_SECTIONS) {
    const v = entry.sections[k];
    if (typeof v !== "string") {
      errs.push(`${tag}: section "${k}" is missing or not a string`);
      continue;
    }
    if (REQUIRED_NONEMPTY.includes(k) && v.trim() === "") errs.push(`${tag}: required section "${k}" is empty`);
    if (v.length > SECTION_CEILINGS[k]) errs.push(`${tag}: section "${k}" is ${v.length} characters, ceiling ${SECTION_CEILINGS[k]}`);
    if (UUID_RE.test(v)) errs.push(`${tag}: section "${k}" carries an id; cite members by title, never by id`);
  }

  const gaps = ctx.gapsByTheme?.get(entry.theme_id);
  if (Array.isArray(gaps) && gaps.length > 0 && typeof entry.sections.gaps === "string" && entry.sections.gaps.trim() === "") {
    errs.push(`${tag}: the bundle lists ${gaps.length} gap(s) for this theme but section "gaps" is empty`);
  }

  // Ramifications: one subsection per surface the theme spans, and none for a surface it does not.
  if (typeof entry.sections.ramifications === "string" && entry.sections.ramifications.trim() !== "") {
    const spanned = new Set((theme.surfaces || []).filter((s) => SURFACE_HEADING[s]).map((s) => SURFACE_HEADING[s]));
    const { subs, problems } = parseRamifications(entry.sections.ramifications);
    for (const p of problems) errs.push(`${tag}: ${p}`);
    const known = new Set(Object.values(SURFACE_HEADING));
    for (const [heading, body] of subs) {
      if (!known.has(heading)) errs.push(`${tag}: ramifications subsection "${heading}" is not one of ${[...known].join(", ")}`);
      else if (!spanned.has(heading)) errs.push(`${tag}: ramifications subsection "${heading}" is for a surface this theme does not span`);
      else if (body.trim() === "") errs.push(`${tag}: ramifications subsection "${heading}" is empty`);
    }
    for (const heading of spanned) {
      if (!subs.has(heading)) errs.push(`${tag}: the theme spans "${heading}" but ramifications has no subsection for it`);
    }
  }

  // Claims.
  const claimTextsBySection = new Map(THEME_BRIEF_SECTIONS.map((s) => [s, []]));
  if (!Array.isArray(entry.claims)) {
    errs.push(`${tag}: claims must be an array`);
  } else {
    const liveMembers = new Set(theme.member_ids);
    entry.claims.forEach((c, ci) => {
      const ct = `${tag} claims[${ci}]`;
      if (!isObj(c)) { errs.push(`${ct}: not an object`); return; }
      if (!THEME_BRIEF_SECTIONS.includes(c.section)) { errs.push(`${ct}: section "${c.section}" is not one of ${THEME_BRIEF_SECTIONS.join(", ")}`); return; }
      if (!nonEmptyStr(c.text)) { errs.push(`${ct}: text is missing`); return; }
      const secText = typeof entry.sections[c.section] === "string" ? entry.sections[c.section] : "";
      if (rangesOf(secText, c.text).length === 0) errs.push(`${ct}: text does not appear in section "${c.section}"`);
      else claimTextsBySection.get(c.section).push(c.text);
      if (!nonEmptyStr(c.member_id) || !liveMembers.has(c.member_id)) { errs.push(`${ct}: member_id is not a live member of this theme`); return; }
      const member = ctx.membersById.get(c.member_id);
      if (!member) { errs.push(`${ct}: member ${c.member_id} has no loaded claims, cannot verify claim_ids`); return; }
      if (!Array.isArray(c.claim_ids) || c.claim_ids.length === 0) { errs.push(`${ct}: claim_ids must be a non-empty array`); return; }
      const allowed = (id) => member.claim_ids?.has(id) || (c.section === "watch" && member.event_ids?.has(id));
      for (const id of c.claim_ids) {
        if (typeof id !== "string" || !allowed(id)) errs.push(`${ct}: claim id ${JSON.stringify(id)} is not a grounded claim of member ${c.member_id}${c.section === "watch" ? " (or one of its forward events)" : ""}`);
      }
    });
  }

  // Uncited figures, per section.
  const memberTitles = theme.member_ids.map((id) => ctx.membersById.get(id)?.title).filter(Boolean);
  const gapDescriptions = (gaps || []).map((g) => g.description).filter(Boolean);
  for (const k of THEME_BRIEF_SECTIONS) {
    const text = entry.sections[k];
    if (typeof text !== "string") continue;
    const loose = findUncitedFigures(text, { claimTexts: claimTextsBySection.get(k), memberTitles, gapDescriptions, allowedTokens: ctx.basisTokensByTheme?.get(entry.theme_id) ?? null });
    if (loose.length) {
      const uniq = [...new Set(loose)];
      errs.push(`${tag}: section "${k}" states ${uniq.slice(0, 6).map((t) => JSON.stringify(t)).join(", ")}${uniq.length > 6 ? " and more" : ""} outside any listed claim or labelled analysis paragraph; list a claim for it or write it as '*Analytical inference:* ...'`);
    }
  }
  return errs;
}

/**
 * Validate a whole batch file. A structural problem (not an object, bad batch name, entries not an array)
 * fails the whole file closed (`ok: false`). Per-entry problems refuse that entry only.
 * @returns {{ok:boolean, fileErrors:string[], valid:object[], refused:Array<{index:number,theme_id:string|null,errors:string[]}>}}
 */
export function validateThemeBriefsFile(json, ctx) {
  const fileErrors = [];
  if (!isObj(json)) return { ok: false, fileErrors: ["file is not a JSON object"], valid: [], refused: [] };
  if (!nonEmptyStr(json.batch) || !BATCH_RE.test(json.batch)) fileErrors.push(`batch must match ${BATCH_RE} (got ${JSON.stringify(json.batch)})`);
  if (!nonEmptyStr(json.generated_at) || Number.isNaN(Date.parse(json.generated_at))) fileErrors.push("generated_at must be an ISO timestamp");
  if (json.authored_by !== "session-lane") fileErrors.push(`authored_by must be "session-lane" (got ${JSON.stringify(json.authored_by)})`);
  if (!Array.isArray(json.entries)) fileErrors.push("entries must be an array");
  if (fileErrors.length) return { ok: false, fileErrors, valid: [], refused: [] };

  const valid = [];
  const refused = [];
  const seen = new Set();
  json.entries.forEach((entry, i) => {
    const themeId = isObj(entry) && typeof entry.theme_id === "string" ? entry.theme_id : null;
    const errors = validateThemeBriefEntry(entry, i, ctx);
    if (!errors.length && themeId && seen.has(themeId)) errors.push(`entry ${i} (theme ${themeId}): duplicate theme_id in this batch`);
    if (themeId) seen.add(themeId);
    if (errors.length) refused.push({ index: i, theme_id: themeId, errors });
    else valid.push(entry);
  });
  return { ok: true, fileErrors: [], valid, refused };
}

/** brief_md: the title, then the sections in order under fixed headings. An empty gaps section is omitted. */
export function renderBriefMd(entry) {
  const parts = [`# ${entry.title.trim()}`];
  for (const k of THEME_BRIEF_SECTIONS) {
    const body = String(entry.sections[k] ?? "").trim();
    if (!body) continue;
    parts.push(`## ${SECTION_HEADINGS[k]}\n\n${body}`);
  }
  return `${parts.join("\n\n")}\n`;
}
