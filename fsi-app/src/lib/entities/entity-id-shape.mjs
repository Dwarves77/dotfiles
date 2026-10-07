// entity-id-shape.mjs, the entity spine's SHAPE validator (KINDS, entityKindOf, assertEntityId),
// split out of entity-id.mjs so a BROWSER bundle can import it, same pattern host-from-url.mjs
// already uses for hostFromUrl (see that file's own header).
//
// entity-id.mjs imports node:crypto at module top (it mints sha256-seeded ids); any client
// component that imported entityKindOf/assertEntityId from there dragged node:crypto into the
// browser bundle and failed the build (lane W2-B, PR #879, rendering-guard CI: "Could not resolve
// node:crypto" from the community-surface UX smoke spec, which bundles PostComposer.tsx's
// transitive dependency on entity-id.mjs via src/lib/community/entity-binding.mjs's
// validateEntityIds). Shape validation (a regex match) needs no crypto at all, so it lives here,
// still ONE definition, re-exported by entity-id.mjs so every existing
// `import { entityKindOf } from ".../entity-id.mjs"` keeps working.
//
// PLAIN ESM, ZERO DEPENDENCIES, importable by a fitness function, a script, a server route, or a
// client component.

// The full entity_kind enum: migration 282's `CREATE TYPE entity_kind AS ENUM (...)` (spec 08 section 1.1) plus
// `material`, added by migration 357 (lane G5-READ: an adopted material term is a real entity). Frozen so a
// caller cannot silently widen the vocabulary, widening it means a migration. Kept here (not just re-exported)
// because the shape check below needs it directly.
export const KINDS = Object.freeze([
  "corridor", "node", "jurisdiction", "organisation", "asset",
  "instrument", "obligation", "method", "technology", "signpost", "person",
  "material",
]);
const KIND_SET = new Set(KINDS);

const ID_RE = /^cl:([a-z_]+):([0-9a-f]{16})$/;

/**
 * Validate an entity id's shape: `cl:<kind>:<16 lowercase hex>` with kind in KINDS. When `expectedKind`
 * is given, also asserts the id's kind segment matches it. Throws with a descriptive message on any
 * failure (fail loud, matching db.mjs's requireCite()/scripts/lib conventions) rather than returning a
 * boolean a caller might forget to check.
 */
export function assertEntityId(id, expectedKind) {
  const s = String(id || "");
  const m = s.match(ID_RE);
  if (!m) {
    throw new Error(`entity-id: "${s}" is not a well-formed entity id (expected cl:<kind>:<16 lowercase hex>)`);
  }
  const [, kind] = m;
  if (!KIND_SET.has(kind)) {
    throw new Error(`entity-id: "${s}" names kind "${kind}", which is not in KINDS (${KINDS.join(", ")})`);
  }
  if (expectedKind && kind !== expectedKind) {
    throw new Error(`entity-id: "${s}" is a "${kind}" entity id, expected "${expectedKind}"`);
  }
  return true;
}

/** Extract the kind segment from a well-formed entity id, or null if malformed. Non-throwing sibling of
 *  assertEntityId(), for a caller that wants to branch on kind rather than fail. */
export function entityKindOf(id) {
  const m = String(id || "").match(ID_RE);
  return m ? m[1] : null;
}
