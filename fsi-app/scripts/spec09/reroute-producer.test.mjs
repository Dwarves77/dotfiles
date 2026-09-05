import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, evaluateCorridorReadiness, parseRerouteRow, CITE } from "./reroute-producer.mjs";

const CORRIDORS_2 = [
  { entity_id: "cl:corridor:baseline", canonical_name: "CNSHA-NLRTM:ocean" },
  { entity_id: "cl:corridor:cape", canonical_name: "CNSHA-NLRTM:ocean-cape" },
];

function tmpRowsFile(rows) {
  const dir = mkdtempSync(join(tmpdir(), "reroute-rows-"));
  const p = join(dir, "rows.json");
  writeFileSync(p, JSON.stringify({ rows }));
  return p;
}

const GOOD_ROW = {
  baseline_corridor_name: "CNSHA-NLRTM:ocean",
  reroute_corridor_name: "CNSHA-NLRTM:ocean-cape",
  cause: "Red Sea diversion (Bab-el-Mandeb strait closure) — routed via Cape of Good Hope",
  distance_delta_nm: 4000,
  transit_delta_days: 10,
  fuel_burn_multiplier: 1.3,
  effective_from: "2025-12-01",
  effective_to: null,
  citation: {
    url: "https://www.imo.org/en/MediaCentre/PressBriefings/Pages/red-sea-situation.aspx",
    title: "IMO — Red Sea situation press briefing",
    retrieved_at: "2026-09-05",
    quote: "vessels rerouting via the Cape of Good Hope face materially longer voyages and higher fuel consumption",
  },
};

test("evaluateCorridorReadiness: 0 corridors -> not ready, count-specific gap", () => {
  const r = evaluateCorridorReadiness([]);
  assert.equal(r.ready, false);
  assert.equal(r.count, 0);
  assert.match(r.gap, /only 0 corridor entities/);
});

test("evaluateCorridorReadiness: 1 corridor (today's live spine state) -> not ready, singular phrasing", () => {
  const r = evaluateCorridorReadiness([{ entity_id: "cl:corridor:abc", canonical_name: "CNSHA-NLRTM:ocean" }]);
  assert.equal(r.ready, false);
  assert.equal(r.count, 1);
  assert.match(r.gap, /only 1 corridor entity in/);
});

test("evaluateCorridorReadiness: 2+ corridors -> still not ready (no confirmed pairing), different gap text", () => {
  const r = evaluateCorridorReadiness(CORRIDORS_2);
  assert.equal(r.ready, false);
  assert.equal(r.count, 2);
  assert.match(r.gap, /no producer-confirmed reroute pairing/);
});

test("evaluateCorridorReadiness: non-array input treated as empty, never throws", () => {
  const r = evaluateCorridorReadiness(null);
  assert.equal(r.count, 0);
});

test("main: dry run reads corridor entities via deps.readAll and reports the live count", async () => {
  const deps = {
    readAll: async (table, cols, opts) => {
      assert.equal(table, "entities");
      return [{ entity_id: "cl:corridor:only-one", canonical_name: "CNSHA-NLRTM:ocean" }];
    },
  };
  const s = await main({ mode: "dry" }, deps);
  assert.equal(s.counts.corridor_entities_found, 1);
  assert.equal(s.counts.to_insert, 0);
  assert.match(s.gap, /only 1 corridor entity/);
});

test("main: with no deps.readAll, treats the corridor count as 0 rather than throwing", async () => {
  const s = await main({ mode: "dry" }, {});
  assert.equal(s.counts.corridor_entities_found, 0);
});

test("main: apply with no --rows-file exercises the guarded path with an empty batch and a valid cite", async () => {
  let called = null;
  const deps = {
    readAll: async () => [],
    guardedInsertMany: async (table, rows, opts) => { called = { table, rows, opts }; return { inserted: 0 }; },
  };
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.applied, 0);
  assert.equal(called.table, "reroute_events");
  assert.equal(called.opts.cite, CITE);
});

// ── Rows-file mechanism (lane SPEC09-A, 2026-09-05) ─────────────────────────────────────────────────────

test("parseRerouteRow: a fully-cited, resolvable row parses clean", async () => {
  const deps = { registerSource: async () => ({ source_id: "src-1", created: true }) };
  const result = await parseRerouteRow(GOOD_ROW, 0, CORRIDORS_2, deps);
  assert.equal(result.refused, false);
  assert.equal(result.dbRow.baseline_corridor_id, "cl:corridor:baseline");
  assert.equal(result.dbRow.reroute_corridor_id, "cl:corridor:cape");
  assert.equal(result.dbRow.fuel_burn_multiplier, 1.3);
  assert.match(result.cite.reason, /IMO/);
});

test("parseRerouteRow: missing citation throws (structural)", async () => {
  const row = { ...GOOD_ROW, citation: undefined };
  await assert.rejects(() => parseRerouteRow(row, 0, CORRIDORS_2, {}));
});

test("parseRerouteRow: unresolvable corridor name is refused, not thrown, and names which side", async () => {
  const row = { ...GOOD_ROW, baseline_corridor_name: "does-not-exist" };
  const result = await parseRerouteRow(row, 0, CORRIDORS_2, { registerSource: async () => ({ source_id: "s", created: true }) });
  assert.equal(result.refused, true);
  assert.match(result.reason, /baseline "does-not-exist" MISSING/);
});

test("parseRerouteRow: baseline == reroute after resolution is refused", async () => {
  const row = { ...GOOD_ROW, reroute_corridor_name: "CNSHA-NLRTM:ocean" };
  const result = await parseRerouteRow(row, 0, CORRIDORS_2, {});
  assert.equal(result.refused, true);
  assert.match(result.reason, /SAME corridor entity/);
});

test("parseRerouteRow: fuel_burn_multiplier <= 0 throws", async () => {
  const row = { ...GOOD_ROW, fuel_burn_multiplier: 0 };
  await assert.rejects(() => parseRerouteRow(row, 0, CORRIDORS_2, {}));
});

test("parseRerouteRow: effective_to before effective_from throws", async () => {
  const row = { ...GOOD_ROW, effective_to: "2020-01-01" };
  await assert.rejects(() => parseRerouteRow(row, 0, CORRIDORS_2, {}));
});

test("parseRerouteRow: ambiguous citation host is refused, not force-published", async () => {
  const row = { ...GOOD_ROW, citation: { ...GOOD_ROW.citation, url: "https://some-shipping-blog.example.com/post" } };
  const result = await parseRerouteRow(row, 0, CORRIDORS_2, {});
  assert.equal(result.refused, true);
  assert.match(result.reason, /citation refused/);
});

test("main: dry run with --rows-file (arg) against a fixture with 2 live corridors reports would-write, no DB write", async () => {
  const rowsFile = tmpRowsFile([GOOD_ROW]);
  const deps = {
    readAll: async () => CORRIDORS_2,
    registerSource: async () => ({ source_id: "src-1", created: true }),
  };
  const s = await main({ mode: "dry", arg: rowsFile }, deps);
  assert.equal(s.counts.corridor_entities_found, 2);
  assert.equal(s.counts.to_insert, 1);
  assert.equal(s.counts.written, 1);
  assert.equal(s.counts.refused, 0);
  assert.equal(s.applied, 0);
});

test("main: apply run with --rows-file writes one row per parsed rows-file entry through the guarded path, each with its own cite", async () => {
  const rowsFile = tmpRowsFile([GOOD_ROW]);
  const inserts = [];
  const deps = {
    readAll: async () => CORRIDORS_2,
    registerSource: async () => ({ source_id: "src-1", created: true }),
    guardedInsertMany: async (table, rows, opts) => { inserts.push({ table, rows, opts }); return { inserted: rows.length }; },
  };
  const s = await main({ mode: "apply", arg: rowsFile }, deps);
  assert.equal(s.applied, 1);
  assert.equal(s.counts.written, 1);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, "reroute_events");
  assert.equal(inserts[0].rows.length, 1);
  assert.match(inserts[0].opts.cite.reason, /IMO/);
});

test("main: --rows-file pointing at a nonexistent file reports the error in the summary, never throws", async () => {
  const s = await main({ mode: "dry", arg: "/nonexistent/rows.json" }, { readAll: async () => CORRIDORS_2 });
  assert.equal(s.exitCode, 3);
  assert.match(s.gap, /--rows-file error/);
});

test("main: --rows-file with an unresolvable corridor is refused and counted, not written", async () => {
  const rowsFile = tmpRowsFile([{ ...GOOD_ROW, baseline_corridor_name: "nope" }]);
  const s = await main({ mode: "dry", arg: rowsFile }, { readAll: async () => CORRIDORS_2 });
  assert.equal(s.counts.refused, 1);
  assert.equal(s.counts.written, 0);
  assert.match(s.refusals[0], /nope/);
});
