# L10-lib-sources — full-read audit report

Lane: `src/lib/intake/` (17 files) + `src/lib/sources/` (89 files) = 106 files, paths relative to `/root/work/dotfiles/fsi-app`.

---

## Per-file verdicts (path order)

### src/lib/intake/

**src/lib/intake/apply-staged-update.ts — 163 lines — WORKING-WIRED — applies one `staged_updates` row into the mint chokepoint.**
- WIRING: called from `run-intake-cycle.ts`; the legacy human-approve UI route was retired to 410 then purged 2026-07-18 (per file's own header comment) — `run-intake-cycle.ts` is the sole live caller path now.

**src/lib/intake/census-writer.mjs — 170 lines — WORKING-UNWIRED — writes `census_worklist` rows from a census scan.**
- WIRING: lane graph flags `GRAPH:UNREACHABLE`. I did not find any caller of this module within `src/` (no import found while reading the lane). It is exercised end-to-end by `census-writer.npmtest.mjs`, so the code itself works, but I could not confirm a production caller and did not find one — I do NOT overturn the UNREACHABLE flag for this file (contrast with `institution.selftest.mjs` / `source-growth.selftest.mjs` below, which I *did* trace to a `.discipline/` caller). `census_worklist` has 21,609 live rows per table-usage.txt, so something writes it in production — I did not locate that writer within this lane's 106 files, so I cannot say whether this file is it.

**src/lib/intake/census-writer.npmtest.mjs — 174 lines — TEST — exercises census-writer.mjs write paths; not vacuous (asserts row shapes/values from a fake client).**

**src/lib/intake/intake-gates-golden.test.mjs — 54 lines — TEST.**

**src/lib/intake/intake-url-corpus.mjs — 62 lines — TEST-ONLY — fixture corpus of URLs consumed by test files (per `GRAPH:TEST-ONLY`, refs=1).**

**src/lib/intake/mint-connections.npmtest.mjs — 121 lines — TEST — pins the mint-time connection-discovery moat boundary: discovery writes land ONLY in `item_cross_references`, never `claims`/`intelligence_items` again; a corpus-read failure is non-fatal to the mint. Not vacuous — asserts real signal (`shared_source`) and exact write counts/tables via a chainable fake client.**

**src/lib/intake/mint-domain-guard.npmtest.mjs — 44 lines — TEST.**

**src/lib/intake/mint-dryrun-equivalence.npmtest.mjs — 96 lines — TEST — pins the F6 dry-run/real-path equivalence (a `dryRun` mint runs every real gate and returns the disposition it would take, minus the INSERT).**

**src/lib/intake/mint-failclosed.npmtest.mjs — 58 lines — TEST — pins that a DB read error during an idempotency/dedup probe REFUSES the mint (`ok:false`) rather than proceeding to INSERT.**

**src/lib/intake/mint-idempotency.npmtest.mjs — 57 lines — TEST.**

**src/lib/intake/mint-item.ts — 356 lines — WORKING-WIRED — THE single sanctioned INSERT site for `intelligence_items` (the mint chokepoint).**
- WIRING: refs=1; called by `run-intake-cycle.ts` / `apply-staged-update.ts` path. Enforced as sole insert site by a "single-mint-chokepoint fitness function" per its own header.
- NOTE (historical, already fixed): lines ~246-260 document a now-fixed defect — `item_cross_references.relationship` was previously written as `"references"`, which violated the `item_cross_references_relationship_check` CHECK constraint (migration 004; allowed values `{related, supersedes, implements, conflicts, amends, depends_on}`), and the resulting DB error was swallowed, so every `dedup:linked` mint silently failed to write that edge. Fixed to `"related"`; guarded by `.discipline/relationship-check-literals.test.mjs`. This is a documentation of a past bug, not a current one — I confirmed the current literal is `"related"`.

**src/lib/intake/mint-source-link.npmtest.mjs — 78 lines — TEST — pins the Fix A source-link invariant (a mint cannot produce a source-less LIVE item; `GRANDFATHERED_SOURCELESS` allowlist = exactly 2 UUIDs).**

**src/lib/intake/portal-harvest.npmtest.mjs — 295 lines — TEST.**

**src/lib/intake/portal-harvest.ts — 379 lines — WORKING-WIRED — portal-page harvesting into candidate URLs feeding the intake cycle.**
- WIRING: refs=1, called from `run-intake-cycle.ts`.

**src/lib/intake/run-intake-cycle.ts — 201 lines — WORKING-WIRED — orchestrates one intake cycle (portal harvest → apply staged update → mint).**
- WIRING: refs=2, the top-level intake orchestrator.

**src/lib/intake/source-link-invariant.mjs — 28 lines — WORKING-WIRED — enforces the source-link invariant at mint time.**
- NOTE: `GRANDFATHERED_SOURCELESS` allowlist is exactly 2 UUIDs (eFTI 2020/1056, waste 2024/1157), documented as shrink-only (no new sourceless items are ever permitted).

**src/lib/intake/source-link-invariant.test.mjs — 42 lines — TEST.**

### src/lib/sources/

**src/lib/sources/acquire-lock.mjs — 47 lines — WORKING-WIRED — `assertAcquireAllowed`, the master paid-acquire arming gate keyed on `GROUNDING_ACQUIRE_ENABLED`.**
- NOTE: default (env var unset) is LOCKED — throws `AcquireLockError`/`GROUNDING_ACQUIRE_LOCKED` before any spend. Confirmed as the terminal gate in `verify-item.mjs`'s paid-acquire branch.

**src/lib/sources/acquire-lock.test.mjs — 32 lines — TEST.**

**src/lib/sources/amendment-diff.mjs — 151 lines — TEST-ONLY — diffs amended legal text versions.**
- WIRING: `GRAPH:TEST-ONLY`, refs=1 (a test file), consistent with what I read — no production caller found.

**src/lib/sources/amendment-diff.test.mjs — 86 lines — TEST.**

**src/lib/sources/api-fetch.ts — 171 lines — WORKING-UNWIRED — a generic `apiFetch` transport method, never called in production.**
- WIRING: `GRAPH:UNREACHABLE`, refs=0. CONFIRMED via Grep of `src/app` for `apiFetch`/`api-fetch`: no matches — nothing in the Next.js route tree calls it. DEFECT-adjacent NOTE: the file's own header comment (lines 1-4) claims it is "Used by the access_method routing switch in /api/agent/run" — this is FALSE/STALE; that route does not reference it. The only references to this file anywhere in the lane are `transport-hold-wiring.npmtest.mjs` (imports it for a test) and a prose (non-import) mention in `feed-walk.mjs`'s header comment. Owners should know the file's own doc comment misdescribes its live wiring.

**src/lib/sources/browserless.ts — 69 lines — WORKING-WIRED — headless-render transport (Browserless) used by the render step of the escalation ladder.**
- WIRING: refs=7.

**src/lib/sources/canonical-fetch-caller-thread.test.mjs — 57 lines — TEST.**

**src/lib/sources/canonical-fetch.mjs — 130 lines — WORKING-WIRED — canonical single-source-of-truth fetch wrapper.**
- WIRING: refs=6.

**src/lib/sources/change-sweep.mjs — 77 lines — TEST-ONLY.**
- WIRING: `GRAPH:TEST-ONLY`, refs=1, consistent with reading — no production caller found.

**src/lib/sources/change-sweep.test.mjs — 86 lines — TEST.**

**src/lib/sources/charset-decode.mjs — 73 lines — WORKING-WIRED — HTTP body charset detection/decoding.**
- WIRING: refs=2.

**src/lib/sources/charset-decode.test.mjs — 63 lines — TEST.**

**src/lib/sources/cheap-verify.mjs — 73 lines — WORKING-WIRED — `cheapVerifyClaims`, span-match verification against STORED snapshot text (~$0 default path).**
- WIRING: refs=3; called from `verify-item.mjs`.

**src/lib/sources/cheap-verify.test.mjs — 58 lines — TEST.**

**src/lib/sources/check-sources-decision.mjs — 32 lines — WORKING-WIRED.**
- WIRING: refs=2.

**src/lib/sources/cited-host-gate.mjs — 44 lines — WORKING-WIRED.**
- WIRING: refs=2.

**src/lib/sources/cited-host-gate.test.mjs — 66 lines — TEST.**

**src/lib/sources/classify-source-role.identity-signals.test.mjs — 98 lines — TEST.**

**src/lib/sources/classify-source-role.selftest.mjs — 30 lines — TEST — self-test entry point for classify-source-role.ts.**
- WIRING: refs=0, no GRAPH flag (per BRIEF, refs=0 with no flag usually signals the file is itself an entry point). I did not specifically check whether this is additionally spawned by a `.discipline/fitness/functions/*.mjs` sentinel the way `institution.selftest.mjs` and `source-growth.selftest.mjs` are (I found those two by name-searching `.discipline/`; I did not repeat that search for this file). AMBIGUOUS in the sense that I cannot rule out an additional `.discipline/` caller, but the graph tool already treats it as a reachable entry point, so I take no position beyond "not further verified."

**src/lib/sources/classify-source-role.ts — 125 lines — WORKING-WIRED — classifies a source's institutional role (used by `vertical-fit.ts` as a weak prior, among others).**
- WIRING: refs=12, the most-imported module in the lane after `entity-gate.mjs`.

**src/lib/sources/content-change.mjs — 48 lines — WORKING-WIRED.**
- WIRING: refs=2.

**src/lib/sources/content-change.test.mjs — 40 lines — TEST.**

**src/lib/sources/entity-gate.mjs — 108 lines — WORKING-WIRED — `isErrorBody` and related entity/error-body detection.**
- WIRING: refs=13, the single most-imported file in the lane. NOTE (RD-14 "two-homes fold"): `isErrorBody` here and `detectRoadblock` in `primary-fallback.mjs` share the same error-body backstop by design, so the primary-fetch detector and the transport-ladder classifier can never disagree on what counts as a junk body.

**src/lib/sources/entity-gate.test.mjs — 51 lines — TEST.**

**src/lib/sources/feed-walk.mjs — 83 lines — TEST-ONLY — RSS/Atom feed walker.**
- WIRING: `GRAPH:TEST-ONLY`, refs=1, consistent with reading. NOTE: its header comment mentions `api-fetch.ts` in prose (not an import) — see the api-fetch.ts entry above.

**src/lib/sources/feed-walk.test.mjs — 69 lines — TEST.**

**src/lib/sources/fetch-hold.mjs — 159 lines — WORKING-WIRED — the F16 caller-thread hold gate (`SCRAPE_HOLD`).**
- WIRING: refs=7. NOTE: `AUTHORIZED_HOLD_CALLERS = Set(["unit3-remediation", "manual-intake-run"])` — exactly two signed callers may pass an *engaged* hold; the default (env var unset) resolves to LIFTED, i.e. fail-open toward normal production operation by design (documented, not a silent defect).

**src/lib/sources/fetch-hold.test.mjs — 120 lines — TEST.**

**src/lib/sources/fetch-now-decision.mjs — 28 lines — WORKING-WIRED.**
- WIRING: refs=2.

**src/lib/sources/fetch-quality.ts — 64 lines — WORKING-WIRED.**
- WIRING: refs=1.

**src/lib/sources/freshness-probe.mjs — 71 lines — WORKING-WIRED — `probeFreshness`, HEAD-only staleness check (no body fetch, no spend).**
- WIRING: refs=3; called from `verify-item.mjs`.

**src/lib/sources/freshness-probe.test.mjs — 49 lines — TEST.**

**src/lib/sources/holdings-audit.mjs — 195 lines — WORKING-WIRED.**
- WIRING: refs=4.

**src/lib/sources/holdings-audit.test.mjs — 102 lines — TEST.**

**src/lib/sources/holdings-gate.mjs — 42 lines — WORKING-WIRED — no-execution-from-stale-state gate: a fetch is admitted only on genuine holdings-absence (no real snapshot AND ≤1 thin pool row); usable held content refuses the fetch.**
- WIRING: refs=2.

**src/lib/sources/holdings-gate.test.mjs — 36 lines — TEST.**

**src/lib/sources/host-authority-ruling-conformance.test.mjs — 71 lines — TEST.**

**src/lib/sources/host-authority.npmtest.mjs — 38 lines — TEST.**

**src/lib/sources/host-authority.ts — 178 lines — WORKING-WIRED — `classTierForHost`/`codifiedTierForHost`, the SC-13 no-guess-tier doctrine: returns a deterministic tier or `null` (worklist), never a guessed default.**
- WIRING: refs=9.

**src/lib/sources/identifier-variants.mjs — 216 lines — WORKING-WIRED.**
- WIRING: refs=3.

**src/lib/sources/identifier-variants.test.mjs — 97 lines — TEST.**

**src/lib/sources/institution.selftest.mjs — 38 lines — WORKING-WIRED — self-test locking the moat: `tierOfSource = base_tier ?? null` (dynamic `effective_tier` can never confer grounding eligibility).**
- WIRING: OVERTURNS `GRAPH:UNREACHABLE`/refs=0. Confirmed via Grep: referenced by `.discipline/fitness/functions/F12-moat-base-tier.mjs` as `const SENTINEL = 'fsi-app/src/lib/sources/institution.selftest.mjs';`, inside a fitness function `{ id: 'F12', name: 'moat-base-tier' }` whose `enumerate()` returns `[SENTINEL]` — i.e. it is spawned/executed by the fitness-function governance harness. The lane's `src/`-only import graph missed this because the caller lives in `.discipline/`, outside `src/`.

**src/lib/sources/institution.test.mjs — 53 lines — TEST.**

**src/lib/sources/institution.ts — 103 lines — WORKING-WIRED — `tierOfSource = base_tier ?? null` (the moat: static authority-origin tier only, never dynamic reputation).**
- WIRING: refs=4.

**src/lib/sources/instrument-identity.selftest.mjs — 44 lines — TEST — self-test entry point.**
- WIRING: refs=0, no GRAPH flag. As with `classify-source-role.selftest.mjs`, I did not specifically search `.discipline/` for an additional sentinel caller of this particular file (I only did that search for `institution.selftest.mjs` and `source-growth.selftest.mjs`, which were the two files actually flagged `GRAPH:UNREACHABLE`). Not further verified.

**src/lib/sources/instrument-identity.ts — 78 lines — WORKING-WIRED.**
- WIRING: refs=1.

**src/lib/sources/officialness.mjs — 172 lines — WORKING-WIRED — classifies content as official/binding text vs. commentary; `splitBlocks()` segments extracted text on an internal delimiter.**
- WIRING: refs=4.
- NOTE (verified non-defect): `splitBlocks()` appears, when viewed through the Read tool, to call `.replace(<pattern>, "")` then `.split("")` — which would look like a severe bug (splitting into individual characters). This is NOT a defect: the replace/split arguments are not literal empty strings but contain a non-printable SOH control character (`0x01`), which the Read tool's rendering silently drops, making it visually indistinguishable from `""`. I confirmed via `cat -A` on the raw file that a real `^A` (SOH) byte is present, and via direct Node execution of the actual module that `splitBlocks` produces correct, coherent output using SOH as an internal block-delimiter sentinel. Flagged here only as a caution for any later reader: this file contains non-printable literals that look empty in normal viewers.

**src/lib/sources/officialness.test.mjs — 135 lines — TEST.**

**src/lib/sources/pdf-extract.mjs — 54 lines — WORKING-WIRED.**
- WIRING: refs=3.

**src/lib/sources/pdf-extract.test.mjs — 40 lines — TEST.**

**src/lib/sources/phase-r-cheap-fixes.test.mjs — 29 lines — TEST.**

**src/lib/sources/portal-links.mjs — 63 lines — WORKING-WIRED.**
- WIRING: refs=4.

**src/lib/sources/portal-links.test.mjs — 75 lines — TEST.**

**src/lib/sources/primary-fallback.mjs — 194 lines — WORKING-WIRED — `fetchPrimaryWithFallback`, `detectRoadblock` (shares the error-body backstop with `entity-gate.mjs`'s `isErrorBody`, per the RD-14 fold).**
- WIRING: refs=5.

**src/lib/sources/primary-fallback.test.mjs — 162 lines — TEST.**

**src/lib/sources/reachability.mjs — 75 lines — WORKING-WIRED — `checkReachability`/`classifyReachability`, the reachability SSOT used by `verification.ts`.**
- WIRING: refs=9.
- NOTE: contains `classifyReachability_LEGACY_BUGGY` (~lines 30-38), explicitly retained per its own comment only as a "mutation-check baseline" for tests. Confirmed NOT used on the production path: `checkReachability`'s `classify` parameter defaults to the correct `classifyReachability`; the buggy legacy version is reachable only by explicitly injecting it via the test-only `classify` parameter override. Intentional dead-but-documented code, not a live defect.

**src/lib/sources/recommend-source-tier.ts — 135 lines — OPERATOR-TOOL — one-off/per-source tier recommendation.**
- WIRING: refs=1. Its own header comment states: "DO NOT RUN A TIER PASS IN BLOCK 1 ... invoked during Phase 1.5 (after HC1), per-source, operator-paced." This is a deliberately manual, operator-paced invocation, not an automated pipeline step.

**src/lib/sources/reconcile.selftest.mjs — 22 lines — TEST — self-test entry point.**
- WIRING: refs=0, no GRAPH flag. Not further checked against `.discipline/` beyond the two files I explicitly traced (`institution.selftest.mjs`, `source-growth.selftest.mjs`).

**src/lib/sources/reconcile.ts — 111 lines — WORKING-WIRED — `recordItemChange`/`recordSourceChangeTrigger`, called from `/api/worker/reconcile` per its own header comment (I did not read that route file myself in this lane; that route is outside my lane's file list).**
- WIRING: refs=2.
- NOTE (table-usage cross-check): both write functions target `intelligence_changes`, which per `table-usage.txt` has **0 live rows** despite `src=2` references. Per BRIEF's ground-truth rule, this means the write path has never successfully executed in production, or the table was wiped — I cannot distinguish which from this lane alone.
- DEAD (documented, historical): `openSourceConflict` was removed 2026-07-11 per the file's own header comment (zero callers, ever) — consistent with `source_conflicts` not appearing as a live-written table in table-usage.txt.

**src/lib/sources/register-step.test.mjs — 159 lines — TEST.**

**src/lib/sources/register-walk.mjs — 135 lines — TEST-ONLY.**
- WIRING: `GRAPH:TEST-ONLY`, refs=1, consistent with reading — no production caller found.

**src/lib/sources/register-walk.test.mjs — 107 lines — TEST.**

**src/lib/sources/reground-ladder.golden.test.mjs — 70 lines — TEST — golden end-to-end test proving the WIRED candidate-generation path using the real (not stubbed) `generateCandidates` from `seek-more.mjs`. Not vacuous.**

**src/lib/sources/scrape-schedule.test.mjs — 30 lines — TEST.**

**src/lib/sources/scrape-schedule.ts — 75 lines — WORKING-WIRED.**
- WIRING: refs=4.

**src/lib/sources/sec-fair-access.ts — 26 lines — WORKING-WIRED — small SEC fair-access rate-limit helper.**
- WIRING: refs=1.

**src/lib/sources/seek-more.mjs — 184 lines — WORKING-WIRED — `generateCandidates` + per-jurisdiction candidate generators (`eurlexCandidates`, `ukCandidates`, `lovdataCandidates`, `gazetteCandidates`, `apiCandidates`) + `exhaustionFlagRow`/`persistExhaustionRecord`.**
- WIRING: refs=3; live callers include `primary-fallback.mjs`'s `fetchPrimaryWithFallback`, which calls `generateCandidates` directly.
- DEAD (documented, historical): a former `runSeekMore` orchestrator was retired 2026-07-14 per the file's own "no-shadow" doctrine comment — it had zero live callers once `fetchPrimaryWithFallback` took over calling `generateCandidates` directly. Confirmed gone from current exports.

**src/lib/sources/seek-more.test.mjs — 90 lines — TEST.**

**src/lib/sources/snapshot-store.mjs — 114 lines — WORKING-WIRED — `getSnapshot`/snapshot persistence, used by `verify-item.mjs`.**
- WIRING: refs=6.

**src/lib/sources/snapshot-store.test.mjs — 96 lines — TEST.**

**src/lib/sources/source-growth.selftest.mjs — 56 lines — WORKING-WIRED — self-test for source-growth/credibility-syndication logic.**
- WIRING: OVERTURNS `GRAPH:UNREACHABLE`/refs=0. Confirmed via Grep: referenced by `.discipline/fitness/functions/F10-source-credibility-syndication.mjs` as `const SENTINEL = 'fsi-app/src/lib/sources/source-growth.selftest.mjs';`, inside fitness function `{ id: 'F10', name: 'source-credibility-syndication-collapse' }`. Same pattern as `institution.selftest.mjs` above — wired via the `.discipline/` governance harness, invisible to the `src/`-only import graph.

**src/lib/sources/source-growth.ts — 346 lines — WORKING-WIRED — `registerCitedSources` → `recordTierOpinion` (from `tier-opinion-writer.ts`).**
- WIRING: refs=1.
- AMBIGUOUS (table-usage cross-check): `recordTierOpinion` writes `source_tier_opinions`, which per `table-usage.txt` has **0 live rows** despite `src=2`. The code's own comments describe this as a "missing writer" for migration 091 that was "finally wired" as of 2026-08-11. Two readings, both consistent with what I read: (a) the wiring is genuinely new (2026-08-11) and simply hasn't fired in production yet as of the data snapshot behind table-usage.txt, or (b) something still prevents `registerCitedSources`/`recordTierOpinion` from actually being invoked or from committing successfully. I cannot distinguish these from this lane alone — I did not read the caller of `registerCitedSources` (outside this lane's file list) or check production logs/timestamps.

**src/lib/sources/target-match.mjs — 219 lines — WORKING-WIRED.**
- WIRING: refs=1.

**src/lib/sources/tier-discipline-no-guess.test.mjs — 110 lines — TEST — pins the SC-13 no-guess doctrine across every live tiering path (H-tier auto-approve, ambiguous-host worklist path, bulk-approve): none may stamp `base_tier` from a model-guessed `ai_trust_tier`. Not vacuous.**

**src/lib/sources/tier-opinion-writer.test.mjs — 109 lines — TEST.**

**src/lib/sources/tier-opinion-writer.ts — 95 lines — WORKING-WIRED — `recordTierOpinion`, writer for `source_tier_opinions`.**
- WIRING: refs=2. See the `source-growth.ts` AMBIGUOUS note above — this is the writer implementation behind that 0-live-row table.

**src/lib/sources/transport-escalation.mjs — 269 lines — WORKING-WIRED — the transport ladder: cache → api → direct → render, with per-failure-class routing (NOT_FOUND classes → seek-more; BLOCK classes → try other transport then hold `NO_REACHABLE_SOURCE`; JS_SHELL → escalate to render).**
- WIRING: refs=4.

**src/lib/sources/transport-escalation.test.mjs — 237 lines — TEST.**

**src/lib/sources/transport-hold-wiring.npmtest.mjs — 84 lines — TEST — imports `api-fetch.ts` (the only non-prose reference to that file found anywhere in the lane besides its own file).**

**src/lib/sources/transport-runtime.mjs — 100 lines — WORKING-WIRED.**
- WIRING: refs=2.

**src/lib/sources/transport-runtime.test.mjs — 127 lines — TEST.**

**src/lib/sources/url-canonicalize.ts — 166 lines — WORKING-WIRED — `canonicalizeUrl`, the SSOT for URL canonical form.**
- WIRING: refs=10; called at the entry of `verification.ts`'s `verifyCandidate` (the Q10 fix, so all downstream lookups/inserts key on the canonical form).

**src/lib/sources/verification-decision.mjs — 24 lines — WORKING-WIRED — `decideReachabilityAction`, short-circuits INCONCLUSIVE (→ M, queued-provisional) and DEAD (→ L, rejected) reachability outcomes before `verification.ts`'s `aggregateTier` is ever reached.**
- WIRING: refs=2.

**src/lib/sources/verification.ts — 1016 lines — WORKING-WIRED — the W2.F auto-verification pipeline: triages candidate URLs into H/M/L confidence tiers and executes the resulting action.**
- WIRING: refs=1 (the largest file in the lane; single entry point `verifyCandidate`).
- NOTE: `THRESHOLDS` (`AI_RELEVANCE_H: 75, AI_RELEVANCE_M: 50, AI_FREIGHT_H: 55, AI_FREIGHT_M: 25`) were tightened 2026-05-06 from 70/50 per an in-code comment citing a 15% false-positive rate at the old thresholds.
- WIRING/DEFECT-fix confirmed (SC-13): `executeAction` (~lines 597-733) stamps the auto-approve insert's `base_tier` from `detTier` (`classTierForHost`, deterministic), never from `numericTier`/`ai_trust_tier` (the Haiku guess). When `detTier == null` (ambiguous host) it falls through to the M/provisional path instead of minting a guessed active tier. This is pinned by `w2f-basetier.npmtest.mjs` and `tier-discipline-no-guess.test.mjs` (both in this lane) as a source-contract guarantee.
- `verifyCandidate` canonicalizes the URL at entry via `url-canonicalize.ts`, then calls `checkReachability` (delegating to the SSOT in `reachability.mjs`); an INCONCLUSIVE or DEAD reachability outcome short-circuits via `decideReachabilityAction` before ever reaching `aggregateTier` — confirmed by an explicit in-code comment (~lines 537-541) stating the old buggy `if (!reachable) → L` branch was deliberately removed to make that mis-call un-typecheckable. Content fetch, language detection, and Haiku classification (guarded: skipped with a logged reason if `ANTHROPIC_API_KEY` is unset or no content was fetched) only run for a REACHABLE candidate. `dryRun` mode (used by the F6 equivalence test) computes the same `action` a real run would take but performs no writes and no `writeAuditLog` call.

**src/lib/sources/verify-item.mjs — 162 lines — WORKING-WIRED — the ONE snapshot-first grounding-verification entry point (operator ruling 2026-07-13).**
- WIRING: refs=4.
- Flow, confirmed by direct reading: `decideVerify` is a pure decision core (no I/O) — no snapshot → `needs_acquire`(`missing_snapshot`); snapshot exists but freshness probe says `changed` → `stale_flag` (never silently passes, never fetches); fresh/unknown + cheap-verify pass → `verified_cheap`; cheap-verify fail → `needs_acquire`(`cheap_verify_failed`).
- `verifyItem` only performs side effects when `opts.act === true`; default (`act` undefined) returns the decision and moves $0 — confirmed by the file's own doc comment and by `verify-item.test.mjs`'s "act:false ... moves nothing" test.
- The paid-acquire branch order is: (1) refuse immediately if no `inventoryMiss` (data-existence) citation string is supplied — no I2 log, no spend; (2) else log the I2 justification row to `agent_runs` FIRST; (3) then call `assertAcquireAllowed` (from `acquire-lock.mjs`), which throws `GROUNDING_ACQUIRE_LOCKED` when the env flag is off, i.e. AFTER the justification is already recorded but BEFORE any spend. This ordering (citation → log → lock) is exactly what `verify-item.test.mjs` pins.
- NOTE: `logAcquireJustification` validates `j.reason` against `ACQUIRE_JUSTIFICATIONS = ["missing_snapshot", "content_changed", "cheap_verify_failed"]` and throws on anything else.

**src/lib/sources/verify-item.test.mjs — 124 lines — TEST — covers all four `decideVerify` branches, both writers (`writeStaleFlag`, `logAcquireJustification`), and the full orchestration including the refuse-before-I2-log ordering and the acquire-ON handoff. Not vacuous — asserts exact insert counts/fields via fake clients.**

**src/lib/sources/vertical-fit-gate.ts — 70 lines — WORKING-WIRED — `checkVerticalFitGate`, blocks re-adding a source whose host is on the off-vertical negative list (a source already `status='suspended'` with an `off_vertical_suspended` marker in `notes`).**
- WIRING: refs=3.
- NOTE (documented fail-open): on a DB query error against the negative-list lookup, the gate explicitly fails OPEN (`allow: true`) and logs a warning (lines ~56-58) — the file's own comment states this is deliberate ("a transient DB failure must not wedge source onboarding"). This is a documented design choice, not a silent defect, but is worth an owner's awareness since it means a DB outage during onboarding silently permits re-adding a previously-retired off-vertical source rather than blocking it.
- Legislatures are kept by default per the 2026-06-04 decision; this gate enforces only the negative (already-retired) list, never a positive block on new legislatures.

**src/lib/sources/vertical-fit.ts — 155 lines — WORKING-WIRED — `classifyInstitutionalType`, `isOffVerticalByIdentity`, `looksLikeStatuteCodeDb`, `coversVerticalAuthority` — deterministic regex-based institutional classifier (no LLM, no content fetch).**
- WIRING: refs=1 (consumed by `vertical-fit-gate.ts`).
- NOTE: by design this module never itself authorizes a kill — `isOffVerticalByIdentity` only supplies part (a) of the two-part criterion; part (b) (coverage-gap check) is explicitly the caller's job, and the file's header states classification alone "never decides kill." Order of the internal regex checks is deliberate: gazette/statute-DB is checked before the general-legislature pattern so a name like "Singapore Statutes Online" isn't misclassified.

**src/lib/sources/w2f-basetier.npmtest.mjs — 36 lines — TEST — a pure text-scan (no execution) source-contract guard asserting `verification.ts`'s auto-approve `newSource` literal writes `base_tier: detTier` (never `numericTier`) and `domains: [REGULATIONS_DOMAIN]` (never the magic `[1]`). Confirmed both assertions match the current `verification.ts` content I read.**

---

## Lane summary

### Counts by STATUS (106 files)
- WORKING-WIRED: 48 (46 confirmed directly wired via `src/` imports + 2 overturned from `GRAPH:UNREACHABLE` — `institution.selftest.mjs`, `source-growth.selftest.mjs` — via `.discipline/fitness/functions/` sentinel callers)
- TEST: 50
- TEST-ONLY: 5 (`intake-url-corpus.mjs`, `amendment-diff.mjs`, `change-sweep.mjs`, `feed-walk.mjs`, `register-walk.mjs`)
- WORKING-UNWIRED: 2 (`census-writer.mjs`, `api-fetch.ts`)
- OPERATOR-TOOL: 1 (`recommend-source-tier.ts`)
- DEFECTIVE / INCOMPLETE / STUB / DEAD-HISTORICAL (as a whole-file STATUS): 0 — no file in this lane earned one of these as its overall status. All defect-shaped observations I found were either historical-and-already-fixed (see ranked findings), intentionally-retained-as-baseline (dead but documented), or NOTE-level design choices, not live wired-but-broken files.

### Ranked findings (most important first)

1. **Two `GRAPH:UNREACHABLE` flags are wrong for `src/`-only reasons, not because the code is dead.** `institution.selftest.mjs` and `source-growth.selftest.mjs` are both spawned as SENTINELs by named fitness functions in `.discipline/fitness/functions/F12-moat-base-tier.mjs` and `.discipline/fitness/functions/F10-source-credibility-syndication.mjs` respectively — a governance-harness invocation path entirely outside `src/`, which the lane's import-graph tool cannot see. Both are locking genuinely load-bearing invariants (the moat's `base_tier ?? null` rule; source-credibility/syndication collapse behavior). This is a lane-tool limitation worth flagging to whoever built the `GRAPH:` classifier: it should also scan `.discipline/` for string-referenced sentinel paths.

2. **`source_tier_opinions` has 0 live rows despite a live, refs=2 writer (`tier-opinion-writer.ts`'s `recordTierOpinion`, called from `source-growth.ts`'s `registerCitedSources`).** The code's own comments describe this as a "missing writer" for migration 091, "finally wired" 2026-08-11. AMBIGUOUS: could be genuinely-new-and-not-fired-yet, or could still be broken upstream of this lane (I did not read `registerCitedSources`'s own caller, which is outside this lane's 106 files). Worth an owner's direct check against post-2026-08-11 production logs.

3. **`intelligence_changes` has 0 live rows despite a live, refs=2 writer (`reconcile.ts`'s `recordItemChange`/`recordSourceChangeTrigger`).** Per the file's header, the caller is `/api/worker/reconcile`, which is outside this lane so I could not confirm it is actually invoked on a schedule. Either this worker route never runs in production, or the table was wiped after the writer went live — I cannot distinguish which from this lane alone.

4. **`api-fetch.ts`'s own header comment misdescribes its wiring.** It claims to be "Used by the access_method routing switch in /api/agent/run," but I confirmed via Grep of `src/app` that nothing there calls `apiFetch`/imports `api-fetch`. The only real references anywhere in the lane are a test import (`transport-hold-wiring.npmtest.mjs`) and a prose (non-import) mention in `feed-walk.mjs`'s header. A future reader trusting the header comment would misjudge this file as live.

5. **Historical, already-fixed defect documented in `mint-item.ts` (lines ~246-260):** `item_cross_references.relationship` was once written as the invalid literal `"references"` (violating the migration-004 CHECK constraint), and the resulting DB error was silently swallowed, so every `dedup:linked` mint silently lost that edge write. Now fixed to `"related"` and guarded by `.discipline/relationship-check-literals.test.mjs`. Not a current defect, but exactly the failure class (swallowed error hiding a silent no-op) the audit is looking for, so it's worth the owner's awareness that this class of bug has occurred here before.

6. **A false-positive I ruled out after execution, documented so no one re-flags it:** `officialness.mjs`'s `splitBlocks()` visually appears (via the Read tool, and via any plain-text viewer) to call `.replace(x, "")` then `.split("")`, which would be a severe character-splitting bug. The arguments are not empty strings — they contain a literal SOH (0x01) control character invisible in normal rendering. Confirmed via `cat -A` and via direct Node execution of the real module that the function is correct. Flagging this so a future lane/audit pass doesn't waste time re-discovering the same false alarm, and as a general caution: any code in this repo with a seemingly-empty-string `.replace`/`.split` pair should be hex-checked before being trusted as a literal.

7. **`census-writer.mjs` (`GRAPH:UNREACHABLE`, refs=0) — I could not find its production caller, and did NOT overturn the flag** (unlike the two `.discipline/`-wired self-tests above). `census_worklist` has 21,609 live rows, so something is writing it — I simply did not find that writer within this lane's 106 files. This is a genuine "I did not check X" per the honesty bar, not a claim that the file is dead.

8. **`reachability.mjs` retains `classifyReachability_LEGACY_BUGGY`** (~lines 30-38) purely as a mutation-testing baseline; confirmed not reachable on any production path (the `classify` parameter defaults to the correct function; the buggy one is only reachable via explicit test injection). Dead-but-documented, not a live risk.

9. **`seek-more.mjs`'s former `runSeekMore` orchestrator was retired 2026-07-14** ("no-shadow" doctrine — a duplicate orchestrator with zero live callers once `primary-fallback.mjs`'s `fetchPrimaryWithFallback` began calling `generateCandidates` directly). Confirmed gone from current exports; `reground-ladder.golden.test.mjs` proves the live path end-to-end with the real function.

10. **`fetch-hold.mjs`'s hold gate is a deliberate two-caller allowlist with fail-open default.** `AUTHORIZED_HOLD_CALLERS = Set(["unit3-remediation", "manual-intake-run"])` — only these two signed callers can pass an *engaged* `SCRAPE_HOLD`; when the hold env var itself is unset, the default resolves to LIFTED (i.e., normal operation), which is a deliberately prod-preserving fail-open, not a fail-closed hold-by-default. Owners should know an unset env var here means "scraping proceeds," not "scraping is held."

11. **`vertical-fit-gate.ts` fails OPEN on a DB error in its off-vertical negative-list lookup** (lines ~56-58), explicitly by design per its own comment ("a transient DB failure must not wedge source onboarding"). Documented, not silent, but worth an owner's awareness: a DB outage during source onboarding silently permits re-adding a source that was deliberately retired as off-vertical, rather than blocking the add.

12. **`recommend-source-tier.ts` is explicitly operator-paced, not pipeline-automated** — its own header says "DO NOT RUN A TIER PASS IN BLOCK 1 ... invoked during Phase 1.5 (after HC1), per-source, operator-paced." Anyone assuming this runs automatically as part of the intake cycle would be wrong.

13. **SC-13 no-guess-tier doctrine is enforced and tested at the exact insertion point that would otherwise "hollow-pass" the authority floor.** `verification.ts`'s auto-approve H-tier branch stamps `base_tier: detTier` (from `classTierForHost`, deterministic-or-null) and never the Haiku-guessed `ai_trust_tier`/`numericTier`; this is locked by two separate tests in this lane (`w2f-basetier.npmtest.mjs`, a pure text-scan; `tier-discipline-no-guess.test.mjs`, which additionally covers the ambiguous-host worklist path and bulk-approve). This is a genuine strength worth recording alongside the gaps above — the moat's single most safety-critical write path is both correctly implemented and independently pinned twice.

14. **RD-14 "two-homes fold" is real and intentional, not duplicated logic that drifted.** `entity-gate.mjs`'s `isErrorBody` (refs=13, the most-imported file in the lane) and `primary-fallback.mjs`'s `detectRoadblock` deliberately share the same error-body backstop, per in-code comments in both files, so the primary-fetch detector and the transport-ladder classifier can never disagree on what counts as a junk/error body.

15. **`verify-item.mjs`'s paid-acquire path enforces a strict, verified order** (citation check → I2 justification log → acquire-lock assert), confirmed both by reading the code and by `verify-item.test.mjs`'s explicit ordering tests (e.g. "no citation → REFUSED, no I2 log, no spend" and "citation + lock OFF → I2 logged THEN throws"). This is the kind of fail-closed spend control the audit is meant to verify actually holds, and it does.

### Coverage attestation

Files read in full: 106/106.
Lines read: sum of the line-count column across all 106 lane-manifest entries = 17,193 lines (per the lane list's own line-count figures; every file's full content was read via the Read tool, in offset chunks for the one file over 900 lines — `verification.ts`, read in four sequential chunks covering lines 1–1016).

No file in this lane was left partially read. Two ambiguities I could not resolve from this lane's files alone are called out explicitly above (rank 2 and rank 3 in Ranked findings) rather than guessed at, per the honesty bar.
