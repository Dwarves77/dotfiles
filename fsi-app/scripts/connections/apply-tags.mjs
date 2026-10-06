#!/usr/bin/env node
// SHARED-WRITER: intelligence_items, integrity_flags
// apply-tags.mjs — the ONLY place a propose-tags.mjs tag PROPOSAL becomes a WRITTEN
// operational_scenario_tags/compliance_object_tags/topic_tags value, by rule, with no human in the path.
// The legacy operator path (a flag resolved with the literal token `ratify:tags`, applied by id through
// applyTags/evaluateApplication) is DELETED (lane G6-GATES, 2026-10-05; operator ruling: nothing in the
// data machine waits on a review, a ruling file or a typed token). It was dead in practice, none of the
// flags it waited on were ever ratified, and the auto path below already decides every proposal.
//
// AUTO-ADOPTION (added 2026-09-03, operator ruling, CONFIRMED in session; now the only path). Context: the flywheel's
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
// WHAT THE AUTO-ADOPTION PATH DOES, per --flag <id> (autoAdoptTags, exported for tag-ratification.mjs's
// bulk orchestration; also reachable directly via this file's own `--flag <id>` CLI):
//   1. Reads the integrity_flags row; requires TAG_NAMESPACE and status='open' (an already-resolved flag,
//      by ANY path — ratified, previously auto-adopted, or closed for some other reason — is left alone;
//      this path never re-opens or overwrites an earlier resolution).
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
//      the flag is left open by this older posture, which the EVERY PROPOSAL DECIDED section below
//      supersedes: every proposal is decided and the flag closes.
//   Idempotent by construction: re-running on an already-resolved flag refuses at step 1
//   (`not_adoptable`); re-running on an open flag with residue recomputes the same eligible/residue split
//   and the merge is a no-op the second time (buildMergePatch's existing alreadyPresent handling).
//   Does NOT re-run discovery (same as the ratify path's own `--skip-discovery`) when driven through
//   tag-ratification.mjs's bulk orchestration — see that file's own note for the fallback command.
//
// ZERO-PROPOSAL FLAGS (D15 part 1, defect-fix-plan-2026-09-12): a flag whose PROPOSALS_JSON parses to an
// empty array used to fall out of step 2 above as `not_adoptable` ("flag carries zero proposals") and sit
// open forever -- 1,034 of 1,105 open flywheel-tag flags, most opened on 2026-09-03 against record-grade
// stubs that carry real brief text today. autoAdoptTags now detects this case (`isZeroProposalFlag`) and
// re-derives from the item's CURRENT title/canonical_instrument_key/what_is_it/summary/full_brief through
// derive-tags.mjs's own pure `deriveTags()` (imported, not copied; see reDeriveZeroProposalTags), decides
// each candidate via the SAME decideTagProposal every other proposal goes through, and resolves the flag
// either way: with the adopted tags (buildDecisionNote), or, when nothing decides at all, with
// buildNoDerivableTagsNote's fixed wording. Every existing caller (this file's own `--flag <id> --auto`
// CLI and tag-ratification.mjs's `--arg auto`) gets this for free through autoAdoptTags, no separate
// entry point.
//
// Usage:
//   node scripts/connections/apply-tags.mjs --flag <integrity_flags-id> [--dry|--execute]
//     --dry           compute + report, write nothing (DEFAULT)
//     --execute       actually write the tag merge (and, on success, re-run discovery) (explicit opt-in)
//     --skip-discovery  (with --execute) apply the tag merge but skip the discovery re-run; use the
//                        documented fallback command above instead. Off by default.
// The bulk form is the tag-ratification maintenance step. Exit 0 done (including "no change needed") ·
// 1 bad args / flag not applicable · 2 no DB creds.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Prior art (lane L36, 2026-09-17): runCli + fsiRoot (scripts/maintenance/lib/cli.mjs) are the shared
// bootstrap (argv scaffold, .env.local load, DB-creds-check-and-exit(2), IS_MAIN pattern, fsi-app-root
// resolution) every scripts/maintenance/*.mjs wrapper already uses. This script hand-rolled the same
// boilerplate; runCli/fsiRoot replace it below. Its own --flag/--auto/--all-ratified/--execute/
// --skip-discovery flags and console lines are unchanged (system-health-audit-2026-09-17.md section 2
// names this script in the clone family; tag-ratification.mjs, which already uses runCli, calls this
// script's exported functions directly, never its CLI, so that integration is unaffected).
import { runCli, fsiRoot } from "../maintenance/lib/cli.mjs";
import { discoverConnections, computeTagFrequencies } from "../../src/lib/connections/discover.mjs";
import {
  deriveTags, FIELD_CAPS, meetsConfidence, TOPIC_TAG_VALUES, COMPLIANCE_OBJECT_VALUES, SCENARIO_TAG_VALUES,
} from "../../src/lib/connections/derive-tags.mjs";
import { TAG_NAMESPACE, isInNamespace } from "../../src/lib/connections/flag-namespaces.mjs";
import { buildDecisionNote } from "../../src/lib/connections/decision-note.mjs";
import { surfaceOf } from "../../src/lib/surface-of.mjs";
// lane G7-CORR: an admin tag removal (item_corrections, migration 356) holds against this merge-only writer. The
// database trigger strips a removed tag from any write; reading the removals here makes the plan, the report and
// the flag note say what will actually be stored.
import { removedTagsFor, readItemCorrections } from "../../src/lib/corrections/item-corrections.mjs";

// The one place the auto-adoption confidence cutoff lives — see the file-header "THRESHOLD, JUSTIFIED
// FROM EVIDENCE" note above for the measured basis. Only "high" and "medium" exist today (derive-tags.mjs
// CONFIDENCE TIERS); "high" is the conservative choice.
export const AUTO_ADOPT_THRESHOLD = "high";

const TAG_FIELDS = Object.freeze(["operational_scenario_tags", "compliance_object_tags", "topic_tags"]);

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
 * Decide whether an integrity_flags row is eligible for the AUTO-ADOPTION path (2026-09-03 ruling — see
 * file header). PURE. It
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

// ─────────────────────── EVERY PROPOSAL DECIDED (Part 7 task 7.2 / ADR-030 rider, 2026-09-12) ───────────
// "tag-ratification: every flywheel-tag proposal is decided: high confidence adopts (as today); medium
// adopts when the proposed tag is in the closed vocabulary and the item's own text contains the keyword
// that produced it (the proposer's evidence, re-checked); otherwise declined with the reason. The flag
// closes ... once every proposal is decided; no residue stays open." This supersedes the 2026-09-03
// posture above (partitionByConfidence/below_threshold leaving a flag open with medium residue): a
// derive-tags.mjs proposal carries only "high"|"medium" (no lower tier exists -- see that module's
// header), so deciding both tiers exhaustively covers every proposal a flag can carry.
//
// FIELD_VOCAB re-checks a medium proposal's tag against the SAME closed-vocabulary SoTs derive-tags.mjs
// itself derives from (TOPIC_TAG_VALUES/COMPLIANCE_OBJECT_VALUES/SCENARIO_TAG_VALUES) -- re-read live at
// apply time, not trusted from the (possibly stale) proposal payload, so a tag retired from the
// vocabulary since the flag was opened declines rather than silently writing a dead token.
const FIELD_VOCAB = Object.freeze({
  topic_tags: new Set(TOPIC_TAG_VALUES),
  compliance_object_tags: new Set(COMPLIANCE_OBJECT_VALUES),
  operational_scenario_tags: new Set(SCENARIO_TAG_VALUES),
});

// The item's own text a medium proposal's keyword evidence must be RE-CONFIRMED present in (task 7.2's
// exact field list) -- narrower than propose-tags.mjs's own enrichment scope (sections/claims/search
// results), deliberately: apply time re-checks only what a single readItem() call can cheaply carry, so
// a proposal whose evidence lived only in grounded material outside these four fields declines honestly
// rather than trusting a payload this step cannot itself re-verify.
export const TAG_EVIDENCE_TEXT_FIELDS = Object.freeze(["title", "what_is_it", "summary", "full_brief"]);

/** Concatenate an item's own text fields (task 7.2's evidence-recheck scope). PURE. */
export function itemOwnText(item) {
  return TAG_EVIDENCE_TEXT_FIELDS.map((f) => (typeof item?.[f] === "string" ? item[f] : "")).join("\n");
}

/**
 * True when `evidence` (the literal matched substring derive-tags.mjs recorded on the proposal) is
 * still present, case-insensitively, in the item's own title/what_is_it/summary/full_brief. PURE.
 * @param {string} evidence
 * @param {object} item
 * @returns {boolean}
 */
export function evidencePresentInItemText(evidence, item) {
  const needle = String(evidence || "").trim().toLowerCase();
  if (!needle) return false;
  return itemOwnText(item).toLowerCase().includes(needle);
}

/**
 * Decide ONE proposal: adopt or decline, with a stated reason. PURE. High confidence adopts unchanged
 * from the 2026-09-03 posture; medium adopts only when BOTH the tag is in its field's live closed
 * vocabulary AND the keyword evidence that produced it is re-confirmable in the item's own text --
 * otherwise it declines, never silently sitting undecided.
 * @param {{field:string, tag:string, evidence:string, confidence:string}} proposal
 * @param {object} item - the target intelligence_items row (title/what_is_it/summary/full_brief read)
 * @param {string} [threshold] - defaults to AUTO_ADOPT_THRESHOLD
 * @returns {{field:string, tag:string, evidence:string, confidence:string, label:string, decision:"adopt"|"decline", reason:string}}
 */
export function decideTagProposal(proposal, item, threshold = AUTO_ADOPT_THRESHOLD) {
  const label = `${proposal.field}:${proposal.tag}`;
  if (meetsConfidence(proposal.confidence, threshold)) {
    return { ...proposal, label, decision: "adopt", reason: `confidence '${proposal.confidence}' meets the auto-adopt threshold '${threshold}' (title/instrument-key identity match).` };
  }
  const vocab = FIELD_VOCAB[proposal.field];
  if (!vocab || !vocab.has(proposal.tag)) {
    return { ...proposal, label, decision: "decline", reason: `tag "${proposal.tag}" is not in the live closed vocabulary for ${proposal.field}.` };
  }
  if (!evidencePresentInItemText(proposal.evidence, item)) {
    return { ...proposal, label, decision: "decline", reason: `keyword evidence "${proposal.evidence}" was not found in the item's own title, what_is_it, summary, or full_brief.` };
  }
  return {
    ...proposal, label, decision: "adopt",
    reason: `confidence '${proposal.confidence}': tag is in the closed vocabulary for ${proposal.field} and keyword evidence "${proposal.evidence}" is re-confirmed present in the item's own text.`,
  };
}

/**
 * Decide EVERY proposal in a list. PURE. No residue: every input proposal produces exactly one
 * adopt/decline decision.
 * @param {Array<object>} proposals
 * @param {object} item
 * @param {string} [threshold]
 * @returns {Array<object>}
 */
export function decideTagProposals(proposals, item, threshold = AUTO_ADOPT_THRESHOLD) {
  return (Array.isArray(proposals) ? proposals : []).map((p) => decideTagProposal(p, item, threshold));
}

/**
 * Build the tag-array MERGE patch: existing tags are NEVER removed or reordered; a proposal tag absent
 * from the existing array is appended, up to derive-tags.mjs's FIELD_CAPS ceiling for that field. PURE.
 * @param {{operational_scenario_tags?:unknown, compliance_object_tags?:unknown, topic_tags?:unknown}} currentItem
 * @param {Array<{field:string, tag:string}>} proposals
 * @param {{[field:string]: Set<string>}} [removed] tags an admin removed (item-corrections.mjs removedTagsFor); never added
 * @returns {{patch:Record<string,string[]>, added:Record<string,string[]>, cappedOut:Record<string,string[]>, alreadyPresent:Record<string,string[]>, blockedByCorrection:Record<string,string[]>}}
 */
export function buildMergePatch(currentItem, proposals, removed) {
  const patch = {}, added = {}, cappedOut = {}, alreadyPresent = {}, blockedByCorrection = {};
  for (const field of TAG_FIELDS) {
    const existing = Array.isArray(currentItem?.[field]) ? currentItem[field] : [];
    const existingSet = new Set(existing);
    const gone = removed?.[field] instanceof Set ? removed[field] : null;
    const allCandidates = proposals.filter((p) => p.field === field).map((p) => p.tag);
    const blocked = gone ? allCandidates.filter((t) => gone.has(t)) : [];
    if (blocked.length) blockedByCorrection[field] = [...new Set(blocked)];
    const candidateTags = gone ? allCandidates.filter((t) => !gone.has(t)) : allCandidates;

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
  return { patch, added, cappedOut, alreadyPresent, blockedByCorrection };
}

/**
 * The tags an admin removed from this item, or undefined when the caller wired no `readCorrections` dep (the
 * database trigger still strips them; only the plan and report are then less exact). A read failure throws.
 */
async function removedFor(deps, itemId) {
  if (typeof deps.readCorrections !== "function") return undefined;
  return removedTagsFor(await deps.readCorrections(itemId), itemId);
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

// ─────────────────────── ZERO-PROPOSAL RE-DERIVATION (D15 part 1, defect-fix-plan-2026-09-12) ──────────
// "1,034 tag flags carry zero proposals and ask for manual tagging, and the decider leaves them open."
// Root cause: most of these items were record-grade stubs on 2026-09-03 with a title and no brief text;
// hundreds now carry briefs (batches 001/002, the timeline and forward-event backfills), so the
// derivation that found nothing THEN may find tags NOW. Fix: a zero-proposal flag is decided, never
// skipped -- re-derive candidates for the flag's item from its CURRENT title/instrument-key/what_is_it/
// summary/full_brief through derive-tags.mjs's OWN pure deriveTags() (imported, not copied), decide each
// via decideTagProposal (unchanged), adopt what passes, and resolve the flag either way. Wired into
// autoAdoptTags() below so every existing caller (tag-ratification.mjs's `--arg auto`, this file's own
// `--flag <id> --auto` CLI) gets the fix with no call-site change beyond routing zero-proposal flags
// through the SAME function (see tag-ratification.mjs's own `isZeroProposalFlag` use for why the caller
// still must SELECT which flags to pass here -- evaluateAutoAdoption's `status='open'` gate is what a
// caller lists from, and a truly foreign/malformed flag must still refuse, never silently "re-derive").

/**
 * True when a TAG_NAMESPACE flag's stored PROPOSALS_JSON parses to an empty array -- the D15 defect class
 * (a proposer that found nothing at derivation time, back when the item's own text was thinner than it is
 * now). PURE.
 * @param {{description?:string}} flag
 * @returns {boolean}
 */
export function isZeroProposalFlag(flag) {
  const parsed = extractProposalsFromDescription(flag?.description);
  return parsed.ok && parsed.value.length === 0;
}

/**
 * The fixed resolution_note for "re-derivation found nothing to decide" (decisions.length === 0 -- see
 * reDeriveZeroProposalTags below). ONE wording, shared by the decider (this module) and the proposer
 * (propose-tags.mjs's own zero-derivation write imports this unmodified, D15 part 2), so the two can never
 * drift apart. PURE except for the date stamp.
 * @param {Date} [today]
 * @returns {string}
 */
export function buildNoDerivableTagsNote(today = new Date()) {
  const dateStr = today.toISOString().slice(0, 10);
  return (
    `no derivable tags from the item's own text on ${dateStr} (derive-tags KEYWORD_MAP); the item joins ` +
    "the connection graph through its entity refs; no manual tagging (ADR-030)"
  );
}

/**
 * Reshape an intelligence_items row into derive-tags.mjs's own input contract, covering exactly the five
 * fields D15 part 1 names (title, instrument key, what_is_it, summary, full_brief) -- deriveTags() ITSELF
 * is never modified or copied: it already reads `title`/`canonical_instrument_key` at "high" confidence
 * and `full_brief` at "medium"; what_is_it/summary are folded into that same medium-confidence body-text
 * scan (real, grounded item text derive-tags.mjs's own body-match tier already exists to read). PURE.
 * @param {{id?:string, title?:string|null, canonical_instrument_key?:string|null, what_is_it?:string|null,
 *   summary?:string|null, full_brief?:string|null}} item
 * @returns {{id:string|undefined, title:string|null, canonical_instrument_key:string|null, full_brief:string}}
 */
export function buildReDeriveInput(item) {
  return {
    id: item?.id,
    title: item?.title ?? null,
    canonical_instrument_key: item?.canonical_instrument_key ?? null,
    full_brief: [item?.full_brief, item?.what_is_it, item?.summary]
      .filter((s) => typeof s === "string" && s.trim())
      .join("\n\n"),
  };
}

/**
 * D15 part 1 core: re-derive + decide + (in execute mode) write/resolve for ONE zero-proposal flag whose
 * item may now carry derivable text it didn't at proposal time. Internal (called from autoAdoptTags below,
 * never a second public entry point) so every caller of autoAdoptTags gets this fix automatically.
 * @param {{readItem:Function, updateItem:Function, resolveFlag:Function}} deps
 * @param {{id:string, subject_ref?:string}} flag - already read and confirmed zero-proposal by the caller
 * @param {{execute:boolean, today?:Date}} opts
 * @returns {Promise<object>} status one of not_adoptable/item_read_error/item_not_found/dry_run_rederive/
 *   re_derived_adopted/re_derived_no_change; `outcome` one of "adopted"/"declined"/"no_derivable"
 */
async function reDeriveZeroProposalTags(deps, flag, { execute, today = new Date() } = {}) {
  const itemId = String(flag.subject_ref || "").trim();
  if (!itemId) return { status: "not_adoptable", error: "flag has no subject_ref (item id)." };

  const { data: item, error: itemErr } = await deps.readItem(itemId);
  if (itemErr) return { status: "item_read_error", error: itemErr.message };
  if (!item) return { status: "item_not_found", error: `no intelligence_items row with id ${itemId}.` };

  // deps.deriveTags is an OPTIONAL test seam, defaulting to the real imported deriveTags for every
  // production caller (CLI deps, tag-ratification.mjs's deps never set it, so live behavior is
  // unchanged). Proof (fix round 1, review-l10.md): buildReDeriveInput's derivation-text set
  // (full_brief + what_is_it + summary) is a literal SUBSET of itemOwnText's evidence-recheck set
  // (title + what_is_it + summary + full_brief) -- a real KEYWORD_MAP-sourced medium candidate's
  // evidence is therefore ALWAYS findable at decide time, and high-tier candidates bypass the evidence
  // check entirely, so a "declined, evidence absent, tag in vocabulary" outcome cannot occur through
  // the real deriveTags. The seam lets a test exercise the SAME decideTagProposals/buildMergePatch/
  // buildDecisionNote aggregation this function runs, end to end through autoAdoptTags, for the
  // declined-and-still-resolves branch, without weakening the real derivation for any real caller.
  const derive = deps.deriveTags ?? deriveTags;
  const derived = derive(buildReDeriveInput(item));
  const decisions = decideTagProposals(derived.proposals, item);
  const adopted = decisions.filter((d) => d.decision === "adopt");
  const merge = buildMergePatch(item, adopted, await removedFor(deps, itemId));
  const hasWrite = Object.keys(merge.patch).length > 0;
  const note = decisions.length
    ? buildDecisionNote("tag-ratification (re-derive, zero-proposal)", decisions)
    : buildNoDerivableTagsNote(today);
  const outcome = decisions.length === 0 ? "no_derivable" : hasWrite ? "adopted" : "declined";

  if (!execute) return { status: "dry_run_rederive", itemId, merge, decisions, hasWrite, outcome, note };

  if (hasWrite) await deps.updateItem(itemId, merge.patch);
  await deps.resolveFlag(flag.id, note);
  return {
    status: hasWrite ? "re_derived_adopted" : "re_derived_no_change",
    itemId, merge, decisions, outcome, flagId: flag.id, resolvedNote: note,
  };
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
export async function autoAdoptTags(deps, flagId, { execute, threshold = AUTO_ADOPT_THRESHOLD, today = new Date() } = {}) {
  const { data: flag, error } = await deps.readFlag(flagId);
  if (error) return { status: "read_error", error: error.message };
  if (!flag) return { status: "not_found", error: `no integrity_flags row with id ${flagId}.` };

  const decision = evaluateAutoAdoption(flag);
  if (!decision.ok) {
    // D15 part 1: a zero-proposal flag is decided, never skipped -- re-derive from the item's CURRENT
    // text (see reDeriveZeroProposalTags above) instead of returning not_adoptable. Guarded on
    // status==='open' (not just zero-proposal) so an ALREADY-resolved flag -- including one this same
    // re-derivation path just closed -- is never re-derived a second time (its description still parses
    // to PROPOSALS_JSON: [] after resolution, since resolveFlag never rewrites `description`).
    if (flag.status === "open" && isZeroProposalFlag(flag)) {
      return reDeriveZeroProposalTags(deps, flag, { execute, today });
    }
    return { status: "not_adoptable", error: decision.error };
  }

  const { data: item, error: itemErr } = await deps.readItem(decision.itemId);
  if (itemErr) return { status: "item_read_error", error: itemErr.message };
  if (!item) return { status: "item_not_found", error: `no intelligence_items row with id ${decision.itemId}.` };

  // Task 7.2: every proposal is decided (adopt or decline), never left as "below threshold" residue on
  // an open flag -- a derive-tags.mjs proposal carries only "high"|"medium", both decided by
  // decideTagProposal, so this partition is always exhaustive.
  const decisions = decideTagProposals(decision.proposals, item, threshold);
  const adopted = decisions.filter((d) => d.decision === "adopt");
  const merge = buildMergePatch(item, adopted, await removedFor(deps, decision.itemId));
  const hasWrite = Object.keys(merge.patch).length > 0;
  const note = buildDecisionNote(`tag-ratification (auto, threshold=${threshold})`, decisions);

  if (!execute) return { status: "dry_run", itemId: decision.itemId, merge, decisions, hasWrite };

  if (hasWrite) await deps.updateItem(decision.itemId, merge.patch);
  await deps.resolveFlag(flagId, note);
  return {
    status: hasWrite ? "decided" : "decided_no_change",
    itemId: decision.itemId, merge, decisions, flagId, resolvedNote: note,
    updated: hasWrite ? 1 : 0,
  };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) {
  await runCli({ step: "apply-tags", main, needsDb: true });
}

async function main() {
const args = process.argv.slice(2);
const flagIdRaw = args[args.indexOf("--flag") + 1];
const flagId = args.includes("--flag") && flagIdRaw && !flagIdRaw.startsWith("--") ? flagIdRaw : null;
const EXECUTE = args.includes("--execute");
const SKIP_DISCOVERY = args.includes("--skip-discovery");

if (!flagId) {
  console.error("apply-tags: --flag <integrity_flags-id> is required (the bulk form is the tag-ratification maintenance step).");
  process.exit(1);
}

const { readClient, guardedUpdate } = await import("../lib/db.mjs");
const { writeDiscoveredEdges } = await import("../../src/lib/connections/write-edges.mjs");
const sb = readClient();

const CITE = {
  skill: "flywheel-build-plan-2026-08-10",
  reason: "TAG lane (2026-09-01, auto-adoption path added 2026-09-03): write a derive-tags.mjs proposal onto intelligence_items' connection-signature tag arrays (merge-only, never overwrites), through the guarded write path (rule 015), decided by rule (auto-adoption, 2026-09-03 operator ruling; the ratify:tags operator path was deleted 2026-10-05, see apply-tags.mjs header).",
};

const deps = {
  readFlag: (id) => sb.from("integrity_flags").select("*").eq("id", id).maybeSingle(),
  // Widened 2026-09-12 (task 7.2): decideTagProposal re-checks a medium-confidence proposal's keyword
  // evidence against the item's OWN title/what_is_it/summary/full_brief, not just its tag arrays.
  // Widened again 2026-09-12 (D15 part 1): canonical_instrument_key added so reDeriveZeroProposalTags'
  // re-derivation input carries the same "high"-confidence identity field deriveTags() reads.
  readCorrections: (id) => readItemCorrections(sb, id),
  readItem: (id) => sb.from("intelligence_items").select("id, operational_scenario_tags, compliance_object_tags, topic_tags, title, canonical_instrument_key, what_is_it, summary, full_brief").eq("id", id).maybeSingle(),
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
  const SNAP_DIR = process.env.DISCIPLINE_SNAP_DIR ? resolve(process.env.DISCIPLINE_SNAP_DIR) : resolve(fsiRoot(), "scripts", "_snapshots");
  const w = await writeDiscoveredEdges(sb, plan.edges, { snapshot: { dir: SNAP_DIR, cite: CITE } });
  console.log(`apply-tags: DISCOVERY RE-RUN for ${itemId}: ${w.written} edge row(s) written (${w.inserted} new, ${w.refreshed} refreshed); ${w.skippedForeignOrigin} skipped (foreign origin).`);
}

function report(flagId, result) {
  switch (result.status) {
    case "not_found":
    case "read_error":
    case "not_adoptable":
    case "item_read_error":
    case "item_not_found":
      console.error(`apply-tags: flag ${flagId} — ${result.error}`);
      return false;
    case "dry_run": {
      const adopted = result.decisions.filter((d) => d.decision === "adopt").length;
      const declined = result.decisions.filter((d) => d.decision === "decline").length;
      console.log(
        `apply-tags: flag ${flagId} -> item ${result.itemId} would decide ${result.decisions.length} proposal(s) ` +
        `(adopt ${adopted}, decline ${declined}); patch: ${JSON.stringify(result.merge.patch)}; flag would CLOSE either way ` +
        `(DRY RUN: nothing written. Re-run with --execute to apply.)`,
      );
      return true;
    }
    case "decided":
      console.log(`WROTE + RESOLVED: item ${result.itemId} updated with ${JSON.stringify(result.merge.patch)}; flag ${flagId} closed (${result.decisions.length} proposal(s) decided).`);
      return true;
    case "decided_no_change":
      console.log(`RESOLVED: flag ${flagId} closed with no item write needed (every proposal declined, or already present); ${result.decisions.length} proposal(s) decided.`);
      return true;
    default:
      return false;
  }
}

let anyFailed = false;
let appliedItemIds = [];

{
  const result = await autoAdoptTags(deps, flagId, { execute: EXECUTE });
  if (!report(flagId, result)) anyFailed = true;
  if (result.status === "decided") appliedItemIds.push(result.itemId);
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
