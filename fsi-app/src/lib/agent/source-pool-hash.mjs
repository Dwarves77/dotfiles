import { createHash } from "node:crypto";

const FIELD_SEP = String.fromCharCode(0);

/**
 * Deterministic sha256 hex digest of a source pool's identity: every `{url, text}` pair's content,
 * independent of the order the caller supplies them in (sorted by url first) -- so a caller that reads the
 * same rows in a different order (a fresh DB read vs. a cached export) still produces the SAME hash. Pure,
 * no I/O. Malformed rows (non-string url/text) are coerced to "" rather than thrown on, matching this
 * module's own "identity hash, not a validator" scope -- shape validation is schema.mjs's job. Joined with
 * a NUL byte (FIELD_SEP), not a plain space or comma: a NUL cannot occur in normal captured text/url
 * content, so adjacent field content cannot shift across the join boundary and collide with a different
 * pool's hash.
 * @param {Array<{url?: unknown, text?: unknown}>} poolRows
 * @returns {string} sha256 hex digest
 */
export function hashSourcePool(poolRows) {
  const rows = Array.isArray(poolRows) ? poolRows : [];
  const normalized = rows
    .map((r) => ({
      url: typeof r?.url === "string" ? r.url : "",
      text: typeof r?.text === "string" ? r.text : "",
    }))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  const hash = createHash("sha256");
  for (const row of normalized) {
    hash.update(row.url);
    hash.update(FIELD_SEP);
    hash.update(row.text);
    hash.update(FIELD_SEP);
  }
  return hash.digest("hex");
}
