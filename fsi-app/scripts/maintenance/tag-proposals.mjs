import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { proposeTags, NO_DERIVABLE_SUBTYPE } from "../connections/propose-tags.mjs";
import { TAG_NAMESPACE, createdBy } from "../../src/lib/connections/flag-namespaces.mjs";
import { runCli } from "./lib/cli.mjs";
// lane G7-CORR: a tag an admin removed (item_corrections, migration 356) is never proposed again.
import { readAllCorrections } from "../../src/lib/corrections/item-corrections.mjs";
// lane G5-READ: an adopted vocabulary term is derivable, so the proposer reads the adopted set once per run.
import { memoAdoptedTerms } from "../../src/lib/vocabulary/adopted-terms.mjs";

export const CITE = Object.freeze({
  skill: "flywheel-build-plan-2026-08-10",
  reason:
    "MAINT tag-proposals dispatch (Lane TAG-PROPOSALS, 2026-09-03): writes scripts/connections/" +
    "propose-tags.mjs's own guarded proposeTags() core (imported unmodified); one integrity_flags " +
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
    summary.note = `REFUSED; ${selection.error}`;
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
      `DRY; ${result.plan.newRows.length} proposal flag(s) and ${result.plan.staleIds.length} ` +
      `stale-resolution(s) would be written. Nothing written. Apply with: ${applyCommand}`;
    return summary;
  }

  summary.applied = result.plan.newRows.length;
  summary.wrote = result.wrote;
  summary.resolved = result.resolved;
  summary.note =
    `Wrote ${result.wrote?.inserted ?? 0} new integrity_flags PROPOSAL row(s); resolved ` +
    `${result.resolved?.updated ?? 0} stale row(s). This writes integrity_flags proposals ONLY; it ` +
    "never writes intelligence_items tags. The tag-ratification MAINT step decides each proposal by " +
    "rule (adopt or decline) and closes the flag; no operator marker is needed.";

  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "tag-proposals",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, readClient, guardedInsertMany, guardedUpdateByIds } = await import("../lib/db.mjs");

      // Same connection-signature + grounded-text column set propose-tags.mjs's own CLI reads, plus
      // created_at for --since selection; kept in lockstep with that file's SIG by hand (propose-tags.mjs
      // does not export its column list; both lists are commented so a future edit to one is a prompt to
      // check the other).
      const SIG = "id, title, canonical_instrument_key, jurisdiction_iso, jurisdictions, full_brief, " +
        "operational_scenario_tags, compliance_object_tags, topic_tags, created_at";

      return {
        readAdoptedTerms: memoAdoptedTerms(readClient()),
        readTagCorrections: () => readAllCorrections(readClient()),
        readCorpus: () => readAll("intelligence_items", SIG, {
          match: (q) => q.eq("provenance_status", "verified").eq("is_archived", false),
        }),
        readExistingOpen: () => readAll("integrity_flags", "id, subject_ref, created_by", {
          match: (q) => q.eq("status", "open").like("created_by", `${TAG_NAMESPACE}%`),
        }),
        // D15 part 2 (defect-fix-plan-2026-09-12): any-status read, scoped to the no-derivable subtype
        // (those rows are born resolved, so an open-only scan would never see them for dedup).
        readExistingNoDerivable: () => readAll("integrity_flags", "id, subject_ref, created_by", {
          match: (q) => q.eq("created_by", createdBy(TAG_NAMESPACE, NO_DERIVABLE_SUBTYPE)),
        }),
        insertMany: (rows) => guardedInsertMany("integrity_flags", rows, { cite: CITE, select: "id" }),
        // ids is runtime-scaled (every stale integrity_flags row this tag-proposal pass found) with no
        // declared cap; chunked via guardedUpdateByIds, not a single .in(), IN-CHUNK class (2026-09-06).
        updateStale: (ids) => guardedUpdateByIds(
          "integrity_flags",
          ids,
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
