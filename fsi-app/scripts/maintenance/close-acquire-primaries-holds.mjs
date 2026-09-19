#!/usr/bin/env node
// SHARED-WRITER: integrity_flags
// close-acquire-primaries-holds.mjs -- MAINT step for D17 family 10 of the 2026-09-12 defect fix plan
// (docs/plans/defect-fix-plan-2026-09-12.md, ruling table row 10, lane L11). The writer
// (scripts/remediation/acquire-primaries-batch.mjs, created_by "acquire-primaries-batch-2026-07-16") and
// its MAINT wrapper (scripts/maintenance/acquire-primaries.mjs) are DELETED in the same commit as this
// file: the enumeration (docs/audits/quarantine-and-human-flag-writers-2026-09-12.md, Family 10) found no
// reader anywhere for that created_by string or for the "manual-primary-capture" recommended action --
// a write-only orphan. Deleting the writer does not touch the 19 rows it already wrote; this step
// resolves those.
//
// THE RULE (plan row 10, verbatim): the 19 rows resolve with "superseded by the free capture path and
// provenance-heal (task 7.3); item carried in the 7.3 residue report". Both are real, live mechanisms
// that supersede the one-shot 2026-07-16 script: the free capture path (scripts/mint/heal-provenance.mjs's
// captureCitedUrl, also reused by resolve-error-body-gate.mjs) and provenance-heal.mjs's own capture ->
// ground -> slots -> Gate A -> re-derive pipeline (maintenance.yml step "provenance-heal"). The row is
// RESOLVED, never deleted -- "the record stays; the queue empties" (the same posture close-run-logs.mjs
// and every other Part 7 / D17 resolver in this plan uses).
//
// SCOPE: integrity_flags rows with created_by = 'acquire-primaries-batch-2026-07-16' and
// status in ('open','in_review'). Every row this step reads is closed -- there is no per-row decision to
// make (the writer and its only reader are both gone; the question the row asked, "is there a free
// path-'a' primary for this item", is now answered by the two named live mechanisms, not by this step
// itself re-deriving anything).
import { readAll, guardedUpdateByIds } from "../lib/db.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const CITE = Object.freeze({
  skill: "defect-fix-plan-2026-09-12 D17 family 10 (lane L11)",
  reason:
    "Resolve the write-only acquire-primaries-batch-2026-07-16 holds: the one-shot script and its flag " +
    "writer are deleted (no reader anywhere for the created_by string or the manual-primary-capture " +
    "action); the free capture path and provenance-heal.mjs supersede it, and the item stays carried in " +
    "the task 7.3 residue report. The record stays (resolved, never deleted); the queue empties.",
});

export const CREATED_BY = "acquire-primaries-batch-2026-07-16";
export const RESOLVED_BY = "close-acquire-primaries-holds";
export const RESOLUTION_NOTE =
  "superseded by the free capture path and provenance-heal (task 7.3); item carried in the 7.3 residue report";

const FLAG_COLUMNS = "id, created_by, description, status, subject_ref, category";

/**
 * Pure: every row in `rows` is a candidate to close -- this family has no per-row decision (the writer
 * and its only reader are both retired, so there is nothing left for a row's own text to distinguish).
 * Kept as a named function (mirroring close-run-logs.mjs's decide/plan split) so the dry report has one
 * place asserting "why every row closes", and a future family sharing this shape can diverge from it
 * without touching the orchestration below.
 * @param {Array<{id:string, created_by?:string|null}>} rows
 * @returns {{toClose: Array<{id:string, created_by:string|null|undefined, reason:string}>}}
 */
export function planClosure(rows) {
  const toClose = (rows ?? []).map((row) => ({
    id: row.id,
    created_by: row.created_by,
    reason: "acquire-primaries-batch-2026-07-16 hold: writer + one-shot script deleted, no reader ever existed",
  }));
  return { toClose };
}

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ readCandidates: () => Promise<Array>, closeIds: (ids:string[]) => Promise<{updated:number, snapshot:string|null}>,
 *   readRemainingOpen: () => Promise<Array> }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "close-acquire-primaries-holds", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const rows = await deps.readCandidates();
  const { toClose } = planClosure(rows);

  summary.counts = { candidates_scanned: rows.length, would_close: toClose.length };
  summary.close_sample = toClose.slice(0, 20);
  summary.close_total = toClose.length;

  if (!apply) {
    summary.note = `DRY -- ${toClose.length} acquire-primaries-batch-2026-07-16 hold(s) would close. Nothing written.`;
    return summary;
  }

  const ids = toClose.map((e) => e.id);
  const res = ids.length ? await deps.closeIds(ids) : { updated: 0, snapshot: null };
  summary.applied = res.updated;
  summary.counts.write = { attempted: ids.length, updated: res.updated, snapshot: res.snapshot };

  const remaining = await deps.readRemainingOpen();
  summary.read_back = {
    remaining_open: remaining.length,
    remaining_sample: remaining.slice(0, 20).map((r) => ({ id: r.id })),
  };
  summary.note = `Closed ${res.updated}/${ids.length} acquire-primaries-batch-2026-07-16 hold(s). ${remaining.length} row(s) remain open (expected: a race against a concurrent writer, none possible once the writer is deleted).`;

  return summary;
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "close-acquire-primaries-holds",
    main,
    needsDb: true,
    buildDeps: async () => ({
      readCandidates: () =>
        readAll("integrity_flags", FLAG_COLUMNS, {
          match: (q) => q.eq("created_by", CREATED_BY).in("status", ["open", "in_review"]),
        }),
      closeIds: (ids) =>
        guardedUpdateByIds(
          "integrity_flags",
          ids,
          { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: RESOLVED_BY, resolution_note: RESOLUTION_NOTE },
          { cite: CITE, applyMatch: (q) => q.in("status", ["open", "in_review"]) },
        ),
      readRemainingOpen: () =>
        readAll("integrity_flags", FLAG_COLUMNS, {
          match: (q) => q.eq("created_by", CREATED_BY).in("status", ["open", "in_review"]),
        }),
    }),
  });
}
