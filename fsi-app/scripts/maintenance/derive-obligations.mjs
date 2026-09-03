#!/usr/bin/env node
// derive-obligations.mjs — MAINT step wrapping scripts/obligations/derive-obligations.mjs (Lane OBLIG,
// Wave 2). Coordinator-only apply: migration 290's `obligations` table is populated from
// `item_forward_events` by this runtime, never by hand. Dry lists the derivation and the binding-position
// breakdown; apply inserts through the guarded path (idempotent on forward_event_id) and reads back the
// register count. Not ruling-gated: the register is spec-01's core build and the derivation is
// deterministic (classify-binding-position.mjs), unmapped → NULL, never invented.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main as deriveMain } from "../obligations/derive-obligations.mjs";
import { runCli } from "./lib/cli.mjs";

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ readAll: Function, guardedInsertMany: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "derive-obligations", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };
  const res = await deriveMain({ apply }, deps);
  summary.counts = {
    forward_events: res.forward_events,
    derived: res.derived,
    skipped_no_item: res.skipped_no_item,
    already_registered: res.already_registered,
    to_insert: res.to_insert,
    binding_position_breakdown: res.binding_position_breakdown,
  };
  if (!apply) return summary;
  summary.applied = res.inserted ?? 0;
  const after = await deps.readAll("obligations", "id, binding_position, status");
  const byPos = {};
  for (const r of after) byPos[r.binding_position ?? "null"] = (byPos[r.binding_position ?? "null"] ?? 0) + 1;
  summary.read_back = { obligations_total: after.length, active: after.filter((r) => r.status === "active").length, by_binding_position: byPos };
  if (summary.applied !== res.to_insert) {
    summary.note = `MISMATCH — planned ${res.to_insert}, inserted ${summary.applied}`;
    summary.exitCode = 1;
  }
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "derive-obligations",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedInsertMany } = await import("../lib/db.mjs");
      return { readAll, guardedInsertMany };
    },
  });
}
