#!/usr/bin/env node
// backfill-source-type.mjs — classify every active source's `source_type` (migration 288) and, with
// --apply, write it through the guarded path. Dry by default (Lane HYG-2, finish plan 2026-09-02).
//
// WHY: migration 288 adds `sources.source_type TEXT[]`, NULLable, no default. This is the one-shot
// backfill named in docs/plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md §4.2, using classifySourceType()
// (src/lib/sources/source-type-taxonomy.mjs) — the STOPGAP's own environmental_body/legislature
// regexes, ported verbatim so coverage-gaps.ts's read-path fallback and this backfill agree by
// construction (same function, two call sites).
//
// NEVER overwrites a row that already carries a non-null source_type — idempotent by construction, and
// it leaves any prior manual/admin classification untouched. A row the classifier cannot place (returns
// []) is reported as unclassifiable and left NULL for a manual/admin pass or a future classifier
// extension; this script never guesses.
//
// USAGE:
//   node scripts/sources/backfill-source-type.mjs            # dry: distribution + unclassifiable count
//   node scripts/sources/backfill-source-type.mjs --apply    # write source_type through guardedUpdateByIds
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifySourceType, SOURCE_TYPE_VALUES } from "../../src/lib/sources/source-type-taxonomy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

export const CITE = Object.freeze({
  skill: "source-type-taxonomy",
  reason:
    "One-shot backfill of sources.source_type (migration 288) from name/url via classifySourceType() " +
    "(docs/plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md §4.2). Never overwrites an already-classified row.",
});

/**
 * Pure: classify every row, split into to-write (grouped by identical resulting type array) /
 * already-classified / unclassifiable, and tally the distribution across every registered
 * SOURCE_TYPE_VALUES token (already-classified rows count toward the distribution too, so the report
 * reflects the true post-backfill picture, not just this run's writes).
 * @param {Array<{id:string, name:string|null, url:string|null, source_type:string[]|null}>} rows
 */
export function planBackfill(rows) {
  const distribution = Object.fromEntries(SOURCE_TYPE_VALUES.map((v) => [v, 0]));
  const alreadyClassified = [];
  const unclassifiable = [];
  // group ids by the exact resulting type array so one guarded write covers every row that shares it
  const groups = new Map(); // key: JSON of sorted types -> { types, ids }

  for (const row of rows ?? []) {
    if (Array.isArray(row.source_type) && row.source_type.length > 0) {
      alreadyClassified.push(row);
      for (const t of row.source_type) if (t in distribution) distribution[t] += 1;
      continue;
    }
    const types = classifySourceType({ name: row.name, url: row.url });
    if (types.length === 0) {
      unclassifiable.push(row);
      continue;
    }
    for (const t of types) distribution[t] += 1;
    const key = JSON.stringify([...types].sort());
    const g = groups.get(key) ?? { types, ids: [] };
    g.ids.push(row.id);
    groups.set(key, g);
  }

  const writeGroups = [...groups.values()];
  const toWriteCount = writeGroups.reduce((n, g) => n + g.ids.length, 0);
  return { distribution, writeGroups, toWriteCount, alreadyClassified, unclassifiable };
}

/**
 * @param {{ apply?: boolean }} opts
 * @param {{ readAll: Function, guardedUpdateByIds: Function }} deps
 */
export async function main({ apply = false } = {}, deps) {
  const { readAll, guardedUpdateByIds } = deps;
  console.log(`[backfill-source-type] mode = ${apply ? "APPLY" : "DRY-RUN"}`);

  const rows = await readAll("sources", "id, name, url, source_type", { match: (q) => q.eq("status", "active") });
  const { distribution, writeGroups, toWriteCount, alreadyClassified, unclassifiable } = planBackfill(rows);

  console.log(
    `[backfill-source-type] active sources: ${rows.length} — already classified ${alreadyClassified.length}, ` +
      `to write ${toWriteCount} (${writeGroups.length} distinct type-combination(s)), unclassifiable ${unclassifiable.length}`,
  );
  console.log(`[backfill-source-type] distribution (post-backfill, includes already-classified): ${JSON.stringify(distribution)}`);
  for (const u of unclassifiable.slice(0, 20)) {
    console.log(`   UNCLASSIFIABLE ${u.id} ${String(u.name ?? "").slice(0, 70)} ${u.url ?? ""}`);
  }
  if (unclassifiable.length > 20) console.log(`   ... and ${unclassifiable.length - 20} more unclassifiable row(s)`);

  const summary = {
    mode: apply ? "apply" : "dry-run",
    active: rows.length,
    already_classified: alreadyClassified.length,
    to_write: toWriteCount,
    unclassifiable: unclassifiable.length,
    distribution,
    written: 0,
  };
  if (!apply || !toWriteCount) return summary;

  let written = 0;
  for (const g of writeGroups) {
    // applyMatch re-checks source_type IS NULL at write time so a row classified by another process
    // between the read and this write (or already backfilled) is left alone — idempotent under
    // concurrent change, matching guardedUpdateByIds' own contract.
    const res = await guardedUpdateByIds(
      "sources",
      g.ids,
      { source_type: g.types },
      { cite: CITE, select: "id", applyMatch: (q) => q.is("source_type", null) },
    );
    written += res.updated ?? 0;
  }
  console.log(`[backfill-source-type] wrote source_type on ${written} of ${toWriteCount} planned row(s)`);
  return { ...summary, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[backfill-source-type] no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { readAll, guardedUpdateByIds } = await import("../lib/db.mjs");
  main({ apply: process.argv.includes("--apply") }, { readAll, guardedUpdateByIds }).catch((e) => {
    console.error("[backfill-source-type] fatal:", e);
    process.exit(1);
  });
}
