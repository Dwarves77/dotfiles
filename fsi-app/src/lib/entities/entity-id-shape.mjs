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
