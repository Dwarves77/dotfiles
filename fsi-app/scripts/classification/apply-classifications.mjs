#!/usr/bin/env node
// apply-classifications.mjs — the ONLY place a propose-classifications.mjs classification PROPOSAL
// becomes a WRITTEN sources.{scope_topics,scope_modes,scope_verticals,expected_output} value. Two
// eligibility paths now exist:
//   1. RATIFIED (original design): mirrors scripts/connections/apply-tags.mjs's
//      resolution-note-as-ratification-vehicle design (read that file's header before touching this
//      one — same shape, different marker, different target table) — a flag is eligible once an
//      operator has resolved it with resolution_note carrying the literal token `ratify:classification`
//      (word-bounded, case-insensitive). --flag / --all-ratified drive this path.
//   2. AUTO-ADOPTED (operator ruling 2026-09-03, supersedes the original "every classification needs a
//      human ratify marker" posture for the fields where that marker was never adding a real decision —
//      spec 08 §Loop B forbids a human gate in the flywheel path). evaluateAutoAdoption/AUTO_ADOPT_FIELDS
//      below draw the line from classify-source.mjs's OWN evidence (read that file in full — every
//      proposal already carries a `confidence`): scope_modes/scope_verticals auto-adopt only at "high"
//      confidence (a single/exact name-keyword match — decisive); expected_output ALWAYS auto-adopts
//      despite classify-source.mjs labeling it "medium" — that label reflects "not yet refined by
//      observed history" (its own comment), not doubt about the ROLE -> DEFAULT mapping itself, which is
//      a closed, deterministic lookup (expected-output.mjs's table). scope_topics is EXCLUDED even
//      though the same "medium" label: scope.mjs's own header says a keyword match cannot itself judge
//      "regular and material coverage" (framework Axis 4a) — that judgment is the undecidable residue
//      this ruling says stays a flag, not a derivation this module can auto-adopt. jurisdictions was
//      never applicable at all (see below) — untouched either way. --auto-adopt drives this path, and
//      requires no operator action: it evaluates OPEN flags directly, applies the auto-adoptable
//      proposals, and resolves the flag ONLY when nothing APPLICABLE remains for a human to ratify
//      (resolution_note='auto-adopted:classification:<fields>', resolved_by='apply-classifications.mjs')
//      — a partially-eligible flag (e.g. scope_modes high + scope_topics medium) writes the high-confidence
//      field now and stays open, still ratifiable, for the remainder; a re-run is idempotent (buildMergePatch
//      only appends novel values, so already-applied fields no-op harmlessly).
//
// ONLY THE `source-classification` SUBTYPE IS ELIGIBLE (either path). propose-classifications.mjs's
// other two subtypes (`source-drift`, `item-anomaly`) are advisory-only by the framework's own design
// (Section 5b names four possible causes only an operator can disposition; Section 5c is a review
// trigger, not a value to write) — evaluateApplication/evaluateAutoAdoption both refuse them with a
// clear "advisory-only / not this subtype, nothing to apply" error rather than silently doing nothing.
//
// NEVER WRITES `jurisdictions`. classify-source.mjs's APPLICABLE_FIELDS allow-list (imported here, not
// redefined, so the two scripts cannot drift) excludes it by construction — see that module's header for
// why: sources.jurisdictions already carries a LIVE, differently-scoped region-bucket vocabulary from
// the canonical-source-candidate review flow, and this framework's ISO-shaped Axis-3 values would
// corrupt it. A jurisdiction proposal riding along in the same flag's PROPOSALS_JSON (applicable:false)
// is filtered out before any patch is built, even if it were somehow present, on both paths.
//
// WHAT THE RATIFIED PATH DOES, per --flag <id>:
//   1. Reads the integrity_flags row; requires createdBy == the `source-classification` subtype exactly,
//      status='resolved', resolved_by set, resolution_note carrying `ratify:classification`.
//   2. Extracts the PROPOSALS_JSON block propose-classifications.mjs's buildClassificationFlagRow()
//      wrote into `description`, keeps only entries whose field is in APPLICABLE_FIELDS.
//   3. Reads the target source's CURRENT scope_topics/scope_modes/scope_verticals/expected_output.
//   4. Builds the patch: array fields (scope_topics/scope_modes/scope_verticals) MERGE — existing values
//      never removed, only novel proposed values appended (small closed vocabularies, no cap needed:
//      the framework's own value sets top out at 14 topics / 6 modes / 9 verticals). expected_output
//      (a single JSONB distribution, not an accumulating tag list) is SET only when currently null —
//      the framework's own rule is "refined by observed history", so a classifier re-run must never
//      clobber a distribution that may already carry observed refinement.
//   5. Writes via guardedUpdate (rule 015: cited, snapshotted BEFORE the mutation) — ONLY when the patch
//      actually changes something; a flag whose every applicable proposal was already applied (or whose
//      expected_output was already set) applies as a documented no-op, never an empty write.
//
// Usage:
//   node scripts/classification/apply-classifications.mjs --flag <integrity_flags-id> [--dry|--execute]
//   node scripts/classification/apply-classifications.mjs --all-ratified [--dry|--execute]
//   node scripts/classification/apply-classifications.mjs --auto-adopt [--dry|--execute]
//     --dry         compute + report, write nothing (DEFAULT)
//     --execute     actually write the patch / resolve the flag (explicit opt-in)
//     --auto-adopt  scan every OPEN source-classification flag and auto-adopt its high-confidence /
//                   deterministic-default proposals (no ratify marker needed) — mutually exclusive with
//                   --flag and --all-ratified.
// Exit 0 done (including "already applied"/"no change needed") · 1 bad args / flag not applicable ·
// 2 no DB creds.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { APPLICABLE_FIELDS } from "../../src/lib/classification/classify-source.mjs";
import { topicKeywordMatch, REGULATORY_TOPIC_ROLES } from "../../src/lib/classification/scope.mjs";
import { AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE } from "../../src/lib/classification/flags.mjs";
import { createdBy } from "../../src/lib/connections/flag-namespaces.mjs";
import { buildDecisionNote } from "../../src/lib/connections/decision-note.mjs";

export const RATIFY_CLASSIFICATION_TOKEN = "ratify:classification";
const CLASSIFICATION_CREATED_BY = createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE);
const ARRAY_FIELDS = Object.freeze(["scope_topics", "scope_modes", "scope_verticals"]);

/**
 * True when `note` carries the `ratify:classification` marker as its own whitespace-delimited token
 * (not merely a substring). PURE.
 * @param {string|null|undefined} note
 * @returns {boolean}
 */
export function hasRatifyClassificationToken(note) {
  const text = String(note || "");
  return new RegExp(`(^|\\s)${RATIFY_CLASSIFICATION_TOKEN.replace(":", "\\:")}(\\s|$)`, "i").test(text);
}

/**
 * Extract + validate the PROPOSALS_JSON block propose-classifications.mjs's buildClassificationFlagRow()
 * wrote into a flag's `description`. PURE. Parses every well-shaped entry (including advisory-only
 * ones like jurisdiction); applying-time filtering to APPLICABLE_FIELDS happens in buildMergePatch.
 * @param {string|null|undefined} description
 * @returns {{ok:true, value:Array<{field:string, value:unknown, confidence:string, basis:string, applicable:boolean}>} | {ok:false, error:string}}
 */
export function extractProposalsFromDescription(description) {
  const m = /PROPOSALS_JSON:\s*(\[[\s\S]*\])\s*$/.exec(String(description || ""));
  if (!m) return { ok: false, error: "description has no parseable PROPOSALS_JSON block (was this flag opened by propose-classifications.mjs?)." };
  let parsed;
  try {
    parsed = JSON.parse(m[1]);
  } catch (e) {
    return { ok: false, error: `PROPOSALS_JSON did not parse as JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "PROPOSALS_JSON is not an array." };
  for (const p of parsed) {
    if (!p || typeof p !== "object" || typeof p.field !== "string" || !p.field.trim() || !("value" in p)) {
      return { ok: false, error: `PROPOSALS_JSON contains a malformed entry: ${JSON.stringify(p)}` };
    }
  }
  return { ok: true, value: parsed };
}

/**
 * Decide whether an integrity_flags row is applicable. PURE. Requires: the EXACT `source-classification`
 * createdBy (not merely AXIS_NAMESPACE-prefixed — drift/anomaly flags share the namespace but are never
 * apply-eligible), status='resolved', resolved_by set, the ratify:classification marker, and at least
 * one APPLICABLE_FIELDS proposal once parsed.
 * @param {{id?:string, created_by?:string, status?:string, resolved_by?:string|null,
 *   resolution_note?:string|null, description?:string, subject_ref?:string}} flag
 * @returns {{ok:true, sourceId:string, proposals:Array} | {ok:false, error:string}}
 */
export function evaluateApplication(flag) {
  if (!flag || typeof flag.id !== "string") return { ok: false, error: "flag not found." };
  if (flag.created_by !== CLASSIFICATION_CREATED_BY) {
    return {
      ok: false,
      error: `flag created_by "${flag.created_by}" is not "${CLASSIFICATION_CREATED_BY}" -- apply-classifications.mjs only applies source-classification findings ` +
        `(source-drift / item-anomaly are advisory-only by the framework's own design; nothing to apply).`,
    };
  }
  if (flag.status !== "resolved") return { ok: false, error: `flag status is '${flag.status}', not 'resolved' — not yet operator-resolved.` };
  if (!flag.resolved_by) return { ok: false, error: "flag has no resolved_by — not confirmed operator-resolved." };
  if (!hasRatifyClassificationToken(flag.resolution_note)) {
    return { ok: false, error: `resolution_note does not carry the '${RATIFY_CLASSIFICATION_TOKEN}' marker.` };
  }
  const parsed = extractProposalsFromDescription(flag.description);
  if (!parsed.ok) return parsed;
  const applicable = parsed.value.filter((p) => APPLICABLE_FIELDS.includes(p.field));
  if (!applicable.length) {
    return { ok: false, error: "flag carries zero APPLICABLE_FIELDS proposals (jurisdiction-only or empty) — nothing to apply." };
  }
  const sourceId = String(flag.subject_ref || "").trim();
  if (!sourceId) return { ok: false, error: "flag has no subject_ref (source id)." };
  return { ok: true, sourceId, proposals: applicable };
}

/**
 * Build the sources UPDATE patch from a flag's applicable proposals. PURE. Array fields merge (existing
 * values survive untouched, novel proposed values are appended, deduped); expected_output sets only
 * when currently null (never overwrites an already-classified/observed-refined distribution).
 * @param {{scope_topics?:unknown, scope_modes?:unknown, scope_verticals?:unknown, expected_output?:unknown}} currentSource
 * @param {Array<{field:string, value:unknown}>} proposals
 * @returns {{patch:Record<string,unknown>, applied:Record<string,unknown>, skipped:Record<string,string>}}
 */
export function buildMergePatch(currentSource, proposals) {
  const patch = {}, applied = {}, skipped = {};

  for (const field of ARRAY_FIELDS) {
    const existing = Array.isArray(currentSource?.[field]) ? currentSource[field] : [];
    const existingSet = new Set(existing);
    const candidateValues = proposals
      .filter((p) => p.field === field)
      .flatMap((p) => (Array.isArray(p.value) ? p.value : [p.value]));
    const novel = [...new Set(candidateValues.filter((v) => !existingSet.has(v)))];
    if (novel.length) {
      patch[field] = [...existing, ...novel];
      applied[field] = novel;
    } else if (candidateValues.length) {
      skipped[field] = "every proposed value already present";
    }
  }

  const eoProposal = proposals.find((p) => p.field === "expected_output");
  if (eoProposal) {
    if (currentSource?.expected_output === null || currentSource?.expected_output === undefined) {
      patch.expected_output = eoProposal.value;
      applied.expected_output = eoProposal.value;
    } else {
      skipped.expected_output = "already set — a classifier re-run never overwrites an existing expected_output (framework: refined by observed history, not reset by re-classification).";
    }
  }

  return { patch, applied, skipped };
}

/**
 * The whole decide-and-apply core, DB access injected (mirrors apply-tags.mjs's applyTags() —
 * directly testable with a fake client, no real Supabase creds, no process.exit).
 * @param {{
 *   readFlag: (flagId:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   readSource: (sourceId:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   updateSource: (sourceId:string, patch:object) => Promise<{updated:number, snapshot:string|null}>,
 * }} deps
 * @param {string} flagId
 * @param {{execute:boolean}} opts
 * @returns {Promise<
 *   {status:'not_found'|'read_error'|'not_ratifiable'|'source_read_error'|'source_not_found', error:string} |
 *   {status:'no_change', sourceId:string, merge:object} |
 *   {status:'dry_run', sourceId:string, merge:object} |
 *   {status:'applied', sourceId:string, merge:object, updated:number, snapshot:string|null}
 * >}
 */
export async function applyClassification(deps, flagId, { execute } = {}) {
  const { data: flag, error } = await deps.readFlag(flagId);
  if (error) return { status: "read_error", error: error.message };
  if (!flag) return { status: "not_found", error: `no integrity_flags row with id ${flagId}.` };

  const decision = evaluateApplication(flag);
  if (!decision.ok) return { status: "not_ratifiable", error: decision.error };

  const { data: source, error: srcErr } = await deps.readSource(decision.sourceId);
  if (srcErr) return { status: "source_read_error", error: srcErr.message };
  if (!source) return { status: "source_not_found", error: `no sources row with id ${decision.sourceId}.` };

  const merge = buildMergePatch(source, decision.proposals);
  if (!Object.keys(merge.patch).length) return { status: "no_change", sourceId: decision.sourceId, merge };
  if (!execute) return { status: "dry_run", sourceId: decision.sourceId, merge };

  const upd = await deps.updateSource(decision.sourceId, merge.patch);
  return { status: "applied", sourceId: decision.sourceId, merge, updated: upd.updated, snapshot: upd.snapshot };
}

// ─────────────────────────── auto-adoption path (operator ruling 2026-09-03) ───────────────────────────
// See file header for the full evidence-based reasoning. AUTO_ADOPT_FIELDS is a SUBSET of
// APPLICABLE_FIELDS — never wider — so a field this framework has no safe write target for (jurisdictions)
// can never auto-adopt either, by construction (isAutoAdoptableProposal below only ever accepts a field
// already screened through APPLICABLE_FIELDS in evaluateAutoAdoption's partition step).
export const AUTO_ADOPT_FIELDS = Object.freeze(["scope_modes", "scope_verticals", "expected_output"]);

/**
 * True when a single proposal is auto-adoptable without operator ratification. PURE. scope_topics is
 * deliberately absent from AUTO_ADOPT_FIELDS (see file header) so it always returns false regardless of
 * confidence — the undecidable residue the operator ruling says stays a flag.
 * @param {{field?:string, confidence?:string}} proposal
 * @returns {boolean}
 */
export function isAutoAdoptableProposal(proposal) {
  if (!proposal || typeof proposal.field !== "string" || !AUTO_ADOPT_FIELDS.includes(proposal.field)) return false;
  if (proposal.field === "expected_output") return true; // closed role->default lookup — deterministic (see header), confidence label is always "medium" by classify-source.mjs's own design and is not the gate here
  return proposal.confidence === "high"; // scope_modes / scope_verticals: only a decisive keyword match
}

/**
 * Split a proposal list into auto-adoptable vs everything else (including advisory-only jurisdiction
 * proposals, which are never in AUTO_ADOPT_FIELDS or APPLICABLE_FIELDS). PURE.
 * @param {Array<{field:string, confidence?:string}>} proposals
 * @returns {{autoAdoptable:Array<object>, remaining:Array<object>}}
 */
export function partitionProposals(proposals) {
  const autoAdoptable = [], remaining = [];
  for (const p of Array.isArray(proposals) ? proposals : []) {
    (isAutoAdoptableProposal(p) ? autoAdoptable : remaining).push(p);
  }
  return { autoAdoptable, remaining };
}

/**
 * Decide whether an OPEN integrity_flags row has anything to decide right now. PURE. Unlike
 * evaluateApplication, this never requires status='resolved' or a ratify marker — it evaluates the flag
 * as it stands. Widened 2026-09-12 (Part 7 task 7.2 / ADR-030 rider): "every proposal decided, the flag
 * closes with the decisions recorded" — this no longer requires an AUTO_ADOPT_FIELDS-only proposal to be
 * present (a flag whose ONLY proposal was, say, jurisdiction-only or scope_topics-only used to have
 * NOTHING here and stayed open forever — that residue is exactly what this rider closes). Any flag with
 * at least one parseable proposal is now decidable; decideClassificationProposals (below) decides every
 * one of them, adopt or decline.
 * @param {{id?:string, created_by?:string, status?:string, description?:string, subject_ref?:string}} flag
 * @returns {{ok:true, sourceId:string, proposals:Array} | {ok:false, error:string}}
 */
export function evaluateAutoAdoption(flag) {
  if (!flag || typeof flag.id !== "string") return { ok: false, error: "flag not found." };
  if (flag.created_by !== CLASSIFICATION_CREATED_BY) {
    return {
      ok: false,
      error: `flag created_by "${flag.created_by}" is not "${CLASSIFICATION_CREATED_BY}" -- apply-classifications.mjs only auto-adopts source-classification findings ` +
        `(source-drift / item-anomaly are advisory-only by the framework's own design; nothing to apply).`,
    };
  }
  if (flag.status !== "open") {
    return { ok: false, error: `flag status is '${flag.status}', not 'open' -- auto-adoption evaluates open flags only (already-resolved flags went through ratification or a prior auto-adopt pass).` };
  }
  const parsed = extractProposalsFromDescription(flag.description);
  if (!parsed.ok) return parsed;
  if (!parsed.value.length) return { ok: false, error: "flag carries zero proposals -- nothing to decide." };
  const sourceId = String(flag.subject_ref || "").trim();
  if (!sourceId) return { ok: false, error: "flag has no subject_ref (source id)." };
  return { ok: true, sourceId, proposals: parsed.value };
}

// ───────────────────── EVERY PROPOSAL DECIDED (Part 7 task 7.2 / ADR-030 rider, 2026-09-12) ─────────────
// "scope_topics adopts the classifier's proposal when its evidence string is present in the source's
// stored capture, else declined with the reason. jurisdiction proposals adopt when the proposed
// jurisdiction appears in the source's registry row or URL host country, else declined.
// scope_modes/scope_verticals/expected_output as today. Every proposal decided, the flag closes with the
// decisions recorded." "As today" for scope_modes/scope_verticals/expected_output means the WRITE rule is
// unchanged (only a decisive/deterministic proposal writes) — what changes is that the non-writing
// residue (a medium-confidence scope_modes/scope_verticals proposal) now DECLINES with a reason instead
// of silently sitting on an open flag forever (ADR-030 rider: "a decision of 'no action, and why' is a
// valid close").
//
// JURISDICTION, A HARD EXISTING GATE (read classify-source.mjs's header in full before changing this):
// sources.jurisdictions is a LIVE, differently-scoped column (region buckets eu|us|uk|latam|asia|hk|
// meaf|global, populated by the canonical-source-candidate review flow) — writing this framework's
// ISO-3166 Axis-3 values into it would silently corrupt three live reads (AffectedLanesCard, MapPageView,
// the workspace RPCs). classify-source.mjs's own proposal already marks it `applicable:false` for exactly
// this reason. This rider does not carry an ADR authorizing a dedicated Axis-3 column, so a jurisdiction
// proposal is DECIDED (declined, with the architectural reason) rather than written — the safe reading of
// "adopt when it matches, else decline": there is no safe column to adopt INTO, so it always declines,
// same as it always silently never-applied before this rider, except now the reason is recorded and the
// flag can close instead of hanging on this one un-actionable proposal forever.
//
// scope_topics EVIDENCE RE-CHECK: classify-source.mjs's proposal carries ONE shared `basis` string for
// the whole matched-topic array (no per-topic evidence field) — this function re-derives the per-topic
// evidence itself via scope.mjs's topicKeywordMatch/REGULATORY_TOPIC_ROLES (the SAME table
// classifyScopeTopics scans), so a topic whose keyword no longer matches the source's CURRENT name (or
// whose role-derived "regulatory" add-on no longer applies) declines rather than adopting on a stale
// proposal payload.

/**
 * Decide one classification proposal that is NOT scope_topics (scope_modes / scope_verticals /
 * expected_output / jurisdictions). PURE.
 * @param {{field:string, value:unknown, confidence?:string}} proposal
 * @param {{expected_output?:unknown}} source
 * @returns {{field:string, value:unknown, label:string, decision:"adopt"|"decline", reason:string}}
 */
export function decideClassificationProposal(proposal, source) {
  const field = proposal.field;
  const label = `${field}=${JSON.stringify(proposal.value)}`;

  if (field === "expected_output") {
    const already = source?.expected_output !== null && source?.expected_output !== undefined;
    return {
      ...proposal, label, decision: already ? "decline" : "adopt",
      reason: already
        ? "expected_output already set -- a classifier re-run never overwrites an existing distribution (framework: refined by observed history)."
        : "closed role->default Axis-5 lookup -- deterministic, always adopted when unset.",
    };
  }

  if (field === "scope_modes" || field === "scope_verticals") {
    const decisive = proposal.confidence === "high";
    return {
      ...proposal, label, decision: decisive ? "adopt" : "decline",
      reason: decisive
        ? `confidence 'high' -- decisive single/exact name-keyword match for ${field}.`
        : `confidence '${proposal.confidence ?? "unknown"}' does not meet the decisive 'high' bar for ${field} (only an exact name-keyword match auto-adopts without operator ratification).`,
    };
  }

  if (field === "jurisdictions") {
    return {
      ...proposal, label, decision: "decline",
      reason: "no safe write target: sources.jurisdictions holds the live region-bucket vocabulary (eu|us|uk|latam|asia|hk|meaf|global), not this framework's ISO-3166 Axis-3 values (classify-source.mjs) -- a dedicated column needs an ADR before this proposal can adopt.",
    };
  }

  return { ...proposal, label, decision: "decline", reason: `field "${field}" has no decision rule in apply-classifications.mjs.` };
}

/**
 * Decide a scope_topics proposal AT THE PER-TOPIC LEVEL — one decision row per proposed topic, since
 * classify-source.mjs's proposal.value is a multi-valued array with no per-topic evidence field of its
 * own. PURE. Evidence is re-derived (never trusted from the stale payload) via scope.mjs's own keyword
 * table / role set.
 * @param {{field:"scope_topics", value:string[]}} proposal
 * @param {{name?:string|null, source_role?:string|null}} source
 * @returns {Array<{field:"scope_topics", tag:string, label:string, decision:"adopt"|"decline", reason:string}>}
 */
export function decideScopeTopicsProposal(proposal, source) {
  const topics = Array.isArray(proposal.value) ? proposal.value : [];
  const name = source?.name ?? null;
  const role = source?.source_role ?? null;
  return topics.map((topic) => {
    const label = `scope_topics:${topic}`;
    const kwMatch = topicKeywordMatch(topic, name);
    const roleMatch = topic === "regulatory" && role && REGULATORY_TOPIC_ROLES.has(role) ? `source_role=${role}` : null;
    const evidence = kwMatch || roleMatch;
    if (evidence) {
      return { field: "scope_topics", tag: topic, label, decision: "adopt", reason: `evidence "${evidence}" re-confirmed in the source's own name/role at apply time.` };
    }
    return { field: "scope_topics", tag: topic, label, decision: "decline", reason: `no re-confirmable keyword or role evidence for topic "${topic}" in the source's own stored name/role (framework Axis 4a "regular and material coverage" needs a live, re-checkable signal, not a stale proposal).` };
  });
}

/**
 * Decide EVERY proposal a flag carries, expanding scope_topics into one row per topic. PURE. No
 * residue: every input proposal (and every scope_topics member) produces exactly one decision row.
 * @param {Array<object>} proposals
 * @param {object} source
 * @returns {Array<object>}
 */
export function decideClassificationProposals(proposals, source) {
  const rows = [];
  for (const p of Array.isArray(proposals) ? proposals : []) {
    if (p.field === "scope_topics") rows.push(...decideScopeTopicsProposal(p, source));
    else rows.push(decideClassificationProposal(p, source));
  }
  return rows;
}

/**
 * Re-assemble the ADOPTED decision rows into buildMergePatch-ready proposals — scope_topics tags are
 * regrouped into ONE `{field:"scope_topics", value:[...]}` entry (buildMergePatch's array-field merge
 * expects one row per field, not one per tag). PURE.
 * @param {Array<object>} decisions - decideClassificationProposals() output
 * @returns {Array<{field:string, value:unknown}>}
 */
export function buildAdoptedProposalsForMerge(decisions) {
  const adopted = (Array.isArray(decisions) ? decisions : []).filter((d) => d.decision === "adopt");
  const topics = adopted.filter((d) => d.field === "scope_topics").map((d) => d.tag);
  const others = adopted.filter((d) => d.field !== "scope_topics");
  const merged = [...others];
  if (topics.length) merged.push({ field: "scope_topics", value: topics });
  return merged;
}

/**
 * The decide-and-apply core, DB access injected (mirrors applyClassification's shape, plus `resolveFlag`
 * for the close step). Directly testable with a fake client. Every reachable proposal is decided; the
 * flag ALWAYS closes once reached (task 7.2: "no residue stays open" — a decline is a valid, recorded
 * close, not a reason to leave the queue item open).
 * @param {{
 *   readFlag: (flagId:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   readSource: (sourceId:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   updateSource: (sourceId:string, patch:object) => Promise<{updated:number, snapshot:string|null}>,
 *   resolveFlag: (flagId:string, note:string) => Promise<{updated:number, snapshot:string|null}>,
 * }} deps
 * @param {string} flagId
 * @param {{execute:boolean}} opts
 * @returns {Promise<
 *   {status:'not_found'|'read_error'|'not_auto_adoptable'|'source_read_error'|'source_not_found', error:string} |
 *   {status:'dry_run', sourceId:string, merge:object, decisions:Array, hasWrite:boolean} |
 *   {status:'applied', sourceId:string, merge:object, decisions:Array, written:boolean, resolved:true}
 * >}
 */
export async function autoAdoptClassification(deps, flagId, { execute } = {}) {
  const { data: flag, error } = await deps.readFlag(flagId);
  if (error) return { status: "read_error", error: error.message };
  if (!flag) return { status: "not_found", error: `no integrity_flags row with id ${flagId}.` };

  const decision = evaluateAutoAdoption(flag);
  if (!decision.ok) return { status: "not_auto_adoptable", error: decision.error };

  const { data: source, error: srcErr } = await deps.readSource(decision.sourceId);
  if (srcErr) return { status: "source_read_error", error: srcErr.message };
  if (!source) return { status: "source_not_found", error: `no sources row with id ${decision.sourceId}.` };

  const decisions = decideClassificationProposals(decision.proposals, source);
  const mergeProposals = buildAdoptedProposalsForMerge(decisions);
  const merge = buildMergePatch(source, mergeProposals);
  const hasWrite = Object.keys(merge.patch).length > 0;
  const note = buildDecisionNote("apply-classifications decided", decisions);

  if (!execute) return { status: "dry_run", sourceId: decision.sourceId, merge, decisions, hasWrite };

  if (hasWrite) await deps.updateSource(decision.sourceId, merge.patch);
  await deps.resolveFlag(flagId, note);
  return { status: "applied", sourceId: decision.sourceId, merge, decisions, written: hasWrite, resolved: true };
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) await main();

async function main() {
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

const args = process.argv.slice(2);
const flagIdRaw = args[args.indexOf("--flag") + 1];
const flagId = args.includes("--flag") && flagIdRaw && !flagIdRaw.startsWith("--") ? flagIdRaw : null;
const ALL_RATIFIED = args.includes("--all-ratified");
const AUTO_ADOPT = args.includes("--auto-adopt");
const EXECUTE = args.includes("--execute");

const modesSelected = [flagId && "flag", ALL_RATIFIED && "all-ratified", AUTO_ADOPT && "auto-adopt"].filter(Boolean);
if (modesSelected.length === 0) {
  console.error("apply-classifications: one of --flag <integrity_flags-id>, --all-ratified, or --auto-adopt is required.");
  process.exit(1);
}
if (modesSelected.length > 1) {
  console.error(`apply-classifications: pass exactly one of --flag / --all-ratified / --auto-adopt, not ${modesSelected.join(" + ")} (ambiguous selection).`);
  process.exit(1);
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("apply-classifications: no DB creds — cannot run here (exit 2).");
  process.exit(2);
}

const { readClient, guardedUpdate } = await import("../lib/db.mjs");
const sb = readClient();

const CITE = {
  skill: "source-classification-framework-2026-05-10",
  reason: "AXIS lane (2026-09-02) + GSIG lane (2026-09-03, auto-adoption): write a ratified or auto-adopted classify-source.mjs proposal onto sources' Axis 3/4/5 columns (merge/set-once-only, never overwrites), through the guarded write path (rule 015).",
};

const deps = {
  readFlag: (id) => sb.from("integrity_flags").select("*").eq("id", id).maybeSingle(),
  // Widened 2026-09-12 (task 7.2): decideScopeTopicsProposal re-checks a scope_topics proposal's
  // per-topic evidence against the source's OWN name/source_role at apply time.
  readSource: (id) => sb.from("sources").select("id, name, source_role, scope_topics, scope_modes, scope_verticals, expected_output").eq("id", id).maybeSingle(),
  updateSource: async (id, patch) => {
    const res = await guardedUpdate("sources", (qb) => qb.eq("id", id), patch, { cite: CITE });
    return { updated: res.updated, snapshot: res.snapshot };
  },
  resolveFlag: async (id, note) => {
    const res = await guardedUpdate(
      "integrity_flags",
      (qb) => qb.eq("id", id),
      { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "apply-classifications.mjs", resolution_note: note },
      { cite: CITE },
    );
    return { updated: res.updated, snapshot: res.snapshot };
  },
};

function report(flagId, result) {
  switch (result.status) {
    case "not_found":
    case "read_error":
    case "not_ratifiable":
    case "not_auto_adoptable":
    case "source_read_error":
    case "source_not_found":
      console.error(`apply-classifications: flag ${flagId} — ${result.error}`);
      return false;
    case "no_change":
      console.log(`apply-classifications: flag ${flagId} — no change needed for source ${result.sourceId} (every applicable proposal already present or expected_output already set). Nothing written.`);
      return true;
    case "dry_run":
      console.log(
        `apply-classifications: flag ${flagId} applicable -> source ${result.sourceId} patch: ${JSON.stringify(result.merge.patch)}` +
        (typeof result.willResolve === "boolean" ? ` (would${result.willResolve ? "" : " NOT"} resolve the flag)` : "") +
        ` (DRY RUN — nothing written. Re-run with --execute to apply.)`,
      );
      return true;
    case "applied":
      if (typeof result.written === "boolean") {
        console.log(
          `WROTE: source ${result.sourceId}${result.written ? ` patch ${JSON.stringify(result.merge.patch)}` : " (no patch — already applied)"}` +
          `${result.resolved ? "; flag resolved (auto-adopted:classification)" : "; flag left open (remaining proposal(s) still need operator ratification)"}.`,
        );
      } else {
        console.log(`WROTE: source ${result.sourceId} updated (${result.updated} row) with ${JSON.stringify(result.merge.patch)} (snapshot: ${result.snapshot}).`);
      }
      return true;
    default:
      return false;
  }
}

let anyFailed = false;

if (flagId) {
  const result = await applyClassification(deps, flagId, { execute: EXECUTE });
  if (!report(flagId, result)) anyFailed = true;
} else if (ALL_RATIFIED) {
  const { data: candidates, error: listErr } = await sb
    .from("integrity_flags")
    .select("id")
    .eq("status", "resolved")
    .eq("created_by", CLASSIFICATION_CREATED_BY);
  if (listErr) {
    console.error(`apply-classifications: --all-ratified candidate read failed: ${listErr.message}`);
    process.exit(1);
  }
  const ids = (candidates ?? []).map((r) => r.id);
  console.log(`apply-classifications: --all-ratified — ${ids.length} resolved ${CLASSIFICATION_CREATED_BY} flag(s) to evaluate${EXECUTE ? "" : " (DRY RUN)"}.`);
  let appliedCount = 0, skippedCount = 0;
  for (const id of ids) {
    const result = await applyClassification(deps, id, { execute: EXECUTE });
    const ok = report(id, result);
    if (result.status === "not_ratifiable") { skippedCount++; continue; } // not every resolved flag carries ratify:classification — expected, not a failure
    if (!ok) anyFailed = true;
    if (result.status === "applied") appliedCount++;
  }
  console.log(`apply-classifications: --all-ratified done — ${appliedCount} applied, ${skippedCount} not-yet-ratified (skipped), of ${ids.length} candidate(s).`);
} else {
  // --auto-adopt (operator ruling 2026-09-03): scan every OPEN source-classification flag directly —
  // no ratify marker, no resolved status required. See file header + evaluateAutoAdoption for the
  // per-field confidence rule.
  const { data: candidates, error: listErr } = await sb
    .from("integrity_flags")
    .select("id")
    .eq("status", "open")
    .eq("created_by", CLASSIFICATION_CREATED_BY);
  if (listErr) {
    console.error(`apply-classifications: --auto-adopt candidate read failed: ${listErr.message}`);
    process.exit(1);
  }
  const ids = (candidates ?? []).map((r) => r.id);
  console.log(`apply-classifications: --auto-adopt — ${ids.length} open ${CLASSIFICATION_CREATED_BY} flag(s) to evaluate${EXECUTE ? "" : " (DRY RUN)"}.`);
  let appliedCount = 0, resolvedCount = 0, skippedCount = 0;
  for (const id of ids) {
    const result = await autoAdoptClassification(deps, id, { execute: EXECUTE });
    const ok = report(id, result);
    if (result.status === "not_auto_adoptable") { skippedCount++; continue; } // no auto-adoptable field on this flag — expected, not a failure
    if (!ok) anyFailed = true;
    if (result.status === "applied") { appliedCount++; if (result.resolved) resolvedCount++; }
  }
  console.log(`apply-classifications: --auto-adopt done — ${appliedCount} applied (${resolvedCount} fully resolved), ${skippedCount} not-auto-adoptable (skipped), of ${ids.length} candidate(s).`);
}

process.exit(anyFailed ? 1 : 0);
}
