# 2026-10-12, lane P1-06 (part1-sources-b): the sources-b Keep/Refactor/Trash register

Branch coord/part1-sources-b from origin/master 904680db0. Cloud session (no database, no operator machine). Brief from the coordinator session on the operator's machine, received as a cross-session message: read the source components, coverage and health module whole, write one register with its build-plan section, change no code. Clock from `date -u`: register written about 01:20 UTC on 2026-10-12. The file name keeps the brief's 2026-10-11 date.

## Accomplished

- `docs/plans/rebuild/part1/sources-b.md`: module verdict REFACTOR AND PORT; 5,948 code lines today (7,455 raw), about 3,830 estimated (64 percent); bloat ranked (ten rows, led by CanonicalSourceReview.tsx at 866 code lines); dead code (19 rows: deterministicIdentity, two scripts with no invoker, the triage driver's twelve test-only exports, unused selected columns, four hard-coded zero tab counts, a flag button that writes nothing, two health routes with no in-repo caller); duplicates (19 rows); file register (34 rows: 10 KEEP AS-IS, 22 REFACTOR AND PORT, 2 TRASH); build plan (33 planned files with source line ranges, the data model with used and unused columns, the interface, invariants, rulings cited and rulings owed, proof, port order, 30 features each with a new home).
- `docs/plans/rebuild/data-invariants.md`: INV-162 (coverage figure dual-verified over catalogued; an empty cell is not covered, never zero; an outage never cached), INV-163 (one open coverage_gap flag per subject path from a validated request), INV-164 (every post-freeze paid agent_runs row traces to a priced-line or batch marker; unreadable baseline fails closed); count line updated to 164.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 31 in-scope rows written (32 row occurrences; B-0054 sits in the data-integrity summary table too): 1 CLOSED (PR 1123), 2 TRASH, 27 CONFIRMED-P1 (two with a CLOSED half by PR 1123, two on files that are TRASH in P1-06, one kept as an open hypothesis because this lane has no database), 1 REFUTED (B-0247, a property parsed as a defect).
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract; P1-01 left the same line owed for auth-db.md).

## Coverage (every file read whole with the Read tool)

34 files, 7,455 raw lines, 34 Read calls, one per file. No file in SCOPE was left unread.

Prior registers: A2-part4 (150 lines) and B2-part4 (163 lines) read whole, B2-part4 in three offset runs because of the Read tool's token cap. Every other register was read as the extraction of its lines naming an in-scope path: 157 lines across 24 registers (`grep -nE` over the register directory, A2-part4 and B2-part4 excluded), read whole as that extraction. A4 was covered by that extraction (36 lines), not opened in offset runs.

## Findings for the coordinator

1. [REFUTED] The brief says the live-smoke workflow reads the health endpoints. live-smoke.yml and `.discipline/rendering/live/*` call pages, `/api/admin/coverage` and `/api/admin/integrity-flags` only. The health endpoints' one caller was uptime-probes.yml, which CLEAN-3 deleted, together with source-monitoring.yml (inaccessible-triage) and maintenance.yml (the two registry scripts). Each needs a named invoker in the new tree or an operator ruling that it has none.
2. The customer-facing source rating and bias display (PR 944: lib/credibility/bias-display.mjs, chip-selection.mjs, customer-source-tier.ts, BiasChips) is not in this scope; no in-scope file imports it. It needs an owner (P1-05 or P1-17).
3. Rulings owed (register section 8): the Haiku recommendation layer depends on metered routes the plan removes (W2 METERED-0); SourceTierAuditPanel writes base_tier, a second operator tier path beside the audited tier_override; whether the canonical and provisional queues stay as operator overrides under RD-20. The register ports the deterministic, single-path, override reading of each and says so.
4. CLEAN-3 stripped header comments from 21 of the 34 scope files, so line numbers the 2026-10-11 registers cite for the coverage, health and script files are stale; the ten sources/*.tsx files were not touched and their citations hold.

## Decisions

- SourceTierAuditPanel.tsx is TRASH: a metered recommendation plus a second tier write path; its useful half (flag a tier as ambiguous) moves to the tier override control as a real integrity flag.
- scripts/sources/README.md is TRASH: every operational pointer in it is stale on this tree.
- The coverage-gaps rollup ports onto `jurisdiction_iso`; the current lookup of `sources.jurisdictions` by ISO code against a column the editors fill with region buckets stays a hypothesis on live values (no database in this lane).
- Dead-code claims are [CONFIRMED] only where the named grep ran this session over src, scripts and supabase excluding the defining file. Clean LOC estimates are read-derived and marked so.
- The history was deepened with a blobless `git fetch --unshallow` in the main checkout (a fetch only, no checkout or commit there) so `git log -S` could reach DATA-3a; GitHub search mapped commit 580d8ff65 to PR 1123.

## Verification

- `wc -l` and an awk code-line count over the 34 files (register section 1).
- An export scan: `git grep -l -w <symbol>` over fsi-app/src, fsi-app/scripts, fsi-app/supabase for 98 exported symbols, then a hand `git grep -n` for every symbol claimed dead or comment-only.
- `git grep -n -E '\.from\("|\.rpc\("'` and a `process.env` scan for the data model and env list.
- `git show --stat f906b2102` for the CLEAN-3 changes to the scope; `ls .github/workflows` (ci.yml, live-smoke.yml); `test -f` for the 18 admin routes the UI calls.
- `git log -S briefsError` located 580d8ff65 (DATA-3a, PR 1123).
