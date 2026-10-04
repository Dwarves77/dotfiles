# 2026-10-04 lane s1c-tier-movement (S1-C): promotion and demotion apply; tier opinions move a tier

## Accomplished
- `fsi-app/src/lib/trust.ts`: one calculator for `effective_tier`. `decideEffectiveTier` (pure): `tier_override` wins; else `base_tier` plus the clamped net of four evidence deltas (citation promotion -1, `evaluatePromotion` eligible -1, `evaluateDemotion` triggered +1, tier opinions one step toward the median), net clamped to one tier either side. `recomputeEffectiveTier` (per source, used by source-growth) and `planTierMovements` / `applyTierMovements` (batch) both call it. `scoreCitationEdges` is the pure core split out of `evaluateCandidatePromotion` (behaviour unchanged). `applyRecencyDecay` gained an optional `now`.
- Tier opinion rule: 3 or more non-dismissed opinions in 90 days, 2 or more distinct opining sources, median differs from `base_tier`, `host_class_table` opinions excluded.
- Every applied change writes a `source_trust_events` row (`tier_promotion` or `tier_demotion`, `created_by` "worker", `details.applied` true, rule and inputs).
- `POST /api/admin/recompute-trust` now applies (route.ts, logic.ts). The propose-only `demotionOutcomeFor` is removed; response block `tier_movement` replaces the `demotions_proposed` fields (no other consumer found by grep).
- New `fsi-app/scripts/maintenance/recompute-tiers.mjs` (dry by default, guarded writes), registered in `maintenance.yml` (choice list plus step) and `downstream-chain.yml` after `tier-opinions`, via the shared maintenance-step action. No schedule. Runbook section 58.
- F28 pending markers for the `maintenance` and `downstream-chain` families.

## Read and reused
- Read: `CLAUDE.md`, `docs/dispatches/lane-common-contract.md`, skill `source-credibility-model` (SKILL.md), `src/lib/trust.ts` in full, `trust-evaluators.npmtest.mjs`, `trust.selftest.mjs`, recompute-trust `route.ts`/`logic.ts`/test, `trust-recompute.yml`, `tier-opinions.mjs` and its test, `tier-opinion-writer.ts`, the tier-opinions route and `[id]/tier-override` route, migrations 091, 093 and 099, `source-growth.ts` (the one caller of `recomputeEffectiveTier`), `scripts/lib/db.mjs` guarded helpers, `backfill-format-type.mjs` (lazy-jiti pattern), `maintenance-step` action, `closure-gate.mjs`, F61 header, harness-runs CONVENTION.
- ADRs naming `base_tier` or `effective_tier` (grep, then read): ADR-002 binds: `base_tier` is set by the operator or class table and never changes otherwise; `effective_tier` is the dynamic signal the batch recomputes; promotion and demotion criteria read `base_tier`, never `effective_tier` (feedback-loop rule). This lane complies: criteria are evaluated on `base_tier`, only `effective_tier` is written. ADR-003 (server-side dual-write of both columns at registration) and ADR-007 (bias tags) do not constrain this change. The moat in the skill (reg-fact stamp derives from `base_tier` only) is untouched. [CONFIRMED by reading]
- Reused: `evaluatePromotion`, `evaluateDemotion`, `computeOverallScore`, `evaluateCandidatePromotion` logic, `TIER_WEIGHTS`/decay, `fetchAllRows`, `readAll`, `guardedUpdateByIds`, `guardedInsert`, `runCli`, the `maintenance-step` composite action, the lazy-jiti `buildDeps` shape. No second copy of any of them.

## Decisions (by rule, none waiting on a human)
- `extended_inaccessibility` now requires `status = 'inaccessible'`, matching its own declared condition in `DEMOTION_TRIGGERS`. Before, a source that was merely not being scanned fired it; once a fired trigger moves a tier that would demote the registry whenever scanning pauses.
- With an override set, `recomputeEffectiveTier` returns `after_tier` = the override but `changed` false (an automatic writer never writes over an override). Previously it reported `changed` and source-growth wrote the override value into `effective_tier`.
- Sources with `processing_paused` are read (they still weigh as citers) but never moved.
- The write carries `tier_override IS NULL`, so an override set between read and write is not overwritten.
- `critical_conflict` stays removed (stub not invented).

## NOT done / open
- NEEDS WRITE-SET EXPANSION: `fsi-app/scripts/turns/emit-downstream-chain-artifact.mjs` lists the downstream-chain steps (`STEPS`) whose summaries the artifact reads; `recompute-tiers` is not in it, so its summary is not yet in `downstream-chain-run-NNN.json`. The composite action's description also still says four steps.
- `no_substantive_update` reads scan timestamps that stop advancing while the scrape cadence is off (rule 16); apply before scans resume would fire it on unscanned sources. A chained firing is forced dry in build mode (F61), so only an explicit apply dispatch is exposed. Recorded in runbook section 58.
- No live run, no DB read (brief rule 5). `maintenance:recompute-tiers` shows NEVER-RUN in the closure gate until first dispatched.
- Citation promotion weights citers by their stored `effective_tier`, so a citer moving between runs can change a cited source's result on the next run (inherent to the skill's section 4 formula, unchanged).
