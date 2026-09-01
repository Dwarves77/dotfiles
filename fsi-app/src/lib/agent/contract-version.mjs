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
// 2026-08-31 (flywheel U7, connection-redesign-and-build-scope-2026-08-29.md §4 order 8): brief
// synthesis now reads the connection graph (src/lib/connections/brief-candidates.mjs) and offers a
// CANDIDATE CONNECTIONS block before generation, under the A3 assertion rule in system-prompt.ts —
// related_items may now be drawn from that block (in addition to the source pool), never invented
// beyond either. Both homes (this constant + system-prompt.ts's two YAML stamps) advance together —
// contract-version.test.mjs is the drift guard.
// 2026-09-01 (lane fw2-contract, forward-participation clause): added rule 16 to "The 16 Rules for
// All Output" — on every mint or substantive update the pipeline must (a) run connection discovery
// (discoverConnections/writeDiscoveredEdges, src/lib/connections/discover.mjs +
// src/lib/connections/write-edges.mjs) against item_cross_references, (b) extract forward events
// via extractForwardEvents (src/lib/forward-events/extract-forward-events.mjs — moved from
// scripts/forward-events/ by lane FIX the same day, so the runtime mint chokepoint that now actually
// calls it, per this clause, never has src/ importing scripts/) into item_forward_events, (c) surface
// anticipated obligations to the operator through integrity_flags rather than acting on them
// autonomously, and (d) record a failure of (a) or (b) as an integrity_flags defect, never a silent
// skip. Both homes advance together — contract-version.test.mjs is the drift guard.
export const CURRENT_SKILL_CONTRACT_VERSION = "2026-09-01";
