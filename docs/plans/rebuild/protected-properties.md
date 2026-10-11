# Protected properties (extracted from the old discipline layer)

CLEAN-3 extraction, 2026-10-11. Source: the D1 registers (github, engine/hooks, fitness, governance) under docs/archive/audits/2026-10-11-complete-audit-registers/. Format: PROP-NNN | property | how the new tree checks it | old enforcer id(s) | register:line. The new CI is four steps (checkout, npm ci, lint --max-warnings=0, typecheck, next build under job name ci); a property marked lint rule, type or test is owed to the rebuild, a property marked NOT CARRIED with the reason "process, not product" is lane conduct, headers, session logs, token forms or worktree discipline.

Count: 179 property lines (PROP-001 to PROP-179), of which 51 are NOT CARRIED.

Register labels used in the last column (all under docs/archive/audits/2026-10-11-complete-audit-registers/, line numbers are lines of that file): B1b = B1b-whole-reads-maintenance; B1a3 = B1a-part3-whole-reads-harness-runs; B2p1 = B2-part1-lib; B2p2 = B2-part2-proof; B2p3 = B2-part3-verify; B2p4 = B2-part4-other-scripts; D1p1 = D1-part1-github; D1p2 = D1-part2-engine-hooks-claude; D1p3 = D1-part3-fitness; D1p4 = D1-part4-governance; C1, C2, C3 = the C-migrations registers (C3 also C3a, C3b, C3c); C4 = C4-db-live.

PROP-001 | Every API route under src/app/api/admin (plus agent/run and coverage/entries) calls isPlatformAdmin or requireAdminRoute, or is on the worker-secret allowlist and calls workerAuthGuard | lint rule (custom ESLint rule on route handlers under src/app/api/admin) plus a route-guard test in the rebuild's API layer | fit:F2 | D1p3:11
PROP-002 | Migration files match NNN_descriptive_name.sql with no duplicate numbers (gaps tolerated) | CI step: a migration-name check in the schema step of the rebuild (Part 2); not part of the four-step ci | fit:F6 | D1p3:12
PROP-003 | Client code never writes tier-shaped fields into request bodies; the server dual-writes base_tier and effective_tier | lint rule (no-restricted-syntax on body.tier assignment in components) | fit:F8 | D1p3:13
PROP-004 | The project typechecks cleanly | CI step: npm run typecheck | fit:F9 | D1p3:14
PROP-005 | Source-credibility math holds: syndication collapses, honest independent-citer count is at most naive, tier weights T1=1.0 to T7=0 strictly decreasing, trust_score_citation moves only on real corroboration | test (unit tests on the trust module in the rebuild) | fit:F10 | D1p3:15
PROP-006 | Every intelligence_items INSERT goes through mintIntelligenceItem() (the intake gate: congruence, dedup, relevance) | lint rule (no-restricted-syntax on .from("intelligence_items").insert outside src/lib/intake/mint-item.ts) | fit:F13 | D1p3:16
PROP-007 | No table is defined but unreferenced, or written but never read, and no function is unreferenced, beyond committed ceilings | NOT CARRIED (process, not product: a ceiling gate over the old schema; the rebuild's schema step defines its own tables) | fit:F14 | D1p3:17
PROP-008 | No Anthropic API call or client exists outside the spend client and its sanctioned transport | lint rule (no-restricted-imports of the Anthropic SDK outside src/lib/llm) | fit:F15 | D1p3:18
PROP-009 | The single fetch primitive carries the scrape-hold gate (assertFetchAllowed) and no other file builds a raw Browserless content fetch | lint rule (no-restricted-syntax on direct Browserless fetch) plus type (the fetch primitive is the only exported fetcher) | fit:F16 | D1p3:19
PROP-010 | URL identity normalization lives only in canonicalizeUrl (src/lib/sources/url-canonicalize.ts) | lint rule (no-restricted-syntax on scheme-strip and query-drop regex literals) | fit:F18 | D1p3:20
PROP-011 | A service-role client never falls back to the anon or publishable key | lint rule (no-restricted-syntax on SUPABASE_SERVICE_ROLE_KEY fallback expressions) | fit:F19 | D1p3:21
PROP-012 | system_state.global_processing_paused and scrape_cadence have exactly one writer, the admin_set_pause_state RPC | lint rule (no-restricted-syntax on direct writes to those columns) plus the database trigger of migration 201 | fit:F20 | D1p3:22
PROP-013 | Grounding acquisition has one entry (the workflow over the canonical pipeline via verify-item) | lint rule (no-restricted-imports of the grounding-entry functions outside the pipeline) | fit:F21 | D1p3:23
PROP-014 | Every sources INSERT or UPSERT sets source_role via classifySourceRole(name,url) at birth | type (registerSource is the only sources writer and requires source_role) plus lint rule on sources inserts | fit:F22 | D1p3:24
PROP-015 | Governed-surface coverage gaps (ungoverned write, model call, routing, orphaned proof) hold to a one-way-tightening baseline | NOT CARRIED (process, not product: a baseline ratchet over the old governance layer) | fit:F23 | D1p3:25
PROP-016 | Every database object in the catalog snapshot is created by a committed migration or carries a reasoned exemption; pg_net callers and pg_cron jobs are accounted for | CI step: the schema-replay step in the rebuild (Part 2) | fit:F24 | D1p3:26
PROP-017 | Every module has a production importer, entry point or dispatch root | lint rule (unused-exports or knip-style check if the rebuild adopts one) otherwise NOT CARRIED (process, not product: liveness ledger of the old tree) | fit:F25 | D1p3:27
PROP-018 | Every producer entry point has its first-party seam modules exercised by one composition proof | test (one composition test per producer in the rebuild) | fit:F27 | D1p3:28
PROP-019 | Every harness-runs artifact validates against CONVENTION.md and a family is current when the ledger export holds its governing_hash | NOT CARRIED (process, not product: harness-runs artifacts were deleted; the live record is the harness_runs table) | fit:F28 | D1p3:29
PROP-020 | Text-keyed reference sites (jurisdiction_iso, canonical_instrument_key, source_url, ad-hoc host derivation) are replaced by entity-spine ids and their count never grows | lint rule (no-restricted-syntax on .eq(jurisdiction_iso|canonical_instrument_key|source_url) and ad-hoc new URL().host) | fit:F30 | D1p3:30
PROP-021 | Nothing outside src/lib/propagation reads the raw derived_values table; consumers read derived_values_admissible or call admissibleFor() | lint rule (no-restricted-syntax on .from("derived_values")) plus RLS in the schema | fit:F31 | D1p3:31
PROP-022 | Migration 286 assert_statutory_purity() is attached BEFORE INSERT OR UPDATE on statutory_computations and its JS mirror agrees with the SQL refusal logic | test (a database test in the rebuild's schema step) | fit:F32 | D1p3:32
PROP-023 | Every customer surface named by specs 00-10 has a register entry with route, data_path reachable through the real import graph and a rendering-guard spec, or a ruled exemption | test (rendering smoke per surface) ; the register itself is NOT CARRIED (process, not product) | fit:F33, fitlib:surface-acceptance-register.json | D1p3:33,57
PROP-024 | No module under src calls a filesystem function at module scope (the serverless bundle carries no runtime file reads) | lint rule (no-restricted-syntax on fs calls at module scope) plus CI step: npx next build | fit:F34 | D1p3:34
PROP-025 | Every customer-facing row component is mounted by a UX smoke spec measured at 375, 768, 1024 and 1280 px (target floor, squeezed-title wrap, overflow) and carries data-guard-title | test (Playwright UX smoke at four widths, RD-60) | fit:F35 | D1p3:35
PROP-026 | A client module does not format dates or times without a timeZone key (server UTC render and client render must match) | lint rule (no-restricted-syntax on toLocaleDateString, toLocaleTimeString, Intl.DateTimeFormat without timeZone) | fit:F36 | D1p3:36
PROP-027 | No Supabase .limit(N) above db-max-rows (1000) and no unbounded .in(...) lists | lint rule (no-restricted-syntax on .limit with a literal above 1000) | fit:F39 | D1p3:37
PROP-028 | A requireAuth-guarded /api/ route is called through src/lib/api/authed-fetch.ts and no module hand-rolls an Authorization Bearer header | lint rule (no-restricted-syntax on Authorization Bearer literals outside authed-fetch) | fit:F40 | D1p3:38
PROP-029 | Every cl-* class in an @media block is carried by an element in the same file or is a known shared-part class | NOT CARRIED (reason: CSS class liveness; the rebuild's styling approach decides; no equivalent lint rule exists) | fit:F41 | D1p3:39
PROP-030 | No disclosure component initialises to open (useState open/expand true, collapsed false, defaultOpen props) | lint rule (no-restricted-syntax on open-by-default initialisers under src/components) | fit:F43 | D1p3:40
PROP-031 | Total duplicated normalized lines in src and scripts do not exceed the merge-base measurement | NOT CARRIED (process, not product: a ratchet over the old duplication) | fit:F45 | D1p3:41
PROP-032 | An external host that code builds URLs for has one home module | lint rule (no-restricted-syntax on host literals outside HOST_HOMES modules) | fit:F46 | D1p3:42
PROP-033 | The local env file is loaded only through scripts/lib/env-file.mjs loadLocalEnvFile; bare process.loadEnvFile fails | lint rule (no-restricted-properties on process.loadEnvFile) | fit:F48 | D1p3:43
PROP-034 | Card shell, pill and other shared-part style literals live only in the shared components (SectionCard.tsx etc.) | lint rule (no-restricted-syntax on card-shell style objects outside src/components/ui) | fit:F49 | D1p3:44
PROP-035 | Every loop hop in LOOP_HOPS has its workflow_run edge and a fired harness-run artifact | NOT CARRIED (process, not product: workflow wiring of the old harness; the flywheel is verified by rule 17 in the rebuild's runtime) | fit:F50 | D1p3:45
PROP-036 | No hand-written entry reappears in files converted to derived directory reads; no fitness function stores a nonzero ceiling or hash-pin literal | NOT CARRIED (process, not product) | fit:F51 | D1p3:46
PROP-037 | Every workflow_run-triggered workflow that can set mode to apply calls chained-dry-guard and consults CHAINED_FORCED_DRY; upload-artifact steps keep bounded retention | NOT CARRIED (reason: the workflows are deleted; the cadence-off rule 16 is carried by INV chained-dry-guard in the runtime) | fit:F52 | D1p3:47
PROP-038 | Tooling resolves npm dependencies the way Node does (resolve-dep or require.resolve), never via a hard-coded fsi-app/node_modules path | NOT CARRIED (process, not product: worktree discipline) | fit:F59 | D1p3:48
PROP-039 | Every CREATE TABLE has ENABLE ROW LEVEL SECURITY and no CREATE POLICY gates an admin check wrongly | test (schema step: RLS coverage query over pg_class and pg_policies) | fit:F64 | D1p3:49
PROP-040 | A test does not combine a live clock read with a strict-equality assertion against a computed string | lint rule (no-restricted-syntax in test files) | fit:F66 | D1p3:50
PROP-041 | A CLI main guard never compares import.meta.url to a hand-built file:// string with process.argv[1] (never equal on Windows) | lint rule (no-restricted-syntax) ; scripts use isMainModule | fit:F67 | D1p3:51
PROP-042 | No hard-coded Anthropic model-id literal outside src/lib/llm/model-ids.mjs | lint rule (no-restricted-syntax on model-id string literals) | fit:F69 | D1p3:52
PROP-043 | Every SECURITY DEFINER function in a migration numbered 371 or higher has REVOKE EXECUTE FROM PUBLIC and a pinned search_path in the same file | test (schema step: query pg_proc for prosecdef with proconfig and proacl) | fit:F70 | D1p3:53
PROP-044 | Community feeds nothing (ADR-041): no module outside the community directories imports community code or names a community_* table | lint rule (no-restricted-imports of src/lib/community and src/components/community outside community paths) | fit:F71 | D1p3:54
PROP-045 | The fitness runner, manifest and shared lib (code-scan, file-content, glob, sql-mask, table-access, yml-read) execute the functions above | NOT CARRIED (process, not product: the enforcement engine itself is replaced by lint) | fitlib:runner.mjs+manifest.mjs, fitlib:lib/*.mjs, fitlib:README.md | D1p3:55,56,58
PROP-046 | Every enforcer in the registry names an attack test that exists and a retained failure run (a guard is proven by attack, not by presence) | NOT CARRIED (process, not product: the registry, runner, manifest and the RUNS_IN labels are the old discipline engine; each product property below carries its own check) | eng:registry.mjs, eng:registry.mjs#failureRun-check, eng:registry.mjs#runsIn-truth, eng:runner.mjs, eng:manifest.mjs, lib:context.mjs+baseline.mjs+change-range.mjs | D1p2:13,14,15,16,17,51
PROP-047 | Hooks install into .git/hooks, the no-npm test suite is discovered and run, and engine READMEs describe the engine | NOT CARRIED (process, not product: install-hooks, run-test-suite, test-discovery and support libs belong to the deleted engine) | eng:install-hooks.mjs, eng:run-test-suite.sh, eng:README+INSTALL docs, lib:firing-log+gate-firings+session-context+read-migration-sql+resolve-dep+result+mask-source+no-npm-sandbox+run-explicit-tests+test-discovery | D1p2:18,19,20,52
PROP-048 | No user-home path is hardcoded in introduced lines | lint rule (no-restricted-syntax on string literals matching user-home path patterns) | rule:012, reg:R012 | D1p2:21,100
PROP-049 | A row mutation goes through the guarded path in scripts/lib/db.mjs (no raw row write) | lint rule (no-restricted-syntax on .insert/.update/.upsert/.delete outside db.mjs in scripts) | rule:015, reg:R015 | D1p2:22,101
PROP-050 | Generation config reads no raw process.env knob | lint rule (no-restricted-properties on process.env in generation modules) | rule:017, reg:R017 | D1p2:23,102
PROP-051 | No sixth customer surface appears outside the five-surface model (an added page.tsx outside the model fires) | test (route inventory test over src/app against the five-surface list in the rebuild) | rule:018, reg:R018 | D1p2:24,103
PROP-052 | A source-shaped row is reclassified to a source, never archived | lint rule (no-restricted-syntax on archiving a source-shaped row) plus the resolver rule carried in data-invariants | rule:019, reg:R019 | D1p2:25,104
PROP-053 | A change to the DashboardData cached shape rotates its cache key (app-data- plus sha1 of the interface block) | type (derive the key from the interface in code so the two cannot diverge) | rule:021, reg:R021 | D1p2:26,105
PROP-054 | No em dash, en dash or section-sign glyph appears in introduced prose | NOT CARRIED (process, not product: house text style) | rule:022, reg:R022 | D1p2:27,106
PROP-055 | A source file git did not diff as text (binary attribute, NUL byte, UTF-16) is refused | CI step: .gitattributes text rule plus the lint step failing to parse a non-UTF-8 file | rule:023, reg:R023 | D1p2:28,107
PROP-056 | A WIP commit carries [skip ci] and only a WIP commit does | NOT CARRIED (process, not product: commit conduct) | rule:024, reg:R024 | D1p2:29,108
PROP-057 | The deprecated session-log fork path fsi-app/docs/ops/session-log.md does not exist | NOT CARRIED (process, not product: session logs) | rule:fork-log-archived.test, reg:RD-50-fork-log-frozen | D1p2:30,131
PROP-058 | The migrations inventory, worktrees inventory and program-board anchors match reality | NOT CARRIED (process, not product: inventory documents; migrations inventory is regenerated by the rebuild's schema step if kept) | cons:C3, cons:C4, cons:C5, reg:C3, reg:C4, reg:C5, cons:override-check.mjs | D1p2:31,32,33,34,109,110,111
PROP-059 | The pre-push hook runs the consistency, memory and final-push-tier steps; commit-msg runs the rules; pre-commit, pre-merge-commit, post-commit, post-checkout and reference-transaction block or alarm on main-checkout commits | NOT CARRIED (process, not product: worktree discipline and commit conduct; core.hooksPath is reported, not changed) | hook:pre-push, hook:pre-push#step-3h, hook:commit-msg, hook:pre-commit, hook:pre-merge-commit, hook:post-commit, hook:post-checkout, hook:reference-transaction, hook:lib/*.sh (6), hook:pre-push#F54-citation | D1p2:35,36,37,38,39,40,41,42,43,44
PROP-060 | The session starts with the vault read-path and compaction banks lane state; settings wire only SessionStart, PreCompact and SessionEnd | CI step: none; the two surviving .claude/hooks (vault-sync, pre-compact) stay as the repo's own session tooling (vault-sync's install-hooks call is removed) | claude:settings.json, claude:hooks/vault-sync.mjs, claude:hooks/session-start-vault.mjs, claude:hooks/pre-compact-snapshot.mjs | D1p2:45,46,47,48
PROP-061 | Slash commands and the ledger skill give the session its protocol | NOT CARRIED (process, not product: session protocol; the product-describing skills stay) | claude:commands/*.md (5), claude:skills/ledger/SKILL.md, dispatch:audit.mjs+start.mjs | D1p2:49,50,53
PROP-062 | The build compiles | CI step: npx next build | build:run-build-proof.sh | D1p2:54
PROP-063 | A hard-red data audit writes ONE open integrity_flags row (data_integrity, subject_ref data-audit-lane) and generation halts while it is open (audit-gate.ts via generate-brief.ts) | type and test (the audit-gate read in src/lib/agent/audit-gate.ts stays; the test of that read moves into the rebuild's runtime tests); the writer (run-data-audit-lane) is NOT CARRIED | layerC:block-next-run | D1p2:55
PROP-064 | Fact claims on a null or suspended source, a sub-floor tier or a conflated identity are held at mint; FACT spans are verbatim; a re-ground is a comparison and never a delete; a claim is erased only on proven inaccuracy; a changed capture is a new versioned snapshot | test (mint and grounding unit tests in the rebuild) plus the provenance trigger (migrations 138/141/250) | reg:G-mint-gates, reg:G-mint-gates-live-hold, reg:G-non-destructive-grounding, reg:G-primary-text-permanent, reg:G-cc-executor-submit, reg:G-injected-no-synthesis-window, reg:RD-36-re-grounds-never-destroy | D1p2:138,139,140,142,148,149,117
PROP-065 | A failed-fetch error body is never stored as source content or grounding input; response bytes are decoded with the declared charset; a size cap on the grounding path never binds or fails loud; a roadblocked primary triggers a bounded alternative search at the same tier floor | test (capture and ground unit tests) | reg:RD-14-transport-escalation-write-gate, reg:RD-37-charset-aware-decode, reg:RD-12-size-cap-doctrine, reg:RD-7-roadblock-alternative-search | D1p2:113,118,119,120
PROP-066 | A paid path needs an operator-priced line with an inventory-miss citation, is attributed and pre-logged, is refused when live holdings or a fresh snapshot exist, and a verified item is never re-grounded without evidence of change | lint rule (no-restricted-imports of paid transports) plus test on the spend client | reg:RD-31-operator-priced-spend, reg:RD-26-pre-logged-acquire-justification, reg:RD-33-no-execution-from-stale-state | D1p2:112,114,115
PROP-067 | An identifier-bearing item is never dispositioned absent; the re-ground ladder is proven end to end; an irreversible disposition executes on content emptiness, never on a label; a captured primary must be the item's own instrument | test (flow test over the re-ground ladder) | reg:RD-35-flow-golden-mandate, reg:G-disposition-content-gate, reg:G-target-match | D1p2:116,144,146
PROP-068 | Intake gates are verified by behaviour, not by reading the line | NOT CARRIED (process, not product: verification conduct; behavioural tests are the carried form) | reg:RD-14-line-read-is-not-verification | D1p2:121
PROP-069 | Emergency pause stops every caller and cadence-off stops autonomous generation only | test (pause-split test over the generation entry) | reg:RD-21-generation-pause-split | D1p2:122
PROP-070 | An agent branch operation never runs in the main checkout | NOT CARRIED (process, not product: worktree discipline) | reg:RD-19-worktree-isolation | D1p2:123
PROP-071 | The runtime synthesis prompt and the governing skill list the same rules and fields | test (prompt-skill parity test in the rebuild) | reg:EP-13-skill-prompt-parity | D1p2:124
PROP-072 | A CSS color is never built by concatenating digits onto a var() reference | lint rule (no-restricted-syntax on template literals concatenating var(...) with digits) | reg:RD-90 | D1p2:125
PROP-073 | The rendering guard measures the real site fonts; no title renders narrower than its longest word; rows are measured on a real component at phone width; a customer surface renders data extremes without overflow, placeholder literals or unshared parts | test (Playwright rendering smoke on real fonts at 375 px, ux-laws RD-60) | reg:RD-80, reg:RD-82, reg:SF-10-customer-surface-rendering | D1p2:126,127,128
PROP-074 | The no-npm test sandbox refuses a package installed in the checkout; a pinned skill file exists and every governing citation resolves | NOT CARRIED (process, not product: test-sandbox and skill-citation machinery of the old engine) | reg:RD-79, reg:RD-76 | D1p2:129,130
PROP-075 | Every workflow secret reference is registered | CI step: the four-step ci references no secret except placeholder env; live-smoke secret use is reviewed by hand (NOT CARRIED as a gate) | reg:SF-11-secrets-registered | D1p2:132
PROP-076 | No doctrine clause asserts an uncited human gate in intake, triage, promotion or disposition; no admin copy asserts a human gate outside the allowlisted operator controls | lint rule (no-restricted-syntax on the forbidden phrase regexes in src/components/admin) | reg:SF-12-doctrine-no-uncited-gate, reg:A-admin-phrase-scan | D1p2:133,166
PROP-077 | A source at or above the authority floor reaches the grounding model complete; a span in a floor source and a corroborator is attributed to the floor source; the register-at-grounding step assigns a tier deterministically only; slot forcing never fabricates a fact | test (grounding unit tests, SC-10 to SC-13) | reg:SC-10-floor-source-complete, reg:SC-11-floor-first-attribution, reg:SC-13-register-step-deterministic-tier, reg:SC-12-slot-forcing-genuine-support | D1p2:134,135,136,137
PROP-078 | A suspended source is unselectable by the grounding resolver; grounding doctrine binds to the shared pipeline chokepoint, not the executor | test (resolver unit test) plus lint rule (single grounding entry, as F21) | reg:G-resolver-status-filter, reg:G-executor-parity, reg:G-drain-clear-two-condition | D1p2:143,145,141
PROP-079 | A decline or park decision records a five-surface test with a verdict and reason for each contract | test (a validator in the rebuild's decision-recording code) | reg:G-surface-contract-gate | D1p2:147
PROP-080 | Data audits hold on live data: one tier per host, claim tier equals source-derived tier, ledger one-pass agreement, quarantine and flag dwell bounds, deferral hygiene, substrate agreement, no orphan source, no source-less item, candidate dwell, schema drift, migration history, UI orphan, spec 00 acceptance, section markers, check-vocabulary drift, facts on suspended sources never rise | CI step: none in ci (they read the live database); carried as the invariants in data-invariants.md and re-created as scheduled audits by the rebuild's data layer | reg:A-one-tier-per-host, reg:A-claims-tier, reg:A-ledger-onepass, reg:A-quarantine-disposition, reg:A-flag-age, reg:A-deferral-hygiene, reg:A-substrate-agreement, reg:A-orphan-source, reg:A-source-link, reg:A-candidate-dwell, reg:A-schema-drift, reg:A-migration-history, reg:A-ui-orphan, reg:A-surface-acceptance, reg:A-section-markers, reg:A-check-vocabulary-drift, reg:A-no-generic-source, reg:A-defect-signature-scan | D1p2:150,151,152,153,154,155,156,157,158,159,160,161,162,163,167,169,176,175
PROP-081 | The provenance-verified binding denies a forged-input escalation; the data-audit block trigger and the pause-flag guard reject unmarked writes; one organisation cannot read another's rows; anon and authenticated cannot write derivation_edges or harness_runs; every persona is refused what it must not have; an anonymous request to a gated route is refused | test (adversarial attack suite against a local stack in the rebuild's schema step; presence checks are never sufficient) | reg:A-prov-guard-adversarial, reg:A-layer-c-insert-gate, reg:A-pause-flag-guard-proof, reg:A-spec09-org-rls, reg:A-derivation-edges-rls, reg:A-harness-runs-rls, reg:A-rls-persona-matrix, reg:A-routes-attacked | D1p2:164,170,171,165,172,173,178,179
PROP-082 | Every committed fired-from-upstream claim matches a real harness_runs row, and every harness family with a workflow has dispatched at least once; every docs/audits finding carries a status token | NOT CARRIED (process, not product: harness evidence and audit-label conduct) | reg:A-loop-fired-evidence, reg:A-harness-family-walk, reg:A-audit-finding-status | D1p2:168,174,177
PROP-083 | The registry rows for F2 to F71 restate the fitness functions in D1-part3 | see the PROP lines for the same F ids (fitness group) | reg:F2, reg:F6, reg:F8, reg:F9, reg:F10, reg:F13, reg:F14, reg:F15, reg:F16, reg:F18, reg:F19, reg:F20, reg:F21, reg:F22, reg:F23, reg:F24, reg:F25, reg:F27, reg:F28, reg:F30, reg:F31, reg:F32, reg:F33, reg:F34, reg:F35, reg:F36, reg:F39, reg:F40, reg:F41, reg:F43, reg:F45, reg:F46, reg:F48, reg:F49, reg:F50, reg:F51, reg:F52, reg:F59, reg:F64, reg:F66, reg:F67, reg:F69, reg:F70, reg:F71 | D1p2:56-99
PROP-084 | Every maintenance step and dispatchable workflow shows a ledger row or a live run within 90 days; written tables have readers; deferrals in lane contracts are valid | NOT CARRIED (process, not product: closure accounting over the deleted workflows and steps) | gov:closure-gate.mjs, gov:build-mode.mjs | D1p4:11,38
PROP-085 | The agent session cannot run dangerous shell commands, edit governed files or call write MCP tools without the governing skill loaded, and dispatch is refused while any audit finding is undispositioned | NOT CARRIED (process, not product: lane conduct, skill-load doctrine and the out-of-repo PreToolUse shim) | gov:pretooluse-skill-gate.mjs, gov:skill-map.mjs, gov:skill-token.mjs+agent-transcript.mjs, gov:pretooluse-scope.mjs+pretooluse-entry.mjs+pretooluse-user-shim.mjs, gov:check-pretooluse-wired.mjs+wire-pretooluse-settings.mjs, gov:skill-contract-map.mjs, gov:OUT-OF-REPO-BOUNDARY.md | D1p4:12,13,14,15,16,30,37
PROP-086 | Every invariant is enforced or exempt with a reason, tokens resolve, anchors present, every rule has a test, the doctrine register is current, and every cited proof is execution-wired | NOT CARRIED (process, not product: the meta-gate over the old enforcement engine; the product properties it governed are listed in this file) | gov:invariant-coverage.mjs, gov:invariants.mjs+invariants.d/ (loader), gov:doctrine-register.mjs, gov:execution-wiring.mjs, gov:exemptions.mjs | D1p4:17,18,19,21,23
PROP-087 | Doctrine files carry no clause asserting an uncited human gate in intake, triage, promotion or disposition; the intake path has no human approval gate (machine gates are the approval) | lint rule (phrase scan on admin copy) ; doctrine prose NOT CARRIED (process, not product) | gov:doctrine-contradiction.mjs, inv:SF-12-doctrine-no-uncited-gate, doc:no-uncited-operator-gate-in-doctrine, doc:no-human-finish-of-intake | D1p4:20,191,223,212
PROP-088 | Governed-surface coverage, tables-without-readers, DB objects with a migration home, module liveness and orphan modules hold to committed baselines | NOT CARRIED (process, not product: ratchets over the old tree; the migration-home property is carried by the schema-replay line in the schema step) | gov:coverage-scan.mjs, gov:coverage-report.json, gov:producer-consumer-orphan.mjs, gov:db-object-reference.mjs+db-catalog.json+db-catalog-refresh.sql, gov:orphan-modules.mjs, inv:RD-52-governed-surface-coverage-ratchet, inv:RD-53-db-object-migration-home, inv:RD-54-module-liveness, inv:RD-71, inv:RD-9-producer-consumer-orphan | D1p4:22,36,24,25,31,118,119,120,138,76
PROP-089 | One lexer, one docs-only classifier, one job-scope classifier and the memory gate (code changed requires a dated session-log entry) | NOT CARRIED (process, not product: CI scoping and session-log conduct) | gov:source-lexer.mjs, gov:docs-only-range.mjs, gov:job-inputs.mjs, gov:memory-gate.mjs | D1p4:26,27,28,29
PROP-090 | Agent branch, checkout and merge operations run only in the agent's assigned worktree; linked worktrees reach npm dependencies only through the one link | NOT CARRIED (process, not product: worktree discipline) | gov:worktree-isolation.mjs+worktree-isolation-hook.mjs, inv:RD-19-worktree-isolation, inv:SF-7-worktree-convention, doc:worktree-isolation, inv:RD-85 | D1p4:32,87,186,234,149
PROP-091 | Every workflow secret reference is registered (WORKFLOW_SECRETS) and credential-surface changes are surfaced; new secrets only when needed; credential capability claims are verified by attempt | NOT CARRIED (process, not product: workflows deleted except ci and live-smoke which reference no new secret) | gov:secrets-reference-audit.mjs+secrets-registry.mjs, inv:SF-11-secrets-registered, doc:credential-surface-visibility, doc:no-new-secrets-without-need, doc:credential-capability-verified-by-test | D1p4:33,190,231,232,233
PROP-092 | The flywheel chain holds: sweep to fetch drain and ledger consume; consume to population turn and corpus turn; turns to downstream chain; downstream chain and data producers to propagation drain; turn to brief export; brief apply and turn to gate-a rescan; brief apply and walker to source resolution; propagation and turns to question answers; corpus turn to theme briefs | test (a chain-order test over the runtimes: each runtime triggers its downstream, rule 17); the workflow_run edges and the committed evidence files are NOT CARRIED (workflows deleted) | gov:loop-manifest.mjs+loop-hops.d (16 hops), gov:loop-fired-evidence.json+harness-ledger-export.json, hop:sweep-to-fetch-drain, hop:sweep-to-ledger-consume, hop:ledger-consume-to-population-turn, hop:ledger-consume-to-corpus-turn, hop:population-turn-to-downstream-chain, hop:corpus-turn-to-downstream-chain, hop:downstream-chain-to-propagation-drain, hop:data-producers-to-propagation-drain, hop:population-turn-to-brief-export, hop:brief-apply-to-gate-a-rescan, hop:population-turn-to-gate-a-rescan, hop:brief-apply-to-source-resolution, hop:research-walker-to-source-resolution, hop:propagation-drain-to-question-answers, hop:population-turn-to-question-answers, hop:corpus-turn-to-theme-briefs, inv:RD-74-loop-hop-wiring, inv:RD-55-harness-run-integrity | D1p4:34,35,39-54,141,121
PROP-093 | Each section of a brief declares one of four grounding models (SPAN, CORROBORATION-COUNT, MATRIX, TRANSITIVE) and synthesis sections introduce no unsourced fact; until a per-format exemplar runs, non-regulatory formats are hypothesis; every item draws cross-surface direction from documented intersections | test (brief section validators in the rebuild's generation code) | inv:AC-2-grounding-models, inv:AC-3-per-format-design-before-scale, inv:AC-4-no-vacuum, doc:analysis-follows-page-intent | D1p4:55,56,57,240
PROP-094 | Every data point carries a sourced cause-to-consequence-to-workspace-effect chain; exactly one severity label where decision pressure exists; regulatory qualifications (exceptions, calculation basis, defined terms verbatim, penalties) are captured; no inference stated as fact on regulatory content | test (output validators on generated briefs) | inv:EP-6-cause-effect, inv:EP-7-severity-labels, inv:EP-8-qualification-capture, doc:no-inference-as-fact-on-regulatory-content | D1p4:58,59,60,225
PROP-095 | Every intelligence_items INSERT funnels through mintIntelligenceItem(), where source-to-claim-type congruence, dedup and relevance are enforced; a mint cannot produce a source-less LIVE item; manual intake is the same pipeline invoked once | lint rule (single INSERT site) plus test (mint gate unit tests) | inv:EP-9-single-mint-chokepoint, inv:RD-22-mint-source-link, doc:no-source-less-live-mint, doc:manual-intake-run-is-the-one-pipeline | D1p4:61,89,244,243
PROP-096 | The skill's numbered rules and field enumeration are at exact parity with the operative runtime prompt; the standalone surface-contracts skill equals its copy in the platform-intent skill | test (prompt-skill parity test) | inv:EP-13-skill-prompt-parity, inv:SCS-1-surface-contracts-skill-copy | D1p4:62,179
PROP-097 | The dedup-before-grounding doctrine (entity identity, not title) generalises to the entity spine; text-key reference sites hold to a one-way baseline | lint rule (no-restricted-syntax on text-key .eq reads, as F30) | inv:EP-14-entity-spine-text-key-ratchet | D1p4:63
PROP-098 | There are exactly FIVE customer surfaces, Community is co-equal, the Assistant is a research helper and not a decision engine, and every decline or park of a candidate records a five-surface test with verdict and reason per contract | test (route inventory against the five-surface list; validator for decline records) | inv:PI-1-five-surface, inv:PI-3-community-coequal, inv:PI-4-assistant-research-helper, inv:PI-5-every-decline-names-the-five-contracts, doc:every-decline-names-the-five-contracts, doc:research-is-horizon-scan, doc:community-is-human-space | D1p4:64,65,66,67,254,239,241
PROP-099 | Classify before discard: no archive or delete over an undiagnosed bucket; archives are reversible with a prior-value snapshot; an irreversible disposition is never authorized by a label alone | type and test (archive helper requires a snapshot and a content check) | inv:RD-1-classify-before-discard, inv:RD-42-disposition-content-gate, doc:all-deletes-via-gate, doc:label-is-not-proof | D1p4:68,108,220,253
PROP-100 | A class fix is encoded as a mechanical check in the same dispatch; primitive extraction needs 2+ instances; remediation order is deterministic-first; investigation precedes writes; delegated output is untrusted without tool counts; consolidation preserves behavior; guards win fights; docs carry doctrine not state | NOT CARRIED (process, not product: dispatch and lane conduct) | inv:RD-2-class-fixes-mechanical, inv:RD-3-primitive-thresholds, inv:RG-1-plan-reground, doc:diagnose-before-fix, doc:findings-before-fixes, doc:mechanism-named-before-spend, doc:one-paid-pass-per-item-per-mechanism, doc:consolidation-is-behavior-preserving, doc:doc-numbers-reference-queries-not-values, doc:guards-win-fights, doc:sub-agent-output-untrusted-without-tool-counts, doc:constraint-names-its-enforcement, doc:ascending-cost-irreversibility-tiers, doc:soft-fail-merge-routine-when-classified, doc:report-states-quarantine-scope, doc:emit-path-enumeration-for-render-gates | D1p4:69,70,164,214,215,216,217,224,226,227,228,195,196,230,249,229
PROP-101 | Quarantine is an open investigation, never terminal: entering quarantine enqueues research-or-erase, no item sits live-quarantined past the dwell bound without a disposition or valid deferral; every transitional state (quarantine, provisional, staged transit, open flag) carries a max-age; a deferral names its blocker, awaited path and event and is non-renewable without a state change; a growing median age is red | test (dwell and deferral validators carried in lib/deferral and lib/quarantine-dwell, which stay) plus the invariants in data-invariants.md | inv:RD-4-quarantine-disposition, inv:RD-6-deferral-vs-undispositioned, inv:RD-30-flag-age-dwell, inv:RD-31-candidate-dwell, doc:no-quarantine-as-resting-state, doc:dwell-time-max-age-on-every-transitional-state, doc:deferral-ceiling-30d-non-renewable-without-state-change, doc:backlog-trend-growing-median-age-is-red, doc:earth-exhaustion-before-hold | D1p4:71,73,96,97,211,235,236,237,213
PROP-102 | provenance_status is a CACHE of a gate result; any migration that changes validate_item_provenance or its inputs ships a corpus revalidation in the same change | test (migration review test in the schema step: a migration touching the gate must include a revalidation) | inv:RD-5-status-is-a-cache, doc:status-is-a-cache | D1p4:72,218
PROP-103 | A roadblocked primary triggers a bounded alternative search at the same tier floor; a size cap on the capture-to-judge path never binds or fails loud; a failed-fetch error body is never stored or grounded; the capture layer never stores an error body; bytes decode with the declared charset | test (capture and ground unit tests) | inv:RD-7-roadblock-alternative-search, inv:RD-12-size-cap-doctrine, inv:RD-13-error-body-groundability-gate, inv:RD-14-transport-escalation-write-gate, inv:RD-37-charset-aware-decode | D1p4:74,80,81,84,104
PROP-104 | Before any generation, discovery or re-derivation the first action is a retrieval check; no acquisition fires without proving the datum absent from what is held; a paid path needs an operator-priced line and an inventory-miss citation; a paid ledger row carries an item or source id; paid acquire pre-logs justification; no paid run for a fresh snapshot or a verified item without evidence of change; every effectful mechanism re-verifies its precondition against live state | lint rule (no-restricted-imports of paid transports) plus test on the spend client; operator-priced regime is runtime config (src/lib/llm/spend-regime.mjs) | inv:RD-8-retrieval-before-generation, inv:RD-10-spend-chokepoint, inv:RD-25-paid-row-attribution, inv:RD-26-pre-logged-acquire-justification, inv:RD-28-verified-is-resting-state, inv:RD-29-fresh-snapshot-never-paid, inv:RD-31-operator-priced-spend, inv:RD-32-data-existence-before-acquisition, inv:RD-33-no-execution-from-stale-state, doc:no-execution-from-stale-state, doc:data-existence-before-acquisition, doc:operator-sets-cost, doc:build-phase-spend-regime, doc:no-acquire-with-valid-snapshot, doc:every-paid-run-carries-justification-and-attribution, doc:verified-is-resting-state, doc:funded-pass-run-lock, doc:model-tier-rule | D1p4:75,78,92,93,94,95,98,99,100,194,210,208,209,247,248,246,250,206
PROP-105 | A table the application writes has a consumer, and every producer entry point has one composition proof of all its seams | test (composition test per producer) ; table-consumer ratchet NOT CARRIED | inv:RD-9b-producer-composition-proof | D1p4:77
PROP-106 | The scrape hold is a first-class gate at the single canonical fetch primitive and gates ALL FOUR transports (direct-HTTP, API, RSS, Browserless) | lint rule (single fetch primitive, as F16) plus test (hold throws FetchHoldError on every transport) | inv:RD-11-transport-hold-gate, inv:RD-16-transport-hold-all-four | D1p4:79,86
PROP-107 | URL identity normalization lives only in canonicalizeUrl | lint rule (as F18) | inv:RD-13-one-url-canonicalizer, doc:one-url-canonicalizer | D1p4:82,221
PROP-108 | Intake gates (sourceRole/congruence, urlIsRoot, matchExistingSubject, mint idempotency short-circuits) are verified by a table-driven behavioral contract test over a committed golden corpus, proven red-then-green, not by reading the line; a capability with a test or callers is not proven wired; one capability per role (no shadow) | test (behavioral contract tests; flow tests) | inv:RD-14-line-read-is-not-verification, doc:line-read-is-not-verification, doc:caller-count-is-not-wiring-verification, doc:no-shadow-capability, inv:RD-35-flow-golden-mandate | D1p4:83,222,198,199,102
PROP-109 | A service-role client is fail-closed: a missing SUPABASE_SERVICE_ROLE_KEY throws or yields no data and never downgrades to the anon key | lint rule (as F19) | inv:RD-15-no-service-anon-downgrade | D1p4:85
PROP-110 | Generation pause is split: emergencyPaused (global_processing_paused) is a hard stop for every caller and cadence-off stops autonomous generation only; the pause is a prohibition, dormancy a schedule | test (evaluateGenerationPause unit test) | inv:RD-21-generation-pause-split, doc:pause-is-prohibition-dormancy-is-schedule | D1p4:88,242
PROP-111 | system_state.global_processing_paused and scrape_cadence have exactly one writer, enforced structurally (static lint rule plus database guard trigger); an operator stop-state flag is never altered by an agent; an operator stop-condition binds above every momentum rule | lint rule (as F20) plus the migration 201 trigger; the agent-conduct part is NOT CARRIED (process, not product) | inv:RD-23-pause-flag-one-writer, doc:pause-flag-has-one-writer, doc:operator-stop-conditions-are-absolute, doc:operator-stop-states-are-inviolable | D1p4:90,245,192,193
PROP-112 | Grounding acquisition has exactly one entry (the durable workflow over the canonical pipeline); every grounding doctrine binds to the shared pipeline chokepoint, not the executor | lint rule (as F21) | inv:RD-24-single-grounding-entry, inv:RD-47-doctrine-binds-to-pipeline-not-executor, doc:doctrine-binds-to-pipeline-not-executor | D1p4:91,112,204
PROP-113 | An item holding an instrument identifier is never dispositioned absent or unfindable (only: not found under N variants x M endpoints, logged and held) ; a captured primary must be the item's own instrument | test (referenced-law and target-match unit tests) | inv:RD-34-referenced-law-exists, doc:referenced-law-exists, inv:RD-48-target-instrument-match, doc:capture-must-be-the-items-own-instrument | D1p4:101,197,113,205
PROP-114 | A re-ground replaces the prior claim ledger only when not weaker on any dominance axis; grounding is a comparison and never delete-and-replace; a claim is erased only on proven inaccuracy; primary text is permanent and a changed capture is a new versioned snapshot (raw_fetches append-only); a confidentiality-ruled purge is a narrow per-instance exception | test (re-ground dominance unit tests) plus the append-only trigger | inv:RD-36-re-grounds-never-destroy, inv:RD-44-grounding-is-non-destructive, inv:RD-45-erase-only-on-proven-inaccuracy, inv:RD-46-primary-text-permanent, inv:RD-49-confidentiality-ruled-purge-exception, doc:re-grounds-never-destroy, doc:grounding-is-non-destructive, doc:erase-only-on-proven-inaccuracy, doc:primary-text-is-permanent | D1p4:103,109,110,111,114,200,201,202,203
PROP-115 | A suspended source is unselectable by the grounding resolver and no FACT is attributed at ground to a generic, dead or suspended source; registration never confers reg-fact eligibility | test (resolver unit test) | inv:RD-39-suspended-source-unselectable, inv:RD-40-no-fact-on-suspended-source, doc:no-generic-source-at-ground, doc:registration-does-not-unlock | D1p4:105,106,251,207
PROP-116 | Four gates evaluate every FACT at mint (identity-congruence S-CONFLATE, span-numerics S-NUMERIC, authority-floor, generic-source) with hold-not-reject on one pure evaluator | test (mint-gates unit tests) | inv:RD-41-mint-gates-report-only, doc:mint-gates-report-only-then-operator-flip | D1p4:107,252
PROP-117 | Every live public object traces to a committed CREATE in supabase/migrations | CI step: schema-replay step in the rebuild (Part 2) | inv:RD-49-schema-drift-committed-source | D1p4:115
PROP-118 | The deprecated session-log fork fsi-app/docs/ops/session-log.md accepts no added content | NOT CARRIED (process, not product: session logs) | inv:RD-50-fork-log-frozen | D1p4:116
PROP-119 | The dashboard payload cache key equals app-data- plus sha1[0:8] of the DashboardData interface block | type (derive the key from the interface in code) | inv:RD-51-cached-shape-key-rotation | D1p4:117
PROP-120 | Every harness run writes an artifact validating against CONVENTION.md | NOT CARRIED (process, not product: harness-runs artifacts removed; harness_runs table is the record) | inv:RD-55-harness-run-integrity | D1p4:121
PROP-121 | Nothing outside src/lib/propagation reads raw derived_values; statutory figures never absorb an unvalidated estimate (migration 286 trigger plus JS mirror) | lint rule (as F31) plus schema-step test (as F32) | inv:RD-56-derived-values-gate, inv:RD-57-statutory-purity | D1p4:122,123
PROP-122 | Every customer-facing surface named in specs 01..11 is present with a real route, data_path and rendering spec, or ruled out | test (rendering smoke per surface) | inv:RD-58-surface-acceptance-register | D1p4:124
PROP-123 | No module calls a filesystem function at module scope | lint rule (as F34) | inv:RD-59-bundle-safe-module-evaluation | D1p4:125
PROP-124 | Every row/ledger component is mounted by a UX smoke spec measured at 375 x 812 and 1280, with real fonts, longest-word widths and the four detail surfaces rendering the approved shared parts | test (Playwright UX smoke) | inv:RD-60-row-ux-measured-on-real-component, inv:RD-80, inv:RD-82, inv:RD-84 | D1p4:126,146,147,148
PROP-125 | A "use client" component pins timeZone when formatting dates | lint rule (as F36) | inv:RD-61-date-format-timezone-pin | D1p4:127
PROP-126 | No .limit(N) above 1000, no full-set read assumed complete without range/limit, no runtime id list sent whole in .in() outside readAllByIds | lint rule (as F39) | inv:RD-63-unbounded-supabase-read, inv:RD-64-unbounded-in-filter | D1p4:128,129
PROP-127 | A browser module calling a requireAuth-guarded /api route uses the one shared authenticated fetcher | lint rule (as F40) | inv:RD-65-authed-api-fetch | D1p4:130
PROP-128 | Every cl-* class targeted in an @media block is carried by an element or registered | NOT CARRIED (reason: CSS class liveness, as F41) | inv:RD-66-dead-media-query-class | D1p4:131
PROP-129 | The card shell lives only in src/components/ui/SectionCard.tsx; page mounts do not hold shared-part literal styles (Anton title, card border plus radius 10, 3px rule) | lint rule (as F49) | inv:RD-67-card-shell-one-component, inv:RD-73 | D1p4:132,140
PROP-130 | No component initialises a disclosure open and no page renders an open disclosure in its initial DOM | lint rule (as F43) plus Playwright smoke | inv:RD-67-default-open-disclosure | D1p4:133
PROP-131 | A CLI main guard compares through pathToFileURL and a CLI never calls main() unguarded at module scope | lint rule (as F67) | inv:RD-68, inv:RD-89-unguarded-main-invocation | D1p4:134,154
PROP-132 | Duplicated normalized lines do not exceed the merge-base measurement | NOT CARRIED (process, not product: a ratchet over the old duplication) | inv:RD-69 | D1p4:135
PROP-133 | An added line contains no em dash, en dash or section sign | NOT CARRIED (process, not product: house text style) | inv:RD-69-no-dash-glyphs | D1p4:136
PROP-134 | An external host that code builds URLs for has one home module | lint rule (as F46) | inv:RD-70 | D1p4:137
PROP-135 | A live script loads the local env file only through scripts/lib/env-file.mjs | lint rule (as F48) | inv:RD-72 | D1p4:139
PROP-136 | F51 proves by attack that no hand-written entry reappears in derived registries and no function stores a nonzero ceiling | NOT CARRIED (process, not product) | inv:RD-75 | D1p4:142
PROP-137 | A pinned SKILL.md change or a GOVERNING SKILL citation change within a range is acknowledged | NOT CARRIED (process, not product: skill-governance gate) | inv:RD-76 | D1p4:143
PROP-138 | A workflow file GitHub would refuse never reaches master | CI step: the pull_request run of ci.yml and live-smoke.yml is itself the proof; actionlint is NOT CARRIED | inv:RD-77 | D1p4:144
PROP-139 | The local push gate and the CI required job agree on what green means | CI step: the single `ci` job is the only gate; the local pre-push hook is removed | inv:RD-79 | D1p4:145
PROP-140 | Chained workflow_run firings and push-to-master firings are forced dry while scrape_cadence is off (rule 16) | test (chained-dry-guard unit test; lib/chained-dry-guard.mjs stays with the kept runtimes) | inv:RD-87-chained-dry-guard-wired | D1p4:150
PROP-141 | A CREATE TABLE has ENABLE ROW LEVEL SECURITY and no policy gates admin on bare org membership (CF-DATA-8) | test (schema step RLS coverage query) | inv:RD-88 | D1p4:151
PROP-142 | A test never builds an expected string from a live clock read (PR #816 clock fragility) or lives on a bracket path | lint rule (no-restricted-syntax in test files) | inv:RD-88-clock-fragility, inv:RD-89 | D1p4:152,153
PROP-143 | A source file never builds a color by concatenating digits onto a var(--token) reference | lint rule (as RD-90) | inv:RD-90 | D1p4:155
PROP-144 | A GitHub Actions upload-artifact step keeps a bounded retention-days and path | NOT CARRIED (process, not product: workflows deleted) | inv:RD-90-actions-artifact-budget | D1p4:156
PROP-145 | No hardcoded Anthropic model-id literal outside the model-id module | lint rule (as F69) | inv:RD-92-model-id-literal | D1p4:157
PROP-146 | Every SECURITY DEFINER function has REVOKE EXECUTE FROM PUBLIC and a pinned search_path | test (schema step, as F70) | inv:RD-93-definer-hygiene | D1p4:158
PROP-147 | Every production schema_migrations row is accounted for by a repo file or a named superseding file; the repo describes the database | CI step: schema-replay step in the rebuild (Part 2) | inv:RD-94-migration-history | D1p4:159
PROP-148 | A field a UI read selects has at least one producer | NOT CARRIED (reason: field-grain orphan audit over the old tree; revisit when the rebuild's data layer exists) | inv:RD-95-ui-orphan-field | D1p4:160
PROP-149 | The entity spine passes the seventeen assertions of spec 00 section 8 | test (surface-acceptance assertions as a fixture-mode test in the rebuild) | inv:RD-96-spine-coherence-acceptance | D1p4:161
PROP-150 | A source file is diffed as text so every content rule can read its added lines | CI step: .gitattributes text rule | inv:RD-97-source-diffed-as-text | D1p4:162
PROP-151 | A WIP commit carries [skip ci] and only a WIP commit does | NOT CARRIED (process, not product: commit conduct) | inv:RD-98-wip-commit-skips-ci | D1p4:163
PROP-152 | Syndicated republications collapse to ONE corroboration and trust_score_citation moves only on real corroboration | test (trust math unit tests, as F10) | inv:SC-1-syndication-math | D1p4:165
PROP-153 | A source-not-item is REGISTERED as a scannable source and every sources INSERT sets source_role at birth via classifySourceRole | type (registerSource is the only sources writer) plus lint rule (as F22) | inv:SC-2-source-registration, inv:SC-15-source-role-at-birth | D1p4:166,178
PROP-154 | effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier); tier weights T1=1.0 to T7=0; override never modifies base_tier; the reg-fact grounding stamp derives from base_tier only | test (tier formula unit tests) | inv:SC-3-effective-tier-formula, inv:SC-9-moat-base-tier-only | D1p4:167,172
PROP-155 | Domain integers (1-7 surface mapping) are owned solely by src/lib/domains.ts | lint rule (no-restricted-syntax on domain integer literals outside domains.ts) | inv:SC-5-domain-int-ssot | D1p4:168
PROP-156 | One canonical institutional tier per host group; a FACT claim's tier stamp equals the source's canonical tier | invariants in data-invariants.md (data audit) and test (tier derivation unit tests) | inv:SC-6-one-tier-per-host, inv:SC-7-claims-tier | D1p4:169,170
PROP-157 | A CRITICAL or HIGH item's FACT claims meet a per-item-type authority floor (reg-family T2, research_finding T4, technology T4+; standards: standards-body tier T4 scoped to the item's own body); a floor source reaches the grounding model complete and wins attribution; the register step assigns tiers deterministically; slot forcing needs genuine support | test (grounding unit tests); the floor rating-not-refusal rule is migration 302 | inv:SC-8-authority-floor, inv:SC-10-floor-source-complete, inv:SC-11-floor-first-attribution, inv:SC-12-slot-forcing-genuine-support, inv:SC-13-register-step-deterministic-tier, inv:SC-14-standard-own-body-floor | D1p4:171,173,174,175,176,177
PROP-158 | Commits that modify docs/inventories/*.md satisfy the consistency runner (inventories match code reality) | NOT CARRIED (process, not product: inventory documents) | inv:SF-1-inventory-consistency | D1p4:180
PROP-159 | Migration filenames follow NNN_name.sql with no duplicates | CI step: a filename check in the rebuild's schema step | inv:SF-2-migration-ordering | D1p4:181
PROP-160 | Every admin API route calls isPlatformAdmin | lint rule (as F2) | inv:SF-3-admin-gating | D1p4:182
PROP-161 | Client code does not assign body.tier / base_tier / effective_tier near a fetch/POST | lint rule (as F8) | inv:SF-4-client-server-tier-boundary | D1p4:183
PROP-162 | tsc --noEmit passes | CI step: npm run typecheck | inv:SF-5-build-compiles | D1p4:184
PROP-163 | No hardcoded operator user-home path in code | lint rule (as R012) | inv:SF-6-no-hardcoded-user-path | D1p4:185
PROP-164 | Direct Anthropic API calls occur only in the canonical wrappers and sanctioned routes | lint rule (as F15) | inv:SF-8-canonical-anthropic-path | D1p4:187
PROP-165 | Generation and grounding files do not read process.env directly; tuning knobs are named constants in src/lib/agent/generation-config.ts | lint rule (as R017) | inv:SF-9-generation-config-no-raw-env | D1p4:188
PROP-166 | A customer surface renders its data extremes without horizontal overflow (scrollWidth <= clientWidth), placeholder literals or unshared parts | test (Playwright rendering smoke) | inv:SF-10-customer-surface-rendering | D1p4:189
PROP-167 | Never render a value without a real backing field; a writer with no reader or a reader with no writer is forbidden | lint rule (partial: type-checked selects) ; the half-slice audit is NOT CARRIED | doc:never-render-without-backing-field | D1p4:219
PROP-168 | An old fork of the conflict ruling: the general loop-off hold is overridden for the existing quarantined population's research | NOT CARRIED (process, not product: a dated operator ruling, superseded by build-mode rule 16) | doc:conflict-1-autonomy-beats-batch1-gate | D1p4:238
PROP-169 | A pull request typechecks, lints with zero warnings and builds (the properties the old static and app jobs also checked through the engine, fitness runner, goldens, npmtest and memory gate) | CI step: the new `ci` job (checkout, npm ci, lint --max-warnings=0, typecheck, next build); everything else the old job ran is NOT CARRIED (process, not product) | wf:ci.yml (static, app, master jobs) | D1p1:330
PROP-170 | The schema replays on a local Supabase stack, the RLS persona matrix, view and function attacks and route attacks hold, and the live schema equals the oracle | NOT CARRIED in the new ci (needs a Docker stack); re-created by the rebuild's schema step in Part 2 from the invariants in data-invariants.md (replay, schema-diff, RLS persona matrix, tier-override attack) | wf:ci.yml (schema job), wf:chain-proof.yml, act:local-stack | D1p1:330,332,359
PROP-171 | The rendering guard and the design audit run in a Playwright container against a built app | NOT CARRIED in the new ci (the rendering guard stays in fsi-app/rendering if present and is re-attached by the rebuild's UI step); live-smoke.yml keeps reading the deployed site | wf:ci.yml (app job), wf:layout-baseline-renewal.yml | D1p1:330,358
PROP-172 | The deployed site answers post-deploy: sign-in as the smoke account, live assertions, and the read-only data-audit lane | CI step: live-smoke.yml stays (the run-data-audit-lane step is removed because scripts/verify is deleted) | wf:live-smoke.yml | D1p1:331
PROP-173 | The data-audit lane runs every // data-audit: marker script as its own process | NOT CARRIED (process, not product: scripts/verify is deleted; the audits are listed in data-invariants.md) | wf:data-audit-lane.yml | D1p1:333
PROP-174 | Source monitoring, monthly spot-check and uptime probes run on schedule | NOT CARRIED (build mode holds scrape_cadence off, rule 16; the schedules were disarmed or commented; the runtimes stay by explicit dispatch from the scripts) | wf:source-monitoring.yml, wf:spot-check-monthly.yml, wf:uptime-probes.yml, wf:change-detection.yml | D1p1:334,335,336,353
PROP-175 | The flywheel workflows chain the runtimes by workflow_run (sweep, ledger-consume, population-turn, corpus-turn, downstream-chain, propagation-drain, brief-export, brief-apply, gate-a-rescan, fetch-drain, theme-briefs, question-answers, source-resolution, research-walker, research-assessment, needs-search, date-chain, producers) | NOT CARRIED as workflows (deleted by operator ruling 2026-10-11); the chain order is a property of the runtimes, carried by the chain-order test named in the hop line of this file | wf:source-sweep.yml, wf:ledger-consume.yml, wf:population-turn.yml, wf:corpus-turn.yml, wf:downstream-chain.yml, wf:propagation-drain.yml, wf:brief-export.yml, wf:brief-apply.yml, wf:gate-a-rescan.yml, wf:fetch-drain.yml, wf:theme-briefs.yml, wf:question-answers.yml, wf:source-resolution.yml, wf:research-walker.yml, wf:research-assessment.yml, wf:needs-search.yml, wf:date-chain.yml, wf:producers.yml | D1p1:337-355
PROP-176 | Maintenance steps run one at a time through the maintenance-step composite action and write summary.json | NOT CARRIED (process, not product: the steps are deleted; their invariants are in data-invariants.md) | wf:maintenance.yml, wf:maintenance.yml#option:acquire-primaries, act:maintenance-step | D1p1:356,357,360
PROP-177 | Comments and test strings cite the removed discipline.yml workflow | NOT CARRIED (process, not product: the comments go with the header strip) | doc:stale-discipline.yml-citations | D1p1:361
PROP-178 | A harness family has a family.json naming its governing files; the registry loads every family at import and hashes governing files into governing_hash (one bad family.json crashes every importer); append-dispatch-ledger has no caller | NOT CARRIED as a product gate (process, not product); family-registry.mjs and governing-files.mjs STAY because lib/run-artifact.mjs and the admin parts page import them, with the family.json files they load | harness-runs/family-registry.mjs, harness-runs/governing-files.mjs, harness-runs/append-dispatch-ledger.mjs | B1a3:62,63,64
PROP-179 | CONVENTION.md, PROPOSER-RUNBOOK.md, FAMILY.md, PROTOCOL.md and LAST-PROPOSER-PASS.md describe harness families, artifact envelope, run ids and proposer passes | NOT CARRIED (process, not product: stale after R22 and GATE-3; the live record is the harness_runs table) | harness-runs/CONVENTION.md, harness-runs/PROPOSER-RUNBOOK.md, harness-runs/*/FAMILY.md, harness-runs/*/PROTOCOL.md, harness-runs/*/LAST-PROPOSER-PASS.md | B1a3:65,66,67,68,69

## Not found in the registers

Old files in the CLEAN-3 deleted set that no register row names (path, repo-relative path or basename searched across all 41 registers): 442 of 1859.

- docs/runbooks/maintenance.d/01-community-topics-seed.md
- docs/runbooks/maintenance.d/02-tier-opinions.md
- docs/runbooks/maintenance.d/04-origin-class-backfill.md
- docs/runbooks/maintenance.d/04a-source-type-backfill.md
- docs/runbooks/maintenance.d/04b-derive-obligations.md
- docs/runbooks/maintenance.d/04c-seed-corridors.md
- docs/runbooks/maintenance.d/05-census-off-vertical.md
- docs/runbooks/maintenance.d/06-review-digests.md
- docs/runbooks/maintenance.d/06a-tag-proposals.md
- docs/runbooks/maintenance.d/07-tag-ratification.md
- docs/runbooks/maintenance.d/08-provenance-heal.md
- docs/runbooks/maintenance.d/08a-institution-canonicalize.md
- docs/runbooks/maintenance.d/08b-attach-found-sources.md
- docs/runbooks/maintenance.d/09-reopen-validation-holds.md
- docs/runbooks/maintenance.d/10-record-hollow-sweep.md
- docs/runbooks/maintenance.d/11-canonical-key-dedup.md
- docs/runbooks/maintenance.d/12-forward-events-retext.md
- docs/runbooks/maintenance.d/13-review-apply-provisional-sources.md
- docs/runbooks/maintenance.d/14-review-apply-canonical-candidates.md
- docs/runbooks/maintenance.d/15-review-apply-portal-links.md
- docs/runbooks/maintenance.d/16-review-apply-coverage-gaps.md
- docs/runbooks/maintenance.d/17-apply-classifications.md
- docs/runbooks/maintenance.d/18-seed-benchmark-instruments.md
- docs/runbooks/maintenance.d/19-spec09-reroute.md
- docs/runbooks/maintenance.d/20-spec09-grid-queue.md
- docs/runbooks/maintenance.d/21-spec09-oem-roadmap.md
- docs/runbooks/maintenance.d/22-propose-classifications.md
- docs/runbooks/maintenance.d/23-generate-theme-brief.md
- docs/runbooks/maintenance.d/24-ratify-flag-to-census.md
- docs/runbooks/maintenance.d/25-assumption-register-seed.md
- docs/runbooks/maintenance.d/26-backfill-lineage-edges.md
- docs/runbooks/maintenance.d/27-screen-worklist.md
- docs/runbooks/maintenance.d/28-verification-audit-report.md
- docs/runbooks/maintenance.d/29-spec09-surcharge-audit-csv.md
- docs/runbooks/maintenance.d/30-spec09-dqi-csv.md
- docs/runbooks/maintenance.d/31-spec09-auxiliary-energy-csv.md
- docs/runbooks/maintenance.d/32-spec09-indexation-csv.md
- docs/runbooks/maintenance.d/33-chained-automatically.md
- docs/runbooks/maintenance.d/34-regen-quarantined.md
- docs/runbooks/maintenance.d/35-close-acquire-primaries-holds.md
- docs/runbooks/maintenance.d/36-refetch-capped.md
- docs/runbooks/maintenance.d/37-source-role-cleanup.md
- docs/runbooks/maintenance.d/38-canonical-autoverify.md
- docs/runbooks/maintenance.d/39-remediate-orphan-sources.md
- docs/runbooks/maintenance.d/40-timeline-backfill.md
- docs/runbooks/maintenance.d/41-close-run-logs.md
- docs/runbooks/maintenance.d/42-resolve-error-body-gate.md
- docs/runbooks/maintenance.d/43-resolve-cited-host-gate.md
- docs/runbooks/maintenance.d/44-uk-series-code-reconcile.md
- docs/runbooks/maintenance.d/45-resolve-signals.md
- docs/runbooks/maintenance.d/46-resolve-provisional-sources.md
- docs/runbooks/maintenance.d/46a-enumerate-unclassified-hosts.md
- docs/runbooks/maintenance.d/47-finish-staged-updates.md
- docs/runbooks/maintenance.d/48-schema-vocabulary-inventory.md
- docs/runbooks/maintenance.d/49-resolve-refetch-holds.md
- docs/runbooks/maintenance.d/50-close-coverage-reflections.md
- docs/runbooks/maintenance.d/51-close-legal-confirmation-rows.md
- docs/runbooks/maintenance.d/52-close-flags-for-verified-items.md
- docs/runbooks/maintenance.d/56-capture-static-primaries.md
- docs/runbooks/maintenance.d/57-disk-io-budget.md
- docs/runbooks/maintenance.d/58-recompute-tiers.md
- docs/runbooks/maintenance.d/59-lineage-gap-targets.md
- docs/runbooks/maintenance.d/A1-holdings-audit.md
- docs/runbooks/maintenance.d/A2-verify-checks-wired-via-data-audit-lane.md
- docs/runbooks/maintenance.d/A3-check-vocabulary-drift.md
- docs/runbooks/maintenance.d/A4-f51-hotspot-standing-number.md
- fsi-app/.discipline/consistency/checks/C5-program-anchors-reality.mjs
- fsi-app/.discipline/consistency/lib/inventory-parser.mjs
- fsi-app/.discipline/fitness/functions/F16-transport-hold-gate.mjs
- fsi-app/.discipline/fitness/functions/F18-one-url-canonicalizer.mjs
- fsi-app/.discipline/fitness/functions/F19-no-service-anon-downgrade.mjs
- fsi-app/.discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.mjs
- fsi-app/.discipline/fitness/functions/F20-pause-flag-one-writer.mjs
- fsi-app/.discipline/fitness/functions/F23-governed-surface-coverage.mjs
- fsi-app/.discipline/fitness/functions/F27-producer-seam-proof.mjs
- fsi-app/.discipline/fitness/functions/F31-derived-values-gate.mjs
- fsi-app/.discipline/fitness/functions/F32-statutory-purity.mjs
- fsi-app/.discipline/fitness/functions/F36-date-format-timezone-pin.mjs
- fsi-app/.discipline/fitness/functions/F41-dead-media-query-class.mjs
- fsi-app/.discipline/fitness/functions/F43-default-open-disclosure.mjs
- fsi-app/.discipline/fitness/functions/F49-parts-not-pages.mjs
- fsi-app/.discipline/fitness/functions/F6-migrations-numeric-ordering.mjs
- fsi-app/.discipline/fitness/functions/F67-unguarded-main-invocation.mjs
- fsi-app/.discipline/fitness/functions/F70-definer-hygiene.mjs
- fsi-app/.discipline/fitness/functions/F8-client-server-tier-boundary.mjs
- fsi-app/.discipline/fitness/functions/F9-build-compiles.mjs
- fsi-app/.discipline/fitness/lib/code-scan.mjs
- fsi-app/.discipline/fitness/lib/file-content.mjs
- fsi-app/.discipline/fitness/lib/glob.mjs
- fsi-app/.discipline/fitness/lib/selftest-spawn.mjs
- fsi-app/.discipline/fitness/lib/sql-mask.mjs
- fsi-app/.discipline/fitness/lib/table-access.mjs
- fsi-app/.discipline/fitness/lib/yml-read.mjs
- fsi-app/.discipline/fixtures/check-vocabulary/bad-status-value.mjs
- fsi-app/.discipline/fixtures/rd-master-022/base.tsx.txt
- fsi-app/.discipline/fixtures/rd-master-022/c1.tsx.txt
- fsi-app/.discipline/fixtures/rd-master-022/c2.tsx.txt
- fsi-app/.discipline/governance/invariants.d/AC-2-grounding-models.mjs
- fsi-app/.discipline/governance/invariants.d/AC-3-per-format-design-before-scale.mjs
- fsi-app/.discipline/governance/invariants.d/AC-4-no-vacuum.mjs
- fsi-app/.discipline/governance/invariants.d/EP-13-skill-prompt-parity.mjs
- fsi-app/.discipline/governance/invariants.d/EP-14-entity-spine-text-key-ratchet.mjs
- fsi-app/.discipline/governance/invariants.d/EP-6-cause-effect.mjs
- fsi-app/.discipline/governance/invariants.d/EP-7-severity-labels.mjs
- fsi-app/.discipline/governance/invariants.d/EP-8-qualification-capture.mjs
- fsi-app/.discipline/governance/invariants.d/PI-3-community-coequal.mjs
- fsi-app/.discipline/governance/invariants.d/PI-4-assistant-research-helper.mjs
- fsi-app/.discipline/governance/invariants.d/PI-5-every-decline-names-the-five-contracts.mjs
- fsi-app/.discipline/governance/invariants.d/RD-1-classify-before-discard.mjs
- fsi-app/.discipline/governance/invariants.d/RD-10-spend-chokepoint.mjs
- fsi-app/.discipline/governance/invariants.d/RD-11-transport-hold-gate.mjs
- fsi-app/.discipline/governance/invariants.d/RD-13-error-body-groundability-gate.mjs
- fsi-app/.discipline/governance/invariants.d/RD-13-one-url-canonicalizer.mjs
- fsi-app/.discipline/governance/invariants.d/RD-14-line-read-is-not-verification.mjs
- fsi-app/.discipline/governance/invariants.d/RD-14-transport-escalation-write-gate.mjs
- fsi-app/.discipline/governance/invariants.d/RD-15-no-service-anon-downgrade.mjs
- fsi-app/.discipline/governance/invariants.d/RD-16-transport-hold-all-four.mjs
- fsi-app/.discipline/governance/invariants.d/RD-2-class-fixes-mechanical.mjs
- fsi-app/.discipline/governance/invariants.d/RD-21-generation-pause-split.mjs
- fsi-app/.discipline/governance/invariants.d/RD-22-mint-source-link.mjs
- fsi-app/.discipline/governance/invariants.d/RD-23-pause-flag-one-writer.mjs
- fsi-app/.discipline/governance/invariants.d/RD-24-single-grounding-entry.mjs
- fsi-app/.discipline/governance/invariants.d/RD-25-paid-row-attribution.mjs
- fsi-app/.discipline/governance/invariants.d/RD-26-pre-logged-acquire-justification.mjs
- fsi-app/.discipline/governance/invariants.d/RD-28-verified-is-resting-state.mjs
- fsi-app/.discipline/governance/invariants.d/RD-29-fresh-snapshot-never-paid.mjs
- fsi-app/.discipline/governance/invariants.d/RD-3-primitive-thresholds.mjs
- fsi-app/.discipline/governance/invariants.d/RD-31-operator-priced-spend.mjs
- fsi-app/.discipline/governance/invariants.d/RD-32-data-existence-before-acquisition.mjs
- fsi-app/.discipline/governance/invariants.d/RD-33-no-execution-from-stale-state.mjs
- fsi-app/.discipline/governance/invariants.d/RD-34-referenced-law-exists.mjs
- fsi-app/.discipline/governance/invariants.d/RD-35-flow-golden-mandate.mjs
- fsi-app/.discipline/governance/invariants.d/RD-36-re-grounds-never-destroy.mjs
- fsi-app/.discipline/governance/invariants.d/RD-37-charset-aware-decode.mjs
- fsi-app/.discipline/governance/invariants.d/RD-39-suspended-source-unselectable.mjs
- fsi-app/.discipline/governance/invariants.d/RD-40-no-fact-on-suspended-source.mjs
- fsi-app/.discipline/governance/invariants.d/RD-41-mint-gates-report-only.mjs
- fsi-app/.discipline/governance/invariants.d/RD-42-disposition-content-gate.mjs
- fsi-app/.discipline/governance/invariants.d/RD-44-grounding-is-non-destructive.mjs
- fsi-app/.discipline/governance/invariants.d/RD-45-erase-only-on-proven-inaccuracy.mjs
- fsi-app/.discipline/governance/invariants.d/RD-46-primary-text-permanent.mjs
- fsi-app/.discipline/governance/invariants.d/RD-48-target-instrument-match.mjs
- fsi-app/.discipline/governance/invariants.d/RD-49-confidentiality-ruled-purge-exception.mjs
- fsi-app/.discipline/governance/invariants.d/RD-49-schema-drift-committed-source.mjs
- fsi-app/.discipline/governance/invariants.d/RD-5-status-is-a-cache.mjs
- fsi-app/.discipline/governance/invariants.d/RD-50-fork-log-frozen.mjs
- fsi-app/.discipline/governance/invariants.d/RD-51-cached-shape-key-rotation.mjs
- fsi-app/.discipline/governance/invariants.d/RD-52-governed-surface-coverage-ratchet.mjs
- fsi-app/.discipline/governance/invariants.d/RD-53-db-object-migration-home.mjs
- fsi-app/.discipline/governance/invariants.d/RD-54-module-liveness.mjs
- fsi-app/.discipline/governance/invariants.d/RD-55-harness-run-integrity.mjs
- fsi-app/.discipline/governance/invariants.d/RD-56-derived-values-gate.mjs
- fsi-app/.discipline/governance/invariants.d/RD-57-statutory-purity.mjs
- fsi-app/.discipline/governance/invariants.d/RD-58-surface-acceptance-register.mjs
- fsi-app/.discipline/governance/invariants.d/RD-59-bundle-safe-module-evaluation.mjs
- fsi-app/.discipline/governance/invariants.d/RD-60-row-ux-measured-on-real-component.mjs
- fsi-app/.discipline/governance/invariants.d/RD-61-date-format-timezone-pin.mjs
- fsi-app/.discipline/governance/invariants.d/RD-63-unbounded-supabase-read.mjs
- fsi-app/.discipline/governance/invariants.d/RD-64-unbounded-in-filter.mjs
- fsi-app/.discipline/governance/invariants.d/RD-65-authed-api-fetch.mjs
- fsi-app/.discipline/governance/invariants.d/RD-66-dead-media-query-class.mjs
- fsi-app/.discipline/governance/invariants.d/RD-67-card-shell-one-component.mjs
- fsi-app/.discipline/governance/invariants.d/RD-68.mjs
- fsi-app/.discipline/governance/invariants.d/RD-69-no-dash-glyphs.mjs
- fsi-app/.discipline/governance/invariants.d/RD-69.mjs
- fsi-app/.discipline/governance/invariants.d/RD-7-roadblock-alternative-search.mjs
- fsi-app/.discipline/governance/invariants.d/RD-70.mjs
- fsi-app/.discipline/governance/invariants.d/RD-71.mjs
- fsi-app/.discipline/governance/invariants.d/RD-73.mjs
- fsi-app/.discipline/governance/invariants.d/RD-74-loop-hop-wiring.mjs
- fsi-app/.discipline/governance/invariants.d/RD-75.mjs
- fsi-app/.discipline/governance/invariants.d/RD-76.mjs
- fsi-app/.discipline/governance/invariants.d/RD-77.mjs
- fsi-app/.discipline/governance/invariants.d/RD-80.mjs
- fsi-app/.discipline/governance/invariants.d/RD-82.mjs
- fsi-app/.discipline/governance/invariants.d/RD-84.mjs
- fsi-app/.discipline/governance/invariants.d/RD-85.mjs
- fsi-app/.discipline/governance/invariants.d/RD-87-chained-dry-guard-wired.mjs
- fsi-app/.discipline/governance/invariants.d/RD-88-clock-fragility.mjs
- fsi-app/.discipline/governance/invariants.d/RD-88.mjs
- fsi-app/.discipline/governance/invariants.d/RD-89-unguarded-main-invocation.mjs
- fsi-app/.discipline/governance/invariants.d/RD-89.mjs
- fsi-app/.discipline/governance/invariants.d/RD-9-producer-consumer-orphan.mjs
- fsi-app/.discipline/governance/invariants.d/RD-90-actions-artifact-budget.mjs
- fsi-app/.discipline/governance/invariants.d/RD-90.mjs
- fsi-app/.discipline/governance/invariants.d/RD-92-model-id-literal.mjs
- fsi-app/.discipline/governance/invariants.d/RD-93-definer-hygiene.mjs
- fsi-app/.discipline/governance/invariants.d/RD-97-source-diffed-as-text.mjs
- fsi-app/.discipline/governance/invariants.d/RD-98-wip-commit-skips-ci.mjs
- fsi-app/.discipline/governance/invariants.d/RD-9b-producer-composition-proof.mjs
- fsi-app/.discipline/governance/invariants.d/RG-1-plan-reground.mjs
- fsi-app/.discipline/governance/invariants.d/SC-1-syndication-math.mjs
- fsi-app/.discipline/governance/invariants.d/SC-10-floor-source-complete.mjs
- fsi-app/.discipline/governance/invariants.d/SC-11-floor-first-attribution.mjs
- fsi-app/.discipline/governance/invariants.d/SC-12-slot-forcing-genuine-support.mjs
- fsi-app/.discipline/governance/invariants.d/SC-13-register-step-deterministic-tier.mjs
- fsi-app/.discipline/governance/invariants.d/SC-14-standard-own-body-floor.mjs
- fsi-app/.discipline/governance/invariants.d/SC-15-source-role-at-birth.mjs
- fsi-app/.discipline/governance/invariants.d/SC-2-source-registration.mjs
- fsi-app/.discipline/governance/invariants.d/SC-3-effective-tier-formula.mjs
- fsi-app/.discipline/governance/invariants.d/SC-5-domain-int-ssot.mjs
- fsi-app/.discipline/governance/invariants.d/SC-6-one-tier-per-host.mjs
- fsi-app/.discipline/governance/invariants.d/SC-7-claims-tier.mjs
- fsi-app/.discipline/governance/invariants.d/SC-8-authority-floor.mjs
- fsi-app/.discipline/governance/invariants.d/SC-9-moat-base-tier-only.mjs
- fsi-app/.discipline/governance/invariants.d/SF-1-inventory-consistency.mjs
- fsi-app/.discipline/governance/invariants.d/SF-10-customer-surface-rendering.mjs
- fsi-app/.discipline/governance/invariants.d/SF-11-secrets-registered.mjs
- fsi-app/.discipline/governance/invariants.d/SF-12-doctrine-no-uncited-gate.mjs
- fsi-app/.discipline/governance/invariants.d/SF-2-migration-ordering.mjs
- fsi-app/.discipline/governance/invariants.d/SF-3-admin-gating.mjs
- fsi-app/.discipline/governance/invariants.d/SF-4-client-server-tier-boundary.mjs
- fsi-app/.discipline/governance/invariants.d/SF-5-build-compiles.mjs
- fsi-app/.discipline/governance/invariants.d/SF-6-no-hardcoded-user-path.mjs
- fsi-app/.discipline/governance/invariants.d/SF-7-worktree-convention.mjs
- fsi-app/.discipline/governance/invariants.d/SF-8-canonical-anthropic-path.mjs
- fsi-app/.discipline/governance/invariants.d/SF-9-generation-config-no-raw-env.mjs
- fsi-app/.discipline/governance/loop-hops.d/01-sweep-to-fetch-drain.json
- fsi-app/.discipline/governance/loop-hops.d/02-sweep-to-ledger-consume.json
- fsi-app/.discipline/governance/loop-hops.d/03-ledger-consume-to-population-turn.json
- fsi-app/.discipline/governance/loop-hops.d/04-ledger-consume-to-corpus-turn.json
- fsi-app/.discipline/governance/loop-hops.d/05-population-turn-to-downstream-chain.json
- fsi-app/.discipline/governance/loop-hops.d/06-corpus-turn-to-downstream-chain.json
- fsi-app/.discipline/governance/loop-hops.d/07-downstream-chain-to-propagation-drain.json
- fsi-app/.discipline/governance/loop-hops.d/08-data-producers-to-propagation-drain.json
- fsi-app/.discipline/governance/loop-hops.d/09-population-turn-to-brief-export.json
- fsi-app/.discipline/governance/loop-hops.d/10-brief-apply-to-gate-a-rescan.json
- fsi-app/.discipline/governance/loop-hops.d/11-population-turn-to-gate-a-rescan.json
- fsi-app/.discipline/governance/loop-hops.d/12-brief-apply-to-source-resolution.json
- fsi-app/.discipline/governance/loop-hops.d/13-research-walker-to-source-resolution.json
- fsi-app/.discipline/governance/loop-hops.d/14-propagation-drain-to-question-answers.json
- fsi-app/.discipline/governance/loop-hops.d/15-population-turn-to-question-answers.json
- fsi-app/.discipline/governance/loop-hops.d/16-corpus-turn-to-theme-briefs.json
- fsi-app/.discipline/lib/firing-log.mjs
- fsi-app/.discipline/lib/fixtures/no-npm-resolve-hook.mjs
- fsi-app/.discipline/lib/fixtures/no-npm-resolve-register.mjs
- fsi-app/.discipline/lib/gate-firings.mjs
- fsi-app/.discipline/lib/mask-source.mjs
- fsi-app/.discipline/lib/read-migration-sql.mjs
- fsi-app/.discipline/lib/session-context.mjs
- fsi-app/.discipline/rendering/action-card-assert.mjs
- fsi-app/.discipline/rendering/audit/normalise.mjs
- fsi-app/.discipline/rendering/audit/open-state-sweep.mjs
- fsi-app/.discipline/rendering/audit/overflow-sweep.mjs
- fsi-app/.discipline/rendering/audit/run-audit.mjs
- fsi-app/.discipline/rendering/audit/seed-2026-09-07.md
- fsi-app/.discipline/rendering/audit/spec/absence.json
- fsi-app/.discipline/rendering/audit/spec/account-members.json
- fsi-app/.discipline/rendering/audit/spec/actionrow.json
- fsi-app/.discipline/rendering/audit/spec/admin-issues-rail.json
- fsi-app/.discipline/rendering/audit/spec/admin-stat-tiles.json
- fsi-app/.discipline/rendering/audit/spec/auth-frame.json
- fsi-app/.discipline/rendering/audit/spec/bandgradientrule.json
- fsi-app/.discipline/rendering/audit/spec/bandtile.json
- fsi-app/.discipline/rendering/audit/spec/chips.json
- fsi-app/.discipline/rendering/audit/spec/community-table.json
- fsi-app/.discipline/rendering/audit/spec/compose-01-dashboard.json
- fsi-app/.discipline/rendering/audit/spec/compose-02-regulations-list.json
- fsi-app/.discipline/rendering/audit/spec/compose-03-regulation-detail.json
- fsi-app/.discipline/rendering/audit/spec/compose-04-market-list.json
- fsi-app/.discipline/rendering/audit/spec/compose-05-market-detail.json
- fsi-app/.discipline/rendering/audit/spec/compose-06-research-list.json
- fsi-app/.discipline/rendering/audit/spec/compose-07-research-detail.json
- fsi-app/.discipline/rendering/audit/spec/compose-08-operations-list.json
- fsi-app/.discipline/rendering/audit/spec/compose-09-operations-profile.json
- fsi-app/.discipline/rendering/audit/spec/compose-10-map.json
- fsi-app/.discipline/rendering/audit/spec/compose-11-watchlist.json
- fsi-app/.discipline/rendering/audit/spec/compose-12-community.json
- fsi-app/.discipline/rendering/audit/spec/compose-13-admin-registry.json
- fsi-app/.discipline/rendering/audit/spec/compose-13-admin.json
- fsi-app/.discipline/rendering/audit/spec/compose-14-account.json
- fsi-app/.discipline/rendering/audit/spec/compose-15-settings.json
- fsi-app/.discipline/rendering/audit/spec/compose-16-auth.json
- fsi-app/.discipline/rendering/audit/spec/compose-16-signup.json
- fsi-app/.discipline/rendering/audit/spec/compose-17-onboarding.json
- fsi-app/.discipline/rendering/audit/spec/compose-regulations-register.json
- fsi-app/.discipline/rendering/audit/spec/detailsection.json
- fsi-app/.discipline/rendering/audit/spec/detailtagrow.json
- fsi-app/.discipline/rendering/audit/spec/factblocks.json
- fsi-app/.discipline/rendering/audit/spec/factcard.json
- fsi-app/.discipline/rendering/audit/spec/filterchipgroup.json
- fsi-app/.discipline/rendering/audit/spec/highrelevance.json
- fsi-app/.discipline/rendering/audit/spec/impactmeter.json
- fsi-app/.discipline/rendering/audit/spec/inthisliststat.json
- fsi-app/.discipline/rendering/audit/spec/list-surface-virtualized.json
- fsi-app/.discipline/rendering/audit/spec/list-surface.json
- fsi-app/.discipline/rendering/audit/spec/listrow.json
- fsi-app/.discipline/rendering/audit/spec/map-register.json
- fsi-app/.discipline/rendering/audit/spec/market-research-rows.json
- fsi-app/.discipline/rendering/audit/spec/masthead.json
- fsi-app/.discipline/rendering/audit/spec/milestonetimeline.json
- fsi-app/.discipline/rendering/audit/spec/mobile-01-dashboard.json
- fsi-app/.discipline/rendering/audit/spec/mobile-02-regulations-list.json
- fsi-app/.discipline/rendering/audit/spec/mobile-03-regulation-detail.json
- fsi-app/.discipline/rendering/audit/spec/mobile-04-market-list.json
- fsi-app/.discipline/rendering/audit/spec/mobile-06-research-list.json
- fsi-app/.discipline/rendering/audit/spec/mobile-08-operations-list.json
- fsi-app/.discipline/rendering/audit/spec/mobile-10-map.json
- fsi-app/.discipline/rendering/audit/spec/mobile-11-watchlist.json
- fsi-app/.discipline/rendering/audit/spec/mobile-18-drawer.json
- fsi-app/.discipline/rendering/audit/spec/onboarding-stepper.json
- fsi-app/.discipline/rendering/audit/spec/operations-matrix-nofigure.json
- fsi-app/.discipline/rendering/audit/spec/operations-matrix-selected.json
- fsi-app/.discipline/rendering/audit/spec/operations-matrix-six-regions.json
- fsi-app/.discipline/rendering/audit/spec/operations-matrix.json
- fsi-app/.discipline/rendering/audit/spec/page-frame.json
- fsi-app/.discipline/rendering/audit/spec/railcards.json
- fsi-app/.discipline/rendering/audit/spec/section-card-lists.json
- fsi-app/.discipline/rendering/audit/spec/sectionindex.json
- fsi-app/.discipline/rendering/audit/spec/settings-notifications.json
- fsi-app/.discipline/rendering/audit/spec/settings-section-index.json
- fsi-app/.discipline/rendering/audit/spec/skeleton.json
- fsi-app/.discipline/rendering/audit/spec/statblock.json
- fsi-app/.discipline/rendering/audit/spec/statenote.json
- fsi-app/.discipline/rendering/audit/spec/summarydepthswitch.json
- fsi-app/.discipline/rendering/audit/spec/tabrow.json
- fsi-app/.discipline/rendering/audit/spec/tagpopover.json
- fsi-app/.discipline/rendering/audit/spec/watchbutton.json
- fsi-app/.discipline/rendering/browser/rendered-text.mjs
- fsi-app/.discipline/rendering/capture-compose-11-watchlist.mjs
- fsi-app/.discipline/rendering/capture-compose-dashboard.mjs
- fsi-app/.discipline/rendering/capture-compose-details.mjs
- fsi-app/.discipline/rendering/capture-compose-lists-screenshots.mjs
- fsi-app/.discipline/rendering/capture-compose-page.mjs
- fsi-app/.discipline/rendering/capture-dashrow-screenshot.mjs
- fsi-app/.discipline/rendering/capture-defect-fix-screenshots.mjs
- fsi-app/.discipline/rendering/capture-detail-mobile-screenshots.mjs
- fsi-app/.discipline/rendering/capture-meterfix-screenshots.mjs
- fsi-app/.discipline/rendering/capture-opsmatrix5-screenshots.mjs
- fsi-app/.discipline/rendering/capture-uxfix-lists-fixture-screenshots.mjs
- fsi-app/.discipline/rendering/capture-uxfix-lists-screenshots.mjs
- fsi-app/.discipline/rendering/compose-composite.mjs
- fsi-app/.discipline/rendering/exemptions-375.mjs
- fsi-app/.discipline/rendering/exemptions-law2-desktop.mjs
- fsi-app/.discipline/rendering/fixtures/fonts/anton/anton-latin-400-normal.woff2
- fsi-app/.discipline/rendering/fixtures/fonts/plus-jakarta-sans/plus-jakarta-sans-latin-400-normal.woff2
- fsi-app/.discipline/rendering/fixtures/fonts/plus-jakarta-sans/plus-jakarta-sans-latin-500-normal.woff2
- fsi-app/.discipline/rendering/fixtures/fonts/plus-jakarta-sans/plus-jakarta-sans-latin-600-normal.woff2
- fsi-app/.discipline/rendering/fixtures/fonts/plus-jakarta-sans/plus-jakarta-sans-latin-700-normal.woff2
- fsi-app/.discipline/rendering/fixtures/fonts/plus-jakarta-sans/plus-jakarta-sans-latin-800-normal.woff2
- fsi-app/.discipline/rendering/layout-guard/allowlists.mjs
- fsi-app/.discipline/rendering/layout-guard/baseline.json
- fsi-app/.discipline/rendering/layout-guard/collect.mjs
- fsi-app/.discipline/rendering/layout-guard/generate-manifests.mjs
- fsi-app/.discipline/rendering/layout-guard/manifests.json
- fsi-app/.discipline/rendering/layout-guard/manifests.mjs
- fsi-app/.discipline/rendering/layout-guard/routes.mjs
- fsi-app/.discipline/rendering/layout-guard/run-layout-guard.mjs
- fsi-app/.discipline/rendering/panel21c-accept.mjs
- fsi-app/.discipline/rendering/smoke/action-card-smoke.mjs
- fsi-app/.discipline/rendering/smoke/admin-stat-tiles-smoke.mjs
- fsi-app/.discipline/rendering/smoke/command-bar-search-portal-smoke.mjs
- fsi-app/.discipline/rendering/smoke/community-smoke.mjs
- fsi-app/.discipline/rendering/smoke/corridor-scope-smoke.mjs
- fsi-app/.discipline/rendering/smoke/cross-page-smoke.mjs
- fsi-app/.discipline/rendering/smoke/detail-surfaces-smoke.mjs
- fsi-app/.discipline/rendering/smoke/guard-assert.mjs
- fsi-app/.discipline/rendering/smoke/impact-meter-partial-smoke.mjs
- fsi-app/.discipline/rendering/smoke/inference-section-smoke.mjs
- fsi-app/.discipline/rendering/smoke/labour-chain-smoke.mjs
- fsi-app/.discipline/rendering/smoke/lead-time-chart-smoke.mjs
- fsi-app/.discipline/rendering/smoke/masthead-balance-smoke.mjs
- fsi-app/.discipline/rendering/smoke/narrow-overflow-live-fixes-smoke.mjs
- fsi-app/.discipline/rendering/smoke/ops-matrix-acceptance-smoke.mjs
- fsi-app/.discipline/rendering/smoke/parity-checks-smoke.mjs
- fsi-app/.discipline/rendering/smoke/record-grade-smoke.mjs
- fsi-app/.discipline/rendering/smoke/research-rows-smoke.mjs
- fsi-app/.discipline/rendering/smoke/scroll-container-attack-smoke.mjs
- fsi-app/.discipline/rendering/smoke/section-index-smoke.mjs
- fsi-app/.discipline/rendering/smoke/settings-section-index-smoke.mjs
- fsi-app/.discipline/rendering/smoke/spec09-smoke.mjs
- fsi-app/.discipline/rendering/smoke/stub-auth-provider.mjs
- fsi-app/.discipline/rendering/smoke/stub-community-css.mjs
- fsi-app/.discipline/rendering/smoke/stub-empty-css.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-link.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-account.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-admin.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-community.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-item.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-login.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-onboarding.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-settings.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-signup.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation.mjs
- fsi-app/.discipline/rendering/smoke/stub-supabase-browser-account.mjs
- fsi-app/.discipline/rendering/smoke/stub-supabase-browser-auth.mjs
- fsi-app/.discipline/rendering/smoke/stub-supabase-browser-no-session.mjs
- fsi-app/.discipline/rendering/smoke/stub-supabase-browser.mjs
- fsi-app/.discipline/rendering/smoke/ux-harness.mjs
- fsi-app/.discipline/rendering/ux-assert.mjs
- fsi-app/.discipline/rendering/verify-meterfix-surfaces.mjs
- fsi-app/.discipline/rendering/verify-ppwr-title-style.mjs
- fsi-app/.discipline/rules/017-generation-config-no-raw-env.mjs
- fsi-app/.discipline/rules/019-source-reclassify-not-archive.mjs
- fsi-app/.discipline/rules/021-cached-shape-key.mjs
- fsi-app/scripts/producers/oem/fixtures/eea-hdv-sample.header.json
- fsi-app/scripts/producers/operations/fixtures/ukpn-capacity-heatmap-sample.header.md
- fsi-app/scripts/producers/regional/fixtures/neso-carbon-intensity-sample.header.md
- fsi-app/scripts/turns/question-answers/fixtures/question-answers-000.fixture.json
- fsi-app/scripts/turns/theme-briefs/fixtures/theme-briefs-000.fixture.json
- fsi-app/scripts/verify/no-personal-identifiers.test.mjs
- fsi-app/src/__tests__/market-eu-oil-bulletin-parser.fixtures.mjs
- fsi-app/src/__tests__/market-series-registry.test.mjs
- fsi-app/src/__tests__/oil-bulletin-workbook.fixtures.mjs
- fsi-app/src/__tests__/origin-class-mapping.test.mjs
- fsi-app/src/__tests__/prose-renderer-scope.test.mjs
- fsi-app/src/app/api/agent/run/guard-fail-closed.npmtest.mjs
- fsi-app/src/app/api/orgs/invitations-revoke-order.npmtest.mjs
- fsi-app/src/app/api/search/route-user-client.npmtest.mjs
- fsi-app/src/components/community/community-sidebar-route.test.mjs
- fsi-app/src/components/dashboard/band-tile-count-source.npmtest.mjs
- fsi-app/src/components/list-surface/live-facet-counts.npmtest.mjs
- fsi-app/src/components/regulations/UpcomingObligationsStripScope.npmtest.mjs
- fsi-app/src/components/sources/SourceStateStrips.npmtest.mjs
- fsi-app/src/components/ui/AntonTitleLetterSpacing.npmtest.mjs
- fsi-app/src/lib/agent/canonical-pipeline.markers.npmtest.mjs
- fsi-app/src/lib/agent/canonical-pipeline.research-context.npmtest.mjs
- fsi-app/src/lib/agent/canonical-pipeline.write-fields.npmtest.mjs
- fsi-app/src/lib/agent/gate-a-match.test.mjs
- fsi-app/src/lib/agent/gate-a-scan-harvest-skips.test.mjs
- fsi-app/src/lib/agent/gate-a-scan.test.mjs
- fsi-app/src/lib/agent/holdings-keying.npmtest.mjs
- fsi-app/src/lib/agent/timeline-harvest-unlock.npmtest.mjs
- fsi-app/src/lib/community/no-dm-guard.test.mjs
- fsi-app/src/lib/connections/resource-lookup.npmtest.mjs
- fsi-app/src/lib/sources/change-sweep.test.mjs
- fsi-app/src/lib/sources/classify-source-role.identity-signals.test.mjs
- fsi-app/src/lib/sources/classify-source-role.selftest.mjs
- fsi-app/src/lib/sources/host-authority-class-tier.test.mjs
- fsi-app/src/lib/sources/host-authority-d14-residue-ruling.npmtest.mjs
- fsi-app/src/lib/sources/host-authority-gov-label-and-legal-publisher.npmtest.mjs
- fsi-app/src/lib/sources/host-authority-ruling-conformance.test.mjs
- fsi-app/src/lib/sources/host-authority.npmtest.mjs
- fsi-app/src/lib/sources/institution.test.mjs
- fsi-app/src/lib/sources/reconcile.npmtest.mjs
- fsi-app/src/lib/sources/standards-body-class.test.mjs
- fsi-app/src/lib/sources/tier-opinion-dedup.npmtest.mjs
- fsi-app/src/lib/sources/transport-hold-wiring.npmtest.mjs
- fsi-app/src/lib/sources/w2f-basetier.npmtest.mjs
- fsi-app/src/lib/supabase-server-dropped-errors.npmtest.mjs
- fsi-app/src/lib/workspace/notes-path-retired.test.mjs
- fsi-app/src/lib/workspace/relevance.test.mjs
