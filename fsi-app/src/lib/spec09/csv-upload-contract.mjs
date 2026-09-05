// csv-upload-contract.mjs — the ONE shared column contract for the spec-09 customer-data CSV upload
// flow (plan §W5.1, wiring-audit-2026-09-04 B2 gap: "9 of 10 spec09 tables ship 0 rows... every one of
// them is either fed by data a CUSTOMER supplies... that this product has no upload flow for yet").
//
// THIS IS THE "one shared column contract the producers already define" the lane brief names — except
// the producers never actually defined one (they shipped 0 rows and named the gap, see SOURCES.md); this
// module is that contract, built from each table's own migration DDL (296/297/298) and each table's own
// calculator in this directory (surcharge-audit.mjs / dqi.mjs / auxiliary-energy.mjs / eudr-custody.mjs /
// indexation.mjs). TWO callers import it and neither re-implements row parsing: the workspace upload
// route (src/app/api/workspace/spec09-upload/route.ts) and each CLI producer
// (scripts/spec09/*-producer.mjs, via --csv) — "one body" per the lane brief.
//
// SCOPE (six tables, all genuinely customer-supplied data per SOURCES.md's own reasoning):
//   surcharge_audits            — the customer's own carrier invoice line (spec 09 §1.2's worked example)
//   tce_data_quality            — a shipment's own primary evidence (carrier telemetry, fuel receipts)
//   auxiliary_energy_profiles   — a customer's own reefer/hold/warehouse equipment
//   eudr_plot_claims            — a customer's own consignment geo-traceability filing
//   custody_chains              — a customer's own SAF/methanol/biodiesel/ETS certificate
//   indexation_clauses          — a customer's own contract clause terms (SOURCES.md: "genuinely
//                                 customer-entry-only") — NOT in the plan's five-table "customer data"
//                                 list verbatim, but the SAME shape (customer-supplied, no bulk source
//                                 by construction) and grouped in the workstream text only because it
//                                 shares the "no reader today" problem with carrier_compliance_pools.
//                                 Folded into this upload flow rather than left an eternally-empty
//                                 reader — see docs/ops/session-log.md addendum for this lane's reasoning.
//
// NOT in scope: carrier_compliance_pools (dropped this lane, migration — no customer-entry shape exists;
// it is an INFERRED pool position from public THETIS-MRV data, never customer-supplied) and the three
// tables owned by a different W5.1 sub-thread (oem_tech_roadmaps, reroute_events,
// grid_connection_queues — deterministic-parser or entity-spine tables, not customer CSV).
//
// org_id is NEVER a CSV column for any table — the caller resolves it server-side from the
// authenticated session (never trusts a client-supplied org id, lane-common-contract + CLAUDE.md).
//
// Pure functions; no I/O, no fs, no DB, no network (F34 — safe to import from a Next.js route AND a
// plain Node script alike).

const MAX_BYTES_PER_UPLOAD = 262_144; // 256 KiB — customer CSVs here are invoice lines/clauses/profiles, never bulk corpora
const MAX_ROWS_PER_UPLOAD = 500;

export { MAX_BYTES_PER_UPLOAD, MAX_ROWS_PER_UPLOAD };

// ── Generic CSV line parsing (RFC4180-ish: quoted fields, escaped quotes, commas) ──────────────────────
// One implementation, used by every table's parser below. Deliberately NOT shared with
// src/app/api/admin/sources/bulk-import/route.ts's own private splitCsvLine — that route predates this
// contract and is outside this lane's write set; duplicating a 20-line parser once, at a real module
// boundary that already exists in a different route family, is not the "copy of logic" rule 21 forbids
// (that rule is about copies WITHIN a lane's own write set having two homes — this module's own two
// callers, the upload route and the CLI producers, share exactly one copy).
export function splitCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

/** Split CSV text into a header row + data rows (array of raw string arrays). Strips BOM and
 *  normalises CRLF. Blank lines are skipped (never counted as a row, matching the admin bulk-import
 *  route's own convention). */
export function splitCsvText(raw) {
  const text = String(raw ?? "").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1)
    .map((l) => splitCsvLine(l))
    .filter((cells) => !cells.every((c) => c.trim() === ""));
  return { header, rows };
}

// ── Field validators — small, composable, each returns null (ok) or an error string ─────────────────────

function reqString(v, label) {
  const s = (v ?? "").trim();
  if (!s) return { error: `${label} is required` };
  return { value: s };
}

function optString(v) {
  const s = (v ?? "").trim();
  return { value: s ? s : null };
}

function reqNumber(v, label, { min = -Infinity, max = Infinity } = {}) {
  const s = (v ?? "").trim();
  if (!s) return { error: `${label} is required` };
  const n = Number(s);
  if (!Number.isFinite(n)) return { error: `${label} must be a number (got ${JSON.stringify(s)})` };
  if (n < min || n > max) return { error: `${label} must be between ${min} and ${max} (got ${n})` };
  return { value: n };
}

function optNumber(v, label, { min = -Infinity, max = Infinity } = {}) {
  const s = (v ?? "").trim();
  if (!s) return { value: null };
  const n = Number(s);
  if (!Number.isFinite(n)) return { error: `${label} must be a number when present (got ${JSON.stringify(s)})` };
  if (n < min || n > max) return { error: `${label} must be between ${min} and ${max} (got ${n})` };
  return { value: n };
}

function reqInt(v, label, { min = -Infinity, max = Infinity } = {}) {
  const r = reqNumber(v, label, { min, max });
  if (r.error) return r;
  if (!Number.isInteger(r.value)) return { error: `${label} must be a whole number (got ${r.value})` };
  return r;
}

function reqEnum(v, label, allowed) {
  const s = (v ?? "").trim();
  if (!s) return { error: `${label} is required (one of: ${allowed.join(", ")})` };
  if (!allowed.includes(s)) return { error: `${label} must be one of: ${allowed.join(", ")} (got ${JSON.stringify(s)})` };
  return { value: s };
}

function optEnum(v, label, allowed) {
  const s = (v ?? "").trim();
  if (!s) return { value: null };
  if (!allowed.includes(s)) return { error: `${label} must be one of: ${allowed.join(", ")} when present (got ${JSON.stringify(s)})` };
  return { value: s };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function reqDate(v, label) {
  const s = (v ?? "").trim();
  if (!s) return { error: `${label} is required (YYYY-MM-DD)` };
  if (!ISO_DATE_RE.test(s) || Number.isNaN(Date.parse(s))) return { error: `${label} must be a valid YYYY-MM-DD date (got ${JSON.stringify(s)})` };
  return { value: s };
}
function optDate(v, label) {
  const s = (v ?? "").trim();
  if (!s) return { value: null };
  if (!ISO_DATE_RE.test(s) || Number.isNaN(Date.parse(s))) return { error: `${label} must be a valid YYYY-MM-DD date when present (got ${JSON.stringify(s)})` };
  return { value: s };
}

function optJson(v, label) {
  const s = (v ?? "").trim();
  if (!s) return { value: null };
  try {
    return { value: JSON.parse(s) };
  } catch (e) {
    return { error: `${label} must be valid JSON when present (${e instanceof Error ? e.message : String(e)})` };
  }
}

/** Build a `{ header -> index }` map for the given headers, case-insensitive (splitCsvText already
 *  lower-cases the header row). */
function headerIndex(header) {
  const idx = new Map();
  header.forEach((h, i) => idx.set(h, i));
  return idx;
}

function cell(cells, idx, name) {
  const i = idx.get(name);
  return i === undefined ? "" : (cells[i] ?? "");
}

// ── Per-table contracts ──────────────────────────────────────────────────────────────────────────────
// Each entry: { requiredHeaders, optionalHeaders, entityRefs: [{ field, kind }], parseRow(cells, idx) }.
// parseRow returns { data, errors } — data is null when errors is non-empty. `data` never carries org_id
// (server-injected by the caller) and never carries a column the DB itself GENERATES
// (surcharge_audits.variance_eur) or DEFAULTs safely (origin_class, statutory_derivation, created_at).

export const TABLE_CONTRACTS = Object.freeze({
  surcharge_audits: {
    label: "Surcharge audits (Market)",
    requiredHeaders: ["corridor_id", "carrier_id", "invoice_line", "billed_eur", "statutory_eur", "statutory_basis"],
    optionalHeaders: ["statutory_derivation"],
    entityRefs: [
      { field: "corridor_id", kind: "corridor" },
      { field: "carrier_id", kind: "organisation" },
    ],
    parseRow(cells, idx) {
      const errors = [];
      const corridor_id = reqString(cell(cells, idx, "corridor_id"), "corridor_id");
      const carrier_id = reqString(cell(cells, idx, "carrier_id"), "carrier_id");
      const invoice_line = reqString(cell(cells, idx, "invoice_line"), "invoice_line");
      const billed_eur = reqNumber(cell(cells, idx, "billed_eur"), "billed_eur", { min: 0 });
      const statutory_eur = reqNumber(cell(cells, idx, "statutory_eur"), "statutory_eur", { min: 0 });
      const statutory_basis = reqString(cell(cells, idx, "statutory_basis"), "statutory_basis");
      const statutory_derivation = optEnum(cell(cells, idx, "statutory_derivation"), "statutory_derivation", ["statutory_fixed", "statutory_formula"]);
      for (const r of [corridor_id, carrier_id, invoice_line, billed_eur, statutory_eur, statutory_basis, statutory_derivation]) {
        if (r.error) errors.push(r.error);
      }
      if (errors.length) return { data: null, errors };
      return {
        errors: [],
        data: {
          corridor_id: corridor_id.value,
          carrier_id: carrier_id.value,
          invoice_line: invoice_line.value,
          billed_eur: billed_eur.value,
          statutory_eur: statutory_eur.value,
          statutory_basis: statutory_basis.value,
          statutory_derivation: statutory_derivation.value ?? "statutory_formula",
        },
      };
    },
  },

  tce_data_quality: {
    label: "DQI / data quality (Operations)",
    requiredHeaders: ["tce_id", "reliability", "completeness", "temporal_correlation", "geographical_correlation", "technological_correlation", "primary_data_share"],
    optionalHeaders: ["primary_evidence"],
    entityRefs: [],
    parseRow(cells, idx) {
      const errors = [];
      const tce_id = reqString(cell(cells, idx, "tce_id"), "tce_id");
      const reliability = reqInt(cell(cells, idx, "reliability"), "reliability", { min: 1, max: 5 });
      const completeness = reqInt(cell(cells, idx, "completeness"), "completeness", { min: 1, max: 5 });
      const temporal_correlation = reqInt(cell(cells, idx, "temporal_correlation"), "temporal_correlation", { min: 1, max: 5 });
      const geographical_correlation = reqInt(cell(cells, idx, "geographical_correlation"), "geographical_correlation", { min: 1, max: 5 });
      const technological_correlation = reqInt(cell(cells, idx, "technological_correlation"), "technological_correlation", { min: 1, max: 5 });
      const primary_data_share = reqNumber(cell(cells, idx, "primary_data_share"), "primary_data_share", { min: 0, max: 1 });
      const primary_evidence = optString(cell(cells, idx, "primary_evidence"));
      for (const r of [tce_id, reliability, completeness, temporal_correlation, geographical_correlation, technological_correlation, primary_data_share]) {
        if (r.error) errors.push(r.error);
      }
      if (errors.length) return { data: null, errors };
      return {
        errors: [],
        data: {
          tce_id: tce_id.value,
          reliability: reliability.value,
          completeness: completeness.value,
          temporal_correlation: temporal_correlation.value,
          geographical_correlation: geographical_correlation.value,
          technological_correlation: technological_correlation.value,
          primary_data_share: primary_data_share.value,
          primary_evidence: primary_evidence.value,
        },
      };
    },
  },

  auxiliary_energy_profiles: {
    label: "Auxiliary energy profiles (Operations)",
    requiredHeaders: ["load_type", "kw_draw", "duty_cycle", "hours_typical"],
    optionalHeaders: ["node_id", "setpoint_c", "setpoint_rh_pct", "grid_intensity_source"],
    entityRefs: [{ field: "node_id", kind: "node", optional: true }],
    parseRow(cells, idx) {
      const errors = [];
      const load_type = reqEnum(cell(cells, idx, "load_type"), "load_type", [
        "reefer_genset", "airport_climate_hold", "warehouse_hvac", "museum_spec_hold", "battery_conditioning", "dehumidification",
      ]);
      const kw_draw = reqNumber(cell(cells, idx, "kw_draw"), "kw_draw", { min: 0 });
      const duty_cycle = reqNumber(cell(cells, idx, "duty_cycle"), "duty_cycle", { min: 0, max: 1 });
      const hours_typical = reqNumber(cell(cells, idx, "hours_typical"), "hours_typical", { min: 0 });
      const node_id = optString(cell(cells, idx, "node_id"));
      const setpoint_c = optNumber(cell(cells, idx, "setpoint_c"), "setpoint_c");
      const setpoint_rh_pct = optNumber(cell(cells, idx, "setpoint_rh_pct"), "setpoint_rh_pct", { min: 0, max: 100 });
      const grid_intensity_source = optString(cell(cells, idx, "grid_intensity_source"));
      for (const r of [load_type, kw_draw, duty_cycle, hours_typical, setpoint_c, setpoint_rh_pct]) {
        if (r.error) errors.push(r.error);
      }
      if (errors.length) return { data: null, errors };
      return {
        errors: [],
        data: {
          load_type: load_type.value,
          kw_draw: kw_draw.value,
          duty_cycle: duty_cycle.value,
          hours_typical: hours_typical.value,
          node_id: node_id.value,
          setpoint_c: setpoint_c.value,
          setpoint_rh_pct: setpoint_rh_pct.value,
          grid_intensity_source: grid_intensity_source.value,
        },
      };
    },
  },

  eudr_plot_claims: {
    label: "EUDR plot claims (Regulations)",
    requiredHeaders: ["consignment_ref", "validation_state"],
    optionalHeaders: ["geometry_json", "area_ha", "hold_risk", "dds_reference"],
    entityRefs: [],
    parseRow(cells, idx) {
      const errors = [];
      const consignment_ref = reqString(cell(cells, idx, "consignment_ref"), "consignment_ref");
      const validation_state = reqEnum(cell(cells, idx, "validation_state"), "validation_state", ["missing", "malformed", "valid", "fails_cutoff"]);
      const geometry_json = optJson(cell(cells, idx, "geometry_json"), "geometry_json");
      const area_ha = optNumber(cell(cells, idx, "area_ha"), "area_ha", { min: 0 });
      const hold_risk = optEnum(cell(cells, idx, "hold_risk"), "hold_risk", ["none", "documentary", "border_hold"]);
      const dds_reference = optString(cell(cells, idx, "dds_reference"));
      for (const r of [consignment_ref, validation_state, geometry_json, area_ha, hold_risk]) {
        if (r.error) errors.push(r.error);
      }
      if (errors.length) return { data: null, errors };
      return {
        errors: [],
        data: {
          consignment_ref: consignment_ref.value,
          validation_state: validation_state.value,
          geometry_json: geometry_json.value,
          area_ha: area_ha.value,
          // hold_risk defaults from validation_state via eudr-custody.mjs's own write-time-default
          // helper when the customer's CSV does not state one — never recomputed at read time
          // (spec 09 §2.1 "materialise it"), only here, once, at write time.
          hold_risk: hold_risk.value ?? null, // caller (route/producer) fills the default; see that module
          dds_reference: dds_reference.value,
        },
      };
    },
  },

  custody_chains: {
    label: "Custody chains (Regulations)",
    requiredHeaders: ["credit_type", "scheme", "certificate_ref", "double_count_check"],
    optionalHeaders: ["retired_at", "retirement_registry", "claimant_id"],
    entityRefs: [{ field: "claimant_id", kind: "organisation", optional: true }],
    parseRow(cells, idx) {
      const errors = [];
      const credit_type = reqEnum(cell(cells, idx, "credit_type"), "credit_type", ["saf_bnc", "green_methanol", "biodiesel_bnc", "ets_allowance"]);
      const scheme = reqString(cell(cells, idx, "scheme"), "scheme");
      const certificate_ref = reqString(cell(cells, idx, "certificate_ref"), "certificate_ref");
      const double_count_check = reqEnum(cell(cells, idx, "double_count_check"), "double_count_check", ["unverified", "single_claim_confirmed", "conflict_detected"]);
      const retired_at = optDate(cell(cells, idx, "retired_at"), "retired_at");
      const retirement_registry = optString(cell(cells, idx, "retirement_registry"));
      const claimant_id = optString(cell(cells, idx, "claimant_id"));
      for (const r of [credit_type, scheme, certificate_ref, double_count_check, retired_at]) {
        if (r.error) errors.push(r.error);
      }
      // Mirrors migration 298's own CHECK (custody_chains_retirement_needs_registry): a retirement date
      // with no registry (or vice versa) is an unverifiable claim — reject the row here rather than let
      // the DB do it, so the customer gets the reason in the SAME upload response.
      if (!errors.length) {
        const hasDate = retired_at.value !== null;
        const hasRegistry = retirement_registry.value !== null;
        if (hasDate !== hasRegistry) {
          errors.push("retired_at and retirement_registry must both be present or both be empty (an unverifiable retirement is not accepted)");
        }
      }
      if (errors.length) return { data: null, errors };
      return {
        errors: [],
        data: {
          credit_type: credit_type.value,
          scheme: scheme.value,
          certificate_ref: certificate_ref.value,
          double_count_check: double_count_check.value,
          retired_at: retired_at.value,
          retirement_registry: retirement_registry.value,
          claimant_id: claimant_id.value,
        },
      };
    },
  },

  indexation_clauses: {
    label: "Indexation clauses (Market)",
    requiredHeaders: ["index_id", "base_value", "base_date", "passthrough_pct", "review_cadence", "rounding_rule"],
    optionalHeaders: ["contract_ref", "corridor_id", "cap_pct", "floor_pct"],
    entityRefs: [
      { field: "index_id", kind: "instrument" },
      { field: "corridor_id", kind: "corridor", optional: true },
    ],
    parseRow(cells, idx) {
      const errors = [];
      const index_id = reqString(cell(cells, idx, "index_id"), "index_id");
      const base_value = reqNumber(cell(cells, idx, "base_value"), "base_value");
      const base_date = reqDate(cell(cells, idx, "base_date"), "base_date");
      const passthrough_pct = reqNumber(cell(cells, idx, "passthrough_pct"), "passthrough_pct", { min: 0, max: 100 });
      const review_cadence = reqEnum(cell(cells, idx, "review_cadence"), "review_cadence", ["monthly", "quarterly", "semiannual"]);
      const rounding_rule = reqString(cell(cells, idx, "rounding_rule"), "rounding_rule");
      const contract_ref = optString(cell(cells, idx, "contract_ref"));
      const corridor_id = optString(cell(cells, idx, "corridor_id"));
      const cap_pct = optNumber(cell(cells, idx, "cap_pct"), "cap_pct");
      const floor_pct = optNumber(cell(cells, idx, "floor_pct"), "floor_pct");
      for (const r of [index_id, base_value, base_date, passthrough_pct, review_cadence, rounding_rule, cap_pct, floor_pct]) {
        if (r.error) errors.push(r.error);
      }
      if (!errors.length && cap_pct.value !== null && floor_pct.value !== null && floor_pct.value > cap_pct.value) {
        errors.push("floor_pct must be <= cap_pct (an inverted band cannot be applied)");
      }
      if (errors.length) return { data: null, errors };
      return {
        errors: [],
        data: {
          index_id: index_id.value,
          base_value: base_value.value,
          base_date: base_date.value,
          passthrough_pct: passthrough_pct.value,
          review_cadence: review_cadence.value,
          rounding_rule: rounding_rule.value,
          contract_ref: contract_ref.value,
          corridor_id: corridor_id.value,
          cap_pct: cap_pct.value,
          floor_pct: floor_pct.value,
        },
      };
    },
  },
});

export const UPLOAD_TABLES = Object.freeze(Object.keys(TABLE_CONTRACTS));

/** Every distinct, non-empty entity-ref value an accepted batch references, for a table's own
 *  entityRefs list — the caller (the upload route) queries `entities` for exactly this set once per
 *  batch, rather than once per row. Pure; no I/O here. */
export function entityRefValuesForTable(tableKey, accepted) {
  const refs = TABLE_CONTRACTS[tableKey]?.entityRefs ?? [];
  const values = new Set();
  for (const { data } of accepted) {
    for (const ref of refs) {
      const v = data[ref.field];
      if (v !== null && v !== undefined && v !== "") values.add(v);
    }
  }
  return values;
}

/**
 * Split already-contract-accepted rows into those whose entity-ref columns all resolve against
 * `existingEntityIds` (a Set the caller fetched from `public.entities`) and those that don't. This is an
 * EARLIER, friendlier check than the DB's own FK constraint (migrations 296/297/298 already enforce the
 * same rule) — the point is a per-row rejection in the SAME upload response as every other validation
 * failure, not an opaque batch-insert 500 partway through. A field marked `optional` in the table's own
 * entityRefs list is only checked when the row actually supplies a value.
 *
 * @returns {{ valid: Array<{rowNumber:number, data:object}>, invalid: Array<{rowNumber:number, errors:string[]}> }}
 */
export function validateEntityRefs(tableKey, accepted, existingEntityIds) {
  const refs = TABLE_CONTRACTS[tableKey]?.entityRefs ?? [];
  if (refs.length === 0) return { valid: accepted, invalid: [] };
  const valid = [];
  const invalid = [];
  for (const row of accepted) {
    const errors = [];
    for (const ref of refs) {
      const v = row.data[ref.field];
      if (v === null || v === undefined || v === "") continue; // required-but-blank is already a parseRow rejection
      if (!existingEntityIds.has(v)) {
        errors.push(`${ref.field} "${v}" does not match any known entity (kind expected: ${ref.kind})`);
      }
    }
    if (errors.length) invalid.push({ rowNumber: row.rowNumber, errors });
    else valid.push(row);
  }
  return { valid, invalid };
}

/**
 * Parse a whole CSV upload for one table against its contract. Never throws on bad row data (a bad row
 * is a rejection in the result, not an exception) — only size/shape problems the caller cannot recover
 * from (unknown table, oversized payload, missing required header) produce `ok:false`.
 *
 * @returns {{
 *   ok: boolean, error?: string,
 *   accepted: Array<{ rowNumber: number, data: object }>,
 *   rejected: Array<{ rowNumber: number, raw: string[], errors: string[] }>,
 *   total: number,
 * }}
 */
export function parseCsvUpload(tableKey, csvText, { maxRows = MAX_ROWS_PER_UPLOAD, maxBytes = MAX_BYTES_PER_UPLOAD } = {}) {
  const contract = TABLE_CONTRACTS[tableKey];
  if (!contract) {
    return { ok: false, error: `unknown table "${tableKey}" — must be one of: ${UPLOAD_TABLES.join(", ")}`, accepted: [], rejected: [], total: 0 };
  }
  const byteLength = Buffer.byteLength(String(csvText ?? ""), "utf8");
  if (byteLength > maxBytes) {
    return { ok: false, error: `upload is ${byteLength} bytes, exceeding the ${maxBytes}-byte cap`, accepted: [], rejected: [], total: 0 };
  }
  const { header, rows } = splitCsvText(csvText);
  if (rows.length === 0) {
    return { ok: false, error: "CSV has no data rows", accepted: [], rejected: [], total: 0 };
  }
  if (rows.length > maxRows) {
    return { ok: false, error: `CSV has ${rows.length} data rows, exceeding the ${maxRows}-row cap`, accepted: [], rejected: [], total: rows.length };
  }
  const missingHeaders = contract.requiredHeaders.filter((h) => !header.includes(h));
  if (missingHeaders.length) {
    return { ok: false, error: `CSV header missing required column(s): ${missingHeaders.join(", ")}`, accepted: [], rejected: [], total: rows.length };
  }
  const idx = headerIndex(header);
  const accepted = [];
  const rejected = [];
  rows.forEach((cells, i) => {
    const rowNumber = i + 2; // header is row 1, data rows are 1-indexed after it (matches a spreadsheet's own row numbers)
    const { data, errors } = contract.parseRow(cells, idx);
    if (errors.length || !data) {
      rejected.push({ rowNumber, raw: cells, errors });
    } else {
      accepted.push({ rowNumber, data });
    }
  });
  return { ok: true, accepted, rejected, total: rows.length };
}
