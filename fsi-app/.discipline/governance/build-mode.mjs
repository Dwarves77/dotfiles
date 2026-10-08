// BUILD MODE: the one switch for gates that exist to force a date-driven decision during a build.
//
// Operator ruling, 2026-10-08, verbatim: "We are building the fucking site. Make it simple and pause
// the 7 day rule until the site goes live."
//
// This is the code-side expression of CLAUDE.md rule 16 (build mode: no standing schedules, every
// runtime by explicit dispatch, the scrape cadence is held off). The database side of the same state is
// `system_state.scrape_cadence='off'`; this constant is the gate side, readable with no database and no
// credentials, because the gates that consult it run in the no-credential test suite.
//
// WHAT IT PAUSES. Only date-driven expiry and renewal-warning gates, today the layout-guard baseline's
// hard expiry and its 7-day renewal warning (rendering/layout-guard/baseline.mjs). While true those do
// not fail; they still report their age as information. It never relaxes a gate that measures present
// state: a NEW layout finding still blocks, the baseline file must still parse, and a baseline that
// grows still fails.
//
// GO-LIVE STEP: flip BUILD_MODE to false. That restores the old behaviour in the same commit (a
// past-expiry baseline excuses nothing, the 7-day warning fails unless the baseline was re-measured), so
// the go-live commit must renew or re-date the baseline per
// docs/runbooks/layout-guard-baseline-renewal.md first, or it goes red on purpose.

export const BUILD_MODE = true;
