import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, parseGridQueueRow, CITE } from "./grid-queue-producer.mjs";

const JURISDICTIONS = [
  { entity_id: "cl:jurisdiction:gb", canonical_name: "GB" },
  { entity_id: "cl:jurisdiction:gb-wls", canonical_name: "GB-WLS" },
];

function tmpRowsFile(rows) {
  const dir = mkdtempSync(join(tmpdir(), "grid-queue-rows-"));
  const p = join(dir, "rows.json");
  writeFileSync(p, JSON.stringify({ rows }));
  return p;
}

const GOOD_ROW = {
  jurisdiction_name: "GB",
  dso_name: "UK Power Networks",
  capacity_band_mw: "1-5MW",
  queue_months_p50: 24,
  queue_months_p90: 40,
  as_of: "2026-08-01",
  citation: {
    url: "https://www.ofgem.gov.uk/publications/connections-register",
    title: "Ofgem — DNO Connections Register",
    retrieved_at: "2026-09-05",
    quote: "demand connection queue times by capacity band",
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
  assert.equal(called.table, "grid_connection_queues");
  assert.equal(called.opts.cite, CITE);
});

test("parseGridQueueRow: a fully-cited, resolvable row parses clean", async () => {
  const deps = { registerSource: async () => ({ source_id: "src-1", created: true }) };
  const result = await parseGridQueueRow(GOOD_ROW, 0, JURISDICTIONS, deps);
  assert.equal(result.refused, false);
  assert.equal(result.dbRow.jurisdiction_id, "cl:jurisdiction:gb");
  assert.equal(result.dbRow.obs_status, "A");
  assert.match(result.cite.reason, /Ofgem/);
});

test("parseGridQueueRow: missing both percentile fields throws", async () => {
  const row = { ...GOOD_ROW, queue_months_p50: undefined, queue_months_p90: undefined };
  await assert.rejects(() => parseGridQueueRow(row, 0, JURISDICTIONS, {}));
});

test("parseGridQueueRow: p90 < p50 is refused, not thrown", async () => {
  const row = { ...GOOD_ROW, queue_months_p50: 30, queue_months_p90: 10 };
  const result = await parseGridQueueRow(row, 0, JURISDICTIONS, {});
  assert.equal(result.refused, true);
  assert.match(result.reason, /cannot read faster/);
});

test("parseGridQueueRow: negative queue_months_p50 throws", async () => {
  const row = { ...GOOD_ROW, queue_months_p50: -1 };
  await assert.rejects(() => parseGridQueueRow(row, 0, JURISDICTIONS, {}));
});

test("parseGridQueueRow: invalid obs_status throws", async () => {
  const row = { ...GOOD_ROW, obs_status: "Z" };
  await assert.rejects(() => parseGridQueueRow(row, 0, JURISDICTIONS, {}));
});

test("parseGridQueueRow: unresolvable jurisdiction is refused, never mints", async () => {
  const row = { ...GOOD_ROW, jurisdiction_name: "Narnia" };
  const result = await parseGridQueueRow(row, 0, JURISDICTIONS, { registerSource: async () => ({ source_id: "s", created: true }) });
  assert.equal(result.refused, true);
  assert.match(result.reason, /Narnia/);
});

test("parseGridQueueRow: ambiguous citation host is refused", async () => {
  const row = { ...GOOD_ROW, citation: { ...GOOD_ROW.citation, url: "https://random-energy-blog.example.com/post" } };
  const result = await parseGridQueueRow(row, 0, JURISDICTIONS, {});
  assert.equal(result.refused, true);
});

test("main: dry run with --rows-file reports would-write against a fixture with a live jurisdiction", async () => {
  const rowsFile = tmpRowsFile([GOOD_ROW]);
  const deps = {
    readAll: async () => JURISDICTIONS,
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
    readAll: async () => JURISDICTIONS,
    registerSource: async () => ({ source_id: "src-1", created: true }),
    guardedInsertMany: async (table, rows, opts) => { inserts.push({ table, rows, opts }); return { inserted: rows.length }; },
  };
  const s = await main({ mode: "apply", arg: rowsFile }, deps);
  assert.equal(s.applied, 1);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, "grid_connection_queues");
  assert.match(inserts[0].opts.cite.reason, /Ofgem/);
});

test("main: bad --rows-file path reports the error in the summary, never throws", async () => {
  const s = await main({ mode: "dry", arg: "/nonexistent/rows.json" }, {});
  assert.equal(s.exitCode, 3);
  assert.match(s.gap, /--rows-file error/);
});
