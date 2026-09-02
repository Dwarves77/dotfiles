// eurostat-lc-lci-lev-parser.npmtest.mjs — fixture-driven proof for the lc_lci_lev decoder/aggregator.
// Runs under `node --test` via the fsi-app/src/**/*.npmtest.mjs glob (discipline.yml "App unit tests
// requiring npm deps" step) — execution-wired via .discipline/governance/execution-wiring.mjs surface 2
// without editing run-test-suite.sh, same posture as eurostat-nrg-pc-205-parser.npmtest.mjs. NETWORK-FREE:
// reads the committed fixture from disk, never fetches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  decodeJsonStat,
  latestLcLciLevValueForGeo,
  aggregateLcLciLevForRegion,
  EU_MEMBER_GEO_CODES,
} from "./eurostat-lc-lci-lev-parser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(HERE, "fixtures", "eurostat-lc-lci-lev-sample.json"), "utf8"));

test("EU_MEMBER_GEO_CODES matches regions.iso_codes for code='EU' (migration 106) minus the 'EU' pseudo-code itself", () => {
  assert.deepEqual([...EU_MEMBER_GEO_CODES].sort(), ["BE", "DE", "ES", "FR", "IT", "NL"]);
});

test("latestLcLciLevValueForGeo: DE has 2022 sparse (missing) — picks the only populated year, 2023", () => {
  const fact = latestLcLciLevValueForGeo(fixture.DE, "DE");
  assert.ok(fact);
  assert.equal(fact.geo, "DE");
  assert.equal(fact.year, "2023");
  assert.equal(fact.value, 50.3);
  assert.equal(fact.unit, "EUR/hour");
  assert.equal(fact.currency, "EUR");
});

test("latestLcLciLevValueForGeo: FR has BOTH 2022 and 2023 populated — picks the LATEST (2023), not the first", () => {
  const fact = latestLcLciLevValueForGeo(fixture.FR, "FR");
  assert.ok(fact);
  assert.equal(fact.year, "2023");
  assert.equal(fact.value, 42.1, "must pick 2023's value (42.1), not 2022's (39.5)");
});

test("latestLcLciLevValueForGeo: a geo absent from the payload returns null, never a fabricated fact", () => {
  const fact = latestLcLciLevValueForGeo(fixture.DE, "IT"); // DE's own payload only has geo=DE
  assert.equal(fact, null);
});

test("latestLcLciLevValueForGeo: requires a geo argument", () => {
  assert.throws(() => latestLcLciLevValueForGeo(fixture.DE), /geo is required/);
});

test("aggregateLcLciLevForRegion: DE + FR mean to (50.3 + 42.1) / 2 = 46.2, both latest years used", () => {
  const jsByGeo = { DE: fixture.DE, FR: fixture.FR };
  const obs = aggregateLcLciLevForRegion(jsByGeo, { geoCodes: ["DE", "FR"], regionCode: "EU" });
  assert.equal(obs.length, 1);
  const row = obs[0];
  assert.equal(row.value_numeric, 46.2);
  assert.equal(row.region_code, "EU");
  assert.equal(row.dimension, "labor_markets");
  assert.equal(row.unit, "EUR/hour");
  assert.equal(row.currency, "EUR");
  assert.equal(row.derivation, "calculated", "an aggregate WE computed, not a directly published Eurostat figure");
  assert.equal(row.origin_class, "derived");
  assert.equal(row.source_key, "eurostat");
  assert.equal(row.n_observations, 2, "sample size behind the aggregate — both DE and FR contributed");
  assert.equal(row.reference_period, "2023");
  assert.equal(row.as_at_date, "2023-01-01");
  assert.match(row.source_ref, /geo_mean_of=DE,FR/);
  assert.match(row.source_ref, /years=2023/, "both DE and FR's latest year happens to be 2023 here");
  assert.equal(row.method_version, "eurostat-lc-lci-lev-parser@1");
});

test("aggregateLcLciLevForRegion: a geo missing from jsByGeo entirely is excluded from the mean, not zero-filled", () => {
  // Only DE supplied — IT's fetch is treated as having failed/been skipped.
  const jsByGeo = { DE: fixture.DE };
  const obs = aggregateLcLciLevForRegion(jsByGeo, { geoCodes: ["DE", "IT"], regionCode: "EU" });
  assert.equal(obs.length, 1);
  assert.equal(obs[0].value_numeric, 50.3, "the mean of ONE country (DE alone) is just DE's own value");
  assert.equal(obs[0].n_observations, 1);
  assert.match(obs[0].source_ref, /geo_mean_of=DE(?!,)/, "IT must not appear in geo_mean_of — it never contributed");
});

test("aggregateLcLciLevForRegion: zero resolvable geos yields an empty array, never an average of nothing", () => {
  const obs = aggregateLcLciLevForRegion({}, { geoCodes: ["DE", "FR"], regionCode: "EU" });
  assert.deepEqual(obs, []);
});

test("aggregateLcLciLevForRegion: requires regionCode and a non-empty geoCodes array", () => {
  assert.throws(() => aggregateLcLciLevForRegion({ DE: fixture.DE }, { geoCodes: ["DE"] }), /regionCode is required/);
  assert.throws(() => aggregateLcLciLevForRegion({ DE: fixture.DE }, { regionCode: "EU", geoCodes: [] }), /geoCodes must be a non-empty array/);
});

test("decodeJsonStat is re-exported from the shared nrg_pc_205 decoder, not re-implemented", () => {
  const rows = decodeJsonStat(fixture.FR);
  assert.equal(rows.length, 2); // 2022 + 2023, both populated for FR
});
