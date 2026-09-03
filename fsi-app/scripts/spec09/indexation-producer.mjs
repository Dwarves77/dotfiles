#!/usr/bin/env node
// indexation-producer.mjs — spec 09 §1.3, indexation_clauses (migration 296). $0 SOURCING STATUS: GAP by
// design — see scripts/spec09/SOURCES.md. This table stores CONTRACT-SPECIFIC terms frozen at a real
// signature; there is no bulk public source for another company's contract, by the nature of the data.
//
// DRY BY DEFAULT. deps-injected so this runs with zero DB access under `node --test`.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";
// Spec 09 §1.3, verbatim: "The generator emits a clause with an explicit index, base, cap, floor, review
// cadence and a WORKED EXAMPLE." computeIndexedValue() is the mechanics; this producer's own worked
// example (WORKED_EXAMPLE below, a documented illustrative clause — never a real customer contract, this
// table's own input) is emitted into every run's summary so the spec's own requirement is met even while
// the table itself ships 0 rows (no customer contract-entry flow exists yet — see SOURCES.md).
import { computeIndexedValue } from "../../src/lib/spec09/indexation.mjs";

export const CITE = Object.freeze({
  skill: "spec09-indexation-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03): indexation_clauses producer, spec 09 §1.3. Ships 0 rows — clause " +
    "terms are customer-contract-specific, not a public bulk dataset by construction; see scripts/spec09/SOURCES.md.",
});

// A documented illustrative clause (EUA front-Dec, base 80 at signature, current 92, 70% passthrough,
// floor -10%/cap +20%) — spec text's own kind of worked example, not a real customer contract.
export const WORKED_EXAMPLE = Object.freeze({
  indexLabel: "EUA front-Dec",
  baseValue: 80,
  indexBaseline: 80,
  indexCurrent: 92,
  passthroughPct: 70,
  floorPct: -10,
  capPct: 20,
});

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ guardedInsertMany?: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const apply = mode === "apply";
  const summary = {
    step: "spec09-indexation",
    mode,
    counts: { to_insert: 0 },
    applied: 0,
    read_back: {},
    gap: "contract-specific terms have no public bulk source by design — see scripts/spec09/SOURCES.md",
    worked_example: { ...WORKED_EXAMPLE, result: computeIndexedValue(WORKED_EXAMPLE) },
    exitCode: 0,
  };
  if (apply && deps.guardedInsertMany) {
    await deps.guardedInsertMany("indexation_clauses", [], { cite: CITE });
    summary.applied = 0;
  }
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "spec09-indexation",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { guardedInsertMany } = await import("../lib/db.mjs");
      return { guardedInsertMany };
    },
  });
}
