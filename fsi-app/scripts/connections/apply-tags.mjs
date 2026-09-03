#!/usr/bin/env node
// apply-tags.mjs — the ONLY place a propose-tags.mjs tag PROPOSAL becomes a WRITTEN
// operational_scenario_tags/compliance_object_tags/topic_tags value. Mirrors
// ratify-flag-to-census.mjs's resolution-note-as-ratification-vehicle design (read that file's header
// before touching this one — same shape, different marker and different target table) for its ORIGINAL
// path: a flag is ratify-eligible once an operator has resolved it with resolution_note carrying the
// literal token `ratify:tags` (word-bounded, case-insensitive — same tokenizer posture as RATIFY_TOKEN
// there). That path (evaluateApplication/applyTags) is UNCHANGED below.
//
// AUTO-ADOPTION PATH (added 2026-09-03, operator ruling, CONFIRMED in session). Context: the flywheel's
// own design spec closes its second loop "without a human in the path" (docs/specs/08-flywheel-design.md
// :128, on signposts), and the ledger already carries the standing read that the flywheel has no
// human-review loop — yet the ORIGINAL rule above routed every derived tag, however strong its evidence,
// through an operator `ratify:tags` marker, and in practice none were ever ratified: 339 of 619 verified
// live items sat untagged (docs/PROGRAM-BOARD.md, "TAG-PROPOSALS (2026-09-03)" entry) with zero tag flags
// ever resolved. New rule: a DETERMINISTIC derivation auto-adopts with recorded provenance; only the
// residue derive-tags.mjs itself cannot decide with confidence stays a flag for review. "Deterministic"
// here is exactly derive-tags.mjs's own `confidence: "high"` tier — a keyword matched inside the item's
// OWN title or canonical_instrument_key, the identity-level text that module's header calls "the
// strongest, least ambiguous signal on the row" (as opposed to `medium`, a full_brief body-only match —
// real and grounded, but weaker evidence a human should still see). See derive-tags.mjs's own
// "CONFIDENCE, EXPOSED" note for why no finer-grained score is derivable from this module's evidence.
//
// THRESHOLD, JUSTIFIED FROM EVIDENCE (no live DB access from this lane; measured over this repo's own
// derive-tags.test.mjs fixtures — the only live-shaped items available — 2026-09-03): of 21 proposals
// across the 5 flag-worthy fixtures (maritime/aviation/road/reporting/cap-test), 15 (71%) are `high`; 3
// of those 5 items are ALL-high (every proposal auto-adopts, the flag fully resolves) and 2 are MIXED
// (some high, some medium — only the high subset auto-adopts, the flag stays open with the medium
// residue still visible for review, exactly as it is today). Zero fixtures are all-medium. `high` is
// therefore both the conservative choice available (only two tiers exist — see derive-tags.mjs) and the
// one that matches the tier's own documented evidentiary strength: identity-level text is unambiguous by
// construction (a keyword literally names the item), so auto-adopting it is not a "silent assumption" in
// the sense the old rule guarded against — it is exactly the residue-vs-decided split rule 13 ("a flag is
// a commitment, not a comment") already expects: fix what the evidence decides, flag what it doesn't.
// AUTO_ADOPT_THRESHOLD below is the one place this cutoff lives; re-tuning it (e.g. if a `low` tier is
// ever added) is a single-constant change, same posture as ADR-007's per-dimension threshold precedent.
//
// WHAT THE RATIFY PATH DOES, per --flag <id> (unchanged):
//   1. Reads the integrity_flags row; requires it to be in flag-namespaces.mjs's TAG_NAMESPACE,
//      status='resolved', resolved_by set, and resolution_note carrying `ratify:tags`.
//   2. Extracts the PROPOSALS_JSON block propose-tags.mjs's buildFlagRow() wrote into `description`.
//   3. Reads the target item's CURRENT operational_scenario_tags/compliance_object_tags/topic_tags.
//   4. MERGES — never overwrites: every existing tag survives untouched; only proposal tags absent
//      from the existing array are appended, capped at derive-tags.mjs's own FIELD_CAPS (the same
//      emission ceiling the live vocabulary enforces at agent-authoring time) so a merge can never grow
//      an array past the shape the platform's own rules intend. A proposal tag already present, or one
//      that would exceed the field's cap, contributes nothing (reported, not silently dropped).
//   5. Writes via guardedUpdate (rule 015: cited, snapshotted BEFORE the mutation — the reversibility
//      guarantee) — ONLY when the merge actually changes something; a flag whose every proposal was
//      already present (or capped out) applies as a documented no-op, never an empty/no-op DB write.
//   6. RE-RUNS DISCOVERY for the item, closing the loop the whole TAG lane exists for: reuses
//      discover.mjs's discoverConnections/computeTagFrequencies and write-edges.mjs's
//      writeDiscoveredEdges UNMODIFIED (no forked scoring logic — the same reuse posture
//      discover-for-items.mjs documents for itself), scoped to just this one item. See
//      planDiscoveryForItem() below and the file-header note on why this duplicates
//      discover-for-items.mjs's small DB-loading GLUE (not its scoring) rather than importing it
//      directly — that script exports only parseArgs/selectTargets (argument-parsing scaffolding, not
//      an execution entry point), so there is no side-effect-free "run discovery for one item" call to
//      import; if this step ever needs to be skipped or re-run independently, the documented fallback
//      is: `node scripts/connections/discover-for-items.mjs --ids <itemId> --execute`.
//
// WHAT THE AUTO-ADOPTION PATH DOES, per --flag <id> (autoAdoptTags, exported for tag-ratification.mjs's
// `--arg auto` bulk orchestration; also reachable directly via this file's own `--flag <id> --auto` CLI):
//   1. Reads the integrity_flags row; requires TAG_NAMESPACE and status='open' (an already-resolved flag,
//      by ANY path — ratified, previously auto-adopted, or closed for some other reason — is left alone;
//      this path never re-opens or overwrites a human's resolution).
//   2. Extracts PROPOSALS_JSON (same parser, unmodified) and partitions proposals by
//      derive-tags.mjs's `meetsConfidence(p.confidence, AUTO_ADOPT_THRESHOLD)`.
//   3. If NO proposal meets the threshold: nothing happens — the flag stays open for review exactly as
//      today (status `below_threshold`).
//   4. Otherwise, builds the merge patch from ONLY the eligible (>= threshold) proposals via the SAME
//      buildMergePatch() the ratify path uses (identical merge-only, never-remove, FIELD_CAPS-respecting
//      semantics — no second write rule invented for this path).
//   5. Writes the patch via the SAME guardedUpdate-backed updateItem dep (rule 015), when non-empty.
//   6. Flag disposition: if EVERY proposal in the flag met the threshold (no residue), the flag is
//      resolved — status='resolved', resolved_by='apply-tags.mjs', resolution_note=
//      `auto-adopted:tags:<threshold>` (this note IS the provenance record: intelligence_items has no
//      per-tag provenance column, so the flag row — never deleted, always queryable by subject_ref — is
//      the audit trail, per this lane's dispatch). If some proposals fell below the threshold (residue),
//      the flag is left OPEN, untouched, exactly as it is today — a human can still ratify the residue
//      via the ordinary `ratify:tags` path (which will find the auto-adopted tags already present and
//      merge in only what remains, a harmless no-op for the part already written).
//   Idempotent by construction: re-running on an already-resolved flag refuses at step 1
//   (`not_adoptable`); re-running on an open flag with residue recomputes the same eligible/residue split
//   and the merge is a no-op the second time (buildMergePatch's existing alreadyPresent handling).
//   Does NOT re-run discovery (same as the ratify path's own `--skip-discovery`) when driven through
//   tag-ratification.mjs's bulk orchestration — see that file's own note for the fallback command.
//
// Usage:
//   node scripts/connections/apply-tags.mjs --flag <integrity_flags-id> [--dry|--execute]
//   node scripts/connections/apply-tags.mjs --flag <integrity_flags-id> --auto [--dry|--execute]
//   node scripts/connections/apply-tags.mjs --all-ratified [--dry|--execute]
//     --dry           compute + report, write nothing (DEFAULT)
//     --execute       actually write the tag merge (and, on success, re-run discovery) (explicit opt-in)
//     --auto          use the auto-adoption path (open flags, confidence threshold) instead of the
//                      ratify:tags path (resolved flags) — mutually exclusive with --all-ratified.
//     --skip-discovery  (with --execute) apply the tag merge but skip step 6 — use the documented
//                        fallback command above instead. Off by default (discovery re-run is the point).
// Exit 0 done (including "already applied"/"no change needed") · 1 bad args / flag not applicable ·
// 2 no DB creds.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverConnections, computeTagFrequencies } from "../../src/lib/connections/discover.mjs";
import { FIELD_CAPS, meetsConfidence } from "../../src/lib/connections/derive-tags.mjs";
import { TAG_NAMESPACE, isInNamespace } from "../../src/lib/connections/flag-namespaces.mjs";
import { surfaceOf } from "../../src/lib/surface-of.mjs";

// The one place the auto-adoption confidence cutoff lives — see the file-header "THRESHOLD, JUSTIFIED
// FROM EVIDENCE" note above for the measured basis. Only "high" and "medium" exist today (derive-tags.mjs
// CONFIDENCE TIERS); "high" is the conservative choice.
export const AUTO_ADOPT_THRESHOLD = "high";

export const RATIFY_TAGS_TOKEN = "ratify:tags";
const TAG_FIELDS = Object.freeze(["operational_scenario_tags", "compliance_object_tags", "topic_tags"]);

/**
 * True when `note` carries the `ratify:tags` marker as its own whitespace-delimited token (not merely
 * a substring — same "not-ratify:tags-either must not match" guard ratify-flag-to-census.mjs's
 * RATIFY_TOKEN check documents). PURE.
 * @param {string|null|undefined} note
 * @returns {boolean}
 */
export function hasRatifyTagsToken(note) {
  const text = String(note || "");
  return new RegExp(`(^|\\s)${RATIFY_TAGS_TOKEN.replace(":", "\\:")}(\\s|$)`, "i").test(text);
}

/**
 * Extract + validate the PROPOSALS_JSON block propose-tags.mjs's buildFlagRow() wrote into a flag's
 * `description` (the single, machine-parseable data path back to the raw proposals — no second field).
 * PURE.
 * @param {string|null|undefined} description
 * @returns {{ok:true, value:Array<{field:string, tag:string, evidence:string, confidence:string}>} | {ok:false, error:string}}
 */
export function extractProposalsFromDescription(description) {
  const m = /PROPOSALS_JSON:\s*(\[[\s\S]*\])\s*$/.exec(String(description || ""));
  if (!m) return { ok: false, error: "description has no parseable PROPOSALS_JSON block (was this flag opened by propose-tags.mjs?)." };
  let parsed;
  try {
    parsed = JSON.parse(m[1]);
  } catch (e) {
    return { ok: false, error: `PROPOSALS_JSON did not parse as JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "PROPOSALS_JSON is not an array." };
  for (const p of parsed) {
    if (!p || typeof p !== "object" || !TAG_FIELDS.includes(p.field) || typeof p.tag !== "string" || !p.tag.trim()) {
      return { ok: false, error: `PROPOSALS_JSON contains a malformed entry: ${JSON.stringify(p)}` };
    }
  }
  return { ok: true, value: parsed };
}

/**
 * Decide whether an integrity_flags row is applicable. PURE. Requires: TAG_NAMESPACE membership,
 * status='resolved', resolved_by set, the ratify:tags marker, and a parseable non-empty proposals list.
 * @param {{id?:string, created_by?:string, status?:string, resolved_by?:string|null,
 *   resolution_note?:string|null, description?:string, subject_ref?:string}} flag
 * @returns {{ok:true, itemId:string, proposals:Array} | {ok:false, error:string}}
 */
export function evaluateApplication(flag) {
  if (!flag || typeof flag.id !== "string") return { ok: false, error: "flag not found." };
  if (!isInNamespace(flag.created_by, TAG_NAMESPACE)) {
    return { ok: false, error: `flag created_by "${flag.created_by}" is not in the ${TAG_NAMESPACE} namespace — apply-tags.mjs only applies flywheel-tag: findings.` };
  }
  if (flag.status !== "resolved") {
    return { ok: false, error: `flag status is '${flag.status}', not 'resolved' — not yet operator-resolved.` };
  }
  if (!flag.resolved_by) {
    return { ok: false, error: "flag has no resolved_by — not confirmed operator-resolved." };
  }
  if (!hasRatifyTagsToken(flag.resolution_note)) {
    return { ok: false, error: `resolution_note does not carry the '${RATIFY_TAGS_TOKEN}' marker.` };
  }
  const parsed = extractProposalsFromDescription(flag.description);
  if (!parsed.ok) return parsed;
  if (!parsed.value.length) return { ok: false, error: "flag carries zero proposals — nothing to apply." };
  const itemId = String(flag.subject_ref || "").trim();
  if (!itemId) return { ok: false, error: "flag has no subject_ref (item id)." };
  return { ok: true, itemId, proposals: parsed.value };
}

/**
 * Decide whether an integrity_flags row is eligible for the AUTO-ADOPTION path (2026-09-03 ruling — see
 * file header). PURE. Unlike evaluateApplication, this does NOT require a ratify:tags marker — it
 * requires the flag to still be OPEN (untouched by any resolution path), so it never re-decides a flag a
 * human — or a prior auto-adopt run — already closed.
 * @param {{id?:string, created_by?:string, status?:string, description?:string, subject_ref?:string}} flag
 * @returns {{ok:true, itemId:string, proposals:Array} | {ok:false, error:string}}
 */
export function evaluateAutoAdoption(flag) {
  if (!flag || typeof flag.id !== "string") return { ok: false, error: "flag not found." };
  if (!isInNamespace(flag.created_by, TAG_NAMESPACE)) {
    return { ok: false, error: `flag created_by "${flag.created_by}" is not in the ${TAG_NAMESPACE} namespace — apply-tags.mjs only auto-adopts flywheel-tag: findings.` };
  }
  if (flag.status !== "open") {
    return { ok: false, error: `flag status is '${flag.status}', not 'open' — already resolved (ratified, previously auto-adopted, or closed for another reason); auto-adoption never re-decides a resolved flag.` };
  }
  const parsed = extractProposalsFromDescription(flag.description);
  if (!parsed.ok) return parsed;
  if (!parsed.value.length) return { ok: false, error: "flag carries zero proposals — nothing to auto-adopt." };
  const itemId = String(flag.subject_ref || "").trim();
  if (!itemId) return { ok: false, error: "flag has no subject_ref (item id)." };
  return { ok: true, itemId, proposals: parsed.value };
}

/**
 * Split a proposals list into the subset that meets the auto-adoption confidence threshold and the
 * residue that does not, via derive-tags.mjs's own meetsConfidence ordinal (never a second hand-rolled
 * comparison). PURE.
 * @param {Array<{confidence?:string}>} proposals
 * @param {string} [threshold] - defaults to AUTO_ADOPT_THRESHOLD
 * @returns {{eligible:Array, residue:Array}}
 */
export function partitionByConfidence(proposals, threshold = AUTO_ADOPT_THRESHOLD) {
  const list = Array.isArray(proposals) ? proposals : [];
  const eligible = list.filter((p) => meetsConfidence(p?.confidence, threshold));
  const residue = list.filter((p) => !meetsConfidence(p?.confidence, threshold));
  return { eligible, residue };
}

/**
 * The resolution_note token an auto-adopted flag is resolved with — the flag row's own audit trail for
 * this write (no per-tag provenance column exists on intelligence_items; see file header). PURE.
 * @param {string} [threshold] - defaults to AUTO_ADOPT_THRESHOLD
 * @returns {string}
 */
export function buildAutoAdoptionNote(threshold = AUTO_ADOPT_THRESHOLD) {
  return `auto-adopted:tags:${threshold}`;
}

/**
 * Build the tag-array MERGE patch: existing tags are NEVER removed or reordered; a proposal tag absent
 * from the existing array is appended, up to derive-tags.mjs's FIELD_CAPS ceiling for that field. PURE.
 * @param {{operational_scenario_tags?:unknown, compliance_object_tags?:unknown, topic_tags?:unknown}} currentItem
 * @param {Array<{field:string, tag:string}>} proposals
 * @returns {{patch:Record<string,string[]>, added:Record<string,string[]>, cappedOut:Record<string,string[]>, alreadyPresent:Record<string,string[]>}}
 */
export function buildMergePatch(currentItem, proposals) {
  const patch = {}, added = {}, cappedOut = {}, alreadyPresent = {};
  for (const field of TAG_FIELDS) {
    const existing = Array.isArray(currentItem?.[field]) ? currentItem[field] : [];
    const existingSet = new Set(existing);
    const candidateTags = proposals.filter((p) => p.field === field).map((p) => p.tag);

    const novel = [];
    const dupe = [];
    const seen = new Set();
    for (const tag of candidateTags) {
      if (existingSet.has(tag) || seen.has(tag)) { dupe.push(tag); continue; }
      seen.add(tag);
      novel.push(tag);
    }

    const room = Math.max(0, FIELD_CAPS[field] - existing.length);
    const toAdd = novel.slice(0, room);
    const overCap = novel.slice(room);

    if (toAdd.length) {
      patch[field] = [...existing, ...toAdd];
      added[field] = toAdd;
    }
    if (overCap.length) cappedOut[field] = overCap;
    if (dupe.length) alreadyPresent[field] = dupe;
  }
  return { patch, added, cappedOut, alreadyPresent };
}

/**
 * Score + build the discovery edges for ONE item against an already-loaded verified/live corpus. PURE
 * (given the corpus) — reuses discover.mjs's discoverConnections/computeTagFrequencies UNMODIFIED, the
 * same reuse posture discover-for-items.mjs documents for its own (whole-batch) pass, narrowed to one
 * target item.
 * @param {string} itemId
 * @param {Array<object>} corpus - discover.mjs provenance-signature rows (see discover-for-items.mjs's SIG)
 * @param {{limit?:number, threshold?:number}} [opts]
 * @returns {{ok:true, edges:Array<object>} | {ok:false, error:string}}
 */
export function planDiscoveryForItem(itemId, corpus, { limit = 12, threshold = 0.3 } = {}) {
  const list = Array.isArray(corpus) ? corpus : [];
  const item = list.find((r) => r.id === itemId);
  if (!item) return { ok: false, error: "item not found in the verified/live corpus (may be archived or unverified) — cannot re-run discovery." };
  const freqMap = computeTagFrequencies(list);
  const conns = discoverConnections(item, list, { threshold, limit, surfaceOf: (t) => surfaceOf(t), freqMap });
  const edges = conns.map((c) => ({
    source_item_id: item.id, target_item_id: c.target,
    relationship: "related", origin: "provenance_discovery",
    basis: c.basis, score: c.score,
  }));
  return { ok: true, edges };
}

/**
 * The whole decide-and-apply core, DB access injected (mirrors ratify-flag-to-census.mjs's ratifyFlag()
 * — directly testable with a fake client, no real Supabase creds, no process.exit).
 * @param {{
 *   readFlag: (flagId:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   readItem: (itemId:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   updateItem: (itemId:string, patch:object) => Promise<{updated:number, snapshot:string|null}>,
 * }} deps
 * @param {string} flagId
 * @param {{execute:boolean}} opts
 * @returns {Promise<
 *   {status:'not_found'|'read_error'|'not_ratifiable'|'item_read_error'|'item_not_found', error:string} |
 *   {status:'no_change', itemId:string, merge:object} |
 *   {status:'dry_run', itemId:string, merge:object} |
 *   {status:'applied', itemId:string, merge:object, updated:number, snapshot:string|null}
 * >}
 */
export async function applyTags(deps, flagId, { execute } = {}) {
  const { data: flag, error } = await deps.readFlag(flagId);
  if (error) return { status: "read_error", error: error.message };
  if (!flag) return { status: "not_found", error: `no integrity_flags row with id ${flagId}.` };

  const decision = evaluateApplication(flag);
  if (!decision.ok) return { status: "not_ratifiable", error: decision.error };

  const { data: item, error: itemErr } = await deps.readItem(decision.itemId);
  if (itemErr) return { status: "item_read_error", error: itemErr.message };
  if (!item) return { status: "item_not_found", error: `no intelligence_items row with id ${decision.itemId}.` };

  const merge = buildMergePatch(item, decision.proposals);
  if (!Object.keys(merge.patch).length) return { status: "no_change", itemId: decision.itemId, merge };
  if (!execute) return { status: "dry_run", itemId: decision.itemId, merge };

  const upd = await deps.updateItem(decision.itemId, merge.patch);
  return { status: "applied", itemId: decision.itemId, merge, updated: upd.updated, snapshot: upd.snapshot };
}

/**
 * The AUTO-ADOPTION decide-and-apply core (2026-09-03 ruling — file header), same injected-deps shape
 * applyTags() uses, plus one new dep (`resolveFlag`) because this path — unlike the ratify path, where a
 * human already resolved the flag before this script ever runs — is the thing that resolves the flag
 * when every one of its proposals clears the threshold.
 * @param {{
 *   readFlag: (flagId:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   readItem: (itemId:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   updateItem: (itemId:string, patch:object) => Promise<{updated:number, snapshot:string|null}>,
 *   resolveFlag: (flagId:string, note:string) => Promise<{updated:number, snapshot:string|null}>,
 * }} deps
 * @param {string} flagId
 * @param {{execute:boolean, threshold?:string}} opts
 * @returns {Promise<
 *   {status:'not_found'|'read_error'|'not_adoptable'|'item_read_error'|'item_not_found', error:string} |
 *   {status:'below_threshold', itemId:string, residueCount:number} |
 *   {status:'no_change_residue_open', itemId:string, merge:object, residueCount:number} |
 *   {status:'dry_run_resolve_only'|'resolved_no_change', itemId:string, merge:object, flagId:string} |
 *   {status:'dry_run', itemId:string, merge:object, hasResidue:boolean} |
 *   {status:'auto_adopted_partial', itemId:string, merge:object, updated:number, snapshot:string|null, residueCount:number} |
 *   {status:'auto_adopted', itemId:string, merge:object, updated:number, snapshot:string|null, flagId:string, resolvedNote:string}
 * >}
 */
export async function autoAdoptTags(deps, flagId, { execute, threshold = AUTO_ADOPT_THRESHOLD } = {}) {
  const { data: flag, error } = await deps.readFlag(flagId);
  if (error) return { status: "read_error", error: error.message };
  if (!flag) return { status: "not_found", error: `no integrity_flags row with id ${flagId}.` };

  const decision = evaluateAutoAdoption(flag);
  if (!decision.ok) return { status: "not_adoptable", error: decision.error };

  const partition = partitionByConfidence(decision.proposals, threshold);
  if (!partition.eligible.length) {
    // Nothing meets the bar — leave the flag exactly as it is today. Not an error: this is the expected
    // shape for a flag whose only candidates are body-only (medium) matches.
    return { status: "below_threshold", itemId: decision.itemId, residueCount: partition.residue.length };
  }

  const { data: item, error: itemErr } = await deps.readItem(decision.itemId);
  if (itemErr) return { status: "item_read_error", error: itemErr.message };
  if (!item) return { status: "item_not_found", error: `no intelligence_items row with id ${decision.itemId}.` };

  const merge = buildMergePatch(item, partition.eligible);
  const hasResidue = partition.residue.length > 0;
  const note = buildAutoAdoptionNote(threshold);

  if (!Object.keys(merge.patch).length) {
    // Every eligible tag was already present (or capped out) — nothing to write for the item. Still,
    // when there is no residue left to review, the flag itself has nothing further to decide, so it
    // resolves (idempotent: re-running finds it already resolved and refuses at evaluateAutoAdoption).
    if (hasResidue) return { status: "no_change_residue_open", itemId: decision.itemId, merge, residueCount: partition.residue.length };
    if (!execute) return { status: "dry_run_resolve_only", itemId: decision.itemId, merge, flagId };
    await deps.resolveFlag(flagId, note);
    return { status: "resolved_no_change", itemId: decision.itemId, merge, flagId };
  }

  if (!execute) return { status: "dry_run", itemId: decision.itemId, merge, hasResidue };

  const upd = await deps.updateItem(decision.itemId, merge.patch);
  if (hasResidue) {
    return { status: "auto_adopted_partial", itemId: decision.itemId, merge, updated: upd.updated, snapshot: upd.snapshot, residueCount: partition.residue.length };
  }
  await deps.resolveFlag(flagId, note);
  return { status: "auto_adopted", itemId: decision.itemId, merge, updated: upd.updated, snapshot: upd.snapshot, flagId, resolvedNote: note };
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
const SKIP_DISCOVERY = args.includes("--skip-discovery");
const AUTO = args.includes("--auto");

if (!flagId && !ALL_RATIFIED) {
  console.error("apply-tags: one of --flag <integrity_flags-id> or --all-ratified is required.");
  process.exit(1);
}
if (flagId && ALL_RATIFIED) {
  console.error("apply-tags: pass --flag OR --all-ratified, not both (ambiguous selection).");
  process.exit(1);
}
if (AUTO && ALL_RATIFIED) {
  console.error("apply-tags: --auto and --all-ratified are mutually exclusive (bulk auto-adoption is dispatched via tag-ratification.mjs --arg auto, not this CLI).");
  process.exit(1);
}
if (AUTO && !flagId) {
  console.error("apply-tags: --auto requires --flag <integrity_flags-id>.");
  process.exit(1);
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("apply-tags: no DB creds — cannot run here (exit 2).");
  process.exit(2);
}

const { readClient, guardedUpdate } = await import("../lib/db.mjs");
const { writeDiscoveredEdges } = await import("../../src/lib/connections/write-edges.mjs");
const sb = readClient();

const CITE = {
  skill: "flywheel-build-plan-2026-08-10",
  reason: "TAG lane (2026-09-01, auto-adoption path added 2026-09-03): write a derive-tags.mjs proposal onto intelligence_items' connection-signature tag arrays (merge-only, never overwrites), through the guarded write path (rule 015) — either operator-ratified (resolution_note contains 'ratify:tags') or, for high-confidence proposals, auto-adopted per the 2026-09-03 operator ruling (see apply-tags.mjs header).",
};

const deps = {
  readFlag: (id) => sb.from("integrity_flags").select("*").eq("id", id).maybeSingle(),
  readItem: (id) => sb.from("intelligence_items").select("id, operational_scenario_tags, compliance_object_tags, topic_tags").eq("id", id).maybeSingle(),
  updateItem: async (id, patch) => {
    const res = await guardedUpdate("intelligence_items", (qb) => qb.eq("id", id), patch, { cite: CITE });
    return { updated: res.updated, snapshot: res.snapshot };
  },
  resolveFlag: async (id, note) => {
    const res = await guardedUpdate(
      "integrity_flags",
      (qb) => qb.eq("id", id),
      { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "apply-tags.mjs", resolution_note: note },
      { cite: CITE },
    );
    return { updated: res.updated, snapshot: res.snapshot };
  },
};

/** Loads the verified/live corpus (discover.mjs provenance-signature columns) once, for discovery re-run. */
async function loadDiscoveryCorpus() {
  const SIG = "id, item_type, canonical_instrument_key, source_id, operational_scenario_tags, compliance_object_tags, jurisdictions, jurisdiction_iso, topic_tags";
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("intelligence_items").select(SIG)
      .eq("provenance_status", "verified").eq("is_archived", false)
      .order("id", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`apply-tags: discovery-corpus read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function rerunDiscovery(itemId) {
  const corpus = await loadDiscoveryCorpus();
  const plan = planDiscoveryForItem(itemId, corpus);
  if (!plan.ok) {
    console.warn(`apply-tags: discovery re-run skipped for ${itemId}: ${plan.error} — fallback: node scripts/connections/discover-for-items.mjs --ids ${itemId} --execute`);
    return;
  }
  if (!plan.edges.length) {
    console.log(`apply-tags: discovery re-run found 0 edges for ${itemId} (tags applied but no matching corpus items yet — not necessarily wrong).`);
    return;
  }
  const SNAP_DIR = process.env.DISCIPLINE_SNAP_DIR ? resolve(process.env.DISCIPLINE_SNAP_DIR) : resolve(ROOT, "scripts", "_snapshots");
  const w = await writeDiscoveredEdges(sb, plan.edges, { snapshot: { dir: SNAP_DIR, cite: CITE } });
  console.log(`apply-tags: DISCOVERY RE-RUN for ${itemId}: ${w.written} edge row(s) written (${w.inserted} new, ${w.refreshed} refreshed); ${w.skippedForeignOrigin} skipped (foreign origin).`);
}

function report(flagId, result) {
  switch (result.status) {
    case "not_found":
    case "read_error":
    case "not_ratifiable":
    case "not_adoptable":
    case "item_read_error":
    case "item_not_found":
      console.error(`apply-tags: flag ${flagId} — ${result.error}`);
      return false;
    case "no_change":
      console.log(`apply-tags: flag ${flagId} — no change needed for item ${result.itemId} (every proposal already present or capped out). Nothing written.`);
      return true;
    case "dry_run":
      console.log(
        `apply-tags: flag ${flagId} applicable -> item ${result.itemId} patch: ` +
        `${JSON.stringify(result.merge.patch)}${result.hasResidue ? " (residue proposal(s) below threshold — flag stays open)" : ""} (DRY RUN — nothing written. Re-run with --execute to apply.)`,
      );
      return true;
    case "applied":
      console.log(`WROTE: item ${result.itemId} updated (${result.updated} row) with ${JSON.stringify(result.merge.patch)} (snapshot: ${result.snapshot}).`);
      return true;
    case "below_threshold":
      console.log(`apply-tags: flag ${flagId} — no proposal meets the auto-adoption threshold (${result.residueCount} below threshold). Flag stays open for review, unchanged.`);
      return true;
    case "no_change_residue_open":
      console.log(`apply-tags: flag ${flagId} — eligible tag(s) already present on item ${result.itemId}; ${result.residueCount} residue proposal(s) remain below threshold. Flag stays open, nothing written.`);
      return true;
    case "dry_run_resolve_only":
      console.log(`apply-tags: flag ${flagId} — eligible tag(s) already present on item ${result.itemId}, no residue; flag would RESOLVE (DRY RUN — nothing written).`);
      return true;
    case "resolved_no_change":
      console.log(`apply-tags: flag ${flagId} RESOLVED (auto-adopted:tags — no item write needed, tags already present).`);
      return true;
    case "auto_adopted_partial":
      console.log(`WROTE: item ${result.itemId} updated (${result.updated} row) with ${JSON.stringify(result.merge.patch)} (snapshot: ${result.snapshot}); flag ${flagId} stays OPEN — ${result.residueCount} residue proposal(s) below threshold.`);
      return true;
    case "auto_adopted":
      console.log(`WROTE + RESOLVED: item ${result.itemId} updated (${result.updated} row) with ${JSON.stringify(result.merge.patch)} (snapshot: ${result.snapshot}); flag ${flagId} resolved (${result.resolvedNote}).`);
      return true;
    default:
      return false;
  }
}

let anyFailed = false;
let appliedItemIds = [];

if (flagId) {
  const result = AUTO
    ? await autoAdoptTags(deps, flagId, { execute: EXECUTE })
    : await applyTags(deps, flagId, { execute: EXECUTE });
  if (!report(flagId, result)) anyFailed = true;
  if (result.status === "applied" || result.status === "auto_adopted" || result.status === "auto_adopted_partial") {
    appliedItemIds.push(result.itemId);
  }
} else {
  // --all-ratified: every OPEN-namespace-shaped resolved flag under TAG_NAMESPACE that clears
  // evaluateApplication. Reads once, applies each in turn (small population — the flywheel-tag
  // namespace is scoped to items with empty signature tags, not the whole corpus).
  const { data: candidates, error: listErr } = await sb
    .from("integrity_flags")
    .select("id")
    .eq("status", "resolved")
    .like("created_by", `${TAG_NAMESPACE}%`);
  if (listErr) {
    console.error(`apply-tags: --all-ratified candidate read failed: ${listErr.message}`);
    process.exit(1);
  }
  const ids = (candidates ?? []).map((r) => r.id);
  console.log(`apply-tags: --all-ratified — ${ids.length} resolved ${TAG_NAMESPACE} flag(s) to evaluate${EXECUTE ? "" : " (DRY RUN)"}.`);
  let appliedCount = 0, skippedCount = 0;
  for (const id of ids) {
    const result = await applyTags(deps, id, { execute: EXECUTE });
    const ok = report(id, result);
    if (result.status === "not_ratifiable") { skippedCount++; continue; } // not every resolved flag carries ratify:tags — expected, not a failure
    if (!ok) anyFailed = true;
    if (result.status === "applied") { appliedCount++; appliedItemIds.push(result.itemId); }
  }
  console.log(`apply-tags: --all-ratified done — ${appliedCount} applied, ${skippedCount} not-yet-ratified (skipped), of ${ids.length} candidate(s).`);
}

if (EXECUTE && !SKIP_DISCOVERY) {
  for (const itemId of appliedItemIds) await rerunDiscovery(itemId);
} else if (EXECUTE && SKIP_DISCOVERY && appliedItemIds.length) {
  console.log(
    `apply-tags: --skip-discovery set — discovery NOT re-run for ${appliedItemIds.length} item(s). Follow-up: ` +
    `node scripts/connections/discover-for-items.mjs --ids ${appliedItemIds.join(",")} --execute`,
  );
}

process.exit(anyFailed ? 1 : 0);
}
