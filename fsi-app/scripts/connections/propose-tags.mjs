#!/usr/bin/env node
// propose-tags.mjs — makes untagged items VISIBLE to an operator (rule: NO assumptions, NEVER silent
// auto-tagging; tag PROPOSALS go to operator ratification; all writes through the guarded path).
//
// THE DEFECT THIS CLOSES: items minted by the August census wave carry EMPTY connection-signature tags
// (operational_scenario_tags, compliance_object_tags, topic_tags all []). discover.mjs scores a
// connection ONLY from shared_source, shared_scenario (operational_scenario_tags overlap),
// shared_compliance_object (compliance_object_tags overlap), and shared_jurisdiction_topic
// (jurisdiction AND topic_tags together) — an item with all three arrays empty can never contribute a
// shared_scenario/shared_compliance_object/shared_jurisdiction_topic basis, so it scores 0 edges
// against the whole corpus no matter how connected its real content is. The flywheel cannot see these
// items until tags exist.
//
// THIS SCRIPT NEVER WRITES intelligence_items. It reads the live corpus, runs the PURE
// src/lib/connections/derive-tags.mjs over each untagged item's title/instrument-key/jurisdiction/brief
// text, and reflects ONE integrity_flags row per targeted item — the proposals for an operator to
// review, never an applied tag. apply-tags.mjs (this lane's sibling script) is the ONLY place a
// proposal becomes a written tag, and only after the operator resolves the flag with the `ratify:tags`
// marker in resolution_note (mirrors ratify-flag-to-census.mjs's `ratify:census` marker — same
// resolution-note-as-ratification-vehicle design, see that file's header for the full rationale).
//
// DEDUP-BEFORE-INSERT / RESOLVE-IF-STALE, mirroring analyze-corpus.mjs's reflectFlags() convention
// (read that function before touching this one): existing OPEN rows in this namespace
// (flag-namespaces.mjs's TAG_NAMESPACE) are read once; a fresh finding not already open is inserted; an
// open row no longer reproduced by the fresh computation is auto-resolved (its item was tagged since,
// or fell out of the corpus). ONE DEVIATION FROM analyze-corpus.mjs, NAMED: that script always computes
// `fresh` over the FULL corpus every run, so "not in fresh -> stale" is safe globally. This script also
// supports NARROW selection (--ids / --since) — a partial run must never auto-resolve a flag for an
// item outside its own selection (that would silently close someone else's open finding). So the
// stale-resolution scan is SCOPED to this run's own selected subject_refs whenever the run is narrow
// (--ids/--since); only the full default (--untagged, no narrowing flag) resolves globally, matching
// analyze-corpus.mjs's posture exactly because it, too, computes over the whole corpus. See
// planReflect()'s `scopeSubjectRefs` parameter.
//
// Usage:
//   node scripts/connections/propose-tags.mjs [--untagged] [--dry|--execute]
//     (--untagged is also the DEFAULT when no selector is passed — every verified, live item whose
//      operational_scenario_tags, compliance_object_tags, AND topic_tags are all empty)
//   node scripts/connections/propose-tags.mjs --ids <uuid,uuid,...> [--dry|--execute]
//   node scripts/connections/propose-tags.mjs --since <ISO-date-or-datetime> [--dry|--execute]
//     --dry      compute + report, write nothing (DEFAULT)
//     --execute  actually write/resolve integrity_flags rows (explicit opt-in)
// Exit 0 done · 1 bad args · 2 no DB creds (cannot run here).
//
// THE ACTUAL WRITE PATH: this file's CLI is one caller of this module's own exported, DB-injected
// proposeTags() core (below) — the same "logic here, deps injected, CLI is a thin wrapper" shape
// apply-tags.mjs's applyTags() already established. The `tag-proposals` MAINT dispatch step
// (fsi-app/scripts/maintenance/tag-proposals.mjs, .github/workflows/maintenance.yml,
// docs/runbooks/MAINTENANCE-RUNBOOK.md §7a — Lane TAG-PROPOSALS, 2026-09-03) is the SECOND caller,
// giving the write half of this script an operator-gated dispatch surface it did not have before
// (population-turn.yml only ever ran this CLI with --dry). Neither caller reimplements the plan/write
// logic; both import proposeTags() unmodified.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveTags } from "../../src/lib/connections/derive-tags.mjs";
import { TAG_NAMESPACE, createdBy, buildSubjectRef } from "../../src/lib/connections/flag-namespaces.mjs";

// @supabase/supabase-js reaches this file only THROUGH scripts/lib/db.mjs's own lazy-require (see that
// file's top-of-file note) — nothing here imports it directly, so this module stays importable without
// node_modules installed, same posture discover-for-items.mjs documents for its own pure exports.

/**
 * Parse + validate CLI args. PURE (no process.env, no I/O). Exactly one selector may be given;
 * omitting all three defaults to --untagged, per the dispatch's stated default.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ok:true, mode:"ids"|"since"|"untagged", ids:string[]|null, since:string|null, execute:boolean} | {ok:false, error:string}}
 */
export function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const idsRaw = args[args.indexOf("--ids") + 1];
  const sinceRaw = args[args.indexOf("--since") + 1];
  const execute = args.includes("--execute");
  const hasIds = args.includes("--ids");
  const hasSince = args.includes("--since");
  const hasUntagged = args.includes("--untagged");

  const selectorCount = [hasIds, hasSince, hasUntagged].filter(Boolean).length;
  if (selectorCount > 1) {
    return { ok: false, error: "pass at most one of --ids / --since / --untagged (ambiguous selection)." };
  }

  if (hasIds) {
    const ids = idsRaw && !idsRaw.startsWith("--") ? idsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (!ids.length) return { ok: false, error: "--ids requires a comma-separated uuid list." };
    return { ok: true, mode: "ids", ids, since: null, execute };
  }
  if (hasSince) {
    if (!sinceRaw || sinceRaw.startsWith("--")) return { ok: false, error: "--since requires an ISO date/datetime value." };
    if (Number.isNaN(Date.parse(sinceRaw))) return { ok: false, error: `--since value is not a parseable date: ${JSON.stringify(sinceRaw)}` };
    return { ok: true, mode: "since", ids: null, since: sinceRaw, execute };
  }
  // no selector, or explicit --untagged: both mean "untagged" (the documented default).
  return { ok: true, mode: "untagged", ids: null, since: null, execute };
}

/**
 * True when an item's three connection-signature tag fields are ALL empty — exactly the population
 * discover.mjs can never score a shared_scenario/shared_compliance_object/shared_jurisdiction_topic
 * basis for. PURE.
 * @param {{operational_scenario_tags?:unknown, compliance_object_tags?:unknown, topic_tags?:unknown}} item
 * @returns {boolean}
 */
export function isEmptySignature(item) {
  const empty = (a) => !Array.isArray(a) || a.length === 0;
  return empty(item?.operational_scenario_tags) && empty(item?.compliance_object_tags) && empty(item?.topic_tags);
}

/**
 * Select this run's target items from an already-loaded corpus, per the parsed selector. PURE.
 * Note: for "ids"/"since" this returns every matched item REGARDLESS of tag emptiness — the caller
 * (main, below) narrows to isEmptySignature() before building any flag, so a flag's factual claim
 * ("this item's signature tags are empty") is never written for an item that turns out to already
 * carry tags, even if an operator explicitly named it via --ids.
 * @param {Array<{id:string, created_at?:string}>} corpus
 * @param {{mode:"ids"|"since"|"untagged", ids:string[]|null, since:string|null}} selection
 * @returns {{targets:Array, missingIds:string[]}}
 */
export function selectTargets(corpus, { mode, ids, since }) {
  const list = Array.isArray(corpus) ? corpus : [];
  if (mode === "ids") {
    const idSet = new Set(ids);
    const targets = list.filter((it) => idSet.has(it.id));
    const missingIds = ids.filter((id) => !targets.some((t) => t.id === id));
    return { targets, missingIds };
  }
  if (mode === "since") {
    const sinceMs = Date.parse(since);
    return { targets: list.filter((it) => it.created_at && Date.parse(it.created_at) >= sinceMs), missingIds: [] };
  }
  // untagged (default)
  return { targets: list.filter(isEmptySignature), missingIds: [] };
}

const APPLY_COMMAND_TEMPLATE = "node scripts/connections/apply-tags.mjs --flag <this flag's id> --execute";

/**
 * Build the integrity_flags insert payload for one item's derive-tags result. PURE.
 * `description` carries a human summary FIRST, then a compact (single-line) JSON block of the raw
 * proposals — machine-parseable by apply-tags.mjs's own flag reader without a second data path.
 * @param {{id:string}} item
 * @param {{itemId:string, proposals:Array<{field:string, tag:string, evidence:string, confidence:string}>}} derived
 * @returns {object} integrity_flags row (status:'open', no id — assigned at insert)
 */
export function buildFlagRow(item, derived) {
  const proposals = derived?.proposals ?? [];
  const proposalsJson = JSON.stringify(proposals);
  const byField = proposals.reduce((acc, p) => {
    (acc[p.field] ||= []).push(p.tag);
    return acc;
  }, {});
  const summary = proposals.length
    ? `derive-tags.mjs proposes ${proposals.length} tag(s) for item ${item.id} (currently empty operational_scenario_tags/compliance_object_tags/topic_tags -> discover.mjs scores 0 edges for it): ` +
      Object.entries(byField).map(([f, tags]) => `${f}=[${tags.join(", ")}]`).join("; ") + "."
    : `Item ${item.id} has empty operational_scenario_tags/compliance_object_tags/topic_tags (0 discover.mjs edges) and derive-tags.mjs found no candidate tags from its title/instrument key/brief text -- needs manual operator tagging (or a KEYWORD_MAP extension) before it can join the connection graph.`;
  const description = `${summary}\n\nPROPOSALS_JSON: ${proposalsJson}`;

  const recommended_actions = proposals.length
    ? [
        "Review the proposals above against the item's own content.",
        `If correct, resolve this flag with resolution_note containing the token "ratify:tags", then run: ${APPLY_COMMAND_TEMPLATE}`,
      ]
    : [
        "No candidate tags were derivable from this item's title/instrument key/brief text.",
        "Add operational_scenario_tags/compliance_object_tags/topic_tags manually via the admin item editor, or extend derive-tags.mjs's KEYWORD_MAP if a real, recurring keyword was missed.",
      ];

  return {
    category: "data_quality",
    subject_type: "item",
    subject_ref: buildSubjectRef(item.id),
    description,
    recommended_actions,
    status: "open",
    created_by: createdBy(TAG_NAMESPACE, "empty-signature"),
  };
}

/**
 * Dedup-before-insert / resolve-if-stale plan for the TAG_NAMESPACE, mirroring analyze-corpus.mjs's
 * reflectFlags() decision logic exactly, PURE (no I/O — the caller performs the actual reads/writes).
 * See file header for why `scopeSubjectRefs` exists (narrow --ids/--since runs must never resolve a
 * flag for an item outside their own selection).
 * @param {Array<{id:string, subject_ref:string, created_by:string}>} existingOpen - open TAG_NAMESPACE rows
 * @param {Array<{subjectRef:string, row:object}>} fresh - this run's freshly computed findings
 * @param {{scopeSubjectRefs?: Set<string>|null}} [opts] - when set, only existing rows whose subject_ref
 *   is in this set are eligible to be marked stale; when omitted/null, every existing open row is
 *   eligible (the full --untagged run's posture, matching analyze-corpus.mjs).
 * @returns {{newRows:object[], staleIds:string[], unchanged:number}}
 */
export function planReflect(existingOpen, fresh, { scopeSubjectRefs = null } = {}) {
  const existing = Array.isArray(existingOpen) ? existingOpen : [];
  const freshList = Array.isArray(fresh) ? fresh : [];
  const freshKeys = new Set(freshList.map((f) => `${f.subjectRef}|${f.row.created_by}`));
  const existingKeys = new Set(existing.map((r) => `${r.subject_ref}|${r.created_by}`));

  const newRows = freshList.filter((f) => !existingKeys.has(`${f.subjectRef}|${f.row.created_by}`)).map((f) => f.row);
  const scopedExisting = scopeSubjectRefs ? existing.filter((r) => scopeSubjectRefs.has(r.subject_ref)) : existing;
  const staleIds = scopedExisting.filter((r) => !freshKeys.has(`${r.subject_ref}|${r.created_by}`)).map((r) => r.id);

  return { newRows, staleIds, unchanged: freshList.length - newRows.length };
}

/**
 * The whole read-plan-write core, DB access injected (mirrors apply-tags.mjs's applyTags() — directly
 * testable with a fake client, no real Supabase creds, no process.exit). Extracted from this file's own
 * former inline main() body (Lane TAG-PROPOSALS, 2026-09-03) so a second caller — the `tag-proposals`
 * MAINT dispatch step — can run the SAME plan-and-write logic through its own deps, without
 * reimplementing it or shelling out to this file as a child process. The CLI below is now a thin
 * wrapper: parse args, build real deps from scripts/lib/db.mjs, call this, exit. Every console.log line
 * here is unchanged from the pre-refactor main() (same wording, same order) — the CLI's stdout is
 * byte-for-byte the same as before this refactor.
 * @param {{
 *   readCorpus: () => Promise<Array<object>>,
 *   readExistingOpen: () => Promise<Array<{id:string, subject_ref:string, created_by:string}>>,
 *   insertMany: (rows:object[]) => Promise<{inserted:number, snapshot:string|null}>,
 *   updateStale: (ids:string[]) => Promise<{updated:number, snapshot:string|null}>,
 * }} deps
 * @param {{mode:"ids"|"since"|"untagged", ids?:string[]|null, since?:string|null, execute?:boolean}} opts
 * @returns {Promise<{
 *   corpusCount:number, targetsCount:number, missingIds:string[], flagCandidatesCount:number,
 *   fresh:Array<{subjectRef:string, row:object, proposalCount:number, itemId:string, proposals:Array}>,
 *   withProposalsCount:number, existingOpenCount:number,
 *   plan:{newRows:object[], staleIds:string[], unchanged:number},
 *   executed:boolean, wrote:{inserted:number, snapshot:string|null}|null,
 *   resolved:{updated:number, snapshot:string|null}|null,
 * }>}
 */
export async function proposeTags(deps, { mode, ids = null, since = null, execute = false } = {}) {
  const corpus = await deps.readCorpus();

  const { targets, missingIds } = selectTargets(corpus, { mode, ids, since });
  if (missingIds.length) {
    console.warn(`propose-tags: ${missingIds.length} requested id(s) not found in the verified/live corpus (ignored): ${missingIds.join(", ")}`);
  }

  const flagCandidates = targets.filter(isEmptySignature);
  console.log(
    `propose-tags: ${corpus.length} verified items loaded; ${targets.length} selected (mode=${mode}); ` +
    `${flagCandidates.length} carry empty signature tags (flag-worthy)${execute ? "" : " (DRY RUN)"}.`,
  );

  const fresh = flagCandidates.map((item) => {
    const derived = deriveTags(item);
    return {
      subjectRef: buildSubjectRef(item.id),
      row: buildFlagRow(item, derived),
      proposalCount: derived.proposals.length,
      itemId: item.id,
      proposals: derived.proposals,
    };
  });
  const withProposals = fresh.filter((f) => f.proposalCount > 0).length;
  console.log(`propose-tags: ${withProposals}/${fresh.length} flag-worthy item(s) have at least one derive-tags.mjs candidate.`);

  const existingOpen = await deps.readExistingOpen();

  // Only the full default (--untagged, i.e. no --ids/--since narrowing) resolves globally — see file
  // header. A narrow run scopes stale-resolution to exactly the subject_refs it selected this run.
  const scopeSubjectRefs = mode === "untagged" ? null : new Set(targets.map((it) => buildSubjectRef(it.id)));
  const plan = planReflect(existingOpen, fresh, { scopeSubjectRefs });

  console.log(`propose-tags: plan = ${plan.newRows.length} new flag(s), ${plan.staleIds.length} stale flag(s) to resolve, ${plan.unchanged} unchanged.`);

  const result = {
    corpusCount: corpus.length,
    targetsCount: targets.length,
    missingIds,
    flagCandidatesCount: flagCandidates.length,
    fresh,
    withProposalsCount: withProposals,
    existingOpenCount: existingOpen.length,
    plan,
    executed: false,
    wrote: null,
    resolved: null,
  };

  if (!execute) {
    console.log("DRY RUN — nothing written. Re-run with --execute to apply.");
    return result;
  }

  if (plan.newRows.length) {
    const ins = await deps.insertMany(plan.newRows);
    console.log(`WROTE: ${ins.inserted} new integrity_flags row(s) (snapshot: ${ins.snapshot}).`);
    result.wrote = ins;
  }
  if (plan.staleIds.length) {
    const res = await deps.updateStale(plan.staleIds);
    console.log(`RESOLVED: ${res.updated} stale flag(s) (snapshot: ${res.snapshot}).`);
    result.resolved = res;
  }
  result.executed = true;
  return result;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) await main();

async function main() {
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`propose-tags: ${parsed.error}`);
  process.exit(1);
}
const { mode, ids, since, execute: EXECUTE } = parsed;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("propose-tags: no DB creds — cannot run here (exit 2).");
  process.exit(2);
}

const { readAll, guardedInsertMany, guardedUpdate } = await import("../lib/db.mjs");

const CITE = {
  skill: "flywheel-build-plan-2026-08-10",
  reason: "TAG lane (2026-09-01): propose derive-tags.mjs candidates for items with empty connection-signature tags, as an integrity_flags row for operator ratification (guarded path, rule 015). Never writes intelligence_items.",
};

// Same connection-signature + grounded-text column set derive-tags.mjs's own header documents as its
// input contract, plus created_at for --since selection (mirrors discover-for-items.mjs's SIG).
const SIG = "id, title, canonical_instrument_key, jurisdiction_iso, jurisdictions, full_brief, " +
  "operational_scenario_tags, compliance_object_tags, topic_tags, created_at";

const deps = {
  readCorpus: () => readAll("intelligence_items", SIG, {
    match: (q) => q.eq("provenance_status", "verified").eq("is_archived", false),
  }),
  readExistingOpen: () => readAll("integrity_flags", "id, subject_ref, created_by", {
    match: (q) => q.eq("status", "open").like("created_by", `${TAG_NAMESPACE}%`),
  }),
  insertMany: (rows) => guardedInsertMany("integrity_flags", rows, { cite: CITE, select: "id" }),
  updateStale: (ids) => guardedUpdate(
    "integrity_flags",
    (qb) => qb.in("id", ids),
    {
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: "propose-tags.mjs",
      resolution_note: `${TAG_NAMESPACE} finding no longer applicable (item now carries connection-signature tags, or fell outside this run's selection scope).`,
    },
    { cite: CITE },
  ),
};

await proposeTags(deps, { mode, ids, since, execute: EXECUTE });
process.exit(0);
}
