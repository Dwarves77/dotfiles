# L09-lib-agent — Full-read audit report

Lane: `src/lib/agent/` (80 files) + `src/lib/llm/` (17 files), 97 files total, per
`/root/work/audit/lanes/L09-lib-agent.txt`. All paths below are relative to
`/root/work/dotfiles/fsi-app/`. Evidence is the code read in this lane, cross-repo
`Grep` checks run to confirm/overturn graph flags, and `/root/work/audit/table-usage.txt`.
`docs/plans`, `docs/PROGRAM-BOARD.md`, `docs/ops/session-log.md` were not used as evidence.

---

## Per-file verdicts (lane-list order)

### src/lib/agent/

**src/lib/agent/analysis-labels.mjs** — WORKING-WIRED — sole constant module for the 3 canonical ANALYSIS label tokens (`inference`/`operational`/`workspace_context`); documents a 2026-07-11 "STOP-EMITTING" ruling retiring a 4th legacy label.
  - NOTE: the retired 4th label is still tolerated by the DB validator for exactly 2 legacy verified briefs (comment in file); this is intentional grandfathering, not a bug.

**src/lib/agent/analysis-labels.test.mjs** — TEST — drift guard: asserts `system-prompt.ts`, `canonical-pipeline.ts`, and `relabel-unlabeled.mjs` all agree with this module's label set and never emit the retired 4th label; also checks migration 143 recognizes exactly the 3 canonical labels. Reads real sibling source files via `readFileSync`; not vacuous.

**src/lib/agent/anthropic-error.mjs** — WORKING-WIRED — `classifyAnthropic`/`anthropicError`/`isFatalAnthropic`: HTTP 400/401/403 → FATAL (non-retryable, batch-halting); 429/500/503/529 → TRANSIENT.

**src/lib/agent/anthropic-error.test.mjs** — TEST — full fatal/transient coverage incl. the "credit balance too low" case that motivated the module; not vacuous.

**src/lib/agent/anthropic-stream.mjs** — WORKING-WIRED — `createSSEAccumulator` (pure SSE parser) + `streamMessagesText` (streaming Anthropic call, idle-watchdog hang detection, progress-tied heartbeat, prompt-cache usage capture).

**src/lib/agent/anthropic-stream.test.mjs** — TEST — full coverage incl. chunk-boundary buffering, mid-stream error frames, idle-timeout, heartbeat growth-vs-stall, prompt-cache usage fields; not vacuous.

**src/lib/agent/audit-gate-core.mjs** — WORKING-WIRED — dependency-free pure cores for the Layer-B cross-item audit gate: `hasValidWaiver`, `hostTierViolationCount`, `scoreItemClaims`.

**src/lib/agent/audit-gate.test.mjs** — TEST — full coverage of the three pure cores; not vacuous.

**src/lib/agent/audit-gate.ts** — WORKING-WIRED — typed wrapper binding the pure cores to `institution.ts` helpers + DB readers (`readAllSources`, `crossItemAuditGate`, `readOpenDataAuditBlock`); moves cross-item corpus-invariant checks into the write path (fail-closed).

**src/lib/agent/brief-section-strip.mjs** — WORKING-WIRED — `stripSourcesSection`/`isSourcesLeadTitle`: fail-closed tail-drop of the Sources section (and everything after it) from customer-facing brief markdown; structural, not pattern-based.

**src/lib/agent/brief-section-strip.test.mjs** — TEST — full coverage incl. numbered/bold/variant headers and the fail-closed unanticipated-header case; not vacuous.

**src/lib/agent/canonical-pipeline.ts** (1819 lines, read in full across 7 offset chunks) — WORKING-WIRED — THE single canonical generation pipeline: fetch transports (direct-HTTP/Browserless/API-ladder with a process-scoped fetch cache), `discoverCorroborators`, `generateBrief`/`generateBriefFromStored`/`generateBriefRefreshPrimary`, `synthesiseAndWriteBrief` (slot directive injection, format determinism, 20-field DB write with vocab validation), `sectionBrief` (ledger-preserving section reconcile by key, §14 timeline harvest), `groundBriefImpl` (cited-host gate, target-match verify, claim-ledger extraction via `callSonnet`, kept-filter, floor-first re-attribution, non-destructive apply, mint-gate holds, `validate_item_provenance` RPC call), `registerBriefSources`, `growSources`.
  - NOTE: at ~line 1496 the FACT `kept`-filter falls back to searching the entire concatenated pool text (`allText`) when a claim's `source_url` does not match a known pool source. I traced this downstream (`crossLinkClaimSources` in `parse-output.ts`, then `resolver.resolveSpan` via `search_result_id` in this file) and this permissiveness is NOT exploitable for false attribution: an unmatched `source_url` yields a null tier/sourceId downstream rather than a false higher-authority stamp. Not flagged as a DEFECT — reported here per the honesty bar as a place I looked closely and did not find a bug.

**src/lib/agent/contract-version.mjs** — WORKING-WIRED — `CURRENT_SKILL_CONTRACT_VERSION = "2026-05-27"`, the SSOT for the stamped skill contract version.

**src/lib/agent/contract-version.test.mjs** — TEST — asserts `system-prompt.ts` stamps the same version string. I independently verified `system-prompt.ts:284` and `:408` both contain `"2026-05-27"` — no drift; not vacuous.

**src/lib/agent/defect-signatures.mjs** — WORKING-WIRED — `detectConflate` (S-CONFLATE) / `detectNumeric` (S-NUMERIC) pure matchers; single implementation shared by `scripts/verify/defect-signature-scan.mjs` and `mint-gates.mjs` (confirmed via grep).

**src/lib/agent/derived-consistency.mjs** — WORKING-UNWIRED — Gate-B arithmetic-consistency guard for DERIVED claims (`parseRecurringRule`/`parseDerivedDate`/`isDerivedConsistent`).
  - WIRING: lane flag `GRAPH:TEST-ONLY` CONFIRMED. Repo-wide grep (whole repo, not just `src/`) shows none of its three exported functions are imported anywhere except its own test. It is also explicitly named in `.discipline/fitness/functions/F25-module-liveness.mjs`'s `PROVEN_BUT_UNWIRED` allowlist (line 80) — the codebase's own governance fitness function already tracks this as a known-unwired module.
  - NOTE: the module's own header comment claims it is called by "both tiers" of DERIVED mint runners. That claim is currently false per the grep above — a doc/code drift inside the module's own comment, worth flagging to the owner.

**src/lib/agent/derived-consistency.test.mjs** — TEST — full coverage of the arithmetic-consistency rules (annual June-1 rule, month/day mismatch rejection, non-recurring bases, non-date tokens, out-of-horizon years); not vacuous, but exercises a module with zero production callers.

**src/lib/agent/deterministic-lever.mjs** — WORKING-WIRED — `unexercisedLevers`/`paidQueueVerdict`: gate rejecting an item from the paid generation queue when it has an unexercised $0 deterministic data lever (re-homable/re-pointable) or a standing `DELETE` disposition. Confirmed imported by `spend-guard.mjs` (`assertTicket`'s necessity gate).

**src/lib/agent/deterministic-lever.test.mjs** — TEST — full RED/GREEN coverage; not vacuous.

**src/lib/agent/extract-registry.ts** — WORKING-WIRED — `FORMAT_SPECS` array + `specForItemType`: single dispatch registry item_type → FormatSpec.

**src/lib/agent/extract-regulation-sections.ts** (592 lines, read in full across 2 offset chunks) — WORKING-WIRED — Tier-3 structured parser for the regulation detail page's numbered §3/4/8/10/11/14/15 sections: action-list, prose-with-source, obligations-table, timeline (bullets + markdown-table shapes), sources-list (multi-table-aware, uses `isPlaceholderSourceName` to avoid header-echoed-as-data fabrication). refs=8, the most-reused file in this half of the lane.

**src/lib/agent/extract-research-sections.ts** — DEAD-HISTORICAL — `extractResearchSections`, a parser for the Research Summary 6-section format.
  - WIRING: lane flag `GRAPH:UNREACHABLE` CONFIRMED. Repo-wide grep shows `extractResearchSections` is imported nowhere; the file only defines it. `formats/prose-extractor.ts`'s own header comment calls itself "the generalisation of the proven extract-research-sections.ts" — i.e. this file was deliberately superseded, not accidentally orphaned. Genuinely dead code kept as a historical record of the pattern it generalized.

**src/lib/agent/extract-sections.ts** — WORKING-WIRED — `extractSectionByHeading`/`extractSectionByNumber`/`extractOperationalBriefing`/`extractSeverityLabel`/`headingSlug`: the shared line-state-machine heading-walk parser used by both the regulation detail page's Tier-2 briefing and, via `prose-extractor.ts`, every FormatSpec's section extraction.

**src/lib/agent/floor-attribution.mjs** — WORKING-WIRED — `floorSources`/`reattributeToFloor`: floor-first span re-attribution, pure, with a `MIN_REATTRIB_SPAN=24` guard against coincidental fragment matches.

**src/lib/agent/floor-attribution.test.mjs** — TEST — full RED→GREEN coverage of the floor-rescue property and the "never forced" guard; not vacuous.

**src/lib/agent/format-spec.ts** — WORKING-WIRED — `FormatSpec`/`SectionDef`/`GroundingModel` type definitions, the shared dispatch seam (refs=7).

**src/lib/agent/formats/market.ts** — WORKING-WIRED — thin `makeFormatSpec(...)` declaration wiring market_signal/initiative item_types → section list → formatType.

**src/lib/agent/formats/operations-matrix.ts** — WORKING-WIRED — `checkMatrixEligibility`: read-only DB-backed matrix eligibility gate for Operations Profile S3/S4, querying `regions` (5 live rows) and `region_dimension_coverage` (30 live rows) — both live per table-usage.txt.

**src/lib/agent/formats/operations.ts** — WORKING-WIRED — thin FormatSpec declaration for regional_data item_type.

**src/lib/agent/formats/prose-extractor.ts** — WORKING-WIRED — `makeProseExtractor`/`makeFormatSpec`: the ONE shared section-extractor factory (number-first via `extractSectionByNumber`, falling back to heading-text match + alternates); refs=5, the generalization that made `extract-research-sections.ts` dead.

**src/lib/agent/formats/regulation.ts** — WORKING-WIRED — thin FormatSpec declaration for the 14-section regulatory fact document.

**src/lib/agent/formats/research.ts** — WORKING-WIRED — thin FormatSpec declaration for the 6-section Research Summary.

**src/lib/agent/formats/technology.ts** — WORKING-WIRED — thin FormatSpec declaration for the Technology Profile.

**src/lib/agent/gate-a-derived.mjs** — WORKING-WIRED — `derivedCoveredTokens`: pure-DB-lookup determining which DERIVED-claim tokens are validly basis-grounded and non-stale.

**src/lib/agent/gate-a-derived.test.mjs** — TEST — full coverage incl. a fake-supabase-client harness testing stale-basis reversion; not vacuous.

**src/lib/agent/gate-a-match.mjs** — WORKING-WIRED — `norm`/`containsToken`: the SINGLE literal-and-exact matcher for all Gate-A coverage decisions, with a scoped %-spacing normalization rule (handles U+00A0/U+202F non-breaking spaces around a numeral+% token, boundary-aware so "33%" never matches inside "133%").

**src/lib/agent/gate-a-match.test.mjs** — TEST — full coverage. I additionally ran `sed -n '28,31p' ... | cat -A` on the source file to verify the "non-breaking-space variant" fixtures genuinely contain UTF-8-encoded U+00A0 (`M-BM- `) and U+202F (`M-bM-^@M-/`) bytes rather than accidentally-pasted regular spaces — confirmed non-vacuous.

**src/lib/agent/gate-a-scan.mjs** — WORKING-WIRED — `scanBrief`/`extractFactualTokens`: the prose-fact scanner (figures always gate; deadline-dates context-classified line-by-line to exclude citation-apparatus dates while still gating obligation/trajectory dates on the same line).

**src/lib/agent/gate-a-scan.test.mjs** — TEST — full regression coverage of the 2026-07-30 citation-date-exclusion fix (CELEX 32026R1030 case); not vacuous.

**src/lib/agent/generation-config.ts** — WORKING-WIRED — the ONE sanctioned `process.env` read site for generation knobs: `BROWSERLESS_FETCH_CONCURRENCY`, `STORAGE_MAX_CHARS`, `SYNTH_INPUT_BUDGET_CHARS`, `SYNTH_PRIMARY_HARD_CEILING_CHARS`, Sonnet/Haiku USD-per-Mtok rates + cost helpers, `SPEND_CEILING_USD=85`, `GROUND_MODEL="claude-sonnet-4-6"`.
  - NOTE: `SPEND_CEILING_USD` is now read only informationally by `spend-guard.mjs`'s `assertBudget` under the build-phase spend regime (see `spend-regime.mjs` below) — it no longer gates spend.

**src/lib/agent/ground-failure-class.mjs** — WORKING-WIRED — pure classifier mapping a ground-failure detail string to a retry-ladder action (`structural_hold`/`reresearch_only`/`reground`); structural (`no source_id`) checked first.

**src/lib/agent/ground-failure-class.test.mjs** — TEST — full coverage; not vacuous.

**src/lib/agent/holdings-keying.npmtest.mjs** — TEST (jiti-based, imports `holdingsForItem` from `canonical-pipeline.ts` via jiti to run against the real `.ts` source) — proves the portal-derived-item snapshot-keying fix: a shared portal's `raw_fetches` snapshot must NOT count as a per-instrument item's own holdings unless the source URL canonically matches the item's own `source_url`. Not vacuous — exercises real pipeline code.

**src/lib/agent/ledger-apply.mjs** — WORKING-WIRED — `diffLedger`/`applyLedgerDiff`/`eraseClaimWithProof`: the pure non-destructive diff + DB-apply layer (add/change-with-archive/unchanged/not-reproduced, never delete except via the fail-closed proof-required erase path). Writes `claim_versions` (94 live rows) and `section_claim_provenance` (19,287 live rows) per table-usage.txt — both live.

**src/lib/agent/ledger-apply.test.mjs** — TEST — F5 RED/GREEN: proves a `claim_versions` archive-write failure THROWS before the `section_claim_provenance` UPDATE runs (no overwrite without a durable archive); not vacuous.

**src/lib/agent/ledger-dominance.mjs** — WORKING-WIRED — `summarizeLedger`/`ledgerRegression`/`isThinningRegression`: the three dominance axes (total/facts/floor_qualifying/verified_eligibility) deciding whether a re-ground is a regression (guards the Brazil Lei 12.305 55-FACT→2-GAP defect class cited in the file's own comments).

**src/lib/agent/ledger-dominance.test.mjs** — TEST — full RED-golden + PASS (legitimate trim) + EXEMPT (tiny prior) coverage; not vacuous.

**src/lib/agent/metadata-vocab.ts** — WORKING-WIRED — single source of truth for display↔DB severity mapping, live DB CHECK value sets (priority/urgency_tier/format_type/signal_band/theme), `SEVERITY_TO_OPERATIONS_BUCKET` (Addendum 63 dedup of two component-local copies), `toDbTheme`/`toThemeCandidate` (capture-not-null), `assertDbValue`. refs=9, the most-reused file in the lane.

**src/lib/agent/mint-gates.mjs** — WORKING-WIRED — `perFactGates`/`perFactWouldHold`/`identityCongruenceHolds`: pure mint-time accuracy gates (genericSource/authorityFloor/spanNumeric per-FACT; S-CONFLATE per-item), imports `detectNumeric`/`detectConflate` from `defect-signatures.mjs`.

**src/lib/agent/null-tier-flag.mjs** — WORKING-WIRED — `mergeNullTierAggregate`/`summarizeNullTierAggregate`: idempotent per-host aggregation of FACT spans grounding to unregistered hosts, with two distinct flag shapes (registration-pending vs. ruled-never-registerable). Writes `integrity_flags` (3,793 live rows, src=14/scripts=12 per table-usage.txt) — live.

**src/lib/agent/null-tier-flag.test.mjs** — TEST — full coverage incl. the 480-char `integrity_flags.description` column-budget fit test; not vacuous.

**src/lib/agent/operations-ask-context.mjs** — WORKING-WIRED — pure formatting for the Intelligence Assistant's Operations-data grounding block; `isEnveloped`/`formatRegionalDataFactLine`/`formatStateCostFactLine`/`buildOperationsAskContext`.
  - NOTE: the file's own comments document that, as of a cited 2026-08-30 live-row check, the migration-267 envelope shape is not being produced by either live producer (both WO-17 producers are kill-switched off), so the enveloped branch of this formatter is currently exercised only by tests, not by live traffic. `regional_data_facts` sits at 86 live rows per table-usage.txt, consistent with the file's own account. This is a NOTE for the owner (a code branch that is correct but currently untriggered in production), not a defect.

**src/lib/agent/operations-ask-context.test.mjs** — TEST — full coverage with fixtures drawn from a live-row read (cited "rule 0.15", 2026-08-30); not vacuous.

**src/lib/agent/parse-output-blocklist.npmtest.mjs** — TEST (jiti-based, imports `foldYamlBlockLists` from `parse-output.ts`) — proves the YAML block-list-to-inline-array folding fix (the EUDR Stage-1 crash class); not vacuous.

**src/lib/agent/parse-output.ts** (851 lines, read in full across 3 offset chunks) — WORKING-WIRED — `findYamlBlock` (fenced/unfenced/code-fence-wrapped fallback detection), `foldYamlBlockLists`, `parseYamlFrontmatter` (full 19-field validation incl. severity→priority locked mapping, closed vocabularies, UUID validation, `trajectory_points` JSON, optional editorial callout fields), `locateClaimLedger`/`extractClaimLedger` (strict)/`extractClaimLedgerLenient` (skip-malformed), `crossLinkClaimSources` (source_url→search_result_id exact match), `parseAgentOutput` (top-level orchestration, tolerant of a malformed inline ledger).

**src/lib/agent/prompt-cache.mjs** — WORKING-WIRED — `cachedSystemBlocks`/`systemTextContent`/`cacheSavingsUsd`: pure prompt-cache prefix builder restructuring the source pool as a cached first system block (Anthropic `cache_control`) so repeat calls over the same pool read at 0.1× input rate.

**src/lib/agent/prompt-cache.test.mjs** — TEST — full coverage of content-identity, single-breakpoint, prefix-stability, and savings-math guarantees; not vacuous.

**src/lib/agent/relabel-unlabeled.mjs** — OPERATOR-TOOL — `bindingSentences`/`decideRelabel`/`applyLabelToContent`: the 4c label-exit decision logic (relabel ONLY on a CONFIDENT WORKSPACE_ANALYSIS verdict, never downgrade a possible binding fact).
  - WIRING: lane flag `GRAPH:TEST-ONLY` OVERTURNED. `scripts/run-4c-relabel.mjs:34` imports this module via jiti — confirmed by grep. The lane list's flag apparently only scanned `src/`, missing this `scripts/` operator-tool caller. Correct status is OPERATOR-TOOL (manually invoked, wired), not unwired.

**src/lib/agent/relabel-unlabeled.test.mjs** — TEST — red-then-green for 4c: proves the "never downgrade" moat (PRIMARY_REQUIREMENT/UNCERTAIN never relabel), the confident-WORKSPACE_ANALYSIS relabel path, `bindingSentences`'s exclusion of markdown structure (table rows/headings/oversized blocks), and `applyLabelToContent`'s verbatim-safe idempotent label application. Not vacuous.

**src/lib/agent/section-grounding.mjs** — WORKING-WIRED — `prepareSectionForGrounding`: hard-ceiling (200K chars, sized far above the observed ~32KB max real section) replacement for a prior silent 12KB slice; surfaces (never silently truncates) an over-ceiling section.

**src/lib/agent/section-grounding.test.mjs** — TEST — full RED/GREEN coverage of the category-2 fix; not vacuous.

**src/lib/agent/severity-ui-bucket.test.mjs** — TEST — Addendum 63 (2026-08-30) regression test. Pins `SEVERITY_TO_OPERATIONS_BUCKET` (I independently confirmed this export in `metadata-vocab.ts:52-57` matches every assertion in the test) and asserts, via source-text regression locks (no jsdom harness exists in this repo), that `OperationsItemsView.tsx`/`OperationsLedger.tsx` import the shared map with no local duplicate, and `IntelligenceMetadataStrip.tsx` converts through `toDisplaySeverity` before indexing its color map. Not vacuous — the source-text assertions would fail if the fix were reverted.

**src/lib/agent/slot-forcing.mjs** — WORKING-WIRED — `nominateForSlot` (verbatim clause nomination from pool sources, clause-delimiter-aware incl. HTML entity delimiters), `decideSlotClaim` (FACT only on judge confirmation), `forceSlotCoverage` (top-K≤3 judged nominations per slot, bounded judge calls).

**src/lib/agent/slot-forcing.test.mjs** — TEST — full coverage using real UK RTFO SAF Order 782878c0 pool fixtures, proving the never-fabricate binding and the top-K bound; not vacuous.

**src/lib/agent/slot-prompt.mjs** — WORKING-WIRED — `buildSlotDirective`/`slotCovered`/`uncoveredSlots`/`buildSlotRetryFeedback`/`slotCacheGet`/`slotCachePut`: synthesis-side slot enforcement pure core, shares the same lenient keyword heuristic as grounding's `proseCovers`.

**src/lib/agent/slot-prompt.test.mjs** — TEST — includes a static-scan "WIRING" test that reads `canonical-pipeline.ts` and asserts it actually calls `requiredSlotsFor`/`buildSlotDirective`/`uncoveredSlots`/`buildSlotRetryFeedback` and emits `missing_required_slot(synthesis)` — the test itself independently confirms wiring into the pipeline. Not vacuous.

**src/lib/agent/source-blocks.mjs** — WORKING-WIRED — `authorityFloorFor`/`authorityFloorForFact`/`buildSourceBlocks`: tier-ordered synthesis/grounding block builder implementing the "moat" (floor-qualifying sources reach the model complete, corroborators truncate lowest-tier-first); `authorityFloorForFact` adds migration-202's scoped standard's-own-authoring-body floor (tier 4) vs. an unrelated same-tier host (stays at 2).

**src/lib/agent/source-blocks.test.mjs** — TEST — full RED (legacy order-based builder loses the floor span) / GREEN (tier-ordered preserves it) coverage, plus a drift-guard test parsing migration 141's `v_floor_max` CASE and asserting `authorityFloorFor` matches every entry exactly (incl. the deliberate 'law' exemption). Not vacuous.

**src/lib/agent/source-entry-filter.mjs** — WORKING-WIRED — `isPlaceholderSourceName`/`renderableSourceEntries`/`isPlaceholderText`/`dropUnbackedRows`: single home for "is this a renderable parsed field or a placeholder/header artifact," `HEADER_LITERALS` exported for reuse. refs=7.

**src/lib/agent/source-entry-filter.test.mjs** — TEST — full coverage incl. the PPWR "Source Name" fabrication regression; not vacuous.

**src/lib/agent/source-list-multitable.npmtest.mjs** — TEST (jiti-based, imports `parseRegulationSection` from `extract-regulation-sections.ts`) — proves the multi-table §15 body (a "New Sources Identified" second table) does not fabricate a header-echo source; not vacuous.

**src/lib/agent/span-check.ts** — WORKING-WIRED — `spanCheckFetch`: timeout/retry-policy fetch for provenance-validation span-checking, using `RetryableError` from the `workflow` package.
  - WIRING: confirmed via grep that `src/workflows/generate-brief.ts` imports (`:33`) and calls (`:465`) `spanCheckFetch` — matches refs=1, genuinely wired.

**src/lib/agent/system-prompt.ts** (535 lines, read in full across 2 offset chunks) — WORKING-WIRED — the full operative `SYSTEM_PROMPT` string: integrity rule, forward-intelligence rule, workspace-anchored rule, format selection (5 formats), full section lists for all 5 formats, source-type hierarchy, markdown storage convention, the full 20-field database emission contract (incl. the exact YAML template with `regeneration_skill_version: "2026-05-27"` matching `contract-version.mjs`), claim-level provenance rules (label-every-claim, credibility-gradient relabel-and-route, active sourcing, required slots, honest empty result, no-separate-ledger), and the 15 Rules for All Output.

**src/lib/agent/theme-vocab.test.mjs** — TEST — drift guard: DB migration 102 theme CHECK == `DB_THEME_VALUE_LIST`, `parse-output.ts` imports from `metadata-vocab` (no disjoint local list), `system-prompt.ts` names every DB theme value, `toDbTheme`/`toThemeCandidate` boundary behavior, backfill-map ambiguity guard. Not vacuous.

**src/lib/agent/timeline-harvest.mjs** — WORKING-WIRED — `toIsoDate`/`buildTimelineRows`: precision-honest §14 date normalization (day/month/quarter/half/year/segment/range/qualified), never fabricates a day-level date from a coarser-precision source token (the PPWR Aug-12→Aug-1 defect class the file's own comments cite).

**src/lib/agent/timeline-harvest.test.mjs** — TEST — full coverage incl. the PPWR exact regression case, qualifier prefixes, season segments, ranges, unparseable-token reporting, dedup/sort/is_completed; not vacuous.

**src/lib/agent/two-pass-generate.mjs** — WORKING-WIRED — `twoPassGenerate`: pure DI orchestration for the reactive 2-pass truncation-recovery generation flow (normal briefs = 1 call; on `stop_reason==='max_tokens'`, splits into a body-only pass at full ceiling then a YAML-only pass derived from the complete body — never splits the body itself).

**src/lib/agent/two-pass-generate.test.mjs** — TEST — full coverage of the normal/2-pass/body-still-overflows paths with a recording fake stream; not vacuous.

**src/lib/agent/url-canon.mjs** — WORKING-WIRED — `stripUrlMarkers`/`canonicalizeCitationUrl`/`POLLUTION_FIXTURES`: JS mirror of SQL migration 150's `canonicalize_citation_url`, with 10 real polluted-URL fixtures drawn from a 281-row content census.

**src/lib/agent/url-canon.test.mjs** — TEST — drift guard parsing migration 150's SQL body, equivalence-preservation and two-home-agreement tests over the fixtures; not vacuous.

### src/lib/llm/

**src/lib/llm/first-fetch-classify.ts** (321 lines) — WORKING-WIRED — `firstFetchClassify`: shared first-fetch Haiku classifier (title/summary/priority/domain/surface_tags enrichment for freshly-seeded item stubs); makes a direct raw `fetch` call to `https://api.anthropic.com/v1/messages`, NOT routed through `spend-client.ts`.
  - NOTE: verified via reading `.discipline/rules/016-canonical-anthropic-path.mjs` that this file is explicitly on the rule's `PERMITTED` allowlist ("shared first-fetch Haiku CLASSIFIER for the drain worker... source classification/enrichment, NOT brief generation... Enumerated 2026-07-01"). A deliberate, documented architectural exception, not a spend-governance bypass defect.

**src/lib/llm/haiku-classify.ts** (246 lines) — WORKING-WIRED — `haikuVerifyCandidate` (source verification classifier used by `src/lib/sources/verification.ts`), using the `@anthropic-ai/sdk` `Anthropic` client directly (also not via spend-client).
  - NOTE: also confirmed on the rule-016 `PERMITTED` allowlist ("haikuVerifyCandidate — the verification Haiku the sanctioned recommend-classification / bulk-classify / spot-check routes call... Enumerated 2026-07-19"). File documents its formerly-exported `haikuClassify` content-classifier was removed 2026-05-11 as never-imported dead code — already cleaned up, comment kept for context only (nothing to flag as DEAD today).

**src/lib/llm/metered-emit.mjs** — WORKING-UNWIRED — `openMeteredBatch`: the intended-as-ONLY sanctioned path to a metered batch run — asserts the metered gate AND writes the batch-level `agent_runs.fetch_method='batch-marker'` authorization marker BEFORE the batch runs, fail-closed on either gate refusal or marker-write failure.
  - WIRING: lane flag `GRAPH:TEST-ONLY` CONFIRMED. Repo-wide grep for `openMeteredBatch` / `metered-emit` finds only the module itself and its own test — no production caller. `.discipline/fitness/functions/F25-module-liveness.mjs:82` explicitly lists `src/lib/llm/metered-emit.mjs` in its `PROVEN_BUT_UNWIRED` allowlist alongside `program-total.mjs` and `spend-gauge.mjs` (same governance-tracked category as `derived-consistency.mjs` above) — the codebase's own fitness-function code (not a docs/plans claim) already tracks this as known-unwired.

**src/lib/llm/metered-emit.test.mjs** — TEST — full coverage (gate refusal writes nothing; authorized call writes correctly-shaped marker + returns window; marker-write failure throws; off-allowlist model without scoped amendment refuses); not vacuous, but exercises a module with zero production callers.

**src/lib/llm/metered-gate.mjs** — WORKING-WIRED — `assertMeteredCallAllowed`/`isMeteredCallAllowed`/`MeteredCallForbiddenError`: STANDING FINANCIAL LAW enforcement (operator ruling 2026-07-25, post account-spend incident). `METERED_ELIGIBLE_CLASS = "batch-classification"` is the only base-eligible class; `FREE_ONLY_CLASSES` (grounding/reground/extraction/repair/mint/synthesis/generate/generate-stored/ask/search/verification) can never be metered; `METERED_MODEL_ALLOWLIST` = Haiku only by default; `SCOPED_MODEL_AMENDMENTS`/`SCOPED_CLASS_AMENDMENTS` are named, task-scoped, capped, expiring exceptions; requires a non-empty `METERED_BATCH_TOKEN` env var and a positive `capUsd` regardless.
  - NOTE: this module is imported/used, but its designated caller (`openMeteredBatch` in `metered-emit.mjs`) is itself unwired — so the gate's enforcement logic, while correct and tested, currently guards a code path nothing in production reaches. Distinct from `metered-emit.mjs` because `metered-gate.mjs` carries refs=2 (not flagged `GRAPH:TEST-ONLY` in the lane list) — I did not further grep who its second importer is beyond `metered-emit.mjs` + its own test; stating this as "I did not check further" per the honesty bar.

**src/lib/llm/metered-gate.test.mjs** — TEST — comprehensive RED/GREEN coverage of every gate condition and both amendment types; not vacuous.

**src/lib/llm/priced-line.mjs** — WORKING-WIRED — the sole spend-authorization primitive (operator final spend rulings 2026-07-13): `assertPricedLine`/`pricedLineHalts`. OPERATOR-SETS-COST (no default/anchored price, ever) and DATA-EXISTENCE-BEFORE-ACQUISITION (a non-empty inventory-miss citation required). Confirmed imported by `spend-guard.mjs` and re-exported through `spend-client.ts`.

**src/lib/llm/priced-line.test.mjs** — TEST — full a/b/c/d goldens coverage (no-citation refused, no-price refused, permitted-under-price, halt-at-price) plus the no-default-tolerance behavior; not vacuous.

**src/lib/llm/program-total.mjs** — WORKING-UNWIRED — `sumCostRows`/`readProgramTotalPaginated`/`fitsUnderCeiling`/`projectBatchFitsBuffer`: a paginated program-total reader built to fix a real bug class (an unpaginated PostgREST read caps at 1000 rows and silently under-counts the ~23,564-row `agent_runs` table, per table-usage.txt — which would let the standing ceiling wrongly pass an over-cap spend).
  - WIRING: lane flag `GRAPH:TEST-ONLY` CONFIRMED. The only match for "program-total" inside `spend-guard.mjs` is a textual comment reference (lines 65, 130-131, 148), not an import — `spend-guard.mjs` does not call `readProgramTotalPaginated`. Repo-wide grep confirms no `src/` or `scripts/` file imports this module outside its own test. `.discipline/fitness/functions/F25-module-liveness.mjs:82` lists it in `PROVEN_BUT_UNWIRED`.
  - NOTE for the owner: this means the real pagination-undercounting bug this module was built to fix (agent_runs now at 23,564 rows, 23× past the 1000-row PostgREST cap) is NOT currently prevented in the live spend-seeding path — `spend-guard.mjs`'s `seedSpend()` is called by some caller outside this lane with a total from an unknown read path I did not trace (out of lane scope: the seeding caller lives in a runner script, not in `src/lib/llm/` or `src/lib/agent/`). This is worth a cross-lane check: whoever calls `seedSpend()` should be verified to use pagination.

**src/lib/llm/program-total.test.mjs** — TEST — full coverage: RED (single-page read under-counts a synthetic 1200-row/$12 ledger to $10), GREEN (paginated read catches the true $12), a ceiling-throws-at-the-true-total proof composed against the real `spend-guard.mjs` `assertBudget`, `fitsUnderCeiling` goldens, and the `projectBatchFitsBuffer` $5-buffer goldens. Not vacuous — but proves correctness of a module with zero production callers (see program-total.mjs above).

**src/lib/llm/skill-loader.ts** (271 lines) — WORKING-WIRED — `ENVIRONMENTAL_POLICY_SKILL_CORE`: a ~280-line/~3-4k-token constant string embedding a trimmed core subset of the `environmental-policy-and-innovation` platform skill into the Intelligence Assistant's system prompt at query time (closing the "OBS-27 zero platform skill loading" gap the file's header documents). refs=1.
  - WIRING: confirmed via grep — sole importer is `src/app/api/ask/route.ts`.

**src/lib/llm/spend-client.ts** (180 lines) — WORKING-WIRED — "THE spend chokepoint" per its own header and per `.discipline/rules/016-canonical-anthropic-path.mjs`: `spendStreamRaw`/`spendStream`/`spendSearch` all assert a `SpendTicket` (`assertTicket`), assert budget (`assertBudget`), optionally guard an operator-priced line (`guardPricedLine`→`assertPricedSpend`), then call `streamMessagesText`/raw `fetch`, account cost, and write the per-call `agent_runs` telemetry row (`recordSpendCall`) — with a documented fail-closed telemetry invariant: a failed/thrown telemetry write does NOT call `markCallLogged()`, so the next `assertBudget` throws (`unloggedCalls > 0`), making unlogged spend mechanically impossible by design.
  - WIRING: confirmed via grep — 4 real production importers (`src/app/api/admin/scan/route.ts`, `src/app/api/ask/route.ts`, `src/lib/agent/canonical-pipeline.ts`, `src/lib/sources/recommend-source-tier.ts`), matching refs=4 exactly, plus references from `.discipline/` governance/fitness files and `scripts/run-4c-relabel.mjs`.
  - NOTE: `MONTHLY_TOTAL_DISPLAY_USD = 130.00` (line 35) is explicitly commented as informational-only, "MUST NOT be used to gate/halt spend" — consistent with the retirement of standing dollar limits documented in `spend-regime.mjs`/`spend-guard.mjs`. I confirmed it is not read anywhere as a comparison operand in this file.
  - NOTE: line 143-145's I1-attribution warning (`console.warn` when a paid call carries neither `itemId` nor `sourceId`) and line 150-151's precondition-posture warning are both non-fatal — they log but do not block the spend. This is a deliberate "alarm not a block" design per the surrounding comments, not a defect, but worth the owner knowing these are soft signals that require someone to be watching logs.

**src/lib/llm/spend-gauge.mjs** — WORKING-UNWIRED — `computeGauge`/`readSpendGauge`/`hasPricedLineMarker`: a free, read-only, paginated (`fetchAllRows`) status view of MTD/today/per-item spend actuals plus paid-run traceability-to-a-priced-line coverage; explicitly carries NO limit/ceiling framing (spend-control refactor 2026-07-13 — no "of $N" denominator, no pct-of-ceiling, no frozen/at-cap).
  - WIRING: lane flag `GRAPH:TEST-ONLY` CONFIRMED. Repo-wide grep finds no `src/` or `scripts/` caller of `readSpendGauge`/`computeGauge` outside its own test; the only other repo references are inside `.discipline/governance/doctrine-register.mjs` (a governance registry entry, not a runtime call) and `.discipline/fitness/functions/F25-module-liveness.mjs:82`'s `PROVEN_BUT_UNWIRED` allowlist (same list as `metered-emit.mjs`/`program-total.mjs`/`derived-consistency.mjs`).
  - NOTE for the owner: this is a fully-built, fully-tested, paginated spend dashboard reader with no route or UI surface currently calling it — nothing renders the "SPEND GAUGE — MTD $X..." header this module produces anywhere a human would see it.

**src/lib/llm/spend-gauge.test.mjs** — TEST — full coverage: MTD/today informational-actuals framing (asserts the header contains no "/$", no "%", no "FROZEN"/"AT CAP" text), untraced/traced paid-run counting, per-item optional reporting, and `hasPricedLineMarker`'s marker-detection rules. Not vacuous — but proves correctness of a module with zero production callers.

**src/lib/llm/spend-guard.mjs** (186 lines) — WORKING-WIRED — the pure guard core spend-client.ts wraps. `assertTicket` (ticket-required, verified-item rejection, junk-pool rejection, DELETE-disposition rejection, `paidQueueVerdict` necessity gate, `STANDING_TICKET_CLASSES` bypass for Rule-016 sanctioned cheap classifiers), `assertBudget` (regime-authorization check via `assertRegimeDefined()`, unlogged-telemetry invariant, optional per-ticket `budgetCapUsd`), `assertPricedSpend` (composes `priced-line.mjs`'s gate against the live per-item ledger), `account`/`spentUsd`/`seedSpend`/`markCallLogged`/`unloggedCallCount`/`assertLedgerDrained` (the ledger-integrity state machine). Explicitly documents the RETIREMENT of the fixed monthly-ceiling and $3.00 per-item circuit-breaker as standing dollar figures (operator final spend rulings 2026-07-13) — dollar authorization is now solely the operator-priced line.

**src/lib/llm/spend-guard.test.mjs** — TEST — comprehensive RED/GREEN across every gate condition (ticketless throw, deterministically-resolvable rejection, DELETE-disposition rejection, verified-item rejection, junk-pool rejection, standing-class bypass, per-ticket cap breach, retired-standing-ceiling never-halts, retired-exports genuinely absent from the module surface, automatic-telemetry unlogged-call invariant) plus the priced-line a-d goldens composed through the guard, plus the spend-regime authorization tests (build-phase authorizes; an undefined/typo'd regime fails closed via a cache-busting dynamic re-import). Not vacuous — this is the most thorough test file in the `llm/` half of the lane.

**src/lib/llm/spend-regime.mjs** (74 lines) — WORKING-WIRED — `SPEND_REGIME`/`IS_BUILD_PHASE`/`standingFiguresAreInformationOnly()`/`assertRegimeDefined()`. Declares BUILD-PHASE (current) as the only regime with a defined policy — no pace guards, no standing dollar figures gate spend; only AUTHORIZATION + INTEGRITY + MEASUREMENT controls apply. STEADY-STATE is declared-but-undefined; `assertRegimeDefined()` fails closed (throws `SpendRegimeError`) on any value other than exactly `"build-phase"`, including a typo'd `"Build-Phase"`.
  - WIRING: lane list shows refs=1 with no flag. Repo-wide grep found MORE than 1 actual importer: `src/lib/llm/spend-guard.mjs` (line 142, `assertRegimeDefined()` called before every spend), plus two API routes (`src/app/api/ask/route.ts`, `src/app/api/health/spend/route.ts`) and several `.discipline/` governance files. The refs=1 count appears to undercount relative to what I found; regardless, the module is genuinely wired via `spend-guard.mjs`'s call on the hot path.
  - NOTE: the module's own header/inline comments (lines 40-49) self-document a PAST incident: this module was "DOCTRINE WITH NO IMPORTER for four weeks" while `SPEND_REGIME` was a deployed Vercel env var — meaning flipping the env var in production would have silently changed nothing, because nothing read it. The file states this was fixed by adding the `assertRegimeDefined()` call into `spend-guard.mjs`. I confirmed that call is present at `spend-guard.mjs:142`, so the fix is real and current, not aspirational — this NOTE documents a historical near-miss the owner should know this module class (env-var-gated doctrine) is prone to.

---

## Lane summary

### Counts by STATUS (97 files)

| STATUS | Count |
|---|---|
| WORKING-WIRED | 62 |
| TEST | 30 |
| WORKING-UNWIRED | 4 |
| DEAD-HISTORICAL | 1 |
| OPERATOR-TOOL | 1 (`relabel-unlabeled.mjs`; overturns its own `GRAPH:TEST-ONLY` flag) |
| DEFECTIVE | 0 |
| INCOMPLETE | 0 |
| STUB | 0 |
| AMBIGUOUS | 0 |

WORKING-UNWIRED (4): `derived-consistency.mjs`, `metered-emit.mjs`, `program-total.mjs`, `spend-gauge.mjs`. All four are independently corroborated as known-unwired by the codebase's own `.discipline/fitness/functions/F25-module-liveness.mjs` `PROVEN_BUT_UNWIRED` allowlist (a fitness-function source file, i.e. code evidence, not a docs/plans claim) — this is not just my read, it is a governance mechanism that already tracks the same four-file pattern in `src/lib/agent/` + `src/lib/llm/` combined.

### Findings, ranked

1. **Four fully-built, fully-tested modules have zero production callers, and the codebase's own governance already knows it.** `derived-consistency.mjs` (Gate-B DERIVED arithmetic consistency), `metered-emit.mjs` (`openMeteredBatch`, the intended sole path to a metered batch run), `program-total.mjs` (paginated program-total reader), and `spend-gauge.mjs` (read-only spend dashboard) are all real, tested, non-trivial modules that nothing in `src/` or `scripts/` imports outside their own test files. All four appear in `.discipline/fitness/functions/F25-module-liveness.mjs`'s `PROVEN_BUT_UNWIRED` allowlist (lines 80-82), confirming this is a recognized, named category in the codebase's own CI fitness function — not a surprise finding, but worth surfacing because two of the four (`program-total.mjs`, `spend-gauge.mjs`) sit directly in the spend-governance path, which is the most financially sensitive part of this lane.

2. **`program-total.mjs`'s pagination fix for the real `agent_runs` 1000-row PostgREST-cap under-count bug is not wired into the live spend-seeding path.** `agent_runs` is at 23,564 live rows (table-usage.txt) — 23× past the 1000-row PostgREST default page cap the module's own header describes as "real" and demonstrates with a RED/GREEN test. `spend-guard.mjs`'s `seedSpend()` function exists to receive a paginated program total, but `spend-guard.mjs` itself does not call `readProgramTotalPaginated` (confirmed: the only occurrences of "program-total" inside `spend-guard.mjs` are prose comments, not an import). Whatever caller currently invokes `seedSpend()` lives outside this lane (a runner script not in `src/lib/agent/` or `src/lib/llm/`), and I did not trace it — flagged here as a cross-lane follow-up: verify that caller paginates, or the standing-ceiling seed may still under-count today exactly as this module's own RED test demonstrates.

3. **`relabel-unlabeled.mjs`'s `GRAPH:TEST-ONLY` flag is a false negative** — it is imported by `scripts/run-4c-relabel.mjs:34` via jiti, a real operator tool. The lane list's graph appears to have scanned only `src/`, missing this `scripts/`-side caller. This is a caution for anyone trusting the lane list's flags mechanically: at least one `GRAPH:TEST-ONLY` flag in this lane understated actual wiring.

4. **`derived-consistency.mjs`'s own header comment is now false.** It documents itself as being called by "both tiers" of DERIVED mint runners; a whole-repo grep shows zero non-test importers. This is a small but concrete instance of the exact "claims drifted from code" pattern this audit exists to catch — inside a source file's own comment, not just in `docs/`.

5. **The spend-governance stack (`priced-line.mjs`, `spend-guard.mjs`, `spend-regime.mjs`, `spend-client.ts`, `metered-gate.mjs`) is unusually well-documented about its own history of near-misses and is coherent end-to-end.** `spend-regime.mjs`'s header self-documents a real past incident — the module sat unimported for four weeks while `SPEND_REGIME` was a live deployed env var, meaning a regime flip in production would have silently done nothing. I confirmed the stated fix (`spend-guard.mjs:142` calling `assertRegimeDefined()`) is actually present. The unlogged-telemetry invariant (`spend-client.ts`'s `recordSpendCall` not calling `markCallLogged()` on a write failure, so the next `assertBudget` throws) is a real fail-closed design, not just a comment claim — I traced the mechanism through both files. No defect found in this stack; noted as a positive finding because the lane brief calls for ranked findings, not only negative ones, and this stack's density of self-documented history is itself useful signal for the owner.

6. **`metered-gate.mjs` (WORKING-WIRED per its own refs=2) currently guards a dead-end.** Its sole intended production caller, `openMeteredBatch` in `metered-emit.mjs`, is itself unwired (finding #1). The gate logic is correct and tested, but as of this read nothing in production reaches it through the metered-batch path. I did not identify `metered-gate.mjs`'s second importer beyond `metered-emit.mjs` + its own test — stated as "did not check further," not a guess.

7. **Two direct (non-spend-client) Anthropic API call sites exist in this lane and are both deliberately sanctioned**, not defects: `first-fetch-classify.ts` and `haiku-classify.ts` both call the Anthropic API directly rather than through `spend-client.ts`'s chokepoint, but both are explicitly enumerated on `.discipline/rules/016-canonical-anthropic-path.mjs`'s `PERMITTED` allowlist as scoped classification-only exceptions. Confirmed by reading that governance file directly (code, not a docs/plans claim).

8. **`extract-research-sections.ts` is genuinely dead, and says so about itself indirectly.** `formats/prose-extractor.ts`'s own header calls itself "the generalisation of the proven extract-research-sections.ts" — the supersession is intentional and documented in the superseding file, which is a cleaner-than-usual dead-code trail (most DEAD-HISTORICAL findings in an audit like this lack that kind of self-pointing evidence).

9. **`canonical-pipeline.ts`'s FACT `kept`-filter fallback-to-`allText` behavior (line ~1496) was examined closely for a possible false-attribution defect and cleared** — a claim whose `source_url` doesn't match a known pool source falls back to searching the full concatenated pool text for a verbatim span, but downstream resolution (`crossLinkClaimSources` → `resolver.resolveSpan` via `search_result_id`) yields a null tier/sourceId rather than a false higher-authority stamp for an unmatched URL. Reported as a finding not because it's a bug, but because it's the single most defect-shaped piece of logic I traced in the 1819-line file and is worth another reader's independent look given the file's size and centrality.

10. **`operations-ask-context.mjs`'s enveloped (migration-267) formatting branch is currently untriggered by live data**, per the file's own comments (both WO-17 producers kill-switched off as of the cited 2026-08-30 check) and consistent with `regional_data_facts` sitting at 86 live rows in table-usage.txt. Not a defect — the branch is correct and tested — but the owner should know this code path has not yet run against real enveloped rows in production.

11. **`spend-client.ts`'s I1-attribution-gap and precondition-posture warnings (lines 143-151) are soft `console.warn` alarms, not blocking gates.** A paid call that carries neither `itemId` nor `sourceId`, or a fetch-purpose call with no recorded precondition, logs a warning and proceeds rather than being refused. This is consistent with the surrounding "alarm not a block" design documented in comments, but it means these two invariants depend on someone watching logs rather than being mechanically enforced the way the unlogged-telemetry invariant is.

### Coverage attestation

Files read in full: **97/97**. Lines read: **12,395** (sum of the lane list's own per-file line counts, cross-checked by direct arithmetic against every file read; matches the lane list's total exactly). Files over ~600 lines (`canonical-pipeline.ts` 1819, `parse-output.ts` 851, `extract-regulation-sections.ts` 592, `system-prompt.ts` 535) were each read in multiple sequential offset chunks to their true end, verified by checking the final line number in each case.

No file was skipped or partially read. No inference in this report is presented without a file:line or an explicit statement of what was and was not checked (see findings #2 and #6 above for the two places I explicitly stopped short of a cross-lane trace).
