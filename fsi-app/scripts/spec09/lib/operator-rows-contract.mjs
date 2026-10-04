// operator-rows-contract.mjs - the column contract for OPERATOR-SUPPLIED EXTERNAL PUBLIC-SOURCE rows
// for the two kept spec-09 tables (auxiliary_energy_profiles, indexation_clauses). Never customer data
// (ADR-042, operator ruling 2026-10-03): the app has no upload route and no customer intake. An operator
// dispatches a rows file through scripts/spec09/*-producer.mjs (--csv), the ADR-023 ingest path.
// Moved from the former spec09 upload contract, trimmed to exactly the two kept tables; the four
// customer-only tables (surcharge_audits, tce_data_quality, eudr_plot_claims, custody_chains) were removed.
//
// org_id is NEVER a CSV column: the caller supplies it (deps.orgId) and it is stamped on every row.
//
// Pure functions; no I/O, no fs, no DB, no network (F34).
import { splitCsvText } from "../../../src/lib/csv/split.mjs";

const MAX_BYTES_PER_FILE = 262_144; // 256 KiB
const MAX_ROWS_PER_FILE = 500;

export { MAX_BYTES_PER_FILE, MAX_ROWS_PER_FILE };

// Field validators: small, composable, each returns { value } or { error }.

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

function reqEnum(v, label, allowed) {
  const s = (v ?? "").trim();
  if (!s) return { error: `${label} is required (one of: ${allowed.join(", ")})` };
  if (!allowed.includes(s)) return { error: `${label} must be one of: ${allowed.join(", ")} (got ${JSON.stringify(s)})` };
  return { value: s };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function reqDate(v, label) {
  const s = (v ?? "").trim();
  if (!s) return { error: `${label} is required (YYYY-MM-DD)` };
  if (!ISO_DATE_RE.test(s) || Number.isNaN(Date.parse(s))) return { error: `${label} must be a valid YYYY-MM-DD date (got ${JSON.stringify(s)})` };
  return { value: s };
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

// Per-table contracts. Each entry: { requiredHeaders, optionalHeaders, entityRefs, parseRow(cells, idx) }.
// parseRow returns { data, errors }; data is null when errors is non-empty and never carries org_id.
export const TABLE_CONTRACTS = Object.freeze({
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

  indexation_clauses: {
    label: "Indexation clauses (Market Intel)",
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

export const OPERATOR_ROW_TABLES = Object.freeze(Object.keys(TABLE_CONTRACTS));

/** Every distinct, non-empty entity-ref value an accepted batch references, for a table's own
 *  entityRefs list, the caller (the producer) queries `entities` for exactly this set once per
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
 * same rule), the point is a per-row rejection in the SAME result as every other validation
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
 * Parse a whole operator-supplied CSV rows file for one table against its contract. Never throws on bad row data (a bad row
 * is a rejection in the result, not an exception), only size/shape problems the caller cannot recover
 * from (unknown table, oversized payload, missing required header) produce `ok:false`.
 *
 * @returns {{
 *   ok: boolean, error?: string,
 *   accepted: Array<{ rowNumber: number, data: object }>,
 *   rejected: Array<{ rowNumber: number, raw: string[], errors: string[] }>,
 *   total: number,
 * }}
 */
export function parseOperatorRows(tableKey, csvText, { maxRows = MAX_ROWS_PER_FILE, maxBytes = MAX_BYTES_PER_FILE } = {}) {
  const contract = TABLE_CONTRACTS[tableKey];
  if (!contract) {
    return { ok: false, error: `unknown table "${tableKey}", must be one of: ${OPERATOR_ROW_TABLES.join(", ")}`, accepted: [], rejected: [], total: 0 };
  }
  const byteLength = Buffer.byteLength(String(csvText ?? ""), "utf8");
  if (byteLength > maxBytes) {
    return { ok: false, error: `rows file is ${byteLength} bytes, exceeding the ${maxBytes}-byte cap`, accepted: [], rejected: [], total: 0 };
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
