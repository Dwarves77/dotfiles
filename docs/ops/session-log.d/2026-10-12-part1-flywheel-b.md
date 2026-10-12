# 2026-10-12, lane P1-10 (part1-flywheel-b): the decision-propagation Keep/Refactor/Trash register

Branch coord/part1-flywheel-b from origin/master a0749713 in a worktree under .claude/worktrees/, fast-forwarded to 09093a20 (P1-04 intake-b merged) before any file was written. Cloud session (no database, no operator machine, no sub-agents). Brief: docs/plans/rebuild/part1/BRIEF.md read from origin/coord/part1-brief (PR 1142 not yet merged), relayed from the coordinator by the P1-04 lane session.

## Accomplished

- `docs/plans/rebuild/part1/flywheel-b.md` (388 lines): module verdict REFACTOR AND PORT; 4,199 code lines today (6,343 raw in 43 code files, plus 172 lines in two JSON fixtures), about 2,640 estimated for the module plus about 12 that move to P1-22/23 community. TRASH: resolve-statutory-rows-file.mjs, test-statutory-rows.dry.json, seven of eight aggregate-safeguards exports, most of resolve.mjs (merge following kept), three dead corridor-scope readers, computeSignpostWatch, DRAIN_MODE and ESTIMATE_DISPLAY. Zero metered model calls and zero third-party HTTP in scope.
- `docs/plans/rebuild/data-invariants.md`: INV-175 (drain marks drained only in apply after invalidation; recompute supersedes; unknown or refusing method leaves the value stale), INV-176 (method key registered once), INV-177 (admissibility gate refusals and floors), INV-178 (deterministic entity ids, corridor seed, validated and attributed identifiers), INV-179 (newest active correction decides; tombstones, removed tags, suppressed facts; fail closed), INV-180 (lineage write rules and the link-step moat). Count line updated to 180, and its INV-169 to INV-174 attribution corrected from "lane Merge ... auth-db.md" to P1-04 intake-b (the rows' own last column says P1-04).
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 43 in-scope row occurrences written (41 ids; B-0056 and B-0057 appear twice): 38 CONFIRMED-P1 (B-0330 among them, its object corrected: the dead branch is in apply-record-briefs.mjs), 2 CLOSED by CLEAN-3 f906b210 (B-1027 header gone, B-1116 test deleted), 1 REFUTED in part (B-0828: computeDominanceShare is live).
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract); no code changed; no live database read.

## Coverage (every file read whole with the Read tool)

45 files, 6,515 raw lines, one Read call per file: src/lib/propagation (14), scripts/propagation (4 plus 2 fixtures), src/lib/entities (16), scripts/entities (5), src/lib/corrections (4). The dispatch expected about 7,600 lines; CLEAN-3 stripped tests and headers, so 6,515 is the whole scope. Spec 08 (705 lines) read whole first. F1 read whole (three pages). B1 is 254 KB: lines 1-180 (header, summary, prior and new findings) read whole and the five rows naming an in-scope path or family; no other B1 row names an in-scope file. A3, A4, A4d, C4, B1a, B1b and B2 by their 114 lines naming an in-scope path, plus C4's rows for the module's tables.

## Method and evidence

- Consumer evidence: an import-line census per module and a symbol census (`git grep -a -l -w` per exported name, excluding the defining file) over fsi-app/src, scripts, supabase and .github; every dead row re-checked by hand. The `-a` flag is needed because resolve.mjs:298 holds a literal NUL byte, which makes a plain grep skip the file as binary.
- Tables and RPCs: `.from("` scan plus the db.mjs helper literals (readAll, guardedInsert, guardedInsertMany, guardedUpdate); `.rpc("` scan (5 call sites). Column lists from the CREATE TABLE and ADD COLUMN statements of migrations 282-286, 338-339, 356.
- Live-table figures are quoted from the C4 register (exact probe of 2026-10-08), not measured: derived_values 20, derivation_edges 20, propagation_events 2,784, entities 2,880; inference_records, signposts, statutory_computations, estimated_values, entity_aliases, entity_relations and item_corrections 0.
- The two largest findings are mechanical: (1) after CLEAN-3 no workflow invokes any script in scope, so the drain, the seeds and the backfills run by hand only, and the only derived-value read on a customer surface is the notices rail; (2) no outbox trigger sits on item_corrections, intelligence_items, section_claim_provenance or item_cross_references, so a corrected fact never enters Loop B.

## Decisions

- Files owned elsewhere but named by the brief's interface list are cited by lane id (P1-03/04, P1-08, P1-09, P1-15, P1-16, P1-21, P1-22/23, P1-25/26). Detail, market and learning code has no id in the list; recorded as a gap.
- The fueleu constants JSON is KEPT as reference data (it carries the unimplemented 2030-2050 Article 4(2) targets); its regulatory status was not re-verified (no live search in this fact lane).

## Blockers

None. Push and PR follow this entry; if either fails, the exact error is appended here.

## Next steps (for the coordinator)

- INDEX line for `docs/plans/rebuild/part1/flywheel-b.md`.
- Rulings owed (register section 8 gaps 1-8): corrections and Loop B; widening the derivation_edges allowlist (also flywheel-a's ask); whether the FuelEU statutory computation survives the rebuild and who supplies MRV inputs; the drain invoker (P1-08); the UN/LOCODE names licence; module ids for detail, market and learning; fireSignpost as one RPC; the 2030-2050 targets.
