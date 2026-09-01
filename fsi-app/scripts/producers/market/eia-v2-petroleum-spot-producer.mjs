#!/usr/bin/env node
// eia-v2-petroleum-spot-producer.mjs — the third market_series producer (WO-16's registry,
// keyPrefix "eia-v2"). Lane SURF (customer-value surfaces build train, 2026-09-01), scoped narrowly by
// the system review's own finding: "Market Intel's price feed is 1 of 48 series, three of four producers
// are unbuilt" (docs/audits/system-review-2026-09-01.md §1/§6). Of the registry's three named stubs —
// eex-eua, ecb-fx, eia-v2 (src/lib/market/series-registry.mjs) — ecb-fx already shipped a producer
// (scripts/producers/market/ecb-fx-producer.mjs, lane P2), and eex-eua stays a documented stub: this
// session found no free/open-reuse licence for EEX's auction data (its own terms/copyright page could
// not be reached — 404 — and no 'eex' row exists in public.data_sources), and building a producer whose
// source_key would fail the licence-register FK, or worse, whose licence basis is guessed, is exactly the
// fabrication this codebase's own discipline (source-licence.mjs, F27, rule 015) exists to refuse. This
// lane builds ONLY eia-v2 — see this session's own report for the full three-way disposition.
//
// WHY EIA V2 IS THE ONE THAT CLEARS EVERY GATE. Confirmed LIVE this session (Supabase read, not assumed):
//   * public.data_sources already carries source_key='eia' — "US Energy Information Administration",
//     licence "US public domain (17 USC 105)", redistribution "permitted", embeddable=true, verified_on
//     2026-08-12. Unlike ecb-fx/eex-eua, this producer's --apply is NOT FK-blocked on day one.
//   * public.sources already carries a working, previously-verified API endpoint for exactly this
//     dataset: id 6901afb7-32eb-4d94-afe7-ebb2e2f624eb, "US EIA Petroleum Spot Prices",
//     api_endpoint = "https://api.eia.gov/v2/petroleum/pri/spt/data/?frequency=weekly&data[0]=value&
//     sort[0][column]=period&sort[0][direction]=desc&length=10" — and docs/archive/
//     CLAUDE-session-log-2026-04.md's own B.0 API-integration table records "EIA Open Data, Petroleum
//     Spot, STEO | api | EIA_API_KEY (query-string) | Verified end-to-end". This producer's EIA_URL below
//     is that SAME endpoint, unchanged apart from length (5000, to capture the dataset's full product x
//     area x process cross-section per pull rather than 10 rows) — not a freshly guessed URL.
//   * EIA_API_KEY is already a registered secret (.env.local.example, .discipline/governance/
//     secrets-registry.mjs) with prior verified use elsewhere in this codebase (fetch-now/route.ts). No
//     NEW key is introduced by this producer.
//
// WHAT THIS SESSION COULD NOT VERIFY LIVE, STATED PLAINLY (same posture ecb-fx-producer.mjs's header
// takes for its own [UNCONFIRMED] note). This sandbox's own egress cannot reach api.eia.gov at all
// (`curl -sS $HTTPS_PROXY/__agentproxy/status` shows a `connect_rejected`/403 policy-denial relay
// failure for api.eia.gov:443 — an organization egress policy, not a code defect); a network-tool fetch
// from this session DID reach api.eia.gov and got a real 403 back from EIA itself (both with no api_key
// and with an invalid placeholder key), which confirms the endpoint is live and reachable from SOME
// network path (matching the session-log's "verified end-to-end" claim) but could not return an
// authenticated JSON body without a real key. So: PRODUCT_CODES below (WTI, Brent, ultra-low-sulfur No.2
// diesel, kerosene-type jet fuel, RBOB gasoline, Mont Belvieu propane) are EIA's own long-documented,
// long-stable API v2 product codes for this exact dataset (petroleum/pri/spt), not a fresh guess, but
// this session did not read back a live authenticated response to confirm today's exact code set. This is
// the SAME evidentiary posture ecb-fx-producer.mjs shipped with for the ECB XML shape, and it fails safe
// by the same construction: an unrecognised `product` code in the live response is a WARNING (row
// skipped), never a fabricated series — if every one of these six codes turned out stale, the honest
// result is 0 rows parsed and 6+ warnings naming exactly what came back unmatched, not silently wrong
// data. Whoever next runs this producer where api.eia.gov is reachable (a GitHub Actions runner, same as
// every other producer in this family) should diff the live response's `product`/`product-name` values
// against PRODUCT_CODES before the coordinator arms it.
//
// THE PRODUCT LINE (EIA's own documented vocabulary for petroleum/pri/spt, not fabricated): WTI (Cushing)
// and Brent (Europe) crude spot prices in $/BBL; ultra-low-sulfur No. 2 diesel, kerosene-type jet fuel,
// and RBOB regular gasoline spot prices (New York Harbor / US Gulf Coast / Los Angeles, per whichever
// duoarea the live response carries) in $/GAL; Mont Belvieu, TX propane spot price in $/GAL. This is
// exactly the "fuel and energy strip" the Market Intel spec names as unbuilt (docs/specs/
// 02-market-intel.md row 8: "jet kerosene, marine gasoil/VLSFO proxies, EU diesel by member state, SAF
// premium where obtainable") minus the two legs (marine bunker fuel, SAF) this session found NO free
// official source for — EIA discontinued its residual/bunker fuel-oil spot-price series years ago and
// tracks no SAF price at all; inventing either here would be exactly the "populated, visible and wrong is
// worse than empty" failure mode this codebase's own DESNZ incident (see producers.yml's header) warns
// against. WTI/Brent/diesel/jet-fuel/gasoline/propane are real, live, and free.
//
// SERIES_KEY DERIVATION — NEVER FROM A GUESSED AREA CODE. EIA's own `series` field (e.g. "RWTC") is a
// stable, EIA-assigned identity for one exact product x area x process line — this parser lower-cases it
// verbatim as the series_key suffix (`eia-v2:<product-slug>-<series-id>`) rather than trying to encode
// duoarea/process meaning itself, so a series_key never asserts a geography this parser did not actually
// read from the response. Falls back to a slugified `duoarea-process` pair only on the (undocumented,
// defensive-only) case where a row carries no `series` field at all.
//
// ENVELOPE. Every row: derivation="observed" (EIA's own reported/surveyed spot price, not a calculation),
// origin_class="official" (a US federal statistical agency), currency="USD" (every EIA petroleum spot
// price is USD-denominated by construction — a fact about the dataset, not a per-row assumption), unit
// taken verbatim from the response's own `units` field (never hardcoded), n_observations=null (a spot
// price is a point observation, not a sample aggregate).
//
// THREE INDEPENDENT SAFETY GATES, matching ecb-fx-producer.mjs's contract exactly (the most recent
// producer in this family, and the right precedent for a brand-new, never-yet-run producer):
//   1. ENABLED (below) — a plain top-level `const`, false at authorship. Flipping it is a REVIEWED CODE
//      CHANGE; arming is a later, separate commit, never a runtime toggle.
//   2. --apply on the command line + MARKET_PRODUCER_EIA_V2_ENABLED=1 in the environment (the runtime
//      kill switch; unset/any other value = OFF).
//   3. EIA_API_KEY must be set in the environment for a live fetch to succeed at all — this producer
//      does not fabricate a fetch success; a missing/invalid key surfaces as a NetworkError (exit 3),
//      same posture as ecb-fx-producer.mjs's own network-failure exit code.
// A --dry run (the default) always parses + plans + reports regardless of ENABLED or the kill switch —
// but note a --dry run with no --input still attempts the LIVE fetch (mirrors ecb-fx-producer.mjs), so a
// --dry run with no EIA_API_KEY set and no --input/stdin fixture will also exit 3, honestly, rather than
// pretending to have data.
// Passing --apply while ANY gate is off REFUSES with an explanatory message and exits 1 — never a silent
// downgrade to dry-run, and never a partial write.
//
// Usage:
//   node scripts/producers/market/eia-v2-petroleum-spot-producer.mjs                     # dry run, live fetch (DEFAULT; needs EIA_API_KEY)
//   node scripts/producers/market/eia-v2-petroleum-spot-producer.mjs --input path/to.json # dry run, local EIA API v2 JSON response file
//   cat response.json | node scripts/producers/market/eia-v2-petroleum-spot-producer.mjs  # dry run, stdin
//   node scripts/producers/market/eia-v2-petroleum-spot-producer.mjs --apply              # write (needs ALL THREE gates armed)
// Exit 0 done (including a clean dry run) · 1 refused (a gate is off on --apply, or no DB creds on
// --apply) · 2 bad/empty input · 3 network failure (live fetch, --apply or --dry alike).

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { planMarketSeriesUpsert } from "../../../src/lib/market/write-market-series.mjs";
import { producerFor } from "../../../src/lib/market/series-registry.mjs";
import { readAll, guardedInsert, guardedUpdate } from "../../lib/db.mjs";

// ── Gate 1: the reviewed-code-change switch. False at authorship (lane SURF). ────────────────────────
const ENABLED = false;

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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected, or no creds needed for --dry */ }

function slugify(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

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
  const { apply, inputPath } = parseArgs(process.argv);

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
