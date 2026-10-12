# 2026-10-11, lane P1-09 (part1-flywheel-a): the flywheel-a Keep/Refactor/Trash register

Branch coord/part1-flywheel-a, cut from origin/master 904680db0 at 01:16 UTC (2026-10-12, `date -u`) and fast-forwarded to a2f9f3f11 (the P1-03 squash, merged by the coordinator) at 01:24 UTC before any file was written, so the invariant count line and the INDEX line extend P1-03's instead of conflicting with them. Cloud session (no database, no operator machine). Brief from the coordinator session on the operator's machine: read the connection discovery and tags module whole and write its register plus build-plan section as a PR; the coordinator merges.

## Accomplished

- `docs/plans/rebuild/part1/flywheel-a.md`: module verdict REFACTOR AND PORT; 4,403 code lines today, about 2,810 estimated for flywheel-a plus about 390 that leave the module (src/lib/tags to the workspace module, forward-event-format to obligations, resolveItemUuid to one identity helper, ensureCensusRow to intake). No model call site exists in scope (grep, method named in the register). Nineteen planned files, thirty-one feature rows, fifteen defects the new code must not repeat.
- `docs/plans/rebuild/data-invariants.md`: INV-162 (edge ownership, both directions, tombstones), INV-163 (discovery materiality rule), INV-164 (intersection AND rule), INV-165 (wholesale theme replace inside a run row with delta), INV-166 (theme brief member hash), INV-167 (derived tags from the held vocabulary with evidence, never customer-entered), INV-168 (flag namespace, dedup, born resolved), INV-169 (a mint runs discovery before it is done); count line 169.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 43 in-scope ids written (44 row occurrences, B-0053 appears twice): the tallies are in the writer script's output recorded under Verification.
- `docs/INDEX.md`: the Part 1 registers line now names flywheel-a.

## Coverage (every file read whole)

41 files, 6,996 raw lines, 4,403 code lines, in seven `cat -n` batches through the Bash tool whose persisted output was read whole with the Read tool (the harness directed Bash for file reads). Prior registers F1 (301 lines) and B1 (528 lines) read whole in pages under the Read tool's cap; the other registers as the extraction of every line naming an in-scope path (181 lines). Spec 08 read whole.

Two tree facts the register leads with: CLEAN-3 (f906b2102) deleted all 38 tests beside this scope and 28 workflow files, so on this tree no scope file has a test and no workflow calls scripts/connections; F1 and B1's test counts and workflow lines are carried as the 2026-10-11 tree's facts. Three backlog premises checked against this tree were refuted and corrected in place in their STATUS cells (resource-lookup's reads now warn before the fail-soft return; tag-input's ALIAS_KEYWORDS comment and tag-aliases' "not wired" header are gone; the connections fixtures directory does not exist).

## Decisions

- The flywheel split from the brief is applied as the module boundary: connection discovery (this lane) consumes the entity spine and obligations as discovery bases and authors no propagation; derivation edges for theme membership and tag adoption are recorded as the interface owed to P1-10, not built here.
- The operator's "derived, never customer-entered" rule is applied to the derived tag fields. src/lib/tags (customer workspace tags, migration 313, ruling R6) is not the flywheel's tag layer and is verdicted KEEP AS-IS, MOVED to the workspace module, with the question recorded for the coordinator rather than decided here (CLAUDE.md rule 20 posture).
- The open-flag-then-ratify two-step for tag proposals is not ported as a queue: the decision is made in the pass and the flag records it resolved (ADR-025, ADR-044). ratify-flag-to-census is TRASH (a human gate); its census writer moves to intake.
- The signal side channel (title tokens without an edge) folds into discovery as a shared-entity basis; the title-entity branch over an empty vocabulary is TRASH.
- derive-tags stops reading two other modules' source as text at import; the vocabulary becomes data read from the one vocabulary module shared with P1-03's brief contract.
- Dead-code claims are [CONFIRMED] only where the exports scan ran this session over src, scripts and supabase excluding the defining file. Clean LOC estimates are read-derived and marked so. Line numbers cite this tree (a2f9f3f11), not the pre-CLEAN-3 lines the backlog rows carry.

## Verification

- `wc -l` and the awk code-line count over the 41 files (register section 1).
- `exports-consumers.mjs` over the 41 files (68 zero-production-occurrence exports), then the importer scan (57 out-of-scope importer files) for the consumers column.
- `.from(`, db.mjs helper literals, `.rpc(`, `process.env.` and model-call-site scans over the scope (register sections 2 and 8).
- `git show --stat f906b2102` for the deleted tests and workflows; `ls .github/workflows`; `grep -rn` of every scope script name over `.github`.
- Per-row re-reads for every backlog claim at this tree's line numbers (register section 8, defects list, and the STATUS cells).
- Glyph and path check over the four edited files before the commit (no em dash, en dash or section sign in new text; no user-home path).
