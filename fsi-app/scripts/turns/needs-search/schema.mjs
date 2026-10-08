// schema.mjs: the needs-search batch contract and its pre-write validator (lane G5-SEARCH, 2026-10-07, buildout
// plan Stage 5 last clause and "How model judgement runs").
//
// PURE and free of any database, network or model call. A source need (an open term-need, holdings-need,
// flywheel-gap or lineage-gap flag) is exported as a session batch request; a session lane finds the authoritative
// URL for each need and commits `needs-search-NNN.json`; this module is the enforcement the apply step
// (scripts/turns/apply-need-urls.mjs) runs before any write. The README beside this file is the same contract in
// prose; needs-search.test.mjs is the executable spec.
//
// Same family shape as scripts/turns/question-answers/: a committed batch, a pure validator, whole-entry refusals.
// A refused entry never blocks the valid ones (no human gate: the decision is made by rule).
//
// THE RATING RULE (CLAUDE.md rule 18, source-credibility-model): a batch names a SOURCE, never a tier. The tier is
// read from the institution class table (src/lib/sources/host-authority.ts) by HOST ALONE. The author's
// `institution` text is never passed to the rating, so a name that sounds like an association cannot rate a host
// into a better class. A host the table cannot place is refused unless the entry carries a `host_verdict` in the
// existing host-verdicts entry format (scripts/maintenance/host-verdicts/, validated by that module's own
// validator, the class a key of HOST_CLASS_TIER). A host the committed host-verdicts batches already place counts
// too. An aggregator or hosting-platform host is never rated, a verdict included.

import { createHash } from "node:crypto";
import { TERM_NEED_NAMESPACE, HOLDINGS_NEED_NAMESPACE, GAP_NAMESPACE } from "../../../src/lib/connections/flag-namespaces.mjs";
import { LINEAGE_GAP_CREATED_BY } from "../../../src/lib/entities/lineage-backfill.mjs";
import { hostOf } from "../../../src/lib/sources/institution.ts";
import { classTierForHostAcrossNames, permanentlyUnregisteredClass, verdictPlacementForHost, HOST_CLASS_TIER } from "../../../src/lib/sources/host-authority.ts";
import { validateHostVerdictEntry, normalizeVerdictHost } from "../../maintenance/host-verdicts/load-host-verdicts.mjs";

export const NEEDS_SEARCH_SCHEMA_VERSION = "ns1-2026-10-07.1";

/**
 * What a found URL becomes, by need kind. A lineage parent is one specific instrument whose page is a candidate for
 * the ledger consume (the same ledger the EUR-Lex register walk feeds for a CELEX id, lane G5-NEED); every other
 * need is answered by a document the gap census should see, so it becomes a census_worklist row (lane C).
 */
export const OUTPUT_FOR_KIND = Object.freeze({
  "term-need": "census_worklist",
  "holdings-need": "census_worklist",
  "flywheel-gap": "census_worklist",
  "lineage-gap": "portal_link_candidate",
});

/** Length ceilings in characters. Stated in the README. */
export const CEILINGS = Object.freeze({ url: 2000, institution: 200, why_authoritative: 600, entries: 200 });

const BATCH_RE = /^needs-search-[A-Za-z0-9._-]+$/;
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const nonEmptyStr = (x) => typeof x === "string" && x.trim().length > 0;

/** The need kind of an integrity_flags.created_by value, or null when it is not a need namespace. */
export function needKindOf(createdBy) {
  const c = String(createdBy ?? "");
  if (c.startsWith(TERM_NEED_NAMESPACE)) return "term-need";
  if (c.startsWith(HOLDINGS_NEED_NAMESPACE)) return "holdings-need";
  if (c.startsWith(GAP_NAMESPACE)) return "flywheel-gap";
  if (c === LINEAGE_GAP_CREATED_BY) return "lineage-gap";
  return null;
}

/**
 * Identity of a need that survives its flag being re-raised under a new id: kind, subject and the need text.
 * Whitespace is collapsed so a reformatted description keys the same.
 */
export function needKey({ kind, subject_ref, text }) {
  const norm = String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return createHash("sha256").update(`${kind}\u0000${subject_ref}\u0000${norm}`).digest("hex").slice(0, 16);
}

/**
 * Validate ONE entry. Returns { errors, plan }; plan is null when there are errors.
 * @param {object} entry
 * @param {number} i index in the file, for messages
 * @param {{needs: Map<string, {kind:string}>, committedVerdicts?: Map<string,{class:string,batch?:string}>}} ctx
 */
export function validateNeedEntry(entry, i, ctx) {
  const where = `entry ${i}`;
  if (!isObj(entry)) return { errors: [`${where}: not an object`], plan: null };
  if (!nonEmptyStr(entry.need_id)) return { errors: [`${where}: need_id is missing`], plan: null };
  const tag = `${where} (need ${entry.need_id})`;
  if (!ctx.needs.has(entry.need_id)) return { errors: [`${tag}: unknown need (no open need flag with this id)`], plan: null };
  const errs = [];

  if (Object.prototype.hasOwnProperty.call(entry, "tier")) errs.push(`${tag}: an entry names a source, never a tier; the tier is read from the class table`);

  let host = "";
  if (!nonEmptyStr(entry.url)) errs.push(`${tag}: url is missing`);
  else if (entry.url.length > CEILINGS.url) errs.push(`${tag}: url is ${entry.url.length} characters, ceiling ${CEILINGS.url}`);
  else {
    let u = null;
    try { u = new URL(entry.url); } catch { /* handled below */ }
    if (!u) errs.push(`${tag}: url is not a valid absolute url`);
    else if (u.protocol !== "http:" && u.protocol !== "https:") errs.push(`${tag}: url must be http or https`);
    else if (u.username || u.password) errs.push(`${tag}: url carries credentials`);
    else host = hostOf(entry.url);
    if (u && !host && !errs.length) errs.push(`${tag}: url has no host`);
  }

  if (!nonEmptyStr(entry.institution)) errs.push(`${tag}: institution is missing`);
  else if (entry.institution.length > CEILINGS.institution) errs.push(`${tag}: institution is ${entry.institution.length} characters, ceiling ${CEILINGS.institution}`);
  if (!nonEmptyStr(entry.why_authoritative)) errs.push(`${tag}: why_authoritative is missing`);
  else if (entry.why_authoritative.length > CEILINGS.why_authoritative) errs.push(`${tag}: why_authoritative is ${entry.why_authoritative.length} characters, ceiling ${CEILINGS.why_authoritative}`);
  if (typeof entry.confidence !== "number" || !Number.isFinite(entry.confidence) || entry.confidence < 0 || entry.confidence > 1) {
    errs.push(`${tag}: confidence must be a number from 0 to 1 (got ${JSON.stringify(entry.confidence)})`);
  }

  // ── rating: by host alone ───────────────────────────────────────────────────────────────────────────────
  const hv = entry.host_verdict;
  const hasVerdict = hv !== undefined && hv !== null;
  let accompanying = null;
  if (hasVerdict) {
    const verr = validateHostVerdictEntry(hv);
    if (verr.length) errs.push(`${tag}: host_verdict: ${verr.join("; ")}`);
    else if (host && normalizeVerdictHost(hv.host) !== normalizeVerdictHost(host)) {
      errs.push(`${tag}: host_verdict host ${JSON.stringify(hv.host)} is not the url's host ${JSON.stringify(host)}`);
    } else accompanying = new Map([[normalizeVerdictHost(hv.host), { class: hv.class, batch: "needs-search" }]]);
  }

  let tier = null;
  let tierSource = null;
  let verdict = null;
  if (host && !errs.length) {
    if (permanentlyUnregisteredClass(host) != null) {
      errs.push(`${tag}: host ${host} is an aggregator or hosting platform; it republishes someone else's text and is never registered, a verdict included. Cite the publisher's own page`);
    } else {
      const builtIn = classTierForHostAcrossNames(host, null);
      if (builtIn != null) { tier = builtIn; tierSource = "class_table"; }
      else {
        const committed = verdictPlacementForHost(host, ctx.committedVerdicts ?? null);
        const own = verdictPlacementForHost(host, accompanying);
        if (committed) { tier = committed.tier; tierSource = "committed_host_verdict"; verdict = { class: committed.class, batch: committed.batch }; }
        else if (own) { tier = own.tier; tierSource = "accompanying_host_verdict"; verdict = { class: own.class, evidence: hv.evidence }; }
        else {
          errs.push(`${tag}: the class table does not rate host ${host} and no host verdict places it; add "host_verdict" in the host-verdicts entry format (host, class, evidence, verdict_source, generated_at) or cite a host the table rates`);
        }
      }
    }
  }
  if (errs.length) return { errors: errs, plan: null };
  return { errors: [], plan: { host, tier, tier_source: tierSource, verdict, tier_class: Object.keys(HOST_CLASS_TIER).find((k) => HOST_CLASS_TIER[k] === tier) ?? null } };
}

function fileShapeErrors(json) {
  if (!isObj(json)) return ["file is not a JSON object"];
  const problems = [];
  if (!nonEmptyStr(json.batch) || !BATCH_RE.test(json.batch)) problems.push(`batch must match ${BATCH_RE} (got ${JSON.stringify(json.batch)})`);
  if (!nonEmptyStr(json.generated_at) || Number.isNaN(Date.parse(json.generated_at))) problems.push("generated_at must be an ISO timestamp");
  if (json.authored_by !== "session-lane") problems.push(`authored_by must be "session-lane" (got ${JSON.stringify(json.authored_by)})`);
  if (!Array.isArray(json.entries)) problems.push("entries must be an array");
  else if (json.entries.length > CEILINGS.entries) problems.push(`entries has ${json.entries.length} items, ceiling ${CEILINGS.entries}`);
  return problems;
}

/**
 * Validate a whole batch file. A structural problem fails the whole file closed (`ok: false`); a problem in one entry
 * refuses that entry only. An entry that repeats an earlier entry's need_id is refused.
 * @returns {{ok:boolean, fileErrors:string[], valid:Array<{index:number, entry:object, plan:object}>, refused:Array<{index:number, need_id:string|null, errors:string[]}>}}
 */
export function validateNeedsFile(json, ctx) {
  const shape = fileShapeErrors(json);
  const verdict = { ok: shape.length === 0, fileErrors: shape, valid: [], refused: [] };
  if (!verdict.ok) return verdict;
  const earlier = new Set();
  for (const [index, entry] of json.entries.entries()) {
    const need_id = isObj(entry) && typeof entry.need_id === "string" ? entry.need_id : null;
    const { errors, plan } = validateNeedEntry(entry, index, ctx);
    if (!errors.length && need_id && earlier.has(need_id)) errors.push(`entry ${index} (need ${need_id}): duplicate need_id in this batch`);
    if (need_id) earlier.add(need_id);
    if (errors.length) verdict.refused.push({ index, need_id, errors });
    else verdict.valid.push({ index, entry, plan });
  }
  return verdict;
}
