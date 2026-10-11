import { entityId } from "../entities/entity-id.mjs";
import { fetchAllByIdChunks } from "../db/paginate.mjs";
import { adoptedEntries } from "./adopted-terms.mjs";

/** adopted term kind -> entity_kind. */
export const ADOPTED_ENTITY_KINDS = Object.freeze({ standard: "instrument", material: "material" });

const READ_CHUNK = 50;

/**
 * Plan the entities rows the adopted set implies. PURE. `existingEntityIds` is the set of ids already on the
 * spine; only the missing ones are returned in `entities`. `byTerm` maps `${kind}|${key}` to the entity id for
 * every adopted standard and material, minted or not.
 * @param {unknown} adopted @param {Set<string>} [existingEntityIds]
 * @returns {{entities: Array<{entity_id: string, kind: string, canonical_name: string, status: string}>, byTerm: Map<string, string>}}
 */
export function planAdoptedTermEntities(adopted, existingEntityIds = new Set()) {
  const entities = [];
  const byTerm = new Map();
  for (const [termKind, entityKind] of Object.entries(ADOPTED_ENTITY_KINDS)) {
    for (const e of adoptedEntries(adopted, termKind)) {
      const id = entityId(entityKind, e.key);
      byTerm.set(`${termKind}|${e.key}`, id);
      if (!existingEntityIds.has(id) && !entities.some((x) => x.entity_id === id)) {
        entities.push({ entity_id: id, kind: entityKind, canonical_name: e.label || e.key, status: "active" });
      }
    }
  }
  return { entities, byTerm };
}

/**
 * Mint the entities for the adopted standards and materials that are not on the spine yet. Reads first, writes
 * only the delta; `dry` plans and reports without writing. A write error is reported, never thrown: a mint
 * failure must not invalidate the link step that called it (the link step is non-gating).
 * @param {any} sb Supabase client @param {unknown} adopted @param {{dry?: boolean}} [opts]
 * @returns {Promise<{planned: number, minted: number, error?: string}>}
 */
export async function mintAdoptedTermEntities(sb, adopted, { dry = false } = {}) {
  const probe = planAdoptedTermEntities(adopted);
  const all = [...probe.byTerm.values()];
  if (all.length === 0) return { planned: 0, minted: 0 };
  const existing = new Set();
  try {
    // The shared id-chunk reader (F39): the id list follows the adopted set, so it is never one oversized .in().
    const rows = await fetchAllByIdChunks(all, async (chunk) => {
      const { data, error } = await sb.from("entities").select("entity_id").in("entity_id", chunk);
      if (error) throw new Error(error.message);
      return data ?? [];
    }, { chunk: READ_CHUNK });
    for (const r of rows ?? []) existing.add(r.entity_id);
  } catch (e) {
    return { planned: 0, minted: 0, error: `entities read failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  const { entities } = planAdoptedTermEntities(adopted, existing);
  if (dry || entities.length === 0) return { planned: entities.length, minted: 0 };
  const { error } = await sb.from("entities").upsert(entities, { onConflict: "entity_id", ignoreDuplicates: true });
  if (error) return { planned: entities.length, minted: 0, error: `entities upsert failed: ${error.message}` };
  return { planned: entities.length, minted: entities.length };
}
