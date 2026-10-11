#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { isMainModule } from '../../lib/is-main.mjs'; // task 0.3b: the Windows-safe CLI main guard
import { writeProducerSummary } from "../lib/producer-summary.mjs";

const PRODUCER_NAME = "ratify-series-items";
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
    writeProducerSummary({ producer: PRODUCER_NAME, status: "ok", rows_changed: 0, edges_authored: null, counts: { wouldRatify: ratifiedCount } });
    process.exit(0);
  }

  if (ratifiedCount === 0) {
    console.log("apply: nothing to ratify — no series in this artifact reached minted_verified. Leaving the map file unchanged.");
    writeProducerSummary({ producer: PRODUCER_NAME, status: "ok", rows_changed: 0, edges_authored: null, counts: { ratified: 0 } });
    process.exit(0);
  }

  const originalText = readFileSync(mapPath, "utf8");
  const newText = renderSeriesItemMapFile(originalText, updated);
  writeFileSync(mapPath, newText, "utf8");
  console.log(`Wrote ${mapPath} — ${ratifiedCount} series ratified.`);
  // Recorded on this run's normal completion (lane M9d, brief-m9d Amendment 1 item C.2). This producer
  // rewrites a bundled .mjs module, not derivation_edges, so edges_authored is null.
  writeProducerSummary({ producer: PRODUCER_NAME, status: "ok", rows_changed: ratifiedCount, edges_authored: null, counts: { ratified: ratifiedCount, dispositions } });
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
