#!/usr/bin/env node
// build-oil-bulletin-rows.mjs — ruling R-D (operator-accepted 2026-09-03): the six EU Weekly Oil
// Bulletin series become `published_price_statistics` record-grade `market_signal` items. This script
// builds the six ENRICHED CENSUS ROWS the mint family's harness needs to mint them — the exact shape
// `scripts/mint/export-census-rows.mjs` emits and `scripts/mint/run-mint-batch.mjs --census-rows` reads
// (row_id, source_url, item_type, title, title_origin, instrument_identifier, canonical_instrument_key,
// jurisdiction_iso, priority, source{}, captured_text, fetched_length, screen{} — MINT-RUNBOOK.md §11/§12).
// Pure — no fs read beyond its own two static imports, no DB, no fetch, no LLM, $0.
//
// WHY THE HARNESS, NOT A NEW MINT PATH. `scripts/mint/MINT-RUNBOOK.md` §11's "browser-capture escape
// hatch" is the mint family's ONLY landing path for a hand-built row that did not come through the live
// census_worklist exporter: build the SAME enriched-row shape by hand, commit it under
// `scripts/_snapshots/population-browser/<batch>/census-rows.json`, and dispatch `population-turn.yml`
// with `rows_file` pointing at it — `export-census-rows.mjs` is then skipped entirely and
// `run-mint-batch.mjs --census-rows` / `apply-mint-batch.mjs` run on it directly, the SAME gate and the
// SAME guarded write path a live-exported batch goes through. These six series are not census_worklist
// rows at all (they come from `SERIES_ITEM_MAP`'s `proposed_item` triples, `scripts/producers/market/
// propose-series-items.mjs` — a different producer family), so §11's escape hatch, not a live export
// run, is the correct — and only — route into the mint family for this ruling.
//
// row_id INTENTIONALLY OMITTED. The enriched-row shape's `row_id` (run-mint-batch.mjs's own
// --census-rows doc comment) is "census_worklist.id, optional, for traceability" — these six rows are
// not census_worklist rows, so there is no real id to carry. Read both consumers before choosing this:
//   - run-mint-batch.mjs's `censusRowId(row, index)` falls back `row_id ?? canonical_instrument_key ??
//     instrument_identifier ?? source_url ?? index` for the payload's own `id`. All six rows share ONE
//     `source_url` (the bulletin page) and have NO canonical_instrument_key (see below) — so
//     `instrument_identifier` (set to the series_key itself, e.g. "eu-oil-bulletin:eurosuper-95", unique
//     per row) is what keeps every payload's `id` distinct; a row_id would only add a second, unused key.
//   - apply-mint-batch.mjs's `resolveCensusRowId` only touches `census_worklist` when a payload's `id`
//     is found in the SAME `--census-rows` file's own set of `row_id` values (`censusRowIdSet`). Setting
//     row_id to a MADE-UP value here would be worse than omitting it: `guardedUpdate` on a non-matching
//     id updates zero rows but still reports `censusStamped: true` (apply-mint-batch.mjs sets that flag
//     on "no exception thrown," not on "a row actually matched") — a false-positive `census_rows_
//     reconciled` count with no real census_worklist row behind it. Omitting row_id entirely makes
//     `resolveCensusRowId` correctly return null for all six, so apply-mint-batch.mjs never touches
//     census_worklist for this batch — no attempt, no false claim, `censusStamped: false` honestly.
//
// canonical_instrument_key LEFT NULL. Read before writing this: `scripts/lib/canonical-key.mjs`
// (`deriveKey`, the ONE canonical-key mirror this repo ships) resolves ONLY CELEX and ELI legal-
// instrument identifiers — a Weekly Oil Bulletin product series is neither. `src/lib/entities/
// decisions.mjs`'s `CORRIDOR_ID_SCHEME` (ADR-024 decision 4) is the repo's other keyed-identity scheme
// for the market family, but it names a UN/LOCODE PORT-PAIR + transport MODE ("ORIGIN-DEST:mode") — a
// statistical price series has neither a port pair nor a mode; forcing one would be exactly the false-
// precision `export-census-rows.mjs`'s own header forbids for legislation.gov.uk/federalregister.gov
// ("no scheme exists ... never invented"). No canonical-key scheme in this system fits a statistical
// series, so every row's `canonical_instrument_key` is `null`, matching that same repo-wide doctrine.
//
// source.id IS THE SAME PLACEHOLDER propose-series-items.mjs ALREADY USES, for the SAME reason: this
// script has no DB access to look up the real `sources` row (MINT-RUNBOOK.md step 2) for
// https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en. "PENDING-LIVE-SOURCES-LOOKUP" —
// the coordinator must resolve the real row before minting any of these for real.
//
// captured_text IS IMPORTED, NOT COPIED, from refresh-published-price-statistics.mjs's own
// CAPTURED_BULLETIN_PAGE_TEXT (that file's header: captured via WebFetch 2026-09-02, lane PROD-FIX,
// against the live bulletin page) — one home for this text, many consumers (propose-series-items.mjs's
// --propose-items draft and this script's harness rows now both read the SAME constant). That constant
// was previously un-exported (module-private); Lane RD added the one-line `export` needed to import it
// here — no other change to that file or its behaviour. See this lane's own report for that write-set
// note.
//
// USAGE:
//   node scripts/producers/market/build-oil-bulletin-rows.mjs                     # print the 6 rows (JSON)
//   node scripts/producers/market/build-oil-bulletin-rows.mjs --out path/to/census-rows.json  # write them

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { SERIES_ITEM_MAP } from "../../../src/lib/market/refresh-published-price-statistics.mjs";
import { CAPTURED_BULLETIN_PAGE_TEXT } from "./refresh-published-price-statistics.mjs";

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

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
