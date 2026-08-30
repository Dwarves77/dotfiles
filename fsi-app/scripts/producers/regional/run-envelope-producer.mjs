// run-envelope-producer.mjs — the shared orchestration shell for WO-17 regional_data_facts producers.
// Both eurostat-nrg-pc-205-producer.mjs and bls-oews-producer.mjs call this with a source-specific
// `fetchAndParse` callback; everything below (kill switch, --dry/--apply, region resolution, the guarded
// write) is common so it has ONE home rather than being copy-pasted per producer (the two-homes class
// CLAUDE.md and this repo's own contracts modules warn against, applied to script orchestration).
//
// WRITE PATH: this module NEVER calls `.from(table).insert/update` itself. It calls the repo's existing
// rule-015 guarded path — scripts/lib/db.mjs's guardedInsert / guardedUpdate — found by reading db.mjs
// and every other row-mutating script in this repo before writing a line of this file. That path REQUIRES
// a { skill, reason } cite and SNAPSHOTS prior row state before every mutation (reversibility), and its
// own readClient() proxy throws on `.insert/.update/.upsert/.delete` reached through the "read" client —
// there is no way to bypass it from here short of constructing a raw client, which this module does not
// do. Reads (regions, existing regional_data_facts rows) go through db.mjs's readClient()/readAll(),
// which are unguarded (routine) by the same module's own design.
//
// NATURAL KEY: regional_data_facts_region_id_dimension_fact_label_key = UNIQUE (region_id, dimension,
// fact_label) — the LIVE constraint (confirmed via pg_constraint this session, rule 0.15), not assumed.
// The idempotent-upsert PLAN is computed by the pure planUpsert() in
// src/lib/regional/regional-facts-envelope.mjs; this module only resolves region_code -> region_id and
// executes the plan it is handed.

import { readClient, readAll, guardedInsert, guardedUpdate } from "../../../scripts/lib/db.mjs";
import { buildEnvelopeRow, planUpsert } from "../../../src/lib/regional/regional-facts-envelope.mjs";

const ENVELOPE_SELECT =
  "id, region_id, dimension, fact_label, value, value_numeric, unit, currency, derivation, " +
  "origin_class, source_key, source_ref, n_observations, method_version, as_at_date, reference_period";

/**
 * Resolve every needed region code -> live region_id, throwing (never guessing a UUID) if any requested
 * code is absent from the live `regions` table.
 */
async function resolveRegionIds(regionCodes) {
  const rows = await readAll("regions", "id, code");
  const byCode = new Map(rows.map((r) => [r.code, r.id]));
  const missing = regionCodes.filter((c) => !byCode.has(c));
  if (missing.length) {
    throw new Error(`run-envelope-producer: region code(s) not found in live \`regions\` table: ${missing.join(", ")}`);
  }
  return byCode;
}

/** Read every existing regional_data_facts row for one source_key, scoped so a re-run's read stays small
 *  and never touches another producer's rows. Attaches region_code (not just region_id) so planUpsert can
 *  key on it the same way the candidate rows do. */
async function readExistingForSource(sourceKey, regionIdToCode) {
  const sb = readClient();
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("regional_data_facts")
      .select(ENVELOPE_SELECT)
      .eq("source_key", sourceKey)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`run-envelope-producer: existing-row read failed: ${error.message}`);
    for (const r of data ?? []) rows.push({ ...r, region_code: regionIdToCode.get(r.region_id) ?? null });
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/**
 * Turn a parser's OBSERVATIONS into rows the table will actually accept.
 *
 * THE STEP THAT WAS MISSING, and the reason `regional_data_facts` sat at 75 rows / 0 enveloped values
 * through Waves 4-7. Both parsers document their return as "observations shaped for buildEnvelopeRow",
 * and this orchestrator passed them STRAIGHT to planUpsert and guardedInsert — buildEnvelopeRow was
 * written, tested, and never called by anything. `regional_data_facts.value` is TEXT NOT NULL
 * (migration 106; migration 267's envelope columns are additive and did not relax it), and an
 * observation does not carry `value` — only buildEnvelopeRow derives it, mechanically, from
 * value_numeric + unit. So the first live --apply failed at the first row with
 * `null value in column "value" ... violates not-null constraint` (run #2, 2026-08-30).
 *
 * WHY NO TEST CAUGHT IT: the parsers are proved against fixtures, buildEnvelopeRow is proved against a
 * hand-built observation, and planUpsert is proved against buildEnvelopeRow output. Every layer was
 * green in isolation and NOTHING exercised the seam between them, because this orchestrator had no
 * proof at all. run-envelope-producer.test.mjs is now that proof, and it asserts the candidate row
 * carries every NOT-NULL column of the live table rather than merely "has a value field" — the
 * assertion that would have failed red before this change.
 *
 * Kept exported and pure so the seam is testable without a database.
 * @param {Array<object>} observations - parser output
 * @returns {Array<object>} full envelope rows (parser fields + mechanically-derived `value`)
 */
export function toCandidateRows(observations) {
  return (observations ?? []).map(buildEnvelopeRow);
}

/**
 * Reduce candidates to the LATEST observation per natural key, (region_code, dimension, fact_label),
 * which is the live UNIQUE constraint (regional_data_facts_region_id_dimension_fact_label_key,
 * re-read from pg_constraint 2026-08-30).
 *
 * WHY THIS EXISTS. regional_data_facts is a CURRENT-STATE table: one row per fact label, refreshed in
 * place, never a time series. The Eurostat parser honestly emits one observation per (consumption
 * band, semester) present in the payload, and its fact_label carries the band but NOT the semester,
 * so a live payload (283 observations = ~7 bands x ~40 semesters, run #1 2026-08-30) contains ~40
 * candidates per key. planUpsert dedupes candidates against EXISTING rows only, never against each
 * other, so an apply would insert one semester of the first band and then die with 23505
 * unique_violation on the second. Found by reading planUpsert against pg_constraint, before any
 * second live apply was attempted.
 *
 * "Latest" is decided by as_at_date (ISO date, every producer sets it), tie-broken by
 * reference_period string compare, both mechanical, no clock read, fully deterministic for a given
 * payload. Older periods are dropped, not written: history belongs to a series table (market_series
 * is that shape), not to this one.
 * @param {Array<object>} candidates - buildEnvelopeRow() output
 * @returns {Array<object>} at most one candidate per (region_code, dimension, fact_label)
 */
export function latestPerNaturalKey(candidates) {
  const latest = new Map();
  for (const c of candidates ?? []) {
    const key = `${c.region_code}|${c.dimension}|${c.fact_label}`;
    const prev = latest.get(key);
    if (
      !prev ||
      String(c.as_at_date) > String(prev.as_at_date) ||
      (String(c.as_at_date) === String(prev.as_at_date) &&
        String(c.reference_period) > String(prev.reference_period))
    ) {
      latest.set(key, c);
    }
  }
  return [...latest.values()];
}

/**
 * @param {{
 *   producerName: string,
 *   enabled: boolean,
 *   sourceKey: string,
 *   fetchAndParse: () => Promise<object[]>,   // returns OBSERVATIONS (buildEnvelopeRow input), not table rows
 *   cite: {skill: string, reason: string},
 * }} config
 */
export async function runEnvelopeProducer({ producerName, enabled, sourceKey, fetchAndParse, cite }) {
  console.log(`${producerName}: starting (kill switch ${enabled ? "ON" : "OFF"})`);
  if (!enabled) {
    console.log(`${producerName}: DISABLED by kill switch (enabled=false in the producer script) — no-op, exit 0. ` +
      `Flip the constant in a reviewed change to run this producer.`);
    return { ran: false };
  }

  const args = process.argv.slice(2);
  const APPLY = args.includes("--apply");
  const DRY = !APPLY;

  const observations = await fetchAndParse();
  // Observations are NOT table rows: buildEnvelopeRow is what derives the NOT-NULL `value` column from
  // the envelope. Skipping it is what made every --apply fail closed. See toCandidateRows above.
  const allCandidates = toCandidateRows(observations);
  // Current-state table: keep only the latest observation per natural key. See latestPerNaturalKey
  // above for why writing every period would violate the live UNIQUE constraint on the second row.
  const candidates = latestPerNaturalKey(allCandidates);
  console.log(
    `${producerName}: parsed ${allCandidates.length} observation(s) -> ${candidates.length} current-state candidate row(s)` +
      (allCandidates.length !== candidates.length ? ` (${allCandidates.length - candidates.length} superseded period(s) dropped)` : ""),
  );
  if (!candidates.length) {
    console.log(`${producerName}: nothing to write.`);
    return { ran: true, candidates: 0, plan: { toInsert: [], toUpdate: [], unchanged: 0 } };
  }

  const regionCodes = [...new Set(candidates.map((c) => c.region_code))];
  const codeToId = await resolveRegionIds(regionCodes);
  const idToCode = new Map([...codeToId].map(([c, id]) => [id, c]));

  const existing = await readExistingForSource(sourceKey, idToCode);
  const plan = planUpsert(existing, candidates);

  console.log(`${producerName}: plan — insert ${plan.toInsert.length}, update ${plan.toUpdate.length}, unchanged ${plan.unchanged}${DRY ? " (DRY RUN — nothing written)" : ""}`);
  if (plan.toInsert[0]) console.log(`${producerName}: sample insert ->`, JSON.stringify(plan.toInsert[0], null, 2));
  if (plan.toUpdate[0]) console.log(`${producerName}: sample update ->`, JSON.stringify(plan.toUpdate[0], null, 2));

  if (DRY) return { ran: true, candidates: candidates.length, plan };

  let inserted = 0, updated = 0;
  for (const row of plan.toInsert) {
    const region_id = codeToId.get(row.region_code);
    const { region_code, ...rest } = row; // region_code is the caller-facing key; the table stores region_id
    const res = await guardedInsert("regional_data_facts", { ...rest, region_id }, { cite });
    if (res.inserted) inserted++;
  }
  for (const { id, patch } of plan.toUpdate) {
    const res = await guardedUpdate("regional_data_facts", (qb) => qb.eq("id", id), patch, { cite });
    updated += res.updated;
  }
  console.log(`${producerName}: wrote ${inserted} insert(s), ${updated} update(s).`);
  return { ran: true, candidates: candidates.length, plan, inserted, updated };
}
