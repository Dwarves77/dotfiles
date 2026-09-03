#!/usr/bin/env node
// fetch-desnz-factors.mjs — the runner-side fetch+extract step the DESNZ fixture header (2026-09-02,
// lane PROD-FIX entry) named as needed: reads the published "Greenhouse gas reporting: conversion
// factors 2025" (DESNZ) full-set .xlsx and extracts the seven freighting-goods air/sea rows the fixture's
// `needs_runner_fetch: true` shells describe — air (domestic / short-haul international / long-haul
// international, with an automatic with-RF/without-RF split IF the sheet distinguishes them) and sea
// (container ship average, bulk carrier average, general cargo average, RoRo), all per tonne.km.
//
// WHY THIS EXISTS SEPARATELY FROM emission-factors-desnz.mjs. That script SEEDS the DB from an already-
// filled fixture; it never fetches. This script FILLS the fixture from the primary source, run once (or
// whenever the DESNZ factor set changes), on a runner that can reach gov.uk — this authoring sandbox
// cannot (see the fixture's own header, 2026-09-02 entry: WebFetch on the .xlsx URL returns the literal
// string "[binary data]", and a direct curl gets "403 from proxy after CONNECT" — the org egress proxy
// does not allowlist assets.publishing.service.gov.uk). NOTHING NUMERIC IN THIS FILE WAS READ FROM THE
// PRIMARY WORKBOOK; every figure this script would produce comes from parsing bytes handed to it at run
// time, never a literal written here.
//
// XLSX PARSING, NO NEW DEPENDENCY. `npm ls` here shows no xlsx/exceljs/zip package in package.json (this
// lane's own check, 2026-09-02). An .xlsx is a zip of XML parts; readZip() below is a minimal ZIP central-
// directory reader (stored + deflate methods only, via node:zlib's inflateRawSync — no zip64, unneeded
// under ~2 MB) and the OOXML helpers below read just enough of workbook.xml / *.rels / sharedStrings.xml /
// a sheet's XML to answer "what is in this cell". This mirrors, in spirit, fetch-oil-bulletin.mjs's
// existing solution to the identical problem for a different EU workbook — that script shells out to the
// system `unzip` binary; this one reads the zip container itself so scripts/gen has no runtime dependency
// on an external binary being on PATH.
//
// STRUCTURAL VERIFICATION, NOT POSITIONAL TRUST. Every one of these was a real defect the 2026-08-30
// manual verification (see the fixture header) found in this exact workbook and this exact sheet, so this
// extractor is built to never repeat them:
//   1. The sheet is resolved BY NAME through workbook.xml -> *.rels ("Freighting goods" -> rId -> path),
//      never by position ("sheet31.xml" is NOT assumed).
//   2. The "Freighting goods" sheet reuses its Activity/Type/Unit/kg-CO2e header row after every section
//      break (rows 41, 69, 106 in the verified 2025 workbook were all repeats). Column meaning is resolved
//      from the NEAREST PRECEDING header row above a given data row, never from one hardcoded column
//      letter for the whole sheet — the exact trap that made an HGV row's average-laden total live in
//      column P while column D (0% laden) was silently zero.
//   3. Air/sea freight rows are matched by their Activity+Type+Unit TEXT (a small regex per target,
//      documented at TARGETS below), never by row number — row numbers move when DESNZ edits a table.
//   4. If a target's Activity+Type+Unit search finds zero rows, more than one row it cannot explain as a
//      with-RF/without-RF pair, an empty/non-numeric total cell, or a fuel/energy-carrier column in scope
//      (meaning this extractor's "air/sea are not split by fuel" assumption was wrong) — it throws
//      DesnzStructureError and writes NOTHING. A partially filled run never happens: applyToFixture()
//      requires every target resolved before it will return a rows array to write.
//
// energy_carrier, A DESCRIPTIVE DEFAULT, NOT A MEASURED VALUE. Modal scope (migration 258
// emission_factors_scope_modal) REQUIRES energy_carrier NOT NULL, but the "Freighting goods" sheet's
// Air/Sea sections are not expected to split by fuel the way the Vans/HGV sections do (aircraft run on
// jet fuel, ships overwhelmingly on marine fuel; there is no UK domestic-fleet fuel-mix question the way
// there is for vans). This mirrors the ALREADY-SHIPPED precedent in this same fixture: the rail row's
// energy_carrier is "diesel_average" with a source_ref note that DESNZ does not split rail by traction and
// GB freight rail is predominantly diesel-hauled — a documented assumption, not a DESNZ-published split.
// AIR_ENERGY_CARRIER / OCEAN_ENERGY_CARRIER below are the same kind of documented default, and every row
// built from them says so in its own source_ref. If the workbook DOES carry a fuel/energy-carrier column
// in the Air or Sea header block, that assumption was wrong — the extractor throws rather than silently
// discarding a real column (see #4 above).
//
// Usage:
//   node scripts/gen/fetch-desnz-factors.mjs                          # fetch from gov.uk, dry-run report
//   node scripts/gen/fetch-desnz-factors.mjs --xlsx local-file.xlsx   # use an already-downloaded xlsx
//   node scripts/gen/fetch-desnz-factors.mjs --apply                  # write the fixture in place
//   node scripts/gen/fetch-desnz-factors.mjs --report out.txt         # also save the diff report to a file
//   node scripts/gen/fetch-desnz-factors.mjs --fixture path.json      # override the fixture path (tests)
// Exit 0 ok · 2 structural failure (sheet/columns/rows did not match what this extractor expects — the
// report names exactly what) · 3 network failure (page or workbook download failed).

import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE_PATH = resolve(HERE, "fixtures/emission-factors/desnz-modal-defaults-2025.json");

export const SHEET_NAME = "Freighting goods";
export const GOV_UK_PAGE_URL =
  "https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025";
// Known-stable as of the 2026-08-30 in-browser verification cited in the fixture header — used ONLY if
// the page scrape below finds no "full set" .xlsx link, and only with a stderr warning that it fired.
export const FALLBACK_XLSX_URL =
  "https://assets.publishing.service.gov.uk/media/6846a4f55e92539572806125/ghg-conversion-factors-2025-full-set.xlsx";

export const AIR_ENERGY_CARRIER = "aviation_turbine_fuel_average";
export const OCEAN_ENERGY_CARRIER = "marine_fuel_average";

export class DesnzStructureError extends Error {}
export class NetworkError extends Error {}

// ── Minimal ZIP reader (stored + deflate; no zip64 — unneeded under ~2 MB) ─────────────────────────────

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

/** Opens a zip archive buffer. Returns { names(), has(name), read(name) }. read() decompresses. */
export function readZip(buf) {
  const scanFrom = Math.max(0, buf.length - 65557); // EOCD comment is <=65535 bytes; 22 is the fixed part
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= scanFrom; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset < 0) {
    throw new DesnzStructureError("not a valid zip/xlsx: End Of Central Directory record not found");
  }
  const cdEntryCount = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = new Map();
  let p = cdOffset;
  for (let i = 0; i < cdEntryCount; i++) {
    if (buf.readUInt32LE(p) !== CD_SIG) {
      throw new DesnzStructureError(`zip central directory entry ${i} has a bad signature at offset ${p}`);
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.set(name, { method, compressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  function read(name) {
    const e = entries.get(name);
    if (!e) {
      throw new DesnzStructureError(`xlsx has no zip entry "${name}" (entries: ${[...entries.keys()].join(", ")})`);
    }
    const lp = e.localHeaderOffset;
    if (buf.readUInt32LE(lp) !== LFH_SIG) {
      throw new DesnzStructureError(`local file header for "${name}" has a bad signature`);
    }
    const lNameLen = buf.readUInt16LE(lp + 26);
    const lExtraLen = buf.readUInt16LE(lp + 28);
    const dataStart = lp + 30 + lNameLen + lExtraLen;
    const compressed = buf.subarray(dataStart, dataStart + e.compressedSize);
    if (e.method === 0) return compressed;
    if (e.method === 8) return inflateRawSync(compressed);
    throw new DesnzStructureError(
      `xlsx entry "${name}" uses zip compression method ${e.method} — only stored (0) and deflate (8) are supported`,
    );
  }

  return { names: () => [...entries.keys()], has: (name) => entries.has(name), read };
}

function readEntryText(zip, name) {
  return zip.read(name).toString("utf8");
}

// ── Minimal OOXML helpers ────────────────────────────────────────────────────────────────────────────

function decodeXmlEntities(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&"); // must be last: undoes the escaping of the other entities' own '&'
}

function parseTagAttrs(tag) {
  const attrs = {};
  const attrRe = /([a-zA-Z0-9:_-]+)="([^"]*)"/g;
  let m;
  while ((m = attrRe.exec(tag))) attrs[m[1]] = decodeXmlEntities(m[2]);
  return attrs;
}

/** sharedStrings.xml -> string[], indexed exactly as the sheet's t="s" cells reference them. Handles both
 *  plain <si><t>...</t></si> and rich-text <si><r><t>...</t></r>...</si> (concatenated). */
export function parseSharedStrings(xml) {
  if (!xml) return [];
  const strings = [];
  const siRe = /<si>([\s\S]*?)<\/si>|<si\/>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const body = m[1] ?? "";
    const parts = [];
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>|<t[^>]*\/>/g;
    let tm;
    while ((tm = tRe.exec(body))) parts.push(tm[1] ? decodeXmlEntities(tm[1]) : "");
    strings.push(parts.join(""));
  }
  return strings;
}

/** { sheetName: { rId, path } }, resolved by NAME through workbook.xml's <sheet> tags and
 *  workbook.xml.rels's <Relationship> tags — never by position. */
export function parseSheetNames(workbookXml, relsXml) {
  const relMap = new Map();
  const relTagRe = /<Relationship\b[^>]*\/>/g;
  let rm;
  while ((rm = relTagRe.exec(relsXml))) {
    const a = parseTagAttrs(rm[0]);
    if (!a.Id || !a.Target) continue;
    const target = a.Target.startsWith("/") ? a.Target.slice(1) : `xl/${a.Target}`;
    relMap.set(a.Id, target);
  }
  const sheets = {};
  const sheetTagRe = /<sheet\b[^>]*\/>/g;
  let sm;
  while ((sm = sheetTagRe.exec(workbookXml))) {
    const a = parseTagAttrs(sm[0]);
    const rid = a["r:id"];
    if (!a.name || !rid) continue;
    sheets[a.name] = { rId: rid, path: relMap.get(rid) ?? null };
  }
  return sheets;
}

/** One sheet's XML -> rows: [{ rowNum, cells: Map<colLetter, {raw, type}> }], sorted by rowNum. */
export function parseSheetRows(sheetXml) {
  const rows = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rmatch;
  while ((rmatch = rowRe.exec(sheetXml))) {
    const rowAttrs = parseTagAttrs(`<row ${rmatch[1]}/>`);
    const rowNum = Number(rowAttrs.r);
    const body = rmatch[2];
    const cells = new Map();
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cellRe.exec(body))) {
      const cAttrs = parseTagAttrs(`<c ${cm[1]}/>`);
      const ref = cAttrs.r;
      if (!ref) continue;
      const col = ref.match(/^[A-Z]+/)?.[0];
      if (!col) continue;
      const inner = cm[2] ?? "";
      let raw = null;
      if (cAttrs.t === "inlineStr") {
        const tMatch = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        raw = tMatch ? decodeXmlEntities(tMatch[1]) : "";
      } else {
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        raw = vMatch ? vMatch[1] : null;
      }
      cells.set(col, { raw, type: cAttrs.t || "n" });
    }
    if (Number.isFinite(rowNum)) rows.push({ rowNum, cells });
  }
  return rows.sort((a, b) => a.rowNum - b.rowNum);
}

export function cellText(cell, sharedStrings) {
  if (!cell || cell.raw === null || cell.raw === undefined) return "";
  if (cell.type === "s") return sharedStrings[Number(cell.raw)] ?? "";
  return String(cell.raw).trim();
}

export function cellNumber(cell) {
  if (!cell || cell.raw === null || cell.raw === undefined || cell.raw === "") return null;
  const n = Number(cell.raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeLabel(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── Header-block resolution: "which column means what" changes below a repeated header row ─────────────

/** Every row containing Activity + Type + Unit cells (case/format-insensitive) is a header row; a block
 *  runs from just below one header row up to (not including) the next. Throws if none is found at all. */
export function findHeaderBlocks(rows, sharedStrings) {
  const blocks = [];
  for (const row of rows) {
    const texts = [...row.cells.entries()].map(([col, c]) => [col, cellText(c, sharedStrings)]);
    const hasActivity = texts.some(([, t]) => normalizeLabel(t) === "activity");
    const hasType = texts.some(([, t]) => normalizeLabel(t) === "type");
    const hasUnit = texts.some(([, t]) => normalizeLabel(t) === "unit");
    if (hasActivity && hasType && hasUnit) {
      const columns = new Map();
      for (const [col, t] of texts) if (String(t).trim()) columns.set(col, String(t).trim());
      blocks.push({ startRow: row.rowNum, columns });
    }
  }
  if (!blocks.length) {
    throw new DesnzStructureError(
      `no header row found in sheet "${SHEET_NAME}" (looked for a row with Activity, Type and Unit cells)`,
    );
  }
  blocks.sort((a, b) => a.startRow - b.startRow);
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].endRow = i + 1 < blocks.length ? blocks[i + 1].startRow : Infinity;
  }
  return blocks;
}

function headerBlockFor(blocks, rowNum) {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].startRow < rowNum && rowNum < blocks[i].endRow) return blocks[i];
  }
  return null;
}

function findColumnByLabel(block, matchFn, label) {
  const matches = [...block.columns.entries()].filter(([, text]) => matchFn(normalizeLabel(text)));
  if (matches.length !== 1) {
    throw new DesnzStructureError(
      `header block at row ${block.startRow}: expected exactly one "${label}" column, found ${matches.length} ` +
      `(columns: ${[...block.columns.entries()].map(([c, t]) => `${c}="${t}"`).join(", ")})`,
    );
  }
  return matches[0][0];
}

function resolveBlockColumns(block) {
  return {
    activityCol: findColumnByLabel(block, (t) => t === "activity", "Activity"),
    typeCol: findColumnByLabel(block, (t) => t === "type", "Type"),
    unitCol: findColumnByLabel(block, (t) => t === "unit", "Unit"),
    totalCol: findColumnByLabel(block, (t) => t === "kgco2e" || t === "totalkgco2e", "Total kg CO2e"),
    fuelCol: [...block.columns.entries()].find(([, t]) => /fuel|energycarrier/.test(normalizeLabel(t)))?.[0] ?? null,
  };
}

// ── The seven targets, named the way the brief and the fixture shells name them ─────────────────────────

const UNIT_RE = /tonnes?[\s.\-]*km/i;
const ACTIVITY_RE = { air: /\bair\b/i, ocean: /sea|ocean|ship|tanker|vessel|maritime|marine/i };
const WITH_RF_RE = /\bwith\b[\s\S]{0,12}\brf\b/i;
const WITHOUT_RF_RE = /\bwithout\b[\s\S]{0,12}\brf\b/i;

export const TARGETS = [
  { mode: "air", vehicleClass: "air_freight_domestic", typeRe: /domestic/i },
  { mode: "air", vehicleClass: "air_freight_short_haul_international", typeRe: /short[\s.-]?haul/i },
  { mode: "air", vehicleClass: "air_freight_long_haul_international", typeRe: /long[\s.-]?haul/i },
  { mode: "ocean", vehicleClass: "ocean_container_ship_average", typeRe: /container/i },
  { mode: "ocean", vehicleClass: "ocean_bulk_carrier_average", typeRe: /bulk/i },
  { mode: "ocean", vehicleClass: "ocean_general_cargo_average", typeRe: /general\s*cargo/i },
  { mode: "ocean", vehicleClass: "ocean_roro_average", typeRe: /ro[\s.-]?ro/i },
];

/**
 * Extracts the seven (or, if an RF split exists, up to ten) freighting-goods rows from an opened xlsx.
 * Returns a Map<baseVehicleClass, Array<extractedItem>> — one entry per TARGETS row, each holding one or
 * two extracted items (two only for an air target whose matched rows split cleanly into with-RF/without-RF
 * by text). Throws DesnzStructureError, naming exactly what did not resolve, rather than ever guessing.
 */
export function extractFreightingGoodsRows(zip) {
  const workbookXml = readEntryText(zip, "xl/workbook.xml");
  const relsXml = readEntryText(zip, "xl/_rels/workbook.xml.rels");
  const sharedStringsXml = zip.has("xl/sharedStrings.xml") ? readEntryText(zip, "xl/sharedStrings.xml") : "";
  const sharedStrings = parseSharedStrings(sharedStringsXml);

  const sheetMap = parseSheetNames(workbookXml, relsXml);
  const sheetInfo = sheetMap[SHEET_NAME];
  if (!sheetInfo || !sheetInfo.path) {
    throw new DesnzStructureError(
      `workbook has no sheet named "${SHEET_NAME}" (sheets present: ${Object.keys(sheetMap).join(", ")})`,
    );
  }
  const sheetXml = readEntryText(zip, sheetInfo.path);
  const rows = parseSheetRows(sheetXml);
  const blocks = findHeaderBlocks(rows, sharedStrings);

  const colsCache = new Map();
  function colsFor(block) {
    if (!colsCache.has(block)) colsCache.set(block, resolveBlockColumns(block));
    return colsCache.get(block);
  }

  const result = new Map();
  for (const target of TARGETS) {
    const activityRe = ACTIVITY_RE[target.mode];
    const matches = [];
    for (const row of rows) {
      const block = headerBlockFor(blocks, row.rowNum);
      if (!block) continue;
      const cols = colsFor(block);
      const activityText = cellText(row.cells.get(cols.activityCol), sharedStrings);
      const typeText = cellText(row.cells.get(cols.typeCol), sharedStrings);
      const unitText = cellText(row.cells.get(cols.unitCol), sharedStrings);
      if (!activityRe.test(activityText)) continue;
      if (!target.typeRe.test(typeText)) continue;
      if (!UNIT_RE.test(unitText)) continue;
      matches.push({ row, block, cols, activityText, typeText, unitText });
    }

    if (matches.length === 0) {
      throw new DesnzStructureError(
        `no row found for ${target.vehicleClass}: looked in sheet "${SHEET_NAME}" for Activity~/${activityRe.source}/, ` +
        `Type~/${target.typeRe.source}/, Unit matching tonne.km — none matched`,
      );
    }

    let items;
    if (matches.length === 1) {
      items = [buildExtractedItem(target, matches[0], sharedStrings, sheetInfo, null)];
    } else if (target.mode === "air" && matches.length === 2 &&
               ((WITH_RF_RE.test(matches[0].typeText) && WITHOUT_RF_RE.test(matches[1].typeText)) ||
                (WITHOUT_RF_RE.test(matches[0].typeText) && WITH_RF_RE.test(matches[1].typeText)))) {
      items = matches.map((m) =>
        buildExtractedItem(target, m, sharedStrings, sheetInfo, WITH_RF_RE.test(m.typeText) ? "with_rf" : "without_rf"),
      );
    } else {
      throw new DesnzStructureError(
        `${matches.length} rows matched ${target.vehicleClass} and they do not resolve as a clean with-RF/` +
        `without-RF pair — refusing to guess which one is right: ` +
        matches.map((m) => `row ${m.row.rowNum} ("${m.activityText}" / "${m.typeText}")`).join("; "),
      );
    }
    result.set(target.vehicleClass, items);
  }
  return result;
}

function buildExtractedItem(target, match, sharedStrings, sheetInfo, rfSuffix) {
  const { row, block, cols, activityText, typeText, unitText } = match;
  if (cols.fuelCol) {
    throw new DesnzStructureError(
      `row ${row.rowNum} ("${activityText}" / "${typeText}"): header block at row ${block.startRow} has a fuel/` +
      `energy-carrier column ("${block.columns.get(cols.fuelCol)}") — this extractor assumes ${target.mode} ` +
      `freight rows are not split by fuel (see AIR_ENERGY_CARRIER/OCEAN_ENERGY_CARRIER in this file's header); ` +
      `that assumption is wrong for this sheet. Update the extractor to read the fuel column rather than default it.`,
    );
  }
  const value = cellNumber(row.cells.get(cols.totalCol));
  if (value === null) {
    throw new DesnzStructureError(
      `row ${row.rowNum} ("${activityText}" / "${typeText}"): total kg CO2e cell in column ${cols.totalCol} is ` +
      `empty or non-numeric`,
    );
  }
  return {
    mode: target.mode,
    vehicleClass: rfSuffix ? `${target.vehicleClass}_${rfSuffix}` : target.vehicleClass,
    rfSuffix,
    ttwCo2e: value,
    row: row.rowNum,
    column: cols.totalCol,
    activityText,
    typeText,
    unitText,
    totalColLabel: block.columns.get(cols.totalCol),
    sheetPath: sheetInfo.path,
    rId: sheetInfo.rId,
  };
}

// ── Building the fixture row and applying it to the fixture's rows[] array ──────────────────────────────

function buildFixtureRow(item, { retrievedAt }) {
  const energyCarrier = item.mode === "air" ? AIR_ENERGY_CARRIER : OCEAN_ENERGY_CARRIER;
  return {
    tier: "modal_default",
    scope_kind: "modal",
    mode: item.mode,
    vehicle_class: item.vehicleClass,
    energy_carrier: energyCarrier,
    jurisdiction: "GB",
    quantity_basis: "tonne_km",
    ttw_co2e: item.ttwCo2e,
    gwp_basis: "AR5_GWP100",
    derivation: "observed",
    origin_class: "official",
    pedigree: 4,
    pedigree_reliability: 4,
    pedigree_completeness: 3,
    pedigree_temporal_correlation: 2,
    pedigree_geographical_correlation: 1,
    pedigree_technological_correlation: 2,
    method_version: "desnz-2025-freighting-goods-v2",
    source_ref:
      `GHG Conversion Factors 2025 (DESNZ/Defra), full set, sheet '${SHEET_NAME}' (${item.rId}), row ${item.row}, ` +
      `column ${item.column} — '${item.activityText}' / '${item.typeText}' / ${item.unitText}, ` +
      `${item.totalColLabel} = ${item.ttwCo2e}. energy_carrier ("${energyCarrier}") is a documented default, not ` +
      `a DESNZ-published split: no fuel/energy-carrier column was present in this row's header block (same ` +
      `convention as this fixture's rail row). Extracted by fetch-desnz-factors.mjs on ${retrievedAt}.`,
  };
}

/**
 * Replaces every needs_runner_fetch shell in `rows` with its resolved fixture row(s) (one shell can
 * become two, for an RF-split air target). Pure — takes the extraction result, returns a new rows array
 * plus a human-readable diff report; never touches a file. Throws if any shell has no matching extraction,
 * or if the extraction names a base vehicle class no shell carries (both would otherwise write a fixture
 * that silently disagrees with what was actually found).
 */
export function applyToFixture(rows, extractedByBase, opts) {
  const out = [];
  const consumed = new Set();
  const report = [];
  for (const row of rows) {
    if (row.needs_runner_fetch !== true) { out.push(row); continue; }
    const items = extractedByBase.get(row.vehicle_class);
    if (!items) {
      throw new DesnzStructureError(
        `fixture shell "${row.vehicle_class}" (needs_runner_fetch) was not resolved by the extractor — ` +
        `refusing to write a partial fixture`,
      );
    }
    consumed.add(row.vehicle_class);
    for (const item of items) {
      const built = buildFixtureRow(item, opts);
      out.push(built);
      report.push(
        `  ${row.vehicle_class}${item.rfSuffix ? ` (${item.rfSuffix})` : ""} -> ${built.vehicle_class}: ` +
        `ttw_co2e=${built.ttw_co2e}  [row ${item.row}, col ${item.column}, "${item.activityText}" / "${item.typeText}"]`,
      );
    }
  }
  for (const base of extractedByBase.keys()) {
    if (!consumed.has(base)) {
      throw new DesnzStructureError(
        `extractor produced result(s) for "${base}" but no matching needs_runner_fetch shell exists in the fixture`,
      );
    }
  }
  return { rows: out, report };
}

// ── Network: locate and download the workbook ────────────────────────────────────────────────────────

function findFullSetXlsxLink(html) {
  const aRe = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(html))) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, " ").trim();
    if (/\.xlsx(\?|$)/i.test(href) && /full set/i.test(text)) {
      return href.startsWith("http") ? href : new URL(href, "https://www.gov.uk").toString();
    }
  }
  return null;
}

export async function resolveXlsxUrl(fetchFn = fetch) {
  let html;
  try {
    const res = await fetchFn(GOV_UK_PAGE_URL, { headers: { accept: "text/html" } });
    if (!res.ok) {
      console.error(`fetch-desnz-factors: page fetch failed ${res.status} ${res.statusText} — falling back to the known xlsx URL.`);
      return FALLBACK_XLSX_URL;
    }
    html = await res.text();
  } catch (err) {
    console.error(`fetch-desnz-factors: page fetch threw (${err.message}) — falling back to the known xlsx URL.`);
    return FALLBACK_XLSX_URL;
  }
  const found = findFullSetXlsxLink(html);
  if (found) return found;
  console.error(
    'fetch-desnz-factors: WARNING — no "full set" .xlsx link found on the gov.uk publication page; falling ' +
    "back to the known (2026-08-30-verified) URL. If this fires on a real run, the page structure has likely " +
    "changed and this script's scrape needs a look.",
  );
  return FALLBACK_XLSX_URL;
}

async function downloadXlsx(url, fetchFn = fetch) {
  let res;
  try {
    res = await fetchFn(url);
  } catch (err) {
    throw new NetworkError(`xlsx download threw: ${err.message}`);
  }
  if (!res.ok) throw new NetworkError(`xlsx download failed ${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  return {
    xlsxPath: flag("--xlsx"),
    fixturePath: flag("--fixture") ?? DEFAULT_FIXTURE_PATH,
    reportPath: flag("--report"),
    apply: args.includes("--apply"),
  };
}

async function main() {
  const { xlsxPath, fixturePath, reportPath, apply } = parseArgs(process.argv);

  let xlsxBuf;
  if (xlsxPath) {
    xlsxBuf = readFileSync(xlsxPath);
    console.error(`fetch-desnz-factors: using local xlsx ${xlsxPath} (${xlsxBuf.length} bytes)`);
  } else {
    const url = await resolveXlsxUrl();
    console.error(`fetch-desnz-factors: xlsx URL = ${url}`);
    xlsxBuf = await downloadXlsx(url);
    console.error(`fetch-desnz-factors: downloaded ${xlsxBuf.length} bytes`);
  }

  const zip = readZip(xlsxBuf);
  const extracted = extractFreightingGoodsRows(zip);
  console.error(`fetch-desnz-factors: resolved ${extracted.size} target(s) from sheet "${SHEET_NAME}"`);

  const fixtureJson = JSON.parse(readFileSync(fixturePath, "utf8"));
  const retrievedAt = new Date().toISOString().slice(0, 10);
  const { rows, report } = applyToFixture(fixtureJson.rows, extracted, { retrievedAt });

  const reportText = [`fetch-desnz-factors: diff report (${apply ? "APPLY" : "DRY-RUN"})`, ...report].join("\n");
  console.error(reportText);
  if (reportPath) writeFileSync(reportPath, reportText + "\n");

  if (!apply) {
    console.error("fetch-desnz-factors: DRY-RUN — pass --apply to write the fixture.");
    return;
  }

  fixtureJson.rows = rows;
  writeFileSync(fixturePath, JSON.stringify(fixtureJson, null, 2) + "\n");
  console.error(`fetch-desnz-factors: wrote ${fixturePath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    if (err instanceof DesnzStructureError) {
      console.error(`fetch-desnz-factors: STRUCTURAL FAILURE — ${err.message}`);
      process.exit(2);
    }
    if (err instanceof NetworkError) {
      console.error(`fetch-desnz-factors: NETWORK FAILURE — ${err.message}`);
      process.exit(3);
    }
    console.error(err);
    process.exit(1);
  });
}
