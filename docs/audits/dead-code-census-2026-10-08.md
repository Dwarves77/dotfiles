# Dead and forgotten code census, 2026-10-08

Fact lane, read-only. Repo C:\Users\jason\dotfiles, master ee0dd483 (HEAD equals origin/master, confirmed with `git rev-parse HEAD origin/master` after `git fetch origin`). Operator question: "How many errant and forgotten pieces of code exist throughout this whole system?!"

Labels: every count carries [CONFIRMED: method]; every interpretation is [HYPOTHESIS]. A count is a count of candidates that match a stated mechanical test, not a verdict that the thing should be deleted.

## Summary

| # | Category | Count | How counted | Confidence |
|---|---|---|---|---|
| 1 | Modules with no importer and no workflow or package.json reference | 33 | F25 import graph + dispatch roots, run read-only (1,403 scoped modules); 24 are F25 allowlist entries, 0 beyond it; plus 9 reachable only from dead modules (reachability walk). Not counted: 31 tracked files under _archive, 34 tracked files in gitignored scripts/tmp | [CONFIRMED] count; allowlist reasons stand as written |
| 2 | Exported symbols never imported anywhere | 573 | import-aware export graph over 6,153 exports (82 dead-strict + 491 export-only-local); 82 of 82 and 20 of 491 re-checked with git grep. Not counted: 2,291 test-only, 202 name-collision | [CONFIRMED] 573; [HYPOTHESIS] that test-only (2,291) and name-collision (202) are dead |
| 3 | React components never mounted | 6 | JSX and value-use resolution over 230 tsx files, each survivor hand-checked with git grep (4 unmounted + 2 only used by an unmounted one) | [CONFIRMED] |
| 4 | API routes with no caller | 6 | path regex over 104 routes vs src, scripts, workflows, runbooks, vercel.json; 4 with no caller anywhere + 2 called only by dead code. 8 more are reached only by workflow or runbook (not counted) | [CONFIRMED]; /api/version [HYPOTHESIS] (public audit route by design) |
| 5 | DB tables and views with no reader / reader but no writer / empty with no producer | 22 | F47 and F14 scanners on 115 tables, 7 views; 12 tables with no code reader (after hand check) + 4 reader-without-writer tables + 6 views with no consumer. estimated_values is the one empty table with no producer at all | [CONFIRMED] 14; [HYPOTHESIS] 8 (DB-internal by design or vestigial after ADR-042); no live DB queried |
| 6 | Columns referenced nowhere in code | 23 | migration-replayed column lists for the 20 largest tables (377 columns), name never appears in non-test code; all 23 re-checked with git grep | [HYPOTHESIS] (select(*) readers and RPC bodies are invisible to a name grep) |
| 7 | Scripts referenced by no workflow, package.json, runbook or other script | 27 | token index over 377 scripts (fsi-app/scripts, supabase/seed, root scripts/); 31 minus 4 explained false positives. 25 are supabase/seed, outside F25 scope | [CONFIRMED]; 15 are doc-only references, 12 referenced by nothing |
| 8 | Workflows disabled, never run, or last run before 2026-09-01 | 4 | gh workflow list --all (30) and gh run list per workflow: 3 disabled_manually (data-audit-lane, source-monitoring, spot-check-monthly) + chain-proof.yml (0 runs, created 2026-10-08). 45 audit scripts run only through the disabled data-audit-lane | [CONFIRMED] |
| 9 | Files mentioning retired things or TODO-class markers | 74 | git grep per term, code + living docs: 63 files (148 lines) naming a retired term; 11 files (13 lines) with TODO/FIXME/XXX/HACK/DEPRECATED. Not totalled: RETIRED (60 files), legacy (179 files) | [CONFIRMED] counts; [HYPOTHESIS] which mentions are stale (most code mentions are correct tombstones; stale ones read: source.ts "seven domains", F26/write-item.ts old column name, seek-more.mjs operator-priced-only) |
| 10 | Allowlist entries, live fitness-allow markers, override trailers | 317 | 149 entries in 39 allowlist/exemption constants (141 with reason, 8 without) + 157 live fitness-allow markers (1 without reason) + 11 override trailers (all with reason). Not totalled: 1,038 glyph:verbatim markers in 220 files (548 with text) | [CONFIRMED]; constant list found by pattern, may be incomplete [HYPOTHESIS] |
| 11 | Migrations: never applied / ledger rows with no file / rows with no stored statements | 173 | 16 + 45 + 112 per request; map in unmerged lane worktree confirms 112 exactly, 16 as the status-header edits (1 strictly never-applied file), 36 rows still file-less + 5 recovered. reconciliation.md is absent from disk; may overlap between the three | [CONFIRMED] 112; [HYPOTHESIS] exact composition of 45 and 16 |
| 12 | Docs: markdown orphans, dead INDEX lines, runbook refs to missing scripts | 509 | 467 markdown files outside archive/ not linked from INDEX.md (935 counting images and js) + 24 INDEX lines to nonexistent files + 18 runbook refs (14 intended tombstones, 4 stale pointers) | [CONFIRMED] counts; [HYPOTHESIS] that orphans are forgotten rather than intentionally unindexed (dated logs, briefs) |
| | **Total (mixed units: modules, symbols, files, rows, markers; orientation only, not a defect count)** | **1767** | sum of the twelve headline counts | |

Three largest: category 2 (573 symbols, 2,864 if test-only exports are included), category 12 (509 doc items, 935 files counting images), category 10 (317 entries and markers, 1,355 with glyph:verbatim).

What the numbers do not say: no count here is a verdict that something should be deleted. Every list marked [CONFIRMED] is a count of items matching a stated mechanical test; every interpretation is [HYPOTHESIS]. The strongest structural finding is not a count: the repo's own liveness gates are green (F25 0 beyond allowlist, F47 0 unreferenced, F14 0 gating write-orphans), so what a gate cannot see is where the 573, 6, 6, 27 and 23 came from: exports, unmounted-but-imported components, routes called only by dead callers, supabase/seed and root scripts (outside F25 scope), and columns.

Gaps in the evidence, stated once: (1) no dead-code tool (knip, ts-prune, depcheck) is in package.json or node_modules, so none was run; the method is the wiring audit's own import graph. (2) reconciliation.md (category 11) is not on disk; the lane's APPLIED-MAP.json in an unmerged worktree was read instead. (3) The raw 2026-10-04 table inventory is not on disk; only its narrative in docs/plans/system-map-2026-10-04.md was used, so "empty with no producer" covers the 16 empty tables that file names, not the 30 its summary claims. (4) No database, GitHub write, or network call other than `git fetch`, `gh workflow list` and `gh run list` was made.


## 1. Modules with no importer and no workflow or package.json script (src, scripts, .discipline)

Method [CONFIRMED]: F25 (`.discipline/fitness/functions/F25-module-liveness.mjs`) functions imported and run read-only from the main checkout: scope = 1,403 non-test modules under fsi-app/src, fsi-app/scripts, fsi-app/.discipline (excluding framework entry files, _archive, scripts/tmp, fixtures); import graph over 2,508 files; dispatch roots = every `.mjs` path named in `.github/workflows/*.yml`, `package.json` scripts, esbuild stub aliases, data-audit markers. Result: 470 modules have no production importer, 446 of those are dispatch roots, **24 remain and all 24 are in F25 LEGACY_ALLOWLIST; 0 are beyond the allowlist**; `fitnessFunction.check()` returns [] (green). The 495-path `dead-code-manifest-2026-08-11.txt` that F25 also excludes: 0 of 495 paths exist today, so that manifest is fully discharged (stale, harmless).

Second measure [CONFIRMED: reachability walk]: starting from 701 live roots (framework entries plus dispatch roots) and following non-test imports, 1,370 of 1,403 scoped modules are reachable. **33 are unreachable = the 24 allowlisted + 9 more that are imported only by dead modules** (F25 cannot see these, it counts any non-test importer as liveness).

### 1a. The 24 F25 LEGACY_ALLOWLIST entries (stated reason, date)

| # | Path | Class | Date stated | Reviewed by | Reason (first 230 chars) |
|---|---|---|---|---|---|
| 1 | scripts/maintenance/repair-smoke-account.mjs | operator CLI | 2026-10-06 | lane AUTH-2, 2026-10-06 | Operator-account repair CLI, run by the coordinator's executor; writes only profiles and org_memberships for one named non-admin account; refuses platform admins. |
| 2 | scripts/turns/import-stranded-harness-branches.mjs | operator CLI | 2026-09-27 | lane HARNESS-LANDING, 2026-09-27 | Genuinely operator-invoked, out-of-workflow, one-time CLI (the same "hand-run, per-item, no schedule, no workflow line" shape OUT-OF-REPO-BOUNDARY.md's Operator-CLI register already recognizes for the _reground/*.mjs toolkit) -... |
| 3 | scripts/maintenance/one-off/2026-09-29-reverse-chained-apply.mjs | operator CLI | 2026-09-29 | lane REVERSE-CHAINED-APPLY, 2026-09-29 | Genuinely operator-invoked, out-of-workflow, one-time CLI (the same "hand-run, per-item, no schedule, no workflow line" shape OUT-OF-REPO-BOUNDARY.md's Operator-CLI register already recognizes for the _reground/*.mjs toolkit an... |
| 4 | scripts/turns/read-brief-export-queue.mjs | operator CLI | 2026-10-02 | lane R22, 2026-10-02 | Genuinely operator/session-lane-invoked, out-of-workflow, read-only CLI (lane R22, 2026-10-02, the same "hand-run, no schedule, no workflow line" Operator-CLI shape this list already recognizes above) -- the CONSUMER end of the... |
| 5 | scripts/turns/dry-run-structured-actions.mjs | operator CLI | 2026-09-28, 2026-09-25 | lane STRUCTURED-ACTIONS, 2026-09-28 | Genuinely operator-invoked, out-of-workflow, read-only exploratory CLI (lane STRUCTURED-ACTIONS, 2026-09-28; the same "hand-run, no schedule, no workflow line" Operator-CLI shape this list already recognizes above) -- reads liv... |
| 6 | src/components/resource/SectorSynopsis.tsx | unmounted component | none | ui-liveness ruling (operator: mount or delete, per component) | Built and never mounted - no page, layout or component renders it. A design system that ran ahead of the pages, not a breakage. Wire it into the surface it was drawn for, or delete it; leaving it is how a component library rots... |
| 7 | src/lib/intake/census-writer.mjs | built-not-wired | 2026-08-31 | dormant-capability ruling (operator: wire into the live flow, or de... | Has a selftest, has NO production importer. This is remediation-discipline category 21 in its literal form: the test proves the module works and says nothing about whether the flow that should use it ever calls it. Either wire ... |
| 8 | src/lib/intake/intake-url-corpus.mjs | test fixture | 2026-08-31 | dormant-capability ruling (operator: wire into the live flow, or de... | Has a selftest, has NO production importer. This is remediation-discipline category 21 in its literal form: the test proves the module works and says nothing about whether the flow that should use it ever calls it. Either wire ... |
| 9 | src/lib/llm/metered-gate.mjs | built-not-wired | 2026-08-31, 2026-09-04 | dormant-capability ruling (operator: wire into the live flow, or de... | Has a selftest, has NO production importer. This is remediation-discipline category 21 in its literal form: the test proves the module works and says nothing about whether the flow that should use it ever calls it. Either wire ... |
| 10 | src/lib/llm/program-total.mjs | built-not-wired | 2026-08-31 | dormant-capability ruling (operator: wire into the live flow, or de... | Has a selftest, has NO production importer. This is remediation-discipline category 21 in its literal form: the test proves the module works and says nothing about whether the flow that should use it ever calls it. Either wire ... |
| 11 | src/lib/sources/instrument-identity.ts | built-not-wired | none | dormant-capability ruling (operator: wire into the live flow, or de... | Has a selftest, has NO production importer. This is remediation-discipline category 21 in its literal form: the test proves the module works and says nothing about whether the flow that should use it ever calls it. Either wire ... |
| 12 | src/lib/contracts/corridor-id.mjs | built-not-wired | 2026-08-31, 2026-09-05 | dormant-capability ruling (operator: wire into the live flow, or de... | Has a selftest, has NO production importer. This is remediation-discipline category 21 in its literal form: the test proves the module works and says nothing about whether the flow that should use it ever calls it. Either wire ... |
| 13 | scripts/lib/decision-anchors.mjs | orphaned by archive | 2026-09-01 | dormant-capability ruling (operator: wire into a live flow, or reti... | Orphaned 2026-09-01 when this lane archived its sole importer, scripts/lib/decision-log-audit.mjs (scripts/_archive/lib/decision-log-audit.mjs). Not archived itself: decision-anchors.selftest.mjs is hard-named in .github/workfl... |
| 14 | scripts/lib/exclusion-audit.mjs | orphaned by archive | 2026-09-01 | dormant-capability ruling (operator: wire into a live flow, or reti... | Orphaned 2026-09-01 when this lane archived its remaining production importers, scripts/lib/block1-reaudit.mjs, bootstrap-test1.mjs, and exclusion-audit-reconstruction.mjs (all now under scripts/_archive/lib/). Not archived its... |
| 15 | scripts/lib/inconclusive-probe.mjs | orphaned by archive | 2026-09-01 | dormant-capability ruling (operator: wire into a live flow, or reti... | Orphaned 2026-09-01 when this lane archived its sole importer, scripts/lib/inconclusive-report.mjs (scripts/_archive/lib/inconclusive-report.mjs). Not archived itself: inconclusive-probe.selftest.mjs is hard-named in .github/wo... |
| 16 | scripts/lib/liveness.mjs | orphaned by archive | 2026-09-01 | dormant-capability ruling (operator: wire into a live flow, or dele... | Orphaned 2026-09-01 when this lane archived its sole importer, scripts/lib/liveness-reconstruction.mjs (scripts/_archive/lib/liveness-reconstruction.mjs). No CI pin on liveness.selftest.mjs (only named in run-test-suite.sh, fre... |
| 17 | scripts/lib/batch-primitives.mjs | built-not-wired | 2026-08-11 | dead-code-sweep (docs/audits/dead-code-manifest-2026-08-11.txt) | Batch primitives consumed only by its own proof and two manifest scripts. Same sweep coupling as anthropic.mjs. |
| 18 | src/components/figures/StatutoryFigure.tsx | built-not-wired | none | system-completion train (operator: remove this entry once a later l... | Layer 4 of spec §4's statutory/estimate isolation (a separate render component for a filing-grade figure, never sharing a visual slot with EstimatedFigure) - published for whichever lane next wires a real obligation/filing page... | glyph:verbatim
| 19 | src/lib/statutory/types.contractable-barrier.check.ts | type-check-only | none | n/a - this file is never meant to gain a production importer; re-re... | This file exists ONLY to be type-checked (`npx tsc --noEmit`), never executed - its two computeStatutory() calls (one clean, one carrying a deliberate `// @ts-expect-error` on a modelled field) exist to PROVE Layer 2's compile-... |
| 20 | scripts/_ruling/null-tier-host-ruling.mjs | test fixture | 2026-09-05, 2026-08-11 | n/a - permanent data-fixture cited by a live conformance test; re-r... | RECLASSIFIED (lane W71-C, 2026-09-05, was a W7.1 expiring one-shot): this is NOT a discharged one-shot - fsi-app/src/lib/sources/host-authority-ruling-conformance.test.mjs imports its exported RULING array directly (a relative ... |
| 21 | scripts/lib/is-main-fixture.mjs | test fixture | 2026-09-11 | n/a, permanent spawn fixture for a live regression test; re-review ... | task 0.3b, 2026-09-11: a deliberate spawn fixture for scripts/lib/is-main.test.mjs, same shape as the null-tier-host-ruling.mjs entry above ("a data-only golden-fixture file with no production call site to be wired into"). isMa... |
| 22 | src/test-support/fake-supabase.mjs | other | none | n/a: permanent shared test double; re-review only if every importin... | A shared injected-fake Supabase client for node:test suites (select/eq/in, upsert with onConflict/ignoreDuplicates, update.eq): test infrastructure, not a production capability. Its only intended callers are test files, which i... |
| 23 | scripts/producers/regional/state-cost-facts-producer.mjs | operator CLI | 2026-09-25 | R14 lift ruling (operator/coordinator): wire a dry-mode-only produc... | R14 hold (operator ruling 2026-09-25): state_cost_facts producer, built and proven on fixtures (state-cost-facts-producer.test.mjs, 9 tests; a real CLI run wrote scripts/harness-runs/state-cost/state-cost-run-001.json), deliber... |
| 24 | scripts/producers/market/carrier-ets-surcharge-producer.mjs | R14 hold producer | 2026-09-25 | R14 lift ruling (operator/coordinator): wire a dry-mode-only produc... | R14 hold (operator ruling 2026-09-25, decisions 1/2): carrier-published-ETS-surcharge carbon-price producer (carbon-cost-per-feu.mjs's own GAP.NO_CARBON_PRICE), built and proven on fixtures (carrier-ets-surcharge-producer.test.... |

By class [CONFIRMED: reading each reason]: operator CLI 6, unmounted component 1, built-not-wired 7, test fixture 3, orphaned by archive 4, type-check-only 1, other 1, R14 hold producer 1.

### 1b. 9 modules reachable only from dead modules (not in F25 output)

| Path | Only importers |
|---|---|
| scripts/lib/drift-check.mjs | scripts/lib/decision-anchors.mjs (allowlisted), surface-registry.mjs (dead), own npmtest |
| scripts/lib/fetch-negative-probe.mjs | scripts/lib/inconclusive-probe.mjs (allowlisted), own npmtest |
| scripts/lib/surface-registry.mjs | scripts/lib/exclusion-audit.mjs, fetch-negative-probe.mjs, inconclusive-probe.mjs (all dead) |
| scripts/lib/verify.mjs | scripts/lib/surface-registry.mjs (dead), own selftest |
| src/components/resource/IntelligenceBrief.tsx | src/components/resource/SectorSynopsis.tsx (allowlisted, unmounted) |
| src/components/resource/IntelligenceMetadataStrip.tsx | src/components/resource/SectorSynopsis.tsx (allowlisted, unmounted) |
| src/lib/contracts/verbatim-grounding.mjs | src/lib/market/carrier-ets-surcharge-envelope.mjs, src/lib/regional/state-cost-facts-envelope.mjs (both R14-held producers) |
| src/lib/market/carrier-ets-surcharge-envelope.mjs | scripts/producers/market/carrier-ets-surcharge-producer.mjs (allowlisted, R14 hold) + tests |
| src/lib/regional/state-cost-facts-envelope.mjs | scripts/producers/regional/state-cost-facts-producer.mjs (allowlisted, R14 hold) + tests |

### 1c. Inert-by-construction stores tracked in git (outside F25 scope by rule)

- Tracked files under scripts/_archive and src/_archive: **31** [CONFIRMED: git ls-files].
- Tracked files under fsi-app/scripts/tmp (a directory .gitignore excludes, standing rule 5 says machine evidence does not belong in the repo): **34** [CONFIRMED: git ls-files fsi-app/scripts/tmp]; all are .json/.log/.txt/.py evidence from phases 2-5, mig 070/083, q1-q10, stage2.

Archive list:

- scripts/_archive/README.md
- scripts/_archive/_diag/probe-live-checks.mjs
- scripts/_archive/_wave-alpha/backfill-themes.mjs
- scripts/_archive/lib/block1-reaudit.mjs
- scripts/_archive/lib/bootstrap-test1.mjs
- scripts/_archive/lib/decision-log-audit.mjs
- scripts/_archive/lib/drift-check-reconstruction.mjs
- scripts/_archive/lib/error-drop-probe.mjs
- scripts/_archive/lib/error-drop-probe.selftest.mjs
- scripts/_archive/lib/exclusion-audit-reconstruction.mjs
- scripts/_archive/lib/fetch-quality.mjs
- scripts/_archive/lib/funded-release-plan.mjs
- scripts/_archive/lib/funded-release-plan.test.mjs
- scripts/_archive/lib/inconclusive-report.mjs
- scripts/_archive/lib/liveness-reconstruction.mjs
- scripts/_archive/lib/net-agent.mjs
- scripts/_archive/lib/surface-registry-reconstruction.mjs
- scripts/_archive/lib/type-consumer-probe.mjs
- scripts/_archive/lib/type-consumer-probe.selftest.mjs
- scripts/_archive/lib/urgency.mjs
- scripts/_archive/lib/verify-reconstruction.mjs
- scripts/_archive/phase-5-backfill.mjs
- scripts/_archive/phase2-build-binding.mjs
- scripts/_archive/phase2-reconcile.mjs
- scripts/_archive/phase2-verify-binding.mjs
- scripts/_archive/sprint3-corpus-reclassify-audit.mjs
- scripts/_archive/tmp/phase-5-rollback.mjs
- src/_archive/lib/agent/extract-research-sections.ts
- src/_archive/lib/d3/hooks-reconstruction.mjs
- src/_archive/lib/dashboard/credibility.ts
- src/_archive/lib/dashboard/critical-items.ts

scripts/tmp tracked list:

- scripts/tmp/d6-apply-and-verify-output.json
- scripts/tmp/d6-preflight-baseline.json
- scripts/tmp/flip-task6-run-2.log
- scripts/tmp/flip-task6-run.log
- scripts/tmp/mig070-snapshot.json
- scripts/tmp/mig083-apply-output.json
- scripts/tmp/mig083-postflight-output.json
- scripts/tmp/mig083-preflight-output.json
- scripts/tmp/phase-2-dedup-introspect.json
- scripts/tmp/phase-3-classified.json
- scripts/tmp/phase-3-classify.py
- scripts/tmp/phase-3-jurisdiction-introspect.json
- scripts/tmp/phase-4-prework-introspect.json
- scripts/tmp/phase-4a-amendment-preflight.json
- scripts/tmp/phase-4a-apply-output.txt
- scripts/tmp/phase-4b-apply-output.txt
- scripts/tmp/phase-4b-dryrun.json
- scripts/tmp/phase-4b-post-apply-verify.json
- scripts/tmp/phase-4b-schema-introspect.json
- scripts/tmp/phase-5-design-preflight.json
- scripts/tmp/phase-5-execute-output-v2.json
- scripts/tmp/phase-5-execute-output-v3.json
- scripts/tmp/phase-5-execute-output.json
- scripts/tmp/phase-5-implementation-preflight.json
- scripts/tmp/phase-5-verify-only-output.json
- scripts/tmp/phase-5-verify-only-refactored.json
- scripts/tmp/q1-apply-089-output.json
- scripts/tmp/q10-duplicate-report.json
- scripts/tmp/q3-apply-091-output.json
- scripts/tmp/q5-apply-093-output.json
- scripts/tmp/q8-apply-088-output.json
- scripts/tmp/q8-citation-stats-check-output.json
- scripts/tmp/stage2-apply-output.json
- scripts/tmp/stage2-preflight-output.json

## 2. Exported symbols never imported anywhere

Method [CONFIRMED: custom import-aware export graph, same specifier resolver as F25 (resolveSpecifier and isTestFile imported from F25), run read-only]: 1,407 non-test modules under src, scripts, .discipline, supabase/functions and fsi-app root configs (excluding Next entry files, _archive, fixtures, .d.ts); 6,153 distinct named exports found (export function/class/const/let/var/type/interface/enum, export { a, b as c }, export ... from; default exports excluded). A symbol is "imported" when a named import, a re-export, a namespace import, a side-effect import, a dynamic import() or a require() of its module reaches it (namespace and dynamic imports count as importing every export, which is conservative). No dead-code tool is installed (package.json has no knip, ts-prune or depcheck; node_modules has none), so this is the wiring audit's method, not a tool run. 2,899 exports are imported by non-test code. The remaining 3254 are split by a second, independent token check (does the identifier appear on a non-comment line of any OTHER tracked code file: .ts .tsx .mjs .cjs .js .jsx .yml .sh, workflows included):

| Class | Count | Meaning | Confidence |
|---|---|---|---|
| A1 dead-strict | 82 | no importer, name appears in no other code file, used at most once in its own file (the definition) | [CONFIRMED: graph + token + git grep on all 82] |
| A2 export-only-local | 491 | no importer, name appears in no other code file, but used inside its own module (only the export keyword is dead) | [CONFIRMED: graph + token + git grep on 20 sampled] |
| B test-only | 2291 | imported (graph 2239) or named (token 52) only by test files, no production use | [CONFIRMED: graph]; [HYPOTHESIS] that this is dead rather than export-for-testability |
| C name-elsewhere | 390 | no resolved importer, but the identifier appears in other non-test code (name collision or a computed/convention load) | [HYPOTHESIS]; 188 of them are convention-loaded (invariant x151 loaded by .discipline/governance/invariants.mjs through import(new URL(file)), fitnessFunction x3 loaded by fitness/manifest.mjs, esbuild stub-* aliases) and are live by convention |

**Headline for "never imported anywhere" = A1 + A2 = 573** [CONFIRMED]; adding test-only = 2864. Of A1+A2, type or interface exports: 243.

Sample verification (independent method, `git grep -n -w -F <name>` over tracked .ts .tsx .mjs .cjs .js .jsx .yml .sh, excluding the symbol's own file and comment lines): A1 all 82 checked, 82 of 82 have zero code hits elsewhere (one, OPS in src/lib/corrections/item-corrections.mjs, first showed 11 hits that are all inside trailing comments naming "lane OPS-1"). A2 20 sampled, 20 of 20 zero. C 9 sampled earlier, 9 of 9 had 14 to 549 hits, which confirms C is collision or convention rather than dead. Cross-check against the 2026-09-04 B1 "dead exports" column: B1 named 27 symbols in 19 modules; 9 are still non-live here, 18 are now imported or the module changed.

### 2a. A1 dead-strict (82 symbols in 49 files)

- .discipline/fitness/functions/F51-no-shared-append.mjs (2): HOTSPOT_WINDOW_ANCHOR_DECIDED_ON, HOTSPOT_WINDOW_ANCHOR_REASON
- .discipline/fitness/functions/F64-rls-admin-gate-class.mjs (1): _clearCorpusCache
- .discipline/fitness/functions/F9-build-compiles.mjs (1): _runTypecheck
- .discipline/fitness/lib/glob.mjs (2): _expandPattern, _matchesTail
- .discipline/governance/doctrine-register.mjs (1): DOCTRINE_IDS
- .discipline/governance/execution-wiring.mjs (1): _resetCacheForTest
- .discipline/governance/skill-contract-map.mjs (1): isSkillContractClean
- .discipline/governance/skill-map.mjs (1): skillsForClass
- .discipline/lib/no-npm-sandbox.mjs (1): initialize
- .discipline/rendering/layout-guard/allowlists.mjs (1): ABSENCE_PATTERN
- .discipline/rules/012-hardcoded-user-path.mjs (2): _CODE_EXTENSIONS, _SKIP_PATH_FRAGMENTS
- .discipline/rules/020-fork-log-frozen.mjs (1): _FORK_PATH
- .discipline/rules/022-no-dash-glyphs.mjs (1): isDesignHandoffBundleFileExempt
- scripts/_ruling/null-tier-host-ruling.mjs (1): BY_HOST
- scripts/classification/propose-classifications.mjs (1): ANOMALY_THRESHOLD
- scripts/connections/analyze-corpus.mjs (1): IN_CHUNK
- scripts/lib/batch-primitives.mjs (1): createProgressReporter
- scripts/lib/funded-pass-lock.mjs (1): HEARTBEAT_MIN_MS
- scripts/mint/validate-mint-payload.mjs (1): VALIDATE_MINT_PAYLOAD_KIT_VERSION
- scripts/turns/needs-search/schema.mjs (1): NEED_KINDS
- scripts/verify/lib/information-schema-scan.mjs (1): fetchSchemaSnapshot
- src/app/api/admin/sources/bulk-import/logic.ts (1): headReachabilityDecision_LEGACY_BUGGY
- src/components/account/AccountPrimitives.tsx (1): SubTabBar
- src/components/community/types.ts (1): CommunityEntityThread
- src/components/ui/__fixtures__/record-grade-fixture.ts (1): RECORD_GRADE_FIXTURE_PARSED
- src/lib/agent/audit-gate.ts (1): WaiverAction
- src/lib/agent/extract-sections.ts (2): extractSeverityLabel, headingSlug
- src/lib/agent/source-entry-filter.mjs (1): dropUnbackedRows
- src/lib/constants.ts (20): AuthorityLevel, BRIEFING_SECTIONS, DEEP_DIVE_SECTIONS, CONFIDENCE_LEVELS, PRIORITY_DISPLAY_LABEL, INFO_TYPE_COLORS, INFO_TYPE_LABELS, getInfoType, URGENCY_LABELS, TOPIC_COLORS, IMPACT_COLORS, IMPACT_LABELS, DOMAIN_COLORS, PROVENANCE_LEVELS, ARCHIVE_REASONS, ModeId, TopicId, JurisdictionId, LifecycleStage, ShareLevel
- src/lib/contracts/source-licence.mjs (1): REDISTRIBUTION_CODES
- src/lib/corrections/item-corrections.mjs (2): OPS, tagRef
- src/lib/entities/corridor-scope-cache.ts (1): getCachedCorridorScopeSummary
- src/lib/entities/decisions.mjs (2): DRAIN_MODE, ESTIMATE_DISPLAY
- src/lib/format.ts (2): formatTimelineDate, getQuarter
- src/lib/jurisdictions/iso.ts (1): legacyToIso
- src/lib/llm/haiku-classify.ts (2): ClassifyInput, ClassifyResult
- src/lib/llm/skill-loader.ts (1): ENVIRONMENTAL_POLICY_SKILL_CORE_APPROX_TOKENS
- src/lib/operations/region-grid.mjs (1): CELL_STATES
- src/lib/scoring.ts (4): buildSectorContext, isInActiveSectors, sortResources, filterResources
- src/lib/sources/holdings-audit.mjs (1): cleanTextLength
- src/lib/sources/sitemap-walk.mjs (1): allProbesBotWalled
- src/lib/sources/url-canonicalize.ts (1): wwwNormalize
- src/lib/sources/vertical-fit.ts (2): looksLikeStatuteCodeDb, coversVerticalAuthority
- src/lib/tags/client.ts (2): subscribeWorkspaceTags, deleteWorkspaceTag
- src/lib/tags/types.ts (1): CreateWorkspaceTagInput
- src/lib/tier1-priority-jurisdictions.ts (1): regionForIso
- src/lib/watchlist/membership.ts (1): fetchWatchMembership
- src/stores/workspaceStore.ts (1): getActiveSectors
- src/types/resource.ts (2): CrossRef, SharePackage

### 2b. A2 export-only-local (491 symbols in 268 files)

- .discipline/consistency/lib/inventory-parser.mjs (2): stripMarkdownLink, stripBackticks
- .discipline/consistency/override-check.mjs (1): messageForCommit
- .discipline/dispatch/audit.mjs (2): findCommitsByUuid, findRecentDispatches
- .discipline/fitness/functions/F15-spend-chokepoint.mjs (1): DIRECT_API_RE
- .discipline/fitness/functions/F16-transport-hold-gate.mjs (3): GATE_CALL_RE, RAW_BROWSERLESS_RE, rawBrowserlessLines
- .discipline/fitness/functions/F17-size-cap-doctrine.mjs (1): CAP_DECL_RE
- .discipline/fitness/functions/F19-no-service-anon-downgrade.mjs (1): DOWNGRADE_RE
- .discipline/fitness/functions/F20-pause-flag-one-writer.mjs (2): WRITE_RES, findPauseFlagWrite
- .discipline/fitness/functions/F21-single-grounding-entry.mjs (2): WORKFLOW_RE, GROUNDING_CALL_RE
- .discipline/fitness/functions/F26-storage-ceiling-parity.mjs (2): NEXT_RE, WORKER_RE
- .discipline/fitness/functions/F40-authed-api-fetch.mjs (1): GUARD_CALL_RE
- .discipline/fitness/functions/F43-default-open-disclosure.mjs (1): nameWords
- .discipline/fitness/functions/F46-external-host-home.mjs (1): NOT_EXTERNAL_RE
- .discipline/fitness/functions/F47-db-object-reference.mjs (3): MIGRATION_GLOBS, CODE_GLOBS, inCodeScope
- .discipline/fitness/functions/F51-no-shared-append.mjs (2): ENTRY_DIRS, COORDINATOR_ONLY_EXACT
- .discipline/fitness/functions/F69-model-id-literal.mjs (2): MODEL_ID_LITERAL_RE, modelIdLiteralLines
- .discipline/governance/closure-gate.mjs (2): RUNBOOK_INDEX_PATH, RUNBOOK_STEP_DIR
- .discipline/governance/db-object-reference.mjs (2): codeWithoutComments, READ_HELPER_RE
- .discipline/governance/doctrine-contradiction.mjs (3): SELF_GATE_RE, NEGATION_RE, CITATION_RE
- .discipline/governance/memory-gate.mjs (1): gitMemoryDiffLines
- .discipline/governance/skill-contract-map.mjs (1): ACCOUNT_LEVEL_SKILLS
- .discipline/lib/no-npm-sandbox.mjs (2): CHECKOUT_ROOTS, BLOCKED_INSTALL_REALPATHS
- .discipline/lib/predicates.mjs (4): isInvestigationOnly, isHotfix, isResearchOnly, isConversationOnly
- .discipline/rendering/assertions.mjs (1): OVERFLOW_TOLERANCE_PX
- .discipline/rendering/compose-composite.mjs (1): BUILT_DIR
- .discipline/rendering/layout-guard/manifests.mjs (2): CARD_DEVIATIONS, deviationsFromLog
- .discipline/rendering/live/live-assertions.mjs (4): PLACEHOLDER_TOKENS, ANALYSIS_BLOCK_KINDS, SCORE_WORDS, REFUSAL_STATUSES
- .discipline/rendering/live/live-preflight.mjs (2): ALLOWED_HOST_SUFFIXES, SECRET_NAMES
- .discipline/rendering/live/live-smoke.mjs (1): LIST_SURFACES
- .discipline/rendering/live/live-snapshot.mjs (2): collectSnapshotInPage, collectLinksInPage
- .discipline/rendering/overflow-rule.mjs (2): OVERFLOW_TOLERANCE, collectContainersInPage
- .discipline/rendering/smoke/live-smoke-fixture-smoke.mjs (1): runFixtureLeg
- .discipline/rendering/smoke/ux-harness.mjs (2): TABLET_VIEWPORT, MID_VIEWPORT
- scripts/connections/ratify-flag-to-census.mjs (1): RATIFY_CITE
- scripts/drain/plan-drain.mjs (1): LEASE_LANE
- scripts/entities/backfill-derivation-edges.mjs (2): loadLiveEmissionFactors, loadCandidateSeriesKeys
- scripts/gen/fetch-desnz-factors.mjs (3): AIR_ENERGY_CARRIER, OCEAN_ENERGY_CARRIER, cellNumber
- scripts/lib/absent-tolerant.mjs (1): ABSENT_RE
- scripts/lib/assemble-train.mjs (2): BRANCH_PREFIXES, runGateSet
- scripts/lib/batch-primitives.mjs (1): createPgPool
- scripts/lib/changelog.mjs (1): DETECTED_BY_BY_FIELD
- scripts/lib/deferral.mjs (2): DISPOSITION_PATH_KEYWORDS, normalizeReason
- scripts/lib/exclusion-audit.mjs (1): unreliableIds
- scripts/lib/export-harness-ledger.mjs (1): DEFAULT_OUT_PATH
- scripts/lib/fetch-negative-probe.mjs (1): auditFetchNegative
- scripts/lib/flag-age.mjs (1): STANDING_DEBT
- scripts/lib/funded-pass-lock.mjs (2): LOCK_KEY, STALE_SECONDS
- scripts/lib/r14-held-producer-cli.mjs (1): buildDefectsFromRefusals
- scripts/lib/surface-registry.mjs (1): FETCH_AUDIT_METHOD
- scripts/maintenance/capture-static-primaries.mjs (1): STATIC_TEXT_HOSTS
- scripts/maintenance/close-run-logs.mjs (2): AUTHORSHIP_RUN_SUMMARY_WORDS, CITATION_HARVEST_RUN_SUMMARY_WORDS
- scripts/maintenance/forward-events-retext.mjs (2): DELETE_CITE, IDS_ARG_PREFIX
- scripts/maintenance/host-verdicts/load-host-verdicts.mjs (1): HOST_VERDICT_SOURCE
- scripts/maintenance/lineage-gap-targets.mjs (1): writeArtifactFile
- scripts/maintenance/record-hollow-sweep.mjs (1): TITLE_FACT_PREFIX
- scripts/maintenance/resolve-error-body-gate.mjs (1): DEFAULT_WORKLIST_RELATIVE_PATH
- scripts/maintenance/timeline-backfill.mjs (1): CHANGELOG_CITE
- scripts/mint/heal-provenance.mjs (5): buildCaptureIndex, getCaptureIndex, containsCaseInsensitiveCached, locateSpanInTextIndexed, locateSpanInTextCached
- scripts/mint/screen-worklist.mjs (1): loadRows
- scripts/producers/market/sbti-target-dashboard-producer.mjs (2): StructureError, extractSheetAndSharedStrings
- scripts/producers/registry/load-registry.mjs (1): validateEntry
- scripts/producers/research/research-assessment-producer.mjs (1): COMPUTED_BY
- scripts/proof/applied-map.mjs (4): APPLY_CLASSES, SATISFIED_CLASSES, BY_FILE_APPLY_CLASSES, SKIP_CLASSES
- scripts/proof/attacks/attack-engine.mjs (1): resolveRef
- scripts/proof/export-subset.mjs (6): DEFAULT_ITEMS, GRADES, DEFAULT_EXCLUDE, DEFAULT_RESTRICTED, DEFAULT_FULL_TABLES, DEFAULT_ROW_EXCLUDE
- scripts/proof/preflight.mjs (2): FORBIDDEN_PREFIXES, PRODUCTION_HOST_MARKERS
- scripts/research/research-walker.mjs (2): WALKER_NAME, HOLDINGS_NEED_PER_PAGE
- scripts/spec09/indexation-producer.mjs (1): WORKED_EXAMPLE
- scripts/turns/apply-record-briefs.mjs (2): TERMS_CITE, buildTermWriters
- scripts/turns/dry-run-structured-actions.mjs (1): runDryRun
- scripts/turns/import-stranded-harness-branches.mjs (1): listStrandedBranches
- scripts/turns/io-preflight.mjs (1): SAMPLE_GAP_MS
- scripts/turns/needs-search/data.mjs (2): FLAG_COLUMNS_FULL, satisfiesFor
- scripts/turns/question-answers/schema.mjs (2): ANSWER_STATUS_TOKENS, validateAnswerEntry
- scripts/turns/run-fetch-drain.mjs (2): FETCH_DRAIN_GOVERNING_FILES, repoRelative
- scripts/turns/run-propagation-drain.mjs (1): MAX_REPLAY_RANGE
- scripts/turns/theme-briefs/artifact.mjs (2): DEFAULT_FAMILY_DIR, buildThemeBriefsArtifact
- scripts/verify/defect-signature-scan.mjs (1): WAVE2_CUTOFF [CONFIRMED: listed by the method stated in this section] [CLOSED: PR 1032]
- scripts/verify/lib/duplicate-table-scan.mjs (3): STRUCTURAL_COLUMNS, MIN_SIGNIFICANT_SHARED, SCORE_WEIGHTS
- scripts/verify/lib/rls-adversarial-probe.mjs (2): DENY_SQLSTATE, classifyProbe
- scripts/verify/population-report.mjs (9): DEFAULT_LEDGER_VERDICTS_DIR, DEFAULT_BRIEF_APPLY_HARNESS_RUNS_DIR, countBriefsOwed, FLAG_FAMILY_PREDICATES, countOpenFlagsByFamily, countFetchDrainQueued, describeFetchDrainQueueState, countLegalConfirmationRows, countCoverageReflections
- src/app/api/admin/attention/logic.ts (1): AttentionFetchResult
- src/app/api/admin/sources/[id]/bias-tags/logic.ts (7): ADOPTED_ASSIGNMENT_SOURCE, BiasTagDecision, ValidatedPatch, ValidationResult, BiasTagRow, ActionableResult, AuditEventInput
- src/app/api/listings/rest/logic.ts (1): ListingsPage
- src/components/account/AccountPrimitives.tsx (1): SubTab
- src/components/admin/AdminTableView.tsx (1): AdminStatus
- src/components/admin/corrections/CorrectionForm.tsx (1): CorrectionFormProps
- src/components/admin/corrections/CorrectionRow.tsx (2): RevokeResult, CorrectionRowProps
- src/components/admin/corrections/CorrectionsTab.tsx (1): CorrectionsTabProps
- src/components/admin/corrections/ItemCorrectionsPanel.tsx (1): ItemCorrectionsPanelProps
- src/components/admin/corrections/ItemSearchPicker.tsx (1): ItemSearchPickerProps
- src/components/admin/corrections/types.ts (3): ItemTargetClaim, ItemTargetSection, ItemTargetConnection
- src/components/admin/CoverageMatrixView.tsx (1): CoverageMatrixAction
- src/components/admin/InferenceReview.tsx (1): InferenceReviewProps
- src/components/admin/OrganizationsTable.tsx (1): OrganizationsTableProps
- src/components/admin/ProvenanceFailures.tsx (1): ProvenanceFailure
- src/components/admin/redesign/WorkspacesUsageRow.tsx (1): WorkspacesUsageRowProps
- src/components/auth/AuthPanel.tsx (1): AUTH_FIELD_LABEL_STYLE
- src/components/community/api-client.ts (9): CreatePostInput, CreatePostSuccess, CreatePostFailure, CreatePostResult, EntityThreadsResult, ProfileFetchResult, ProfileFetchFailure, ProfileResult, UpdateProfileInput
- src/components/community/CommunityRooms.tsx (2): LiveItemVM, VerticalGroupVM
- src/components/community/ModerationActions.tsx (1): ModerationAction
- src/components/community/types.ts (1): CommunityRegionCode
- src/components/dashboard/DashboardBrief.tsx (1): DashboardBriefProps
- src/components/dashboard/DashboardMasthead.tsx (1): DashboardMastheadProps
- src/components/detail/DetailShell.tsx (3): DetailRailProps, AtAGlanceRow, MASTHEAD_FIELD_LABELS
- src/components/detail/InferenceSection.tsx (1): InferenceSectionClaim
- src/components/detail/primitives.tsx (1): JurisdictionFields
- src/components/detail/ThemeBriefCard.tsx (1): ThemeBriefCardView
- src/components/figures/EstimatedFigure.tsx (3): EstimatedFigureCompanion, EstimatedFigureProps, DerivedFigureProps
- src/components/figures/NoticesRail.tsx (1): NoticesRailProps
- src/components/figures/RecalculationNotice.tsx (1): RecalculationNoticeProps
- src/components/figures/StatutoryFigure.tsx (1): StatutoryFigureProps
- src/components/home/DashboardWatchlist.tsx (1): DashboardWatchlistProps
- src/components/layout/PageFrame.tsx (2): PageFramePadding, PageFrameProps
- src/components/layout/TopBar.tsx (1): TopBarProps
- src/components/ledger/VirtualizedRowList.tsx (1): VirtualizedRowListProps
- src/components/list-surface/ListSurfaceRailCards.tsx (1): ObligationRailEvent
- src/components/list-surface/ListSurfaceShell.tsx (1): ListSurfaceShellProps
- src/components/list-surface/useListSurfaceFilter.ts (1): ListSurfaceFilterApi
- src/components/market/CarbonCostOverlay.tsx (1): CarbonCostResult
- src/components/market/IndexationPanelView.tsx (1): INDEXATION_CLAUSES_GAP_LINE
- src/components/market/MarketIntelLedger.tsx (1): MarketIntelLedgerProps
- src/components/market/OemRoadmapPanelView.tsx (1): OEM_ROADMAP_GAP_LINE
- src/components/market/ReroutingPanelView.tsx (1): REROUTE_GAP_LINE
- src/components/onboarding/OnboardingStepper.tsx (1): ONBOARDING_STEPS
- src/components/operations/GridQueuePanelView.tsx (1): DECISION_HORIZON_MONTHS
- src/components/operations/LabourChain.tsx (1): LabourChainProps
- src/components/operations/OperationsLedger.tsx (1): OperationsLedgerProps
- src/components/operations/RegionDimensionMatrix.tsx (2): MatrixRegion, MatrixDimension
- src/components/operations/StatementsBlock.tsx (1): StatementsBlockProps
- src/components/profile/NotificationPreferences.tsx (1): NotificationPrefs
- src/components/regulations/ObligationRegisterFilterBar.tsx (1): ObligationItem
- src/components/regulations/PriorityDropdown.tsx (1): PriorityValue
- src/components/regulations/RegulationsLedger.tsx (1): RegulationsLedgerProps
- src/components/research/AssessmentHistoryLedger.tsx (1): AssessmentHistoryLedgerProps
- src/components/research/CredibilityChipAuthority.tsx (1): CredibilityChipAuthorityProps
- src/components/research/CredibilityChipEvidence.tsx (1): CredibilityChipEvidenceProps
- src/components/research/CredibilityChipShared.tsx (2): GradeModifierStatus, GradeModifier
- src/components/research/DissentPanel.tsx (3): DissentingSource, AuthorityDistributionLike, DissentPanelProps
- src/components/research/ResearchLedger.tsx (2): ResearchSourceCoverageCellProp, ResearchLedgerProps
- src/components/research/ResearchThemeCards.tsx (1): ResearchThemeCard
- src/components/research/SignpostList.tsx (1): SignpostListProps
- src/components/search/SearchResultsView.tsx (1): SearchResultsViewProps
- src/components/shared/InferenceClaim.tsx (3): InferenceUse, InferenceVerdict, InferenceClaimProps
- src/components/Sidebar.tsx (1): SidebarProps
- src/components/sources/ProvisionalReviewTable.tsx (2): ProvisionalDecision, ProvisionalReviewTableProps
- src/components/sources/SourceHealthDashboard.tsx (1): SourceHealthDashboardProps
- src/components/sources/SourceTierLegend.tsx (1): TIER_LEGEND_EXAMPLES
- src/components/ui/__fixtures__/list-row-fixture.ts (1): ListRowFixtureRow
- src/components/ui/Absence.tsx (1): ABSENCE_PRECEDENCE
- src/components/ui/ActionCard.tsx (2): ActionCardExposureValue, ActionCardProps
- src/components/ui/ActionRow.tsx (1): ActionRowProps
- src/components/ui/band-context.tsx (1): BandContextValue
- src/components/ui/BandGradientRule.tsx (1): BandGradientRuleProps
- src/components/ui/BandTile.tsx (1): BandTileProps
- src/components/ui/BiasChips.tsx (2): BIAS_ROW_MAX, BIAS_DETAIL_MAX
- src/components/ui/CardFoot.tsx (1): CardFootProps
- src/components/ui/CommandBar.tsx (1): CommandBarProps
- src/components/ui/FactCard.tsx (1): claimAfterHeadline
- src/components/ui/ImpactMeter.tsx (1): ImpactMeterProps
- src/components/ui/ItemGroup.tsx (1): ItemGroupProps
- src/components/ui/Masthead.tsx (1): MastheadProps
- src/components/ui/MilestoneTimeline.tsx (1): MilestoneTimelineProps
- src/components/ui/RailCard.tsx (1): RailCardProps
- src/components/ui/RowTable.tsx (1): RowTableProps
- src/components/ui/SectionCard.tsx (1): SectionCardProps
- src/components/ui/SectionHeader.tsx (1): SectionHeaderProps
- src/components/ui/SectionHeading.tsx (1): SectionHeadingProps
- src/components/ui/SectionIndex.tsx (1): SectionIndexProps
- src/components/ui/SectionRule.tsx (1): SECTION_RULE_GRADIENT
- src/components/ui/StatBlock.tsx (1): StatBlockProps
- src/components/ui/StateNote.tsx (1): StateNoteProps
- src/components/ui/TabRow.tsx (1): TabRowProps
- src/components/ui/TagPopover.tsx (1): TagPopoverProps
- src/components/ui/Timeline.tsx (1): TimelineProps
- src/components/watchlist/WatchlistSurface.tsx (1): WatchlistSurfaceProps
- src/components/workspace/ArchiveDialog.tsx (1): ArchiveImpact
- src/lib/admin/member-display-name.ts (2): MemberProfileFields, MemberWithProfile
- src/lib/admin/provisional-review-queue.ts (1): ProvisionalReviewStatus
- src/lib/agent/audit-gate.ts (4): ItemCrossItemMetrics, BlockRow, CrossItemAuditResult, DATA_AUDIT_BLOCK
- src/lib/agent/extract-sections.ts (3): ExtractedSection, OperationalBriefing, SeverityLabel
- src/lib/agent/formats/operations-matrix.ts (4): OperationsDimension, ALL_OPERATIONS_DIMENSIONS, DimensionEligibility, OperationsItemForGate
- src/lib/agent/formats/prose-extractor.ts (1): makeProseExtractor
- src/lib/agent/generation-config.ts (4): SONNET_INPUT_USD_PER_MTOK, SONNET_OUTPUT_USD_PER_MTOK, HAIKU_INPUT_USD_PER_MTOK, HAIKU_OUTPUT_USD_PER_MTOK
- src/lib/agent/ground-failure-class.mjs (2): DETERMINISTIC_GROUND_FAILURES, STRUCTURAL_GROUND_FAILURES
- src/lib/agent/parse-record-sections.ts (2): RecordClaimKind, ParsedRecordSections
- src/lib/agent/slot-forcing.mjs (1): MAX_NOMINATION_SPAN
- src/lib/agent/slot-prompt.mjs (2): slotCovered, DEFAULT_SLOT_TTL_MS
- src/lib/agent/source-blocks.mjs (1): STANDARDS_BODY_TIER
- src/lib/agent/two-pass-generate.mjs (2): GEN_MAX_TOKENS, YAML_MAX_TOKENS
- src/lib/auth/route-policy.ts (4): PUBLIC_ROUTES, SCANNER_PROBE_PREFIXES, RouteDecision, RouteDecisionInput
- src/lib/classification/scope.mjs (1): TOPIC_KEYWORDS
- src/lib/connections/intersections.mjs (3): POINTS, TIER_MIN, canonicalJson
- src/lib/connections/resource-lookup.ts (1): ResourceLookup
- src/lib/connections/term-needs.mjs (1): LINEAGE_NEED_RULE
- src/lib/connections/term-recurrence.mjs (1): ENTITY_LINK_ACTION
- src/lib/constants.ts (6): TOPICS, AUTHORITY_LEVELS, PRIORITIES, InfoType, LIFECYCLE_STAGES, SHARE_LEVELS
- src/lib/contracts/factor-tier.mjs (7): SCOPE_KINDS, SCOPE_CODES, QUANTITY_BASIS, GWP_BASIS, isApplicableOn, renderTierConstraintsSql, renderEnvelopeColumnsSql
- src/lib/contracts/source-licence.mjs (1): renderDataSourceSeedSql
- src/lib/corrections/item-corrections.mjs (1): TARGET_KINDS
- src/lib/coverage/index-data.ts (4): RelevanceBand, CoverageCounts, CoverageIndexResult, getCoverageIndex
- src/lib/customer-source-tier.ts (1): SourceTierColumns
- src/lib/dashboard/surface-coverage.ts (1): IntelligenceSurfaceCounts
- src/lib/data.ts (13): getMapData, getAwaitingReview, getSurfaceCounts, ResearchPipelineResult, getResearchPipeline, getPublicResearchPipeline, getScopedWorkspaceAggregates, getMarketIntelItems, getResearchItems, getOperationsItems, getTechnologyItems, SourceCitationStatsMap, getSourceCitationStats
- src/lib/detail/action-card-fixtures.ts (1): ActionCardFixture
- src/lib/detail/fact-card-model.ts (2): FactCardKind, FactCardProvenance
- src/lib/detail/fact-paragraphs.ts (2): FactParagraphKind, ParsedSource
- src/lib/detail/id-redirect.ts (3): ITEM_UUID_RE, IdRedirectDecision, IdRedirectViolation
- src/lib/detail/item-id-filter.ts (1): ItemIdColumn
- src/lib/detail/load-detail-core.ts (4): DetailSourceItem, LoadDetailCoreConfig, ClaimTierSourceRowLike, ClaimTierRowLike
- src/lib/detail/load-detail.ts (2): LoadDetailConfig, DetailResult
- src/lib/detail/requirement-trajectory-classify.ts (1): RequirementTrajectoryStepLike
- src/lib/detail/section-index-fixtures.ts (1): SectionIndexBodyFixture
- src/lib/detail/timeline-math.ts (3): TimelineHeaderCounts, CollapsedTimeline, ObligationEventLike
- src/lib/email/send-invitation-email.ts (2): InvitationEmailParams, InvitationEmailResult
- src/lib/entities/corridor-scope.ts (3): ParsedCorridorName, CorridorJurisdiction, InstrumentRef
- src/lib/entities/lineage-backfill.mjs (1): appendBasis
- src/lib/entities/source-role.mjs (1): PRIMARY_URL_RE
- src/lib/health/gate-a-gauges.mjs (1): INFO_GAUGES
- src/lib/hooks/useAdminAttention.ts (2): AdminAttentionCounts, UseAdminAttention
- src/lib/hooks/useNearestScrollParent.ts (1): ScrollParentResult
- src/lib/hooks/useWorkspaceBootstrap.ts (6): BootstrapPersonalStateItem, BootstrapMember, BootstrapAdminAttention, BootstrapOverrideRow, WorkspaceBootstrapData, UseWorkspaceBootstrap
- src/lib/intake/mint-enrichment.ts (1): MintItemSignature
- src/lib/intake/pool-row-contract.mjs (1): POOL_ROW_FIELDS
- src/lib/intake/write-item.ts (9): GateAClaimInput, GateARow, MintOutcome, MintPayload, AgentRunSearchRow, GuardedInsertResult, GuardedInsertManyResult, WriteGroundingSequenceDeps, WriteGroundingSequenceResult
- src/lib/jurisdictions/iso.ts (1): KnownFreeTextJurisdiction
- src/lib/learning/prediction-scoring.mjs (3): GROUNDING_CLAIM_KINDS, STATE_READ_CAP, toSignpostRow
- src/lib/list-pagination.ts (1): ListingCursor
- src/lib/llm/haiku-classify.ts (4): HaikuVerifyCandidateInput, HaikuVerifyClassification, HaikuVerifyResult, ClassifyOutput
- src/lib/llm/metered-gate.mjs (2): FREE_ONLY_CLASSES, SCOPED_CLASS_AMENDMENTS
- src/lib/llm/spend-regime.mjs (2): IS_BUILD_PHASE, SpendRegimeError
- src/lib/map/jurisdiction-rollup.ts (1): jurisdictionKeysInBand
- src/lib/market/series-family.mjs (2): UNREGISTERED_FAMILY_CLASS, familyClassForSeriesKey
- src/lib/notifications/dispatch.ts (1): DispatchArgs
- src/lib/operations/labour-chain.ts (5): ChainTermValue, ChainTermKey, CHAIN_TERM_LABELS, LabourChainInput, LabourChainResult
- src/lib/operations/region-grid.mjs (1): FIGURE_MAX_CHARS
- src/lib/orgs/create-org.mjs (2): MAX_ORG_NAME, MAX_JOB_TITLE
- src/lib/profile/profile-contract.mjs (1): COMPLIANCE_OBJECT_TO_ORG_ROLE
- src/lib/propagation/methods/infer-from-question.ts (7): InferenceMethodResult, PriorInferenceRow, InferenceMethodFn, InferenceRpcClient, RegisterInferenceRecordInput, FirstInferenceArgs, ReopenQuestionDeps
- src/lib/propagation/methods/signpost-watch.ts (3): SignpostPredicate, SignpostRow, FireSignpostResult
- src/lib/propagation/methods/superseded-notices.ts (1): NoticesQueryBuilder
- src/lib/propagation/register-derivation.ts (2): RpcClient, RegisterDerivedValueInput
- src/lib/propagation/statutory-rows.ts (1): WriteOneRowResult
- src/lib/regulation-item-types.ts (1): REGULATION_ITEM_TYPES
- src/lib/research/theme-brief.mjs (1): MAX_CHIP_MEMBER_LINKS
- src/lib/scoring.ts (2): SectorContext, matchResourceSector
- src/lib/sources/bias-tag-pipeline.mjs (1): LOW_CONFIDENCE_THRESHOLD
- src/lib/sources/fetch-quality.ts (1): BriefContentCheck
- src/lib/sources/holdings-audit.mjs (4): STUB_MAX_BYTES, FURNITURE_MIN_BYTES, FURNITURE_MAX_CLEAN, FURNITURE_MAX_RATIO
- src/lib/sources/instrument-identity.ts (3): InstrumentType, ParsedIdentity, INSTRUMENT_BEARING_ITEM_TYPES
- src/lib/sources/officialness.mjs (1): LINK_DENSITY_MAX
- src/lib/sources/primary-fallback.mjs (1): MIN_LANG_RATIO
- src/lib/sources/promote-provisional.ts (3): ProvisionalRowInput, PromotedSourceRow, BuildPromotedSourceRowOpts
- src/lib/sources/recommend-source-tier.ts (1): SourceTierRecommendation
- src/lib/sources/register-walk.mjs (1): ojActLinksOnly
- src/lib/sources/seek-more.mjs (1): GAZETTE_RESOLVERS
- src/lib/sources/sitemap-walk.mjs (1): extractHttpStatus
- src/lib/sources/tier-override-guard.mjs (1): TIER_OVERRIDE_COLUMN
- src/lib/sources/transport-escalation.mjs (5): NOT_FOUND_CLASSES, BLOCK_CLASSES, isOk, isCaptureFailure, hasApiTransport
- src/lib/sources/verify-item.mjs (1): ACQUIRE_JUSTIFICATIONS
- src/lib/sources/vertical-fit.ts (1): InstitutionalType
- src/lib/statutory/types.ts (2): FormulaId, FuelEuAnnexIvInputs
- src/lib/tags/useWorkspaceTagsFacet.ts (1): WorkspaceTagsFacet
- src/lib/tier1-priority-jurisdictions.ts (1): PriorityJurisdiction
- src/lib/watchlist/membership.ts (3): WatchMembershipDeps, WatchMembershipParams, ClientWatchMembershipOptions
- src/stores/resourceStore.ts (2): WorkspaceOverride, StoredChange
- src/types/resource.ts (4): ImpactReasoning, OperationalImpact, RiskRegisterEntry, SourceReference
- src/workflows/generate-brief.ts (10): preflightStep, registerStep, sectionStep, groundStep, auditBaselineStep, auditGateStep, recordAuditGateFailureStep, reresearchStep, revalidateItemStep, GenerateBriefResult

### 2c. B test-only (2291 symbols in 538 files)

- .discipline/consistency/checks/C4-worktrees-reality.mjs (1): isEphemeralWorktreePath
- .discipline/consistency/override-check.mjs (4): parseDriftCheckIds, parseValidOverrides, messagesForRange, messagesFromPrepushStdin
- .discipline/dispatch/start.mjs (1): mintUuid
- .discipline/fitness/functions/F13-single-mint-chokepoint.mjs (2): isMintBypass, fitnessFunction
- .discipline/fitness/functions/F14-producer-consumer-orphan.mjs (1): fitnessFunction [CONFIRMED: listed by the method stated in this section] [WORK: DEAD-1c]
- .discipline/fitness/functions/F15-spend-chokepoint.mjs (4): SANCTIONED, LEGACY_ALLOWLIST, directApiCallLines, fitnessFunction
- .discipline/fitness/functions/F16-transport-hold-gate.mjs (5): PRIMITIVE, HOLD_GATE_CORE, TRANSPORT_MODULES, SANCTIONED, fitnessFunction
- .discipline/fitness/functions/F17-size-cap-doctrine.mjs (3): PATH_FILES, CAP_REGISTRY, fitnessFunction
- .discipline/fitness/functions/F18-one-url-canonicalizer.mjs (2): findAdHocUrlNormalizers, fitnessFunction
- .discipline/fitness/functions/F19-no-service-anon-downgrade.mjs (2): findServiceAnonDowngrade, fitnessFunction
- .discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.mjs (1): fitnessFunction
- .discipline/fitness/functions/F20-pause-flag-one-writer.mjs (1): fitnessFunction
- .discipline/fitness/functions/F21-single-grounding-entry.mjs (3): SANCTIONED, groundingEntryLines, fitnessFunction
- .discipline/fitness/functions/F22-source-role-at-birth.mjs (3): LEGACY_ALLOWLIST, isRolelessSourceInsert, fitnessFunction
- .discipline/fitness/functions/F23-governed-surface-coverage.mjs (3): GAP_BASELINE, compareToBaseline, fitnessFunction
- .discipline/fitness/functions/F24-db-object-migration-home.mjs (8): NO_MIGRATION_HOME, NET_EGRESS_SANCTIONED, CRON_SANCTIONED, BROKEN_REF_ALLOWLIST, stripSqlComments, hasMigrationHome, auditCatalog, fitnessFunction
- .discipline/fitness/functions/F25-module-liveness.mjs (5): parseBoundaryRegistryPaths, LEGACY_ALLOWLIST, findUnimported, auditLiveness, fitnessFunction
- .discipline/fitness/functions/F26-storage-ceiling-parity.mjs (7): NEXT_CONFIG, WORKER, ENV_NAME, LOUD_MARKERS, readCeiling, auditCeilingParity, fitnessFunction
- .discipline/fitness/functions/F27-producer-seam-proof.mjs (6): isSeamScope, extractSeams, isProducerEntryPoint, SEAM_EXEMPTIONS, auditSeamCoverage, fitnessFunction
- .discipline/fitness/functions/F28-harness-run-integrity.mjs (6): scanArtifacts, auditSchema, auditPendingRange, auditPendingTreeState, safeHashGoverningFiles, fitnessFunction
- .discipline/fitness/functions/F30-entity-spine.mjs (6): PATTERNS, BASELINE_COUNTS, stripComments, countPatterns, compareToBaseline, fitnessFunction
- .discipline/fitness/functions/F31-derived-values-gate.mjs (5): SANCTIONED_DIR_PREFIX, DERIVED_VALUES_FROM_RE, isSanctioned, derivedValuesReadLines, fitnessFunction
- .discipline/fitness/functions/F32-statutory-purity.mjs (4): NON_CONTRACTABLE_DERIVATIONS, assertStatutoryPurity, checkTriggerPresence, fitnessFunction
- .discipline/fitness/functions/F33-surface-acceptance.mjs (5): SPEC_SURFACES, invertToForward, isReachable, auditSurfaceAcceptance, fitnessFunction
- .discipline/fitness/functions/F34-bundle-safe-module-evaluation.mjs (3): ALLOWLIST, findModuleScopeFsCalls, fitnessFunction
- .discipline/fitness/functions/F35-row-ux-coverage.mjs (8): ROW_COMPONENTS, stripComments, activeSpecFiles, specMounts, TITLE_DELEGATES, delegatesTitle, uncoveredComponents, fitnessFunction
- .discipline/fitness/functions/F36-date-format-timezone-pin.mjs (4): isClientComponent, findUnpinnedDateCalls, PRE_EXISTING_ALLOWLIST, fitnessFunction
- .discipline/fitness/functions/F37-perf-budget.mjs (2): checkRegistry, fitnessFunction
- .discipline/fitness/functions/F38-unbounded-supabase-read.mjs (4): ALLOWLIST, collectConstNumbers, findOversizedLimitCalls, fitnessFunction
- .discipline/fitness/functions/F39-unbounded-in-filter.mjs (3): isBoundedArgShape, findUnboundedInCalls, fitnessFunction
- .discipline/fitness/functions/F40-authed-api-fetch.mjs (5): BEARER_BUILDER_ALLOWLIST, guardedRoutes, stripComments, matchesGuardedRoute, fitnessFunction
- .discipline/fitness/functions/F41-dead-media-query-class.mjs (3): mediaBlocks, classNamesRendered, fitnessFunction
- .discipline/fitness/functions/F42-card-shell-outside-section-card.mjs (4): WINDOW, cardShellLines, isMarked, fitnessFunction
- .discipline/fitness/functions/F43-default-open-disclosure.mjs (4): lineOf, isAllowed, findDefaultOpenSites, fitnessFunction
- .discipline/fitness/functions/F44-broken-main-guard.mjs (2): findBrokenMainGuards, fitnessFunction [CONFIRMED: listed by the method stated in this section] [WORK: DEAD-1c]
- .discipline/fitness/functions/F45-duplicate-code.mjs (12): WINDOW, normalizeLines, detectClones, scanTree, matchesScopeGlobs, parseCatFileBatch, measureAtBase, evaluateRatchet, fitnessFunction, ignoredFiles, isIgnored, resetIgnoredCache
- .discipline/fitness/functions/F46-external-host-home.mjs (7): REFERENCE_FILES, HOST_HOMES, MULTI_HOME_CEILING, hostsByFile, evaluate, scanTree, fitnessFunction
- .discipline/fitness/functions/F47-db-object-reference.mjs (5): ALLOWLIST, UNREFERENCED_TABLES_CEILING, UNREAD_TABLES_CEILING, scanTree, fitnessFunction
- .discipline/fitness/functions/F48-env-file-load-guarded.mjs (7): ENV_FILE_HOME, findBareEnvLoads, findUnswitchedCredentialStrips, findAmbientCredentialAssertions, inScope, inTestScope, fitnessFunction
- .discipline/fitness/functions/F49-parts-not-pages.mjs (4): WINDOW, literalHits, isMarked, fitnessFunction
- .discipline/fitness/functions/F50-loop-wiring.mjs (5): familyFiredStatus, readFiredEvidence, fitnessFunction, extractWorkflowRunNames, hasWorkflowRunEdge
- .discipline/fitness/functions/F51-no-shared-append.mjs (21): underEntryDir, scanHandEntries, ZERO_CEILING_ALLOWLIST, scanStoredMeasurements, findDuplicateIds, runCheck1, runCheck2, runCheck3, MIGRATION_DUPLICATE_ALLOWLIST, evaluateIdDuplicates, runCheck4, HOTSPOT_ALLOWLIST, countHotspots, parseFirstParentLog, parseFirstParentLogDetailed, HOTSPOT_WINDOW_ANCHOR_COMMIT, resolveForkPoint, classifyConcurrency, evaluateConcurrencyViolations, runCheck5, fitnessFunction
- .discipline/fitness/functions/F52-workflow-file-validity.mjs (9): listWorkflowAndActionFiles, extractJobs, jobPropertyLines, extractBlockEntries, parseNeedsIds, stepIdsInJob, stepOutputReferencesInJob, stepRunBlocks, fitnessFunction
- .discipline/fitness/functions/F54-push-gate-npm-parity.mjs (12): listJobKeys, jobContinuesOnError, evaluateNoNpmSuiteParity, extractJobBlock, extractSteps, stepWorkingDirectory, stepRunText, extractScriptInvocations, isCandidateTestStep, evaluateStepParity, EXEMPT_STEPS, fitnessFunction
- .discipline/fitness/functions/F57-impact-meter-no-full-variant.mjs (2): findFullVariantMounts, fitnessFunction
- .discipline/fitness/functions/F58-no-standalone-obligations-strip.mjs (2): findDetailVariantMounts, fitnessFunction
- .discipline/fitness/functions/F59-dep-path-resolved.mjs (2): findHardcodedDepPaths, fitnessFunction
- .discipline/fitness/functions/F6-migrations-numeric-ordering.mjs (1): fitnessFunction
- .discipline/fitness/functions/F60-workflow-run-chain-depth.mjs (1): fitnessFunction
- .discipline/fitness/functions/F61-chained-dry-guard-wired.mjs (2): hasMasterBatchPush, fitnessFunction
- .discipline/fitness/functions/F62-no-css-var-concat.mjs (2): findCssVarConcat, fitnessFunction
- .discipline/fitness/functions/F63-migration-applied-status.mjs (10): stripSqlComments, extractHeaderBlock, extractSubjectLine, parseHeaderStatus, extractTableOps, auditStatusAgainstLiveSchema, findLatestLiveSchemaFile, _resetLiveSchemaCache, _resetDroppedElsewhereCache, fitnessFunction
- .discipline/fitness/functions/F64-rls-admin-gate-class.mjs (9): findCreateTables, hasRlsEnableAnywhere, RLS_ENABLE_ALLOWLIST, checkRlsEnableGap, findCreatePolicies, looksLikeOrgMembershipsAdminCheck, ADMIN_GATE_PREEXISTING_ALLOWLIST, checkAdminGateClass, fitnessFunction
- .discipline/fitness/functions/F65-no-bracket-path-tests.mjs (4): isGovernedTestPath, hasBracketChar, findBracketPathTests, fitnessFunction
- .discipline/fitness/functions/F66-clock-fragility.mjs (6): stripComments, stripStrings, splitIntoTestBlocks, inScope, findClockFragileAssertions, fitnessFunction
- .discipline/fitness/functions/F67-unguarded-main-invocation.mjs (2): findUnguardedMainInvocations, fitnessFunction
- .discipline/fitness/functions/F68-actions-artifact-budget.mjs (4): listWorkflowFiles, extractUploadArtifactSteps, evaluateArtifactBudget, fitnessFunction
- .discipline/fitness/functions/F69-model-id-literal.mjs (3): CANONICAL_HOME, SECURITY_ALLOWLIST_FILES, fitnessFunction
- .discipline/fitness/functions/F8-client-server-tier-boundary.mjs (1): fitnessFunction
- .discipline/fitness/functions/F9-build-compiles.mjs (2): fitnessFunction, _findTsc
- .discipline/fitness/lib/selftest-spawn.mjs (2): SELFTEST_DEP, missingDepReason
- .discipline/governance/closure-gate.mjs (22): parseTrainCommits, parseMaintenanceSteps, isDispatchable, hasRunEvidence, checkNeverRun, findNextRows, hasOwningTrain, checkStaleNext, migrationNumber, checkWriterReader, LANE_CONTRACT_MARKER, checkLaneContract, assembleRunbookCorpus, runbookHasRecord, NEVER_RUN_ALLOWLIST, STALE_NEXT_ALLOWLIST, WRITER_READER_ALLOWLIST, runNeverRunLive, runStaleNextLive, runWriterReaderLive, runLaneContractLive, runClosureGate
- .discipline/governance/coverage-scan.mjs (2): stripComments, classify
- .discipline/governance/db-object-reference.mjs (2): functionSqlReferences, tableSqlReferences
- .discipline/governance/docs-only-range.mjs (2): isDocsOnlyPath, isDocsOnlyDiff
- .discipline/governance/doctrine-contradiction.mjs (2): GATE_RE, VISIBILITY_RE
- .discipline/governance/generated-files.mjs (2): findGeneratedEntry, renderGenerated
- .discipline/governance/invariant-coverage.mjs (4): auditInvariants, auditMarkerBaselines, auditDoctrines, runInvariantCoverage
- .discipline/governance/invariants.mjs (2): compareInvariantIds, loadInvariantsFromDir
- .discipline/governance/loop-manifest.mjs (3): loadLoopHops, PRODUCER_FAMILY_BY_WORKFLOW_FILE, LOOP_HOPS_DIR
- .discipline/governance/memory-gate.mjs (4): classifyChanged, memoryGateVerdict, uxGateVerdict, memoryDiffPaths
- .discipline/governance/orphan-modules.mjs (2): findOrphanModules, findDeadExports [CONFIRMED: listed by the method stated in this section] [WORK: DEAD-1c]
- .discipline/governance/secrets-reference-audit.mjs (1): auditSecretRefs
- .discipline/governance/skill-contract-map.mjs (9): PINNED_MANIFEST, listSkillSlugs, resolveSkillPath, extractCitedSlugs, scanCitations, checkManifestDrift, parseSkillAck, checkRangeAcks, checkDrift
- .discipline/governance/skill-token.mjs (1): skillLoadedInTranscript
- .discipline/governance/worktree-isolation.mjs (5): isMainCheckout, isAgentContext, branchLooksAgentOwned, evaluateCheckout, evaluateCommit
- .discipline/install-hooks.mjs (2): buildTrampoline, installHooks
- .discipline/lib/context.mjs (2): _clearRepoRootCache, parseAddedLineTexts
- .discipline/lib/no-npm-sandbox.mjs (1): isCheckoutNodeModules
- .discipline/lib/predicates.mjs (1): _matchesPattern
- .discipline/lib/read-migration-sql.mjs (1): normalizeEol
- .discipline/lib/test-discovery.mjs (2): NAMED_SOURCES_SELFTESTS, discoverFromLsFilesOutput
- .discipline/rendering/assertions.mjs (6): isHorizontalOverflow, PLACEHOLDER_LITERALS, hydrationAgrees, cellExceedsContainer, rectsOverlap, isNowIndependent
- .discipline/rendering/audit/normalise.mjs (3): normaliseColours, normaliseNumbers, emToPx
- .discipline/rendering/exemptions-law2-desktop.mjs (1): viewportOf
- .discipline/rendering/fixtures.mjs (3): stripSourcesSectionPreFix, markdownToHtml, BRIEF_WITH_SOURCES_ARTIFACT
- .discipline/rendering/layout-guard/baseline.mjs (7): today, isExpired, baselineAgeNotice, WARNING_WINDOW_DAYS, warningWindowStart, needsRenewal, loadBaseline
- .discipline/rendering/layout-guard/manifests.mjs (1): activeDeviations
- .discipline/rendering/layout-guard/rules.mjs (14): checkL1, checkL2, checkL3, checkL4, checkL5, checkL6, checkL7, checkL8, isL9DesktopExempt, checkL9, checkL10, checkL11, checkL12, checkL13
- .discipline/rendering/layout-guard/run-layout-guard.mjs (3): formatFinding, measureAllRoutes, runLayoutGuardFor
- .discipline/rendering/live/live-assertions.mjs (9): KNOWN_TAG_SLUGS, findMarkerTexts, findPlaceholderTexts, findRawTagSlugs, findBareScores, findTiersAboveCeiling, findLegendsBelowCeiling, findAdminLinks, judgeAdminProbe
- .discipline/rendering/live/live-preflight.mjs (1): ALLOWED_HOSTS
- .discipline/rendering/overflow-rule.mjs (2): OVERFLOW_ALLOW_ATTRS, NARROW_VIEWPORT_MAX_PX
- .discipline/rendering/smoke/harness.mjs (2): isDeclaredKindWord, isDeclaredColumnLabel
- .discipline/rendering/smoke/smoke-fixtures.mjs (2): fontFaceCss, REQUIRED_FONT_CHECKS
- .discipline/rendering/ux-assert.mjs (7): TARGET_MIN_PX, TARGET_SMALL_MIN_PX, TARGET_CLEARANCE_PX, TITLE_MIN_RATIO, detectSmallTargets, detectSqueezedTitles, detectClippedOverflow
- .discipline/rules/012-hardcoded-user-path.mjs (1): _HARDCODED_PATH_RE
- .discipline/rules/015-row-mutation-guarded-path.mjs (5): RECEIVER_NAMES, CLIENT_FACTORIES, maskNonCode, receiverChain, rawWriteHits
- .discipline/rules/021-cached-shape-key.mjs (3): computeShapeKey, _SHAPE_FILE, _CONSUMER_FILE
- .discipline/rules/022-no-dash-glyphs.mjs (2): _GLYPH_RE, _MARKER
- scripts/_ruling/null-tier-host-ruling.mjs (1): RULING
- scripts/backfill-item-timelines.mjs (1): resolveTimelineEntriesForItem
- scripts/classification/apply-classifications.mjs (19): RATIFY_CLASSIFICATION_TOKEN, hasRatifyClassificationToken, extractProposalsFromDescription, evaluateApplication, buildMergePatch, applyClassification, AUTO_ADOPT_FIELDS, isAutoAdoptableProposal, partitionProposals, decideClassificationProposal, decideScopeTopicsProposal, decideClassificationProposals, buildAdoptedProposalsForMerge, deriveClassTableCandidates, DRIFT_MIN_ITEMS, DRIFT_MIN_DISTINCT_DATES, countDistinctDates, decideDriftResolution, ANOMALY_RETIRED_NOTE
- scripts/classification/propose-classifications.mjs (6): DRIFT_THRESHOLD_POINTS, parseArgs, buildNoDerivableClassificationFlagRow, buildClassificationFlagRow, buildDriftFlagRow, groupItemsBySource
- scripts/connections/apply-tags.mjs (11): extractProposalsFromDescription, partitionByConfidence, buildAutoAdoptionNote, TAG_EVIDENCE_TEXT_FIELDS, itemOwnText, evidencePresentInItemText, decideTagProposal, decideTagProposals, buildMergePatch, planDiscoveryForItem, buildReDeriveInput
- scripts/connections/discover-for-items.mjs (2): parseArgs, selectTargets
- scripts/connections/generate-theme-brief.mjs (5): runTheme, parseBriefPayload, validateAgainstLiveMembers, isStructuredPayload, runWrite
- scripts/connections/propose-tags.mjs (5): parseArgs, isEmptySignature, selectTargets, buildNoDerivableFlagRow, buildFlagRow
- scripts/connections/raise-term-needs.mjs (3): STEP, RESOLVE_NOTE, main
- scripts/connections/ratify-flag-to-census.mjs (5): RATIFY_TOKEN, parseRatificationNote, evaluateRatification, buildCensusRow, ratifyFlag
- scripts/connections/term-recurrence.mjs (4): STEP, CITE, main, buildDeps
- scripts/drain/artifact.mjs (1): buildDrainRun
- scripts/drain/plan-drain.mjs (9): PLAN_SCHEMA, LEASE_STALE_SECONDS, earliestPending, orderKinds, planDrain, releasePlanLeases, parseArgs, defaultRunId, runExporter
- scripts/drain/resolve-push-batch.mjs (4): selectBatchFiles, decideBatch, changedPaths, parseArgs
- scripts/entities/backfill-derivation-edges.mjs (1): runBackfill
- scripts/entities/backfill-entities.mjs (9): distinctNormalized, planOrganisationEntities, planOrganisationFkUpdates, runJurisdiction, runInstrument, runOrganisation, planJurisdictionRefs, planInstrumentEntities, planInstrumentFkUpdates
- scripts/entities/seed-corridors.mjs (11): CITE, ADR_EXAMPLE_CORRIDORS, NAMED_CORRIDOR_SEEDS, FALLBACK_CORRIDOR_SEEDS, parseCorridorConvention, deriveCorridorCandidatesFromMarketSeries, deriveCorridorCandidatesFromRegionalFacts, deriveCorridorCandidatesFromItemJurisdictions, resolveCorridorCandidates, planCorridorEntities, planDisplayNameBackfill
- scripts/entities/write-entity-scope.mjs (6): RELATION_CORRIDOR_JURISDICTION, ATTRIBUTED_BY, CITE, parseCorridorCanonicalName, deriveCorridorJurisdictionCodes, planCorridorJurisdictionScope
- scripts/forward-events/run-extraction.mjs (5): FORWARD_EVENTS_GOVERNING_FILES, loadCorpus, itemId, runExtraction, buildRunArtifact
- scripts/gen/assumption-register-common.mjs (4): naturalKey, validateAssumptionRow, buildRow, validateAll
- scripts/gen/emission-factors-common.mjs (3): naturalKey, buildRow, validateAll
- scripts/gen/emission-factors-desnz.mjs (1): splitPending
- scripts/gen/fetch-desnz-factors.mjs (11): SHEET_NAME, GOV_UK_PAGE_URL, FALLBACK_XLSX_URL, DesnzStructureError, findHeaderBlocks, GROUP_TITLE_SELECTION_TABLE, TARGETS, extractFreightingGoodsRows, applyToFixture, resolveXlsxUrl, parseArgs
- scripts/harness-runs/append-dispatch-ledger.mjs (2): buildLedgerRow, appendLedgerRow
- scripts/harness-runs/family-registry.mjs (2): FamilyDescriptorError, validateFamilyDescriptor
- scripts/health/gate-a-probe.mjs (1): runProbe
- scripts/inventories/generate-migrations-inventory.mjs (1): escapeForTableCell
- scripts/lib/admin-phrase-scan.mjs (1): isAllowlisted
- scripts/lib/assemble-train.mjs (15): BRANCH_PREFIX_TO_WORKFLOW, git, listArtifactBranches, branchFiles, isAlreadyFolded, foldArtifactBranches, findFamiliesNeedingProposerPass, writeProposerBrief, deriveLedgerRowsForBranch, appendDispatchLedgerRows, bundleCommand, classifyBranches, pruneDeadBranches, findTrainLandingDates, findStaleUnfoldedBranches
- scripts/lib/batch-primitives.mjs (6): withRetry, isGenericRetryable, isAnthropicRetryable, isPgRetryable, withRateLimit, withIdempotency
- scripts/lib/chained-dry-guard.mjs (4): resolveChainedRunMode, isMergeRef, readScrapeCadence, parseArgs
- scripts/lib/changelog.mjs (4): IMPACT_LEVEL_BY_SEVERITY, DEFAULT_IMPACT_LEVEL, impactLevelForSeverity, detectedByForField
- scripts/lib/decision-anchors.mjs (4): VERDICT, LOUD, resolveVerdict, TRIGGERS
- scripts/lib/deferral.mjs (2): isValidRenewal, assertValidRenewal
- scripts/lib/exclusion-audit.mjs (4): EXCLUSION_SURFACES, mapMethod, crossProduct, describe
- scripts/lib/export-harness-ledger.mjs (2): buildLedgerExport, runCli
- scripts/lib/flag-age.mjs (2): isRd28Held, classifyOpenFlag
- scripts/lib/free-pass.mjs (1): MIN_REATTRIB_SPAN
- scripts/lib/inconclusive-probe.mjs (3): findClassifyDefaults, findErrorBodyContent, findOrchestrationMishandling
- scripts/lib/liveness.mjs (4): LIVENESS, assessLiveness, latestRunAtMs, consumerView
- scripts/lib/run-artifact.mjs (4): formatRunListing, listFamiliesSummary, resolveRunIdArg, loadRunArtifactJSON
- scripts/lib/surface-registry.mjs (2): matchesGlob, classifyPath
- scripts/lib/upstream-artifact.mjs (8): HARNESS_RUN_READ_COLUMNS, APPLY_EVIDENCE, decideChainGate, readUpstreamArtifact, makeRestRowReader, NOOP_FAMILIES, buildNoopArtifact, runCli
- scripts/lib/verify.mjs (4): VERDICT, assertReadBack, fetchOk, observeFired
- scripts/maintenance/apply-classifications.mjs (3): CITE, main, buildRealDeps
- scripts/maintenance/attach-found-sources.mjs (8): CITE, isWorklistRowReady, partitionWorklist, filterWorklistRows, groupWorklistByItem, countGroundedViaWorklist, main, parseExtraCliArgs
- scripts/maintenance/backfill-format-type.mjs (4): planFormatTypeBackfill, parseBatchArgs, main, buildDeps
- scripts/maintenance/canonical-autoverify.mjs (15): makeCanonicalFetchCandidate, isDeadStatus, classifyReachability, previousWallAttempts, classifyPageClass, significantWords, wordsOverlapLocated, phraseLocated, institutionNameCandidates, institutionLocated, proveContent, linkedCurrentTier, checkAuthority, decideRow, main
- scripts/maintenance/canonical-key-dedup.mjs (10): groupByCanonicalKey, decideKeeper, planSelection, buildArchivePatch, buildKeeperPatch, buildKeeperRestoreSql, pickLatestPriorStates, buildRestorePatchFromPrior, buildRestoreSql, main
- scripts/maintenance/capture-static-primaries.mjs (19): CITE, REG_FAMILY_ITEM_TYPES, isStaticTextHost, htmlToText, deriveCelexTxtHtmlUrl, deriveCellarUrl, headersFor, classifyCaptureOutcome, maxPoolLenByItem, partitionByPoolState, buildRow, buildRoadblockSummaryFlag, computeHostWaitMs, paceHost, makeDirectFetch, parseIdsArg, main, buildDeps, CELLAR_CELEX_PREFIX
- scripts/maintenance/census-off-vertical.mjs (4): ARCHIVE_REASON, CITE, sampleWithTitles, main
- scripts/maintenance/close-acquire-primaries-holds.mjs (5): CREATED_BY, RESOLVED_BY, RESOLUTION_NOTE, planClosure, main
- scripts/maintenance/close-coverage-reflections.mjs (4): RESOLVED_BY, RESOLUTION_NOTE, planClosure, main
- scripts/maintenance/close-flags-for-verified-items.mjs (7): PER_ITEM_VERIFIED_SUPERSEDE_FAMILIES, RESOLVED_BY, buildResolutionNote, buildArchivedResolutionNote, archivedDateIso, planClosure, main
- scripts/maintenance/close-legal-confirmation-rows.mjs (7): AUTHORSHIP_RESOLVED_BY, AUTHORSHIP_RESOLUTION_NOTE, LEGACY_REMEDIATION_DEFERRAL, DEFERRAL_CREATED_BY, planLegalConfirmation, buildDeferralFlagRow, main
- scripts/maintenance/close-run-logs.mjs (11): CITE, RESOLVED_BY, RESOLUTION_NOTE, isPerItemQuestion, hasRunSummaryMarker, hasAllWords, isCitationHarvestRunSummary, decideRunLogClosure, planClosure, groupCounts, main
- scripts/maintenance/enumerate-unclassified-hosts.mjs (4): isUnresolved, indexSearchResultsByHost, renderMarkdown, main
- scripts/maintenance/finish-staged-updates.mjs (4): RESOLVED_BY, buildOutcomePatch, describeOutcome, main
- scripts/maintenance/forward-events-retext.mjs (13): mapClaimRows, mapSectionRows, forwardEventIdentityKey, pgMd5, postRewriteKey, compareForSurvivor, planCollisions, classifyDefects, classifyAfterResidue, planItemRetext, buildRestoreSql, main, DUPLICATE_CITE
- scripts/maintenance/gate-a-rescan.mjs (4): CITE, resolveLimit, selectStaleItems, main
- scripts/maintenance/host-verdicts/load-host-verdicts.mjs (1): discoverHostVerdictFiles
- scripts/maintenance/institution-canonicalize.mjs (13): CITE, GENERIC_HOSTING_DOMAINS, isGenericHostingDomain, normalizeName, planMerges, applyMergeSimulation, hostEndsWithDomain, planTierCanonicalization, STANDARDS_BODY_CLASS_TIER, planRulingNeeded, planClassTierOverride, main, buildDeps
- scripts/maintenance/lib/cli.mjs (2): REQUIRES_ARG, fanoutSkipSummary
- scripts/maintenance/lib/consolidate-attach-worklist.mjs (11): LOW_AUTHORITY_HOSTS, seedKey, buildSeedIndex, isHttpUrl, consolidateSourced, consolidateUnsourced, collapseWhitespace, quoteContainsToken, urlHost, flagQuality, dispositionCountsBySlice
- scripts/maintenance/lib/extract-worklist-seed.mjs (1): extractWorklistSeed
- scripts/maintenance/lib/flag-url-extract.mjs (1): trimUrlPunctuation
- scripts/maintenance/lib/origin-class-map.mjs (1): ORIGIN_CLASS_OUTPUTS
- scripts/maintenance/lib/vocab-inventory.mjs (10): extractQuotedValues, parseCheckConstraintDef, looksListValued, normalizeTableName, stripSqlComments, findMatchingParen, extractCreateTableRegions, extractChecksFromRegion, extractCheckConstraintCandidates, buildVocabularyFromMigrationSources
- scripts/maintenance/lineage-gap-targets.mjs (5): STEP, ARTIFACT_NAME, RESOLVED_BY, buildResolutionNote, main
- scripts/maintenance/one-off/2026-09-29-reverse-chained-apply.mjs (10): CITE, ARCHIVE_REASON, ITEM_IDS, STAGED_UPDATE_IDS, AGENT_RUN_SEARCH_IDS, INTEGRITY_FLAG_IDS, SOURCE_URLS, EXPECTED_COUNTS, checkIdListIntegrity, main
- scripts/maintenance/origin-class-backfill.mjs (2): CITE, main
- scripts/maintenance/provenance-heal.mjs (3): CITE, main, parseSelection
- scripts/maintenance/recompute-tiers.mjs (3): CITE, main, buildDeps
- scripts/maintenance/recompute-trust-scores.mjs (3): CITE, main, buildDeps
- scripts/maintenance/record-hollow-sweep.mjs (18): CITE, RESTORE_CITE, ARCHIVE_REASON, SWEEP_MARKER, RESTORE_ARG_PREFIX, isTitleOnlyFacts, isSeriesItem, planSelection, groupCounts, chunkList, buildArchivePatch, buildSweepNote, appendNote, planCensusReturn, pickLatestPriorStates, buildRestorePatchFromPrior, buildRestoreSql, main
- scripts/maintenance/refetch-capped.mjs (1): main
- scripts/maintenance/regen-quarantined.mjs (1): main
- scripts/maintenance/remediate-orphan-sources.mjs (3): buildArgs, parseCounts, main [CONFIRMED: listed by the method stated in this section] [WORK: DEAD-1c]
- scripts/maintenance/reopen-validation-holds.mjs (2): notesHead, main
- scripts/maintenance/repair-smoke-account.mjs (3): ORG_NAME, CITE, main
- scripts/maintenance/resolve-cited-host-gate.mjs (7): CITE, RESOLVED_BY, extractCitedUrls, buildResolutionNote, planFlag, main, NULL_TIER_CREATED_BY
- scripts/maintenance/resolve-error-body-gate.mjs (10): CITE, RESOLVED_BY, WORKLIST_CLASS, extractFailedUrls, excerptQuote, buildWorklistEntry, mergeWorklistEntries, buildResolutionNote, planErrorBodyFlag, main
- scripts/maintenance/resolve-provisional-sources.mjs (13): CITE, PROVISIONAL_WORKLIST_STATUS, SOURCES_REJECT_STATUS, decideHost, sourcesActivationPatch, hostForRow, sourcesDeadSignal, sourcesStatusForPromote, planProvisionalSourceRow, planSourcesProvisionalRow, syntheticItemIdFor, main, buildDeps
- scripts/maintenance/resolve-refetch-holds.mjs (10): HOLD_CREATED_BY, RESOLVED_BY, groupHoldsByItem, captureRowLabel, captureLength, planItemReground, degradedNewestClause, buildDryResolutionNote, buildAppliedSupersedeNote, main
- scripts/maintenance/resolve-signals.mjs (1): main
- scripts/maintenance/retype-eu-decisions.mjs (14): OLD_ITEM_TYPE, NEW_ITEM_TYPE, NEW_FORMAT_TYPE, SLOTS_TO_ADD, FLYWHEEL_NOT_PRESENT, isRetypeCandidate, partitionInitiativeRows, planTitleUpdate, planItemRetype, looksLikeMidWordCut, queueFlywheelStep, parseBatchArgs, applyOneItem, main
- scripts/maintenance/review-apply-coverage-gaps.mjs (2): resolveRulingPath, main
- scripts/maintenance/review-apply-portal-links.mjs (2): resolveRulingPath, main
- scripts/maintenance/review-digests.mjs (2): UPSTREAM_SCRIPT, main
- scripts/maintenance/schema-vocabulary-inventory.mjs (1): main
- scripts/maintenance/seed-corridors.mjs (1): main
- scripts/maintenance/source-role-cleanup.mjs (1): main
- scripts/maintenance/source-type-backfill.mjs (1): main
- scripts/maintenance/tag-proposals.mjs (1): parseSelection
- scripts/maintenance/tier-opinions.mjs (3): CITE, planTierOpinions, main
- scripts/maintenance/timeline-backfill.mjs (10): UNDATEABLE_FLAG_CITE, planTimelineBackfillItem, partitionUndated, buildUndateableFlagDescription, buildUndateableFlagRow, idsFromUndateableFlagRow, planUndateableFlagResolution, buildUndateableFlagResolutionNote, parseBatchArgs, main
- scripts/maintenance/uk-series-code-reconcile.mjs (10): CITE, RESTORE_CITE, RESTORE_ARG_PREFIX, SELECTION_SQL, planItemSeriesCode, planSelection, buildRestoreSql, pickLatestPriorStates, buildRestorePatchFromPrior, main
- scripts/maintenance/w1-dispositions.mjs (7): REGISTER_DOC_PATH, parseRegisterTable, classifyDisposition, parseSectionRecommendations, parseStatedSplit, buildRegisterReport, main
- scripts/maintenance/write-run-artifact.mjs (2): collectStepSummaries, buildArtifact
- scripts/mint/apply-mint-batch.mjs (18): buildItemsIndex, checkM4, censusRowIdSet, resolveCensusRowId, VALIDATION_FAILED_HOLD_REASON_PREFIX, resolveValidationFailedHolds, buildIntelligenceItemRow, computeGateAState, enrichMintRunArtifact, applyOnePayload, defaultReportPathFor, run, buildAgentRunSearchRows, buildSectionRows, buildClaimRows, buildCitationRows, normalizeInstrumentIdentifier, sameInstrumentIdentity
- scripts/mint/heal-provenance.mjs (81): HEAL_VERSION, isRequiredSlotMarkerClaim, buildNormalizedIndex, containsCaseInsensitive, diceCoefficient, findClosestFuzzyMatch, needsCapture, resolveCaptureUrl, envelopeFromPlainGet, captureItem, waybackAvailabilityUrl, parseWaybackAvailability, waybackSnapshotFetchUrl, CAPTURE_CITED_MAX_PER_ITEM, collectCitedUrls, unfetchedCitedUrls, planGroundingForClaim, buildSlotClaim, floorMaxFor, isFloorArmed, deriveSourceTier, effectiveFloorForClaim, buildSourcesIndex, claimNeedsResource, buildUrlVariants, buildOwnCanonicalBucket, buildTierQualifyingBucket, buildCorpusPoolBucket, planResourceForClaim, resolveInstitutionKeyForSource, SOURCE_MAX_PER_ITEM, classifyCitedUrlForOrphan, candidateUrlsForOrphan, SOURCE_MAX_HOP_LINKS_PER_TOKEN, extractHopLinks, classifyHopLink, hopLinksForToken, extractSentenceContext, sentenceSpans, findSentenceSpanForToken, removeSentenceSpan, planStripUnprovableClause, planStripUnprovableSentence, planBriefHonest, findOwningSection, buildOrphanClaimText, planOrphanGrounding, splitParagraphsPreserving, planRelabelParagraph, planRelabelFromFullBrief, planRelabelModalParagraph, sectionNeedsRelabel, jaccardTokenOverlap, OWNING_PARAGRAPH_MIN_SCORE, findOwningParagraphByOverlap, splitSentences, pickBestSentence, stripLeadingMarker, planOwningParagraphRewrite, isSubstantiveParagraph, findOwningParagraphAcrossSections, planOwningParagraphRewriteAcrossSections, reclassifyReason, computeDerivedCovered, planGateA, shouldUnarchive, resolveKitBackfillCandidates, resolveSlotsBackfillCandidates, guardMarkerWrites, healOneItem, summarizeReports, buildSummaryObject, cellarEndpointForOj, extractSlotKeyFromMarker, buildNumericNormalizedIndex, parseOjReference, SOURCE_MAX_CANDIDATE_URLS_PER_ORPHAN, overlapTokens, MIN_SUBSTANTIVE_TOKENS, requiredSlotItemTypes, writeCheckpoint
- scripts/mint/lib/tag-presence-check.mjs (1): SIGNATURE_TAG_FIELDS
- scripts/mint/migration-299-precheck.mjs (6): NEW_REQUIRED_SLOTS, NEW_REQUIRED_ITEM_TYPES, computeGuard, evaluatePreCheck, evaluatePostCheck, claimCoversSlot
- scripts/mint/rederive-record-provenance.mjs (3): CITE, selectStale, main
- scripts/mint/run-mint-batch.mjs (10): MINT_GOVERNING_FILES, loadBatch, loadCensusRows, buildPayloadsFromCensusRows, mergeCensusBuildFailures, payloadId, runBatch, buildRunArtifact, enrichRunArtifactMetrics, loadOutcomes
- scripts/mint/screen-reconcile-records.mjs (4): ARCHIVE_REASON, CITE, classifyLiveRecords, main
- scripts/mint/screen-rules.mjs (6): parseCelex, deriveSearchText, KNOWN_OFF_VERTICAL_CELEX_ROOTS, ON_VERTICAL_RULES, OFF_VERTICAL_RULES, RULE_NAMES
- scripts/mint/screen-worklist.mjs (7): SCREEN_GOVERNING_FILES, screenRows, loadReviewed, mergeReviewed, buildSummary, nextRunId, buildRunArtifact
- scripts/mint/stamp-wo26-archive-reason.mjs (6): ARCHIVE_REASON, TARGET_DATE, EXPECTED_COUNT, CITE, isWo26UnstampedRow, main
- scripts/obligations/derive-obligations.mjs (4): DERIVATION_VERSION, deriveObligationRow, deriveObligationRows, filterNewRows
- scripts/plan-quarantine-disposition.mjs (3): buildDeferralCandidate, planDispositions, nextRunNumberFromHarnessRuns
- scripts/producers/emit-producers-artifact.mjs (2): readProducerSummaries, buildArtifact
- scripts/producers/market/author-market-series-delta.mjs (1): assertEdgesAuthored
- scripts/producers/market/build-oil-bulletin-rows.mjs (1): buildOilBulletinCensusRows
- scripts/producers/market/carrier-ets-surcharge-producer.mjs (3): runEtsProxyProducer, resolveSource, fixtureDownstreamDeps
- scripts/producers/market/ecb-fx-producer.mjs (4): CURRENCIES, parseEcbFxXml, decideApply, formatSourceEvidence
- scripts/producers/market/eia-v2-petroleum-spot-producer.mjs (3): PRODUCTS, parseEiaV2PetroleumSpot, decideApply
- scripts/producers/market/fetch-oil-bulletin.mjs (4): SINCE_ALL_WEEKS, parseArgs, filterSince, findPricesHistoryLink
- scripts/producers/market/ratify-series-items.mjs (4): indexPerItemById, ratificationForSeries, ratifySeriesItemMap, renderSeriesItemMapFile
- scripts/producers/market/sbti-target-dashboard-producer.mjs (6): LICENCE_BLOCK, excelSerialToIsoDate, resolveHeaderColumns, extractSbtiTargetRows, aggregateSbtiTargetRows, decideApply
- scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs (2): fetchAllMemberStates, decideApply
- scripts/producers/regional/run-envelope-producer.mjs (2): toCandidateRows, latestPerNaturalKey
- scripts/producers/regional/state-cost-facts-producer.mjs (8): ENABLED, HARNESS_FAMILY, runStateCostFactsProducer, resolveRegionIds, authorJurisdictionEntitiesForStates, buildRunArtifact, FSI_ROOT, GOVERNING_FILES
- scripts/producers/registry/load-registry.mjs (1): REGISTRY_DIR
- scripts/producers/registry/run-registered.mjs (2): parseArgs, runRegistered
- scripts/producers/research/research-assessment-producer.mjs (10): PRODUCER_NAME, toAssessmentInput, hasChanged, toRow, resolveOpenAlexSourceRecords, runResearchAssessmentProducer, selectNeedingAssessment, fetchLiveCandidates, parseLimitArg, decideApply
- scripts/proof/applied-map.mjs (1): CLASSES
- scripts/proof/apply-schema-dump.mjs (5): stripOwnership, collectErrors, classifyErrors, buildReport, applySchemaDump
- scripts/proof/attacks/attack-engine.mjs (5): DENIED, resolveParams, roleStatements, describeObserved, evaluateExpect
- scripts/proof/attacks/fixtures.mjs (1): FIXTURE_IDS
- scripts/proof/attacks/run-attacks.mjs (7): loadManifest, assertLocalOnly, validateManifest, buildReport, exitCodeFor, runAll, cliMain
- scripts/proof/attacks/script-attack.mjs (1): extractDoBlock
- scripts/proof/create-oracle-db.mjs (3): ORACLE_DB, withDatabase, createOracleDb
- scripts/proof/dump-production-schema.mjs (5): redact, checkDump, firstWorkingCandidate, runDump, dumpProductionSchema
- scripts/proof/emit-chain-proof-artifact.mjs (4): readInputs, buildArtifact, summaryMarkdown, emit
- scripts/proof/export-local-harness-runs.mjs (4): SELECT_RUNS, hashId, buildHarnessRunsExport, exportLocalHarnessRuns
- scripts/proof/export-subset.mjs (12): pickSeeds, readPinnedIds, fetchFkGraph, fetchCatalog, findOrphans, verifyNoOrphans, fkOrder, buildClosure, writeSubset, isOutsideWorkspace, exportSubset, runCli
- scripts/proof/load-subset.mjs (5): CADENCE_ON, isLoopbackConnString, readSubset, loadSubset, runCli
- scripts/proof/preflight.mjs (2): FORBIDDEN_NAMES, checkPreflight
- scripts/proof/replay-migrations.mjs (14): DEFAULT_MIGRATIONS_DIR, DEFAULT_INVENTORY, DEFAULT_APPLIED, DEFAULT_MAP, DB_CATALOG, parseInventoryOrder, prefixReport, planReplay, parsePsqlOutput, runFileWithPsql, evaluatePostChecks, probeDatabase, replay, summarize
- scripts/proof/run-lane-step.mjs (2): buildStepRecord, runLaneStep
- scripts/proof/schema-diff.mjs (5): CATEGORIES, CATALOG_QUERY, diffCatalogs, readCatalog, summarizeDiff
- scripts/proof/sync-applied-migrations.mjs (3): DEFAULT_OUT, normalizeExport, buildInventory
- scripts/proof/write-local-env.mjs (4): parseStatusEnv, buildLocalEnv, renderEnvFile, maskLines
- scripts/propagation/resolve-statutory-rows-file.mjs (2): DEFAULT_LIVE_ROWS_FILE, resolveStatutoryRowsFile
- scripts/propagation/seed-derived-values.mjs (2): parseArgs, seedCarbonIntensity
- scripts/propagation/validate-statutory-rows-file.mjs (3): validateSourceBlock, validateRow, validateRowsFile
- scripts/propagation/write-statutory.mjs (7): parseRow, resolveOrMintEntity, writeOneRow, runWriter, nextRunNumberFromHarnessRuns, FORMULA_ID, SUPPORTED_TARGET_YEARS
- scripts/remediation/refetch-capped-worklist.mjs (6): CLASS_RANGES, SERVER_RANGES, SERVER_OR_FILTER, WORKLIST_COLUMNS, classify, buildWorklist
- scripts/research/authority-score.mjs (10): ROLE_CLASSES, classifyRoleClass, computeInstitutionalStanding, computeAuthorStanding, computeFundingIndependence, computeReception, computeIntegrity, bucketForSource, scoreOpenAlexSource, scoreGreyLiteratureSource
- scripts/research/backfill-themes.mjs (8): ENABLED, UNCLASSIFIED, classifyOne, classifyBatch, patchFor, themeCardsFromResults, recordDryHarnessRun, main
- scripts/research/openalex-client.mjs (6): OpenAlexError, fetchWorkById, fetchAuthor, fetchInstitution, fetchInstitutionTopicStanding, CONFIG
- scripts/research/research-walker.mjs (18): normalizeOpenAlexWork, searchOpenAlexWorks, MAX_HOLDINGS_NEEDS, holdingsNeedsFromFlags, readHoldingsNeeds, readOpenNeeds, searchHoldingsNeeds, resolveGreyLitSource, resolveOpenAlexPublisher, buildMintSeed, buildFixtureSbClient, mintCandidateDryRun, FIXTURE_RUN_BANNER, LIVE_SEARCH_RUN_BANNER, describeRunKind, buildWalkerConfig, decideApply, runWalk
- scripts/review/build-review-digests.mjs (3): QUEUES, buildQueueDigest, main
- scripts/sources/backfill-source-type.mjs (2): CITE, planBackfill
- scripts/sources/inaccessible-triage.mjs (15): INACCESSIBLE_TRIAGE_GOVERNING_FILES, DEFAULT_TIME_BUDGET_MIN, DEFAULT_CONCURRENCY, MAX_CONCURRENCY, DEFAULT_HOST_INTERVAL_MS, parseArgs, createHostThrottle, runBounded, probeHead, probeGet, qualifiesAtFloor, fetchStatusForDossier, triageOneSource, applyFetchStatus, main
- scripts/spec09/auxiliary-energy-producer.mjs (2): CITE, main
- scripts/spec09/grid-queue-producer.mjs (3): CITE, parseGridQueueRow, main
- scripts/spec09/indexation-producer.mjs (2): CITE, main
- scripts/spec09/lib/operator-rows-contract.mjs (5): TABLE_CONTRACTS, entityRefValuesForTable, validateEntityRefs, MAX_BYTES_PER_FILE, MAX_ROWS_PER_FILE
- scripts/spec09/oem-roadmap-producer.mjs (3): CITE, parseOemRoadmapRow, main
- scripts/spec09/reroute-producer.mjs (4): CITE, evaluateCorridorReadiness, parseRerouteRow, main
- scripts/spec09/run-fixture-import.mjs (4): DEFAULT_TEST_ORG_ID, fakeInsertMany, runOneTable, runFixtureImport
- scripts/turns/apply-extraction-output.mjs (6): parseArgs, loadEventsFile, md5Hex, dedupeKey, toInsertRow, partitionNew
- scripts/turns/apply-need-urls.mjs (5): CITE, parseArgs, applyNeedUrls, applyArtifactInput, buildRealDeps
- scripts/turns/apply-question-answers.mjs (5): parseArgs, buildResolutionNote, withUnanswerableOutcome, applyQuestionAnswers, applyArtifactInput
- scripts/turns/apply-record-briefs.mjs (18): DEFAULT_HARNESS_RUNS_DIR, DEFAULT_IO_BUDGET_MB, BYTES_PER_MB, ENTITIES_MODULE_NOT_PRESENT, parseArgs, resolveBriefsInput, APPLY_STEP_ORDER, buildApplyPlan, buildRequiredSlotMaps, importLinkItemEntities, collectEntryCitations, lineageOutcome, previewEntryLineage, previewEntryCitations, applyOneEntry, PIPELINE_POOL_REREADS, IO_BUDGET_STOP_REASON, runApplyLoop
- scripts/turns/apply-theme-briefs.mjs (4): parseArgs, buildThemeBriefRow, probeStructuredColumns, applyArtifactInput
- scripts/turns/brief-export/queue.mjs (2): partFileNames, isPendingQueueRow
- scripts/turns/consume-turn-requests.mjs (9): parseArgs, applyLimit, partitionByCorpusMembership, extractArchivedRequestIdsFromSnapshot, archivedConsumedBy, extractRequestIdsFromSnapshot, toIdList, formatIdsLine, buildOutputPayload
- scripts/turns/dry-run-structured-actions.mjs (1): runExtractionPass
- scripts/turns/emit-brief-export-artifact.mjs (3): parseIdsList, buildArtifact, emit
- scripts/turns/emit-corpus-turn-artifact.mjs (4): perItemFromTicketsSnapshot, latestForwardEventsCount, buildArtifact, emit
- scripts/turns/emit-downstream-chain-artifact.mjs (4): STEPS, termMetrics, termNeedMetrics, buildArtifact
- scripts/turns/emit-gate-a-rescan-artifact.mjs (2): buildArtifact, emit
- scripts/turns/emit-live-smoke-artifact.mjs (3): readReport, buildArtifact, emit
- scripts/turns/emit-source-resolution-artifact.mjs (4): STEPS, countsFor, buildArtifact, emit
- scripts/turns/export-corpus-for-extraction.mjs (3): parseArgs, chunkByCharBudget, selectItemsByIds
- scripts/turns/export-needs-for-search.mjs (3): parseArgs, buildExport, exportArtifactInput
- scripts/turns/export-questions-for-answers.mjs (3): parseArgs, buildExport, exportArtifactInput
- scripts/turns/export-themes-for-briefs.mjs (4): DEFAULT_CHAR_BUDGET, parseArgs, buildExport, exportArtifactInput
- scripts/turns/io-preflight.mjs (6): IN_FLIGHT_STALE_MIN, METRICS_PATH, parseDiskCounters, decidePreflight, sampleDiskCounters, readLastApplyRun
- scripts/turns/last-turn-date.mjs (2): EPOCH, readLastTurnDate
- scripts/turns/needs-search/artifact.mjs (1): FAMILY
- scripts/turns/needs-search/schema.mjs (1): validateNeedEntry
- scripts/turns/question-answers/data.mjs (7): QUESTION_CREATED_BY, ANSWERED_ACTION, NEED_CREATED_BY, ALL_NEED_CREATED_BY, ITEM_COLUMNS, eventContextOf, itemUnusableReason
- scripts/turns/question-answers/schema.mjs (4): CEILINGS, MIN_SPAN_CHARS, sentencesOf, unquotedSentences
- scripts/turns/read-brief-export-queue.mjs (3): formatPendingList, resolveQueueContent, runCli
- scripts/turns/record-briefs/schema.mjs (8): figureCheckText, SECTION_DEFS_BY_FORMAT_TYPE, buildSyntheticFrontmatter, buildSyntheticRawText, validateRecordBriefsClaim, validateRecordBriefsEntry, slotAllowsGap, requiredSlotErrors
- scripts/turns/research-sweep.mjs (14): RESEARCH_SWEEP_GOVERNING_FILES, RESEARCH_SOURCE_SELECTION_QUERY, parseArgs, selectResearchSources, looksLikeFeedXml, discoverCandidateLinks, normalizeUrlKey, filterNewLinks, stripHtmlToText, extractHtmlTitle, titleFromUrl, screenForSource, censusRowFor, sweepOneSource
- scripts/turns/run-change-detection.mjs (13): CHANGE_DETECTION_GOVERNING_FILES, DEFAULT_CHECK_LIMIT, DEFAULT_RECONCILE_BATCH, BROWSERLESS_UNITS_PER_SOURCE_EST, SCRAPE_GATE_REASONS, evaluateScrapeGate, routeExitedAtGate, parseArgs, defaultTraceDir, dueSourcesWindowStart, browserlessUnitsEstimate, shapeRunOutput, crossCheckMismatches
- scripts/turns/run-fetch-drain.mjs (12): DEFAULT_LIMIT, MAX_LIMIT, BATCH_SIZE, STUCK_AFTER_MS, parseArgs, resolveSweepLoopRunId, stuckCutoffIso, batchIds, tallyByStatus, shapeDryPlan, shapeBatchPerItem, functionUrlFor
- scripts/turns/run-ledger-consume.mjs (28): LEDGER_CONSUME_GOVERNING_FILES, parseArgs, defaultTraceDir, buildFetchDoc, collectClassifyTelemetry, validateVerdictEntry, validateVerdictsFile, partitionVerdictsByPromptVersion, isVerdictsBatchFilename, sortVerdictsBatchFilenames, indexVerdictsByUrl, verdictEntryToClassifyOutput, buildClassifyGate, buildVerdictClassify, PROMOTED_LIKE_DISPOSITIONS, REJECTED_LIKE_DISPOSITIONS, ledgerStatusAfter, shapeConsumeResult, resolveSweepLoopRunId, buildRunArtifact, isApplyArmed, resolveApplyGate, shapeCandidateTextFields, buildCandidateExportPayload, runExportCandidates, resolveExportAfter, findLatestExportArtifact, buildExportRunArtifact
- scripts/turns/run-propagation-drain.mjs (13): PROPAGATION_GOVERNING_FILES, parseArgs, parseEventRange, resolveDrainLoopRunId, resolveArtifactTrigger, questionsOnChangeStep, signpostStep, questionsOnChangeMetrics, UNFINISHED_ID_CAP, unfinishedMetrics, unfinishedIdsFromHistory, orchestrateQuestions, shapeRunOutput
- scripts/turns/theme-briefs/schema.mjs (5): THEME_BRIEF_SECTIONS, SECTION_CEILINGS, TITLE_CEILING, findUncitedFigures, validateThemeBriefEntry
- scripts/verify/audit-finding-status.mjs (1): listAuditFiles
- scripts/verify/candidate-dwell-audit.mjs (3): DWELL_BOUND_DAYS, namedCandidateIds, classifyDwellCandidates
- scripts/verify/check-vocabulary-drift.mjs (1): hasPlausibleCredentials
- scripts/verify/defect-signature-scan.mjs (2): detectNumeric, scanItem [CONFIRMED: listed by the method stated in this section] [WORK: DEAD-1c]
- scripts/verify/export-loop-fired-evidence.mjs (2): renderEvidenceFile, runCli
- scripts/verify/lib/dead-column-scan.mjs (1): isTimestampType
- scripts/verify/lib/duplicate-table-scan.mjs (11): buildColumnTypeMaps, columnDocFrequency, columnWeight, sharedSignificantColumns, weightedColumnJaccard, weightedColumnOverlap, tableNameOverlap, commentSimilarity, commentMentionsOther, scorePair, RARE_DF_CEILING
- scripts/verify/lib/harness-family-walk-scan.mjs (3): findZeroDispatchProducers, findNeverDispatchedIndividualProducers, GhRunListParseError
- scripts/verify/lib/schema-drift.mjs (1): extractCreatedObjects
- scripts/verify/lib/ui-orphan-scan.mjs (1): parseSelectList [CONFIRMED: listed by the method stated in this section] [WORK: DEAD-1c]
- scripts/verify/loop-fired-evidence-audit.mjs (3): auditEntries, readEvidenceFile, runAudit
- scripts/verify/no-generic-source-audit.mjs (1): factsOnSuspended
- scripts/verify/population-report.mjs (25): computeBriefsPendingStale, countBriefsPendingStale, bucketBriefsOwedByTypeAndAge, renderBriefsOwedLines, describeBriefsPendingState, extractFlaggedTimelineIds, computeTimelineCoverageGap, countTimelineCoverageGap, describeTimelineCoverageState, AXIS_CLASSIFICATION_CREATED_BY, computeOpenFlagsByFamily, describeOpenFlagsByFamilyState, LEGAL_CONFIRMATION_RESOLVED_BY, computeLegalConfirmationCount, describeLegalConfirmationState, computeCoverageReflectionsCount, describeCoverageReflectionsState, computeVerdictsOwed, loadCommittedVerdictedUrls, countCandidatesAwaitingVerdict, STORES, classify, renderReport, countStore, collect
- scripts/verify/run-data-audit-lane.mjs (1): deriveAudits
- scripts/verify/section-marker-audit.mjs (2): countMarkerBodies, runAudit
- scripts/verify/spec09-org-rls-adversarial-audit.mjs (3): pickTwoOrgsWithMembers, classifyOutcome, runAudit
- scripts/verify/verification-audit-report.mjs (9): fetchProvenanceRows, buildProvenanceMatrix, fetchClaimRows, buildClaimsCitationStats, findSectionsMissingSpan, collectHarnessMarkers, collect, renderMarkdown, writeReportFiles
- src/app/api/admin/sources/[id]/bias-tags/logic.ts (1): PENDING_ASSIGNMENT_SOURCE
- src/app/api/admin/sources/commit-tier-change/logic.ts (1): CommitTierChangeResult
- src/app/api/listings/rest/logic.ts (1): REMAINDER_PAGE_SIZE
- src/app/api/notices/resolve-watched-entities.ts (3): EntityResolveQueryBuilder, WatchedItem, groupWatchedItemIds
- src/app/api/worker/check-sources/logic.ts (3): CheckSourceRow, DEFAULT_CHECK_LIMIT, MAX_CHECK_LIMIT
- src/app/api/workspace/bootstrap/logic.ts (2): PersonalStateItem, MemberRow
- src/components/admin/corrections/load-all.mjs (1): MAX_ORPHAN_CHECKS
- src/components/admin/corrections/model.mjs (1): buildCorrectionBody
- src/components/admin/OrganizationsTable.tsx (1): membersCellLabel
- src/components/app-shell-banner.ts (1): NO_WORKSPACE_ONBOARDING_ROUTE
- src/components/auth/identity-loader.ts (1): IdentityLoaderDeps
- src/components/community/api-client.ts (1): fixtures
- src/components/detail/DetailShell.tsx (1): DetailMastheadProps
- src/components/list-surface/list-surface-helpers.ts (14): modeFacetOptions, topicFacetOptions, tierFacetOptions, regionFacetOptions, bandFacetOptions, bandFromSearchParam, FacetCorpusCounts, LiveFacetCounts, isFilterActive, MODE_FACET_PARAM, REGION_FACET_PARAM, TOPIC_FACET_PARAM, TIER_FACET_PARAM, QUERY_FACET_PARAM
- src/components/operations/AuxiliaryEnergyPanelView.tsx (1): AUXILIARY_ENERGY_GAP_LINE
- src/components/operations/GridQueuePanelView.tsx (1): GRID_QUEUE_GAP_LINE
- src/components/regulations/format-fixed-date.ts (2): formatMilestoneChip, formatYearOnly
- src/components/shell/bootstrap-seed.ts (2): IDENTITY_RETRY_DELAYS_MS, IDENTITY_ATTEMPTS_PER_ROUND
- src/components/sources/ProvisionalReviewTable.tsx (1): rowTier
- src/components/sources/SourceTierLegend.tsx (2): SOURCE_TIERS, facetTierOf
- src/components/ui/Chips.tsx (1): FilterChipGroupProps
- src/components/ui/commandBarKeyboard.ts (1): CommandBarEnterAction
- src/components/ui/FactCard.tsx (2): sourceNameWrapsToTwoLines, sixWordHeadline
- src/components/ui/ImpactMeter.tsx (13): sumScores, rampColor, ROW_SEGMENT_COUNT, ROW_SEGMENT_GROUP_SIZE, ROW_SEGMENT_HEIGHT_PX, ROW_SEGMENT_WIDTH_PX, ROW_SEGMENT_GAP_PX, ROW_GROUP_GAP_PX, ROW_SEGMENT_RADIUS_PX, ROW_VALUE_GAP_PX, ROW_SEGMENTS_TOTAL_PX, ROW_TRACK_COLOR, segmentFilled
- src/components/ui/RowTable.tsx (1): RowTableMetrics
- src/components/ui/tagPopoverKeyboard.ts (3): hasExactMatch, EnterAction, BackspaceAction
- src/lib/account/initial-tab.ts (2): PROFILE_TAB_KEYS, ProfileTabKey
- src/lib/admin/member-display-name.ts (1): NO_PROFILE_LABEL
- src/lib/admin/parts-registry.ts (3): PARTS_DIR, PartDescriptorError, validatePartDescriptor
- src/lib/admin/provisional-review-queue.ts (1): isAwaitingReview
- src/lib/agent/analysis-labels.mjs (2): ANALYSIS_LABEL_TOKENS, LEGACY_ANALYSIS_LABEL
- src/lib/agent/anthropic-error.mjs (1): classifyAnthropic
- src/lib/agent/anthropic-stream.mjs (1): createSSEAccumulator
- src/lib/agent/brief-section-strip.mjs (1): isSourcesLeadTitle
- src/lib/agent/claim-ledger-block.ts (1): hasClaimLedgerBlock
- src/lib/agent/derived-consistency.mjs (2): parseRecurringRule, parseDerivedDate
- src/lib/agent/deterministic-lever.mjs (3): DETERMINISTIC_LEVER_CLASSES, GENERATION_ONLY_CLASSES, unexercisedLevers
- src/lib/agent/extract-recommended-actions.mjs (3): CONCRETE_ACTION_VERBS, DO_NOW_SECTIONS_BY_ITEM_TYPE, extractActionFromParagraph
- src/lib/agent/gate-a-scan.mjs (1): extractFactualTokens
- src/lib/agent/ground-failure-class.mjs (2): isDeterministicGroundFailure, isStructuralGroundFailure
- src/lib/agent/ledger-apply.mjs (4): normText, sameAttribution, isTierImprovement, eraseClaimWithProof
- src/lib/agent/ledger-dominance.mjs (3): FACT_FLOOR, THINNING_FLOOR, isThinningRegression
- src/lib/agent/mint-gates.mjs (2): perFactWouldHold, detectConflate
- src/lib/agent/operations-ask-context.mjs (3): isEnveloped, formatRegionalDataFactLine, formatStateCostFactLine
- src/lib/agent/parse-output.ts (8): TrajectoryPointsJSON, RequirementTrajectoryJSON, MentionedTerm, ClaimKind, ParsedAgentOutput, AgentRunSearchLink, foldYamlBlockLists, extractClaimLedger
- src/lib/agent/parse-record-sections.ts (5): humanizeSlotLabel, lastQuotedSpan, parseRecordClaimLine, parseSourceUrl, KEY_DATE_SLOTS
- src/lib/agent/prompt-cache.mjs (2): POOL_HEADER, systemTextContent
- src/lib/agent/section-grounding.mjs (1): GROUND_SECTION_HARD_CEILING_CHARS
- src/lib/agent/section-markers.mjs (2): JSON_LITERAL_MAX_PROSE_CHARS, INTERNAL_MARKER_PATTERNS
- src/lib/agent/slot-forcing.mjs (3): MIN_NOMINATION_SPAN, nominateForSlot, decideSlotClaim
- src/lib/agent/source-blocks.mjs (1): authorityFloorForFact
- src/lib/agent/source-entry-filter.mjs (1): renderableSourceEntries
- src/lib/agent/system-prompt.ts (1): SYSTEM_PROMPT
- src/lib/agent/timeline-backfill-derive.mjs (12): formatPrecisionLabel, extractFederalRegisterDate, FEDERAL_REGISTER_BASE_LABEL, ukFrontMatterWindow, extractLegislationGovUkDate, extractForwardEventDate, extractDatelineDate, DATELINE_BASE_LABEL, CAPTURED_FALLBACK_BASE_LABEL, extractCapturedDate, RECORDED_FALLBACK_BASE_LABEL, extractRecordedDate
- src/lib/agent/url-canon.mjs (1): POLLUTION_FIXTURES
- src/lib/api/auth.ts (2): ClaimsVerifier, resolveUserIdFromToken
- src/lib/api/authed-fetch.ts (6): SessionSource, AuthedFetchDeps, AUTH_REQUIRED_ERROR, resolveAccessToken, unauthorizedResponse, withBearer
- src/lib/api/community-auth.ts (2): ClaimsVerifier, resolveCommunityUserId
- src/lib/api/org.ts (7): OrgRole, OrgMembership, resolveOrgMembershipFromUserId, resolveOrgIdFromAuthenticatedClient, ViewerIdentity, resolveViewerIdentityFromAuthenticatedClient, resolveViewerIdentityFromCookies
- src/lib/api/route-guard.ts (5): UserRoute, ADMIN_REQUIRED_ERROR, UserRouteDeps, AdminRouteDeps, CommunityRouteDeps
- src/lib/api/server-bootstrap.ts (3): ServerBootstrapUser, IdentityLookupError, resolveServerBootstrapFromClient
- src/lib/auth/platform-admin-gate.ts (1): PlatformAdminDecision
- src/lib/auth/provision-personal-workspace.ts (3): EnsureProfileResult, ProvisionClient, EnsureProfileDeps
- src/lib/auth/route-policy.ts (3): isScannerProbe, isPublicRoute, isStaticOrApiRoute
- src/lib/cache/fallback-guard.ts (4): MaybeFallbackPayload, FALLBACK_NOT_CACHEABLE, FallbackNotCacheableError, isFallbackPayload
- src/lib/classification/classify-source.mjs (1): sourceClassificationGaps
- src/lib/classification/expected-output.mjs (2): normalizeDistribution, AXIS5_CATEGORIES
- src/lib/classification/routing.mjs (2): routeItemBySourceAxis5, isAnomalousCategory
- src/lib/classification/vocab.mjs (8): KNOWN_FREE_TEXT_JURISDICTIONS, isValidScopeTopic, SCOPE_MODE_SENTINELS, SCOPE_MODES, isValidScopeMode, isValidScopeVertical, isValidAxis5Category, CLASSIFICATION_VOCABULARIES
- src/lib/community/index.mjs (11): kAnonymity, dominanceCap, threeMonthLag, projectAuthorIdentity, ORG_TYPES, isFreeMailDomain, FREE_MAIL_DOMAINS, REGIONS, MEMBER_WRITE_FORBIDDEN_COLUMNS, validateMemberPrefToggle, MAX_ENTITY_IDS
- src/lib/community/organisation-salt.ts (2): ORG_SALT_HKDF_INFO, OrganisationSaltSource
- src/lib/community/rooms.ts (3): RoomDef, ROOM_ORDER, roomByKey
- src/lib/community/shell-context.ts (2): CommunityCurrentUser, CommunityShellContext
- src/lib/connections/brief-candidates.mjs (2): MAX_CANDIDATES, selectCandidates
- src/lib/connections/connection-view-model.mjs (5): RELATIONSHIP_LABEL, labelForConnection, buildConnectionRows, buildSupersessionRows, couplingText
- src/lib/connections/decision-note.mjs (1): parseDecisionNote
- src/lib/connections/discover.mjs (1): scoreConnection
- src/lib/connections/flag-namespaces.mjs (1): ALL_NAMESPACES
- src/lib/connections/intersections.mjs (3): INTERSECTION_SIGNAL, tierOf, strengthToScore
- src/lib/connections/pair-view.mjs (3): BANDS, bandOf, collapsePairs
- src/lib/connections/signal-candidates.mjs (3): buildExistingPairSet, extractRegulationIdentifiers, extractCapitalizedPhrases
- src/lib/connections/signal-confidence.mjs (8): TITLE_ENTITY_VOCABULARY, AUTO_ADOPT_WEIGHT, classifySignalGroup, classifySignalCandidates, buildAutoAdoptEdges, groupStaleFlagsForResolution, buildSignalResolutionNote, SIGNAL_CONFIDENCE
- src/lib/connections/tag-aliases.mjs (1): ALIAS_MAP
- src/lib/connections/tag-input.mjs (3): DEFAULT_PREFIX_CHARS, defaultVocabTerms, boundedSourceWindow
- src/lib/connections/tag-labels.mjs (1): labelForTag
- src/lib/connections/term-needs.mjs (4): TERM_NEED_RULE, needTextFor, holdingQualifies, termNeedRow
- src/lib/connections/term-recurrence.mjs (2): decideAdoption, mentionsFromBriefTerms
- src/lib/connections/theme-stats.mjs (2): CONVERGENCE_BANDS, convergenceBand
- src/lib/contracts/corridor-id.mjs (8): CORRIDOR_ID_SCHEME, CORRIDOR_MODES, CORRIDOR_ID_HEX_LEN, corridorPayload, validateCorridorSpec, corridorId, renderCorridorIdSql, isSameCorridor
- src/lib/contracts/envelope.mjs (5): validateEnvelope, makeEnvelope, isDegraded, significantFigures, propagate
- src/lib/contracts/factor-tier.mjs (7): FACTOR_TIERS, TIER_CODES, isPrimaryData, resolveActiveFactor, primaryDataShare, pedigreeToStars, renderFactorCandidateViewSql
- src/lib/contracts/source-licence.mjs (7): REDISTRIBUTION, SOURCE_LICENCES, SOURCE_KEYS, licenceFor, assertEmbeddable, attributionFor, licenceTriage
- src/lib/contracts/vocabularies.mjs (18): weakestOriginClass, admissibleInCalculation, SOURCE_RELIABILITY, INFO_CREDIBILITY, admiraltyCode, validatePedigree, CONFIDENCE_BAND, admiraltyToBand, pedigreeToBand, LIKELIHOOD, likelihoodForProbability, IMPACT, APPLICABILITY, RELATION, inverseRelation, VOCABULARIES, MODE_ALIASES, isValid
- src/lib/corrections/admin-api/handlers.ts (1): AdminGuard
- src/lib/corrections/admin-api/logic.mjs (1): mapDbError
- src/lib/corrections/item-corrections.mjs (2): parseTagRef, activeCorrections
- src/lib/corrections/suppressed-render.mjs (1): removeClaimText
- src/lib/coverage-gaps-rollup.ts (1): sourceTypesFor
- src/lib/coverage/identity.mjs (2): parseInstrumentUrl, deterministicIdentity
- src/lib/credibility/bias-display.mjs (3): BIAS_TAG_LABELS, biasTagLabel, isLowerConfidence
- src/lib/customer-source-tier.ts (1): SOURCE_TIER_MIN
- src/lib/d3/hooks.mjs (2): admissionOutcome, rejectionOutcome
- src/lib/dashboard/brief-rows.ts (3): DUE_NEXT_CAP, DUE_NEXT_STATED_WINDOW_DAYS, BriefCardState
- src/lib/dashboard/recent-changes-window.mjs (2): BUILD_MODE_WINDOW_DAYS, LIVE_WINDOW_DAYS
- src/lib/dashboard/row-fields.ts (2): DueInfo, RecentRegenInfo
- src/lib/detail/fact-card-fixtures.ts (7): NO_LEAD_FIXTURE, LONG_CLAIM_FIXTURE, NO_PROVENANCE_FIXTURE, INLINE_LIST_FIXTURE, EMBEDDED_LINK_FIXTURE, FOUR_LINE_PROVENANCE_FIXTURE, TWO_LINE_NAME_FIXTURE
- src/lib/detail/fact-card-model.ts (4): parseFactCardModels, normalizeClaimText, resolveClaimTier, countNoLeadCards
- src/lib/detail/fact-paragraphs.ts (2): classifyParagraph, stripFactLabel
- src/lib/detail/id-redirect.ts (1): decideIdRedirect
- src/lib/detail/inference-view.mjs (9): CUSTOMER_INFERENCE_METHOD_IDS, INFERENCE_READ_CAP, MAX_VISIBLE_INFERENCES, PRODUCT_QUESTION_WORDS, questionInWords, isCurrentInferenceRow, isCustomerInferenceMethod, selectCurrentInferences, restrictToVisibleCitations
- src/lib/detail/load-detail-core.ts (1): buildClaimTierMap
- src/lib/detail/timeline-math.ts (2): daysBetween, daysPhrase
- src/lib/entities/canonical-entities.mjs (1): NAMED_ENTITIES_COUNT
- src/lib/entities/corridor-scope.ts (4): RELATION_TOUCHES_JURISDICTION, parseCorridorCanonicalName, getInstrumentsForJurisdictions, getObligationCountForJurisdictions
- src/lib/entities/crosswalk.mjs (1): SCHEMES
- src/lib/entities/entity-id.mjs (2): normalizeSeed, KINDS
- src/lib/entities/entity-resolve.mjs (7): adoptedTermRegex, entityDictionary, detectMentions, classifyBucket, classifyRelationship, planLinks, LINK_ALLOWED_TABLES
- src/lib/entities/lineage-backfill.mjs (2): LINEAGE_BACKFILL_ORIGIN, parseLineageGapFlag
- src/lib/entities/source-role.mjs (3): PRIMARY_ARTIFACT_TYPES, STUDY_BACKED_TYPES, NEWS_RE
- src/lib/entities/unlocode-names.mjs (3): UNLOCODE_NAMES, JURISDICTION_NAMES, nameForLocode
- src/lib/figures/format-range.mjs (2): FIXED_LOCALE, formatNumber
- src/lib/forward-events/extract-forward-events.mjs (8): selectDateCell, normalizeObligationText, unwrapRecordFactsTemplate, slotDatePrecision, finerDuePrecision, rescueSlotDateWithContext, sameObligationContent, dedupeEvents
- src/lib/forward-events/obligation-rail-select.mjs (2): OBLIGATION_RAIL_WINDOW_DAYS, utcDayStart
- src/lib/forward-events/read-upcoming.mjs (5): EVENT_KINDS, DEFAULT_KINDS, jurisdictionMatches, buildUpcomingEventsQuerySpec, selectUpcoming
- src/lib/health/gate-a-gauges.mjs (3): ALARM_GAUGES, GAUGE_NAMES, shapeGateAHealth
- src/lib/intake/census-writer.mjs (4): censusDisposition, isCensusWritable, buildCensusRow, writeCensusRows
- src/lib/intake/intake-url-corpus.mjs (4): URL_CASES, CONGRUENCE_CASES, DEDUP_CORPUS, DEDUP_CASES
- src/lib/intake/record-facts-research.mjs (3): RECORD_FACTS_RESEARCH_VERSION, RESEARCH_FINDING_REQUIRED_SLOTS, findResearchSlotSpan
- src/lib/intake/record-facts.mjs (12): RECORD_FACTS_VERSION, hasOnlyBareDomainUrls, findSlotSpan, extractIdentityFact, findBindingPositionMatch, inferDatePrecision, findDueDateMatch, findCorridorMatch, findInForceStatusMatch, extractInForceStatusFact, isEurlexHost, buildRecordFacts
- src/lib/learning/constants.mjs (1): QUESTION_ACQUISITION
- src/lib/learning/prediction-scoring.mjs (9): OUTCOME_BY_DIRECTION, SCORED_BY, outcomeForDirection, deadlineMs, isDeadlinePassed, scorePatch, buildLedgerRows, watchedRowForEvent, matchEventsToSignposts
- src/lib/learning/questions-on-change.mjs (4): MAX_ITEMS_PER_EVENT, EMITTING_TABLE_EVENT_MAP, eventTypeForOutboxRow, describeChange
- src/lib/learning/trigger-questions.mjs (3): MINTED_OR_TOUCHED, surfacesForDomain, isTriggerQuestionFlag
- src/lib/list-pagination.ts (1): FIRST_LISTING_CURSOR
- src/lib/llm/metered-gate.mjs (6): MeteredCallForbiddenError, METERED_ELIGIBLE_CLASS, METERED_MODEL_ALLOWLIST, SCOPED_MODEL_AMENDMENTS, assertMeteredCallAllowed, isMeteredCallAllowed
- src/lib/llm/program-total.mjs (5): sumCostRows, readProgramTotalPaginated, fitsUnderCeiling, CEILING_BUFFER_USD, projectBatchFitsBuffer
- src/lib/llm/spend-client.ts (9): SpendTicket, MONTHLY_TOTAL_DISPLAY_USD, logSpendRun, STANDING_TICKET_CLASSES, resetItemLedger, takeItemLedger, spentUsd, assertLedgerDrained, unloggedCallCount
- src/lib/llm/spend-gauge.mjs (2): computeGauge, hasPricedLineMarker
- src/lib/llm/spend-guard.mjs (7): SpendError, seedSpend, __resetSpendForTest, __addSpendForTest, assertPricedLine, pricedLineHalts, PricedLineError
- src/lib/map/jurisdiction-rollup.ts (1): jurisdictionKeys
- src/lib/market/carbon-intensity.mjs (1): SUPPORTED_BASES
- src/lib/market/carrier-ets-surcharge-envelope.mjs (3): carrierSlug, rowKey, isVerbatimSpan
- src/lib/market/headline-series-select.mjs (2): HEADLINE_VISIBLE_CAP, hasComputedDelta
- src/lib/market/lead-time-position.mjs (1): isSbtiSeriesKey
- src/lib/market/market-rail-select.mjs (2): NEXT_DROPS_ROW_CAP, CARBON_CORRIDOR_ROW_CAP
- src/lib/market/oil-bulletin-workbook.mjs (3): decodeOoxmlText, parseDateCell, extractLatestEuRow
- src/lib/market/parsers/eu-weekly-oil-bulletin.mjs (1): PRODUCTS
- src/lib/market/refresh-published-price-statistics.mjs (2): splitEnvelopeUnit, formatValueDisplay
- src/lib/market/resolve-item-corridor.mjs (2): STATES, parseCorridorCanonicalName
- src/lib/market/series-board-view-model.mjs (1): formatSeriesValue
- src/lib/market/series-deltas.mjs (2): DELTA_WINDOWS, buildComparativeRibbon
- src/lib/market/series-family.mjs (1): SERIES_FAMILIES
- src/lib/market/series-freshness.mjs (1): cadenceNameForDays
- src/lib/market/series-registry.mjs (1): implementedProducers
- src/lib/market/signal-promotion.mjs (1): PROMOTION_STATE
- src/lib/market/write-market-series.mjs (1): REFRESHABLE_FIELDS
- src/lib/obligations/classify-binding-position.mjs (1): BINDING_POSITION_RULES
- src/lib/obligations/read-register.mjs (12): OBLIGATION_TEXT_TRIM_LENGTH, nextDueSegment, compareByNextDue, planRegisterPageSegments, trimObligationText, buildRegisterQuerySpec, matchesDueWindow, selectRegisterRows, filterJoinedRows, filterJoinedRowsPage, matchingJurisdictionCodes, tallyRegisterFacets
- src/lib/operations/labour-chain.ts (2): NUMERATOR_TERM_ORDER, CHAIN_TERM_ORDER
- src/lib/operations/region-grid.mjs (1): orderRegions
- src/lib/operations/statements.mjs (4): ELIGIBLE_ORIGIN_CLASSES, NEEDS_SECOND_REGION, hasVerdictWord, humaniseFactLabel
- src/lib/perf/server-timing-core.ts (1): sanitizeTimingName
- src/lib/perf/server-timing.ts (5): getTimingSnapshot, recordPhase, recordBytesPhase, logTimingLine, getServerTimingHeaderValue
- src/lib/propagation/aggregate-safeguards.mjs (7): bucketWidthMultiplier, bucketValue, isDominant, isExactComplement, findComplementOfPrior, isWithinFreezeWindow, isForwardLookingRefusal
- src/lib/propagation/author-edges.mjs (1): hasBeenAuthored
- src/lib/propagation/drain.ts (7): DrainClient, DrainQueryBuilder, resolveInferenceDeclaredInputs, RunPropagationDrainOptions, DrainEventError, ProcessedEvent, DrainResult
- src/lib/propagation/effective-confidence.mjs (1): ageDaysAtFloor
- src/lib/propagation/methods/index.ts (4): methodKey, registerMethod, METHODS, __clearRegistryForTests
- src/lib/propagation/methods/infer-from-question.ts (7): METHOD_ID, METHOD_VERSION, computeInferFromQuestion, validateRegisterInferenceRecordInput, firstInferenceComputedBy, buildFirstInferenceInput, itemIdOfQuestionRef
- src/lib/propagation/methods/market-series-delta.ts (1): lifecycleFromOriginClasses
- src/lib/propagation/methods/signpost-watch.ts (2): nextLifecycleState, SignpostFireClient
- src/lib/propagation/register-derivation.ts (1): validateRegisterDerivedValueInput
- src/lib/regional/eurostat-lc-lci-lev-parser.mjs (2): latestLcLciLevValueForGeo, decodeJsonStat
- src/lib/regional/regional-facts-envelope.mjs (2): ENVELOPE_PAYLOAD_KEYS, formatDisplayValue
- src/lib/regional/state-cost-facts-envelope.mjs (3): originClassForTier, parseNumericValue, isVerbatimSpan
- src/lib/research/read-assessments.mjs (2): technicalMaturityLabel, commercialMaturityLabel
- src/lib/research/read-signposts.mjs (2): summarizePredicate, daysSince
- src/lib/research/taxonomy.mjs (3): THEME_KEYWORDS, SEVERITY_KEYS, SEVERITY_COLUMN_TO_KEY
- src/lib/research/theme-brief.mjs (5): selectThemeBriefForItem, MAX_MEMBERS_PER_PAGE, MAX_THEME_LABEL_CHARS, THEME_SIGNAL_PHRASES, deriveThemeLabel
- src/lib/sources/access-wall.mjs (2): ACCESS_WALL_KIND, looksLikeEurlexInterfaceShell
- src/lib/sources/acquire-lock.mjs (1): ACQUIRE_FLAG
- src/lib/sources/amendment-diff.mjs (5): normHash, segmentByShape, segmentTextDiff, alignSegments, toTimelineEvents
- src/lib/sources/api-transport.mjs (2): fetchFederalRegisterDocument, fetchEcfrTitle
- src/lib/sources/bias-tag-pipeline.mjs (2): ASSIGNMENT_SOURCE, splitBiasTagsByConfidence
- src/lib/sources/browserless.ts (2): BrowserlessOptions, BrowserlessResult
- src/lib/sources/change-sweep.mjs (4): sweepChangedSource, sweepAllChangedSources, summarizeAmendmentDiff, fingerprintChangedNote
- src/lib/sources/charset-decode.mjs (3): normalizeCharsetLabel, charsetFromContentType, charsetFromMeta
- src/lib/sources/content-change.mjs (1): normalizeForFingerprint
- src/lib/sources/entity-gate.mjs (3): ENTITY, entityVerdict, shouldMintItem
- src/lib/sources/feed-discovery.mjs (1): FEED_CANDIDATE_PATHS
- src/lib/sources/freshness-probe.mjs (1): compareFreshness
- src/lib/sources/holdings-audit.mjs (1): structuralTruncation
- src/lib/sources/holdings-gate.mjs (2): SNAPSHOT_STUB_MAX, MIN_USABLE_POOL_ROWS
- src/lib/sources/identifier-variants.mjs (11): separatorVariants, toCelex, euTypeLetters, celexTxtUrl, eliUrl, eurlexSearchUrl, LEGISLATION_UK_PORTAL_URL, ukCandidates, usCandidates, genericSearchQueries, rankCandidates
- src/lib/sources/instrument-identity.ts (2): parseInstrumentIdentity, classifyIdentity
- src/lib/sources/null-tier-host-worklist.mjs (1): NULL_TIER_RESOLVED_BY
- src/lib/sources/officialness.mjs (1): hasInstrumentMarkers
- src/lib/sources/primary-fallback.mjs (1): targetLangRatio
- src/lib/sources/promote-provisional.ts (1): PROVISIONAL_SOURCES_STATUS_CHECK
- src/lib/sources/reachability.mjs (1): classifyReachability_LEGACY_BUGGY
- src/lib/sources/register-walk.mjs (5): frDocumentsUrl, frDocsToLinks, dateRange, looksLikeOjDailyView, ojDailyViewUrl
- src/lib/sources/seek-more.mjs (8): eurlexCandidates, ukCandidates, lovdataCandidates, gazetteCandidates, apiCandidates, exhaustionFlagRow, acquisitionRequestRecord, seekAnswerForQuestion
- src/lib/sources/sitemap-walk.mjs (22): parseRobotsSitemapLines, sitemapFallbackCandidates, sourceContentPath, isUrlWithinSourcePath, filterEntriesForSource, looksGzippedUrl, looksGzippedBuffer, decodeXmlBody, DEFAULT_MAX_SITEMAP_RESPONSE_BYTES, DEFAULT_MAX_FEED_RESPONSE_BYTES, checkResponseBytes, sitemapRootKind, parseUrlsetEntries, parseSitemapIndexEntries, parseSitemapXml, dedupeByLoc, diffUrlSet, mergeSnapshotEntries, walkSitemap, probeIsFeed, discoverFeed, isBotWallStatus
- src/lib/sources/source-type-taxonomy.mjs (4): SOURCE_TYPES, CLASSIFIABLE_SOURCE_TYPE_VALUES, sourceTypeLabel, isValidSourceTypeArray
- src/lib/sources/transport-escalation.mjs (6): CLASS, classifyTransportResult, isNotFound, isJsShell, isBlock, selectTransportOrder
- src/lib/sources/verify-item.mjs (4): STALE_FLAG, decideVerify, writeStaleFlag, logAcquireJustification
- src/lib/spec09/auxiliary-energy.mjs (2): convertKwhToGco2e, compareToLegEmissions
- src/lib/spec09/indexation.mjs (1): draftClauseText
- src/lib/spec09/label.mjs (3): SPEC09_LABELS, spec09Label, isStatutoryLabel
- src/lib/spec09/oem-payload.mjs (1): computePayloadPenalty
- src/lib/statutory/fueleu-annex-iv.mjs (3): FUELEU_VLSFOE_MJ_PER_TONNE, FUELEU_RFNBO_NOT_IMPLEMENTED_REASON, computeFuelEuPenaltyRfnbo
- src/lib/surface-of.mjs (3): DEFAULT_SURFACE, SURFACE_RULES, renderSurfaceOfSql
- src/lib/tags/attribution.ts (1): formatAppliedDate
- src/lib/tags/server.ts (2): TagsSupabaseClient, tagNameKey
- src/lib/telemetry/stack-hash.mjs (2): normalizeMessage, normalizeStack
- src/lib/telemetry/surface-health.mjs (2): MUST_HAVE_SURFACES, ZERO_LEGAL_SURFACES
- src/lib/urgency/bands.ts (1): daysUntil
- src/lib/url-params/regulations-region-link.ts (3): REGULATIONS_REGION_PARAM, normalizeRegionIsoCodes, parseRegulationsRegionParam
- src/lib/vocabulary/adopted-entities.mjs (2): ADOPTED_ENTITY_KINDS, planAdoptedTermEntities
- src/lib/vocabulary/adopted-terms.mjs (5): ADOPTED_KINDS, emptyAdopted, groupAdoptedTerms, unionVocabulary, themeToken
- src/lib/watchlist-scope.ts (1): TEAM_ONLY_TYPES
- src/lib/watchlist/membership.ts (2): buildWatchMembership, __resetClientWatchMembershipCacheForTests
- src/lib/workspace/profile.ts (4): WorkspaceOrgSize, WorkspaceProfile, DEFAULT_WORKSPACE_PROFILE, ItemApplicability
- src/test-support/fake-supabase.mjs (1): fakeSupabase
- src/types/source.ts (17): SOURCE_TIER_DEFINITIONS, TrustEventType, TrustEvent, TrustEventDetails, ConfirmationDetails, ConflictOpenedDetails, ConflictResolvedDetails, AccessibilityCheckDetails, CitationReceivedDetails, TierChangeDetails, ManualReviewDetails, StaleFlagDetails, PaywallChangeDetails, SelfCitationDetails, DiscoveryDetails, SOURCE_STATUS_DEFINITIONS, DOMAIN_DEFINITIONS
- src/workflows/generate-brief.ts (1): eraseStep

### 2d. C name-elsewhere, non-convention (202 symbols in 120 files) [HYPOTHESIS]

- .discipline/fitness/functions/F20-pause-flag-one-writer.mjs (1): SANCTIONED
- .discipline/fitness/functions/F35-row-ux-coverage.mjs (1): REGISTRY
- .discipline/fitness/functions/F45-duplicate-code.mjs (1): changedFiles
- .discipline/fitness/functions/F51-no-shared-append.mjs (1): currentBranch
- .discipline/governance/db-object-reference.mjs (1): stripSqlComments
- .discipline/governance/docs-only-range.mjs (1): changedFiles
- .discipline/governance/exemptions.mjs (1): EXEMPTIONS
- .discipline/governance/secrets-registry.mjs (1): TOPOLOGY
- .discipline/governance/skill-map.mjs (1): GOVERNED
- .discipline/lib/no-npm-sandbox.mjs (1): resolve
- .discipline/rendering/layout-guard/manifests.mjs (1): normaliseCardTitle
- .discipline/rendering/live/live-smoke.mjs (2): VIEWPORTS, signIn
- .discipline/rendering/smoke/guard-assert.mjs (1): detectBoundsViolations
- scripts/classification/propose-classifications.mjs (1): MIN_ITEMS_FOR_DRIFT_CHECK
- scripts/connections/raise-term-needs.mjs (2): CITE, buildDeps
- scripts/drain/artifact.mjs (1): FAMILY
- scripts/gen/fetch-desnz-factors.mjs (1): NetworkError
- scripts/inventories/generate-migrations-inventory.mjs (1): REPO
- scripts/lib/admin-phrase-scan.mjs (2): FORBIDDEN, ALLOWLIST
- scripts/lib/assemble-train.mjs (1): CITE
- scripts/lib/decision-anchors.mjs (4): ANCHORS, evaluateAnchor, evaluateAll, loadContext
- scripts/lib/drift-check.mjs (2): evaluateAnchor, textGrepHas
- scripts/lib/exclusion-audit.mjs (2): UNRELIABLE_METHODS, auditExclusions
- scripts/lib/fetch-negative-probe.mjs (1): KNOWN_ANSWERS
- scripts/lib/funded-pass-lock.mjs (1): emergencyPaused
- scripts/lib/inconclusive-probe.mjs (2): KNOWN_ANSWERS, auditInconclusive
- scripts/lib/surface-registry.mjs (1): auditContentFetch
- scripts/lib/verify.mjs (1): VerifyError
- scripts/maintenance/backfill-format-type.mjs (1): CITE
- scripts/maintenance/canonical-autoverify.mjs (1): CITE
- scripts/maintenance/canonical-key-dedup.mjs (6): CITE, RESTORE_CITE, ARCHIVE_REASON, SWEEP_MARKER, RESTORE_ARG_PREFIX, SELECTION_SQL
- scripts/maintenance/census-off-vertical.mjs (1): SAMPLE_SIZE
- scripts/maintenance/close-acquire-primaries-holds.mjs (1): CITE
- scripts/maintenance/close-coverage-reflections.mjs (1): CITE
- scripts/maintenance/close-flags-for-verified-items.mjs (1): CITE
- scripts/maintenance/close-legal-confirmation-rows.mjs (1): CITE
- scripts/maintenance/enumerate-unclassified-hosts.mjs (1): CITE
- scripts/maintenance/finish-staged-updates.mjs (1): CITE
- scripts/maintenance/forward-events-retext.mjs (3): CITE, RESTORE_CITE, RESTORE_ARG_PREFIX
- scripts/maintenance/gate-a-rescan.mjs (1): buildDeps
- scripts/maintenance/lib/flag-url-extract.mjs (1): URL_RE
- scripts/maintenance/lineage-gap-targets.mjs (1): CITE
- scripts/maintenance/plan-quarantine-disposition.mjs (1): main
- scripts/maintenance/record-hollow-sweep.mjs (1): SELECTION_SQL
- scripts/maintenance/resolve-cited-host-gate.mjs (2): planHostDecision, buildNullTierHostWrite
- scripts/maintenance/resolve-refetch-holds.mjs (1): CITE
- scripts/maintenance/resolve-signals.mjs (2): RESOLVED_BY, CITE
- scripts/maintenance/retype-eu-decisions.mjs (2): CITE, claimCoversSlot
- scripts/maintenance/timeline-backfill.mjs (1): CITE
- scripts/mint/heal-provenance.mjs (1): REG_FAMILY
- scripts/obligations/derive-obligations.mjs (1): CITE
- scripts/plan-quarantine-disposition.mjs (1): FAMILY
- scripts/producers/market/carrier-ets-surcharge-producer.mjs (7): ENABLED, PRODUCER_NAME, HARNESS_FAMILY, buildRunArtifact, DEFAULT_HARNESS_RUNS_DIR, FSI_ROOT, REGISTRY_ENTRY
- scripts/producers/market/sbti-target-dashboard-producer.mjs (1): NetworkError
- scripts/producers/regional/state-cost-facts-producer.mjs (6): PRODUCER_NAME, resolveSource, DEFAULT_HARNESS_RUNS_DIR, hashHarnessVersion, claimRunId, writeRunArtifact
- scripts/producers/research/research-assessment-producer.mjs (2): HARNESS_FAMILY, ENABLED
- scripts/proof/attacks/run-attacks.mjs (2): MANIFEST_PATH, KINDS
- scripts/proof/load-subset.mjs (1): ACTOR
- scripts/propagation/write-statutory.mjs (3): DEFAULT_OBLIGATION_SEED, FUELEU_REFERENCE_GCO2E_PER_MJ, ARTICLE_4_2_CITATION
- scripts/research/backfill-themes.mjs (1): CITE
- scripts/research/research-walker.mjs (2): HARNESS_FAMILY, ENABLED
- scripts/sources/inaccessible-triage.mjs (1): CITE
- scripts/turns/apply-need-urls.mjs (1): RESOLVED_BY
- scripts/turns/apply-question-answers.mjs (2): CITE, RESOLVED_BY
- scripts/turns/apply-theme-briefs.mjs (1): CITE
- scripts/turns/dry-run-structured-actions.mjs (1): FAMILY
- scripts/turns/export-needs-for-search.mjs (1): DEFAULT_LIMIT
- scripts/turns/export-questions-for-answers.mjs (2): DEFAULT_CHAR_BUDGET, DEFAULT_LIMIT
- scripts/turns/import-stranded-harness-branches.mjs (1): buildRow
- scripts/turns/io-preflight.mjs (2): REQUEST_TIMEOUT_MS, CITE
- scripts/turns/needs-search/schema.mjs (1): CEILINGS
- scripts/turns/question-answers/artifact.mjs (1): FAMILY
- scripts/turns/question-answers/schema.mjs (1): OUTCOMES
- scripts/turns/theme-briefs/artifact.mjs (2): FSI_ROOT, FAMILY
- scripts/turns/theme-briefs/data.mjs (3): THEME_COLUMNS, MEMBER_COLUMNS, EDGE_COLUMNS
- scripts/turns/theme-briefs/schema.mjs (1): SECTION_HEADINGS
- scripts/verify/defect-signature-scan.mjs (6): REUSE_MIN, NAMED_ACTS, extractIdentifiers, spanHasIdentifier, detectConflate, extractNumbers [HYPOTHESIS: listed by the method of this section, deadness not verified] [CLOSED: PR 1087]
- scripts/verify/derivation-edges-rls-adversarial-audit.mjs (1): runAudit
- scripts/verify/harness-runs-rls-adversarial-audit.mjs (1): runAudit
- scripts/verify/population-report.mjs (1): DEFAULT_MINT_HARNESS_RUNS_DIR
- src/components/admin/corrections/model.mjs (1): OPS_BY_KIND
- src/components/admin/PartsList.tsx (1): PartEntry
- src/components/admin/redesign/MembersPanel.tsx (1): MembersPanelProps
- src/components/community/types.ts (1): CommunityProfile
- src/components/detail/SourcesGrid.tsx (1): SourceRow
- src/components/figures/EstimatedFigure.tsx (1): EstimatedFigure
- src/components/figures/StatutoryFigure.tsx (1): StatutoryFigure
- src/components/market/LeadTimeChart.tsx (1): RawMarketSeriesRow
- src/components/regulations/UpcomingObligationsStripView.tsx (1): KIND_LABELS
- src/components/resource/IntelligenceBrief.tsx (1): stripSourcesSection
- src/components/resource/SectorSynopsis.tsx (1): SectorSynopsisView
- src/components/sources/ProvisionalReviewTable.tsx (1): hostOf
- src/components/ui/Absence.tsx (1): NEEDS_PHRASE
- src/components/ui/FactCard.tsx (2): FactCardModel, ClaimNode
- src/components/ui/MilestoneTimeline.tsx (2): classifyTimelineEntries, TimelineDotState
- src/components/ui/RelativeTime.tsx (2): stableDateLabel, relativeTimeLabel
- src/components/ui/SectionIndex.tsx (1): SECTION_INDEX_SHORT_NAME_MAX
- src/lib/admin/parts-registry.ts (1): PartEntry
- src/lib/agent/audit-gate.ts (2): ClaimRow, scoreItemClaims
- src/lib/agent/extract-sections.ts (2): extractOperationalBriefing, SEVERITY_LABELS
- src/lib/agent/gate-a-scan.mjs (1): md5
- src/lib/classification/expected-output.mjs (1): AXIS5_OUT_OF_SCOPE
- src/lib/constants.ts (4): PRIORITY_COLORS, CATEGORIES, Priority, Category
- src/lib/d3/hooks.mjs (1): UNRELIABLE_METHODS
- src/lib/data.ts (9): PUBLIC_ITEMS_TAG, getCoverageGaps, CoverageGap, ReviewItem, ScopeFilter, CategoryRoutedResult, ResourcePage, ResearchPipelineRow, ResearchSourceCoverageCell
- src/lib/detail/load-detail.ts (4): DETAIL_CACHE_REVALIDATE_SECONDS, ItemScopedCtx, ViewerScopedCtx, DetailDeps
- src/lib/format.ts (1): FIXED_LOCALE
- src/lib/intake/write-item.ts (4): CitationEdgeRow, SectionRow, ClaimRow, Cite
- src/lib/jurisdictions/iso.ts (1): KNOWN_FREE_TEXT_JURISDICTIONS
- src/lib/learning/constants.mjs (1): SURFACES
- src/lib/learning/prediction-scoring.mjs (2): CITE, OUTCOMES
- src/lib/llm/haiku-classify.ts (4): VERIFICATION_HAIKU_SYSTEM_PROMPT, AiTrustTier, __internals, HAIKU_MODEL
- src/lib/llm/spend-regime.mjs (1): SPEND_REGIME
- src/lib/perf/server-timing.ts (3): COLD_START_UPTIME_SECONDS, PerfTimingStore, PerfPhaseRecord
- src/lib/scoring.ts (1): urgencyScore
- src/lib/sources/entity-gate.mjs (1): errorMarkerCount
- src/lib/sources/instrument-identity.ts (1): IdentityStatus
- src/lib/statutory/types.ts (5): Contractable, NonContractable, StatutoryInput, StatutoryResult, AsOfTriple
- src/types/resource.ts (2): Cluster, RecommendedAction
- src/workflows/generate-brief.ts (4): generateStep, growStep, linkStep, spanCheckClaim

### 2e. C convention-loaded, treated live (188 symbols in 169 files)

Names: invariant 151, fitnessFunction 3, stub-* alias exports 34. Files not listed individually.

## 3. React components never mounted

Method [CONFIRMED]: all 230 `.tsx` files under src (excluding Next entry files, tests, _archive) were parsed for PascalCase exported components (334 exports incl. constants sharing the file) and `export default`; usage = the local binding of a resolved import (default, named, aliased, namespace member, barrel re-export, `next/dynamic(() => import())`) appearing outside import statements in a non-test importer. 38 exports had no such use; 31 of those are SCREAMING_CASE constants (listed under category 2, not components), 3 (`DataSummary`, `SavedSearchesSection`, `SupersessionHistory`) are false positives of the parser that `git grep` shows mounted in `components/pages/SettingsPage.tsx` through `dynamic(...then((m) => ({ default: m.X })))`. Result after hand-verifying every remaining one with `git grep -n -w` over src, .discipline, scripts: **4 components with zero JSX or value use anywhere (no page, no component, no rendering-audit smoke, no F35 spec, no test), plus 2 components mounted only by one of those 4**. Unreferenced non-exported local components: 0 (checked every PascalCase `function`/`const` in every `.tsx`).

| # | Component | File | Evidence |
|---|---|---|---|
| 1 | SubTabBar | src/components/account/AccountPrimitives.tsx:23 | name appears once in all of src, .discipline, scripts: its own definition (file is live; the other exports are used) |
| 2 | EstimatedFigure | src/components/figures/EstimatedFigure.tsx:69 | only mentions: its definition and a comment in F25; the file stays live through its sibling export `DerivedFigure` (imported by MarketSignalDetailSurface.tsx:65). Spec 08 section 4 Layer 1 component with no caller |
| 3 | StatutoryFigure | src/components/figures/StatutoryFigure.tsx:52 | no importer; F25 LEGACY_ALLOWLIST (system-completion train: wait for a filing page) |
| 4 | SectorSynopsisView | src/components/resource/SectorSynopsis.tsx:219 | no importer; F25 LEGACY_ALLOWLIST ("ui-liveness ruling: mount or delete"); F47 also records the intelligence_summaries table it reads as SHELVED 2026-04-30 |
| 5 | IntelligenceBrief | src/components/resource/IntelligenceBrief.tsx | importer is only SectorSynopsis.tsx (row 4); not in F25 output because F25 counts any non-test importer as liveness |
| 6 | IntelligenceMetadataStrip | src/components/resource/IntelligenceMetadataStrip.tsx | importer is only SectorSynopsis.tsx (row 4); `.claude/CLAUDE.md` still lists it under "Phase B.2.5 surfaces" Key Files |

[HYPOTHESIS] Rows 2 and 3 are published-contract-ahead-of-caller (spec 08 statutory/estimate isolation), not abandoned work; rows 4 to 6 are the retired per-sector synopsis surface.

## 4. API routes with no caller in src

Method [CONFIRMED]: all 104 `src/app/api/**/route.*` files; for each route path a regex built from its segments (dynamic `[x]` segments match any `${...}` or literal segment, trailing-segment guard so `/api/a` does not match `/api/a/b`) was run over non-comment lines of every non-test src module (callers), then of test code, scripts/.discipline, `.github/workflows`, `docs/runbooks/**` and `vercel.json`. 92 routes have at least one src caller (89 by the direct regex plus 3 the regex missed: `/api/admin/items/[id]/corrections/[correctionId]/revoke` is built as `${base(itemId)}/${encodeURIComponent(correctionId)}/revoke` in src/components/admin/corrections/model.mjs:182, and `/api/community/invitations/[id]/accept` and `/decline` are built as `/api/community/invitations/${invitation.id}/${action}` in CommunityShell.tsx:300). 12 have no src caller; 8 of those are reached by a workflow, script or runbook; 4 are reached by nothing. `vercel.json` has no crons. 2 more routes are called only by dead code.

### 4a. Dead route candidates (6)

| # | Route | Methods | Evidence | Confidence |
|---|---|---|---|---|
| 1 | /api/admin/users | GET, POST | no path string in src, scripts, workflows, runbooks; only doc mentions are fsi-app/docs/SCOPE_AUDIT.md and an archived 2026-04 session log; src/app/api/orgs/[org_id]/members/route.ts:16 comment calls it "the provision flow" | [CONFIRMED: regex + git grep] |
| 2 | /api/auth/linkedin/start | GET | no caller; src/components/onboarding/OnboardingWizard.tsx:50 comment says the wizard step "replaces" the LinkedIn import path; the route and logic.ts remain | [CONFIRMED: regex + git grep] |
| 3 | /api/workspace/members | GET | only mention is a comment in src/components/regulations/OwnerTeamCard.tsx:17; the card now reads `bootstrap?.members` from /api/workspace/bootstrap | [CONFIRMED: regex + git grep] |
| 4 | /api/version | GET | no caller; documented in fsi-app/.claude/CLAUDE.md as an operator-approved public route "so audits anchor to a git ref" | [CONFIRMED] no caller; [HYPOTHESIS] an external auditor or manual curl is the intended consumer |
| 5 | /api/auth/linkedin/callback | GET | its only src reference is src/app/api/auth/linkedin/start/route.ts (row 2) | [CONFIRMED]: transitively dead |
| 6 | /api/intelligence-items/[id]/metadata | GET | its only caller is src/components/resource/IntelligenceMetadataStrip.tsx:78, a component mounted by nothing (category 3 row 6); src/lib/agent/severity-ui-bucket.test.mjs mentions it in a comment | [CONFIRMED]: transitively dead |

### 4b. No src caller but reached by a workflow, script or runbook (8, not counted as dead)

| Route | Reached by |
|---|---|
| /api/admin/recompute-trust | .github/workflows/maintenance.yml; runbooks maintenance.d/58 and 66 |
| /api/admin/spot-check/recurring | .github/workflows/spot-check-monthly.yml; docs/runbooks/SPOT-CHECK-PROCEDURE.md |
| /api/admin/sources/[id]/bias-tags | docs/runbooks/maintenance.d/46-resolve-provisional-sources.md only (PATCH; the route has no UI or script caller) |
| /api/health/spend | .github/workflows/uptime-probes.yml |
| /api/health/surfaces | .github/workflows/uptime-probes.yml |
| /api/revalidate | corpus-turn.yml, maintenance.yml and 3 more workflows; scripts/lib/revalidate.mjs |
| /api/worker/check-sources | change-detection.yml, source-monitoring.yml; scripts/turns/run-change-detection.mjs; CORPUS-TURN-RUNBOOK.md |
| /api/worker/reconcile | change-detection.yml; CORPUS-TURN-RUNBOOK.md |

[HYPOTHESIS] The workflows that reach rows in 4b are all workflow_dispatch-only while scrape_cadence is off (standing rule 16), so these routes are armed but not currently exercised on any clock.

## 5. Database tables and views with no reader, with a reader but no writer, and empty with no producer

Method [CONFIRMED]: the repo's own F47 scanTree() and F14 scanCode/scanSql (.discipline/governance/db-object-reference.mjs, producer-consumer-orphan.mjs) run read-only: schema replayed statement by statement from 325 committed migration files = **115 tables, 7 views, 112 functions**; code scope = 1,214 non-test files under src, scripts, .github. No database was queried (the raw 2026-10-04 inventory is not on disk; only its narrative in docs/plans/system-map-2026-10-04.md section 17 was used for row counts, and that section says its own summary line ("160 tables, 36 empty") contradicts its table of 110 tables, 30 empty, of which the map names 16). F47 itself is green: 0 unreferenced tables, 0 unread tables beyond the allowlist, 0 unreferenced functions. The counts below are stricter than F47 because they require a reader in src or scripts code, not any SQL mention.

### 5a. Tables with no code reader (14 by the F14 scanner: no .from(t).select, readAll, readAllByIds or embedded select)

| # | Table | Defined in | Writer | Disposition after hand check | Status |
|---|---|---|---|---|---|
| 1 | intelligence_summaries | mig 009 | none | zero src/scripts usage; F47 ALLOWLIST "SHELVED, not retired", operator 2026-04-30; .claude/CLAUDE.md Sector Activation section keeps it | [CONFIRMED] no reader, kept by ruling |
| 2 | bulk_imports | mig 038 | src/app/api/admin/sources/bulk-import/route.ts | write-only job record; F14 TERMINAL_SINK_ALLOWLIST "DISPOSITION PENDING Phase 7", grandfathered 2026-07-03 | [CONFIRMED] |
| 3 | intelligence_item_versions | mig 053 | trigger only | zero src/scripts usage; trigger-written, one SQL reference | [CONFIRMED] no code reader; [HYPOTHESIS] SQL reader is incidental |
| 4 | system_state_flag_audit | mig 201 | trigger only | zero src/scripts usage; F47 ALLOWLIST terminal sink 2026-09-17 | [CONFIRMED] |
| 5 | mutation_leases | mig 211 | DB functions | zero src/scripts usage outside pk map and proof export list; managed by SQL functions | [CONFIRMED] no code reader; [HYPOTHESIS] DB-internal control table |
| 6 | disposition_ledger | mig 213 | scripts (guardedInsert) | write-only; F14 allowlist "designed-as write-only institutional memory", Phase 7 | [CONFIRMED] |
| 7 | coverage_gap_candidates | mig 214 | DB/SQL; apply-coverage-gaps.mjs updates | reader found by hand: scripts/maintenance/review-apply-coverage-gaps passes the table name through a variable to readAllByIds, which the regex cannot see | [REFUTED] as dead; live |
| 8 | coverage_gap_census_findings | mig 222 | none in repo | zero src/scripts usage; read only by view census_rollup_by_surface (itself unread, 5b) | [CONFIRMED] |
| 9 | gate_a_health_cache | mig 256 | DB function gate_a_health_refresh (F47 allowlist, unscheduled by operator ruling 2026-08-10) | read through RPC gate_a_health() served by /api/health/surfaces | [REFUTED] as dead; live via RPC |
| 10 | data_sources | mig 258 | DB seed | read through views licence_clear_sources and emission_factor_candidates, whose only code mention is the SQL renderer src/lib/contracts/factor-tier.mjs | [HYPOTHESIS] |
| 11 | statutory_computations | mig 286 | src/lib/propagation/statutory-rows.ts:369 | written, never read in code; 0 rows per 2026-10-04 inventory | [CONFIRMED] |
| 12 | estimated_values | mig 286 | none | no code reference except pk map and a db.test fixture; 0 rows per 2026-10-04 inventory; register owed item 35 says it has no consumer after ADR-043 | [CONFIRMED] |
| 13 | sensitive_field_policy | mig 287 | DB seed/migration 347 | only scripts/proof attacks, pk map, docs/inventories/shared-dataset-ownership.md; companion of publish_aggregate(); customer-data/Community benchmark layer removed by ADR-042 (migration 349) | [CONFIRMED] no code reader; [HYPOTHESIS] vestigial after ADR-042 |
| 14 | aggregate_query_log | mig 287 | DB function publish_aggregate() | same as above | [CONFIRMED] no code reader; [HYPOTHESIS] vestigial after ADR-042 |

Count: **14 by scanner, 12 after hand check** (2 refuted: coverage_gap_candidates, gate_a_health_cache). Of the 12, 4 are reason-bearing allowlisted sinks (intelligence_summaries, system_state_flag_audit by F47; bulk_imports, disposition_ledger by F14).

### 5b. Views with no consumer

| # | View | Defined in | Evidence | Status |
|---|---|---|---|---|
| 1 | census_rollup_by_surface | mig 222 | zero code mentions, zero SQL consumers (its own CREATE and COMMENT only), not in a runbook or workflow | [CONFIRMED: grep migrations, src, scripts, runbooks, .github] |
| 2 | acquisition_backlog_v | mig 223 | zero code mentions, zero SQL consumers | [CONFIRMED] |
| 3 | propagation_queue_depth | mig 284 | zero code mentions; SQL mentions are its own CREATE, COMMENT and a NOTICE; designed as an operator monitoring view | [CONFIRMED] no consumer; [HYPOTHESIS] intended for hand SQL |
| 4 | derived_values_admissible | mig 285 | zero code mentions; only its own probe and a GRANT; migration 344 comment says to enforce admissibility "via code review" | [CONFIRMED] no consumer; [HYPOTHESIS] the spec 3.3 second enforcement point has no reader |
| 5 | licence_clear_sources | mig 258 | only code mention is the SQL-text renderer src/lib/contracts/factor-tier.mjs | [HYPOTHESIS] |
| 6 | emission_factor_candidates | mig 258 | same | [HYPOTHESIS] |

The 7th view, research_assessments_current (mig 346), is read by 4 files. Count: **4 confirmed + 2 hypothesis = 6 of 7 views have no production code reader.**

### 5c. Tables with a code reader but no writer anywhere in the repo (F14 read-orphans: 5)

| # | Table | Reader | Writer evidence | Status |
|---|---|---|---|---|
| 1 | sector_contexts | src/lib/supabase-server.ts:3063, supabase/seed/add-building-standards.mjs | no INSERT in migrations, seed .sql or code | [CONFIRMED: grep]; rows may be hand-entered, unknown |
| 2 | community_topics | src/lib/community/shell-context.ts:75 | none (no seed, no migration insert) | [CONFIRMED: grep] |
| 3 | community_topic_groups | src/lib/community/shell-context.ts:76 (embedded select) | none | [CONFIRMED: grep] |
| 4 | state_cost_facts | scripts/producers/regional/state-cost-facts-producer.mjs (readAllFn) | writer exists but is the R14-held unwired producer (guardedInsertFn, not recognised by the scanner) | [REFUTED] as writer-less; writer is allowlisted-unwired (category 1 row 23) |
| 5 | corpus_census | scripts/_reground/tombstone-delete.mjs:55 | no writer in repo; migration 212 only | [CONFIRMED: grep] |

Count: **4 confirmed, 1 refuted.**

### 5d. Tables at 0 rows per the 2026-10-04 inventory (as named in docs/plans/system-map-2026-10-04.md section 17) and whether a producer exists

| Table | Producer in repo | Reader in repo | Status |
|---|---|---|---|
| estimated_values | none (no code writer, no RPC caller) | none | [CONFIRMED] empty, no producer, no reader |
| inference_records | scripts/turns/apply-question-answers.mjs:342 via rpc register_inference_record, only under --execute; workflow question-answers has never run | apply-question-answers.mjs, question-answers/data.mjs | [CONFIRMED] producer exists, never fired |
| statutory_computations | src/lib/propagation/statutory-rows.ts:369 | none | [CONFIRMED] producer exists, no reader |
| signposts | research-assessment-producer.mjs:552, signpost-watch.ts:274 | prediction-scoring.mjs, read-signposts.mjs | producer exists |
| research_assessments | research-assessment-producer.mjs:530, signpost-watch.ts:311 | prediction-scoring.mjs, read-signposts.mjs | producer exists; workflow research-assessment ran 2026-10-03 (success) |
| oem_tech_roadmaps | scripts/spec09/oem-roadmap-producer.mjs | OemRoadmapPanel.tsx | producer exists |
| grid_connection_queues | scripts/spec09/grid-queue-producer.mjs | GridQueuePanel.tsx | producer exists |
| reroute_events | scripts/spec09/reroute-producer.mjs | ReroutingPanel.tsx | producer exists |
| auxiliary_energy_profiles | scripts/spec09/auxiliary-energy-producer.mjs | AuxiliaryEnergyPanel.tsx | producer exists |
| indexation_clauses | scripts/spec09/indexation-producer.mjs | IndexationPanel.tsx | producer exists |
| workspace_tags, item_workspace_tags, user_item_state, org_watchlist, notifications, community_posts | user-driven API routes under src/app/api | routes and bootstrap | producer is a user action; empty because no user has acted |

Count: 16 named empty tables; **1 with no producer at all (estimated_values), 1 more whose only producer has never run (inference_records)**. The inventory summary says 30 empty tables; the other 14 are not named in any file on disk, so they are [HYPOTHESIS: unknown] and not counted.

### 5e. Headline for category 5

Dead-object candidates counted once each: 12 tables with no code reader (5a, after hand check) + 4 confirmed reader-without-writer tables (5c) + 6 views (5b, 4 confirmed + 2 hypothesis) = **22 distinct objects** (estimated_values is in 5a and not double counted). Of these 22, 4 are reason-bearing allowlisted sinks and 8 are [HYPOTHESIS] or DB-internal by design.

## 6. Columns referenced nowhere in code (20 largest tables) [HYPOTHESIS]

Method: the 20 largest tables by row count named in docs/plans/system-map-2026-10-04.md section 17 (portal_link_candidates, section_claim_provenance, item_cross_references, census_worklist, integrity_flags, agent_run_searches, source_bias_tags, entities, propagation_events, intelligence_items, market_series, item_gate_a_state, sources, corpus_turn_requests, source_verifications, pending_first_fetch, item_forward_events, obligations, claim_versions, source_trust_events). Column lists were rebuilt by replaying 325 migration files in filename order (CREATE TABLE bodies, then ALTER TABLE ... ADD COLUMN, DROP COLUMN, RENAME COLUMN) = **377 columns**. A column is a candidate when its name appears as a whole word on no non-comment line of any non-test code file under src, scripts, supabase/functions and .github (F47 code scope, minus scripts/lib/table-primary-keys.mjs, fixtures and scripts/tmp). Candidate count is **23 of 377 (6.1 percent)**. All 23 were re-checked with `git grep -n -w` (22 have zero non-test, non-comment hits anywhere; hidden_reason has hits only under scripts/_archive/phase-5-backfill.mjs). Limits, so the count is read as a floor-or-ceiling by the right reader: (1) a column read through `select("*")` or an RPC that returns the row type is invisible to a name grep, so each candidate is a [HYPOTHESIS] of "never used by name", not "never populated or served"; (2) generic names (status, id, created_at) hit trivially, so a dead column with a common name is missed (undercount); (3) columns added by an ALTER form the parser does not recognise (ADD without the COLUMN keyword) are missed; (4) no live information_schema read was done.

| # | Table.column | Defined in | Other SQL mentions | Note |
|---|---|---|---|---|
| 1 | section_claim_provenance.verified_by | 112_provenance_invariant_schema.sql | 2 |  |
| 2 | census_worklist.resolved_into_id | 221_census_worklist.sql | 4 |  |
| 3 | source_bias_tags.assigned_at | 092_source_bias_tags.sql | 2 |  |
| 4 | propagation_events.txid | 284_propagation_outbox.sql | 2 |  |
| 5 | intelligence_items.linked_forum_thread_ids | 007_community_layer.sql | 13 | migration 007 community layer, the forum layer later retired (CLAUDE.md "mig-007 forum layer" write-orphan history) |
| 6 | intelligence_items.linked_vendor_ids | 007_community_layer.sql | 15 | migration 007 community layer |
| 7 | intelligence_items.linked_regulation_ids | 007_community_layer.sql | 15 | migration 007 community layer |
| 8 | intelligence_items.region_tags | 007_community_layer.sql | 19 | migration 007 community layer |
| 9 | intelligence_items.hidden_reason | 062_intelligence_items_hidden_reason.sql | 14 | only code use is the archived scripts/_archive/phase-5-backfill.mjs; 14 SQL mentions |
| 10 | intelligence_items.provenance_verified_at | 112_provenance_invariant_schema.sql | 7 |  |
| 11 | intelligence_items.search_tsv | 159_intelligence_items_fts.sql | 5 | migration 159 full-text column; used inside SQL (RPC/index) not by name in code |
| 12 | sources.spotchecked | 036_admin_notifications_rpc.sql | 7 | migration 036 admin rpc column |
| 13 | sources.last_scanned | 051_sources_last_scanned_recovery.sql | 3 | .claude/CLAUDE.md post-mortem says agent/run once read it; no code reads or writes it now (migration 051 backfill column) |
| 14 | sources.last_content_fetched_at | 054_sources_scoreboard_columns.sql | 3 |  |
| 15 | sources.last_intelligence_item_at | 054_sources_scoreboard_columns.sql | 3 |  |
| 16 | sources.api_endpoint_url | 056_sources_access_method_extension.sql | 3 |  |
| 17 | sources.api_auth_method | 056_sources_access_method_extension.sql | 4 |  |
| 18 | sources.api_response_format | 056_sources_access_method_extension.sql | 4 |  |
| 19 | sources.classification_assigned_at | 063_sources_classification_axes.sql | 3 |  |
| 20 | sources.observed_correctness_count | 063_sources_classification_axes.sql | 2 |  |
| 21 | sources.classification_confidence | 067_sources_classification_metadata.sql | 3 |  |
| 22 | sources.classification_rationale | 067_sources_classification_metadata.sql | 3 |  |
| 23 | obligations.derived_at | 290_obligations.sql | 1 |  |

Per-table scan size (columns scanned / zero-code-hit candidates): portal_link_candidates 10/0, section_claim_provenance 14/1, item_cross_references 7/0, census_worklist 28/1, integrity_flags 12/0, agent_run_searches 10/0, source_bias_tags 7/1, entities 7/0, propagation_events 11/1, intelligence_items 83/7, market_series 16/0, item_gate_a_state 6/0, sources 87/11, corpus_turn_requests 6/0, source_verifications 15/0, pending_first_fetch 7/0, item_forward_events 13/0, obligations 14/1, claim_versions 17/0, source_trust_events 7/0.

[HYPOTHESIS] The 6 sources.api_* and classification_* columns (063, 067, 056 migrations) look like schema ahead of or beyond the code that was meant to populate them; the 4 intelligence_items migration-007 columns look like the retired forum layer.

## 7. Scripts referenced by no workflow, package.json script, runbook or other script

Method [CONFIRMED]: 377 non-test script files (.mjs .cjs .js .sh .py .ts) under fsi-app/scripts (excluding _archive, tmp, fixtures, harness-runs), fsi-app/supabase/seed and the repo-root scripts/ directory. A token index of every `*.mjs|js|sh|py|ts` path in every tracked workflow, package.json, runbook or scripts README, every other code file in fsi-app and .claude, and every other markdown file was built; a script counts as referenced when its three-segment path, parent/basename, or (when unique among tracked files) basename appears in a workflow, package.json, runbook or non-test code file other than itself and its own test. 31 scripts had no such reference; 4 are explained false positives (below), **27 remain**. F25 does not scope fsi-app/supabase/seed or the root scripts/ directory, and F25 scopes only .ts .tsx .mjs, which is why all 27 sit outside its gate (25 in supabase/seed, 1 root script, 1 .sh).

Explained (not counted):

- scripts/_reground/free-pass-run.mjs: registered in .discipline/governance/OUT-OF-REPO-BOUNDARY.md Operator-CLI register (F25 dispatch root, rule line 44)
- scripts/_reground/lease.mjs: registered in OUT-OF-REPO-BOUNDARY.md (line 46)
- scripts/verify/mode-tag-coverage-audit.mjs: carries `// data-audit: label=mode-tag-coverage hard=false`, derived into run-data-audit-lane.mjs
- scripts/proof/attacks/fixtures.mjs: imported by sibling run-attacks.mjs through a bare ./fixtures.mjs specifier my basename key could not disambiguate (dup basename)

### 7a. The 27 remaining (path, last commit date, reference evidence)

| # | Path | Last commit | Referenced by (docs only) |
|---|---|---|---|
| 1 | scripts/coordinator/lane-gate-cloud.sh | 2026-09-18 | docs: docs/audits/app-audit-a4-scripts-workflows-2026-09-30.md; docs/dispatches/lane-briefs/2026-09-18/README.md (+12) |
| 2 | supabase/seed/W4_2_carb_attribution_fix.mjs | 2026-05-05 | docs: docs/plans/W4-backfill-plan.md |
| 3 | supabase/seed/W4_3_materialize_orphans.mjs | 2026-05-05 | docs: docs/audits/jurisdiction-normalization-audit-2026-05-11.md; docs/tech-debt-log.md (+1) |
| 4 | supabase/seed/W4_4_insert_california_critical_items.mjs | 2026-05-05 | docs: docs/audits/ISR-WRITE-INVESTIGATION.md; docs/plans/W4-backfill-plan.md |
| 5 | supabase/seed/add-building-standards.mjs | 2026-04-27 | docs: docs/audits/W1A-dual-write-audit.md; fsi-app/docs/audits/connection-completeness-2026-06-03.md (+2) |
| 6 | supabase/seed/add-source-registry.mjs | 2026-04-27 | docs: docs/audits/W1A-dual-write-audit.md; fsi-app/docs/audits/sprint3-a6-schema-empty-dim-2026-05-26.md |
| 7 | supabase/seed/apply-116-117.mjs | 2026-05-29 | nothing at all (no doc, no code) |
| 8 | supabase/seed/apply-120.mjs | 2026-06-02 | nothing at all (no doc, no code) |
| 9 | supabase/seed/apply-122-institutions.mjs | 2026-06-04 | nothing at all (no doc, no code) |
| 10 | supabase/seed/apply-123-source-label.mjs | 2026-06-04 | nothing at all (no doc, no code) |
| 11 | supabase/seed/apply-124.mjs | 2026-06-04 | nothing at all (no doc, no code) |
| 12 | supabase/seed/apply-access-method-3-source-remediation.mjs | 2026-10-03 | nothing at all (no doc, no code) |
| 13 | supabase/seed/audit-orphan-staged-updates.mjs | 2026-05-04 | nothing at all (no doc, no code) |
| 14 | supabase/seed/audit-source-attribution.mjs | 2026-05-04 | docs: docs/audits/W1C-source-attribution-summary.md |
| 15 | supabase/seed/backfill-missing-provisionals.mjs | 2026-10-03 | docs: docs/audits/SESSION-AUDIT-2026-05-05.md; docs/audits/ISR-WRITE-INVESTIGATION.md |
| 16 | supabase/seed/canonical-source-classify.mjs | 2026-04-29 | docs: docs/audits/W1A-dual-write-audit.md |
| 17 | supabase/seed/cost-projection.mjs | 2026-05-05 | docs: docs/plans/W5-cost-projection.md; docs/plans/registry-to-ingestion-handoff-design-2026-05-10.md |
| 18 | supabase/seed/generate-seed.ts | 2026-10-03 | docs: docs/ops/full-system-audit-2026-07-11/CODE-5b-register.md; docs/plans/remediation-and-weight-2026-08-10.md |
| 19 | supabase/seed/spot-check-all-h-tier.mjs | 2026-05-05 | docs: docs/archive/GAP-1-RESOLUTION.md; docs/audits/SESSION-AUDIT-2026-05-05.md (+2) |
| 20 | supabase/seed/sprint4-111-synthetic-staged.mjs | 2026-05-30 | docs: fsi-app/docs/sprint4-governing-state.md |
| 21 | supabase/seed/sprint4-112-verify-fixture.mjs | 2026-08-17 | nothing at all (no doc, no code) |
| 22 | supabase/seed/sprint4-115-tier-fixture.mjs | 2026-05-30 | nothing at all (no doc, no code) |
| 23 | supabase/seed/sprint4-provenance-distribution.mjs | 2026-05-30 | nothing at all (no doc, no code) |
| 24 | supabase/seed/test-extract-sections.mjs | 2026-05-06 | docs: docs/archive/INTELLIGENCE-DEPTH-IMPL.md; docs/audits/SESSION-AUDIT-2026-05-05.md |
| 25 | supabase/seed/url-health-check.mjs | 2026-10-03 | nothing at all (no doc, no code) |
| 26 | supabase/seed/verify-end-to-end.mjs | 2026-10-03 | docs: fsi-app/docs/PRODUCT-STATE-2026-06-20.md; fsi-app/docs/sprint4-D3-design.md (+1) |
| 27 | scripts/remediate-rule14.mjs | 2026-10-01 | docs: docs/ops/session-log.d/2026-10-01-r10-relabel.md |

Breakdown: 11 referenced by nothing at all; 16 referenced only by audits, plans, session logs or briefs (not runbooks). By location: fsi-app/supabase/seed 25, fsi-app/scripts/coordinator 1, repo-root scripts 1.

[HYPOTHESIS] The supabase/seed files are April to July 2026 one-shot apply and audit scripts (apply-1xx.mjs named after the migrations they applied, sprint4 fixtures) whose purpose was discharged; scripts/remediate-rule14.mjs is a one-shot referenced only by docs/ops/session-log.d/2026-10-01-r10-relabel.md. scripts/coordinator/lane-gate-cloud.sh is a coordinator hand tool named by docs/dispatches/lane-briefs/2026-09-18/README.md, so it is live by operator convention rather than dead.

## 8. Workflows: disabled, never run, or last run before 2026-09-01

Method [CONFIRMED]: `gh workflow list --all` (30 workflows registered in GitHub) against `ls .github/workflows` (30 files; the two lists match one to one) and, for each file, `gh run list --workflow <file> --limit 40` read on 2026-10-08. "Last master run" is the newest run whose headBranch is master. Updated against the 2026-10-06 register: its three never-run workflows (layout-baseline-renewal, question-answers, theme-briefs) have since run, and trust-recompute.yml is gone (retired by PR 980).

**Disabled in GitHub: 3** (data-audit-lane.yml, source-monitoring.yml, spot-check-monthly.yml, all state disabled_manually). **Never run: 1** (chain-proof.yml, 0 runs; created 2026-10-08 by PROOF-1/PROOF-4, header says "EXPECTED STATE: RED" until APPLIED-MAP.json lands). **Last master run before 2026-09-01: 3** (the same three disabled workflows). **Last master run a failure: 1** (spot-check-monthly, 2026-06-01 schedule; data-audit-lane's last scheduled run was also a failure, 2026-08-11, but its last dispatch on 2026-08-11 was green after the lane fix). Distinct workflows in any of the three buckets: **4**.

| Workflow file | GitHub state | Last master run | Total runs (of last 40) | Bucket |
|---|---|---|---|---|
| brief-apply.yml | active | 2026-10-07 success (workflow_dispatch) | 36 |  |
| brief-export.yml | active | 2026-10-07 success (workflow_run) | 24 |  |
| bug-class-guard.yml | active | 2026-10-08 success (push) | 40 |  |
| build-proof.yml | active | 2026-10-08 success (push) | 40 |  |
| chain-proof.yml | active | none | 0 | never run, last run < 2026-09-01 |
| change-detection.yml | active | 2026-10-07 success (workflow_dispatch) | 6 |  |
| corpus-turn.yml | active | 2026-10-07 success (workflow_run) | 16 |  |
| data-audit-lane.yml | disabled_manually | 2026-08-11 success (workflow_dispatch) | 40 | disabled, last run < 2026-09-01 |
| date-chain.yml | active | 2026-10-07 success (workflow_dispatch) | 6 |  |
| discipline.yml | active | 2026-10-08 success (push) | 40 |  |
| downstream-chain.yml | active | 2026-10-07 success (workflow_run) | 18 |  |
| fetch-drain.yml | active | 2026-10-07 success (workflow_run) | 6 |  |
| gate-a-rescan.yml | active | 2026-10-07 success (workflow_run) | 16 |  |
| layout-baseline-renewal.yml | active | 2026-10-08 success (workflow_dispatch) | 1 |  |
| ledger-consume.yml | active | 2026-10-07 success (workflow_run) | 24 |  |
| live-smoke.yml | active | 2026-10-08 success (deployment_status) | 40 |  |
| maintenance.yml | active | 2026-10-08 success (workflow_dispatch) | 40 |  |
| needs-search.yml | active | 2026-10-08 success (push) | 1 |  |
| population-turn.yml | active | 2026-10-07 success (workflow_run) | 40 |  |
| producers.yml | active | 2026-10-07 success (workflow_dispatch) | 27 |  |
| propagation-drain.yml | active | 2026-10-07 success (workflow_dispatch) | 31 |  |
| question-answers.yml | active | 2026-10-07 success (workflow_dispatch) | 2 |  |
| research-assessment.yml | active | 2026-10-07 success (workflow_dispatch) | 2 |  |
| research-walker.yml | active | 2026-10-07 success (workflow_dispatch) | 4 |  |
| source-monitoring.yml | disabled_manually | 2026-06-28 success (schedule) | 40 | disabled, last run < 2026-09-01 |
| source-resolution.yml | active | 2026-10-07 success (workflow_run) | 6 |  |
| source-sweep.yml | active | 2026-10-07 success (workflow_dispatch) | 29 |  |
| spot-check-monthly.yml | disabled_manually | 2026-06-01 failure (schedule) | 1 | disabled, last run < 2026-09-01 |
| theme-briefs.yml | active | 2026-10-07 success (workflow_dispatch) | 2 |  |
| uptime-probes.yml | active | 2026-10-07 success (workflow_dispatch) | 40 |  |

### 8a. Evidence for the four

- data-audit-lane.yml: disabled_manually; schedule stopped 2026-08-11 by operator build-mode ruling; last scheduled runs 2026-08-09, 08-10, 08-11 all failure, last dispatch 2026-08-11 16:06Z success. `scripts/verify/run-data-audit-lane.mjs` is named by no other workflow and no package.json script, and 45 audit scripts carry a `// data-audit: label=` marker (33 hard=true, 12 hard=false) that derive into this one runner: **45 verifier scripts run only through a disabled workflow** [CONFIRMED: grep -rl of the marker, grep of workflows and package.json]; they remain reachable by hand and by the discipline engine's execution-wiring check, which counts the marker as wiring.
- source-monitoring.yml: disabled_manually; last run 2026-06-28 (schedule, success). Its only script reference, scripts/sources/inaccessible-triage.mjs, is named by no other workflow or package.json script.
- spot-check-monthly.yml: disabled_manually; one run ever, 2026-06-01 schedule, failure. It calls POST /api/admin/spot-check/recurring (category 4b).
- chain-proof.yml: 0 runs in GitHub; first commit 2026-10-07/08; ADR-045 and runbook maintenance.d/64 say the job is red until lane MIG-HIST-1 lands APPLIED-MAP.json (not on master at this commit: `git ls-tree` finds no such file).

[HYPOTHESIS] All four are intended states (build mode, or brand new) rather than neglect: three were stopped by operator rulings and one has not had a trigger event yet. The census counts them because the question asked for them.

## 9. Comments and docs referencing retired things, and TODO-class markers

Method [CONFIRMED]: `git grep -I -c -E <pattern>` (tracked files only) per term over four scopes. code = fsi-app/src, fsi-app/scripts, fsi-app/.discipline, .github, fsi-app/supabase/functions, fsi-app/supabase/seed, repo-root scripts (excluding scripts/tmp, harness-runs, *.json). living docs = docs/ and fsi-app/docs, .claude CLAUDE.md files, excluding archive, audits, ops (session logs), dispatches, plans, ratifications and the design handoff. migrations = fsi-app/supabase/migrations (immutable history, listed for completeness). history docs = docs/archive, audits, ops, dispatches, plans, ratifications and fsi-app/docs archive and audits. Cells are files / matching lines. Case-sensitive except where marked. A match is a mention, not a defect: most hits in code are comments or tests that DOCUMENT a retirement ("the ratify:tags path was deleted"), which is correct. Whether a mention is stale or a correct tombstone is [HYPOTHESIS] except where a sample line was read (below).

| Term | code | living docs | migrations | history docs |
|---|---|---|---|---|
| automate-vs-hire (case-insens, hyphen/space/underscore) | 0/0 | 9/34 | 5/32 | 33/96 |
| AutomateVsHire | 0/0 | 4/6 | 0/0 | 19/36 |
| ratify:tags | 10/17 | 5/8 | 0/0 | 3/4 |
| "Across pages" | 1/2 | 1/1 | 0/0 | 3/8 |
| trust-recompute | 6/6 | 12/14 | 0/0 | 36/68 |
| operator-priced-only | 2/3 | 3/4 | 0/0 | 2/2 |
| intelligence_summaries (any) | 5/5 | 10/41 | 2/12 | 31/80 |
| intelligence_summaries + regenerat on same line | 0/0 | 3/7 | 0/0 | 3/3 |
| "7 domains" / "seven domains" | 1/1 | 3/4 | 0/0 | 7/8 |
| result_content_excerpt | 5/7 | 14/34 | 19/75 | 15/29 |
| RETIRED | 39/55 | 21/31 | 4/6 | 16/25 |
| DEPRECATED | 1/2 | 2/2 | 2/10 | 4/5 |
| TODO | 5/6 | 2/2 | 3/4 | 19/47 |
| FIXME | 0/0 | 0/0 | 0/0 | 12/23 |
| XXX | 0/0 | 1/1 | 0/0 | 4/5 |
| HACK | 0/0 | 0/0 | 0/0 | 0/0 |
| legacy (case-insens) | 142/388 | 37/107 | 19/56 | 126/397 |

Totals (matching lines): retired-term mentions code 41, living docs 153, migrations 119, history 334; marker words (RETIRED, DEPRECATED, TODO, FIXME, XXX, HACK, legacy) code 451, living docs 143, migrations 76, history 502. Distinct marker word counts in code scope: TODO 5 files (6 lines), FIXME 0, XXX 0, HACK 0, DEPRECATED 1 file, RETIRED 39 files, legacy 142 files. The TODO-class markers proper (TODO, FIXME, XXX, HACK, DEPRECATED) total 8 lines in code and 5 lines in living docs.

Sample reads of the retired-term hits in code [CONFIRMED: lines read]: ratify:tags (10 files): all are tests asserting the path is gone, or comments recording its deletion by lane G6-GATES 2026-10-05; "Across pages" (1 file): a test asserting the heading is NOT used; trust-recompute (6 files): comments recording retirement 2026-10-07 and where its passes went; operator-priced-only (2 files): src/lib/sources/seek-more.mjs lines 207 and 298 still quote "QUESTION_ACQUISITION=operator-priced-only" as live logic (ADR-036 decision 1; the 2026-10-06 register owed item 14 says seek-more.mjs "still names operator-priced-only"), the test trigger-questions.test.mjs asserts the phrase is absent from text; intelligence_summaries (5 files): F47 and F64 allowlist entries, a primary-key map, and a comment in src/lib/supabase-server.ts:3034 ("shelved per CLAUDE.md sector-activation"); "7 domains" (1 file): src/types/source.ts:482 comment "The seven domains of intelligence Caro's Ledge monitors", stale against the five-surface model (the .claude/CLAUDE.md says the 7-domain model is RETIRED); result_content_excerpt (5 files): F26 parity gate, RD-12 text, write-item.ts, state-cost-facts-envelope.mjs and a scan test; one comment (state-cost-facts-envelope.mjs:24) records the column was renamed result_content_excerpt -> result_content, and migration 264_rename_result_content_excerpt.sql (2026-08-17) did rename agent_run_searches.result_content_excerpt to result_content [CONFIRMED: migration read, line 88 RENAME COLUMN], so every code mention of the old name (F26 header and message text, RD-12 text, write-item.ts:254, the capture-length-scan test comment) uses a retired column name; whether F26 still checks the right column is [HYPOTHESIS].

### 9.1 automate-vs-hire (case-insens, hyphen/space/underscore)

- code (0 files, 0 lines): none
- living (9 files, 34 lines): docs/INDEX.md, docs/PROGRAM-BOARD.md x3, docs/decisions/ADR-024-decision-propagation.md, docs/decisions/ADR-043-no-typed-input-no-automate-vs-hire.md x5, docs/inventories/migrations.md, docs/runbooks/CORPUS-TURN-RUNBOOK.md x2, docs/specs/04-operations.md x4, docs/specs/08-flywheel-design.md x4, docs/inventories/shared-dataset-ownership.md x13
- migrations (5 files, 32 lines): supabase/migrations/286_statutory_and_estimates.sql, supabase/migrations/332_state_cost_facts_value_numeric.sql x4, supabase/migrations/333_derivation_edges_allow_state_cost_facts.sql x2, supabase/migrations/350_retire_automate_vs_hire_values.sql x15, supabase/migrations/350_retire_automate_vs_hire_values.test.mjs x10
- history (33 files, 96 lines): docs/archive/logs/intent-vs-live-and-competition-2026-09-24.md, docs/archive/logs/whats-happening-and-how-it-affects-me-2026-09-24.md, docs/audits/app-audit-a3-lib-2026-09-30.md, docs/audits/app-audit-a3b-lib-n-z-2026-09-30.md, docs/audits/app-audit-a4-scripts-workflows-2026-09-30.md, docs/audits/architecture-review-2026-09-30.md, docs/audits/docs-vs-reality-board-and-remainder-2026-09-30.md, docs/audits/full-read-2026-08-31/REC-1-specs-decisions.md, docs/audits/plan-completion-audit-2026-09-05/W3-W4-sourcing-propagation.md, docs/audits/wiring-audit-2026-09-04/B1-modules.md, docs/audits/wiring-audit-2026-09-04/C1-loop-map.md, docs/dispatches/industry-statements-design-2026-10-08.md, docs/dispatches/lane-briefs/2026-09-05/wave-e.js, docs/dispatches/lane-briefs/2026-09-20/brief-m7a.md, docs/dispatches/lane-briefs/2026-10-02/brief-l6.md, docs/ops/session-log.d/2026-09-20-m7a.md, docs/ops/session-log.d/2026-09-26-state-cost-producer.md, docs/ops/session-log.d/2026-09-27-state-cost-dag.md, docs/ops/session-log.d/2026-09-28-clock-test.md, docs/ops/session-log.d/2026-09-29-w2f.md, docs/ops/session-log.d/2026-10-02-l6.md, docs/ops/session-log.d/2026-10-03-l13.md, docs/ops/session-log.d/2026-10-03-no-typed-input.md, docs/ops/session-log.d/2026-10-04-adr043-landing.md, docs/ops/session-log.md, docs/plans/build-overview-2026-09-30.md, docs/plans/build-plan-2026-09-25.md, docs/plans/complete-build-plan-2026-10-01.md, docs/plans/finish-plan-2026-09-02.md, docs/plans/remediation-plan-2026-09-30.md, docs/plans/system-completion-plan-2026-09-02.md, docs/plans/system-map-2026-10-04.md, docs/plans/wave-plan-2026-09-28.md

### 9.2 AutomateVsHire

- code (0 files, 0 lines): none
- living (4 files, 6 lines): docs/decisions/ADR-043-no-typed-input-no-automate-vs-hire.md, docs/runbooks/CORPUS-TURN-RUNBOOK.md x3, docs/specs/08-flywheel-design.md, docs/inventories/shared-dataset-ownership.md
- migrations (0 files, 0 lines): none
- history (19 files, 36 lines): docs/audits/app-audit-a2-components-2026-09-30.md, docs/audits/app-audit-a2b-components-m-z-2026-09-30.md, docs/audits/app-audit-a4-scripts-workflows-2026-09-30.md, docs/audits/plan-completion-audit-2026-09-05/W3-W4-sourcing-propagation.md, docs/audits/stage-audit-2026-09-18/s4-propagate.md, docs/audits/wiring-audit-2026-09-04/A2-surfaces.md, docs/audits/wiring-audit-2026-09-04/B1-modules.md, docs/audits/wiring-audit-2026-09-04/C1-loop-map.md, docs/dispatches/industry-statements-design-2026-10-08.md, docs/dispatches/lane-briefs/2026-09-20/brief-m7a.md, docs/dispatches/lane-briefs/2026-10-03-w4/README.md, docs/dispatches/lane-briefs/2026-10-03-w4/brief-l13.md, docs/ops/session-log.d/2026-09-20-m7a.md, docs/ops/session-log.d/2026-09-26-state-cost-producer.md, docs/ops/session-log.d/2026-09-27-state-cost-dag.md, docs/ops/session-log.d/2026-09-29-w2f.md, docs/ops/session-log.d/2026-10-01-r3-guarded-upsert.md, docs/ops/session-log.d/2026-10-03-l13.md, docs/plans/complete-build-plan-2026-10-01.md

### 9.3 ratify:tags

- code (10 files, 17 lines): .github/workflows/maintenance.yml, scripts/classification/apply-classifications.test.mjs x2, scripts/connections/apply-tags.mjs x3, scripts/connections/apply-tags.test.mjs x4, scripts/connections/propose-tags.mjs x2, scripts/connections/propose-tags.test.mjs, scripts/maintenance/tag-proposals.mjs, scripts/maintenance/tag-ratification.mjs, scripts/maintenance/tag-ratification.test.mjs, scripts/turns/run-population-flywheel.mjs
- living (5 files, 8 lines): docs/PROGRAM-BOARD.md x2, docs/decisions/ADR-025-deterministic-derivations-auto-adopt.md, docs/runbooks/maintenance.d/06a-tag-proposals.md, docs/runbooks/maintenance.d/07-tag-ratification.md, docs/inventories/shared-dataset-ownership.md x3
- migrations (0 files, 0 lines): none
- history (3 files, 4 lines): docs/ops/session-log.d/2026-10-05-g6-gates.md, docs/ops/session-log.d/2026-10-05-g7-corrections.md, docs/ops/session-log.md

### 9.4 "Across pages"

- code (1 files, 2 lines): src/components/detail/grade-and-inference.npmtest.mjs x2
- living (1 files, 1 lines): docs/PROGRAM-BOARD.md
- migrations (0 files, 0 lines): none
- history (3 files, 8 lines): docs/ops/session-log.d/2026-10-05-p2-grade-inference-chips.md, docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md, docs/ops/session-log.d/2026-10-07-idx1-section-index.md

### 9.5 trust-recompute

- code (6 files, 6 lines): .github/workflows/maintenance.yml, .github/workflows/source-resolution.yml, .discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.mjs, scripts/maintenance/lib/emergency-pause.mjs, scripts/maintenance/recompute-trust-scores.mjs, src/app/api/admin/recompute-trust/route.ts
- living (12 files, 14 lines): docs/INDEX.md, docs/PROGRAM-BOARD.md x2, docs/runbooks/maintenance.d/58-recompute-tiers.md, docs/runbooks/maintenance.d/66-recompute-trust-scores.md, docs/FULL-CODEBASE-AUDIT-2026-06-06.md, docs/contradictions-audit.md, docs/design/MASTER-systemic-audit-2026-06-28.md, docs/design/scraping-hold-audit-2026-06-28.md, docs/design/systemic-fetch-and-loop-audit-2026-06-28.md, docs/design/walled-off-and-routing-audit-2026-06-28.md, docs/ops/conduction-census-2026-07-13.md, docs/pr5-reconciliation.md x2
- migrations (0 files, 0 lines): none
- history (36 files, 68 lines): docs/archive/BUILD-BREAKDOWN-2026-05-06.md, docs/archive/GAP-1-RESOLUTION.md, docs/archive/sprint-2/Phase-1.5-consumer-migration-list.md, docs/audits/ISR-WRITE-INVESTIGATION.md, docs/audits/WORKER-ACTIVATION-AUDIT-2026-05-08.md, docs/audits/app-audit-a4-scripts-workflows-2026-09-30.md, docs/audits/architecture-review-2026-09-30.md, docs/audits/dormant-systems-audit-2026-07-18.md, docs/audits/full-read-2026-08-31/L03-api-A.md, docs/audits/full-read-audit-2026-08-31.md, docs/audits/plan-completion-audit-2026-09-05/README.md, docs/audits/plan-completion-audit-2026-09-05/loop-harness-flywheel-one-unit.md, docs/audits/plan-completion-audit-2026-09-05/tools-inventory-unused-duplicates.md, docs/audits/product-code-wiring-truth-2026-08-09.md, docs/audits/runtime-clock-inventory-2026-08-10.md, docs/audits/supabase-integrity-and-wiring-audit-2026-09-25.md, docs/audits/system-review-2026-09-01.md, docs/audits/wiring-audit-2026-09-04.md, docs/audits/wiring-audit-2026-09-04/A1-runtimes.md, docs/audits/wiring-census-2026-08-11.md, docs/dispatches/lane-briefs/2026-09-05/audit-a.js, docs/ops/full-system-audit-2026-07-11/CODE-2-register.md, docs/ops/full-system-audit-2026-07-11/CODE-5a-register.md, docs/ops/full-system-audit-2026-07-11/_manifest_files.tsv, docs/ops/handoff-2026-08-17.md, docs/ops/root-cause-why-the-queue-2026-07-08.md, docs/ops/session-log.d/2026-10-04-s1c-tier-movement.md, docs/ops/session-log.d/2026-10-05-s1e-source-chain.md, docs/ops/session-log.d/2026-10-07-trustret.md, docs/ops/session-log.md, docs/plans/ingest-pipeline-investigation-2026-05-22.md, docs/plans/remediation-plan-2026-09-30.md, docs/plans/system-map-2026-10-04.md, docs/plans/unwired-disposition-2026-08-31.md, docs/archive/CLAUDE-session-log-2026-04.md, docs/audits/wired-state-census-2026-06-03.md [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]

### 9.6 operator-priced-only

- code (2 files, 3 lines): src/lib/learning/trigger-questions.test.mjs, src/lib/sources/seek-more.mjs x2
- living (3 files, 4 lines): docs/PROGRAM-BOARD.md x2, docs/decisions/ADR-036-learning-loop-forks.md, docs/decisions/ADR-044-learning-loop-no-gate.md
- migrations (0 files, 0 lines): none
- history (2 files, 2 lines): docs/ops/session-log.d/2026-10-05-l4a-questions-on-change.md, docs/plans/system-map-2026-10-04.md

### 9.7 intelligence_summaries (any)

- code (5 files, 5 lines): .discipline/fitness/functions/F47-db-object-reference.mjs, .discipline/fitness/functions/F64-rls-admin-gate-class.mjs, scripts/lib/table-primary-keys.mjs, src/lib/supabase-server.ts, supabase/seed/add-building-standards.mjs
- living (10 files, 41 lines): docs/inventories/migrations.md, docs/inventories/out-of-band-objects.md x3, .claude/CLAUDE.md x5, docs/FOLLOW-ONS-2026-06-20.md, docs/FULL-CODEBASE-AUDIT-2026-06-06.md, docs/SCOPE_AUDIT.md x13, docs/SUPABASE-TABLE-AUDIT-2026-06-20.md x3, docs/contradictions-audit.md x2, docs/design/walled-off-and-routing-audit-2026-06-28.md, docs/intelligence-summaries-proposal.md x11
- migrations (2 files, 12 lines): supabase/migrations/009_capture_undeclared_tables.sql x7, supabase/migrations/259_rls_initplan_and_policy_destack.sql x5
- history (31 files, 80 lines): docs/archive/BUILD-BREAKDOWN-2026-05-06.md, docs/archive/sprint-1/phase-2-dedup-plan.md, docs/audits/PAGE-LOAD-PERF-AUDIT-2026-05-06.md, docs/audits/PERF-AUDIT.md, docs/audits/app-audit-a5-database-2026-09-30.md, docs/audits/app-audit-a5b-migrations-001-170-2026-09-30.md, docs/audits/audit-consolidated-2026-09-30.md, docs/audits/caros-ledge-supabase-schema-audit-2026-05-15.md, docs/audits/four-page-architecture-survey-2026-05-09.md, docs/audits/full-read-2026-08-31/L07-comp-C.md, docs/audits/full-read-2026-08-31/L12-lib-D.md, docs/audits/full-read-audit-2026-08-31.md, docs/audits/primitives-audit-2026-05-09.md, docs/audits/source-coverage-diagnostic-2026-05-09.md, docs/audits/supabase-structure-audit-2026-07-19.md, docs/audits/system-health-audit-2026-09-17.md, docs/audits/topic-relevance-investigation-2026-05-09.md, docs/ops/full-system-audit-2026-07-11/CODE-5b-register.md, docs/ops/full-system-audit-2026-07-11/DB-1-register.md, docs/ops/full-system-audit-2026-07-11/X-register.md, docs/ops/full-system-audit-2026-07-11/coverage-manifest.md, docs/ops/full-system-audit-2026-07-11/master-gap-register.md, docs/ops/session-log.md, docs/ops/wave-alpha-closeout-2026-07-11/deletions-log.md, docs/plans/brief-chain-build-plan-2026-09-11.md, docs/archive/CLAUDE-session-log-2026-04.md, docs/audits/_census-table-linkage.txt, docs/audits/connection-completeness-2026-06-03.md, docs/audits/supabase-cell-inventory-2026-06-03.md, docs/audits/table-linkage-audit-2026-06-03.md, docs/audits/wired-state-census-2026-06-03.md

### 9.8 intelligence_summaries + regenerat on same line

- code (0 files, 0 lines): none
- living (3 files, 7 lines): .claude/CLAUDE.md x3, docs/SUPABASE-TABLE-AUDIT-2026-06-20.md, docs/intelligence-summaries-proposal.md x3
- migrations (0 files, 0 lines): none
- history (3 files, 3 lines): docs/audits/caros-ledge-supabase-schema-audit-2026-05-15.md, docs/ops/full-system-audit-2026-07-11/CODE-5b-register.md, docs/audits/table-linkage-audit-2026-06-03.md

### 9.9 "7 domains" / "seven domains"

- code (1 files, 1 lines): src/types/source.ts
- living (3 files, 4 lines): .claude/CLAUDE.md, docs/SCOPE_AUDIT.md x2, docs/contradictions-audit.md
- migrations (0 files, 0 lines): none
- history (7 files, 8 lines): docs/archive/BUILD-BREAKDOWN-2026-05-06.md, docs/audits/primitives-audit-2026-05-09.md, docs/ops/full-system-audit-2026-07-11/CODE-4a-register.md, docs/ops/full-system-audit-2026-07-11/CODE-4b-register.md, docs/ops/session-log.md, docs/archive/CLAUDE-session-log-2026-04.md, docs/audits/sprint3-research-diagnostic-2026-05-26.md

### 9.10 result_content_excerpt

- code (5 files, 7 lines): .discipline/fitness/functions/F26-storage-ceiling-parity.mjs x3, .discipline/governance/invariants.d/RD-12-size-cap-doctrine.mjs, scripts/verify/capture-length-scan.test.mjs, src/lib/intake/write-item.ts, src/lib/regional/state-cost-facts-envelope.mjs
- living (14 files, 34 lines): docs/PROGRAM-BOARD.md x5, docs/decisions/ADR-016-storage-side-uncap.md x3, docs/inventories/migrations.md x4, docs/tech-debt-log.md, .claude/skills/remediation-discipline/SKILL.md, docs/compliance/confidentiality-incident-2026-07-17-ncaer.md x2, docs/design/scraping-hold-audit-2026-06-28.md, docs/design/transport-escalation-matrix-2026-07-06.md, docs/designs/block4-grounding-pipeline-scope.md x2, docs/designs/source-provenance-model.md x6, docs/ops/session-log.md x2, docs/sprint4-block4-reattach-ledger.md, docs/sprint4-governing-state.md x2, docs/sprint4-workflow-spec.md x3
- migrations (19 files, 75 lines): supabase/migrations/112_provenance_invariant_schema.sql x4, supabase/migrations/114_validate_item_provenance.sql x6, supabase/migrations/119_validate_item_provenance_failclose.sql x3, supabase/migrations/121_uniform_promotion_no_human_tick.sql x3, supabase/migrations/138_reg_only_authority_floor.sql x3, supabase/migrations/141_per_type_authority_floor.sql x3, supabase/migrations/142_legal_line_guard.sql x3, supabase/migrations/143_label_variant_tolerance.sql x3, supabase/migrations/145_provenance_floor_inline_derive.sql x3, supabase/migrations/150_criterion2_url_canonicalize.sql x3, supabase/migrations/158_floor_unconditional_label_per_claim.sql x3, supabase/migrations/171_validate_provenance_brief_presence.sql x3, supabase/migrations/202_standard_own_body_floor.sql x3, supabase/migrations/207_own_body_types_extension.sql x3, supabase/migrations/216_item_source_evidence.sql x3, supabase/migrations/217_criterion3_durable_evidence_superset.sql x5, supabase/migrations/218_revert_item_source_evidence_dead_duplicate.sql x6, supabase/migrations/264_rename_result_content_excerpt.sql x14, supabase/migrations/302_criterion3_rating_not_refusal.sql
- history (15 files, 29 lines): docs/audits/app-audit-a10-remainder-2026-09-30.md, docs/audits/app-audit-a5c-migrations-171-339-2026-09-30.md, docs/audits/full-read-2026-08-31/L15-disc-A.md, docs/audits/full-read-2026-08-31/L19-migrations-B.md, docs/audits/ingest-behavioral-read-2026-07-18.md, docs/audits/plan-completion-audit-2026-09-05/skills-rules-doctrine.md, docs/ops/backup-posture.md, docs/ops/full-system-audit-2026-07-11/DB-1-register.md, docs/ops/full-system-audit-2026-07-11/coverage-manifest.md, docs/ops/full-system-audit-2026-07-11/pool-coverage-62.md, docs/ops/funded-pass-flight-state-2026-07-14.md, docs/ops/handoff-2026-08-17.md, docs/ops/session-log.md, docs/plans/ingest-repair-and-extraction-build-plan-2026-07-19.md, docs/audits/supabase-cell-inventory-2026-06-03.md

### 9.11 RETIRED

- code (39 files, 55 lines): .github/workflows/ledger-consume.yml, .github/workflows/maintenance.yml, .discipline/fitness/functions/F25-module-liveness.mjs, .discipline/fitness/functions/F43-default-open-disclosure.mjs, .discipline/fitness/functions/F51-no-shared-append.test.mjs, .discipline/governance/closure-gate.mjs x2, .discipline/governance/invariants.d/RD-31-operator-priced-spend.mjs, .discipline/governance/producer-consumer-orphan.mjs x4, .discipline/rendering/audit/open-state-sweep.mjs, .discipline/rendering/smoke/no-default-open-smoke.mjs, .discipline/vocab-drift-guard.test.mjs x4, scripts/classification/apply-classifications.mjs, scripts/classification/propose-classifications.mjs x2, scripts/lib/admin-phrase-scan.selftest.mjs, scripts/maintenance/canonical-autoverify.mjs, scripts/turns/last-turn-date.mjs, scripts/turns/last-turn-date.test.mjs, scripts/turns/run-ledger-consume.mjs, src/__tests__/leakage-fix-classifier.test.mjs, src/app/api/worker/check-sources/route.ts, src/app/operations/page.tsx, src/components/admin/AdminDashboard.tsx, src/components/admin/ResearchPipelineQueueView.tsx x2, src/components/operations/RegionDimensionMatrix.npmtest.mjs x2, src/components/operations/RegionDimensionMatrix.tsx, src/lib/agent/canonical-pipeline.ts, src/lib/agent/generation-config.ts x2, src/lib/agent/metadata-vocab.ts, src/lib/constants.ts, src/lib/intake/mint-item.ts, src/lib/intake/portal-harvest.ts, src/lib/llm/spend-client.ts x2, src/lib/llm/spend-guard.mjs x3, src/lib/llm/spend-guard.test.mjs x2, src/lib/sources/scrape-schedule.ts, src/lib/sources/seek-more.mjs x2, src/lib/sources/verify-item.mjs, src/lib/sources/verify-item.test.mjs, src/workflows/generate-brief.ts [CONFIRMED: listed by the method stated in this section] [WORK: DOCS-5]
- living (21 files, 31 lines): docs/PROGRAM-BOARD.md x5, docs/inventories/migrations.md x2, docs/runbooks/CORPUS-TURN-RUNBOOK.md, docs/runbooks/MAINTENANCE-RUNBOOK.md x3, docs/runbooks/maintenance.d/01-community-topics-seed.md, docs/runbooks/maintenance.d/06-review-digests.md, docs/runbooks/maintenance.d/13-review-apply-provisional-sources.md, docs/runbooks/maintenance.d/14-review-apply-canonical-candidates.md, docs/runbooks/maintenance.d/17-apply-classifications.md, docs/runbooks/maintenance.d/35-close-acquire-primaries-holds.md, docs/runbooks/sprint4-dataops-ledger.md, docs/specs/02-market-intel.md, docs/specs/04-operations.md x2, docs/specs/07-page-walkthrough.md x2, docs/specs/08-flywheel-design.md, .claude/CLAUDE.md, .claude/skills/remediation-discipline/SKILL.md, docs/design/cap-inventory-2026-07-06.md, docs/design/walled-off-and-routing-audit-2026-06-28.md, docs/inventories/shared-dataset-ownership.md x2, docs/ops/dormancy-register.md
- migrations (4 files, 6 lines): supabase/migrations/144_scrape_cadence.sql x2, supabase/migrations/256_migration_homes_and_vault_capture_key.sql, supabase/migrations/357_vocabulary_kinds.sql x2, supabase/migrations/357_vocabulary_kinds.test.mjs
- history (16 files, 25 lines): docs/archive/sprint-2/sprint-2-planning-2026-05-18.md, docs/audits/app-audit-a3b-lib-n-z-2026-09-30.md, docs/audits/dormant-systems-audit-2026-07-18.md, docs/audits/full-read-2026-08-31/L05-comp-A1.md, docs/audits/stage-audit-2026-09-18/s4-propagate.md, docs/audits/wiring-census-2026-08-11.md, docs/dispatches/lane-briefs/2026-09-19/brief-common-local.md, docs/ops/full-system-audit-2026-07-11/CODE-4b-register.md, docs/ops/full-system-audit-2026-07-11/DB-1-register.md, docs/ops/session-log.d/2026-10-04-rb-split.md, docs/ops/session-log.d/2026-10-05-g6-gates.md, docs/ops/session-log.md, docs/plans/brief-chain-build-plan-2026-09-11.md, docs/plans/complete-build-plan-2026-10-01.md, docs/plans/fleet-cost-control-plan-2026-08-08.md, docs/audits/sprint3-e2-prework-2026-05-25.md

### 9.12 DEPRECATED

- code (1 files, 2 lines): .discipline/rules/020-fork-log-frozen.mjs x2
- living (2 files, 2 lines): docs/dispatches/sprint3-status-2026-05-26.md, docs/ops/session-log.md
- migrations (2 files, 10 lines): supabase/migrations/013_drop_legacy_tables.sql, supabase/migrations/075_profiles_consolidation_phase1.sql x9
- history (4 files, 5 lines): docs/archive/sprint-1/phase-1-admin-signals.md, docs/audits/plan-completion-audit-2026-09-05/skills-rules-doctrine.md, docs/ops/full-system-audit-2026-07-11/CODE-5b-register.md, docs/ops/session-log.md

### 9.13 TODO

- code (5 files, 6 lines): src/lib/email/send-invitation-email.ts, src/lib/market/series-registry.mjs, src/lib/propagation/statutory-rows.ts, src/lib/research/theme-brief.mjs, supabase/seed/W4_4_insert_california_critical_items.mjs x2
- living (2 files, 2 lines): docs/SCOPE_AUDIT.md, docs/sprint4-workflow-spec.md
- migrations (3 files, 4 lines): supabase/migrations/068_workspace_intelligence_aggregates.sql x2, supabase/migrations/069_workspace_intelligence_aggregates_scoped.sql, supabase/migrations/073_shared_workspace_scope.sql
- history (19 files, 47 lines): docs/archive/aggregates-rpc-implementation-2026-05-10.md, docs/audits/PAGE-LOAD-PERF-AUDIT-2026-05-06.md, docs/audits/PERF-PROFILING-FINDINGS.md, docs/audits/app-audit-a1-routes-2026-09-30.md, docs/audits/app-audit-a1c-routes-completion-2026-09-30.md, docs/audits/app-audit-a2-components-2026-09-30.md, docs/audits/app-audit-a2b-components-m-z-2026-09-30.md, docs/audits/app-audit-a3-lib-2026-09-30.md, docs/audits/app-audit-a3b-lib-n-z-2026-09-30.md, docs/audits/app-audit-a4b-scripts-mint-lib-verify-2026-09-30.md, docs/audits/app-audit-a4bc-scripts-completion-2026-09-30.md, docs/audits/app-audit-a4c-scripts-remainder-2026-09-30.md, docs/audits/app-audit-a4cc-scripts-completion-2026-09-30.md, docs/audits/mechanical-checkers-2026-09-30.md, docs/ops/flip-readiness-2026-07-08.md, docs/ops/full-system-audit-2026-07-11/CODE-5a-register.md, docs/plans/W2B-discovery-agent-spec.md, docs/plans/market-lane-spec-from-repo.md, docs/audits/app-audit-a4d-scripts-completion-2026-09-30.md

### 9.14 FIXME

- code (0 files, 0 lines): none
- living (0 files, 0 lines): none
- migrations (0 files, 0 lines): none
- history (12 files, 23 lines): docs/audits/app-audit-a1-routes-2026-09-30.md, docs/audits/app-audit-a1c-routes-completion-2026-09-30.md, docs/audits/app-audit-a2-components-2026-09-30.md, docs/audits/app-audit-a2b-components-m-z-2026-09-30.md, docs/audits/app-audit-a3-lib-2026-09-30.md, docs/audits/app-audit-a3b-lib-n-z-2026-09-30.md, docs/audits/app-audit-a4b-scripts-mint-lib-verify-2026-09-30.md, docs/audits/app-audit-a4bc-scripts-completion-2026-09-30.md, docs/audits/app-audit-a4c-scripts-remainder-2026-09-30.md, docs/audits/app-audit-a4cc-scripts-completion-2026-09-30.md, docs/audits/mechanical-checkers-2026-09-30.md, docs/audits/app-audit-a4d-scripts-completion-2026-09-30.md

### 9.15 XXX

- code (0 files, 0 lines): none
- living (1 files, 1 lines): docs/runbooks/TRAIN-ASSEMBLY-RUNBOOK.md
- migrations (0 files, 0 lines): none
- history (4 files, 5 lines): docs/audits/app-audit-a1-routes-2026-09-30.md, docs/audits/app-audit-a4b-scripts-mint-lib-verify-2026-09-30.md, docs/audits/app-audit-a4c-scripts-remainder-2026-09-30.md, docs/audits/app-audit-a4cc-scripts-completion-2026-09-30.md

### 9.16 HACK

- code (0 files, 0 lines): none
- living (0 files, 0 lines): none
- migrations (0 files, 0 lines): none
- history (0 files, 0 lines): none

### 9.17 legacy (case-insens)

- code (142 files, 388 lines): .github/workflows/maintenance.yml x5, .discipline/fitness/README.md, .discipline/fitness/functions/F15-spend-chokepoint.mjs x5, .discipline/fitness/functions/F15-spend-chokepoint.test.mjs, .discipline/fitness/functions/F18-one-url-canonicalizer.test.mjs, .discipline/fitness/functions/F19-no-service-anon-downgrade.test.mjs, .discipline/fitness/functions/F21-single-grounding-entry.mjs, .discipline/fitness/functions/F22-source-role-at-birth.mjs, .discipline/fitness/functions/F22-source-role-at-birth.test.mjs, .discipline/fitness/functions/F40-authed-api-fetch.test.mjs, .discipline/fitness/functions/F8-client-server-tier-boundary.test.mjs, .discipline/governance/invariants.d/RD-36-re-grounds-never-destroy.mjs, .discipline/governance/invariants.d/RD-80.mjs, .discipline/governance/invariants.d/SC-11-floor-first-attribution.mjs, .discipline/rendering/audit/normalise.mjs, .discipline/rendering/exemptions-law2-desktop.test.mjs, .discipline/rendering/run-rendering-guard.mjs x3, .discipline/rendering/smoke/auth-onboarding-smoke.mjs, .discipline/rendering/smoke/community-smoke.mjs x2, .discipline/rendering/smoke/cross-page-smoke.mjs x2, .discipline/rules/015-row-mutation-guarded-path.mjs x2, .discipline/rules/015-row-mutation-guarded-path.test.mjs, .discipline/rules/019-source-reclassify-not-archive.mjs, .discipline/rules/019-source-reclassify-not-archive.test.mjs x3, scripts/_archive/_wave-alpha/backfill-themes.mjs, scripts/_archive/lib/error-drop-probe.mjs x2, scripts/classification/apply-classifications.mjs x6, scripts/classification/apply-classifications.test.mjs x4, scripts/classification/propose-classifications.mjs x2, scripts/connections/apply-tags.mjs, scripts/connections/apply-tags.test.mjs x3, scripts/connections/generate-theme-brief.mjs x2, scripts/connections/generate-theme-brief.test.mjs x5, scripts/lib/reachability.selftest.mjs x6, scripts/lib/revalidate.mjs x2, scripts/lib/run-artifact.mjs, scripts/maintenance/apply-classifications.mjs x2, scripts/maintenance/close-legal-confirmation-rows.mjs x13, scripts/maintenance/close-legal-confirmation-rows.test.mjs x9, scripts/maintenance/close-run-logs.mjs x19, scripts/maintenance/close-run-logs.test.mjs x9, scripts/maintenance/finish-staged-updates.mjs, scripts/maintenance/resolve-refetch-holds.mjs, scripts/maintenance/tag-ratification.mjs, scripts/maintenance/tag-ratification.test.mjs, scripts/mint/MINT-RUNBOOK.md, scripts/mint/export-census-rows.mjs x2, scripts/mint/export-census-rows.test.mjs x6, scripts/producers/market/sbti-target-dashboard-producer.mjs x3, scripts/remediation/refetch-capped-worklist.mjs x7, scripts/sources/README.md, scripts/sources/inaccessible-triage.mjs, scripts/spec09/reroute-producer.mjs, scripts/turns/export-themes-for-briefs.test.mjs, scripts/turns/run-ledger-consume.test.mjs x2, scripts/turns/run-population-flywheel.mjs x6, scripts/turns/run-population-flywheel.test.mjs x9, scripts/turns/theme-briefs/README.md, scripts/verify/population-report.test.mjs x2, scripts/verify/resolver-status-filter.golden.mjs x2, scripts/verify/surface-visibility-audit.mjs, src/__tests__/market-eia-v2-petroleum-spot-parser.test.mjs, src/__tests__/research-surface-candidate.test.mjs, src/app/api/admin/canonical-sources/decide/route.ts x3, src/app/api/admin/sources/[id]/bias-tags/logic.ts x2, src/app/api/admin/sources/[id]/bias-tags/route.ts x2, src/app/api/admin/sources/promote/route.ts x3, src/app/api/community/posts/route.ts, src/app/community/directory/page.tsx, src/app/regulations/[slug]/page.tsx, src/app/theme.css x5, src/app/theme.npmtest.mjs, src/components/community/AuthorIdentityChip.tsx x2, src/components/community/PeerOrgDirectoryTable.tsx, src/components/community/Post.tsx x4, src/components/community/PostComposer.tsx, src/components/detail/CrossPageSection.tsx x2, src/components/regulations/OwnerTeamCard.tsx x3, src/components/research/ResearchFindingDetailSurface.tsx, src/lib/agent/analysis-labels.mjs x3, src/lib/agent/analysis-labels.test.mjs x4, src/lib/agent/anthropic-stream.test.mjs x4, src/lib/agent/canonical-pipeline.ts, src/lib/agent/floor-attribution.test.mjs x2, src/lib/agent/formats/operations-matrix.ts x2, src/lib/agent/generation-config.ts, src/lib/agent/ledger-dominance.mjs x3, src/lib/agent/ledger-dominance.test.mjs x3, src/lib/agent/metadata-vocab.ts, src/lib/agent/operations-ask-context.mjs x6, src/lib/agent/operations-ask-context.test.mjs x5, src/lib/agent/prompt-cache.test.mjs, src/lib/agent/severity-ui-bucket.test.mjs, src/lib/agent/theme-vocab.test.mjs x8, src/lib/classification/classify-source.mjs x4, src/lib/classification/classify-source.test.mjs x5, src/lib/connections/brief-staleness.test.mjs x6, src/lib/connections/resource-lookup.ts, src/lib/constants.ts, src/lib/credibility/bias-display.mjs, src/lib/domains.ts x3, src/lib/forward-events/extract-forward-events.mjs x3, src/lib/forward-events/extract-forward-events.test.mjs x2, src/lib/health/spend-health.test.mjs, src/lib/intake/apply-staged-update.ts x2, src/lib/intake/mint-item.ts, src/lib/jurisdictions/iso.ts x5, src/lib/learning/trigger-questions.mjs x2, src/lib/learning/trigger-questions.test.mjs x2, src/lib/llm/first-fetch-classify.npmtest.mjs, src/lib/llm/spend-client.ts x4, src/lib/llm/spend-gauge.test.mjs, src/lib/operations/labour-chain.test.mjs, src/lib/operations/labour-chain.ts, src/lib/operations/region-crosswalk.mjs x2, src/lib/operations/region-crosswalk.test.mjs x3, src/lib/operations/region-grid.mjs x5, src/lib/operations/region-grid.test.mjs x4, src/lib/operations/statements.test.mjs, src/lib/regional/regional-facts-envelope.mjs x2, src/lib/regional/regional-facts-envelope.npmtest.mjs, src/lib/research/theme-brief.npmtest.mjs, src/lib/sources/bias-tag-pipeline.mjs, src/lib/sources/canonical-fetch.mjs, src/lib/sources/feed-discovery.test.mjs x2, src/lib/sources/recommend-source-tier.ts, src/lib/sources/seek-more.mjs x2, src/lib/sources/transport-runtime.mjs, src/lib/sources/verification.ts, src/lib/sources/w2f-basetier.npmtest.mjs x2, src/lib/supabase-server-brief-backfill.npmtest.mjs x2, src/lib/supabase-server.ts x11, src/lib/surface-of.mjs, src/stores/settingsStore.npmtest.mjs x13, src/stores/settingsStore.ts x2, src/types/resource.ts x2, src/types/source.ts, supabase/seed/W4_1_iso_backfill.mjs x8, supabase/seed/W4_3_materialize_orphans.mjs x2, supabase/seed/W4_4_insert_california_critical_items.mjs x2, supabase/seed/b2-runner.mjs x3, supabase/seed/test-extract-sections.mjs x8 [CONFIRMED: listed by the method stated in this section] [WORK: DOCS-5]
- living (37 files, 107 lines): CLAUDE.md, docs/INDEX.md x2, docs/PROGRAM-BOARD.md x13, docs/decisions/ADR-003-server-centric-dual-write.md x4, docs/decisions/ADR-016-storage-side-uncap.md x4, docs/decisions/ADR-020-sustainability-first-vertical-scope.md, docs/inventories/migrations.md x2, docs/runbooks/POPULATION-TURN-RUNBOOK.md x2, docs/runbooks/fleet-budget-control.md x2, docs/runbooks/fleet-charters/legacy-remediation.md x5, docs/runbooks/maintenance.d/07-tag-ratification.md, docs/runbooks/maintenance.d/12-forward-events-retext.md x2, docs/runbooks/maintenance.d/17-apply-classifications.md, docs/runbooks/maintenance.d/19-spec09-reroute.md, docs/runbooks/maintenance.d/23-generate-theme-brief.md, docs/runbooks/maintenance.d/36-refetch-capped.md x2, docs/runbooks/maintenance.d/41-close-run-logs.md x3, docs/runbooks/maintenance.d/46-resolve-provisional-sources.md, docs/runbooks/maintenance.d/49-resolve-refetch-holds.md, docs/runbooks/maintenance.d/51-close-legal-confirmation-rows.md x4, docs/runbooks/sprint4-dataops-ledger.md, .claude/CLAUDE.md, .claude/skills/caros-ledge-platform-intent/SKILL.md, .claude/skills/remediation-discipline/SKILL.md, docs/FULL-CODEBASE-AUDIT-2026-06-06.md x2, docs/SCOPE_AUDIT.md x25, docs/SUPABASE-TABLE-AUDIT-2026-06-20.md x4, docs/contradictions-audit.md x2, docs/design-reference-protocol.md, docs/design/MASTER-systemic-audit-2026-06-28.md, docs/design/forward-auto-promote-primary-selection.md, docs/design/redesign/DESIGN-DEVIATIONS.md, docs/design/walled-off-and-routing-audit-2026-06-28.md x3, docs/dispatches/sprint3-dispatch-brief.md x3, docs/inventories/shared-dataset-ownership.md x3, docs/pr5-reconciliation.md x3, docs/sprint4-governing-state.md
- migrations (19 files, 56 lines): supabase/migrations/004_source_trust_framework.sql, supabase/migrations/006_rls_multi_tenant.sql, supabase/migrations/010_migrate_legacy_to_item.sql x16, supabase/migrations/011_backfill_orphan_supersessions.sql x3, supabase/migrations/013_drop_legacy_tables.sql x3, supabase/migrations/018_b2_brief_schema.sql, supabase/migrations/026_research_pipeline_stage.sql, supabase/migrations/027_user_profiles.sql x2, supabase/migrations/033_jurisdiction_iso.sql x3, supabase/migrations/056_sources_access_method_extension.sql, supabase/migrations/072_jurisdiction_normalizer.sql x4, supabase/migrations/081_admin_signal_documentation.sql x2, supabase/migrations/088_citation_stats_rpc.sql, supabase/migrations/094_tier_compat_shim.sql, supabase/migrations/098_get_source_citation_stats_edge_table.sql x5, supabase/migrations/226_gate_a_health_rpc.sql x4, supabase/migrations/267_origin_class_and_envelope.sql x4, supabase/migrations/268_market_series.sql x2, supabase/migrations/271_assumption_register.sql
- history (126 files, 397 lines): docs/archive/BUILD-BREAKDOWN-2026-05-06.md, docs/archive/STREAM-AB-POLISH.md, docs/archive/logs/pr-a1-investigation-2026-05-06.json, docs/archive/logs/source-classification-backfill-preview-2026-05-11.md, docs/archive/logs/source-classification-legacy-11-backfill-2026-05-11.md, docs/archive/logs/topic-backfill-investigation-2026-05-25.json, docs/archive/sprint-1/alignment-audit-2026-05-18.md, docs/archive/sprint-1/followups.md, docs/archive/sprint-2/sprint-2-planning-2026-05-18.md, docs/archive/walk-away-handoff-2026-05-09.md, docs/archive/wave1-foundation-integration-plan.md, docs/audits/PERF-PROFILING-FINDINGS.md, docs/audits/SESSION-AUDIT-2026-05-05.md, docs/audits/W1A-dual-write-audit.md, docs/audits/W1B-approval-handler-analysis.md, docs/audits/app-audit-a10-remainder-2026-09-30.md, docs/audits/app-audit-a2b-components-m-z-2026-09-30.md, docs/audits/app-audit-a2bc-components-completion-2026-09-30.md, docs/audits/app-audit-a3-lib-2026-09-30.md, docs/audits/app-audit-a5c-migrations-171-339-2026-09-30.md, docs/audits/audit-consolidated-2026-09-30.md, docs/audits/caros-ledge-product-audit-2026-05-15.md, docs/audits/caros-ledge-supabase-schema-audit-2026-05-15.md, docs/audits/classification-rules-audit-2026-05-09.md, docs/audits/docs-vs-reality-2026-09-30.md, docs/audits/docs-vs-reality-plans-2026-09-30.md, docs/audits/four-page-architecture-survey-2026-05-09.md, docs/audits/full-read-2026-08-31/L06-comp-B.md, docs/audits/full-read-2026-08-31/L09-lib-agent.md, docs/audits/full-read-2026-08-31/L10-lib-sources.md, docs/audits/full-read-2026-08-31/L11-lib-C.md, docs/audits/full-read-2026-08-31/L13-scripts-A.md, docs/audits/full-read-2026-08-31/L14-scripts-B.md, docs/audits/full-read-2026-08-31/L15-disc-A.md, docs/audits/full-read-2026-08-31/L17-misc.md, docs/audits/full-read-2026-08-31/L18-migrations-A.md, docs/audits/full-read-audit-2026-08-31.md, docs/audits/gate-a-route-b-baseline-2026-08-11.csv, docs/audits/jurisdiction-normalization-audit-2026-05-11.md, docs/audits/primitives-audit-2026-05-09.md, docs/audits/quarantine-and-human-flag-writers-2026-09-12.md, docs/audits/source-classification-final-summary-2026-05-11.md, docs/audits/source-coverage-diagnostic-2026-05-09.md, docs/audits/source-map-existence-check-2026-05-10.md, docs/audits/source-map-from-esgtoday-2026-05-09.md, docs/audits/sources-content-verification-2026-05-11.md, docs/audits/spend-authority-disarm-case-file-2026-07-30.md, docs/audits/stage-audit-2026-09-18/s5-publish.md, docs/audits/topic-relevance-investigation-2026-05-09.md, docs/audits/wave1-archive-logs-disposition-2026-07-07.md, docs/audits/wave1b-stub-quality-investigation-2026-05-11.md, docs/audits/wiring-audit-2026-09-04/_prs.txt, docs/dispatches/industry-statements-design-2026-10-08.md, docs/dispatches/lane-briefs/2026-09-05/README.md, docs/dispatches/lane-briefs/2026-09-05/lane-classifystep.js, docs/dispatches/lane-briefs/2026-09-05/lane-hollowgate.js, docs/dispatches/lane-briefs/2026-09-05/lane-hollowsweep.js, docs/dispatches/lane-briefs/2026-09-05/lane-legacy.js, docs/dispatches/lane-briefs/2026-09-05/lane-meta8.js, docs/dispatches/lane-briefs/2026-09-05/lane-proposer5.js, docs/dispatches/lane-briefs/2026-09-05/lane-proposer6.js, docs/dispatches/lane-briefs/2026-09-05/lane-proposer7.js, docs/dispatches/lane-briefs/2026-09-05/lane-proposer8.js, docs/dispatches/lane-briefs/2026-09-05/lane-recordsurface.js, docs/dispatches/lane-briefs/2026-09-05/lane-tandem.js, docs/dispatches/lane-briefs/2026-09-22/brief-w10-masthead-amendment-1.md, docs/ops/chrome-audit-2026-07/traceability-matrix-2026-07-07.md, docs/ops/conservation-audit-2026-07/conservation-audit-2026-07-09.md, docs/ops/deletion-reclassification-log.md, docs/ops/full-system-audit-2026-07-11/CODE-1-register.md, docs/ops/full-system-audit-2026-07-11/CODE-3-register.md, docs/ops/full-system-audit-2026-07-11/CODE-4a-register.md, docs/ops/full-system-audit-2026-07-11/CODE-4b-register.md, docs/ops/full-system-audit-2026-07-11/CODE-5a-register.md, docs/ops/full-system-audit-2026-07-11/CODE-5b-register.md, docs/ops/full-system-audit-2026-07-11/DB-1-register.md, docs/ops/full-system-audit-2026-07-11/DB-2-register.md, docs/ops/full-system-audit-2026-07-11/DB-3-register.md, docs/ops/full-system-audit-2026-07-11/DB-4-register.md, docs/ops/full-system-audit-2026-07-11/X-register.md, docs/ops/full-system-audit-2026-07-11/_manifest_files.tsv, docs/ops/full-system-audit-2026-07-11/correction-plan.md, docs/ops/full-system-audit-2026-07-11/master-gap-register.md, docs/ops/reconciliation-remediation-closeout-2026-07-11.md, docs/ops/session-log.d/2026-09-19-n4.md, docs/ops/session-log.d/2026-09-22-g3.md, docs/ops/session-log.d/2026-09-22-w10-masthead.md, docs/ops/session-log.d/2026-09-29-w2b.md, docs/ops/session-log.d/2026-10-02-l8.md, docs/ops/session-log.d/2026-10-03-l11.md, docs/ops/session-log.d/2026-10-03-l13.md, docs/ops/session-log.d/2026-10-04-s1b-host-verdicts.md, docs/ops/session-log.d/2026-10-04-s3c-theme-brief-batches.md, docs/ops/session-log.d/2026-10-05-g6-gates.md, docs/ops/session-log.d/2026-10-07-s8f2-statements-build.md, docs/ops/session-log.d/2026-10-08-token1-capture-worker-grants.md, docs/ops/session-log.md, docs/ops/spend-watch-disposition-2026-07-15.md, docs/ops/wave-alpha-closeout-2026-07-11/closeout.md, docs/ops/wave-alpha-closeout-2026-07-11/deletions-log.md, docs/ops/wo6-tag-gap-diagnosis-2026-08-20.md, docs/plans/build-8-research-surface.md, docs/plans/classification-backfill-plan-2026-05-22.md, docs/plans/defect-fix-plan-2026-09-12.md, docs/plans/fleet-cost-control-plan-2026-08-08.md, docs/plans/ingest-pipeline-investigation-2026-05-22.md, docs/plans/ingest-restart-sequencing-2026-05-22.md, docs/plans/master-execution-plan-2026-08-17.md, docs/plans/mobile-evidence/README.md, docs/plans/multi-tenant-foundation-prework-2026-05-15.md, docs/plans/operations-lane-spec-from-repo.md, docs/plans/remediation-and-weight-2026-08-10.md, docs/plans/research-lane-spec-from-repo.md, docs/plans/source-classification-framework-2026-05-10.md, docs/plans/source-health-architecture-investigation-2026-05-21.md, docs/plans/spec-audit-market-intel-2026-05-23.md, docs/plans/spec-audit-regulations-2026-05-23.md, docs/plans/spec-audit-research-2026-05-23.md, docs/plans/system-map-2026-10-04.md, docs/archive/CLAUDE-session-log-2026-04.md, docs/audits/app-audit-a4d-scripts-completion-2026-09-30.md, docs/audits/sprint3-a2-prework-2026-05-25.md, docs/audits/sprint3-cmty0-route-investigation-2026-05-26.md, docs/audits/sprint3-sf2-seed-fallback-audit-2026-05-27.md, docs/audits/table-linkage-audit-2026-06-03.md, docs/audits/wired-state-census-2026-06-03.md [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]


## 10. Allowlists, exemptions and override markers

Method [CONFIRMED]: (a) 39 named allowlist and exemption constants (31 found by pattern plus 8 non-exported or regex lists read from source) (`const X_ALLOWLIST|EXEMPT*|KNOWN_*|GRANDFATHER*|ALLOWED_*|WAIVER*` in src, scripts, .discipline) were imported and enumerated read-only, entry by entry; non-exported ones were read from source; the pattern can miss a list with an unconventional name [HYPOTHESIS: list may be incomplete]. Pure vocabulary sets (ALLOWED_TYPES, ALLOWED_DECISIONS, KNOWN_TAG_SLUGS, ALLOWED_HOSTS and the like) are validation sets, not exemptions, and are not counted. (b) `fitness-allow:` and `glyph:verbatim` markers by `git grep -n -F` over src, scripts, .discipline (glyph also docs). (c) `Write-Guard-Override:` and `Consistency-Override:` trailers by `git log origin/master --since=2026-07-01 --grep` (1,087 commits in the window).

### 10a. Allowlist and exemption constants

| # | Constant | File | Entries | With reason text | Empty |
|---|---|---|---|---|---|
| 1 | LEGACY_ALLOWLIST | .discipline/fitness/functions/F15-spend-chokepoint.mjs | 5 | 5 |  |
| 2 | LEGACY_ALLOWLIST | .discipline/fitness/functions/F22-source-role-at-birth.mjs | 0 | 0 | yes |
| 3 | BROKEN_REF_ALLOWLIST | .discipline/fitness/functions/F24-db-object-migration-home.mjs | 0 | 0 | yes |
| 4 | NET_EGRESS_SANCTIONED | .discipline/fitness/functions/F24-db-object-migration-home.mjs | 1 | 1 |  |
| 5 | CRON_SANCTIONED | .discipline/fitness/functions/F24-db-object-migration-home.mjs | 0 | 0 | yes |
| 6 | NO_MIGRATION_HOME | .discipline/fitness/functions/F24-db-object-migration-home.mjs | 0 | 0 | yes |
| 7 | LEGACY_ALLOWLIST | .discipline/fitness/functions/F25-module-liveness.mjs | 24 | 24 |  |
| 8 | SEAM_EXEMPTIONS | .discipline/fitness/functions/F27-producer-seam-proof.mjs | 0 | 0 | yes |
| 9 | ALLOWLIST | .discipline/fitness/functions/F34-bundle-safe-module-evaluation.mjs | 1 | 1 |  |
| 10 | PRE_EXISTING_ALLOWLIST | .discipline/fitness/functions/F36-date-format-timezone-pin.mjs | 14 | 14 |  |
| 11 | ALLOWLIST | .discipline/fitness/functions/F38-unbounded-supabase-read.mjs | 0 | 0 | yes |
| 12 | BEARER_BUILDER_ALLOWLIST | .discipline/fitness/functions/F40-authed-api-fetch.mjs | 3 | 0 |  |
| 13 | ALLOWLIST | .discipline/fitness/functions/F47-db-object-reference.mjs | 3 | 3 |  |
| 14 | TERMINAL_SINK_ALLOWLIST | .discipline/governance/producer-consumer-orphan.mjs | 2 | 2 |  |
| 15 | ZERO_CEILING_ALLOWLIST | .discipline/fitness/functions/F51-no-shared-append.mjs | 3 | 3 |  |
| 16 | MIGRATION_DUPLICATE_ALLOWLIST | .discipline/fitness/functions/F51-no-shared-append.mjs | 2 | 2 |  |
| 17 | HOTSPOT_ALLOWLIST | .discipline/fitness/functions/F51-no-shared-append.mjs | 9 | 9 |  |
| 18 | EXEMPT_STEPS | .discipline/fitness/functions/F54-push-gate-npm-parity.mjs | 4 | 4 |  |
| 19 | RLS_ENABLE_ALLOWLIST | .discipline/fitness/functions/F64-rls-admin-gate-class.mjs | 12 | 12 |  |
| 20 | ADMIN_GATE_PREEXISTING_ALLOWLIST | .discipline/fitness/functions/F64-rls-admin-gate-class.mjs | 0 | 0 | yes |
| 21 | NEVER_RUN_ALLOWLIST | .discipline/governance/closure-gate.mjs | 2 | 2 |  |
| 22 | STALE_NEXT_ALLOWLIST | .discipline/governance/closure-gate.mjs | 0 | 0 | yes |
| 23 | WRITER_READER_ALLOWLIST | .discipline/governance/closure-gate.mjs | 0 | 0 | yes |
| 24 | EXEMPTIONS | .discipline/governance/exemptions.mjs | 20 | 20 |  |
| 25 | RENDERING_375_EXEMPTIONS | .discipline/rendering/exemptions-375.mjs | 1 | 1 |  |
| 26 | LAW2_DESKTOP_EXEMPTIONS | .discipline/rendering/exemptions-law2-desktop.mjs | 1 | 1 |  |
| 27 | POSITION_ALLOWLIST | .discipline/rendering/layout-guard/allowlists.mjs | 7 | 7 |  |
| 28 | SCROLLER_ALLOWLIST | .discipline/rendering/layout-guard/allowlists.mjs | 2 | 2 |  |
| 29 | ANTON_ALLOWLIST | .discipline/rendering/layout-guard/allowlists.mjs | 10 | 10 |  |
| 30 | WORKER_SECRET_ALLOWLIST | .discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.mjs | 2 | 2 |  |
| 31 | EXEMPT_FILES | .discipline/fitness/functions/F57-impact-meter-no-full-variant.mjs | 1 | 1 |  |
| 32 | EXEMPT_FILES | .discipline/fitness/functions/F59-dep-path-resolved.mjs | 3 | 3 |  |
| 33 | EXEMPT_FILES | .discipline/fitness/functions/F62-no-css-var-concat.mjs | 1 | 1 |  |
| 34 | KNOWN_HISTORICAL_DUPLICATES | .discipline/fitness/functions/F6-migrations-numeric-ordering.mjs | 5 | 0 |  |
| 35 | KNOWN_DRIFT_ALLOWLIST | .discipline/check-vocabulary.test.mjs | 1 | 1 |  |
| 36 | ALLOWLIST (test) | scripts/verify/capture-length-scan.test.mjs | 4 | 4 |  |
| 37 | ALLOWLIST (regex) | scripts/lib/admin-phrase-scan.mjs | 4 | 4 |  |
| 38 | GRANDFATHERED_SOURCELESS | src/lib/intake/source-link-invariant.mjs | 2 | 2 |  |
| 39 | ALLOWLIST (empty) | scripts/verify/schema-drift-audit.mjs | 0 | 0 | yes |

**39 constants, 29 non-empty, 149 entries, 141 carrying reason text, 8 with none.** The 8 reasonless entries are the F40 bearer-builder set (3 paths documented in the rule text), the F6 historical duplicates (5), and the 2 closure-gate NEVER_RUN entries are counted as reasoned by their disposition text. Empty lists (BROKEN_REF_ALLOWLIST, CRON_SANCTIONED, NO_MIGRATION_HOME, SEAM_EXEMPTIONS, F22 LEGACY_ALLOWLIST, F38 ALLOWLIST, ADMIN_GATE_PREEXISTING_ALLOWLIST, STALE_NEXT, WRITER_READER, schema-drift ALLOWLIST) are shrinking-ratchet lists that reached zero.

### 10b. Every entry (key, dates, reason text clipped to 170 chars; full text at the cited file)

#### LEGACY_ALLOWLIST in .discipline/fitness/functions/F15-spend-chokepoint.mjs (5)

- fsi-app/src/lib/llm/haiku-classify.ts (review: chokepoint-classifier-migration): Haiku classifier - standing-ticket class, migrates to spend-client with standingClass
- fsi-app/src/app/api/admin/spot-check/recurring/route.ts (review: chokepoint-route-migration): spot-check classifier route - standing-ticket class
- fsi-app/src/app/api/admin/canonical-sources/recommend-classification/route.ts (review: chokepoint-route-migration): canonical recommend-classification route - standing-ticket class
- fsi-app/src/app/api/admin/sources/recommend-classification/route.ts (review: chokepoint-route-migration): sources recommend-classification route - standing-ticket class
- fsi-app/src/app/api/admin/canonical-sources/bulk-classify/route.ts (review: chokepoint-route-migration): bulk-classify route - standing-ticket class

#### NET_EGRESS_SANCTIONED in .discipline/fitness/functions/F24-db-object-migration-home.mjs (1)

- capture_worker_fetch (review: egress-governance standing review (operator: any SECOND n...): The project's own capture-worker edge function, invoked server-side. Named in the fleet-charter runbooks as the ONE sanctioned document-fetch path, explicitly to keep ...

#### LEGACY_ALLOWLIST in .discipline/fitness/functions/F25-module-liveness.mjs (24)

All 24 entries are listed with reasons in section 1a.

#### ALLOWLIST in .discipline/fitness/functions/F34-bundle-safe-module-evaluation.mjs (1)

- fsi-app/src/lib/connections/derive-tags.mjs [2026-08]: Reads parse-output.ts / system-prompt.ts at import (fail-closed vocab load, 2026-08); reachable from no page; latent instance of the F34 class, recorded not hidden (Ad... [CONFIRMED: listed by the method stated in this section] [NOT-WORK: F34 ALLOWLIST entry with its reason recorded at F34-bundle-safe-module-evaluation.mjs lines 20 to 38]

#### PRE_EXISTING_ALLOWLIST in .discipline/fitness/functions/F36-date-format-timezone-pin.mjs (14)

- fsi-app/src/components/community/CommunitySearchResults.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.
- fsi-app/src/components/community/GroupModals.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.
- fsi-app/src/components/admin/redesign/WorkspacesUsageRow.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.
- fsi-app/src/components/admin/redesign/MembersPanel.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.
- fsi-app/src/components/admin/IntegrityFlagsView.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.
- fsi-app/src/components/admin/OrganizationsTable.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.
- fsi-app/src/components/admin/CoverageMatrixView.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.
- fsi-app/src/components/profile/MembersPanel.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.
- fsi-app/src/components/resource/IntelligenceMetadataStrip.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.
- fsi-app/src/components/settings/SavedSearchesSection.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.
- fsi-app/src/components/sources/SourceHealthDashboard.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.
- fsi-app/src/components/AskAssistant.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.
- fsi-app/src/components/onboarding/NoWorkspaceLanding.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.
- fsi-app/src/components/pages/MarketSignalDetailSurface.tsx [2026-09-04]: Pre-existing at F36 introduction (2026-09-04), not audited this lane.

#### BEARER_BUILDER_ALLOWLIST in .discipline/fitness/functions/F40-authed-api-fetch.mjs (3)

- fsi-app/src/lib/api/authed-fetch.ts: NO REASON TEXT
- fsi-app/src/lib/api/auth.ts: NO REASON TEXT
- fsi-app/src/lib/api/community-auth.ts: NO REASON TEXT

#### ALLOWLIST in .discipline/fitness/functions/F47-db-object-reference.mjs (3)

- table:intelligence_summaries [2026-04-30] (review: 2026-04-30): SHELVED, not retired: operator decision 2026-04-30 (.claude/CLAUDE.md, Sector Activation). The rows stay for per-sector reporting; SectorSynopsisView reads full_brief ...
- table:system_state_flag_audit [2026-09-17] (review: 2026-09-17): Append-only audit trail of pause-flag writes (trigger guard_pause_flag_writer, migration 201); read by the operator through SQL when a pause is investigated, never by ... [CONFIRMED: listed by the method stated in this section] [NOT-WORK: allowlist entry with its reason recorded in the allowlist]
- function:gate_a_health_refresh [2026-08-10, 2026-09-17] (review: 2026-08-10): The gate_a_health_cache writer, deliberately UNSCHEDULED by operator ruling 2026-08-10 (migration 256): gate_a_health() reports the cache age so the dormancy is visibl...

#### TERMINAL_SINK_ALLOWLIST in .discipline/governance/producer-consumer-orphan.mjs (2)

- bulk_imports [2026-07-03] (review: Phase 7 (zero-reader verification) - admin bulk-import hi...): FIRST RUN 2026-07-03. Written by /api/admin/sources/bulk-import as a job record; no reader (no admin import-history surface consumes it). DISPOSITION PENDING Phase 7 (...
- disposition_ledger [2026-09-01, 2026-07-16] (review: Phase 7 (zero-reader verification) - holdings-gate / expa...): SURFACED 2026-09-01, when this checker began recognizing the guarded-write helpers (guardedInsert et al., scripts/lib/db.mjs) as writers - disposition_ledger was invis...

#### ZERO_CEILING_ALLOWLIST in .discipline/fitness/functions/F51-no-shared-append.mjs (3)

- F46-external-host-home.mjs MULTI_HOME_CEILING [2026-09-18]: lane L35h: eur-lex.europa.eu homed onto identifier-variants.mjs, the one multi-home host dropped to zero; a zero ceiling is a strict rule, not a measurement.
- F47-db-object-reference.mjs UNREFERENCED_TABLES_CEILING [2026-09-17]: lane L32: migration 324 dropped drain_worklist; zero ceiling is a strict rule.
- F47-db-object-reference.mjs UNREAD_TABLES_CEILING [2026-09-17]: zero ceiling is a strict rule (write-only tables carry allowlist entries with reasons).

#### MIGRATION_DUPLICATE_ALLOWLIST in .discipline/fitness/functions/F51-no-shared-append.mjs (2)

- 006 [2026-09-19] (review: 2026-09-19): pre-build history, applied; renumbering refused 2026-09-19
- 007 [2026-09-19] (review: 2026-09-19): pre-build history, applied; renumbering refused 2026-09-19

#### HOTSPOT_ALLOWLIST in .discipline/fitness/functions/F51-no-shared-append.mjs (9)

- docs/ops/session-log.md [2026-09-19] (review: 2026-09-19): coordinator-only by contract
- docs/INDEX.md [2026-09-19] (review: 2026-09-19): coordinator-only by contract
- docs/runbooks/MAINTENANCE-RUNBOOK.md [2026-10-04] (review: 2026-10-04): coordinator-only by contract: the step index; lanes write their own maintenance.d/ file and the coordinator adds the index line
- docs/PROGRAM-BOARD.md [2026-09-19] (review: 2026-09-19): coordinator-only by contract
- docs/plans/complete-system-build-plan-2026-09-04.md [2026-09-19] (review: 2026-09-19): coordinator-only by contract
- docs/ops/HANDOFF-2026-09-19-addendum.md [2026-09-19] (review: 2026-09-19): coordinator-only by contract
- docs/audits/system-health-audit-2026-09-17.md [2026-09-19] (review: 2026-09-19): coordinator-only by contract
- fsi-app/scripts/producers/lib/producer-summary-wiring.test.mjs [2026-10-03] (review: 2026-10-03): R7-LINT-CI whole-tree lint remediation, merged clean concurrent with #907 (one-line unused-param rename); coordinator approval 2026-10-03
- fsi-app/src/lib/supabase-server.ts [2026-10-03] (review: 2026-10-03): R7-LINT-CI whole-tree lint remediation, merged clean concurrent with #908 (typed-row edits, no overlapping hunks); coordinator approval 2026-10-03

#### EXEMPT_STEPS in .discipline/fitness/functions/F54-push-gate-npm-parity.mjs (4)

- actionlint [2026-09-21] (review: 2026-09-21): downloads a pinned, checksum-verified actionlint binary from GitHub releases at run time (F52's own step comment); the operator declined installing extra software loca...
- Orphan-module + dead-export census [2026-09-28] (review: 2026-09-28): orphan-modules.mjs --all is a REPORT that never fails (its own header, and the step name says "reports, never fails"), so it cannot turn CI red and owes the push gate ... [CONFIRMED: listed by the method stated in this section] [NOT-WORK: F54 EXEMPT_STEPS entry with its reason recorded; F25 is the failing enforcement for the class]
- Playwright [2026-09-21] (review: 2026-09-21): the rendering-guard job's Playwright + chromium install step; a DIFFERENT job from "Fitness functions" so this checker never reaches it today, named per the operator's... [CONFIRMED: listed by the method stated in this section] [NOT-WORK: allowlist entry with its reason recorded in the allowlist]
- ESLint (max-warnings 0) [2026-10-01] (review: 2026-10-01): lane R7-LINT-CI (remediation plan Lane 7, CF-SEC-10). The step's run: is `npm run lint -- --max-warnings=0`, an npm-script invocation, not a `node`/`sh`/`bash <path>.(...

#### RLS_ENABLE_ALLOWLIST in .discipline/fitness/functions/F64-rls-admin-gate-class.mjs (12)

- agent_run_searches [2026-10-01] (review: 2026-10-01): CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.
- gate_a_health_cache [2026-10-01] (review: 2026-10-01): CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.
- institutions [2026-10-01] (review: 2026-10-01): CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.
- intelligence_item_citations [2026-10-01] (review: 2026-10-01): CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.
- intelligence_summaries [2026-10-01] (review: 2026-10-01): CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.
- item_type_required_slots [2026-10-01] (review: 2026-10-01): CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.
- section_claim_provenance [2026-10-01] (review: 2026-10-01): CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.
- sector_contexts [2026-10-01] (review: 2026-10-01): CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.
- source_bias_tags [2026-10-01] (review: 2026-10-01): CF-SEC-14 and CF-DATA-12 (migration 092): live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.
- system_state [2026-10-01] (review: 2026-10-01): CF-SEC-14 and CF-DATA-12 (migration 016): live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.
- system_state_flag_audit [2026-10-01] (review: 2026-10-01): CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.
- intelligence_items_domain_backfill_audit [2026-10-01] (review: 2026-10-01): lane R6-8 own finding: migration 101 header states "PROPOSED, NOT APPLIED" -- draft backfill-audit snapshot table, never run against the live database, not a CF-SEC-14... [CONFIRMED: listed by the method stated in this section] [WORK: EXEMPT-1]

#### NEVER_RUN_ALLOWLIST in .discipline/governance/closure-gate.mjs (2)

- workflow:downstream-chain.yml [2026-10-02]: awaiting first harness-ledger-export.json regeneration (R22, 2026-10-02); real family, no historical tracked artifact; expiryTrain 80
- workflow:producers.yml [2026-10-02]: awaiting first harness-ledger-export.json regeneration (R22, 2026-10-02); real family, no historical tracked artifact; expiryTrain 80

#### EXEMPTIONS in .discipline/governance/exemptions.mjs (20)

- fsi-app/scripts/lib/record-harness-run.mjs [2026-09-27]: Lands harness-run artifacts (fsi-app/scripts/harness-runs/CONVENTION.md) into harness_runs (migration 331, lane HARNESS-LANDING, 2026-09-27), the operational/infra rec...
- -behaviour.sql [2026-08-30]: Hand-run behavioural PROOF fixtures for the migration codegen family (scripts/gen/migration-NNN-behaviour.sql). They exist to be executed against a scratch database an...
- fsi-app/src/lib/contracts/corridor-id.mjs [2026-08-12]: FALSE POSITIVE, not a write. WRITE_RE matches `.update(` and this module calls createHash("sha256").update(payload) - a crypto digest update, not a Supabase mutation. ...
- fsi-app/src/lib/entities/entity-id.mjs [2026-09-02]: SAME FALSE POSITIVE as corridor-id.mjs above, same file shape: WRITE_RE matches `.update(` and entityId() calls createHash("sha256").update(payload) - a crypto digest ...
- fsi-app/src/lib/community/organisation-key.mjs [2026-09-03]: SAME FALSE POSITIVE as corridor-id.mjs / entity-id.mjs above, same file shape: WRITE_RE matches `.update(` and deriveOrganisationKey() calls createHmac("sha256", salt)...
- fsi-app/scripts/_diag/ [2026-06-06]: Read-only diagnostic convention - investigation scripts, no production writes. (A _diag that actually mutates data is itself a smell; rule 015 still scans content.)
- fsi-app/scripts/lib/db.mjs [2026-06-06]: The guarded-write helper itself - it IS the sanctioned write surface; its raw write call is the implementation, not a bypass. [CONFIRMED: listed by the method stated in this section] [NOT-WORK: allowlist entry with its reason recorded in the allowlist]
- fsi-app/src/components/profile/ [2026-08-11]: User profile + notification-preference UI - per-user preference rows only.
- fsi-app/src/components/settings/ [2026-08-11]: Briefing-schedule settings UI - per-user schedule rows only.
- fsi-app/src/stores/settingsStore.ts [2026-08-11]: Client settings store - per-user preference persistence.
- fsi-app/scripts/maintenance/repair-smoke-account.mjs [2026-10-06]: Operator-account repair CLI, run by the coordinator's executor; writes only profiles and org_memberships for one named non-admin account; refuses platform admins.
- fsi-app/src/lib/orgs/create-org.mjs [2026-10-06]: Self-service organisation creation for the signed-in caller: writes only the workspace_settings row of the organisation the create_org_for_self RPC returned for that c...
- fsi-app/src/lib/auth/provision-personal-workspace.ts [2026-08-11]: First-login workspace provisioning - per-user org/workspace bootstrap rows.
- fsi-app/src/lib/notifications/ [2026-08-11]: Notification dispatch + fallback flag - delivery bookkeeping rows, fail-open by design. [CONFIRMED: listed by the method stated in this section] [NOT-WORK: allowlist entry with its reason recorded in the allowlist]
- fsi-app/src/components/onboarding/ [2026-09-06]: Onboarding wizard writes to profiles.transport_mode_overrides/jurisdiction_overrides, workspace_settings.sector_profile, and notification_preferences - the same per-us...
- fsi-app/src/lib/telemetry/ [2026-08-11]: Error-capture telemetry - deliberately fail-open (capture-error.ts header contract); rows are diagnostics, never corpus data. [CONFIRMED: listed by the method stated in this section] [NOT-WORK: allowlist entry with its reason recorded in the allowlist]
- fsi-app/src/lib/agent/anthropic-stream.mjs [2026-08-11]: The streaming transport the spend chokepoint wraps. F15 names it in SANCTIONED alongside src/lib/llm/spend-client.ts, so it is governed by a live fitness function - it...
- fsi-app/src/lib/propagation/ [2026-09-02]: The propagation engine (docs/specs/08-flywheel-design.md §2-§5) writes derived_values/propagation_events/derivation_edges - corpus infrastructure, not content this rep... glyph:verbatim
- fsi-app/scripts/propagation/seed-derived-values [2026-09-05, 2026-09-02]: seed-derived-values.mjs performs the SAME class of write as the src/lib/propagation/ entry above (derived_values via registerDerivedValue's RPC, plus a direct estimate...
- fsi-app/scripts/propagation/write-statutory [2026-09-05, 2026-09-04]: write-statutory.mjs performs the SAME class of write as the src/lib/propagation/ entry above (a statutory_computations row, guarded-inserted after computeStatutory() a...

#### RENDERING_375_EXEMPTIONS in .discipline/rendering/exemptions-375.mjs (1)

- map [2026-09-07]: operator ruling 2026-09-07: exemption confirmed, no mobile map spec exists and none is to be invented; expires wave 58

#### LAW2_DESKTOP_EXEMPTIONS in .discipline/rendering/exemptions-law2-desktop.mjs (1)

- #0 [2026-09-08]: operator item C1, 2026-09-08: artboard 02/id="p2" draws the desktop rail facet row at 24px with no clearance; the 44px touch target is restored below 768px in globals....

#### POSITION_ALLOWLIST in .discipline/rendering/layout-guard/allowlists.mjs (7)

- nav-card-sticky [2026-09-08]: the nav card is sticky by design so the page never shifts on navigation (operator L5, README §0.3 "Nav 252px, always") glyph:verbatim [CONFIRMED: listed by the method stated in this section] [NOT-WORK: allowlist entry with its reason recorded in the allowlist]
- detail-section-index-sticky [2026-09-08]: the detail section index is sticky by design (README §0.5 "sticky section index S1 · S2 · S3") glyph:verbatim
- command-bar-hint [2026-09-08]: the command bar ⌘K hint may be positioned inside the bar (operator L5)
- overlays [2026-09-08]: overlays (dialogs, menus, popovers, tooltips, scrims, toasts) sit above the page by definition (operator L5)
- map-markers [2026-09-08]: inside the DECLARED clipping viewport a marker and a tile are placed by GEOGRAPHY, not by layout - the same reasoning FOLD-61 already ratified for the map ("an overlap...
- table-card-sticky-first-column [2026-09-09]: the table card's STICKY FIRST COLUMN, which L3/L4 already ratify as part of the one permitted horizontal scroller ("the table-card pattern: card overflow:hidden, inner...
- mobile-top-bar [2026-09-08]: below 768 the nav card is replaced by the sticky top bar, which IS the nav card at that width (mobile-390 spec, TOP BAR); the same exception the nav card carries, at t...

#### SCROLLER_ALLOWLIST in .discipline/rendering/layout-guard/allowlists.mjs (2)

- table-card-inner-scroller [2026-09-08]: the table-card inner scroller is the only permitted horizontal scroller, and its columns must also be reachable by keyboard (operator L3/L4)
- map-tile-viewport [2026-09-08]: a slippy map lays a tile grid wider than its frame and clips it; a tile is rendering substrate, not a run of words (lane mapclip 2026-09-08, DEVIATION-LOG "LANE MAPCLIP")

#### ANTON_ALLOWLIST in .discipline/rendering/layout-guard/allowlists.mjs (10)

- page-title: page title (README §0.3: Anton 34px list/dashboard, 28px detail) - drawn by Masthead.tsx glyph:verbatim
- card-title: card title (README type scale: display titles 20px) - drawn by SectionHeading.tsx
- band-tile-numeral: band-tile numeral (README §0.4: Anton numeral 34px in band colour) - drawn by BandTile.tsx glyph:verbatim
- stat-block-numeral: stat-block numeral (README §0.4: label / Anton numeral / note) - drawn by StatBlock.tsx glyph:verbatim
- headline-figure: headline figure (the market surface's "Carbon cost per FEU" figure)
- timeline-callout: timeline callout (README §0.4: the callout is always the next obligation) glyph:verbatim
- matrix-cell-score [2026-09-09]: the region x dimension matrix's per-cell score, Anton 16. The operator specified the cell himself in the artboard-8 redesign brief (lane opsmatrix3): a cell is "Anton ...
- matrix-fact-figure [2026-09-09]: the selection panel's headline figure, Anton 18 - the same role as the market surface's headline-figure entry above (a single extracted number read at display size), o...
- band-group-name [2026-10-07]: the band name on a list group header (Immediate / Action / Monitor / Awareness), Anton 18 in the band colour, white header with a 3px band rule on top - drawn by ListS...
- nav-wordmark [2026-09-08]: the nav card wordmark "Caro's Ledge" - the artboard draws it in Anton on every one of the 17 frames (dc.html, each frame's nav card: font-family:'Anton';font-size:19px...

#### WORKER_SECRET_ALLOWLIST in .discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.mjs (2)

- src/app/api/admin/recompute-trust/route.ts: worker-secret auth instead of isPlatformAdmin (header comment; CLAUDE.md API policy)
- src/app/api/admin/spot-check/recurring/route.ts: worker-secret auth instead of isPlatformAdmin (header comment; CLAUDE.md API policy)

#### EXEMPT_FILES in .discipline/fitness/functions/F57-impact-meter-no-full-variant.mjs (1)

- src/components/ui/ImpactMeter.tsx: the component that defines the variant

#### EXEMPT_FILES in .discipline/fitness/functions/F59-dep-path-resolved.mjs (3)

- .discipline/lib/resolve-dep.mjs: the resolver itself
- .discipline/hooks/lib/worktree-node-modules.sh: the link manager
- .discipline/fitness/functions/F59-dep-path-resolved.mjs: self

#### EXEMPT_FILES in .discipline/fitness/functions/F62-no-css-var-concat.mjs (1)

- src/lib/tint.ts: documents the defect shape in its own header comment [CONFIRMED: listed by the method stated in this section] [NOT-WORK: allowlist entry with its reason recorded in the allowlist]

#### KNOWN_HISTORICAL_DUPLICATES in .discipline/fitness/functions/F6-migrations-numeric-ordering.mjs (5)

- 006_multi_tenant.sql: NO REASON TEXT
- 006_rls_multi_tenant.sql: NO REASON TEXT
- 007_community_layer.sql: NO REASON TEXT
- 007_full_brief.sql: NO REASON TEXT
- 007_rls_community.sql: NO REASON TEXT
  Note: five duplicate-prefix migration files from before the numbering rule; no per-entry reason text in the set

#### KNOWN_DRIFT_ALLOWLIST in .discipline/check-vocabulary.test.mjs (1)

- monitoring_queue.last_result=change_detected [2026-09-12]: Pre-existing drift found by this check's first run (2026-09-12): scripts/turns/run-source-sweep.mjs writes a value monitoring_queue_last_result_check does not list

#### ALLOWLIST (test) in scripts/verify/capture-length-scan.test.mjs (4)

- migrations 322 and 323: the trigger function that computes result_chars and its one-time backfill
- capture-length-scan.test.mjs: this guard's own source carries the banned literal
- (2 more path entries): reasoned in file
- (1 more path entry): reasoned in file

#### ALLOWLIST (regex) in scripts/lib/admin-phrase-scan.mjs (4)

- emergency-stop / pause / resume: emergency-stop release (inline comment)
- tier override / SC-3: SC-3 tier override (inline comment)
- community / promote-to-public / moderat: community-is-human-space (inline comment)
- no human / retired / not a gate / visibility-only: negation or retirement: the gate is denied, not asserted (inline comment)

#### GRANDFATHERED_SOURCELESS in src/lib/intake/source-link-invariant.mjs (2)

- 770596e6-aeb2-46f9-ad29-a83e16f06fad: eFTI 2020/1056, pre-cutover manual-intake orphan; Unit 3 re-source [CONFIRMED: listed by the method stated in this section] [NOT-WORK: build-mode hold, population after all layers, CLAUDE.md rule 16]
- 68af8b45-fbbf-4ba1-add8-2c1761d2d120: waste 2024/1157, pre-cutover manual-intake orphan; Unit 3 re-source [CONFIRMED: listed by the method stated in this section] [NOT-WORK: build-mode hold, population after all layers, CLAUDE.md rule 16]

### 10c. fitness-allow markers

[CONFIRMED: git grep] 224 lines carry `fitness-allow: F<n>`; 157 are live markers in 81 files outside the fitness-function sources (the other 67 are documentation or fixtures inside the F-function files themselves). By gate: F39 x136, F42 x11, F38 x4, F43 x3, F41 x1, F6 x1, F22 x1. Markers with no reason text: 0. Every live marker (file:line, gate, reason clipped to 140 chars):

- .discipline/governance/invariants.d/RD-64-unbounded-in-filter.mjs:9 F39: reason)` marker naming why the list is bounded - PostgREST URL-encodes an `.in()` filter\'s entire list into the request line, and past r...
- .discipline/governance/invariants.d/RD-64-unbounded-in-filter.mjs:12 F39: reason)` marker stating that bound at the site itself, permanently, not in a separate file with a countdown. F39 cannot verify that a mar...
- .discipline/governance/invariants.d/RD-66-dead-media-query-class.mjs:9 F41: reason)` marker naming the component that renders it. [CONFIRMED, operator mobile report 2026-09-08, D-M3]: MapPageView.tsx\'s only media...
- .discipline/governance/invariants.d/RD-67-card-shell-one-component.mjs:9 F42: reason)` marker naming why it is not a section card. [CONFIRMED, operator UI fix round 2026-09-08, item A1]: with no card component, the ...
- scripts/inventories/generate-migrations-inventory.test.mjs:24 F6: reason) */\n-- subject: With a fitness-allow line\nSELECT 1;\n';
- scripts/maintenance/capture-static-primaries.mjs:449 F39: a batch-scoped .in(intelligence_item_id, ids) read over the run's own small
- scripts/maintenance/provenance-heal.mjs:167 F39: scoped to one item's own claim/section/search rows - small by construction, not corpus-scale
- scripts/maintenance/provenance-heal.mjs:194 F39: urls is the small http/https + trailing-slash variant set (buildUrlVariants), not a runtime id list
- scripts/producers/regional/state-cost-facts-producer.mjs:218 F39: bounded, stateCodes is this run's own distinct ISO 3166-2 codes, from the CLI's named --fixtures set, real-world cardinality ~60
- scripts/turns/apply-extraction-output.mjs:197 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- scripts/turns/consume-turn-requests.mjs:283 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- scripts/turns/export-corpus-for-extraction.mjs:373 F39: already chunked above (idChunk/slice pattern), bounded per chunk, not corpus-scale
- scripts/turns/export-corpus-for-extraction.mjs:384 F39: already chunked above (idChunk/slice pattern), bounded per chunk, not corpus-scale
- scripts/turns/export-corpus-for-extraction.mjs:505 F39: bounded by the fixed 12-value item_type vocabulary, not by input size
- scripts/turns/export-corpus-for-extraction.mjs:535 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- scripts/turns/export-corpus-for-extraction.mjs:540 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- scripts/turns/export-corpus-for-extraction.mjs:554 F39: already chunked above (idChunk/slice pattern): bounded per chunk, not corpus-scale
- scripts/turns/export-corpus-for-extraction.mjs:559 F39: already chunked above (idChunk/slice pattern): bounded per chunk, not corpus-scale
- scripts/turns/export-corpus-for-extraction.mjs:573 F39: already chunked above (idChunk/slice pattern): bounded per chunk, not corpus-scale
- scripts/turns/export-corpus-for-extraction.mjs:582 F39: already chunked above (idChunk/slice pattern): bounded per chunk, not corpus-scale
- scripts/turns/run-population-flywheel.mjs:599 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- scripts/turns/run-population-flywheel.mjs:611 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- scripts/turns/run-population-flywheel.mjs:1217 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- scripts/turns/run-population-flywheel.mjs:1222 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- scripts/turns/run-population-flywheel.mjs:1383 F39: ctx.batchIds is this dispatch's own minted batch, not corpus-scale
- scripts/turns/run-population-flywheel.mjs:1402 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- scripts/turns/run-population-flywheel.mjs:1407 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- scripts/verify/run-data-audit-lane.mjs:59 F39: open is a singleton block-state row keyed by fixed (category, subject_ref) - 0-1 rows in practice
- scripts/verify/wave-acceptance-audit.mjs:104 F39: scoped to one item's own claim/section/search rows - small by construction, not corpus-scale
- src/app/admin/inferences/page.tsx:46 F39: slice is one fetchAllByIdChunks chunk, bounded by its own chunk size
- src/app/api/admin/canonical-sources/bulk-approve/route.ts:79 F39: body.candidateIds is validated to <= 300 above (explicit length check
- src/app/api/admin/canonical-sources/bulk-approve/route.ts:100 F39: urls derives from the same request's candidateIds, already validated <= 300 above
- src/app/api/admin/canonical-sources/bulk-classify/route.ts:190 F39: body.candidateIds is validated to <= 30 above (explicit length check
- src/app/api/admin/canonical-sources/bulk-classify/route.ts:204 F39: derives from the same request's candidateIds, already validated <= 30 above
- src/app/api/admin/canonical-sources/bulk-classify/route.ts:213 F39: derives from the same request's candidateIds, already validated <= 30 above
- src/app/api/admin/canonical-sources/pending/route.ts:94 F39: itemIds/candidateUrls derive from one page of the pending-candidates queue, not the full corpus
- src/app/api/admin/canonical-sources/pending/route.ts:112 F39: itemIds/candidateUrls derive from one page of the pending-candidates queue, not the full corpus
- src/app/api/admin/corpus-turn-requests/route.ts:114 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- src/app/api/admin/forward-events/route.ts:61 F39: a finite vocabulary of event_kind/date_precision values from the query string, not a runtime id list
- src/app/api/admin/forward-events/route.ts:63 F39: a finite vocabulary of event_kind/date_precision values from the query string, not a runtime id list
- src/app/api/admin/forward-events/route.ts:85 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- src/app/api/admin/intersections/route.ts:85 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- src/app/api/admin/sources/promote/route.ts:174 F22: source_role is set by buildPromotedSourceRow, imported above -- it calls classifySourceRole(name, url) internally; task 7.5's extraction ...
- src/app/api/admin/sources/tier-opinions/route.ts:86 F39: ids is the request's own tier-opinion id list, admin-authored and small
- src/app/api/admin/themes/route.ts:59 F39: themeIds is the connection_themes cluster count - curated, not corpus-item-scaled
- src/app/api/ask/route.ts:276 F39: hitIds is the retrieval step's own top-K hit set, bounded by the retrieval's own K
- src/app/api/community/groups/[id]/invitations/route.ts:89 F39: scoped to one page/group render's own bounded row set, not corpus-scale
- src/app/api/community/groups/[id]/members/route.ts:81 F39: scoped to one page/group render's own bounded row set, not corpus-scale
- src/app/api/community/moderation/reports/route.ts:155 F39: postIds bounded by assertBound above - the request's 1-100 limit clamp
- src/app/api/community/posts/[id]/replies/route.ts:145 F39: authorIds bounded by assertBound above - MAX_LIMIT clamp
- src/app/api/community/posts/route.ts:176 F39: authorIds bounded by assertBound at the call site, MAX_LIMIT clamp
- src/app/api/community/posts/route.ts:189 F39: authorIds bounded by assertBound at the call site, MAX_LIMIT clamp
- src/app/api/community/posts/route.ts:281 F39: authorIds bounded by assertBound above - MAX_LIMIT clamp
- src/app/api/community/search/route.ts:150 F39: scoped to one page/group render's own bounded row set, not corpus-scale
- src/app/api/intelligence-items/[id]/metadata/route.ts:53 F39: relatedIds is one item's own related-items set (a detail-page widget), small by construction
- src/app/api/notices/resolve-watched-entities.ts:97 F39: scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale
- src/app/api/notices/resolve-watched-entities.ts:105 F39: scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale
- src/app/api/notices/resolve-watched-entities.ts:115 F39: scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale
- src/app/api/notices/route.ts:85 F39: scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale
- src/app/api/search/logic.ts:92 F39: hitIds is the RPC's own top-K hit set, bounded by boundedMaxRows above
- src/app/api/workspace/archive-impact/route.ts:104 F39: scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale
- src/app/api/workspace/archive-impact/route.ts:106 F39: scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale
- src/app/api/workspace/archive-impact/route.ts:121 F39: scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale
- src/app/api/workspace/archive-impact/route.ts:162 F39: scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale
- src/app/api/workspace/bootstrap/logic.ts:170 F39: scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale
- src/app/api/workspace/overrides/route.ts:203 F39: scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale
- src/app/api/workspace/tags/route.ts:45 F38: workspace tag inventory, bounded-by-design - a workspace does not invent 500+ distinct tags
- src/app/api/workspace/tags/route.ts:55 F38: workspace tag-application count, bounded-by-design per workspace
- src/app/api/workspace/tags/route.ts:82 F38: tags applied to one item, bounded-by-design
- src/app/auth/reset-password/page.tsx:61 F42: F49 (auth confirmation note, not a section card. Ruling R1: artboard 16's
- src/app/auth/update-password/page.tsx:58 F42: F49 (auth confirmation note inside artboard 16's panel, not a section
- src/app/community/browse/page.tsx:138 F39: scoped to one page/group render's own bounded row set, not corpus-scale
- src/app/community/browse/page.tsx:148 F39: scoped to one page/group render's own bounded row set, not corpus-scale
- src/app/community/page.tsx:163 F39: scoped to one page/group render's own bounded row set, not corpus-scale
- src/app/community/page.tsx:226 F39: scoped to one page/group render's own bounded row set, not corpus-scale
- src/app/community/page.tsx:278 F39: scoped to one page/group render's own bounded row set, not corpus-scale
- src/app/community/page.tsx:326 F39: scoped to one page/group render's own bounded row set, not corpus-scale
- src/app/community/page.tsx:344 F39: scoped to one page render's own bounded row set, not corpus-scale
- src/app/research/page.tsx:72 F39: chunked above in 200-id slices, same pattern ThemeStrip.tsx already uses
- src/components/admin/corrections/load-all.mjs:26 F39: slice is one fetchAllByIdChunks chunk, bounded by its own chunk size
- src/components/admin/corrections/load-item-targets.mjs:41 F39: slice is one fetchAllByIdChunks chunk, bounded by its own chunk size
- src/components/admin/redesign/MembersPanel.tsx:485 F42: undesigned OVERLAY. Ruling R7 and the operator's own overlays list
- src/components/auth/AuthPanel.tsx:145 F42: auth confirmation note inside artboard 16's panel, not a section card;
- src/components/community/CommunityRooms.tsx:1571 F42: undesigned OVERLAY, the "start a vertical group" modal. Same reason
- src/components/community/CommunitySidebar.tsx:418 F43: R2/R3 boundary: a navigation control surface, not page content; reported to
- src/components/community/CouncilMembersRail.tsx:77 F39: scoped to one page/group render's own bounded row set, not corpus-scale
- src/components/market/MarketComparativeRibbon.tsx:279 F42: a TILE inside a card, not a section card. Measured against the artboard
- src/components/market/MarketComparativeRibbon.tsx:305 F42: a TILE inside a card, not a section card; the full reason, with the
- src/components/operations/RegionDimensionMatrix.npmtest.mjs:239 F43: \(R6 2026-09-09/);
- src/components/operations/RegionDimensionMatrix.tsx:85 F43: R6 2026-09-09 default matrix selection; both messages quoted above
- src/components/Sidebar.tsx:425 F42: THE NAV CARD. Ruling 5.2 (2026-09-07) names the nav card cap as
- src/components/sources/SourceTierLegend.tsx:184 F42: undesigned OVERLAY, the Tier definitions modal lane adminlayout moved
- src/components/ui/Skeleton.tsx:73 F42: SKELETON. This holds a BandTile's geometry open while its count loads
- src/lib/agent/audit-gate.ts:114 F39: scoped to one item's own claim/section/search rows - small by construction, not corpus-scale
- src/lib/agent/canonical-pipeline.ts:744 F39: scoped to one item's own claim/section/search rows - small by construction, not corpus-scale
- src/lib/agent/canonical-pipeline.ts:1192 F39: scoped to one item's own claim/section/search rows - small by construction, not corpus-scale
- src/lib/agent/canonical-pipeline.ts:2173 F39: scoped to one item's own claim/section/search rows - small by construction, not corpus-scale
- src/lib/agent/canonical-pipeline.ts:2257 F39: scoped to one item's own claim/section/search rows - small by construction, not corpus-scale
- src/lib/agent/canonical-pipeline.ts:2300 F39: scoped to one item's own claim/section/search rows - small by construction, not corpus-scale
- src/lib/agent/gate-a-derived.mjs:31 F39: scoped to one item's own claim/section/search rows - small by construction, not corpus-scale
- src/lib/agent/gate-a-derived.mjs:39 F39: scoped to one item's own claim/section/search rows - small by construction, not corpus-scale
- src/lib/connections/resource-lookup.ts:56 F39: relatedIds is one detail page's own related-items widget list, small by construction
- src/lib/connections/resource-lookup.ts:63 F39: relatedIds is one detail page's own related-items widget list, small by construction
- src/lib/connections/write-edges.mjs:271 F39: ids is a 100-element slice of delIds, bounded per request
- src/lib/corrections/admin-api/logic.mjs:88 F39: slice is one fetchAllByIdChunks chunk, bounded by its own chunk size
- src/lib/corrections/suppressed-render.mjs:89 F39: slice is one fetchAllByIdChunks chunk, bounded by its own chunk size
- src/lib/dashboard/surface-coverage.ts:183 F39: slice is one fetchAllByIdChunks chunk, bounded by its own chunk size
- src/lib/detail/inference-view.mjs:173 F39: ids.length <= INFERENCE_READ_CAP, bounded by the .limit() above
- src/lib/entities/corridor-scope.ts:135 F39: corridor/jurisdiction entity_id set - real-world geography cardinality, structurally small
- src/lib/entities/corridor-scope.ts:147 F39: corridor/jurisdiction entity_id set - real-world geography cardinality, structurally small
- src/lib/entities/corridor-scope.ts:223 F39: corridor/jurisdiction entity_id set - real-world geography cardinality, structurally small
- src/lib/entities/corridor-scope.ts:231 F39: corridor/jurisdiction entity_id set - real-world geography cardinality, structurally small
- src/lib/entities/corridor-scope.ts:248 F39: corridor/jurisdiction entity_id set - real-world geography cardinality, structurally small
- src/lib/forward-events/read-upcoming.mjs:180 F39: spec.kinds is a finite event_kind vocabulary from the caller's spec, not a runtime id list
- src/lib/forward-events/read-upcoming.mjs:202 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- src/lib/intake/census-writer.mjs:146 F39: slice is one fetchAllByIdChunks chunk, bounded by its own chunk size
- src/lib/intake/mint-item.ts:265 F39: urls has at most 2 elements (canon + sourceUrl fallback), provably
- src/lib/learning/prediction-scoring.mjs:347 F39: slice is one fetchAllByIdChunks chunk, at most 50 ids
- src/lib/learning/prediction-scoring.mjs:390 F39: slice is one fetchAllByIdChunks chunk, at most 50 ids
- src/lib/learning/prediction-scoring.mjs:423 F39: slice is one fetchAllByIdChunks chunk, at most 50 ids
- src/lib/learning/prediction-scoring.mjs:436 F39: slice is one fetchAllByIdChunks chunk, at most 50 ids
- src/lib/learning/questions-on-change.mjs:121 F39: slice is one fetchAllByIdChunks chunk, at most 50 ids
- src/lib/learning/questions-on-change.mjs:207 F39: slice is one fetchAllByIdChunks chunk, at most 50 ids
- src/lib/obligations/read-register.mjs:352 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- src/lib/obligations/read-register.mjs:529 F39: already chunked above (idChunk/slice pattern) - bounded per chunk, not corpus-scale
- src/lib/propagation/author-edges.mjs:117 F39: scoped to one item's own claim/section/search rows - small by construction, not corpus-scale
- src/lib/propagation/drain.ts:324 F39: eventIds.length <= batch, DEFAULT_BATCH=500, via .limit(batch) above
- src/lib/propagation/drain.ts:393 F39: eventIds.length <= batch, DEFAULT_BATCH=500, via .limit(batch) above
- src/lib/propagation/methods/superseded-notices.ts:100 F39: entityIds is one user's watchlist (caller: resolve-watched-entities.ts), not corpus-scale
- src/lib/propagation/methods/superseded-notices.ts:107 F39: entityIds is one user's watchlist (caller: resolve-watched-entities.ts), not corpus-scale
- src/lib/propagation/methods/superseded-notices.ts:114 F39: entityIds is one user's watchlist (caller: resolve-watched-entities.ts), not corpus-scale
- src/lib/sources/source-growth.ts:296 F39: citerIds is one source's own citer list, not corpus-scale
- src/lib/sources/source-growth.ts:501 F39: one item's own cited source ids, small by construction
- src/lib/supabase-server.ts:502 F39: a bounded status vocabulary, not a corpus-scale id list
- src/lib/supabase-server.ts:1094 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:1366 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:1376 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:1846 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:2177 F39: byId.size <= CITED_SOURCES_CAP, bounded by the .limit() above
- src/lib/supabase-server.ts:2205 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:2278 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:2552 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:2570 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:2703 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:3149 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:4554 F39: chunked in 200-id slices, bounded per chunk, not corpus-scale
- src/lib/supabase-server.ts:5031 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:5041 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:5094 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:5110 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:5138 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/supabase-server.ts:5159 F39: derived from one server-rendered page's own bounded row fetch, not corpus-scale
- src/lib/tags/server.ts:31 F39: scoped to the authors of a workspace's tag applications, not corpus-scale
- src/lib/tags/server.ts:124 F38: tags applied to one item, bounded-by-design
- src/lib/trust.ts:827 F39: scoped to one item's own claim/section/search rows - small by construction, not corpus-scale
- src/lib/vocabulary/adopted-entities.mjs:65 F39: chunk is one fetchAllByIdChunks slice, bounded by READ_CHUNK; the precedent is admin/inferences/page.tsx
- src/lib/watchlist/membership.ts:125 F39: scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale

### 10d. glyph:verbatim markers

[CONFIRMED: git grep] 1038 lines in 220 files carry `glyph:verbatim` (the opt-out of rule 022's glyph check); 548 carry trailing explanatory text, 490 are a bare marker with no reason. Files (markers/with text):

- docs/audits/plan-completion-audit-2026-09-05/skills-rules-doctrine.md (50/40)
- docs/audits/wiring-audit-2026-09-04/A1-runtimes.md (38/35)
- docs/audits/full-read-2026-08-31/L14-scripts-B.md (33/0)
- docs/audits/full-read-2026-08-31/L13-scripts-A.md (32/3)
- docs/audits/perf-waterfall-2026-09-04.md (22/21)
- docs/audits/plan-completion-audit-2026-09-05/loop-harness-flywheel-one-unit.md (22/14)
- docs/audits/plan-completion-audit-2026-09-05/W3-W4-sourcing-propagation.md (21/21)
- docs/audits/full-read-2026-08-31/L11-lib-C.md (20/0)
- docs/audits/full-code-reading-audit-2026-08-09.md (19/19)
- docs/audits/full-read-2026-08-31/L07-comp-C.md (19/0)
- docs/audits/full-read-2026-08-31/L08-comp-D.md (19/0)
- docs/audits/wiring-audit-2026-09-04/A2-surfaces.md (19/18)
- docs/design/parts-brief-2026-09-18.md (19/0)
- docs/audits/full-read-2026-08-31/L05-comp-A2.md (18/0)
- docs/audits/plan-completion-audit-2026-09-05/W5-W6-W7-surfaces-community-discipline.md (18/18)
- docs/audits/plan-completion-audit-2026-09-05/tools-inventory-unused-duplicates.md (18/17)
- docs/audits/full-read-2026-08-31/L01-app.md (16/0)
- docs/audits/full-read-2026-08-31/L04-api-B.md (16/0)
- docs/audits/full-read-2026-08-31/L10-lib-sources.md (16/0)
- docs/audits/perf-load-times-2026-09-03.md (15/12)
- docs/audits/wiring-audit-2026-09-04/C2-rulings-vs-implementation.md (15/11)
- docs/audits/full-read-2026-08-31/L09-lib-agent.md (14/0)
- src/app/admin/parts/command-bar/page.tsx (14/0)
- docs/audits/full-read-2026-08-31/L05-comp-A1.md (13/0)
- docs/audits/full-read-2026-08-31/L16-disc-B.md (13/0)
- docs/audits/plan-completion-audit-2026-09-05/W1-W2-intake-population.md (13/13)
- docs/audits/wiring-audit-2026-09-04/C1-loop-map.md (13/3)
- docs/audits/SESSION-AUDIT-2026-05-05.md (12/0)
- docs/audits/full-read-2026-08-31/L03-api-A.md (12/0)
- docs/audits/full-read-2026-08-31/L15-disc-A.md (12/0)
- docs/audits/full-read-2026-08-31/L06-comp-B.md (11/0)
- scripts/inventories/generate-migrations-inventory.test.mjs (11/11)
- docs/audits/wiring-audit-2026-09-04/B2-data-layer.md (10/2)
- docs/audits/full-read-2026-08-31/L18-migrations-A.md (9/0)
- docs/audits/product-code-wiring-truth-2026-08-09.md (8/7)
- docs/audits/full-read-2026-08-31/L17-misc.md (7/0)
- src/components/ui/__fixtures__/list-row-fixture.ts (7/0)
- docs/audits/ISR-WRITE-INVESTIGATION.md (6/0)
- docs/audits/goldens-wiring-truth-2026-08-09.md (6/5)
- docs/audits/runtime-clock-inventory-2026-08-10.md (6/5)
- docs/ops/session-log.md (6/6)
- .discipline/governance/invariants.d/RD-16-transport-hold-all-four.mjs (6/6)
- docs/audits/full-read-2026-08-31/L12-lib-D.md (5/0)
- docs/audits/full-read-2026-08-31/L19-migrations-B.md (5/0)
- docs/audits/full-read-audit-2026-08-31.md (5/0)
- docs/audits/remediation-close-2026-07-15.md (5/0)
- docs/audits/skill-vs-runtime-analysis-delta-2026-08-09.md (5/0)
- docs/audits/full-read-2026-08-31/REC-2-plans.md (4/0)
- docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar-amendment-1.md (4/0)
- docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-d.md (4/0)
- docs/ops/session-log.d/2026-10-03-adr042-landing.md (4/0)
- .discipline/governance/invariants.d/RD-56-derived-values-gate.mjs (4/4)
- .discipline/governance/invariants.d/RD-57-statutory-purity.mjs (4/4)
- .discipline/governance/invariants.d/RD-62-perf-budget-ratchet.mjs (4/4)
- .discipline/governance/invariants.d/RD-63-unbounded-supabase-read.mjs (4/4)
- .discipline/governance/invariants.d/RD-64-unbounded-in-filter.mjs (4/4)
- .discipline/governance/invariants.d/RD-65-authed-api-fetch.mjs (4/4)
- .discipline/governance/invariants.d/RD-66-dead-media-query-class.mjs (4/4)
- scripts/inventories/generate-migrations-inventory.mjs (4/3)
- src/components/admin/redesign/WorkspacesUsageRow.tsx (4/0)
- docs/audits/REGIONAL-DATA-COLLECTION-AUDIT.md (3/0)
- docs/audits/WORKER-ACTIVATION-AUDIT-2026-05-08.md (3/0)
- docs/audits/full-read-2026-08-31/REC-1-specs-decisions.md (3/0)
- docs/audits/ingest-behavioral-read-2026-07-18.md (3/0)
- docs/audits/wiring-audit-2026-09-04/B1-modules.md (3/3)
- docs/dispatches/industry-statements-design-2026-10-08.md (3/0)
- .discipline/governance/invariants.d/EP-12-figure-expression.mjs (3/3)
- .discipline/governance/invariants.d/EP-8-qualification-capture.mjs (3/3)
- .discipline/governance/invariants.d/RD-12-size-cap-doctrine.mjs (3/3)
- .discipline/governance/invariants.d/RD-13-error-body-groundability-gate.mjs (3/3)
- .discipline/governance/invariants.d/RD-13-one-url-canonicalizer.mjs (3/3)
- .discipline/governance/invariants.d/RD-14-line-read-is-not-verification.mjs (3/3)
- .discipline/governance/invariants.d/RD-14-transport-escalation-write-gate.mjs (3/3)
- .discipline/governance/invariants.d/RD-15-no-service-anon-downgrade.mjs (3/3)
- .discipline/governance/invariants.d/RD-17-rls-credential-parity.mjs (3/3)
- .discipline/governance/invariants.d/RD-18-column-existence-parity.mjs (3/3)
- .discipline/governance/invariants.d/RD-20-staged-transit-disposition.mjs (3/3)
- .discipline/governance/invariants.d/RD-21-generation-pause-split.mjs (3/3)
- .discipline/governance/invariants.d/RD-23-pause-flag-one-writer.mjs (3/3)
- .discipline/governance/invariants.d/RD-24-single-grounding-entry.mjs (3/3)
- .discipline/governance/invariants.d/RD-28-verified-is-resting-state.mjs (3/3)
- .discipline/governance/invariants.d/RD-37-charset-aware-decode.mjs (3/3)
- .discipline/governance/invariants.d/RD-42-disposition-content-gate.mjs (3/3)
- .discipline/governance/invariants.d/RD-44-grounding-is-non-destructive.mjs (3/3)
- .discipline/governance/invariants.d/RD-45-erase-only-on-proven-inaccuracy.mjs (3/3)
- .discipline/governance/invariants.d/RD-47-doctrine-binds-to-pipeline-not-executor.mjs (3/3)
- .discipline/governance/invariants.d/RD-48-target-instrument-match.mjs (3/3)
- .discipline/governance/invariants.d/RD-51-cached-shape-key-rotation.mjs (3/3)
- .discipline/governance/invariants.d/RD-52-governed-surface-coverage-ratchet.mjs (3/3)
- .discipline/governance/invariants.d/RD-54-module-liveness.mjs (3/3)
- .discipline/governance/invariants.d/RD-58-surface-acceptance-register.mjs (3/3)
- .discipline/governance/invariants.d/RD-61-date-format-timezone-pin.mjs (3/3)
- .discipline/governance/invariants.d/RD-7-roadblock-alternative-search.mjs (3/3)
- .discipline/governance/invariants.d/RD-9-producer-consumer-orphan.mjs (3/3) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- .discipline/governance/invariants.d/SC-11-floor-first-attribution.mjs (3/3)
- .discipline/governance/invariants.d/SC-12-slot-forcing-genuine-support.mjs (3/3)
- .discipline/governance/invariants.d/SC-13-register-step-deterministic-tier.mjs (3/3)
- .discipline/governance/invariants.d/SC-9-moat-base-tier-only.mjs (3/3)
- .discipline/rules/022-no-dash-glyphs.mjs (3/2)
- docs/audits/DESIGN-AUDIT-2026-05.md (2/0)
- docs/audits/PERF-AUDIT.md (2/0)
- docs/audits/acquisition-ladder-post-mortem-2026-07-14.md (2/0)
- docs/audits/caros-ledge-product-audit-2026-05-15.md (2/0)
- docs/audits/null-tier-host-ruling-2026-08-11.md (2/0)
- docs/dispatches/lane-briefs/2026-09-19/brief-n5.md (2/2)
- docs/ops/session-log.d/2026-09-19-n5.md (2/2)
- docs/ops/session-log.d/2026-10-01-r22-actions-storage.md (2/2)
- .discipline/governance/invariants.d/EP-11-canonical-instrument-key.mjs (2/2)
- .discipline/governance/invariants.d/EP-13-skill-prompt-parity.mjs (2/2)
- .discipline/governance/invariants.d/EP-14-entity-spine-text-key-ratchet.mjs (2/2)
- .discipline/governance/invariants.d/EP-9-single-mint-chokepoint.mjs (2/2)
- .discipline/governance/invariants.d/RD-10-spend-chokepoint.mjs (2/2)
- .discipline/governance/invariants.d/RD-11-transport-hold-gate.mjs (2/2)
- .discipline/governance/invariants.d/RD-19-worktree-isolation.mjs (2/2)
- .discipline/governance/invariants.d/RD-22-mint-source-link.mjs (2/2)
- .discipline/governance/invariants.d/RD-27-snapshot-write-on-acquire.mjs (2/2)
- .discipline/governance/invariants.d/RD-30-flag-age-dwell.mjs (2/2)
- .discipline/governance/invariants.d/RD-31-operator-priced-spend.mjs (2/2)
- .discipline/governance/invariants.d/RD-32-data-existence-before-acquisition.mjs (2/2)
- .discipline/governance/invariants.d/RD-33-no-execution-from-stale-state.mjs (2/2)
- .discipline/governance/invariants.d/RD-34-referenced-law-exists.mjs (2/2)
- .discipline/governance/invariants.d/RD-35-flow-golden-mandate.mjs (2/2)
- .discipline/governance/invariants.d/RD-36-re-grounds-never-destroy.mjs (2/2) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- .discipline/governance/invariants.d/RD-38-funded-pass-run-lock.mjs (2/2)
- .discipline/governance/invariants.d/RD-39-suspended-source-unselectable.mjs (2/2)
- .discipline/governance/invariants.d/RD-4-quarantine-disposition.mjs (2/2)
- .discipline/governance/invariants.d/RD-46-primary-text-permanent.mjs (2/2)
- .discipline/governance/invariants.d/RD-49-confidentiality-ruled-purge-exception.mjs (2/2)
- .discipline/governance/invariants.d/RD-50-fork-log-frozen.mjs (2/2)
- .discipline/governance/invariants.d/RD-53-db-object-migration-home.mjs (2/2)
- .discipline/governance/invariants.d/RD-59-bundle-safe-module-evaluation.mjs (2/2)
- .discipline/governance/invariants.d/RD-6-deferral-vs-undispositioned.mjs (2/2)
- .discipline/governance/invariants.d/RD-60-row-ux-measured-on-real-component.mjs (2/2)
- .discipline/governance/invariants.d/RD-67-default-open-disclosure.mjs (2/2)
- .discipline/governance/invariants.d/RD-8-retrieval-before-generation.mjs (2/2)
- .discipline/governance/invariants.d/RD-90-actions-artifact-budget.mjs (2/2)
- .discipline/governance/invariants.d/SC-15-source-role-at-birth.mjs (2/2)
- .discipline/governance/invariants.d/SC-8-authority-floor.mjs (2/2)
- .discipline/governance/invariants.d/SCS-1-surface-contracts-skill-copy.mjs (2/2)
- .discipline/governance/invariants.d/SF-10-customer-surface-rendering.mjs (2/2)
- .discipline/governance/invariants.d/SF-11-secrets-registered.mjs (2/2)
- .discipline/governance/invariants.d/SF-12-doctrine-no-uncited-gate.mjs (2/2)
- scripts/producers/regional/bls-oews-producer.mjs (2/2)
- scripts/producers/regional/eurostat-nrg-pc-205-producer.mjs (2/2)
- src/components/admin/AssumptionRegisterPanel.tsx (2/0)
- src/components/admin/ErrorGroupsView.tsx (2/1)
- src/components/admin/redesign/AdminIssuesRail.tsx (2/0)
- src/components/operations/AuxiliaryEnergyPanelView.npmtest.mjs (2/2)
- docs/audits/INTEGRITY-TRIAGE-REPORT.md (1/0)
- docs/audits/PERF-PROFILING-FINDINGS.md (1/0)
- docs/audits/VISUAL-RECONCILIATION-2026-05-06.md (1/0)
- docs/audits/W1B-approval-handler-analysis.md (1/0)
- docs/audits/access-method-triage-2026-05-12.md (1/0)
- docs/audits/classification-rules-audit-2026-05-09.md (1/0)
- docs/audits/dormant-systems-section7-results-2026-07-18.md (1/0)
- docs/audits/four-page-architecture-survey-2026-05-09.md (1/0)
- docs/audits/full-code-audit-2026-08-09.md (1/0)
- docs/audits/functional-purpose-audit-2026-05-24.md (1/0)
- docs/audits/hotfix-3-perf-audit-2026-05-07.md (1/0)
- docs/audits/jurisdiction-normalization-audit-2026-05-11.md (1/0)
- docs/audits/migration-drift-investigation-2026-05-12.md (1/0)
- docs/audits/source-coverage-diagnostic-2026-05-09.md (1/0)
- docs/audits/source-map-from-esgtoday-2026-05-09.md (1/0)
- docs/audits/supabase-structure-audit-2026-07-19.md (1/0)
- docs/audits/wave1b-stub-quality-investigation-2026-05-11.md (1/0)
- docs/audits/wiring-audit-2026-09-04.md (1/0)
- docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar.md (1/0)
- docs/dispatches/lane-briefs/2026-09-22/brief-g4.md (1/1)
- docs/dispatches/lane-briefs/2026-10-03-w4/README.md (1/1)
- docs/dispatches/lane-common-contract.md (1/1)
- docs/ops/HANDOFF-2026-09-18.md (1/1)
- docs/ops/session-log.d/2026-09-20-r22.md (1/1)
- docs/ops/session-log.d/2026-09-25-parity-parts-look-only.md (1/1)
- docs/ops/session-log.d/2026-10-01-r45-migration-truth.md (1/1)
- docs/plans/defect-fix-plan-2026-09-12.md (1/1) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- .discipline/governance/invariants.d/AC-1-section-construction.mjs (1/1)
- .discipline/governance/invariants.d/AC-2-grounding-models.mjs (1/1)
- .discipline/governance/invariants.d/EP-1-integrity.mjs (1/1)
- .discipline/governance/invariants.d/EP-10-vocab-sync.mjs (1/1)
- .discipline/governance/invariants.d/EP-4-source-not-item.mjs (1/1)
- .discipline/governance/invariants.d/EP-5-cross-format-lens.mjs (1/1)
- .discipline/governance/invariants.d/EP-6-cause-effect.mjs (1/1)
- .discipline/governance/invariants.d/EP-7-severity-labels.mjs (1/1)
- .discipline/governance/invariants.d/PI-3-community-coequal.mjs (1/1)
- .discipline/governance/invariants.d/PI-5-every-decline-names-the-five-contracts.mjs (1/1)
- .discipline/governance/invariants.d/RD-2-class-fixes-mechanical.mjs (1/1)
- .discipline/governance/invariants.d/RD-25-paid-row-attribution.mjs (1/1)
- .discipline/governance/invariants.d/RD-26-pre-logged-acquire-justification.mjs (1/1)
- .discipline/governance/invariants.d/RD-29-fresh-snapshot-never-paid.mjs (1/1) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- .discipline/governance/invariants.d/RD-40-no-fact-on-suspended-source.mjs (1/1)
- .discipline/governance/invariants.d/RD-41-mint-gates-report-only.mjs (1/1)
- .discipline/governance/invariants.d/RD-49-schema-drift-committed-source.mjs (1/1)
- .discipline/governance/invariants.d/RD-5-status-is-a-cache.mjs (1/1)
- .discipline/governance/invariants.d/RD-55-harness-run-integrity.mjs (1/1)
- .discipline/governance/invariants.d/RD-69-no-dash-glyphs.mjs (1/1)
- .discipline/governance/invariants.d/RD-91.mjs (1/1)
- .discipline/governance/invariants.d/RG-1-plan-reground.mjs (1/1)
- .discipline/governance/invariants.d/SC-10-floor-source-complete.mjs (1/1)
- .discipline/governance/invariants.d/SC-14-standard-own-body-floor.mjs (1/1)
- .discipline/governance/invariants.d/SC-3-effective-tier-formula.mjs (1/1)
- .discipline/governance/invariants.d/SC-4-bias-external-only.mjs (1/1)
- .discipline/governance/invariants.d/SC-5-domain-int-ssot.mjs (1/1)
- .discipline/governance/invariants.d/SC-7-claims-tier.mjs (1/1)
- .discipline/manifest.mjs (1/1)
- .discipline/rendering/smoke/dashboard-brief-smoke.mjs (1/1)
- .discipline/rules/022-no-dash-glyphs.test.mjs (1/1)
- scripts/entities/backfill-lineage-edges.mjs (1/1)
- scripts/holdings-audit.mjs (1/1)
- scripts/research/research-walker.mjs (1/0)
- scripts/verify/funded-pass-lock-golden.mjs (1/1)
- scripts/verify/verification-audit-report.mjs (1/1)
- src/app/admin/parts/rail-card/page.tsx (1/0)
- src/app/admin/parts/stat-block/page.tsx (1/0)
- src/components/admin/IntegrityFlagsView.tsx (1/0)
- src/components/admin/PlatformIntegrityFlagsView.tsx (1/0)
- src/components/operations/GridQueuePanelView.npmtest.mjs (1/1)
- src/components/regulations/ObligationRegisterFilterBar.npmtest.mjs (1/1)
- src/components/ui/SectionHeader.tsx (1/0)
- src/components/ui/__fixtures__/search-results-fixture.ts (1/0)
- src/lib/detail/fact-card-panel21c-fixture.ts (1/1)

### 10e. Write-Guard-Override and Consistency-Override trailers on origin/master since 2026-07-01

[CONFIRMED: git log --grep] 11 of the 1,087 commits carry one as an anchored trailer (9 Write-Guard-Override, 2 Consistency-Override); every one carries reason text. A 12th commit matches the name only in prose (a0c8d0db, 2026-07-11, the override-wiring change itself).

| Commit | Date | Trailer | Reason (clipped) |
|---|---|---|---|
| 948c1965 | 2026-09-12 | Write-Guard-Override | rule 015 flagged a plain JS Map.prototype.delete in vocab-inventory.mjs; the file makes no database call (confirmed by grep and by the rule's RAW_WRITE_RE) |
| f00ef6b4 | 2026-07-28 | Write-Guard-Override | persist-titles.mjs writes only the new nullable title/title_source columns, idempotent, reversible by nulling; per-row snapshot inapplicable |
| 4811c826 | 2026-07-27 | Write-Guard-Override | identity-resolve.mjs writes only six new nullable migration-228 columns, idempotent, reversible; per-row snapshot inapplicable to a 3,661-row pass |
| 5bd55a77 | 2026-07-11 | Write-Guard-Override | C8 application evidence and FuelEU twin op, guarded via db.mjs; no new unguarded write logic |
| f095217a | 2026-07-11 | Write-Guard-Override | DDL evidence, shared-helper orderBy param, A4 script call-site fix; no new corpus-write logic |
| a5d9e004 | 2026-07-11 | Write-Guard-Override | DDL evidence doc and a one-char deferral-reason keyword fix in an author-only script |
| 2a77b301 | 2026-07-11 | Write-Guard-Override | merge of Agent B author-only scripts already committed with their own override |
| 2711a209 | 2026-07-11 | Write-Guard-Override | authored-not-applied Track-B migrations per wave-alpha dispatch |
| ba183088 | 2026-07-11 | Consistency-Override | C4: an external transient scratchpad worktree owned by another dispatch; remediation-deadline 2026-07-18 |
| d54bb41d | 2026-07-11 | Consistency-Override | C4: live ephemeral agent worktree at scratchpad path; cleanup owed at R0.2 merge; remediation-deadline 2026-07-18 |
| e954a141 | 2026-07-11 | Write-Guard-Override | scripts/_reconciliation-2026-07-11/ are the post-execution audit record of already-run remediation writes; rewriting to guardedUpdate would falsify what executed |

The two Consistency-Override remediation deadlines (2026-07-18) are past; whether the owed cleanup happened is not checked here.

## 11. Migrations: files never applied, ledger rows with no file, ledger rows with no stored statements

SOURCE NOTE [CONFIRMED]: the file named in the request, fsi-app/scripts/tmp/migration-history-2026-10-07/reconciliation.md, does NOT exist on disk (not in the main checkout, not under any agent worktree in .claude/worktrees by directory-name search, not in C:/tmp). It was produced by lane MIG-HIST-1 outside this checkout and is not in git. The only readable evidence of the same reconciliation is the lane's own output in the UNMERGED lane worktree `.claude/worktrees/mighist1-recover` (branch lane/mighist1-recover, staged but uncommitted, HEAD 499ac85c): `fsi-app/supabase/migrations/APPLIED-MAP.json` (352 ledger rows) and `docs/ops/session-log.d/2026-10-07-mighist1-recover.md`. Both were READ, not re-queried; no database was touched. origin/master has no APPLIED-MAP.json (`git ls-tree origin/master`: 0 matches), which is why chain-proof.yml is red by design. The three counts below are the request's figures checked against that map.

| Count | Request figure | Found in lane map | Method |
|---|---|---|---|
| Migration files never applied | 16 | **16 files carry the lane's new status header** = 11 files with no ledger row (7 outside-ledger, 3 duplicate-prefix, 1 never-applied) + 5 "APPLIED UNDER LEDGER VERSION" (header edits per the lane session log). Strictly "never applied" is 1 file; the other 15 are unledgered or ledgered under another version [CONFIRMED: map files_without_row + session log text]. | APPLIED-MAP.json, session log |
| Ledger rows with no file | 45 | **36 rows still have no file** (class: data-only 27, comment-only 3, superseded-by 6) and **5 were given recovered files** by the lane (versions 20260720150850, 20260721222204, 20260801131707, 20260801201905, 20260802153524); 36+5 = 41, so 4 of the 45 are not separately identifiable from the map alone (the 6 apply-record-stub rows carry files). | APPLIED-MAP.json |
| Ledger rows with no stored statements | 112 | **112** rows of class statements-null [CONFIRMED: exact match]. | APPLIED-MAP.json |

Class tally of all 352 ledger rows in the map: statements-null 112, identical 109, apply-record-stub 6, code-differs 74, data-only 27, comment-only 3, superseded-by 6, recovered 5, comments-only 10. The lane's own expected first live run is FAIL on 74 code-differs rows (migration file text differs from the statements the ledger stored) until MIG-HIST-2.

### 11a. Files with no ledger row (11)

| # | File | Class | Evidence (clipped) |
|---|---|---|---|
| 1 | 006_rls_multi_tenant.sql | duplicate-prefix | forensics E3: second file on version 006; the ledger holds 006 multi_tenant only; F51 allowlist 2026-09-19 (renumbering refused); [HYPOTHESIS] applied by hand in April |
| 2 | 007_full_brief.sql | duplicate-prefix | forensics E3: second file on version 007; the ledger holds 007 community_layer only; F51 allowlist 2026-09-19 |
| 3 | 007_rls_community.sql | duplicate-prefix | forensics E3: third file on version 007; the ledger holds 007 community_layer only; F51 allowlist 2026-09-19 |
| 4 | 202_standard_own_body_floor.sql | outside-ledger | docs/ops/session-log.md line 2415: applied live via the direct postgres pooler; no ledger row [HYPOTHESIS until objects verified] |
| 5 | 205_funded_pass_runlock.sql | outside-ledger | docs/PROGRAM-BOARD.md line 507: proven live; no ledger row [HYPOTHESIS until objects verified] |
| 6 | 206_mint_gate_hold_marker.sql | outside-ledger | hardening-resume-2026-07-16.md line 19: flip live; no ledger row [HYPOTHESIS until objects verified] |
| 7 | 260_fk_indexes_and_scanner_hygiene.sql | outside-ledger | header lines 14 to 21: CREATE INDEX CONCURRENTLY cannot run through apply_migration, applied via direct psql; full-read-audit-2026-08-31.md line 225 says it may never have applied; no ledger row [H... |
| 8 | 262_rls_initplan_sweep.sql | outside-ledger | no applied record found in docs; classed with 260 and 263 of the same PR 452; no ledger row [HYPOTHESIS until objects verified] |
| 9 | 263_mode_vocabulary_ocean_canonical.sql | outside-ledger | master-execution-plan-2026-08-17.md line 40 cites its applied record; no ledger row [HYPOTHESIS until objects verified] |
| 10 | 299_item_type_required_slots_wave3.sql | never-applied | docs/ops/session-log.md lines 10300 to 10307: written and not applied; still held per HANDOFF-2026-09-18.md line 275 and session-log.d/2026-09-25-operator-ruling-r14.md line 16 [CONFIRMED text] |
| 11 | 315_workspace_due_next.sql | outside-ledger | header says APPLIED LIVE 2026-09-08 by the lane; no ledger row, [HYPOTHESIS] applied through execute_sql, which writes no ledger row |

### 11b. Ledger rows with no file in the repo (36 still file-less, version / name / class / note)

- 20260717223651 216_coverage_gap_data_class_and_gemini_delta [data-only]: column data_class and its CHECK are held by 273; COMMENT and data rows not recreated. Session C coverage-gap lane (branch origin/corpus-integrity/c... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql)
- 20260717232219 217_coverage_gap_class1_labor_cost_feeds [data-only]: column discovery_class and the final data_class CHECK are held by 273; COMMENT and data rows not recreated. Session C coverage-gap lane (branch ori... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql)
- 20260717234619 218_coverage_gap_class2_energy_price_feeds [data-only]: INSERT of coverage_gap_candidates rows. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718001047 219_coverage_gap_class3_commercial_fuel_assessments [data-only]: INSERT and UPDATE of coverage_gap_candidates rows. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merge... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718003159 220_coverage_gap_class4_state_subnational_trackers [data-only]: INSERT of coverage_gap_candidates rows. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718015746 221_coverage_gap_class5_compliance_reporting_portals [data-only]: INSERT of coverage_gap_candidates rows. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718020307 222_coverage_gap_class6_enforcement_verification_systems [data-only]: INSERT of coverage_gap_candidates rows. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718020707 223_coverage_gap_class5_eu_epr_expansion [data-only]: INSERT of coverage_gap_candidates rows. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718020828 224_coverage_gap_class6_five_surface_test [data-only]: UPDATE of coverage_gap_candidates rows. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718021214 225_coverage_gap_class7_lca_disclosure_verification [data-only]: INSERT of coverage_gap_candidates rows. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718022118 226_coverage_gap_class8_market_intel_sources [data-only]: INSERT of coverage_gap_candidates rows. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718022732 227_coverage_gap_class9_research_horizon_sources [data-only]: INSERT of coverage_gap_candidates rows. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718185835 228_coverage_gap_surface_contract_gate [comment-only]: columns disposition and surface_test and both CHECK constraints are held by 273; the two stored COMMENT ON COLUMN statements are comments and are n... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql)
- 20260718185947 229_coverage_gap_gate_first_live_dispositions [data-only]: UPDATE of coverage_gap_candidates dispositions. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, ... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718190445 230_coverage_gap_access_model_and_backlog_view [data-only]: column access_model and its CHECK are held by 273 and the view by 223_acquisition_backlog_v.sql; the UPDATE and the comments are not recreated. Ses... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql)
- 20260718190922 231_coverage_gap_backlog_view_section4_fix [data-only]: the view is held by 223; the UPDATE of access_model rows is data. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor... (superseded by fsi-app/supabase/migrations/223_acquisition_backlog_v.sql)
- 20260718192452 232_coverage_gap_gemini_second_pass_and_vertical_standards [data-only]: the discovery_class CHECK in its final form is held by 273; the INSERT is data. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grou... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql)
- 20260718193242 233_coverage_gap_gemini_second_pass_access_model [data-only]: UPDATE of access_model. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026-07-20); a one-t... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718200026 234_coverage_gap_section3_final_dispositions [data-only]: UPDATE of dispositions. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026-07-20); a one-t... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718200111 235_coverage_gap_section4_final_rulings [data-only]: UPDATE of dispositions. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026-07-20); a one-t... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718200309 236_coverage_gap_saf_claims_substantiation_membership_check [data-only]: UPDATE and INSERT of coverage_gap_candidates rows. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merge... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260718200509 237_coverage_gap_backlog_view_watch_condition_fix [comment-only]: the view acquisition_backlog_v is held by 223; the stored COMMENT ON VIEW is a comment and is not recreated (superseded by fsi-app/supabase/migrations/223_acquisition_backlog_v.sql)
- 20260718202706 coverage_gap_rank12_parked_with_watch [data-only]: UPDATE of one disposition. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026-07-20); a on... (superseded by fsi-app/supabase/migrations/273_coverage_gap_candidates_live_ddl_catchup.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260719205437 coverage_gap_census_findings [superseded-by]: coverage_gap_census_findings and its table comment are created by 222 (retroactive capture, same DDL-before-migration gap) (superseded by fsi-app/supabase/migrations/222_census_rollup_stitch.sql)
- 20260719210535 coverage_gap_census_sweep1_existing_feeds [data-only]: INSERT of census findings. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026-07-20); a on... (superseded by fsi-app/supabase/migrations/222_census_rollup_stitch.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260719212507 source_health_flags_sweep1_dead_urls [data-only]: INSERT of integrity_flags rows. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026-07-20);... (superseded by fsi-app/supabase/migrations/048_integrity_flags_platform.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260719212632 coverage_gap_census_pending_a_marker [data-only]: column pending_dependency and its comment are held by 222; the two UPDATEs are data. Session C coverage-gap lane (branch origin/corpus-integrity/cc... (superseded by fsi-app/supabase/migrations/222_census_rollup_stitch.sql)
- 20260719212830 coverage_gap_census_sweep2_adjacent_universes [data-only]: INSERT of census findings. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026-07-20); a on... (superseded by fsi-app/supabase/migrations/222_census_rollup_stitch.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260719213059 coverage_gap_census_sweep3_research_feedstock [data-only]: INSERT of census findings. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026-07-20); a on... (superseded by fsi-app/supabase/migrations/222_census_rollup_stitch.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260720151231 census_sweep4_found_then_lost_recovery [data-only]: INSERT of census findings. Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026-07-20); a on... (superseded by fsi-app/supabase/migrations/222_census_rollup_stitch.sql) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- 20260731021933 232_gate_a_postgres_port [superseded-by]: created the shadow gate_a_* SQL functions that 254 drops (census 2026-08-11, Finding 3); no master file ever created them (superseded by fsi-app/supabase/migrations/254_drop_shadow_gate_a_and_broken_hrq.sql)
- 20260731024004 233_gate_a_scan_and_store [superseded-by]: gate_a_scan_and_store, dropped by 254 (DROP FUNCTION gate_a_scan_and_store) (superseded by fsi-app/supabase/migrations/254_drop_shadow_gate_a_and_broken_hrq.sql)
- 20260801181308 capture_worker_fetch_function [comment-only]: capture_worker_fetch is held by 256 item 4 (the hardcoded publishable key replaced by a Vault reference); only the stored COMMENT ON FUNCTION is no... (superseded by fsi-app/supabase/migrations/256_migration_homes_and_vault_capture_key.sql)
- 20260809014650 fix_result_content_excerpt_comment [superseded-by]: a column comment on agent_run_searches.result_content_excerpt; 264 renamed that column to result_content, so the comment is moot (superseded by fsi-app/supabase/migrations/264_rename_result_content_excerpt.sql)
- 20260809030555 security_hardening_2026_08_09_grants_and_searchpath [superseded-by]: REVOKE from anon and authenticated is held by 248; ALTER FUNCTION set_provenance_status SET search_path is held by 160_search_path_pin_app_function... (superseded by fsi-app/supabase/migrations/248_security_grants_hardening_2026_08_09.sql)
- 20260809030625 security_hardening_2026_08_09_revoke_public [superseded-by]: REVOKE from PUBLIC; 248 states both revokes in one statement (superseded by fsi-app/supabase/migrations/248_security_grants_hardening_2026_08_09.sql)

Recovered by the lane (file now exists, schema residue only): 20260720150850 census_findings_recovery_sweep_schema -> 245_census_findings_recovery_sweep_schema.sql; 20260721222204 next_uncensused_portal_candidates -> 241_next_uncensused_portal_candidates_grant.sql; 20260801131707 enable_pg_net_for_capture_worker -> 242_enable_pg_net_for_capture_worker.sql; 20260801201905 gate_a_health_cached -> 243_enable_pg_cron_extension.sql; 20260802153524 247_profiles_auth_users_fk -> 247_profiles_auth_users_fk.sql.

### 11c. Ledger rows with no stored statements (112; version / name / file)

- 100 research_source_coverage_rpc (100_research_source_coverage_rpc.sql)
- 101 intelligence_items_domain_backfill (101_intelligence_items_domain_backfill.sql)
- 107 intelligence_items_trajectory_points (107_intelligence_items_trajectory_points.sql)
- 108 market_intel_rpc_trajectory_payload (108_market_intel_rpc_trajectory_payload.sql)
- 109 region_dimension_coverage (109_region_dimension_coverage.sql)
- 110 callout_columns_and_rpc_extension (110_callout_columns_and_rpc_extension.sql)
- 111 workspace_overrides_dismissed_at (111_workspace_overrides_dismissed_at.sql)
- 112 provenance_invariant_schema (112_provenance_invariant_schema.sql)
- 113 seed_item_type_required_slots (113_seed_item_type_required_slots.sql)
- 114 validate_item_provenance (114_validate_item_provenance.sql)
- 115 set_provenance_status_trigger (115_set_provenance_status_trigger.sql)
- 116 active_intelligence_items_view (116_active_intelligence_items_view.sql)
- 117 provenance_gate_customer_rpcs (117_provenance_gate_customer_rpcs.sql)
- 118 provenance_flip_binding (118_provenance_flip_binding.sql)
- 119 validate_item_provenance_failclose (119_validate_item_provenance_failclose.sql)
- 120 provenance_gate_remaining_customer_rpcs (120_provenance_gate_remaining_customer_rpcs.sql)
- 121 uniform_promotion_no_human_tick (121_uniform_promotion_no_human_tick.sql)
- 122 source_institutions (122_source_institutions.sql)
- 123 source_label_derivation (123_source_label_derivation.sql)
- 124 monitoring_queue_reconciled_at (124_monitoring_queue_reconciled_at.sql)
- 125 routing_by_item_type (125_routing_by_item_type.sql)
- 126 research_required_slots (126_research_required_slots.sql)
- 128 research_finding_slot_ledger_fix (128_research_finding_slot_ledger_fix.sql)
- 129 market_required_slots (129_market_required_slots.sql)
- 130 technology_required_slots (130_technology_required_slots.sql)
- 131 operations_required_slots (131_operations_required_slots.sql)
- 132 operations_slot_gap_satisfiable (132_operations_slot_gap_satisfiable.sql)
- 133 get_technology_items_rpc (133_get_technology_items_rpc.sql)
- 134 fix_research_technology_rpc_columns (134_fix_research_technology_rpc_columns.sql)
- 135 source_registration_guard (135_source_registration_guard.sql)
- 136 theme_candidate_capture (136_theme_candidate_capture.sql)
- 137 reg_family_slot_gap_satisfiable (137_reg_family_slot_gap_satisfiable.sql)
- 138 reg_only_authority_floor (138_reg_only_authority_floor.sql)
- 139 close_quarantine_flags_on_verify (139_close_quarantine_flags_on_verify.sql)
- 140 attention_counts_platform_flags (140_attention_counts_platform_flags.sql)
- 141 per_type_authority_floor (141_per_type_authority_floor.sql)
- 142 legal_line_guard (142_legal_line_guard.sql)
- 143 label_variant_tolerance (143_label_variant_tolerance.sql)
- 144 scrape_cadence (144_scrape_cadence.sql)
- 145 provenance_floor_inline_derive (145_provenance_floor_inline_derive.sql)
- 146 item_xref_origin_and_related_derive (146_item_xref_origin_and_related_derive.sql)
- 147 sources_fetch_status (147_sources_fetch_status.sql)
- 148 surface_counts (148_surface_counts.sql)
- 149 severity_backfill_ops_reg (149_severity_backfill_ops_reg.sql)
- 150 criterion2_url_canonicalize (150_criterion2_url_canonicalize.sql)
- 151 published_price_statistics (151_published_price_statistics.sql)
- 152 state_cost_facts (152_state_cost_facts.sql)
- 153 community_post_signoff_requests (153_community_post_signoff_requests.sql)
- 154 community_signoff_withdraw_policy (154_community_signoff_withdraw_policy.sql)
- 155 community_group_vertical (155_community_group_vertical.sql)
- 156 org_member_bans (156_org_member_bans.sql)
- 164 market_intel_org_gate (164_market_intel_org_gate.sql)
- 165 profiles_self_write_and_anon_pii (165_profiles_self_write_and_anon_pii.sql)
- 166 provisional_sources_admin_select (166_provisional_sources_admin_select.sql)
- 167 staged_updates_reviewer_notes (167_staged_updates_reviewer_notes.sql)
- 168 aux_table_parent_gates (168_aux_table_parent_gates.sql)
- 169 reconciler_rls_repair (169_reconciler_rls_repair.sql)
- 170 ledger_repair_107_134 (170_ledger_repair_107_134.sql)
- 171 validate_provenance_brief_presence (171_validate_provenance_brief_presence.sql)
- 180 drop_orphan_rpcs_and_dead_views (180_drop_orphan_rpcs_and_dead_views.sql)
- 181 drop_vendor_family (181_drop_vendor_family.sql)
- 182 repoint_user_profiles_policy_arms (182_repoint_policies_off_user_profiles.sql)
- 183 drop_user_profiles_mirror (183_drop_user_profiles_mirror.sql)
- 184 drop_ingestion_pair (184_drop_ingestion_pair.sql)
- 185 drop_dead_columns (185_drop_dead_columns.sql)
- 190 community_counter_integrity (190_community_counter_integrity.sql)
- 191 org_membership_ban_guard (191_org_membership_ban_guard.sql)
- 192 drop_forum_layer (192_drop_forum_layer.sql)
- 195 error_events (195_error_events.sql)
- 200 canonical_instrument_key (200_canonical_instrument_key.sql)
- 051 sources_last_scanned_recovery (051_sources_last_scanned_recovery.sql)
- 052 raw_fetches (052_raw_fetches.sql)
- 053 intelligence_item_versions (053_intelligence_item_versions.sql)
- 054 sources_scoreboard_columns (054_sources_scoreboard_columns.sql)
- 055 sources_auto_run_enabled (055_sources_auto_run_enabled.sql)
- 056 sources_access_method_extension (056_sources_access_method_extension.sql)
- 057 agent_runs (057_agent_runs.sql)
- 058 ingestion_control_log (058_ingestion_control_log.sql)
- 059 ingestion_state (059_ingestion_state.sql)
- 060 user_watchlist (060_user_watchlist.sql)
- 061 coverage_gaps (061_coverage_gaps.sql)
- 062 intelligence_items_hidden_reason (062_intelligence_items_hidden_reason.sql)
- 063 sources_classification_axes (063_sources_classification_axes.sql)
- 064 workspace_intelligence_dashboard_rpc (064_workspace_intelligence_dashboard_rpc.sql)
- 065 pending_first_fetch_queue (065_pending_first_fetch_queue.sql)
- 066 workspace_intelligence_listings_rpc (066_workspace_intelligence_listings_rpc.sql)
- 067 sources_classification_metadata (067_sources_classification_metadata.sql)
- 068 workspace_intelligence_aggregates (068_workspace_intelligence_aggregates.sql)
- 069 workspace_intelligence_aggregates_scoped (069_workspace_intelligence_aggregates_scoped.sql)
- 070 phase1_routing_rpcs (070_phase1_routing_rpcs.sql)
- 071 deterministic_tiebreaker (071_deterministic_tiebreaker.sql)
- 072 jurisdiction_normalizer (072_jurisdiction_normalizer.sql)
- 073 shared_workspace_scope (073_shared_workspace_scope.sql)
- 074 ecovadis_vendor_reclass (074_ecovadis_vendor_reclass.sql)
- 075 profiles_consolidation_phase1 (075_profiles_consolidation_phase1.sql)
- 076 org_invitations (076_org_invitations.sql)
- 077 rpc_membership_checks (077_rpc_membership_checks.sql)
- 079 canonical_entity_columns (079_canonical_entity_columns.sql)
- 080 jurisdiction_vocabulary_extension (080_jurisdiction_vocabulary_extension.sql)
- 081 admin_signal_documentation (081_admin_signal_documentation.sql)
- 082 operator_queues_and_routing (082_operator_queues_and_routing.sql)
- 083 trigger_derive_jurisdiction_iso (083_trigger_derive_jurisdiction_iso.sql)
- 084 sources_canonical_category (084_sources_canonical_category.sql)
- 085 d16_document_063_column_shadowing (085_d16_document_063_column_shadowing.sql)
- 086 analytical_press_routing (086_analytical_press_routing.sql)
- 087 canonicalize_source_urls (087_canonicalize_source_urls.sql)
- 089 intelligence_item_citations (089_intelligence_item_citations.sql)
- 090 tier_schema_split (090_tier_schema_split.sql)
- 094 tier_compat_shim (094_tier_compat_shim.sql)
- 097 q4_bias_retune_option_b (097_q4_bias_retune_option_b.sql)
- 098 get_source_citation_stats_edge_table (098_get_source_citation_stats_edge_table.sql)
- 099 tier_opinion_review_state (099_tier_opinion_review_state.sql)

[HYPOTHESIS] The 112 statements-null rows are the ledger entries written by an apply path that records name and version but not the executed text (the pooler/dashboard path); they cannot be compared with the files, so file-versus-database drift on them is unverified by construction.

## 12. Docs: orphans, dead INDEX lines, runbook steps whose script no longer exists

Method [CONFIRMED]: docs/INDEX.md parsed for markdown link targets (347 links, 337 distinct targets, resolved against docs/); every tracked file under docs/ excluding docs/archive/ (1246 files) not equal to a link target is an orphan; link targets absent from `git ls-files` are dead lines; every tracked docs/runbooks/**/*.md and fsi-app/scripts/*RUNBOOK*.md (97 files) was scanned for `scripts|.discipline|src/...` file paths (470 references, tmp, snapshot and placeholder paths skipped) and each checked against `git ls-files`. INDEX.md links no directory, so directory-level cover removes nothing.

| Measure | Count |
|---|---|
| Docs files outside archive/ not linked from INDEX.md (all types) | **935** |
| of which markdown | 467 |
| of which images, scripts, data (jpg 163, png 180, js 100, json 12, other 13) | 468 |
| INDEX.md lines pointing at files that do not exist | **24** (24 distinct targets) |
| Runbook references to scripts that no longer exist | **18** (18 distinct paths in 11 runbooks) |

[HYPOTHESIS] The INDEX header says "One line per living doc", so dated session-log fragments (docs/ops/session-log.d), dispatch briefs, audits and handoff screens are plausibly not meant to be indexed; the orphan count is therefore an upper bound for "forgotten" docs. The genuinely questionable orphans are the 5 core-folder files listed in 12b.

### 12a. Orphans by directory (markdown, with counts; non-markdown counted by directory)

- docs/ops/session-log.d: 212 (212 md)
- docs/dispatches/lane-briefs: 174 (75 md)
- docs/design/audit-2026-09-06: 164 (1 md)
- docs/design/handoff-2026-09-06: 147 (4 md)
- docs/runbooks/maintenance.d: 70 (70 md)
- docs/design/handoff-2026-09-07: 24 (0 md)
- docs/audits/full-read-2026-08-31: 21 (21 md)
- docs/plans/mobile-evidence: 20 (1 md)
- docs/ops/full-system-audit-2026-07-11: 16 (15 md)
- docs/ratifications/2026-09: 10 (2 md)
- docs/audits/wiring-audit-2026-09-04: 7 (6 md)
- docs/ops/wave-alpha-closeout-2026-07-11: 7 (6 md)
- docs/audits/plan-completion-audit-2026-09-05: 6 (6 md)
- docs/audits/stage-audit-2026-09-18: 6 (6 md)
- docs/audits/app-audit-a1-routes-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a10-remainder-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a1c-routes-completion-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a2b-components-m-z-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a2bc-components-completion-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a3b-lib-n-z-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a3c-lib-community-market-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a4-scripts-workflows-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a4b-scripts-mint-lib-verify-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a4bc-scripts-completion-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a4c-scripts-remainder-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a4cc-scripts-completion-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a5-database-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a5b-migrations-001-170-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a5c-migrations-171-339-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a6-discipline-tests-2026-09-30.md: 1 (1 md)
- docs/audits/app-audit-a6b-discipline-full-2026-09-30.md: 1 (1 md)
- docs/audits/architecture-review-2026-09-30.md: 1 (1 md)
- docs/audits/dead-code-manifest-2026-08-11.txt: 1 (0 md)
- docs/audits/docs-vs-reality-2026-09-30.md: 1 (1 md)
- docs/audits/docs-vs-reality-ops-2026-09-30.md: 1 (1 md)
- docs/audits/docs-vs-reality-plans-2026-09-30.md: 1 (1 md)
- docs/audits/full-read-audit-2026-08-31.md: 1 (1 md)
- docs/audits/gate-a-route-b-baseline-2026-08-11.csv: 1 (0 md)
- docs/audits/in-filter-audit-2026-09-06.md: 1 (1 md)
- docs/audits/mechanical-checkers-2026-09-30.md: 1 (1 md)
- docs/audits/null-tier-host-ruling-2026-08-11.csv: 1 (0 md)
- docs/audits/perf-clickthrough-2026-09-04.md: 1 (1 md)
- docs/audits/perf-waterfall-2026-09-04.md: 1 (1 md)
- docs/audits/phase-2b-flag-ingest-errors-log.json: 1 (0 md)
- docs/audits/source-classification-step1-log.json: 1 (0 md)
- docs/audits/source-classification-step2-log.json: 1 (0 md)
- docs/audits/tier-canonicalization-2026-08-11.csv: 1 (0 md)
- docs/decisions/ADR-045-chain-proof-on-a-local-stack.md: 1 (1 md)
- docs/dispatches/industry-statements-design-2026-10-08.md: 1 (1 md)
- docs/dispatches/proposer-brief-ledger-consume-train-wave48-2026-09-05.md: 1 (1 md)
- docs/dispatches/proposer-brief-propagation-train-wave48-2026-09-05.md: 1 (1 md)
- docs/doctrine/closure-gate.md: 1 (1 md)
- docs/ops/dispatch-ledger.jsonl: 1 (0 md)
- docs/ops/w11-correction-2026-08-11-prior.json: 1 (0 md)
- docs/plans/market-lane-spec-from-repo.md: 1 (1 md)
- docs/plans/operations-lane-spec-from-repo.md: 1 (1 md)
- docs/plans/research-lane-spec-from-repo.md: 1 (1 md)
- docs/plans/unblocking-the-five-2026-08-30.md: 1 (1 md)
- docs/plans/unwired-disposition-2026-08-31.md: 1 (1 md) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- docs/plans/wo19-origin-class-backfill-mapping.md: 1 (1 md)
- docs/plans/wo20-assumption-register-spec.md: 1 (1 md)
- docs/runbooks/FUELEU-STATUTORY-RUNBOOK.md: 1 (1 md)
- docs/runbooks/PROPAGATION-DRAIN-RUNBOOK.md: 1 (1 md)
- docs/runbooks/eia-api-key-registration.md: 1 (1 md)
- docs/runbooks/warm-static-detail-routes.md: 1 (1 md)

### 12b. Orphans in directories INDEX is supposed to cover completely

- docs/audits/full-read-2026-08-31/REC-1-specs-decisions.md
- docs/audits/plan-completion-audit-2026-09-05/W1-W2-intake-population.md
- docs/audits/plan-completion-audit-2026-09-05/W3-W4-sourcing-propagation.md
- docs/audits/plan-completion-audit-2026-09-05/W5-W6-W7-surfaces-community-discipline.md
- docs/audits/plan-completion-audit-2026-09-05/loop-harness-flywheel-one-unit.md
- docs/audits/plan-completion-audit-2026-09-05/skills-rules-doctrine.md
- docs/audits/plan-completion-audit-2026-09-05/tools-inventory-unused-duplicates.md
- docs/decisions/ADR-045-chain-proof-on-a-local-stack.md
- docs/doctrine/closure-gate.md

Note: docs/decisions/ADR-045-chain-proof-on-a-local-stack.md violates CLAUDE.md memory convention ("INDEX.md gains a line for every new living doc, same commit"); docs/doctrine/closure-gate.md is the only file in docs/doctrine/ with no INDEX line.

### 12c. Markdown orphans, complete list (467)

**docs/ops** (233)

- docs/ops/full-system-audit-2026-07-11/CODE-1-register.md
- docs/ops/full-system-audit-2026-07-11/CODE-2-register.md
- docs/ops/full-system-audit-2026-07-11/CODE-3-register.md
- docs/ops/full-system-audit-2026-07-11/CODE-4a-register.md
- docs/ops/full-system-audit-2026-07-11/CODE-4b-register.md
- docs/ops/full-system-audit-2026-07-11/CODE-5a-register.md
- docs/ops/full-system-audit-2026-07-11/CODE-5b-register.md
- docs/ops/full-system-audit-2026-07-11/DB-1-register.md
- docs/ops/full-system-audit-2026-07-11/DB-2-register.md
- docs/ops/full-system-audit-2026-07-11/DB-3-register.md
- docs/ops/full-system-audit-2026-07-11/DB-4-register.md
- docs/ops/full-system-audit-2026-07-11/INTENT-register.md
- docs/ops/full-system-audit-2026-07-11/X-register.md
- docs/ops/full-system-audit-2026-07-11/coverage-manifest.md
- docs/ops/full-system-audit-2026-07-11/pool-coverage-62.md
- docs/ops/session-log.d/2026-09-13-l18.md
- docs/ops/session-log.d/2026-09-18-m1.md
- docs/ops/session-log.d/2026-09-18-m2.md
- docs/ops/session-log.d/2026-09-18-m8.md
- docs/ops/session-log.d/2026-09-18-m9a.md
- docs/ops/session-log.d/2026-09-18-m9b.md
- docs/ops/session-log.d/2026-09-18-t1.md
- docs/ops/session-log.d/2026-09-18-w10a.md
- docs/ops/session-log.d/2026-09-19-d28b.md
- docs/ops/session-log.d/2026-09-19-g1.md
- docs/ops/session-log.d/2026-09-19-m3.md
- docs/ops/session-log.d/2026-09-19-n0.md
- docs/ops/session-log.d/2026-09-19-n1.md
- docs/ops/session-log.d/2026-09-19-n2.md
- docs/ops/session-log.d/2026-09-19-n3.md
- docs/ops/session-log.d/2026-09-19-n4.md
- docs/ops/session-log.d/2026-09-19-n5.md
- docs/ops/session-log.d/2026-09-19-n6.md
- docs/ops/session-log.d/2026-09-19-p7.md
- docs/ops/session-log.d/2026-09-19-t2.md
- docs/ops/session-log.d/2026-09-20-f51b.md
- docs/ops/session-log.d/2026-09-20-f52.md
- docs/ops/session-log.d/2026-09-20-m3b.md
- docs/ops/session-log.d/2026-09-20-m4.md
- docs/ops/session-log.d/2026-09-20-m7a.md
- docs/ops/session-log.d/2026-09-20-m9d.md
- docs/ops/session-log.d/2026-09-20-r22.md
- docs/ops/session-log.d/2026-09-20-t3.md
- docs/ops/session-log.d/2026-09-20-w10-factcard.md
- docs/ops/session-log.d/2026-09-21-g2.md
- docs/ops/session-log.d/2026-09-21-m6.md
- docs/ops/session-log.d/2026-09-21-m6b.md
- docs/ops/session-log.d/2026-09-21-r6t.md
- docs/ops/session-log.d/2026-09-21-r7m.md
- docs/ops/session-log.d/2026-09-21-w10-actioncard-a.md
- docs/ops/session-log.d/2026-09-21-w10-commandbar.md
- docs/ops/session-log.d/2026-09-21-w10-factcard-b.md
- docs/ops/session-log.d/2026-09-21-w10-factcard-c.md
- docs/ops/session-log.d/2026-09-21-w10-factcard-d.md
- docs/ops/session-log.d/2026-09-22-f51c.md
- docs/ops/session-log.d/2026-09-22-g3-audit.md
- docs/ops/session-log.d/2026-09-22-g3.md
- docs/ops/session-log.d/2026-09-22-g3b.md
- docs/ops/session-log.d/2026-09-22-g4.md
- docs/ops/session-log.d/2026-09-22-ui75.md
- docs/ops/session-log.d/2026-09-22-w10-actioncard-b.md
- docs/ops/session-log.d/2026-09-22-w10-factcard-e.md
- docs/ops/session-log.d/2026-09-22-w10-listrow.md
- docs/ops/session-log.d/2026-09-22-w10-masthead-amendment-1.md
- docs/ops/session-log.d/2026-09-22-w10-masthead.md
- docs/ops/session-log.d/2026-09-22-w10-sectionheader.md
- docs/ops/session-log.d/2026-09-23-w10-commandbar-parts.md
- docs/ops/session-log.d/2026-09-23-w10-navcard.md
- docs/ops/session-log.d/2026-09-23-w10-railcard.md
- docs/ops/session-log.d/2026-09-23-w10-statenote-remaining.md
- docs/ops/session-log.d/2026-09-23-w10-statenote.md
- docs/ops/session-log.d/2026-09-24-auth-identity.md
- docs/ops/session-log.d/2026-09-24-masthead-auth.md
- docs/ops/session-log.d/2026-09-24-parity-parts.md
- docs/ops/session-log.d/2026-09-24-reg-redirect.md
- docs/ops/session-log.d/2026-09-25-adr-034.md
- docs/ops/session-log.d/2026-09-25-adr-035.md
- docs/ops/session-log.d/2026-09-25-artboards.md
- docs/ops/session-log.d/2026-09-25-coordinator-close.md
- docs/ops/session-log.d/2026-09-25-operator-ruling-r14.md
- docs/ops/session-log.d/2026-09-25-parity-parts-look-only.md
- docs/ops/session-log.d/2026-09-25-sec1-derivation-edges-rls.md
- docs/ops/session-log.d/2026-09-25-supabase-audit-lane.md
- docs/ops/session-log.d/2026-09-25-tool-gap-1.md
- docs/ops/session-log.d/2026-09-25-tool-gap-2.md
- docs/ops/session-log.d/2026-09-25-tool-gap-3.md
- docs/ops/session-log.d/2026-09-26-gate-a-rescan-fix.md
- docs/ops/session-log.d/2026-09-26-harness-landing.md
- docs/ops/session-log.d/2026-09-26-master-022.md
- docs/ops/session-log.d/2026-09-26-operator-ruling-no-actions-prs.md
- docs/ops/session-log.d/2026-09-26-state-cost-producer.md
- docs/ops/session-log.d/2026-09-27-harness-runs-db-design.md
- docs/ops/session-log.d/2026-09-27-state-cost-dag.md
- docs/ops/session-log.d/2026-09-27-worktree-node-modules.md
- docs/ops/session-log.d/2026-09-28-audit-triage.md
- docs/ops/session-log.d/2026-09-28-ci-parity.md
- docs/ops/session-log.d/2026-09-28-clock-test.md
- docs/ops/session-log.d/2026-09-28-coordinator-close.md
- docs/ops/session-log.d/2026-09-28-ets-proxy.md
- docs/ops/session-log.d/2026-09-28-loop-b-firing.md
- docs/ops/session-log.d/2026-09-28-quarantine-disposition.md
- docs/ops/session-log.d/2026-09-28-statutory-writer.md
- docs/ops/session-log.d/2026-09-28-structured-actions.md
- docs/ops/session-log.d/2026-09-29-chained-apply-incident.md
- docs/ops/session-log.d/2026-09-29-chained-dry-guard-2.md
- docs/ops/session-log.d/2026-09-29-chained-dry-guard.md
- docs/ops/session-log.d/2026-09-29-drop-placeholders.md
- docs/ops/session-log.d/2026-09-29-harness-run-number.md
- docs/ops/session-log.d/2026-09-29-loop-b-firing.md
- docs/ops/session-log.d/2026-09-29-reverse-chained-apply.md
- docs/ops/session-log.d/2026-09-29-statutory-writer.md
- docs/ops/session-log.d/2026-09-29-w2a.md
- docs/ops/session-log.d/2026-09-29-w2b.md
- docs/ops/session-log.d/2026-09-29-w2c.md
- docs/ops/session-log.d/2026-09-29-w2d.md
- docs/ops/session-log.d/2026-09-29-w2e.md
- docs/ops/session-log.d/2026-09-29-w2f.md
- docs/ops/session-log.d/2026-09-29-w2g.md
- docs/ops/session-log.d/2026-09-29-w2h.md
- docs/ops/session-log.d/2026-09-30-maintenance-harness.md
- docs/ops/session-log.d/2026-10-01-r10-relabel.md
- docs/ops/session-log.d/2026-10-01-r11-checks.md
- docs/ops/session-log.d/2026-10-01-r1213-dead-css.md
- docs/ops/session-log.d/2026-10-01-r1619-docs.md
- docs/ops/session-log.d/2026-10-01-r2-officialness.md
- docs/ops/session-log.d/2026-10-01-r20-producers.md
- docs/ops/session-log.d/2026-10-01-r22-actions-storage.md
- docs/ops/session-log.d/2026-10-01-r3-guarded-upsert.md
- docs/ops/session-log.d/2026-10-01-r45-migration-truth.md
- docs/ops/session-log.d/2026-10-01-r68-gates.md
- docs/ops/session-log.d/2026-10-01-r7-lint.md
- docs/ops/session-log.d/2026-10-01-w2r-research.md
- docs/ops/session-log.d/2026-10-01-w2r2-assumptions.md
- docs/ops/session-log.d/2026-10-02-l3.md
- docs/ops/session-log.d/2026-10-02-l5.md
- docs/ops/session-log.d/2026-10-02-l6.md
- docs/ops/session-log.d/2026-10-02-l7.md
- docs/ops/session-log.d/2026-10-02-l8.md
- docs/ops/session-log.d/2026-10-02-l9.md
- docs/ops/session-log.d/2026-10-02-lint-a.md
- docs/ops/session-log.d/2026-10-02-lint-c.md
- docs/ops/session-log.d/2026-10-02-model-ids.md
- docs/ops/session-log.d/2026-10-02-r16b-forward-events-test.md
- docs/ops/session-log.d/2026-10-02-r23-validate-merge-base.md
- docs/ops/session-log.d/2026-10-02-ra-wf.md
- docs/ops/session-log.d/2026-10-03-adr041-landing.md
- docs/ops/session-log.d/2026-10-03-adr042-landing.md
- docs/ops/session-log.d/2026-10-03-board-w4.md
- docs/ops/session-log.d/2026-10-03-c-social.md
- docs/ops/session-log.d/2026-10-03-external-only.md
- docs/ops/session-log.d/2026-10-03-gitignore-local.md
- docs/ops/session-log.d/2026-10-03-l-corridor.md
- docs/ops/session-log.d/2026-10-03-l10.md
- docs/ops/session-log.d/2026-10-03-l11.md
- docs/ops/session-log.d/2026-10-03-l12.md
- docs/ops/session-log.d/2026-10-03-l13.md
- docs/ops/session-log.d/2026-10-03-l14-revert.md
- docs/ops/session-log.d/2026-10-03-l14.md
- docs/ops/session-log.d/2026-10-03-l15.md
- docs/ops/session-log.d/2026-10-03-no-typed-input.md
- docs/ops/session-log.d/2026-10-03-pre-push-trim.md
- docs/ops/session-log.d/2026-10-03-r21-or-injection.md
- docs/ops/session-log.d/2026-10-03-r7-lint-ci.md
- docs/ops/session-log.d/2026-10-03-rw-wf.md
- docs/ops/session-log.d/2026-10-04-adr043-landing.md
- docs/ops/session-log.d/2026-10-04-buildout-plan.md
- docs/ops/session-log.d/2026-10-04-coordinator-close-1.md
- docs/ops/session-log.d/2026-10-04-f51-runbook-hotspot.md
- docs/ops/session-log.d/2026-10-04-gates1-evidence.md
- docs/ops/session-log.d/2026-10-04-gates2-exporter-out.md
- docs/ops/session-log.d/2026-10-04-loop-fired-evidence.md
- docs/ops/session-log.d/2026-10-04-rb-split.md
- docs/ops/session-log.d/2026-10-04-s0-tidy.md
- docs/ops/session-log.d/2026-10-04-s0b-baseline-renewal-tool.md
- docs/ops/session-log.d/2026-10-04-s1a-source-register.md
- docs/ops/session-log.d/2026-10-04-s1b-host-verdicts.md
- docs/ops/session-log.d/2026-10-04-s1c-tier-movement.md
- docs/ops/session-log.d/2026-10-04-s1d-walker-registers.md
- docs/ops/session-log.d/2026-10-04-s2a-typed-edges.md
- docs/ops/session-log.d/2026-10-04-s3a-intersections.md
- docs/ops/session-log.d/2026-10-04-s3c-theme-brief-batches.md
- docs/ops/session-log.d/2026-10-05-deploy-gap-761e8221.md
- docs/ops/session-log.d/2026-10-05-g6-gates.md
- docs/ops/session-log.d/2026-10-05-g7-corrections.md
- docs/ops/session-log.d/2026-10-05-g7-tier.md
- docs/ops/session-log.d/2026-10-05-gates2-live-smoke.md
- docs/ops/session-log.d/2026-10-05-l4a-questions-on-change.md
- docs/ops/session-log.d/2026-10-05-l4b-question-answers.md
- docs/ops/session-log.d/2026-10-05-l4d-predictions-reliability.md
- docs/ops/session-log.d/2026-10-05-loop-hops-fired.md
- docs/ops/session-log.d/2026-10-05-p1-source-rating-display.md
- docs/ops/session-log.d/2026-10-05-p2-grade-inference-chips.md
- docs/ops/session-log.d/2026-10-05-p3-live-defects.md
- docs/ops/session-log.d/2026-10-05-s1e-source-chain.md
- docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md
- docs/ops/session-log.d/2026-10-06-auth1-repeated-signup.md
- docs/ops/session-log.d/2026-10-06-auth2-provision-heal.md
- docs/ops/session-log.d/2026-10-06-c-toggle-promote.md
- docs/ops/session-log.d/2026-10-06-g5-terms.md
- docs/ops/session-log.d/2026-10-06-g6-drain.md
- docs/ops/session-log.d/2026-10-06-g7-ui.md
- docs/ops/session-log.d/2026-10-06-p4-live-smoke-1.md
- docs/ops/session-log.d/2026-10-07-chain1-artifact-handoff.md
- docs/ops/session-log.d/2026-10-07-chain2-loop-run-id.md
- docs/ops/session-log.d/2026-10-07-g5-need.md
- docs/ops/session-log.d/2026-10-07-g5-read.md
- docs/ops/session-log.d/2026-10-07-g5-search.md
- docs/ops/session-log.d/2026-10-07-idx1-section-index.md
- docs/ops/session-log.d/2026-10-07-ops1-maintenance-health.md
- docs/ops/session-log.d/2026-10-07-par1-rows-meter.md
- docs/ops/session-log.d/2026-10-07-par1b-meter-spec.md
- docs/ops/session-log.d/2026-10-07-par2-bands-typography.md
- docs/ops/session-log.d/2026-10-07-proof1-stack-and-replay.md
- docs/ops/session-log.d/2026-10-07-proof2-subset.md
- docs/ops/session-log.d/2026-10-07-proof3-chain-steps.md
- docs/ops/session-log.d/2026-10-07-proof4-attacks.md
- docs/ops/session-log.d/2026-10-07-rules1-gate-precision.md
- docs/ops/session-log.d/2026-10-07-s8b-tag-attribution.md
- docs/ops/session-log.d/2026-10-07-s8c-count-membership.md
- docs/ops/session-log.d/2026-10-07-s8e0-producer-registry.md
- docs/ops/session-log.d/2026-10-07-s8f-industry-statements.md
- docs/ops/session-log.d/2026-10-07-s8f2-statements-build.md
- docs/ops/session-log.d/2026-10-07-trustret.md
- docs/ops/session-log.d/2026-10-08-build-mode-pause-layout-baseline.md
- docs/ops/session-log.d/2026-10-08-sec1-profiles-escalation.md
- docs/ops/session-log.d/2026-10-08-token1-capture-worker-grants.md
- docs/ops/session-log.d/README.md
- docs/ops/wave-alpha-closeout-2026-07-11/baseline.md
- docs/ops/wave-alpha-closeout-2026-07-11/c7-outcome.md
- docs/ops/wave-alpha-closeout-2026-07-11/ddl-application-evidence.md
- docs/ops/wave-alpha-closeout-2026-07-11/deletions-log.md
- docs/ops/wave-alpha-closeout-2026-07-11/f1-verdict.md
- docs/ops/wave-alpha-closeout-2026-07-11/track-b-proofs.md

**docs/dispatches** (78)

- docs/dispatches/industry-statements-design-2026-10-08.md
- docs/dispatches/lane-briefs/2026-09-18/brief-common-cloud.md
- docs/dispatches/lane-briefs/2026-09-18/brief-d2.md
- docs/dispatches/lane-briefs/2026-09-18/brief-d28b.md
- docs/dispatches/lane-briefs/2026-09-18/brief-l35h.md
- docs/dispatches/lane-briefs/2026-09-18/brief-l37.md
- docs/dispatches/lane-briefs/2026-09-18/brief-l38.md
- docs/dispatches/lane-briefs/2026-09-19/brief-common-local.md
- docs/dispatches/lane-briefs/2026-09-19/brief-g1.md
- docs/dispatches/lane-briefs/2026-09-19/brief-m3.md
- docs/dispatches/lane-briefs/2026-09-19/brief-m4.md
- docs/dispatches/lane-briefs/2026-09-19/brief-m6.md
- docs/dispatches/lane-briefs/2026-09-19/brief-m9d.md
- docs/dispatches/lane-briefs/2026-09-19/brief-n1.md
- docs/dispatches/lane-briefs/2026-09-19/brief-n2.md
- docs/dispatches/lane-briefs/2026-09-19/brief-n3.md
- docs/dispatches/lane-briefs/2026-09-19/brief-n4.md
- docs/dispatches/lane-briefs/2026-09-19/brief-n5.md
- docs/dispatches/lane-briefs/2026-09-19/brief-n6.md
- docs/dispatches/lane-briefs/2026-09-19/brief-t2.md
- docs/dispatches/lane-briefs/2026-09-20/brief-f51b.md
- docs/dispatches/lane-briefs/2026-09-20/brief-f52.md
- docs/dispatches/lane-briefs/2026-09-20/brief-m3b.md
- docs/dispatches/lane-briefs/2026-09-20/brief-m4-amendment-1.md
- docs/dispatches/lane-briefs/2026-09-20/brief-m6-amendment-1.md
- docs/dispatches/lane-briefs/2026-09-20/brief-m7a.md
- docs/dispatches/lane-briefs/2026-09-20/brief-m9d-amendment-1.md
- docs/dispatches/lane-briefs/2026-09-20/brief-t3.md
- docs/dispatches/lane-briefs/2026-09-20/brief-w10-factcard-amendment-1.md
- docs/dispatches/lane-briefs/2026-09-20/brief-w10-factcard.md
- docs/dispatches/lane-briefs/2026-09-21/brief-f51c.md
- docs/dispatches/lane-briefs/2026-09-21/brief-g2.md
- docs/dispatches/lane-briefs/2026-09-21/brief-m6b-amendment-1.md
- docs/dispatches/lane-briefs/2026-09-21/brief-m6b-amendment-2.md
- docs/dispatches/lane-briefs/2026-09-21/brief-m6b.md
- docs/dispatches/lane-briefs/2026-09-21/brief-r7m-amendment-1.md
- docs/dispatches/lane-briefs/2026-09-21/brief-r7m.md
- docs/dispatches/lane-briefs/2026-09-21/brief-w10-actioncard-a.md
- docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar-amendment-1.md
- docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar-amendment-2.md
- docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar-amendment-3.md
- docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar.md
- docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-b.md
- docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-c-amendment-1.md
- docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-c.md
- docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-d-amendment-1.md
- docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-d.md
- docs/dispatches/lane-briefs/2026-09-22/brief-g3.md
- docs/dispatches/lane-briefs/2026-09-22/brief-g4.md
- docs/dispatches/lane-briefs/2026-09-22/brief-ui75.md
- docs/dispatches/lane-briefs/2026-09-22/brief-w10-actioncard-b-amendment-1.md
- docs/dispatches/lane-briefs/2026-09-22/brief-w10-actioncard-b.md
- docs/dispatches/lane-briefs/2026-09-22/brief-w10-factcard-d-amendment-2.md
- docs/dispatches/lane-briefs/2026-09-22/brief-w10-factcard-d-amendment-3.md
- docs/dispatches/lane-briefs/2026-09-22/brief-w10-factcard-e.md
- docs/dispatches/lane-briefs/2026-09-22/brief-w10-masthead-amendment-1.md
- docs/dispatches/lane-briefs/2026-09-22/brief-w10-masthead-amendment-2.md
- docs/dispatches/lane-briefs/2026-09-22/brief-w10-masthead-amendment-3.md
- docs/dispatches/lane-briefs/2026-09-22/brief-w10-remaining-parts.md
- docs/dispatches/lane-briefs/2026-09-22/brief-w10-sectionheader-amendment-1.md
- docs/dispatches/lane-briefs/2026-09-22/brief-w10-sectionheader.md
- docs/dispatches/lane-briefs/2026-09-24/brief-live-findings.md
- docs/dispatches/lane-briefs/2026-10-02/brief-l3.md
- docs/dispatches/lane-briefs/2026-10-02/brief-l5.md
- docs/dispatches/lane-briefs/2026-10-02/brief-l6.md
- docs/dispatches/lane-briefs/2026-10-02/brief-l7.md
- docs/dispatches/lane-briefs/2026-10-02/brief-l8.md
- docs/dispatches/lane-briefs/2026-10-02/brief-l9.md
- docs/dispatches/lane-briefs/2026-10-03-w4/README.md
- docs/dispatches/lane-briefs/2026-10-03-w4/brief-l-corridor.md
- docs/dispatches/lane-briefs/2026-10-03-w4/brief-l13.md
- docs/dispatches/lane-briefs/2026-10-03-w4/brief-l14.md
- docs/dispatches/lane-briefs/2026-10-03/README.md
- docs/dispatches/lane-briefs/2026-10-03/brief-l10.md
- docs/dispatches/lane-briefs/2026-10-03/brief-l11.md
- docs/dispatches/lane-briefs/2026-10-03/brief-l12.md
- docs/dispatches/proposer-brief-ledger-consume-train-wave48-2026-09-05.md
- docs/dispatches/proposer-brief-propagation-train-wave48-2026-09-05.md

**docs/runbooks** (74)

- docs/runbooks/FUELEU-STATUTORY-RUNBOOK.md
- docs/runbooks/PROPAGATION-DRAIN-RUNBOOK.md
- docs/runbooks/eia-api-key-registration.md
- docs/runbooks/maintenance.d/01-community-topics-seed.md
- docs/runbooks/maintenance.d/02-tier-opinions.md
- docs/runbooks/maintenance.d/03-w1-dispositions.md
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
- docs/runbooks/maintenance.d/39-remediate-orphan-sources.md [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
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
- docs/runbooks/maintenance.d/64-chain-proof.md
- docs/runbooks/maintenance.d/65-needs-search.md
- docs/runbooks/maintenance.d/66-recompute-trust-scores.md
- docs/runbooks/maintenance.d/A1-holdings-audit.md
- docs/runbooks/maintenance.d/A2-verify-checks-wired-via-data-audit-lane.md
- docs/runbooks/maintenance.d/A3-check-vocabulary-drift.md
- docs/runbooks/maintenance.d/A4-f51-hotspot-standing-number.md
- docs/runbooks/warm-static-detail-routes.md

**docs/audits** (65)

- docs/audits/app-audit-a1-routes-2026-09-30.md
- docs/audits/app-audit-a10-remainder-2026-09-30.md
- docs/audits/app-audit-a1c-routes-completion-2026-09-30.md
- docs/audits/app-audit-a2b-components-m-z-2026-09-30.md
- docs/audits/app-audit-a2bc-components-completion-2026-09-30.md
- docs/audits/app-audit-a3b-lib-n-z-2026-09-30.md
- docs/audits/app-audit-a3c-lib-community-market-2026-09-30.md
- docs/audits/app-audit-a4-scripts-workflows-2026-09-30.md
- docs/audits/app-audit-a4b-scripts-mint-lib-verify-2026-09-30.md
- docs/audits/app-audit-a4bc-scripts-completion-2026-09-30.md
- docs/audits/app-audit-a4c-scripts-remainder-2026-09-30.md
- docs/audits/app-audit-a4cc-scripts-completion-2026-09-30.md
- docs/audits/app-audit-a5-database-2026-09-30.md
- docs/audits/app-audit-a5b-migrations-001-170-2026-09-30.md
- docs/audits/app-audit-a5c-migrations-171-339-2026-09-30.md
- docs/audits/app-audit-a6-discipline-tests-2026-09-30.md
- docs/audits/app-audit-a6b-discipline-full-2026-09-30.md
- docs/audits/architecture-review-2026-09-30.md
- docs/audits/docs-vs-reality-2026-09-30.md
- docs/audits/docs-vs-reality-ops-2026-09-30.md
- docs/audits/docs-vs-reality-plans-2026-09-30.md
- docs/audits/full-read-2026-08-31/L01-app.md
- docs/audits/full-read-2026-08-31/L03-api-A.md
- docs/audits/full-read-2026-08-31/L04-api-B.md
- docs/audits/full-read-2026-08-31/L05-comp-A1.md
- docs/audits/full-read-2026-08-31/L05-comp-A2.md
- docs/audits/full-read-2026-08-31/L06-comp-B.md
- docs/audits/full-read-2026-08-31/L07-comp-C.md
- docs/audits/full-read-2026-08-31/L08-comp-D.md
- docs/audits/full-read-2026-08-31/L09-lib-agent.md
- docs/audits/full-read-2026-08-31/L10-lib-sources.md
- docs/audits/full-read-2026-08-31/L11-lib-C.md
- docs/audits/full-read-2026-08-31/L12-lib-D.md
- docs/audits/full-read-2026-08-31/L13-scripts-A.md
- docs/audits/full-read-2026-08-31/L14-scripts-B.md
- docs/audits/full-read-2026-08-31/L15-disc-A.md
- docs/audits/full-read-2026-08-31/L16-disc-B.md
- docs/audits/full-read-2026-08-31/L17-misc.md
- docs/audits/full-read-2026-08-31/L18-migrations-A.md
- docs/audits/full-read-2026-08-31/L19-migrations-B.md
- docs/audits/full-read-2026-08-31/REC-1-specs-decisions.md
- docs/audits/full-read-2026-08-31/REC-2-plans.md
- docs/audits/full-read-audit-2026-08-31.md
- docs/audits/in-filter-audit-2026-09-06.md
- docs/audits/mechanical-checkers-2026-09-30.md
- docs/audits/perf-clickthrough-2026-09-04.md
- docs/audits/perf-waterfall-2026-09-04.md
- docs/audits/plan-completion-audit-2026-09-05/W1-W2-intake-population.md
- docs/audits/plan-completion-audit-2026-09-05/W3-W4-sourcing-propagation.md
- docs/audits/plan-completion-audit-2026-09-05/W5-W6-W7-surfaces-community-discipline.md
- docs/audits/plan-completion-audit-2026-09-05/loop-harness-flywheel-one-unit.md
- docs/audits/plan-completion-audit-2026-09-05/skills-rules-doctrine.md
- docs/audits/plan-completion-audit-2026-09-05/tools-inventory-unused-duplicates.md
- docs/audits/stage-audit-2026-09-18/s1-collect.md
- docs/audits/stage-audit-2026-09-18/s2-mint-gate.md
- docs/audits/stage-audit-2026-09-18/s3-evaluate.md
- docs/audits/stage-audit-2026-09-18/s4-propagate.md
- docs/audits/stage-audit-2026-09-18/s5-publish.md
- docs/audits/stage-audit-2026-09-18/s6-gates-harness.md
- docs/audits/wiring-audit-2026-09-04/A1-runtimes.md
- docs/audits/wiring-audit-2026-09-04/A2-surfaces.md
- docs/audits/wiring-audit-2026-09-04/B1-modules.md
- docs/audits/wiring-audit-2026-09-04/B2-data-layer.md
- docs/audits/wiring-audit-2026-09-04/C1-loop-map.md
- docs/audits/wiring-audit-2026-09-04/C2-rulings-vs-implementation.md

**docs/plans** (8)

- docs/plans/market-lane-spec-from-repo.md
- docs/plans/mobile-evidence/README.md
- docs/plans/operations-lane-spec-from-repo.md
- docs/plans/research-lane-spec-from-repo.md
- docs/plans/unblocking-the-five-2026-08-30.md
- docs/plans/unwired-disposition-2026-08-31.md [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- docs/plans/wo19-origin-class-backfill-mapping.md
- docs/plans/wo20-assumption-register-spec.md

**docs/design** (5)

- docs/design/audit-2026-09-06/ASSESSMENT.md
- docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md
- docs/design/handoff-2026-09-06/DEVIATION-LOG.md
- docs/design/handoff-2026-09-06/HANDOFF.md
- docs/design/handoff-2026-09-06/SHARED-PART-REPORT-2026-09-08.md

**docs/ratifications** (2)

- docs/ratifications/2026-09/proposed/RULINGS-1-summary.md
- docs/ratifications/2026-09/proposed/RULINGS-2-summary.md

**docs/decisions** (1)

- docs/decisions/ADR-045-chain-proof-on-a-local-stack.md

**docs/doctrine** (1)

- docs/doctrine/closure-gate.md

### 12d. Non-markdown orphans (468) by directory

- docs/design/audit-2026-09-06/captures: 161 (jpg)
- docs/design/handoff-2026-09-06/built: 120 (png)
- docs/dispatches/lane-briefs/2026-09-05: 99 (js, mjs)
- docs/design/handoff-2026-09-07/screens: 22 (png)
- docs/design/handoff-2026-09-06/screens: 21 (png)
- docs/ratifications/2026-09/proposed: 4 (json)
- docs/audits/dead-code-manifest-2026-08-11.txt: 1 (txt)
- docs/audits/gate-a-route-b-baseline-2026-08-11.csv: 1 (csv)
- docs/audits/null-tier-host-ruling-2026-08-11.csv: 1 (csv)
- docs/audits/phase-2b-flag-ingest-errors-log.json: 1 (json)
- docs/audits/source-classification-step1-log.json: 1 (json)
- docs/audits/source-classification-step2-log.json: 1 (json)
- docs/audits/tier-canonicalization-2026-08-11.csv: 1 (csv)
- docs/audits/wiring-audit-2026-09-04/_prs.txt: 1 (txt)
- docs/design/audit-2026-09-06/CONTACT-SHEET.html: 1 (html)
- docs/design/audit-2026-09-06/tokens.txt: 1 (txt)
- docs/design/handoff-2026-09-06/Caros Ledge UI System.dc.html: 1 (html)
- docs/design/handoff-2026-09-06/support.js: 1 (js)
- docs/design/handoff-2026-09-07/Caros Ledge UI System.dc.html: 1 (html)
- docs/design/handoff-2026-09-07/support.js: 1 (js)
- docs/ops/dispatch-ledger.jsonl: 1 (jsonl)
- docs/ops/full-system-audit-2026-07-11/_manifest_files.tsv: 1 (tsv)
- docs/ops/w11-correction-2026-08-11-prior.json: 1 (json)
- docs/ops/wave-alpha-closeout-2026-07-11/e8-snapshots-classification.tsv: 1 (tsv)
- docs/plans/mobile-evidence/01-operations-regions.png: 1 (png)
- docs/plans/mobile-evidence/02-operations-items.png: 1 (png)
- docs/plans/mobile-evidence/03-research-findings.png: 1 (png)
- docs/plans/mobile-evidence/04-market-signals.png: 1 (png)
- docs/plans/mobile-evidence/05-regulations-upcoming.png: 1 (png)
- docs/plans/mobile-evidence/06-home-what-changed.png: 1 (png)
- docs/plans/mobile-evidence/07-home-five-surfaces.png: 1 (png)
- docs/plans/mobile-evidence/08-regulations-ledger-stale-or-broken.jpg: 1 (jpg) [CONFIRMED: listed by the method stated in this section] [NOT-WORK: fact, no action]
- docs/plans/mobile-evidence/09-regulation-detail-breadcrumb.jpg: 1 (jpg)
- docs/plans/mobile-evidence/after-01-operations-regions.png: 1 (png)
- docs/plans/mobile-evidence/after-02-operations-items.png: 1 (png)
- docs/plans/mobile-evidence/after-03-research-findings.png: 1 (png)
- docs/plans/mobile-evidence/after-04-market-signals.png: 1 (png)
- docs/plans/mobile-evidence/after-05-regulations-upcoming.png: 1 (png)
- docs/plans/mobile-evidence/after-06-home-what-changed.png: 1 (png)
- docs/plans/mobile-evidence/after-07-home-five-surfaces.png: 1 (png)
- docs/plans/mobile-evidence/after-09-regulation-detail-breadcrumb.png: 1 (png)
- docs/plans/mobile-evidence/after-10-operations-matrix-mobile.png: 1 (png)
- docs/plans/mobile-evidence/after-11-market-upcoming-strip.png: 1 (png)
- docs/ratifications/2026-09/canonical-candidates.ruling.json: 1 (json)
- docs/ratifications/2026-09/coverage-gaps.ruling.json: 1 (json)
- docs/ratifications/2026-09/portal-links.ruling.json: 1 (json)
- docs/ratifications/2026-09/provisional-sources.ruling.json: 1 (json)

### 12e. INDEX.md lines pointing at nonexistent files (24)

- INDEX.md line 323: docs/design/redesign/README.md
- INDEX.md line 324: docs/design/redesign/DESIGN-DEVIATIONS.md
- INDEX.md line 325: docs/design/redesign/HANDOFF%20-%20Claude%20Code%20Prompt.md
- INDEX.md line 339: docs/sprint-1/alignment-audit-2026-05-18.md
- INDEX.md line 340: docs/sprint-1/critical-investigations-2026-05-18.md
- INDEX.md line 341: docs/sprint-1/followups.md
- INDEX.md line 342: docs/sprint-1/intelligence-assistant-audit-2026-05-18.md
- INDEX.md line 343: docs/sprint-1/onboarding-audit-2026-05-18.md
- INDEX.md line 344: docs/sprint-1/perf-1-design.md
- INDEX.md line 345: docs/sprint-1/phase-1-admin-signals.md
- INDEX.md line 346: docs/sprint-1/phase-2-dedup-plan.md
- INDEX.md line 347: docs/sprint-1/phase-3-jurisdiction-vocabulary.md
- INDEX.md line 348: docs/sprint-1/phase-3-operator-decision.md
- INDEX.md line 349: docs/sprint-1/phase-4-migrations-summary.md
- INDEX.md line 350: docs/sprint-1/phase-4b-design.md
- INDEX.md line 351: docs/sprint-1/phase-4b-sql-review-final.md
- INDEX.md line 352: docs/sprint-1/phase-5-design.md
- INDEX.md line 353: docs/sprint-1/phase-7-scope-amendment.md
- INDEX.md line 354: docs/sprint-1/schema-reconciliation-discovery-2026-05-18.md
- INDEX.md line 355: docs/sprint-1/system-audit-2026-05-18.md
- INDEX.md line 359: docs/sprint-2/Phase-1.5-consumer-migration-list.md
- INDEX.md line 360: docs/sprint-2/category-routing-wiring-notes.md
- INDEX.md line 361: docs/sprint-2/source-credibility-model-decisions-2026-05-19.md
- INDEX.md line 362: docs/sprint-2/sprint-2-planning-2026-05-18.md

[CONFIRMED] docs/sprint-1 and docs/sprint-2 have no tracked files (`git ls-files docs | grep -c "^docs/sprint-"` = 0); 23 sprint files now live under docs/archive/. CLAUDE.md "What lives where" still lists `docs/sprint-1/`, `docs/sprint-2/` as live working sets. The 3 docs/design/redesign/ targets also moved (16 files under docs/archive match redesign).

### 12f. Runbook references to scripts that no longer exist (18)

| Runbook:line | Missing path |
|---|---|
| docs/runbooks/CORPUS-TURN-RUNBOOK.md:707 | scripts/lib/pool-row-contract.mjs |
| docs/runbooks/maintenance.d/01-community-topics-seed.md:3 | fsi-app/scripts/maintenance/community-topics-seed.mjs |
| docs/runbooks/maintenance.d/01-community-topics-seed.md:4 | fsi-app/scripts/seed/community-topics-seed.mjs |
| docs/runbooks/maintenance.d/01-community-topics-seed.md:17 | scripts/seed-community-regional-rooms.mjs |
| docs/runbooks/maintenance.d/08-provenance-heal.md:140 | fsi-app/scripts/mint/lib/gate-a-scan.mjs |
| docs/runbooks/maintenance.d/13-review-apply-provisional-sources.md:4 | fsi-app/scripts/maintenance/review-apply-provisional-sources.mjs |
| docs/runbooks/maintenance.d/13-review-apply-provisional-sources.md:5 | fsi-app/scripts/review/apply-provisional-sources.mjs |
| docs/runbooks/maintenance.d/13-review-apply-provisional-sources.md:6 | fsi-app/scripts/review/lib/provisional-sources.mjs |
| docs/runbooks/maintenance.d/14-review-apply-canonical-candidates.md:4 | fsi-app/scripts/maintenance/review-apply-canonical-candidates.mjs |
| docs/runbooks/maintenance.d/14-review-apply-canonical-candidates.md:5 | fsi-app/scripts/review/apply-canonical-candidates.mjs |
| docs/runbooks/maintenance.d/14-review-apply-canonical-candidates.md:6 | fsi-app/scripts/review/lib/canonical-candidates.mjs |
| docs/runbooks/maintenance.d/35-close-acquire-primaries-holds.md:5 | scripts/maintenance/acquire-primaries.mjs |
| docs/runbooks/maintenance.d/38-canonical-autoverify.md:37 | src/lib/sources/host-authority.mjs |
| docs/runbooks/maintenance.d/38-canonical-autoverify.md:75 | scripts/review/lib/canonical-candidates.mjs |
| docs/runbooks/maintenance.d/46-resolve-provisional-sources.md:6 | scripts/review/apply-provisional-sources.mjs |
| docs/runbooks/sprint4-dataops-ledger.md:7 | scripts/_dataops/interlock.mjs |
| docs/runbooks/warm-static-detail-routes.md:70 | scripts/ops/warm-static-detail-routes.mjs |
| scripts/mint/MINT-RUNBOOK.md:908 | fsi-app/scripts/turns/export-census-rows.mjs |

[CONFIRMED: context line of each of the 18 read] Classification: 14 refs are tombstones or negations that name a deleted file on purpose (steps 01 x3, 13 x3, 14 x3 and 35 x1 under RETIRED headers; 46:6 (past tense); sprint4-dataops-ledger:7 ("was its enforcement arm"); warm-static-detail-routes:70 ("NOT created by this lane"); MINT-RUNBOOK:908 ("no such path exists")). 4 refs are STALE LIVE POINTERS to a file that moved or was renamed: CORPUS-TURN-RUNBOOK.md:707 scripts/lib/pool-row-contract.mjs (now fsi-app/src/lib/intake/pool-row-contract.mjs), maintenance.d/08-provenance-heal.md:140 fsi-app/scripts/mint/lib/gate-a-scan.mjs (now fsi-app/src/lib/agent/gate-a-scan.mjs), maintenance.d/38-canonical-autoverify.md:37 src/lib/sources/host-authority.mjs (now host-authority.ts) and :75 scripts/review/lib/canonical-candidates.mjs (deleted with retired step 14). Counted: 4 stale pointers; 14 intended tombstones (the 18 rows above, with 01:3, 01:4, 01:17 counted as three). The 2026-10-06 register owed item 30 already says "retire index lines 13 and 14".
