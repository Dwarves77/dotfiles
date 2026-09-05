import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TABLE_CONTRACTS,
  UPLOAD_TABLES,
  parseCsvUpload,
  splitCsvLine,
  splitCsvText,
  MAX_ROWS_PER_UPLOAD,
  MAX_BYTES_PER_UPLOAD,
  entityRefValuesForTable,
  validateEntityRefs,
} from "./csv-upload-contract.mjs";

test("UPLOAD_TABLES lists exactly the six customer-data spec09 tables", () => {
  assert.deepEqual(new Set(UPLOAD_TABLES), new Set([
    "surcharge_audits", "tce_data_quality", "auxiliary_energy_profiles",
    "eudr_plot_claims", "custody_chains", "indexation_clauses",
  ]));
});

test("splitCsvLine handles quoted commas and escaped quotes", () => {
  assert.deepEqual(splitCsvLine('a,"b, c","d""e"'), ["a", "b, c", 'd"e']);
});

test("splitCsvText lower-cases headers, strips BOM, skips blank lines", () => {
  const { header, rows } = splitCsvText("﻿A,B\n1,2\n\n3,4\n");
  assert.deepEqual(header, ["a", "b"]);
  assert.deepEqual(rows, [["1", "2"], ["3", "4"]]);
});

test("parseCsvUpload rejects an unknown table", () => {
  const r = parseCsvUpload("not_a_table", "a,b\n1,2\n");
  assert.equal(r.ok, false);
  assert.match(r.error, /unknown table/);
});

test("parseCsvUpload rejects an oversized payload", () => {
  const big = "x".repeat(MAX_BYTES_PER_UPLOAD + 1);
  const r = parseCsvUpload("tce_data_quality", big);
  assert.equal(r.ok, false);
  assert.match(r.error, /byte cap/);
});

test("parseCsvUpload rejects more rows than the cap", () => {
  const header = "tce_id,reliability,completeness,temporal_correlation,geographical_correlation,technological_correlation,primary_data_share\n";
  const row = "leg-1,1,1,1,1,1,0.9\n";
  const csv = header + row.repeat(MAX_ROWS_PER_UPLOAD + 1);
  const r = parseCsvUpload("tce_data_quality", csv);
  assert.equal(r.ok, false);
  assert.match(r.error, /row cap/);
});

test("parseCsvUpload rejects a CSV missing a required header", () => {
  const csv = "tce_id,reliability\nleg-1,3\n";
  const r = parseCsvUpload("tce_data_quality", csv);
  assert.equal(r.ok, false);
  assert.match(r.error, /missing required column/);
});

// ── surcharge_audits ──────────────────────────────────────────────────────────────────────────────────

test("surcharge_audits: accepts a well-formed row", () => {
  const csv = [
    "corridor_id,carrier_id,invoice_line,billed_eur,statutory_eur,statutory_basis",
    "cl:corridor:0000000000000101,cl:organisation:0000000000000103,FuelEU surcharge Q3,1250.00,980.50,FuelEU Maritime Art. 20(3)",
  ].join("\n");
  const r = parseCsvUpload("surcharge_audits", csv);
  assert.equal(r.ok, true);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.rejected.length, 0);
  assert.equal(r.accepted[0].data.statutory_derivation, "statutory_formula");
  assert.equal(r.accepted[0].data.billed_eur, 1250);
});

test("surcharge_audits: rejects a negative billed_eur with a specific reason", () => {
  const csv = [
    "corridor_id,carrier_id,invoice_line,billed_eur,statutory_eur,statutory_basis",
    "cl:corridor:x,cl:organisation:y,line,-5,10,Art. 1",
  ].join("\n");
  const r = parseCsvUpload("surcharge_audits", csv);
  assert.equal(r.ok, true);
  assert.equal(r.accepted.length, 0);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].rowNumber, 2);
  assert.match(r.rejected[0].errors[0], /billed_eur must be between 0/);
});

test("surcharge_audits: rejects an invalid statutory_derivation enum value", () => {
  const csv = [
    "corridor_id,carrier_id,invoice_line,billed_eur,statutory_eur,statutory_basis,statutory_derivation",
    "c,o,line,1,1,basis,bogus",
  ].join("\n");
  const r = parseCsvUpload("surcharge_audits", csv);
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0].errors.join(" "), /statutory_derivation must be one of/);
});

// ── tce_data_quality ──────────────────────────────────────────────────────────────────────────────────

test("tce_data_quality: accepts a well-formed row and rejects an out-of-range axis", () => {
  const header = "tce_id,reliability,completeness,temporal_correlation,geographical_correlation,technological_correlation,primary_data_share";
  const good = "leg-1,1,2,3,4,5,0.62";
  const bad = "leg-2,0,2,3,4,5,0.62"; // reliability out of 1..5
  const r = parseCsvUpload("tce_data_quality", [header, good, bad].join("\n"));
  assert.equal(r.accepted.length, 1);
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0].errors[0], /reliability must be between 1 and 5/);
});

// ── auxiliary_energy_profiles ─────────────────────────────────────────────────────────────────────────

test("auxiliary_energy_profiles: accepts a museum-hold row and rejects a bad load_type", () => {
  const header = "load_type,kw_draw,duty_cycle,hours_typical,setpoint_c";
  const good = "museum_spec_hold,8.5,0.9,72,21";
  const bad = "space_heater,8.5,0.9,72,21";
  const r = parseCsvUpload("auxiliary_energy_profiles", [header, good, bad].join("\n"));
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].data.setpoint_c, 21);
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0].errors[0], /load_type must be one of/);
});

// ── eudr_plot_claims ──────────────────────────────────────────────────────────────────────────────────

test("eudr_plot_claims: accepts valid geometry_json and rejects malformed JSON", () => {
  const header = "consignment_ref,validation_state,geometry_json,hold_risk";
  const good = 'CONSIG-1,valid,"{""type"":""Point""}",none';
  const bad = 'CONSIG-2,valid,"{not json}",none';
  const r = parseCsvUpload("eudr_plot_claims", [header, good, bad].join("\n"));
  assert.equal(r.accepted.length, 1);
  assert.deepEqual(r.accepted[0].data.geometry_json, { type: "Point" });
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0].errors[0], /geometry_json must be valid JSON/);
});

test("eudr_plot_claims: hold_risk is optional (caller applies the write-time default)", () => {
  const csv = "consignment_ref,validation_state\nCONSIG-3,missing\n";
  const r = parseCsvUpload("eudr_plot_claims", csv);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].data.hold_risk, null);
});

// ── custody_chains ────────────────────────────────────────────────────────────────────────────────────

test("custody_chains: rejects a retirement date with no registry (unverifiable claim)", () => {
  const header = "credit_type,scheme,certificate_ref,double_count_check,retired_at,retirement_registry";
  const bad = "saf_bnc,ISCC PLUS,CERT-1,unverified,2026-01-01,";
  const r = parseCsvUpload("custody_chains", [header, bad].join("\n"));
  assert.equal(r.accepted.length, 0);
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0].errors[0], /must both be present or both be empty/);
});

test("custody_chains: accepts a retired certificate with its registry named", () => {
  const header = "credit_type,scheme,certificate_ref,double_count_check,retired_at,retirement_registry";
  const good = "saf_bnc,ISCC PLUS,CERT-1,single_claim_confirmed,2026-01-01,ISCC Registry";
  const r = parseCsvUpload("custody_chains", [header, good].join("\n"));
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].data.retirement_registry, "ISCC Registry");
});

// ── indexation_clauses ────────────────────────────────────────────────────────────────────────────────

test("indexation_clauses: accepts the module's own worked example values", () => {
  const header = "index_id,base_value,base_date,passthrough_pct,review_cadence,rounding_rule,cap_pct,floor_pct";
  const row = "cl:instrument:eua-front-dec,80,2026-01-01,70,quarterly,round to nearest cent,20,-10";
  const r = parseCsvUpload("indexation_clauses", [header, row].join("\n"));
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].data.base_value, 80);
});

test("indexation_clauses: rejects an inverted floor/cap band", () => {
  const header = "index_id,base_value,base_date,passthrough_pct,review_cadence,rounding_rule,cap_pct,floor_pct";
  const row = "idx,80,2026-01-01,70,quarterly,round,-10,20"; // floor > cap
  const r = parseCsvUpload("indexation_clauses", [header, row].join("\n"));
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0].errors[0], /floor_pct must be <= cap_pct/);
});

test("every table contract's parseRow is reachable via TABLE_CONTRACTS (no dead entry)", () => {
  for (const key of UPLOAD_TABLES) {
    assert.equal(typeof TABLE_CONTRACTS[key].parseRow, "function", key);
    assert.ok(Array.isArray(TABLE_CONTRACTS[key].requiredHeaders), key);
  }
});

// ── entityRefValuesForTable / validateEntityRefs (upload-route entity-ref existence check) ──────────────

test("entityRefValuesForTable: collects distinct non-empty entity-ref values across a batch", () => {
  const header = "corridor_id,carrier_id,invoice_line,billed_eur,statutory_eur,statutory_basis";
  const rows = [
    header,
    "cl:corridor:a,cl:organisation:x,line1,1,1,basis",
    "cl:corridor:a,cl:organisation:y,line2,1,1,basis", // corridor repeated -> one distinct value
  ].join("\n");
  const { accepted } = parseCsvUpload("surcharge_audits", rows);
  const values = entityRefValuesForTable("surcharge_audits", accepted);
  assert.deepEqual([...values].sort(), ["cl:corridor:a", "cl:organisation:x", "cl:organisation:y"]);
});

test("entityRefValuesForTable: a table with no entityRefs returns an empty set", () => {
  const { accepted } = parseCsvUpload("tce_data_quality", "tce_id,reliability,completeness,temporal_correlation,geographical_correlation,technological_correlation,primary_data_share\nleg-1,1,1,1,1,1,0.5\n");
  assert.equal(entityRefValuesForTable("tce_data_quality", accepted).size, 0);
});

test("validateEntityRefs: rejects a row whose required entity ref does not resolve, keeps a resolving one", () => {
  const header = "corridor_id,carrier_id,invoice_line,billed_eur,statutory_eur,statutory_basis";
  const csv = [
    header,
    "cl:corridor:known,cl:organisation:known,line1,1,1,basis",
    "cl:corridor:unknown,cl:organisation:known,line2,1,1,basis",
  ].join("\n");
  const { accepted } = parseCsvUpload("surcharge_audits", csv);
  const existing = new Set(["cl:corridor:known", "cl:organisation:known"]);
  const { valid, invalid } = validateEntityRefs("surcharge_audits", accepted, existing);
  assert.equal(valid.length, 1);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].rowNumber, 3);
  assert.match(invalid[0].errors[0], /corridor_id "cl:corridor:unknown" does not match any known entity/);
});

test("validateEntityRefs: an optional entity ref left blank is never flagged", () => {
  const header = "load_type,kw_draw,duty_cycle,hours_typical,node_id";
  const csv = [header, "museum_spec_hold,8.5,0.9,72,"].join("\n"); // node_id blank, optional
  const { accepted } = parseCsvUpload("auxiliary_energy_profiles", csv);
  const { valid, invalid } = validateEntityRefs("auxiliary_energy_profiles", accepted, new Set());
  assert.equal(valid.length, 1);
  assert.equal(invalid.length, 0);
});

test("validateEntityRefs: a table with no entityRefs passes every row through unchanged", () => {
  const { accepted } = parseCsvUpload("tce_data_quality", "tce_id,reliability,completeness,temporal_correlation,geographical_correlation,technological_correlation,primary_data_share\nleg-1,1,1,1,1,1,0.5\n");
  const { valid, invalid } = validateEntityRefs("tce_data_quality", accepted, new Set());
  assert.equal(valid.length, 1);
  assert.equal(invalid.length, 0);
});
