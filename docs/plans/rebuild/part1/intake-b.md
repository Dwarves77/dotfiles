# P1-04 intake-b: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-04, DISPOSITION lane, read-only. Tree: origin/master `904680db0`. Written by a cloud session on 2026-10-12 (clock from `date -u`: started 01:10 UTC). Every file in SCOPE was read whole with the Read tool; the coverage table records each read. Every claim carries `[CONFIRMED]` (executed or read this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`. Prior work: the registers B2-part4 and B1b were read whole; the A4a rows naming in-scope files (its lines 60-75, 98-122 and the rows the backlog cites) were read as extractions; the other registers were read as `grep -nE` extractions of lines naming an in-scope path (A3, A4, A4b, A4d, B1, B2-part1, B2-part3, C2, C3, C4, D1, D2, F1). A finding a prior register carries is cited `<register>:L<n>`, not re-described.

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, has a row in section 8 so it is not lost). Code lines are non-blank non-comment lines by awk (`//` lines, `/* */` blocks and leading-`*` lines stripped). Raw lines are `wc -l`.

## 1. Header and coverage

Module: intake-b. The intake transit (staged_updates to the mint chokepoint, the portal-candidate ledger, the one-invocation intake cycle, the record-grade fact extractor and the shared item write sequence), the data contracts (number envelope, vocabularies, emission-factor tiers, source licence register, verbatim grounding), source-axis classification (library and the two scripts) and the quarantine research-or-erase tools (`scripts/_reground`, `regen-quarantined.mjs`, `plan-quarantine-disposition.mjs`).

Coverage (36 files, 8,216 raw lines, 5,295 code lines; `wc -l` and the awk count run 2026-10-12 01:14 UTC):

| path (under fsi-app/) | raw lines | code lines | read calls |
|---|---|---|---|
| src/lib/intake/apply-staged-update.ts | 344 | 203 | 1 |
| src/lib/intake/flywheel-defect.ts | 67 | 44 | 1 |
| src/lib/intake/flywheel-steps.mjs | 107 | 63 | 1 |
| src/lib/intake/intake-url-corpus.mjs | 52 | 40 | 1 |
| src/lib/intake/mint-enrichment.ts | 64 | 43 | 1 |
| src/lib/intake/mint-item.ts | 449 | 273 | 1 |
| src/lib/intake/pool-row-contract.mjs | 25 | 19 | 1 |
| src/lib/intake/portal-harvest.ts | 533 | 344 | 1 |
| src/lib/intake/promote-cap.mjs | 18 | 7 | 1 |
| src/lib/intake/record-facts-research.mjs | 279 | 196 | 1 |
| src/lib/intake/record-facts.mjs | 1012 | 534 | 2 (offsets 1, 826) |
| src/lib/intake/run-intake-cycle.ts | 504 | 326 | 1 |
| src/lib/intake/source-link-invariant.mjs | 15 | 10 | 1 |
| src/lib/intake/write-item.ts | 329 | 245 | 1 |
| src/lib/contracts/envelope.mjs | 330 | 205 | 1 |
| src/lib/contracts/factor-tier.mjs | 403 | 262 | 1 |
| src/lib/contracts/source-licence.mjs | 446 | 393 | 1 |
| src/lib/contracts/verbatim-grounding.mjs | 31 | 21 | 1 |
| src/lib/contracts/vocabularies.mjs | 563 | 347 | 1 |
| src/lib/classification/classify-source.mjs | 82 | 54 | 1 |
| src/lib/classification/expected-output.mjs | 61 | 39 | 1 |
| src/lib/classification/flags.mjs | 23 | 5 | 1 |
| src/lib/classification/jurisdiction.mjs | 65 | 32 | 1 |
| src/lib/classification/routing.mjs | 100 | 53 | 1 |
| src/lib/classification/scope.mjs | 156 | 92 | 1 |
| src/lib/classification/vocab.mjs | 87 | 45 | 1 |
| scripts/classification/apply-classifications.mjs | 984 | 603 | 1 |
| scripts/classification/propose-classifications.mjs | 306 | 193 | 1 |
| scripts/_reground/executor-ground.mjs | 31 | 24 | 1 |
| scripts/_reground/free-pass-run.mjs | 119 | 99 | 1 |
| scripts/_reground/id-stamp.mjs | 67 | 51 | 1 |
| scripts/_reground/lease.mjs | 32 | 29 | 1 |
| scripts/_reground/target-match-probe.mjs | 41 | 37 | 1 |
| scripts/_reground/tombstone-delete.mjs | 107 | 81 | 1 |
| scripts/regen-quarantined.mjs | 77 | 61 | 1 |
| scripts/plan-quarantine-disposition.mjs | 307 | 222 | 1 |
| TOTAL | 8216 | 5295 | 37 |

Files not read whole: none. Test files: none exist beside the scope on this tree; CLEAN-3 (`f906b210`) deleted the 30 in-scope test files and changed the in-scope source files in comment lines only [CONFIRMED: `git show f906b210` over the scope, non-test files, every `+`/`-` line is a comment or blank]. ANON-1 (`2c710d14`) changed one string literal (a personal name in a licence note). So every finding a register made on tree `0d0766347` still holds, at shifted line numbers; this register cites the current lines.

Consumer evidence: `grep -rlw "<symbol>"` over fsi-app/src, fsi-app/scripts and fsi-app/supabase (ts, tsx, mjs, js, sql), excluding the defining file, run per exported symbol (237 symbols; a hit count is an upper bound because a comment counts), then by hand for every symbol this register calls dead. File importers: `grep -rlE` of an import specifier ending in the file stem. Runtime invokers of the scripts: `grep` of `.github/workflows` and `package.json` for each script path returns nothing [CONFIRMED]; CLEAN-3 deleted `maintenance.yml` and the `scripts/maintenance/` wrappers that ran `apply-classifications`, `regen-quarantined` and `plan-quarantine-disposition` [CONFIRMED: `ls fsi-app/scripts/maintenance` shows apply-deferrals, canonical-autoverify, derive-obligations, enumerate-unclassified-hosts, resolve-provisional-sources, tag-proposals, tag-ratification, host-verdicts, lib only]. Every in-scope script is therefore an operator-dispatched CLI with no scheduled or workflow caller on this tree, which matches build mode (CLAUDE.md rule 16).

## 2. Module verdict

**REFACTOR AND PORT.** Every responsibility is kept. The code is not: two hand-maintained flywheel-participation lists (mint and update) that already disagree (one dedupes forward events and flags stale ones, the other inserts every extracted event), a source-classification pipeline that uses `integrity_flags.description` as a message bus between two scripts and carries three apply modes from three ruling eras, a record-fact extractor whose research layer emits two claims for the same two slots, a mint dedup read with no row cap that silently truncates at the API row limit, ten unchecked writes and reads in the intake cycle, and three metered-model dependencies the rebuild must not port.

**Current code LOC: 5,295** (awk over the 36 files, table above). **Estimated clean LOC: about 3,340.** Arithmetic (section 8 table, per planned file): features/intake 1,855 (staged-transit 150, mint 200, flywheel-participation 170, cycle 130, change-sweep-drain 80, portal-ledger 210, record-facts 380, write-item 200, quarantine 315, ground-injected CLI 20) + core/contracts 1,075 (vocabularies 290, envelope 190, source-licence 370, factor-tier 200, verbatim 25) + source axes 410 (axes library 260, classify-sources job 150) = 3,340. Against today's 5,295 that is 63 percent. By group: intake 2,347 to 1,520; contracts 1,228 to 1,075 (mostly data, little to cut); classification 1,116 to 410; quarantine and re-ground 604 to 335. Estimates are read-derived [HYPOTHESIS until the port lane counts them].

Core responsibilities (11), with the files that carry them today:

1. Staged-update transit: materialise a `staged_updates` row by `update_type` (new_item through the mint chokepoint with the entity gate; update_item, status_change, archive_item onto `intelligence_items`; new_source onto `sources` with `source_role` at birth) (apply-staged-update.ts).
2. The mint chokepoint: idempotency probes, congruence 1a/1b, subject dedup, relevance floor (surface-only), domain canonicalisation, format_type stamp, source-link invariant, dry-run boundary, the single INSERT (mint-item.ts).
3. Flywheel participation after a mint or a substantive update: lineage links, connection discovery, forward-event extraction, compliance_deadline sync, entity linking, title timeline, defect flags (mint-item.ts 285-408, mint-enrichment.ts, flywheel-steps.mjs, flywheel-defect.ts, apply-staged-update.ts 114-192).
4. The intake cycle: stage, mint, then ground (metered workflow) or record-only pool row; plan mode is the dry path; drain change-sweep update_item rows with a $0 re-verify (run-intake-cycle.ts, pool-row-contract.mjs).
5. The portal-candidate ledger: persist discovered deep links, select a keyset page (census anti-join RPC), fetch, classify, dry pre-pass, promote with a cap, stamp dispositions (portal-harvest.ts, promote-cap.mjs).
6. Record-grade extraction: verbatim FACT-or-GAP claims per required slot, binding position, due date and precision, corridor identity, EU-act self-description, in-force status, research profile, the stub full_brief, the mint payload (record-facts.mjs, record-facts-research.mjs).
7. The shared item write sequence: agent_run_searches, sections, Gate A state, claims, citations, in that order (write-item.ts).
8. Data contracts: the number envelope (derivation, as-of triple, freshness, sample-size precision, propagation), the vocabularies (obs_status, origin_class, Admiralty, pedigree, likelihood, impact x applicability, binding_position, duty_holder_class, freshness, relation, coverage_state, transport mode), emission-factor tiers and SQL generators, the source licence register and gate, verbatim grounding (src/lib/contracts/*).
9. Source-axis classification: Axis 3 jurisdiction from host, Axis 4 topics, modes, verticals from name and role, Axis 5 expected-output defaults, observed distribution and drift (src/lib/classification/*), applied by two scripts through flags (scripts/classification/*).
10. Quarantine research-or-erase: cheap re-verify of quarantined items, the disposition planner with deferral candidates, $0 floor-first re-attribution, id-confirm-and-stamp, tombstone-then-delete, the injected-ledger grounding entry, lease and probe CLIs (scripts/_reground/*, regen-quarantined.mjs, plan-quarantine-disposition.mjs).
11. Golden fixtures for the intake gates (intake-url-corpus.mjs) and the source-less tripwire (source-link-invariant.mjs), both orphaned by the CLEAN-3 test deletion.

Key dependencies [CONFIRMED by the import scan and the `.from(`/`.rpc(`/`readAll(`/`guarded*(` scans]:

- Modules imported: `@supabase/supabase-js`, `node:crypto`, `node:fs`, `node:path`, `node:url`, `jiti`; in-repo: `@/lib/entities/{source-role,entity-resolve,link-item-entities,link-items,decisions}`, `@/lib/domains`, `@/lib/sources/{url-canonicalize,entity-gate,classify-source-role,verify-item,snapshot-store,freshness-probe,cheap-verify,change-sweep,host-authority,target-match}`, `@/lib/forward-events/{compliance-deadline-sync,read-and-extract}`, `@/lib/connections/{run-discovery,flag-namespaces,decision-note}`, `@/lib/agent/{extract-registry,timeline-backfill-derive,metadata-vocab,gate-a-scan,section-markers,source-blocks,canonical-pipeline}`, `@/lib/llm/first-fetch-classify`, `@/workflows/generate-brief`, `@/lib/surface-of.mjs`; scripts: `scripts/lib/{db,env-file,free-pass,mutation-lease,quarantine-dwell,deferral,run-artifact,harness-run-number,record-harness-run}.mjs`, `scripts/maintenance/lib/cli.mjs`, `scripts/maintenance/apply-deferrals.mjs`, `scripts/connections/propose-tags.mjs`, `scripts/harness-runs/governing-files.mjs`. Every relative and `@/` import resolves on this tree [CONFIRMED: resolution script over all 36 files, 0 missing].
- Tables touched: `intelligence_items` (17 `.from` sites plus 7 `readAll`, 2 `guardedUpdate`, 1 `guardedDelete`), `integrity_flags` (8 plus `readAll`, `guardedInsertMany`, `guardedUpdate`), `staged_updates` (7), `sources` (4 plus 2 `readAll`, 1 `guardedUpdate`, 1 `insert` on new_source), `section_claim_provenance` (3 plus `readAll`, `guardedUpdate`), `portal_link_candidates` (3), `item_forward_events` (3), `agent_run_searches` (3), `item_timelines` (2), `item_cross_references` (1), `agent_runs` (1), `corpus_census` (1 `readAll`), `disposition_ledger` (1 `guardedInsert`), and through write-item.ts: `intelligence_item_sections`, `item_gate_a_state`, `intelligence_item_citations`; through the planner: `harness_runs`. The census exclusion reads `census_worklist` by default table name.
- RPCs: `validate_item_provenance` (3 sites), `next_uncensused_portal_candidates` (1); through the lease library the mutation-lease RPCs (migration 211).
- Env vars read in scope: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (apply-classifications.mjs:760), `BROWSERLESS_API_KEY` (deleted from the env by id-stamp.mjs:8 and target-match-probe.mjs:8 so no fetch can spend); an `anthropicKey` string is threaded into portal-harvest.ts by its caller.
- External services: Supabase PostgREST; Anthropic through `firstFetchClassify` (Haiku, `@/lib/llm/first-fetch-classify.ts:242`) and `generateBriefWorkflow` (Sonnet, `canonical-pipeline.ts` `callSonnet`); no direct `fetch(` in scope [CONFIRMED grep; agrees with A4a:L71 E10].

## 3. Bloat, biggest first

| rank | what | lines | why it is bloat | replacement |
|---|---|---|---|---|
| 1 | source classification as a flag message bus | apply-classifications.mjs 984 raw / 603 code + propose-classifications.mjs 306 / 193 = 796 code | the proposer serialises proposals into `integrity_flags.description` as `PROPOSALS_JSON:` text; the applier regex-parses it back (apply-classifications.mjs:44-60); three apply modes coexist from three ruling eras (`--flag` and `--all-ratified` need a human `ratify:classification` token, 32-35, 71-94; `--auto-adopt` decides by rule, 701-734); the zero-proposal re-derivation (528-568) and the drift and anomaly drains (634-680) exist only to close flags the proposer opened; B1b:L65 records a deleted wrapper that re-typed the builders | one deterministic `classify-sources` job: compute axes, apply the auto-adopt rules directly to `sources` through the guarded write, adopt the observed distribution on drift, record one born-resolved audit row per source changed; no flag round trip, no human token |
| 2 | record-facts.mjs comment history and repeated walkers | 1012 raw, 534 code, 434 comment lines | dated lane narratives (URL-GUIL, BOILER-2, HOLLOW-GATE, INTAKE) explain each regex; the match-walk loop `new RegExp(re.source, flags + "g")` then `matchAll` then `isProseSpan` is written four times (findSlotSpan 310-321, findBindingPositionMatch 431-446, findDueDateMatch 520-530, record-facts-research.mjs findResearchSlotSpan 110-121); the FACT and GAP claim object literal is hand-built ten times | trigger tables as data, one `walk(triggers, text, slotKey)`, one `claim(slotKey, span or null, gapText)` constructor; history stays in docs |
| 3 | portal-harvest.ts option docs and the census fallback | 533 raw, 344 code, 160 comment lines | ConsumeOpts carries about 75 comment lines (117-189); `keysetQuery(true)` plus the `PGRST202` sniff (248-280, 310-317) is a fallback for the DDL window before migration 256's RPC; A4a's E17 says the committed catalog carries the RPC (B-1989); the fallback builds a client-side `NOT IN` list that the file's own comment says overflowed at about 435 rows | the RPC only; one batched `upsert` for `persistPortalCandidates` instead of one round trip per link (31-41) |
| 4 | two flywheel participation lists | mint-item.ts 285-408 (lineage, enrichment, compliance, entities, timeline) and apply-staged-update.ts 114-192 (discovery, forward events with dedupe and stale flags, compliance, entities); mint-enrichment.ts 33-64 | the mint path inserts every extracted forward event with no dedupe key (mint-enrichment.ts:51-56) while the update path dedupes on the migration-307 key and flags stale events (flywheel-steps.mjs:53-107); the mint path writes lineage and a timeline row, the update path does neither; each step repeats the same try, record defect, push flag block | one `runParticipation(itemId, {context, changed})` with one step list, used by both callers |
| 5 | run-intake-cycle.ts doc and schema restatement | 504 raw, 326 code, 150 comment lines | the drain doc (106-160) is 55 lines; `StagedUpdatesTableRow` (167-185) restates the whole staged_updates schema to satisfy one parameter type | a short doc and the generated table type |
| 6 | whole-table reads to find one item | id-stamp.mjs:19-20 and :61, lease.mjs:15-16, tombstone-delete.mjs:44 and :57, target-match-probe.mjs:15 | each CLI reads every `intelligence_items` row (and tombstone-delete every `section_claim_provenance` row with `--empty-only`) to match one key by prefix | a keyed lookup (`id` prefix or `legacy_id`) and a per-item claim count |
| 7 | planner harness plumbing | plan-quarantine-disposition.mjs 188-291 (about 100 lines) | artifact envelope, run-number claiming, a separate write client for `harness_runs`, an in-process call of apply-deferrals in its dry mode; ids recovered from display keys after the resolver ran (151-156) | the harness (P1-08) owns run recording; the planner returns its plan and the resolver returns ids |
| 8 | vocabularies with no consumer | vocabularies.mjs: admiraltyCode, admiraltyToBand, pedigreeToBand, CONFIDENCE_BAND, LIKELIHOOD, likelihoodForProbability, APPLICABILITY, RELATION, inverseRelation, COVERAGE_STATES, coverageStateForObsStatus, MODE_CODES, isValid, admissibleInCalculation: about 120 lines | zero importers outside the file [CONFIRMED grep]; B-0673 records the same | port each vocabulary when its first reader is ported; section 8 names them as features so none is lost |
| 9 | factor-tier selection that nothing calls | factor-tier.mjs resolveActiveFactor 231-276, primaryDataShare 284-294, pedigreeToStars 300-303, isPrimaryData 120-122: about 60 code lines | no code caller; only text mentions (admin/factors/page.tsx:132, migration 258 comments) [CONFIRMED grep; agrees with B-0557] | keep the doctrine (it is the JS half of the SQL eligibility view) and wire it to the first factor reader; until then it is not ported as live code |
| 10 | apply-staged-update.ts boundary essay | 344 raw, 203 code, 128 comment lines | the substantive-update derivation (46-88) and the relevance note (206-217) restate migration history | a column allowlist with one sentence per group |

## 4. Dead code

Each `[CONFIRMED]` row: `grep -rlw` over fsi-app/src, fsi-app/scripts and fsi-app/supabase (ts, tsx, mjs, js, sql) excluding the defining file returned the hits named, and nothing else.

| path:line | symbol | kind | evidence |
|---|---|---|---|
| src/lib/intake/intake-url-corpus.mjs:1-52 | URL_CASES, CONGRUENCE_CASES, DEDUP_CORPUS, DEDUP_CASES | whole file (golden fixture data) | 0 hits for each symbol and 0 importers of the file [CONFIRMED]; its only reader `intake-gates-golden.test.mjs` was deleted by CLEAN-3 (A4a:L182 named it). Fixture data, not code: section 6 |
| src/lib/intake/source-link-invariant.mjs:1-15 | GRANDFATHERED_SOURCELESS, findSourceLessLiveViolations | whole file | 0 hits, 0 importers [CONFIRMED]; its audit `scripts/verify/source-link-audit.mjs` is absent at this tree (INV-093 cites it) |
| src/lib/classification/routing.mjs:13 | routeItemBySourceAxis5 | exported function | 0 hits anywhere, including inside its own file except its definition [CONFIRMED]; agrees with B-0670 |
| src/lib/classification/routing.mjs:50 | isAnomalousCategory | exported function | 0 hits outside the file; called only by routeItemBySourceAxis5 :30 [CONFIRMED] |
| src/lib/classification/vocab.mjs:37,51,64,76,82,48-49 | isValidScopeTopic, isValidScopeMode, isValidScopeVertical, isValidAxis5Category, CLASSIFICATION_VOCABULARIES, SCOPE_MODE_SENTINELS, SCOPE_MODES | exports | 0 hits each [CONFIRMED]; their tests were deleted by CLEAN-3 |
| src/lib/classification/classify-source.mjs:22 | sourceClassificationGaps (export) | export surface | called only inside the file :44 [CONFIRMED] |
| src/lib/classification/expected-output.mjs:26 | normalizeDistribution (export) | export surface | called only inside the file :44 [CONFIRMED] |
| src/lib/contracts/envelope.mjs:241 | isDegraded | exported function | 0 hits [CONFIRMED] |
| src/lib/contracts/envelope.mjs:87 | validateEnvelope (export) | export surface | called only by makeEnvelope :189 [CONFIRMED] |
| src/lib/contracts/factor-tier.mjs:231,284,300,120,48 | resolveActiveFactor, primaryDataShare, pedigreeToStars, isPrimaryData, TIER_CODES (exports) | exported functions | resolveActiveFactor: 2 hits, both text (admin/factors/page.tsx:132 JSX copy, migration 258:371 comment); the other four 0 hits outside the file [CONFIRMED]; agrees with B-0557, B-0672. HALF-SLICE rather than dead: section 8 |
| src/lib/contracts/factor-tier.mjs:312,352,384 and source-licence.mjs:394 | renderTierConstraintsSql, renderEnvelopeColumnsSql, renderFactorCandidateViewSql, renderDataSourceSeedSql | SQL generators | only comment hits in migrations 258 and 281 [CONFIRMED grep]; the "drift-guarded" byte-compare their headers describe (source-licence.mjs:416, inside the generated header) ran in the `.discipline` layer CLEAN-3 deleted, so nothing executes them now. Not dead in intent: they are the source of migration 258's generated blocks; section 8 gives them a proof |
| src/lib/contracts/source-licence.mjs:345,326 | assertEmbeddable, licenceFor | exported functions | assertEmbeddable: 3 hits, all SQL comments (migrations 258:66, 281:25, 281:27); licenceFor: 0 hits [CONFIRMED]; B-1018 records assertEmbeddable |
| src/lib/contracts/vocabularies.mjs:130,164,217,231,255,402,460,553 and :198,244,277,379,446,520 | admissibleInCalculation, admiraltyCode, admiraltyToBand, pedigreeToBand, likelihoodForProbability, inverseRelation, coverageStateForObsStatus, isValid; CONFIDENCE_BAND, LIKELIHOOD, APPLICABILITY, RELATION, COVERAGE_STATES, MODE_CODES | exports | 0 hits outside the file each [CONFIRMED]; several are members of the in-file VOCABULARIES registry, which itself has 1 hit (a comment). B-0673 records the same set |
| src/lib/intake/mint-item.ts:88 | sourceLinkDecision (export) | export surface | called only inside the file :244 [CONFIRMED]; exported for a deleted test |
| src/lib/intake/record-facts.mjs:5,277,431,520,586,694,707,746,845 | RECORD_FACTS_VERSION, hasOnlyBareDomainUrls, findBindingPositionMatch, findDueDateMatch, findCorridorMatch, findInForceStatusMatch, extractInForceStatusFact, isEurlexHost, STUB_BRIEF_MARKER (exports) | export surface | each 0 hits outside the file, used inside it [CONFIRMED]; STUB_BRIEF_MARKER's documented reader (population-report.mjs, record-facts.mjs:840-844) is gone |
| src/lib/intake/record-facts-research.mjs:3,26,110 | RECORD_FACTS_RESEARCH_VERSION, RESEARCH_FINDING_REQUIRED_SLOTS, findResearchSlotSpan (exports) | export surface | 0 hits outside the file [CONFIRMED] |
| src/lib/intake/run-intake-cycle.ts:13,14,25,59 | CycleMode, PlanVerdict, PlanResult, CycleItemOutcome (exported types) | types | 0 hits outside the file [CONFIRMED] |
| src/lib/intake/portal-harvest.ts:15,65,223 | PersistResult, LedgerCursor, CandidateLedgerPageOpts (exported types) | types | 0 hits outside the file [CONFIRMED] |
| src/lib/intake/apply-staged-update.ts:31; flywheel-defect.ts:8; write-item.ts:255 | ApplyUpdateResult, FlywheelDefectSubtype, WriteGroundingSequenceDeps (exported types) | types | 0 hits outside the file [CONFIRMED] |
| scripts/classification/apply-classifications.mjs (22 exports), propose-classifications.mjs (4 exports), plan-quarantine-disposition.mjs (buildDeferralCandidate, planDispositions, runPlanner) | test-only export surface | exports | 0 hits outside the file each [CONFIRMED]; their tests were deleted by CLEAN-3; the CLIs themselves have no invoker (section 1) |
| src/lib/intake/portal-harvest.ts:248-280, 310-317 | the client-side census-exclusion fallback (`keysetQuery(true)` and the `PGRST202` branch) | branch | dead only when production carries `next_uncensused_portal_candidates` [HYPOTHESIS: B-1989; the committed migration 256 carries it] |
| src/lib/contracts/vocabularies.mjs:540 | MODE_ALIASES key `"inland-waterway"` | data entry | unreachable through `normaliseMode`, which rewrites `-` to `_` before the lookup and so resolves it as the canonical `inland_waterway` [CONFIRMED: node import, `normaliseMode("inland-waterway")` returns `inland_waterway`]; harmless |

Not dead, verified live this session: `mintIntelligenceItem` (apply-staged-update.ts, research-walker.mjs), `applyStagedUpdate` (run-intake-cycle.ts, portal-harvest.ts), `consumePortalCandidates` and `persistPortalCandidates` (worker/check-sources/logic.ts, run-ledger-consume.mjs), `runIntakeCycle` (api/admin/run-intake/route.ts), `drainChangeSweepUpdates` (scripts/turns/run-change-detection.mjs), `buildRecordPayload`, `buildRecordSlotClaim`, `extractBindingPositionFact`, `extractDueDateFact` (heal-provenance.mjs, run-mint-batch.mjs, record-briefs/schema.mjs, propose-series-items.mjs), `buildResearchRecordPayload` (research-sweep.mjs, heal-provenance.mjs), `runMintEnrichment` (apply-mint-batch.mjs), `runDiscoveryStep`/`runForwardEventsStep` and `recordFlywheelDefect` (apply-record-briefs.mjs), `writeGroundingSequence` and the write-item builders (canonical-pipeline.ts, apply-mint-batch.mjs, heal-provenance.mjs), `validateFactor` (emission-factors-common.mjs), `mayEmbedAsSeed` (emission-factors-common.mjs, seed-derived-values.mjs, sbti producer), `groundCandidate`/`isVerbatimSpan` (re-exported by regional/state-cost-facts-envelope.mjs and market/carrier-ets-surcharge-envelope.mjs), `vocabularies.mjs` (21 importing files).

## 5. Duplicates and over-abstraction

| what | where | proposed single inline replacement |
|---|---|---|
| forward-event insert after a mint vs after an update | mint-enrichment.ts:51-56 (plain insert of every extracted event); flywheel-steps.mjs:53-107 (migration-307 dedupe, 23505 as zero-new, stale-event report) | the flywheel-steps version for both; the mint path then cannot double-insert when an item is re-minted or re-enriched (B-2160, B-2161) |
| discovery after a mint vs after an update | mint-enrichment.ts:41-47 (caller-built signature); flywheel-steps.mjs:27-36 (fresh re-read) | the fresh re-read for both |
| the participation step block (try, recordFlywheelDefect, push flag) | mint-item.ts 294-408 (five blocks); apply-staged-update.ts 119-191 (four blocks); mint-enrichment.ts 41-61 (two blocks) | one step table walked once |
| verbatim span check with three semantics | record-facts.mjs:14-25 `assertVerbatim` (case-insensitive, whitespace-exact); verbatim-grounding.mjs:6-10 `isVerbatimSpan` (case-sensitive, whitespace-insensitive); the database gate `validate_item_provenance` criterion 3 (record-facts.mjs header says case-insensitive substring) | one core/contracts/verbatim.ts with the database rule as the reference and a named second mode only if a ruling keeps it (section 8, Rulings to settle) |
| the evidence and authority research slots | record-facts.mjs:107-133 (SLOT_TRIGGERS evidence_agreement_signal, source_authority_signal) and :820-826 (appended for research_finding); record-facts-research.mjs:80-103 (a second trigger table for the same two slots) and :244-258 (appended again) | one trigger table and one append; see defect below |
| humanizeSlotKey | record-facts.mjs:323-325; record-facts-research.mjs:7-9 (its own comment calls it a deliberate duplicate) | export once |
| deepFreeze | vocabularies.mjs:1-6; classification/vocab.mjs:4-9 | one helper |
| md5 dedupe key vs migration 307 | flywheel-steps.mjs:13-16 restates the expression index of migration 307 in JS because PostgREST upsert cannot name an expression index | keep, but derive both from one documented key, or move the insert into an RPC that uses `ON CONFLICT` on the index |
| two `readAll` item lookups by prefix | id-stamp.mjs:19-20, lease.mjs:15-16, tombstone-delete.mjs:67 | one `resolveItemKey(key)` |
| IS_MAIN guard hand-rolled | apply-classifications.mjs:736, propose-classifications.mjs:204, plan-quarantine-disposition.mjs:295, regen-quarantined.mjs:65 | the shared `scripts/lib/is-main.mjs` `isMainModule`, which exists [CONFIRMED ls] (B-2196, B-2197, B-2209, B-2213) |
| hostOf | free-pass-run.mjs:16; scripts/lib/institution-key.mjs | import the institution-key helper (B-2195) |
| the 200-character capture floor | portal-harvest.ts:402; run-intake-cycle.ts assertPoolRowShape path; id-stamp.mjs:36 (`length > 200`) | one named constant beside the pool-row contract |
| UNCONDITIONAL vs conditional domain types | mint-item.ts:27-30 restates which item types `domainForItemType` decides alone | ask `domainForItemType(itemType, null)` and treat a non-null answer as unconditional |
| NON_REG_TYPES leakage warning | apply-staged-update.ts:236-254 (warn only, never acts) | delete; the chokepoint's domain canonicalisation (mint-item.ts:207-211) already corrects the domain |
| injection seams for deleted tests | portal-harvest.ts `classify`, `runIntakeCycleImpl`, `now`; run-intake-cycle.ts `groundWorkflow`; plan-quarantine-disposition.mjs `familyDir`, `recordHarnessRunFn` | keep one seam per module only where the new tree's test uses it |

Over-abstraction: `ClassifyFn`, `FetchDocFn`, `ConsumeOpts`, `CandidateLedgerPageOpts` and `LedgerCursor` make portal-harvest.ts read as a framework for one caller pair; the record payload carries `_proof_note` prose (record-facts.mjs:968-971, record-facts-research.mjs:271-275) that no reader parses.

Defect in the duplicates [CONFIRMED: executed this session]: `buildResearchRecordPayload` on a fixture text returns claims `decision_relevance:GAP, does_not_resolve:GAP, finding:FACT, methodology_limits:GAP, evidence_agreement_signal:FACT, source_authority_signal:FACT, key_figure:FACT, evidence_agreement_signal:FACT, source_authority_signal:FACT`; the duplicate slots are `{"evidence_agreement_signal":2,"source_authority_signal":2}`. Same finding as A4a:L121 (E6), B-1568, B-2163, B-2164.

## 6. Non-essential artifacts

- `src/lib/intake/intake-url-corpus.mjs`: golden fixture data (20 URL cases, 6 congruence cases, a 2-row dedup corpus, 5 dedup cases) living under `src/lib` with no reader. Its content is the intake gates' acceptance set; it moves to the new tree's test fixtures (section 8, Proof), not to `src`.
- `src/lib/intake/source-link-invariant.mjs`: two grandfathered item UUIDs as data in code (B-1032). The rule becomes a database check or an audit query in the new tree; the two ids, if still source-less, are data for a ruling, not code.
- `_proof_note` strings inside every record payload (record-facts.mjs:968-971; record-facts-research.mjs:271-275): proof prose shipped as payload; no reader.
- `scripts/plan-quarantine-disposition.mjs` writes `plan.json`, a harness artifact under `scripts/harness-runs/quarantine-disposition/` and a `harness_runs` row on every run, dry included (188-291); `free-pass-run.mjs:114-117` writes a manifest under `scripts/tmp`. Machine evidence, regenerable.
- `source-licence.mjs` notes are long-form legal research text (e.g. emsa_thetis_mrv, 151-173). They are the register's evidence and are kept, but they are content, not code; the register is data the new tree may hold as a data file.

## 7. File register

Columns: path | lines a-b (total) | responsibility | verdict | clean estimate (code lines) | consumers (count and top 3, this session's grep) | note.

| path | lines (total) | responsibility | verdict | clean est. | consumers | note |
|---|---|---|---|---|---|---|
| src/lib/intake/apply-staged-update.ts | 1-344 (344) | materialise a staged row by update_type; substantive-update boundary; update participation | REFACTOR AND PORT | 110 (into staged-transit) | 2: run-intake-cycle.ts, portal-harvest.ts | update_item writes `proposedChanges` with no column allowlist (272-275), so any key in a staged row reaches `intelligence_items`, including `provenance_status`-adjacent columns [CONFIRMED read; B-0059]; new_source inserts `...proposed` with no dedupe (309-320) [CONFIRMED read]; archive_reason default "Manual" (330) |
| src/lib/intake/flywheel-defect.ts | 1-67 (67) | rule-16(d) defect flag writer | REFACTOR AND PORT | into participation (25) | 4: mint-item.ts, apply-staged-update.ts, mint-enrichment.ts, apply-record-briefs.mjs | `.then(() => {}, () => {})` at 66 swallows a database-rejected insert (A4a:L71 E5); no dedupe key, one open flag per failure (B-1986, volume unmeasured) |
| src/lib/intake/flywheel-steps.mjs | 1-107 (107) | discovery re-read; forward events with 307-key dedupe and stale report | REFACTOR AND PORT | into participation (60) | 2: apply-staged-update.ts, apply-record-briefs.mjs | the correct one of the two forward-event paths; comment 11-12 says it mirrors a function in apply-staged-update.ts that no longer exists there |
| src/lib/intake/intake-url-corpus.mjs | 1-52 (52) | golden URL, congruence, dedup cases | TRASH (from src; content kept as test fixture) | 0 | 0 [CONFIRMED] | section 6 |
| src/lib/intake/mint-enrichment.ts | 1-64 (64) | discovery and forward events for the mint path | TRASH (merged) | 0 | 2 code: mint-item.ts, apply-mint-batch.mjs (the third hit, flywheel-defect.ts:4-5, is a comment) | its forward-event insert has no dedupe (51-56) (B-2160) |
| src/lib/intake/mint-item.ts | 1-449 (449) | the mint chokepoint and post-insert surfacing | REFACTOR AND PORT | 200 (mint) | 2: apply-staged-update.ts, research-walker.mjs (dry) | dedup corpus read (170-174) selects every non-archived item with no `.range()` or order; `supabase/config.toml:29` sets `max_rows = 1000` and A4a counted 2,766 items, so dedup sees at most the first 1,000 rows [HYPOTHESIS for production max_rows; B-0267, B-1988]; three `.then(() => {}, () => {})` swallows (283, 422, 444) (B-0061, B-0264); `fitness-allow: F39` and `.discipline` comments at 239, 276 name a deleted enforcer |
| src/lib/intake/pool-row-contract.mjs | 1-25 (25) | agent_run_searches pool-row shape assertion | KEEP AS-IS | 15 (into write-item) | 1: run-intake-cycle.ts | |
| src/lib/intake/portal-harvest.ts | 1-533 (533) | portal ledger persist, keyset page, consume (fetch, classify, dry pre-pass, promote, stamp) | REFACTOR AND PORT | 210 (portal-ledger) | 2: worker/check-sources/logic.ts, scripts/turns/run-ledger-consume.mjs | the metered classify call (328, 410-420) is replaced (section 8, LLM call sites); one upsert per link (31-41); disposition stamp error is only `console.warn`ed (347) [CONFIRMED read] |
| src/lib/intake/promote-cap.mjs | 1-18 (18) | split eligible candidates at the max-promote cap | KEEP AS-IS | 5 (into portal-ledger) | 1: portal-harvest.ts | B-1031: the hard ceiling of 200 the A4a row cites lived in the caller's header |
| src/lib/intake/record-facts-research.mjs | 1-279 (279) | research-profile slot layer over the base record payload | REFACTOR AND PORT | into record-facts (90) | 2: research-sweep.mjs, heal-provenance.mjs | duplicate claims for two slots [CONFIRMED: executed, section 5]; comments cite "this file's header", which CLEAN-3 removed |
| src/lib/intake/record-facts.mjs | 1-1012 (1012) | deterministic record-grade extractor and payload builder | REFACTOR AND PORT | 290 (record-facts) | 6: record-facts-research.mjs, propose-series-items.mjs, record-briefs/schema.mjs (top 3 of 6; also question-answers/schema.mjs, run-mint-batch.mjs, heal-provenance.mjs) | lifts `binding_position`, `due_date`, `date_precision`, `corridor_identity`, `research_credibility` onto `payload.item` (932-990), but `intelligence_items` has none of these columns (they exist only on `obligations`, migration 290) and `apply-mint-batch.mjs` `buildIntelligenceItemRow` (204-222) drops them; no code reads them [CONFIRMED: migration grep and consumer grep]; `item.due_date` is the matched phrase, not a date (`"no later than 1 January 2027 to the authority"`, executed) |
| src/lib/intake/run-intake-cycle.ts | 1-504 (504) | one-invocation intake cycle and change-sweep drain | REFACTOR AND PORT | 210 (cycle 130, drain 80) | 3: api/admin/run-intake/route.ts, portal-harvest.ts, scripts/turns/run-change-detection.mjs | five unchecked `staged_updates` stamps (226, 247, 299, 395, 409) and an unchecked record-only pool insert (438); four reads that drop `error` (236, 262, 287, 471) [CONFIRMED grep; B-0062, B-0564]; a failed stamp leaves the row `pending`, so RD-20's "never parks" holds only if a later run re-selects it [HYPOTHESIS: B-1990] |
| src/lib/intake/source-link-invariant.mjs | 1-15 (15) | source-less live tripwire with a grandfather list | TRASH | 0 | 0 [CONFIRMED] | rule kept as INV-093 and a proof query (section 8) |
| src/lib/intake/write-item.ts | 1-329 (329) | shared post-insert write sequence and row builders | KEEP AS-IS | 200 | 3: canonical-pipeline.ts, heal-provenance.mjs, apply-mint-batch.mjs | header line 22 still says `scripts/mint/lib/gate-a-scan.mjs` is a verbatim copy; the file does not exist (B-1569); no rollback by design (caller owns cleanup) |
| src/lib/contracts/envelope.mjs | 1-330 (330) | number envelope: derivation classes, validation, freshness, precision, delta formatting, propagation | KEEP AS-IS | 190 | 9 files (top 3): MarketComparativeRibbon.tsx, propagation/admissible-for.ts, supabase-server.ts | isDegraded dead (section 4); `propagate` collapses an unknown derivation to "estimated" without a note (B-1015); comment 215 asserts live state ("frozen today") |
| src/lib/contracts/factor-tier.mjs | 1-403 (403) | emission-factor tiers, scope kinds, validation, resolver, SQL generators | REFACTOR AND PORT | 200 | 1 importer: scripts/gen/emission-factors-common.mjs (validateFactor only) | the resolver and three helpers have no caller (B-0557); the operator message at 153 names `corridorId()`, whose module was deleted in #1007 (B-1016, B-1017) [CONFIRMED read] |
| src/lib/contracts/source-licence.mjs | 1-446 (446) | licence register (28 sources: 17 permitted, 2 conditional, 9 prohibited), the embed gate, attribution, seed SQL | KEEP AS-IS | 370 | 4: factor-tier.mjs, seed-derived-values.mjs, sbti-target-dashboard-producer.mjs (and emission-factors-common.mjs) | comment 384 says the register holds "twenty-six" [CONFIRMED: node import counts 28; B-1018, B-1550]; assertEmbeddable has no code caller |
| src/lib/contracts/verbatim-grounding.mjs | 1-31 (31) | ADR-016 verbatim check for producer candidates | REFACTOR AND PORT | 25 (core/contracts/verbatim) | 2 re-export shims: regional/state-cost-facts-envelope.mjs, market/carrier-ets-surcharge-envelope.mjs | semantics differ from record-facts.mjs assertVerbatim (section 5); no Unicode quote or dash folding (B-0865, HYPOTHESIS) |
| src/lib/contracts/vocabularies.mjs | 1-563 (563) | the shared closed vocabularies and mode normalisation | KEEP AS-IS (consumed members) | 290 | 21 files (top 3): PortfolioDetailView.tsx, ObligationRegisterPageView.tsx, ObligationRegisterFilterBar.tsx | 14 exports with no consumer (section 4); comments 360 and 507 assert live state (B-0673) |
| src/lib/classification/classify-source.mjs | 1-82 (82) | Axis 3/4/5 proposals for a source's unset fields | REFACTOR AND PORT | 40 (axes) | 2: propose-classifications.mjs, apply-classifications.mjs | |
| src/lib/classification/expected-output.mjs | 1-61 (61) | Axis-5 role default distributions | KEEP AS-IS | 35 | 3: classify-source.mjs, propose-classifications.mjs, apply-classifications.mjs | standards_body row sums to 102.5 before normalisation; normalised by design |
| src/lib/classification/flags.mjs | 1-23 (23) | flag namespace and subtypes for the proposal bus | TRASH | 0 | 2: propose-classifications.mjs, apply-classifications.mjs | exists only for the flag bus (section 3 rank 1) |
| src/lib/classification/jurisdiction.mjs | 1-65 (65) | Axis-3 jurisdiction from an institutional host suffix | KEEP AS-IS | 30 | 1: classify-source.mjs | |
| src/lib/classification/routing.mjs | 1-100 (100) | Axis-5 routing, anomaly, drift, observed distribution | REFACTOR AND PORT | 30 (drift and observed only) | 2: propose-classifications.mjs, apply-classifications.mjs | routing and anomaly are dead (section 4; B-0556 HALF-SLICE, B-0670 DEAD) |
| src/lib/classification/scope.mjs | 1-156 (156) | Axis 4a/4b/4c keyword and role classifiers | KEEP AS-IS | 90 | 2: classify-source.mjs, apply-classifications.mjs | |
| src/lib/classification/vocab.mjs | 1-87 (87) | Axis 3/4/5 value sets and shape checks | REFACTOR AND PORT | 25 | 5: jurisdiction.mjs, routing.mjs, expected-output.mjs (top 3) | 7 dead exports (section 4) |
| scripts/classification/apply-classifications.mjs | 1-984 (984) | apply ratified or auto-adopted classification proposals; re-derive zero-proposal flags; resolve drift; retire anomaly flags | REFACTOR AND PORT (into one job) | into classify-sources (110) | 1: propose-classifications.mjs (imports one note builder) | no invoker since CLEAN-3; `--all-ratified` and `--auto-adopt` list reads (899-903, 923-927, 950-951, 966-967) are unpaginated; the 2026-09-12 note in the file counts 1,287 open classification flags, above a 1,000-row cap [HYPOTHESIS for production max_rows] |
| scripts/classification/propose-classifications.mjs | 1-306 (306) | open classification and drift flags from the axis classifiers | REFACTOR AND PORT (into one job) | into classify-sources (40) | 0 | no invoker since CLEAN-3 |
| scripts/_reground/executor-ground.mjs | 1-31 (31) | the FREE injected-ledger grounding entry (groundBrief with `injectedLedger`) | REFACTOR AND PORT | 20 | 0 importers; F21 and RD-47 enforcers named it (deleted) | the model call is skipped when a ledger is injected: `claims = injected ?? extractClaimLedgerLenient(await callSonnet(...))` (canonical-pipeline.ts groundBriefImpl) [CONFIRMED read]; reads drop `error` (26-27) |
| scripts/_reground/free-pass-run.mjs | 1-119 (119) | $0 floor-first re-attribution of failing FACT spans to held primary captures | REFACTOR AND PORT | 60 (quarantine step) | 0 | four reads drop `error` (32, 57, 95, 102) [CONFIRMED grep]; hostOf duplicate (B-2195) |
| scripts/_reground/id-stamp.mjs | 1-67 (67) | stamp a canonical instrument identifier after target-match id-confirms, under a lease | REFACTOR AND PORT | 35 (quarantine step) | 0 | whole-table read to find one item (19-20, 61) |
| scripts/_reground/lease.mjs | 1-32 (32) | mutation-lease acquire, heartbeat, release CLI | TRASH | 0 | 0 | a thin CLI over scripts/lib/mutation-lease.mjs, which P1-08 owns; feature row in section 8 |
| scripts/_reground/target-match-probe.mjs | 1-41 (41) | read-only target-match report over non-verified items | TRASH | 0 | 0 | diagnostic; feature row in section 8 |
| scripts/_reground/tombstone-delete.mjs | 1-107 (107) | erase leg: tombstone to disposition_ledger, then guarded delete, under a lease | REFACTOR AND PORT | 70 (quarantine step) | 0 | the census gate reads `corpus_census.haiku_verdict` (49-50), a metered-Haiku output with no writer (B-0592); `--empty-only` reads every claim row (57) |
| scripts/regen-quarantined.mjs | 1-77 (77) | $0 cheap re-verify of quarantined items, re-validate on verified_cheap | REFACTOR AND PORT | 40 (quarantine resolver) | 1: plan-quarantine-disposition.mjs | the rpc result is not checked (49) |
| scripts/plan-quarantine-disposition.mjs | 1-307 (307) | per-item disposition plan with deferral candidates | REFACTOR AND PORT | 110 (quarantine planner) | 0 | DEFERRAL_WINDOW_DAYS is 30 (31) against the 14-day dwell bound; isValidDeferral has no upper bound [CONFIRMED read of scripts/lib/deferral.mjs]: section 8, Rulings to settle |

## 8. Build plan for this module

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/features/intake/staged-transit.ts | apply-staged-update.ts 24-44, 95-99, 194-344; run-intake-cycle.ts 371-412 (stage and stamp) | `applyStagedUpdate` with an explicit update_item column allowlist; entity gate; `stageCandidate`; `stampDisposition` that checks `error` and reports a failed stamp | 150 |
| src/features/intake/mint.ts | mint-item.ts 20-266 | pure gates (idempotency, congruence, dedup over the FULL non-archived corpus via paginate, relevance, domain, format_type, source link), dry boundary, the single INSERT, then one call to participation | 200 |
| src/features/intake/flywheel-participation.ts | flywheel-steps.mjs 1-107; mint-enrichment.ts 33-64; flywheel-defect.ts 8-67; apply-staged-update.ts 114-192; mint-item.ts 269-445 | one step list (lineage, discovery, forward events with 307-key dedupe and stale report, compliance sync, entities, title timeline, seek-study and low-relevance flags) run for `context: mint` or `context: update` with the changed fields; every write checked; defect flags deduped on (item, step) | 170 |
| src/features/intake/cycle.ts | run-intake-cycle.ts 11-60, 321-490; pool-row-contract.mjs 1-25 | plan mode (dry), apply mode: stage, mint, record-only pool row by default; brief grade only through the injected-brief seam | 130 |
| src/features/intake/change-sweep-drain.ts | run-intake-cycle.ts 187-319 | drain marked change-sweep update_item rows; $0 re-verify; re-validate; checked stamps | 80 |
| src/features/intake/portal-ledger.ts | portal-harvest.ts 8-533; promote-cap.mjs 12-18 | batched persist, RPC-only keyset page, consume with a verdict source (session file or rule), dry pre-pass, capped promote, checked stamps | 210 |
| src/features/intake/record-facts/triggers.ts | record-facts.mjs 55-190, 408-424, 490-503, 577-579, 685-686, 772-788; record-facts-research.mjs 14-31, 39-104 | every trigger table as data, the slot families, EU-act slot list, URL-bearing slots | 140 |
| src/features/intake/record-facts/extract.ts | record-facts.mjs 14-25, 205-321, 346-394, 431-737, 746-837 | prose guard, one walker, one claim constructor, specialised extractors, `buildRecordFacts` with one claim per slot | 120 |
| src/features/intake/record-facts/payload.ts | record-facts.mjs 845-1010; record-facts-research.mjs 193-277 | stub full_brief (markers refused), record payload, research profile without the duplicate pair; the `item.*` lift is kept only for fields a writer persists (section 8, Rulings to settle) | 120 |
| src/features/intake/write-item.ts | write-item.ts 1-329 | the ordered write sequence and row builders | 200 |
| src/features/intake/quarantine/resolver.ts | regen-quarantined.mjs 13-62 | cheap re-verify per quarantined item, checked re-validate, returns ids | 40 |
| src/features/intake/quarantine/planner.ts | plan-quarantine-disposition.mjs 31-139, 144-158 | dwell classification, reason classes, deferral candidates; run recording handed to P1-08 | 110 |
| src/features/intake/quarantine/rehome.ts | free-pass-run.mjs 19-106 | $0 floor-first re-attribution step | 60 |
| src/features/intake/quarantine/id-stamp.ts | id-stamp.mjs 19-66 | id-confirm-and-stamp step with a keyed lookup | 35 |
| src/features/intake/quarantine/erase.ts | tombstone-delete.mjs 21-106 | tombstone then delete, bucket allowlist, content-emptiness gate (deterministic, replacing the Haiku census gate) | 70 |
| src/features/intake/cli/ground-injected.ts | executor-ground.mjs 13-31 | the FREE injected-ledger grounding entry with checked reads | 20 |
| src/core/contracts/vocabularies.ts | vocabularies.mjs 1-563 | consumed vocabularies, mode normalisation; unconsumed ones land with their first reader | 290 |
| src/core/contracts/envelope.ts | envelope.mjs 1-330 | as today, isDegraded dropped | 190 |
| src/core/contracts/source-licence.ts | source-licence.mjs 1-446 | register (as a data module), gate, attribution, seed SQL generator | 370 |
| src/core/contracts/factor-tier.ts | factor-tier.mjs 1-403 | tiers, scopes, validateFactor, SQL generators; resolver ported when its first reader is (P1-19..21 operations or market) | 200 |
| src/core/contracts/verbatim.ts | verbatim-grounding.mjs 1-31; record-facts.mjs 14-25 | one verbatim rule matching `validate_item_provenance` criterion 3 | 25 |
| src/features/sources/axes.ts (home P1-05; ported by this lane's register) | classify-source.mjs 9-82; jurisdiction.mjs 16-65; scope.mjs 4-156; expected-output.mjs 11-61; vocab.mjs 17-74; routing.mjs 64-100 | Axis 3/4/5 classifiers, defaults, observed distribution, drift | 260 |
| src/features/sources/classify-sources.ts (home P1-05) | propose-classifications.mjs 39-302; apply-classifications.mjs 104-133, 180-371, 413-480, 579-623 | one deterministic job: compute, decide, write sources, adopt observed on drift, record a born-resolved audit row | 150 |

### Data model (columns actually used; "unused" means no code in this scope reads or writes it)

- `staged_updates` (004, 034, 167): read `*` in the drain; written `update_type, proposed_changes, reason, source_url, status, confidence` (insert), `status, reviewed_by, reviewed_at, reviewer_notes, materialized_at, materialized_item_id, materialization_error` (stamps). Unused here: `item_id` written (read only), `source_id`, `batch_id`.
- `intelligence_items`: read `id, source_url, legacy_id, title, instrument_identifier, is_archived, provenance_status, source_id, item_type, domain, created_at, jurisdiction_iso, canonical_instrument_key, instrument_type, archive_reason, full_brief` and the `CONNECTION_SIGNATURE_COLUMNS`; INSERT through the seed with any caller-supplied column (no allowlist in the chokepoint, the seed is the caller's); update_item writes any column; status_change writes `status`; archive_item writes `is_archived, archive_reason, archive_note, archived_date`; quarantine tools write `instrument_identifier, updated_at` and delete rows. Columns this module computes that do not exist on the table: `binding_position, due_date, date_precision, corridor_identity, research_credibility` (record payload only) [CONFIRMED: migration grep finds them on `obligations` (290) only].
- `sources`: read `id, url, name, source_role, status, base_tier, tier_override, jurisdictions, jurisdiction_iso, scope_topics, scope_modes, scope_verticals, expected_output, secondary_roles, category`; written `jurisdiction_iso, scope_topics, scope_modes, scope_verticals, expected_output` (classification) and a full insert on new_source with `source_role` at birth. `jurisdictions` (legacy region bucket) is read, never written, by design.
- `portal_link_candidates`: read `id, url, anchor_text, source_id, first_seen_at, status` with the `sources(name, category, base_tier)` embed; written `source_id, url, anchor_text, last_seen_at` (upsert on url) and `status, disposition_reason, dispositioned_at, item_id`.
- `item_forward_events`: read `id, event_date, event_kind, obligation_text, source_claim_id, source_section_id`; insert extracted rows. `item_timelines`: read `id`, insert one title-derived row. `item_cross_references`: upsert `source_item_id, target_item_id, relationship='related', origin='entity_extraction'`. `integrity_flags`: insert `category, subject_type, subject_ref, description, recommended_actions, status, created_by`; resolve `status, resolved_at, resolved_by, resolution_note`. `agent_run_searches`: read `result_content, result_index`; insert pool rows. `section_claim_provenance`: read `id, claim_text, claim_kind, source_span, source_id, source_tier_at_grounding`; update `source_id, source_tier_at_grounding`. `disposition_ledger` (213): insert the tombstone. `corpus_census`: read `intelligence_item_id, haiku_verdict` (no writer anywhere, B-0592). `agent_runs`: read `fetch_html_bytes`. `harness_runs`: insert one run row.
- RPCs: `validate_item_provenance(p_item_id)`, `next_uncensused_portal_candidates(p_source_id, p_limit, p_newest, p_after_first_seen, p_after_id)`, the mutation-lease RPCs (211).
- Views: none read directly; factor-tier.mjs generates `emission_factor_candidates` and constraints into migration 258.

### Interface to other modules

- Exports offered: `applyStagedUpdate`, `isSubstantiveUpdate`, `mintIntelligenceItem` (dry and apply), `runParticipation`, `runIntakeCycle`, `drainChangeSweepUpdates`, `persistPortalCandidates`, `selectCandidateLedgerPage`, `consumePortalCandidates`, `buildRecordPayload`, `buildResearchRecordPayload`, `buildRecordSlotClaim`, the slot extractors, `buildRecordFullBrief`, `writeGroundingSequence` and its builders, `buildGateARow`, `classifyMintOutcome`; contracts: `makeEnvelope`, `stalenessOf`, `propagate`, `formatDelta`, `significantFigures`, `roundToSampleSupport`, `DERIVATION`, `isContractable`, `isStatutory`, the vocabularies and `normaliseMode`, `validateFactor`, the render*Sql generators, `mayEmbedAsSeed`, `attributionsFor`, `groundCandidate`; source axes: `proposeSourceAxisClassification`, `detectDrift`, `observedDistributionFromItems`; quarantine: resolver, planner, re-home, id-stamp, erase.
- Imports needed: P1-01 auth-db (`getServiceSupabase`, `fetchAllRows` for the full dedup corpus, `isRefusal`/`requireAdmin` for the admin run-intake route); P1-03 intake-a (the brief generation and grounding pipeline: `groundBrief` with `injectedLedger`, the claim-ledger gates, and `validateClassifyVerdict`, the free half of first-fetch classify that P1-03's register assigns to this module as the verdict validator; P1-03 in turn imports this module's `write-item.ts` builders, `writeGroundingSequence` and `mintIntelligenceItem`, intake-a.md section 8); P1-05 sources-a (`urlIsRoot`, `classifySourceRole`, `canonicalizeUrl`, `verifyItem`, `getSnapshot`, `probeFreshness`, `cheapVerifyClaims`, `CHANGE_SWEEP_STAGED_MARKER`, `host-authority` tiers, `target-match`; home of `features/sources/axes.ts` and `classify-sources.ts`); P1-08 harness (run recording, `harness_runs`, mutation leases, the injected-brief seam's executor contract); P1-09 flywheel-a (`runConnectionDiscovery`, `readAndExtractForwardEvents`, `syncComplianceDeadlineForItem`, `linkItemEntities`, `linkItems`, `flag-namespaces`); agent (`specForItemType`, `gate-a-scan`, `section-markers`, `timeline-backfill-derive`, `groundBrief` with `injectedLedger`); `domainForItemType` (src/lib/domains.ts).
- Consumers by module: P1-19..21 surfaces (vocabularies in 21 files, envelope in 9: Market ribbon, obligation register, portfolio, list surfaces, series freshness, the operations region grid, supabase-server); P1-03 intake-a (write-item, mint, the cycle as a caller of the workflow) and the scripts/mint, scripts/turns and scripts/research runtimes (record-facts, write-item, mint-enrichment, research-walker dry mint; their Part 1 owner is not named in the brief); P1-05 sources (portal persist from check-sources, change-sweep drain from run-change-detection); admin (P1-25/26) run-intake route.
- **Gaps for the coordinator.** (1) The brief describes classification as deriving item_type, format_type and surface. `src/lib/classification` does not: it classifies SOURCES on Axes 3/4/5 [CONFIRMED read]. Item taxonomy at intake is set by the metered classifier (`first-fetch-classify.ts` system prompt, its lines 33-39) or the caller's seed; domain by `domainForItemType` through `canonicalDomainOverride` (mint-item.ts:35-43, 207-211); format_type by `specForItemType` (mint-item.ts:222-225); surface by `surfaceOf` (src/lib/surface-of.mjs, out of this scope). This register assigns the source-axis code to P1-05 and leaves the item-taxonomy rule set to whichever lane owns `domains.ts`, `extract-registry` and `surface-of.mjs`; that owner is not named in the brief's id list. (2) The brief describes contracts as the per-surface analysis contracts (Regulations compliance-action text, Market comparative numerical, Research horizon assessment, Operations jurisdictional data). `src/lib/contracts` holds data contracts instead (envelope, vocabularies, factor tiers, licences, verbatim) [CONFIRMED read]. The four-surface contract assessment lives in one place in this tree: the Haiku system prompt's `surface_tags` instruction (first-fetch-classify.ts:39), carried through portal-harvest.ts as `surfaceTags` (96-100). When the metered call is not ported, that assessment has no home: section 8 rulings.

### LLM call sites and what replaces them (operator rule: everything FREE, no metered model call ported)

| site | purpose | replacement |
|---|---|---|
| src/lib/intake/portal-harvest.ts:328 and :410-420 (`firstFetchClassify`, Haiku through `spend-client`) | classify each fetched ledger candidate: entity verdict, item_type, domain, severity, priority, urgency, topics, jurisdictions, title, summary, relevance, surface tags | session-authored input: the verdict file the run-ledger-consume runtime already reads (`buildVerdictClassify`, `classifyGate` with `willClassify` and `needsFetch`, portal-harvest.ts:188, 365-378) becomes the only classify source, validated by P1-03's `validateClassifyVerdict` (intake-a.md section 8); deterministic rules where they exist (CELEX key to item type, `classifyItemTypeFromCelexKey` in scripts/mint/export-census-rows.mjs; host class for entity gate). A candidate with no verdict is `skipped`, never metered. |
| src/lib/intake/run-intake-cycle.ts:354 and :463 (`generateBriefWorkflow`, Sonnet generate and ground) | brief-grade grounding after a mint | record-only by default (record-facts, $0, the existing `recordOnly` branch 425-451); brief grade only through the injected-brief seam (`groundBrief(itemId, caller, { injectedLedger })`, which skips `callSonnet`), driven by `features/intake/cli/ground-injected.ts` with a session-authored ledger |
| scripts/_reground/tombstone-delete.mjs:49-50 (`corpus_census.haiku_verdict`) | an irreversible delete gated on a stored metered-model verdict | the deterministic content gate already in the file (`--empty-only`: empty brief AND zero claims, 56-64) plus the bucket allowlist (26-37) and the active-source precondition (18); the Haiku census column is not read |
| scripts/_reground/executor-ground.mjs:22 (`groundBrief` with `injectedLedger`) | FREE by construction | kept as the seam (no change) |

### Invariants this code enforces

Already in data-invariants.md: INV-001 and INV-104 (classification proposals and drift), INV-002, INV-021, INV-055, INV-114 (quarantine disposition and dwell), INV-004 (format_type), INV-015 (staged transit), INV-025 (hollow record), INV-056 (free re-home), INV-093 (no source-less live item), INV-101 (id-stamp under lease; tombstone before delete), INV-109 and INV-144 (emission factors licence-gated), INV-125 to INV-127, INV-129 (provenance gate), INV-145 (forward event text identity). Appended by this lane, same commit:

- INV-169: the mint chokepoint is the only runtime INSERT into `intelligence_items`; it refuses on any read error of its idempotency probes, dedup corpus or source registry; the dedup corpus covers every non-archived row.
- INV-170: a staged new_item never mints a portal root URL, never carries a non-column input (`relevance`, `capturedText`, `key_deadlines`, `source_name`, `authority_level`) into the INSERT, and every disposition stamp it writes is checked.
- INV-171: a record-grade claim set holds at most one claim per slot, every FACT `source_span` is a verbatim substring of the captured text under the database rule, and the stub `full_brief` is built only from claim text (digit-free boilerplate).
- INV-172: a substantive update (any column outside the non-substantive deny list) reruns discovery, forward-event extraction deduped on the migration-307 key with stale events flagged and never deleted, and the compliance_deadline sync; it re-links entities when `jurisdiction_iso` or `canonical_instrument_key` changed; an empty or bookkeeping-only change runs none.
- INV-173: a missing observation (an SDMX missing obs_status) never carries a value; an aggregate takes the weakest origin_class, the least contractable derivation and the worst freshness of its inputs; freshness is derived from the as-of triple and the cadence, never stored as asserted.
- INV-174: an emission factor is selected by tier rank, then scope specificity, then recency; an invalid, superseded, out-of-window or licence-unclear candidate is skipped and reported, never served; an unregistered source key fails the embed gate closed.

Properties (not data invariants) the new tree must carry as tests: the four SQL generators byte-match the generated blocks in migration 258 (the guard that did this was deleted in CLEAN-3); a dry mint and an apply mint take the same gate decisions on the same state; the record extractor's FACT spans pass `validate_item_provenance` criterion 3 by construction.

### Rulings the code embodies (cite)

- Machine gates are the approval; staged updates are transit-only and never park (ADR-012 rider 2026-07-11, RD-20; run-intake-cycle.ts:371-412; fsi-app/.claude/CLAUDE.md "Constraints").
- Source-link invariant: no source-less live mint, no auto-registration in the chokepoint (ruled 2026-07-12; mint-item.ts:81-99, 227-246).
- Relevance is fail-open, surface-only, floor 40, routed to the flag resolver (D3 ruling 2026-07-12; mint-item.ts:45-47, 424-445).
- Congruence 1a retypes a primary-artifact type on news to market_signal; 1b keeps research_finding and seeks the study (phase-intake-gate; mint-item.ts:155-165).
- Fail-closed duplicate probes (C4, 2026-07-11; mint-item.ts:139-153, 168-174).
- Domain derived for unconditional item types; format_type through the same registry generation forces (task 1.2, coordinator ruling 2026-09-11; mint-item.ts:20-43, 213-225).
- Rule 16/17: nothing runs alone; every mint and substantive update participates in the flywheel and a failure is a recorded defect, never a silent skip (CLAUDE.md rule 17; mint-item.ts 285-408; apply-staged-update.ts 101-192).
- Record grade is a label, not a second gate (Lane POP, migration 278; mint-item.ts:58-70, 133-137).
- Canonical transport mode is `ocean`; `sea` and `maritime` are input aliases (operator ruling 2026-08-12, migration 263; vocabularies.mjs:486-550).
- duty_holder_class is the authoritative list, no CHECK on the column (coordinator 2026-10-08, lane OBL-2; vocabularies.mjs:309-351).
- `statutory` derivation classes rank above `observed` and alone may carry a penalty figure (2026-08-12; envelope.mjs:11-25, 68-70).
- Licence register verdicts and the EMSA discharge (operator ruling 2026-08-30; source-licence.mjs:146-174).
- Classification auto-adoption by rule (operator ruling 2026-09-03), every proposal decided (ADR-030 rider, task 7.2, 2026-09-12), anomaly detector retired (D17 family 5); jurisdiction_iso adopts after migration 033 (D9, 2026-09-13) (apply-classifications.mjs:172-371, 570-680).
- Tombstone-then-delete only for content-survives, duplicate or pure-artifact buckets; never delete accurate archived data (operator rulings 2026-07-16 and 2026-07-17; tombstone-delete.mjs:14-37, 52-64).
- Build mode holds the scrape cadence off and every runtime is dispatched (CLAUDE.md rule 16): these scripts have no schedule by design.

### Rulings to settle (decision-ready, rule 13)

1. Verbatim rule: one semantics for every FACT span check. Options: the database's criterion 3 (the record extractor's header says case-insensitive substring) for all callers, or keep the producers' whitespace-insensitive, case-sensitive variant as a named second mode. Evidence: section 5. Recommendation: one rule, the database's.
2. Record payload fields with no column: `binding_position`, `due_date`, `date_precision`, `corridor_identity`, `research_credibility` are computed and dropped. Options: add columns (`due_date` would need a parse from the phrase), or route them to `obligations` (which already has `binding_position`, `due_date`, `date_precision`), or stop computing them. Recommendation: route to obligations and stop the item lift.
3. Deferral window 30 days vs the 14-day dwell bound: `isValidDeferral` has no upper bound, so a planner deferral extends a quarantined item to 44 days. Options: cap deferrals at 14 days, or keep 30 and state it. INV-054 already records a 30 vs 14 disagreement for the flag dwell bound.
4. The four-surface contract assessment (surface tags) has no non-metered home once `firstFetchClassify` is not ported. Options: the session verdict file carries `surface_tags` (it is session-authored input already), or a rule from item_type through `surfaceOf`. Recommendation: verdict file, with `surfaceOf` as the fallback.
5. `update_item` column allowlist: today any proposed column is written. The change-sweep bridge sends `{}`; no other runtime caller stages update_item [HYPOTHESIS: grep found the drain as the only consumer of update_item rows on this tree]. Recommendation: allowlist the content and date columns named in apply-staged-update.ts:55-66 and refuse the rest.

### Proof that the module works in the new tree

1. Golden gate cases (the content of intake-url-corpus.mjs as fixtures): 20 URL role and root cases, 6 congruence cases, 5 dedup cases, each red against a broken copy first.
2. Mint chokepoint: dry and apply agree on every fixture; a read error on each of the three probes refuses; a 1,500-row corpus finds a duplicate in row 1,400 (the pagination fix); a source-less seed is refused; a preset source_id is trusted.
3. Participation: a mint and a substantive update produce the same step list; a re-run inserts zero forward events (307 key); a removed claim yields a stale-events flag and no delete; a failing step records one deduped defect flag and the write error is visible.
4. Staged transit: a root URL never mints; `relevance` and `capturedText` never reach the INSERT; a failed disposition stamp is reported; an update_item with a column outside the allowlist is refused.
5. Record facts: the research payload has one claim per slot (the executed duplicate case as a regression test); every FACT span passes the database verbatim rule; the full brief contains no internal marker.
6. Contracts: the four SQL generators byte-match migration 258's generated blocks; `makeEnvelope` refuses a missing observation with a value; `propagate` returns weakest, least contractable, worst; `resolveActiveFactor` skips an unlicensed tier-1 row and serves the licensed tier-4 row; the register count line matches `SOURCE_KEYS.length`.
7. Source axes: the classify-sources job on fixture sources writes the auto-adoptable fields and nothing else; drift with 20 items over 2 dates adopts the observed distribution.
8. Quarantine: planner reason classes for each resolver outcome; erase refuses a content-bearing row and a row whose source is not active; the tombstone row exists before the delete.
9. `npm run typecheck` and `next build` (the CI job).

### Port order

1. core/contracts (vocabularies, envelope, verbatim, source-licence, factor-tier): 21 surface files import vocabularies.
2. features/intake/write-item.ts and record-facts (pure, used by P1-03 runtimes).
3. features/intake/flywheel-participation.ts (needs P1-09 flywheel-a exports).
4. features/intake/mint.ts, then staged-transit.ts.
5. features/intake/cycle.ts, change-sweep-drain.ts, portal-ledger.ts (needs P1-05 sources exports).
6. features/intake/quarantine/* and cli/ground-injected.ts (needs P1-08 leases and run recording).
7. Hand the source-axis library and the classify-sources job to P1-05's tree.

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old file(s) | new home |
|---|---|---|
| Materialise a staged new_item through the chokepoint | apply-staged-update.ts 201-267 | staged-transit |
| Entity gate: a portal root URL is a source, not an item | apply-staged-update.ts 226-234 | staged-transit |
| update_item with flywheel participation on substantive change | apply-staged-update.ts 46-99, 268-288 | staged-transit + participation |
| status_change and archive_item | apply-staged-update.ts 289-299, 323-337 | staged-transit |
| new_source with source_role at birth | apply-staged-update.ts 300-322 | staged-transit (role classifier from P1-05) |
| Idempotent mint by source_url and legacy_id | mint-item.ts 139-153 | mint |
| Congruence retype (1a) and seek-study flag (1b) | mint-item.ts 155-165, 410-423 | mint + participation |
| Subject-existence dedup with news-to-primary linking | mint-item.ts 167-196, 270-284 | mint + participation |
| Relevance floor flag (surface-only) | mint-item.ts 198-200, 424-445 | mint + participation |
| Domain canonicalisation and format_type stamp | mint-item.ts 202-225 | mint |
| Source-link invariant with registry lookup | mint-item.ts 227-246 | mint |
| Dry mint verdict identical to apply | mint-item.ts 248-256 | mint |
| Typed lineage links at birth | mint-item.ts 285-310 | participation |
| Connection discovery after mint and update | mint-enrichment.ts 41-47; flywheel-steps.mjs 27-36 | participation |
| Forward-event extraction with dedupe and stale report | flywheel-steps.mjs 53-107; mint-enrichment.ts 49-61 | participation |
| compliance_deadline sync | mint-item.ts 341-347; apply-staged-update.ts 159-165 | participation |
| Entity spine linking | mint-item.ts 355-365; apply-staged-update.ts 173-191 | participation |
| Title-derived timeline row at birth | mint-item.ts 377-408 | participation |
| Rule-16(d) defect flags | flywheel-defect.ts | participation |
| One-invocation intake cycle with plan mode | run-intake-cycle.ts 321-504 | cycle |
| Record-only mint with the candidate's own text as the pool row | run-intake-cycle.ts 362-451; pool-row-contract.mjs | cycle |
| Brief-grade grounding after a mint | run-intake-cycle.ts 453-489 | cycle, through the injected-brief seam only (no metered call) |
| Change-sweep update_item drain with $0 re-verify and re-validate | run-intake-cycle.ts 187-319 | change-sweep-drain |
| Portal deep-link ledger persistence | portal-harvest.ts 24-43 | portal-ledger |
| Keyset page with census anti-join | portal-harvest.ts 238-324 | portal-ledger |
| Pre-fetch verdict gate (no fetch without a classification source) | portal-harvest.ts 168-188, 354-378 | portal-ledger |
| Access-wall and 200-character floor on fetched text | portal-harvest.ts 393-405 | portal-ledger |
| Classification of a candidate (entity verdict, type, surface tags) | portal-harvest.ts 409-436 | portal-ledger, from the session verdict file (not metered) |
| Dry pre-pass, exists-promote, reject stamp | portal-harvest.ts 449-472 | portal-ledger |
| Max-promote cap | portal-harvest.ts 483-497; promote-cap.mjs | portal-ledger |
| Ledger disposition stamps from the cycle trail | portal-harvest.ts 498-521 | portal-ledger |
| Record-grade verbatim slot extraction with prose and bare-domain guards | record-facts.mjs 55-394 | record-facts |
| Binding position from applicability language | record-facts.mjs 408-479 | record-facts |
| Due date with precision | record-facts.mjs 490-563 | record-facts |
| Corridor identity from a UN/LOCODE pair and mode | record-facts.mjs 577-649 | record-facts |
| EUR-Lex in-force status from the indicator widget | record-facts.mjs 685-737 | record-facts |
| EU-act self-description slots (operative provision, addressee, confirmed measure) | record-facts.mjs 171-189, 788, 829-834 | record-facts |
| Stub full_brief from claim text with the stub marker | record-facts.mjs 845-863 | record-facts |
| Record mint payload | record-facts.mjs 904-1010 | record-facts |
| Research profile slots (finding, limits, relevance, does-not-resolve, key figure, evidence and authority signals) | record-facts-research.mjs | record-facts (one claim per slot) |
| Ordered item write sequence (searches, sections, Gate A, claims, citations) | write-item.ts | write-item |
| Number envelope with derivation, as-of triple, precision, delta units | envelope.mjs | core/contracts/envelope |
| Freshness derivation including frozen | envelope.mjs 194-243 | core/contracts/envelope |
| Aggregate propagation (weakest origin, least contractable, worst freshness) | envelope.mjs 296-330 | core/contracts/envelope |
| obs_status, origin_class, binding_position, duty_holder_class, freshness, coverage_state, suppression reasons, transport modes | vocabularies.mjs | core/contracts/vocabularies |
| Admiralty, pedigree band, likelihood ladder, impact x applicability, typed relations (spec-defined, no reader yet) | vocabularies.mjs 134-261, 263-283, 371-404 | core/contracts/vocabularies, ported with their first reader (recorded here so they are not lost) |
| Emission-factor tiers, scopes, validation | factor-tier.mjs 12-210 | core/contracts/factor-tier |
| Active-factor selection and primary-data share (no caller yet) | factor-tier.mjs 212-303 | core/contracts/factor-tier, wired to the first factor reader |
| SQL generators for migration 258 | factor-tier.mjs 305-403; source-licence.mjs 380-434 | core/contracts, with the byte-compare proof |
| Licence register, embed gate, attribution strings | source-licence.mjs | core/contracts/source-licence |
| Verbatim grounding for producer candidates | verbatim-grounding.mjs | core/contracts/verbatim |
| Source Axis 3/4/5 classification with auto-adoption | src/lib/classification/*; scripts/classification/* | features/sources/axes + classify-sources (P1-05 home) |
| Drift auto-resolution to the observed distribution | apply-classifications.mjs 579-659 | classify-sources |
| Zero-proposal re-derivation from the class table | apply-classifications.mjs 413-568 | classify-sources |
| Human-ratified classification apply (`--flag`, `--all-ratified`) | apply-classifications.mjs 18-170 | NOT PORTED: superseded by the 2026-09-03 auto-adopt ruling and the ADR-030 rider; recorded here |
| Axis-5 tie-break routing of an item and the item-anomaly check | routing.mjs 13-54 | NOT PORTED: never wired; the anomaly detector was retired (D17 family 5); recorded here |
| $0 cheap re-verify of quarantined items | regen-quarantined.mjs | quarantine/resolver |
| Disposition planning with reason classes and deferral candidates | plan-quarantine-disposition.mjs | quarantine/planner |
| $0 floor-first re-attribution | free-pass-run.mjs | quarantine/rehome |
| Instrument-id confirm and stamp | id-stamp.mjs | quarantine/id-stamp |
| Tombstone-then-delete (erase leg) | tombstone-delete.mjs | quarantine/erase (deterministic gate) |
| Injected-ledger grounding entry | executor-ground.mjs | cli/ground-injected |
| Per-item mutation lease CLI | lease.mjs | P1-08 harness (lease library); the CLI is not ported |
| Target-match report over non-verified items | target-match-probe.mjs | NOT PORTED as a script; the same verdict is computed inside quarantine/id-stamp and is a query for the admin quarantine view (P1-25/26) |
| Intake gate golden cases | intake-url-corpus.mjs | test fixtures (Proof 1) |
| Source-less live tripwire | source-link-invariant.mjs | INV-093 proof query |

### Defects the new code must not repeat (from the backlog rows in scope; the BACKLOG file carries the STATUS cells)

An unpaginated dedup corpus (B-0267, B-1988), swallowed database errors in the defect recorder and three mint flags (B-0060, B-0263, B-0264, B-0265), unchecked staged-update stamps and pool insert (B-0062, B-0564, B-1990), an update path with no column allowlist (B-0059), two forward-event insert paths (B-2160, B-2161), duplicate research claims (B-1568, B-2163, B-2164), a stale corridorId() message (B-1016, B-1017), a stale register count (B-1018, B-1550), a stale verbatim-copy comment (B-1033, B-1569), a delete gated on a metered census column with no writer (B-0592).
