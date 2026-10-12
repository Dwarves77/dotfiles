# P1-05 sources-a: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-05, DISPOSITION lane, read-only. Tree: origin/master `904680db0`, fast-forwarded to `a2f9f3f11` (P1-03 landed while the lane read) before this register was written; no file in scope changed between the two. Written by a cloud session on 2026-10-12. Every file in SCOPE was read whole with the Read tool; the coverage table below records each read. Every claim carries `[CONFIRMED]` (executed or read this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`. Prior registers were read as scope-filtered extractions (every line naming an in-scope path, 144 lines across 17 registers); the 55 A3 rows, 24 A4d rows, 17 A4 rows, 2 C4 rows, 4 F1 rows and the A1, B1b, B1c, B2, C3 rows were read; the D1-part2, D1-part4, D2 and MEM-1 hits name these paths inside rule and skill inventories, not as code findings, and were not used.

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost). Code lines are non-blank non-comment lines by awk (`//` lines, `/* */` blocks and leading-`*` lines stripped), the same counter P1-01 used. Raw lines are `wc -l`.

## 1. Header and coverage

Module: sources-a. The source credibility model of fsi-app (institution resolver, class table, trust score, effective-tier movement, citation growth, tier opinions, bias tags, customer tier display), the candidate verification pipeline, the fetch primitive and its hold gate, the transport ladder and wall classifiers, the snapshot store, change detection, the source walkers, and three files the scope names that belong elsewhere (`fetch-quality.ts`, `tier1-priority-jurisdictions.ts`, the jurisdiction half of nothing else).

Scope size: the brief expected about 11,600 lines; `git ls-files` returns 60 files and 10,158 raw lines on this tree [CONFIRMED: `wc -l`]. The difference is consistent with the test files the CLEAN cuts deleted (A3:L8 listed 141 test files across its wider src/lib scope) [HYPOTHESIS: the brief's figure was not traced].

Coverage (60 files, 10,158 raw lines, 6,288 code lines; `wc -l` and the awk count run 2026-10-12):

| path (under fsi-app/) | raw lines | code lines | read calls |
|---|---|---|---|
| src/lib/sources/access-wall.mjs | 136 | 60 | 1 |
| src/lib/sources/acquire-lock.mjs | 36 | 19 | 1 |
| src/lib/sources/amendment-diff.mjs | 143 | 86 | 1 |
| src/lib/sources/api-transport.mjs | 96 | 59 | 1 |
| src/lib/sources/bias-tag-pipeline.mjs | 152 | 108 | 1 |
| src/lib/sources/browserless.ts | 56 | 33 | 1 |
| src/lib/sources/canonical-fetch.mjs | 119 | 79 | 1 |
| src/lib/sources/change-sweep.mjs | 176 | 103 | 1 |
| src/lib/sources/charset-decode.mjs | 69 | 41 | 1 |
| src/lib/sources/cheap-verify.mjs | 64 | 42 | 1 |
| src/lib/sources/check-sources-decision.mjs | 24 | 17 | 1 |
| src/lib/sources/cited-host-gate.mjs | 19 | 10 | 1 |
| src/lib/sources/classify-source-role.ts | 111 | 54 | 1 |
| src/lib/sources/content-change.mjs | 30 | 13 | 1 |
| src/lib/sources/entity-gate.mjs | 92 | 58 | 1 |
| src/lib/sources/feed-discovery.mjs | 61 | 33 | 1 |
| src/lib/sources/feed-walk.mjs | 70 | 47 | 1 |
| src/lib/sources/fetch-hold.mjs | 147 | 89 | 1 |
| src/lib/sources/fetch-now-decision.mjs | 21 | 17 | 1 |
| src/lib/sources/fetch-quality.ts | 35 | 25 | 1 |
| src/lib/sources/freshness-probe.mjs | 56 | 34 | 1 |
| src/lib/sources/holdings-audit.mjs | 176 | 104 | 1 |
| src/lib/sources/holdings-gate.mjs | 34 | 16 | 1 |
| src/lib/sources/host-authority.ts | 659 | 321 | 1 |
| src/lib/sources/identifier-variants.mjs | 267 | 154 | 1 |
| src/lib/sources/institution.ts | 81 | 53 | 1 |
| src/lib/sources/null-tier-host-worklist.mjs | 68 | 34 | 1 |
| src/lib/sources/officialness.mjs | 145 | 74 | 1 |
| src/lib/sources/pdf-extract.mjs | 39 | 18 | 1 |
| src/lib/sources/portal-links.mjs | 47 | 33 | 1 |
| src/lib/sources/primary-fallback.mjs | 173 | 84 | 1 |
| src/lib/sources/promote-provisional.ts | 104 | 74 | 1 |
| src/lib/sources/reachability.mjs | 61 | 45 | 1 |
| src/lib/sources/recommend-source-tier.ts | 127 | 91 | 1 |
| src/lib/sources/reconcile.ts | 213 | 138 | 1 |
| src/lib/sources/register-walk.mjs | 172 | 96 | 1 |
| src/lib/sources/scrape-schedule.ts | 59 | 40 | 1 |
| src/lib/sources/sec-fair-access.ts | 11 | 11 | 1 |
| src/lib/sources/seek-more.mjs | 297 | 148 | 1 |
| src/lib/sources/sitemap-walk.mjs | 623 | 368 | 1 |
| src/lib/sources/snapshot-store.mjs | 106 | 65 | 1 |
| src/lib/sources/source-growth.ts | 584 | 394 | 1 |
| src/lib/sources/source-type-taxonomy.mjs | 198 | 164 | 1 |
| src/lib/sources/target-match.mjs | 308 | 171 | 1 |
| src/lib/sources/tier-opinion-writer.ts | 92 | 59 | 1 |
| src/lib/sources/tier-override-guard.mjs | 36 | 14 | 1 |
| src/lib/sources/transport-escalation.mjs | 256 | 152 | 1 |
| src/lib/sources/transport-runtime.mjs | 95 | 46 | 1 |
| src/lib/sources/url-canonicalize.ts | 68 | 43 | 1 |
| src/lib/sources/verification-decision.mjs | 16 | 11 | 1 |
| src/lib/sources/verification.ts | 991 | 686 | 1 |
| src/lib/sources/verify-item.mjs | 151 | 79 | 1 |
| src/lib/sources/vertical-fit-gate.ts | 54 | 41 | 1 |
| src/lib/sources/vertical-fit.ts | 73 | 42 | 1 |
| src/lib/credibility/bias-display.mjs | 128 | 76 | 1 |
| src/lib/credibility/chip-selection.mjs | 39 | 20 | 1 |
| src/lib/customer-source-tier.ts | 44 | 24 | 1 |
| src/lib/tier-labels.ts | 15 | 13 | 1 |
| src/lib/tier1-priority-jurisdictions.ts | 229 | 169 | 1 |
| src/lib/trust.ts | 1606 | 1090 | 2 (offsets 1, 821) |
| TOTAL | 10158 | 6288 | 61 |

Files not read whole: none. Test files: none exist beside the scope on this tree (the CLEAN cuts removed them), so every "exported for its test" export below has no importer.

Consumer evidence: for each of the 391 exported symbols, `grep -rlw <symbol>` over fsi-app/src, fsi-app/scripts and fsi-app/supabase (ts, tsx, mjs, js, sql) excluding the defining file, run by a scratch script (`consumers.mjs`, not committed); then a second pass that drops hits on comment lines; then by hand for every symbol claimed dead (section 4). Module importer counts in section 7 are files whose `import`/`from` specifier ends in the module's file stem [CONFIRMED: grep, 2026-10-12]. Skill read whole first: `fsi-app/.claude/skills/source-credibility-model/SKILL.md` (113 lines) and its BINDING reference `references/authority-floor-and-canonical-tier.md` (25 lines).

## 2. Module verdict

**REFACTOR AND PORT.** Every credibility responsibility is kept, and the moat rules hold in this code as written: `tierOfSource` reads base_tier only (institution.ts:48-49), register-at-grounding assigns a tier only from a deterministic rule or an existing institution (host-authority.ts:652-659, source-growth.ts:216-248, verification.ts:601-671), an admin override is never written over (tier-override-guard.mjs:30-36, trust.ts:1078-1080), an error body is never stored (transport-escalation.mjs:243-256), and the roadblock fallback widens the candidate set without touching the floor (primary-fallback.mjs:117-121, 149-168) [CONFIRMED read]. The code is not kept as it stands. It carries six disagreeing tier vocabularies, four separate wall and error-body classifiers, three hand-written html-to-text strippers, five copies of a host normaliser, two URL canonicalisers, two scrape-hold mechanisms, a 1,606-line trust file whose header block and four exports are dead, a candidate verifier and a tier recommender that spend on Haiku and Browserless, and a Browserless primitive at the bottom of every non-API fetch path.

**Current code LOC: 6,288** (awk over the 60 files). **Estimated clean LOC: about 4,000 for sources-a, plus about 150 that leave the module** (the jurisdiction priority list to the coverage module and the brief failure-phrase check to intake). Arithmetic from the section 8 file table: core/sources 1,445 (tier contract 70, host class 170, host class data 110, institution 60, classifiers 190, trust score 140, tier movement 360, bias tags 110, target match 150, officialness 85) + core/url 45 + core/fetch 840 (hold 80, body classifier 160, direct transport 110, official APIs 60, ladder 130, reachability 45, cache 35, candidate URLs 220) + features/sources 1,665 (snapshots 120, snapshot verify 120, holdings audit 90, change detection 210, growth 290, candidate verification 190, provisional 50, null-tier worklist 40, vertical-fit gate 35, sitemap walker 290, feed walker 65, register walker 100, portal links 40, shared XML helpers 25) = 3,995. Trashed as code: canonical-fetch.mjs 79, browserless.ts 33, recommend-source-tier.ts 91, acquire-lock.mjs 19 = 222 code lines; the Haiku branch of verification.ts and the dead exports in section 4 account for most of the remaining reduction. Against 6,288 the module shrinks to 64 percent. Estimates are read-derived [HYPOTHESIS until the port lane counts them].

Core responsibilities (14), with the files that carry them today:

1. Institution identity and the grounding-tier resolver: host to institution key (eTLD+1 with super-domain exceptions), one tier per institution from base_tier, exact-host override, suspended rows unselectable (institution.ts).
2. The class table: deterministic tier for a host by class (legal 1, gov 2, verifier, academic, association, standards body 4, analysis 6, law firm, news, company 7), ruled host instances, committed host verdicts, the D14 residue name rules, the never-register classes (aggregator, DOI resolver, hosting platform), and the register-at-grounding decision (host-authority.ts).
3. Source classifiers that are not tiers: source_role (classify-source-role.ts), institutional type for the off-vertical gate (vertical-fit.ts), source_type vocabulary (source-type-taxonomy.mjs).
4. Trust score: four weighted components and the tier-prior blend, planned for every non-paused source (trust.ts 14-187, 1129-1264).
5. Effective-tier movement: citation promotion, promotion and demotion evaluators, tier opinions, scored prediction outcomes, one clamped calculator, plan and apply with the override guard and the audit event (trust.ts 189-503, 649-1606; tier-override-guard.mjs).
6. Citation growth: register cited sources (existing, new at class tier, or provisional worklist), record citation edges, compound convergence with syndication collapse, recompute reputation, record tier opinions, register pool hosts before grounding, the free-brief entry citations (source-growth.ts, tier-opinion-writer.ts, cited-host-gate.mjs).
7. Customer-facing credibility signals: the tier a customer sees (override, effective, base), tier labels, bias-tag vocabulary, labels, chips and lower-confidence marking (customer-source-tier.ts, tier-labels.ts, bias-tag-pipeline.mjs, credibility/*).
8. Candidate verification (W2.F): reachability, domain authority, duplicate check, language heuristic, Haiku relevance and freight scores, aggregation to H/M/L, insert active at class tier or provisional, audit row (verification.ts, verification-decision.mjs, reachability.mjs).
9. Provisional promotion and the null-tier host worklist (promote-provisional.ts, null-tier-host-worklist.mjs, vertical-fit-gate.ts).
10. The fetch primitive and its gates: env scrape hold with two signed callers, fetch cache with host TTLs, Browserless three-tier render, direct transport helpers (charset, PDF), official APIs for Federal Register and eCFR, SEC fair-access UA (fetch-hold.mjs, canonical-fetch.mjs, browserless.ts, charset-decode.mjs, pdf-extract.mjs, api-transport.mjs, sec-fair-access.ts, scrape-schedule.ts).
11. Transport classification and the escalation ladder: failure classes, wall and error-body detectors, the write-side capture verdict, the primary roadblock fallback, candidate URL generation from instrument identity, the exhaustion record (transport-escalation.mjs, transport-runtime.mjs, primary-fallback.mjs, access-wall.mjs, entity-gate.mjs, seek-more.mjs, identifier-variants.mjs).
12. Capture qualification: target-instrument match, officialness (path a or b), holdings completeness and sufficiency, holdings-present gate (target-match.mjs, officialness.mjs, holdings-audit.mjs, holdings-gate.mjs).
13. Snapshot-first verification and change detection: snapshot store, content fingerprint, freshness HEAD probe, cheap span verify, verify-item routing, amendment diff, reconcile pass, change-sweep staged_updates bridge (snapshot-store.mjs, content-change.mjs, freshness-probe.mjs, cheap-verify.mjs, verify-item.mjs, acquire-lock.mjs, amendment-diff.mjs, reconcile.ts, change-sweep.mjs, check-sources-decision.mjs, fetch-now-decision.mjs).
14. Source walkers: sitemap with feed-first discovery, RSS and Atom feed walk, EUR-Lex OJ and Federal Register register walks, portal deep-link extraction (sitemap-walk.mjs, feed-discovery.mjs, feed-walk.mjs, register-walk.mjs, portal-links.mjs). Not sources-a but in scope: the priority jurisdiction list (tier1-priority-jurisdictions.ts) and the brief failure-phrase check (fetch-quality.ts).

Key dependencies [CONFIRMED by the import and `.from(`/`.rpc(` scans]:

- Modules imported from outside the scope: `@supabase/supabase-js`, `node:crypto`, `node:zlib`, `node:util`, `unpdf` (dynamic, pdf-extract.mjs:25); in-repo `@/lib/supabase-service` (verification.ts:2), `@/lib/llm/haiku-classify` (verification.ts:3), `@/lib/llm/spend-client` (recommend-source-tier.ts:7), `@/lib/llm/model-ids.mjs` (verification.ts:18, recommend-source-tier.ts:10), `@/lib/domains` (verification.ts:5), `@/lib/d3/hooks.mjs` (verification.ts:6), `@/lib/db/paginate.mjs` (trust.ts:12), `@/types/source` (trust.ts:1-11, source-growth.ts:3), `../agent/url-canon.mjs` (fetch-hold.mjs:3), `../agent/source-pool-hash.mjs` (seek-more.mjs:5), `../agent/source-blocks.mjs` authorityFloorFor (holdings-audit.mjs:3), `../agent/null-tier-flag.mjs` (null-tier-host-worklist.mjs:2), `../coverage/identity.mjs` (target-match.mjs:2), `../entities/entity-id.mjs` hostFromUrl (sitemap-walk.mjs:13, api-transport.mjs:9), `../text/html-to-text.mjs` (api-transport.mjs:3).
- Tables touched: sources, provisional_sources, source_citations, source_tier_opinions, source_trust_events (writer rows built here, written by source-growth and the recompute route), source_verifications, source_bias_tags (writer injected), source_reliability_ledger, system_state (scrape_cadence read), agent_run_searches, integrity_flags, agent_runs, intelligence_items, intelligence_changes, monitoring_queue, staged_updates, raw_fetches; Storage bucket `raw_fetches`. RPCs: none in scope. Views: none in scope.
- Env vars read: BROWSERLESS_API_KEY, BROWSERLESS_BASE_URL (canonical-fetch.mjs:32, 44), SCRAPE_HOLD (fetch-hold.mjs:38), GROUNDING_ACQUIRE_ENABLED (acquire-lock.mjs:3, 24), ANTHROPIC_API_KEY (verification.ts:911), SEC_FAIR_ACCESS_UA (sec-fair-access.ts:9), NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (recommend-source-tier.ts:30-31).
- External services and every network call site in scope:

| file:line | call | metered | what replaces it in the new tree |
|---|---|---|---|
| canonical-fetch.mjs:72 | Browserless `/content` POST (plain, then stealth) | yes (Browserless) | TRASH. The direct transport (plain HTTPS GET with charset and PDF decode) and the official APIs; a JS shell or bot wall holds NO_REACHABLE_SOURCE through the ladder's exhaustion record, never a paid render |
| canonical-fetch.mjs:87 | Browserless `/unblock` POST | yes (Browserless, residential proxy) | TRASH, same as above |
| browserless.ts:48 (via canonical-fetch) | typed wrapper used by verification.ts:282, 311, recommend-source-tier.ts:85, and outside the scope by bulk-import, fetch-now, spot-check and check-sources routes | yes | TRASH; those callers move to core/fetch/direct.ts |
| reachability.mjs:39, 49 | default `render = browserlessFetch` for the three-attempt reachability probe | yes | core/fetch/reachability.ts over the direct transport (HEAD, then GET on 405) |
| api-transport.mjs:39, 47, 74 | Federal Register documents JSON, its raw_text_url, eCFR versioner XML | no | KEEP behaviour in core/fetch/api.ts |
| freshness-probe.mjs:43 | HEAD request for Last-Modified and ETag | no | KEEP in features/sources/snapshots.ts, behind the hold gate (today it bypasses it) |
| fetch-hold.mjs:143 | `transportFetch` calls an injected fetchImpl | no | dead (section 4); the cache half is kept |
| verification.ts:919 via haiku-classify.ts | Haiku relevance, freight and trust-tier classification (new Anthropic SDK client outside the spend chokepoint, per P1-03 intake-a.md section 7) | yes (Anthropic) | TRASH as a model call. Tier from the class table (already done at :613); relevance and freight scored by the deterministic vertical-fit classifiers plus a session-authored verdict batch, the same seam host verdicts use |
| recommend-source-tier.ts:113 | Haiku tier recommendation through spendStream | yes (Anthropic) | TRASH. The recommendation is the class-table placement and, for an unplaced host, the committed host-verdict batch (host-authority.ts:540-634) |
| recommend-source-tier.ts:85 | Browserless excerpt for the Haiku prompt | yes | TRASH with the file |
| sitemap-walk.mjs, feed-walk.mjs, register-walk.mjs, primary-fallback.mjs, seek-more.mjs | injected `fetchBytes`, `fetchText`, `fetchHtml`, `fetchJson`, `browserlessFetch`, `webSearch` | depends on binding | no network inside these modules; the bindings live in scripts/turns and canonical-pipeline (P1-03, P1-06, P1-07). In the new tree every binding is the direct transport; `webSearch` has no free binding and stays unbound |

## 3. Bloat, biggest first

| rank | what | lines | why it is bloat | replacement |
|---|---|---|---|---|
| 1 | trust.ts comment and dead weight | 1,606 raw, 1,090 code; the Q7 schema essay 649-709 describes a pre-Q2 schema ("Current sources schema has `tier` ... not yet base_tier"), 574-580 is a section header with no body, 328 carries a mojibake character, and four exports have no caller (section 4) | the file narrates three merge histories (Q6, Q7, S1-C, L4-D) and keeps two citation-scoring paths (aggregate 261-279, per-row 296-326) where only the aggregate one is called | split into trust-score.ts (components, prior blend, plan) and tier-movement.ts (evidence, calculator, plan, apply); one header sentence each; constants in one config object |
| 2 | verification.ts Haiku and host-pattern machinery | 991 raw, 686 code; KNOWN_AUTHORITATIVE_PATTERNS 114-185 (50 host regexes), VERIFICATION_HAIKU_SYSTEM_PROMPT 195-231, THRESHOLDS 246-251, classifyWithHaiku 476-494, the H/M/L aggregation 502-564 | a third host-authority table beside the class table and a model call that decides relevance; the tier itself already comes from classTierForHost (:613), so the patterns only feed a "domain confidence" that the class table answers better | verify-candidate.ts: reachability, class placement, exact-host duplicate check, language heuristic, vertical-fit, insert or worklist; about 190 lines |
| 3 | sitemap-walk.mjs | 623 raw, 368 code; 25 exports, 17 used only inside the file [CONFIRMED scan]; comments cite a file header that does not exist and a regression test that was deleted (361-369) | the walker is sound but its pure helpers (strip, inner) are byte-identical copies of feed-walk.mjs:7-18 | one XML helper file shared by the sitemap and feed walkers; sitemap.ts about 290 |
| 4 | four wall and error-body classifiers | entity-gate.mjs ERROR_SIGNATURES 36-77 (18 patterns), primary-fallback.mjs CHALLENGE/SOFT_404/CDN_BLOCK 12-80, transport-escalation.mjs CLASS and classifyTransportResult 6-68, access-wall.mjs detectAccessWall 6-136, plus canonical-fetch.mjs looksBlocked 101-103, holdings-audit.mjs looksLikeFurniture 136-155, fetch-quality.ts BRIEF_FAILURE_PATTERNS 1-34 | each answers "is this body content" with its own window (300, 600, 800, 1500, 2500 characters) and its own result vocabulary; they already chain into each other (transport-escalation.mjs:1-3 imports entity-gate, holdings-audit and primary-fallback; access-wall.mjs:3-4 imports the regexes of both) | core/fetch/classify-body.ts: one classifier, one result enum (ok, not_found, soft_404, bot_wall, cdn_block, request_access, js_shell, cookie_wall, login_wall, interface_shell, furniture, error_body, empty, wrong_language), one head window per signal |
| 5 | host-authority.ts essays | 659 raw, 321 code; the D14 residue block 230-426 is 197 lines of which 81 are comment lines [CONFIRMED: grep count]; preResidueTierForHost 436-446 carries a comment that first says "PERMANENT WORKLIST FIRST" and then "intentionally NOT checked here" | the rulings belong in the rulings list and the ADR log; the allowlists are data | host-class.ts (logic, about 170) and host-class-data.ts (allowlists, word lists, ruled hosts, about 110) |
| 6 | source-growth.ts | 584 raw, 394 code; the `skipTierOpinions` doc comment alone is 111-129; registerPoolHostsForGrounding hand-paginates sources (358-364) beside fetchAllRows | the double-invocation fix is a workaround for generate-brief calling registration twice; the new pipeline calls it once | growth.ts about 290, one registration pass per brief |
| 7 | six tier vocabularies | host-authority.ts HOST_CLASS_TIER 549-560; tier-labels.ts 1-9; trust.ts computeBaselineTrustScore 609-618 labels; verification.ts prompt 224-229; recommend-source-tier.ts TIER_DEFINITIONS 20-26; types/source.ts SOURCE_TIER_DEFINITIONS (A4d A-18, outside scope) | they disagree (section 5); the skill's table is the contract | one tier-contract.ts read by every label, prompt and legend |
| 8 | Browserless primitive | canonical-fetch.mjs 119 + browserless.ts 56 + sec-fair-access.ts 11 = 186 raw | metered, and the only render tier in the ladder; the ladder already proves direct-first (transport-escalation.mjs:117-123) and a render-free mode (transport-runtime.mjs:28-40) | TRASH; direct.ts carries the SEC UA |
| 9 | seek-more.mjs and identifier-variants.mjs overlap | seek-more eurlexCandidates 15-29, ukCandidates 33-37 against identifier-variants euCandidates 108-132, ukCandidates 145-157 (same name, different shape) | two resolvers per jurisdiction; the comment at seek-more.mjs:92-96 says the newer one "MERGES, never replaces" | one candidates.ts: identity resolvers, then the source's own search surface, then (unbound) open web |
| 10 | three html-to-text strippers in scope | canonical-fetch.mjs stripText 50-56, holdings-audit.mjs extractCleanText 29-40, cheap-verify.mjs normalizeForMatch 5-11 (plus officialness.mjs stripTags 26-32, which documents why it differs) | grounding and verification must strip the same way or a span matched at grounding fails at re-verify | one `toText` in core/fetch/classify-body.ts (or the shared text module), officialness keeps its block-level variant |

## 4. Dead code

Each `[CONFIRMED]` row: the grep named ran this session over fsi-app/src, fsi-app/scripts and fsi-app/supabase (ts, tsx, mjs, js, sql) excluding the defining file, and matched nothing but what the row says; "transitively dead" means the only caller is a dead symbol in the same file.

| path:line | symbol | kind | evidence |
|---|---|---|---|
| src/lib/trust.ts:516 | evaluateProvisionalSource (and ProvisionalEvaluation 509) | exported function | 0 hits outside trust.ts [CONFIRMED]; A4:L52 said test-only, the test is deleted |
| src/lib/trust.ts:585 | createDefaultTrustMetrics | exported function | 0 hits [CONFIRMED]; agrees with A4:L52 |
| src/lib/trust.ts:609 | computeBaselineTrustScore | exported function | 0 hits [CONFIRMED]; its tier labels (T4 expert analysis, T5 industry/standards, T6 news) contradict the skill (section 5) |
| src/lib/trust.ts:301 | computeCitationComponentFromRows (and CitationRow 296) | exported function | 0 code hits; named only in trust.ts comments 257, 281, 723 [CONFIRMED]; the "batch will migrate to this path" comment (257-259) never happened |
| src/lib/trust.ts:574-580 | "Conflict Resolution Impact" | empty section header | read [CONFIRMED]; A4d B-STALE |
| src/lib/sources/snapshot-store.mjs:87 | writeSnapshot | exported function | 0 code hits; one comment in scripts/turns/run-source-sweep.mjs:1130 [CONFIRMED]. Nothing tracked writes raw_fetches, so bridgeChangedSourceToStagedUpdates (change-sweep.mjs:144) never has two captures to diff (B-0226) |
| src/lib/sources/fetch-hold.mjs:126 | transportFetch | exported function | 0 hits [CONFIRMED]; the hold-exception telemetry it records (135-137) therefore never runs |
| src/lib/sources/fetch-hold.mjs:102 | makeFetchTelemetry | exported function | 0 code hits (one JSDoc type reference at :123) [CONFIRMED] |
| src/lib/sources/seek-more.mjs:264 | seekAnswerForQuestion | exported function | 0 code hits; seek-more.mjs comments only [CONFIRMED] |
| src/lib/sources/seek-more.mjs:177 | acquisitionRequestRecord | exported function | transitively dead (only caller :275 is seekAnswerForQuestion) [CONFIRMED]; B-0830 |
| src/lib/sources/change-sweep.mjs:49 | sweepAllChangedSources | exported function | 0 hits [CONFIRMED]; agrees with A3 (B-0666) |
| src/lib/sources/change-sweep.mjs:16 | sweepChangedSource | exported function | transitively dead (only caller :55) [CONFIRMED] |
| src/lib/sources/amendment-diff.mjs:135 | toTimelineEvents | exported function | 0 hits [CONFIRMED]; the timeline feature it prepared is recorded in section 8 |
| src/lib/sources/entity-gate.mjs:27 | shouldMintItem | exported function | 0 hits [CONFIRMED] |
| src/lib/sources/identifier-variants.mjs:101 | EUR_LEX_KNOWN_DEAD_OJ_TXT_URL | exported constant | 0 hits [CONFIRMED]; its consumer scripts/verify/wave-acceptance-audit.mjs is gone |
| src/lib/sources/identifier-variants.mjs:253 | rankCandidates | exported function | 0 hits [CONFIRMED] |
| src/lib/sources/null-tier-host-worklist.mjs:14 | planHostDecision | exported function | 0 hits [CONFIRMED]; its caller scripts/maintenance/resolve-cited-host-gate.mjs (B1b:122) no longer exists (`ls` refuses it) |
| src/lib/sources/promote-provisional.ts:1 | PROVISIONAL_SOURCES_STATUS_CHECK | exported constant | 0 hits [CONFIRMED] |
| src/lib/sources/reachability.mjs:18 | classifyReachability_LEGACY_BUGGY | exported function | 0 hits [CONFIRMED]; agrees with A3 (B-0225) |
| src/lib/sources/source-type-taxonomy.mjs:71, 78, 84 | CLASSIFIABLE_SOURCE_TYPE_VALUES, sourceTypeLabel, isValidSourceTypeArray | exports | 0 code hits [CONFIRMED] |
| src/lib/sources/target-match.mjs:173, 203 | targetMatchHolds, foreignInstrumentTokens | exported functions | 0 hits [CONFIRMED]; ownInstrumentTokens (189) and scanImoTokens (179) are transitively dead |
| src/lib/sources/tier-override-guard.mjs:17 | withTierOverrideGuard | exported function | 0 hits [CONFIRMED]; its db.mjs consumer was removed |
| src/lib/sources/bias-tag-pipeline.mjs:92-96 | the 0.80 branch of splitBiasTagsByConfidence | dead branch | both branches push the identical row (assignment_source HIGH_CONFIDENCE) [CONFIRMED read]; HIGH_CONFIDENCE_THRESHOLD survives only as the display line in credibility/bias-display.mjs:60 |
| src/lib/sources/sitemap-walk.mjs:545, 564 | homepageContentType | always-empty field | declared "" and never assigned [CONFIRMED read] |
| src/lib/sources/sitemap-walk.mjs:370 | `s.url !== "robots.txt"` | vacuous filter | robots.txt is never pushed into sitemapsFetched (only fetchAndParse pushes, and robots is fetched outside it at :332) [CONFIRMED read] |
| src/lib/sources/source-type-taxonomy.mjs:167-169 | the three CJK legislature patterns | unmatchable regexes | `/\b國會\b/u`, `/\b国会\b/u`, `/\b국회\b/u` cannot match: `\b` needs an ASCII word character next to the CJK run [CONFIRMED executed: node, three inputs, all false]; `/\bduma\b/i` is listed twice (144, 166) |

Export-surface-only (used inside the file, exported for a deleted test; not dead, not exported in the new tree): 161 symbols by the scan, among them trust.ts computeTrustScore, tierPrior, computeOverallScore, TIER_WEIGHTS, HALF_LIFE_MONTHS, applyRecencyDecay, evaluatePromotion, evaluateDemotion, scoreCitationEdges, evaluateCandidatePromotion, opinionMovement, outcomeMovement, tallyOutcomes, trustMetricsFromRow, evaluateTierEvidenceForRow, tierMovementEvent; sitemap-walk.mjs 17 helpers; host-authority.ts classifyResidueRuling and five types; source-growth.ts aggregateConvergence, citationScore, exactHostUrlFilter, buildReputationEventRow, applyReputationRecompute, collectCitedSources; verify-item.mjs STALE_FLAG, decideVerify, writeStaleFlag, logAcquireJustification (A3:L99 agrees); reconcile.ts computeDiff, classifyChange; identifier-variants.mjs 9 builders [CONFIRMED scan].

Not dead, verified live this session: persistExhaustionRecord (canonical-pipeline.ts:660), queryHeldPools and heldPoolHash (scripts/turns/question-answers/data.mjs:6), cacheGet, cachePut and fetchCacheKey (canonical-pipeline.ts:125, 1198), recordSourceChangeTrigger (reconcile.ts:184), reachabilityTier (verification-decision.mjs:8), HIGH_CONFIDENCE_THRESHOLD (bias-display.mjs:60), registerEntryCitations (apply-record-briefs.mjs:490, so B-1875 and B-1876 hold: the free brief path does grow sources).

## 5. Duplicates and over-abstraction

| what | where | proposed single inline replacement |
|---|---|---|
| tier contract (six versions) | skill SKILL.md Section 3 (T2 IMO, ICAO, Commission; T3 OECD, IEA, World Bank, UNCTAD, ICAP, IPCC; T4 industry body and class society; T5 news; T6 analysis; T7 overflow); host-authority.ts:53 GOV_INTERGOV puts oecd.org, iea.org, worldbank.org, ipcc.ch at class gov = T2; verification.ts:225-227 prompt says IMO and ICAO are T1; recommend-source-tier.ts:20-26 says IMO MEPC and ICAO are T3 and ICCT is T4 while host-authority.ts:168 ANALYSIS puts theicct at T6; tier-labels.ts:1-9 says T4 Expert Analysis, T5 Industry / Standards, T6 Commercial Intelligence, T7 News / Commentary; trust.ts:610-618 says T4 expert analysis, T5 industry/standards, T6 news/commentary, T7 provisional | one `tier-contract.ts` holding the skill's table as data; HOST_CLASS_TIER, customer labels and any prompt read it. The OECD/IEA/World Bank/IPCC placement (T2 in code, T3 in the skill) is a ruling for the operator, decision-ready in section 8 |
| wall and error-body classification | entity-gate.mjs:36-77; primary-fallback.mjs:12-80; transport-escalation.mjs:6-68; access-wall.mjs:6-136; canonical-fetch.mjs:101-103; holdings-audit.mjs:136-155 | `classifyBody(text, {status, timedOut, host, path})` in core/fetch/classify-body.ts |
| host normaliser `hostOf` | institution.ts:10-12; vertical-fit-gate.ts:11-17; identifier-variants.mjs:255 (inside rankCandidates); classify-source-role.ts:16; verification.ts:344, 373, 610; register and sitemap use entities/entity-id.mjs hostFromUrl (sitemap-walk.mjs:13); B2-part1:52 counts 11 definitions across src and scripts | one `hostOf` in core/url, institution.ts imports it |
| URL canonicaliser | url-canonicalize.ts canonicalizeUrl (sorts query params, keeps the query); agent/url-canon.mjs canonicalizeCitationUrl used by fetch-hold.mjs:59 (mirrors migration 150) | one canonicaliser in core/url; P1-03 owns url-canon today, the merge needs both owners' reads |
| scrape hold | fetch-hold.mjs:35-54 env SCRAPE_HOLD, default lifted, unknown value lifted (fails open); system_state.scrape_cadence read by api/pause.ts (P1-01) and trust.ts:1362-1370, failing closed to 'off' | one `core/fetch/hold.ts` exposing `fetchAllowed(caller)` that refuses while either the env hold is engaged or the cadence is off for an unsigned caller, failing closed on a read error |
| HTML strip | canonical-fetch.mjs:50-56; holdings-audit.mjs:29-40; cheap-verify.mjs:5-11; feed-walk.mjs:7-12 and sitemap-walk.mjs:23-29 (identical bodies) | one `toText`; one XML `strip`/`inner` pair |
| `inner(block, tag)` | feed-walk.mjs:15-18; sitemap-walk.mjs:168-171 | walkers/xml.ts |
| stub-size constant 1000 | holdings-gate.mjs:3 SNAPSHOT_STUB_MAX; holdings-audit.mjs:6 STUB_MAX_BYTES | one constant |
| real-content floor 200 | primary-fallback.mjs:4 STUB_MIN_CHARS; content-change.mjs:3 MIN_FINGERPRINT_CHARS; api-transport.mjs:17, 57 literal 200; canonical-fetch.mjs:102 literal 150 | one `MIN_CONTENT_CHARS` (the 150 in looksBlocked goes with the file) |
| bridge default limit 50 | change-sweep.mjs:126 `limit = 50`; reconcile.ts:119 BRIDGE_DEFAULT_LIMIT mirrored by hand | export the constant once |
| EU and UK identifier resolvers | seek-more.mjs:15-37; identifier-variants.mjs:108-157 | candidates.ts |
| institution and role classifiers | classify-source-role.ts (source_role, 8 rules), vertical-fit.ts (institutional type, 3 lexicons), source-type-taxonomy.mjs (source_type, 2 classifiable types), host-authority.ts residue rules (government, legal, association, news, analysis words) | one classify.ts with the three outputs computed from one tokenised name and host; the residue word lists stay with the class table because they decide tiers |
| service client | recommend-source-tier.ts:29-32 builds its own `createClient` | TRASH with the file |
| Supabase error describer | tier-opinion-writer.ts:47-54 copies supabase-server.ts describeSupabaseError (its comment says so) | P1-01's core/db describeSupabaseError |
| reachability decisions | reachability.mjs reachabilityTier 27-31, verification-decision.mjs 7-16, check-sources-decision.mjs 7-24, fetch-now-decision.mjs 4-21 | one reachability.ts exporting the three-way classifier and the per-caller mappings |

Over-abstraction: `SupabaseLikeClient` (trust.ts:716-719) and `MinimalSupabaseClient` (tier-opinion-writer.ts:10-14) exist so tests could inject stubs; `ReachInject` and the `__classifyReachability` option (verification.ts:260-263, 758-761) exist for a mutation-check baseline whose test is gone; `TierMovementReaders` and `TierMovementWriters` (trust.ts:1420-1548) are kept because the plan and apply split is real (dry run, then apply). Keep one injection seam per module only where the new tree's test uses it.

## 6. Non-essential artifacts

- identifier-variants.mjs:101 EUR_LEX_KNOWN_DEAD_OJ_TXT_URL is a fixture URL for a deleted audit (dead, section 4).
- reachability.mjs:18 classifyReachability_LEGACY_BUGGY is a mutation-test baseline (dead, section 4).
- host-authority.ts:200-214 RULED_HOST_TIER cites `scripts/_ruling/null-tier-host-ruling.mjs` as its source; that file exists, and B2-part4:16 records that its header claims SQL and CSV output it does not emit. The 13 ruled hosts are data and move to host-class-data.ts.
- No fixtures, mock data or generated inventories sit in scope; `src/lib/sources/fixtures/` named by A3:L8 is gone from this tree [CONFIRMED: `git ls-files src/lib/sources` lists no fixtures].

## 7. File register

Columns: path | lines a-b (total) | responsibility | verdict | clean estimate (code lines) | consumers (count and top 3, this session's grep; files whose import specifier names the module) | note.

| path | lines (total) | responsibility | verdict | clean est. | consumers | note |
|---|---|---|---|---|---|---|
| src/lib/trust.ts | 1-1606 (1606) | trust score, citation scoring, promotion and demotion, opinions, outcomes, effective-tier calculator, plan and apply | REFACTOR AND PORT | 500 (two files) | 4: api/admin/recompute-trust/route.ts, recompute-trust/logic.ts, sources/source-growth.ts | stored `trust_score_overall` is the prior blend while the four stored components are the earned parts, so for a T1 source with no data the overall is 85 and the components sum to 40 (A4d:L226, agrees) [CONFIRMED read :1231-1243]; the maintenance steps recompute-tiers and recompute-trust-scores are deleted (`ls` refuses them), so the only caller of planTierMovements and planTrustScores is POST /api/admin/recompute-trust; mojibake at :328 [CONFIRMED: node scan] |
| src/lib/sources/host-authority.ts | 1-659 (659) | class table, codified tier, residue rules, verdicts, register-at-grounding decision | REFACTOR AND PORT | 280 (logic 170, data 110) | 18: api/admin/canonical-sources/bulk-approve/route.ts, propagation/statutory-rows.ts, agent/canonical-pipeline.ts | GOV_INTERGOV (:53) puts OECD, IEA, World Bank, IPCC at T2 against the skill's T3 (B-1007) [CONFIRMED read]; defaultTierForHost (:106) mints a T5 default for creation-time use, keep it out of every grounding path |
| src/lib/sources/institution.ts | 1-81 (81) | institution key and the grounding resolver | REFACTOR AND PORT | 60 | 8: agent/canonical-pipeline.ts, agent/audit-gate.ts, sources/null-tier-host-worklist.mjs | buildResolver keeps the FIRST row's base_tier per institution (:70), so rows of one institution that disagree resolve by row order instead of surfacing the duplicate-row defect (INV-088 is the audit that catches it) [CONFIRMED read]; TWO_LEVEL is a 50-entry hand list, not a public-suffix list [CONFIRMED read] |
| src/lib/sources/verification.ts | 1-991 (991) | W2.F candidate verification | REFACTOR AND PORT | 190 | 2: api/admin/sources/bulk-import/route.ts, api/admin/spot-check/recurring/route.ts | checkDuplicate drops its read error (`const { data: hostMatches }` :383) and matches `ilike('%host%')` with limit 50, so a read failure or a busy host reads as "no duplicate" (B-0227, A3:L95) [CONFIRMED read]; Haiku at :919 and Browserless at :282, :311 (metered); prompt tiers disagree with the skill |
| src/lib/sources/source-growth.ts | 1-584 (584) | citation registration, edges, convergence, reputation, pool-host registration, entry citations | REFACTOR AND PORT | 240 | 2: agent/canonical-pipeline.ts, scripts/turns/apply-record-briefs.mjs | three dropped-error reads (:264 recordCitations, :353 pool read, :359 sources page loop; A3:L94, B-0050) [CONFIRMED read]; provisional upserts ignore their result (:207, :231); parseNewSourcesFromBrief defaults tier_estimate to 5 when a row has no tier cell (:293), and that default is recorded as a tier opinion on an existing source (:176-181), so a guessed value becomes opinion evidence [CONFIRMED read] |
| src/lib/sources/sitemap-walk.mjs | 1-623 (623) | sitemap discovery, bounded fan-out, scope, diff, feed-first discovery | REFACTOR AND PORT | 290 | 1: scripts/turns/run-source-sweep.mjs | dead field and vacuous filter (section 4); F1-S1-02 records the walkers as never run with walker=feed in apply mode (UNPROVEN) |
| src/lib/sources/target-match.mjs | 1-308 (308) | is this capture the item's instrument (EU pair keys, raw ids, own URL, subject overlap) | REFACTOR AND PORT | 150 | 3: agent/canonical-pipeline.ts, scripts/_reground/target-match-probe.mjs, scripts/_reground/id-stamp.mjs | drop the dead IMO-token trio (section 4) or wire it; the reversal-closure logic (:142-147) is load-bearing, keep it |
| src/lib/sources/seek-more.mjs | 1-297 (297) | identifier-derived candidate URLs, exhaustion flag row, held-pool retrieval | REFACTOR AND PORT | into candidates.ts | 3: agent/canonical-pipeline.ts, scripts/sources/inaccessible-triage.mjs, scripts/turns/question-answers/data.mjs | persistExhaustionRecord ignores its insert result (:155) while its header says it is "NEVER written live" (:128); it is live (canonical-pipeline.ts:660) [CONFIRMED grep]; the acquisition-request path is dead (B-0830, B-1502) |
| src/lib/sources/identifier-variants.mjs | 1-267 (267) | EUR-Lex, legislation.gov.uk, Federal Register URL builders and the discovery candidate set | REFACTOR AND PORT | into candidates.ts | 5: sources/register-walk.mjs, sources/seek-more.mjs, sources/target-match.mjs | eurlexSearchUrl does not encode its text (:79) [CONFIRMED read; harmless for a CELEX id]; two dead exports |
| src/lib/sources/transport-escalation.mjs | 1-256 (256) | failure classes, transport order, escalation ladder, write-side capture verdict | REFACTOR AND PORT | into ladder.ts and classify-body.ts | 10: agent/canonical-pipeline.ts, sources/transport-runtime.mjs, sources/identifier-variants.mjs | RENDER_FIRST_HOSTS (:111-112) names 12 hosts that only Browserless reached; without the render tier they hold NO_REACHABLE_SOURCE unless an official API exists [HYPOTHESIS: per-host reachability by direct GET not measured this lane] |
| src/lib/sources/reconcile.ts | 1-213 (213) | intelligence_changes writer, reconcile pass over monitoring_queue | REFACTOR AND PORT | into change.ts | 3: api/worker/check-sources/route.ts, api/worker/reconcile/route.ts, scripts/turns/run-change-detection.mjs | intelligence_changes has one more reader (supabase-server.ts:2833, P1-01) so B-0478 "no re-ground consumer" holds only for re-grounding; RLS on that table is B-0479 (P1-11) |
| src/lib/sources/source-type-taxonomy.mjs | 1-198 (198) | source_type vocabulary and the two classifiable types | REFACTOR AND PORT | into classify.ts | 2: lib/coverage-gaps-rollup.ts, scripts/sources/backfill-source-type.mjs | legifrance (a gazette) is matched as a legislature (:173); CJK patterns unmatchable (section 4) |
| src/lib/sources/holdings-audit.mjs | 1-176 (176) | publisher shape, clean text, structural truncation, completeness and sufficiency, furniture | REFACTOR AND PORT | 90 | 3: sources/amendment-diff.mjs, sources/transport-escalation.mjs, scripts/holdings-audit.mjs | furniture detector moves to classify-body.ts |
| src/lib/sources/change-sweep.mjs | 1-176 (176) | snapshot-first sweep (dead) and the staged_updates bridge | REFACTOR AND PORT | into change.ts | 3: sources/reconcile.ts, intake/run-intake-cycle.ts, scripts/turns/run-change-detection.mjs | the source read drops its error (`const { data: srcRow }` :131) [CONFIRMED read]; the diff branch never runs (writeSnapshot dead) |
| src/lib/sources/primary-fallback.mjs | 1-173 (173) | roadblock detector, EUR-Lex rendering rewrite, bounded alternative fetch | REFACTOR AND PORT | into candidates.ts and classify-body.ts | 6: agent/canonical-pipeline.ts, sources/officialness.mjs, sources/access-wall.mjs | `altUrls.slice(0, Math.max(maxAlts, altUrls.length))` (:161) makes maxAlts a no-op, every candidate up to maxCandidates is tried [CONFIRMED read]; boundedFetch never clears its timer (:108) |
| src/lib/sources/fetch-hold.mjs | 1-147 (147) | env scrape hold, signed callers, fetch cache and TTLs, dead telemetry wrapper | REFACTOR AND PORT | 115 (hold 80, cache 35) | 4: api/admin/sources/[id]/fetch-now/route.ts, agent/canonical-pipeline.ts, api/pause.ts | holdEngaged fails open on unset or unknown values (:41) by design ("prod-preserving"); the build-mode hold is the cadence, which the fetch primitive never reads [CONFIRMED read] |
| src/lib/sources/officialness.mjs | 1-145 (145) | the 4d gate: clean past-nav body, instrument markers, host-over-floor | KEEP AS-IS (logic), REFACTOR comments | 85 | 3: agent/canonical-pipeline.ts, scripts/sources/inaccessible-triage.mjs, scripts/lib/free-pass.mjs | the `\x01` sentinel in splitBlocks (:58-63) is intentional [CONFIRMED: cat -A shows ^A]; B-0224 is an info row |
| src/lib/sources/amendment-diff.mjs | 1-143 (143) | provision segmentation, alignment, sentence diff | KEEP AS-IS | 80 | 1: sources/change-sweep.mjs | toTimelineEvents dead (section 4) |
| src/lib/sources/access-wall.mjs | 1-136 (136) | content-based wall detector for walkers and ledger consume | REFACTOR AND PORT | into classify-body.ts | 3: sources/sitemap-walk.mjs, scripts/maintenance/canonical-autoverify.mjs, scripts/turns/run-ledger-consume.mjs | the best-specified of the four classifiers; the merged one starts from it |
| src/lib/sources/recommend-source-tier.ts | 1-127 (127) | Haiku tier recommendation for the tier-audit panel | TRASH | 0 | 1: api/admin/sources/recommend-tier/route.ts | metered twice (Haiku :113, Browserless :85); its TIER_DEFINITIONS contradict the skill; own service client; B-0857 |
| src/lib/sources/canonical-fetch.mjs | 1-119 (119) | Browserless plain, stealth and unblock render | TRASH | 0 | 4: agent/canonical-pipeline.ts, sources/browserless.ts, sources/reachability.mjs | every call metered; the API token travels in the query string (:72, :87) |
| src/lib/sources/browserless.ts | 1-56 (56) | typed wrapper with SEC UA | TRASH | 0 | 6: api/admin/sources/bulk-import/route.ts, api/admin/sources/[id]/fetch-now/route.ts, api/admin/spot-check/recurring/route.ts | drops `options.caller` (:48-54), so no browserlessRender caller can pass an engaged hold as a signed caller [CONFIRMED read] |
| src/lib/sources/acquire-lock.mjs | 1-36 (36) | GROUNDING_ACQUIRE_ENABLED lock on the paid acquire path | TRASH | 0 | 4: api/health/spend/route.ts, workflows/generate-brief.ts, agent/canonical-pipeline.ts | the paid acquire path does not exist in the free tree; needs_acquire routes to P1-07's capture queue |
| src/lib/sources/sec-fair-access.ts | 1-11 (11) | SEC fair-access User-Agent | REFACTOR AND PORT | into direct.ts | 1: sources/browserless.ts | the requirement (a declared UA for sec.gov) applies to direct GETs too; B-0858 |
| src/lib/sources/bias-tag-pipeline.mjs | 1-152 (152) | bias vocabulary, confidence split, injected writer | REFACTOR AND PORT | into bias-tags.ts | 4: components/ui/BiasChips.tsx, api/admin/sources/promote/route.ts, credibility/bias-display.mjs | identical branches (section 4); tags arrive from a Haiku recommendation upstream (outside scope) |
| src/lib/credibility/bias-display.mjs | 1-128 (128) | labels, chips, lower-confidence flag, legend | KEEP AS-IS | into bias-tags.ts | 4: components/detail/SourcesGrid.tsx, components/ui/ActionCard.tsx, components/ui/BiasChips.tsx | BIAS_TAG_LABELS twins migration 092's CHECK list (A4d:L319) |
| src/lib/credibility/chip-selection.mjs | 1-39 (39) | top-N chip selection | KEEP AS-IS | into bias-tags.ts | 1: credibility/bias-display.mjs | no defect (A4d:L320 agrees) |
| src/lib/customer-source-tier.ts | 1-44 (44) | customer tier = override, effective, base; scale span | KEEP AS-IS | into tier-contract.ts | 6: components/detail/DetailShell.tsx, components/ui/Chips.tsx, components/list-surface/ListSurfaceRailCards.tsx | stores/sourceStore.ts ignores tier_override for the same question (A4d:L322, outside scope) |
| src/lib/tier-labels.ts | 1-15 (15) | customer tier labels | REFACTOR AND PORT | into tier-contract.ts | 3: components/sources/SourceTierLegend.tsx, components/AskAssistant.tsx, lib/customer-source-tier.ts | labels contradict the skill table (section 5); reconcile, do not port as is |
| src/lib/tier1-priority-jurisdictions.ts | 1-229 (229) | 9 priority regions and the ISO set | REFACTOR AND PORT (to the coverage module, id owed) | 120 elsewhere | 3: components/map/MapPageView.tsx, lib/coverage-gaps-rollup.ts, lib/coverage-gaps.ts | not a source-tier concern; contradicts lib/jurisdictions/tiers.ts by 16 + 6 codes (A4d:L230, B-0887) |
| src/lib/sources/promote-provisional.ts | 1-104 (104) | provisional to active row builder, canonical-URL dedup | REFACTOR AND PORT | 50 | 2: api/admin/sources/promote/route.ts, scripts/maintenance/resolve-provisional-sources.mjs | the `.ts` extension imports (:15-16) exist for a deleted node test |
| src/lib/sources/classify-source-role.ts | 1-111 (111) | deterministic source_role | REFACTOR AND PORT | into classify.ts | 9: api/admin/canonical-sources/decide/route.ts, api/admin/canonical-sources/bulk-approve/route.ts, sources/verification.ts | sound; host outranks name (:28-40) is the ruled order |
| src/lib/sources/vertical-fit.ts | 1-73 (73) | institutional type for the off-vertical gate | REFACTOR AND PORT | into classify.ts | 1: sources/vertical-fit-gate.ts | |
| src/lib/sources/vertical-fit-gate.ts | 1-54 (54) | refuse re-adding an off-vertical retired host | REFACTOR AND PORT | 35 | 4: api/admin/canonical-sources/decide/route.ts, api/admin/canonical-sources/bulk-approve/route.ts, api/admin/sources/promote/route.ts | fails open on a read error (:40-43) and reads suspended rows without a range, so the PostgREST row cap would truncate the negative list silently [HYPOTHESIS: live count under the cap, not measured] |
| src/lib/sources/null-tier-host-worklist.mjs | 1-68 (68) | null-tier host flag write and resolve plans | REFACTOR AND PORT | 40 | 1: scripts/maintenance/resolve-provisional-sources.mjs | planHostDecision dead |
| src/lib/sources/tier-opinion-writer.ts | 1-92 (92) | best-effort source_tier_opinions insert | REFACTOR AND PORT | into growth.ts | 1: sources/source-growth.ts | |
| src/lib/sources/tier-override-guard.mjs | 1-36 (36) | the override guard inside the UPDATE | KEEP AS-IS | 14 | 4: api/admin/recompute-trust/logic.ts, api/admin/sources/commit-tier-change/logic.ts, sources/source-growth.ts | B-0859 UNPROVEN; the INV-073 attack is its proof |
| src/lib/sources/snapshot-store.mjs | 1-106 (106) | raw_fetches read and write, storage gzip | REFACTOR AND PORT | into snapshots.ts | 9: workflows/generate-brief.ts, sources/change-sweep.mjs, intake/run-intake-cycle.ts | writer dead (B-0226); stale contradictory comment :80-81 (A3:L96) |
| src/lib/sources/verify-item.mjs | 1-151 (151) | snapshot-first verification routing, stale flag, acquire justification | REFACTOR AND PORT | into snapshot-verify.ts | 5: workflows/generate-brief.ts, sources/change-sweep.mjs, intake/run-intake-cycle.ts | the paid branch (:122-147) is replaced by a P1-07 capture request |
| src/lib/sources/cheap-verify.mjs | 1-64 (64) | FACT spans present in the stored snapshot | KEEP AS-IS | into snapshot-verify.ts | 4: workflows/generate-brief.ts, intake/run-intake-cycle.ts, scripts/plan-quarantine-disposition.mjs | must strip like grounding does (section 3 rank 10) |
| src/lib/sources/freshness-probe.mjs | 1-56 (56) | HEAD freshness compare | REFACTOR AND PORT | into snapshots.ts | 4: workflows/generate-brief.ts, intake/run-intake-cycle.ts, scripts/plan-quarantine-disposition.mjs | free HEAD that bypasses the hold gate (:43) [CONFIRMED read] |
| src/lib/sources/content-change.mjs | 1-30 (30) | content fingerprint and change decision | KEEP AS-IS | into snapshots.ts | 1: api/worker/check-sources/logic.ts | |
| src/lib/sources/holdings-gate.mjs | 1-34 (34) | holdings present refuses a fetch | KEEP AS-IS | into snapshot-verify.ts | 1: agent/canonical-pipeline.ts | stub constant duplicated |
| src/lib/sources/entity-gate.mjs | 1-92 (92) | root-URL portal test, Haiku entity verdict combine, error-body detector, pool partition | REFACTOR AND PORT | into classify-body.ts | 10: api/worker/check-sources/logic.ts, agent/canonical-pipeline.ts, llm/first-fetch-classify.ts | entityVerdict takes a Haiku verdict as input (metered upstream in first-fetch-classify.ts, P1-03/04); shouldMintItem dead |
| src/lib/sources/transport-runtime.mjs | 1-95 (95) | ladder adapter, renderAllowed | REFACTOR AND PORT | into ladder.ts | 1: agent/canonical-pipeline.ts | the free mode becomes the only mode |
| src/lib/sources/api-transport.mjs | 1-96 (96) | Federal Register and eCFR official APIs | KEEP AS-IS | 60 | 2: agent/canonical-pipeline.ts, scripts/turns/run-ledger-consume.mjs | no hold check of its own; the caller's ladder gates it [HYPOTHESIS] |
| src/lib/sources/charset-decode.mjs | 1-69 (69) | charset resolution, decode, control-character clean | KEEP AS-IS | into direct.ts | 3: agent/canonical-pipeline.ts, sources/api-transport.mjs, scripts/turns/run-ledger-consume.mjs | |
| src/lib/sources/pdf-extract.mjs | 1-39 (39) | PDF detection and text extraction (unpdf) | KEEP AS-IS | into direct.ts | 3: agent/canonical-pipeline.ts, scripts/turns/run-ledger-consume.mjs, scripts/mint/heal-provenance.mjs | free, local |
| src/lib/sources/reachability.mjs | 1-61 (61) | three-way reachability classify and probe | REFACTOR AND PORT | into reachability.ts | 6: api/admin/sources/bulk-import/logic.ts, api/worker/check-sources/logic.ts, sources/fetch-now-decision.mjs | probe defaults to Browserless (:39) |
| src/lib/sources/verification-decision.mjs | 1-16 (16) | reachability outcome to verification action | REFACTOR AND PORT | into reachability.ts | 1: sources/verification.ts | |
| src/lib/sources/check-sources-decision.mjs | 1-24 (24) | reachability outcome to source assessment and eviction eligibility | REFACTOR AND PORT | into reachability.ts | 1: api/worker/check-sources/logic.ts | |
| src/lib/sources/fetch-now-decision.mjs | 1-21 (21) | fetch result to dead, inconclusive or ok | REFACTOR AND PORT | into reachability.ts | 1: api/admin/sources/[id]/fetch-now/route.ts | |
| src/lib/sources/cited-host-gate.mjs | 1-19 (19) | partition cited URLs by known host or institution | KEEP AS-IS | into growth.ts | 1: agent/canonical-pipeline.ts | |
| src/lib/sources/scrape-schedule.ts | 1-59 (59) | cadence window math | KEEP AS-IS | into hold.ts | 4: api/admin/sources/pause-global/route.ts, api/worker/check-sources/route.ts, api/pause.ts | |
| src/lib/sources/url-canonicalize.ts | 1-68 (68) | URL canonical form | REFACTOR AND PORT | into core/url | 12: components/detail/SourcesGrid.tsx, api/admin/canonical-sources/bulk-classify/route.ts, api/admin/canonical-sources/decide/route.ts | second canonicaliser (section 5) |
| src/lib/sources/feed-discovery.mjs | 1-61 (61) | feed detection, link alternates, candidate paths | KEEP AS-IS | into walkers/feed.ts | 1: sources/sitemap-walk.mjs | |
| src/lib/sources/feed-walk.mjs | 1-70 (70) | RSS and Atom walk with the error-body gate | REFACTOR AND PORT | 65 | 2: scripts/turns/research-sweep.mjs, scripts/turns/run-source-sweep.mjs | helper copies (section 5) |
| src/lib/sources/register-walk.mjs | 1-172 (172) | EUR-Lex OJ daily view and Federal Register index walks | KEEP AS-IS | 100 | 1: scripts/turns/run-source-sweep.mjs | the duplicate-edition and interstitial checks (:73-145) are load-bearing |
| src/lib/sources/portal-links.mjs | 1-47 (47) | same-host instrument deep links from portal HTML | KEEP AS-IS | 40 | 3: api/worker/check-sources/logic.ts, sources/register-walk.mjs, scripts/turns/research-sweep.mjs | |
| src/lib/sources/fetch-quality.ts | 1-35 (35) | failure-phrase check on generated brief bodies | REFACTOR AND PORT (to intake P1-03/04) | 25 elsewhere | 1: agent/canonical-pipeline.ts | a brief check, not a source check |

## 8. Build plan for this module

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/core/sources/tier-contract.ts | host-authority.ts 549-565; tier-labels.ts 1-15; customer-source-tier.ts 1-44; trust.ts 215-223 (TIER_WEIGHTS) | the skill's tier table as data (tier, meaning, examples), HOST_CLASS_TIER, isKnownHostClass, customer labels derived from the table, customerSourceTier, tierLabelOf, tierScaleSpan, citation weights | 70 |
| src/core/sources/host-class.ts | host-authority.ts 76-108, 216-228, 247-263, 341-426, 435-535, 578-659 | codifiedTierForHost, classTierForHost, classTierForHostAcrossNames, permanentlyUnregisteredClass, isDoiResolverHost, residue rules, verdictPlacementForHost, placeHostWithVerdicts, decidePoolHostRegistration | 170 |
| src/core/sources/host-class-data.ts | host-authority.ts 1-75, 125-214, 268-340, 365-384 | the allowlists, class regexes, ruled host instances, residue word lists | 110 |
| src/core/sources/institution.ts | institution.ts 1-81 | hostInstitution, tierOfSource (base_tier only), buildResolver that reports a disagreeing institution instead of picking the first row | 60 |
| src/core/sources/classify.ts | classify-source-role.ts 1-111; vertical-fit.ts 1-73; source-type-taxonomy.mjs 1-198 | source_role, institutional type, source_type vocabulary and classifier from one tokenised name and host | 190 |
| src/core/sources/trust-score.ts | trust.ts 14-187, 1129-1264 | components, tier prior, prior blend, trustMetricsFromRow, planTrustScores with stored components that add up to the stored overall | 140 |
| src/core/sources/tier-movement.ts | trust.ts 189-279, 332-503, 632-647, 689-702, 711-838, 840-1127, 1266-1606; tier-override-guard.mjs 1-36 | citation edge scoring and promotion, evaluatePromotion, evaluateDemotion with the cadence hold, opinion and outcome movement, decideEffectiveTier, planTierMovements, tierMovementEvent, applyTierMovements, the override guard | 360 |
| src/core/sources/bias-tags.ts | bias-tag-pipeline.mjs 1-152; credibility/bias-display.mjs 1-128; credibility/chip-selection.mjs 1-39 | vocabulary, one adoption band, injected writer, labels, chips, legend | 110 |
| src/core/sources/target-match.ts | target-match.mjs 1-308 | instrument identity match over a capture and over the pool, own-URL match | 150 |
| src/core/sources/officialness.ts | officialness.mjs 1-145 | path a or b | 85 |
| src/core/url/canonical.ts | url-canonicalize.ts 1-68; institution.ts 10-12 and the other hostOf copies | canonicalizeUrl, hostOf (one each; merge with agent/url-canon.mjs once its owner reads it) | 45 |
| src/core/fetch/hold.ts | fetch-hold.mjs 5-54; scrape-schedule.ts 1-59; P1-01's handoff of api/pause.ts readScrapeState, getScrapeState, isGloballyPaused | `fetchAllowed(url, caller)`: refuses while SCRAPE_HOLD is engaged or the cadence is off for an unsigned caller, fails closed on a read error; the two signed callers; cadence window math | 80 |
| src/core/fetch/classify-body.ts | entity-gate.mjs 1-92; primary-fallback.mjs 1-80; transport-escalation.mjs 6-84; access-wall.mjs 1-136; holdings-audit.mjs 135-155; canonical-fetch.mjs 50-56, 101-103 | one body classifier, one result enum, toText, partitionErrorBodies, urlIsRoot | 160 |
| src/core/fetch/direct.ts | charset-decode.mjs 1-69; pdf-extract.mjs 1-39; sec-fair-access.ts 1-11 | the free direct GET: hold check, timeout, redirect, charset decode, PDF to text, SEC UA, truncation reported never silent | 110 |
| src/core/fetch/api.ts | api-transport.mjs 1-96 | Federal Register and eCFR official APIs | 60 |
| src/core/fetch/ladder.ts | transport-escalation.mjs 86-256; transport-runtime.mjs 1-95 | escalateFetch over cache, API, direct; exhaustion record; captureForStorage | 130 |
| src/core/fetch/reachability.ts | reachability.mjs 1-31; verification-decision.mjs 1-16; check-sources-decision.mjs 1-24; fetch-now-decision.mjs 1-21 | three-way classify over the direct transport, the per-caller mappings | 45 |
| src/core/fetch/cache.ts | fetch-hold.mjs 56-99 | canonical-key cache with host TTLs | 35 |
| src/core/fetch/candidates.ts | identifier-variants.mjs 1-252; seek-more.mjs 1-157, 199-247; primary-fallback.mjs 82-173 | identity-derived candidate URLs (EU, UK, US, Norway, Ireland, APIs), EUR-Lex rendering rewrite, bounded roadblock fallback, exhaustion flag row with its write checked, held-pool retrieval | 220 |
| src/features/sources/snapshots.ts | snapshot-store.mjs 1-106; content-change.mjs 1-30; freshness-probe.mjs 1-56 | raw_fetches read and write (the writer gets a caller: P1-07 capture), fingerprint, freshness through the hold gate | 120 |
| src/features/sources/snapshot-verify.ts | verify-item.mjs 1-151; cheap-verify.mjs 1-64; holdings-gate.mjs 1-34 | verify against the stored snapshot, stale flag, holdings present; needs_acquire becomes a capture request | 120 |
| src/features/sources/holdings-audit.ts | holdings-audit.mjs 1-134, 157-176 | publisher shape, structural truncation, completeness, sufficiency | 90 |
| src/features/sources/change.ts | amendment-diff.mjs 1-125; reconcile.ts 1-213; change-sweep.mjs 68-176 | provision diff, intelligence_changes writer, reconcile pass, staged_updates bridge with every read error checked | 210 |
| src/features/sources/growth.ts | source-growth.ts 1-584; tier-opinion-writer.ts 1-92; cited-host-gate.mjs 1-19 | registration (existing, class tier, worklist), unique citation edges, convergence, reputation recompute, opinions only from an explicit estimate or the class table, pool-host registration over fetchAllRows, entry citations, the cited-host gate | 290 |
| src/features/sources/verify-candidate.ts | verification.ts 1-98, 333-464, 566-978 | canonicalise, reachability, class placement, exact-host duplicate check with its error checked, language, vertical fit, insert at class tier or provisional, audit row | 190 |
| src/features/sources/provisional.ts | promote-provisional.ts 1-104 | promoted row builder, canonical-URL dedup | 50 |
| src/features/sources/null-tier.ts | null-tier-host-worklist.mjs 20-68 | the null-tier host flag write and resolve plans | 40 |
| src/features/sources/vertical-fit-gate.ts | vertical-fit-gate.ts 1-54 | off-vertical negative list, paginated, fail closed for unattended callers | 35 |
| src/features/sources/walkers/sitemap.ts | sitemap-walk.mjs 1-623 | robots, fallback, bounded fan-out, scope, diff, coverage-complete snapshot | 290 |
| src/features/sources/walkers/feed.ts | feed-discovery.mjs 1-61; feed-walk.mjs 20-70 | feed discovery and walk | 65 |
| src/features/sources/walkers/register.ts | register-walk.mjs 1-172 | EUR-Lex OJ and Federal Register walks | 100 |
| src/features/sources/walkers/portal-links.ts | portal-links.mjs 1-47 | portal deep links | 40 |
| src/features/sources/walkers/xml.ts | feed-walk.mjs 7-18; sitemap-walk.mjs 23-29, 167-171 | strip, inner | 25 |
| (coverage module, id owed) | tier1-priority-jurisdictions.ts 1-229 | priority regions, merged with lib/jurisdictions/tiers.ts | 120 elsewhere |
| (intake, P1-03/04) | fetch-quality.ts 1-35 | brief failure-phrase check | 25 elsewhere |

TRASH as code: canonical-fetch.mjs, browserless.ts, recommend-source-tier.ts, acquire-lock.mjs, and inside verification.ts the KNOWN_AUTHORITATIVE_PATTERNS table, VERIFICATION_HAIKU_SYSTEM_PROMPT (the spot-check route that imports it is P1-25/26's to trash with it), classifyWithHaiku and the H/M/L thresholds.

### Data model (columns actually used by sources-a; "unused" means no file in this scope reads or writes it)

Column inventories below were derived by parsing every CREATE TABLE and ALTER TABLE in supabase/migrations (scratch parser, not committed) [HYPOTHESIS: a parser over SQL text, not the live catalog; P1-11 schema is the authority].

- `sources` (85 columns by the parse). Read: `id, name, url, base_tier, effective_tier, tier_override, status, processing_paused, confirmation_count, conflict_count, conflict_total, accuracy_rate, accessibility_rate, total_checks, lead_time_samples, avg_lead_time_days, independent_citers, highest_citing_tier, total_citations, self_citation_count, last_checked, last_accessible, created_at, last_substantive_change, update_frequency, source_role, notes, trust_score_citation`. Written: `effective_tier` (override-guarded), `independent_citers, highest_citing_tier, confirmation_count, total_citations, trust_score_citation` (compound), the six `trust_score_*` columns (patch planned here, applied by the recompute route), and on insert `name, url, description, base_tier, tier_at_creation, effective_tier, domains, jurisdictions, transport_modes, topic_tags, access_method, status, admin_only, source_role, update_frequency, intelligence_types, vertical_tags, notes, auto_run_enabled`. Not read or written by this scope: `tier` (the compat column), `next_scheduled_check, paywalled, api_endpoint, rss_feed_url, consecutive_accessible, successful_checks, last_inaccessible, tier_history, cited_by, updated_at, jurisdiction_iso, spotchecked, last_content_hash, last_intelligence_item_at, api_endpoint_url, api_auth_method, api_response_format, secondary_roles, scope_topics, scope_modes, scope_verticals, expected_output, classification_assigned_at, observed_correctness_count, classification_confidence, classification_rationale, category, override_reason, override_date, institution_id, fetch_status, fetch_status_at, last_content_changed_at, organisation_entity_id, source_type, sitemap_url, sitemap_last_walked_at, sitemap_url_count, sitemap_walk_outcome, feed_last_probed_at` (several are written by P1-06 routes and scripts; `override_reason` and `override_date` belong to the override writer, commit-tier-change, P1-25/26).
- `provisional_sources` (24): read `id, name, url, provisional_tier`; written `name, url, description, discovered_via, status, provisional_tier, recommended_tier, reviewer_notes`. Unused here: `domain, cited_by_source_id, cited_by_source_tier, citation_count, independent_citers, citing_source_ids, highest_citing_tier, accessibility_verified, publishes_structured_content, entity_identified, promoted_to_source_id, created_at, reviewed_at, recommended_classification, discovered_for_jurisdiction` (the citation-count columns were the input of the dead evaluateProvisionalSource).
- `source_citations` (5): read `citing_source_id, cited_source_id, context, detected_at`; written `citing_source_id, cited_source_id, context`. The pair is UNIQUE in the schema (004_source_trust_framework.sql:384) [CONFIRMED grep]; the code's read-then-insert (source-growth.ts:262-270) repeats that guard with a dropped read error, so the port uses one insert that treats 23505 as already recorded.
- `source_tier_opinions` (10): read `target_source_id, opined_tier, opining_source_id, opined_at, dismissed_at, opinion_source`; written `target_source_id, opined_tier, opinion_source, opining_source_id, intelligence_item_id`. Unused here: `dismissed_by, dismissed_reason` (the dismiss writer is outside the scope).
- `source_trust_events` (7): rows built `source_id, event_type, details, created_by`. Unused here: `reviewer_id`.
- `source_verifications` (15): written, all columns but `id, created_at`. Never read in scope.
- `source_bias_tags` (7): rows built `source_id, dimension, tag, confidence, assignment_source`; display reads `dimension, tag, confidence`. Unused here: `assigned_at`.
- `source_reliability_ledger` (7): read `source_id, outcome, scored_at`. Unused here: `signpost_entity_id, assessment_id, scored_by`.
- `raw_fetches` (8) and the Storage bucket `raw_fetches`: read `id, content_hash, file_path, fetched_at, created_at, http_status, html_bytes`; written by the dead writeSnapshot only.
- `monitoring_queue` (11): read `id, source_id, checked_at, change_detected, reconciled_at`; written `reconciled_at`. Unused here: `item_id, scheduled_check, priority, last_result, error_message, created_at`.
- Also touched: `system_state.scrape_cadence` (read), `agent_run_searches(result_url, search_query, intelligence_item_id)` (read), `intelligence_items(id, title, source_id, source_url, provenance_status, is_archived)` (read), `intelligence_changes` (insert), `staged_updates` (insert), `integrity_flags` (insert), `agent_runs` (insert, the acquire justification).

### Interface to other modules

- Exports offered: `tierOfSource`, `buildResolver`, `hostInstitution`, `hostOf`, `canonicalizeUrl`; `classTierForHost`, `classTierForHostAcrossNames`, `placeHostWithVerdicts`, `decidePoolHostRegistration`, `permanentlyUnregisteredClass`, `HOST_CLASS_TIER`, `isKnownHostClass`; `classifySourceRole`, `classifySourceType`, `classifyInstitutionalType`; `planTrustScores`, `planTierMovements`, `applyTierMovements`, `recomputeEffectiveTier`, `outcomeReaderFor`, `writeEffectiveTierUnlessOverridden`; `registerCitedSources`, `registerPoolHostsForGrounding`, `registerEntryCitations`, `growSourcesFromBrief`, `partitionCitedByHost`; `customerSourceTier`, `tierLabelOf`, `tierScaleSpan`, `buildBiasDisplay`, `writeBiasTags`; `verifyCandidate`, `buildPromotedSourceRow`, `checkVerticalFitGate`, the null-tier plans; `fetchAllowed`, the signed callers, `escalateFetch`, `captureForStorage`, `classifyBody`, `fetchDocumentApi`, `generateCandidates`, `fetchPrimaryWithFallback`, `verifyPoolTargetMatch`, `officialnessOf`, `classifyCompleteness`, `classifySufficiency`, `holdingsPresent`; `getSnapshot`, `writeSnapshot`, `contentFingerprint`, `isContentChange`, `probeFreshness`, `verifyItem`, `runReconcilePass`, `bridgeChangedSourceToStagedUpdates`; `walkSource`, `walkFeed`, `walkEurlexOj`, `walkFederalRegister`, `extractPortalLinks`.
- Imports needed: P1-01 auth-db (`getServiceSupabase`, `fetchAllRows`, `describeSupabaseError`, the pause readers it hands over); P1-07 capture (the pool writer for agent_run_searches and the raw_fetches capture writer; it calls `escalateFetch`, `captureForStorage`, `writeSnapshot`); P1-11 schema (the tables above, migration 092's bias CHECK, migration 288's source_type CHECK, the intelligence_changes RLS fix of B-0479); the intake modules' `authorityFloorFor` (agent/source-blocks.mjs), `null-tier-flag.mjs` merge, `url-canon.mjs` and `source-pool-hash.mjs` (P1-03); `coverage/identity.mjs` classifyIdentifier (owner id owed); entities `hostFromUrl` (P1-09 flywheel-a, if it owns entities) [HYPOTHESIS: owner of src/lib/entities not stated in the brief].
- Consumers by module: P1-03/04 intake (the resolver, the class table, registration and growth, cited-host gate, target match, officialness, holdings gate, the ladder, candidates, exhaustion row, the hold, error-body partition, snapshot-first verify; intake-a.md section 8 lists the same set); P1-06 sources-b (the check-sources, fetch-now, bulk-import, promote, recommend-tier, recompute-trust, commit-tier-change and canonical-sources routes, and the source-sweep, change-detection and ledger-consume scripts) [HYPOTHESIS: sources-b's scope is the routes and scripts named here, not stated in this brief]; P1-07 capture (the fetch primitive and capture verdict); P1-09 flywheel-a (scripts/connections/term-recurrence.mjs imports trust.ts; propagation/statutory-rows.ts imports host-authority); P1-17 ui-kit and the surfaces (BiasChips, Chips, DetailShell, ListSurfaceRailCards, DashboardBrief, SourceTierLegend, AskAssistant, SourcesGrid read the tier and bias display); P1-25/26 admin (the admin source routes).

### Invariants this code enforces

Already in data-invariants.md: INV-018 and INV-088 (one tier per institution), INV-023 (effective tier from evidence, clamped, override never moved), INV-024 (trust scores equal the plan), INV-029 and INV-031 (cited and provisional hosts resolve by the class table), INV-032 (host verdict batches), INV-042 (class-table opinions never move a tier), INV-051 (cadence off makes chained firings dry), INV-062 (rated through the class table), INV-066 (a non-answer is never a negative), INV-073 (override attack), INV-080 (FACT stamp equals the derived tier), INV-081 and INV-126 (per-type floors), INV-089 and INV-133 (registration guards), INV-111 (holdings quality), INV-134 (pause flag writer), INV-156 (span verbatim in its capture, P1-03). Appended by this lane, same commit:

- INV-162: the grounding tier of a span is the base_tier of its institution, or the tier_override of its exact host; effective_tier never confers grounding eligibility; a suspended source is never selected; rows of one institution that disagree are reported, never resolved by row order.
- INV-163: a source is registered at a tier only by a deterministic rule (codified class, ruled host, committed verdict, residue name rule) or by inheriting its institution; an aggregator, DOI resolver or hosting platform is never registered at any tier; no model output and no default value sets base_tier on any path.
- INV-164: no fetch reaches the network while the scrape hold is engaged or the cadence is off, except for a signed caller; a read error on the cadence counts as off.
- INV-165: an error body, wall, interface shell or furniture capture is never stored as source content; the roadblock fallback widens only the set of URLs tried, and anything it returns is qualified by the same resolver and per-type floor as the declared primary.
- INV-166: a citation edge is unique per (citing, cited) and never a self-citation; a syndication group counts once; a T7 citer weighs 0; a tier opinion is recorded only from an explicit tier estimate or the class table, never from a defaulted value.

Properties the new tree must carry as tests or lint rules (not data invariants): one tier contract read by every label and prompt; one body classifier; one host normaliser and one URL canonicaliser; no import of a metered client (Anthropic, Browserless) anywhere under src/core or src/features/sources.

### Rulings the code embodies (cite)

- Tier is a property of the institution; the grounding stamp reads base_tier only (skill references/authority-floor-and-canonical-tier.md; institution.ts:37-49; SC-9).
- Register-at-grounding assigns a deterministic tier only, never a model guess or a default (SC-13, operator ruling 2026-07-13; host-authority.ts:82-99, 643-659; verification.ts:601-608 F4).
- The class table and its extensions: verifier, academic, association T4 (2026-07-13, 124-host batch); standards_body T4 (operator ruling 2026-09-04, "you know how to classify, fix it ... T4", host-authority.ts:141-162); RULED_HOST_TIER (2026-08-11 batched ruling, :193-214); legal aggregators permanent worklist (operator ruling #3, :181-186); hosting platforms (2026-08-11, :187-191); DOI resolvers (lane S1-B 2026-10-04, :174-180); D14 residue ruling and company class T7 (2026-09-13, :230-426); host verdicts outrank the residue rule (lane S8-E5 2026-10-08, :591-602).
- A figure with a source is published with that source's rating, never refused (CLAUDE.md rule 18; migration 302); the customer tier is override, then effective, then base (customer-source-tier.ts:22-32).
- Build mode holds the scrape cadence off; the no_substantive_update demotion trigger is held while it is off (CLAUDE.md rule 16; trust.ts:1266-1275).
- The fetch hold admits exactly two signed callers (ADR-012 rider, Disposition Unit 0b, 2026-07-11; fetch-hold.mjs:15-24).
- Every automatic tier writer respects the admin override, proven by attack (lane G7-TIER 2026-10-05; tier-override-guard.mjs; INV-073).
- A non-answer is never a negative (D1-INTERPRETATION fix; reachability.mjs:7-13, verification.ts:807-845; INV-066).
- Storage-side uncap: full captures, truncation reported, never silent (ADR-016; canonical-fetch.mjs:46-57, api-transport.mjs:17, pdf-extract.mjs:20-23).
- An error body is never stored (RD-14, transport-escalation.mjs:232-256); roadblock fallback widens what is tried, never what qualifies (primary-fallback.mjs:117-121).
- Scored prediction outcomes move a tier one step inside the clamp (ADR-044 decision 4, lane L4-D; trust.ts:854-860, 953-972).
- Change detection stages a review row and never rewrites content (operator constraint, lane CD 2026-09-01; change-sweep.mjs:78-82).
- Nothing in this build runs alone: registration connects citations, compounds credibility and recomputes reputation in the same call (CLAUDE.md rule 17; source-growth.ts:481-487).
- Bias tags in the 0.65 to 0.79 band are adopted and shown as lower confidence (lane S1-B 2026-10-04; bias-tag-pipeline.mjs:32-40, bias-display.mjs:52-61).

Decision-ready for the operator (rule 13): OECD, IEA, World Bank and IPCC sit at class gov (T2) in host-authority.ts:53 and at T3 in the skill table. The code's own ruling text for this row was not found in the files read; the skill's rationale (a body that issues binding instruments is T2, an analysis body is T3) argues for T3. The port carries whichever the operator rules into tier-contract.ts; the migration that re-tiers existing rows is P1-11's.

### Proof that the module works in the new tree

1. Unit tests, each red against a deliberately broken copy first: buildResolver (base_tier only, effective_tier ignored, suspended excluded, override by exact host, a disagreeing institution reported); classTierForHost over one host per class, the never-register classes with a stored name, the residue precedence cases (a legal publisher named "government" is T1, "Council on Foreign Relations" is T6); decideEffectiveTier (clamp, override held, outcome-driven); planTrustScores (stored components add to the stored overall); the citation scorer (T7 weighs 0, decay halves at 20 months); registerCitedSources (no opinion from a defaulted tier, a read error is reported, never treated as "not found"); classifyBody over the captured wall corpus the four old classifiers were tuned on; escalateFetch exhaustion record; verifyTargetMatch with the year-like serial case (CELEX 32025R2083); the CJK legislature names.
2. Attacks wired into CI: the override attack (INV-073); a fetch attempted while the hold is engaged and while the cadence is off must refuse (INV-164); an error body handed to captureForStorage must be excluded (INV-165).
3. Static check: no import of `@anthropic-ai/sdk`, `spend-client`, `haiku-classify` or any Browserless host under src/core or src/features/sources.
4. Live, dry first: recompute-trust plan over the registry with no writes, compared with the stored values; one source-sweep walk per walker kind against a real host with apply off.
5. `npm run typecheck` and `next build` (the four-step CI).

### Port order

1. core/url/canonical.ts and core/sources/tier-contract.ts (everything reads them).
2. core/sources/host-class.ts with its data file, then institution.ts.
3. core/fetch: hold.ts, classify-body.ts, direct.ts, api.ts, cache.ts, ladder.ts, reachability.ts, candidates.ts (P1-07 capture builds on these).
4. core/sources: trust-score.ts, tier-movement.ts, classify.ts, bias-tags.ts, target-match.ts, officialness.ts.
5. features/sources: growth.ts, provisional.ts, null-tier.ts, vertical-fit-gate.ts, verify-candidate.ts.
6. features/sources: snapshots.ts, snapshot-verify.ts, holdings-audit.ts, change.ts.
7. features/sources/walkers.
8. Hand tier1-priority-jurisdictions.ts to the coverage module and fetch-quality.ts to intake.

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old file(s) | new home |
|---|---|---|
| One institution, one tier; grounding stamp from base_tier only | institution.ts | core/sources/institution |
| Exact-host admin override honoured at grounding | institution.ts:69, 76 | core/sources/institution |
| Suspended sources never selected at grounding | institution.ts:61-65 | core/sources/institution |
| Deterministic class tier for a new host (legal, gov, verifier, academic, association, standards body, analysis, law firm, news, company) | host-authority.ts | core/sources/host-class |
| Ruled host instances and committed host verdict batches | host-authority.ts:193-214, 537-634 | core/sources/host-class, host-class-data |
| Never-register classes with a re-attribution message | host-authority.ts:174-228; null-tier-host-worklist.mjs | host-class, features/sources/null-tier |
| D14 residue rules over registry names, order-independent across names | host-authority.ts:230-535 | core/sources/host-class |
| Register-at-grounding decision (inherit, register, worklist) | host-authority.ts:636-659; source-growth.ts:349-390 | host-class, features/sources/growth |
| source_role, institutional type and source_type classifiers | classify-source-role.ts, vertical-fit.ts, source-type-taxonomy.mjs | core/sources/classify |
| Trust score: accuracy 40, timeliness 20, reliability 20, citation 20, blended with a tier prior | trust.ts:14-187 | core/sources/trust-score |
| Trust-score plan with distribution and per-tier averages | trust.ts:1211-1264 | core/sources/trust-score |
| Citation network: tier-weighted, 20-month half-life decay, promotion at weighted sum 2.5 and 3 citations | trust.ts:189-279, 689-838 | core/sources/tier-movement |
| Promotion and demotion evaluators, cadence-held trigger | trust.ts:332-503, 1266-1299 | core/sources/tier-movement |
| Tier opinions move a tier (3 opinions, 2 opiners, 90 days), class-table opinions excluded | trust.ts:863-934 | core/sources/tier-movement |
| Scored prediction outcomes move a tier (5 outcomes, 365 days) | trust.ts:936-1007 | core/sources/tier-movement |
| One clamped effective-tier calculator, plan, apply with audit events and override skip | trust.ts:1039-1127, 1418-1606; tier-override-guard.mjs | core/sources/tier-movement |
| Per-source reputation recompute after new citations | trust.ts:1301-1416; source-growth.ts:392-442 | tier-movement, growth |
| Cited-source registration (existing, new at class tier, provisional worklist with reason) | source-growth.ts:101-251 | features/sources/growth |
| Citation edges, syndication-collapsed convergence, compounded credibility columns | source-growth.ts:10-57, 253-334 | features/sources/growth |
| "New Sources Identified" table parsing | source-growth.ts:274-298 | features/sources/growth (no default tier) |
| Free-brief entry citations: claim URLs and cited source ids | source-growth.ts:444-584 | features/sources/growth |
| Tier-opinion recording (agent estimate and class table) | tier-opinion-writer.ts; source-growth.ts:166-202 | features/sources/growth |
| Cited-host gate against cross-run self-licensing | cited-host-gate.mjs; source-growth.ts:371-375 | features/sources/growth |
| Customer tier (override, effective, base) and tier labels and legend span | customer-source-tier.ts, tier-labels.ts | core/sources/tier-contract |
| Bias-tag vocabulary, adoption band, writer, labels, chips, legend, lower-confidence mark | bias-tag-pipeline.mjs, credibility/* | core/sources/bias-tags |
| Candidate source verification with audit log (W2.F) | verification.ts | features/sources/verify-candidate (no model call) |
| Haiku relevance and freight scoring of a candidate | verification.ts:195-231, 466-564 | NOT PORTED as a model call; deterministic vertical fit plus a session-authored verdict batch |
| Haiku tier recommendation for the tier-audit panel | recommend-source-tier.ts | NOT PORTED as a model call; the panel shows the class placement and the verdict seam |
| Provisional to active promotion with canonical-URL dedup | promote-provisional.ts | features/sources/provisional |
| Off-vertical re-add refusal | vertical-fit-gate.ts, vertical-fit.ts | features/sources/vertical-fit-gate |
| Scrape hold with two signed callers | fetch-hold.mjs | core/fetch/hold |
| Global cadence window and next scrape date | scrape-schedule.ts | core/fetch/hold |
| Fetch cache with host TTLs | fetch-hold.mjs:56-99 | core/fetch/cache |
| Browserless render with stealth and unblock | canonical-fetch.mjs, browserless.ts | NOT PORTED (metered); direct transport and official APIs, NO_REACHABLE_SOURCE hold otherwise |
| Charset-aware decode and control-character clean | charset-decode.mjs | core/fetch/direct |
| PDF to text | pdf-extract.mjs | core/fetch/direct |
| Federal Register and eCFR official APIs | api-transport.mjs | core/fetch/api |
| SEC fair-access User-Agent | sec-fair-access.ts | core/fetch/direct |
| Failure classes, wall and error-body detection | transport-escalation.mjs, primary-fallback.mjs, access-wall.mjs, entity-gate.mjs, holdings-audit.mjs | core/fetch/classify-body |
| Root-URL portal test | entity-gate.mjs:5-15 | core/fetch/classify-body |
| Transport escalation ladder with per-attempt exhaustion record | transport-escalation.mjs, transport-runtime.mjs | core/fetch/ladder |
| Write-side capture verdict | transport-escalation.mjs:232-256 | core/fetch/ladder |
| Three-way reachability and its caller mappings | reachability.mjs, *-decision.mjs | core/fetch/reachability |
| Identity-derived candidate URLs (CELEX, ELI, UK SI, FR doc number, lovdata, Irish SI, API hosts, source search surfaces) | identifier-variants.mjs, seek-more.mjs | core/fetch/candidates |
| EUR-Lex /TXT to /TXT/HTML rewrite; bounded roadblock fallback | primary-fallback.mjs | core/fetch/candidates |
| Exhaustion record persisted as an integrity flag | seek-more.mjs:122-157 | core/fetch/candidates (write checked) |
| Held-pool retrieval and pool hash for question answering | seek-more.mjs:199-247 | core/fetch/candidates |
| Target-instrument match (EU pair keys, year-like serials, raw ids, own URL, subject overlap) | target-match.mjs | core/sources/target-match |
| Officialness gate (path a or b) | officialness.mjs | core/sources/officialness |
| Holdings completeness, structural truncation, sufficiency | holdings-audit.mjs | features/sources/holdings-audit |
| Holdings-present fetch refusal | holdings-gate.mjs | features/sources/snapshot-verify |
| Snapshot store read and write | snapshot-store.mjs | features/sources/snapshots (writer called by P1-07) |
| Content fingerprint and change decision | content-change.mjs | features/sources/snapshots |
| HEAD freshness probe | freshness-probe.mjs | features/sources/snapshots |
| Cheap span verify against the stored snapshot; snapshot-first verification routing; stale flag | cheap-verify.mjs, verify-item.mjs | features/sources/snapshot-verify |
| Paid acquire lock and pre-logged justification | acquire-lock.mjs, verify-item.mjs:53-72 | NOT PORTED (the paid path is gone); needs_acquire becomes a P1-07 capture request |
| Provision-level amendment diff | amendment-diff.mjs | features/sources/change |
| Diff to timeline-event candidates | amendment-diff.mjs:127-143 (dead) | features/sources/change, wired to item_timelines by P1-09 or recorded as dropped by its owner |
| intelligence_changes writer and reconcile pass over monitoring_queue | reconcile.ts | features/sources/change |
| staged_updates bridge with amendment-diff summary | change-sweep.mjs:68-176 | features/sources/change |
| Snapshot-first sweep of changed sources | change-sweep.mjs:16-66 (dead) | NOT PORTED as code; the reconcile pass plus snapshot-verify cover it |
| Sitemap walk with feed-first discovery, bot-wall naming, coverage-complete diff | sitemap-walk.mjs, feed-discovery.mjs | features/sources/walkers/sitemap, feed |
| RSS and Atom feed walk | feed-walk.mjs | features/sources/walkers/feed |
| EUR-Lex OJ daily-view and Federal Register register walks | register-walk.mjs | features/sources/walkers/register |
| Portal deep-link extraction | portal-links.mjs | features/sources/walkers/portal-links |
| Answer-seeking for trigger questions with a priced acquisition request | seek-more.mjs:159-288 (dead) | NOT PORTED as code (no caller; the request asks for an operator price, which the free plan retires) |
| Priority jurisdiction regions | tier1-priority-jurisdictions.ts | coverage module (id owed) |
| Brief failure-phrase check | fetch-quality.ts | intake (P1-03/04) |

### Defects the new code must not repeat (from the backlog rows in scope; the STATUS cells are written in BACKLOG-2026-10-11.md)

Dropped-error reads on write paths (B-0050, B-0227, change-sweep.mjs:131), a substring host match for duplicates (B-0227), a writer with no caller under a reader that needs two captures (B-0226), the tier contract in six versions (B-1007), a stored overall that is not the sum of its stored components (B-1044), dead exports kept alive for deleted tests (B-0225, B-0666, B-0688, B-0830, B-1586), a guessed default recorded as opinion evidence (source-growth.ts:293), a hold that fails open beside one that fails closed, and an exhaustion write whose error is ignored.
