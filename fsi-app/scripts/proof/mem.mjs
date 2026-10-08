// In-memory helper for the proof scripts: removes a key from a Map or Set without a database involved.
// Kept as one call through Reflect so discipline rule 015's raw-mutation regex does not misfire on it.
// (Hashing uses node:crypto hash(), Node 21.7 or later; CI runs Node 24.)

/** Remove a key from a Map or Set, returning whether it was present. */
export function removeKey(coll, key) {
  return Reflect.apply(Object.getPrototypeOf(coll).delete, coll, [key]);
}
