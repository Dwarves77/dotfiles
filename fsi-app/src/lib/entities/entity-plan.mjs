import { entityId } from "./entity-id.mjs";
import { identifierRow, VALIDATORS } from "./crosswalk.mjs";

const DEFAULT_ASSERTED_BY = "src/lib/entities/entity-plan.mjs";

/**
 * Plan jurisdiction entities + crosswalk identifiers for a set of distinct ISO codes.
 * `existingEntityIds` (Set<string>) and `existingIdentifierKeys` (Set<"entity_id|scheme|value">) let a
 * second run skip what a first run already created. Returns { entities, identifiers, byCode } where
 * byCode maps the normalized code to its (possibly pre-existing) entity_id, for planJurisdictionRefs().
 */
export function planJurisdictionEntities(codes, existingEntityIds = new Set(), existingIdentifierKeys = new Set(), assertedBy = DEFAULT_ASSERTED_BY) {
  const entities = [];
  const identifiers = [];
  const byCode = new Map();
  for (const code of codes) {
    const id = entityId("jurisdiction", code);
    byCode.set(code, id);
    if (!existingEntityIds.has(id)) {
      entities.push({ entity_id: id, kind: "jurisdiction", canonical_name: code, status: "active" });
    }
    const scheme = VALIDATORS.ISO3166_1(code) ? "ISO3166_1" : VALIDATORS.ISO3166_2(code) ? "ISO3166_2" : null;
    if (scheme) {
      const key = `${id}|${scheme}|${code}`;
      if (!existingIdentifierKeys.has(key)) identifiers.push(identifierRow(id, scheme, code, assertedBy));
    }
    // else: a free-text supranational code (GLOBAL/IMO/ICAO-shaped): entity only, no crosswalk row.
  }
  return { entities, identifiers, byCode };
}

/**
 * Plan entity_refs rows (role='jurisdiction') for every (row, code) occurrence in `rows`
 * ([{id, jurisdiction_iso}]) against `refTable` ('intelligence_items' | 'regions'). `byCode` is the map
 * planJurisdictionEntities() returned. `existingRefKeys` is a Set of "ref_table|ref_id|entity_id|role".
 */
export function planJurisdictionRefs(refTable, rows, byCode, existingRefKeys = new Set(), assertedBy = DEFAULT_ASSERTED_BY) {
  const refs = [];
  for (const row of rows) {
    const codes = Array.isArray(row.jurisdiction_iso ?? row.iso_codes) ? (row.jurisdiction_iso ?? row.iso_codes) : [];
    for (const raw of codes) {
      const code = String(raw ?? "").trim().toUpperCase();
      if (!code) continue;
      const entity_id = byCode.get(code) ?? entityId("jurisdiction", code);
      const key = `${refTable}|${row.id}|${entity_id}|jurisdiction`;
      if (existingRefKeys.has(key)) continue;
      refs.push({ ref_table: refTable, ref_id: row.id, entity_id, role: "jurisdiction", asserted_by: assertedBy });
      existingRefKeys.add(key); // guard against the SAME code appearing twice in one row's array
    }
  }
  return refs;
}

/** Plan instrument entities + CELEX crosswalk identifiers for a set of distinct canonical_instrument_key
 *  values. Same existing-state/return shape as planJurisdictionEntities(). */
export function planInstrumentEntities(keys, existingEntityIds = new Set(), existingIdentifierKeys = new Set(), assertedBy = DEFAULT_ASSERTED_BY) {
  const entities = [];
  const identifiers = [];
  const byKey = new Map();
  for (const raw of keys) {
    const key = String(raw ?? "").trim().toUpperCase();
    if (!key) continue;
    const id = entityId("instrument", key);
    byKey.set(key, id);
    if (!existingEntityIds.has(id)) {
      entities.push({ entity_id: id, kind: "instrument", canonical_name: key, status: "active" });
    }
    if (VALIDATORS.CELEX(key)) {
      const idKey = `${id}|CELEX|${key}`;
      if (!existingIdentifierKeys.has(idKey)) identifiers.push(identifierRow(id, "CELEX", key, assertedBy));
    }
  }
  return { entities, identifiers, byKey };
}

/** Plan instrument_entity_id updates for intelligence_items rows whose canonical_instrument_key is set
 *  and whose instrument_entity_id is not yet set. `items` is [{id, canonical_instrument_key}]. No
 *  assertedBy parameter: an FK update carries no provenance column of its own to stamp. */
export function planInstrumentFkUpdates(items, byKey) {
  const updates = [];
  for (const it of items) {
    const key = String(it.canonical_instrument_key ?? "").trim().toUpperCase();
    if (!key) continue;
    const entity_id = byKey.get(key);
    if (entity_id) updates.push({ id: it.id, instrument_entity_id: entity_id });
  }
  return updates;
}
