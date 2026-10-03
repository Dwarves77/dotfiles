#!/usr/bin/env node
// sbti-target-dashboard-producer.mjs, a market_series producer (WO-16's registry pattern, keyPrefix
// "sbti"). Lane L11, 2026-10-03 dispatch. Spec 02 section 7: "SBTi Target Dashboard: per company sector,
// region, near-term and net-zero status including 'commitment removed', target type, scopes, base year,
// temperature classification. Weekly, Thursdays. Free .xls, no login. This is the diffusion engine
// behind the lead-time chart."
//
// *** THIS PRODUCER CANNOT WRITE TODAY. NOT A KILL-SWITCH STATE, A LICENCE GATE. ***
// `fsi-app/src/lib/contracts/source-licence.mjs` already carries a registered entry, `sbti_dashboard`
// (migration 258, verifiedOn 2026-08-12, predates this dispatch), landed by an EARLIER lane that read
// the dashboard's own terms:
//   redistribution: "prohibited", blocker: "\"This does not represent a license to repackage or resell
//   any of the data\"; express permission required from BOTH SBTi and CDP.", substitute: null,
//   note: "Costs nothing to ask... Until then the diffusion/lead-time engine cannot seed from the
//   dashboard. Do NOT substitute CDP: its terms are at least as restrictive."
// This dispatch's own brief and README ("free .xls, no login") name ACCESS, never REDISTRIBUTION.
// Exactly the distinction eia-v2-petroleum-spot-producer.mjs's header draws for EIA ("'free' and
// 'keyless' were always different questions"). Here the two diverge the other way: SBTi's export is
// free and keyless to DOWNLOAD, and explicitly prohibited to REPACKAGE into a product like this one's
// market_series table, which feeds a customer-facing surface (LeadTimeChart.tsx, lane L10). Building a
// live-write path here is exactly the eex-eua class this codebase's own discipline refuses ("a producer
// whose licence basis is guessed... is exactly the fabrication source-licence.mjs exists to refuse").
// Except this time the basis isn't even guessed, it is ALREADY ON FILE, dated, and unambiguous.
//
// WHAT THIS LANE BUILDS ANYWAY (CLAUDE.md rule 13, "a flag is a commitment... deliver it decision-ready
// where a ruling blocks execution"). The parser, the aggregation (per-sector near-term/net-zero lead
// time in years, plus explicit "commitment removed" survivorship counts, never silently dropped), and
// the full guarded-write plumbing are built and tested end-to-end, EXCEPT the write itself, which
// `decideApply` below refuses UNCONDITIONALLY, citing this exact blocker, regardless of ENABLED, the
// runtime kill switch, or DB creds. A --dry run (reading the live public .xlsx, parsing it, printing a
// plan) is not a redistribution act, nothing leaves this process, so this lane could, and did, run a
// live dry verification (see this lane's report) without seeking anyone's permission first. Flipping the
// write path on requires the licence question to be resolved (SBTi/CDP's permission, or source-
// licence.mjs's own entry changing), which is the coordinator's and operator's call, not this lane's.
//
// SOURCE FILE, CONFIRMED LIVE THIS SESSION (not the generic ".xls, no login" of the spec table, the
// spec's own shorthand; the actual files are modern OOXML .xlsx, confirmed by fetching
// https://sciencebasedtargets.org/target-dashboard and reading its two download links):
//   https://files.sciencebasedtargets.org/production/files/targets-excel.xlsx, ~5.8 MB, one sheet
//   named "WebsiteData" (confirmed via its own xl/workbook.xml), ~40,000 per-target rows. This producer
//   reads THIS file (not companies-excel.xlsx, the company-level roster) because it alone carries the
//   per-target base_year/target_year pair a lead-time figure needs.
// HEADER ROW, CONFIRMED LIVE (28 columns, A:AB, never assumed by position, resolved by name below):
//   row_entry_id, sbti_id, company_name, isin, lei, location, region, sector, organization_type,
//   validation_route, action, commitment_type, commitment_deadline, status, status_reason,
//   full_target_language, company_temperature_alignment, target, target_wording, scope, target_value,
//   type, sub_type, target_classification_short, base_year, target_year, year_type, date_published.
// `status` carries "Active", "Removed", and other values (e.g. "Other") this parser does not need to
// enumerate exhaustively, see the aggregation contract below for exactly which are counted and how.
// `target` carries "Near-term" | "Net-zero" (confirmed live, both values observed in the first page of
// rows). `base_year`/`target_year` are 4-digit years, stored as EITHER a shared string or a bare numeric
// cell depending on the row (confirmed live: row 2's are shared-string "2024"/"2032", row 3's
// commitment_deadline is a bare numeric Excel serial date), cellText() (reused below) handles both
// uniformly, this parser never assumes one cell-type per column.
//
// XLSX PARSING, NO NEW DEPENDENCY, REUSED NOT REBUILT (lane-common-contract section 6, prior art). `npm ls`
// carries no xlsx/exceljs package (same finding fetch-desnz-factors.mjs's own header recorded
// 2026-09-02). That file already built and tested a minimal ZIP central-directory reader
// (readZip, stored+deflate via node:zlib inflateRawSync) plus OOXML sheet/sharedStrings/row parsers
// (parseSheetNames, parseSharedStrings, parseSheetRows, cellText, cellNumber). This producer IMPORTS
// those exports directly rather than rebuilding a second copy, the exact duplication F45 exists to
// catch, and the exact mistake this repo's own discipline has caught twice before (prior-art rule's own
// citation of the EUR-Lex-through-Cellar route). See fetch-desnz-factors.mjs's header for that toolkit's
// own documentation.
//
// AGGREGATION CONTRACT, WHY market_series (A NUMERIC TIME-SERIES TABLE) CAN CARRY A CATEGORICAL
// PER-COMPANY DATASET AT ALL. It cannot, directly, market_series rows are (series_key, reference_period)
// -> one number. This producer therefore computes, per sector, PER WEEKLY PULL, three honestly-labelled
// aggregates rather than writing 40,000 raw per-company rows (which would also themselves be the exact
// redistribution the licence blocks, several times over):
//   1. `sbti:near-term-lead-time-<sector-slug>`, mean(target_year - base_year) in years, over rows
//      where status == "Other" (exact, case-insensitive, see the TWICE CORRECTED note at this
//      function's own call site: this lane tried "Active" then "Validated Targets" first, both
//      [REFUTED] by a direct count over all 40,883 live rows; "Other" is the status that actually
//      carries a present base_year/target_year, empirically, not by name) AND target == "Near-term" AND
//      both years are valid 4-digit integers with target_year > base_year. unit "years", n_observations = the sample
//      count feeding the mean (never omitted, this is exactly what lets the eventual chart (lane L10)
//      render "not forecastable" under a minimum sample, per the build plan's own acceptance test,
//      instead of a fabricated position from n=1).
//   2. `sbti:net-zero-lead-time-<sector-slug>`, the same computation, target == "Net-zero".
//   3. `sbti:commitment-removed-<sector-slug>`, COUNT of rows whose status contains "removed"
//      (case-insensitive), REGARDLESS of whether that row has usable base/target years. Survivorship is
//      never silently dropped (spec 02 section 7's own warning, this dispatch's own integrity rule): a
//      company that exited its commitment is counted here, every week, not excluded from the dataset by
//      virtue of failing the lead-time rows' stricter validity checks. unit "companies",
//      n_observations null (a direct tally is not a sampled estimate; nothing to caveat).
// Every other row (wrong action="Commitment" with no approved target yet, status outside Active/Removed,
// missing/malformed sector or years, an unrecognised target value) is excluded from the aggregate and
// counted in a `skipReasons` tally this producer prints as a few summary lines, NOT one warning line per
// row as ecb-fx-producer.mjs/eia-v2-petroleum-spot-producer.mjs do for their own (tens-of-rows) feeds;
// at ~40,000 rows, most of which are "Commitment" placeholders with no target years at all, a per-row
// warning would flood the log without adding information. This is a deliberate, disclosed departure from
// those two producers' per-row warning convention, not a silent-drop regression, every exclusion reason
// is counted and printed, just batched by reason rather than by row.
//
// reference_period / as_at_date, NEVER A CLOCK READ (same rule ecb-fx/eia-v2 state: pure parser, no
// `new Date()`). Unlike ECB's single dated <Cube time=...> or EIA's per-row `period`, this dataset
// carries no single "as of" field for the whole pull; `date_published` IS per-row, though, so this
// producer uses the MAXIMUM date_published (an Excel serial date, converted to YYYY-MM-DD) across the
// rows that feed EACH aggregate as that aggregate's own reference_period/as_at_date, a fact read out of
// the data itself, not the wall clock. A sector aggregate whose contributing rows carry no parseable
// date_published is skipped with a named warning (never assigned a fabricated date, mirrors
// write-market-series.mjs's own "a NULL reference_period would silently multiply duplicate rows" guard,
// caught one step earlier here so the reason is legible instead of a generic "skipped, no
// reference_period" line).
//
// ENVELOPE. derivation="calculated" (an arithmetic aggregate over stated inputs, not a directly observed
// single figure, the 9-value vocabulary's own distinction from "observed", which EIA/ECB correctly use
// for their unmodified point prices). origin_class="derived" ("Our calculation from stated inputs under
// a named, versioned method", src/lib/contracts/vocabularies.mjs's own definition, matching exactly;
// "official"/"verified" would overstate this: the number is OUR aggregate of SBTi's rows, not an
// unmodified SBTi figure). method_version="sbti-lead-time-v1" (so a future method change is told apart
// from a data change in the same series, per the envelope's own column comment). source_key=
// "sbti_dashboard", the ALREADY-REGISTERED data_sources row (migration 258; confirmed by this session's
// own grep of source-licence.mjs and that migration's seed block), no new migration, no new source
// registration; this lane's own "migration number: none" instruction holds exactly because the FK target
// already exists, independent of the licence gate above (a row can be registered as a KNOWN, RATED
// source and still be write-blocked for redistribution, two different questions, same as the
// EIA/ECB producers' own "free vs licensed" distinction, just resolved oppositely here).
//
// Usage:
//   node scripts/producers/market/sbti-target-dashboard-producer.mjs                      # dry run, live fetch (DEFAULT)
//   node scripts/producers/market/sbti-target-dashboard-producer.mjs --input path/to.xlsx  # dry run, local xlsx file
//   node scripts/producers/market/sbti-target-dashboard-producer.mjs --apply               # ALWAYS refused, licence gate (exit 1)
// Exit 0 done (including a clean dry run) · 1 refused (licence gate on --apply, or no DB creds) · 2
// bad/empty input or structural failure (no "WebsiteData" sheet, no header row) · 3 network failure.

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
    const entry = { years: leadYears, date: r.datePublishedIso };
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
      const mean = entries.reduce((s, e) => s + e.years, 0) / entries.length;
      seriesRows.push({
        series_key: `sbti:${kind}-lead-time-${slug}`,
        label: `${label} target lead time (base year to target year), ${sector}, SBTi Target Dashboard`,
        value_numeric: roundTo1dp(mean),
        unit: "years",
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
