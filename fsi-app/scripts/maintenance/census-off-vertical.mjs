// census-off-vertical.mjs — MAINT dispatch step for R-A (open): what to do with the census_worklist
// rows the relevance screen calls off-vertical.
//
// WHAT IT DOES. Dry: reads every `would_mint` census_worklist row (the same pool the 2026-08-31 screen
// ran over — 1,729 mint / 1,676 off-vertical / 256 need-fetch), computes each row's verdict the ONE
// shared way (scripts/mint/export-census-rows.mjs's partitionByScreen, itself
// scripts/mint/lib/screen-verdict.mjs's screenVerdictFor — imported unmodified, never re-derived), and
// counts on_vertical / off_vertical / ambiguous. Apply is gated on R-A's two named outcomes, per arg:
//   arg=park    — no-op. R-A's "park" option means "leave would_mint as-is; the export gate already
//                 withholds these rows from minting" (export-census-rows.mjs's own partitionByScreen
//                 gate, run 2026-09-02) — there is nothing to write.
//   arg=archive — R-A's "archive (reversible)" option would need archivePatch("census_worklist", ...)
//                 through guardedUpdateByIds, mirroring screen-reconcile-records.mjs's own pattern for
//                 intelligence_items. CHECKED THIS SESSION (migration 221, census_worklist's own DDL):
//                 the table has NO is_archived / archive_reason columns at all — only
//                 flagged_reason/flagged_at (a different, narrower "malformed/incomplete" vocabulary) and
//                 the enumeration_status ladder. archivePatch's is_archived/archive_reason patch has
//                 nothing to set on this table. NOT RUNNABLE today: this step is DRY-ONLY for 'archive'
//                 until either a migration adds archive columns to census_worklist, or R-A is decided as
//                 'park' (which needs no schema change at all).
import { partitionByScreen, loadReviewedVerdicts } from "../mint/export-census-rows.mjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./lib/cli.mjs";

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {{ readAll: Function, reviewed?: object }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const reviewed = deps.reviewed ?? loadReviewedVerdicts();
  const summary = { step: "census-off-vertical", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const rows = await deps.readAll("census_worklist", "id, document_url, title, surface_tags, dryrun_disposition", {
    match: (q) => q.eq("dryrun_disposition", "would_mint"),
  });
  const { mintable, screenedOut } = partitionByScreen(rows, reviewed);
  const offVertical = screenedOut.filter((s) => s.verdict === "off_vertical");
  const ambiguous = screenedOut.filter((s) => s.verdict === "ambiguous");
  summary.counts = {
    would_mint_total: rows.length,
    on_vertical: mintable.length,
    off_vertical: offVertical.length,
    ambiguous: ambiguous.length,
  };

  if (!apply) return summary;

  if (arg === "park") {
    summary.note =
      "park: no-op. The export gate (scripts/mint/export-census-rows.mjs's partitionByScreen) already " +
      "withholds these rows from minting — 'park' is the status quo, nothing to write.";
    return summary;
  }
  if (arg === "archive") {
    summary.note =
      "NOT RUNNABLE: census_worklist (migration 221) has no is_archived/archive_reason columns — " +
      "archivePatch('census_worklist', ...) has nothing to set on this table. This step is DRY-ONLY for " +
      "'archive' until a migration adds archive columns to census_worklist. No write attempted.";
    summary.exitCode = 2;
    return summary;
  }
  summary.note = `REFUSED — apply requires arg == 'archive' or 'park' per ruling R-A (open). Got: '${arg || "(none)"}'.`;
  summary.exitCode = 1;
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "census-off-vertical",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll } = await import("../lib/db.mjs");
      return { readAll };
    },
  });
}
