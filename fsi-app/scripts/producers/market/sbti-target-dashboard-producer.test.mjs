// sbti-target-dashboard-producer.test.mjs, fixture-based, no network, no DB credential (lane L11,
// 2026-10-03). Proves: the pure parse/aggregate functions in-process (fast, zero subprocess), the full
// CLI end-to-end against a synthetic-but-structurally-real .xlsx (a hand-built minimal ZIP, see
// buildStoredZip below, never a network fetch), the survivorship negative test (a "commitment removed"
// row is counted, never silently dropped), and, the single most important case here, that --apply is
// refused UNCONDITIONALLY (the licence gate), regardless of ENABLED/kill-switch/creds. See the
// producer's own header for the full licence rationale (source-licence.mjs's registered 'sbti_dashboard'
// entry, redistribution "prohibited").

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutCredentials } from "../../lib/env-file.mjs";
import {
  excelSerialToIsoDate,
  resolveHeaderColumns,
  extractSbtiTargetRows,
  aggregateSbtiTargetRows,
  decideApply,
  LICENCE_BLOCK,
} from "./sbti-target-dashboard-producer.mjs";
import { parseSheetRows, parseSharedStrings } from "../../gen/fetch-desnz-factors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PRODUCER_PATH = resolve(HERE, "sbti-target-dashboard-producer.mjs");

// ── minimal ZIP builder (stored entries only, readZip never checks CRC) ──────────────────────────────
function zipEntry(name, data) {
  return { name, data: Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8") };
}

function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(0, 8); // method: stored
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0, 12);
    lfh.writeUInt32LE(0, 14); // crc32, unchecked by readZip
    lfh.writeUInt32LE(data.length, 18);
    lfh.writeUInt32LE(data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);
    const localRecord = Buffer.concat([lfh, nameBuf, data]);
    const localHeaderOffset = offset;
    localParts.push(localRecord);
    offset += localRecord.length;

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(0, 10); // method: stored
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(0, 16);
    cdh.writeUInt32LE(data.length, 20);
    cdh.writeUInt32LE(data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(localHeaderOffset, 42);
    centralParts.push(Buffer.concat([cdh, nameBuf]));
  }
  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

// ── a tiny, structurally-real "WebsiteData" workbook: 8 header columns (A:H), 4 data rows ──────────────
// Shared strings, in order (indices referenced below):
//  0 company_name 1 sector 2 status 3 action 4 target 5 base_year 6 target_year 7 date_published
//  8 "Ocean Freight Co A" 9 "Ocean Freight" 10 "Other" 11 "Target" 12 "Near-term" 13 "2020"
// 14 "2030" 15 "Ocean Freight Co B" 16 "Removed" 17 "2019" 18 "2029"
// 19 "Ocean Freight Co C" 20 "Commitment" 21 "Active"
// 22 "Air Freight Co D" 23 "Air Freight" 24 "Net-zero"
//
// STATUS VOCABULARY, CONFIRMED LIVE (this lane's own dry run against the real targets-excel.xlsx, by
// direct count over all 40,883 rows): "Other" is the status value that actually carries a present
// base_year/target_year pair, NOT "Active" and NOT "Validated Targets", both tried first and both
// [REFUTED] by that same count (0 rows with any year under either). See the producer's own "TWICE
// CORRECTED" comment at its aggregateSbtiTargetRows call site for the full story.
const SHARED = [
  "company_name", "sector", "status", "action", "target", "base_year", "target_year", "date_published",
  "Ocean Freight Co A", "Ocean Freight", "Other", "Target", "Near-term", "2020", "2030",
  "Ocean Freight Co B", "Removed", "2019", "2029",
  "Ocean Freight Co C", "Commitment", "Active",
  "Air Freight Co D", "Air Freight", "Net-zero",
];
const S = (label) => SHARED.indexOf(label); // first occurrence, every label here is unique

const SHARED_STRINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${SHARED.length}" uniqueCount="${SHARED.length}">${SHARED.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`;

const str = (col, row, idx) => `<c r="${col}${row}" t="s"><v>${idx}</v></c>`;
const num = (col, row, n) => `<c r="${col}${row}"><v>${n}</v></c>`;

const SHEET_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
  `<row r="1">${str("A", 1, S("company_name"))}${str("B", 1, S("sector"))}${str("C", 1, S("status"))}${str("D", 1, S("action"))}${str("E", 1, S("target"))}${str("F", 1, S("base_year"))}${str("G", 1, S("target_year"))}${str("H", 1, S("date_published"))}</row>` +
  // row 2: Ocean Freight, status "Other" (the live-confirmed "counted" status), Near-term, 2020->2030 (lead time 10y)
  `<row r="2">${str("A", 2, S("Ocean Freight Co A"))}${str("B", 2, S("Ocean Freight"))}${str("C", 2, S("Other"))}${str("D", 2, S("Target"))}${str("E", 2, S("Near-term"))}${str("F", 2, S("2020"))}${str("G", 2, S("2030"))}${num("H", 2, 45000)}</row>` +
  // row 3: Ocean Freight, REMOVED, survivorship, must be counted, never dropped
  `<row r="3">${str("A", 3, S("Ocean Freight Co B"))}${str("B", 3, S("Ocean Freight"))}${str("C", 3, S("Removed"))}${str("D", 3, S("Target"))}${str("E", 3, S("Near-term"))}${str("F", 3, S("2019"))}${str("G", 3, S("2029"))}${num("H", 3, 45100)}</row>` +
  // row 4: Ocean Freight, Active, action=Commitment, no target/base_year/target_year/date_published at
  // all (a company-level commitment placeholder with no approved target yet), must be excluded, named,
  // never fabricated into a lead-time figure. "Active" is the REAL status this kind of row carries live.
  `<row r="4">${str("A", 4, S("Ocean Freight Co C"))}${str("B", 4, S("Ocean Freight"))}${str("C", 4, S("Active"))}${str("D", 4, S("Commitment"))}</row>` +
  // row 5: Air Freight, status "Other", Net-zero, bare numeric cells (no t="s") for base/target year.
  // Proves cellText handles both shared-string AND bare-numeric representations, matching the live
  // file's own mixed cell-type observation (see producer header).
  `<row r="5">${str("A", 5, S("Air Freight Co D"))}${str("B", 5, S("Air Freight"))}${str("C", 5, S("Other"))}${str("D", 5, S("Target"))}${str("E", 5, S("Net-zero"))}${num("F", 5, 2022)}${num("G", 5, 2050)}${num("H", 5, 45200)}</row>` +
  `</sheetData></worksheet>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="WebsiteData" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

function buildFixtureXlsx() {
  return buildStoredZip([
    zipEntry("xl/workbook.xml", WORKBOOK_XML),
    zipEntry("xl/_rels/workbook.xml.rels", WORKBOOK_RELS_XML),
    zipEntry("xl/worksheets/sheet1.xml", SHEET_XML),
    zipEntry("xl/sharedStrings.xml", SHARED_STRINGS_XML),
  ]);
}

function withFixtureFile(fn) {
  const path = join(tmpdir(), `sbti-cli-fixture-${process.pid}-${Math.random().toString(36).slice(2)}.xlsx`);
  writeFileSync(path, buildFixtureXlsx());
  try {
    return fn(path);
  } finally {
    rmSync(path, { force: true });
  }
}

function runCli(args, envOverrides = {}) {
  return spawnSync(process.execPath, [PRODUCER_PATH, ...args], {
    encoding: "utf8",
    env: { ...withoutCredentials(), ...envOverrides },
  });
}

// ── pure-function tests ──────────────────────────────────────────────────────────────────────────────

test("excelSerialToIsoDate: known Excel serial dates convert correctly; non-finite input returns null, never a fabricated date", () => {
  assert.equal(excelSerialToIsoDate(45000), "2023-03-15");
  assert.equal(excelSerialToIsoDate("45000"), "2023-03-15");
  assert.equal(excelSerialToIsoDate(NaN), null);
  assert.equal(excelSerialToIsoDate(undefined), null);
  assert.equal(excelSerialToIsoDate("not a number"), null);
});

test("resolveHeaderColumns: resolves by header TEXT, not position; throws a structural error naming exactly what is missing", () => {
  const rows = parseSheetRows(SHEET_XML);
  const shared = parseSharedStrings(SHARED_STRINGS_XML);
  const columns = resolveHeaderColumns(rows, shared);
  assert.equal(columns.sector, "B");
  assert.equal(columns.status, "C");
  assert.equal(columns.baseYear, "F");
  assert.throws(
    () => resolveHeaderColumns([{ rowNum: 1, cells: new Map() }], []),
    /missing expected column\(s\)/,
  );
});

test("extractSbtiTargetRows + aggregateSbtiTargetRows: the full happy path over the fixture sheet", () => {
  const rows = parseSheetRows(SHEET_XML);
  const shared = parseSharedStrings(SHARED_STRINGS_XML);
  const columns = resolveHeaderColumns(rows, shared);
  const dataRows = extractSbtiTargetRows(rows, shared, columns);
  assert.equal(dataRows.length, 4, "4 data rows (row 1 is the header, excluded)");
  assert.equal(dataRows[0].sector, "Ocean Freight");
  assert.equal(dataRows[0].baseYear, 2020);
  assert.equal(dataRows[3].sector, "Air Freight");
  assert.equal(dataRows[3].baseYear, 2022, "bare-numeric cell (no t=\"s\") read correctly, same as shared-string cells");

  const { seriesRows, skipReasons, sectorCount } = aggregateSbtiTargetRows(dataRows);
  assert.equal(sectorCount, 2);

  const byKey = new Map(seriesRows.map((r) => [r.series_key, r]));
  assert.ok(byKey.has("sbti:near-term-lead-time-ocean-freight"), "near-term lead time for Ocean Freight");
  // 10 years = 120 months (unit="months", not "years", to match lane L10's monthsValue() gate exactly,
  // spec 02 section 6 item 5's "months axis"; fixed in this same session after merging L10's own
  // lead-time-position.mjs, see the producer's own MONTHS note at its call site).
  assert.equal(byKey.get("sbti:near-term-lead-time-ocean-freight").value_numeric, 120);
  assert.equal(byKey.get("sbti:near-term-lead-time-ocean-freight").n_observations, 1);
  assert.equal(byKey.get("sbti:near-term-lead-time-ocean-freight").unit, "months");
  assert.equal(byKey.get("sbti:near-term-lead-time-ocean-freight").derivation, "calculated");
  assert.equal(byKey.get("sbti:near-term-lead-time-ocean-freight").origin_class, "derived");
  assert.equal(byKey.get("sbti:near-term-lead-time-ocean-freight").source_key, "sbti_dashboard");

  assert.ok(byKey.has("sbti:net-zero-lead-time-air-freight"), "net-zero lead time for Air Freight");
  // 28 years = 336 months.
  assert.equal(byKey.get("sbti:net-zero-lead-time-air-freight").value_numeric, 336);

  // SURVIVORSHIP, the removed row must be counted, never dropped.
  assert.ok(byKey.has("sbti:commitment-removed-ocean-freight"), "a 'Removed' status row must produce a commitment-removed series, never be silently dropped");
  assert.equal(byKey.get("sbti:commitment-removed-ocean-freight").value_numeric, 1);
  assert.equal(byKey.get("sbti:commitment-removed-ocean-freight").n_observations, null, "a direct tally, not a sampled average, no sample-size caveat to carry");

  // The Commitment-placeholder row (row 4) must be excluded, named, never fabricated into a figure.
  assert.ok([...skipReasons.keys()].some((r) => /status not Other\/Removed \("Active"\)/.test(r)));
});

test("aggregateSbtiTargetRows: a sector with no near-term/net-zero/removed rows produces nothing (never a fabricated zero)", () => {
  const { seriesRows } = aggregateSbtiTargetRows([{ sector: "Rail", status: "Active", action: "Commitment", target: "", baseYear: null, targetYear: null, datePublishedIso: null, companyName: "X" }]);
  assert.equal(seriesRows.length, 0);
});

test("decideApply: ALWAYS refuses --apply, citing the licence block, regardless of enabled/killSwitch/creds", () => {
  for (const params of [
    { apply: true, enabled: false, killSwitchOn: false, hasCreds: false },
    { apply: true, enabled: true, killSwitchOn: true, hasCreds: true },
  ]) {
    const d = decideApply(params);
    assert.equal(d.canWrite, false);
    assert.match(d.reason, /LICENCE BLOCKED/);
    assert.match(d.reason, /sbti_dashboard/);
  }
  assert.equal(decideApply({ apply: false }).canWrite, false);
});

test("LICENCE_BLOCK names the exact registered source_key this producer is blocked on", () => {
  assert.equal(LICENCE_BLOCK.sourceKey, "sbti_dashboard");
  assert.match(LICENCE_BLOCK.reason, /prohibited/i);
});

// ── CLI-level tests (real subprocess, synthetic-but-structurally-real xlsx, zero network) ───────────────

test("CLI dry run via --input: parses the fixture workbook, reports the plan, survivorship counted, writes nothing", () => {
  withFixtureFile((path) => {
    const res = runCli(["--input", path]);
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}. stderr: ${res.stderr}`);
    assert.match(res.stdout, /parsed 4 per-target row\(s\) across 2 sector\(s\), computed 3 series row\(s\)/);
    assert.match(res.stdout, /DRY RUN/);
    assert.match(res.stdout, /would create {2}sbti:near-term-lead-time-ocean-freight.*120 months \(n=1\)/);
    assert.match(res.stdout, /would create {2}sbti:commitment-removed-ocean-freight.*1 companies \(n=n\/a\)/);
    assert.match(res.stderr, /status not Other\/Removed \("Active"\)/);
  });
});

test("CLI --apply is refused unconditionally, the licence gate, exit 1, no creds/env needed to prove it", () => {
  withFixtureFile((path) => {
    const res = runCli(["--input", path, "--apply"]);
    assert.equal(res.status, 1, `expected exit 1, got ${res.status}. stdout: ${res.stdout} stderr: ${res.stderr}`);
    assert.match(res.stderr, /LICENCE BLOCKED/);
    assert.match(res.stderr, /sbti_dashboard/);
  });
});

test("CLI --apply is STILL refused even with the kill switch on and fake DB creds present (the licence gate overrides every other gate)", () => {
  withFixtureFile((path) => {
    const res = runCli(["--input", path, "--apply"], {
      MARKET_PRODUCER_SBTI_ENABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "fake",
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /LICENCE BLOCKED/);
  });
});

test("CLI: a workbook missing the \"WebsiteData\" sheet fails structurally (exit 2), never guesses another sheet", () => {
  const badZip = buildStoredZip([
    zipEntry("xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="SomeOtherSheet" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    zipEntry("xl/_rels/workbook.xml.rels", WORKBOOK_RELS_XML),
    zipEntry("xl/worksheets/sheet1.xml", SHEET_XML),
    zipEntry("xl/sharedStrings.xml", SHARED_STRINGS_XML),
  ]);
  const path = join(tmpdir(), `sbti-cli-badsheet-${process.pid}-${Math.random().toString(36).slice(2)}.xlsx`);
  writeFileSync(path, badZip);
  try {
    const res = runCli(["--input", path]);
    assert.equal(res.status, 2, `expected exit 2, got ${res.status}. stderr: ${res.stderr}`);
    assert.match(res.stderr, /no sheet named "WebsiteData"/);
  } finally {
    rmSync(path, { force: true });
  }
});

// NOT TESTED HERE, DELIBERATELY (same posture ecb-fx-producer.test.mjs's own trailer states): the
// no-input live-fetch branch (fetchSbtiTargetsXlsx) is environment-dependent; this lane's own report
// carries the result of a real, one-time live dry run against
// https://files.sciencebasedtargets.org/production/files/targets-excel.xlsx instead, per "test what you
// build". Also not tested: the post-licence-gate write path (guardedInsert/guardedUpdate), it is
// unreachable while decideApply refuses --apply unconditionally, by construction.
