// pool-row-contract.mjs -- the ONE agent_run_searches "pool row" shape assertion, shared by every writer
// and reader that has to agree on it (D26 lane L17, 2026-09-13). Before this lane, the shape was
// documented in two places that could silently drift apart:
//   - the WRITE side: src/lib/agent/canonical-pipeline.ts's ground-fallback INSERT ({ intelligence_item_id,
//     search_query: "canonical ground", result_url, result_title: "source", result_index, result_content,
//     searched_at }) -- the shape run-intake-cycle.ts's recordOnly branch now reuses verbatim for a
//     record-only mint's own pool-row write.
//   - the READ side: scripts/turns/export-corpus-for-extraction.mjs's --with-pool-text read
//     (readAll("agent_run_searches", "id, intelligence_item_id, result_content, result_url, result_index", ...)).
// This module names the fields BOTH sides actually depend on (never the full canonical-pipeline INSERT
// shape, which also carries writer-only bookkeeping like search_query/result_title/searched_at that the
// export read never selects) and asserts them, so a test on either side of the writer/reader boundary can
// prove "this row is a pool row the export can read" without re-typing the field list.
export const POOL_ROW_FIELDS = Object.freeze(["intelligence_item_id", "result_url", "result_content", "result_index"]);

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
