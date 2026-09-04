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
import { authorEdges } from "../../../src/lib/propagation/author-edges.mjs";
import { isHourlyWageUnit } from "../../../src/lib/operations/automate-vs-hire.mjs";
import {
  METHOD_ID as AUTOMATE_METHOD_ID,
  METHOD_VERSION as AUTOMATE_METHOD_VERSION,
} from "../../../src/lib/propagation/methods/automate-vs-hire.ts";
// resolveRegionEntityId is seed-derived-values.mjs's OWN on-demand jurisdiction-entity mint (entity_refs
// role='jurisdiction', minting through backfill-entities.mjs's exported planning functions when absent) —
// reused directly rather than a second entity-minting implementation. Safe to import: that module's own
// `if (IS_MAIN) await main();` guard means importing its named exports runs no top-level side effect.
import { resolveRegionEntityId } from "../../propagation/seed-derived-values.mjs";

// Cite for the on-demand jurisdiction-entity mint this module's own DAG-authorship hook can trigger via
// resolveRegionEntityId (see that function's own header — it accepts an injectable cite so a caller other
// than seed-derived-values.mjs records accurate provenance rather than borrowing that lane's own cite).
const REGION_ENTITY_CITE = {
  skill: "remediation-discipline",
  reason:
    "Lane DAG-AUTHOR (2026-09-04): mint a jurisdiction entity + entity_refs row for a region a regional_data_facts " +
    "producer just completed the automate_vs_hire wage+energy pair for, the SAME shape seed-derived-values.mjs's " +
    "own resolveRegionEntityId already mints (reused directly, never re-implemented) — this is DAG authorship at " +
    "producer write time (docs/audits/wiring-audit-2026-09-04/C1-loop-map.md §3), not a new mint path.",
};

/**
 * DAG AUTHORSHIP AT WRITE TIME for automate_vs_hire (C1-loop-map.md §3: "new producer/mint data ->
 * derivation_edges | NOBODY does this today"). Called once per producer run, over every DISTINCT region
 * this run's write touched — NOT only the dimension this specific producer writes, because the pair
 * (labor_markets + operational_cost) may complete on EITHER producer's run (eurostat-lc-lci-lev/bls-oews
 * write labor_markets; eurostat-nrg-pc-205 writes operational_cost) and author-edges.mjs's own natural-key
 * idempotency check makes a redundant call across producers cheap and safe (skipped-already-authored).
 * Re-reads the region's CURRENT regional_data_facts rows (not this run's own candidates) because the
 * completing fact may have been written by a DIFFERENT producer's earlier run. Non-fatal: every outcome is
 * counted, never thrown — this producer's own primary write has already committed by the time this runs.
 * DRY mode is a true no-op (mirrors seed-derived-values.mjs's own dry/apply posture): no read, no entity
 * mint, no author-edges call.
 * @param {Iterable<string>} regionIds
 * @param {"dry"|"apply"} mode
 * @param {{
 *   readClientFn?: typeof readClient, readAllFn?: typeof readAll,
 *   resolveRegionEntityIdFn?: typeof resolveRegionEntityId, authorEdgesFn?: typeof authorEdges,
 * }} [deps] Injectable for tests; production callers omit this entirely.
 */
export async function authorAutomateVsHireForRegions(regionIds, mode, deps = {}) {
  const counts = { authored: 0, skippedAlready: 0, skippedIncomplete: 0, skippedNoHourlyWage: 0, skippedNoEntity: 0, refused: 0, unknownMethod: 0, errored: 0 };
  const ids = [...new Set(regionIds)];
  if (mode !== "apply" || !ids.length) return counts;

  const readAllFn = deps.readAllFn ?? readAll;
  const resolveRegionEntityIdFn = deps.resolveRegionEntityIdFn ?? resolveRegionEntityId;
  const authorEdgesFn = deps.authorEdgesFn ?? authorEdges;
  const sb = deps.sb ?? (deps.readClientFn ?? readClient)();
  const mostRecent = (list) => list.slice().sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated))[0];

  for (const regionId of ids) {
    try {
      const rows = await readAllFn("regional_data_facts", "id,dimension,value_numeric,unit,last_updated", {
        match: (qb) => qb.eq("region_id", regionId).in("dimension", ["labor_markets", "operational_cost"]),
      });
      const wageRows = rows.filter((r) => r.dimension === "labor_markets" && isHourlyWageUnit(r.unit) && typeof r.value_numeric === "number" && Number.isFinite(r.value_numeric));
      if (!wageRows.length) { counts.skippedNoHourlyWage += 1; continue; }
      const energyRows = rows.filter((r) => r.dimension === "operational_cost" && typeof r.value_numeric === "number" && Number.isFinite(r.value_numeric));
      if (!energyRows.length) { counts.skippedIncomplete += 1; continue; } // pair not complete yet — not an error

      const wage = mostRecent(wageRows);
      const energy = mostRecent(energyRows);

      const entity = await resolveRegionEntityIdFn(sb, regionId, mode, { cite: REGION_ENTITY_CITE });
      if (!entity) { counts.skippedNoEntity += 1; continue; }

      const result = await authorEdgesFn(sb, {
        table: "regional_data_facts",
        id: wage.id,
        entity,
        method: { id: AUTOMATE_METHOD_ID, version: AUTOMATE_METHOD_VERSION },
        inputs: [
          { table: "regional_data_facts", pk: wage.id },
          { table: "regional_data_facts", pk: energy.id },
        ],
      });
      if (!result.ok) {
        if (result.action === "unknown-method") counts.unknownMethod += 1; else counts.refused += 1;
      } else if (result.action === "skipped-already-authored") {
        counts.skippedAlready += 1;
      } else {
        counts.authored += 1;
      }
    } catch (err) {
      counts.errored += 1;
      console.warn(`[author-edges] automate_vs_hire authorship failed for region ${regionId}: ${err.message}`);
    }
  }
  return counts;
}

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
  const touchedRegionIds = new Set();
  for (const row of plan.toInsert) {
    const region_id = codeToId.get(row.region_code);
    const { region_code, ...rest } = row; // region_code is the caller-facing key; the table stores region_id
    const res = await guardedInsert("regional_data_facts", { ...rest, region_id }, { cite });
    if (res.inserted) { inserted++; touchedRegionIds.add(region_id); }
  }
  for (const { id, patch } of plan.toUpdate) {
    const res = await guardedUpdate("regional_data_facts", (qb) => qb.eq("id", id), patch, { cite });
    updated += res.updated;
    const existingRow = existing.find((e) => e.id === id);
    if (existingRow) touchedRegionIds.add(codeToId.get(existingRow.region_code));
  }
  console.log(`${producerName}: wrote ${inserted} insert(s), ${updated} update(s).`);

  // DAG authorship at write time (see authorAutomateVsHireForRegions's own header) — every region this
  // run touched, checked against the CURRENT state of both dimensions (not just this run's own rows), so
  // a pair that completes across two different producers' runs is still authored.
  const authorCounts = await authorAutomateVsHireForRegions(touchedRegionIds, DRY ? "dry" : "apply");
  console.log(
    `${producerName}: DAG authorship (automate_vs_hire): authored=${authorCounts.authored} ` +
    `already=${authorCounts.skippedAlready} incomplete-pair=${authorCounts.skippedIncomplete} ` +
    `no-hourly-wage=${authorCounts.skippedNoHourlyWage} no-entity=${authorCounts.skippedNoEntity} ` +
    `refused=${authorCounts.refused} unknown-method=${authorCounts.unknownMethod} errored=${authorCounts.errored}`
  );

  return { ran: true, candidates: candidates.length, plan, inserted, updated, authorCounts };
}
