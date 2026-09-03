#!/usr/bin/env node
// oem-roadmap-producer.mjs — spec 09 §1.1, oem_tech_roadmaps (migration 296). $0 SOURCING STATUS: GAP —
// see scripts/spec09/SOURCES.md. OEM commercial-stage announcements live on manufacturer press pages, not
// a structured bulk feed; parsing free text without an LLM ($0/no-LLM rule) is not viable at useful
// accuracy, and no licence-clear aggregator API was confirmed at $0 this session.
//
// DRY BY DEFAULT. deps-injected so this runs with zero DB access under `node --test`.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "spec09-oem-roadmap-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03): oem_tech_roadmaps producer, spec 09 §1.1. Ships 0 rows — no $0 " +
    "structured feed for OEM commercial-stage announcements confirmed this session; see scripts/spec09/SOURCES.md.",
});

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ guardedInsertMany?: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const apply = mode === "apply";
  const summary = {
    step: "spec09-oem-roadmap",
    mode,
    counts: { to_insert: 0 },
    applied: 0,
    read_back: {},
    gap: "no $0 structured feed for OEM commercial-stage announcements — see scripts/spec09/SOURCES.md",
    exitCode: 0,
  };
  if (apply && deps.guardedInsertMany) {
    await deps.guardedInsertMany("oem_tech_roadmaps", [], { cite: CITE });
    summary.applied = 0;
  }
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "spec09-oem-roadmap",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { guardedInsertMany } = await import("../lib/db.mjs");
      return { guardedInsertMany };
    },
  });
}
