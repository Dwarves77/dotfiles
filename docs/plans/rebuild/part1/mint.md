# P1-14 mint: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-14, DISPOSITION lane, read-only. Tree: origin/master `a0749713e`. Written by a cloud session on 2026-10-12 (clock from `date -u`). Every code file in SCOPE was read whole with the Read tool; the coverage table below records each read. Every claim carries `[CONFIRMED]` (executed or read this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`. No database was reached, so every live-state number is either quoted from a cited register or marked [HYPOTHESIS].

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost). Code lines are non-blank non-comment lines by awk (`//` lines, `/* */` blocks and leading-`*` lines stripped). Raw lines are `wc -l`. JSON and Markdown are counted as non-blank lines and are not in the code total.

## 1. Header and coverage

Module: mint. `fsi-app/scripts/mint` holds the record-grade population runtime: the census exporter (select, screen, identity, capture), the DB-free payload builder and validator (`run-mint-batch`, `validate-mint-payload`), the guarded apply (`apply-mint-batch`), the relevance screen (`screen-rules`, `lib/screen-verdict`, `screen-worklist`), the provenance healer (`heal-provenance`) and five maintenance one-shots.

Coverage (16 code files, 9,716 raw lines, 6,024 code lines; 8 data and doc files, 10,278 raw lines; `wc -l` and the awk count run 2026-10-12):

| path (under fsi-app/scripts/mint/) | raw lines | code lines | read calls |
|---|---|---|---|
| heal-provenance.mjs | 3996 | 2122 | 6 (offsets 1, 560, 1200, 1900, 2650, 3350) |
| export-census-rows.mjs | 1522 | 820 | 3 (offsets 1, 521, 1041) |
| screen-rules.mjs | 917 | 818 | 2 (offsets 1, 686) |
| apply-mint-batch.mjs | 762 | 517 | 1 |
| validate-mint-payload.mjs | 712 | 447 | 1 |
| run-mint-batch.mjs | 653 | 445 | 1 |
| screen-worklist.mjs | 487 | 387 | 1 |
| migration-299-precheck.mjs | 153 | 93 | 1 |
| reopen-validation-holds.mjs | 115 | 87 | 1 |
| stamp-wo26-archive-reason.mjs | 104 | 76 | 1 |
| screen-reconcile-records.mjs | 90 | 74 | 1 |
| rederive-record-provenance.mjs | 85 | 66 | 1 |
| lib/tag-presence-check.mjs | 70 | 41 | 1 |
| lib/screen-verdict.mjs | 24 | 13 | 1 |
| lib/instrument-identity.mjs | 19 | 11 | 1 |
| lib/canonicalize-citation-url.mjs | 7 | 7 | 1 |
| CODE TOTAL | 9716 | 6024 | 24 |
| MINT-RUNBOOK.md | 934 | 844 non-blank | 2 (offsets 1, 471) |
| payload-schema.json | 335 | 336 non-blank | 1 |
| example-payload.json | 106 | 106 non-blank | 1 |
| item-type-required-slots.json | 81 | 81 non-blank | 1 |
| SCREEN-REPORT-FORMAT.md | 75 | 60 non-blank | 1 |
| testdata/archived-source-32019R1242-excerpt.txt | 10 | 6 non-blank | 1 |
| testdata/archived-source-32023R0956-excerpt.txt | 5 | 3 non-blank | 1 |
| reviewed-verdicts.json | 8732 | 8732 non-blank | 0, characterised by `node -e` (see below) |

Files not read whole: `reviewed-verdicts.json` only (503 KB, 1,746 three-key objects, one per census id). The B1c register characterised it the same way; this lane re-ran the characterisation [CONFIRMED: `node -e` over the whole file]: 1,746 entries, one key set `reason,reviewer,verdict`; verdict off_vertical 810, on_vertical 680, ambiguous 256; reviewer `M-SCREEN-2` 1,726, `M-SCREEN-3-mechanism-test` 13, `operator (2026-09-02) over M-SCREEN-2` 6, `operator-ruling-2026-08-31` 1. Test files: none exist under scripts/mint on this tree (CLEAN-3, PR 1131, deleted all 17 [CONFIRMED: `ls scripts/mint/*.test.mjs` returns 0; `git log --diff-filter=D` names f906b210]).

Prior registers: `B1c-whole-reads-mint-research-2026-10-11.md` read whole (103 lines). `B1-scripts-runtimes-2026-10-11.md` is 529 lines and about 121k tokens, of which 150 of 155 rows name files outside this scope; its 43 lines naming `mint/` were read as a grep extraction rather than whole (the same deviation P1-01 recorded for A1-part1, A3 and A4). Other registers were read as extractions of their lines naming a mint path (A4-src-lib-2 12, A3 9, A4a 8, D2 5, B2-part1 4, C4 2, B1b 2, F1 1, C3a 1, C3 1, A4d 1, A1-part1 1). B1c line numbers are pre-CLEAN-3; CLEAN-3 stripped file headers (for example `lib/tag-presence-check.mjs` 111 to 70 lines, `heal-provenance.mjs` 4,285 to 3,996 [CONFIRMED: `git show f906b210^:` line counts]), so every line number below is this tree's.

Consumer evidence: a static relative-import resolver over every `.mjs/.js/.ts/.tsx` under fsi-app (`mint-edges.mjs`, this lane's scratch), plus `grep -rn` for CLI-string invocations and file-path reads, plus a per-export `grep -rlw` over src, scripts, supabase and .discipline excluding the defining file (name occurrences, so a count is an upper bound).

## 2. Module verdict

**REFACTOR AND PORT.** Every capability is kept: census selection with held-row exclusion, the relevance screen, per-family document identity, free capture, record-payload building, the provenance gate, the guarded apply, the validation-failed hold, and the provenance healer's source-and-rate behaviour. The code is not. Today it is three CLIs joined by files on disk (census-rows.json, apply-ready.json, mint-batch-report.json, mint-run-NNN.json) that a deleted workflow (`population-turn.yml`, CLEAN-3) used to chain; it carries a JavaScript replica of `validate_item_provenance` beside the real one, three copies of the authority-floor table, two JavaScript ports of `canonicalize_citation_url`, two diverging citation-URL regexes, 118 relevance rules and a 503 KB verdict file as data in code, a 538-line narrative header on the healer, and five maintenance scripts of which two are one-shots that run on every turn.

**Current code LOC: 6,024** (awk over the 16 code files; plus 10,278 raw lines of JSON, Markdown and fixtures). **Estimated clean LOC: about 2,250 for the mint feature, plus about 600 that leave this module for their owners; 2,850 in all.** Arithmetic (section 8 table, per planned file): select and held exclusion 90 + screen classifier and reconcile 140 + screen rule data 600 + build payload 60 + pre-insert kit checks 200 + apply 260 + run entry with hand-off 110 + heal 700 (ground 180, orphans and source-and-rate orchestration 220, relabel and reclassify 150, brief-honest strip 150) + holds and reopen 50 + tag-presence warning 20 + identity shared types 20 = 2,250. Moved: per-family identity 150 to P1-03/04 intake; capture transports and title extraction 350 to P1-07 capture; source register-and-rate glue 100 to P1-05 sources-a. 2,250 + 600 = 2,850. Against today's 6,024 the module shrinks to 37 percent; with the moved code, to 47 percent. Estimates are read-derived [HYPOTHESIS until the port lane counts them].

Core responsibilities (11), with the files that carry them today:

1. Census selection: `would_mint`, not archived, optional source and CELEX-prefix narrowing, limit with a hard ceiling of 100 (export-census-rows.mjs 674-707).
2. Held-row exclusion before any spend: same URL with the same instrument identity, same canonical key, archived holders included (export-census-rows.mjs 714-797; lib/instrument-identity.mjs).
3. Relevance screen: CELEX-root heuristic, 61 ON rules, 53 OFF rules of which 10 flip to on_vertical, preparatory-act and no-signal ambiguity; a reviewed verdict overrides only a rule's `ambiguous` (screen-rules.mjs; lib/screen-verdict.mjs; reviewed-verdicts.json) [CONFIRMED: `node -e` counts ON 61, 23 with a mechanism question, OFF 53, 10 flipped, 4 CELEX roots, 118 rule names].
4. Per-family identity: EUR-Lex CELEX key and item type (sector-letter map), legislation.gov.uk series identifier from the URL path, Federal Register document number and API type, registered-institution fallback (export-census-rows.mjs 63-292).
5. Free capture with holds: DB cache first, then Cellar with an http-to-https redirect upgrade, EUR-Lex clean text, UK `data.htm`, the FR API and raw text; holds for too short, garbled Cellar metadata, not in force, blocked, no capture path; title extraction (export-census-rows.mjs 299-632, 826-1296).
6. Record payload building through `src/lib/intake/record-facts.mjs` buildRecordPayload, with the screen verdict carried onto the payload (run-mint-batch.mjs 122-172).
7. Pre-insert validation: a DB-free replica of criteria 1 to 7 plus kit checks (capture completeness, unicode integrity against an archived copy, record purity, record_hollow, screen verdict) (validate-mint-payload.mjs).
8. Guarded apply: M4 duplicate check, inline source registration, item insert without provenance_status, the shared write sequence, compensating delete on partial failure, rule-16 enrichment, verdict read-back, census stamp and validation-failed hold, run-artifact enrichment, cache flush (apply-mint-batch.mjs 298-709).
9. Post-apply reconciliation: re-derive stale provenance stamps (rederive-record-provenance.mjs), archive live record items the screen now rules off-vertical (screen-reconcile-records.mjs), re-admit held rows by stated reason (reopen-validation-holds.mjs).
10. Provenance healing of quarantined items: capture, ground, slots, own-body institution, capture-cited, resource across three ranked buckets, source-and-rate of orphan figures (rule 18), one-hop follow, orphan grounding, brief-honest strip, relabel, Gate A, re-derive (heal-provenance.mjs 2845-3634).
11. Run recording: mint-run-NNN.json and screen-run-NNN.json harness artifacts (run-mint-batch.mjs 320-393, 589-640; screen-worklist.mjs 297-374, 462-481).

Key dependencies [CONFIRMED by the import scan and the `.from(`/`.rpc(`/`guarded*`/`readAll` scan]:

- In-repo modules imported: `scripts/lib/db.mjs` (readAll, readAllByIds, readClient, guardedInsert, guardedInsertMany, guardedUpdate, guardedUpdateByIds, guardedDelete, registerSource, archivePatch), `scripts/lib/run-artifact.mjs`, `scripts/lib/loop-run-id.mjs`, `scripts/harness-runs/governing-files.mjs`, `scripts/lib/env-file.mjs`, `scripts/lib/is-main.mjs`, `scripts/lib/canonical-key.mjs`, `scripts/lib/institution-key.mjs`, `scripts/lib/eurlex-cellar.mjs`, `scripts/lib/revalidate.mjs`; `src/lib/intake/record-facts.mjs`, `record-facts-research.mjs`, `write-item.ts`, `mint-enrichment.ts`; `src/lib/agent/gate-a-scan.mjs`, `gate-a-match.mjs`, `section-markers.mjs`; `src/lib/domains.ts`; `src/lib/market/series-registry.mjs`; `src/lib/coverage/identity.mjs` (UK_TYPES); `src/lib/sources/identifier-variants.mjs`, `transport-escalation.mjs`, `pdf-extract.mjs`, `host-authority.ts`. Three `.ts` imports from `.mjs` scripts rely on Node type stripping.
- Tables read: census_worklist, sources, agent_run_searches, intelligence_items, section_claim_provenance. Tables written: intelligence_items (insert, update archive fields, updated_at touch, delete on partial failure), census_worklist (enumeration_status, dryrun_disposition, hold_reason, notes), sources (registerSource), and through write-item.ts agent_run_searches, intelligence_item_sections, item_gate_a_state, section_claim_provenance, intelligence_item_citations; through mint-enrichment.ts item_cross_references and item_forward_events; through the deleted heal wrapper institutions and sources.institution_id. RPC: `validate_item_provenance`. Trigger relied on: `set_provenance_status` (migration 115).
- The module does NOT write `staged_updates` [REFUTED for the brief's list: `grep -rn staged_updates fsi-app/scripts/mint` returns 0]. Staged updates belong to the single-item chokepoint `src/lib/intake/mint-item.ts` (P1-03/04).
- Env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, POPULATION_FETCH_GAP_MS; through revalidate.mjs APP_URL and WORKER_SECRET.
- External services, all free plain HTTP: publications.europa.eu (Cellar, OJ), eur-lex.europa.eu, legislation.gov.uk, www.federalregister.gov API, archive.org and web.archive.org (Wayback), any cited URL. No model call and no Browserless anywhere in scope [CONFIRMED: `grep -i "anthropic|claude|haiku|sonnet|browserless|openai|api_key|/v1/messages"` finds comments only].

Runtime wiring today [CONFIRMED]: no workflow invokes any file in scope. CLEAN-3 deleted `population-turn.yml`, `maintenance.yml` and the maintenance wrappers `provenance-heal.mjs`, `reopen-validation-holds.mjs` and `attach-found-sources.mjs` (`git log --diff-filter=D` names f906b210 for each). The live import edges into scope from outside it are four: `scripts/turns/research-sweep.mjs:12` (validateMintPayload), `scripts/maintenance/canonical-autoverify.mjs:7,9` (locateSpanInText; captureDocument, followUpgradingRedirects, makePoliteFetch), `scripts/connections/propose-tags.mjs:354` (fetchRowsIn, dynamic); and one CLI spawn, `scripts/turns/run-population-flywheel.mjs:1227` (`run-mint-batch.mjs --outcomes`). `item-type-required-slots.json` is also read by `scripts/producers/market/propose-series-items.mjs:8` and `scripts/turns/research-sweep.mjs:21`.

## 3. Bloat, biggest first

| rank | what | lines | why it is bloat | replacement |
|---|---|---|---|---|
| 1 | heal-provenance.mjs narrative and passes | 3,996 raw, 2,122 code; lines 1-538 are one header essay (passes six to eleven, run numbers, measured incidents) | the file explains its own archaeology; eleven "passes" accreted as patches over each other (SLOT-REPAIR and RETROFIT exist only to undo earlier passes' defects, 2909-2933, 3175-3225); 93 named exports, 82 with no reference outside the file [CONFIRMED: per-export grep] | `features/mint/heal/*` with one sentence per function; drop SLOT-REPAIR and RETROFIT (legacy repairs) and the run-budget/checkpoint/resume machinery that existed for a GitHub job timeout |
| 2 | screen-rules.mjs rule data in code | 917 raw, 818 code; 118 rules, many with 300-to-900-character mechanism strings | the rules are rulings (operator 2026-08-31, 2026-09-02, R-B) stored as code; the OFF array holds 10 rules that return on_vertical (misleading name); 23 rules carry an open "mechanism question" that no process consumes | rule data as one typed data file (or a `screen_rules` table, ruling owed) with `verdict` explicit on every rule; one 60-line classifier |
| 3 | reviewed-verdicts.json | 8,732 lines, 503 KB, committed | data in the repo, loaded by the 1,522-line exporter on every run; 256 of 1,746 entries are `ambiguous`, which can never mint and are never resolved | a `screen_verdicts` table keyed by census id (P1-11 schema), written by the ruling path |
| 4 | export-census-rows.mjs as a hub | 1,522 raw, 820 code; 39 exports | one file is the census selector, the identity resolver for three families, the capture client for four endpoints, the title extractor, two garbage detectors, the screen partition and a shared chunked-read helper; 10 importers loaded it whole for one function (`fetchRowsIn`, `captureDocument`) | selection to features/mint, identity to P1-03/04, capture and titles to P1-07, `fetchRowsIn` replaced by core/db `fetchAllByIdChunks` (P1-01) |
| 5 | validate-mint-payload.mjs C1-C7 replica | 712 raw, 447 code; criteria 1-7 at 494-684 | a JavaScript copy of the SQL function `validate_item_provenance` that models neither Gate B (680) nor the live search_result_id FK; its regexes mirror migrations 171, 289, 300 by hand; the floor table is a third copy | the DB function stays the one gate; keep only the kit checks the DB does not have (capture completeness, unicode integrity, record purity, record_hollow, screen verdict) as a pre-insert check |
| 6 | the file pipeline | run-mint-batch.mjs 477-647, apply-mint-batch.mjs 517-709 | three CLIs exchange census-rows.json, apply-ready.json and mint-batch-report.json; the apply re-reads the report to compute holds; artifacts are enriched in place on disk | one in-process run: rows, payloads, verdicts and holds stay in memory; the ledger row (P1-08) is the only record |
| 7 | screen-worklist.mjs | 487 raw, 387 code | an offline report runner whose only caller was the deleted maintenance.yml; `mergeReviewed` (134-187) restates `screenVerdictFor`'s rule; its own `nextRunId` (297-310) duplicates `claimRunId` | TRASH; the report is a query over the screen verdicts |
| 8 | heal-provenance.mjs normalisation stack | 613-993, about 300 code lines | three normalisers (structural, numeric-tolerant, lowercase) plus a capture index cache added to cut CPU the stack itself created | one position-preserving normaliser with a value-preserving numeric fold (section 8 invariant); the cache stays as a per-run Map |
| 9 | duplicated URL, floor and canonicalisation rules | REG_FAMILY and floorMaxFor (validate 322-328, heal 1695-1705, the SQL); URL_RE (validate 318) and CITED_URL_RE (heal 1446); canonicalizeCitationUrl (lib/canonicalize-citation-url.mjs and src/lib/agent/url-canon.mjs) | three or four homes per rule, already drifted (section 5) | one module each in core (P1-11 owns the SQL; one JS mirror with a parity test) |
| 10 | one-shot and guard scripts kept running | stamp-wo26-archive-reason.mjs (104), migration-299-precheck.mjs (153) | stamp-wo26 reads the whole intelligence_items table every turn for a target set that is empty after run #8 [HYPOTHESIS: live count not re-measured]; the precheck guards a migration that is NEVER APPLIED (`299_item_type_required_slots_wave3.sql:1`) and whose only caller swallowed its exit code (B1c note 10) | TRASH both; the slot ruling moves to P1-11 (section 8 rulings) |

## 4. Dead code

Each `[CONFIRMED]` row: the grep named ran this session over fsi-app/src, fsi-app/scripts, fsi-app/supabase and fsi-app/.discipline, excluding the defining file, and matched nothing but what the row says. No test file exists in scope, so an export "for its test" has no importer.

| path:line | symbol | kind | evidence |
|---|---|---|---|
| export-census-rows.mjs:1368 | fetchColumnIn | exported function | 0 references anywhere including its own file beyond the definition [CONFIRMED: `grep -cw` in file = 1, outside = 0] |
| heal-provenance.mjs:600 | isRequiredSlotMarkerClaim | exported function | same: defined, never called [CONFIRMED] |
| screen-rules.mjs:911 | RULE_NAMES | exported constant | same [CONFIRMED] |
| heal-provenance.mjs:3929, 3996 | main, default export | runtime entry | its only caller `scripts/maintenance/provenance-heal.mjs` was deleted by CLEAN-3 [CONFIRMED: `git log --diff-filter=D`]; the module is now a library for `locateSpanInText` only (canonical-autoverify.mjs:7) |
| heal-provenance.mjs:3268 | `deps.foundSourcesForItem` branch | dependency branch | its only provider `scripts/maintenance/attach-found-sources.mjs` was deleted by CLEAN-3 [CONFIRMED] |
| heal-provenance.mjs:2714-2790 | parseSelection, resolveKitBackfillCandidates, resolveSlotsBackfillCandidates | selection modes | reachable only through `main` (row above) |
| apply-mint-batch.mjs:757 | CLI main | runtime entry | no workflow or spawn invokes it [CONFIRMED: `grep -rn apply-mint-batch` outside scripts/mint returns 0] |
| export-census-rows.mjs:1517, rederive-record-provenance.mjs:68, screen-reconcile-records.mjs:79, stamp-wo26-archive-reason.mjs:99, reopen-validation-holds.mjs:103, migration-299-precheck.mjs:93, screen-worklist.mjs:485 | CLI mains | runtime entries | no workflow, wrapper or spawn invokes any of them on this tree [CONFIRMED: `.github/workflows` holds ci.yml and live-smoke.yml only; per-name grep] |
| lib/tag-presence-check.mjs:36 via run-mint-batch.mjs:255 | `tag_presence` report field | output with no reader | `grep -rn tag_presence` outside run-mint-batch.mjs returns 0 [CONFIRMED] (B1c HALF-SLICE) |
| run-mint-batch.mjs:534-537 | `--grade brief` in batch mode | accepted flag | parsed and never read [CONFIRMED read] |
| run-mint-batch.mjs:490-492, 612 | `--max-items` | recorded flag | recorded in config, never enforced here (the comment says so) [CONFIRMED read] |
| heal-provenance.mjs:2508, 2340, 2519 | FACT_MARKER_RE branch | defensive branch | its own comment says no live evidence of the marker was found (2500-2507) [HYPOTHESIS: inert] |
| heal-provenance.mjs (82 exports), export-census-rows.mjs (17), run-mint-batch.mjs (6), screen-rules.mjs (6), apply-mint-batch.mjs (5), screen-worklist.mjs (5), migration-299-precheck.mjs (5), stamp-wo26 (3), reopen (3), screen-reconcile (1), rederive (1), tag-presence (1) | 135 exports | export surface | used inside their own file and by no other file [CONFIRMED: per-export `grep -rlw`, list in this lane's scratch `mint-dead.txt`]; their importers were the deleted tests |

Not dead, verified live this session: `validateMintPayload` (research-sweep.mjs:12), `locateSpanInText` and the three capture exports (canonical-autoverify.mjs:7,9), `fetchRowsIn` (propose-tags.mjs:354), `run-mint-batch.mjs --outcomes` (run-population-flywheel.mjs:1227), `item-type-required-slots.json` (propose-series-items.mjs:8, research-sweep.mjs:21).

## 5. Duplicates and over-abstraction

| what | where | proposed single inline replacement |
|---|---|---|
| authority-floor table and REG_FAMILY | validate-mint-payload.mjs:322-328; heal-provenance.mjs:1695-1705; `validate_item_provenance` SQL (migrations 145, 158, 171, 202) | one exported `floorMaxFor` in core next to the SQL mirror, pinned by a parity test against the function (P1-11) |
| citation URL regex | validate-mint-payload.mjs:318 (excludes `« » ‹ › “ ” ‘ ’`, migration 300); heal-provenance.mjs:1446 (does not) [CONFIRMED read; B1c executed the divergence] | one `CITED_URL_RE` in core, the migration-300 form |
| canonicalize_citation_url port | lib/canonicalize-citation-url.mjs:1-7 (null becomes ""); src/lib/agent/url-canon.mjs (null stays null, has a migration-150 parity test) | keep the src one; delete the mint copy |
| C4 label regexes | validate-mint-payload.mjs:296-303; heal-provenance.mjs:2276-2280 | one module (analysis labels already live in `src/lib/agent/analysis-labels.mjs` per the runbook) |
| criterion-5 slot coverage | validate-mint-payload.mjs:662-666; heal-provenance.mjs:564-575 (claimCoversSlot); migration-299-precheck.mjs imports the heal one | one `claimCoversSlot` |
| Gate B derived coverage | heal-provenance.mjs:2664-2679 in memory; src/lib/agent/gate-a-derived.mjs (DB lookup) | the DB lookup, called before the Gate A write |
| reviewed-over-ambiguous merge rule | lib/screen-verdict.mjs:12-19; screen-worklist.mjs:134-187 | `screenVerdictFor` only |
| run-id allocation | screen-worklist.mjs:297-310 (directory scan); run-mint-batch.mjs:590 (claimRunId) | the ledger id (P1-08) |
| held index vs M4 index | export-census-rows.mjs:714-797 (buildHeldUrlIndex, buildHeldKeyIndex); apply-mint-batch.mjs:70-120 (buildItemsIndex, checkM4) | one index and one predicate, used before capture and again at insert |
| HTML-to-text | export-census-rows.mjs:299-321; src/lib/sources/canonical-fetch.mjs (inline); scripts/turns/research-sweep.mjs (B1c) | P1-07 capture's one stripper |
| politeness gap and user agent | export-census-rows.mjs:1046, 1067-1075; heal-provenance.mjs:1294, 1499; run-source-sweep.mjs (B1c) | P1-07's one fetch transport |
| required-slot table | item-type-required-slots.json; migration-299-precheck.mjs:13-18; the live `item_type_required_slots` table (migration 112, 299 unapplied) | the table only (section 8 rulings) |
| census-row id resolution | apply-mint-batch.mjs:129-138 traces a payload to its census row through `payload.id`; run-mint-batch.mjs:164 stamps it | carry `census_id` on the in-memory row object |
| enrich artifact twice | run-mint-batch.mjs:412-459 (`--outcomes`); apply-mint-batch.mjs:247-286 (enrichMintRunArtifact) | one ledger update (P1-08) |

Over-abstraction: every heal step takes a 20-function `deps` bag (2796-2829) so it could run DB-free in tests that no longer exist; the dry mode of every step mirrors the apply mode line for line. Keep one injected client, one dry flag on the run, and plan objects only where a test uses them.

## 6. Non-essential artifacts

- `reviewed-verdicts.json` (8,732 lines): data, not code; moves to a table (section 8).
- `example-payload.json` (106) and both `testdata/*.txt` excerpts (15): fixtures for deleted tests; keep one as a test fixture for the kit checks in the new tree.
- `SCREEN-REPORT-FORMAT.md` (75): describes an operator ratification flow the runtime replaced; TRASH.
- `MINT-RUNBOOK.md` (934): partly stale (section 11 lines 494-497 says rule-16 enrichment does not run inside the apply, while apply-mint-batch.mjs:404-417 runs it; section 13 describes withdrawn item types; it names `archive_reason='off_domain'` while the runtime writes `off_vertical`) [CONFIRMED read]; it is also a governing file whose every edit moved the mint harness hash. Its live rulings are carried into section 8 below; the file is TRASH.
- `payload-schema.json` (335): a shape reference no code enforces (`additionalProperties: true`, the validator ignores it); its `screen.provenance` enum lacks `registry`, which the validator accepts (validate-mint-payload.mjs:481) [CONFIRMED]. Replaced by a typed `MintPayload`.

## 7. File register

Columns: path | lines a-b (total) | responsibility | verdict | clean estimate (code lines) | consumers (count and top 3, this session's scan) | note.

| path (under fsi-app/scripts/mint/) | lines (total) | responsibility | verdict | clean est. | consumers | note |
|---|---|---|---|---|---|---|
| export-census-rows.mjs | 1-1522 (1522) | census select, held exclusion, screen partition, per-family identity, capture, holds, titles, CLI writing three snapshot files | REFACTOR AND PORT (split: select 90 here; identity 150 to P1-03/04; capture and titles 350 to P1-07) | 90 here | 3: heal-provenance.mjs:5, canonical-autoverify.mjs:9, propose-tags.mjs:354 | holds are written only to `_snapshots/*.held.json`, never to census_worklist, so every held row is re-selected and re-fetched next run (defect not to repeat); the summary's "eligible (post filters/limit)" is computed from `preselected` (1457, 1507) (B-2187) [CONFIRMED read] |
| heal-provenance.mjs | 1-3996 (3996) | provenance healer library and runtime (section 2, item 10) | REFACTOR AND PORT (heal 700; source-and-rate glue to P1-05) | 700 | 2: canonical-autoverify.mjs:7 (locateSpanInText), migration-299-precheck.mjs:9 | runtime entry orphaned by CLEAN-3; numeric-tolerant tier folds `12.345` onto `12,345` (762-787) and claim_text is rewritten to another sentence at Jaccard 0.15 (2458, 3157-3171) (B-2188); `restore_sql` assembled so a lint heuristic cannot see it (2216-2223) |
| screen-rules.mjs | 1-917 (917) | relevance classifier and rule data | REFACTOR AND PORT (classifier 60, rule data 600) | 660 | 2: lib/screen-verdict.mjs:1, screen-worklist.mjs:6 | `core_sustainability_climate_environment` cites a companion note that does not exist (124) [CONFIRMED read] |
| apply-mint-batch.mjs | 1-762 (762) | guarded apply (section 2, item 8) | REFACTOR AND PORT | 260 | 0 importers; no invoker on this tree | census row stamped `reconciled` for every inserted item including `minted_unverified` (452-464) (B-2186); header (159-163) and the artifact note (676-677) say reopen re-validates, it does not; the note (678-681) says discovery did not run here, it does (404-417) [CONFIRMED read]; cache tags omit community (702) |
| validate-mint-payload.mjs | 1-712 (712) | C1-C7 replica plus kit checks | REFACTOR AND PORT (kit checks 200; replica TRASH) | 200 | 2: run-mint-batch.mjs:7, research-sweep.mjs:12 | Gate B not modelled (680); `record_hollow` reported as criterion 5 though the live RPC has no such check (442-461, operator instruction at 433) |
| run-mint-batch.mjs | 1-653 (653) | payload build from census rows, validation run, three output files, harness artifact, `--outcomes` | REFACTOR AND PORT | 60 (build) | 1 spawn: run-population-flywheel.mjs:1227 | stale "no exporter ships" (64) (B-1066) [CONFIRMED]; harness version hashes MINT_GOVERNING_FILES from a P1-08 TRASH module (12, 29) |
| screen-worklist.mjs | 1-487 (487) | offline screen report and screen-run artifact | TRASH | 0 | 0 importers; caller (maintenance.yml) deleted | feature (a screen report) becomes a query over screen verdicts |
| migration-299-precheck.mjs | 1-153 (153) | guard for migration 299 | TRASH | 0 | 0 | migration 299 NEVER APPLIED (file header line 1) [CONFIRMED read]; ruling moves to P1-11 |
| reopen-validation-holds.mjs | 1-115 (115) | re-admit validation_failed holds by a reason substring | REFACTOR AND PORT | 40 | 0 (wrapper deleted) | per-row update loop; never re-validates (its own CITE says so) |
| stamp-wo26-archive-reason.mjs | 1-104 (104) | one-shot archive_reason stamp for the 2026-08-21 purge | TRASH | 0 | 0 | full-table read per run (58); target date and count hard-coded (10-12) |
| screen-reconcile-records.mjs | 1-90 (90) | archive live record items the screen rules off-vertical, list ambiguous | REFACTOR AND PORT (into screen) | 50 | 0 | ambiguous list has no consumer (56); census joined by exact URL only (48) |
| rederive-record-provenance.mjs | 1-85 (85) | touch stale-stamped record items so the trigger re-derives | REFACTOR AND PORT (into heal re-derive) | 20 | 0 | one rpc per candidate, sequential, no cap (36); builds its own client (75) |
| lib/tag-presence-check.mjs | 1-70 (70) | warn on empty signature tags | REFACTOR AND PORT (warning recorded on the ledger row) | 20 | 1: run-mint-batch.mjs:11 | output has no reader (B-0573) |
| lib/screen-verdict.mjs | 1-24 (24) | one verdict per row; isMintable | KEEP AS-IS (into screen) | 13 | 2: export-census-rows.mjs:8, screen-reconcile-records.mjs:3 | |
| lib/instrument-identity.mjs | 1-19 (19) | same-document predicate, fail closed when unlabelled | KEEP AS-IS | 11 | 2: apply-mint-batch.mjs:48, export-census-rows.mjs:17 | |
| lib/canonicalize-citation-url.mjs | 1-7 (7) | JS port of migration 150 | TRASH (use src/lib/agent/url-canon.mjs) | 0 | 2: heal-provenance.mjs:37, validate-mint-payload.mjs:7 | null behaviour differs from the src copy (B-2189) |
| MINT-RUNBOOK.md | 1-934 (934) | procedure and history | TRASH (rulings carried into section 8) | 0 | governing-file list; comments | partly stale (B-1064) |
| SCREEN-REPORT-FORMAT.md | 1-75 (75) | ratification handoff format | TRASH | 0 | none | B-1067, B-1068, B-2006 |
| payload-schema.json | 1-335 (335) | payload shape reference | TRASH (typed MintPayload) | 0 | governing-file list only | B-0320 |
| example-payload.json | 1-106 (106) | proof payload fixture | KEEP AS-IS (as a test fixture) | 0 | none (its test deleted) | |
| item-type-required-slots.json | 1-81 (81) | item_type to required slots, kit copy | REFACTOR AND PORT (the table is the source) | 0 | 3: validate 13, run-mint-batch 551, heal 551; plus propose-series-items.mjs:8, research-sweep.mjs:21 | stricter than the live table by four slots (migration 299 unapplied); `_intake_note` describes types that are absent (4) [CONFIRMED read] |
| reviewed-verdicts.json | 1-8732 (8732) | reviewed relevance verdicts | REFACTOR AND PORT (to a table) | 0 | 1: export-census-rows.mjs:1316 (loadReviewedVerdicts) | counts re-measured (section 1) |
| testdata/*.txt (2 files) | 1-10, 1-5 | unicode-integrity fixtures | KEEP AS-IS (as test fixtures) | 0 | none (test deleted) | |

## 8. Build plan for this module

### The mint pipeline today, step by step [CONFIRMED read, file:line]

1. Select (export-census-rows.mjs 1416-1427): `census_worklist` where `dryrun_disposition='would_mint'` and not archived; optional `--source-id`, `--celex-prefix`.
2. Exclude held (1429-1451): same URL and same instrument identity (714-746, `sameInstrumentIdentity`), then same canonical key (756-797); archived holders included.
3. Screen (1454-1455): `screenVerdictFor` per row; only `on_vertical` continues; the verdict is attached as `row.screen` (651-660).
4. Limit (1456): to mintable rows, at most 100 under `--max-items` (674-690).
5. Source and cache (1459-1472): the census row's `sources` row; the DB capture cache is `agent_run_searches.result_content` at the same URL with more than 200 characters.
6. Identity (214-292): EUR-Lex CELEX key and item type; UK series identifier from the URL path; FR document number then API `type`; registered institution of category `regulatory` gives `regulation`; anything else is held with a named reason.
7. Capture (1139-1186, only with `--capture`): Cellar then EUR-Lex clean text; UK `data.htm` then page; FR API then `raw_text_url`; one request per second.
8. Hold or export (922-1032): source_not_found, identity holds, capture_too_short (200), capture_garbled_metadata, not_in_force; title from capture, HTML, OJ act title, body lead, else source name.
9. Build payload (run-mint-batch.mjs 122-172): `buildRecordPayload` (src/lib/intake/record-facts.mjs) makes an identity FACT, one FACT-with-verbatim-span or GAP per required slot, EU-act and binding-position, due-date and corridor claims, and a full_brief made only of those claims.
10. Validate (243-296): `validateMintPayload` per payload, plus the tag-presence warning; valid payloads to `apply-ready.json`, all results to `mint-batch-report.json`, a mint-run artifact in a `finally`.
11. Apply (apply-mint-batch.mjs 298-494): M4 check; inline `registerSource` when the payload's source is missing or inactive; `domainForItemType`; insert the item without `provenance_status`; `writeGroundingSequence` (searches, sections, Gate A before claims, claims, citations); on failure delete the partial item.
12. Enrich (404-417): `runMintEnrichment` runs connection discovery and forward-event extraction for the item.
13. Verdict (422-424): `validate_item_provenance` rpc plus a read of the row's own `provenance_status` set by trigger 115; outcome `minted_verified` or `minted_unverified`.
14. Census and holds (452-464, 607-623): stamp `reconciled`; every report row that failed validation becomes `dryrun_disposition='hold'` with `hold_reason='validation_failed:<criterion>:<reason>'`.
15. Record and flush (669-706): enrich the mint-run artifact; POST a cache flush when anything minted.
16. After apply (the deleted population-turn.yml order, runbook 499-506 and 576): rederive stale stamps, screen-reconcile, then `run-population-flywheel.mjs` (tags, discovery, forward events, obligations, recluster, brief queue) and `run-mint-batch.mjs --outcomes`.
17. Separately, heal quarantined items (heal-provenance.mjs 2845-3634).

Gates in order: held exclusion (M4 at export and at insert), the relevance screen (export, then the payload's own `screen` checked by the kit), capture completeness and garbage detectors, record purity and record_hollow, verbatim span (criterion 3, ADR-016: case-insensitive substring of the stored full capture), `validate_item_provenance` criteria 1 to 7 through the trigger, the authority floor as a rating not a refusal (rule 18, migration 302: `warnings.below_floor_facts`), and markers never persist (`assertNoInternalMarkers`, apply 208 and heal 2836-2843).

Chain hand-off today: none inside the module. The flywheel ran as a later step of a deleted workflow and wrote its outcomes back into the file artifact with `--outcomes`. Rule 17 makes that a defect: a mint is not done until the flywheel has connected it and the harness has recorded it.

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/features/mint/select.ts | export-census-rows.mjs 674-797, 1416-1456; lib/instrument-identity.mjs 1-19; apply-mint-batch.mjs 70-120 | select would_mint rows, one held index and one `isHeld(row)` predicate (key, then URL with identity), limit with the ceiling | 90 |
| src/features/mint/screen.ts | screen-rules.mjs 1-62, 823-909; lib/screen-verdict.mjs 1-24; screen-reconcile-records.mjs 20-77 | `classifyRelevance`, `screenVerdictFor` reading the screen-verdict table, `isMintable`, reconcile live record items | 140 |
| src/features/mint/screen-rules.data.ts | screen-rules.mjs 64-821 | the 4 CELEX roots and 114 rules as data, each with an explicit `verdict` and its ruling citation | 600 |
| src/features/mint/build-payload.ts | run-mint-batch.mjs 122-172 | one record payload per exported row via intake's `buildRecordPayload`, `census_id` carried on the row | 60 |
| src/features/mint/preflight.ts | validate-mint-payload.mjs 24-292, 373-492 | kit checks the DB lacks: capture completeness, unicode integrity, record purity, record_hollow with the series exemption, screen verdict present and on_vertical; tag-presence warning | 220 |
| src/features/mint/apply.ts | apply-mint-batch.mjs 98-120, 204-241, 298-494; reopen-validation-holds.mjs 27-97 | M4 at insert, source via P1-05 `registerAndRate`, item insert, intake `writeGroundingSequence`, compensating delete, verdict read-back, census disposition (`reconciled` only on `minted_verified`; hold with reason otherwise), reopen by stated reason | 300 |
| src/features/mint/run.ts | run-mint-batch.mjs 477-647; apply-mint-batch.mjs 517-709 | one runtime: select, screen, identity (P1-03/04), capture (P1-07), build, preflight, apply, then hand off to the flywheel (P1-09/10) with exactly the minted ids in the same run; the run opens and closes one ledger row (P1-08) with inputs, outputs and outcome; cache flush including community | 110 |
| src/features/mint/heal/ground.ts | heal-provenance.mjs 613-993, 1585-1614, 1787-1858, 2239-2266 | one position-preserving normaliser with a value-preserving numeric fold; GROUND, RESOURCE across own-canonical, tier-qualifying and corpus-pool buckets; orphan grounding | 180 |
| src/features/mint/heal/source.ts | heal-provenance.mjs 1884-2014, 3232-3482 | orphan figure: candidate cited URLs, classify (already registered, registerable through the class table, worklist), capture through P1-07, register-and-rate through P1-05, ground verbatim, one-hop same institution | 220 |
| src/features/mint/heal/label.ts | heal-provenance.mjs 2276-2404, 2622-2641, 3094-3173, 3558-3599 | relabel paragraphs, re-kind an unverifiable FACT to ANALYSIS without rewriting its text (ruling below), required-slot FACT to GAP | 150 |
| src/features/mint/heal/brief-honest.ts | heal-provenance.mjs 2029-2225 | plan and apply the sentence or middle-clause strip of an unprovable figure, accepted only when Gate A then finds no orphan | 150 |
| src/features/mint/heal/run.ts | heal-provenance.mjs 2845-2907, 2946-3006, 3601-3634 | per-item orchestration: capture, ground, slots, own-body institution, resource, source, orphans, brief-honest, relabel, Gate A with Gate B from the DB lookup, re-derive touch, unarchive | 120 (included in heal 700 with the three above and ground) |
| src/features/mint/types.ts | payload-schema.json; item-type-required-slots.json (read from the table) | `MintPayload`, `CensusRow`, `Hold`, outcome vocabulary | 20 |
| P1-03/04 intake: document identity | export-census-rows.mjs 25-292 | CELEX sector-letter map, UK series identifier, FR document number and type, registered-institution fallback | 150 |
| P1-07 capture | export-census-rows.mjs 299-632, 826-906, 1040-1186; heal-provenance.mjs 1057-1568 | Cellar with redirect upgrade, EUR-Lex clean text with robot-gate detection, UK `data.htm`, FR API, OJ issue resolution, Wayback fallback, PDF bytes, garbled-metadata and in-force detectors, title extraction | 350 |
| P1-05 sources-a: register and rate | heal-provenance.mjs 1871-1912, 2988-3006, 3341-3361 | `registerAndRate(url)` with the class-table tier and the institution link | 100 |

### Data model (columns actually used; "unused" means read or carried and never used)

- `census_worklist` (221, 308): read `id, source_id, document_url, title, surface_tags, instrument_identifier, dryrun_disposition, hold_reason, notes, is_archived`; written `enumeration_status`, `dryrun_disposition`, `hold_reason`, `notes`. Selected and unused: `lane, shape_class, enumeration_status` (export-census-rows.mjs:1418).
- `intelligence_items`: inserted `title, domain, item_type, source_id, source_url, priority, full_brief, instrument_identifier, canonical_instrument_key, jurisdiction_iso, item_grade`; read `id, source_url, canonical_instrument_key, instrument_identifier, archive_reason, provenance_status, item_grade, is_archived, archived_date, item_type, title`; updated `updated_at` (touch), `is_archived, archive_reason`, `full_brief` (heal). `provenance_status` is never written by this module (trigger 115).
- `sources`: read `id, url, name, base_tier, tier_override, status, institution_id, category`; written through `registerSource`; `institution_id` by the heal.
- `agent_run_searches`: read `result_url, result_content`; inserted through write-item.ts and the heal (`intelligence_item_id, search_query, result_url, result_title, result_index, result_content, searched_at`).
- `section_claim_provenance`: inserted and updated `section_row_id, intelligence_item_id, claim_text, claim_kind, source_span, source_id, search_result_id, source_tier_at_grounding`; read `basis_claim_id` for Gate B. The SLOTS step writes `source_tier_at_grounding` from `item.source_tier` (heal-provenance.mjs:2968), which no migration adds to `intelligence_items` [CONFIRMED: `grep -n source_tier` over migrations finds only `cited_by_source_tier`]; the deleted wrapper's item select is not on the tree, so whether it was always null is [HYPOTHESIS].
- `intelligence_item_sections`, `item_gate_a_state`, `intelligence_item_citations`, `institutions (name, registrable_domain)`: through write-item.ts and the heal.
- `item_type_required_slots` (112): mirrored by the JSON with four extra kit-only slots (299 never applied).
- New, proposed for P1-11: `screen_verdicts (census_id, verdict, basis, reviewer, ruled_at)` replacing reviewed-verdicts.json; census holds recorded on `census_worklist` for every hold reason, not only `validation_failed`.

### Interface to other modules

- Exports offered: `runMint({limit, sourceId, celexPrefix, mode})`, `screenVerdictFor`, `isMintable`, `classifyRelevance`, `isHeld`, `healItem(id)`, `healQuarantined()`, `reopenHolds(reasonContains)`.
- P1-03/04 intake: `resolveDocumentIdentity(row, source)`, `buildRecordPayload`, `writeGroundingSequence`, `classifyMintOutcome`, `runMintEnrichment`; the single-item chokepoint `mint-item.ts` and this batch path become one mint function (ruling below).
- P1-05 sources-a: `registerAndRate(url)` (class-table tier, institution link), `readSourceByUrl`.
- P1-07 capture: `capture(url, {family, key})` returning text, title, transport and a hold reason; the one polite free transport.
- P1-08 harness: one ledger row per mint run and per heal run, inputs (selection, limit), outputs (minted ids, holds by reason, db deltas), outcome; the run's last act is the hand-off below. Today's mint-run and screen-run files are TRASH (harness.md section 8, PR 1139).
- P1-09 flywheel-a: `connect(mintedIds)` (tags, discovery, forward events, obligations, recluster) called by `runMint` in the same run with exactly the minted ids; its outcome counts land on the mint's ledger row.
- P1-12/13 runtimes: dispatch of `runMint` and `healQuarantined` (manual while build mode holds the cadence off, rule 16).
- P1-16 obligations: reads the binding position, due date and forward events the mint and the flywheel write; no direct call from mint.
- P1-01 core/db: `fetchAllByIdChunks` replaces `fetchRowsIn`; the service client.

### Invariants this code enforces

Already in data-invariants.md: INV-003 (a found figure attaches only with url and verbatim quote), INV-008 (a would_mint census row is on-vertical), INV-025 (a verified record has more than its title as a FACT), INV-028 (a held census row reopens only for a stated reason), INV-050 (one JS canonical-key mirror), INV-094 and INV-125 (stored provenance_status agrees with the function), INV-129 (mint hold reason), INV-132 (one verified item per canonical key), INV-156 (verbatim span in the attributed capture), INV-160 (required slots covered by FACT or GAP). Appended by this lane, same commit, INV-201 to INV-206:

- INV-201: a mint never inserts an item whose canonical key, or whose source URL with the same instrument identity, is already held by any intelligence_items row (archived included); two labelled, different identifiers at one URL are siblings.
- INV-202: a record item mints only with an on_vertical screen verdict carried on its own payload; an ambiguous verdict never mints and never parks without a resolver and a maximum age.
- INV-203: a mint's grounding write completes item, searches, sections, Gate A, claims and citations in that order, or leaves no item row.
- INV-204: a stored capture is the whole fetched document: its length equals the fetched length within 50 characters and is never under 98 percent of it.
- INV-205: every exported or held census row ends the run with its disposition recorded on census_worklist (reconciled only for a verified mint; a hold with a reason otherwise), never only in a file.
- INV-206: a tolerant span search may fold a separator only when the figure's value is unchanged; a span whose value differs from the claimed figure never grounds it, and a heal never replaces a claim's text with a different sentence.

Properties the new tree must also carry as tests: markers never persist (GATES-2); the authority floor rates and never refuses (migration 302); the screen's first-match order (ON before OFF) is load-bearing.

### Rulings the code embodies (cite)

- ADR-020 sustainability-first scope, and customs and transport administration parked: screen-rules.mjs 485-821 (failsMechanism strings).
- Operator ruling 2026-08-31 flips to on_vertical: SES performance plan (594), ship classification societies (633), rail freight corridors (640), SES route charging (761), HGV charging (792), Alpine ecopoints (805); ATM bilaterals by the mechanism re-audit with the operator's worked example (496).
- Operator ruling 2026-09-02 flips: CCNR/CESNI Rhine (607), road vehicle authorised weight (812).
- R-B 2026-09-06: EU Weekly Oil Bulletin series on_vertical (476-480).
- Ambiguous never auto-declines (screen-rules.mjs 901-908); surface_tags never a decision input (ADR-020 Amendment 1, 835-836).
- Task 1.3, 2026-09-11, operator ruling: a CELEX Decision is binding, letter D maps to `regulation` (export-census-rows.mjs 55-67).
- Task 7.4e, 2026-09-12: the UK series identifier comes from the URL path only (106-147).
- Rule 18 and migration 302, operator 2026-09-04 "get the source. then rate the source": the floor is a rating (validate-mint-payload.mjs 349-356, 588-598; heal-provenance.mjs 222-232).
- Operator 2026-09-04 hollow-record refusal, reported as criterion 5 on the operator's instruction (validate-mint-payload.mjs 418-461); series-backed exemption (445-455).
- RD-M4b 2026-09-04: same-URL identity, fail closed when unlabelled (lib/instrument-identity.mjs).
- Migrations 158 (reg-family floor unconditional), 202 (standard own-body tier 4), 206 (mint hold), 278 (item_grade), 289 and 300 (URL regex), 115 and 118 (trigger derives provenance; this module never sets it).
- ADR-016: full capture, never truncated (validate-mint-payload.mjs 24-31; heal-provenance.mjs 1447-1450).
- Rule 17 (MINT-RUNBOOK.md 247-258): the flywheel is part of the mint.
- Rule 16: build mode holds the cadence off; every runtime here is dispatched by hand.

### Rulings owed (gaps for the coordinator)

1. The ambiguous verdict (256 reviewed entries plus every rule-ambiguous row) waits for a human ruling with no consumer and no age limit (screen-reconcile-records.mjs:56, export-census-rows.mjs:1490-1494). RD-20 forbids a human resting state in intake. A ruling is needed on the resolver: route to the flag channel with a maximum age, or a rule-extension pass.
2. Drop the JavaScript C1-C7 replica and keep the SQL function as the one gate (this plan assumes yes).
3. Migration 299 is never applied; the kit requires four slots the table does not. P1-11 should either apply 299 in the new schema with a re-mint, or drop the kit-only slots.
4. Heal claim-text rewriting and the numeric-tolerant tier. This plan keeps re-kinding but not rewriting (INV-206), and folds separators only when the value is unchanged.
5. There are two mint paths: this batch path, which uses raw guarded writes, and `src/lib/intake/mint-item.ts`. This plan makes `features/mint` own one mint function that intake calls. Ownership is shared with P1-03/04.
6. The brief listed `staged_updates` as a mint write. This is [REFUTED] for this module; staged updates are mint-item.ts's (P1-03/04).

### Proof that the module works in the new tree

1. P2 (ten real minted pages): `runMint --limit 10 --mode apply` on real census rows; each item `provenance_status='verified'`, at least one substantive FACT beyond the title, every FACT span verbatim in its capture (INV-156), the page renders.
2. P3 (ledger rows with non-zero flywheel outcomes): the same run's ledger row carries minted ids and non-zero edges or forward events from the same-run hand-off.
3. P1 (chain proof green): the mint row's downstream flywheel row carries the mint's run id as upstream.
4. Unit tests, each red against a deliberately broken copy first: `isHeld` (key, URL with same identity, sibling series, unlabelled fail-closed); `classifyRelevance` first-match order and every flipped rule; the preflight kit checks with the two kept fixtures (× vs x, curly quotes); the numeric fold refuses `12.345` against `12,345`; compensating delete on a forced failure after the item insert.
5. P6 falsification: insert a payload whose span is not verbatim and expect quarantine; insert a duplicate key and expect refusal.

### Port order

1. types.ts, then select.ts and the screen (classifier, rule data, verdict table).
2. P1-03/04 identity and P1-07 capture land first (mint calls both).
3. build-payload.ts and preflight.ts.
4. apply.ts (needs intake's write sequence and P1-05 register-and-rate).
5. run.ts with the P1-08 ledger row and the P1-09 hand-off.
6. heal/ground, heal/source, heal/label, heal/brief-honest, heal/run.
7. Retire the scripts and the JSON data once the table rows exist.

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old file(s) | new home |
|---|---|---|
| Select would_mint census rows, narrowed by source or CELEX prefix, capped | export-census-rows.mjs | features/mint/select |
| Exclude rows already held, by key or by URL with the same identity; siblings mint | export-census-rows.mjs, lib/instrument-identity.mjs, apply-mint-batch.mjs | select (`isHeld`) |
| Relevance screen with rulings as rules and reviewed overrides of ambiguous | screen-rules.mjs, lib/screen-verdict.mjs, reviewed-verdicts.json | screen, screen-rules.data, screen_verdicts table |
| Off-vertical reconciliation of live record items (reversible archive) | screen-reconcile-records.mjs | screen |
| Screen report (counts by verdict and rule, ambiguous list) | screen-worklist.mjs, SCREEN-REPORT-FORMAT.md | a query over screen_verdicts (P1-25/26 admin) |
| Per-family identity: CELEX, UK series, FR type, registered institution | export-census-rows.mjs | P1-03/04 |
| Free capture: Cellar, EUR-Lex, UK data.htm, FR API, OJ issues, Wayback, PDF | export-census-rows.mjs, heal-provenance.mjs | P1-07 |
| Capture holds with evidence: too short, garbled Cellar metadata, not in force, blocked, no capture path | export-census-rows.mjs | P1-07 returns the reason; select records it on the census row |
| Title resolution chain without OJ file names | export-census-rows.mjs | P1-07 |
| Record payload from captured text with verbatim spans | run-mint-batch.mjs (+ record-facts.mjs) | build-payload |
| Preflight kit checks (completeness, unicode, purity, hollow, screen) | validate-mint-payload.mjs | preflight |
| Empty-signature-tag warning | lib/tag-presence-check.mjs | preflight, recorded on the ledger row |
| Guarded apply with compensating delete and verdict read-back | apply-mint-batch.mjs | apply |
| Inline source registration with a class-table tier | apply-mint-batch.mjs, heal-provenance.mjs | P1-05 `registerAndRate` |
| Validation-failed hold and reasoned reopen | apply-mint-batch.mjs, reopen-validation-holds.mjs | apply |
| Re-derive stale provenance stamps | rederive-record-provenance.mjs | heal/run re-derive |
| Rule-16 enrichment and the post-apply flywheel with outcomes | apply-mint-batch.mjs, run-mint-batch.mjs --outcomes | run.ts hand-off to P1-09/10, outcomes on the P1-08 row |
| Cache flush after a mint | apply-mint-batch.mjs | run.ts (all five surfaces) |
| Heal: capture, ground, resource buckets, slots, own-body institution | heal-provenance.mjs | heal/ground, heal/run |
| Heal: source-and-rate orphan figures, one-hop same institution | heal-provenance.mjs | heal/source, P1-05 |
| Heal: relabel and re-kind unverifiable FACTs | heal-provenance.mjs | heal/label |
| Heal: brief-honest strip, opt-in | heal-provenance.mjs | heal/brief-honest |
| Heal: un-archive an archived-unreasoned item that re-derives verified | heal-provenance.mjs | heal/run |
| Session browser worklist of found sources (attach-found-sources) | heal-provenance.mjs | NOT PORTED (provider deleted; a session worklist is not a runtime input); orphan sources come from citations and capture |
| Migration-299 guard | migration-299-precheck.mjs | NOT PORTED (P1-11 ruling 3) |
| WO-26 archive-reason stamp | stamp-wo26-archive-reason.mjs | NOT PORTED (one-shot, done) [HYPOTHESIS: live count not re-measured] |
| Run artifacts mint-run and screen-run | run-mint-batch.mjs, screen-worklist.mjs | P1-08 ledger rows |

### Defects the new code must not repeat (backlog rows in scope carry their STATUS cells in this lane's commit)

A census row stamped reconciled for an unverified mint (B-2186). Holds written only to a scratch file, so held rows are re-fetched every run. A summary label computed from the wrong set (B-2187). Header and artifact sentences that contradict the code (reopen "re-validates"; discovery "did not run") (B-1065). A citation regex and a canonicaliser copied and drifted (B-2188, B-2189). A JavaScript replica claiming parity with an SQL gate it does not fully model. A warning computed with no reader (B-0573). Ambiguous rows parked forever. One-shot scripts kept running each turn (B-1069). A restore string shaped to evade a lint heuristic. Rulings and verdicts stored as code and committed data. Numeric folding that changes magnitude, and claim text replaced by a different sentence (B-2188).
