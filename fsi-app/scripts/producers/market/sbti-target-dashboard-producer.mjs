#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { planMarketSeriesUpsert } from "../../../src/lib/market/write-market-series.mjs";
import { producerFor } from "../../../src/lib/market/series-registry.mjs";
import { readAll, guardedInsert, guardedUpdate } from "../../lib/db.mjs";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";
// DAG authorship at write time (rule 17, see this file's own write-path comment below for why this is
// wired despite being unreachable while the licence gate stands).
import { authorMarketSeriesDeltaEdges, assertEdgesAuthoredAndRecordSummary } from "./author-market-series-delta.mjs";
import { slugify } from "./slugify.mjs";
// Reused, not rebuilt (lane-common-contract section 6 prior art), see this file's own header.
import {
  readZip,
  parseSheetNames,
  parseSharedStrings,
  parseSheetRows,
  cellText,
} from "../../gen/fetch-desnz-factors.mjs";

const PRODUCER_NAME = "sbti-target-dashboard";

// ── Gate 0 (above the usual three), THE LICENCE GATE. See this file's header. Never flipped by a
// runtime env var; flipping it is a reviewed-code change that must cite a resolved licence question
// (source-licence.mjs's own 'sbti_dashboard' entry changing, or documented express permission), never a
// dispatch convenience. ────────────────────────────────────────────────────────────────────────────────
export const LICENCE_BLOCK = Object.freeze({
  sourceKey: "sbti_dashboard",
  reason:
    "LICENCE BLOCKED, fsi-app/src/lib/contracts/source-licence.mjs's 'sbti_dashboard' entry (migration " +
    "258, verifiedOn 2026-08-12) states redistribution=\"prohibited\": \"This does not represent a " +
    "license to repackage or resell any of the data\"; express permission required from BOTH SBTi and " +
    "CDP. This producer cannot write market_series rows from this source until that permission exists " +
    "(or the register entry changes), a reviewed code change citing the resolution, never a runtime " +
    "flag. Re-run without --apply to see the plan (a dry run reads and reports; it does not redistribute).",
});

// ── Gate 1: the reviewed-code-change switch. False at authorship, same posture every other new producer
// in this family ships with, and here it can never meaningfully become true while the licence gate
// above exists, since decideApply refuses --apply unconditionally regardless of this constant.
const ENABLED = false;

const KILL_SWITCH_ENV = "MARKET_PRODUCER_SBTI_ENABLED";
const REGISTRY_ENTRY = producerFor("sbti");

const SBTI_TARGETS_XLSX_URL = "https://files.sciencebasedtargets.org/production/files/targets-excel.xlsx";
const SHEET_NAME = "WebsiteData";
const SHARED_STRINGS_PATH = "xl/sharedStrings.xml";

// Header labels, confirmed live (see header), resolved by NAME against row 1's own cell text, never by
// column letter/position (same rule findHeaderBlocks/parseSheetNames already enforce elsewhere in this
// codebase for exactly this reason: a source's column order is not a contract).
const FIELD_NAMES = Object.freeze({
  sector: "sector",
  status: "status",
  action: "action",
  target: "target",
  baseYear: "base_year",
  targetYear: "target_year",
  datePublished: "date_published",
  companyName: "company_name",
});

export class StructureError extends Error {}
export class NetworkError extends Error {}

loadLocalEnvFile();

// slugify: reused from slugify.mjs (extracted from eia-v2-petroleum-spot-producer.mjs's own prior local
// copy, same session, rather than a second hand-written duplicate, F45/prior-art).

/** Excel serial date (days since 1899-12-30, the documented Excel epoch, incl. its leap-year bug) ->
 *  "YYYY-MM-DD". Pure, no clock read; a fixed numeric input always maps to the same date. Returns null
 *  for a non-finite input (never fabricates a date from a bad cell). */
export function excelSerialToIsoDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
  const ms = EXCEL_EPOCH_UTC_MS + Math.round(n) * 86400000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve the header row (row 1) -> { fieldName: colLetter }, by matching each cell's own text against
 * FIELD_NAMES' values (trim + lower-case; the live header is already exactly this snake_case text, this
 * is defensive normalisation, not fuzzy matching). Throws if any required field is not found, a changed
 * header is a structural failure to report, never a guessed column.
 *
 * @param {Array<{rowNum:number, cells:Map}>} rows @param {string[]} sharedStrings
 * @returns {Record<string,string>}
 */
export function resolveHeaderColumns(rows, sharedStrings) {
  const headerRow = rows.find((r) => r.rowNum === 1);
  if (!headerRow) throw new StructureError('no row 1 found, cannot resolve the header');
  const byLabel = new Map();
  for (const [col, cell] of headerRow.cells.entries()) {
    const label = cellText(cell, sharedStrings).trim().toLowerCase();
    if (label) byLabel.set(label, col);
  }
  const columns = {};
  const missing = [];
  for (const [field, label] of Object.entries(FIELD_NAMES)) {
    const col = byLabel.get(label);
    if (!col) missing.push(label);
    else columns[field] = col;
  }
  if (missing.length > 0) {
    throw new StructureError(
      `header row is missing expected column(s): ${missing.join(", ")}, the live sheet's own header no ` +
        `longer matches what this parser was built against; it refuses rather than guess a column`,
    );
  }
  return columns;
}

/**
 * Rows (from parseSheetRows) + sharedStrings + the resolved header columns -> plain per-target objects.
 * Pure, no fs/fetch/clock. Skips row 1 (the header itself).
 *
 * @returns {Array<{sector:string, status:string, action:string, target:string, baseYear:(number|null),
 *   targetYear:(number|null), datePublishedIso:(string|null), companyName:string}>}
 */
export function extractSbtiTargetRows(rows, sharedStrings, columns) {
  const out = [];
  for (const row of rows) {
    if (row.rowNum === 1) continue;
    const get = (field) => cellText(row.cells.get(columns[field]), sharedStrings);
    const baseYearRaw = get("baseYear");
    const targetYearRaw = get("targetYear");
    const datePublishedCell = row.cells.get(columns.datePublished);
    out.push({
      sector: get("sector").trim(),
      status: get("status").trim(),
      action: get("action").trim(),
      target: get("target").trim(),
      baseYear: baseYearRaw ? Number(baseYearRaw) : null,
      targetYear: targetYearRaw ? Number(targetYearRaw) : null,
      datePublishedIso: datePublishedCell ? excelSerialToIsoDate(cellText(datePublishedCell, sharedStrings)) : null,
      companyName: get("companyName").trim(),
    });
  }
  return out;
}

const VALID_YEAR_RE_MIN = 1990;
const VALID_YEAR_RE_MAX = 2100;

function isValidYear(n) {
  return Number.isInteger(n) && n >= VALID_YEAR_RE_MIN && n <= VALID_YEAR_RE_MAX;
}

/**
 * The aggregation contract, see this file's header "AGGREGATION CONTRACT" section for the full
 * rationale. Pure, no fs/fetch/clock; `datePublishedIso` is read off each row (already converted by
 * extractSbtiTargetRows), never freshly computed from a clock here.
 *
 * @param {Array<object>} dataRows from extractSbtiTargetRows
 * @returns {{ seriesRows: Array<object>, skipReasons: Map<string,number>, sectorCount: number }}
 */
export function aggregateSbtiTargetRows(dataRows) {
  const bySector = new Map(); // sector -> { nearTerm:[{years,date}], netZero:[{years,date}], removedCount, removedMaxDate }
  const skipReasons = new Map();
  const bump = (reason) => skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);

  for (const r of dataRows ?? []) {
    const sector = r.sector;
    if (!sector) { bump("missing sector"); continue; }
    if (!bySector.has(sector)) {
      bySector.set(sector, { nearTerm: [], netZero: [], removedCount: 0, removedMaxDate: null });
    }
    const bucket = bySector.get(sector);

    // Survivorship FIRST, before any years/target-type validity check, a removed commitment is counted
    // even when it otherwise fails every other validity check below (spec 02 section 7's own warning;
    // this dispatch's own integrity rule: "never silently drop a company that exited").
    if (/removed/i.test(r.status)) {
      bucket.removedCount += 1;
      if (r.datePublishedIso && (!bucket.removedMaxDate || r.datePublishedIso > bucket.removedMaxDate)) {
        bucket.removedMaxDate = r.datePublishedIso;
      }
      continue;
    }

    // TWICE CORRECTED against the LIVE file (this lane's own dry runs against the real
    // targets-excel.xlsx, 2026-10-03). [CONFIRMED by direct count over all 40,883 live rows, not
    // guessed]: the status value that actually carries a row with a real, present base_year AND
    // target_year is overwhelmingly **"Other"** (28,795 of 28,895 "Other" rows; the rest split across
    // "Legacy" [35] and "Inactive" [10]), NOT "Active" (2,930 rows, 0 with any year) and NOT "Validated
    // Targets" (6,036 rows, 0 with any year) either, both of which this lane tried and both of which
    // were [REFUTED] by this same live count. "Active"/"Validated Targets" appear to be a DIFFERENT
    // grain (company/commitment-level rollup rows with no per-target detail), while "Other" is the
    // per-target row's own status for a currently-published target with no special handling.
    // Confirmed by: (a) direct count, (b) this producer's own NAME-based header resolution (never a
    // guessed column letter, resolveHeaderColumns found status at column N independently both times).
    // [HYPOTHESIS, not verified]: WHY SBTi's own export labels its normal/current per-target status
    // "Other" rather than something like "Active" or "Published" is not something this lane can verify
    // from the data alone, flagged to the coordinator/operator as an open question, not guessed at
    // here. "Legacy" (status_reason "Company change") and "Inactive" (status_reason "Withdrawn target")
    // DO carry old base/target years but represent a superseded/withdrawn target, not today's current
    // commitment pace, deliberately excluded from the lead-time average (they fall through to the
    // generic skip-reason tally below), same reasoning "Removed" is excluded from it (handled separately
    // as survivorship, above). Every status this parser does not specifically handle (Active, Validated
    // Targets, Legacy, Legacy extension, Inactive, Extended, Withdrawn commitment) is counted in
    // skipReasons, never silently merged into either bucket without this documented basis.
    if (r.status.toLowerCase() !== "other") {
      bump(`status not Other/Removed ("${r.status || "blank"}")`);
      continue;
    }
    if (!isValidYear(r.baseYear)) { bump("missing/invalid base_year"); continue; }
    if (!isValidYear(r.targetYear)) { bump("missing/invalid target_year"); continue; }
    const leadYears = r.targetYear - r.baseYear;
    if (!(leadYears > 0)) { bump("target_year not after base_year"); continue; }

    const target = r.target.toLowerCase();
    // MONTHS, not years (fixed 2026-10-03, same session, after merging lane L10's own
    // lead-time-position.mjs / LeadTimeChart.tsx, both built against this producer's output in
    // parallel). Spec 02 section 6 item 5 names the chart's own axis explicitly: "Lead-time position
    // chart (months axis)". L10's monthsValue() gates on unit === "months" exactly, never coercing a
    // different unit. This producer's own fields only carry a YEAR granularity (base_year/target_year),
    // so months is a derived precision this data cannot actually support finer than whole years allow,
    // computed as leadYears * 12, not a fabricated sub-year precision.
    const entry = { months: leadYears * 12, date: r.datePublishedIso };
    if (target === "near-term") bucket.nearTerm.push(entry);
    else if (target === "net-zero") bucket.netZero.push(entry);
    else bump(`unrecognised target type ("${r.target || "blank"}")`);
  }

  function roundTo1dp(n) { return Math.round(n * 10) / 10; }
  function maxDate(entries) {
    let max = null;
    for (const e of entries) if (e.date && (!max || e.date > max)) max = e.date;
    return max;
  }

  const seriesRows = [];
  for (const [sector, bucket] of bySector.entries()) {
    const slug = slugify(sector);
    if (!slug) { bump(`sector slug empty for "${sector}"`); continue; }

    for (const [kind, entries, label] of [
      ["near-term", bucket.nearTerm, "Near-term"],
      ["net-zero", bucket.netZero, "Net-zero"],
    ]) {
      if (entries.length === 0) continue;
      const refPeriod = maxDate(entries);
      if (!refPeriod) { bump(`sector "${sector}" ${kind}: no parseable date_published across ${entries.length} contributing row(s), aggregate skipped`); continue; }
      const mean = entries.reduce((s, e) => s + e.months, 0) / entries.length;
      seriesRows.push({
        series_key: `sbti:${kind}-lead-time-${slug}`,
        label: `${label} target lead time (base year to target year), ${sector}, SBTi Target Dashboard`,
        value_numeric: roundTo1dp(mean),
        unit: "months",
        currency: null,
        derivation: "calculated",
        origin_class: "derived",
        source_key: LICENCE_BLOCK.sourceKey,
        source_ref: `SBTi Target Dashboard, targets-excel.xlsx, sheet "${SHEET_NAME}", sector "${sector}", ${entries.length} ${kind} row(s) as of ${refPeriod}`,
        n_observations: entries.length,
        method_version: "sbti-lead-time-v1",
        as_at_date: refPeriod,
        reference_period: refPeriod,
      });
    }

    if (bucket.removedCount > 0) {
      if (!bucket.removedMaxDate) {
        bump(`sector "${sector}" commitment-removed: no parseable date_published across ${bucket.removedCount} removed row(s), aggregate skipped`);
      } else {
        seriesRows.push({
          series_key: `sbti:commitment-removed-${slug}`,
          label: `Commitments removed (survivorship), ${sector}, SBTi Target Dashboard`,
          value_numeric: bucket.removedCount,
          unit: "companies",
          currency: null,
          derivation: "calculated",
          origin_class: "derived",
          source_key: LICENCE_BLOCK.sourceKey,
          source_ref: `SBTi Target Dashboard, targets-excel.xlsx, sheet "${SHEET_NAME}", sector "${sector}", ${bucket.removedCount} removed row(s) as of ${bucket.removedMaxDate}`,
          n_observations: null,
          method_version: "sbti-lead-time-v1",
          as_at_date: bucket.removedMaxDate,
          reference_period: bucket.removedMaxDate,
        });
      }
    }
  }

  return { seriesRows, skipReasons, sectorCount: bySector.size };
}

/**
 * Open an xlsx zip buffer -> { sheetXml, sharedStringsXml }, resolving the "WebsiteData" sheet by NAME
 * through workbook.xml + its rels (never by position/filename guess, parseSheetNames, reused).
 */
export function extractSheetAndSharedStrings(zipBuffer) {
  const zip = readZip(zipBuffer);
  const workbookXml = zip.read("xl/workbook.xml").toString("utf8");
  const relsXml = zip.read("xl/_rels/workbook.xml.rels").toString("utf8");
  const sheets = parseSheetNames(workbookXml, relsXml);
  const sheetInfo = sheets[SHEET_NAME];
  if (!sheetInfo || !sheetInfo.path) {
    throw new StructureError(
      `no sheet named "${SHEET_NAME}" found in the workbook (sheets present: ${Object.keys(sheets).join(", ") || "none"})`,
    );
  }
  const sheetXml = zip.read(sheetInfo.path).toString("utf8");
  const sharedStringsXml = zip.has(SHARED_STRINGS_PATH) ? zip.read(SHARED_STRINGS_PATH).toString("utf8") : "";
  return { sheetXml, sharedStringsXml };
}

/**
 * Pure gating decision, no I/O. UNLIKE every other market producer's decideApply, this one refuses
 * --apply UNCONDITIONALLY (the licence gate), checked FIRST, before ENABLED/kill-switch/creds, so even
 * a future accidental ENABLED=true or kill-switch-on can never reach a write while the licence question
 * is unresolved. See this file's header.
 * @returns {{ canWrite: boolean, reason: string }}
 */
export function decideApply({ apply, enabled, killSwitchOn, hasCreds }) {
  if (!apply) return { canWrite: false, reason: "dry run (no --apply), parse + plan only, nothing written" };
  // Licence gate, always first, always refuses, regardless of every other argument. If the licence
  // question is ever resolved, the gate ORDER to restore here (matching ecb-fx/eia-v2's own three-gate
  // shape exactly) is: enabled -> killSwitchOn -> hasCreds -> canWrite true. `enabled`/`killSwitchOn`/
  // `hasCreds` are accepted as parameters (unused today) so that restoration is a one-line diff, not a
  // signature change, when that day comes.
  void enabled; void killSwitchOn; void hasCreds;
  return { canWrite: false, reason: LICENCE_BLOCK.reason };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const inputIdx = args.indexOf("--input");
  return { apply: args.includes("--apply"), inputPath: inputIdx >= 0 ? args[inputIdx + 1] : null };
}

async function fetchSbtiTargetsXlsx() {
  let res;
  try {
    res = await fetch(SBTI_TARGETS_XLSX_URL, { headers: { accept: "application/octet-stream" } });
  } catch (err) {
    throw new NetworkError(`sbti-target-dashboard-producer: live fetch threw (${err.message}) for ${SBTI_TARGETS_XLSX_URL}`);
  }
  if (!res.ok) {
    throw new NetworkError(`sbti-target-dashboard-producer: live fetch failed ${res.status} ${res.statusText} for ${SBTI_TARGETS_XLSX_URL}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

const cite = {
  skill: "market-series-spine (WO-16), lane L11 (2026-10-03)",
  reason: "SBTi Target Dashboard per-sector lead-time + survivorship aggregates upsert into market_series, keyed (series_key, reference_period).",
};

async function main() {
  const { apply, inputPath } = parseArgs(process.argv);

  let buf;
  if (inputPath) {
    buf = readFileSync(inputPath);
  } else {
    buf = await fetchSbtiTargetsXlsx();
  }

  const { sheetXml, sharedStringsXml } = extractSheetAndSharedStrings(buf);
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const rows = parseSheetRows(sheetXml);
  const columns = resolveHeaderColumns(rows, sharedStrings);
  const dataRows = extractSbtiTargetRows(rows, sharedStrings, columns);
  const { seriesRows: parsedRows, skipReasons, sectorCount } = aggregateSbtiTargetRows(dataRows);

  console.log(
    `sbti-target-dashboard-producer: parsed ${dataRows.length} per-target row(s) across ${sectorCount} ` +
      `sector(s), computed ${parsedRows.length} series row(s)${apply ? "" : " (DRY RUN)"}`,
  );
  for (const [reason, count] of skipReasons.entries()) {
    console.warn(`[aggregate] ${count} row(s) excluded: ${reason}`);
  }

  if (parsedRows.length === 0) {
    console.log("nothing to plan, exiting.");
    process.exit(0);
  }

  const decision = decideApply({
    apply,
    enabled: ENABLED,
    killSwitchOn: process.env[KILL_SWITCH_ENV] === "1",
    hasCreds: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  });

  if (apply && !decision.canWrite) {
    console.error(`sbti-target-dashboard-producer: ${decision.reason} (exit 1).`);
    process.exit(1);
  }

  const existing = decision.canWrite
    ? (await readAll("market_series", "id, series_key, reference_period")).filter((r) => r.series_key.startsWith(`${REGISTRY_ENTRY?.keyPrefix ?? "sbti"}:`))
    : [];

  const { toCreate, toUpdate, skippedNoReferencePeriod } = planMarketSeriesUpsert(existing, parsedRows);
  for (const r of skippedNoReferencePeriod) {
    console.warn(`[plan] skipped ${r.series_key}: no reference_period`);
  }
  console.log(`sbti-target-dashboard-producer: plan, ${toCreate.length} to create, ${toUpdate.length} to update, ${skippedNoReferencePeriod.length} skipped`);

  if (!decision.canWrite) {
    for (const r of toCreate) console.log(`  would create  ${r.series_key} @ ${r.reference_period}  ${r.value_numeric} ${r.unit} (n=${r.n_observations ?? "n/a"})`);
    for (const u of toUpdate) console.log(`  would update  id=${u.id}  ${u.patch.value_numeric} ${u.patch.unit}`);
    console.log(`DRY RUN, nothing written (${decision.reason}).`);
    process.exit(0);
  }

  // Unreachable while the licence gate stands (decideApply always refuses --apply above); kept so the
  // full write path exists, tested, ready for the day the licence question resolves.
  let created = 0, updated = 0;
  for (const r of toCreate) {
    await guardedInsert("market_series", r, { cite });
    created += 1;
  }
  for (const u of toUpdate) {
    await guardedUpdate("market_series", (qb) => qb.eq("id", u.id), { ...u.patch, updated_at: new Date().toISOString() }, { cite });
    updated += 1;
  }
  console.log(`done, ${created} created, ${updated} updated (${parsedRows.length} rows parsed).`);

  // DAG authorship at write time (rule 17 / fsi-app/src/lib/propagation/producer-edge-authorship.test.mjs
  //, every scripts/producers/**/*.mjs file that writes a DAG source table must also author its own
  // derivation_edges, mirroring ecb-fx-producer.mjs/eia-v2-petroleum-spot-producer.mjs exactly). Kept
  // here even though this call is unreachable while the licence gate stands (decideApply refuses --apply
  // above, always), the static rule-17 scan checks every producer file that writes market_series, not
  // only the ones whose write path is currently reachable, so this wiring exists now rather than being a
  // second reviewed change the day the licence question resolves.
  const touchedSeriesKeys = new Set(parsedRows.map((r) => r.series_key));
  const authorCounts = await authorMarketSeriesDeltaEdges(touchedSeriesKeys, "apply", {});
  console.log(
    `sbti-target-dashboard-producer: DAG authorship (market_series_delta): authored=${authorCounts.authored} ` +
      `already=${authorCounts.skippedAlready} insufficient-history=${authorCounts.insufficientHistory} ` +
      `unit-mismatch=${authorCounts.unitMismatch} refused=${authorCounts.refused} ` +
      `unknown-method=${authorCounts.unknownMethod} errored=${authorCounts.errored}`,
  );
  assertEdgesAuthoredAndRecordSummary(PRODUCER_NAME, created + updated, authorCounts, parsedRows.length);

  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    if (err instanceof StructureError) {
      console.error(`sbti-target-dashboard-producer: STRUCTURAL FAILURE, ${err.message}`);
      process.exit(2);
    }
    if (err instanceof NetworkError) {
      console.error(err.message);
      process.exit(3);
    }
    console.error(err);
    process.exit(1);
  });
}
