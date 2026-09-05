import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, parseOemRoadmapRow, CITE } from "./oem-roadmap-producer.mjs";

const MANUFACTURERS = [
  { entity_id: "cl:organisation:volvotrucks", canonical_name: "volvotrucks.com" },
  { entity_id: "cl:organisation:scania", canonical_name: "scania.com" },
];

function tmpRowsFile(rows) {
  const dir = mkdtempSync(join(tmpdir(), "oem-roadmap-rows-"));
  const p = join(dir, "rows.json");
  writeFileSync(p, JSON.stringify({ rows }));
  return p;
}

const GOOD_ROW = {
  manufacturer_name: "volvotrucks.com",
  tech_category: "heavy_battery",
  commercial_stage: "small_batch_fleet",
  target_year: 2028,
  energy_density_wh_kg: 260,
  density_basis: "pack",
  confidence_admiralty: "B2",
  announced_at: "2026-06-01",
  citation: {
    url: "https://www.gov.uk/government/news/oem-heavy-battery-fleet-announcement",
    title: "GOV.UK — OEM heavy-battery fleet announcement coverage",
    retrieved_at: "2026-09-05",
    quote: "a small-batch fleet of heavy-battery trucks entering commercial service",
  },
};

test("dry run: zero to insert with no --rows-file, names the gap", async () => {
  const s = await main({ mode: "dry" }, {});
  assert.equal(s.counts.to_insert, 0);
  assert.match(s.gap, /SOURCES\.md/);
});

test("apply run with no --rows-file: exercises the guarded path with an empty batch and a valid cite", async () => {
  let called = null;
  const deps = { guardedInsertMany: async (table, rows, opts) => { called = { table, rows, opts }; return { inserted: 0 }; } };
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.applied, 0);
  assert.equal(called.table, "oem_tech_roadmaps");
  assert.deepEqual(called.rows, []);
  assert.equal(called.opts.cite, CITE);
});

test("parseOemRoadmapRow: a fully-cited, resolvable row parses clean, source_id set", async () => {
  const deps = { registerSource: async () => ({ source_id: "src-1", created: true }) };
  const result = await parseOemRoadmapRow(GOOD_ROW, 0, MANUFACTURERS, deps);
  assert.equal(result.refused, false);
  assert.equal(result.dbRow.manufacturer_id, "cl:organisation:volvotrucks");
  assert.equal(result.dbRow.source_id, "src-1");
  assert.equal(result.dbRow.origin_class, "community");
  assert.equal(result.dbRow.derivation, "observed");
});

test("parseOemRoadmapRow: invalid tech_category throws", async () => {
  const row = { ...GOOD_ROW, tech_category: "cold_fusion" };
  await assert.rejects(() => parseOemRoadmapRow(row, 0, MANUFACTURERS, {}));
});

test("parseOemRoadmapRow: invalid commercial_stage throws", async () => {
  const row = { ...GOOD_ROW, commercial_stage: "vaporware" };
  await assert.rejects(() => parseOemRoadmapRow(row, 0, MANUFACTURERS, {}));
});

test("parseOemRoadmapRow: energy_density set with no density_basis is refused (spec 09 §5 open decision 3)", async () => {
  const row = { ...GOOD_ROW, density_basis: undefined };
  const result = await parseOemRoadmapRow(row, 0, MANUFACTURERS, {});
  assert.equal(result.refused, true);
  assert.match(result.reason, /density_basis/);
});

test("parseOemRoadmapRow: invalid density_basis throws", async () => {
  const row = { ...GOOD_ROW, density_basis: "battery-guess" };
  await assert.rejects(() => parseOemRoadmapRow(row, 0, MANUFACTURERS, {}));
});

test("parseOemRoadmapRow: invalid confidence_admiralty shape throws", async () => {
  const row = { ...GOOD_ROW, confidence_admiralty: "Z9" };
  await assert.rejects(() => parseOemRoadmapRow(row, 0, MANUFACTURERS, {}));
});

test("parseOemRoadmapRow: invalid origin_class throws", async () => {
  const row = { ...GOOD_ROW, origin_class: "not-a-real-class" };
  await assert.rejects(() => parseOemRoadmapRow(row, 0, MANUFACTURERS, {}));
});

test("parseOemRoadmapRow: unresolvable manufacturer is refused, never mints", async () => {
  const row = { ...GOOD_ROW, manufacturer_name: "unknown-truck-maker.example" };
  const result = await parseOemRoadmapRow(row, 0, MANUFACTURERS, { registerSource: async () => ({ source_id: "s", created: true }) });
  assert.equal(result.refused, true);
  assert.match(result.reason, /unknown-truck-maker\.example/);
});

test("parseOemRoadmapRow: ambiguous citation host is refused (source_id is NOT NULL, never a placeholder)", async () => {
  const row = { ...GOOD_ROW, citation: { ...GOOD_ROW.citation, url: "https://volvotrucks.com/en/news/some-press-release" } };
  const result = await parseOemRoadmapRow(row, 0, MANUFACTURERS, {});
  assert.equal(result.refused, true);
  assert.match(result.reason, /source_id is NOT NULL/);
});

test("main: dry run with --rows-file reports would-write against a fixture with a live manufacturer", async () => {
  const rowsFile = tmpRowsFile([GOOD_ROW]);
  const deps = {
    readAll: async () => MANUFACTURERS,
    registerSource: async () => ({ source_id: "src-1", created: true }),
  };
  const s = await main({ mode: "dry", arg: rowsFile }, deps);
  assert.equal(s.counts.to_insert, 1);
  assert.equal(s.counts.written, 1);
  assert.equal(s.counts.refused, 0);
  assert.equal(s.applied, 0);
});

test("main: apply run with --rows-file writes one row per parsed entry, each with its own cite", async () => {
  const rowsFile = tmpRowsFile([GOOD_ROW]);
  const inserts = [];
  const deps = {
    readAll: async () => MANUFACTURERS,
    registerSource: async () => ({ source_id: "src-1", created: true }),
    guardedInsertMany: async (table, rows, opts) => { inserts.push({ table, rows, opts }); return { inserted: rows.length }; },
  };
  const s = await main({ mode: "apply", arg: rowsFile }, deps);
  assert.equal(s.applied, 1);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, "oem_tech_roadmaps");
  assert.equal(inserts[0].rows[0].source_id, "src-1");
});

test("main: bad --rows-file path reports the error in the summary, never throws", async () => {
  const s = await main({ mode: "dry", arg: "/nonexistent/rows.json" }, {});
  assert.equal(s.exitCode, 3);
  assert.match(s.gap, /--rows-file error/);
});
