// Tests for fetch-desnz-factors.mjs — pure, $0, offline, no network, no DB.
//
// THE CENTRAL PROOF: a real xlsx is a zip of XML. This file BUILDS a small, real zip archive in memory
// (buildXlsx() below — hand-rolled ZIP local/central-directory writer, both "stored" and "deflate" entries
// are exercised so readZip()'s two supported compression methods are both proven against real bytes, not
// just against buffers this test happens to construct the same way the reader expects) with the SAME
// sheet-name-resolution, repeated-header-row, and 7-group column shape a real 2026-09-02 runner dry run
// (workflow run 33704367826) found in the live "Freighting goods" sheet. extractFreightingGoodsRows() is
// then run against that constructed workbook exactly as it would run against the real download — this is
// the extractor's proof, not a mock of it.
//
// LANE DESNZ-2 (2026-09-03): the runner's structural failure was "header block at row 25: expected exactly
// one 'Total kg CO2e' column, found 7" — the sheet repeats a 4-column group (total / CO2 / CH4 / N2O per
// unit) seven times, and which group is the row's real figure is decided by a group-title row merged in
// directly above (row 24). buildSheetXml() below now constructs THAT shape, with SEVEN synthetic group
// titles ("TEST-TITLE-A".."TEST-TITLE-G" — NOT real DESNZ text, this sandbox cannot read row 24's real
// content; see fetch-desnz-factors.mjs's own header, point 5). TEST_SELECTION_TABLE, local to this test
// file only, tells the extractor which synthetic title is "the row's real figure" — the shipped
// GROUP_TITLE_SELECTION_TABLE in fetch-desnz-factors.mjs itself stays empty, on purpose, until a human has
// read a real runner failure's title list.
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

// A synthetic selection table, LOCAL TO THIS TEST FILE ONLY — proves resolveBlockGroups()'s title-driven
// group selection without the shipped GROUP_TITLE_SELECTION_TABLE (asserted empty just below) ever needing
// to contain a guess at the real DESNZ title text.
const TEST_SELECTION_TABLE = [
  { match: /^testtitled$/, label: "test-only: TEST-TITLE-D is this constructed workbook's real figure" },
];

test("GROUP_TITLE_SELECTION_TABLE ships empty — this sandbox cannot read the real title text, so it must not guess one", () => {
  assert.deepEqual(GROUP_TITLE_SELECTION_TABLE, []);
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

// ── A minimal xlsx builder matching the REAL "Freighting goods" sheet's proven shape ─────────────────────
// (proven by the 2026-09-02 runner dry run against the actual gov.uk workbook, workflow run 33704367826)

const SHARED_STRINGS = [
  "Activity", "Type", "Unit",                                          // 0-2: Activity/Type/Unit header
  "kg CO2e",                                                            // 3: group sub-header — total
  "kg CO2e of CO2 per unit",                                            // 4: group sub-header — CO2
  "kg CO2e of CH4 per unit",                                            // 5: group sub-header — CH4
  "kg CO2e of N2O per unit",                                            // 6: group sub-header — N2O
  "Road", "Rigid (>7.5 tonnes-17 tonnes)",                              // 7-8: decoy road block
  "tonne.km",                                                           // 9: real unit (decoy + all real rows)
  "Air",                                                                 // 10
  "Domestic, to/from UK",                                               // 11
  "Short-haul international, to/from UK",                               // 12
  "Long-haul international, to/from UK",                                // 13
  "tonne",                                                               // 14: decoy unit — per-tonne, not tonne.km
  "Sea tanker/Cargo",                                                   // 15
  "Container ship, average",                                             // 16
  "Bulk carrier, average",                                               // 17
  "General cargo, average",                                              // 18
  "RoRo, average",                                                       // 19
  "Fuel",                                                                // 20: ATTACK — literal fuel-column trap
  "TEST-TITLE-A", "TEST-TITLE-B", "TEST-TITLE-C", "TEST-TITLE-D",       // 21-24: synthetic group titles —
  "TEST-TITLE-E", "TEST-TITLE-F", "TEST-TITLE-G",                       // 25-27  NOT real DESNZ text
];
function ss(i) { return SHARED_STRINGS[i]; }

function sharedStringsXml() {
  return `<?xml version="1.0"?><sst count="${SHARED_STRINGS.length}" uniqueCount="${SHARED_STRINGS.length}">` +
    SHARED_STRINGS.map((s) => `<si><t>${s.replace(/&/g, "&amp;")}</t></si>`).join("") + `</sst>`;
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

// The 7 four-column groups the real sheet repeats — same column positions (D,H,L,P,T,X,AB) the fixture
// already documents for the Vans section's fuel-type split. "P" (the 4th group) is arbitrarily chosen as
// "the real figure" for this constructed workbook; TEST_SELECTION_TABLE above is what tells the extractor
// so — nothing in the extractor itself is hardcoded to column P.
const GROUPS = [
  ["D", "E", "F", "G"],
  ["H", "I", "J", "K"],
  ["L", "M", "N", "O"],
  ["P", "Q", "R", "S"],
  ["T", "U", "V", "W"],
  ["X", "Y", "Z", "AA"],
  ["AB", "AC", "AD", "AE"],
];
const SELECTED_GROUP_ANCHOR = "P";
const GROUP_TITLE_IDXS = [21, 22, 23, 24, 25, 26, 27]; // TEST-TITLE-A..G, in group order

/** Row 24: one merged title per group, in the group's first (anchor) column only — the other 3 columns of
 *  each group are left blank, exactly as the real sheet's Vans fuel-type titles are documented to be. */
function titleRowXml() {
  return GROUPS.map(([anchor], i) => c(`${anchor}24`, { s: GROUP_TITLE_IDXS[i] })).join("");
}

/** Row 25: Activity/Type/Unit + the 7 groups' 4 repeated sub-column labels (total/CO2/CH4/N2O), identical
 *  text in every group — exactly what the real runner failure printed. */
function subHeaderRowXml(fuelColumn) {
  let xml = c("A25", { s: 0 }) + c("B25", { s: 1 }) + c("C25", { s: 2 });
  for (const [total, co2, ch4, n2o] of GROUPS) {
    xml += c(`${total}25`, { s: 3 }) + c(`${co2}25`, { s: 4 }) + c(`${ch4}25`, { s: 5 }) + c(`${n2o}25`, { s: 6 });
  }
  // ATTACK fixture: a column BEYOND the 7 real groups literally labeled "Fuel" — a different trap than
  // group-title ambiguity (a discrete fuel/energy-carrier column the extractor must still refuse to
  // silently default past; see the fuelColumn test below).
  if (fuelColumn) xml += c("AF25", { s: 20 });
  return xml;
}

/** One data row: Activity/Type/Unit + all 7 groups' total cells, sentinel 9999 everywhere except the
 *  SELECTED_GROUP_ANCHOR column, which carries `realValue` — proves extraction reads the one column the
 *  title-selection mechanism picked, not any other group's total. */
function dataRowXml(rowNum, activityIdx, typeIdx, unitIdx, realValue) {
  let xml = c(`A${rowNum}`, { s: activityIdx }) + c(`B${rowNum}`, { s: typeIdx }) + c(`C${rowNum}`, { s: unitIdx });
  for (const [total] of GROUPS) {
    xml += c(`${total}${rowNum}`, { n: total === SELECTED_GROUP_ANCHOR ? realValue : 9999 });
  }
  return xml;
}

/** Builds a sheet with: a decoy Road header block (single Total column, no group-title row needed), then
 *  the REAL 7-group Freighting-goods-shaped block with Air (3 haul lengths, one with a decoy non-tonne.km
 *  unit row) and Sea (4 vessel types). */
function buildSheetXml({
  airRfSplit = false,
  ambiguousDuplicate = false,
  missingBulkCarrier = false,
  fuelColumn = false,
  noTitleRow = false,
} = {}) {
  const rows = [];

  // Decoy block: header at row 10, single Total column E — proves the simple single-total-column path
  // (no group-title row involved at all) still resolves independently of the real block's 7-group shape.
  rows.push(`<row r="10">${c("A10", { s: 0 })}${c("B10", { s: 1 })}${c("C10", { s: 2 })}${c("E10", { s: 3 })}</row>`);
  rows.push(`<row r="11">${c("A11", { s: 7 })}${c("B11", { s: 8 })}${c("C11", { s: 9 })}${c("E11", { n: 0.363 })}</row>`);

  // Title row 24 + sub-column header row 25: the shape the 2026-09-02 runner dry run actually found.
  if (!noTitleRow) rows.push(`<row r="24">${titleRowXml()}</row>`);
  rows.push(`<row r="25">${subHeaderRowXml(fuelColumn)}</row>`);

  let r = 26;
  // Air rows. Decoy FIRST: Domestic air published per-tonne too (not tonne.km) — must NOT be picked over
  // the real tonne.km row that follows it, regardless of which group column is selected.
  rows.push(`<row r="${r}">${dataRowXml(r, 10, 11, 14, 999)}</row>`); r++;
  if (airRfSplit) {
    rows.push(
      `<row r="${r}">${c(`A${r}`, { s: 10 })}<c r="B${r}" t="inlineStr"><is><t>Domestic, to/from UK, with RF</t></is></c>` +
      `${c(`C${r}`, { s: 9 })}${GROUPS.map(([t]) => c(`${t}${r}`, { n: t === SELECTED_GROUP_ANCHOR ? 1.9 : 9999 })).join("")}</row>`,
    ); r++;
    rows.push(
      `<row r="${r}">${c(`A${r}`, { s: 10 })}<c r="B${r}" t="inlineStr"><is><t>Domestic, to/from UK, without RF</t></is></c>` +
      `${c(`C${r}`, { s: 9 })}${GROUPS.map(([t]) => c(`${t}${r}`, { n: t === SELECTED_GROUP_ANCHOR ? 1.5 : 9999 })).join("")}</row>`,
    ); r++;
  } else if (ambiguousDuplicate) {
    rows.push(`<row r="${r}">${dataRowXml(r, 10, 11, 9, 1.9)}</row>`); r++;
    rows.push(`<row r="${r}">${dataRowXml(r, 10, 11, 9, 1.5)}</row>`); r++;
  } else {
    rows.push(`<row r="${r}">${dataRowXml(r, 10, 11, 9, 1.5)}</row>`); r++;
  }
  rows.push(`<row r="${r}">${dataRowXml(r, 10, 12, 9, 0.8)}</row>`); r++;
  rows.push(`<row r="${r}">${dataRowXml(r, 10, 13, 9, 0.6)}</row>`); r++;

  // Sea rows
  rows.push(`<row r="${r}">${dataRowXml(r, 15, 16, 9, 0.012)}</row>`); r++;
  if (!missingBulkCarrier) {
    rows.push(`<row r="${r}">${dataRowXml(r, 15, 17, 9, 0.008)}</row>`); r++;
  }
  rows.push(`<row r="${r}">${dataRowXml(r, 15, 18, 9, 0.015)}</row>`); r++;
  rows.push(`<row r="${r}">${dataRowXml(r, 15, 19, 9, 0.021)}</row>`); r++;

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
  const xml = sharedStringsXml();
  const strings = parseSharedStrings(xml);
  assert.equal(strings[0], "Activity");
  assert.equal(strings[10], "Air");
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
  const row25 = rows.find((r) => r.rowNum === 25);
  assert.equal(ss(0), "Activity");
  assert.ok(row25.cells.has("A"));
});

// ── findHeaderBlocks: header rows only, never the title row above them ──────────────────────────────────

test("findHeaderBlocks finds both header rows (10 and 25) — row 24's group titles are NOT mistaken for a third header block", () => {
  const rows = parseSheetRows(buildSheetXml());
  const strings = parseSharedStrings(sharedStringsXml());
  const blocks = findHeaderBlocks(rows, strings);
  assert.deepEqual(blocks.map((b) => b.startRow), [10, 25]);
  assert.equal(blocks[0].endRow, 25);
  assert.equal(blocks[1].endRow, Infinity);
  // decoy block's Total col is E, real block's first-group Total is D — both correctly distinguished:
  assert.equal(blocks[0].columns.get("E"), "kg CO2e");
  assert.equal(blocks[1].columns.get("D"), "kg CO2e");
  // and the real block now genuinely carries all 7 groups' total columns:
  for (const anchor of ["D", "H", "L", "P", "T", "X", "AB"]) {
    assert.equal(blocks[1].columns.get(anchor), "kg CO2e");
  }
});

test("findHeaderBlocks throws when no Activity/Type/Unit row exists anywhere in the sheet", () => {
  const rows = parseSheetRows(`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>nothing relevant here</t></is></c></row></sheetData></worksheet>`);
  assert.throws(() => findHeaderBlocks(rows, []), DesnzStructureError);
});

// ── extractFreightingGoodsRows: the end-to-end proof on a constructed 7-group xlsx ────────────────────────

test("extractFreightingGoodsRows resolves all 7 targets, picking the group TEST_SELECTION_TABLE names (column P), not any other group", () => {
  const zip = readZip(buildXlsx());
  const result = extractFreightingGoodsRows(zip, { selectionTable: TEST_SELECTION_TABLE });
  assert.equal(result.size, 7);
  for (const target of TARGETS) assert.ok(result.has(target.vehicleClass), `missing ${target.vehicleClass}`);

  const domestic = result.get("air_freight_domestic")[0];
  assert.equal(domestic.ttwCo2e, 1.5);
  assert.equal(domestic.row, 27); // NOT the decoy per-tonne row at 26 or the decoy road row
  assert.equal(domestic.column, "P"); // the group TEST_SELECTION_TABLE matched, NOT the first (D) or any other
  assert.equal(domestic.groupTitle, "TEST-TITLE-D");
  assert.equal(domestic.activityText, "Air");
  assert.equal(domestic.typeText, "Domestic, to/from UK");
  assert.equal(domestic.unitText, "tonne.km");
  assert.equal(domestic.rId, "rId7");

  const bulk = result.get("ocean_bulk_carrier_average")[0];
  assert.equal(bulk.ttwCo2e, 0.008);
  assert.equal(bulk.mode, "ocean");
});

test("extractFreightingGoodsRows: selection is truly title-driven, not hardcoded to column P — a rule matching a different title picks that group's (sentinel) value instead", () => {
  const wrongTable = [{ match: /^testtitlea$/, label: "test-only: picks the FIRST group on purpose" }];
  const result = extractFreightingGoodsRows(readZip(buildXlsx()), { selectionTable: wrongTable });
  const domestic = result.get("air_freight_domestic")[0];
  assert.equal(domestic.column, "D");
  assert.equal(domestic.groupTitle, "TEST-TITLE-A");
  assert.equal(domestic.ttwCo2e, 9999); // the sentinel every non-selected group carries
});

test("extractFreightingGoodsRows: the decoy per-tonne (not tonne.km) Domestic row is never picked over the real tonne.km row", () => {
  const result = extractFreightingGoodsRows(readZip(buildXlsx()), { selectionTable: TEST_SELECTION_TABLE });
  assert.equal(result.get("air_freight_domestic")[0].ttwCo2e, 1.5); // not 999
});

test("extractFreightingGoodsRows: an RF split (with RF / without RF) produces two suffixed items instead of guessing one", () => {
  const result = extractFreightingGoodsRows(readZip(buildXlsx({ airRfSplit: true })), { selectionTable: TEST_SELECTION_TABLE });
  const items = result.get("air_freight_domestic");
  assert.equal(items.length, 2);
  const withRf = items.find((i) => i.rfSuffix === "with_rf");
  const withoutRf = items.find((i) => i.rfSuffix === "without_rf");
  assert.ok(withRf && withoutRf);
  assert.equal(withRf.ttwCo2e, 1.9);
  assert.equal(withoutRf.ttwCo2e, 1.5);
  assert.equal(withRf.vehicleClass, "air_freight_domestic_with_rf");
  assert.equal(withoutRf.vehicleClass, "air_freight_domestic_without_rf");
});

test("ATTACK: extractFreightingGoodsRows refuses to guess an unexplained duplicate match (not an RF pair)", () => {
  assert.throws(
    () => extractFreightingGoodsRows(readZip(buildXlsx({ ambiguousDuplicate: true })), { selectionTable: TEST_SELECTION_TABLE }),
    (err) => {
      assert.ok(err instanceof DesnzStructureError);
      assert.match(err.message, /air_freight_domestic/);
      assert.match(err.message, /do not resolve as a clean with-RF/);
      return true;
    },
  );
});

test("ATTACK: extractFreightingGoodsRows throws naming the target when a row is simply absent (bulk carrier missing)", () => {
  assert.throws(
    () => extractFreightingGoodsRows(readZip(buildXlsx({ missingBulkCarrier: true })), { selectionTable: TEST_SELECTION_TABLE }),
    (err) => {
      assert.ok(err instanceof DesnzStructureError);
      assert.match(err.message, /ocean_bulk_carrier_average/);
      assert.match(err.message, /no row found/);
      return true;
    },
  );
});

test("ATTACK: extractFreightingGoodsRows throws rather than silently defaulting energy_carrier when a fuel column IS present", () => {
  assert.throws(
    () => extractFreightingGoodsRows(readZip(buildXlsx({ fuelColumn: true })), { selectionTable: TEST_SELECTION_TABLE }),
    (err) => {
      assert.ok(err instanceof DesnzStructureError);
      assert.match(err.message, /fuel\/energy-carrier column/);
      assert.match(err.message, /"Fuel"/);
      return true;
    },
  );
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

// ── resolveBlockGroups (via extractFreightingGoodsRows): the group-title mechanism itself ─────────────────

test("ATTACK (the real 2026-09-02 runner failure, reproduced structurally): refuses to guess when NO title in the selection table matches any group — the shipped default is empty, so this is what a real run hits today", () => {
  assert.throws(() => extractFreightingGoodsRows(readZip(buildXlsx())), (err) => {
    assert.ok(err instanceof DesnzStructureError);
    assert.match(err.message, /GROUP_TITLE_SELECTION_TABLE/);
    assert.match(err.message, /header block at row 25/);
    for (const title of ["TEST-TITLE-A", "TEST-TITLE-B", "TEST-TITLE-C", "TEST-TITLE-D", "TEST-TITLE-E", "TEST-TITLE-F", "TEST-TITLE-G"]) {
      assert.match(err.message, new RegExp(title), `failure message must list ${title}`);
    }
    // the required self-explaining row dump, headerRow-3..headerRow (21..25 for this block):
    assert.match(err.message, /row 24: .*TEST-TITLE-A.*TEST-TITLE-D/);
    assert.match(err.message, /row 25: /);
    return true;
  });
});

test("ATTACK: refuses to guess when more than one GROUP_TITLE_SELECTION_TABLE rule matches distinct groups", () => {
  const ambiguousTable = [
    { match: /^testtitlea$/, label: "rule 1" },
    { match: /^testtitled$/, label: "rule 2" },
  ];
  assert.throws(() => extractFreightingGoodsRows(readZip(buildXlsx()), { selectionTable: ambiguousTable }), (err) => {
    assert.ok(err instanceof DesnzStructureError);
    assert.match(err.message, /matched more than one/);
    assert.match(err.message, /TEST-TITLE-A/);
    assert.match(err.message, /TEST-TITLE-D/);
    return true;
  });
});

test("ATTACK: refuses to guess when the group-title row itself is missing entirely", () => {
  assert.throws(
    () => extractFreightingGoodsRows(readZip(buildXlsx({ noTitleRow: true })), { selectionTable: TEST_SELECTION_TABLE }),
    (err) => {
      assert.ok(err instanceof DesnzStructureError);
      assert.match(err.message, /no group-title row was found at row 24/);
      return true;
    },
  );
});

// ── applyToFixture: writes shells, never a partial fixture ──────────────────────────────────────────────

const OPTS = { retrievedAt: "2026-09-02" };

test("applyToFixture fills all 7 shells in the real fixture and leaves the 4 confirmed rows untouched", () => {
  const fixture = JSON.parse(readFileSync(DESNZ_FIXTURE, "utf8"));
  const extracted = extractFreightingGoodsRows(readZip(buildXlsx()), { selectionTable: TEST_SELECTION_TABLE });
  const { rows, report } = applyToFixture(fixture.rows, extracted, OPTS);

  assert.equal(rows.length, 11); // 4 confirmed + 7 filled shells, no RF split in this build
  const stillPending = rows.filter((r) => r.needs_runner_fetch === true);
  assert.equal(stillPending.length, 0, "no shell should remain pending");

  const filledDomestic = rows.find((r) => r.vehicle_class === "air_freight_domestic");
  assert.equal(filledDomestic.ttw_co2e, 1.5);
  assert.equal(filledDomestic.mode, "air");
  assert.equal(filledDomestic.energy_carrier, "aviation_turbine_fuel_average");
  assert.match(filledDomestic.source_ref, /sheet 'Freighting goods'/);
  assert.match(filledDomestic.source_ref, /row 27/);
  assert.match(filledDomestic.source_ref, /group 'TEST-TITLE-D'/);

  const rigid = rows.find((r) => r.vehicle_class === "rigid_hgv_7.5-17t");
  assert.equal(rigid.ttw_co2e, 0.36362, "a confirmed row must be byte-for-byte unchanged");

  assert.equal(report.length, 7);
});

test("applyToFixture: an RF split replaces ONE shell with TWO rows, and the fixture's other 6 shells still resolve", () => {
  const fixture = JSON.parse(readFileSync(DESNZ_FIXTURE, "utf8"));
  const extracted = extractFreightingGoodsRows(readZip(buildXlsx({ airRfSplit: true })), { selectionTable: TEST_SELECTION_TABLE });
  const { rows } = applyToFixture(fixture.rows, extracted, OPTS);

  assert.equal(rows.length, 12); // 4 confirmed + 6 non-split shells + 2 (the split domestic pair)
  assert.ok(rows.some((r) => r.vehicle_class === "air_freight_domestic_with_rf" && r.ttw_co2e === 1.9));
  assert.ok(rows.some((r) => r.vehicle_class === "air_freight_domestic_without_rf" && r.ttw_co2e === 1.5));
  assert.ok(!rows.some((r) => r.vehicle_class === "air_freight_domestic"), "the un-suffixed base shell must be gone, not left dangling");
});

test("every row applyToFixture builds passes validateFactor() with zero errors", () => {
  const fixture = JSON.parse(readFileSync(DESNZ_FIXTURE, "utf8"));
  const extracted = extractFreightingGoodsRows(readZip(buildXlsx()), { selectionTable: TEST_SELECTION_TABLE });
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
  const extracted = extractFreightingGoodsRows(readZip(buildXlsx()), { selectionTable: TEST_SELECTION_TABLE });
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
