#!/usr/bin/env node
// grid-queue-producer.mjs — spec 09 §1.6, grid_connection_queues (migration 297). $0 SOURCING STATUS:
// GAP — see scripts/spec09/SOURCES.md. No $0 structured feed was confirmed for DSO/TSO demand-connection
// queue MONTHS by capacity band; UK National Grid ESO's TEC register and ENA's DFES describe GENERATION
// connection queues, a different dataset, and conflating them would be fabrication (rule 2).
//
// ROWS-FILE EXTENSION (lane SPEC09-A, 2026-09-05, plan §W5.1). This sandbox's egress proxy 403s every
// non-allowlisted host (confirmed 2026-09-05: ofgem.gov.uk-class hosts unreachable, "CONNECT tunnel
// failed, response 403"), so this producer cannot itself fetch a live feed this session. Same posture as
// scripts/spec09/reroute-producer.mjs's rows-file extension (see that file's header for the full
// reasoning): a `--rows-file` (JSON) of CALLER-ASSERTED, fully-cited DSO connection-queue observations,
// validated + written through scripts/spec09/lib/rows-file.mjs's shared citation/source-rating plumbing.
// `grid_connection_queues.jurisdiction_id` is a NOT NULL FK to `entities(kind='jurisdiction')` (migration
// 297) — this producer resolves it by exact canonical_name match against the LIVE spine (63 jurisdiction
// rows exist today, including 'GB' [CONFIRMED, live SQL, 2026-09-05]) and never mints one (entities/
// entity_kind territory, out of this lane's write set). `grid_connection_queues` has no `source_id`
// column (migration 297's header carries the same no-entity-kind-fits-a-source-row reasoning as 296), so
// each row's citation is carried in its own guarded-write `cite` (one guardedInsertMany call per row).
//
// BROWSER-LANE WORKLIST (named here, not chased in this sandbox): Ofgem's "Connections Reform" programme
// (ofgem.gov.uk) requires every GB DNO to publish a standardised Connections Register; ENA's Open Data
// Portal (data.ena.energynetworks.org / connecteddata.nationalgrid.co.uk for the ESO side) is the
// candidate aggregation point. [HYPOTHESIS, unverified this session — training-knowledge lead, not a
// live-fetched confirmation] whether that register's DEMAND-side rows (as opposed to the TEC/DFES
// GENERATION-side ones SOURCES.md already ruled out) carry queue MONTHS by capacity band at the
// granularity this table wants. A browser lane should open the Ofgem/ENA URLs above, confirm (or refute)
// that a demand-connection-queue-months table exists in a structured (CSV/table), not prose, format, and
// either produce a real --rows-file from it or record the refutation in SOURCES.md.
//
// DRY BY DEFAULT. deps-injected so this runs with zero DB access under `node --test`.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";
import { loadRowsFile, requireCitation, registerCitedSource, resolveEntityByName, RowsFileError } from "./lib/rows-file.mjs";

export const CITE = Object.freeze({
  skill: "spec09-grid-queue-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03): grid_connection_queues producer, spec 09 §1.6. Ships 0 rows — no " +
    "confirmed $0 feed for demand-side DSO connection-queue months; see scripts/spec09/SOURCES.md.",
});

const OBS_STATUS_VALUES = new Set(["A","P","E","I","F","B","D","U","V","G","M","O","L","H","Q","N"]);

/**
 * Validate + resolve ONE rows-file row into a grid_connection_queues insert row + its own cite. Throws
 * RowsFileError for a structural problem; returns { refused: true, reason } for a business-level refusal
 * (jurisdiction not in spine, ambiguous citation host, p90 < p50) rather than aborting the whole run.
 */
export async function parseGridQueueRow(row, index, jurisdictions, deps = {}) {
  const where = "grid-queue-producer";
  const citation = requireCitation(row, index, where);
  for (const f of ["jurisdiction_name", "dso_name", "capacity_band_mw", "as_of"]) {
    if (row[f] === undefined || row[f] === null || row[f] === "") {
      throw new RowsFileError(`${where}: row[${index}] missing required field "${f}".`);
    }
  }
  if (row.queue_months_p50 == null && row.queue_months_p90 == null) {
    throw new RowsFileError(`${where}: row[${index}] must carry at least one of queue_months_p50/queue_months_p90.`);
  }
  if (row.queue_months_p50 != null && Number(row.queue_months_p50) < 0) {
    throw new RowsFileError(`${where}: row[${index}].queue_months_p50 must be >= 0.`);
  }
  if (row.queue_months_p90 != null && Number(row.queue_months_p90) < 0) {
    throw new RowsFileError(`${where}: row[${index}].queue_months_p90 must be >= 0.`);
  }
  if (row.queue_months_p50 != null && row.queue_months_p90 != null && Number(row.queue_months_p90) < Number(row.queue_months_p50)) {
    return {
      refused: true,
      reason: `row[${index}]: queue_months_p90 (${row.queue_months_p90}) < queue_months_p50 (${row.queue_months_p50}) — a queue cannot read faster at the worse-case percentile.`,
    };
  }
  const obsStatus = row.obs_status ?? "A";
  if (!OBS_STATUS_VALUES.has(obsStatus)) {
    throw new RowsFileError(`${where}: row[${index}].obs_status "${obsStatus}" is not a valid SDMX CL_OBS_STATUS code.`);
  }

  const jurisdictionId = resolveEntityByName(jurisdictions, row.jurisdiction_name);
  if (!jurisdictionId) {
    return {
      refused: true,
      reason:
        `row[${index}]: jurisdiction "${row.jurisdiction_name}" not found in the live entities(kind='jurisdiction') ` +
        "spine — minting one is out of this producer's write set (entities/entity_kind territory).",
    };
  }

  const sourceReg = await registerCitedSource(citation, deps);
  if (sourceReg.refused) {
    return { refused: true, reason: `row[${index}]: citation refused — ${sourceReg.reason}` };
  }

  return {
    refused: false,
    dbRow: {
      jurisdiction_id: jurisdictionId,
      dso_name: String(row.dso_name),
      capacity_band_mw: String(row.capacity_band_mw),
      queue_months_p50: row.queue_months_p50 ?? null,
      queue_months_p90: row.queue_months_p90 ?? null,
      as_of: row.as_of,
      obs_status: obsStatus,
    },
    cite: {
      skill: CITE.skill,
      reason:
        `${CITE.reason} Row-file-sourced grid connection queue observation: ${citation.title} (${citation.url}, ` +
        `retrieved ${citation.retrieved_at}, tier ${sourceReg.tier}). Quote: "${citation.quote}"`,
    },
  };
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts `arg` is the --rows-file path.
 * @param {{ readAll?: Function, guardedInsertMany?: Function, registerSource?: Function }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps = {}) {
  const apply = mode === "apply";
  const summary = {
    step: "spec09-grid-queue",
    mode,
    counts: { to_insert: 0, written: 0, refused: 0 },
    applied: 0,
    read_back: {},
    gap: "no confirmed $0 feed for demand-side DSO connection-queue months — see scripts/spec09/SOURCES.md",
    refusals: [],
    exitCode: 0,
  };

  if (!arg) {
    if (apply && deps.guardedInsertMany) {
      await deps.guardedInsertMany("grid_connection_queues", [], { cite: CITE });
      summary.applied = 0;
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

  const jurisdictions = deps.readAll
    ? await deps.readAll("entities", "entity_id,canonical_name", {
        match: (q) => q.eq("kind", "jurisdiction"),
        orderBy: "entity_id",
      })
    : [];

  const parsed = [];
  for (const [i, row] of rows.entries()) {
    let result;
    try {
      result = await parseGridQueueRow(row, i, jurisdictions, deps);
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
      await deps.guardedInsertMany("grid_connection_queues", [p.dbRow], { cite: p.cite });
      summary.applied += 1;
      summary.counts.written += 1;
    }
  } else {
    summary.counts.written = parsed.length;
  }

  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "spec09-grid-queue",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedInsertMany, registerSource } = await import("../lib/db.mjs");
      return { readAll, guardedInsertMany, registerSource };
    },
  });
}
