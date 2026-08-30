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
import { planUpsert } from "../../../src/lib/regional/regional-facts-envelope.mjs";

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
 * @param {{
 *   producerName: string,
 *   enabled: boolean,
 *   sourceKey: string,
 *   fetchAndParse: () => Promise<object[]>,   // returns buildEnvelopeRow()-shaped candidate rows
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

  const candidates = await fetchAndParse();
  console.log(`${producerName}: parsed ${candidates.length} candidate row(s) from the source.`);
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
