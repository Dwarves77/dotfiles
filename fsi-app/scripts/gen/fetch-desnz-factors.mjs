#!/usr/bin/env node
// fetch-desnz-factors.mjs — the runner-side fetch+extract step the DESNZ fixture header (2026-09-02,
// lane PROD-FIX entry) named as needed: reads the published "Greenhouse gas reporting: conversion
// factors 2025" (DESNZ) full-set .xlsx and extracts the seven freighting-goods air/sea rows the fixture's
// `needs_runner_fetch: true` shells describe — air (domestic / short-haul international / long-haul
// international, DESNZ's headline "With RF" figure) and sea (container ship average, bulk carrier
// average, general cargo average, RoRo-Ferry), all per tonne.km.
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
// STRUCTURAL VERIFICATION, NOT POSITIONAL TRUST. Every one of these was a real defect found in this exact
// workbook and this exact sheet, so this extractor is built to never repeat them:
//   1. The sheet is resolved BY NAME through workbook.xml -> *.rels ("Freighting goods" -> rId -> path),
//      never by position ("sheet31.xml" is NOT assumed).
//   2. The "Freighting goods" sheet reuses its Activity/Type/[Size/]Unit header row after every section
//      break. Column meaning is resolved from the NEAREST PRECEDING header row above a given data row,
//      never from one hardcoded column letter for the whole sheet — the exact trap that made an HGV
//      row's average-laden total live in column P while column D (0% laden) was silently zero (see the
//      fixture's own header for that history).
//   3. Rows are matched by their Activity + Type (+ Size, where the block has one) TEXT — never by row
//      number, and never by a loose regex: exact after trim + case-fold (see normalizeText below), so a
//      sheet that spells a Type slightly differently than expected fails loudly rather than silently
//      matching the wrong row.
//   4. If a target's search finds zero rows, more than one row, an empty/non-numeric total cell, or a
//      fuel/energy-carrier column in scope (meaning this extractor's "air/sea are not split by fuel"
//      assumption was wrong) — it throws DesnzStructureError and writes NOTHING. A partially filled run
//      never happens: applyToFixture() requires every target resolved before it will return a rows array
//      to write. A zero-match failure ALWAYS lists the sibling Type/Size combinations actually present
//      under that row's Activity, so a near-miss (wrong case, a renamed Type) is visible without opening
//      the workbook — and so a genuinely close-but-wrong candidate (see point 6, RoRo) is never silently
//      substituted.
//   5. THE REPEATED-GROUP LAYOUT, found by a runner dry run against the actual workbook (lane DESNZ-2,
//      2026-09-03, workflow run 33704367826): some of this sheet's header blocks do not carry one
//      "Total kg CO2e" column, they carry several — the sub-column row repeats a 4-column group (total /
//      "kg CO2e of CO2 per unit" / CH4 / N2O) two or more times. WHICH group is a row's real headline
//      figure is decided by a group-TITLE row merged in immediately above the sub-column row — one title
//      per group, in the group's first column, with the remaining columns of that group left blank (a
//      real Excel merge, or simply not restated). resolveTotalGroup() below reads that title row, and
//      picks the one group whose (normalized) title matches an entry in GROUP_TITLE_SELECTION_TABLE —
//      data-driven, not hardcoded to a column letter. GROUP_TITLE_SELECTION_TABLE carries exactly one
//      entry today ("With RF", for the Freight-flights block) — the coordinator's verbatim read of the
//      real workbook (2026-09-03) is the source for that title text, not a guess; every OTHER block this
//      extractor might ever meet still resolves against an EMPTY effective ruleset for its own titles and
//      throws, printing every group's title text plus rows headerRow-3..headerRow dumped cell-by-cell, so
//      a future title is never guessed either.
//   6. THE VERBATIM REAL LAYOUT (lane DESNZ-3, 2026-09-03, coordinator's cell-by-cell read of the
//      runner-accessible workbook copy) is materially different from what an inference from the road/rail
//      blocks alone would suggest, in three ways this extractor now handles explicitly:
//        a. TWO header shapes. A 3-label header (Activity | Type | Unit, as used by Vans/HGV/rail/flights)
//           and a 4-label header (Activity | Type | Size | Unit, used by the sea blocks) — resolveLabels()
//           below detects "Size" as an optional extra column rather than assuming a fixed label set.
//        b. FORWARD-FILL. Both Activity (column A) and Type (column B) are frequently blank on a data row,
//           meaning "same as the nearest row above that stated one" (a merged cell, or simply not
//           restated) — e.g. a "Cargo ship" Activity is stated once and then left blank for every Type
//           under it, and a Type ("Bulk carrier") is stated once and then left blank for every Size row
//           under it. decorateRows() below forward-fills both columns independently, in row order, reset
//           at every block boundary — never guessed from a target's own expectation.
//        c. TYPE/SIZE MATCHING is on TRIMMED, CASE-FOLDED text (normalizeText below) — the sheet's own
//           spelling can carry stray case or whitespace (documented live: a leading space before "All
//           dwt") — but the row actually selected is cited with its VERBATIM text (whitespace-trimmed,
//           case preserved exactly as found), never re-cased to match the target's own spelling.
//      THE ROR0 DISAMBIGUATION RULE (also point 6): "ocean_roro_average" is matched to the Type text
//      "RoRo-Ferry", exact — never a loose "contains RoRo/Ferry" pattern. If the sheet also carries a
//      "Large RoPax ferry" row (documented, real, NOT the same vehicle class DESNZ means by "RoRo-Ferry"),
//      that row is correctly ignored when "RoRo-Ferry" is present, and if "RoRo-Ferry" is EVER absent this
//      extractor refuses outright — the zero-match failure lists "Large RoPax ferry" as a sibling
//      candidate, per point 4, but never silently selects it. A near-miss vehicle class is not the target.
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
// in a matched row's header block, that assumption was wrong — the extractor throws rather than silently
// discarding a real column (see point 4 above).
//
// "WITH RF" vs "WITHOUT RF" (aviation only). DESNZ's headline aviation freight factor includes radiative
// forcing (the "With RF" group) — the same convention DESNZ uses on its published Business-travel-by-air
// tables. ttw_co2e always stores the With RF figure. There is no schema field for an RF-exclusion variant
// (wtt_co2e/wtw_co2e are a DIFFERENT axis — well-to-tank / well-to-wheel scope, not RF-inclusion), so the
// Without RF figure at the same row is cited in source_ref rather than invented a field for — see
// buildFixtureRow's otherGroups handling below.
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

/** For HEADER LABELS ("Activity", "Type", "kg CO2e", a group title): case/space/punctuation-insensitive. */
function normalizeLabel(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** For DATA TEXT (a Type or Size cell's content, e.g. "Domestic, to/from UK"): trim + case-fold + collapse
 *  internal whitespace, but KEEP punctuation — a Type's commas and slashes are part of its identity. */
function normalizeText(s) {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
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

/** "A"->1, "Z"->26, "AA"->27, "AB"->28, ... — base-26, letters only, matches Excel's own column numbering. */
function colToIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Activity/Type/Unit are always resolved (findColumnByLabel throws if not exactly one). Size is optional
 *  — the 4-label sea-block shape carries it, the 3-label shapes (Vans/HGV/rail/flights) do not. fuelCol is
 *  the literal-"Fuel"-labeled-column trap guard, also optional. Never ambiguous by construction: this is
 *  the block's fixed LABEL ROW, resolved once, independent of how many total-column GROUPS the block has
 *  (see resolveTotalGroup below, which is deliberately NOT called here — see extractFreightingGoodsRows). */
function resolveLabels(block) {
  return {
    activityCol: findColumnByLabel(block, (t) => t === "activity", "Activity"),
    typeCol: findColumnByLabel(block, (t) => t === "type", "Type"),
    unitCol: findColumnByLabel(block, (t) => t === "unit", "Unit"),
    sizeCol: [...block.columns.entries()].find(([, t]) => normalizeLabel(t) === "size")?.[0] ?? null,
    fuelCol: [...block.columns.entries()].find(([, t]) => /fuel|energycarrier/.test(normalizeLabel(t)))?.[0] ?? null,
  };
}

/** Every rule this file has ever needed to disambiguate a group-title row, keyed by the NORMALIZED title
 *  text (normalizeLabel(): case/space/punctuation-insensitive). ONE entry today: "With RF", for the
 *  Freight-flights block — sourced from the coordinator's verbatim cell-by-cell read of the real workbook
 *  (2026-09-03, row 96: D-group "With RF", H-group "Without RF"), not a guess. Every OTHER block this
 *  extractor might meet (this sheet's Vans/HGV fuel- and laden-percentage-titled blocks, or any future
 *  one) has no rule here and will throw if it is ever actually resolved — see point 5 in this file's
 *  header for why that is the intended failure mode, not a bug. A caller (only
 *  fetch-desnz-factors.test.mjs today) may pass a different table via
 *  extractFreightingGoodsRows(zip, { selectionTable }) to prove the mechanism without editing this
 *  shipped table. */
export const GROUP_TITLE_SELECTION_TABLE = [
  {
    match: /^withrf$/,
    label:
      "DESNZ's headline aviation freight factor includes radiative forcing (\"With RF\") — the same " +
      "convention DESNZ uses on its published Business-travel-by-air tables. Confirmed by the " +
      "coordinator's verbatim read of the real workbook (2026-09-03): row 96, D-group title 'With RF', " +
      "H-group title 'Without RF'.",
  },
];

/** Forward-filled group titles from the row immediately above a header block's sub-column row (e.g. row
 *  96 above a row-97 Activity/Type/Unit header) — a merged title cell carries text only in the group's
 *  first (leftmost) column, and the remaining columns of that group are blank in the underlying XML.
 *  Returns a function colLetter -> nearest non-blank title at or before that column, or null if the title
 *  row is entirely absent or blank (this never invents a title from an unrelated row). */
function buildTitleLookup(rowsByNum, sharedStrings, titleRowNum) {
  const titleRow = rowsByNum.get(titleRowNum);
  if (!titleRow) return null;
  const entries = [...titleRow.cells.entries()]
    .map(([col, cell]) => [colToIndex(col), cellText(cell, sharedStrings).trim()])
    .filter(([, text]) => text)
    .sort((a, b) => a[0] - b[0]);
  if (!entries.length) return null;
  return (colLetter) => {
    const idx = colToIndex(colLetter);
    let current = null;
    for (const [ci, text] of entries) {
      if (ci > idx) break;
      current = text;
    }
    return current;
  };
}

/** Renders rows [fromRow, toRow] of the sheet verbatim, one line per row, "COL=text" per non-blank cell —
 *  printed into every structural failure that has a headerRow to anchor on, so the failure output itself
 *  is enough for a human to see the real title/header text without opening the workbook by hand. */
function dumpRowsVerbatim(rowsByNum, sharedStrings, fromRow, toRow) {
  const lines = [];
  for (let r = fromRow; r <= toRow; r++) {
    const row = rowsByNum.get(r);
    if (!row) { lines.push(`  row ${r}: (no cells)`); continue; }
    const cells = [...row.cells.entries()]
      .sort((a, b) => colToIndex(a[0]) - colToIndex(b[0]))
      .map(([col, cell]) => `${col}=${JSON.stringify(cellText(cell, sharedStrings))}`);
    lines.push(`  row ${r}: ${cells.join(" ")}`);
  }
  return lines.join("\n");
}

/**
 * Resolves ONE header block's total-column GROUP: a block with exactly one "Total kg CO2e" column
 * resolves it directly (the sea blocks; the intervening single-group block between air and sea). A block
 * with MORE THAN ONE such column (the flights block: two groups, "With RF" / "Without RF") resolves the
 * group-title row immediately above the header row and picks the one group whose title matches
 * `selectionTable`, throwing — with every group's title text and a verbatim row dump — if zero or more
 * than one group matches, rather than ever guessing. DELIBERATELY NOT CALLED for every block in the
 * sheet — only for a block that a target has actually matched a row in (see extractFreightingGoodsRows) —
 * so an irrelevant multi-group block (Vans/HGV, titled by fuel or laden percentage) is never even
 * attempted, let alone required to resolve.
 */
function resolveTotalGroup(block, rowsByNum, sharedStrings, selectionTable) {
  const totalCandidates = [...block.columns.entries()]
    .filter(([, text]) => normalizeLabel(text) === "kgco2e" || normalizeLabel(text) === "totalkgco2e")
    .map(([col, text]) => ({ col, label: text }))
    .sort((a, b) => colToIndex(a.col) - colToIndex(b.col));

  if (totalCandidates.length === 0) {
    throw new DesnzStructureError(
      `header block at row ${block.startRow}: expected at least one "Total kg CO2e" column, found 0 ` +
      `(columns: ${[...block.columns.entries()].map(([c, t]) => `${c}="${t}"`).join(", ")})`,
    );
  }

  if (totalCandidates.length === 1) {
    return { totalCol: totalCandidates[0].col, groupTitle: null, allGroups: totalCandidates };
  }

  const titleRowNum = block.startRow - 1;
  const titleAt = buildTitleLookup(rowsByNum, sharedStrings, titleRowNum);
  const dump = dumpRowsVerbatim(rowsByNum, sharedStrings, block.startRow - 3, block.startRow);

  if (!titleAt) {
    throw new DesnzStructureError(
      `header block at row ${block.startRow}: ${totalCandidates.length} "Total kg CO2e" columns found ` +
      `(${totalCandidates.map((c) => c.col).join(", ")}) and no group-title row was found at row ${titleRowNum} ` +
      `to disambiguate them — refusing to guess which one is the row's real figure.\n${dump}`,
    );
  }

  const candidates = totalCandidates.map((c) => ({ ...c, title: titleAt(c.col) }));
  const unresolved = candidates.filter((c) => !c.title);
  if (unresolved.length) {
    throw new DesnzStructureError(
      `header block at row ${block.startRow}: group(s) at column(s) ${unresolved.map((c) => c.col).join(", ")} ` +
      `have no title in row ${titleRowNum} to identify them — refusing to guess.\n${dump}`,
    );
  }

  const matched = candidates.filter((c) => selectionTable.some((rule) => rule.match.test(normalizeLabel(c.title))));

  if (matched.length === 0) {
    throw new DesnzStructureError(
      `header block at row ${block.startRow}: ${candidates.length} group titles found in row ${titleRowNum} but ` +
      `none matches GROUP_TITLE_SELECTION_TABLE. Group titles found: ` +
      `${candidates.map((c) => `${c.col}="${c.title}"`).join(", ")}. Populate GROUP_TITLE_SELECTION_TABLE with ` +
      `the correct rule once a human has read this list, then re-run.\n${dump}`,
    );
  }
  if (matched.length > 1) {
    throw new DesnzStructureError(
      `header block at row ${block.startRow}: ${matched.length} group titles matched more than one ` +
      `GROUP_TITLE_SELECTION_TABLE rule — refusing to guess which is correct: ` +
      `${matched.map((c) => `${c.col}="${c.title}"`).join(", ")}.\n${dump}`,
    );
  }

  return { totalCol: matched[0].col, groupTitle: matched[0].title, allGroups: candidates };
}

// ── The seven targets, matched by exact (trimmed, case-folded) Activity/Type/Size text ─────────────────

const UNIT_RE = /tonnes?[\s.\-]*km/i;

export const TARGETS = [
  { vehicleClass: "air_freight_domestic", mode: "air",
    blockActivity: "Freight flights", type: "Domestic, to/from UK", groupTitle: "With RF" },
  // Type labels are the REAL 2025 sheet's rows 99/100 (read cell by cell through the Codespace on
  // 2026-09-03 after producers run #18 refused with "no row found for air_freight_short_haul_international"):
  // "Short-haul, to/from UK" and "Long-haul, to/from UK". The first rebuild (#538) guessed
  // "Short-haul international, to/from UK", a label the sheet does not carry; the block's fourth row,
  // "International, to/from non-UK" (row 101), is a distinct DESNZ class and is deliberately not a shell.
  { vehicleClass: "air_freight_short_haul_international", mode: "air",
    blockActivity: "Freight flights", type: "Short-haul, to/from UK", groupTitle: "With RF" },
  { vehicleClass: "air_freight_long_haul_international", mode: "air",
    blockActivity: "Freight flights", type: "Long-haul, to/from UK", groupTitle: "With RF" },
  { vehicleClass: "ocean_container_ship_average", mode: "ocean",
    blockActivity: "Cargo ship", type: "Container ship", size: "Average" },
  { vehicleClass: "ocean_bulk_carrier_average", mode: "ocean",
    blockActivity: "Cargo ship", type: "Bulk carrier", size: "Average" },
  { vehicleClass: "ocean_general_cargo_average", mode: "ocean",
    blockActivity: "Cargo ship", type: "General cargo", size: "Average" },
  { vehicleClass: "ocean_roro_average", mode: "ocean",
    blockActivity: "Cargo ship", type: "RoRo-Ferry", size: "Average" },
];

/**
 * Pass 1: decorates every data row in the sheet with its header block, resolved labels, and
 * forward-filled Activity/Type text (Size, where the block has one, is read directly per row — DESNZ
 * restates it on every row, unlike Activity/Type). Forward-fill state resets at every block boundary.
 * Pure bookkeeping — never resolves a total-column group (see resolveTotalGroup, called lazily in pass 2).
 */
function decorateRows(rows, blocks, sharedStrings) {
  const labelsCache = new Map();
  function labelsFor(block) {
    if (!labelsCache.has(block)) labelsCache.set(block, resolveLabels(block));
    return labelsCache.get(block);
  }

  const decorated = [];
  let curBlock = null, lastActivity = null, lastType = null;
  for (const row of rows) {
    const block = headerBlockFor(blocks, row.rowNum);
    if (!block) continue;
    if (block !== curBlock) { curBlock = block; lastActivity = null; lastType = null; }
    const labels = labelsFor(block);
    const rawActivity = cellText(row.cells.get(labels.activityCol), sharedStrings).trim();
    const rawType = cellText(row.cells.get(labels.typeCol), sharedStrings).trim();
    if (rawActivity) lastActivity = rawActivity;
    if (rawType) lastType = rawType;
    const unitText = cellText(row.cells.get(labels.unitCol), sharedStrings);
    const sizeText = labels.sizeCol ? cellText(row.cells.get(labels.sizeCol), sharedStrings).trim() : null;
    decorated.push({ row, block, labels, activityText: lastActivity ?? "", typeText: lastType ?? "", sizeText, unitText });
  }
  return decorated;
}

/**
 * Extracts the seven freighting-goods rows from an opened xlsx. Returns Map<vehicleClass, [item]> — one
 * entry per target, each a single-item array (applyToFixture's shape is unchanged from when a target
 * could resolve to more than one row). Throws DesnzStructureError, naming exactly what did not resolve,
 * rather than ever guessing.
 *
 * `opts.selectionTable` overrides GROUP_TITLE_SELECTION_TABLE (see resolveTotalGroup); `opts.targets`
 * overrides TARGETS. The real CLI run below passes neither, so it always uses the shipped defaults;
 * fetch-desnz-factors.test.mjs passes synthetic values to prove the mechanism without editing them.
 */
export function extractFreightingGoodsRows(zip, opts = {}) {
  const selectionTable = opts.selectionTable ?? GROUP_TITLE_SELECTION_TABLE;
  const targets = opts.targets ?? TARGETS;

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
  const rowsByNum = new Map(rows.map((r) => [r.rowNum, r]));
  const blocks = findHeaderBlocks(rows, sharedStrings);
  const decorated = decorateRows(rows, blocks, sharedStrings);

  const groupCache = new Map();
  function groupFor(block) {
    if (!groupCache.has(block)) groupCache.set(block, resolveTotalGroup(block, rowsByNum, sharedStrings, selectionTable));
    return groupCache.get(block);
  }

  const result = new Map();
  for (const target of targets) {
    const activityMatches = decorated.filter((d) => normalizeText(d.activityText) === normalizeText(target.blockActivity));
    const matches = activityMatches.filter((d) =>
      normalizeText(d.typeText) === normalizeText(target.type) &&
      (target.size === undefined || normalizeText(d.sizeText) === normalizeText(target.size)) &&
      UNIT_RE.test(d.unitText),
    );

    if (matches.length === 0) {
      const siblings = [...new Set(
        activityMatches
          .filter((d) => UNIT_RE.test(d.unitText))
          .map((d) => `"${d.typeText}"${d.sizeText ? ` / "${d.sizeText}"` : ""}`),
      )];
      throw new DesnzStructureError(
        `no row found for ${target.vehicleClass}: looked for Activity="${target.blockActivity}", ` +
        `Type="${target.type}"${target.size !== undefined ? `, Size="${target.size}"` : ""} (Unit ~ tonne.km) — ` +
        `none matched. Type${target.size !== undefined ? "/Size" : ""} combinations actually present under ` +
        `Activity="${target.blockActivity}": ` +
        `${siblings.length ? siblings.join("; ") : "(none — that Activity was not found in this sheet at all)"}. ` +
        `Refusing to guess a near match.`,
      );
    }
    if (matches.length > 1) {
      throw new DesnzStructureError(
        `${matches.length} rows matched ${target.vehicleClass} (Activity="${target.blockActivity}", ` +
        `Type="${target.type}"${target.size !== undefined ? `, Size="${target.size}"` : ""}) — refusing to guess ` +
        `which is right: ${matches.map((m) => `row ${m.row.rowNum}`).join(", ")}`,
      );
    }

    const match = matches[0];
    if (match.labels.fuelCol) {
      throw new DesnzStructureError(
        `row ${match.row.rowNum} (${target.vehicleClass}): header block at row ${match.block.startRow} has a ` +
        `fuel/energy-carrier column ("${match.block.columns.get(match.labels.fuelCol)}") — this extractor ` +
        `assumes ${target.mode} freight rows are not split by fuel (see AIR_ENERGY_CARRIER/OCEAN_ENERGY_CARRIER ` +
        `in this file's header); that assumption is wrong for this sheet. Update the extractor to read the ` +
        `fuel column rather than default it.`,
      );
    }

    const group = groupFor(match.block);
    if (target.groupTitle !== undefined) {
      if (!group.groupTitle || normalizeText(group.groupTitle) !== normalizeText(target.groupTitle)) {
        throw new DesnzStructureError(
          `${target.vehicleClass}: expected the "${target.groupTitle}" group to be selected for its block, but ` +
          `resolveTotalGroup selected "${group.groupTitle ?? "(single, untitled group)"}" — the ` +
          `GROUP_TITLE_SELECTION_TABLE entry and this target's expectation disagree.`,
        );
      }
    }

    const value = cellNumber(match.row.cells.get(group.totalCol));
    if (value === null) {
      throw new DesnzStructureError(
        `row ${match.row.rowNum} ("${match.activityText}" / "${match.typeText}"): total kg CO2e cell in column ` +
        `${group.totalCol} is empty or non-numeric`,
      );
    }

    const otherGroups = (group.allGroups ?? [])
      .filter((g) => g.col !== group.totalCol)
      .map((g) => {
        const v = cellNumber(match.row.cells.get(g.col));
        return v === null || !g.title ? null : { title: g.title, value: v };
      })
      .filter(Boolean);

    result.set(target.vehicleClass, [{
      mode: target.mode,
      vehicleClass: target.vehicleClass,
      ttwCo2e: value,
      row: match.row.rowNum,
      column: group.totalCol,
      activityText: match.activityText,
      typeText: match.typeText,
      sizeText: match.sizeText,
      unitText: match.unitText,
      groupTitle: group.groupTitle,
      otherGroups,
      sheetPath: sheetInfo.path,
      rId: sheetInfo.rId,
    }]);
  }
  return result;
}

// ── Building the fixture row and applying it to the fixture's rows[] array ──────────────────────────────

function buildFixtureRow(item, { retrievedAt }) {
  const energyCarrier = item.mode === "air" ? AIR_ENERGY_CARRIER : OCEAN_ENERGY_CARRIER;
  const locator = `Activity '${item.activityText}' / Type '${item.typeText}'` +
    (item.sizeText ? ` / Size '${item.sizeText}'` : "") + ` / ${item.unitText}`;
  const groupNote = item.groupTitle ? ` (group '${item.groupTitle}', selected by GROUP_TITLE_SELECTION_TABLE)` : "";
  const otherGroupsNote = item.otherGroups.length
    ? ` Sibling group value${item.otherGroups.length > 1 ? "s" : ""} at the same row, NOT stored (no schema ` +
      `field distinguishes this axis): ${item.otherGroups.map((g) => `'${g.title}' = ${g.value}`).join(", ")}.`
    : "";
  const energyCarrierNote = item.groupTitle
    ? ` energy_carrier ("${energyCarrier}") is a documented default: aircraft run on jet fuel and no fuel-mix ` +
      `column is present in this row's header block.`
    : ` energy_carrier ("${energyCarrier}") is a documented default, not a DESNZ-published split: no fuel/` +
      `energy-carrier column was present in this row's header block (same convention as this fixture's rail row).`;

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
    method_version: "desnz-2025-freighting-goods-v3-verbatim-layout",
    source_ref:
      `GHG Conversion Factors 2025 (DESNZ/Defra), full set, sheet '${SHEET_NAME}' (${item.rId}), row ${item.row}, ` +
      `column ${item.column}${groupNote} — ${locator}, total kg CO2e = ${item.ttwCo2e}.${otherGroupsNote}` +
      `${energyCarrierNote} Extracted by fetch-desnz-factors.mjs on ${retrievedAt}.`,
  };
}

/**
 * Replaces every needs_runner_fetch shell in `rows` with its resolved fixture row (extraction is now
 * one item per shell — see extractFreightingGoodsRows). Pure — takes the extraction result, returns a new
 * rows array plus a human-readable diff report; never touches a file. Throws if any shell has no matching
 * extraction, or if the extraction names a vehicle class no shell carries (both would otherwise write a
 * fixture that silently disagrees with what was actually found).
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
        `  ${row.vehicle_class} -> ${built.vehicle_class}: ttw_co2e=${built.ttw_co2e} ` +
        `[row ${item.row}, col ${item.column}, "${item.activityText}" / "${item.typeText}"` +
        `${item.sizeText ? ` / "${item.sizeText}"` : ""}]`,
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
