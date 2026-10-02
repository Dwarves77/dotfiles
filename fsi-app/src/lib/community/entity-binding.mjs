// entity-binding.mjs: the ONE entity-binding validator for a top-level community thread (spec 05
// section 5 component 2, section 6 acceptance criterion 6: "every thread binds to at least one spine
// entity"; R8.7's amendment states items 2-6, entity binding among them, "stay unchanged"). PURE. No
// database, no I/O.
//
// WHY THIS EXISTS. Investigating the "composer 400 without entity_ids" item (2026-09-25 close note,
// grouped alongside the identity-by-default rulings) found the underlying rule intact and correctly
// enforced both sides (POST /api/community/posts/route.ts required a non-empty, well-formed,
// <=MAX_ENTITY_IDS entity_ids array; api-client.ts's createCommunityPost and identity-format.ts's
// validateEntityBinding refused client-side before ever calling the network), spec 07's own amendment
// text explicitly says entity binding "stays unchanged," so REMOVING the requirement was refused as a
// premise that contradicts the binding spec (see this lane's report). What WAS a real, if narrower,
// defect: the client-side check (validateEntityBinding, pre-existing) only checked "non-empty", it did
// NOT check the malformed-id or MAX_ENTITY_IDS rules the server enforces, so a composer that somehow
// produced a malformed or >MAX_ENTITY_IDS id list would pass client-side validation, reach the network,
// and 400 late with a rule the reader never saw coming (Postel's Law / UX law 14: explain requirements
// BEFORE submission). This module is the fix for THAT class: one validator, imported by both sides, so
// they can never again diverge on what "valid entity_ids" means.

// Imports entityKindOf from entity-id-SHAPE.mjs, never entity-id.mjs directly: the latter pulls in
// node:crypto at module top (it mints ids), which a browser bundle cannot resolve, and this module is
// imported by client code (PostComposer.tsx via identity-format.ts/api-client.ts). Caught live by the
// rendering-guard's community-surface UX smoke spec (PR #879, CI run 37010362702): "Could not resolve
// node:crypto", see entity-id-shape.mjs's own header for the full story.
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
