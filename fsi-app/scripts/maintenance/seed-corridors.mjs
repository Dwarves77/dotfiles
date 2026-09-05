#!/usr/bin/env node
// seed-corridors.mjs — MAINT step wrapping scripts/entities/seed-corridors.mjs (Lane CORR, Wave 2) AND,
// since 2026-09-05 (Lane CORRIDORS-STATUTORY, W4.2 task 3), scripts/entities/write-entity-scope.mjs in the
// SAME run. Coordinator-only apply: corridor identity rows on the entity spine (ADR-024 §4: UN/LOCODE pair
// + mode) come from what the corpus names; when nothing does (true today) the script falls back to
// ADR-024's own worked example plus the named WCI corridors this lane added and says so (`usingFallback`).
// Dry lists candidates; apply inserts through the guarded path (existing entities skipped) and reads back
// the corridor-kind count.
//
// WHY entity_scope IS WRITTEN HERE, NOT A SEPARATE MAINTENANCE STEP: the brief for this build
// ("entity_scope writer... wired where the spec says scope is set — mint chokepoint or the producers")
// names the producer as a legitimate wiring point, and this step already runs after every corridor mint —
// scoping every LIVE corridor entity (not only ones minted in this run) each time the step fires, so
// scoping self-heals if it is ever skipped for one run. write-entity-scope.mjs is the ONE writer (its own
// module, its own test) — this wrapper only calls it, it does not re-implement any of its logic.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main as seedMain } from "../entities/seed-corridors.mjs";
import { main as scopeMain } from "../entities/write-entity-scope.mjs";
import { runCli } from "./lib/cli.mjs";

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ readAll: Function, guardedInsertMany: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "seed-corridors", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };
  const res = await seedMain({ apply }, deps);
  summary.counts = {
    using_fallback: res.usingFallback,
    candidates: res.candidateCount,
    would_create: res.created,
    existing: res.existing,
    skipped: res.skipped,
    planned: res.planned,
  };
  // entity_scope: scope every LIVE corridor entity (this run's new ones plus any pre-existing) to its
  // origin/destination jurisdiction, in the SAME step (see file header).
  const scopeRes = await scopeMain({ mode }, deps);
  summary.counts.entity_scope = {
    corridors_read: scopeRes.corridorsRead,
    parse_skipped: scopeRes.parseSkipped,
    jurisdiction_entities_created: scopeRes.jurisdictionEntitiesCreated,
    scope_rows_planned: scopeRes.scopeRowsPlanned,
    scope_rows_written: scopeRes.scopeRowsWritten,
    scope_already_existing: scopeRes.scopeAlreadyExisting,
  };
  if (!apply) return summary;
  summary.applied = res.created ?? 0;
  // PK is entity_id (readAll's default orderBy="id" fails on this table; same as the seed script).
  const after = await deps.readAll("entities", "entity_id", { match: (q) => q.eq("kind", "corridor"), orderBy: "entity_id" });
  summary.read_back = {
    corridor_entities_total: after.length,
    entity_ids: after.map((r) => r.entity_id),
    entity_scope_rows_written: scopeRes.scopeRowsWritten,
  };
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "seed-corridors",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedInsertMany } = await import("../lib/db.mjs");
      return { readAll, guardedInsertMany };
    },
  });
}
