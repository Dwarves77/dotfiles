// eea-hdv-map.test.mjs -- lane S8-E1. Proves the mapper from aggregated EEA HDV groups to oem_tech_roadmaps rows:
// every covered column, every uncovered column NULL, the envelope, the residue accounting and the config validation.
// The vocabulary used for zero-emission rows below is SYNTHETIC (a test-local config): the shipped config carries no
// zero-emission mapping because the dataset's zero-emission fuel values are not evidenced by the committed sample
// (see eea-hdv-classification.json and the session log). Nothing here asserts a real EEA value for a zero-emission row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadClassification, validateClassification, classifyGroup, stageFor, mapGroupsToRows,
  OEM_COLUMNS, COVERED_COLUMNS, UNCOVERED_COLUMNS, ClassificationError,
} from "./eea-hdv-map.mjs";
import { aggregateHdvCsv } from "./eea-hdv-csv.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = readFileSync(join(HERE, "fixtures", "eea-hdv-sample.csv"));

const SYNTH = validateClassification({
  zev_tech_rules: [
    { when: { ms_fuel: "SYNTH-BATTERY" }, tech_category: "heavy_battery" },
    { when: { ms_fuel: "SYNTH-H2", ms_electric: "Yes" }, tech_category: "hydrogen_fcell" },
  ],
  // The coordinator's ruling of 2026-10-08, as the shipped config carries it.
  stage_rules: [
    { min_units: 1, stage: "small_batch_fleet" },
    { min_units: 1000, stage: "mass_series_production" },
  ],
  manufacturer_aliases: { "Acme Trucks AG": "acme-trucks.example" },
});

const group = (o = {}) => ({
  manufacturer: "Acme Trucks AG", zev: "Yes", hybrid: "No", dual_fuel: "No", engine_fuel: "", ms_fuel: "SYNTH-BATTERY",
  ms_electric: "Yes", units: 12, units_by_year: { 2023: 12 }, undated_units: 0, first_registration: "20220301", last_registration: "20230915", countries: ["DE", "FR"], ...o,
});
const ENTITIES = [
  { entity_id: "cl:organisation:00000000000000a1", canonical_name: "acme-trucks.example" },
  { entity_id: "cl:organisation:00000000000000a2", canonical_name: "Other Maker" },
];
const SOURCE = "00000000-0000-4000-8000-000000000001";

test("the table's column list is the 13 insertable columns of migration 296; covered plus uncovered equals all of them", () => {
  assert.deepEqual([...OEM_COLUMNS].sort(), [
    "announced_at", "c_rate_max", "commercial_stage", "confidence_admiralty", "density_basis", "derivation",
    "energy_density_wh_kg", "manufacturer_id", "origin_class", "source_id", "target_year", "tech_category", "usable_kwh",
  ]);
  assert.deepEqual([...COVERED_COLUMNS, ...UNCOVERED_COLUMNS].sort(), [...OEM_COLUMNS].sort());
  assert.deepEqual([...UNCOVERED_COLUMNS].sort(), ["announced_at", "c_rate_max", "density_basis", "energy_density_wh_kg", "target_year", "usable_kwh"]);
});

test("the shipped config validates: the ruled stage thresholds, and no zero-emission rule and no alias (nothing unevidenced is asserted)", () => {
  const cfg = loadClassification();
  assert.deepEqual(cfg.zev_tech_rules, []);
  assert.deepEqual(cfg.stage_rules.map((r) => [r.min_units, r.stage]), [[1000, "mass_series_production"], [1, "small_batch_fleet"]]);
  assert.deepEqual(cfg.manufacturer_aliases, {});
});

test("classifyGroup: conventional, hybrid and dual-fuel groups have no tech_category in the closed set, each with its own reason", () => {
  assert.deepEqual(classifyGroup(group({ zev: "No", ms_fuel: "Diesel", ms_electric: "No" }), SYNTH), { residue: "conventional_powertrain" });
  assert.deepEqual(classifyGroup(group({ zev: "No", hybrid: "Yes" }), SYNTH), { residue: "hybrid_powertrain" });
  assert.deepEqual(classifyGroup(group({ zev: "No", dual_fuel: "Yes" }), SYNTH), { residue: "dual_fuel_powertrain" });
  assert.deepEqual(classifyGroup(group({ zev: "" }), SYNTH), { residue: "zero_emission_flag_unreadable" });
});

test("classifyGroup: a zero-emission group takes the first rule whose every `when` key matches; none matching is residue, never a guess", () => {
  assert.deepEqual(classifyGroup(group(), SYNTH), { tech_category: "heavy_battery" });
  assert.deepEqual(classifyGroup(group({ ms_fuel: "SYNTH-H2" }), SYNTH), { tech_category: "hydrogen_fcell" });
  assert.deepEqual(classifyGroup(group({ ms_fuel: "SYNTH-H2", ms_electric: "No" }), SYNTH), { residue: "zero_emission_unmapped" });
  assert.deepEqual(classifyGroup(group({ ms_fuel: "something else" }), SYNTH), { residue: "zero_emission_unmapped" });
  assert.deepEqual(classifyGroup(group(), loadClassification()), { residue: "zero_emission_unmapped" }, "the shipped config maps nothing");
});

test("stageFor: 1 to 999 registered vehicles is small_batch_fleet, 1000 or more mass_series_production, 0 or no rule is null (the ruling)", () => {
  assert.equal(stageFor(5000, SYNTH), "mass_series_production");
  assert.equal(stageFor(1000, SYNTH), "mass_series_production");
  assert.equal(stageFor(999, SYNTH), "small_batch_fleet");
  assert.equal(stageFor(1, SYNTH), "small_batch_fleet");
  assert.equal(stageFor(0, SYNTH), null);
  assert.equal(stageFor(1000, loadClassification()), "mass_series_production", "the shipped config carries the same rule");
  assert.equal(stageFor(1, loadClassification()), "small_batch_fleet");
  assert.equal(stageFor(0, loadClassification()), null);
  assert.equal(stageFor(50, validateClassification({})), null, "an empty config gives no stage");
});

test("mapGroupsToRows: a zero-emission group becomes one row; every covered column filled, every uncovered column NULL, envelope complete", () => {
  const { rows, residue } = mapGroupsToRows([group()], { cfg: SYNTH, entities: ENTITIES, sourceId: SOURCE });
  assert.equal(rows.length, 1);
  const [r] = rows;
  assert.deepEqual(Object.keys(r).sort(), [...OEM_COLUMNS].sort(), "exactly the table's insertable columns, no more");
  assert.equal(r.manufacturer_id, "cl:organisation:00000000000000a1");
  assert.equal(r.tech_category, "heavy_battery");
  assert.equal(r.commercial_stage, "small_batch_fleet");
  assert.equal(r.source_id, SOURCE);
  assert.equal(r.origin_class, "official");
  assert.equal(r.derivation, "calculated", "the stage is a classification computed from observed counts");
  assert.equal(r.confidence_admiralty, null, "the register carries no confidence note for this dataset, so none is invented");
  for (const c of UNCOVERED_COLUMNS) assert.equal(r[c], null, `${c} stays NULL, never estimated`);
  assert.deepEqual(residue.byReason, {});
});

test("mapGroupsToRows: groups of one manufacturer and one technology are summed per year before the stage rule is applied", () => {
  const groups = [
    group({ units: 600, units_by_year: { 2023: 600 }, ms_fuel: "SYNTH-BATTERY" }),
    group({ units: 500, units_by_year: { 2023: 500 }, ms_fuel: "SYNTH-BATTERY", ms_electric: "No" }),
  ];
  const { rows } = mapGroupsToRows(groups, { cfg: SYNTH, entities: ENTITIES, sourceId: SOURCE });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].commercial_stage, "mass_series_production", "600 + 500 = 1100 in 2023, above the 1000 rule neither group reaches alone");
});

test("mapGroupsToRows: the stage is read from the latest registration year, not the total across years", () => {
  const { rows } = mapGroupsToRows([group({ units: 2005, units_by_year: { 2022: 2000, 2023: 5 } })], { cfg: SYNTH, entities: ENTITIES, sourceId: SOURCE });
  assert.equal(rows[0].commercial_stage, "small_batch_fleet", "2023 has 5 registrations; the 2000 of 2022 do not make the current stage");
});

test("mapGroupsToRows: units with no registration year give no stage evidence (residue no_registration_year), never a guessed year", () => {
  const { rows, residue } = mapGroupsToRows([group({ units: 3, units_by_year: {}, undated_units: 3 })], { cfg: SYNTH, entities: ENTITIES, sourceId: SOURCE });
  assert.equal(rows.length, 0);
  assert.deepEqual(residue.byReason, { no_registration_year: { groups: 1, units: 3 } });
});

test("mapGroupsToRows: residue is counted by reason with groups and units, and unresolved manufacturers are listed by name", () => {
  const groups = [
    group({ zev: "No", units: 40 }),
    group({ zev: "No", hybrid: "Yes", units: 3 }),
    group({ manufacturer: "Unknown Maker GmbH", units: 9 }),
    group({ ms_fuel: "other", units: 2 }),
  ];
  const { rows, residue } = mapGroupsToRows(groups, { cfg: SYNTH, entities: ENTITIES, sourceId: SOURCE });
  assert.equal(rows.length, 0);
  assert.deepEqual(residue.byReason, {
    conventional_powertrain: { groups: 1, units: 40 },
    hybrid_powertrain: { groups: 1, units: 3 },
    manufacturer_not_in_spine: { groups: 1, units: 9 },
    zero_emission_unmapped: { groups: 1, units: 2 },
  });
  assert.deepEqual(residue.unresolvedManufacturers, [{ manufacturer: "Unknown Maker GmbH", units: 9 }]);
});

test("mapGroupsToRows: a stage the rules do not reach is residue (no_stage_rule), not a default stage", () => {
  const noRules = validateClassification({ ...SYNTH, stage_rules: [] });
  const { rows, residue } = mapGroupsToRows([group()], { cfg: noRules, entities: ENTITIES, sourceId: SOURCE });
  assert.equal(rows.length, 0);
  assert.deepEqual(residue.byReason, { no_stage_rule: { groups: 1, units: 12 } });
});

test("mapGroupsToRows: the manufacturer resolves by alias to an existing organisation entity, else by exact canonical name, and is never minted", () => {
  const exact = mapGroupsToRows([group({ manufacturer: "Other Maker" })], { cfg: SYNTH, entities: ENTITIES, sourceId: SOURCE });
  assert.equal(exact.rows[0].manufacturer_id, "cl:organisation:00000000000000a2");
  const aliasNotInSpine = validateClassification({ ...SYNTH, manufacturer_aliases: { "Acme Trucks AG": "absent.example" } });
  const missing = mapGroupsToRows([group()], { cfg: aliasNotInSpine, entities: ENTITIES, sourceId: SOURCE });
  assert.equal(missing.rows.length, 0);
  assert.equal(missing.residue.byReason.manufacturer_not_in_spine.units, 12);
});

test("end to end on the real sample with the shipped config: 0 rows, all 71 vehicles accounted for as conventional powertrain", async () => {
  const agg = await aggregateHdvCsv([SAMPLE]);
  const { rows, residue } = mapGroupsToRows(agg.groups, { cfg: loadClassification(), entities: ENTITIES, sourceId: SOURCE });
  assert.equal(rows.length, 0);
  assert.deepEqual(residue.byReason, { conventional_powertrain: { groups: 1, units: 71 } });
});

test("validateClassification refuses an unknown key, a tech_category or stage outside the closed sets, an unknown `when` key and a bad min_units", () => {
  const bad = (o, re) => assert.throws(() => validateClassification(o), (e) => e instanceof ClassificationError && re.test(e.message));
  bad({ surprise: 1 }, /unknown key "surprise"/);
  bad({ zev_tech_rules: [{ when: { ms_fuel: "x" }, tech_category: "diesel_truck" }] }, /tech_category "diesel_truck"/);
  bad({ zev_tech_rules: [{ when: { colour: "x" }, tech_category: "heavy_battery" }] }, /when key "colour"/);
  bad({ zev_tech_rules: [{ when: {}, tech_category: "heavy_battery" }] }, /at least one/);
  bad({ stage_rules: [{ min_units: 0, stage: "announced" }] }, /min_units/);
  bad({ stage_rules: [{ min_units: 5, stage: "launched" }] }, /stage "launched"/);
  bad({ stage_rules: [{ min_units: 5, stage: "announced" }, { min_units: 5, stage: "pilot_demonstration" }] }, /duplicate min_units/);
  bad({ manufacturer_aliases: { "A": 3 } }, /alias/);
  bad(null, /object/);
});

test("the raw config file on disk is the one loadClassification() returns by default", () => {
  const onDisk = JSON.parse(readFileSync(join(HERE, "eea-hdv-classification.json"), "utf8"));
  assert.deepEqual(loadClassification(), validateClassification(onDisk));
});

test("the closed sets here equal the CHECK lists of migration 296 (drift guard: the migration is read, not copied)", async () => {
  const { TECH_CATEGORIES, COMMERCIAL_STAGES } = await import("./eea-hdv-map.mjs");
  const sql = readFileSync(join(HERE, "..", "..", "..", "supabase", "migrations", "296_spec09_market_tables.sql"), "utf8");
  const block = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS public.oem_tech_roadmaps"));
  const list = (col) => {
    const m = new RegExp(String.raw`${col}\s+text NOT NULL CHECK \(${col} IN\s*\(([^)]*)\)`).exec(block);
    assert.ok(m, `${col} CHECK list found in migration 296`);
    return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  };
  assert.deepEqual([...TECH_CATEGORIES], list("tech_category"));
  assert.deepEqual([...COMMERCIAL_STAGES], list("commercial_stage"));
});
