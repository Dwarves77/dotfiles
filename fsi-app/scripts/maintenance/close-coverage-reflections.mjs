#!/usr/bin/env node
// close-coverage-reflections.mjs -- MAINT step for D17 family 13 of the 2026-09-12 defect fix plan
// (docs/plans/defect-fix-plan-2026-09-12.md, ruling table row 13, lane L11). The coordinator's ruling
// (verbatim): coverage-gap (`flywheel-gap:*`, U2) and anticipated-coverage (`flywheel-anticipate:*`, U5)
// findings are "product-scope reflections, not questions to a person" -- analyze-corpus.mjs now inserts
// every FRESH finding already resolved (src/lib/connections/coverage-reflection.mjs,
// scripts/connections/analyze-corpus.mjs's own reflectResolvedFlags). This step is the ONE-TIME drain of
// the backlog that existed BEFORE that fix landed: the 24 open rows (18 flywheel-gap:*, 6
// flywheel-anticipate:*) measured 2026-09-12. It resolves them "the same way" the plan specifies -- the
// identical resolution_note the fresh-insert path now uses (coverage-reflection.mjs's
// RESOLVED_REFLECTION_NOTE), so a reader cannot tell a backlog row closed by this step apart from one
// analyze-corpus.mjs wrote pre-resolved.
//
// SCOPE: integrity_flags rows with created_by LIKE 'flywheel-gap:%' OR 'flywheel-anticipate:%' AND
// status IN ('open','in_review'). Every row this step reads is closed -- there is no per-row decision
// (the resolution is the same for every row in both namespaces, per the coordinator's own ruling).
import { readAll, guardedUpdateByIds } from "../lib/db.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { GAP_NAMESPACE, ANTICIPATE_NAMESPACE } from "../../src/lib/connections/flag-namespaces.mjs";
import { RESOLVED_REFLECTION_NOTE } from "../../src/lib/connections/coverage-reflection.mjs";

export const CITE = Object.freeze({
  skill: "defect-fix-plan-2026-09-12 D17 family 13 (lane L11)",
  reason:
    "One-time drain of the coverage-gap / anticipated-coverage backlog opened before analyze-corpus.mjs " +
    "started writing these findings already resolved (D17 family 13): product-scope reflections, not " +
    "questions to a person; resolved with the SAME note the fresh-insert path uses so a reader cannot " +
    "tell backlog from fresh.",
});

export const RESOLVED_BY = "close-coverage-reflections";
export const RESOLUTION_NOTE = RESOLVED_REFLECTION_NOTE;

const FLAG_COLUMNS = "id, created_by, description, status, subject_ref, category";
const NAMESPACE_PATTERNS = [`${GAP_NAMESPACE}%`, `${ANTICIPATE_NAMESPACE}%`];

/**
 * Pure: every row in `rows` closes -- both namespaces resolve identically under this family's ruling.
 * Grouped by namespace (gap vs anticipate) purely for the dry-report's own by-family count.
 * @param {Array<{id:string, created_by?:string|null}>} rows
 * @returns {{toClose: Array<{id:string, created_by:string|null|undefined, family:string}>}}
 */
export function planClosure(rows) {
  const familyOf = (createdBy) => {
    const cb = String(createdBy ?? "");
    if (cb.startsWith(GAP_NAMESPACE)) return "coverage-gap";
    if (cb.startsWith(ANTICIPATE_NAMESPACE)) return "anticipated-coverage";
    return "unknown";
  };
  const toClose = (rows ?? []).map((row) => ({ id: row.id, created_by: row.created_by, family: familyOf(row.created_by) }));
  return { toClose };
}

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ readCandidates: () => Promise<Array>, closeIds: (ids:string[]) => Promise<{updated:number, snapshot:string|null}>,
 *   readRemainingOpen: () => Promise<Array> }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "close-coverage-reflections", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const rows = await deps.readCandidates();
  const { toClose } = planClosure(rows);
  const byFamily = {};
  for (const e of toClose) byFamily[e.family] = (byFamily[e.family] ?? 0) + 1;

  summary.counts = { candidates_scanned: rows.length, would_close: toClose.length, by_family: byFamily };
  summary.close_sample = toClose.slice(0, 20);
  summary.close_total = toClose.length;

  if (!apply) {
    summary.note = `DRY -- ${toClose.length} coverage-reflection row(s) would close (${JSON.stringify(byFamily)}). Nothing written.`;
    return summary;
  }

  const ids = toClose.map((e) => e.id);
  const res = ids.length ? await deps.closeIds(ids) : { updated: 0, snapshot: null };
  summary.applied = res.updated;
  summary.counts.write = { attempted: ids.length, updated: res.updated, snapshot: res.snapshot };

  const remaining = await deps.readRemainingOpen();
  summary.read_back = {
    remaining_open: remaining.length,
    remaining_sample: remaining.slice(0, 20).map((r) => ({ id: r.id, created_by: r.created_by })),
  };
  summary.note = `Closed ${res.updated}/${ids.length} coverage-reflection row(s) (${JSON.stringify(byFamily)}). ${remaining.length} row(s) remain open (expected: a race against a concurrent writer).`;

  return summary;
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "close-coverage-reflections",
    main,
    needsDb: true,
    buildDeps: async () => ({
      readCandidates: () =>
        readAll("integrity_flags", FLAG_COLUMNS, {
          match: (q) =>
            q
              .in("status", ["open", "in_review"])
              .or(NAMESPACE_PATTERNS.map((p) => `created_by.like.${p}`).join(",")),
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
          match: (q) =>
            q
              .in("status", ["open", "in_review"])
              .or(NAMESPACE_PATTERNS.map((p) => `created_by.like.${p}`).join(",")),
        }),
    }),
  });
}
