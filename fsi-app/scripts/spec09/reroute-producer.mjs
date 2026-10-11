#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";
import { loadRowsFile, requireCitation, registerCitedSource, resolveEntityByName, RowsFileError } from "./lib/rows-file.mjs";

export const CITE = Object.freeze({
  skill: "spec09-reroute-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03): reroute_events producer, spec 09 §1.7. Ships 0 rows — fewer than " +
    "two entities.kind='corridor' rows exist in the spine to pair as baseline+reroute; see scripts/spec09/SOURCES.md.",
});

/**
 * Pure decision over a list of live corridor entity rows. `corridors` is [{ entity_id, canonical_name }].
 * Returns { ready: boolean, count, gap } — `ready` is never true from this function alone (see header:
 * even with >=2 corridors on file, this producer does not itself judge WHICH pair is a real reroute
 * event, or supply cause/fuel_burn_multiplier — that is a sourced, dated public-fact judgement, supplied
 * by a rows-file, see buildReadyRow below), but the count and the specific gap reported differ so a
 * future run's summary is accurate as the spine grows.
 */
export function evaluateCorridorReadiness(corridors) {
  const list = Array.isArray(corridors) ? corridors : [];
  if (list.length < 2) {
    return {
      ready: false,
      count: list.length,
      gap:
        `only ${list.length} corridor entit${list.length === 1 ? "y" : "ies"} in the spine — a reroute event ` +
        "needs a DISTINCT baseline + reroute corridor pair (2 minimum). Minting a second corridor entity is " +
        "entities/entity_kind territory, out of this lane's write set. See scripts/spec09/SOURCES.md.",
    };
  }
  return {
    ready: false, // see function header: count alone is never sufficient
    count: list.length,
    gap:
      `${list.length} corridor entities exist but no producer-confirmed reroute pairing (cause + ` +
      "fuel_burn_multiplier, sourced and dated) is built this run — see scripts/spec09/SOURCES.md.",
  };
}

/**
 * Validate + resolve ONE rows-file row into a reroute_events insert row + its own cite. PURE except for
 * the caller-supplied `corridors` lookup list (already a plain array, no DB call happens here). Throws
 * RowsFileError for a structural problem (missing field, bad shape); returns { refused: true, reason }
 * for a business-level refusal (corridor not in spine, ambiguous citation host) so a caller can report it
 * by name and continue with the remaining rows rather than aborting the whole run.
 * @param {object} row one rows-file entry
 * @param {number} index
 * @param {Array<{entity_id:string, canonical_name:string}>} corridors live corridor entities
 * @param {{ registerSource?: Function }} deps
 */
export async function parseRerouteRow(row, index, corridors, deps = {}) {
  const where = "reroute-producer";
  const citation = requireCitation(row, index, where);
  for (const f of ["baseline_corridor_name", "reroute_corridor_name", "cause", "fuel_burn_multiplier", "effective_from"]) {
    if (row[f] === undefined || row[f] === null || row[f] === "") {
      throw new RowsFileError(`${where}: row[${index}] missing required field "${f}".`);
    }
  }
  if (!(Number(row.fuel_burn_multiplier) > 0)) {
    throw new RowsFileError(`${where}: row[${index}].fuel_burn_multiplier must be > 0 (got ${row.fuel_burn_multiplier}).`);
  }
  if (row.effective_to && row.effective_to < row.effective_from) {
    throw new RowsFileError(`${where}: row[${index}].effective_to (${row.effective_to}) is before effective_from (${row.effective_from}).`);
  }

  const baselineId = resolveEntityByName(corridors, row.baseline_corridor_name);
  const rerouteId = resolveEntityByName(corridors, row.reroute_corridor_name);
  if (!baselineId || !rerouteId) {
    return {
      refused: true,
      reason:
        `row[${index}]: corridor(s) not found in the live entity spine (baseline "${row.baseline_corridor_name}" ` +
        `${baselineId ? "found" : "MISSING"}, reroute "${row.reroute_corridor_name}" ${rerouteId ? "found" : "MISSING"}) ` +
        "— minting a corridor entity is out of this producer's write set (entities/entity_kind territory).",
    };
  }
  if (baselineId === rerouteId) {
    return { refused: true, reason: `row[${index}]: baseline and reroute resolved to the SAME corridor entity (${baselineId}) — not a reroute.` };
  }

  const sourceReg = await registerCitedSource(citation, deps);
  if (sourceReg.refused) {
    return { refused: true, reason: `row[${index}]: citation refused — ${sourceReg.reason}` };
  }

  return {
    refused: false,
    dbRow: {
      baseline_corridor_id: baselineId,
      reroute_corridor_id: rerouteId,
      cause: String(row.cause),
      distance_delta_nm: row.distance_delta_nm ?? null,
      transit_delta_days: row.transit_delta_days ?? null,
      fuel_burn_multiplier: Number(row.fuel_burn_multiplier),
      effective_from: row.effective_from,
      effective_to: row.effective_to ?? null,
    },
    cite: {
      skill: CITE.skill,
      reason:
        `${CITE.reason} Row-file-sourced reroute event: ${citation.title} (${citation.url}, retrieved ` +
        `${citation.retrieved_at}, tier ${sourceReg.tier}). Quote: "${citation.quote}"`,
    },
  };
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts `arg` doubles as the --rows-file path (matches this
 *   repo's runCli convention: `--arg <path>` for a maintenance step that needs one extra input).
 * @param {{ readAll?: Function, guardedInsertMany?: Function, registerSource?: Function }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps = {}) {
  const apply = mode === "apply";
  const corridors = deps.readAll
    ? await deps.readAll("entities", "entity_id,canonical_name", {
        match: (q) => q.eq("kind", "corridor"),
        orderBy: "entity_id",
      })
    : [];
  const readiness = evaluateCorridorReadiness(corridors);
  const summary = {
    step: "spec09-reroute",
    mode,
    counts: { corridor_entities_found: readiness.count, to_insert: 0, written: 0, refused: 0 },
    applied: 0,
    read_back: {},
    gap: readiness.gap,
    refusals: [],
    exitCode: 0,
  };

  if (!arg) {
    // No --rows-file given: unchanged legacy behaviour (report the corridor-count gap; apply is a no-op
    // guardedInsertMany([]) so the guarded-write path is still exercised end to end).
    if (apply && deps.guardedInsertMany) {
      await deps.guardedInsertMany("reroute_events", [], { cite: CITE });
    }
    return summary;
  }

  let rows;
  try {
    rows = loadRowsFile(arg);
  } catch (e) {
    summary.gap = `--rows-file error: ${e.message}`;
    summary.exitCode = 3;
    return summary;
  }
  summary.counts.to_insert = rows.length;

  const parsed = [];
  for (const [i, row] of rows.entries()) {
    let result;
    try {
      result = await parseRerouteRow(row, i, corridors, deps);
    } catch (e) {
      result = { refused: true, reason: e.message };
    }
    if (result.refused) {
      summary.counts.refused += 1;
      summary.refusals.push(result.reason);
    } else {
      parsed.push(result);
    }
  }

  if (apply && deps.guardedInsertMany) {
    for (const p of parsed) {
      await deps.guardedInsertMany("reroute_events", [p.dbRow], { cite: p.cite });
      summary.applied += 1;
      summary.counts.written += 1;
    }
  } else {
    summary.counts.written = parsed.length; // dry: "would write"
  }

  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "spec09-reroute",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedInsertMany, registerSource } = await import("../lib/db.mjs");
      return { readAll, guardedInsertMany, registerSource };
    },
  });
}
