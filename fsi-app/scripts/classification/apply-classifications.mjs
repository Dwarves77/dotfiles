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
//      proposal already carries a `confidence`): scope_modes/scope_verticals/jurisdiction_iso auto-adopt
//      only at "high" confidence (a single/exact name-keyword or host-identity match -- decisive);
//      expected_output ALWAYS auto-adopts despite classify-source.mjs labeling it "medium" -- that label
//      reflects "not yet refined by observed history" (its own comment), not doubt about the ROLE ->
//      DEFAULT mapping itself, which is a closed, deterministic lookup (expected-output.mjs's table).
//      scope_topics is EXCLUDED even though the same "medium" label: scope.mjs's own header says a
//      keyword match cannot itself judge "regular and material coverage" (framework Axis 4a) -- that
//      judgment is the undecidable residue this ruling says stays a flag, not a derivation this module
//      can auto-adopt. jurisdiction_iso (D9, lane L14, 2026-09-13) additionally declines any value not
//      shaped per vocab.mjs's isValidJurisdictionValue, regardless of confidence -- see
//      decideClassificationProposal below. The legacy `jurisdictions` column was never applicable at
//      all and stays untouched forever (see classify-source.mjs's header). --auto-adopt drives this path, and
//      requires no operator action: it evaluates OPEN flags directly, applies the auto-adoptable
//      proposals, and resolves the flag ONLY when nothing APPLICABLE remains for a human to ratify
//      (resolution_note='auto-adopted:classification:<fields>', resolved_by='apply-classifications.mjs')
//      — a partially-eligible flag (e.g. scope_modes high + scope_topics medium) writes the high-confidence
//      field now and stays open, still ratifiable, for the remainder; a re-run is idempotent (buildMergePatch
//      only appends novel values, so already-applied fields no-op harmlessly).
//
// ONLY THE `source-classification` SUBTYPE IS ELIGIBLE for RATIFICATION/AUTO-ADOPTION (either path).
// evaluateApplication/evaluateAutoAdoption both refuse the other two subtypes with a clear "advisory-only
// / not this subtype, nothing to apply" error. `source-drift` and `item-anomaly` are handled separately,
// by their OWN dedicated functions (D17 family 5, defect-fix-plan-2026-09-12, below):
// `autoResolveDriftFlag` adopts the source's own observed item-category distribution as expected_output
// once the sample is large enough, else resolves "insufficient sample"; never left open either way;
// `retireAnomalyFlag` closes any surviving open item-anomaly flag with a fixed retirement note (the
// anomaly detector itself is deleted from propose-classifications.mjs). Both are wired into this file's
// own `--auto-adopt` CLI and the `apply-classifications` MAINT step.
//
// ZERO-PROPOSAL `source-classification` FLAGS (D17 family 4, defect-fix-plan-2026-09-12): a flag whose
// PROPOSALS_JSON parses to an empty array used to fall out of evaluateAutoAdoption as `not_auto_adoptable`
// and sit open forever. autoAdoptClassification now detects this case and re-derives from the SC-13 class
// table (`classTierForHost`) and the source's own observed item-category distribution, two deterministic
// signals classify-source.mjs's name/role matchers never read, via `reDeriveZeroProposalClassification`,
// resolving the flag either with the adopted values or a fixed "no derivable classification" note. See
// that function's own header comment for the exact, deliberately narrow scope (only tier 1 is
// unambiguous; tier 2 contributes scope_topics only; the observed distribution always can feed
// expected_output once the sample is large enough).
//
// NEVER WRITES the legacy `jurisdictions` column. classify-source.mjs's APPLICABLE_FIELDS allow-list
// (imported here, not redefined, so the two scripts cannot drift) excludes it by construction -- see
// that module's header for why: sources.jurisdictions already carries a LIVE, differently-scoped
// region-bucket vocabulary from the canonical-source-candidate review flow, and this framework's
// ISO-shaped Axis-3 values would corrupt it. This module never proposes or writes field "jurisdictions".
// Axis 3 writes go to `jurisdiction_iso` only (D9, lane L14, 2026-09-13; migration 033), through the
// same APPLICABLE_FIELDS gate as every other axis.
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

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APPLICABLE_FIELDS } from "../../src/lib/classification/classify-source.mjs";
import { isValidJurisdictionValue } from "../../src/lib/classification/vocab.mjs";
import { topicKeywordMatch, REGULATORY_TOPIC_ROLES } from "../../src/lib/classification/scope.mjs";
import { expectedOutputForRole, isValidDistribution } from "../../src/lib/classification/expected-output.mjs";
import { observedDistributionFromItems } from "../../src/lib/classification/routing.mjs";
import {
  AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE, SOURCE_DRIFT_SUBTYPE, ITEM_ANOMALY_SUBTYPE,
} from "../../src/lib/classification/flags.mjs";
import { createdBy } from "../../src/lib/connections/flag-namespaces.mjs";
import { buildDecisionNote } from "../../src/lib/connections/decision-note.mjs";
import { classTierForHost } from "../../src/lib/sources/host-authority.ts";
import { loadLocalEnvFile } from "../lib/env-file.mjs";

export const RATIFY_CLASSIFICATION_TOKEN = "ratify:classification";
const CLASSIFICATION_CREATED_BY = createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE);
export const DRIFT_CREATED_BY = createdBy(AXIS_NAMESPACE, SOURCE_DRIFT_SUBTYPE);
export const ANOMALY_CREATED_BY = createdBy(AXIS_NAMESPACE, ITEM_ANOMALY_SUBTYPE);
// jurisdiction_iso added (D9, lane L14, 2026-09-13): an accumulating tag list exactly like the three
// scope fields -- existing values survive, novel proposed values are appended, never removed.
const ARRAY_FIELDS = Object.freeze(["jurisdiction_iso", "scope_topics", "scope_modes", "scope_verticals"]);

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
 * wrote into a flag's `description`. PURE. Parses every well-shaped entry; applying-time filtering to
 * APPLICABLE_FIELDS happens in buildMergePatch.
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
// APPLICABLE_FIELDS -- never wider -- so a field this framework has no safe write target for (the legacy
// `jurisdictions` column) can never auto-adopt either, by construction (isAutoAdoptableProposal below
// only ever accepts a field already screened through APPLICABLE_FIELDS in evaluateAutoAdoption's
// partition step). jurisdiction_iso added (D9, lane L14, 2026-09-13): the scope_modes rule -- a decisive
// host-identity match (confidence "high") auto-adopts; the vocab-shape check lives in
// decideClassificationProposal (the live decision path autoAdoptClassification actually uses), not here.
export const AUTO_ADOPT_FIELDS = Object.freeze(["jurisdiction_iso", "scope_modes", "scope_verticals", "expected_output"]);

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
  return proposal.confidence === "high"; // scope_modes / scope_verticals / jurisdiction_iso: only a decisive match
}

/**
 * Split a proposal list into auto-adoptable vs everything else (including a medium-confidence
 * jurisdiction_iso proposal, and a legacy field "jurisdictions" proposal -- the latter is never in
 * AUTO_ADOPT_FIELDS or APPLICABLE_FIELDS at all). PURE.
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
 * closes with the decisions recorded" -- this no longer requires an AUTO_ADOPT_FIELDS-only proposal to be
 * present (a flag whose ONLY proposal was, say, jurisdiction-only or scope_topics-only used to have
 * NOTHING here and stayed open forever -- that residue is exactly what this rider closes). Any flag with
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
  if (!parsed.value.length) return { ok: false, error: "flag carries zero proposals; nothing to decide." };
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
// unchanged (only a decisive/deterministic proposal writes) -- what changes is that the non-writing
// residue (a medium-confidence scope_modes/scope_verticals proposal) now DECLINES with a reason instead
// of silently sitting on an open flag forever (ADR-030 rider: "a decision of 'no action, and why' is a
// valid close").
//
// JURISDICTION_ISO NOW ADOPTS (D9, lane L14, 2026-09-13, CORRECTING the ADR-030-rider posture below,
// which is retained here in comment form only as the record of what was true before migration 033):
// read classify-source.mjs's header in full before changing this. Migration 033
// (fsi-app/supabase/migrations/033_jurisdiction_iso.sql) added `sources.jurisdiction_iso TEXT[]`, a
// safe, ISO-shaped Axis-3 home distinct from the legacy `sources.jurisdictions` region-bucket column
// (eu|us|uk|latam|asia|hk|meaf|global) three live surfaces read (AffectedLanesCard, MapPageView, the
// workspace RPCs) -- that legacy column is still never written by this path, by construction
// (classify-source.mjs never emits field "jurisdictions"; APPLICABLE_FIELDS never lists it). The decline
// this rider originally specified is RETIRED because the column exists: a jurisdiction_iso proposal now
// follows the same decisive-match rule as scope_modes/scope_verticals (confidence "high" adopts, else
// declines with a reason), plus one extra gate scope_modes/scope_verticals don't need -- a value not
// shaped per vocab.mjs's `isValidJurisdictionValue` (an ISO 3166-1/3166-2 code or a known free-text
// sentinel) declines regardless of confidence, since jurisdiction.mjs's own classifier is host-derived
// and a shape violation there would indicate a future bug in that table, never a judgment call to defer.
//
// scope_topics EVIDENCE RE-CHECK: classify-source.mjs's proposal carries ONE shared `basis` string for
// the whole matched-topic array (no per-topic evidence field) -- this function re-derives the per-topic
// evidence itself via scope.mjs's topicKeywordMatch/REGULATORY_TOPIC_ROLES (the SAME table
// classifyScopeTopics scans), so a topic whose keyword no longer matches the source's CURRENT name (or
// whose role-derived "regulatory" add-on no longer applies) declines rather than adopting on a stale
// proposal payload.

/**
 * Decide one classification proposal that is NOT scope_topics (scope_modes / scope_verticals /
 * jurisdiction_iso / expected_output). PURE.
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
        ? "expected_output already set; a classifier re-run never overwrites an existing distribution (framework: refined by observed history)."
        : "closed role->default Axis-5 lookup, deterministic; always adopted when unset.",
    };
  }

  if (field === "scope_modes" || field === "scope_verticals") {
    const decisive = proposal.confidence === "high";
    return {
      ...proposal, label, decision: decisive ? "adopt" : "decline",
      reason: decisive
        ? `confidence 'high': decisive single/exact name-keyword match for ${field}.`
        : `confidence '${proposal.confidence ?? "unknown"}' does not meet the decisive 'high' bar for ${field}; only an exact name-keyword match auto-adopts without operator ratification.`,
    };
  }

  if (field === "jurisdiction_iso") {
    // D9, lane L14, 2026-09-13: migration 033 gave Axis 3 a safe home, retiring the old "always
    // declines, no safe write target" rule below. Vocab shape is checked FIRST and unconditionally
    // (jurisdiction.mjs's own host table is deterministic; a shape violation is a future bug in that
    // table, never a judgment call to defer), then the same decisive-match rule as scope_modes/
    // scope_verticals.
    const values = Array.isArray(proposal.value) ? proposal.value : [proposal.value];
    const invalid = values.find((v) => !isValidJurisdictionValue(v));
    if (invalid !== undefined) {
      return {
        ...proposal, label, decision: "decline",
        reason: `jurisdiction_iso value ${invalid} is not in the framework vocabulary.`,
      };
    }
    const decisive = proposal.confidence === "high";
    return {
      ...proposal, label, decision: decisive ? "adopt" : "decline",
      reason: decisive
        ? "confidence 'high': decisive host-identity match for jurisdiction_iso (jurisdiction.mjs institutional-domain signal)."
        : `confidence '${proposal.confidence ?? "unknown"}' does not meet the decisive 'high' bar for jurisdiction_iso; only a decisive host-identity match auto-adopts without operator ratification.`,
    };
  }

  return { ...proposal, label, decision: "decline", reason: `field "${field}" has no decision rule in apply-classifications.mjs.` };
}

/**
 * Decide a scope_topics proposal AT THE PER-TOPIC LEVEL -- one decision row per proposed topic, since
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
 * Re-assemble the ADOPTED decision rows into buildMergePatch-ready proposals -- scope_topics tags are
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

// ─────────────── Family 4: classification zero-proposal re-derivation (D17, 2026-09-12) ───────────────
// "1,287 open flywheel-axis:source-classification flags; the zero-proposal subset ... re-derives the
// unset axes from the SC-13 class table (classTierForHost and the class it resolves) and the source's
// observed item-category distribution ... resolves every flag with the adopted values or the note
// 'no derivable classification from the class table or the observed output on <date>; re-evaluated on
// the next classify run'."
//
// SCOPE, NAMED (this decider never guesses a role classify-source.mjs's own name/role keyword matchers
// already tried and failed at): classTierForHost returns a bare numeric tier (1/2/4/6/7), not a named
// sub-class -- host-authority.ts's own VERIFIER_CAB/ACADEMIC_TLD/ASSOCIATION_ALLOW/STANDARDS_BODY_ALLOW/
// ANALYSIS/LAWFIRM/NEWS regexes that DISTINGUISH a T4 class from a T6/T7 class are unexported, so this
// module can only read what classTierForHost itself returns. Tier 1 (LEGAL_PRIMARY: eur-lex.europa.eu,
// federalregister.gov, ecfr.gov, govinfo.gov, legislation.gov.uk) is the ONE unambiguous case: every host
// in that class is, by the codified rule itself, an enacted-primary-law publisher -- the exact
// institutional shape expected-output.mjs's `primary_legal_authority` role describes. Tier 2 merges
// GOV_TLD national-government stems with GOV_INTERGOV intergovernmental bodies -- two different roles
// with two different Axis-5 defaults -- so this decider only draws the ONE safe conclusion both share
// (a regulatory-adjacent institution, scope_topics) and leaves scope_verticals/expected_output undecided
// from the class table at tier 2 and above, never a guessed role. The source's OWN observed
// item-category distribution (the same read propose-classifications.mjs's drift check already makes) is
// the second, always-safe signal: a real, measured fact usable for expected_output at ANY tier once the
// sample clears the same floor (`CLASS_TABLE_MIN_ITEMS_FOR_OBSERVED`, mirroring routing.mjs's own
// MIN_ITEMS_FOR_DRIFT_CHECK) the drift check uses.

const CLASS_TABLE_MIN_ITEMS_FOR_OBSERVED = 10;

/**
 * Re-derive candidate Axis 3/4/5 values for a source classify-source.mjs's own name/role matchers found
 * NOTHING for, from two deterministic signals classify-source.mjs never reads: the SC-13 class table
 * (`classTierForHost`) and the source's own observed item-category distribution. PURE. Never guesses a
 * role from an ambiguous tier (see file header above) -- a gap this cannot decide is simply absent from
 * the returned candidate list, not filled with a plausible-sounding default.
 * @param {{url?:string|null}} source
 * @param {{scope_topics:boolean, scope_verticals:boolean, expected_output:boolean}} gaps - which fields are currently unset
 * @param {Record<string, number>|null} observed - routing.mjs's observedDistributionFromItems() output, or null (insufficient sample)
 * @returns {Array<{field:string, value:unknown, confidence:string, basis:string, applicable:boolean}>}
 */
export function deriveClassTableCandidates(source, gaps, observed) {
  const candidates = [];
  let host = null;
  try {
    host = source?.url ? new URL(source.url).hostname : null;
  } catch {
    host = null;
  }
  const tier = classTierForHost(host);

  // scope_topics: tier 1 (legal-primary) and tier 2 (gov/intergov, merged) are both regulatory-adjacent
  // institutions by the codified rule's own definition -- safe regardless of which tier-2 sub-class.
  if (gaps?.scope_topics && (tier === 1 || tier === 2)) {
    candidates.push({
      field: "scope_topics", value: ["regulatory"], confidence: "high",
      basis: `SC-13 class table: host "${host}" resolves to tier ${tier} (classTierForHost) -- a legal-primary or government/intergovernmental publisher is a regulatory-adjacent institution by the codified rule's own definition.`,
      applicable: true,
    });
  }

  // scope_verticals: tier 1 only (unambiguous primary_legal_authority proxy; FREIGHT_GENERAL_ROLES
  // already treats that exact role this way in scope.mjs).
  if (gaps?.scope_verticals && tier === 1) {
    candidates.push({
      field: "scope_verticals", value: ["freight_general"], confidence: "high",
      basis: `SC-13 class table: host "${host}" resolves to tier 1 (legal-primary, classTierForHost) -- general freight coverage without vertical specificity, the same Axis 4c default scope.mjs's FREIGHT_GENERAL_ROLES applies to the primary_legal_authority role.`,
      applicable: true,
    });
  }

  // expected_output: prefer the source's OWN observed distribution (a measured fact, never a guess) once
  // the sample clears the floor; else, for tier 1 only, the framework's own primary_legal_authority
  // default (classify-source.mjs's own expected_output rule, reached through the class table instead of
  // a stored source_role).
  if (gaps?.expected_output) {
    if (isValidDistribution(observed)) {
      candidates.push({
        field: "expected_output", value: observed, confidence: "high",
        basis: "source's own observed item-category distribution (routing.mjs observedDistributionFromItems) -- a measured fact, not a role default.",
        applicable: true,
      });
    } else if (tier === 1) {
      const eo = expectedOutputForRole("primary_legal_authority");
      if (eo) {
        candidates.push({
          field: "expected_output", value: eo, confidence: "medium",
          basis: `SC-13 class table: host "${host}" resolves to tier 1 (legal-primary) -- framework Axis-5 default for primary_legal_authority applied deterministically (no observed sample yet).`,
          applicable: true,
        });
      }
    }
  }

  return candidates;
}

/**
 * The fixed resolution_note for "class-table + observed-output re-derivation found nothing to decide".
 * ONE wording, shared by the decider (this module, reDeriveZeroProposalClassification below) and the
 * proposer (propose-classifications.mjs's own zero-derivation write, D17 family 4 part 2, imports this
 * unmodified) so the two can never drift apart -- the same shared-wording discipline D15's
 * buildNoDerivableTagsNote establishes for the TAG namespace.
 * @param {Date} [today]
 * @returns {string}
 */
export function buildNoDerivableClassificationNote(today = new Date()) {
  const dateStr = today.toISOString().slice(0, 10);
  return `no derivable classification from the class table or the observed output on ${dateStr}; re-evaluated on the next classify run`;
}

/**
 * Turn deriveClassTableCandidates' output into decision rows for buildDecisionNote/buildMergePatch. PURE.
 * Every candidate is already-decided "adopt" -- see reDeriveZeroProposalClassification's own comment for
 * why this never re-runs decideClassificationProposals (that function's evidence model is name/role
 * keyword re-confirmation, not the class-table/observed-output evidence these candidates rest on).
 * @param {Array<{field:string, value:unknown, basis:string}>} candidates
 * @returns {Array<{field:string, value:unknown, label:string, decision:"adopt", reason:string}>}
 */
function candidatesToDecisions(candidates) {
  return (Array.isArray(candidates) ? candidates : []).map((c) => ({
    ...c, label: `${c.field}=${JSON.stringify(c.value)}`, decision: "adopt", reason: c.basis,
  }));
}

/**
 * True when a source-classification flag's stored PROPOSALS_JSON parses to an empty array. PURE.
 * @param {{description?:string}} flag
 * @returns {boolean}
 */
export function isZeroProposalClassificationFlag(flag) {
  const parsed = extractProposalsFromDescription(flag?.description);
  return parsed.ok && parsed.value.length === 0;
}

/**
 * D17 family 4 core: re-derive + decide + (in execute mode) write/resolve for ONE zero-proposal
 * source-classification flag. Internal (called from autoAdoptClassification below), same shape as D15's
 * reDeriveZeroProposalTags in apply-tags.mjs.
 * @param {{readSource:Function, readSourceItems:Function, updateSource:Function, resolveFlag:Function}} deps
 * @param {{id:string, subject_ref?:string}} flag - already read and confirmed zero-proposal by the caller
 * @param {{execute:boolean, today?:Date}} opts
 */
async function reDeriveZeroProposalClassification(deps, flag, { execute, today = new Date() } = {}) {
  const sourceId = String(flag.subject_ref || "").trim();
  if (!sourceId) return { status: "not_auto_adoptable", error: "flag has no subject_ref (source id)." };

  const { data: source, error: srcErr } = await deps.readSource(sourceId);
  if (srcErr) return { status: "source_read_error", error: srcErr.message };
  if (!source) return { status: "source_not_found", error: `no sources row with id ${sourceId}.` };

  const gaps = {
    scope_topics: !Array.isArray(source.scope_topics) || source.scope_topics.length === 0,
    scope_verticals: !Array.isArray(source.scope_verticals) || source.scope_verticals.length === 0,
    expected_output: source.expected_output === null || source.expected_output === undefined,
  };

  const items = await deps.readSourceItems(sourceId);
  const sufficientSample = Array.isArray(items) && items.length >= CLASS_TABLE_MIN_ITEMS_FOR_OBSERVED;
  const observed = sufficientSample ? observedDistributionFromItems(items) : null;

  // NOTE: candidates from deriveClassTableCandidates are NOT re-run through decideClassificationProposals
  // (that function's scope_topics branch re-checks NAME/ROLE keyword evidence via decideScopeTopicsProposal
  // -- the exact evidence classify-source.mjs's own name-based proposals rest on, which is NOT what these
  // candidates are grounded in). deriveClassTableCandidates is itself the live, freshly-computed evidence
  // check (the class table + the observed distribution, both re-read at decide time, never trusted from a
  // stale payload); every candidate it returns is therefore already a decided "adopt" -- there is no
  // decline case for this family (an undecidable gap simply produces no candidate at all).
  const decisions = candidatesToDecisions(deriveClassTableCandidates(source, gaps, observed));
  const merge = buildMergePatch(source, decisions.filter((d) => d.decision === "adopt"));
  const hasWrite = Object.keys(merge.patch).length > 0;
  const note = decisions.length
    ? buildDecisionNote("apply-classifications (class-table/observed re-derivation)", decisions)
    : buildNoDerivableClassificationNote(today);

  if (!execute) return { status: "dry_run_rederive", sourceId, merge, decisions, hasWrite, note };

  if (hasWrite) await deps.updateSource(sourceId, merge.patch);
  await deps.resolveFlag(flag.id, note);
  return {
    status: hasWrite ? "re_derived_adopted" : "re_derived_no_change",
    sourceId, merge, decisions, flagId: flag.id, resolvedNote: note,
  };
}

// ────────── Family 5: drift auto-resolution + anomaly retirement (D17, 2026-09-12) ──────────
// Drift: "when the source's observed output covers at least 2 runs and 20 items, the step adopts the
// observed distribution as expected_output (guarded update) and resolves the flag with the before and
// after values; below that sample size it resolves with 'insufficient sample, re-evaluated next run'."
// "Runs" has no tracked column on intelligence_items (no run/scrape-event id); the most literal available
// proxy grounded in a real column is DISTINCT CALENDAR DATES among the source's own items' created_at --
// named here explicitly as a scoped interpretation, not a fabricated concept.
// Anomaly: the detector itself is deleted (propose-classifications.mjs no longer opens this subtype); any
// surviving open row is retired unconditionally, never re-derived.
export const DRIFT_MIN_ITEMS = 20;
export const DRIFT_MIN_DISTINCT_DATES = 2;

/** Count distinct calendar dates (UTC, YYYY-MM-DD) among items' created_at. PURE. */
export function countDistinctDates(items) {
  const set = new Set();
  for (const it of items || []) {
    const d = it?.created_at ? String(it.created_at).slice(0, 10) : null;
    if (d) set.add(d);
  }
  return set.size;
}

/**
 * D17 family 5 (drift): decide whether a source's OWN observed item-category distribution is a large
 * enough, wide-enough sample to adopt as the new expected_output. PURE.
 * @param {Record<string, number>|null} observed
 * @param {unknown} currentExpectedOutput
 * @param {Array<{created_at?:string|null}>} items
 * @param {{minItems?:number, minDistinctDates?:number, today?:Date}} [opts]
 * @returns {{adopt:boolean, patch:{expected_output:unknown}|null, note:string}}
 */
export function decideDriftResolution(observed, currentExpectedOutput, items, {
  minItems = DRIFT_MIN_ITEMS, minDistinctDates = DRIFT_MIN_DISTINCT_DATES, today = new Date(),
} = {}) {
  const itemCount = Array.isArray(items) ? items.length : 0;
  const distinctDates = countDistinctDates(items);
  const dateStr = today.toISOString().slice(0, 10);
  const sufficientSample = itemCount >= minItems && distinctDates >= minDistinctDates && isValidDistribution(observed);
  if (!sufficientSample) {
    return {
      adopt: false, patch: null,
      note:
        `insufficient sample, re-evaluated next run (observed ${itemCount} item(s) across ${distinctDates} ` +
        `distinct date(s) on ${dateStr}; needs >=${minItems} items across >=${minDistinctDates} dates).`,
    };
  }
  return {
    adopt: true, patch: { expected_output: observed },
    note:
      `drift resolved on ${dateStr}: expected_output refreshed from the source's own observed item-category ` +
      `distribution over ${itemCount} item(s) across ${distinctDates} distinct date(s). ` +
      `before=${JSON.stringify(currentExpectedOutput ?? null)} after=${JSON.stringify(observed)}`,
  };
}

/** D17 family 5 (anomaly): the fixed retirement note. */
export const ANOMALY_RETIRED_NOTE = "advisory retired under the ADR-030 rider";

/**
 * D17 family 5 (drift): the decide-and-apply core for ONE open source-drift flag, DB access injected.
 * @param {{readFlag:Function, readSource:Function, readSourceItems:Function, updateSource:Function, resolveFlag:Function}} deps
 * @param {string} flagId
 * @param {{execute:boolean}} opts
 */
export async function autoResolveDriftFlag(deps, flagId, { execute } = {}) {
  const { data: flag, error } = await deps.readFlag(flagId);
  if (error) return { status: "read_error", error: error.message };
  if (!flag) return { status: "not_found", error: `no integrity_flags row with id ${flagId}.` };
  if (flag.created_by !== DRIFT_CREATED_BY) {
    return { status: "not_applicable", error: `flag created_by "${flag.created_by}" is not "${DRIFT_CREATED_BY}".` };
  }
  if (flag.status !== "open") return { status: "not_applicable", error: `flag status is '${flag.status}', not 'open'.` };

  const sourceId = String(flag.subject_ref || "").trim();
  if (!sourceId) return { status: "not_applicable", error: "flag has no subject_ref (source id)." };

  const { data: source, error: srcErr } = await deps.readSource(sourceId);
  if (srcErr) return { status: "source_read_error", error: srcErr.message };
  if (!source) return { status: "source_not_found", error: `no sources row with id ${sourceId}.` };

  const items = await deps.readSourceItems(sourceId);
  const observed = observedDistributionFromItems(items);
  const decision = decideDriftResolution(observed, source.expected_output ?? null, items);

  if (!execute) return { status: "dry_run", sourceId, decision };

  if (decision.adopt) await deps.updateSource(sourceId, decision.patch);
  await deps.resolveFlag(flagId, decision.note);
  return { status: "resolved", sourceId, adopted: decision.adopt, resolvedNote: decision.note };
}

/**
 * D17 family 5 (anomaly): retire ONE open item-anomaly flag unconditionally -- the detector itself is
 * deleted, so this is a flat close, never a decision.
 * @param {{readFlag:Function, resolveFlag:Function}} deps
 * @param {string} flagId
 * @param {{execute:boolean}} opts
 */
export async function retireAnomalyFlag(deps, flagId, { execute } = {}) {
  const { data: flag, error } = await deps.readFlag(flagId);
  if (error) return { status: "read_error", error: error.message };
  if (!flag) return { status: "not_found", error: `no integrity_flags row with id ${flagId}.` };
  if (flag.created_by !== ANOMALY_CREATED_BY) {
    return { status: "not_applicable", error: `flag created_by "${flag.created_by}" is not "${ANOMALY_CREATED_BY}".` };
  }
  if (flag.status !== "open") return { status: "not_applicable", error: `flag status is '${flag.status}', not 'open'.` };

  if (!execute) return { status: "dry_run", flagId, note: ANOMALY_RETIRED_NOTE };
  await deps.resolveFlag(flagId, ANOMALY_RETIRED_NOTE);
  return { status: "resolved", flagId, resolvedNote: ANOMALY_RETIRED_NOTE };
}

/**
 * The decide-and-apply core, DB access injected (mirrors applyClassification's shape, plus `resolveFlag`
 * for the close step). Directly testable with a fake client. Every reachable proposal is decided; the
 * flag ALWAYS closes once reached (task 7.2: "no residue stays open" -- a decline is a valid, recorded
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
  if (!decision.ok) {
    // D17 family 4: a zero-proposal flag is decided, never skipped -- re-derive from the SC-13 class
    // table + the source's observed output (see reDeriveZeroProposalClassification above) instead of
    // returning not_auto_adoptable. Guarded on status==='open' (not just zero-proposal) so an
    // ALREADY-resolved flag is never re-derived a second time (its description still parses to
    // PROPOSALS_JSON: [] after resolution, since resolveFlag never rewrites `description`).
    if (flag.status === "open" && flag.created_by === CLASSIFICATION_CREATED_BY && isZeroProposalClassificationFlag(flag)) {
      return reDeriveZeroProposalClassification(deps, flag, { execute });
    }
    return { status: "not_auto_adoptable", error: decision.error };
  }

  const { data: source, error: srcErr } = await deps.readSource(decision.sourceId);
  if (srcErr) return { status: "source_read_error", error: srcErr.message };
  if (!source) return { status: "source_not_found", error: `no sources row with id ${decision.sourceId}.` };

  const decisions = decideClassificationProposals(decision.proposals, source);
  const mergeProposals = buildAdoptedProposalsForMerge(decisions);
  const merge = buildMergePatch(source, mergeProposals);
  const hasWrite = Object.keys(merge.patch).length > 0;
  const note = buildDecisionNote("apply-classifications", decisions);

  if (!execute) return { status: "dry_run", sourceId: decision.sourceId, merge, decisions, hasWrite };

  if (hasWrite) await deps.updateSource(decision.sourceId, merge.patch);
  await deps.resolveFlag(flagId, note);
  return { status: "applied", sourceId: decision.sourceId, merge, decisions, written: hasWrite, resolved: true };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) await main();

async function main() {
loadLocalEnvFile();

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
  // Widened again 2026-09-12 (D17 family 4): `url` added so deriveClassTableCandidates can resolve the
  // SC-13 class table tier for the source's own registered host.
  // Widened again 2026-09-13 (D9, lane L14): `jurisdiction_iso` added so buildMergePatch merges against
  // the source's REAL current value instead of always seeing it as empty (which would falsely re-gap an
  // already-classified source on every run).
  readSource: (id) => sb.from("sources").select("id, name, url, source_role, jurisdiction_iso, scope_topics, scope_modes, scope_verticals, expected_output").eq("id", id).maybeSingle(),
  // D17 families 4 and 5 (2026-09-12): a source's own verified, live items, for the observed
  // item-category distribution (`observedDistributionFromItems`) both the zero-proposal re-derivation
  // and the drift auto-resolution read.
  readSourceItems: async (sourceId) => {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("intelligence_items")
        .select("id, item_type, domain, created_at")
        .eq("source_id", sourceId).eq("provenance_status", "verified").eq("is_archived", false)
        .order("id").range(from, from + 999);
      if (error) throw new Error(`apply-classifications: source-items read failed: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return rows;
  },
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
    case "dry_run_rederive":
      console.log(
        `apply-classifications: flag ${flagId} zero-proposal -> source ${result.sourceId} would decide ` +
        `${result.decisions.length} re-derived candidate(s); patch: ${JSON.stringify(result.merge.patch)}; flag would CLOSE either way ` +
        "(DRY RUN: nothing written. Re-run with --execute to apply.)",
      );
      return true;
    case "re_derived_adopted":
      console.log(`WROTE + RESOLVED (D17 re-derivation): source ${result.sourceId} updated with ${JSON.stringify(result.merge.patch)}; flag ${flagId} closed.`);
      return true;
    case "re_derived_no_change":
      console.log(`RESOLVED (D17 re-derivation): flag ${flagId} closed with no source write needed; ${result.decisions.length} candidate(s) decided.`);
      return true;
    default:
      return false;
  }
}

/** report() for drift/anomaly resolution results (D17 family 5): a different result shape than the
 *  classification report() above, so kept separate rather than overloading one switch with two shapes. */
function reportFamily5(flagId, kind, result) {
  switch (result.status) {
    case "not_found":
    case "read_error":
    case "not_applicable":
    case "source_read_error":
    case "source_not_found":
      console.error(`apply-classifications: ${kind} flag ${flagId}: ${result.error}`);
      return false;
    case "dry_run":
      console.log(
        kind === "drift"
          ? `apply-classifications: drift flag ${flagId} -> source ${result.sourceId} would ${result.decision.adopt ? "ADOPT" : "DECLINE"} (${result.decision.note}) (DRY RUN).`
          : `apply-classifications: anomaly flag ${flagId} would be retired: "${result.note}" (DRY RUN).`,
      );
      return true;
    case "resolved":
      console.log(
        kind === "drift"
          ? `RESOLVED (drift): flag ${flagId} closed for source ${result.sourceId} (adopted=${result.adopted}).`
          : `RESOLVED (anomaly): flag ${flagId} retired.`,
      );
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
  let appliedCount = 0, resolvedCount = 0, skippedCount = 0, rederivedCount = 0;
  for (const id of ids) {
    const result = await autoAdoptClassification(deps, id, { execute: EXECUTE });
    const ok = report(id, result);
    if (result.status === "not_auto_adoptable") { skippedCount++; continue; } // no auto-adoptable field on this flag — expected, not a failure
    if (!ok) anyFailed = true;
    if (result.status === "applied") { appliedCount++; if (result.resolved) resolvedCount++; }
    if (result.status === "re_derived_adopted" || result.status === "re_derived_no_change") rederivedCount++;
  }
  console.log(
    `apply-classifications: --auto-adopt done: ${appliedCount} applied (${resolvedCount} fully resolved), ` +
    `${rederivedCount} zero-proposal re-derived (D17), ${skippedCount} not-auto-adoptable (skipped), of ${ids.length} candidate(s).`,
  );

  // D17 family 5: every OPEN source-drift flag is auto-resolved (adopt-observed or insufficient-sample,
  // never left open), and every OPEN item-anomaly flag is retired (the detector itself is deleted).
  const { data: driftCandidates, error: driftListErr } = await sb
    .from("integrity_flags").select("id").eq("status", "open").eq("created_by", DRIFT_CREATED_BY);
  if (driftListErr) {
    console.error(`apply-classifications: drift candidate read failed: ${driftListErr.message}`);
    process.exit(1);
  }
  const driftIds = (driftCandidates ?? []).map((r) => r.id);
  console.log(`apply-classifications: family 5 (drift): ${driftIds.length} open ${DRIFT_CREATED_BY} flag(s)${EXECUTE ? "" : " (DRY RUN)"}.`);
  let driftResolved = 0;
  for (const id of driftIds) {
    const result = await autoResolveDriftFlag(deps, id, { execute: EXECUTE });
    if (!reportFamily5(id, "drift", result)) anyFailed = true;
    if (result.status === "resolved") driftResolved++;
  }
  console.log(`apply-classifications: family 5 (drift) done: ${driftResolved}/${driftIds.length} resolved.`);

  const { data: anomalyCandidates, error: anomalyListErr } = await sb
    .from("integrity_flags").select("id").eq("status", "open").eq("created_by", ANOMALY_CREATED_BY);
  if (anomalyListErr) {
    console.error(`apply-classifications: anomaly candidate read failed: ${anomalyListErr.message}`);
    process.exit(1);
  }
  const anomalyIds = (anomalyCandidates ?? []).map((r) => r.id);
  console.log(`apply-classifications: family 5 (anomaly): ${anomalyIds.length} open ${ANOMALY_CREATED_BY} flag(s)${EXECUTE ? "" : " (DRY RUN)"}.`);
  let anomalyRetired = 0;
  for (const id of anomalyIds) {
    const result = await retireAnomalyFlag(deps, id, { execute: EXECUTE });
    if (!reportFamily5(id, "anomaly", result)) anyFailed = true;
    if (result.status === "resolved") anomalyRetired++;
  }
  console.log(`apply-classifications: family 5 (anomaly) done: ${anomalyRetired}/${anomalyIds.length} retired.`);
}

process.exit(anyFailed ? 1 : 0);
}
