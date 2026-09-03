#!/usr/bin/env node
// apply-classifications.mjs — the ONLY place a propose-classifications.mjs classification PROPOSAL
// becomes a WRITTEN sources.{scope_topics,scope_modes,scope_verticals,expected_output} value. Mirrors
// scripts/connections/apply-tags.mjs's resolution-note-as-ratification-vehicle design (read that file's
// header before touching this one — same shape, different marker, different target table): a flag is
// eligible ONLY once an operator has resolved it with resolution_note carrying the literal token
// `ratify:classification` (word-bounded, case-insensitive). No other status flip, however achieved,
// ever triggers a write here.
//
// ONLY THE `source-classification` SUBTYPE IS APPLY-ELIGIBLE. propose-classifications.mjs's other two
// subtypes (`source-drift`, `item-anomaly`) are advisory-only by the framework's own design (Section 5b
// names four possible causes only an operator can disposition; Section 5c is a review trigger, not a
// value to write) — evaluateApplication refuses them with a clear "advisory-only, nothing to apply"
// error rather than silently doing nothing.
//
// NEVER WRITES `jurisdictions`. classify-source.mjs's APPLICABLE_FIELDS allow-list (imported here, not
// redefined, so the two scripts cannot drift) excludes it by construction — see that module's header for
// why: sources.jurisdictions already carries a LIVE, differently-scoped region-bucket vocabulary from
// the canonical-source-candidate review flow, and this framework's ISO-shaped Axis-3 values would
// corrupt it. A jurisdiction proposal riding along in the same flag's PROPOSALS_JSON (applicable:false)
// is filtered out before any patch is built, even if it were somehow present.
//
// WHAT IT DOES, per --flag <id>:
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
//     --dry      compute + report, write nothing (DEFAULT)
//     --execute  actually write the patch (explicit opt-in)
// Exit 0 done (including "already applied"/"no change needed") · 1 bad args / flag not applicable ·
// 2 no DB creds.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { APPLICABLE_FIELDS } from "../../src/lib/classification/classify-source.mjs";
import { AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE } from "../../src/lib/classification/flags.mjs";
import { createdBy } from "../../src/lib/connections/flag-namespaces.mjs";

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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) await main();

async function main() {
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

const args = process.argv.slice(2);
const flagIdRaw = args[args.indexOf("--flag") + 1];
const flagId = args.includes("--flag") && flagIdRaw && !flagIdRaw.startsWith("--") ? flagIdRaw : null;
const ALL_RATIFIED = args.includes("--all-ratified");
const EXECUTE = args.includes("--execute");

if (!flagId && !ALL_RATIFIED) {
  console.error("apply-classifications: one of --flag <integrity_flags-id> or --all-ratified is required.");
  process.exit(1);
}
if (flagId && ALL_RATIFIED) {
  console.error("apply-classifications: pass --flag OR --all-ratified, not both (ambiguous selection).");
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
  reason: "AXIS lane (2026-09-02): apply an operator-ratified (resolution_note contains 'ratify:classification') classify-source.mjs proposal onto sources' Axis 3/4/5 columns (merge/set-once-only, never overwrites), through the guarded write path (rule 015).",
};

const deps = {
  readFlag: (id) => sb.from("integrity_flags").select("*").eq("id", id).maybeSingle(),
  readSource: (id) => sb.from("sources").select("id, scope_topics, scope_modes, scope_verticals, expected_output").eq("id", id).maybeSingle(),
  updateSource: async (id, patch) => {
    const res = await guardedUpdate("sources", (qb) => qb.eq("id", id), patch, { cite: CITE });
    return { updated: res.updated, snapshot: res.snapshot };
  },
};

function report(flagId, result) {
  switch (result.status) {
    case "not_found":
    case "read_error":
    case "not_ratifiable":
    case "source_read_error":
    case "source_not_found":
      console.error(`apply-classifications: flag ${flagId} — ${result.error}`);
      return false;
    case "no_change":
      console.log(`apply-classifications: flag ${flagId} — no change needed for source ${result.sourceId} (every applicable proposal already present or expected_output already set). Nothing written.`);
      return true;
    case "dry_run":
      console.log(`apply-classifications: flag ${flagId} applicable -> source ${result.sourceId} patch: ${JSON.stringify(result.merge.patch)} (DRY RUN — nothing written. Re-run with --execute to apply.)`);
      return true;
    case "applied":
      console.log(`WROTE: source ${result.sourceId} updated (${result.updated} row) with ${JSON.stringify(result.merge.patch)} (snapshot: ${result.snapshot}).`);
      return true;
    default:
      return false;
  }
}

let anyFailed = false;

if (flagId) {
  const result = await applyClassification(deps, flagId, { execute: EXECUTE });
  if (!report(flagId, result)) anyFailed = true;
} else {
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
}

process.exit(anyFailed ? 1 : 0);
}
