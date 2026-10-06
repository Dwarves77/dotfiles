// SHARED-WRITER: census_worklist
// census-off-vertical.mjs - MAINT dispatch step for ruling R-A: what to do with the census_worklist rows
// the relevance screen calls off-vertical. R-A is ruled (docs/ratifications/2026-09/RULING-2026-09-06.md):
// off_vertical rows are archived (reversibly), ambiguous rows are parked. The screen decides, so apply
// takes no `arg` and no token (lane G6-GATES, 2026-10-05); a stray arg is ignored.
//
// WHAT IT DOES. Dry: reads every `would_mint`, not-yet-archived census_worklist row (the same pool the
// 2026-08-31 screen ran over), computes each row's verdict the ONE shared way (scripts/mint/
// export-census-rows.mjs's partitionByScreen, itself scripts/mint/lib/screen-verdict.mjs's
// screenVerdictFor — imported unmodified, never re-derived), and counts on_vertical / off_vertical /
// ambiguous — plus a titled sample of up to SAMPLE_SIZE rows per off_vertical/ambiguous class, so a dry
// dispatch's summary.json carries the evidence for what apply will do. Apply does both of R-A's outcomes
// in one run, by the screen's verdict:
//   ambiguous   - parked. R-A's "park" option means "leave would_mint as-is; the export gate already
//                 withholds these rows from minting" (export-census-rows.mjs's own partitionByScreen
//                 gate) - there is nothing to write; the count is recorded in the summary.
//   off_vertical - R-A's "archive (reversible)" option. RUNNABLE (migration 308, W2.2): census_worklist
//                 now carries is_archived/archive_reason (mirroring intelligence_items', migration 004,
//                 verbatim — no new column shape invented). Archives every off_vertical row through
//                 guardedUpdateByIds + db.mjs's table-generic archivePatch("census_worklist",
//                 "off_vertical") — the SAME helper screen-reconcile-records.mjs already uses for the
//                 live-record-item side of this same ruling (R-B), never a second archive-write copy.
//                 Idempotent: applyMatch re-checks dryrun_disposition='would_mint' AND is_archived=false
//                 per chunk, so a row someone else archived (or un-archived) between the read and the
//                 write is left alone. Read back after the write: is_archived count among the touched ids.
import { partitionByScreen, loadReviewedVerdicts } from "../mint/export-census-rows.mjs";
import { archivePatch } from "../lib/db.mjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./lib/cli.mjs";

export const ARCHIVE_REASON = "off_vertical";
export const SAMPLE_SIZE = 20;
export const CITE = Object.freeze({
  skill: "census-off-vertical-archive",
  reason:
    "MAINT census-off-vertical dispatch (Lane MAINT, 2026-09-02; archive path built lane RULINGS-EXEC, " +
    "2026-09-05), under ruling R-A (finish-plan-2026-09-02 section 1; accepted, no token): archives (reversibly) census_worklist " +
    "would_mint rows the shared relevance screen (scripts/mint/lib/screen-verdict.mjs, via " +
    "export-census-rows.mjs's partitionByScreen, imported unmodified) calls off_vertical. Idempotent " +
    "(WHERE dryrun_disposition='would_mint' AND is_archived=false, re-checked per chunk via applyMatch).",
});

/** Build the titled sample the operator's ruling needs from partitionByScreen's `screenedOut` entries
 *  (which carry only { row_id, document_url, verdict, rule, basis, provenance } — no title). Pure. */
export function sampleWithTitles(screenedOutRows, rowsById, n = SAMPLE_SIZE) {
  return screenedOutRows.slice(0, n).map((s) => ({
    id: s.row_id,
    title: rowsById.get(s.row_id)?.title ?? null,
    document_url: s.document_url,
    rule: s.rule,
    basis: s.basis,
    provenance: s.provenance,
  }));
}

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ readAll: Function, readAllByIds: Function, reviewed?: object, guardedUpdateByIds?: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const reviewed = deps.reviewed ?? loadReviewedVerdicts();
  const summary = { step: "census-off-vertical", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const rows = await deps.readAll(
    "census_worklist",
    "id, document_url, title, surface_tags, dryrun_disposition, is_archived",
    // migration 308 (W2.2 / R-A): is_archived=false so a re-run after an apply never recounts (or
    // re-archives) a row this same step already archived.
    { match: (q) => q.eq("dryrun_disposition", "would_mint").eq("is_archived", false) },
  );
  const rowsById = new Map(rows.map((r) => [r.id, r]));
  const { mintable, screenedOut } = partitionByScreen(rows, reviewed);
  const offVertical = screenedOut.filter((s) => s.verdict === "off_vertical");
  const ambiguous = screenedOut.filter((s) => s.verdict === "ambiguous");
  summary.counts = {
    would_mint_total: rows.length,
    on_vertical: mintable.length,
    off_vertical: offVertical.length,
    ambiguous: ambiguous.length,
  };

  if (!apply) {
    // A titled sample of each screened-out class, every dry dispatch, so the evidence for the archive and
    // the park is in the summary.
    summary.sample_off_vertical = sampleWithTitles(offVertical, rowsById);
    summary.sample_ambiguous = sampleWithTitles(ambiguous, rowsById);
    return summary;
  }

  // Ruling R-A: ambiguous rows are parked (no write; the export gate already withholds them). Recorded
  // so the count is in the summary, not implied.
  summary.parked_ambiguous = ambiguous.length;
  if (!offVertical.length) {
    summary.note = "archive: 0 off_vertical rows in the current would_mint/not-archived pool, nothing to write.";
    return summary;
  }
  const ids = offVertical.map((o) => o.row_id);
  const res = await deps.guardedUpdateByIds(
    "census_worklist",
    ids,
    archivePatch("census_worklist", ARCHIVE_REASON),
    { cite: CITE, applyMatch: (q) => q.eq("dryrun_disposition", "would_mint").eq("is_archived", false) },
  );
  summary.applied = res.updated;

  // Maintenance run 34046850770: the post-write read-back over `ids` (a full off-vertical batch -
  // 1,655 in that run, ~65 KB URL-encoded into ONE PostgREST GET) blew the gateway's request-line
  // limit ("paginated read failed at offset 0: <!DOCTYPE html>") AFTER the chunked archive write above
  // had already succeeded - the exact class guardedUpdateByIds solved for the write. readAllByIds is
  // the read-only twin (db.mjs), chunking this read the same way.
  const after = await deps.readAllByIds("census_worklist", "id, is_archived, archive_reason", ids);
  const archivedCount = after.filter((r) => r.is_archived && r.archive_reason === ARCHIVE_REASON).length;
  summary.read_back = { would_archive: ids.length, archived: archivedCount };
  summary.note = `archived ${archivedCount} of ${ids.length} off_vertical rows, parked ${ambiguous.length} ambiguous (ruling R-A).`;
  if (archivedCount !== ids.length) {
    summary.note += ` MISMATCH: expected all ${ids.length} to read back archived.`;
    summary.exitCode = 1;
  }
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "census-off-vertical",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, readAllByIds, guardedUpdateByIds } = await import("../lib/db.mjs");
      return { readAll, readAllByIds, guardedUpdateByIds };
    },
  });
}
