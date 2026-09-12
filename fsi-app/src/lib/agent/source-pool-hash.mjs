// src/lib/agent/source-pool-hash.mjs
//
// THE pool-identity hash (task 3.3, brief-chain-build-plan-2026-09-11 Part 3). ONE exported pure function,
// used by BOTH sides of the injected-synthesis seam: task 3.1's export (scripts/turns/export-corpus-for-
// extraction.mjs) is meant to stamp this hash of the pool text a session lane reads, and this task's write
// site (src/lib/agent/canonical-pipeline.ts, generateBriefFromInjected) recomputes it against the item's
// CURRENT stored pool at persist time -- a mismatch means the lane read pool text that no longer matches
// what is stored (a re-fetch, a truncation-fix refresh, another lane's write landed in between), and the
// lane's verbatim FACT spans may no longer verify against it, so the write is refused ("stale pool").
//
// WHY THIS FILE, NOT canonical-pipeline.ts OR export-corpus-for-extraction.mjs. Putting it in either
// caller's own file would make the OTHER caller import a heavy module it does not need just for one pure
// function: canonical-pipeline.ts pulls in the whole agent runtime (browserless fetch, the Anthropic
// stream client, the spend client, ...), and export-corpus-for-extraction.mjs is a lightweight,
// near-dependency-free export script. A third, leaf module with ZERO imports of either caller avoids both
// problems and avoids a circular dependency by construction: neither caller imports the other, both import
// this. src/lib/agent/ (not scripts/) because the established direction in this codebase is scripts/ ->
// src/lib/ (e.g. scripts/lib/db.mjs already imports src/lib/sources/classify-source-role.ts; task 3.2's own
// schema.mjs imports src/lib/agent/parse-output.ts and src/lib/intake/record-facts.mjs the same way), never
// the reverse -- so a plain .mjs leaf inside src/lib/agent/ is importable by canonical-pipeline.ts via the
// existing "@/lib/agent/..." alias AND by scripts/turns/export-corpus-for-extraction.mjs via a relative
// path, with neither direction inverted.
//
// KNOWN WIRING GAP (named, not fixed here -- out of this task's own file scope: canonical-pipeline.ts, this
// new file, the npmtest, the executor-parity golden's allowlist, and the session log ONLY;
// export-corpus-for-extraction.mjs is out of bounds for this lane). Task 3.1 (already committed:
// c465f029/d9157ce5/62233564) shipped its `pool: [{url, text}]` export field WITHOUT stamping
// source_pool_hash -- that field does not exist in its per-item output yet. Task 3.2's validator
// (schema.mjs) already tolerates this: it checks `source_pool_hash` is present and non-empty on the
// artifact a session lane hands back, not that it equals this function's output, so validation still passes
// today regardless. This task's write site computes and checks the REAL hash unconditionally, so a lane
// cannot pass this seam on a placeholder value. The follow-up wiring -- export-corpus-for-extraction.mjs
// calling hashSourcePool(pool) and adding a real `source_pool_hash` field per item so a lane has an accurate
// value to echo back -- is a one-line addition once a task's scope includes that file.

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
