/**
 * Generation knobs — the ONE sanctioned place generation/grounding logic reads `process.env`.
 *
 * Declared as named constants so that any change to generation behavior is a reviewable G-diff
 * (discipline rule 017 / red-team Finding 1). An env-only change to a knob read inline in the
 * pipeline would alter what gets fetched/synthesized with no diff for review to catch; centralizing
 * the knobs here makes every tuning visible. Generation modules import from here instead of reading
 * `process.env` directly.
 */

/** Browserless fetch concurrency for the canonical pipeline's source pool + grounding fetches.
 *  Keep (shards × this) ≤ 5 to respect the Browserless plan's 5-session cap. */
export const BROWSERLESS_FETCH_CONCURRENCY = Number(process.env.BROWSERLESS_FETCH_CONCURRENCY || 2);
