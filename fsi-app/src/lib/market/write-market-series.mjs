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
