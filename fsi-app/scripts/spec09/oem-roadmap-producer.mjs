#!/usr/bin/env node
// oem-roadmap-producer.mjs — spec 09 §1.1, oem_tech_roadmaps (migration 296). $0 SOURCING STATUS: GAP —
// see scripts/spec09/SOURCES.md. OEM commercial-stage announcements live on manufacturer press pages, not
// a structured bulk feed; parsing free text without an LLM ($0/no-LLM rule) is not viable at useful
// accuracy, and no licence-clear aggregator API was confirmed at $0 this session.
//
// ROWS-FILE EXTENSION (lane SPEC09-A, 2026-09-05, plan §W5.1). This sandbox's egress proxy 403s every
// non-allowlisted host this session (confirmed 2026-09-05), so this producer cannot itself fetch a live
// feed. Same posture as scripts/spec09/reroute-producer.mjs's rows-file extension (see that file's header
// for the full reasoning): a `--rows-file` (JSON) of CALLER-ASSERTED, fully-cited OEM roadmap rows,
// validated + written through scripts/spec09/lib/rows-file.mjs's shared citation/source-rating plumbing.
// `oem_tech_roadmaps.manufacturer_id` is a NOT NULL FK to `entities(kind='organisation')` (migration
// 296) — this producer resolves it by exact canonical_name match against the LIVE spine (1,293
// organisation rows exist today, INCLUDING 'volvotrucks.com' [CONFIRMED, live SQL, 2026-09-05]) and never
// mints one (entities/entity_kind territory, out of this lane's write set). UNLIKE reroute_events/
// grid_connection_queues, `oem_tech_roadmaps.source_id` IS a NOT NULL FK to `sources(id)` (migration
// 296's own header: "an OEM announcement with no citable source is not evidence of intent, it is
// unsourced") — so a row whose citation cannot be rated through the institution class table is refused
// outright, never inserted with a placeholder source.
//
// BROWSER-LANE WORKLIST (named here, not chased in this sandbox): CALSTART's Global Commercial Vehicle
// Drive to Zero programme publishes a Zero-Emission Technology Inventory (ZETI) —
// globaldrivetozero.org/tools/zeti-tool/ — a searchable table of medium/heavy-duty ZE vehicle models by
// manufacturer, powertrain, and commercial-availability status. [HYPOTHESIS, unverified this session —
// training-knowledge lead, not a live-fetched confirmation] whether ZETI exposes a bulk export (CSV/API)
// or only an interactive web table, and whether its availability-status vocabulary maps cleanly onto this
// table's `commercial_stage` enum (announced / pilot_demonstration / small_batch_fleet /
// mass_series_production). A browser lane should open the ZETI tool, confirm the real column shape, and
// either produce a real --rows-file from it (source host would presumably classify under
// classTierForHost's ANALYSIS or an association allowlist entry — a NEW entry may be needed; see
// src/lib/sources/host-authority.ts) or record the refutation in SOURCES.md. Individual OEM press
// releases (e.g. volvotrucks.com's own newsroom) are ALSO a valid per-row citation source for a
// manufacturer already in the spine — a corporate host classifies ambiguous under the current class table
// (ANALYSIS/LAWFIRM/NEWS none match a manufacturer's own site), so such a row is refused today unless the
// class table gains a rule for OEM first-party announcements (an operator-ruling question, not this
// producer's to decide).
//
// DRY BY DEFAULT. deps-injected so this runs with zero DB access under `node --test`.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";
import { loadRowsFile, requireCitation, registerCitedSource, resolveEntityByName, RowsFileError } from "./lib/rows-file.mjs";

export const CITE = Object.freeze({
  skill: "spec09-oem-roadmap-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03): oem_tech_roadmaps producer, spec 09 §1.1. Ships 0 rows — no $0 " +
    "structured feed for OEM commercial-stage announcements confirmed this session; see scripts/spec09/SOURCES.md.",
});

const TECH_CATEGORIES = new Set([
  "heavy_battery", "megawatt_charging", "hydrogen_fcell", "ammonia_engine",
  "methanol_dualfuel", "saf_refinery", "e_axle", "reefer_electrification",
]);
const COMMERCIAL_STAGES = new Set(["announced", "pilot_demonstration", "small_batch_fleet", "mass_series_production"]);
const DENSITY_BASES = new Set(["cell", "module", "pack"]);
const ORIGIN_CLASSES = new Set(["community", "community-corroborated", "modelled", "derived", "partner", "verified", "official"]);
const DERIVATIONS = new Set([
  "statutory_fixed", "statutory_formula", "observed", "transacted_index", "assessed", "calculated",
  "interpolated", "modelled", "estimated",
]);
const ADMIRALTY_RE = /^[A-F][1-6]$/;

/**
 * Validate + resolve ONE rows-file row into an oem_tech_roadmaps insert row + its own cite. Throws
 * RowsFileError for a structural problem (bad enum, missing field); returns { refused: true, reason } for
 * a business-level refusal (manufacturer not in spine, ambiguous/unratable citation host).
 */
export async function parseOemRoadmapRow(row, index, manufacturers, deps = {}) {
  const where = "oem-roadmap-producer";
  const citation = requireCitation(row, index, where);
  for (const f of ["manufacturer_name", "tech_category", "commercial_stage", "announced_at"]) {
    if (row[f] === undefined || row[f] === null || row[f] === "") {
      throw new RowsFileError(`${where}: row[${index}] missing required field "${f}".`);
    }
  }
  if (!TECH_CATEGORIES.has(row.tech_category)) {
    throw new RowsFileError(`${where}: row[${index}].tech_category "${row.tech_category}" is not one of ${[...TECH_CATEGORIES].join(", ")}.`);
  }
  if (!COMMERCIAL_STAGES.has(row.commercial_stage)) {
    throw new RowsFileError(`${where}: row[${index}].commercial_stage "${row.commercial_stage}" is not one of ${[...COMMERCIAL_STAGES].join(", ")}.`);
  }
  if (row.density_basis != null && !DENSITY_BASES.has(row.density_basis)) {
    throw new RowsFileError(`${where}: row[${index}].density_basis "${row.density_basis}" is not one of ${[...DENSITY_BASES].join(", ")}.`);
  }
  if (row.energy_density_wh_kg != null && row.density_basis == null) {
    return {
      refused: true,
      reason: `row[${index}]: energy_density_wh_kg is set with no density_basis — spec 09 §5 open decision 3 requires a stated basis, never mixed silently.`,
    };
  }
  const originClass = row.origin_class ?? "community";
  if (!ORIGIN_CLASSES.has(originClass)) {
    throw new RowsFileError(`${where}: row[${index}].origin_class "${originClass}" is not one of ${[...ORIGIN_CLASSES].join(", ")}.`);
  }
  const derivation = row.derivation ?? "observed";
  if (!DERIVATIONS.has(derivation)) {
    throw new RowsFileError(`${where}: row[${index}].derivation "${derivation}" is not one of ${[...DERIVATIONS].join(", ")}.`);
  }
  if (row.confidence_admiralty != null && !ADMIRALTY_RE.test(row.confidence_admiralty)) {
    throw new RowsFileError(`${where}: row[${index}].confidence_admiralty "${row.confidence_admiralty}" must match ^[A-F][1-6]$.`);
  }

  const manufacturerId = resolveEntityByName(manufacturers, row.manufacturer_name);
  if (!manufacturerId) {
    return {
      refused: true,
      reason:
        `row[${index}]: manufacturer "${row.manufacturer_name}" not found in the live entities(kind='organisation') ` +
        "spine — minting one is out of this producer's write set (entities/entity_kind territory).",
    };
  }

  const sourceReg = await registerCitedSource(citation, deps);
  if (sourceReg.refused) {
    return {
      refused: true,
      reason:
        `row[${index}]: source_id is NOT NULL on oem_tech_roadmaps (migration 296: "an OEM announcement with ` +
        `no citable source is not evidence of intent") — citation refused: ${sourceReg.reason}`,
    };
  }

  return {
    refused: false,
    dbRow: {
      manufacturer_id: manufacturerId,
      tech_category: row.tech_category,
      commercial_stage: row.commercial_stage,
      target_year: row.target_year ?? null,
      energy_density_wh_kg: row.energy_density_wh_kg ?? null,
      density_basis: row.density_basis ?? null,
      c_rate_max: row.c_rate_max ?? null,
      usable_kwh: row.usable_kwh ?? null,
      announced_at: row.announced_at,
      source_id: sourceReg.source_id,
      origin_class: originClass,
      derivation,
      confidence_admiralty: row.confidence_admiralty ?? null,
    },
    cite: {
      skill: CITE.skill,
      reason:
        `${CITE.reason} Row-file-sourced OEM roadmap announcement: ${citation.title} (${citation.url}, ` +
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
    step: "spec09-oem-roadmap",
    mode,
    counts: { to_insert: 0, written: 0, refused: 0 },
    applied: 0,
    read_back: {},
    gap: "no $0 structured feed for OEM commercial-stage announcements — see scripts/spec09/SOURCES.md",
    refusals: [],
    exitCode: 0,
  };

  if (!arg) {
    if (apply && deps.guardedInsertMany) {
      await deps.guardedInsertMany("oem_tech_roadmaps", [], { cite: CITE });
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

  const manufacturers = deps.readAll
    ? await deps.readAll("entities", "entity_id,canonical_name", {
        match: (q) => q.eq("kind", "organisation"),
        orderBy: "entity_id",
      })
    : [];

  const parsed = [];
  for (const [i, row] of rows.entries()) {
    let result;
    try {
      result = await parseOemRoadmapRow(row, i, manufacturers, deps);
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
      await deps.guardedInsertMany("oem_tech_roadmaps", [p.dbRow], { cite: p.cite });
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
    step: "spec09-oem-roadmap",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedInsertMany, registerSource } = await import("../lib/db.mjs");
      return { readAll, guardedInsertMany, registerSource };
    },
  });
}
