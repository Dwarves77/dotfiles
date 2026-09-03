// Tests for fetch-desnz-factors.mjs — pure, $0, offline, no network, no DB.
//
// THE CENTRAL PROOF: a real xlsx is a zip of XML. This file BUILDS a small, real zip archive in memory
// (buildXlsx() below — hand-rolled ZIP local/central-directory writer, both "stored" and "deflate" entries
// are exercised so readZip()'s two supported compression methods are both proven against real bytes, not
// just against buffers this test happens to construct the same way the reader expects) matching the REAL
// "Freighting goods" sheet layout the coordinator read cell-by-cell off the runner-accessible workbook copy
// (lane DESNZ-3, 2026-09-03): a decoy road block, an "Ambiguous" 2-group block (test-only, used to prove
// the group-title-mismatch guard fires without depending on a block none of the real 7 targets touch), the
// real "Freight flights" block (2 groups: With RF / Without RF), a single-group block between air and sea,
// a "Sea tanker" decoy block (4-label header, different Activity — must never be selected for our Cargo
// ship targets), and the real "Cargo ship" block (4-label header, Size column, forward-filled
// Activity/Type, RoRo-Ferry vs. Large RoPax ferry disambiguation). extractFreightingGoodsRows() is run
// against that constructed workbook exactly as it would run against the real download.
//
// WIRING: scripts/gen/*.test.mjs is already an existing run-test-suite.sh glob (checked live, same as
// emission-factors-desnz.test.mjs's own note) — no wiring change needed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, crc32 } from "node:zlib";
import { validateFactor } from "../../src/lib/contracts/factor-tier.mjs";
import {
  readZip,
  parseSharedStrings,
  parseSheetNames,
  parseSheetRows,
  findHeaderBlocks,
  extractFreightingGoodsRows,
  applyToFixture,
  parseArgs,
  resolveXlsxUrl,
  TARGETS,
  DesnzStructureError,
  SHEET_NAME,
  GOV_UK_PAGE_URL,
  FALLBACK_XLSX_URL,
  GROUP_TITLE_SELECTION_TABLE,
} from "./fetch-desnz-factors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESNZ_FIXTURE = resolve(HERE, "fixtures/emission-factors/desnz-modal-defaults-2025.json");

test("GROUP_TITLE_SELECTION_TABLE ships with exactly the one confirmed rule (With RF) — no other title is guessed", () => {
  assert.equal(GROUP_TITLE_SELECTION_TABLE.length, 1);
  assert.ok(GROUP_TITLE_SELECTION_TABLE[0].match.test("withrf"));
  assert.ok(!GROUP_TITLE_SELECTION_TABLE[0].match.test("withoutrf"));
});

// ── A minimal, hand-rolled ZIP writer (no library — mirrors the reader it proves) ───────────────────────

function localHeaderAndData(name, data, method) {
  const nameBuf = Buffer.from(name, "utf8");
  const compressed = method === 8 ? deflateRawSync(data) : data;
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(method, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(crc32(data), 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  return { bytes: Buffer.concat([header, nameBuf, compressed]), nameBuf, compressed, method, data };
}

/** entries: [{ name, content: string, method?: 0|8 (default 0, "stored") }] -> a real zip Buffer. */
function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const e of entries) {
    const data = Buffer.from(e.content, "utf8");
    const { bytes, nameBuf, compressed } = localHeaderAndData(e.name, data, e.method ?? 0);
    const localOffset = offset;
    localParts.push(bytes);
    offset += bytes.length;

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(e.method ?? 0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(Buffer.concat([central, nameBuf]));
  }
  const centralDirStart = offset;
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(centralDirStart, 16);
  return Buffer.concat([...localParts, centralBuf, eocd]);
}

// ── A minimal xlsx builder matching the REAL "Freighting goods" sheet's verbatim layout ────────────────
// (per the coordinator's cell-by-cell read of the real workbook, lane DESNZ-3, 2026-09-03)

const SHARED_STRINGS = [
  "Activity", "Type", "Unit", "Size",                                            // 0-3: label texts
  "kg CO2e", "kg CO2e of CO2 per unit", "kg CO2e of CH4 per unit", "kg CO2e of N2O per unit", // 4-7
  "Road", "Rigid (>7.5 tonnes-17 tonnes)", "tonne.km",                           // 8-10: decoy road block
  "AMBIG-TITLE-A", "AMBIG-TITLE-B", "Ambiguous Activity", "Ambiguous Type",      // 11-14: test-only ambiguous block
  "With RF", "Without RF", "Freight flights",                                    // 15-17
  "Domestic, to/from UK", "tonne",                                               // 18-19
  "Short-haul international, to/from UK", "Long-haul international, to/from UK", // 20-21
  "Something else", "Whatever",                                                  // 22-23: intervening single-group block
  "Sea tanker", "Crude tanker", "200,000+ dwt",                                  // 24-26: decoy sea-tanker block
  "Cargo ship", "Bulk carrier", "Average", "Container ship", "8000+ TEU",        // 27-31
  " general cargo ", "Average ",                                                 // 32-33: messy case/space, must still match
  "Refrigerated cargo", " All dwt",                                              // 34-35: decoy, leading-space size
  "Large RoPax ferry", "RoRo-Ferry",                                             // 36-37
];
const STR = new Map(SHARED_STRINGS.map((s, i) => [s, i]));
function sIdx(text) {
  const i = STR.get(text);
  if (i === undefined) throw new Error(`test bug: "${text}" is missing from SHARED_STRINGS`);
  return i;
}

function sharedStringsXml() {
  return `<?xml version="1.0"?><sst count="${SHARED_STRINGS.length}" uniqueCount="${SHARED_STRINGS.length}">` +
    SHARED_STRINGS.map((s) => `<si><t xml:space="preserve">${s.replace(/&/g, "&amp;")}</t></si>`).join("") + `</sst>`;
}

function workbookXml() {
  return `<?xml version="1.0"?><workbook><sheets>` +
    `<sheet name="Vans" sheetId="1" r:id="rId1"/>` +
    `<sheet name="${SHEET_NAME}" sheetId="2" r:id="rId7"/>` + // rId7, deliberately not "rId31": proves
    // resolution is by NAME, never a hardcoded/positional rId.
    `</sheets></workbook>`;
}

function relsXml() {
  return `<?xml version="1.0"?><Relationships>` +
    `<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId7" Target="worksheets/sheet2.xml"/>` +
    `</Relationships>`;
}

function c(ref, { s, n }) {
  if (s !== undefined) return `<c r="${ref}" t="s"><v>${s}</v></c>`;
  return `<c r="${ref}"><v>${n}</v></c>`;
}
function cs(ref, text) { return c(ref, { s: sIdx(text) }); }
function cn(ref, n) { return c(ref, { n }); }

// Decoy block: header at row 10, single Total column E — proves the simple single-total-column path
// (no group-title row involved at all) resolves independently of everything else in the sheet.
function decoyRoadRows() {
  return [
    `<row r="10">${cs("A10", "Activity")}${cs("B10", "Type")}${cs("C10", "Unit")}${cs("E10", "kg CO2e")}</row>`,
    `<row r="11">${cs("A11", "Road")}${cs("B11", "Rigid (>7.5 tonnes-17 tonnes)")}${cs("C11", "tonne.km")}${cn("E11", 0.363)}</row>`,
  ];
}

// Test-only "Ambiguous" 2-group block: proves the group-title-mismatch guard (resolveTotalGroup) fires
// correctly WITHOUT depending on a Vans/HGV-shaped block none of the real 7 targets ever touch — exercised
// via a synthetic target passed through extractFreightingGoodsRows(zip, { targets }).
function ambiguousBlockRows({ noTitleRow = false } = {}) {
  const rows = [];
  if (!noTitleRow) rows.push(`<row r="24">${cs("D24", "AMBIG-TITLE-A")}${cs("H24", "AMBIG-TITLE-B")}</row>`);
  rows.push(
    `<row r="25">${cs("A25", "Activity")}${cs("B25", "Type")}${cs("C25", "Unit")}` +
    `${cs("D25", "kg CO2e")}${cs("E25", "kg CO2e of CO2 per unit")}${cs("F25", "kg CO2e of CH4 per unit")}${cs("G25", "kg CO2e of N2O per unit")}` +
    `${cs("H25", "kg CO2e")}${cs("I25", "kg CO2e of CO2 per unit")}${cs("J25", "kg CO2e of CH4 per unit")}${cs("K25", "kg CO2e of N2O per unit")}</row>`,
  );
  rows.push(`<row r="26">${cs("A26", "Ambiguous Activity")}${cs("B26", "Ambiguous Type")}${cs("C26", "tonne.km")}${cn("D26", 1111)}${cn("H26", 2222)}</row>`);
  return rows;
}

// The real "Freight flights" block: title row 96 (With RF / Without RF), header row 97, three Type rows
// (98 decoy per-tonne, 99-101 real) with Activity blank after the first (forward-fill).
function flightsBlockRows({ withRfTitles = true } = {}) {
  const rows = [];
  if (withRfTitles) rows.push(`<row r="96">${cs("D96", "With RF")}${cs("H96", "Without RF")}</row>`);
  rows.push(
    `<row r="97">${cs("A97", "Activity")}${cs("B97", "Type")}${cs("C97", "Unit")}` +
    `${cs("D97", "kg CO2e")}${cs("E97", "kg CO2e of CO2 per unit")}${cs("F97", "kg CO2e of CH4 per unit")}${cs("G97", "kg CO2e of N2O per unit")}` +
    `${cs("H97", "kg CO2e")}${cs("I97", "kg CO2e of CO2 per unit")}${cs("J97", "kg CO2e of CH4 per unit")}${cs("K97", "kg CO2e of N2O per unit")}</row>`,
  );
  rows.push(`<row r="98">${cs("A98", "Freight flights")}${cs("B98", "Domestic, to/from UK")}${cs("C98", "tonne")}${cn("D98", 9999)}</row>`); // decoy: wrong unit
  rows.push(`<row r="99">${cs("B99", "Domestic, to/from UK")}${cs("C99", "tonne.km")}${cn("D99", 1.5)}${cn("H99", 0.9)}</row>`); // A blank: forward-fill
  rows.push(`<row r="100">${cs("B100", "Short-haul international, to/from UK")}${cs("C100", "tonne.km")}${cn("D100", 0.8)}${cn("H100", 0.5)}</row>`);
  rows.push(`<row r="101">${cs("B101", "Long-haul international, to/from UK")}${cs("C101", "tonne.km")}${cn("D101", 0.6)}${cn("H101", 0.4)}</row>`);
  return rows;
}

// An intervening single-group, no-title-row block between air and sea (real sheet, row 105) — proves the
// parser tolerates it without ever needing to resolve it (no target references its Activity).
function betweenAirAndSeaRows() {
  return [
    `<row r="105">${cs("A105", "Activity")}${cs("B105", "Type")}${cs("C105", "Unit")}${cs("D105", "kg CO2e")}</row>`,
    `<row r="106">${cs("A106", "Something else")}${cs("B106", "Whatever")}${cs("C106", "tonne.km")}${cn("D106", 7777)}</row>`,
  ];
}

// The "Sea tanker" 4-label decoy block (real sheet, row 110) — different Activity than "Cargo ship", must
// never contribute to our Cargo-ship targets even though it shares the exact same header shape.
function seaTankerDecoyRows() {
  return [
    `<row r="110">${cs("A110", "Activity")}${cs("B110", "Type")}${cs("C110", "Size")}${cs("D110", "Unit")}` +
    `${cs("E110", "kg CO2e")}${cs("F110", "kg CO2e of CO2 per unit")}${cs("G110", "kg CO2e of CH4 per unit")}${cs("H110", "kg CO2e of N2O per unit")}</row>`,
    `<row r="111">${cs("A111", "Sea tanker")}${cs("B111", "Crude tanker")}${cs("C111", "200,000+ dwt")}${cs("D111", "tonne.km")}${cn("E111", 8888)}</row>`,
  ];
}

// The real "Cargo ship" 4-label block (row 138), Activity/Type forward-filled, Size stated per row.
function cargoShipBlockRows({ roroFerryPresent = true } = {}) {
  const rows = [];
  rows.push(
    `<row r="138">${cs("A138", "Activity")}${cs("B138", "Type")}${cs("C138", "Size")}${cs("D138", "Unit")}` +
    `${cs("E138", "kg CO2e")}${cs("F138", "kg CO2e of CO2 per unit")}${cs("G138", "kg CO2e of CH4 per unit")}${cs("H138", "kg CO2e of N2O per unit")}</row>`,
  );
  rows.push(`<row r="139">${cs("A139", "Cargo ship")}${cs("B139", "Bulk carrier")}${cs("C139", "200,000+ dwt")}${cs("D139", "tonne.km")}${cn("E139", 9999)}</row>`);
  rows.push(`<row r="140">${cs("C140", "Average")}${cs("D140", "tonne.km")}${cn("E140", 0.008)}</row>`); // A,B forward-filled -> Cargo ship / Bulk carrier
  rows.push(`<row r="141">${cs("B141", "Container ship")}${cs("C141", "8000+ TEU")}${cs("D141", "tonne.km")}${cn("E141", 9999)}</row>`); // A forward-filled
  rows.push(`<row r="142">${cs("C142", "Average")}${cs("D142", "tonne.km")}${cn("E142", 0.012)}</row>`); // A,B forward-filled -> Cargo ship / Container ship
  rows.push(`<row r="143">${cs("B143", " general cargo ")}${cs("C143", "Average ")}${cs("D143", "tonne.km")}${cn("E143", 0.015)}</row>`); // messy case/space
  rows.push(`<row r="144">${cs("B144", "Refrigerated cargo")}${cs("C144", " All dwt")}${cs("D144", "tonne.km")}${cn("E144", 6666)}</row>`); // decoy, leading-space size
  rows.push(`<row r="145">${cs("B145", "Large RoPax ferry")}${cs("C145", "Average")}${cs("D145", "tonne.km")}${cn("E145", 5555)}</row>`); // decoy, must never be picked for roro
  if (roroFerryPresent) {
    rows.push(`<row r="146">${cs("B146", "RoRo-Ferry")}${cs("C146", "Average")}${cs("D146", "tonne.km")}${cn("E146", 0.021)}</row>`);
  }
  return rows;
}

function buildSheetXml({
  withRfTitles = true,
  ambiguousNoTitleRow = false,
  roroFerryPresent = true,
} = {}) {
  const rows = [
    ...decoyRoadRows(),
    ...ambiguousBlockRows({ noTitleRow: ambiguousNoTitleRow }),
    ...flightsBlockRows({ withRfTitles }),
    ...betweenAirAndSeaRows(),
    ...seaTankerDecoyRows(),
    ...cargoShipBlockRows({ roroFerryPresent }),
  ];
  return `<?xml version="1.0"?><worksheet><sheetData>${rows.join("")}</sheetData></worksheet>`;
}

function buildXlsx(opts) {
  return buildZip([
    { name: "xl/workbook.xml", content: workbookXml(), method: 0 },
    { name: "xl/_rels/workbook.xml.rels", content: relsXml(), method: 8 }, // deflate exercised here
    { name: "xl/sharedStrings.xml", content: sharedStringsXml(), method: 8 }, // and here
    { name: "xl/worksheets/sheet2.xml", content: buildSheetXml(opts), method: 0 }, // stored exercised here
  ]);
}

const AMBIGUOUS_TARGET = { vehicleClass: "test_ambiguous", mode: "test", blockActivity: "Ambiguous Activity", type: "Ambiguous Type" };

// ── readZip: both compression methods, and structural failure modes ─────────────────────────────────────

test("readZip: round-trips a stored (method 0) entry", () => {
  const buf = buildZip([{ name: "a.xml", content: "<x>hi</x>", method: 0 }]);
  const zip = readZip(buf);
  assert.equal(zip.read("a.xml").toString("utf8"), "<x>hi</x>");
});

test("readZip: round-trips a deflate (method 8) entry", () => {
  const buf = buildZip([{ name: "b.xml", content: "<y>" + "z".repeat(500) + "</y>", method: 8 }]);
  const zip = readZip(buf);
  assert.equal(zip.read("b.xml").toString("utf8"), "<y>" + "z".repeat(500) + "</y>");
});

test("readZip: throws DesnzStructureError for a missing entry, naming the entries that DO exist", () => {
  const zip = readZip(buildZip([{ name: "present.xml", content: "ok" }]));
  assert.throws(() => zip.read("missing.xml"), (err) => {
    assert.ok(err instanceof DesnzStructureError);
    assert.match(err.message, /present\.xml/);
    return true;
  });
});

test("readZip: throws on a non-zip buffer (no EOCD signature)", () => {
  assert.throws(() => readZip(Buffer.from("not a zip at all")), DesnzStructureError);
});

// ── parseSharedStrings / parseSheetNames / parseSheetRows ────────────────────────────────────────────

test("parseSharedStrings reads plain <si><t> entries in index order", () => {
  const strings = parseSharedStrings(sharedStringsXml());
  assert.equal(strings[0], "Activity");
  assert.ok(strings.includes("Freight flights"));
  assert.ok(strings.includes("Cargo ship"));
  assert.equal(strings.length, SHARED_STRINGS.length);
});

test("parseSharedStrings concatenates rich-text runs (<si><r><t>...)", () => {
  const xml = `<sst><si><r><t>Hello, </t></r><r><t>world</t></r></si></sst>`;
  assert.deepEqual(parseSharedStrings(xml), ["Hello, world"]);
});

test('parseSheetNames resolves "Freighting goods" BY NAME to whatever rId the workbook actually uses (rId7 here, not a hardcoded rId31)', () => {
  const sheets = parseSheetNames(workbookXml(), relsXml());
  assert.equal(sheets[SHEET_NAME].rId, "rId7");
  assert.equal(sheets[SHEET_NAME].path, "xl/worksheets/sheet2.xml");
  assert.equal(sheets["Vans"].path, "xl/worksheets/sheet1.xml");
});

test("parseSheetRows reads numeric and shared-string cells, sorted by row number", () => {
  const rows = parseSheetRows(buildSheetXml());
  assert.ok(rows[0].rowNum < rows[rows.length - 1].rowNum);
  const row97 = rows.find((r) => r.rowNum === 97);
  assert.ok(row97.cells.has("A"));
});

// ── findHeaderBlocks: header rows only, never the title row above them ──────────────────────────────────

test("findHeaderBlocks finds every header row (10, 25, 97, 105, 110, 138) — title rows (24, 96) are never mistaken for headers", () => {
  const rows = parseSheetRows(buildSheetXml());
  const strings = parseSharedStrings(sharedStringsXml());
  const blocks = findHeaderBlocks(rows, strings);
  assert.deepEqual(blocks.map((b) => b.startRow), [10, 25, 97, 105, 110, 138]);
  assert.equal(blocks.at(-1).endRow, Infinity);
  // the flights header (97) has two "kg CO2e" total columns (D and H); the Cargo ship header (138) has one:
  assert.equal(blocks.find((b) => b.startRow === 97).columns.get("D"), "kg CO2e");
  assert.equal(blocks.find((b) => b.startRow === 97).columns.get("H"), "kg CO2e");
  assert.equal(blocks.find((b) => b.startRow === 138).columns.get("E"), "kg CO2e");
  assert.equal(blocks.find((b) => b.startRow === 138).columns.get("C"), "Size");
});

test("findHeaderBlocks throws when no Activity/Type/Unit row exists anywhere in the sheet", () => {
  const rows = parseSheetRows(`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>nothing relevant here</t></is></c></row></sheetData></worksheet>`);
  assert.throws(() => findHeaderBlocks(rows, []), DesnzStructureError);
});

// ── extractFreightingGoodsRows: the end-to-end proof on a constructed workbook matching the real layout ───

test("extractFreightingGoodsRows resolves all 7 real shells on the constructed workbook", () => {
  const result = extractFreightingGoodsRows(readZip(buildXlsx()));
  assert.equal(result.size, 7);
  for (const target of TARGETS) assert.ok(result.has(target.vehicleClass), `missing ${target.vehicleClass}`);

  const domestic = result.get("air_freight_domestic")[0];
  assert.equal(domestic.ttwCo2e, 1.5); // NOT the decoy per-tonne row (9999) or the Without RF group (0.9)
  assert.equal(domestic.row, 99);
  assert.equal(domestic.column, "D");
  assert.equal(domestic.groupTitle, "With RF");
  assert.equal(domestic.activityText, "Freight flights"); // forward-filled from row 98
  assert.equal(domestic.typeText, "Domestic, to/from UK");
  assert.deepEqual(domestic.otherGroups, [{ title: "Without RF", value: 0.9 }]);

  const shortHaul = result.get("air_freight_short_haul_international")[0];
  assert.equal(shortHaul.ttwCo2e, 0.8);
  assert.equal(shortHaul.activityText, "Freight flights"); // forward-filled across three blank-A rows

  const bulk = result.get("ocean_bulk_carrier_average")[0];
  assert.equal(bulk.ttwCo2e, 0.008);
  assert.equal(bulk.activityText, "Cargo ship");
  assert.equal(bulk.typeText, "Bulk carrier"); // forward-filled from row 139 down to the Average row 140

  const container = result.get("ocean_container_ship_average")[0];
  assert.equal(container.ttwCo2e, 0.012);
  assert.equal(container.typeText, "Container ship");

  const general = result.get("ocean_general_cargo_average")[0];
  assert.equal(general.ttwCo2e, 0.015);
  assert.equal(general.typeText, "general cargo"); // verbatim (trimmed) — never re-cased to "General cargo"
  assert.equal(general.sizeText, "Average"); // trailing space trimmed

  const roro = result.get("ocean_roro_average")[0];
  assert.equal(roro.ttwCo2e, 0.021); // NOT the "Large RoPax ferry" decoy value (5555)
  assert.equal(roro.typeText, "RoRo-Ferry");
});

test("extractFreightingGoodsRows: the decoy per-tonne (not tonne.km) Domestic row is never picked over the real tonne.km row", () => {
  const result = extractFreightingGoodsRows(readZip(buildXlsx()));
  assert.equal(result.get("air_freight_domestic")[0].ttwCo2e, 1.5); // not 9999
});

test("extractFreightingGoodsRows: the 'Sea tanker' decoy block (same header shape, different Activity) never contributes to a Cargo-ship target", () => {
  const result = extractFreightingGoodsRows(readZip(buildXlsx()));
  for (const vc of ["ocean_container_ship_average", "ocean_bulk_carrier_average", "ocean_general_cargo_average", "ocean_roro_average"]) {
    assert.notEqual(result.get(vc)[0].ttwCo2e, 8888, `${vc} must not read the Sea-tanker decoy row`);
  }
});

test("ATTACK: ocean_roro_average refuses to silently pick 'Large RoPax ferry' when 'RoRo-Ferry' is absent — lists it as a candidate instead", () => {
  assert.throws(() => extractFreightingGoodsRows(readZip(buildXlsx({ roroFerryPresent: false }))), (err) => {
    assert.ok(err instanceof DesnzStructureError);
    assert.match(err.message, /ocean_roro_average/);
    assert.match(err.message, /Large RoPax ferry/);
    assert.match(err.message, /Refusing to guess a near match/);
    return true;
  });
});

test("ATTACK: extractFreightingGoodsRows throws naming the target and listing sibling Type/Size text when a row is simply absent", () => {
  const target = { vehicleClass: "nonexistent", mode: "ocean", blockActivity: "Cargo ship", type: "Ro-Ro (does not exist)", size: "Average" };
  assert.throws(() => extractFreightingGoodsRows(readZip(buildXlsx()), { targets: [target] }), (err) => {
    assert.ok(err instanceof DesnzStructureError);
    assert.match(err.message, /nonexistent/);
    assert.match(err.message, /Bulk carrier/); // a real sibling under the same Activity
    return true;
  });
});

test("ATTACK: extractFreightingGoodsRows refuses to guess an ambiguous double match", () => {
  const target = { vehicleClass: "ambiguous_test", mode: "ocean", blockActivity: "Cargo ship", type: "Bulk carrier" }; // no Size: matches BOTH the 200,000+ dwt AND Average rows
  assert.throws(() => extractFreightingGoodsRows(readZip(buildXlsx()), { targets: [target] }), (err) => {
    assert.ok(err instanceof DesnzStructureError);
    assert.match(err.message, /ambiguous_test/);
    assert.match(err.message, /refusing to guess/);
    return true;
  });
});

test("ATTACK: workbook missing the 'Freighting goods' sheet entirely fails loudly, naming the sheets present", () => {
  const buf = buildZip([
    { name: "xl/workbook.xml", content: `<workbook><sheets><sheet name="Other" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/sharedStrings.xml", content: `<sst></sst>` },
    { name: "xl/worksheets/sheet1.xml", content: `<worksheet><sheetData></sheetData></worksheet>` },
  ]);
  assert.throws(() => extractFreightingGoodsRows(readZip(buf)), (err) => {
    assert.ok(err instanceof DesnzStructureError);
    assert.match(err.message, /no sheet named "Freighting goods"/);
    assert.match(err.message, /Other/);
    return true;
  });
});

// ── resolveTotalGroup (via an injected synthetic target on the "Ambiguous" block): the group-title mechanism ─

test("ATTACK (red test): refuses to guess when no title in GROUP_TITLE_SELECTION_TABLE matches any group in an unresolved block", () => {
  assert.throws(() => extractFreightingGoodsRows(readZip(buildXlsx()), { targets: [AMBIGUOUS_TARGET] }), (err) => {
    assert.ok(err instanceof DesnzStructureError);
    assert.match(err.message, /GROUP_TITLE_SELECTION_TABLE/);
    assert.match(err.message, /header block at row 25/);
    assert.match(err.message, /AMBIG-TITLE-A/);
    assert.match(err.message, /AMBIG-TITLE-B/);
    assert.match(err.message, /row 24: /); // the required self-explaining row dump
    assert.match(err.message, /row 25: /);
    return true;
  });
});

test("ATTACK: refuses to guess when more than one GROUP_TITLE_SELECTION_TABLE rule matches distinct groups", () => {
  const table = [{ match: /^ambigtitlea$/, label: "r1" }, { match: /^ambigtitleb$/, label: "r2" }];
  assert.throws(() => extractFreightingGoodsRows(readZip(buildXlsx()), { targets: [AMBIGUOUS_TARGET], selectionTable: table }), (err) => {
    assert.ok(err instanceof DesnzStructureError);
    assert.match(err.message, /matched more than one/);
    assert.match(err.message, /AMBIG-TITLE-A/);
    assert.match(err.message, /AMBIG-TITLE-B/);
    return true;
  });
});

test("ATTACK: refuses to guess when the group-title row itself is missing entirely", () => {
  assert.throws(
    () => extractFreightingGoodsRows(readZip(buildXlsx({ ambiguousNoTitleRow: true })), { targets: [AMBIGUOUS_TARGET] }),
    (err) => {
      assert.ok(err instanceof DesnzStructureError);
      assert.match(err.message, /no group-title row was found at row 24/);
      return true;
    },
  );
});

test("extractFreightingGoodsRows: selection is title-driven — a rule matching the OTHER (Without RF) group selects that group's value instead", () => {
  const table = [{ match: /^withoutrf$/, label: "test-only: proves the mechanism is not hardcoded to column D" }];
  const target = { vehicleClass: "air_freight_domestic", mode: "air", blockActivity: "Freight flights", type: "Domestic, to/from UK", groupTitle: "Without RF" };
  const result = extractFreightingGoodsRows(readZip(buildXlsx()), { targets: [target], selectionTable: table });
  const domestic = result.get("air_freight_domestic")[0];
  assert.equal(domestic.column, "H");
  assert.equal(domestic.ttwCo2e, 0.9);
  assert.equal(domestic.groupTitle, "Without RF");
});

test("ATTACK: a target's declared groupTitle disagreeing with what the selection table actually picked is refused, not silently accepted", () => {
  // GROUP_TITLE_SELECTION_TABLE (the shipped default) selects "With RF"; this target insists on "Without RF".
  const target = { vehicleClass: "air_freight_domestic", mode: "air", blockActivity: "Freight flights", type: "Domestic, to/from UK", groupTitle: "Without RF" };
  assert.throws(() => extractFreightingGoodsRows(readZip(buildXlsx()), { targets: [target] }), (err) => {
    assert.ok(err instanceof DesnzStructureError);
    assert.match(err.message, /disagree/);
    return true;
  });
});

test("ATTACK: throws rather than silently defaulting energy_carrier when a fuel/energy-carrier column IS present in a matched block", () => {
  // Build a one-off xlsx: the flights header row carries an extra literal "Fuel"-labeled column.
  const rows = [
    `<row r="96">${cs("D96", "With RF")}${cs("H96", "Without RF")}</row>`,
    `<row r="97">${cs("A97", "Activity")}${cs("B97", "Type")}${cs("C97", "Unit")}` +
      `${cs("D97", "kg CO2e")}${cs("E97", "kg CO2e of CO2 per unit")}${cs("F97", "kg CO2e of CH4 per unit")}${cs("G97", "kg CO2e of N2O per unit")}` +
      `${cs("H97", "kg CO2e")}${cs("I97", "kg CO2e of CO2 per unit")}${cs("J97", "kg CO2e of CH4 per unit")}${cs("K97", "kg CO2e of N2O per unit")}` +
      `<c r="L97" t="inlineStr"><is><t>Fuel</t></is></c></row>`,
    `<row r="98">${cs("A98", "Freight flights")}${cs("B98", "Domestic, to/from UK")}${cs("C98", "tonne.km")}${cn("D98", 1.5)}${cn("H98", 0.9)}</row>`,
  ];
  const sheetXml = `<?xml version="1.0"?><worksheet><sheetData>${rows.join("")}</sheetData></worksheet>`;
  const buf = buildZip([
    { name: "xl/workbook.xml", content: workbookXml(), method: 0 },
    { name: "xl/_rels/workbook.xml.rels", content: relsXml(), method: 8 },
    { name: "xl/sharedStrings.xml", content: sharedStringsXml(), method: 8 },
    { name: "xl/worksheets/sheet2.xml", content: sheetXml, method: 0 },
  ]);
  const target = { vehicleClass: "air_freight_domestic", mode: "air", blockActivity: "Freight flights", type: "Domestic, to/from UK", groupTitle: "With RF" };
  assert.throws(() => extractFreightingGoodsRows(readZip(buf), { targets: [target] }), (err) => {
    assert.ok(err instanceof DesnzStructureError);
    assert.match(err.message, /fuel\/energy-carrier column/);
    assert.match(err.message, /"Fuel"/);
    return true;
  });
});

// ── applyToFixture: writes shells, never a partial fixture ──────────────────────────────────────────────

const OPTS = { retrievedAt: "2026-09-03" };

test("applyToFixture fills all 7 shells in the real fixture and leaves the 4 confirmed rows untouched", () => {
  const fixture = JSON.parse(readFileSync(DESNZ_FIXTURE, "utf8"));
  const extracted = extractFreightingGoodsRows(readZip(buildXlsx()));
  const { rows, report } = applyToFixture(fixture.rows, extracted, OPTS);

  assert.equal(rows.length, 11); // 4 confirmed + 7 filled shells
  const stillPending = rows.filter((r) => r.needs_runner_fetch === true);
  assert.equal(stillPending.length, 0, "no shell should remain pending");

  const filledDomestic = rows.find((r) => r.vehicle_class === "air_freight_domestic");
  assert.equal(filledDomestic.ttw_co2e, 1.5);
  assert.equal(filledDomestic.mode, "air");
  assert.equal(filledDomestic.energy_carrier, "aviation_turbine_fuel_average");
  assert.match(filledDomestic.source_ref, /sheet 'Freighting goods'/);
  assert.match(filledDomestic.source_ref, /row 99/);
  assert.match(filledDomestic.source_ref, /group 'With RF'/);
  assert.match(filledDomestic.source_ref, /'Without RF' = 0.9/); // the secondary figure, cited not stored

  const roro = rows.find((r) => r.vehicle_class === "ocean_roro_average");
  assert.equal(roro.ttw_co2e, 0.021);
  assert.match(roro.source_ref, /RoRo-Ferry/);

  const rigid = rows.find((r) => r.vehicle_class === "rigid_hgv_7.5-17t");
  assert.equal(rigid.ttw_co2e, 0.36362, "a confirmed row must be byte-for-byte unchanged");

  assert.equal(report.length, 7);
});

test("every row applyToFixture builds passes validateFactor() with zero errors", () => {
  const fixture = JSON.parse(readFileSync(DESNZ_FIXTURE, "utf8"));
  const extracted = extractFreightingGoodsRows(readZip(buildXlsx()));
  const { rows } = applyToFixture(fixture.rows, extracted, OPTS);
  for (const row of rows) {
    // buildRow-equivalent: the top-level fixture header supplies source_key/as_at_date/valid_from, exactly
    // as loadFixtureRows() does for the real seeder — replicated here rather than importing the seeder's
    // internals, since this test's job is to prove the ROW SHAPE is valid, not re-exercise loadFixtureRows.
    const decorated = { source_key: fixture.source_key, as_at_date: fixture.as_at_date, valid_from: fixture.valid_from, ...row };
    assert.deepEqual(validateFactor(decorated), [], `${row.vehicle_class} must validate cleanly`);
  }
});

test("ATTACK: applyToFixture refuses to write when the extractor did not resolve every shell (partial-fixture guard)", () => {
  const fixture = JSON.parse(readFileSync(DESNZ_FIXTURE, "utf8"));
  const extracted = extractFreightingGoodsRows(readZip(buildXlsx()));
  extracted.delete("ocean_roro_average"); // simulate an incomplete extraction
  assert.throws(() => applyToFixture(fixture.rows, extracted, OPTS), (err) => {
    assert.ok(err instanceof DesnzStructureError);
    assert.match(err.message, /ocean_roro_average/);
    assert.match(err.message, /not resolved/);
    return true;
  });
});

test("applyToFixture leaves a fixture with no needs_runner_fetch rows completely unchanged (idempotent no-op shape)", () => {
  const rows = [{ vehicle_class: "x", needs_runner_fetch: undefined, ttw_co2e: 1 }];
  const { rows: out, report } = applyToFixture(rows, new Map(), OPTS);
  assert.deepEqual(out, rows);
  assert.deepEqual(report, []);
});

// ── CLI plumbing ──────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: no flags defaults to fetch-from-network, dry-run, the real fixture path", () => {
  const args = parseArgs(["node", "fetch-desnz-factors.mjs"]);
  assert.equal(args.xlsxPath, null);
  assert.equal(args.apply, false);
  assert.equal(args.reportPath, null);
  assert.ok(args.fixturePath.endsWith("desnz-modal-defaults-2025.json"));
});

test("parseArgs: --xlsx, --apply, --report, --fixture are all parsed", () => {
  const args = parseArgs(["node", "s.mjs", "--xlsx", "a.xlsx", "--apply", "--report", "out.txt", "--fixture", "f.json"]);
  assert.deepEqual(args, { xlsxPath: "a.xlsx", fixturePath: "f.json", reportPath: "out.txt", apply: true });
});

test("resolveXlsxUrl: scrapes a 'full set' xlsx link from the gov.uk page HTML when the fetch succeeds", async () => {
  const fakeFetch = async (url) => {
    assert.equal(url, GOV_UK_PAGE_URL);
    return {
      ok: true,
      text: async () => `<a href="/media/x/factors.xlsx">GHG conversion factors 2025: full set (for advanced users)</a>`,
    };
  };
  const url = await resolveXlsxUrl(fakeFetch);
  assert.equal(url, "https://www.gov.uk/media/x/factors.xlsx");
});

test("resolveXlsxUrl: falls back to the known URL when the page fetch fails, without throwing", async () => {
  const url = await resolveXlsxUrl(async () => ({ ok: false, status: 500, statusText: "err" }));
  assert.equal(url, FALLBACK_XLSX_URL);
});

test("resolveXlsxUrl: falls back to the known URL when the page has no matching link", async () => {
  const url = await resolveXlsxUrl(async () => ({ ok: true, text: async () => `<a href="/other.pdf">Methodology</a>` }));
  assert.equal(url, FALLBACK_XLSX_URL);
});

test("resolveXlsxUrl: falls back to the known URL when fetch itself throws (network error)", async () => {
  const url = await resolveXlsxUrl(async () => { throw new Error("ECONNRESET"); });
  assert.equal(url, FALLBACK_XLSX_URL);
});
