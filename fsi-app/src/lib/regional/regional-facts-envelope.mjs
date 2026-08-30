// regional-facts-envelope.mjs — the ONE shared shape for a WO-17 producer row into `regional_data_facts`,
// plus the pure idempotent-upsert planner both producers use.
//
// WHY THIS EXISTS. WO-17 (docs/plans/master-execution-plan-2026-08-17.md, "Operations facts for EU + US:
// envelope-first") requires every producer row to carry the full number envelope migration 267 added
// (src/lib/contracts/provenance-envelope.mjs) — never new hand-typed free text. This module is the single
// place that (a) turns a parsed observation into a full envelope row, (b) formats the legacy `value` TEXT
// NOT NULL column MECHANICALLY from the envelope (never authored prose — see formatDisplayValue), and
// (c) plans an idempotent upsert against `regional_data_facts`'s actual live unique constraint.
//
// LIVE SCHEMA THIS MODULE IS WRITTEN AGAINST (rule 0.15, re-read this session against project
// kwrsbpiseruzbfwjpvsp, 2026-08-30):
//   - `regional_data_facts.value` is TEXT NOT NULL (migration 106) — still true after migration 267; the
//     envelope columns are ADDITIVE, they did not relax this. A producer that writes nothing into `value`
//     violates the NOT NULL constraint, so this module derives it mechanically from value_numeric+unit
//     (formatDisplayValue) rather than leaving it blank or hand-authoring a sentence per row.
//   - The natural key is the LIVE unique constraint `regional_data_facts_region_id_dimension_fact_label_key`
///     = UNIQUE (region_id, dimension, fact_label) — confirmed via
//     `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid =
//     'public.regional_data_facts'::regclass` this session. planUpsert keys on exactly this triple (using
//     region_code as the caller-facing proxy for region_id — callers resolve the id once and pass it
//     through unchanged).
//   - The 11 envelope columns (value_numeric, unit, currency, derivation, origin_class, source_key,
//     source_ref, n_observations, method_version, as_at_date, reference_period) are confirmed live,
//     all nullable, with CHECK constraints on derivation/origin_class matching
//     src/lib/contracts/provenance-envelope.mjs byte-for-byte (same session, same query).
//
// ORIGIN_CLASS FOR THESE PRODUCERS — INFERENCE, not literally covered by the ratified mapping.
// docs/plans/wo19-origin-class-backfill-mapping.md ratifies a mapping for `intelligence_items` ONLY and
// explicitly places `regional_data_facts` OUT OF SCOPE (its §1: "regional_data_facts... are explicitly
// OUT of scope for this document"). There is therefore no ratified origin_class rule for THIS table's
// producers. This module extends that document's own reasoning by direct analogy rather than inventing a
// new rule: its rule table maps item_type='regional_data' + sources.tier T1-T3 (official/regulatory/IGO
// register) -> 'official' ("Official statistical and regulatory bodies... publishing their own regional
// figures"). Eurostat and BLS are exactly that shape — official statistical agencies publishing their own
// primary statistics, unmodified by us beyond structural extraction — which is also the literal definition
// of 'official' in vocabularies.mjs ORIGIN_CLASS ("Primary source, unmodified. The strongest class;
// nothing we do can improve on it."). Both producers therefore stamp origin_class='official'. Flagged here
// as INFERENCE (extension by analogy) so a reader does not mistake it for a literal ratified rule.
//
// DERIVATION — both producers stamp 'observed' (envelope.mjs DERIVATION.observed, order 3): a number the
// source itself measured/tabulated and published, not a value we computed, modelled or estimated.

/** The envelope-relevant fields planUpsert compares for idempotency (does NOT include `id`, timestamps,
 *  or `region_id`/`dimension`/`fact_label`, which are the key, not the payload). */
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
