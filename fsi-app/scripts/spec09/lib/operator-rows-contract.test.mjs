import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TABLE_CONTRACTS,
  OPERATOR_ROW_TABLES,
  parseOperatorRows,
  MAX_ROWS_PER_FILE,
  MAX_BYTES_PER_FILE,
  entityRefValuesForTable,
  validateEntityRefs,
} from "./operator-rows-contract.mjs";

const AUX_HEADER = "load_type,kw_draw,duty_cycle,hours_typical,setpoint_c";
const IDX_HEADER = "index_id,base_value,base_date,passthrough_pct,review_cadence,rounding_rule,cap_pct,floor_pct";

test("OPERATOR_ROW_TABLES lists exactly the two kept spec09 tables", () => {
  assert.deepEqual(new Set(OPERATOR_ROW_TABLES), new Set(["auxiliary_energy_profiles", "indexation_clauses"]));
});

test("parseOperatorRows rejects an unknown table (a removed customer-only table is unknown)", () => {
  for (const t of ["not_a_table", "surcharge_audits", "tce_data_quality", "eudr_plot_claims", "custody_chains"]) {
    const r = parseOperatorRows(t, "a,b\n1,2\n");
    assert.equal(r.ok, false);
    assert.match(r.error, /unknown table/);
  }
});

test("parseOperatorRows rejects an oversized payload", () => {
  const r = parseOperatorRows("indexation_clauses", "x".repeat(MAX_BYTES_PER_FILE + 1));
  assert.equal(r.ok, false);
  assert.match(r.error, /byte cap/);
});

test("parseOperatorRows rejects more rows than the cap", () => {
  const row = "idx,80,2026-01-01,70,quarterly,round,20,-10\n";
  const r = parseOperatorRows("indexation_clauses", IDX_HEADER + "\n" + row.repeat(MAX_ROWS_PER_FILE + 1));
  assert.equal(r.ok, false);
  assert.match(r.error, /row cap/);
});

test("parseOperatorRows rejects a CSV missing a required header", () => {
  const r = parseOperatorRows("indexation_clauses", "index_id,base_value\nidx,1\n");
  assert.equal(r.ok, false);
  assert.match(r.error, /missing required column/);
});

test("auxiliary_energy_profiles: accepts a museum-hold row and rejects a bad load_type", () => {
  const r = parseOperatorRows("auxiliary_energy_profiles", [AUX_HEADER, "museum_spec_hold,8.5,0.9,72,21", "space_heater,8.5,0.9,72,21"].join("\n"));
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].data.setpoint_c, 21);
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0].errors[0], /load_type must be one of/);
});

test("indexation_clauses: accepts the module's own worked example values", () => {
  const row = "cl:instrument:eua-front-dec,80,2026-01-01,70,quarterly,round to nearest cent,20,-10";
  const r = parseOperatorRows("indexation_clauses", [IDX_HEADER, row].join("\n"));
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].data.base_value, 80);
});

test("indexation_clauses: rejects an inverted floor/cap band", () => {
  const r = parseOperatorRows("indexation_clauses", [IDX_HEADER, "idx,80,2026-01-01,70,quarterly,round,-10,20"].join("\n"));
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0].errors[0], /floor_pct must be <= cap_pct/);
});

test("every table contract's parseRow is reachable via TABLE_CONTRACTS (no dead entry)", () => {
  for (const key of OPERATOR_ROW_TABLES) {
    assert.equal(typeof TABLE_CONTRACTS[key].parseRow, "function", key);
    assert.ok(Array.isArray(TABLE_CONTRACTS[key].requiredHeaders), key);
  }
});

test("entityRefValuesForTable: collects distinct non-empty entity-ref values across a batch", () => {
  const rows = [
    IDX_HEADER + ",corridor_id",
    "cl:instrument:a,80,2026-01-01,70,quarterly,round,20,-10,cl:corridor:x",
    "cl:instrument:a,81,2026-01-01,70,quarterly,round,20,-10,cl:corridor:y",
  ].join("\n");
  const { accepted } = parseOperatorRows("indexation_clauses", rows);
  assert.deepEqual([...entityRefValuesForTable("indexation_clauses", accepted)].sort(), ["cl:corridor:x", "cl:corridor:y", "cl:instrument:a"]);
});

test("validateEntityRefs: rejects a row whose required entity ref does not resolve, keeps a resolving one", () => {
  const csv = [IDX_HEADER, "cl:instrument:known,80,2026-01-01,70,quarterly,round,20,-10", "cl:instrument:unknown,80,2026-01-01,70,quarterly,round,20,-10"].join("\n");
  const { accepted } = parseOperatorRows("indexation_clauses", csv);
  const { valid, invalid } = validateEntityRefs("indexation_clauses", accepted, new Set(["cl:instrument:known"]));
  assert.equal(valid.length, 1);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].rowNumber, 3);
  assert.match(invalid[0].errors[0], /index_id "cl:instrument:unknown" does not match any known entity/);
});

test("validateEntityRefs: an optional entity ref left blank is never flagged", () => {
  const csv = ["load_type,kw_draw,duty_cycle,hours_typical,node_id", "museum_spec_hold,8.5,0.9,72,"].join("\n");
  const { accepted } = parseOperatorRows("auxiliary_energy_profiles", csv);
  const { valid, invalid } = validateEntityRefs("auxiliary_energy_profiles", accepted, new Set());
  assert.equal(valid.length, 1);
  assert.equal(invalid.length, 0);
});
