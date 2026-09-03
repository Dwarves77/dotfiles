#!/usr/bin/env node
// seed-corridors.mjs — MAINT step wrapping scripts/entities/seed-corridors.mjs (Lane CORR, Wave 2).
// Coordinator-only apply: corridor identity rows on the entity spine (ADR-024 §4: UN/LOCODE pair + mode)
// come from what the corpus names; when nothing does (true today) the script falls back to ADR-024's own
// worked example and says so (`usingFallback`). Dry lists candidates; apply inserts through the guarded
// path (existing entities skipped) and reads back the corridor-kind count.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main as seedMain } from "../entities/seed-corridors.mjs";
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
  if (!apply) return summary;
  summary.applied = res.created ?? 0;
  // PK is entity_id (readAll's default orderBy="id" fails on this table; same as the seed script).
  const after = await deps.readAll("entities", "entity_id", { match: (q) => q.eq("kind", "corridor"), orderBy: "entity_id" });
  summary.read_back = { corridor_entities_total: after.length, entity_ids: after.map((r) => r.entity_id) };
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
