# B1a part 3: fsi-app/scripts/harness-runs non-JSON files, read whole (2026-10-11)

Lane: audit2-b1a-whole-reads-turns. Fact lane, read-only. Shared environment as in part1 (creds unset, no apply, no DB).
Scope: scripts and CONVENTION/README-class files under harness-runs/** (not the JSON artifacts). 39 family directories.

## Coverage table (every file read WHOLE)

| Files | Count | Lines | Read whole |
|---|---|---|---|
| CONVENTION.md | 1 | 365 | yes |
| PROPOSER-RUNBOOK.md | 1 | 308 | yes |
| append-dispatch-ledger.mjs | 1 | 102 | yes |
| family-registry.mjs | 1 | 183 | yes |
| governing-files.mjs | 1 | 113 | yes |
| <family>/FAMILY.md | 21 | (included in 4,473 below) | yes, all 21 |
| <family>/PROTOCOL.md (fetch-drain, forward-events, source-sweep) | 3 | | yes |
| <family>/LAST-PROPOSER-PASS.md | 16 | brief-apply 195, carrier-ets-proxy 41, change-detection 149, corpus-turn 76, fetch-drain 92, forward-events 425, ledger-consume 273, meta-harness 191, mint 624, propagation 345, research-assessment 116, research-walker 60, screen 42, source-sweep 435, state-cost 68, structured-actions 112 | yes, all 16 (mint re-read from offset 514 after truncation) |
| Totals | | 1,071 (top-level non-test) + 4,473 (FAMILY+PROTOCOL+LPP, `cat ... \| wc -l`) = 5,544 | |

Executed counts: `ls -d */` -> 39 directories; `ls */family.json` -> 39; `ls */FAMILY.md` -> 21; `ls */LAST-PROPOSER-PASS.md` -> 16; `ls */PROTOCOL.md` -> 3.
Not read whole: none. The 39 family.json files were consumed through `family-registry.mjs` tests (27/27 pass) and not read line by line; they are JSON (excluded by brief).

## SUMMARY

STATUS counts (8 rows; family docs grouped): LIVE 2, STALE 5, DEAD 1, HALF-SLICE 0, UNPROVEN 0, UNWIRED 0.
CLASS counts (8 rows): SELF-MAINTENANCE 6, LEARNING 1, NONE 1, CAPABILITY 0.

DISAGREES with B1 / prior audits and with the files' own claims:
1. CONVENTION.md says "Thirteen families exist today"; executed: 39 family directories, 23 families present in the committed ledger export (280 rows, captured 2026-10-10).
2. CONVENTION.md schema comment lists 5 families; is silent on R22 (artifacts land only in the harness_runs table via record-harness-run.mjs, migration 331).
3. PROPOSER-RUNBOOK.md names 4 families, says fetch-drain emission is "still PROSE", requires a LAST-PROPOSER-PASS in every family dir (16 of 39 have one), and cites a "meta-harness's standing metric" section absent from CONVENTION.md (grep returned nothing).
4. 12 of 21 FAMILY.md match `PENDING-RUN|pending/` (executed grep); read whole, 11 cite the deleted PENDING-RUN.md / pending/ markers as live (GATE-3, 2026-10-08, deleted them all).
5. downstream-chain FAMILY.md lists 4 steps, emitter has 7; source-resolution lists 2, emitter has 3.
6. chain-proof FAMILY.md says "Expected state: RED ... APPLIED-MAP.json absent"; `ls fsi-app/supabase/migrations/APPLIED-MAP.json` -> exists.
7. governing-files.mjs header says "NO imports / filesystem-free"; line 87 imports family-registry.
8. PROTOCOL.md fetch-drain says there is no runner; scripts/turns/run-fetch-drain.mjs exists. forward-events PROTOCOL.md gives the old UNIQUE key and ON CONFLICT claim (migration 307 replaced it; apply-extraction-output uses a bare INSERT with client md5 dedupe). source-sweep PROTOCOL.md omits `--all-hosts`, `--slice` and the research subject.
9. Every LAST-PROPOSER-PASS names a frozen tracked "latest" run while ledger numbering has run ahead (table below).

Unverified (HYPOTHESIS, not executable here):
U1 F28 (harness-run integrity) and F50/F60 were NOT run by this lane (D1 runs the fitness runner); claims about governing_hash drift are not re-derived.
U2 Whether any family.json governing list is out of date relative to its emitter (not diffed per family).
U3 Which ledger rows correspond to which tracked artifacts for the five families with tracked runs and 0 ledger rows (carrier-ets-proxy, forward-events, meta-harness, state-cost, screen): by-name comparison only.
U4 Prior audits not re-read whole by this lane: stage-audit, wiring-audit A1, B1-modules.
U5 Whether PROPOSER-RUNBOOK's referenced procedures were ever followed (needs session history).

TEN ROWS THAT MATTER MOST
1. family-registry.mjs: `FAMILIES = loadFamilies()` runs at import; one bad family.json crashes every importer (F28, F51, run-artifact, emitters).
2. append-dispatch-ledger.mjs: DEAD; default ledger path is cwd-relative so from fsi-app/ it resolves to an empty fsi-app/docs; the real file is docs/ops/dispatch-ledger.jsonl (82 rows, last 2026-09-18 marker); no caller.
3. CONVENTION.md: governing doc says 13 families (actual 39 dirs / 23 in ledger) and does not mention R22.
4. PROPOSER-RUNBOOK.md: requires an LPP per family; 23 of 39 families have none.
5. FAMILY.md group: 11 cite deleted PENDING-RUN markers as live protocol.
6. LAST-PROPOSER-PASS group: each pins a tracked run number that the ledger has passed (corpus-turn 002 vs 009, propagation 012 vs 031, source-sweep 018 vs 025, fetch-drain 005 vs 011, ledger-consume 010 vs 016); mint inverted (tracked 029 vs ledger 004).
7. PROTOCOL.md x3: forward-events states a UNIQUE key migration 307 replaced; fetch-drain says no runner exists.
8. governing-files.mjs: header contradicts its own import; GOVERNING_FILES is derived from family.json via family-registry.
9. structured-actions LPP corroborates part2 row dry-run-structured-actions: ledger id vs artifact name disagree and the write-half question (where actions land) is still open.
10. chain-proof FAMILY.md claims a RED expected state premised on a file that exists.

## Rows

| ID | WHAT | FOR | CALLED BY | CONSUMED BY | PROVEN BY | LAST REAL RUN | CLASS | PRIOR | B1 ROW | STATUS | token |
|---|---|---|---|---|---|---|---|---|---|---|---|
| harness-runs/family-registry.mjs | Loads every harness-runs/<family>/family.json at import into FAMILIES; resolves HERE_DIR (falls back to process.cwd()); `PENDING_SEGMENT_RE` guard never matches anything now (dead guard) | harness family registry (single source of family identity) | scripts/lib/run-artifact.mjs, governing-files.mjs, scripts/producers/emit-producers-artifact.mjs, .discipline/fitness/functions/F28-harness-run-integrity.mjs, F51-no-shared-append.mjs, scripts/verify/harness-family-schedule-walker-audit.mjs, src/lib/admin/parts-registry.ts, src/app/admin/parts/page.tsx | GOVERNING_FILES, F28, admin parts page | family-registry.test.mjs 27/27 pass | every emitter run | SELF-MAINTENANCE | NOT COVERED | CONFIRMED | LIVE | [CONFIRMED: `node --test scripts/harness-runs/family-registry.test.mjs` -> pass 27, fail 0; body read: top-level `loadFamilies()` call] |
| harness-runs/governing-files.mjs | Derives GOVERNING_FILES map (family -> governing file list) from the registry | harness_version / governing_hash input | emitters (emit-*), run-ledger-consume, run-source-sweep etc., F28, F51, RD-75, scripts/forward-events/run-extraction.mjs, scripts/drain/artifact.mjs, downstream-chain.yml | hashHarnessVersion in run-artifact.mjs | governing-files.test.mjs 20/20 pass | every emitter run | SELF-MAINTENANCE | NOT COVERED | CORRECTED (header vs line 87) | LIVE | [CONFIRMED: `node --test scripts/harness-runs/governing-files.test.mjs` -> pass 20; `grep -n import governing-files.mjs` -> L87 imports family-registry while header says NO imports] |
| harness-runs/append-dispatch-ledger.mjs | Appends a row to a dispatch ledger JSONL; default path is cwd-relative `docs/...` | dispatch ledger bookkeeping | NONE (only maintenance.yml comment and F25 liveness mention) | NONE; real file docs/ops/dispatch-ledger.jsonl (82 rows, last a 2026-09-18 marker) not fed by it | append-dispatch-ledger.test.mjs 7/7 pass | NEVER (no caller) | NONE | dead-code-census 2026-10-08: NOT COVERED | CORRECTED | DEAD | [CONFIRMED: `git grep -l -F append-dispatch-ledger` -> maintenance.yml (comment), F25-module-liveness.mjs only; `node --test` -> pass 7; from fsi-app/ default resolves to fsi-app/docs, which is empty of the ledger] |
| harness-runs/CONVENTION.md | Governing convention for harness families, artifact envelope, run ids | harness doctrine | read by proposers and lanes; cited by F28 comments, governing-files.mjs | humans | not executable | n/a | SELF-MAINTENANCE | NOT COVERED | CORRECTED | STALE | [CONFIRMED: text "Thirteen families exist today" vs `ls -d */ \| wc -l` -> 39; schema comment lists 5 families; no R22 mention] |
| harness-runs/PROPOSER-RUNBOOK.md | Procedure for a proposer pass (writes LAST-PROPOSER-PASS.md) | harness learning loop | humans/proposer lanes | LPP files | not executable | n/a | SELF-MAINTENANCE | NOT COVERED | CORRECTED | STALE | [CONFIRMED: names 4 families; requires LPP per family dir; `ls */LAST-PROPOSER-PASS.md \| wc -l` -> 16 of 39; cites "meta-harness's standing metric" section: grep of CONVENTION.md returned nothing] |
| harness-runs/*/FAMILY.md (21) | Per-family description of governing files, steps, expected state | harness doctrine per family | humans; scripts/harness-runs governing lists refer to some | humans | not executable | n/a | SELF-MAINTENANCE | NOT COVERED | CORRECTED | STALE | [CONFIRMED: `grep -l "PENDING-RUN\|pending/" */FAMILY.md \| wc -l` -> 12; `ls */FAMILY.md \| wc -l` -> 21; downstream-chain 4 vs emitter 7 steps; source-resolution 2 vs 3; chain-proof APPLIED-MAP.json claim vs `ls` shows file exists; meta-harness FAMILY.md names F28 rule (c)] |
| harness-runs/{fetch-drain,forward-events,source-sweep}/PROTOCOL.md (3) | Protocol text for the three families | harness doctrine | humans | humans | not executable | n/a | SELF-MAINTENANCE | NOT COVERED | CORRECTED | STALE | [CONFIRMED: fetch-drain says no runner, run-fetch-drain.mjs exists (part1); forward-events old UNIQUE key vs migration 307; source-sweep omits --all-hosts/--slice/research] |
| harness-runs/*/LAST-PROPOSER-PASS.md (16) | Latest proposer pass per family, each naming a frozen tracked "latest" run | harness learning loop (the family's own record of what to improve) | humans/proposers | next proposer pass | not executable | n/a | LEARNING | NOT COVERED | CORRECTED | STALE | [CONFIRMED: node comparison of tracked run number, LPP-named run and ledger max per family (table below)] |

## Per-family tracked versus ledger comparison (node script, names only)

| Family | Tracked latest | Ledger latest | LPP present |
|---|---|---|---|
| corpus-turn | 002 | 009 | yes |
| propagation | 012 | 031 | yes |
| source-sweep | 018 | 025 | yes |
| fetch-drain | 005 | 011 (live row 006, 2026-09-29) | yes |
| ledger-consume | 010 | 016 | yes |
| mint | 029 | 004 | yes |
| brief-apply, research-assessment, research-walker, structured-actions | tracked artifacts frozen; ledger ids diverge | | yes |
| carrier-ets-proxy, forward-events, meta-harness, state-cost, screen | tracked runs exist | 0 ledger rows | yes (5) |

Cause (read from record-harness-run.mjs usage in part2): the ledger renumbers max+1 from harness_runs while tracked artifacts are frozen, so the two namespaces diverge. Families with 2 or more tracked artifacts all have an LPP.

## Body facts per file

- family-registry.mjs: import-time load (single point of failure); `HERE_DIR` falls back to `process.cwd()`; `PENDING_SEGMENT_RE` dead guard (the pending/ marker segment no longer exists after GATE-3).
- governing-files.mjs: header/import contradiction; otherwise pure derivation.
- append-dispatch-ledger.mjs: hidden writer if called (appends to a cwd-relative path); no caller, so never writes.
- LPP notes: forward-events and propagation passes carry duplicate headings; research-walker pass carries a malformed proposer_notes sentence; structured-actions pass records that ledger id and artifact name disagree and no action-text trace exists; mint pass 624 lines (largest).
- HYPOTHESIS/UNCONFIRMED/INFERRED markers inside LPP files: brief-apply 2, forward-events 1, ledger-consume 1, mint 2, propagation 3, research-assessment 5, structured-actions 1 (executed grep). These are the proposers' own unverified claims, carried as written.
- TODO/FIXME/XXX/HACK in this part: 0 (executed grep).
- Secrets: none handled by these files.
- Swallowed exits: none (no workflow step here; the swallow list is in part2 and below).

## Cross-cutting facts found while tracing callers (outside scope, recorded so they are not lost)

| Fact | Evidence |
|---|---|
| revalidate.mjs steps end with `\|\| true` in corpus-turn.yml:389, downstream-chain.yml:365, propagation-drain.yml:483, source-resolution.yml:228, population-turn.yml:630 | read during caller trace; not re-run |
| population-turn.yml:533 runs run-mint-batch.mjs `\|\| true`, upstream of the flywheel gate | read during caller trace |
| chain-proof scripts/proof/steps/chain-steps.json invokes 18+ of these scripts in apply mode on a local stack; never run | read; B1 missed these callers |
| Live-apply history in ledger: only downstream-chain-run-001 (2026-09-29, skipped no-op) and fetch-drain-run-006 (2026-09-29); mint-run-001 "execute" means output files only; needs-search-run-001 mode dry; everything newer dry/plan/forced_dry/export | node over harness-ledger-export.json (280 rows, 23 families) |

## Executed evidence

| Command | Output (tail) |
|---|---|
| `ls -d */ \| wc -l`; `ls */family.json \| wc -l`; `ls */FAMILY.md \| wc -l`; `ls */LAST-PROPOSER-PASS.md \| wc -l`; `ls */PROTOCOL.md` | 39; 39; 21; 16; fetch-drain, forward-events, source-sweep |
| `node --test` governing-files / family-registry / append-dispatch-ledger | pass 20 / 27 / 7, fail 0 |
| `grep -l "PENDING-RUN\|pending/" */FAMILY.md \| wc -l` | 12 |
| `ls fsi-app/supabase/migrations/APPLIED-MAP.json` | exists |
| `git grep -l -F append-dispatch-ledger` | maintenance.yml (comment), F25-module-liveness.mjs |
| `git grep -l -F governing-files` / `family-registry` | importer lists cited in CALLED BY |
| `node scripts/turns/run-population-flywheel.mjs --check-gate` | exit 0 (29 mint-run artifacts connected) |

## Prior findings still open

| Prior finding | Date | Now |
|---|---|---|
| B1: append-dispatch-ledger status | 2026-10-11 | DEAD confirmed, with the cwd-relative path mechanism |
| STILL-OPEN, not previously named: CONVENTION.md / PROPOSER-RUNBOOK.md / FAMILY.md / PROTOCOL.md staleness after R22 and GATE-3 | | rows above |
| STILL-OPEN, not previously named: `\|\| true` swallow on revalidate steps in five workflows and on run-mint-batch in population-turn.yml | | workflow lines above (outside scope; D1 owns the workflows) |
