export const ENVELOPE_PAYLOAD_KEYS = Object.freeze([
  "value",
  "value_numeric",
  "unit",
  "currency",
  "derivation",
  "origin_class",
  "source_key",
  "source_ref",
  "n_observations",
  "method_version",
  "as_at_date",
  "reference_period",
]);

/**
 * Mechanically format the legacy `value` TEXT NOT NULL column from the envelope's own numeric fields.
 * NEVER hand-authored prose: a pure function of (value_numeric, unit), so two runs over the same source
 * data always produce byte-identical text and no per-row wording judgment is ever made.
 * @param {number} valueNumeric
 * @param {string} unit
 * @returns {string}
 */
export function formatDisplayValue(valueNumeric, unit) {
  if (typeof valueNumeric !== "number" || !Number.isFinite(valueNumeric)) {
    throw new Error(`formatDisplayValue: value_numeric must be a finite number, got ${JSON.stringify(valueNumeric)}`);
  }
  if (typeof unit !== "string" || !unit) {
    throw new Error("formatDisplayValue: unit is required (value_numeric with no unit is a malformed envelope, per migration 267's own column comment).");
  }
  return `${valueNumeric} ${unit}`;
}

/**
 * Build one full envelope row for `regional_data_facts` from a producer's parsed observation. Throws on
 * any missing required field rather than silently writing a partial envelope — the WO-17 contract is
 * "every row carries value_numeric, unit, derivation, origin_class, source_key, source_ref,
 * method_version, as_at_date, reference_period", not "most rows".
 * @param {{
 *   region_code: string, dimension: string, fact_label: string,
 *   value_numeric: number, unit: string, currency?: string|null,
 *   derivation: string, origin_class: string,
 *   source_key: string, source_ref: string, method_version: string,
 *   as_at_date: string, reference_period: string, n_observations?: number|null,
 * }} obs
 */
export function buildEnvelopeRow(obs) {
  const required = [
    "region_code", "dimension", "fact_label", "value_numeric", "unit",
    "derivation", "origin_class", "source_key", "source_ref", "method_version",
    "as_at_date", "reference_period",
  ];
  for (const k of required) {
    if (obs?.[k] === undefined || obs?.[k] === null || obs?.[k] === "") {
      throw new Error(`buildEnvelopeRow: missing required field "${k}" (obs: ${JSON.stringify(obs)})`);
    }
  }
  return {
    region_code: obs.region_code,
    dimension: obs.dimension,
    fact_label: obs.fact_label,
    value: formatDisplayValue(obs.value_numeric, obs.unit),
    value_numeric: obs.value_numeric,
    unit: obs.unit,
    currency: obs.currency ?? null,
    derivation: obs.derivation,
    origin_class: obs.origin_class,
    source_key: obs.source_key,
    source_ref: obs.source_ref,
    n_observations: obs.n_observations ?? null,
    method_version: obs.method_version,
    as_at_date: obs.as_at_date,
    reference_period: obs.reference_period,
  };
}

const natKey = (r) => `${r.region_code}|${r.dimension}|${r.fact_label}`;

function payloadEqual(a, b) {
  for (const k of ENVELOPE_PAYLOAD_KEYS) {
    const av = a[k] ?? null;
    const bv = b[k] ?? null;
    // n_observations/value_numeric may arrive as numeric-string from Postgres; compare loosely by
    // string form so a round-tripped "0.2153" vs 0.2153 is never reported as a spurious diff.
    if (String(av) !== String(bv)) return false;
  }
  return true;
}

/**
 * Pure idempotent-upsert planner. Keys on the LIVE unique constraint (region_code, dimension,
 * fact_label) standing in for (region_id, dimension, fact_label) — the caller resolves region_code to
 * region_id once and applies it to whichever rows this returns. A re-run over identical source data
 * produces an EMPTY plan (both toInsert and toUpdate), which is the idempotency proof this function is
 * unit-tested against.
 * @param {Array<object>} existingRows - rows already in regional_data_facts, shaped like buildEnvelopeRow's
 *   output plus an `id`.
 * @param {Array<object>} candidateRows - buildEnvelopeRow() output for every observation this run parsed.
 * @returns {{toInsert: object[], toUpdate: Array<{id: string, patch: object}>, unchanged: number}}
 */
export function planUpsert(existingRows, candidateRows) {
  const byKey = new Map();
  for (const row of existingRows ?? []) {
    if (!row) continue;
    byKey.set(natKey(row), row);
  }
  const toInsert = [];
  const toUpdate = [];
  let unchanged = 0;
  for (const cand of candidateRows ?? []) {
    const existing = byKey.get(natKey(cand));
    if (!existing) {
      toInsert.push(cand);
      continue;
    }
    if (payloadEqual(existing, cand)) {
      unchanged++;
      continue;
    }
    const patch = {};
    for (const k of ENVELOPE_PAYLOAD_KEYS) patch[k] = cand[k] ?? null;
    toUpdate.push({ id: existing.id, patch });
  }
  return { toInsert, toUpdate, unchanged };
}
