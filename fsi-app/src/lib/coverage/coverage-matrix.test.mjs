// Proof for coverage-matrix.mjs (lane COV-1, 2026-10-08): the Coverage surface is GENERATED from the index
// entries, with numerator and denominator in every cell, a version and a date, a link per cell, and a CSV.
// Run: node --test fsi-app/src/lib/coverage/coverage-matrix.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCoverageMatrix, emptyCoverageMatrix, buildCoverageView, parseCoverageQuery, coverageHref, matrixToCsv, csvFilename,
  surfaceDenominator, formatDenominatorLine, formatPortfolioCoverageLine, isNumerator, DATA_CLASSES, ALL, UNTAGGED, UNKNOWN_GEOGRAPHY,
} from "./coverage-matrix.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = "2026-10-08T09:00:00.000Z";

// Fixture index entries in the exact CoverageEntry shape (index-data.ts), trimmed to what the matrix reads.
const e = (id, jurisdiction, surfaces, relevance, identity, extra = {}) => ({ id, jurisdiction, surfaces, relevance, identity, ...extra });
const FIXTURE = [
  e("a", "EU", ["regulations"], "firm", "verified"),            // numerator
  e("b", "EU", ["regulations"], "firm", "pending"),             // denominator only
  e("c", "EU", ["regulations", "operations"], "soft", "verified"), // soft: not numerator; two classes
  e("d", "GB", ["regulations"], "firm", "verified"),            // numerator
  e("e", "GB", ["market_intel"], "firm", "dead"),
  e("f", null, ["research"], "firm", "verified"),               // no jurisdiction
  e("g", "US", [], "firm", "verified"),                         // no surface tag
];
const build = (entries = FIXTURE, extra = {}) => buildCoverageMatrix(entries, { generatedAt: NOW, verifiedBriefs: 12, labelOf: (c) => `L:${c}`, ...extra });
const cell = (m, mode, cls, geo) => m.cells.find((c) => c.key === `${mode}|${cls}|${geo}`);

test("numerator is dual-verified: firm-core relevance AND identity verified, nothing else", () => {
  assert.equal(isNumerator(e("x", "EU", [], "firm", "verified")), true);
  assert.equal(isNumerator(e("x", "EU", [], "soft", "verified")), false);
  assert.equal(isNumerator(e("x", "EU", [], "firm", "pending")), false);
  assert.equal(isNumerator(e("x", "EU", [], "firm", "unresolved")), false);
});

test("every cell carries numerator and denominator, generated from the entries", () => {
  const m = build();
  assert.deepEqual([cell(m, ALL, "regulations", "EU").numerator, cell(m, ALL, "regulations", "EU").denominator], [1, 3]);
  assert.deepEqual([cell(m, ALL, "operations", "EU").numerator, cell(m, ALL, "operations", "EU").denominator], [0, 1]);
  assert.deepEqual([cell(m, ALL, "regulations", "GB").numerator, cell(m, ALL, "regulations", "GB").denominator], [1, 1]);
  assert.deepEqual([cell(m, ALL, "market_intel", "GB").numerator, cell(m, ALL, "market_intel", "GB").denominator], [0, 1]);
  for (const c of m.cells) assert.ok(c.numerator <= c.denominator, c.key);
});

test("totals count each instrument once even when it is tagged to two data classes", () => {
  const m = build();
  assert.deepEqual(m.totals, { numerator: 4, denominator: 7 });
  const sumOfClasses = m.dataClasses.reduce((s, c) => s + c.denominator, 0);
  assert.equal(sumOfClasses, 8, "instrument c is in two classes, so the class columns sum to one more than the distinct total");
});

test("an instrument with no surface tag and one with no jurisdiction are kept, in their own named bucket", () => {
  const m = build();
  assert.ok(cell(m, ALL, UNTAGGED, "US"), "untagged class cell exists");
  assert.ok(cell(m, ALL, "research", UNKNOWN_GEOGRAPHY), "unknown geography cell exists");
  assert.equal(m.geographies.find((g) => g.code === UNKNOWN_GEOGRAPHY).label, "Jurisdiction not recorded");
  assert.equal(m.dataClasses.find((c) => c.code === UNTAGGED).label, "Not tagged to a surface");
});

test("geography labels come from the injected labeller, and geographies sort by denominator", () => {
  const m = build();
  assert.equal(m.geographies[0].code, "EU");
  assert.equal(m.geographies[0].label, "L:EU");
  assert.deepEqual(m.geographies.map((g) => g.denominator), [...m.geographies.map((g) => g.denominator)].sort((a, b) => b - a));
});

test("the mode axis is honest: no mode recorded means everything is `untagged`, and the matrix says how many are tagged", () => {
  const m = build();
  assert.deepEqual(m.modes.map((x) => x.code), [UNTAGGED]);
  assert.deepEqual(m.modeTagging, { tagged: 0, total: 7 });
  assert.ok(cell(m, UNTAGGED, "regulations", "EU"));
});

test("when entries carry modes the matrix splits them: counted once per mode and once in the all-modes cell", () => {
  const m = build([
    e("a", "EU", ["regulations"], "firm", "verified", { modes: ["air", "sea"] }), // sea -> ocean
    e("b", "EU", ["regulations"], "firm", "pending", { modes: ["air"] }),
    e("c", "EU", ["regulations"], "soft", "pending", { modes: ["multimodal"] }), // corridor-only, not a leg mode
  ]);
  assert.deepEqual(m.modes.map((x) => x.code), ["ocean", "air", UNTAGGED]);
  assert.deepEqual([cell(m, "air", "regulations", "EU").numerator, cell(m, "air", "regulations", "EU").denominator], [1, 2]);
  assert.deepEqual([cell(m, "ocean", "regulations", "EU").numerator, cell(m, "ocean", "regulations", "EU").denominator], [1, 1]);
  assert.deepEqual([cell(m, ALL, "regulations", "EU").numerator, cell(m, ALL, "regulations", "EU").denominator], [1, 3]);
  assert.deepEqual(m.modeTagging, { tagged: 2, total: 3 });
});

test("versioned and dated: a content hash that changes with the data, the generation instant, and the data as-of", () => {
  const a = build();
  const b = build();
  assert.equal(a.version, b.version, "same data, same version");
  assert.match(a.version, /^cv1-[0-9a-f]{8}$/);
  assert.notEqual(build(FIXTURE.slice(1)).version, a.version, "different data, different version");
  assert.equal(a.generatedAt, NOW);
  assert.equal(a.dataAsOf, null, "no entry carries a check date, so none is invented");
  const dated = build([e("a", "EU", ["regulations"], "firm", "verified", { checkedAt: "2026-09-01T00:00:00Z" }), e("b", "EU", ["regulations"], "firm", "verified", { checkedAt: "2026-10-02T00:00:00Z" })]);
  assert.equal(dated.dataAsOf, "2026-10-02T00:00:00Z");
  assert.throws(() => buildCoverageMatrix([], {}), /generatedAt/);
});

test("verified briefs are carried as a separate figure and never added into a cell", () => {
  assert.equal(build().verifiedBriefs, 12);
  assert.equal(buildCoverageMatrix([], { generatedAt: NOW }).verifiedBriefs, null);
  assert.match(build().definitions.verified_briefs, /separately/);
});

test("an empty census builds the same shape with no cells", () => {
  const m = emptyCoverageMatrix(NOW);
  assert.deepEqual(m.totals, { numerator: 0, denominator: 0 });
  assert.deepEqual(m.cells, []);
  assert.deepEqual(buildCoverageView(m, {}).rows, []);
});

// ── links ────────────────────────────────────────────────────────────────

test("a static URL per cell: the query round trips, defaults drop out, and bad axes still parse", () => {
  assert.equal(coverageHref({}), "/dashboard/coverage");
  assert.equal(coverageHref({ dataClass: "regulations", geography: "EU" }), "/dashboard/coverage?data_class=regulations&geography=EU");
  assert.equal(coverageHref({ mode: "ocean", dataClass: "regulations", geography: "US-CA" }), "/dashboard/coverage?mode=ocean&data_class=regulations&geography=US-CA");
  const q = parseCoverageQuery(new URLSearchParams("data_class=Regulations&geography=eu&mode=sea"));
  assert.deepEqual(q, { mode: "ocean", dataClass: "regulations", geography: "EU" });
  assert.deepEqual(parseCoverageQuery({}), { mode: ALL, dataClass: ALL, geography: ALL });
  assert.deepEqual(parseCoverageQuery({ data_class: ["research", "x"] }), { mode: ALL, dataClass: "research", geography: ALL });
  assert.deepEqual(parseCoverageQuery(new URLSearchParams("geography=")), { mode: ALL, dataClass: ALL, geography: ALL });
  const m = build();
  const v = buildCoverageView(m, { mode: ALL });
  for (const r of v.rows) for (const c of r.cells) assert.equal(parseCoverageQuery(new URLSearchParams(c.href.split("?")[1] ?? "")).geography, r.geography);
});

// ── view ─────────────────────────────────────────────────────────────────

test("the view lists geography rows with one cell per data class, and marks a missing cell as a real gap", () => {
  const m = build();
  const v = buildCoverageView(m, { mode: ALL });
  const eu = v.rows.find((r) => r.geography === "EU");
  assert.deepEqual(eu.cells.map((c) => [c.dataClass, c.present, c.numerator, c.denominator]), [
    ["regulations", true, 1, 3], ["operations", true, 0, 1], ["market_intel", false, 0, 0], ["research", false, 0, 0], [UNTAGGED, false, 0, 0],
  ]);
  assert.equal(v.validAxes, true);
});

test("a filtered view narrows columns and rows; a selected cell with no instrument is present:false", () => {
  const m = build();
  const v = buildCoverageView(m, { mode: ALL, dataClass: "regulations", geography: "GB" });
  assert.equal(v.rows.length, 1);
  assert.deepEqual(v.selected, { query: { mode: ALL, dataClass: "regulations", geography: "GB" }, present: true, numerator: 1, denominator: 1, validAxes: true });
  const gap = buildCoverageView(m, { mode: ALL, dataClass: "research", geography: "EU" });
  assert.equal(gap.selected.present, false);
  assert.equal(gap.selected.validAxes, true, "EU and research both exist as axes; the cell itself is the gap");
  const bad = buildCoverageView(m, { mode: ALL, dataClass: "research", geography: "ZZ" });
  assert.equal(bad.selected.validAxes, false);
  assert.equal(bad.selected.present, false);
});

// ── export ───────────────────────────────────────────────────────────────

test("CSV shape: provenance travels as columns, one row per cell, RFC 4180 quoting, CRLF", () => {
  const m = build([e("a", "EU", ["regulations"], "firm", "verified"), e("b", "EU", ["regulations"], "firm", "pending")], { labelOf: () => 'European "Union", EU' });
  const csv = matrixToCsv(m, { mode: ALL });
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "version,generated_at,data_as_of,mode,data_class,geography_code,geography,numerator,denominator");
  assert.equal(lines[1], `${m.version},${NOW},not recorded,All modes,Regulations,EU,"European ""Union"", EU",1,2`);
  assert.equal(lines.length, 3, "header, one cell, trailing empty after the final CRLF");
  assert.equal(lines[2], "");
});

test("CSV filter and ordering: only the requested cells, biggest denominator first, formula-looking text is neutralised", () => {
  const m = build(FIXTURE, { labelOf: (c) => (c === "GB" ? "=SUM(A1)" : c) });
  const all = matrixToCsv(m, { mode: ALL }).trim().split("\r\n").slice(1);
  assert.equal(all.length, m.cells.filter((c) => c.mode === ALL).length);
  const denoms = all.map((l) => Number(l.split(",").at(-1)));
  assert.deepEqual(denoms, [...denoms].sort((a, b) => b - a));
  assert.ok(all.some((l) => l.includes("'=SUM(A1)")), "leading = is neutralised");
  const one = matrixToCsv(m, { mode: ALL, dataClass: "regulations", geography: "EU" }).trim().split("\r\n");
  assert.equal(one.length, 2);
  assert.match(one[1], /,Regulations,EU,EU,1,3$/);
  assert.equal(csvFilename(m, { dataClass: "regulations", geography: "EU" }), "coverage-regulations-eu-2026-10-08.csv");
  assert.equal(csvFilename(m, {}), "coverage-2026-10-08.csv");
});

// ── denominator lines ────────────────────────────────────────────────────

test("the surface denominator line puts numerator and denominator side by side and links to the cell", () => {
  const counts = { total: 340, dualVerified: 120, verifiedBriefs: 56 };
  const d = surfaceDenominator("regulations", counts);
  assert.deepEqual(d, { surface: "regulations", label: "Regulations", numerator: 120, denominator: 340, verifiedBriefs: 56, href: "/dashboard/coverage?data_class=regulations" });
  assert.equal(formatDenominatorLine(d), "Coverage: 120 of 340 catalogued Regulations instruments are dual-verified. 56 verified briefs are on the platform.");
  assert.equal(formatPortfolioCoverageLine(d), "Coverage for this: 120 of 340 catalogued Regulations instruments are dual-verified.");
  assert.equal(surfaceDenominator("community", counts), null, "Community is social only and has no census");
  assert.equal(surfaceDenominator("regulations", null), null);
  assert.doesNotMatch(formatDenominatorLine({ ...d, verifiedBriefs: null }), /verified briefs/);
});

test("DATA_CLASSES agrees with COVERAGE_SURFACES in index-data.ts (drift guard)", () => {
  const src = readFileSync(resolve(HERE, "index-data.ts"), "utf8");
  const m = src.match(/COVERAGE_SURFACES = \[([^\]]+)\] as const/);
  assert.ok(m, "COVERAGE_SURFACES literal found");
  const fromTs = [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
  assert.deepEqual(DATA_CLASSES.map((c) => c.code), fromTs);
});

test("no dash or section glyph in any generated text", () => {
  const m = build();
  const text = [matrixToCsv(m, {}), formatDenominatorLine(surfaceDenominator("research", { total: 3, dualVerified: 1, verifiedBriefs: 2 })), JSON.stringify(m.definitions)].join("\n");
  assert.doesNotMatch(text, /[\u2013\u2014\u00a7]/);
});
