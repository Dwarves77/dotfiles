// model-ids.mjs - single shared home for sanctioned Claude model ids (lane L8, 2026-10-02 extraction).
// Pulled out of src/lib/llm/haiku-classify.ts (which re-exports it unchanged, so every existing
// importer of HAIKU_MODEL from that module keeps working byte-for-byte) so a plain-ESM SCRIPT
// (scripts/research/backfill-themes.mjs) can import the SAME model id without pulling in
// haiku-classify.ts's own Anthropic SDK package and html-to-text.mjs imports - those are fine inside a
// Next.js route's bundle, not inside a script that needs to stay out of the no-npm discipline test
// glob (fsi-app/.discipline/glob-portability.test.mjs).
//
// Zero dependencies, by design: nothing may ever be added here that is not a bare string constant.
// PLAIN ESM, same portability discipline as src/lib/research/taxonomy.mjs.
//
// UPDATE (coordinator directive, 2026-10-02, same-day follow-up): src/lib/llm/first-fetch-classify.ts
// ALSO carried its own independent hand-typed copy of this literal (a second drifted copy, found by
// grep, not assumed) and now imports it from here too - see that file's own import-site comment.
//
// UPDATE (lane MODEL-IDS, 2026-10-02): the "remaining known drift" named above is now fixed, not just
// flagged (CLAUDE.md rule 13 - a flag is a commitment). Every one of those sites (src/lib/sources/
// verification.ts, recommend-source-tier.ts, canonical-pipeline.ts, spend-client.ts, two-pass-generate.mjs,
// generation-config.ts, the three admin classification routes, spot-check/recurring/route.ts, ask/route.ts,
// and the two review-card fallback strings) now imports HAIKU_MODEL and/or SONNET_MODEL from here instead
// of carrying its own copy. SONNET_MODEL is added below for the Sonnet half of that same drift (the
// "claude-sonnet-4-6" literal repeated across spend-client.ts, ask/route.ts, two-pass-generate.mjs,
// canonical-pipeline.ts's judgeSlotSpan, and generation-config.ts's GROUND_MODEL default).
//
// metered-gate.mjs's METERED_MODEL_ALLOWLIST / SCOPED_MODEL_AMENDMENTS deliberately keep their OWN literal
// copies (a security allowlist names its own values so it cannot silently widen if this file's constants
// ever changed) - metered-gate.test.mjs asserts the two stay in agreement instead.
export const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/** Sonnet generation/grounding/ask model id (MODEL-TIER RULE, operator amendment 2026-07-14; see
 *  generation-config.ts's GROUND_MODEL doc comment for the full rationale). Same zero-dependency
 *  guarantee as HAIKU_MODEL above. */
export const SONNET_MODEL = "claude-sonnet-4-6";
