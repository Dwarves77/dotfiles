#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { planMarketSeriesUpsert } from "../../../src/lib/market/write-market-series.mjs";
import { producerFor } from "../../../src/lib/market/series-registry.mjs";
import { readAll, guardedInsert, guardedUpdate } from "../../lib/db.mjs";
import { slugify } from "./slugify.mjs";
// DAG authorship at write time (lane W4-DAG, 2026-09-06: "market_series has no edges" — the W3-W4
// plan-completion audit's own finding, propagation-run-005's own "0 recomputed on 500 drained" measurement
// for this exact producer's own output). See author-market-series-delta.mjs's own header for the full
// contract; this producer is the wiring, not a second implementation.
import { authorMarketSeriesDeltaEdges, assertEdgesAuthoredAndRecordSummary } from "./author-market-series-delta.mjs";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";

const PRODUCER_NAME = "eia-v2-petroleum-spot";

// ── Gate 1: the reviewed-code-change switch. False at authorship (lane SURF). ────────────────────────
// REVIEWED-CHANGE LOG (ADR-023 §4 gate 1 — "flipping ENABLED is a REVIEWED CODE CHANGE, shows in `git
// diff`"). 2026-09-03, coordinator, operator rulings "get it all done, leave nothing for later" and "key is
// set in git": ENABLED flipped false -> true in the same train that registers EIA_API_KEY in
// WORKFLOW_SECRETS and adds producers.yml's eia-v2-petroleum-spot dispatch step. The first --apply is a
// dispatched run whose artifact is read back against market_series before any second dispatch.
const ENABLED = true;

const KILL_SWITCH_ENV = "MARKET_PRODUCER_EIA_V2_ENABLED";
const REGISTRY_ENTRY = producerFor("eia-v2");

// The SAME api_endpoint already on file for the live "US EIA Petroleum Spot Prices" source
// (public.sources id 6901afb7-32eb-4d94-afe7-ebb2e2f624eb — see header), length widened from 10 to 5000
// to capture the full product x area x process cross-section in one pull. api_key is appended at fetch
// time from EIA_API_KEY, never hardcoded.
const EIA_URL_BASE =
  "https://api.eia.gov/v2/petroleum/pri/spt/data/?frequency=weekly&data[0]=value&sort[0][column]=period&sort[0][direction]=desc&length=5000";

// product code -> { slug, label } — the closed vocabulary this parser recognises (see header: EIA's own
// long-documented codes for petroleum/pri/spt, NOT live-confirmed this session). A product code in the
// response that is not here is a WARNING (row skipped), never a fabricated series.
export const PRODUCTS = Object.freeze({
  EPCWTI: { slug: "wti-crude", label: "WTI crude oil spot price" },
  EPCBRENT: { slug: "brent-crude", label: "Brent crude oil spot price" },
  EPD2F: { slug: "diesel-no2-low-sulfur", label: "No. 2 diesel, ultra-low sulfur, spot price" },
  EPJK: { slug: "jet-fuel-kerosene", label: "Kerosene-type jet fuel spot price" },
  EPMRR: { slug: "gasoline-rbob-regular", label: "RBOB regular gasoline spot price" },
  EPLLPA: { slug: "propane-mont-belvieu", label: "Propane, Mont Belvieu TX, spot price" },
});

loadLocalEnvFile();

// slugify (lane L11, 2026-10-03): extracted to slugify.mjs, reused by sbti-target-dashboard-producer.mjs
// rather than a second hand-written copy (F45/prior-art). Behaviour unchanged.

const PERIOD_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/**
 * Parse one EIA API v2 petroleum/pri/spt response (already JSON.parse'd) into market_series-shaped rows.
 * Pure — no fs, no fetch, no clock read (as_at_date/reference_period come from each row's own `period`).
 *
 * Expected shape (EIA API v2's own documented envelope):
 *   { response: { data: [ { period, duoarea, "area-name", product, "product-name", process,
 *       "process-name", series, "series-description", value, units }, ... ], warnings?: [...] },
 *     error?: "..." }
 *
 * @param {object} json
 * @returns {{ rows: Array<object>, warnings: string[] }}
 */
export function parseEiaV2PetroleumSpot(json) {
  const warnings = [];
  const rows = [];

  if (!json || typeof json !== "object") {
    return { rows, warnings: ["not a JSON object — cannot be an EIA API v2 response"] };
  }
  if (json.error) {
    return { rows, warnings: [`EIA API error: ${json.error}`] };
  }
  const data = json?.response?.data;
  if (!Array.isArray(data)) {
    return { rows, warnings: ["no response.data array — not a recognisable EIA API v2 petroleum/pri/spt payload"] };
  }
  for (const w of json?.response?.warnings ?? []) {
    warnings.push(`[EIA API warning] ${typeof w === "string" ? w : JSON.stringify(w)}`);
  }

  const seen = new Set();
  for (let i = 0; i < data.length; i++) {
    const row = data[i] ?? {};
    const productDef = PRODUCTS[row.product];
    if (!productDef) {
      warnings.push(`row ${i}: unrecognised product "${row.product}" — row skipped (not a fabricated series)`);
      continue;
    }
    const period = row.period;
    if (!PERIOD_RE.test(String(period ?? ""))) {
      warnings.push(`row ${i}: bad period "${period}" for product "${row.product}" — row skipped`);
      continue;
    }
    const value = Number(row.value);
    if (!Number.isFinite(value)) {
      warnings.push(`row ${i}: non-numeric value "${row.value}" for product "${row.product}" — row skipped`);
      continue;
    }
    const unit = row.units;
    if (!unit || typeof unit !== "string") {
      warnings.push(`row ${i}: missing "units" for product "${row.product}" — row skipped (never a guessed unit)`);
      continue;
    }

    const seriesId = row.series ? slugify(row.series) : slugify(`${row.duoarea ?? ""}-${row.process ?? ""}`);
    if (!seriesId) {
      warnings.push(`row ${i}: could not derive a series identity (no "series", "duoarea", or "process" field) — row skipped`);
      continue;
    }
    const seriesKey = `eia-v2:${productDef.slug}-${seriesId}`;
    const dedupeKey = `${seriesKey} ${period}`;
    if (seen.has(dedupeKey)) {
      warnings.push(`row ${i}: duplicate (series_key, period) "${dedupeKey}" in this response — first occurrence kept`);
      continue;
    }
    seen.add(dedupeKey);

    const areaName = row["area-name"] || row.duoarea || "unspecified area";
    rows.push({
      series_key: seriesKey,
      label: `${productDef.label} — ${areaName}`,
      value_numeric: value,
      unit,
      currency: "USD",
      derivation: "observed",
      origin_class: "official",
      source_key: REGISTRY_ENTRY?.sourceKey ?? "eia",
      source_ref: `EIA Open Data API v2, petroleum/pri/spt, series ${row.series ?? seriesId}, period ${period}`,
      n_observations: null,
      method_version: null,
      as_at_date: period.length === 10 ? period : null,
      reference_period: period,
    });
  }

  return { rows, warnings };
}

/**
 * Pure gating decision — no I/O. Mirrors ecb-fx-producer.mjs's decideApply exactly (three gates: the
 * reviewed-code ENABLED constant, the runtime kill switch, DB creds).
 * @returns {{ canWrite: boolean, reason: string }}
 */
export function decideApply({ apply, enabled, killSwitchOn, hasCreds }) {
  if (!apply) return { canWrite: false, reason: "dry run (no --apply) — parse + plan only, nothing written" };
  if (!enabled) {
    return {
      canWrite: false,
      reason:
        `REFUSING — the source-level ENABLED constant in eia-v2-petroleum-spot-producer.mjs is false. Arming ` +
        `this producer is a later, separate, reviewed commit (not a runtime flag) — re-run without --apply to ` +
        `see the plan.`,
    };
  }
  if (!killSwitchOn) {
    return { canWrite: false, reason: `REFUSING — kill switch ${KILL_SWITCH_ENV} is OFF (set it to "1" to arm this producer)` };
  }
  if (!hasCreds) {
    return { canWrite: false, reason: "REFUSING — --apply requires DB creds (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — none found" };
  }
  return { canWrite: true, reason: "all gates satisfied" };
}

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

class NetworkError extends Error {}

async function fetchEiaV2PetroleumSpot() {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    throw new NetworkError(
      "eia-v2-petroleum-spot-producer: no EIA_API_KEY in the environment — cannot fetch live (this is the " +
        "gate 3 note in this file's own header, not a code defect). Set EIA_API_KEY, or pass --input <path>/" +
        "stdin with a saved EIA API v2 response.",
    );
  }
  const url = `${EIA_URL_BASE}&api_key=${encodeURIComponent(apiKey)}`;
  let res;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch (err) {
    throw new NetworkError(`eia-v2-petroleum-spot-producer: live fetch threw (${err.message}) for ${EIA_URL_BASE}`);
  }
  if (!res.ok) {
    throw new NetworkError(`eia-v2-petroleum-spot-producer: live fetch failed ${res.status} ${res.statusText} for ${EIA_URL_BASE}`);
  }
  return res.json();
}

const cite = {
  skill: "market-series-spine (WO-16), lane SURF (customer-value surfaces, 2026-09-01)",
  reason: "EIA Open Data petroleum spot prices (WTI, Brent, diesel, jet fuel, RBOB, propane) upsert into market_series, keyed (series_key, reference_period), full envelope per row.",
};

async function main() {
  const { apply, inputPath, trace } = parseArgs(process.argv);

  let json;
  if (inputPath) {
    json = JSON.parse(readFileSync(inputPath, "utf8"));
  } else if (!process.stdin.isTTY) {
    const stdinText = readStdinSync();
    if (stdinText && stdinText.trim()) {
      try {
        json = JSON.parse(stdinText);
      } catch (err) {
        console.error(`eia-v2-petroleum-spot-producer: stdin was not valid JSON (${err.message}) (exit 2).`);
        process.exit(2);
      }
    }
  }
  if (json === undefined) {
    try {
      json = await fetchEiaV2PetroleumSpot();
    } catch (err) {
      if (err instanceof NetworkError) {
        console.error(err.message);
        process.exit(3);
      }
      throw err;
    }
  }

  if (json === undefined || json === null) {
    console.error("eia-v2-petroleum-spot-producer: no input — live fetch, --input <path>, and stdin all came back empty (exit 2).");
    process.exit(2);
  }

  const { rows: parsedRows, warnings } = parseEiaV2PetroleumSpot(json);
  for (const w of warnings) console.warn(`[parse] ${w}`);
  console.log(`eia-v2-petroleum-spot-producer: parsed ${parsedRows.length} row(s), ${warnings.length} warning(s)${apply ? "" : " (DRY RUN)"}`);

  if (parsedRows.length === 0) {
    console.log("nothing to plan — exiting.");
    process.exit(0);
  }

  const decision = decideApply({
    apply,
    enabled: ENABLED,
    killSwitchOn: process.env[KILL_SWITCH_ENV] === "1",
    hasCreds: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  });

  if (apply && !decision.canWrite) {
    console.error(`eia-v2-petroleum-spot-producer: ${decision.reason} (exit 1).`);
    process.exit(1);
  }

  // Existing rows for this producer's OWN namespace only (series_key LIKE 'eia-v2:%') — never a full-table
  // read, and never touches another producer's series.
  const existing = decision.canWrite
    ? (await readAll("market_series", "id, series_key, reference_period")).filter((r) => r.series_key.startsWith(`${REGISTRY_ENTRY.keyPrefix}:`))
    : [];

  const { toCreate, toUpdate, skippedNoReferencePeriod } = planMarketSeriesUpsert(existing, parsedRows);
  for (const r of skippedNoReferencePeriod) {
    console.warn(`[plan] skipped ${r.series_key}: no reference_period (would multiply duplicate rows under the UNIQUE key)`);
  }
  console.log(`eia-v2-petroleum-spot-producer: plan — ${toCreate.length} to create, ${toUpdate.length} to update, ${skippedNoReferencePeriod.length} skipped`);

  if (!decision.canWrite) {
    for (const r of toCreate) console.log(`  would create  ${r.series_key} @ ${r.reference_period}  ${r.value_numeric} ${r.unit}`);
    for (const u of toUpdate) console.log(`  would update  id=${u.id}  ${u.patch.value_numeric} ${u.patch.unit}`);
    console.log(`DRY RUN — nothing written (${decision.reason}).`);
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

  // DAG authorship at write time (see author-market-series-delta.mjs's own header) — every series_key this
  // run's parsed rows touched, so a pair whose PRIOR observation was written by a past run (not this run's
  // own toCreate/toUpdate) is still authored. Never fatal to this producer's own already-committed write.
  const touchedSeriesKeys = new Set(parsedRows.map((r) => r.series_key));
  const authorCounts = await authorMarketSeriesDeltaEdges(touchedSeriesKeys, "apply", { trace });
  console.log(
    `eia-v2-petroleum-spot-producer: DAG authorship (market_series_delta): authored=${authorCounts.authored} ` +
    `already=${authorCounts.skippedAlready} insufficient-history=${authorCounts.insufficientHistory} ` +
    `unit-mismatch=${authorCounts.unitMismatch} refused=${authorCounts.refused} ` +
    `unknown-method=${authorCounts.unknownMethod} errored=${authorCounts.errored}`
  );

  // See ecb-fx-producer.mjs's own copy of this note.
  assertEdgesAuthoredAndRecordSummary(PRODUCER_NAME, created + updated, authorCounts, parsedRows.length);

  process.exit(0);
}

// Only run main() when this file is the actual entrypoint — importing it for its exports
// (parseEiaV2PetroleumSpot, decideApply, PRODUCTS) from a test must never trigger a live network fetch.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
