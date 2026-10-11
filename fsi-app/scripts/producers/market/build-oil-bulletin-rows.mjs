#!/usr/bin/env node

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parseArgs } from "node:util";
import { SERIES_ITEM_MAP } from "../../../src/lib/market/refresh-published-price-statistics.mjs";
import { CAPTURED_BULLETIN_PAGE_TEXT } from "./refresh-published-price-statistics.mjs";
import { isMainModule } from '../../lib/is-main.mjs'; // task 0.3b: the Windows-safe CLI main guard

// The relevance-screen verdict every proposed R-D payload already carries (propose-series-items.mjs's
// own PROPOSED_ITEM_SCREEN): this human-directed lane judged the six oil-bulletin products in-vertical
// (freight fuel cost intelligence) before proposing them; "R-D ruling" names the ruling this attachment
// answers. MINT-RUNBOOK.md §12: a hand-built browser-capture row "must carry `screen` too" — this is
// that field, the SAME verdict/provenance/basis triple, not a second, independently-judged one.
const HAND_CAPTURE_SCREEN = Object.freeze({ verdict: "on_vertical", provenance: "reviewed", basis: "R-D ruling" });

/**
 * Build the six R-D enriched census rows (the mint harness's --census-rows input shape), one per
 * SERIES_ITEM_MAP entry that carries a `proposed_item`. Pure — DRY BY DEFAULT in the sense that matters
 * for this family: it only ever PRINTS/RETURNS rows, it never mints, writes, or touches a database.
 * `--out` (the CLI below) is the only file-writing side effect, and it writes a harness INPUT file, not
 * a mint result.
 */
export function buildOilBulletinCensusRows({
  map = SERIES_ITEM_MAP,
  capturedText = CAPTURED_BULLETIN_PAGE_TEXT,
  fetchedLength,
} = {}) {
  if (typeof capturedText !== "string" || capturedText.trim() === "") {
    throw new Error("buildOilBulletinCensusRows requires capturedText (the captured Weekly Oil Bulletin page text)");
  }
  const length = typeof fetchedLength === "number" ? fetchedLength : capturedText.length;
  return map
    .filter(([, entry]) => entry?.proposed_item)
    .map(([seriesKey, entry]) => {
      const proposed = entry.proposed_item;
      return {
        // row_id: intentionally omitted — see this file's header.
        source_url: proposed.source_url,
        item_type: proposed.item_type,
        title: proposed.title,
        title_origin: "operator_authored", // the title was written by lane PROD-FIX from the page's own
        // published product line (see propose-series-items.mjs), never extracted from a captured
        // <title>/<h1> — an honest, distinct value from export-census-rows.mjs's captured_* origins.
        instrument_identifier: seriesKey, // doubles as this row's own stable join key for
        // ratify-series-items.mjs (see that script's header) — not a canonical-key-scheme identifier
        // (none fits; see canonical_instrument_key below), only this row's own name.
        canonical_instrument_key: null, // no scheme fits — see this file's header (neither CELEX/ELI nor
        // ADR-024's port-pair+mode corridor scheme applies to a statistical price series).
        jurisdiction_iso: "EU",
        priority: "MODERATE",
        source: {
          id: "PENDING-LIVE-SOURCES-LOOKUP",
          url: proposed.source_url,
          status: "active",
          base_tier: 1, // provisional: an official European Commission publication, same posture every
          // other registered-official EU source in this repo carries — see propose-series-items.mjs.
          tier_override: null,
        },
        captured_text: capturedText,
        fetched_length: length,
        screen: HAND_CAPTURE_SCREEN,
      };
    });
}

function main() {
  const { values } = parseArgs({
    options: { out: { type: "string" } },
    allowPositionals: false,
    strict: true,
  });

  const rows = buildOilBulletinCensusRows();

  if (values.out) {
    const outPath = resolve(values.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(rows, null, 2) + "\n", "utf8");
    console.log(`build-oil-bulletin-rows: wrote ${rows.length} enriched census row(s) to ${outPath}`);
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
