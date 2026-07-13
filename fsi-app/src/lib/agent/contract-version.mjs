// @ts-check
// SINGLE SOURCE OF TRUTH for the current skill/brief contract version — the value the generator stamps
// onto every brief as `regeneration_skill_version` (emitted live via system-prompt.ts). Prior to this the
// version was hand-pinned as a literal in ≥3 places (the auditor's CURRENT_CONTRACT, b2-progress's
// CURRENT_SKILL_VERSION, and the system prompt) and DRIFTED — the auditor + b2-progress sat at "2026-04-29"
// while the generator had already advanced to "2026-05-27". That drift is the "pinned constant that must be
// hand-bumped in N places" class (operator ruling 2026-07-13, flag-system item 2: "re-baseline C1 to the
// live-emitted contract version, kill the pinned constant class").
//
// The binding: this constant MUST equal the version the system prompt tells the model to stamp. That is
// enforced mechanically by contract-version.test.mjs (reads system-prompt.ts and asserts the string matches),
// so a future contract bump fails the build until BOTH homes advance together — no silent re-drift.
export const CURRENT_SKILL_CONTRACT_VERSION = "2026-05-27";
