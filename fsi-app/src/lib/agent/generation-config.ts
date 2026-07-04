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

// ── Truncation fix (2026-06-23): the pipeline used to fetch ≤30KB and synthesise against the first
// 12KB of each source, so a 458KB regulation (PPWR) was read at 2.6%. Its per-year trajectories and
// qualifying clauses (e.g. the PPWR 2038 Grade-C market ban, the Art 7 per-plant averaging basis) live
// in the back of the document and were never seen. These knobs let the pipeline download and read the
// FULL text. result_content_excerpt is TEXT (~1GB) so storage is not the limit (migration 112).

/** Max chars fetched per PRIMARY source. The primary legal text is pulled in full up to this; direct
 *  HTTP (free, no Browserless units) for static-HTML official hosts, Browserless otherwise. */
export const PRIMARY_MAX_CHARS = Number(process.env.PRIMARY_MAX_CHARS || 600000);

/** Max chars fetched per CORROBORATOR / grounding source (was 14-16KB). Corroborators carry
 *  participants/timing/context; the qualification-bearing text is the primary. */
export const CORROBORATOR_MAX_CHARS = Number(process.env.CORROBORATOR_MAX_CHARS || 60000);

/** Synthesis/grounding INPUT budget (chars). The pool is fed in full up to this; the PRIMARY is given
 *  priority (included whole) and corroborators share the remainder. ~560KB ≈ ~140K tokens, leaving
 *  headroom for the system prompt + 32K output inside Sonnet's 200K context. A single primary larger
 *  than this is the (rare) chunking case — logged loudly, never silently truncated. */
export const SYNTH_INPUT_BUDGET_CHARS = Number(process.env.SYNTH_INPUT_BUDGET_CHARS || 560000);

/** Hard per-source context ceiling for a FLOOR-QUALIFYING source (the T1/T2 primary for reg-family, the
 *  T4 for research, etc.). The moat property (buildSourceBlocks): a floor-qualifying source reaches
 *  grounding COMPLETE, never truncated — truncation pressure lands tier-ordered on the lowest-tier
 *  corroborators first. A single floor-qualifying source larger than THIS ceiling is the (rare) chunking
 *  case: NOT silently sliced — surfaced as a context-ceiling wall (a truncation-guard integrity_flag) and
 *  the item stays quarantined with a named reason (operator ruling 2026-07-03). Default = the whole input
 *  budget (a source exceeding the entire budget genuinely cannot be fed whole). */
export const SYNTH_PRIMARY_HARD_CEILING_CHARS = Number(
  process.env.SYNTH_PRIMARY_HARD_CEILING_CHARS || SYNTH_INPUT_BUDGET_CHARS,
);

/** Max chars of each brief SECTION shown to the grounding ledger extractor (was 2200 — which hid the
 *  back of every long section from span extraction). */
export const GROUND_SECTION_MAX_CHARS = Number(process.env.GROUND_SECTION_MAX_CHARS || 12000);

// ── Telemetry (span-attribution unit 4f): cost estimate from real token usage, so the stored path logs
// actual spend to agent_runs.cost_usd_estimated (no DDL) instead of $0. USD per MILLION tokens for
// claude-sonnet-4-6; the estimate the MTD spend tile reads. Tunable via env if pricing moves.
export const SONNET_INPUT_USD_PER_MTOK = Number(process.env.SONNET_INPUT_USD_PER_MTOK || 3);
export const SONNET_OUTPUT_USD_PER_MTOK = Number(process.env.SONNET_OUTPUT_USD_PER_MTOK || 15);

/** Pure: USD cost estimate from token usage at the configured Sonnet rates. */
export function sonnetCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1e6) * SONNET_INPUT_USD_PER_MTOK + (outputTokens / 1e6) * SONNET_OUTPUT_USD_PER_MTOK;
}

// Haiku 4.5 rates (the sanctioned always-cheap classifier tier — Rule 016 permitted set).
export const HAIKU_INPUT_USD_PER_MTOK = Number(process.env.HAIKU_INPUT_USD_PER_MTOK || 1);
export const HAIKU_OUTPUT_USD_PER_MTOK = Number(process.env.HAIKU_OUTPUT_USD_PER_MTOK || 5);

/** Pure: model-aware USD cost estimate. Sonnet models bill at the Sonnet rate; Haiku at the Haiku rate. */
export function costUsdForModel(model: string, inputTokens: number, outputTokens: number): number {
  const isHaiku = /haiku/i.test(model || "");
  const inRate = isHaiku ? HAIKU_INPUT_USD_PER_MTOK : SONNET_INPUT_USD_PER_MTOK;
  const outRate = isHaiku ? HAIKU_OUTPUT_USD_PER_MTOK : SONNET_OUTPUT_USD_PER_MTOK;
  return (inputTokens / 1e6) * inRate + (outputTokens / 1e6) * outRate;
}

/** The standing spend ceiling (USD), enforced INSIDE the spend client — the $10-ceiling class stops being
 *  relay discipline. Overridable via env for an operator-authorized raise. */
export const SPEND_CEILING_USD = Number(process.env.SPEND_CEILING_USD || 10);
