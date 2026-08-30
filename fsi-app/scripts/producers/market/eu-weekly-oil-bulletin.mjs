#!/usr/bin/env node
// eu-weekly-oil-bulletin.mjs — WO-16's first market_series producer (master execution plan v2 Stage 7,
// docs/plans/master-execution-plan-2026-08-17.md; ruling WO-16.2 held in
// docs/plans/connection-redesign-and-build-scope-2026-08-29.md §4).
//
// SHAPE, mirroring scripts/source-state-min-wage.mjs (the closest existing envelope-writing producer):
// read the fixture/input CSV -> parse (src/lib/market/parsers/eu-weekly-oil-bulletin.mjs) -> plan the
// idempotent upsert (src/lib/market/write-market-series.mjs) -> write through the GUARDED path
// (scripts/lib/db.mjs — readAll/guardedInsert/guardedUpdate: cite + prior-value snapshot + service role,
// CLAUDE.md standing rule "facts live in Supabase" / discipline rule 015). This script performs NO raw
// `.from("market_series").insert(...)` — every write is guardedInsert/guardedUpdate, same posture as
// every other script under scripts/ that mutates a fact table.
//
// TWO INDEPENDENT SAFETY GATES, BOTH MUST BE SATISFIED TO WRITE (WO-16 step 3: "kill-switched with the
// switch DEFAULT OFF … --dry as the DEFAULT mode and --apply required to write"):
//   1. --apply on the command line (default is --dry: parse + plan + report, write nothing).
//   2. MARKET_PRODUCER_EU_OIL_BULLETIN_ENABLED=1 in the environment (the kill switch; unset/any other
//      value = OFF). Checked ONLY when --apply is passed — a --dry run always works for testing the
//      parser/plan regardless of the switch, since it writes nothing.
// Passing --apply with the switch off REFUSES with an explanatory message and exits 1; it does not
// silently downgrade to a dry run (a silent downgrade would hide that the switch is off from whoever is
// watching the exit code).
//
// THE THIRD GATE IS NOW CLEAR (2026-08-30): market_series.source_key is a real FK to
// public.data_sources(source_key), and 'ec_weekly_oil_bulletin' IS a live row in that table —
// src/lib/contracts/source-licence.mjs gained the entry (CC BY 4.0, Decision 2011/833/EU) and migration
// 258's data_source_seed was regenerated and applied, confirmed live this session. The fail-closed
// posture stays for any FUTURE unregistered source (provenance-envelope.mjs's own header): never widen
// the FK, never point source_key at a wrongly-attributed row to make a 23503 go away.
//
// INPUT. This script itself does not fetch the live bulletin — --input <path> reads a NORMALIZED CSV
// already in this pipeline's contract (see the parser header); omit --input to read the same contract
// from stdin. The live fetch + extract step named as a follow-up in earlier revisions of this comment is
// now BUILT: scripts/producers/market/fetch-oil-bulletin.mjs (2026-08-30, against the workbook structure
// verified live by two GitHub-runner inspection runs — see that script's and oil-bulletin-workbook.mjs's
// own headers). Compose it with this script exactly as producers.yml's "EU Weekly Oil Bulletin ->
// market_series" step does: fetch-oil-bulletin.mjs writes a normalized CSV, this script reads it via
// --input. This script's own job stays parse -> plan -> guarded write, fully functional and
// fixture-tested independent of the fetch step.
//
// Usage:
//   node scripts/producers/market/eu-weekly-oil-bulletin.mjs --input path/to/bulletin.csv          # dry (default)
//   node scripts/producers/market/eu-weekly-oil-bulletin.mjs --input path/to/bulletin.csv --apply   # write (needs the env switch too)
//   cat bulletin.csv | node scripts/producers/market/eu-weekly-oil-bulletin.mjs --apply
// Exit 0 done (including a clean dry run) · 1 refused (switch off on --apply, or no DB creds on --apply) · 2 bad input.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEuWeeklyOilBulletinCsv } from "../../../src/lib/market/parsers/eu-weekly-oil-bulletin.mjs";
import { planMarketSeriesUpsert } from "../../../src/lib/market/write-market-series.mjs";
import { producerFor } from "../../../src/lib/market/series-registry.mjs";
import { readAll, guardedInsert, guardedUpdate } from "../../lib/db.mjs";

const KILL_SWITCH_ENV = "MARKET_PRODUCER_EU_OIL_BULLETIN_ENABLED";
const REGISTRY_ENTRY = producerFor("eu-oil-bulletin");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected, or no creds needed for --dry */ }

function readStdinSync() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const inputIdx = args.indexOf("--input");
  return {
    apply: args.includes("--apply"),
    inputPath: inputIdx >= 0 ? args[inputIdx + 1] : null,
  };
}

const cite = {
  skill: "market-series-spine (WO-16)",
  reason: "EU Weekly Oil Bulletin weekly upsert into market_series, keyed (series_key, reference_period), full envelope per row.",
};

async function main() {
  const { apply, inputPath } = parseArgs(process.argv);

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
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
