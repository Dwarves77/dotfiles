# 2026-10-12, lane P1-05 (part1-sources-a): the sources-a Keep/Refactor/Trash register

Branch coord/part1-sources-a from origin/master 904680db0, fast-forwarded to a2f9f3f11 (P1-03 landed during the read; no in-scope file changed). Cloud session (no database, no operator machine). Brief from the coordinator session on the operator's machine, received as a cross-session message: read the sources/trust/tier module whole, write one register with its build-plan section, change no code. The brief named this file with the date 2026-10-11; the work ran on 2026-10-12 (UTC clock of the container), and the filename follows the brief.

## Accomplished

- `docs/plans/rebuild/part1/sources-a.md`: module verdict REFACTOR AND PORT; 6,288 code lines today, about 4,000 estimated for sources-a plus about 150 that leave the module (priority jurisdictions to the coverage module, the brief failure-phrase check to intake); bloat ranked (ten rows); dead code (26 rows, each with the grep that proved it); duplicates (fifteen rows, among them a tier contract in six versions, four body classifiers, five host normalisers, two URL canonicalisers, two scrape holds); file register (60 rows); build plan (33 planned files plus 2 hand-offs, with source line ranges; the data model with used and unused columns; every network and model call site with its free replacement; the interface, invariants, rulings, proof, port order; 68 features each with a new home or a stated NOT PORTED).
- `docs/plans/rebuild/data-invariants.md`: INV-165 (grounding tier from base_tier of the institution, suspended unselectable, disagreement reported), INV-166 (deterministic registration only, never-register classes), INV-167 (no fetch under the hold or with the cadence off, except a signed caller), INV-168 (no error body stored; the fallback widens what is tried, never what qualifies), INV-169 (unique citation edges, syndication once, T7 weight 0, no opinion from a default); count line updated to 169 (renumbered from 162-166 after P1-06 took INV-162 to INV-164 on master).
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 25 in-scope rows written (26 row occurrences, B-0050 appears twice): 18 CONFIRMED-P1, 6 TRASH, 1 REFUTED (B-0224, an info row about an intentional control-character sentinel). No row was CLOSED: none of the in-scope findings has a fix on this tree.
- Not touched: `docs/INDEX.md` (P1-03 already added the part1/ line), no code.

## Coverage (every file read whole with the Read tool)

60 files, 10,158 raw lines, 61 Read calls: `src/lib/trust.ts` in two calls (offsets 1 and 821), every other file in one call. The skill `fsi-app/.claude/skills/source-credibility-model/SKILL.md` and its BINDING reference `authority-floor-and-canonical-tier.md` were read whole first, and the exemplar `docs/plans/rebuild/part1/auth-db.md` whole. The brief expected about 11,600 lines; the tree has 10,158 (recorded in the register header).

Prior registers: the 144 lines naming an in-scope path across 17 registers were extracted by grep and the code-finding rows read (A3 55, A4d 24, A4 17, F1 4, C4 2, C3 3, C3b 1, A1-part1 2, B1b 2, B1c 1, B2-part1 1, B2-part4 2). The D1-part2, D1-part3, D1-part4, D2 and MEM-1 hits name these paths inside rule and skill inventories, not as code findings, and were not used.

## Decisions

- The fetch primitive, transport ladder, classifiers and snapshot store are in this scope by path but are what P1-07 capture builds on. The register plans them under src/core/fetch and features/sources/snapshots and names P1-07 as the caller of the capture writer, without claiming P1-07's port.
- Every Browserless and Anthropic call site in scope is TRASH as a model or render call (canonical-fetch.mjs, browserless.ts, recommend-source-tier.ts, the Haiku branch of verification.ts); each feature is recorded with its free replacement or as NOT PORTED.
- The OECD, IEA, World Bank, IPCC tier (T2 in host-authority.ts, T3 in the skill) is left as a decision-ready ruling for the operator, not decided by this lane.
- Dead-code claims are [CONFIRMED] only where the grep ran this session over src, scripts and supabase excluding the defining file, with a second pass that drops comment-line hits (writeSnapshot, computeCitationComponentFromRows and makeFetchTelemetry were found that way). Clean LOC estimates are read-derived and marked so.
- Two of my own working notes were wrong and were corrected before writing: `tiers.ts` cited by tier1-priority-jurisdictions.ts exists at src/lib/jurisdictions/tiers.ts, and source_citations does carry UNIQUE(citing_source_id, cited_source_id) (migration 004:384). The register states the corrected facts.

## Verification

- `wc -l` and the awk code-line count over the 60 files (register section 1).
- Consumer scan: 391 exported symbols, `grep -rlw` per symbol over fsi-app/src, fsi-app/scripts, fsi-app/supabase, then a comment-line filter, then manual greps for every dead claim (register section 4).
- `node -e` on the three CJK legislature regexes (all false) and a scan of trust.ts for U+FFFD (line 328).
- `cat -A` on officialness.mjs:62 (the `^A` sentinel).
- A scratch parser over every CREATE and ALTER TABLE in supabase/migrations for the column inventories (marked HYPOTHESIS in the register; P1-11 owns the live schema).
- `ls` confirmed scripts/maintenance/recompute-tiers.mjs, recompute-trust-scores.mjs, tier-opinions.mjs and resolve-cited-host-gate.mjs are gone from this tree.
