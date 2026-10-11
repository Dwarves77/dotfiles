const POOL_ROW_FIELDS = Object.freeze(["intelligence_item_id", "result_url", "result_content", "result_index"]);

/**
 * Assert `row` carries every field export-corpus-for-extraction.mjs's own --with-pool-text read selects,
 * with the right primitive types. Throws with a field-naming message on the first violation -- never a
 * generic "invalid row". Pure. @param {Record<string, unknown>} row
 */
export function assertPoolRowShape(row) {
  if (!row || typeof row !== "object") throw new Error("assertPoolRowShape: row is not an object");
  for (const f of POOL_ROW_FIELDS) {
    if (!(f in row)) throw new Error(`assertPoolRowShape: missing field "${f}"`);
  }
  if (typeof row.intelligence_item_id !== "string" || !row.intelligence_item_id) {
    throw new Error("assertPoolRowShape: intelligence_item_id must be a non-empty string");
  }
  if (typeof row.result_url !== "string" || !row.result_url) {
    throw new Error("assertPoolRowShape: result_url must be a non-empty string");
  }
  if (typeof row.result_content !== "string") {
    throw new Error("assertPoolRowShape: result_content must be a string");
  }
  if (typeof row.result_index !== "number") {
    throw new Error("assertPoolRowShape: result_index must be a number");
  }
}
