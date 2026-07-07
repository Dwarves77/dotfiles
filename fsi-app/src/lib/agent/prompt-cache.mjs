// src/lib/agent/prompt-cache.mjs
//
// PROMPT-CACHE PREFIX BUILDER (Phase-3a, DEEP-AUDIT S3 / MASTER-PLAN P3-3). The generation program's
// dominant cost is re-sending the ~560K-char source pool at full price on EVERY Sonnet call: synthesis
// sends it, grounding re-sends it, every re-ground / retry / two-pass split re-sends it again. Anthropic
// prompt caching prices a cached prefix READ at 0.1× the input rate (write 1.25×), so structuring the
// pool as a STABLE, byte-identical prefix cuts pool-token cost ~90% on every call after the first.
//
// HOW THE PREFIX WORKS (and why the pool moves to the SYSTEM slot): the cache key is the EXACT byte
// prefix of tools → system → messages up to a `cache_control` breakpoint. The pool used to sit at the
// END of the user message, AFTER the call-specific instructions — so no two calls ever shared a prefix.
// Restructured: the pool is the FIRST system block (marked cache_control) and everything call-specific
// (the task system prompt + the user instructions) comes AFTER it. Calls that share the same pool bytes
// share the cached prefix regardless of how their instructions differ.
//
// EXPECTED HIT CLASSES (honest): GUARANTEED — the two-pass truncation split (same prompt re-sent),
// grounding retries, re-ground after a criterion failure, slot-forcing repeats (same groundSrc pool).
// OPPORTUNISTIC — synthesis→ground within one run (same buildSourceBlocks output; hits when the pool
// bytes match AND the gap is under the 5-minute cache TTL; a long synthesis stream can outlive the TTL,
// in which case ground pays one fresh 1.25× write and its own retries hit).
//
// CONTENT-IDENTITY GUARANTEE (red-then-green in prompt-cache.test.mjs): the cached body carries EXACTLY
// the same text the uncached shape carried — pool + task system + user — nothing added, dropped, or
// reordered beyond the pool moving ahead of the instructions. cache_control is metadata only.
//
// PURE — no I/O, no env. Consumed by canonical-pipeline (synthesis + grounding call sites).

/** Fixed header prefixed to the pool block. Part of the cached bytes — MUST stay byte-stable across
 *  calls (changing it invalidates every cached prefix, which is safe but wasteful). */
export const POOL_HEADER =
  "SOURCE CONTENT — reference corpus for this item. Copy FACT spans VERBATIM from these blocks; a FACT source_url MUST be one of these block urls.\n\n";

/**
 * Build the block-structured `system` for a pool-carrying Messages call.
 * Block 1 = POOL_HEADER + pool, marked `cache_control: {type:"ephemeral"}` (the cache breakpoint).
 * Block 2 = the call's task system prompt (uncached tail — may differ per call).
 *
 * @param {string} pool        the source-block text (buildSourceBlocks output)
 * @param {string} taskSystem  the call-specific system prompt (SYSTEM_PROMPT / grounding contract)
 * @returns {Array<{type:"text", text:string, cache_control?:{type:"ephemeral"}}>}
 */
export function cachedSystemBlocks(pool, taskSystem) {
  return [
    { type: "text", text: POOL_HEADER + pool, cache_control: { type: "ephemeral" } },
    { type: "text", text: taskSystem },
  ];
}

/** Total text content of a block-structured or plain system (order-preserving concat). Used by the
 *  content-identity test and available to telemetry for prompt-size accounting. */
export function systemTextContent(system) {
  if (typeof system === "string") return system;
  if (Array.isArray(system)) return system.map((b) => (b && typeof b.text === "string" ? b.text : "")).join("");
  return "";
}

/**
 * USD saved by cache reads on one call, vs the same tokens at the full input rate.
 * cache_read bills at 0.1× input rate → savings = cacheRead × 0.9 × rate. Pure; rate injected.
 * @param {number} cacheReadTokens
 * @param {number} inputUsdPerMtok
 */
export function cacheSavingsUsd(cacheReadTokens, inputUsdPerMtok) {
  return ((cacheReadTokens || 0) / 1e6) * inputUsdPerMtok * 0.9;
}
