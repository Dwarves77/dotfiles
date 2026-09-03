#!/usr/bin/env node
// ratify-series-items.mjs — the ratification half of ruling R-D (2026-09-03): once the mint family's
// harness has actually minted a `market_signal` record for a Weekly Oil Bulletin series
// (`build-oil-bulletin-rows.mjs` -> `run-mint-batch.mjs --census-rows --grade record --execute` ->
// `apply-mint-batch.mjs --apply`, MINT-RUNBOOK.md §11), the coordinator must map series_key -> minted
// item id so `refresh-published-price-statistics.mjs --apply` starts upserting that series' display row
// (`isRatified`/`deriveDisplayRows`, src/lib/market/refresh-published-price-statistics.mjs). This script
// is that mapping step, reading a mint-run artifact's own `per_item` outcomes — never a second, separate
// judgment of what minted.
//
// THE REAL RATIFICATION TARGET IS A .mjs MODULE, NOT JSON. series-item-map.mjs's own header names why:
// PR #533's production incident (`readFileSync` at module evaluation from an src/lib file every page's
// import graph pulls in -> ENOENT -> every route 500) is the reason the ratified map is a bundled DATA
// MODULE (`src/lib/market/series-item-map.mjs`, exporting `SERIES_ITEM_MAP_RAW`) rather than a JSON file
// read from disk at runtime. Writing a `scripts/producers/market/series-item-map.json` (as this lane's
// own dispatch brief names) would update a file NOTHING reads — `deriveDisplayRows()` only ever sees
// `src/lib/market/series-item-map.mjs`. This script writes THAT file (never hand-edited — see this
// lane's own report for the write-set correction).
//
// PER-SERIES OUTCOME. For every SERIES_ITEM_MAP_RAW entry that carries a `proposed_item` (the six
// oil-bulletin series), look up the mint-run artifact's `per_item` array for an entry whose `id` equals
// the series_key — `build-oil-bulletin-rows.mjs`'s own choice (`instrument_identifier: seriesKey`, no
// row_id) makes this id match direct and unambiguous, no separate lookup table needed:
//   - `outcome === "minted_verified"` AND a real `item_id` present -> RATIFY: `item_id` set, `status:
//     "ratified"`. This is the ONLY outcome that ratifies. `isRatified()` (src/lib/market/refresh-
//     published-price-statistics.mjs) checks ONLY `item_id != null` — it does NOT read `status` or the
//     row's own provenance — so ratifying on anything less than a VERIFIED row would make
//     `deriveDisplayRows()` publish a display row backed by a quarantined/unverified item the moment an
//     operator ran `--apply`, exactly the "populated, visible and wrong is worse than empty" failure
//     MINT-RUNBOOK.md §0 exists to prevent.
//   - any other outcome present for that series_key (`minted_unverified`, `apply_failed`,
//     `not_applied_*`, `validation_failed`, `build_failed`) -> NOT ratified, reported by name and left
//     exactly as it was (still `pending_R-D` unless already ratified from an earlier run) — never
//     silently dropped, never guessed forward.
//   - no per_item entry for that series_key in this artifact at all -> NOT ratified, reported
//     `not_found_in_artifact` (this run's batch did not attempt this series, or attempted it under a
//     different id than expected).
//   - an entry already ratified (from a prior run) -> left untouched, reported `already_ratified`, never
//     re-derived or overwritten by a later, possibly worse, outcome for the same series.
//
// DRY BY DEFAULT, same posture as every other script in this family (run-mint-batch.mjs,
// apply-mint-batch.mjs, refresh-published-price-statistics.mjs): prints the full per-series disposition
// and writes NOTHING. `--apply` rewrites the target .mjs file — see writeSeriesItemMapFile below for how
// the header comment is preserved byte-for-byte and only the exported object body is regenerated.
//
// USAGE:
//   node scripts/producers/market/ratify-series-items.mjs --mint-run path/to/mint-run-NNN.json [--apply]
//        [--map-path path/to/series-item-map.mjs]

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MAP_PATH = resolve(HERE, "../../../src/lib/market/series-item-map.mjs");
const EXPORT_MARKER = "export const SERIES_ITEM_MAP_RAW = Object.freeze(";

/** Load a mint-run artifact's `per_item` array into a Map keyed by `id`, last-entry-wins (matching
 *  apply-mint-batch.mjs's own `enrichMintRunArtifact`, which replaces-by-id when it enriches an
 *  artifact in place, so the LATEST outcome for a given id is always the one on the artifact's own
 *  per_item array — there is only ever one live entry per id in a well-formed artifact). Pure. */
export function indexPerItemById(artifact) {
  const byId = new Map();
  for (const p of artifact?.per_item ?? []) {
    if (p && typeof p.id === "string") byId.set(p.id, p);
  }
  return byId;
}

/**
 * Compute the ratification disposition for one series_key against a mint-run artifact's per_item index.
 * Pure — no I/O, no mutation of its inputs. Returns one of:
 *   { action: "ratify", item_id }
 *   { action: "skip", reason: "already_ratified" | "not_found_in_artifact" | "outcome_not_verified", outcome? }
 */
export function ratificationForSeries(entry, seriesKey, perItemById) {
  if (entry != null && entry.item_id != null && entry.item_id !== "") {
    return { action: "skip", reason: "already_ratified" };
  }
  const perItem = perItemById.get(seriesKey);
  if (!perItem) {
    return { action: "skip", reason: "not_found_in_artifact" };
  }
  if (perItem.outcome === "minted_verified" && perItem.item_id) {
    return { action: "ratify", item_id: perItem.item_id };
  }
  return { action: "skip", reason: "outcome_not_verified", outcome: perItem.outcome };
}

/**
 * Apply every ratifiable series in `rawMap` (the SERIES_ITEM_MAP_RAW-shaped object) against a mint-run
 * artifact. Pure — returns a NEW map object (never mutates `rawMap`) plus a per-series disposition list
 * for reporting. Only entries carrying `proposed_item` (the mint-eligible series) are considered — a
 * `_`-prefixed documentation key or an entry with no proposal is left byte-identical, never touched.
 */
export function ratifySeriesItemMap(rawMap, artifact) {
  const perItemById = indexPerItemById(artifact);
  const updated = {};
  const dispositions = [];
  for (const [seriesKey, entry] of Object.entries(rawMap)) {
    if (seriesKey.startsWith("_") || !entry?.proposed_item) {
      updated[seriesKey] = entry;
      continue;
    }
    const outcome = ratificationForSeries(entry, seriesKey, perItemById);
    if (outcome.action === "ratify") {
      updated[seriesKey] = { ...entry, item_id: outcome.item_id, status: "ratified" };
      dispositions.push({ series_key: seriesKey, action: "ratified", item_id: outcome.item_id });
    } else {
      updated[seriesKey] = entry;
      dispositions.push({ series_key: seriesKey, action: "skipped", reason: outcome.reason, outcome: outcome.outcome ?? null });
    }
  }
  return { updated, dispositions };
}

/**
 * Regenerate series-item-map.mjs's file text: the ORIGINAL header comment (everything before the
 * `export const SERIES_ITEM_MAP_RAW = Object.freeze(` line), preserved byte-for-byte, followed by a
 * freshly-serialized object body. Never a hand-diffed edit of the object literal — every field in the
 * regenerated body comes from the SAME `updated` object `ratifySeriesItemMap` returned, so the file on
 * disk can never disagree with what this script computed. Throws if the marker line is not found (the
 * file's shape changed underneath this script — refuse to guess where the header ends, same posture as
 * every other "never silently guess" rule in this family).
 */
export function renderSeriesItemMapFile(originalText, updatedMap) {
  const idx = originalText.indexOf(EXPORT_MARKER);
  if (idx < 0) {
    throw new Error(`renderSeriesItemMapFile: could not find "${EXPORT_MARKER}" in the original file — refusing to guess where the header ends`);
  }
  const header = originalText.slice(0, idx);
  return `${header}${EXPORT_MARKER}\n${JSON.stringify(updatedMap, null, 2)}\n);\n`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      "mint-run": { type: "string" },
      "map-path": { type: "string" },
      apply: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  if (!values["mint-run"]) {
    console.error(
      "Usage: node scripts/producers/market/ratify-series-items.mjs --mint-run path/to/mint-run-NNN.json [--apply] [--map-path path/to/series-item-map.mjs]",
    );
    process.exit(1);
  }

  const mintRunPath = resolve(values["mint-run"]);
  const mapPath = resolve(values["map-path"] || DEFAULT_MAP_PATH);

  const artifact = JSON.parse(readFileSync(mintRunPath, "utf8"));
  if (artifact.harness_family !== "mint") {
    console.error(`ratify-series-items: ${mintRunPath} is not a "mint" harness artifact (harness_family=${artifact.harness_family}) — refusing to guess.`);
    process.exit(1);
  }

  // Dynamic import (not a text-regex parse) — reads the map exactly as refresh-published-price-
  // statistics.mjs itself does, so this script can never disagree with what the app actually loads.
  const mapModule = await import(`file://${mapPath}`);
  const { updated, dispositions } = ratifySeriesItemMap(mapModule.SERIES_ITEM_MAP_RAW, artifact);

  console.log(`ratify-series-items: ${dispositions.length} series considered against ${mintRunPath} (run_id=${artifact.run_id ?? "unknown"})`);
  for (const d of dispositions) {
    if (d.action === "ratified") {
      console.log(`  RATIFY  ${d.series_key} -> item_id=${d.item_id}`);
    } else {
      console.log(`  skip    ${d.series_key} — ${d.reason}${d.outcome ? ` (outcome=${d.outcome})` : ""}`);
    }
  }
  const ratifiedCount = dispositions.filter((d) => d.action === "ratified").length;

  if (!values.apply) {
    console.log(`DRY RUN — nothing written. ${ratifiedCount} series would be ratified. Pass --apply to write ${mapPath}.`);
    process.exit(0);
  }

  if (ratifiedCount === 0) {
    console.log("apply: nothing to ratify — no series in this artifact reached minted_verified. Leaving the map file unchanged.");
    process.exit(0);
  }

  const originalText = readFileSync(mapPath, "utf8");
  const newText = renderSeriesItemMapFile(originalText, updated);
  writeFileSync(mapPath, newText, "utf8");
  console.log(`Wrote ${mapPath} — ${ratifiedCount} series ratified.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
