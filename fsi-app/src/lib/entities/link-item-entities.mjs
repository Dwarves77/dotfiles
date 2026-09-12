// link-item-entities.mjs: linkItemEntities(sb, item), rule 16(e) (lane W9 part 1, task 1.1,
// 2026-09-11): "every NEW item is connected at birth" applied to the entity spine (migration 282/283).
// Before this, ONLY the hand-dispatched scripts/entities/backfill-entities.mjs wrote entity_refs /
// instrument_entity_id: a permanent backlog, not a chokepoint write. This is the ONE reusable writer
// mint-item.ts (post-insert, rule 16(e)) and apply-staged-update.ts (the substantive update_item path,
// when jurisdiction_iso or canonical_instrument_key changed) both call, sharing entity-plan.mjs's four
// pure planners with the corpus backfill so mint-time and backfill-time can never plan a row differently
// for the same input.
//
// IDEMPOTENT, same posture as the backfill: existing entities/refs are read FIRST (fresh, every call:
// this module holds no state of its own) and the planners skip anything already present, exactly as
// scripts/entities/backfill-entities.mjs's own runJurisdiction/runInstrument do. entity_identifiers is
// NOT pre-read; its upsert relies on the DB's own `ON CONFLICT (entity_id,scheme,value) DO NOTHING`
// (ignoreDuplicates: true) for idempotency instead, the same posture the Interfaces contract implies
// ("existing refs/entities are read first") by naming only those two, not identifiers.
import { planJurisdictionEntities, planJurisdictionRefs, planInstrumentEntities, planInstrumentFkUpdates } from "./entity-plan.mjs";

const ASSERTED_BY = "src/lib/entities/link-item-entities.mjs";

/**
 * @param {object} sb - a Supabase client (service-role at mint/update time; the injected fake in tests).
 * @param {{ id: string, jurisdiction_iso?: string[] | null, canonical_instrument_key?: string | null }} item
 * @returns {Promise<{ refs: number, instrumentEntityId: string | null }>}
 */
export async function linkItemEntities(sb, item) {
  const codes = (item.jurisdiction_iso ?? []).filter(Boolean);
  const keys = item.canonical_instrument_key ? [item.canonical_instrument_key] : [];

  // Nothing to plan -> nothing to read or write. Short-circuits BEFORE any DB call: an item with
  // neither jurisdiction_iso nor canonical_instrument_key (most non-regulatory item types) must not
  // pay for an entities/entity_refs round trip on every mint, and, as important, must not touch
  // tables a caller's client doesn't expect this step to reach (rule 16(e) is one of several
  // independent post-insert participants; touching a table outside its own stated scope when it has
  // literally nothing to do would be a scope leak, the same "MOAT BOUNDARY" discipline mint-item.ts's
  // own comments hold every other rule-16 participant to).
  if (codes.length === 0 && keys.length === 0) {
    return { refs: 0, instrumentEntityId: null };
  }

  // ── read existing state once, fresh (idempotency: a second call over the same item must plan zero
  //    new entities/refs) ──────────────────────────────────────────────────────────────────────────
  const { data: ents } = await sb.from("entities").select("entity_id").in("kind", ["jurisdiction", "instrument"]);
  const existingEntityIds = new Set((ents ?? []).map((e) => e.entity_id));

  const { data: refs } = await sb
    .from("entity_refs")
    .select("entity_id,ref_id,role")
    .eq("ref_table", "intelligence_items")
    .eq("ref_id", item.id);
  const existingRefKeys = new Set((refs ?? []).map((r) => `intelligence_items|${item.id}|${r.entity_id}|${r.role}`));

  // ── plan (pure, entity-plan.mjs, shared with the backfill) ────────────────────────────────────────
  const jur = planJurisdictionEntities(codes, existingEntityIds, new Set(), ASSERTED_BY);
  const jurRefs = planJurisdictionRefs("intelligence_items", [item], jur.byCode, existingRefKeys, ASSERTED_BY);
  const ins = planInstrumentEntities(keys, existingEntityIds, new Set(), ASSERTED_BY);
  const fk = planInstrumentFkUpdates([item], ins.byKey);

  // ── write only the delta ───────────────────────────────────────────────────────────────────────────
  const newEntities = [...jur.entities, ...ins.entities];
  if (newEntities.length) {
    await sb.from("entities").upsert(newEntities, { onConflict: "entity_id", ignoreDuplicates: true });
  }
  const newIdentifiers = [...jur.identifiers, ...ins.identifiers];
  if (newIdentifiers.length) {
    await sb.from("entity_identifiers").upsert(newIdentifiers, { onConflict: "entity_id,scheme,value", ignoreDuplicates: true });
  }
  if (jurRefs.length) {
    await sb.from("entity_refs").upsert(jurRefs, { onConflict: "ref_table,ref_id,entity_id,role", ignoreDuplicates: true });
  }

  const instrumentEntityId = fk[0]?.instrument_entity_id ?? null;
  if (instrumentEntityId) {
    await sb.from("intelligence_items").update({ instrument_entity_id: instrumentEntityId }).eq("id", item.id);
  }

  return { refs: jurRefs.length, instrumentEntityId };
}
