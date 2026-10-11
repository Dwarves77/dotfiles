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
