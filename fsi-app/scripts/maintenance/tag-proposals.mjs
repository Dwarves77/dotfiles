// tag-proposals.mjs — MAINT dispatch step: writes the TAG proposal flags propose-tags.mjs computes.
//
// THE GAP THIS CLOSES (Lane TAG-PROPOSALS, 2026-09-03, coordinator-confirmed defect): 339 of 619
// verified, live intelligence_items carry all three connection-signature tag arrays empty
// (topic_tags, compliance_object_tags, operational_scenario_tags), so discover.mjs scores them 0
// edges (see propose-tags.mjs's own header for the exact mechanism). scripts/connections/
// propose-tags.mjs already computes the fix — one integrity_flags PROPOSAL row per untagged item,
// namespace flag-namespaces.mjs's TAG_NAMESPACE — but had NO dispatch surface: population-turn.yml
// runs it `--dry` unconditionally (writes nothing, by construction — see that script's own DRY RUN
// branch) and no maintenance step ever called `--execute`. Live, before this step: 0 open and 0
// resolved TAG_NAMESPACE flags have ever existed. This step is that missing coordinator-dispatch
// runtime, same posture as every other MAINT step (tag-ratification.mjs is its sibling and its
// template).
//
// WHAT IT DOES. Both modes call this file's own proposeTags() import UNMODIFIED — no logic
// reimplemented (see that file's header, "Lane TAG-PROPOSALS" note, for why an export refactor made
// this an import instead of a child-process spawn).
//   Dry: runs proposeTags() with execute:false — computes the same fresh/plan a real run would, reports
//   counts per selection, a per-item proposal preview (item id + proposals derive-tags.mjs found), and
//   the exact command that would apply this selection. Writes nothing.
//   Apply: runs proposeTags() with execute:true — writes new integrity_flags PROPOSAL rows and
//   auto-resolves stale ones no longer reproduced by the fresh computation, through the guarded path
//   (rule 015). THIS NEVER WRITES intelligence_items — it writes integrity_flags proposals only. The
//   operator's standing rule (propose-tags.mjs's own header): "NO assumptions, NEVER silent
//   auto-tagging; tag PROPOSALS go to operator ratification." Writing proposal flags IS the visibility
//   that rule requires; a proposal only becomes a written tag once an operator resolves its flag with
//   the `ratify:tags` marker and the sibling `tag-ratification` MAINT step applies it
//   (docs/runbooks/MAINTENANCE-RUNBOOK.md §7).
//
// `--arg` selects the population, exactly as propose-tags.mjs's own CLI selectors do:
//   (blank) or "untagged"   — every verified, live item with all three signature tag arrays empty
//                              (the default — matches propose-tags.mjs's own default)
//   "since:<ISO-date>"      — items created_at >= that timestamp (narrow scope; stale-resolution is
//                              scoped to this run's own selection, never global — see propose-tags.mjs)
//   "ids:<uuid,uuid,...>"   — exactly these items (selected regardless of tag state; narrowed to
//                              empty-signature items before any flag is built, same as propose-tags.mjs)
// apply mode does NOT require --arg — an unqualified apply runs the same --untagged default
// propose-tags.mjs's own --execute (with no selector) runs; this mirrors propose-tags.mjs's own CLI
// contract rather than tag-ratification.mjs's per-id-required gate, because writing a PROPOSAL (never
// an item tag) is not the irreversible/high-blast-radius action a blanket apply-and-ratify would be.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { proposeTags } from "../connections/propose-tags.mjs";
import { TAG_NAMESPACE } from "../../src/lib/connections/flag-namespaces.mjs";
import { runCli } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "flywheel-build-plan-2026-08-10",
  reason:
    "MAINT tag-proposals dispatch (Lane TAG-PROPOSALS, 2026-09-03): writes scripts/connections/" +
    "propose-tags.mjs's own guarded proposeTags() core (imported unmodified) — one integrity_flags " +
    "PROPOSAL row per untagged item, for operator ratification. Never writes intelligence_items tags.",
});

/**
 * Parse this step's --arg into propose-tags.mjs's own selector shape. PURE.
 * @param {string} arg
 * @returns {{ok:true, mode:"untagged"|"since"|"ids", ids:string[]|null, since:string|null} | {ok:false, error:string}}
 */
export function parseSelection(arg) {
  const raw = String(arg ?? "").trim();
  if (!raw || raw === "untagged") return { ok: true, mode: "untagged", ids: null, since: null };
  if (raw.startsWith("since:")) {
    const since = raw.slice("since:".length).trim();
    if (!since || Number.isNaN(Date.parse(since))) {
      return { ok: false, error: `--arg "since:<ISO>" requires a parseable date (got ${JSON.stringify(since)}).` };
    }
    return { ok: true, mode: "since", ids: null, since };
  }
  if (raw.startsWith("ids:")) {
    const ids = raw.slice("ids:".length).split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return { ok: false, error: '--arg "ids:<uuid,uuid,...>" requires at least one id.' };
    return { ok: true, mode: "ids", ids, since: null };
  }
  return { ok: false, error: `unrecognized --arg ${JSON.stringify(raw)} (expected blank/"untagged", "since:<ISO>", or "ids:<uuid,uuid>").` };
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {{
 *   readCorpus: () => Promise<Array<object>>,
 *   readExistingOpen: () => Promise<Array<{id:string, subject_ref:string, created_by:string}>>,
 *   insertMany: (rows:object[]) => Promise<{inserted:number, snapshot:string|null}>,
 *   updateStale: (ids:string[]) => Promise<{updated:number, snapshot:string|null}>,
 * }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "tag-proposals", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const selection = parseSelection(arg);
  if (!selection.ok) {
    summary.note = `REFUSED — ${selection.error}`;
    summary.exitCode = 1;
    return summary;
  }

  const result = await proposeTags(deps, {
    mode: selection.mode,
    ids: selection.ids,
    since: selection.since,
    execute: apply,
  });

  const argForCommand = selection.mode === "untagged" ? "" : String(arg).trim();
  const applyCommand =
    `node scripts/maintenance/tag-proposals.mjs --mode apply${argForCommand ? ` --arg ${argForCommand}` : ""}`;

  summary.counts = {
    selection: { mode: selection.mode, ids: selection.ids, since: selection.since },
    corpus_count: result.corpusCount,
    targets_count: result.targetsCount,
    missing_ids: result.missingIds,
    flag_candidates_count: result.flagCandidatesCount,
    with_proposals_count: result.withProposalsCount,
    existing_open_count: result.existingOpenCount,
    plan: {
      new_count: result.plan.newRows.length,
      stale_count: result.plan.staleIds.length,
      unchanged: result.plan.unchanged,
    },
    preview: result.fresh.map((f) => ({
      item_id: f.itemId,
      proposal_count: f.proposalCount,
      proposals: f.proposals,
    })),
    apply_command: applyCommand,
  };

  if (!apply) {
    summary.note =
      `DRY — ${result.plan.newRows.length} proposal flag(s) and ${result.plan.staleIds.length} ` +
      `stale-resolution(s) would be written. Nothing written. Apply with: ${applyCommand}`;
    return summary;
  }

  summary.applied = result.plan.newRows.length;
  summary.wrote = result.wrote;
  summary.resolved = result.resolved;
  summary.note =
    `Wrote ${result.wrote?.inserted ?? 0} new integrity_flags PROPOSAL row(s); resolved ` +
    `${result.resolved?.updated ?? 0} stale row(s). This writes integrity_flags proposals ONLY — it ` +
    "never writes intelligence_items tags (operator rule: NO assumptions, NEVER silent auto-tagging). " +
    `Ratify each with resolution_note containing "ratify:tags", then run the tag-ratification MAINT ` +
    "step to apply.";

  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "tag-proposals",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedInsertMany, guardedUpdate } = await import("../lib/db.mjs");

      // Same connection-signature + grounded-text column set propose-tags.mjs's own CLI reads, plus
      // created_at for --since selection — kept in lockstep with that file's SIG by hand (propose-tags.mjs
      // does not export its column list; both lists are commented so a future edit to one is a prompt to
      // check the other).
      const SIG = "id, title, canonical_instrument_key, jurisdiction_iso, jurisdictions, full_brief, " +
        "operational_scenario_tags, compliance_object_tags, topic_tags, created_at";

      return {
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
            resolved_by: "tag-proposals.mjs (MAINT)",
            resolution_note: `${TAG_NAMESPACE} finding no longer applicable (item now carries connection-signature tags, or fell outside this run's selection scope).`,
          },
          { cite: CITE },
        ),
      };
    },
  });
}
