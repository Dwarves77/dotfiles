# Scrape-and-Build-Content Plan (2026-07-19)

**The goal this whole effort serves:** scrape the sources, build content. This plan is grounded in the
full structure audit ([supabase-structure-audit-2026-07-19](../audits/supabase-structure-audit-2026-07-19.md))
and the Step 1 behavioral read — reuse-first, because the audit proved the pipeline is far more built than
assumed: classification, the intake chokepoint, grounding, and the durable content stores
(`agent_run_searches` + `raw_fetches`) all exist and have run (631 model agent_runs). The system's dormancy
is ONE frozen cron plus FOUR missing consumers. That is the build. Cleanup (migration 219) is DONE.

## The four builds (each names what it reuses; nothing else is constructed)

### B1 — Portal-harvest consumer: `portal_link_candidates` → intake
The discovery ledger's missing half (the audit's half-slice). REUSES: `extractPortalLinks` (built, wired,
proven live — EUR-Lex 43 / MPA 22 / u.ae 2 real counts), the `portal_link_candidates` ledger (mig 162),
`haikuVerifyCandidate` classification, and `run-intake-cycle`'s dryRun-first mint (Phase R). NEW: one
consumer that reads `queued` ledger rows, classifies each candidate doc against the four page contracts
(multi-tag), and stages survivors as intake candidates. One module + a runner; no new tables.

### B2 — Register-API index walk (EUR-Lex OJ + Federal Register)
REUSES: `apiEndpointFor` (federalregister/ecfr routing), `euCandidates`/CELEX derivation, the transport
ladder + `assertFetchAllowed`. NEW: a date-paged listing walk (the OJ daily-view / FR API documents index)
that feeds the same ledger B1 consumes. Registers, not renders — cheap HTTP, no Browserless for the API half.

### B3 — Feed transport (CARB-class RSS/Atom)
The one genuinely missing transport (rss-fetch purged P-5 as a dead false-header module). NEW: a minimal
feed-listing fetch behind `assertFetchAllowed` + the error-body gate, emitting entries into the same ledger.
REUSES: everything downstream. This also lands the routed D4/D5 api-fetch hardening (truncated/fullLength
flags) per the Phase R triage.

### B4 — Change-to-analysis consumer: `intelligence_changes` → re-ground
Closes Step 1 F2. REUSES: check-sources fingerprinting + reconcile (built writers), `compareFreshness`,
`cheapVerifyClaims`, the STALE_FLAG, and the existing grounding pipeline as the actuator. NEW: the consumer
that routes a detected change — spans intact → record only; span broken → stale-flag + re-ground queue
(paid re-ground stays behind the acquire lock + operator-priced line, unchanged).

## Sequencing
B1 → B2/B3 (parallel; both feed B1's consumer) → the cron re-arm (ADR-015 checklist: uncomment the
schedule blocks, set scrape_cadence, confirm deployed env) → B4. The proving slice (the five ruled sources:
EUR-Lex, u.ae, MPA, CARB, NLR) runs through B1-B3 as each source's shape comes online, producing the real
per-shape sizing that prices the corpus-wide sweep. Paid grounding of new deltas: per sanctioned run,
operator-priced lines, exactly the existing spend model (RD-31/RD-32) — this plan changes no spend rule.

## What this plan explicitly does NOT do
No new content store (the audit killed that — `agent_run_searches`/`raw_fetches` are the stores). No new
intake path (the chokepoint is the path). No grounding/floor/moat change. No touch to the fenced strong
list. Routed fixes land with their file's build (D4/D5 in B3; F14 with the price-feed touch; F16/F17 with
the drain-tools touch). Every module ships with its test in the existing suites; every PR updates the board.
