#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { parseEuWeeklyOilBulletinCsv } from "../../../src/lib/market/parsers/eu-weekly-oil-bulletin.mjs";
import { planMarketSeriesUpsert } from "../../../src/lib/market/write-market-series.mjs";
import { producerFor } from "../../../src/lib/market/series-registry.mjs";
import { readAll, guardedInsert, guardedUpdate } from "../../lib/db.mjs";
import { isMainModule } from "../../lib/is-main.mjs";
// DAG authorship at write time (lane W4-DAG, 2026-09-06: "market_series has no edges" — the W3-W4
// plan-completion audit's own finding). See author-market-series-delta.mjs's own header for the full
// contract; this producer is the wiring, not a second implementation.
import { authorMarketSeriesDeltaEdges, assertEdgesAuthoredAndRecordSummary } from "./author-market-series-delta.mjs";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";

const PRODUCER_NAME = "eu-weekly-oil-bulletin";

const KILL_SWITCH_ENV = "MARKET_PRODUCER_EU_OIL_BULLETIN_ENABLED";
const REGISTRY_ENTRY = producerFor("eu-oil-bulletin");

loadLocalEnvFile();

function readStdinSync() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const inputIdx = args.indexOf("--input");
  return {
    apply: args.includes("--apply"),
    inputPath: inputIdx >= 0 ? args[inputIdx + 1] : null,
    // --trace (lane M5, 2026-09-18): logs every DAG-authorship step to stderr, see
    // author-market-series-delta.mjs's own header ("TRACE + GATE") for what it records.
    trace: args.includes("--trace"),
  };
}

const cite = {
  skill: "market-series-spine (WO-16)",
  reason: "EU Weekly Oil Bulletin weekly upsert into market_series, keyed (series_key, reference_period), full envelope per row.",
};

async function main() {
  const { apply, inputPath, trace } = parseArgs(process.argv);

  const csvText = inputPath ? readFileSync(inputPath, "utf8") : readStdinSync();
  if (!csvText || !csvText.trim()) {
    console.error("eu-weekly-oil-bulletin: no input — pass --input <path> or pipe CSV on stdin (exit 2).");
    process.exit(2);
  }

  const { rows: parsedRows, warnings } = parseEuWeeklyOilBulletinCsv(csvText);
  for (const w of warnings) console.warn(`[parse] ${w}`);
  console.log(`eu-weekly-oil-bulletin: parsed ${parsedRows.length} row(s), ${warnings.length} warning(s)${apply ? "" : " (DRY RUN)"}`);

  if (parsedRows.length === 0) {
    console.log("nothing to plan — exiting.");
    process.exit(0);
  }

  if (apply && process.env[KILL_SWITCH_ENV] !== "1") {
    console.error(
      `eu-weekly-oil-bulletin: REFUSING to write — kill switch ${KILL_SWITCH_ENV} is OFF (set it to "1" to arm this ` +
        `producer). This is the WO-16 default-off gate, not a bug. Re-run without --apply to see the plan (exit 1).`,
    );
    process.exit(1);
  }

  if (apply && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("eu-weekly-oil-bulletin: --apply requires DB creds (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — none found (exit 1).");
    process.exit(1);
  }

  // Existing rows for this producer's OWN namespace only (series_key LIKE 'eu-oil-bulletin:%') — never a
  // full-table read, and never touches another producer's series (namespace ownership per the registry's
  // own header).
  const existing = apply
    ? (await readAll("market_series", "id, series_key, reference_period")).filter((r) => r.series_key.startsWith(`${REGISTRY_ENTRY.keyPrefix}:`))
    : [];

  const { toCreate, toUpdate, skippedNoReferencePeriod } = planMarketSeriesUpsert(existing, parsedRows);
  for (const r of skippedNoReferencePeriod) {
    console.warn(`[plan] skipped ${r.series_key}: no reference_period (would multiply duplicate rows under the UNIQUE key)`);
  }
  console.log(`eu-weekly-oil-bulletin: plan — ${toCreate.length} to create, ${toUpdate.length} to update, ${skippedNoReferencePeriod.length} skipped`);

  if (!apply) {
    for (const r of toCreate) console.log(`  would create  ${r.series_key} @ ${r.reference_period}  ${r.value_numeric} ${r.unit}`);
    for (const u of toUpdate) console.log(`  would update  id=${u.id}  ${u.patch.value_numeric} ${u.patch.unit}`);
    console.log("DRY RUN — nothing written. Pass --apply (with the kill switch armed) to write.");
    process.exit(0);
  }

  let created = 0, updated = 0;
  for (const r of toCreate) {
    const res = await guardedInsert("market_series", r, { cite });
    console.log(`created  ${r.series_key} @ ${r.reference_period}  (snapshot ${res.snapshot})`);
    created += 1;
  }
  for (const u of toUpdate) {
    await guardedUpdate("market_series", (qb) => qb.eq("id", u.id), { ...u.patch, updated_at: new Date().toISOString() }, { cite });
    console.log(`updated  id=${u.id}`);
    updated += 1;
  }

  console.log(`done — ${created} created, ${updated} updated (${parsedRows.length} rows parsed).`);

  // DAG authorship at write time (see author-market-series-delta.mjs's own header) — every series_key
  // this run's parsed rows touched. Never fatal to this producer's own already-committed write.
  const touchedSeriesKeys = new Set(parsedRows.map((r) => r.series_key));
  const authorCounts = await authorMarketSeriesDeltaEdges(touchedSeriesKeys, "apply", { trace });
  console.log(
    `eu-weekly-oil-bulletin: DAG authorship (market_series_delta): authored=${authorCounts.authored} ` +
    `already=${authorCounts.skippedAlready} insufficient-history=${authorCounts.insufficientHistory} ` +
    `unit-mismatch=${authorCounts.unitMismatch} refused=${authorCounts.refused} ` +
    `unknown-method=${authorCounts.unknownMethod} errored=${authorCounts.errored}`
  );

  // See ecb-fx-producer.mjs's own copy of this note.
  assertEdgesAuthoredAndRecordSummary(PRODUCER_NAME, created + updated, authorCounts, parsedRows.length);

  process.exit(0);
}

// Guarded (F44/F67): importing this module (e.g. a future test on its exports) must never trigger a
// live run. Only a direct `node eu-weekly-oil-bulletin.mjs` invocation reaches main().
if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
