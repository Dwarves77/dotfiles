// planMarketSeriesUpsert — the pure diffing core for market_series' idempotent upsert (WO-16 step 1:
// "keyed (series_key, reference_period) … idempotent upsert").
//
// WHY PURE, AND WHY SEPARATE FROM THE PRODUCER SCRIPT. The actual DB write must go through the guarded
// path (scripts/lib/db.mjs — guardedInsert/guardedUpdate: cite + prior-value snapshot + service role),
// which lives under scripts/lib, not src/lib (src/lib importing scripts/lib runs against this repo's own
// grain — scripts/ orchestrates src/, not the reverse; write-edges.mjs's header makes the same call for
// item_cross_references). So the DECISION of which rows are new vs. which need refreshing is pure and
// lives here (testable with zero I/O, zero mocked client), and the producer script
// (scripts/producers/market/eu-weekly-oil-bulletin.mjs) is the thin orchestrator that reads existing rows,
// calls this, and performs the guarded writes — mirroring scripts/source-state-min-wage.mjs's shape
// exactly (readAll -> byKey Map -> per-row create/update), generalised to any market_series producer.
//
// KEY: (series_key, reference_period) — the same pair the migration's UNIQUE constraint enforces. A
// row's UPDATE payload never touches series_key/reference_period/id (immutable identity + key); it
// refreshes the envelope + label, same posture guardedUpdate's callers use elsewhere (e.g.
// source-state-min-wage.mjs's value/unit/trend/source_id refresh on an unchanged (state_code,dimension,
// fact_label) key).
//
// ENTITY (lane L4-E, migration 373). A producer whose registry entry declares an entity_id (scripts/producers/registry)
// is handed it as PRODUCER_ENTITY_ID by the registry runner. This planner is the one place every market_series producer's rows
// pass before the guarded write, so it is the one place that stamps `entity_id`: a CREATE row gets the entity unless the row
// already names one; an UPDATE patch carries it only when the existing row was read WITH entity_id and it is NULL (an existing
// value is never overwritten, and a producer that does not read the column never touches it; the data script
// scripts/migrations/data/backfill-market-series-entity.mjs stamps the rows that already exist). No entity configured, no
// change: the plan is byte-identical to before. A malformed id fails loud (entityIdFromEnv).
//
// PLAIN ESM, ZERO DEPENDENCIES beyond the entity-id SHAPE validator (itself plain ESM, no node:crypto).

import { assertEntityId } from "../entities/entity-id-shape.mjs";

/** The env var the registry runner sets on a producer child whose entry declares an entity_id. The one name. */
export const PRODUCER_ENTITY_ID_ENV = "PRODUCER_ENTITY_ID";

/**
 * The entity a producer run stamps, from its environment: null when none is configured; throws on a malformed id.
 * @param {Record<string,string|undefined>} [env]
 * @returns {string|null}
 */
export function entityIdFromEnv(env = process.env) {
  const v = env?.[PRODUCER_ENTITY_ID_ENV];
  if (v === undefined || v === "") return null;
  assertEntityId(v);
  return v;
}

const rowKey = (r) => `${r.series_key}\u0000${r.reference_period ?? ""}`;

/** The envelope + label fields a producer may refresh on an existing row. Identity/key fields excluded. */
export const REFRESHABLE_FIELDS = Object.freeze([
  "label", "value_numeric", "unit", "currency", "derivation", "origin_class",
  "source_key", "source_ref", "n_observations", "method_version", "as_at_date",
]);

/**
 * @param {Array<{id:string, series_key:string, reference_period:string|null}>} existingRows
 *   Minimal shape read from market_series (readAll("market_series", "id, series_key, reference_period")).
 * @param {Array<object>} incomingRows
 *   Full market_series-shaped rows from a parser (series_key, reference_period, label, value_numeric, …).
 * @param {{ entityId?: string|null }} [opts]
 *   entityId defaults to entityIdFromEnv(); null/absent leaves the plan unchanged.
 * @returns {{
 *   toCreate: Array<object>,
 *   toUpdate: Array<{id:string, patch:object}>,
 *   skippedNoReferencePeriod: Array<object>,
 * }}
 */
export function planMarketSeriesUpsert(existingRows, incomingRows, { entityId = entityIdFromEnv() } = {}) {
  const byKey = new Map((existingRows ?? []).map((r) => [rowKey(r), r]));
  const toCreate = [];
  const toUpdate = [];
  const skippedNoReferencePeriod = [];

  for (const row of incomingRows ?? []) {
    // reference_period is nullable at the DB (renderEnvelopeDDL never emits NOT NULL — see the
    // migration's own header), but a NULL here would silently multiply UNIQUE-unconstrained duplicate
    // rows for the same series_key on every re-run (Postgres treats each NULL as distinct in a UNIQUE
    // index). This producer's parser always sets it; a caller that somehow reaches this without one gets
    // reported, never silently inserted as an ever-growing duplicate set.
    if (row.reference_period === null || row.reference_period === undefined || row.reference_period === "") {
      skippedNoReferencePeriod.push(row);
      continue;
    }
    const existing = byKey.get(rowKey(row));
    if (!existing) {
      toCreate.push(entityId && !row.entity_id ? { ...row, entity_id: entityId } : row);
      continue;
    }
    const patch = {};
    for (const field of REFRESHABLE_FIELDS) patch[field] = row[field] ?? null;
    if (entityId && existing.entity_id === null) patch.entity_id = entityId;
    toUpdate.push({ id: existing.id, patch });
  }

  return { toCreate, toUpdate, skippedNoReferencePeriod };
}
