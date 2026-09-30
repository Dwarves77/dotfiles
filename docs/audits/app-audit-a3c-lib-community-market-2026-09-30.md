# App audit A3c, src/lib/community, connections, credibility, forward-events, intake, llm, market

**Date:** 2026-09-30
**Lane:** A3c (SRC-LIB-COMMUNITY-TO-MARKET), Sonnet, read-only
**Scope:** `fsi-app/src/lib/{community,connections,credibility,forward-events,intake,llm,market}/**`, 156 files, 29,763 lines
**Method:** every file read start to finish via the Read tool (line-by-line, per the operator's binding directive, no overviews, no grep-substitutes-for-reading). Cross-referenced against `.discipline/fitness/functions/` where a finding's severity turned on whether a gap was tracked or undiscovered.

## Summary

This is the flywheel/intake/spend-control lane of Caro's Ledge, the data-machine-critical code that mints items, extracts forward-dated obligations, derives connection graphs, gates all Anthropic spend, and builds the Market Intel surface. Overall code quality is exceptionally high: pure-function discipline is real (not aspirational), determinism is proven by shuffled-input permutation tests, grounding/verbatim-span rules are enforced by code and re-verified against real corpus snapshots (not just asserted in comments), and every non-fatal failure path in the mint chokepoint records a structured `integrity_flags` defect rather than swallowing silently. Several modules are visibly the product of real incident post-mortems (the EU Weekly Oil Bulletin workbook parser was rewritten twice after live CI failures, each documented with the exact byte offsets and root cause; the forward-event extractor carries nine named defect-fix lanes with live-SQL citations).

Against that bar, this audit found **10 findings**, none of them data-integrity-breaking, none of them fabrication/grounding violations (the two things this audit weighted most heavily per the dispatch). The most severe finding (F-LLM-1) turned out, on verification, to be a *known, tracked* debt item rather than an undiscovered gap, downgraded accordingly per rule 14. The dominant finding pattern is a recurring **silent-swallow write** shape (`.then(() => {}, () => {})` with no logging) across otherwise well-guarded writers, and two instances of a **documented, self-acknowledged duplication/limitation** (jurisdiction-alias matching) that the code itself already flags as future work.

| Directory | Files | Lines | Findings |
|---|---:|---:|---|
| community/ | 27 | 2,720 | 1 |
| connections/ | 43 | 8,138 | 3 |
| credibility/ | 2 | 155 | 0 |
| forward-events/ | 11 | 5,516 | 2 |
| intake/ | 35 | 9,733 | 2 |
| llm/ | 17 | 2,538 | 2 |
| market/ | 21 | 3,325 | 0 |
| **Total** | **156** | **29,763** | **10** |

## Per-class findings

### Class: swallowed / unlogged errors (F14/F25-adjacent)

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| F-COM-1 | `fsi-app/src/lib/community/shell-context.ts:136-146` | `const { data: profile } = await supabase.from("profiles")...maybeSingle()` and the `org_memberships` read on the next line both destructure `data` without `error`, exactly the anti-pattern `fsi-app/.claude/CLAUDE.md`'s own "agent/run error-swallow post-mortem" names. A schema/column-rename error silently degrades `currentUser.name`/`employer` rather than surfacing. | [CONFIRMED] read directly | P2 | Destructure `error` and `console.warn` on both calls, per the post-mortem's prescribed fix shape. | S |
| F-CON-1 | `fsi-app/src/lib/connections/resource-lookup.ts:32-51` | `resolveItemUuid` and `fetchInstrumentEntityId` both do `const { data } = await supabase...maybeSingle()` with no `error` destructure and no try/catch (unlike the file's own `buildResourceLookup`, which wraps its query in try/catch and is explicitly documented "fail-soft"). A real query error throws past the caller instead of the "fail-soft to null" behavior the JSDoc promises. | [CONFIRMED] read directly | P2 | Destructure `error`, log, return `null` explicitly on error, matching the doc comment's actual promise. | S |
| F-INT-1 | `fsi-app/src/lib/intake/flywheel-defect.ts:58-79`; `fsi-app/src/lib/intake/mint-item.ts:302-308, 409-421, 429-443` | Four sites use `.then(() => {}, () => {})` fire-and-forget with **no logging at all** on failure, including `recordFlywheelDefect` itself, the one writer every rule-16 non-fatal step relies on to make a failure visible. `write-edges.mjs` in the same codebase (`fsi-app/src/lib/connections/write-edges.mjs:122`) does `console.warn` on an equivalent failed write; the convention exists but is not applied here. | [CONFIRMED] read directly | P2 | A shared `fireAndForgetInsert(promise, label)` helper that logs on rejection, used at all four sites (and checked against `apply-staged-update.ts`/`apply-mint-batch.mjs`, outside this lane's read set). | S |

### Class: documented but unresolved limitation / duplication (rule 13)

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| F-CON-2 | `fsi-app/src/lib/connections/gaps.mjs:46-54` | Self-documented KNOWN LIMITATION: jurisdiction-span-gap matching is case-fold-only string equality, no ISO-3166 alias (`'uk'`↔`'GB'`), no subnational-parent containment (`'US-CA'`↔`'us'`). The comment says "Filed as follow-up rather than fixed here", the exact anti-pattern rule 13 retires. Currently benign only because today's top-weighted live jurisdictions happen to match cleanly. | [CONFIRMED] read directly | P2 | A small ISO-3166 alias table + subnational-parent containment check, scoped as its own change (the comment already specifies the shape). | S-M |
| F-FE-2 | `fsi-app/src/lib/forward-events/read-upcoming.mjs:90-97` | The identical known limitation from F-CON-2 is independently re-implemented here, with its own near-duplicate comment. Deliberate (the file states why: "free of a cross-directory... dependency for one three-item set"), but means the eventual fix (F-CON-2) has at least two call sites to update, plus `community/rooms.ts`'s own separate region-vocabulary reconciliation as a third related concept. | [CONFIRMED] read directly | P3 | When the F-CON-2 alias table is built, make it the one shared import both files pull from; a plain data table has no live-client dependency to avoid (unlike `rooms.ts`'s region set). | S (once F-CON-2 lands) |
| F-LLM-2 | `fsi-app/src/lib/llm/skill-loader.ts:56-267` | A ~3,500-token prose subset of the `environmental-policy-and-innovation` skill is hand-maintained as a JS template literal, manually kept in sync with the real skill doc, no automated drift check. | [CONFIRMED] read directly | P3 | A test that extracts the closed vocabularies (severity labels, topic tags, jurisdictions) from their live SoT and asserts this constant's prose lists agree, the same self-check pattern `derive-tags.mjs`/`tag-aliases.mjs` already use. | S |

### Class: spend-chokepoint coverage (rule 15-adjacent)

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| F-LLM-1 | `fsi-app/src/lib/llm/haiku-classify.ts:167-219` (`haikuVerifyCandidate`) | Constructs `new Anthropic({apiKey})` and calls `.messages.create()` directly, a real, metered Haiku call with no `SpendTicket`, no `assertBudget`, no `agent_runs` telemetry, bypassing the spend chokepoint `spend-client.ts` names as the system's central invariant ("EVERY call requires a SpendTicket... Ticketless = THROW"). **On verification**, this is a KNOWN, TRACKED exception: `.discipline/fitness/functions/F15-spend-chokepoint.mjs:35`'s `LEGACY_ALLOWLIST` explicitly names this file with `reviewByPhase: 'chokepoint-classifier-migration'`. Not a silently-undiscovered gap, F15 does not flag it. `first-fetch-classify.ts` was already migrated off the same allowlist (2026-09-02) using exactly `spend-client.ts`'s `spendMessage()`, proving the migration path this file has not yet taken. | [CONFIRMED] code fact + tracked-exception status both verified | P2 (downgraded from initial P1 read, real but tracked debt, not a live undiscovered hole) | Migrate `haikuVerifyCandidate` to `spendMessage()` the same way `first-fetch-classify.ts` was migrated (add a `STANDING_TICKET_CLASSES` entry, route through `spend-client.ts`, drop the allowlist entry). | S |

### Class: file size (>800 lines)

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| F-FE-1 | `fsi-app/src/lib/forward-events/extract-forward-events.mjs` (1,945 lines); `extract-forward-events.test.mjs` (1,778 lines) | Both far exceed the 800-line flag. Read in full and judged justified: one coherent concern (a hand-written date/trigger grammar) carrying nine documented incident-driven fix lanes, each with root-cause measurement and a regression fixture, not an accreted grab-bag. | [CONFIRMED] read in full | P3 (informational) | No split recommended, the regex/state is tightly coupled and a split would fragment a single grammar across files for no functional gain. | L if pursued; not recommended |

### Class: unverified production-path risk

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| F-CON-3 | `fsi-app/src/lib/connections/derive-tags.mjs:90-96,189-190` | Production module does `readFileSync` on two sibling `.ts` files at **module import time** to extract vocabulary constants (deliberate, avoids a second hand-copied vocabulary, and self-checked against the live vocab at import). Not independently verified whether any caller of this module (via `tag-input.mjs`/`tag-aliases.mjs`) is reachable from a live Next.js API route/server component whose serverless bundle could tree-shake the sibling `.ts` files, which would make the fail-closed import-time throw take down that route at cold start. | [HYPOTHESIS], the code fact (fs read at import time) is confirmed; reachability from a live route is not | P2 if reachable, P4 if script/test-only | Grep every importer of `derive-tags.mjs`/`tag-aliases.mjs`/`tag-input.mjs` outside `*.test.mjs`/`*.npmtest.mjs`/`scripts/` to confirm none is a live API route; if one exists, either bundle the two `.ts` files as data assets or extract the vocab constants to a shared, bundler-safe module. | S (grep) / M (fix if needed) |

### Class: cost/latency shape (unverified against production)

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| F-INT-2 | `fsi-app/src/lib/intake/mint-item.ts:376-407` | Rule 16(f) timeline backfill reads `agent_run_searches` unconditionally whenever an item has no `item_timelines` row, even though the file's own comment says "there is USUALLY no capture yet... this is honestly a no-op most of the time today", an extra per-mint read for a step that almost never does anything. | [HYPOTHESIS], not verified against production query volume/latency | P3 | A cheap pre-check (e.g. skip when the seed carries no title) if mint-time latency is ever measured to matter. | S if pursued |

## Top 10 a senior reviewer would call out first

1. **F-INT-1** [CONFIRMED], the silent-swallow write pattern in `mint-item.ts`/`flywheel-defect.ts` is the one finding with real blast radius: it means the *safety net itself* (rule-16(d) defect recording) can fail with zero trace, undermining the audit trail every other non-fatal-failure design in this lane depends on.
2. **F-LLM-1**, even though downgraded to "tracked debt," an ungated live Anthropic API call sitting on an allowlist since an unstated date, with no target date on `reviewByPhase`, is exactly the kind of item that should not still exist given how rigorously the rest of `llm/` enforces the chokepoint.
3. **F-CON-2 / F-FE-2**, the jurisdiction-alias gap is small today but will silently misfire the moment a `'uk'`-keyed workspace profile or a `US-CA`-scoped item is used; it is duplicated in two files, tripling the fix cost if left further.
4. **F-COM-1 / F-CON-1**, same error-swallow class as F-INT-1 but in read paths (profile/entity lookups) rather than writes; lower blast radius but same root cause.
5. **F-CON-3** [HYPOTHESIS], worth five minutes to rule out: a fail-closed `readFileSync` at module scope in a lane this rigorous about "never fabricate" is exactly the kind of thing that should never accidentally 500 a live route.
6. **F-FE-1**, flagged per the size checklist; not actually a problem on inspection, but the biggest single file in the lane and worth knowing about before anyone else edits it.
7. **F-LLM-2**, a second, hand-maintained copy of skill vocabulary with no drift check; cheap to close with a self-check test.
8. **F-INT-2**, a possible unnecessary per-mint read; worth a look once mint-time latency is ever profiled, not before.
9. The **overall discipline itself** is worth flagging positively: `tag-yield.fixture.test.mjs`, `record-facts.npmtest.mjs`, and the `feslot2-live-118.json`/`fwdtext3-live-58.json` property tests in `extract-forward-events.test.mjs` all re-verify grounding claims against real corpus snapshots rather than asserting them in prose, this is what CLAUDE.md rule 14/15 ask for, actually done.
10. No fabrication, no grounding violation, no dead mint path, and no duplicate-implementation-of-one-concept was found beyond the two documented/reasoned jurisdiction-matching cases (F-CON-2/F-FE-2), for a 30k-line, data-machine-critical lane, that is the headline finding.

## Decision-ready build items

Ranked by (severity × effort), everything here is S or S-M effort:

1. **F-INT-1** [CONFIRMED] (S): add a `fireAndForgetInsert(promise, label)` helper in a shared location (e.g. alongside `flywheel-defect.ts`), swap in at all four cited call sites, and check `apply-staged-update.ts`/`apply-mint-batch.mjs` for siblings.
2. **F-LLM-1** (S): migrate `haikuVerifyCandidate` to `spend-client.ts`'s `spendMessage()` following the `first-fetch-classify.ts` precedent exactly; drop the `LEGACY_ALLOWLIST` entry in the same PR.
3. **F-COM-1 / F-CON-1** (S each): destructure and log `error` at the four cited call sites.
4. **F-CON-3** (S): grep-verify no live route imports `derive-tags.mjs`/siblings; close as REFUTED if none found, else escalate.
5. **F-LLM-2** (S): add a live-vocabulary self-check test for the hardcoded skill subset.
6. **F-CON-2 / F-FE-2** (S-M): build the ISO-3166 alias table once, point both call sites at it.

## Coverage appendix

One row per file in the lane's read set. 156 files, 156 rows (matches the file count reported by the setup command).

| path | lines | read in full | verdict / finding ids |
|---|---|---|---|
| fsi-app/src/lib/community/antitrust.mjs | 222 | yes | clean |
| fsi-app/src/lib/community/antitrust.test.mjs | 208 | yes | clean |
| fsi-app/src/lib/community/benchmark.mjs | 173 | yes | clean |
| fsi-app/src/lib/community/benchmark.test.mjs | 159 | yes | clean |
| fsi-app/src/lib/community/corroboration.mjs | 39 | yes | clean |
| fsi-app/src/lib/community/corroboration.test.mjs | 99 | yes | clean |
| fsi-app/src/lib/community/decay.mjs | 55 | yes | clean |
| fsi-app/src/lib/community/decay.test.mjs | 48 | yes | clean |
| fsi-app/src/lib/community/identity.mjs | 48 | yes | clean |
| fsi-app/src/lib/community/identity.test.mjs | 59 | yes | clean |
| fsi-app/src/lib/community/index.mjs | 55 | yes | clean |
| fsi-app/src/lib/community/index.test.mjs | 37 | yes | clean |
| fsi-app/src/lib/community/lineage-guard.mjs | 46 | yes | clean |
| fsi-app/src/lib/community/lineage-guard.test.mjs | 48 | yes | clean |
| fsi-app/src/lib/community/no-dm-guard.test.mjs | 35 | yes | clean |
| fsi-app/src/lib/community/organisation-key.mjs | 130 | yes | clean |
| fsi-app/src/lib/community/organisation-key.test.mjs | 107 | yes | clean |
| fsi-app/src/lib/community/organisation-salt.test.mjs | 39 | yes | clean |
| fsi-app/src/lib/community/organisation-salt.ts | 41 | yes | clean |
| fsi-app/src/lib/community/profile-policy.mjs | 116 | yes | clean |
| fsi-app/src/lib/community/profile-policy.test.mjs | 103 | yes | clean |
| fsi-app/src/lib/community/respond.mjs | 92 | yes | clean |
| fsi-app/src/lib/community/respond.test.mjs | 132 | yes | clean |
| fsi-app/src/lib/community/rooms.test.mjs | 41 | yes | clean |
| fsi-app/src/lib/community/rooms.ts | 158 | yes | clean |
| fsi-app/src/lib/community/shell-context.npmtest.mjs | 66 | yes | clean |
| fsi-app/src/lib/community/shell-context.ts | 164 | yes | F-COM-1 |
| fsi-app/src/lib/connections/anticipate.mjs | 163 | yes | clean |
| fsi-app/src/lib/connections/anticipate.test.mjs | 118 | yes | clean |
| fsi-app/src/lib/connections/brief-candidates.mjs | 235 | yes | clean |
| fsi-app/src/lib/connections/brief-candidates.test.mjs | 248 | yes | clean |
| fsi-app/src/lib/connections/brief-staleness.mjs | 43 | yes | clean |
| fsi-app/src/lib/connections/brief-staleness.test.mjs | 62 | yes | clean |
| fsi-app/src/lib/connections/cluster.mjs | 226 | yes | clean |
| fsi-app/src/lib/connections/cluster.test.mjs | 135 | yes | clean |
| fsi-app/src/lib/connections/connection-view-model.mjs | 149 | yes | clean |
| fsi-app/src/lib/connections/connection-view-model.test.mjs | 114 | yes | clean |
| fsi-app/src/lib/connections/coverage-reflection.mjs | 61 | yes | clean |
| fsi-app/src/lib/connections/coverage-reflection.test.mjs | 58 | yes | clean |
| fsi-app/src/lib/connections/decision-note.mjs | 56 | yes | clean |
| fsi-app/src/lib/connections/decision-note.test.mjs | 48 | yes | clean |
| fsi-app/src/lib/connections/derive-tags.mjs | 599 | yes | F-CON-3 |
| fsi-app/src/lib/connections/derive-tags.test.mjs | 283 | yes | clean |
| fsi-app/src/lib/connections/discover.mjs | 174 | yes | clean |
| fsi-app/src/lib/connections/discover.test.mjs | 143 | yes | clean |
| fsi-app/src/lib/connections/flag-namespaces.mjs | 89 | yes | clean |
| fsi-app/src/lib/connections/flag-namespaces.test.mjs | 64 | yes | clean |
| fsi-app/src/lib/connections/forward-event-format.mjs | 59 | yes | clean |
| fsi-app/src/lib/connections/forward-event-format.test.mjs | 71 | yes | clean |
| fsi-app/src/lib/connections/gaps.mjs | 167 | yes | F-CON-2 |
| fsi-app/src/lib/connections/gaps.test.mjs | 133 | yes | clean |
| fsi-app/src/lib/connections/pair-view.mjs | 127 | yes | clean |
| fsi-app/src/lib/connections/pair-view.npmtest.mjs | 76 | yes | clean |
| fsi-app/src/lib/connections/resource-lookup.ts | 95 | yes | F-CON-1 |
| fsi-app/src/lib/connections/run-discovery.mjs | 71 | yes | clean |
| fsi-app/src/lib/connections/signal-candidates.mjs | 141 | yes | clean |
| fsi-app/src/lib/connections/signal-candidates.test.mjs | 104 | yes | clean |
| fsi-app/src/lib/connections/signal-confidence.mjs | 321 | yes | clean |
| fsi-app/src/lib/connections/signal-confidence.test.mjs | 251 | yes | clean |
| fsi-app/src/lib/connections/tag-aliases.mjs | 211 | yes | clean |
| fsi-app/src/lib/connections/tag-aliases.test.mjs | 136 | yes | clean |
| fsi-app/src/lib/connections/tag-input.mjs | 177 | yes | clean |
| fsi-app/src/lib/connections/tag-input.test.mjs | 133 | yes | clean |
| fsi-app/src/lib/connections/tag-yield.fixture.test.mjs | 281 | yes | clean |
| fsi-app/src/lib/connections/theme-delta.mjs | 170 | yes | clean |
| fsi-app/src/lib/connections/theme-delta.test.mjs | 124 | yes | clean |
| fsi-app/src/lib/connections/theme-stats.mjs | 58 | yes | clean |
| fsi-app/src/lib/connections/theme-stats.test.mjs | 45 | yes | clean |
| fsi-app/src/lib/connections/write-edges.mjs | 126 | yes | clean |
| fsi-app/src/lib/connections/write-edges.test.mjs | 151 | yes | clean |
| fsi-app/src/lib/credibility/chip-selection.mjs | 54 | yes | clean |
| fsi-app/src/lib/credibility/chip-selection.test.mjs | 101 | yes | clean |
| fsi-app/src/lib/forward-events/compliance-deadline-sync.mjs | 88 | yes | clean |
| fsi-app/src/lib/forward-events/compliance-deadline-sync.test.mjs | 128 | yes | clean |
| fsi-app/src/lib/forward-events/extract-forward-events.mjs | 1945 | yes | F-FE-1 |
| fsi-app/src/lib/forward-events/extract-forward-events.test.mjs | 1778 | yes | F-FE-1 |
| fsi-app/src/lib/forward-events/kind-labels.mjs | 15 | yes | clean |
| fsi-app/src/lib/forward-events/obligation-rail-select.mjs | 73 | yes | clean |
| fsi-app/src/lib/forward-events/obligation-rail-select.npmtest.mjs | 70 | yes | clean |
| fsi-app/src/lib/forward-events/read-and-extract.mjs | 399 | yes | clean |
| fsi-app/src/lib/forward-events/read-and-extract.test.mjs | 625 | yes | clean |
| fsi-app/src/lib/forward-events/read-upcoming.mjs | 211 | yes | F-FE-2 |
| fsi-app/src/lib/forward-events/read-upcoming.test.mjs | 184 | yes | clean |
| fsi-app/src/lib/intake/apply-staged-update-forward-participation.npmtest.mjs | 413 | yes | clean |
| fsi-app/src/lib/intake/apply-staged-update.ts | 345 | yes | clean |
| fsi-app/src/lib/intake/census-writer.mjs | 180 | yes | clean |
| fsi-app/src/lib/intake/census-writer.npmtest.mjs | 174 | yes | clean |
| fsi-app/src/lib/intake/flywheel-defect.ts | 80 | yes | F-INT-1 |
| fsi-app/src/lib/intake/flywheel-steps.mjs | 135 | yes | clean |
| fsi-app/src/lib/intake/intake-gates-golden.test.mjs | 54 | yes | clean |
| fsi-app/src/lib/intake/intake-url-corpus.mjs | 62 | yes | clean |
| fsi-app/src/lib/intake/mint-connections.npmtest.mjs | 142 | yes | clean |
| fsi-app/src/lib/intake/mint-domain-guard.npmtest.mjs | 44 | yes | clean |
| fsi-app/src/lib/intake/mint-dryrun-equivalence.npmtest.mjs | 96 | yes | clean |
| fsi-app/src/lib/intake/mint-enrichment.ts | 92 | yes | clean |
| fsi-app/src/lib/intake/mint-failclosed.npmtest.mjs | 58 | yes | clean |
| fsi-app/src/lib/intake/mint-forward-participation.npmtest.mjs | 237 | yes | clean |
| fsi-app/src/lib/intake/mint-idempotency.npmtest.mjs | 57 | yes | clean |
| fsi-app/src/lib/intake/mint-item-entities.npmtest.mjs | 190 | yes | clean |
| fsi-app/src/lib/intake/mint-item-grade.npmtest.mjs | 217 | yes | clean |
| fsi-app/src/lib/intake/mint-item.ts | 448 | yes | F-INT-1, F-INT-2 |
| fsi-app/src/lib/intake/mint-source-link.npmtest.mjs | 78 | yes | clean |
| fsi-app/src/lib/intake/mint-timeline-hook.npmtest.mjs | 207 | yes | clean |
| fsi-app/src/lib/intake/pool-row-contract.mjs | 38 | yes | clean |
| fsi-app/src/lib/intake/portal-harvest.npmtest.mjs | 533 | yes | clean |
| fsi-app/src/lib/intake/portal-harvest.ts | 564 | yes | clean |
| fsi-app/src/lib/intake/promote-cap.mjs | 42 | yes | clean |
| fsi-app/src/lib/intake/record-facts-research.mjs | 350 | yes | clean |
| fsi-app/src/lib/intake/record-facts-research.test.mjs | 221 | yes | clean |
| fsi-app/src/lib/intake/record-facts.mjs | 1090 | yes | clean |
| fsi-app/src/lib/intake/record-facts.npmtest.mjs | 933 | yes | clean |
| fsi-app/src/lib/intake/run-intake-cycle-record-only.npmtest.mjs | 235 | yes | clean |
| fsi-app/src/lib/intake/run-intake-cycle.npmtest.mjs | 397 | yes | clean |
| fsi-app/src/lib/intake/run-intake-cycle.ts | 503 | yes | clean |
| fsi-app/src/lib/intake/source-link-invariant.mjs | 28 | yes | clean |
| fsi-app/src/lib/intake/source-link-invariant.test.mjs | 42 | yes | clean |
| fsi-app/src/lib/intake/write-item.test.mjs | 220 | yes | clean |
| fsi-app/src/lib/intake/write-item.ts | 378 | yes | clean |
| fsi-app/src/lib/llm/first-fetch-classify.npmtest.mjs | 274 | yes | clean |
| fsi-app/src/lib/llm/first-fetch-classify.ts | 382 | yes | clean |
| fsi-app/src/lib/llm/haiku-classify.ts | 241 | yes | F-LLM-1 |
| fsi-app/src/lib/llm/metered-gate.mjs | 108 | yes | clean |
| fsi-app/src/lib/llm/metered-gate.test.mjs | 86 | yes | clean |
| fsi-app/src/lib/llm/priced-line.mjs | 77 | yes | clean |
| fsi-app/src/lib/llm/priced-line.test.mjs | 66 | yes | clean |
| fsi-app/src/lib/llm/program-total.mjs | 92 | yes | clean |
| fsi-app/src/lib/llm/program-total.test.mjs | 73 | yes | clean |
| fsi-app/src/lib/llm/skill-loader.ts | 271 | yes | F-LLM-2 |
| fsi-app/src/lib/llm/spend-client.npmtest.mjs | 125 | yes | clean |
| fsi-app/src/lib/llm/spend-client.ts | 218 | yes | clean |
| fsi-app/src/lib/llm/spend-gauge.mjs | 113 | yes | clean |
| fsi-app/src/lib/llm/spend-gauge.test.mjs | 66 | yes | clean |
| fsi-app/src/lib/llm/spend-guard.mjs | 186 | yes | clean |
| fsi-app/src/lib/llm/spend-guard.test.mjs | 169 | yes | clean |
| fsi-app/src/lib/llm/spend-regime.mjs | 74 | yes | clean |
| fsi-app/src/lib/market/carbon-cost-per-feu.mjs | 238 | yes | clean |
| fsi-app/src/lib/market/carbon-cost-per-feu.test.mjs | 225 | yes | clean |
| fsi-app/src/lib/market/carbon-intensity.mjs | 91 | yes | clean |
| fsi-app/src/lib/market/carbon-overlay-view.mjs | 117 | yes | clean |
| fsi-app/src/lib/market/carrier-ets-surcharge-envelope.mjs | 146 | yes | clean |
| fsi-app/src/lib/market/carrier-ets-surcharge-envelope.test.mjs | 132 | yes | clean |
| fsi-app/src/lib/market/headline-series-select.mjs | 197 | yes | clean |
| fsi-app/src/lib/market/market-rail-select.mjs | 113 | yes | clean |
| fsi-app/src/lib/market/market-rail-select.npmtest.mjs | 147 | yes | clean |
| fsi-app/src/lib/market/oil-bulletin-workbook.mjs | 586 | yes | clean |
| fsi-app/src/lib/market/parsers/eu-weekly-oil-bulletin.mjs | 139 | yes | clean |
| fsi-app/src/lib/market/refresh-published-price-statistics.mjs | 187 | yes | clean |
| fsi-app/src/lib/market/select-modal-factor.mjs | 174 | yes | clean |
| fsi-app/src/lib/market/series-board-view-model.mjs | 240 | yes | clean |
| fsi-app/src/lib/market/series-deltas.mjs | 184 | yes | clean |
| fsi-app/src/lib/market/series-family.mjs | 222 | yes | clean |
| fsi-app/src/lib/market/series-freshness.mjs | 107 | yes | clean |
| fsi-app/src/lib/market/series-item-map.mjs | 99 | yes | clean |
| fsi-app/src/lib/market/series-registry.mjs | 247 | yes | clean |
| fsi-app/src/lib/market/signal-promotion.mjs | 113 | yes | clean |
| fsi-app/src/lib/market/write-market-series.mjs | 68 | yes | clean |
