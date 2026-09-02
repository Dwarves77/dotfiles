#!/usr/bin/env node
// source-type-backfill.mjs — MAINT step wrapping scripts/sources/backfill-source-type.mjs (Lane HYG-2's
// backfill for migration 288's `sources.source_type`). Added by the coordinator on 2026-09-02 after the
// Wave 1 train landed: HYG-2 built the backfill dry-by-default and MAINT built the runtime, in disjoint
// lanes, so the runtime had no step for it and the only way to apply it would have been a by-hand run
// with the service-role key. Every coordinator-only apply runs through this runtime (finish plan §3).
//
// Not gated on a ruling: the taxonomy is the proposal the STOPGAP itself named
// (docs/plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md), migration 288 is applied, and the classifier writes only
// where `source_type IS NULL` (re-checked per chunk). Dry prints the distribution and the unclassifiable
// remainder; apply writes and reads back the classified count.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main as backfillMain } from "../sources/backfill-source-type.mjs";
import { runCli } from "./lib/cli.mjs";

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ readAll: Function, guardedUpdateByIds: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "source-type-backfill", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };
  const res = await backfillMain({ apply }, deps);
  summary.counts = {
    active: res.active,
    already_classified: res.already_classified,
    to_write: res.to_write,
    unclassifiable: res.unclassifiable,
    distribution: res.distribution,
  };
  if (!apply) return summary;
  summary.applied = res.written ?? 0;
  const after = await deps.readAll("sources", "id, source_type", { match: (q) => q.not("source_type", "is", null) });
  summary.read_back = { source_type_not_null_total: after.length };
  if (summary.applied !== res.to_write) {
    summary.note = `MISMATCH — planned ${res.to_write}, wrote ${summary.applied} (rows classified by another writer between read and write are left alone by design; anything else is a defect).`;
  }
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "source-type-backfill",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedUpdateByIds } = await import("../lib/db.mjs");
      return { readAll, guardedUpdateByIds };
    },
  });
}
