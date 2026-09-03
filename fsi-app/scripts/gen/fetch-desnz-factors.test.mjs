// Tests for fetch-desnz-factors.mjs — pure, $0, offline, no network, no DB.
//
// THE CENTRAL PROOF: a real xlsx is a zip of XML. This file BUILDS a small, real zip archive in memory
// (buildXlsx() below — hand-rolled ZIP local/central-directory writer, both "stored" and "deflate" entries
// are exercised so readZip()'s two supported compression methods are both proven against real bytes, not
// just against buffers this test happens to construct the same way the reader expects) with the SAME
// sheet-name-resolution, repeated-header-row, and Activity/Type/Unit/kg-CO2e column shape the DESNZ
// fixture's own header documents for the real "Freighting goods" sheet. extractFreightingGoodsRows() is
// then run against that constructed workbook exactly as it would run against the real download — this is
// the extractor's proof, not a mock of it.
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
} from "./fetch-desnz-factors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESNZ_FIXTURE = resolve(HERE, "fixtures/emission-factors/desnz-modal-defaults-2025.json");

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

// ── A minimal xlsx builder matching the real "Freighting goods" sheet's documented shape ────────────────

const SHARED_STRINGS = [
  "Activity", "Type", "Unit", "kg CO2e",              // 0-3: header row labels
  "Road", "Rigid (>7.5 tonnes-17 tonnes)", "tonne.km", // 4-6: decoy road block (proves header re-blocking)
  "Air",                                                // 7
  "Domestic, to/from UK", "tonne.km",                   // 8-9
  "Short-haul international, to/from UK",               // 10
  "Long-haul international, to/from UK",                // 11
  "tonne",                                               // 12: decoy unit — per-tonne, NOT per-tonne.km
  "Sea tanker/Cargo",                                   // 13
  "Container ship, average",                            // 14
  "Bulk carrier, average",                               // 15
  "General cargo, average",                              // 16
  "RoRo, average",                                       // 17
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

/** Builds a sheet with: a decoy Road header block (cols shifted), then a Freighting-goods-shaped block
 *  with Air (3 haul lengths, one with a decoy non-tonne.km unit row) and Sea (4 vessel types). */
function buildSheetXml({ airRfSplit = false, ambiguousDuplicate = false, missingBulkCarrier = false, fuelColumn = false } = {}) {
  const rows = [];
  // Decoy block: header at row 10, Total col is E here (not D) — proves column resolution is per-block.
  rows.push(`<row r="10">${c("A10", { s: 0 })}${c("B10", { s: 1 })}${c("C10", { s: 2 })}${c("E10", { s: 3 })}</row>`);
  rows.push(`<row r="11">${c("A11", { s: 4 })}${c("B11", { s: 5 })}${c("C11", { s: 6 })}${c("E11", { n: 0.363 })}</row>`);

  // Real block: header at row 25, Total col is D. When fuelColumn is set, E25 adds a literal "Fuel"
  // label — the trap the extractor must refuse to ignore rather than silently default energy_carrier.
  const fuelHeaderCell = fuelColumn ? `<c r="E25" t="inlineStr"><is><t>Fuel</t></is></c>` : "";
  rows.push(`<row r="25">${c("A25", { s: 0 })}${c("B25", { s: 1 })}${c("C25", { s: 2 })}${c("D25", { s: 3 })}${fuelHeaderCell}</row>`);
  let r = 26;

  // Air rows. Decoy FIRST (row 26): Domestic air published per-tonne too (not tonne.km) — must NOT be
  // picked over the real tonne.km row that follows it.
  rows.push(`<row r="${r++}">${c(`A${r - 1}`, { s: 7 })}${c(`B${r - 1}`, { s: 8 })}${c(`C${r - 1}`, { s: 12 })}${c(`D${r - 1}`, { n: 999 })}</row>`);
  if (airRfSplit) {
    rows.push(`<row r="${r++}">${c(`A${r - 1}`, { s: 7 })}<c r="B${r - 1}" t="inlineStr"><is><t>Domestic, to/from UK, with RF</t></is></c>${c(`C${r - 1}`, { s: 9 })}${c(`D${r - 1}`, { n: 1.9 })}</row>`);
    rows.push(`<row r="${r++}">${c(`A${r - 1}`, { s: 7 })}<c r="B${r - 1}" t="inlineStr"><is><t>Domestic, to/from UK, without RF</t></is></c>${c(`C${r - 1}`, { s: 9 })}${c(`D${r - 1}`, { n: 1.5 })}</row>`);
  } else if (ambiguousDuplicate) {
    rows.push(`<row r="${r++}">${c(`A${r - 1}`, { s: 7 })}${c(`B${r - 1}`, { s: 8 })}${c(`C${r - 1}`, { s: 9 })}${c(`D${r - 1}`, { n: 1.9 })}</row>`);
    rows.push(`<row r="${r++}">${c(`A${r - 1}`, { s: 7 })}${c(`B${r - 1}`, { s: 8 })}${c(`C${r - 1}`, { s: 9 })}${c(`D${r - 1}`, { n: 1.5 })}</row>`);
  } else {
    rows.push(`<row r="${r++}">${c(`A${r - 1}`, { s: 7 })}${c(`B${r - 1}`, { s: 8 })}${c(`C${r - 1}`, { s: 9 })}${c(`D${r - 1}`, { n: 1.5 })}</row>`);
  }
  rows.push(`<row r="${r++}">${c(`A${r - 1}`, { s: 7 })}${c(`B${r - 1}`, { s: 10 })}${c(`C${r - 1}`, { s: 9 })}${c(`D${r - 1}`, { n: 0.8 })}</row>`);
  rows.push(`<row r="${r++}">${c(`A${r - 1}`, { s: 7 })}${c(`B${r - 1}`, { s: 11 })}${c(`C${r - 1}`, { s: 9 })}${c(`D${r - 1}`, { n: 0.6 })}</row>`);

  // Sea rows
  rows.push(`<row r="${r++}">${c(`A${r - 1}`, { s: 13 })}${c(`B${r - 1}`, { s: 14 })}${c(`C${r - 1}`, { s: 9 })}${c(`D${r - 1}`, { n: 0.012 })}</row>`);
  if (!missingBulkCarrier) {
    rows.push(`<row r="${r++}">${c(`A${r - 1}`, { s: 13 })}${c(`B${r - 1}`, { s: 15 })}${c(`C${r - 1}`, { s: 9 })}${c(`D${r - 1}`, { n: 0.008 })}</row>`);
  }
  rows.push(`<row r="${r++}">${c(`A${r - 1}`, { s: 13 })}${c(`B${r - 1}`, { s: 16 })}${c(`C${r - 1}`, { s: 9 })}${c(`D${r - 1}`, { n: 0.015 })}</row>`);
  rows.push(`<row r="${r++}">${c(`A${r - 1}`, { s: 13 })}${c(`B${r - 1}`, { s: 17 })}${c(`C${r - 1}`, { s: 9 })}${c(`D${r - 1}`, { n: 0.021 })}</row>`);

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
  assert.equal(strings[7], "Air");
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

// ── findHeaderBlocks: the exact trap the DESNZ fixture header documents (column meaning changes per block) ─

test("findHeaderBlocks finds both header rows (10 and 25) and each block's Total column resolves independently", () => {
  const rows = parseSheetRows(buildSheetXml());
  const strings = parseSharedStrings(sharedStringsXml());
  const blocks = findHeaderBlocks(rows, strings);
  assert.deepEqual(blocks.map((b) => b.startRow), [10, 25]);
  assert.equal(blocks[0].endRow, 25);
  assert.equal(blocks[1].endRow, Infinity);
  // decoy block's Total col is E, real block's is D — both correctly distinguished:
  assert.equal(blocks[0].columns.get("E"), "kg CO2e");
  assert.equal(blocks[1].columns.get("D"), "kg CO2e");
});

test("findHeaderBlocks throws when no Activity/Type/Unit row exists anywhere in the sheet", () => {
  const rows = parseSheetRows(`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>nothing relevant here</t></is></c></row></sheetData></worksheet>`);
  assert.throws(() => findHeaderBlocks(rows, []), DesnzStructureError);
});

// ── extractFreightingGoodsRows: the end-to-end proof on a constructed xlsx ──────────────────────────────

test("extractFreightingGoodsRows resolves all 7 targets from a constructed xlsx with the documented sheet shape", () => {
  const zip = readZip(buildXlsx());
  const result = extractFreightingGoodsRows(zip);
  assert.equal(result.size, 7);
  for (const target of TARGETS) assert.ok(result.has(target.vehicleClass), `missing ${target.vehicleClass}`);

  const domestic = result.get("air_freight_domestic")[0];
  assert.equal(domestic.ttwCo2e, 1.5);
  assert.equal(domestic.row, 27); // NOT the decoy per-tonne row at 26 or the decoy road row
  assert.equal(domestic.column, "D"); // NOT the decoy block's column E
  assert.equal(domestic.activityText, "Air");
  assert.equal(domestic.typeText, "Domestic, to/from UK");
  assert.equal(domestic.unitText, "tonne.km");
  assert.equal(domestic.rId, "rId7");

  const bulk = result.get("ocean_bulk_carrier_average")[0];
  assert.equal(bulk.ttwCo2e, 0.008);
  assert.equal(bulk.mode, "ocean");
});

test("extractFreightingGoodsRows: the decoy per-tonne (not tonne.km) Domestic row is never picked over the real tonne.km row", () => {
  const result = extractFreightingGoodsRows(readZip(buildXlsx()));
  assert.equal(result.get("air_freight_domestic")[0].ttwCo2e, 1.5); // not 999
});

test("extractFreightingGoodsRows: an RF split (with RF / without RF) produces two suffixed items instead of guessing one", () => {
  const result = extractFreightingGoodsRows(readZip(buildXlsx({ airRfSplit: true })));
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
    () => extractFreightingGoodsRows(readZip(buildXlsx({ ambiguousDuplicate: true }))),
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
    () => extractFreightingGoodsRows(readZip(buildXlsx({ missingBulkCarrier: true }))),
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
    () => extractFreightingGoodsRows(readZip(buildXlsx({ fuelColumn: true }))),
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

// ── applyToFixture: writes shells, never a partial fixture ──────────────────────────────────────────────

const OPTS = { retrievedAt: "2026-09-02" };

test("applyToFixture fills all 7 shells in the real fixture and leaves the 4 confirmed rows untouched", () => {
  const fixture = JSON.parse(readFileSync(DESNZ_FIXTURE, "utf8"));
  const extracted = extractFreightingGoodsRows(readZip(buildXlsx()));
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

  const rigid = rows.find((r) => r.vehicle_class === "rigid_hgv_7.5-17t");
  assert.equal(rigid.ttw_co2e, 0.36362, "a confirmed row must be byte-for-byte unchanged");

  assert.equal(report.length, 7);
});

test("applyToFixture: an RF split replaces ONE shell with TWO rows, and the fixture's other 6 shells still resolve", () => {
  const fixture = JSON.parse(readFileSync(DESNZ_FIXTURE, "utf8"));
  const extracted = extractFreightingGoodsRows(readZip(buildXlsx({ airRfSplit: true })));
  const { rows } = applyToFixture(fixture.rows, extracted, OPTS);

  assert.equal(rows.length, 12); // 4 confirmed + 6 non-split shells + 2 (the split domestic pair)
  assert.ok(rows.some((r) => r.vehicle_class === "air_freight_domestic_with_rf" && r.ttw_co2e === 1.9));
  assert.ok(rows.some((r) => r.vehicle_class === "air_freight_domestic_without_rf" && r.ttw_co2e === 1.5));
  assert.ok(!rows.some((r) => r.vehicle_class === "air_freight_domestic"), "the un-suffixed base shell must be gone, not left dangling");
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
