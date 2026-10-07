// adopted-entities.mjs (lane G5-READ, 2026-10-07). An ADOPTED `standard` or `material` term is held by the
// system, so it is a real entity on the spine (migration 282 `entities`), minted through entity-id.mjs like every
// other entity id and never hand-assembled.
//
// KIND RULE (stated, as the lane brief asks). src/lib/entities/canonical-entities.mjs defines its dictionary as
// "a LIVING dictionary of NAMED standards/frameworks/programmes ... Each names ONE specific instrument", and
// the entity spine already mints a named instrument as kind `instrument` (entity-plan.mjs planInstrumentEntities,
// seed = the upper-cased name). An adopted `standard` therefore mints kind `instrument`, with the same seed rule,
// so "ISO 14083" adopted here and "ISO 14083" minted from a canonical_instrument_key are ONE entity. `method`
// is not used: a method is a way of calculating something (spec 08), a named standard is the instrument that
// prescribes it. An adopted `material` mints kind `material` (added to entity_kind by migration 357); its seed is
// the normalised term key (lower case), so a material is one entity however a brief spells it.
//
// IDEMPOTENT, the posture of link-item-entities.mjs: the ids are read first and only the delta is written, with
// an ignore-duplicates upsert so a concurrent minter that landed the same deterministic id first wins.
// `scenario`, `theme`, `compliance_object` and `term` adopted kinds mint nothing: they are vocabulary, not
// real-world things.

import { entityId } from "../entities/entity-id.mjs";
import { adoptedEntries } from "./adopted-terms.mjs";

/** adopted term kind -> entity_kind. */
export const ADOPTED_ENTITY_KINDS = Object.freeze({ standard: "instrument", material: "material" });

const READ_CHUNK = 100;

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
  for (let i = 0; i < all.length; i += READ_CHUNK) {
    const { data, error } = await sb.from("entities").select("entity_id").in("entity_id", all.slice(i, i + READ_CHUNK));
    if (error) return { planned: 0, minted: 0, error: `entities read failed: ${error.message}` };
    for (const r of data ?? []) existing.add(r.entity_id);
  }
  const { entities } = planAdoptedTermEntities(adopted, existing);
  if (dry || entities.length === 0) return { planned: entities.length, minted: 0 };
  const { error } = await sb.from("entities").upsert(entities, { onConflict: "entity_id", ignoreDuplicates: true });
  if (error) return { planned: entities.length, minted: 0, error: `entities upsert failed: ${error.message}` };
  return { planned: entities.length, minted: entities.length };
}
