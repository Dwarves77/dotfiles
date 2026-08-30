// Fixture-tested proof for src/lib/market/oil-bulletin-workbook.mjs (fetch-oil-bulletin.mjs's pure
// parsing core, WO-16 step 3, 2026-08-30).
//
// REVISION HISTORY, STATED PLAINLY. The previous revision of this fixture/test pair pinned a shape that
// does not exist in the real file — a single merged row-1 "block name" cell per country/EU block, with the
// literal string "EU - European Union" as that cell's text. The first live CI run against the real
// workbook (producers run #7, 2026-08-30) threw exit 2 because that shape is not what row 1 actually
// contains (see oil-bulletin-workbook.mjs's header for the full citation and story). Every test below that
// asserted the old (wrong) shape has been deleted rather than patched around — patching would have kept
// pinning a structure the live file does not have. The one deletion of note: "resolveHeaderBlocks segments
// more than one country block, skipping spacer columns, without confusing them" pinned the old
// merged-cell block model directly and has no equivalent under the new machine-id design (there is no
// longer a "block" object with grouped columns to segment — see resolveHeaderBlocks's own JSDoc).
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
  SHEET_WO_TAXES_SHUFFLED_XML,
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
  assert.equal(strings.length, 26);
  assert.equal(strings[SI.DATE], "Date");
  assert.equal(strings[SI.FOOTER_NOTES_HEADER], "Notes:");
  assert.equal(strings[SI.EU_LEGEND], "EU - European Union");
  assert.equal(strings[SI.EUROSUPER_95], "Euro-super 95  (I)");
  assert.equal(strings[SI.FUEL_OIL_HIGH_SULPHUR], " Fuel oil -Schweres Heizöl (III) Soufre > 1% Sulphur > 1% Schwefel > 1%");
  assert.equal(strings[SI.EUROSUPER_95_CR_VARIANT], "Euro-super 95\r(I)");
  assert.equal(strings[SI.EU_EURO95], "EU_price_wo_tax_euro95");
  assert.equal(strings[SI.EUR_EURO95], "EUR_price_wo_tax_euro95");
});

// ── iterateRows ──────────────────────────────────────────────────────────────────────────────────────

test("iterateRows yields rows in document order with correctly parsed cell refs, cols and types", () => {
  const rows = [...iterateRows(SHEET_WO_TAXES_XML)];
  assert.equal(rows.length, 10);
  assert.equal(rows[0].rowIndex, 1);
  const a1 = rows[0].cells.find((c) => c.ref === "A1");
  assert.equal(a1.col, "A");
  assert.equal(a1.type, "s");
  assert.equal(a1.value, String(SI.SHEET_TITLE)); // A1 carries the sheet's own title, NOT "Date"
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

test("resolveHeaderBlocks locates the EU block by row-1 machine id (EU_price_wo_tax_*) and maps its 6 columns to the 6 known slugs", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const [r1, r2, r3] = headerRows(SHEET_WO_TAXES_XML);
  const resolved = resolveHeaderBlocks(r1, r2, r3, strings);

  assert.equal(resolved.dateCol, "A");
  assert.equal(resolved.euBlock.columns.length, 6);
  assert.deepEqual(resolved.warnings, []); // machine id and row-2 display text agree on every column

  const bySlug = Object.fromEntries(resolved.euBlock.columns.map((c) => [c.slug, c.col]));
  assert.equal(bySlug["eurosuper-95"], "C");
  assert.equal(bySlug["automotive-diesel"], "D");
  assert.equal(bySlug["heating-gas-oil"], "E");
  assert.equal(bySlug["residual-fuel-oil-1pct"], "F");
  assert.equal(bySlug["heavy-fuel-oil-3-5pct"], "G");
  assert.equal(bySlug["lpg-motor-fuel"], "H");
  // every slug resolveHeaderBlocks assigns is one this pipeline's parser actually recognises
  for (const slug of Object.keys(bySlug)) assert.ok(PRODUCTS[slug], `slug "${slug}" is not in the parser's PRODUCTS map`);
});

test("resolveHeaderBlocks never selects the EUR_ (euro-area) or a country (AT_) block, even though their row-2 display text is identical to the EU block's", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const [r1, r2, r3] = headerRows(SHEET_WO_TAXES_XML);
  const resolved = resolveHeaderBlocks(r1, r2, r3, strings);
  const cols = resolved.euBlock.columns.map((c) => c.col).sort();
  assert.deepEqual(cols, ["C", "D", "E", "F", "G", "H"]);
  for (const forbidden of ["J", "K", "M", "N"]) assert.ok(!cols.includes(forbidden), `EUR_/AT_ column ${forbidden} was selected as an EU column`);
});

test('the "EU - European Union" legend string is never mistaken for a header, even if it appears in a row-1 cell', () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  // Replace the AT block's first machine id with the literal legend string, simulating the exact
  // confusion the previous revision was vulnerable to (matching row 1 by that string).
  const mutated = SHEET_WO_TAXES_XML.replace(
    `<c r="M1" t="s"><v>${SI.AT_EURO95}</v></c>`,
    `<c r="M1" t="s"><v>${SI.EU_LEGEND}</v></c>`,
  );
  const [r1, r2, r3] = headerRows(mutated);
  const resolved = resolveHeaderBlocks(r1, r2, r3, strings);
  assert.equal(resolved.euBlock.columns.length, 6); // unaffected — the real EU_price_wo_tax_* columns
  assert.ok(!resolved.euBlock.columns.some((c) => c.col === "M"));
});

test('the legend row itself (real "EU - European Union" cell, no Date-column cell) is never read as a header row (rows 1-3 only)', () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const rows = [...iterateRows(SHEET_WO_TAXES_XML)];
  const legendRow = rows.find((r) => r.rowIndex === 8);
  assert.equal(legendRow.cells.find((c) => c.col === "B").value, String(SI.EU_LEGEND));
  // headerRows() only ever looks at rowIndex 1/2/3 — row 8 (the legend row) cannot leak into header
  // resolution by construction, which extractEuSeries's "legend/footer rows never appear as data" test
  // (below) additionally confirms end to end.
  const [r1, r2, r3] = headerRows(SHEET_WO_TAXES_XML);
  const resolved = resolveHeaderBlocks(r1, r2, r3, strings);
  assert.equal(resolved.euBlock.columns.length, 6);
});

test("resolveHeaderBlocks throws a named error, listing every observed row-1 header, when no column matches EU_price_wo_tax_*", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const [r1, r2, r3] = headerRows(SHEET_NO_EU_BLOCK_XML);
  assert.throws(
    () => resolveHeaderBlocks(r1, r2, r3, strings),
    (err) =>
      err instanceof OilBulletinStructureError &&
      /EU_price_wo_tax_/.test(err.message) &&
      /EUR_price_wo_tax_euro95/.test(err.message) &&
      /AT_price_wo_tax_euro95/.test(err.message) &&
      err.message.includes(" | "), // observed headers joined with " | ", same diagnostic quality as before
  );
});

test("resolveHeaderBlocks throws a named error when no Date column is present", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const [r1, r2, r3] = headerRows(SHEET_NO_DATE_COLUMN_XML);
  assert.throws(() => resolveHeaderBlocks(r1, r2, r3, strings), /Date/);
});

test("an EU column whose row-1 suffix is unrecognised is a warning, not a throw, and is left unmapped", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const mutated = SHEET_WO_TAXES_XML.replace(
    `<c r="C1" t="s"><v>${SI.EU_EURO95}</v></c>`,
    `<c r="C1" t="s"><v>${SI.EU_BOGUS_SUFFIX}</v></c>`,
  );
  const [r1, r2, r3] = headerRows(mutated);
  const resolved = resolveHeaderBlocks(r1, r2, r3, strings);
  const c = resolved.euBlock.columns.find((col) => col.col === "C");
  assert.equal(c.slug, null);
  assert.ok(resolved.warnings.some((w) => /column C/.test(w) && /unrecognised suffix/.test(w) && /mystery_grade/.test(w)));
});

test("resolveHeaderBlocks throws when the row-1 machine id and row-2 display text disagree on which product a column is", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  // Column F's machine id says fuel_oil_1 (-> residual-fuel-oil-1pct), but give it LPG's row-2 display
  // text instead — two independent keys now name two different products.
  const mutated = SHEET_WO_TAXES_XML.replace(
    `<c r="F2" t="s"><v>${SI.FUEL_OIL_BASE_GRADE}</v></c>`,
    `<c r="F2" t="s"><v>${SI.LPG_MOTOR_FUEL}</v></c>`,
  );
  const [r1, r2, r3] = headerRows(mutated);
  assert.throws(
    () => resolveHeaderBlocks(r1, r2, r3, strings),
    (err) =>
      err instanceof OilBulletinStructureError &&
      /column F/i.test(err.message) &&
      /residual-fuel-oil-1pct/.test(err.message) &&
      /lpg-motor-fuel/.test(err.message),
  );
});

test("a missing row-2 display text on an EU column is a warning only, keeping the row-1 machine-id mapping", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const mutated = SHEET_WO_TAXES_XML.replace(`<c r="D2" t="s"><v>${SI.AUTOMOTIVE_DIESEL}</v></c>`, "");
  const [r1, r2, r3] = headerRows(mutated);
  const resolved = resolveHeaderBlocks(r1, r2, r3, strings);
  const d = resolved.euBlock.columns.find((c) => c.col === "D");
  assert.equal(d.slug, "automotive-diesel"); // kept — row 1 alone is enough when row 2 has nothing to say
  assert.ok(resolved.warnings.some((w) => /column D/.test(w) && /no row-2 display text/.test(w)));
});

// ── parseDateCell ────────────────────────────────────────────────────────────────────────────────────

test("parseDateCell converts an Excel 1900-epoch numeric serial to ISO (serial 46251 == 2026-08-17)", () => {
  const iso = parseDateCell({ ref: "A5", col: "A", row: 5, type: null, value: "46251" }, []);
  assert.equal(iso, "2026-08-17");
});

test("parseDateCell converts the verified live serial 46258 to ISO 2026-08-24 exactly", () => {
  const iso = parseDateCell({ ref: "A4", col: "A", row: 4, type: null, value: "46258" }, []);
  assert.equal(iso, "2026-08-24");
});

test("parseDateCell accepts an ISO-ish string cell", () => {
  const iso = parseDateCell({ ref: "A6", col: "A", row: 6, type: "str", value: "2026-08-10" }, []);
  assert.equal(iso, "2026-08-10");
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

test("extractLatestEuRow returns the NEWEST week (serial 46258 == 2026-08-24), not whatever row is last in document order", () => {
  const { strings, headerResolution } = resolveFixture(SHEET_WO_TAXES_XML);
  const latest = extractLatestEuRow(SHEET_WO_TAXES_XML, strings, headerResolution);
  assert.equal(latest.week_ending, "2026-08-24");
  assert.equal(latest.prices["eurosuper-95"], 1519.9);
  assert.equal(latest.prices["automotive-diesel"], 1493.9);
  assert.equal(latest.prices["heating-gas-oil"], 1108.9);
  assert.equal(latest.prices["residual-fuel-oil-1pct"], 501.9);
  assert.equal(latest.prices["lpg-motor-fuel"], 709.9);
});

test("a missing price cell on the latest row is omitted with a warning, never fabricated", () => {
  const { strings, headerResolution } = resolveFixture(SHEET_WO_TAXES_XML);
  const latest = extractLatestEuRow(SHEET_WO_TAXES_XML, strings, headerResolution);
  assert.equal("heavy-fuel-oil-3-5pct" in latest.prices, false);
  assert.ok(latest.warnings.some((w) => /heavy-fuel-oil-3-5pct/.test(w) && /omitted, not fabricated/.test(w)));
});

test("extractEuSeries returns all 3 data rows sorted most-recent-first, using both date encodings (numeric serial and ISO string)", () => {
  const { strings, headerResolution } = resolveFixture(SHEET_WO_TAXES_XML);
  const series = extractEuSeries(SHEET_WO_TAXES_XML, strings, headerResolution, { weeks: 3 });
  assert.equal(series.length, 3);
  assert.equal(series[0].week_ending, "2026-08-24"); // numeric-serial row (46258), latest
  assert.equal(series[1].week_ending, "2026-08-17"); // numeric-serial row (46251)
  assert.equal(series[2].week_ending, "2026-08-10"); // ISO-string row, oldest
  assert.equal(series[1].prices["heavy-fuel-oil-3-5pct"], 451.1);
  assert.equal(series[2].prices["heavy-fuel-oil-3-5pct"], 441.2);
});

test("PIN: the real file lists data rows newest-first in document order — extractEuSeries must not be fooled by that into taking the LAST rows as latest", () => {
  const { strings, headerResolution } = resolveFixture(SHEET_WO_TAXES_XML);
  const series = extractEuSeries(SHEET_WO_TAXES_XML, strings, headerResolution, { weeks: 1 });
  assert.equal(series.length, 1);
  assert.equal(series[0].week_ending, "2026-08-24"); // NOT 2026-08-10, which `.slice(-weeks)` would return
});

test("PIN: extractEuSeries sorts explicitly by week_ending and is correct even when document order is shuffled (neither newest- nor oldest-first)", () => {
  const { strings, headerResolution } = resolveFixture(SHEET_WO_TAXES_SHUFFLED_XML);
  const latest = extractEuSeries(SHEET_WO_TAXES_SHUFFLED_XML, strings, headerResolution, { weeks: 1 });
  assert.equal(latest.length, 1);
  assert.equal(latest[0].week_ending, "2026-08-24");

  const all = extractEuSeries(SHEET_WO_TAXES_SHUFFLED_XML, strings, headerResolution, { weeks: 3 });
  assert.deepEqual(
    all.map((w) => w.week_ending),
    ["2026-08-24", "2026-08-17", "2026-08-10"],
  );
});

test("legend row (real \"EU - European Union\" cell, no Date-column cell) and footer rows (spans=2:8) never appear as data rows", () => {
  const { strings, headerResolution } = resolveFixture(SHEET_WO_TAXES_XML);
  const series = extractEuSeries(SHEET_WO_TAXES_XML, strings, headerResolution, { weeks: 10 });
  assert.equal(series.length, 3); // only the three real data rows — rows 7 ("Notes:"), 8 (legend), 9, 10 (footers) never counted
});

test('PIN (inspection pass 4): the "Notes:" row (A7, date-column cell PRESENT but text, not absent — mirroring the real A1087) is classified as footer and skipped, never thrown on, and the correct latest week is still returned', () => {
  const { strings, headerResolution } = resolveFixture(SHEET_WO_TAXES_XML);
  // Confirm the row really does have an occupied (non-empty) date-column cell, unlike every other
  // footer/legend row in this fixture — this is the exact shape that used to throw.
  const rows = [...iterateRows(SHEET_WO_TAXES_XML)];
  const notesRow = rows.find((r) => r.rowIndex === 7);
  const notesDateCell = notesRow.cells.find((c) => c.col === "A");
  assert.ok(notesDateCell && notesDateCell.value != null && notesDateCell.value !== "");

  // extractEuSeries must not throw on this sheet, and must still find exactly the 3 real weeks.
  const series = extractEuSeries(SHEET_WO_TAXES_XML, strings, headerResolution, { weeks: 10 });
  assert.equal(series.length, 3);
  const latest = extractLatestEuRow(SHEET_WO_TAXES_XML, strings, headerResolution);
  assert.equal(latest.week_ending, "2026-08-24");
});

test("extractLatestEuRow throws a named error when the sheet has no data rows at all", () => {
  const strings = parseSharedStrings(SHARED_STRINGS_XML);
  const noDataSheet = SHEET_WO_TAXES_XML.replace(
    /<row r="4">[\s\S]*?<\/row>\s*<row r="5">[\s\S]*?<\/row>\s*<row r="6">[\s\S]*?<\/row>/,
    "",
  );
  const [r1, r2, r3] = headerRows(noDataSheet);
  const headerResolution = resolveHeaderBlocks(r1, r2, r3, strings);
  assert.throws(() => extractLatestEuRow(noDataSheet, strings, headerResolution), OilBulletinStructureError);
});

// SUPERSEDED BY INSPECTION PASS 4. This test used to assert that a row whose date-column cell is present
// but unparseable makes extractLatestEuRow throw immediately, naming the raw value (SHEET_BAD_DATE_XML's
// one row has exactly that shape: A4 resolves to the footer-note text, not a date). That was correct
// under the old "any date-column cell present must parse" rule, but inspection pass 4 (the real A1087
// "Notes:" row) showed that rule was wrong: a present-but-unparseable date-column cell is now the
// definition of a footer row and is SKIPPED, not thrown on (see extractEuSeries's own comment). Since
// SHEET_BAD_DATE_XML's only row is now classified as footer, the sheet has ZERO data rows — which is
// still the correct thing to fail closed on, just at extractLatestEuRow's "no data row found" systemic
// guard rather than at parseDateCell directly. This is exactly the scenario the coordinator asked to pin:
// "a sheet where NO date cell parses still throws via extractLatestEuRow."
test("PIN: a sheet where every date-column cell fails to parse still throws via extractLatestEuRow's systemic guard, even though no individual row throws any more", () => {
  const { strings, headerResolution } = resolveFixture(SHEET_BAD_DATE_XML);
  assert.doesNotThrow(() => extractEuSeries(SHEET_BAD_DATE_XML, strings, headerResolution, { weeks: 10 }));
  assert.equal(extractEuSeries(SHEET_BAD_DATE_XML, strings, headerResolution, { weeks: 10 }).length, 0);
  assert.throws(
    () => extractLatestEuRow(SHEET_BAD_DATE_XML, strings, headerResolution),
    (err) => err instanceof OilBulletinStructureError && /no data row found/.test(err.message),
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
  // 6 products x 2 weeks, minus the one deliberately-missing price on the latest week (2026-08-24,
  // heavy-fuel-oil-3-5pct) = 11
  assert.equal(rows.length, 11);
  const seriesKeys = new Set(rows.map((r) => r.series_key));
  // all 6 slugs appear at least once across the 2 weeks (heavy-fuel-oil-3-5pct is present on the
  // 2026-08-17 week even though it was omitted on the latest 2026-08-24 week).
  for (const slug of Object.keys(PRODUCTS)) {
    assert.ok(seriesKeys.has(`eu-oil-bulletin:${slug}`), `missing series_key for ${slug}`);
  }
});
