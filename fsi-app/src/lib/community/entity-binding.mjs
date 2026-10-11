import { entityKindOf } from "../entities/entity-id-shape.mjs";

/** Schema-identical to POST /api/community/posts/route.ts's own MAX_ENTITY_IDS. */
export const MAX_ENTITY_IDS = 10;

/**
 * @param {unknown[] | null | undefined} rawEntityIds
 * @returns {{ ok: true, entityIds: string[] } | { ok: false, error: string }}
 */
export function validateEntityIds(rawEntityIds) {
  const entityIds = (Array.isArray(rawEntityIds) ? rawEntityIds : []).filter(
    (id) => typeof id === "string" && id.trim().length > 0
  );

  if (entityIds.length === 0) {
    return {
      ok: false,
      error:
        "Bind this post to at least one spine entity (corridor, jurisdiction, instrument, technology, " +
        "or organisation) before posting.",
    };
  }
  if (entityIds.length > MAX_ENTITY_IDS) {
    return { ok: false, error: `entity_ids must name ${MAX_ENTITY_IDS} or fewer entities` };
  }
  const malformed = entityIds.filter((id) => !entityKindOf(id));
  if (malformed.length > 0) {
    return {
      ok: false,
      error: `entity_ids contains malformed id(s), expected cl:<kind>:<16 hex>: ${malformed.join(", ")}`,
    };
  }

  return { ok: true, entityIds };
}
