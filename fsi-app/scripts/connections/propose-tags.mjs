#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveTags } from "../../src/lib/connections/derive-tags.mjs";
import { TAG_NAMESPACE, createdBy, buildSubjectRef } from "../../src/lib/connections/flag-namespaces.mjs";
import { assembleTagInput } from "../../src/lib/connections/tag-input.mjs";
import { deriveAliasTags, mergeTagProposals } from "../../src/lib/connections/tag-aliases.mjs";
// buildNoDerivableTagsNote imported unmodified from apply-tags.mjs (D15 part 2, defect-fix-plan-2026-09-12)
// so the decider's zero-proposal re-derivation (D15 part 1) and this proposer's zero-derivation write use
// byte-identical resolution_note wording -- one place, never a second hand-typed copy.
import { buildNoDerivableTagsNote } from "./apply-tags.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
// lane G7-CORR: a tag an admin removed (item_corrections, migration 356) is never proposed again.
import { removedTagsFor, filterTagProposals, readAllCorrections } from "../../src/lib/corrections/item-corrections.mjs";
import { memoAdoptedTerms } from "../../src/lib/vocabulary/adopted-terms.mjs";

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

// D15 part 2 (defect-fix-plan-2026-09-12): a distinct subtype for the "derive-tags.mjs found nothing"
// finding, separate from the proposal-bearing "empty-signature" subtype above. Deliberately DIFFERENT
// created_by (not just a different status on the same key): a later run for the SAME item that now DOES
// derive proposals must insert a fresh, normal, open "empty-signature" flag rather than being silently
// blocked by dedup against this already-resolved row's identical (subject_ref, created_by) key.
export const NO_DERIVABLE_SUBTYPE = "empty-signature-no-derivable";

/**
 * The integrity_flags row for an item whose derive-tags.mjs pass found ZERO candidate tags. Born ALREADY
 * RESOLVED -- never an open "ask a human" flag (D15: the defect this closes is exactly 1,034 open flags
 * whose only proposal was a request for manual tagging that no human ever actioned, described in this
 * file's OLD "needs manual operator tagging" phrase, now removed). Uses apply-tags.mjs's OWN
 * buildNoDerivableTagsNote (imported, not duplicated) so the decider's D15-part-1 zero-proposal
 * re-derivation and this proposer-side write share byte-identical wording. PURE except for the date
 * stamp. One row per item; merged on re-run via planReflect's ordinary dedup, scoped to this subtype's
 * own existing rows (see proposeTags()'s `readExistingNoDerivable` read).
 * @param {{id:string}} item
 * @param {Date} [today]
 * @returns {object} integrity_flags row (status:'resolved', no id, assigned at insert)
 */
export function buildNoDerivableFlagRow(item, today = new Date()) {
  const description =
    `Item ${item.id} has empty operational_scenario_tags/compliance_object_tags/topic_tags (0 ` +
    "discover.mjs edges) and derive-tags.mjs found no candidate tags from its title/instrument key/brief " +
    "text.\n\nPROPOSALS_JSON: []";
  return {
    category: "data_quality",
    subject_type: "item",
    subject_ref: buildSubjectRef(item.id),
    description,
    recommended_actions: [],
    status: "resolved",
    resolved_at: today.toISOString(),
    resolved_by: "propose-tags.mjs",
    resolution_note: buildNoDerivableTagsNote(today),
    created_by: createdBy(TAG_NAMESPACE, NO_DERIVABLE_SUBTYPE),
  };
}

/**
 * Build the integrity_flags insert payload for one item's derive-tags result. PURE. A proposal-bearing
 * result opens a normal review flag (`description` carries a human summary FIRST, then a compact
 * single-line JSON block of the raw proposals, machine-parseable by apply-tags.mjs's own flag reader
 * without a second data path); a ZERO-proposal result delegates to buildNoDerivableFlagRow (D15 part 2)
 * so there is exactly one implementation of that shape, never a second hand-copy.
 * @param {{id:string}} item
 * @param {{itemId:string, proposals:Array<{field:string, tag:string, evidence:string, confidence:string}>}} derived
 * @returns {object} integrity_flags row
 */
export function buildFlagRow(item, derived) {
  const proposals = derived?.proposals ?? [];
  if (!proposals.length) return buildNoDerivableFlagRow(item);

  const proposalsJson = JSON.stringify(proposals);
  const byField = proposals.reduce((acc, p) => {
    (acc[p.field] ||= []).push(p.tag);
    return acc;
  }, {});
  const summary =
    `derive-tags.mjs proposes ${proposals.length} tag(s) for item ${item.id} (currently empty operational_scenario_tags/compliance_object_tags/topic_tags -> discover.mjs scores 0 edges for it): ` +
    Object.entries(byField).map(([f, tags]) => `${f}=[${tags.join(", ")}]`).join("; ") + ".";
  const description = `${summary}\n\nPROPOSALS_JSON: ${proposalsJson}`;

  const recommended_actions = [
    "No operator step is needed: the tag-ratification maintenance step decides every proposal above by rule (adopt or decline, with the reason recorded on this flag) and closes it.",
    `To decide this one flag now, run: ${APPLY_COMMAND_TEMPLATE}`,
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
 *   readExistingNoDerivable: () => Promise<Array<{id:string, subject_ref:string, created_by:string}>>,
 *   insertMany: (rows:object[]) => Promise<{inserted:number, snapshot:string|null}>,
 *   updateStale: (ids:string[]) => Promise<{updated:number, snapshot:string|null}>,
 * }} deps - `readExistingNoDerivable` (D15 part 2) reads ANY-status rows under the
 *   `empty-signature-no-derivable` subtype (never open-only; those rows are born resolved), so a
 *   zero-derivation finding dedups against its own prior write instead of being re-inserted every run.
 * @param {{mode:"ids"|"since"|"untagged", ids?:string[]|null, since?:string|null, execute?:boolean}} opts
 * @returns {Promise<{
 *   corpusCount:number, targetsCount:number, missingIds:string[], flagCandidatesCount:number, blockedByCorrectionCount:number,
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

  // Coordinator wiring (2026-09-03, Lane TAGDERIVE's measured cause): the flat SIG row (title, key,
  // jurisdiction, brief) yielded tags for 16 of 178 record-grade items; the same matcher over the item's
  // grounded material (sections, FACT claims, a bounded window of the captured source) plus the legal-text
  // alias table yields 72. deps.enrichTargets (optional; batch-scoped, only the flag-worthy items) attaches
  // sections/claims/searchResults; assembleTagInput folds them into the derive-tags input shape.
  const enriched = deps.enrichTargets ? await deps.enrichTargets(flagCandidates) : flagCandidates;
  // lane G7-CORR: tag corrections for this batch (optional dep; a read failure throws, never plans without them).
  const tagCorrections = deps.readTagCorrections && flagCandidates.length
    ? await deps.readTagCorrections(flagCandidates.map((i) => i.id))
    : [];
  let blockedByCorrectionCount = 0;
  // lane G5-READ: the adopted vocabulary terms (optional dep, read once for the batch); an adopted scenario or
  // compliance_object term derives like a code tag.
  const adoptedTerms = deps.readAdoptedTerms && flagCandidates.length ? await deps.readAdoptedTerms() : undefined;
  const fresh = enriched.map((item) => {
    const wide = assembleTagInput(item);
    const base = deriveTags(wide, adoptedTerms);
    const alias = deriveAliasTags(wide);
    const merged = mergeTagProposals(base.proposals, alias.proposals);
    const { kept, blocked } = filterTagProposals(merged, removedTagsFor(tagCorrections, item.id));
    blockedByCorrectionCount += blocked.length;
    const derived = { itemId: item.id, proposals: kept };
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
  // D15 part 2: the no-derivable subtype is born resolved, so its own dedup read is any-status, separate
  // from the open-only scan above (an already-resolved row would be invisible to that scan otherwise).
  const existingNoDerivable = await deps.readExistingNoDerivable();

  // Only the full default (--untagged, i.e. no --ids/--since narrowing) resolves globally — see file
  // header. A narrow run scopes stale-resolution to exactly the subject_refs it selected this run.
  const scopeSubjectRefs = mode === "untagged" ? null : new Set(targets.map((it) => buildSubjectRef(it.id)));

  // Two subtype-scoped reflect passes (D15 part 2): proposal-bearing findings (open, "empty-signature")
  // and zero-derivation findings (resolved, "empty-signature-no-derivable") never share a dedup key, so a
  // later run that DOES derive proposals for a previously-zero-derivable item opens a fresh normal flag
  // rather than being blocked by the old resolved row's identical key.
  const freshWithProposals = fresh.filter((f) => f.proposalCount > 0);
  const freshNoDerivable = fresh.filter((f) => f.proposalCount === 0);
  const proposalPlan = planReflect(existingOpen, freshWithProposals, { scopeSubjectRefs });
  const noDerivablePlan = planReflect(existingNoDerivable, freshNoDerivable, { scopeSubjectRefs });
  const plan = {
    newRows: [...proposalPlan.newRows, ...noDerivablePlan.newRows],
    staleIds: [...proposalPlan.staleIds, ...noDerivablePlan.staleIds],
    unchanged: proposalPlan.unchanged + noDerivablePlan.unchanged,
  };

  console.log(`propose-tags: plan = ${plan.newRows.length} new flag(s), ${plan.staleIds.length} stale flag(s) to resolve, ${plan.unchanged} unchanged.`);

  const result = {
    corpusCount: corpus.length,
    targetsCount: targets.length,
    missingIds,
    flagCandidatesCount: flagCandidates.length,
    blockedByCorrectionCount,
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

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) await main();

async function main() {
loadLocalEnvFile();

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

const { readAll, readClient, guardedInsertMany, guardedUpdateByIds } = await import("../lib/db.mjs");
const { fetchRowsIn } = await import("../mint/export-census-rows.mjs");

const CITE = {
  skill: "flywheel-build-plan-2026-08-10",
  reason: "TAG lane (2026-09-01): propose derive-tags.mjs candidates for items with empty connection-signature tags, as an integrity_flags row for operator ratification (guarded path, rule 015). Never writes intelligence_items.",
};

// Same connection-signature + grounded-text column set derive-tags.mjs's own header documents as its
// input contract, plus created_at for --since selection (mirrors discover-for-items.mjs's SIG).
const SIG = "id, title, canonical_instrument_key, jurisdiction_iso, jurisdictions, full_brief, " +
  "operational_scenario_tags, compliance_object_tags, topic_tags, created_at";

const deps = {
  readAdoptedTerms: memoAdoptedTerms(readClient()),
  readTagCorrections: () => readAllCorrections(readClient()),
  readCorpus: () => readAll("intelligence_items", SIG, {
    match: (q) => q.eq("provenance_status", "verified").eq("is_archived", false),
  }),
  // Batch-scoped enrichment (never a whole-table read of agent_run_searches: ADR-016's grounding pool is
  // full documents; run 33631394941 timed out reading it whole). Chunked `in (...)` reads per item id.
  enrichTargets: async (targets) => {
    if (!targets.length) return targets;
    const sb = readClient();
    const ids = targets.map((t) => t.id);
    const [sections, claims, searches] = await Promise.all([
      fetchRowsIn(sb, "intelligence_item_sections", "item_id, content_md", "item_id", ids),
      fetchRowsIn(sb, "section_claim_provenance", "intelligence_item_id, claim_kind, claim_text", "intelligence_item_id", ids),
      fetchRowsIn(sb, "agent_run_searches", "intelligence_item_id, result_content", "intelligence_item_id", ids),
    ]);
    const group = (rows, key) => {
      const m = new Map();
      for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
      return m;
    };
    const bySec = group(sections, "item_id"), byClaim = group(claims, "intelligence_item_id"), bySearch = group(searches, "intelligence_item_id");
    return targets.map((t) => ({
      ...t,
      sections: bySec.get(t.id) ?? [],
      claims: byClaim.get(t.id) ?? [],
      searchResults: bySearch.get(t.id) ?? [],
    }));
  },
  readExistingOpen: () => readAll("integrity_flags", "id, subject_ref, created_by", {
    match: (q) => q.eq("status", "open").like("created_by", `${TAG_NAMESPACE}%`),
  }),
  // D15 part 2: any-status read, scoped to the no-derivable subtype only (those rows are born resolved).
  readExistingNoDerivable: () => readAll("integrity_flags", "id, subject_ref, created_by", {
    match: (q) => q.eq("created_by", createdBy(TAG_NAMESPACE, NO_DERIVABLE_SUBTYPE)),
  }),
  insertMany: (rows) => guardedInsertMany("integrity_flags", rows, { cite: CITE, select: "id" }),
  // IN-CHUNK (2026-09-04): chunked by id (100 per request).
  updateStale: (ids) => guardedUpdateByIds(
    "integrity_flags",
    ids,
    {
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: "propose-tags.mjs",
      resolution_note: `${TAG_NAMESPACE} finding no longer applicable (item now carries connection-signature tags, or fell outside this run's selection scope).`,
    },
    { cite: CITE, select: "id", chunk: 100 },
  ),
};

await proposeTags(deps, { mode, ids, since, execute: EXECUTE });
process.exit(0);
}
