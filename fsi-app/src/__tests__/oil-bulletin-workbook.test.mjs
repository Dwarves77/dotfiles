// Fixture-tested proof for src/lib/market/oil-bulletin-workbook.mjs (fetch-oil-bulletin.mjs's pure
// parsing core, WO-16 step 3, 2026-08-30).
//
// LOCATION: same reasoning as market-eu-oil-bulletin-parser.test.mjs — fsi-app/.discipline/
// run-test-suite.sh globs `fsi-app/src/__tests__/*.test.mjs` but has no glob covering
// `src/lib/market/**`, so a co-located `src/lib/market/oil-bulletin-workbook.test.mjs` would be a green
// test run by nothing (CLAUDE.md standing rule 15). This module is plain ESM with zero npm dependencies,
// so it needs no `.npmtest.mjs` deferral either — it runs in the same no-npm-ci job as every other
// src/__tests__ proof.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSheetNames,
  parseSharedStrings,
  iterateRows,
  resolveHeaderBlocks,
  parseDateCell,
  extractEuSeries,
  extractLatestEuRow,
  decodeOoxmlText,
  OilBulletinStructureError,
} from "../lib/market/oil-bulletin-workbook.mjs";
import { PRODUCTS, parseEuWeeklyOilBulletinCsv } from "../lib/market/parsers/eu-weekly-oil-bulletin.mjs";
import {
  SI,
  SHARED_STRINGS_XML,
  WORKBOOK_XML,
  WORKBOOK_RELS_XML,
  SHEET_WO_TAXES_XML,
  SHEET_NO_EU_BLOCK_XML,
  SHEET_NO_DATE_COLUMN_XML,
  SHEET_BAD_DATE_XML,
} from "./oil-bulletin-workbook.fixtures.mjs";

// ── decodeOoxmlText ──────────────────────────────────────────────────────────────────────────────────

test("decodeOoxmlText decodes standard XML entities and Excel's _xHHHH_ control-char escape", () => {
  assert.equal(decodeOoxmlText("A &amp; B &lt;tag&gt;"), 'A & B <tag>');
  assert.equal(decodeOoxmlText("Euro-super 95_x000D_(I)"), "Euro-super 95\r(I)");
  assert.equal(decodeOoxmlText(null), "");
});

// ── parseSheetNames ──────────────────────────────────────────────────────────────────────────────────

test("parseSheetNames resolves by r:id via the .rels file, never by document order", () => {
  const sheets = parseSheetNames(WORKBOOK_XML, WORKBOOK_RELS_XML);
  assert.equal(sheets["Prices with taxes"], "xl/worksheets/sheet1.xml");
  assert.equal(sheets["Prices wo taxes"], "xl/worksheets/sheet2.xml");
  assert.equal(sheets["Consumption"], "xl/worksheets/sheet3.xml");
  assert.equal(sheets["VAT"], "xl/worksheets/sheet4.xml");
});

test("parseSheetNames throws a named error when workbook.xml has no <sheet> entries", () => {
  assert.throws(() => parseSheetNames("<workbook><sheets/></workbook>", WORKBOOK_RELS_XML), OilBulletinStructureError);
});

test("parseSheetNames throws a named error when a sheet's r:id has no matching Relationship", () => {
  const badWorkbook = WORKBOOK_XML.replace('r:id="rId2"', 'r:id="rIdMissing"');
  assert.throws(() => parseSheetNames(badWorkbook, WORKBOOK_RELS_XML), /rIdMissing/);
});

// ── parseSharedStrings ───────────────────────────────────────────────────────────────────────────────

test("parseSharedStrings returns the verbatim table in index order, decoding entities and the CR escape", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  assert.equal(strings.length, 13);
  assert.equal(strings[SI.DATE], "Date");
  assert.equal(strings[SI.EU_BLOCK], "EU - European Union");
  assert.equal(strings[SI.EUROSUPER_95], "Euro-super 95  (I)");
  assert.equal(strings[SI.FUEL_OIL_HIGH_SULPHUR], " Fuel oil -Schweres Heizöl (III) Soufre > 1% Sulphur > 1% Schwefel > 1%");
  assert.equal(strings[SI.EUROSUPER_95_CR_VARIANT], "Euro-super 95\r(I)");
});

// ── iterateRows ──────────────────────────────────────────────────────────────────────────────────────

test("iterateRows yields rows in document order with correctly parsed cell refs, cols and types", () => {
  const rows = [...iterateRows(SHEET_WO_TAXES_XML)];
  assert.equal(rows.length, 7);
  assert.equal(rows[0].rowIndex, 1);
  const a1 = rows[0].cells.find((c) => c.ref === "A1");
  assert.equal(a1.col, "A");
  assert.equal(a1.type, "s");
  assert.equal(a1.value, String(SI.DATE));
});

test("iterateRows throws a named error when the sheet XML has no <sheetData>", () => {
  assert.throws(() => [...iterateRows("<worksheet><foo/></worksheet>")], OilBulletinStructureError);
});

test("a fully empty row (no cells) yields an empty cells array, not an exception", () => {
  const rows = [...iterateRows(SHEET_NO_DATE_COLUMN_XML)];
  const row3 = rows.find((r) => r.rowIndex === 3);
  assert.deepEqual(row3.cells, []);
});

// ── resolveHeaderBlocks ──────────────────────────────────────────────────────────────────────────────

function headerRows(sheetXml) {
  const rows = [...iterateRows(sheetXml)];
  return [1, 2, 3].map((n) => rows.find((r) => r.rowIndex === n)?.cells ?? []);
}

test("resolveHeaderBlocks locates the EU block by header text and maps its 6 columns to the 6 known slugs", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const [r1, r2, r3] = headerRows(SHEET_WO_TAXES_XML);
  const resolved = resolveHeaderBlocks(r1, r2, r3, strings);

  assert.equal(resolved.dateCol, "A");
  assert.equal(resolved.euBlock.name, "EU - European Union");
  assert.equal(resolved.euBlock.columns.length, 6);
  assert.deepEqual(resolved.warnings, []);

  const bySlug = Object.fromEntries(resolved.euBlock.columns.map((c) => [c.slug, c.col]));
  assert.equal(bySlug["eurosuper-95"], "C");
  assert.equal(bySlug["automotive-diesel"], "D");
  assert.equal(bySlug["heating-gas-oil"], "E");
  assert.equal(bySlug["lpg-motor-fuel"], "F");
  assert.equal(bySlug["residual-fuel-oil-1pct"], "G");
  assert.equal(bySlug["heavy-fuel-oil-3-5pct"], "H");
  // every slug resolveHeaderBlocks assigns is one this pipeline's parser actually recognises
  for (const slug of Object.keys(bySlug)) assert.ok(PRODUCTS[slug], `slug "${slug}" is not in the parser's PRODUCTS map`);
});

test("resolveHeaderBlocks segments more than one country block, skipping spacer columns, without confusing them", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const [r1, r2, r3] = headerRows(SHEET_WO_TAXES_XML);
  const resolved = resolveHeaderBlocks(r1, r2, r3, strings);
  assert.equal(resolved.blocks.length, 2);
  const synthetic = resolved.blocks.find((b) => b.name === "XX - Synthetic Country");
  assert.ok(synthetic);
  assert.equal(synthetic.columns.length, 2); // J, K only — spacer columns B and I never became data columns
});

test("resolveHeaderBlocks throws a named error when no EU block is present", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const [r1, r2, r3] = headerRows(SHEET_NO_EU_BLOCK_XML);
  assert.throws(() => resolveHeaderBlocks(r1, r2, r3, strings), /EU - European Union/);
});

test("resolveHeaderBlocks throws a named error when no Date column is present", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const [r1, r2, r3] = headerRows(SHEET_NO_DATE_COLUMN_XML);
  assert.throws(() => resolveHeaderBlocks(r1, r2, r3, strings), /Date/);
});

test("an unrecognised EU product column is a warning, not a throw, and is left unmapped", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  // Reuse the EU-block sheet but replace one product header with something no matcher recognises.
  const mutated = SHEET_WO_TAXES_XML.replace(
    `<c r="H2" t="s"><v>${SI.FUEL_OIL_HIGH_SULPHUR}</v></c>`,
    `<c r="H2" t="s"><v>${SI.SYNTHETIC_COUNTRY}</v></c>`,
  );
  const [r1, r2, r3] = headerRows(mutated);
  const resolved = resolveHeaderBlocks(r1, r2, r3, strings);
  const h = resolved.euBlock.columns.find((c) => c.col === "H");
  assert.equal(h.slug, null);
  assert.ok(resolved.warnings.some((w) => /column H/.test(w) && /unmapped/.test(w)));
});

// ── parseDateCell ────────────────────────────────────────────────────────────────────────────────────

test("parseDateCell converts an Excel 1900-epoch numeric serial to ISO (serial 46251 == 2026-08-17)", () => {
  const iso = parseDateCell({ ref: "A4", col: "A", row: 4, type: null, value: "46251" }, []);
  assert.equal(iso, "2026-08-17");
});

test("parseDateCell accepts an ISO-ish string cell", () => {
  const iso = parseDateCell({ ref: "A5", col: "A", row: 5, type: "str", value: "2026-08-24" }, []);
  assert.equal(iso, "2026-08-24");
});

test("parseDateCell resolves a shared-string date cell through the shared-strings table, not its raw index", () => {
  const strings = ["2026-08-31"];
  const iso = parseDateCell({ ref: "A6", col: "A", row: 6, type: "s", value: "0" }, strings);
  assert.equal(iso, "2026-08-31");
});

test("parseDateCell fails closed, naming the raw value, when a cell parses as neither encoding", () => {
  assert.throws(
    () => parseDateCell({ ref: "A4", col: "A", row: 4, type: "str", value: "not a date" }, []),
    (err) => err instanceof OilBulletinStructureError && /not a date/.test(err.message),
  );
});

// ── extractEuSeries / extractLatestEuRow ────────────────────────────────────────────────────────────

function resolveFixture(sheetXml) {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const [r1, r2, r3] = headerRows(sheetXml);
  return { strings, headerResolution: resolveHeaderBlocks(r1, r2, r3, strings) };
}

test("extractLatestEuRow returns the LAST data row (the ISO-string-dated row), skipping footer rows", () => {
  const { strings, headerResolution } = resolveFixture(SHEET_WO_TAXES_XML);
  const latest = extractLatestEuRow(SHEET_WO_TAXES_XML, strings, headerResolution);
  assert.equal(latest.week_ending, "2026-08-24");
  assert.equal(latest.prices["eurosuper-95"], 1519.1);
  assert.equal(latest.prices["automotive-diesel"], 1493.1);
  assert.equal(latest.prices["heating-gas-oil"], 1108.1);
  assert.equal(latest.prices["lpg-motor-fuel"], 709.1);
  assert.equal(latest.prices["residual-fuel-oil-1pct"], 501.1);
});

test("a missing price cell on the latest row is omitted with a warning, never fabricated", () => {
  const { strings, headerResolution } = resolveFixture(SHEET_WO_TAXES_XML);
  const latest = extractLatestEuRow(SHEET_WO_TAXES_XML, strings, headerResolution);
  assert.equal("heavy-fuel-oil-3-5pct" in latest.prices, false);
  assert.ok(latest.warnings.some((w) => /heavy-fuel-oil-3-5pct/.test(w) && /omitted, not fabricated/.test(w)));
});

test("extractEuSeries with weeks:2 returns both data rows, most recent first, using both date encodings", () => {
  const { strings, headerResolution } = resolveFixture(SHEET_WO_TAXES_XML);
  const series = extractEuSeries(SHEET_WO_TAXES_XML, strings, headerResolution, { weeks: 2 });
  assert.equal(series.length, 2);
  assert.equal(series[0].week_ending, "2026-08-24"); // ISO-string row, most recent
  assert.equal(series[1].week_ending, "2026-08-17"); // numeric-serial row
  assert.equal(series[1].prices["heavy-fuel-oil-3-5pct"], 451.1);
});

test("footer rows (spans=2:8, no Date-column cell) never appear as data rows", () => {
  const { strings, headerResolution } = resolveFixture(SHEET_WO_TAXES_XML);
  const series = extractEuSeries(SHEET_WO_TAXES_XML, strings, headerResolution, { weeks: 10 });
  assert.equal(series.length, 2); // only the two real data rows — rows 6 and 7 never counted
});

test("extractLatestEuRow throws a named error when the sheet has no data rows at all", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const noDataSheet = SHEET_WO_TAXES_XML.replace(/<row r="4">[\s\S]*?<\/row>\s*<row r="5">[\s\S]*?<\/row>/, "");
  const [r1, r2, r3] = headerRows(noDataSheet);
  const headerResolution = resolveHeaderBlocks(r1, r2, r3, strings);
  assert.throws(() => extractLatestEuRow(noDataSheet, strings, headerResolution), OilBulletinStructureError);
});

test("a data row with an unparseable date fails closed naming the raw resolved value, not silently skipped", () => {
  const { strings, headerResolution } = resolveFixture(SHEET_BAD_DATE_XML);
  assert.throws(
    () => extractLatestEuRow(SHEET_BAD_DATE_XML, strings, headerResolution),
    (err) => err instanceof OilBulletinStructureError && /preliminary/.test(err.message),
  );
});

// ── end-to-end: this module's output feeds the existing producer's parser with 0 warnings ─────────────

test("extractEuSeries output, formatted to the producer's CSV contract, parses via parseEuWeeklyOilBulletinCsv with 0 warnings", () => {
  const { strings, headerResolution } = resolveFixture(SHEET_WO_TAXES_XML);
  const series = extractEuSeries(SHEET_WO_TAXES_XML, strings, headerResolution, { weeks: 2 });

  const lines = ["week_ending;product;price_eur"];
  for (const week of series) {
    for (const [slug, price] of Object.entries(week.prices)) {
      lines.push(`${week.week_ending};${slug};${price}`);
    }
  }
  const csv = lines.join("\n");

  const { rows, warnings } = parseEuWeeklyOilBulletinCsv(csv);
  assert.deepEqual(warnings, []);
  // 6 products x 2 weeks, minus the one deliberately-missing price on the latest week = 11
  assert.equal(rows.length, 11);
  const seriesKeys = new Set(rows.map((r) => r.series_key));
  // all 6 slugs appear at least once across the 2 weeks (heavy-fuel-oil-3-5pct is present on the
  // 2026-08-17 week even though it was omitted on the latest 2026-08-24 week).
  for (const slug of Object.keys(PRODUCTS)) {
    assert.ok(seriesKeys.has(`eu-oil-bulletin:${slug}`), `missing series_key for ${slug}`);
  }
});
