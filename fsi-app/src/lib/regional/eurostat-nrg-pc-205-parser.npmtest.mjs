// eurostat-nrg-pc-205-parser.npmtest.mjs — fixture-driven proof for the nrg_pc_205 JSON-stat decoder.
// Runs under `node --test` via the fsi-app/src/**/*.npmtest.mjs glob (discipline.yml "App unit tests
// requiring npm deps" step) — execution-wired via .discipline/governance/execution-wiring.mjs surface 2
// without editing run-test-suite.sh (outside this lane's write set). NETWORK-FREE: reads the committed
// fixture from disk, never fetches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodeJsonStat, parseNrgPc205 } from "./eurostat-nrg-pc-205-parser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(HERE, "fixtures", "eurostat-nrg-pc-205-sample.json"), "utf8"));

test("decodeJsonStat: sparse value map decodes to the right coordinates (row-major, last dim fastest)", () => {
  const rows = decodeJsonStat(fixture);
  // 7 populated cells (index 7 deliberately absent from the fixture's sparse value map).
  assert.equal(rows.length, 7);
  const byIdx = new Map(rows.map((r) => [`${r.coords.geo}|${r.coords.nrg_cons}|${r.coords.time}`, r.value]));
  assert.equal(byIdx.get("EU27_2020|MWH20-499|2025-S1"), 0.2043);
  assert.equal(byIdx.get("EU27_2020|MWH20-499|2025-S2"), 0.2087);
  assert.equal(byIdx.get("EU27_2020|MWH500-1999|2025-S1"), 0.1821);
  assert.equal(byIdx.get("EU27_2020|MWH500-1999|2025-S2"), 0.1856);
  assert.equal(byIdx.get("DE|MWH20-499|2025-S1"), 0.2211);
  assert.equal(byIdx.get("DE|MWH20-499|2025-S2"), 0.2255);
  assert.equal(byIdx.get("DE|MWH500-1999|2025-S1"), 0.1998);
  // The deliberately-absent cell must not appear at all (sparse, not null-filled).
  assert.equal(byIdx.has("DE|MWH500-1999|2025-S2"), false);
});

test("parseNrgPc205: selects only the requested geo, one row per (band, period)", () => {
  const obs = parseNrgPc205(fixture, { geo: "EU27_2020", regionCode: "EU" });
  assert.equal(obs.length, 4); // 2 bands x 2 periods for EU27_2020 only
  assert.ok(obs.every((o) => o.region_code === "EU"));
});

test("parseNrgPc205: every row carries the full WO-17 envelope, correctly derived", () => {
  const obs = parseNrgPc205(fixture, { geo: "EU27_2020", regionCode: "EU" });
  const row = obs.find((o) => o.reference_period === "2025-S1" && o.source_ref.includes("MWH20-499"));
  assert.ok(row, "expected a 2025-S1 / MWH20-499 row");
  assert.equal(row.value_numeric, 0.2043);
  assert.equal(row.unit, "EUR/kWh");
  assert.equal(row.currency, "EUR");
  assert.equal(row.derivation, "observed");
  assert.equal(row.origin_class, "official");
  assert.equal(row.source_key, "eurostat");
  assert.equal(row.source_ref, "nrg_pc_205:geo=EU27_2020;nrg_cons=MWH20-499;time=2025-S1");
  assert.equal(row.method_version, "eurostat-nrg-pc-205-parser@1");
  assert.equal(row.as_at_date, "2025-01-01"); // S1 -> 1 January
  assert.equal(row.reference_period, "2025-S1");
  assert.equal(row.dimension, "operational_cost");
  assert.match(row.fact_label, /^EU — Electricity price for non-household consumers, 20 MWh < Consumption < 500 MWh \(all taxes and levies\)$/);
});

test("parseNrgPc205: S2 anchors to 1 July", () => {
  const obs = parseNrgPc205(fixture, { geo: "EU27_2020", regionCode: "EU" });
  const row = obs.find((o) => o.reference_period === "2025-S2" && o.source_ref.includes("MWH500-1999"));
  assert.equal(row.as_at_date, "2025-07-01");
  assert.equal(row.value_numeric, 0.1856);
});

test("parseNrgPc205: a geo absent from the payload yields zero rows, never a fabricated one", () => {
  const obs = parseNrgPc205(fixture, { geo: "FR", regionCode: "EU" });
  assert.deepEqual(obs, []);
});

test("parseNrgPc205: requires geo and regionCode", () => {
  assert.throws(() => parseNrgPc205(fixture, { regionCode: "EU" }), /geo is required/);
  assert.throws(() => parseNrgPc205(fixture, { geo: "EU27_2020" }), /regionCode is required/);
});

test("decodeJsonStat: rejects a non-JSON-stat document rather than silently returning nothing", () => {
  assert.throws(() => decodeJsonStat({}), /not a JSON-stat 2\.0 document/);
});
