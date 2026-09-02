// origin-class-backfill.mjs — MAINT dispatch step for R-E: the WO-19 origin_class backfill
// (docs/plans/wo19-origin-class-backfill-mapping.md), item_type + sources.tier -> origin_class.
//
// UPSTREAM: NONE EXISTS TO WRAP. `grep -rn origin_class fsi-app/scripts` (run this session) finds only
// consumers of origin_class (propagation/seed-derived-values.mjs, market/regional producers, the
// migration-267/268/271 generators) — no script anywhere implements the WO-19 backfill. Migration 267's
// own header confirms "NO BACKFILL HERE... runs as a separate, later pass"; the plan doc gives the
// mapping as raw SQL for a coordinator to run directly. This step is that missing writer, built from the
// plan's own §2/§4 rule table — the ONE piece of decision logic (item_type+tier -> origin_class) lives in
// scripts/maintenance/lib/origin-class-map.mjs (imported unmodified below, unit-tested cell-by-cell
// against the plan's table), never re-derived inline here.
//
// IDEMPOTENT the same way the plan's own §4 SQL is: only rows with origin_class IS NULL are candidates
// (readAll's own match filter), and the guarded write re-applies that same filter per chunk
// (`applyMatch`) so a row someone else classified between the read and the write is left alone.
// item_type='tool' and any source_id IS NULL row are correctly left NULL (originClassFor/the null-source
// short-circuit below) — never guessed, per the plan's Addendum 26 ruling.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { originClassFor } from "./lib/origin-class-map.mjs";
import { runCli } from "./lib/cli.mjs";

export const REQUIRED_ARG = "R-E-accepted";
export const CITE = Object.freeze({
  skill: "wo19-origin-class-backfill-mapping",
  reason:
    "MAINT origin-class-backfill dispatch (Lane MAINT, 2026-09-02), gated on ruling R-E: stamps " +
    "intelligence_items.origin_class from item_type + sources.tier per " +
    "docs/plans/wo19-origin-class-backfill-mapping.md §2/§4. Idempotent (WHERE origin_class IS NULL, " +
    "re-checked per chunk via applyMatch).",
});

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {{ readAll: Function, fetchRowsIn: Function, readClient: Function, guardedUpdateByIds: Function }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "origin-class-backfill", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const items = await deps.readAll("intelligence_items", "id, item_type, source_id, origin_class", {
    match: (q) => q.is("origin_class", null),
  });
  const sourceIds = [...new Set(items.map((i) => i.source_id).filter(Boolean))];
  const sources = sourceIds.length ? await deps.fetchRowsIn(deps.readClient(), "sources", "id, tier", "id", sourceIds) : [];
  const tierBySource = new Map(sources.map((s) => [s.id, s.tier]));

  const groups = new Map(); // origin_class value -> [item id, ...]
  let noSourceId = 0, noRuleStaysNull = 0;
  for (const it of items) {
    if (!it.source_id) { noSourceId += 1; continue; } // plan §1 fact 1: no source_id, no tier to read.
    const tier = tierBySource.has(it.source_id) ? tierBySource.get(it.source_id) : null;
    const oc = originClassFor(it.item_type, tier);
    if (!oc) { noRuleStaysNull += 1; continue; }
    if (!groups.has(oc)) groups.set(oc, []);
    groups.get(oc).push(it.id);
  }
  const wouldClassify = [...groups.values()].reduce((n, ids) => n + ids.length, 0);

  summary.counts = {
    null_candidates: items.length,
    no_source_id_stays_null: noSourceId,
    no_rule_stays_null: noRuleStaysNull,
    would_classify: wouldClassify,
    by_origin_class: Object.fromEntries([...groups.entries()].map(([k, ids]) => [k, ids.length])),
  };

  if (!apply) return summary;

  if (arg !== REQUIRED_ARG) {
    summary.note = `REFUSED — apply requires arg == '${REQUIRED_ARG}' (ruling R-E). Got: '${arg || "(none)"}'. No write attempted.`;
    summary.exitCode = 1;
    return summary;
  }

  let applied = 0;
  const writes = [];
  for (const [oc, ids] of groups) {
    const res = await deps.guardedUpdateByIds(
      "intelligence_items",
      ids,
      { origin_class: oc },
      { cite: CITE, applyMatch: (q) => q.is("origin_class", null) },
    );
    applied += res.updated;
    writes.push({ origin_class: oc, attempted: ids.length, updated: res.updated });
  }
  summary.applied = applied;
  summary.counts.writes = writes;

  const after = await deps.readAll("intelligence_items", "id, origin_class", { match: (q) => q.not("origin_class", "is", null) });
  const byClassAfter = {};
  for (const r of after) byClassAfter[r.origin_class] = (byClassAfter[r.origin_class] ?? 0) + 1;
  summary.read_back = { origin_class_not_null_total: after.length, by_origin_class: byClassAfter };

  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "origin-class-backfill",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, readClient, guardedUpdateByIds } = await import("../lib/db.mjs");
      const { fetchRowsIn } = await import("../mint/export-census-rows.mjs");
      return { readAll, readClient, guardedUpdateByIds, fetchRowsIn };
    },
  });
}
