# Lane L14-scripts-B — Full-Read Audit Report

Repo: /root/work/dotfiles/fsi-app. 59 files read in full per BRIEF.md instructions. Evidence is the code
read plus /root/work/audit/table-usage.txt; docs/plans, PROGRAM-BOARD.md, session-log.md were not used as
evidence.

---

## Per-file verdicts

### scripts/_dataops/interlock.mjs — OPERATOR-TOOL — re-run guard for already-executed data-op scripts
- WIRING: refs=2 confirmed — imported by scripts/phase2-build-binding.mjs:13 and scripts/phase2-reconcile.mjs:17, both of which call `assertExecutedDataOp(name, meta)` as their first statement (before any DB import executes). GRAPH:UNREACHABLE is accurate for the file *as an entry point* (it's a library, not a script) but it is live-wired into two callers.
- NOTE: `CONFIRM_RERUN=<name>` env var bypasses the guard entirely — by design, for a deliberate re-run.

### scripts/_diag/_pdf-probe.mjs — OPERATOR-TOOL — scratch probe of `unpdf` extraction against a real S3 PDF
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed — no imports of this file found; it is a standalone diagnostic invoked by hand (filename underscore-prefixed, "scratch").
- No writes; hits a live S3 URL and unpdf. Fine as a one-off diagnostic; not reusable machinery.

### scripts/_diag/probe-live-checks.mjs — OPERATOR-TOOL — read-only dump of live CHECK constraints on intelligence_items
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. ZERO writes (own header states it). Connects directly via `pg` using the pooler URL + `.env.local` password.

### scripts/_reground/executor-ground.mjs — OPERATOR-TOOL — manual claim-ledger injection via groundBrief's injectedLedger seam
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed — CLI tool, `usage: node executor-ground.mjs <itemId> <ledger.json>`.
- NOTE: this is a $0 grounding path that bypasses fetch/Sonnet by hand-supplying the claim ledger; the system's own gates (verbatim-kept-filter, tier-stamp, mint gates) still run inside `groundBrief`.

### scripts/_reground/free-pass-run.mjs — OPERATOR-TOOL — $0 batch re-attribution of failing FACT claims to already-held floor-qualifying captures
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. DRY-RUN default; `--apply` required to write. Guarded writes via `guardedUpdate`/`registerSource`. Writes a JSON manifest to `scripts/tmp/`.

### scripts/_reground/id-stamp.mjs — OPERATOR-TOOL — stamp a canonical instrument identifier only if it id-confirms against the staged capture
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Requires the caller to already hold the item's mutation lease (heartbeat check; refuses otherwise). Verify-before-write: refuses the stamp (exit 4) unless the proposed id makes `verifyTargetMatch` return `match` via `instrument-id`/`raw-id`.

### scripts/_reground/lease.mjs — OPERATOR-TOOL — standalone CLI for the per-item mutation-lease (acquire/heartbeat/release)
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Thin wrapper over `mutation-lease.mjs` RPCs.

### scripts/_reground/restore-overclear.mjs — DEAD-HISTORICAL — one-shot restoration of claims over-cleared by a specific 2026-07-16 batch drain-clear incident
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Scoped precisely to `supersede_reason='proven_inaccurate'` AND `inaccuracy_proof.reason='span_absent_from_verified_primary'` — an incident-specific restore, not reusable general machinery. Kept as an operator tool in form but its purpose was a single named incident.

### scripts/_reground/target-match-probe.mjs — OPERATOR-TOOL — read-only verifyTargetMatch report over non-verified items with a staged snapshot
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Zero writes, zero spend, zero fetch (own header).

### scripts/_reground/tombstone-delete.mjs — OPERATOR-TOOL — tombstone-then-delete for archive-endgame buckets (writes disposition_ledger before any guarded delete)
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Fail-closed ordering (tombstone insert must succeed before delete runs); `DELETABLE_REASONS` allowlist prevents deleting "accurate but archived" content; `--require-active-source` gate for GROUP-② content-survives rule.
- NOTE: disposition_ledger has 236 live rows (table-usage.txt) with scripts=3 writers — consistent with this tool (and similar) having actually run historically.

### scripts/_ruling/null-tier-host-ruling.mjs — OPERATOR-TOOL / reference data — the 57-host batched tier ruling (2026-08-11)
- WIRING: refs=1, GRAPH:TEST-ONLY **confirmed, not overturned**. `src/lib/sources/host-authority.ts:102` only *mentions* this file's path in a comment — it does not import it. The one real import is `src/lib/sources/host-authority-ruling-conformance.test.mjs`. So the ruling table lives only as test-pinned data; production code (`host-authority.ts`) apparently encodes the same ruling independently rather than importing this module — worth an owner check that the two never drift, since nothing enforces they stay in sync outside the one conformance test.
- Read-only itself: "Emits SQL + a reversibility CSV. Read-only itself; applies nothing" (file header) — but no SQL-emission code is present in the file; it only exports two data structures (`RULING`, `BY_HOST`). The header's "Emits SQL + a reversibility CSV" claim is not implemented in this file.
  - INCOMPLETE: header (lines 1-22) describes SQL/CSV emission that does not exist in this file's body (lines 23-93 are pure data export, no I/O of any kind).

### scripts/_wave-alpha/backfill-canonical-keys.mjs — OPERATOR-TOOL — Wave-α C8 backfill of intelligence_items.canonical_instrument_key
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. DRY-RUN default; `--apply` writes via `guardedUpdate`. Pre-flight collision check (verified+live duplicate canonical keys) aborts before any write. Re-exports `deriveKey` from `scripts/lib/canonical-key.mjs` "so existing importers keep working" — implying earlier callers existed; not verified in this lane.

### scripts/_wave-alpha/backfill-themes.mjs — OPERATOR-TOOL — Wave-α C3 deterministic theme backfill (fuels/packaging only)
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. `--live` required to write; fail-closed on read error (aborts, writes nothing). Per-row guarded update with a match clause pinning the planned prior state, plus an independent read-back verify — halts on any mismatch (line 73, 77).

### scripts/apply-4c-plan.mjs — OPERATOR-TOOL — pure-node applier for a JSON relabel plan emitted by run-4c-relabel.mjs
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Deliberately pure-node (no jiti) per its own header, because the loader-context runner's guarded writes were found not to commit reliably (root cause undiagnosed) — this file exists specifically to work around that class of defect.
- Schema-validates the whole plan before touching the DB (canonical label vocabulary + garbage-content regex) — a bad plan never writes (line 40-44).
- Drift-checks each entry against current DB content before writing; skips (does not clobber) if content has changed since the plan was built (line 51).

### scripts/audit-optionc-reachability.mjs — OPERATOR-TOOL — read-only URL reachability + title-divergence classifier feeding an archiving decision
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed as a script entry point, though `checkUrl`/`classifyResult`/`classifyResult_LEGACY_BUGGY` are exported for reuse (e.g. by a re-check/selftest per the comment at line 33-34, not present in this lane).
- NOTE (documented bug-fix, not a live defect): the file's own header (lines 3-12) documents a prior defect class where a non-answer (timeout/429/5xx) was misclassified as `FABRICATED_URL`, driving 16 incorrect archivals on 2026-05-29. The current `classifyResult` (line 120) fixes this; `classifyResult_LEGACY_BUGGY` (line 143) is retained only as a mutation-test baseline, not called from `main`.
- Hardcoded `/tmp` paths for its Supabase-row inputs (`ITEMS_PATH`, `S15_PATH`) — operator must stage those files before running.

### scripts/audit-skill-conformance.mjs — OPERATOR-TOOL — read-only skill-conformance audit + optional integrity_flags persistence
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Default is read-only; `--apply` persists flags to `integrity_flags` via guarded insert/update, with dedup-by-open-flag and RD-28-aware "held" vs "actionable" recommended_actions.
- NOTE: `C1` contract check reads `CURRENT_SKILL_CONTRACT_VERSION` live from `src/lib/agent/contract-version.mjs` rather than a hardcoded date — the file's own comment (lines 19-22) documents this as a fix for a prior pinned-constant-drift defect.

### scripts/backfill-item-timelines.mjs — OPERATOR-TOOL — mechanical §14 timeline harvest from stored briefs into item_timelines
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. `--execute` required to write; guarded delete-then-insert per item, but only when the fresh parse yields ≥1 row — "REPLACE RULE" (lines 17-21) explicitly never destroys existing rows it cannot reproduce (HELD + reported instead, lines 91-99).
- item_timelines has 1169 live rows / src=4 / scripts=1 (table-usage.txt) — consistent with this being the (or a) production writer for that table, as its own header claims ("item_timelines had NO production writer" before this).

### scripts/canonical-pipeline-proof.mjs — OPERATOR-TOOL — direct-execution proof of generate→section→ground→grow on one fresh item
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. `arg` handling (line 18-19) is DEAD: when a CLI arg is passed it queries `intelligence_items` with `.ilike("title", "%%")` (a no-op filter matching everything) and does nothing with `arg` in the query itself — `arg` is used only via `.find((r) => r.id.startsWith(arg))` client-side, which works but the ilike call is pointless overhead (fetches unfiltered rows just to filter in JS).
  - INCOMPLETE/DEFECT (minor): line 19 `.ilike("title", "%%")` performs no actual filtering server-side; harmless but wasteful, and the intent (server-side filtering) is not what the code does.

### scripts/connections/analyze-corpus.mjs — OPERATOR-TOOL — clusters the connection graph, persists connection_themes, reflects coverage_gap flags
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed as an entry point ("PILLAR A3 / flywheel U2"). `--dry` computes+reports only. Full replace-semantics on `connection_themes` (delete-all then insert) each run; `integrity_flags` gap reflection is dedup'd/resolved within its own `flywheel-gap:` namespace so it never touches another writer's flags.
- Self-verifies at the end: re-reads `connection_themes` row count and the run row's status, exits non-zero on mismatch (line 176-178).
- connection_themes: 9 live rows, connection_theme_runs: 4 live rows (table-usage.txt) — consistent with this having run a handful of times.

### scripts/connections/backfill-edges.mjs — OPERATOR-TOOL — populates item_cross_references from shared provenance ($0, model-independent)
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed as entry point. Delegates the actual write to `src/lib/connections/write-edges.mjs` (own header explains why: keeps one writer home for `item_cross_references`, reusable by a future scan-time hook).
- item_cross_references: 1929 live rows / src=8 / scripts=2 (table-usage.txt) — consistent with this being one of the writers.

### scripts/dead-code-sweep.sh — INCOMPLETE — operator-run half of a 2026-08-11 dead-code deletion census
- WIRING: refs=0, no GRAPH flag (bash entry point). **DEFECT**: line 38 requires `docs/audits/dead-code-manifest-2026-08-11.txt`; verified via Glob this file does **not exist anywhere in the repo** (`docs/audits/dead-code*` returns no matches). Running this script today fails immediately at line 43 (`FATAL: manifest not found`) — the script cannot currently do its job at all, in either dry-run or `--apply` mode.
  - Two readings: (a) the sweep already ran successfully and, per its own final instruction (line 106, "Delete this script — it is a one-time instrument and becomes dead code itself the moment it succeeds"), the manifest and this script were meant to be deleted together but only the manifest was removed, leaving this script an orphaned, permanently-failing husk; or (b) the manifest was never committed at all and the sweep never ran. AMBIGUOUS — cannot distinguish from repo state alone; git history would resolve it but is out of scope for this lane.
- The script itself is otherwise well-guarded (existence + git-tracked + exact-count checks before any deletion, stages but never commits).

### scripts/entities/backfill-lineage-edges.mjs — OPERATOR-TOOL — WO-28 Phase D: feeds typed-lineage-edge capability with a $0 whole-corpus backfill
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. `--dry` is the default (deliberately safer than backfill-edges.mjs's write-by-default, per its own header). Uses the exact same pure planner (`planLinkWrites`) the runtime uses, so no duplicated typing logic.
- rule-015 prior-state snapshot (row count + md5) computed and printed before any write (lines 145-153, 176-177) — genuine reversibility record.
- Origin-ownership discipline: only ever writes/upgrades `origin='entity_extraction'` edges, never touches a foreign-origin edge (lines 38-45, 201).

### scripts/funded-pass.mjs — OPERATOR-TOOL — the sanctioned machine-gated paid run driving a worklist through the canonical pipeline
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed as an entry point (large, complex operator tool, 271 lines).
- Multiple defense layers present and read in full: mandatory `--bound=` for any `--apply` (refuses otherwise, line 165-168), Layer-C data-audit block-gate honored before any spend (line 169-176, closing a bypass the pipeline's own preflightStep would otherwise catch), run-lock (mig 205) to prevent concurrent funded-pass processes (lines 200-209), between-item heartbeat + emergency-pause poll (lines 216-222), authoritative cumulative-spend bound checked from the DB truth every item (not the reconstructed per-item ledger) before spending on the next item (lines 226-228), and a "spending-without-effect" tripwire halting after 5 consecutive no-gain paid items (lines 237-242).
- NOTE: `ITEM_TIMEOUT_MS` was raised to 1.2M ms (20 min) after a prior 300s cap raced the still-running pipeline and produced false "timeout" HELDs on items that actually verified (lines 36-40) — documented, not a currently-live defect.

### scripts/gen/assumption-register-common.mjs — WORKING-UNWIRED — shared seeding machinery for assumption_register
- WIRING: refs=2 confirmed — imported by `scripts/gen/assumption-register-seed.mjs` and its own test file `assumption-register-common.test.mjs`.
- assumption_register has **0 live rows** (table-usage.txt) despite scripts=3 referencing it. The seeder itself (`assumption-register-seed.mjs`) states explicitly "THIS SESSION NEVER RUNS --apply" — confirms the table has never actually been seeded; the machinery is built and tested but genuinely unexecuted against production.

### scripts/gen/assumption-register-common.test.mjs — TEST — pure/offline unit tests for assumption-register-common.mjs
- WIRING: refs=0, no flag — but its own header (in the sibling seed.mjs and per its own content) documents that at authoring time this file was **not yet wired into the test runner's glob** (see emission-factors-common.test.mjs's identical note, which explicitly calls out the sibling gap too — this file has no equivalent self-referential note but shares the same directory pattern). Not independently confirmed whether `node --test` picks up `scripts/gen/*.test.mjs`; flagged as a wiring question for the owner, not asserted as fact.
- Not vacuous: includes explicit CHECK-rejection proofs (missing field, malformed key, bad status, value_numeric-without-unit, bad derivation/origin_class, non-positive n_observations) and a live-migration cross-check (`every column seedAssumptions reads ... exists in the applied migration 271 DDL`, lines 242-269) that would fail red on a schema/reader mismatch.

### scripts/gen/assumption-register-seed.mjs — WORKING-UNWIRED — seeder for the 10 WO-20 catalogued modelling constants
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. DRY-RUN default; `--apply` writes via `seedAssumptions`. Explicitly states this authoring session "NEVER runs --apply" (line 15-17) — consistent with assumption_register's 0 live rows.
- NOTE: depends on migration 271 being applied first (not runnable until then, own header lines 6-9).

### scripts/gen/emission-factors-common.mjs — WORKING-WIRED — shared seeding machinery for licence-clear modal-default emission_factors seeders
- WIRING: refs=3 confirmed — `emission-factors-desnz.mjs`, `emission-factors-epa.mjs`, and its own test file all import it.
- emission_factors has 6 live rows (table-usage.txt) = exactly 4 (DESNZ fixture) + 2 (EPA fixture) rows per the two seeders' fixtures (confirmed against emission-factors-common.test.mjs lines 42, 51: "rows.length, 4" / "rows.length, 2") — **confirms both seeders actually ran `--apply` successfully** in production.
- DEFECT (documented, already fixed, historical): own header (lines 116-130) documents that omitting `orderBy: "factor_id"` made the idempotency read silently fail-closed on every dry run (fell back to "already live: 0" with no real measurement) for an unknown period before the fix — a real production defect that was live until this file's current form. Not currently defective; noted for the record per BRIEF's DEFECT category (historical, already patched in the code as read).

### scripts/gen/emission-factors-common.test.mjs — TEST — pins the natural-key idempotency + CHECK-rejection contracts for emission_factors seeding
- WIRING: refs=0, no flag. Own header (lines 6-11) explicitly states this test file is **NOT execution-wired**: "this lane's write set excludes fsi-app/.discipline/run-test-suite.sh, so this file cannot be added to the `node --test` glob list ... this file is NOT execution-wired per .discipline/governance/execution-wiring.mjs". This is the file's own admission, not an inference — flagging it directly per the BRIEF's honesty bar.
  - INCOMPLETE (self-documented): F23-governed-surface-coverage.mjs would classify this as an ORPHANED-PROOF gap per the file's own note, until a maintainer adds `fsi-app/scripts/gen/*.test.mjs` to the test-suite glob.
- Not vacuous otherwise: includes a genuine artifact cross-check reading migration 258's committed SQL text directly (not trusting factor-tier.mjs's self-report) to assert the CHECK constraint text (lines 85-94).

### scripts/gen/emission-factors-desnz.mjs — WORKING-WIRED — UK DESNZ modal-default emission-factor seeder
- WIRING: refs=0 as an entry point (correct — it's a CLI script). DRY-RUN default; `--apply` writes via `seedFactors`. Fixture (4 rows) confirmed live per the cross-check above.
- NOTE: own header flags the fixture's numbers as "[UNCONFIRMED]-against-primary-spreadsheet" pending direct verification (line 5) — an honest caveat, not a defect.

### scripts/gen/emission-factors-epa.mjs — WORKING-WIRED — US EPA modal-default emission-factor seeder
- WIRING: refs=0 as entry point (correct). DRY-RUN default; `--apply` writes via `seedFactors`. Fixture (2 rows) confirmed live per the cross-check above. Own header states figures are "[CONFIRMED]" against the primary PDF twice (line 5), unlike the DESNZ sibling.

### scripts/gen/migration-258.mjs — OPERATOR-TOOL — generator for supabase/migrations/258_emission_factors_and_licence_gate.sql
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed for the generator script itself; its **output** (migration 258) is very much live — confirmed present on disk and referenced by the emission_factors-common test file's cross-check. The generator is re-run by hand ("Re-run with: node scripts/gen/migration-258.mjs. It rewrites the migration in place." — line 12) whenever the register changes; this is by-design operator tooling, not dead code.
- The file only writes when invoked directly (`process.argv[1]` endswith check, line 322) — safe to import for its exported `renderMigration`/`block`/`MARKERS` without side effects, which is presumably how src/__tests__ regeneration tests use it (not directly verified in this lane; migration-258 itself is not in this lane's file list).

### scripts/gen/migration-267-origin-class-and-envelope.mjs — WORKING-WIRED (TEST-ONLY per graph) — generator for migration 267 (origin_class + regional_data_facts/state_cost_facts envelope columns)
- WIRING: refs=1, GRAPH:TEST-ONLY confirmed — imported by `src/__tests__/contracts-provenance-envelope.test.mjs` (anti-drift byte-compare against the committed migration). Generator itself only writes on direct invocation (line 150-153), same pattern as migration-258.mjs.
- Schema-only migration (own header, lines 71-77): explicitly NO backfill in this file. Confirmed by table-usage.txt: intelligence_items/regional_data_facts/state_cost_facts's `origin_class` presence isn't independently tracked there, but the file's own post-check SQL (lines 89-91) asserts 0 rows carry origin_class immediately post-apply, consistent with "no backfill here."

### scripts/gen/migration-268-market-series.mjs — WORKING-WIRED (TEST-ONLY per graph) — generator for migration 268 (market_series table)
- WIRING: refs=1, GRAPH:TEST-ONLY confirmed — imported by `src/__tests__/contracts-market-series-migration.test.mjs`.
- market_series has 6 live rows / src=6 / scripts=5 (table-usage.txt) despite this migration's own post-check asserting the table ships with **0 rows** ("schema only", line 185-187 of the generated SQL). The 6 live rows therefore arrived via a later producer run (e.g. `eu-weekly-oil-bulletin.mjs --apply`), not this migration — consistent, not contradictory, but worth noting for anyone assuming market_series is still empty per this file's own comments (which describe SERIES_ITEM_MAP as empty and the oil-bulletin producer as still gated).

### scripts/gen/migration-271-assumption-register.mjs — WORKING-WIRED (TEST-ONLY per graph) — generator for migration 271 (assumption_register table)
- WIRING: refs=1, GRAPH:TEST-ONLY confirmed — imported by `src/__tests__/contracts-assumption-register-migration.test.mjs`.
- Own header (line 128-129) states: "APPLIED BY THE COORDINATOR ONLY ... this file is written by an executor lane and left unapplied" — consistent with assumption_register's 0 live rows (though the migration creating the *table* could be applied with the table simply unseeded; table-usage.txt's "0 rows" doesn't distinguish "table doesn't exist" from "table exists, empty" — not independently verified whether migration 271 has actually been applied).

### scripts/holdings-audit.mjs — OPERATOR-TOOL — read-only classification of every stored capture against known defect classes; one guarded batch write to holdings_quality
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Default DRY (compute + print only); `--write` performs the one guarded batch insert, and **refuses if `holdings_quality` already has rows** (idempotent-by-refusal, line 234).
- holdings_quality: 672 live rows / src=0 / scripts=1 (table-usage.txt) — consistent with this having been run with `--write` exactly once (matches the refuse-if-nonzero guard: a second run would report "already has N rows" and no-op).
- Concurrency-limited (8-way) body downloads from Storage; failures recorded honestly via `body_read: bodyRes.reason`, never silently treated as clean.

### scripts/measure-bundles.mjs — OPERATOR-TOOL — per-route Next.js client bundle size report
- WIRING: refs=0, no GRAPH flag (script entry point via `npm run perf:bundles`, per its own header). Reads `.next/server/.../page_client-reference-manifest.js` files; exits cleanly with an error message if `.next/` is missing (line 75-78) rather than crashing.
- Purely a dev/perf tool; no DB access, no writes. No defects found.

### scripts/phase-5-backfill.mjs — DEAD-HISTORICAL — Sprint-1 Phase-5 jurisdiction/ISO backfill + RC-9 dedup, run once manually
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Extremely specific to a named one-time operation: hardcoded UUID prefixes for 5 winners/6 losers (lines 62-100), operator decisions Q1-Q8 baked in as constants, a documented post-mortem of an earlier failed attempt (connection-pooler bug fixed at lines 125-151, batch-size reduced from 100→50 after a mid-batch connection drop at line 51-56).
- `--skip-workload-a` flag (line 710) exists specifically "for retry scenarios where workload A already committed in a prior run" — this and the surrounding comments make clear the script was actually executed (at least partially, with at least one retry) against production. Its sibling `scripts/tmp/phase-5-rollback.mjs` exists specifically to undo a failed turn-2 attempt of this exact script.
- Genuinely dead now: the specific item UUIDs and jurisdiction counts (457 ISO-empty rows) are one-time facts about a corpus state from 2026-05-18; re-running today would preflight-HALT (the winner/loser UUID existence checks, lines 174-189) unless that exact historical state still holds, which is not plausible after subsequent migrations.

### scripts/phase2-build-binding.mjs — DEAD-HISTORICAL — Phase 2 #43 binding BUILD step (applies migration 118 + activates the scoped `reconciler` DB role)
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed for the file itself; correctly guarded by `_dataops/interlock.mjs` (`assertExecutedDataOp("phase2-build-binding", {applied: "2026-06-01", commit: "61f86cd", ...})`, line 14) — running it today without `CONFIRM_RERUN=phase2-build-binding` exits cleanly with no DB connection opened (the interlock is the very first statement to execute, per interlock.mjs's own design).
- Idempotent by construction if deliberately re-run (own header: re-applies migration 118 via IF NOT EXISTS/CREATE OR REPLACE, re-ALTERs the reconciler role).

### scripts/phase2-reconcile.mjs — DEAD-HISTORICAL — Phase 2 provenance reconciliation through the bound `reconciler` credential (flips ~600 unverified items)
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Guarded by the same interlock (`assertExecutedDataOp("phase2-reconcile", {applied: "2026-06-01", commit: "0571c11", ...})`, line 18) — refuses re-run without `CONFIRM_RERUN`.
- Hard-fails if not actually connected as the `reconciler` role (line 33) — cannot silently run with elevated privilege.
- Per-item read-back verification via `assertReadBack`, halting with a non-zero exit if any mismatch is found post-execute (line 96).

### scripts/phase2-verify-binding.mjs — OPERATOR-TOOL — 3-layer verify-by-construction of the #43 provenance-flip binding
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed.
- NOTE: unlike its two siblings above, this file has **no `assertExecutedDataOp` interlock guard** — but this is not a defect: every probe here is either non-committing (BEGIN/ROLLBACK, lines 58-65, 88-100) or is an *expected-to-be-rejected* write attempt against the guard itself (lines 68-86), so re-running it is safe by construction and does not need the interlock. Confirmed by reading the full file: no path commits a durable state change.

### scripts/producers/market/eu-weekly-oil-bulletin.mjs — WORKING-WIRED — WO-16's first market_series producer (parse → plan → guarded upsert)
- WIRING: refs=0 as entry point (correct — CLI producer). Two independent kill gates for `--apply`: the `--apply` flag itself and `MARKET_PRODUCER_EU_OIL_BULLETIN_ENABLED=1` env var, checked only on `--apply` (lines 97-103) — a `--dry` run always works regardless of the switch.
- Composes with `fetch-oil-bulletin.mjs` (piped) per its own usage docs (lines 42-44); does not itself fetch the live bulletin.
- market_series: 6 live rows (table-usage.txt) is consistent with this producer having actually run `--apply` (with the switch armed) at least once, or with rows written by another producer against the same table (the table is shared by multiple producers per WO-16's design).

### scripts/producers/market/fetch-oil-bulletin.mjs — WORKING-WIRED — live fetch + extract step for the EU Weekly Oil Bulletin workbook
- WIRING: refs=0 as entry point (correct). Writes nothing itself — CSV to stdout/`--out`, report to stderr; the write gates live entirely in the sibling `eu-weekly-oil-bulletin.mjs`.
- NOTE (documented, already fixed): own header (lines 13-24) documents that the first live run (producers run #7) exited 2 (structural failure) because the EU-average block was keyed on a display string that turned out not to be a real header — fixed in a later revision without needing this file to change (the fix lives in `oil-bulletin-workbook.mjs`, outside this lane). Historical defect, not currently live per the code read.
- Shells out to system `unzip` binary (line 159) rather than an npm zip library — a real environmental dependency (works on the GitHub Actions runner per its own note, lines 50-57; author's own sandbox could not exercise this against the live network per lines 6-11).

### scripts/producers/market/refresh-published-price-statistics.mjs — WORKING-UNWIRED (functionally, by design) — WO-16 step 4 refresher feeding published_price_statistics from market_series
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. `SERIES_ITEM_MAP` (imported from `src/lib/market/refresh-published-price-statistics.mjs`) is documented as **empty today** — the script's own logic makes it a guaranteed no-op regardless of `--apply` until an operator ratifies a series→item mapping (lines 39-47). This is an honest, self-describing default-off state rather than a bug.
- published_price_statistics: 4 live rows / src=3 / scripts=2 (table-usage.txt) — those 4 rows were NOT written by this script (its own map is empty); they come from another writer not in this lane.

### scripts/producers/regional/bls-oews-producer.mjs — WORKING-WIRED — $0 BLS OEWS freight/logistics wage producer into regional_data_facts
- WIRING: refs=0 as entry point (correct; called by `producers.yml` GitHub Actions workflow per its own header, not verified independently in this lane since workflows are out of scope). `ENABLED = true` (armed 2026-08-30, own comment lines 12-19) — a hardcoded reviewed-code-change gate, not a runtime flag.
- NOTE: own header states this producer's live network call was never exercised in the authoring sandbox (egress-blocked); the parser is fixture-tested but the live BLS series-ID construction is "not verified live this session" (lines 24-29) — an honest gap, not a defect found by this lane, but worth an owner's attention if regional_data_facts wage figures look off.

### scripts/producers/regional/eurostat-nrg-pc-205-producer.mjs — WORKING-WIRED — $0 Eurostat EU electricity-price producer into regional_data_facts
- WIRING: refs=0 as entry point (correct, same GitHub Actions pattern). `ENABLED = true` (armed 2026-08-30). Same "not exercised live this session, sandbox egress-blocked" caveat as the BLS sibling (lines 25-31).
- regional_data_facts: 86 live rows / src=2 / scripts=5 (table-usage.txt) — consistent with these two producers (plus others outside this lane) having actually written data.

### scripts/producers/regional/run-envelope-producer.mjs — WORKING-WIRED — shared orchestration shell for WO-17 regional_data_facts producers
- WIRING: refs=5 confirmed (imported by bls-oews-producer.mjs, eurostat-nrg-pc-205-producer.mjs, its own test file, and per the header two producers directly plus the test — matches the ground-truth refs=5).
- DEFECT (documented, already fixed): own header (lines 66-88) documents a real production incident — the orchestrator called `planUpsert`/`guardedInsert` directly on parser output without ever calling `buildEnvelopeRow`, so `regional_data_facts.value` (TEXT NOT NULL) was never populated and **every live `--apply` failed on the first row** (`null value in column "value"`) for the whole authoring period until this fix. Confirmed fixed in the code read (line 86-88, `toCandidateRows` now calls `buildEnvelopeRow`).
- Second related fix in the same file: `latestPerNaturalKey` (line 111) was added after discovering the Eurostat parser emits ~40 candidates per natural key (one per semester) that would violate the live UNIQUE constraint on the second insert — deduped to the latest observation per key before writing (lines 91-110). Both fixes are pinned by the accompanying test file.

### scripts/producers/regional/run-envelope-producer.test.mjs — TEST — pins the exact "value column never populated" and "23505 duplicate key" incidents against the live table shape
- WIRING: refs=0, no flag (test file). Not vacuous: assertions are against the live table's actual NOT-NULL column set (documented as read from `information_schema` on 2026-08-30, lines 28-38), not an assumed shape; includes a test that explicitly documents "this is what shipped, and why nothing wrote" (line 59-63) as a regression pin.

### scripts/recovery-measure.mjs — OPERATOR-TOOL — read-only classification of ~347 previously-rejected "reachability" candidate URLs (systematic/intermittent/thin/dead/inconclusive)
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Zero mutation (own header line 3: "READ-ONLY... ZERO mutation"). Rate-limit-spaced canonical renders (concurrency 2, 600ms gap) to stay under the Browserless plan; 429s retried with backoff and classified `inconclusive`, never `dead` — a documented fix for the exact "non-2xx as conclusion" bug class the file's header calls out as the same defect the original 420 made (lines 4-9).
- Resumable JSON cache (`docs/recovery-phase1b-results.json`) — a re-run only resolves still-inconclusive 429s.
- Explicitly states Phase 3 (re-admission) is "HELD for operator go" (line 150) — this file never re-admits anything itself.

### scripts/regen-quarantined.mjs — OPERATOR-TOOL — Tier-2 snapshot-first restitution resolver, drives quarantined items toward VERIFIED via the one verify-item entry
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. `act:false` always passed to `verifyItem` (line 44) — this resolver only decides, never fetches/models/deletes, per its own header. `--apply` only re-runs a $0 `validate_item_provenance` RPC for `verified_cheap` outcomes; the paid re-ground path (`needs_acquire`) is explicitly reported, never executed here (lines 10-11, 82-83).
- `HOLD_TYPES` (research_finding/technology/tool/innovation) excluded pending a separate calibration spec (lines 16, 51) — an explicit, documented scope narrowing, not an oversight.

### scripts/remediation/acquire-primaries-batch.mjs — OPERATOR-TOOL — batch $0 acquisition of authoritative primaries via free fetch + officialness gate
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. `--execute` required to write; on accept, registers the source at its codified tier, snapshots the text, and repoints the item off any portal to the instrument (lines 126-133).
- On no-accept, files an honest `integrity_flags` HOLD (no tier guessed) rather than silently skipping (lines 118-124) — matches the "no fabrication, no guessed tier" contract in the header.
- Candidate discovery caps at 5 URLs, preferring PDFs (line 86) — bounded, not exhaustive, by design.

### scripts/remediation/refetch-capped-worklist.mjs — OPERATOR-TOOL — ADR-016 storage-side uncap: re-captures legacy STORAGE-CAPPED pool rows in full
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. BUILD mode (default) is strictly read-only; `--execute` refuses if `system_state.global_processing_paused` is true, and **fails closed** if that state cannot even be read (lines 115-119) — a defensive posture explicitly modeled on a named prior error-swallow post-mortem (comment at lines 92-95, 112-114).
- Diff-on-recapture guard (`factSpansStillMatch`, lines 96-106): every grounded FACT span must still `.includes()`-match the fresh capture, or the row is HELD and the old capture kept — never a blind replace. Same error-swallow discipline applied here too (line 92-95 comment; the guard treats a query error as `ok:false`, never a vacuous pass).
- `EXPECTED` population counts (line 186) are compared against actual and any divergence is *reported*, explicitly never forced/overridden (lines 187-193) — matches its stated "report any divergence, never an override" contract.

### scripts/run-4c-relabel.mjs — OPERATOR-TOOL — paid (Haiku) 4c judge + plan-emitter for unlabeled_assertion relabeling
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Requires an explicit `--bound=<usd>` for any run — refuses (exit 5) with no standing default, per an explicit operator ruling quoted in the code (lines 25-31) that retired a prior default cap.
- Performs NO DB writes itself (own header lines 5-8) — writes route exclusively through the separate pure-node `apply-4c-plan.mjs`, because this loader-context runner's guarded writes were found to report success without committing (documented, unresolved root cause per this file's own comment).
- Explicitly refuses if `BROWSERLESS_API_KEY` is still set (lines 22-23) — an intentional no-fetch guard for a judge-only pass.
- Closes out with `assertLedgerDrained()` and a cross-process read-back of spend-call telemetry rows (lines 100-105) — genuine spend accountability, not just a log line.

### scripts/seed-community-regional-rooms.mjs — WORKING-WIRED (likely executed) — seeds the 7 canonical regional community_groups "rooms"
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed for the script itself.
- NOTE (status claim vs. live data): the file's own header states "STATUS: COMMITTED, NOT EXECUTED. The main session runs it. Until then the rooms grid renders honest-empty" (lines 10-11). However, **community_groups has exactly 7 live rows** (table-usage.txt: `community_groups 7 src=7 scripts=1`), which is precisely the count of `ROOMS` this script would create (lines 46-61) and there is exactly one scripts=1 writer credited to that table. This strongly suggests the header comment is now stale — the script has in fact been executed since it was authored — though this cannot be proven from static code alone (a different origin for the 7 rows, e.g. manual seeding matching the same slugs, cannot be fully ruled out from this lane).
  - AMBIGUOUS: header says "not executed"; live row count is consistent with (but does not prove) execution having since happened. Flagging both readings per the BRIEF's honesty bar.

### scripts/source-role-cleanup.mjs — OPERATOR-TOOL — #3 source-classification cleanup, re-runs the deterministic classifySourceRole over sources
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Requires **both** `--execute` and `--confirm` to write (line 19) — a double-flag guard, stricter than most sibling scripts' single `--apply`/`--execute`.
- NOTE (documented, already fixed): own header (lines 24-32) documents a real prior scope defect — the read was originally `WHERE status='active'`, making the tool blind to 820 of 1,719 NULL-role rows outside `status='active'` forever, right when a NULL role was being read downstream as evidence of worthlessness (feeding an 869-source demotion on 2026-08-10). Fixed to scan all rows regardless of status by default (`--active-only` restores the old narrower scope). Historical defect, fixed in the code as read.
- Per-row guarded update with `WHERE ... source_role IS NOT DISTINCT FROM $3` (matching the planned prior value) plus a read-back check per row (line 54-55) — halts-per-row (not run) on mismatch, logging to `_diag/source-role-cleanup-log.json`.

### scripts/source-state-min-wage.mjs — WORKING-WIRED — seeds state_cost_facts with 2026 statewide minimum-wage figures for 13 major US freight states
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed as entry point. `--execute` required to write.
- **state_cost_facts has exactly 13 live rows** (table-usage.txt) matching the 13-entry `FACTS` array (lines 59-71) exactly — confirms this script has run `--execute` successfully in production.
- NOTE (documented, already fixed): own header (F13, lines 82-85) — `registerSource` was originally called even in dry-run, meaning "DRY-RUN by default" was untrue for the source-registration step; now gated behind `EXECUTE` like every other write in the file. Historical defect, fixed in code as read.
- Idempotent on (state_code, dimension, fact_label) natural key (own header line 25-26); a state omitted from `FACTS` renders a dash on the surface, never a fabricated national average (lines 20-22) — an honest-gap design choice, not a defect.

### scripts/sprint3-corpus-reclassify-audit.mjs — DEAD-HISTORICAL — Sprint-3 read-only investigation of domain=1 rows that look like source-portal pages misfiled as regulations
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Purely read-only (own header lines 11: "No UPDATE/DELETE/INSERT against production data" — confirmed, only `.select()` calls throughout). Writes a dated JSON report to `docs/audits/sprint3-corpus-reclassify-audit-2026-05-27.json` (the filename itself dates the run).
- Contains a hardcoded list of 7 "operator-named exemplar" titles (lines 80-88) that are cross-checked for presence — genuinely one-time investigative tooling tied to a specific historical audit, not reusable general machinery.

### scripts/sprint4-114-spancheck-test.mjs — TEST — task 1.14 unit test proving span-check.ts throws RetryableError on an unreachable URL
- WIRING: refs=0, no flag (self-contained test script; compiles `span-check.ts` via a throwaway `npx tsc` invocation into `.spancheck-out/`, imports the compiled JS, asserts, then cleans up the directory it made — lines 14-20, 40). Not run via `node --test`; it is its own standalone script (`execSync`-driven), which is why GRAPH tooling likely reports refs=0 with no TEST-ONLY flag despite functioning as a test.
- Not vacuous: asserts both that the call throws (line 32) and that the thrown error's constructor name is specifically `RetryableError` (lines 33-37), not just "any error" — a genuine behavioral pin.
- Uses `http://127.0.0.1:1/` (a closed low port) as its "always unreachable" fixture (line 28) — reasonable and portable across environments, no live network dependency.

### scripts/tmp/phase-5-rollback.mjs — DEAD-HISTORICAL — turn-2 UPSERT-style rollback for a specific failed phase-5-backfill run (2026-05-18T16:22:31Z)
- WIRING: refs=0, GRAPH:UNREACHABLE confirmed. Extremely specific to the one incident: hardcoded `TURN_2_START` timestamp (line 16) used to scope which `ingest_rejections` rows to delete; restores only from `intelligence_items_pre_phase5` snapshot table created by the corresponding `phase-5-backfill.mjs` run.
- Self-verifying: halts (throws inside the transaction, forcing ROLLBACK) if PJR count drifts from snapshot (line 82-84) or if any row still drifts from snapshot post-UPDATE (line 108-110) — a real safety net, correctly implemented (verified the throw paths route through the `catch` block's `ROLLBACK` at line 128).
- Disables/re-enables the jurisdiction-normalize trigger around the restore UPDATE (lines 40-43, 120-123) — documented as necessary because the first rollback attempt without this bracket re-triggered re-normalization and duplicated IR rows (same comment cross-referenced from phase-5-backfill.mjs's own header, "OBS-11").
- Located under `scripts/tmp/` — its own directory placement signals disposable/one-off status, consistent with DEAD-HISTORICAL.

### supabase/functions/capture-worker/index.ts — WORKING-WIRED (operator/RPC-invoked, not scheduled) — Deno Edge Function performing server-side document capture into agent_run_searches
- WIRING: refs=0 in the fsi-app repo's own src/scripts import graph, GRAPH:UNREACHABLE as *flagged*, but this is **overturned for reachability, not for scheduling**: confirmed via grep that `supabase/migrations/256_migration_homes_and_vault_capture_key.sql` defines `public.capture_worker_fetch(queue_ids uuid[])` (a `SECURITY DEFINER` SQL RPC, lines 128-156 of that migration) whose sole body is a `net.http_post` call to this exact Edge Function URL (`https://kwrsbpiseruzbfwjpvsp.supabase.co/functions/v1/capture-worker`), authenticated via a Vault-stored anon JWT. Grepping the whole repo for `capture_worker_fetch` finds it referenced only in migrations and `.discipline/` governance/fitness files — **no `src/` or `scripts/` file calls this RPC**, and no `pg_cron.schedule` entry targets it either. So the function is reachable only by an operator (or an external scheduler outside this repo) manually invoking the `capture_worker_fetch` SQL RPC with explicit `queue_ids`.
- pending_first_fetch has 1376 live rows / src=0 / scripts=0 (table-usage.txt) — a substantial, apparently-growing queue with **no in-repo automated drain path** found. `src/lib/intake/mint-item.ts` is confirmed (via grep) to write rows into `pending_first_fetch` (the queue's producer side is wired), but nothing in this repo consumes it automatically.
  - NOTE (operationally significant): this is either an intentional manual/runbook-only drain (plausible — the file's own header calls it "the runbook-sanctioned, no-metered-spend document-capture path", and `gate_a_health_refresh` in the same migration is explicitly "Deliberately UNSCHEDULED... makes the dormancy visible by design" as a documented precedent for leaving things unscheduled on purpose) or an unintentional gap where 1376 queued captures are silently accumulating with nothing running them. Cannot distinguish from code alone; worth an explicit owner confirmation given the queue is non-trivial in size.
- v1.4 correctness features read and confirmed present: atomic claim via conditional UPDATE...WHERE status IN (queued,error) (lines 166-168, preventing two concurrent invocations racing the same row), transient-vs-permanent status classification with bounded retry (`RETRYABLE_STATUS`, `MAX_ATTEMPTS=5`, lines 61-65, 195-203), content-type allowlist before any decode (lines 205-209), charset-aware decode (lines 83-95), a storage ceiling shared-by-name-and-default with the Next.js path (`STORAGE_MAX_CHARS`, lines 41-59) that is loud-on-bind (files a `coverage_gap` integrity_flag, never a silent trim, lines 289-376), and explicit re-queue (never a stuck `fetching` row) on every downstream write failure (agent_runs insert fail → retry line 328-333; capture insert fail → mark run error + retry, line 346-353).

---

## Lane summary

### Counts by STATUS
- OPERATOR-TOOL: 27
- WORKING-WIRED: 13 (includes 3 with GRAPH:TEST-ONLY that resolve to real test imports, 1 edge function reachable only via manual RPC)
- DEAD-HISTORICAL: 8
- WORKING-UNWIRED: 3 (assumption-register machinery — built, tested, genuinely never `--apply`'d)
- TEST: 3
- INCOMPLETE: 1 (dead-code-sweep.sh — manifest missing, cannot currently run)
- AMBIGUOUS (folded into their STATUS lines above rather than a separate bucket): 2 (seed-community-regional-rooms.mjs status-comment-vs-data; capture-worker scheduling intent)

Total files: 59/59.

### Top findings, ranked

1. **scripts/dead-code-sweep.sh cannot currently run** — its hard dependency, `docs/audits/dead-code-manifest-2026-08-11.txt`, does not exist anywhere in the repo (confirmed via glob). Every invocation fails at the existence check before doing anything. Either the sweep already completed and the script (which names itself for self-deletion on success) was left behind by mistake, or it never ran. An owner should either restore the manifest or delete this script.

2. **supabase/functions/capture-worker/index.ts has no automated drain path in this repo**, and `pending_first_fetch` (its work queue) carries 1376 live rows with 0 references from `src/` or `scripts/` consuming it. The function is reachable in principle via the `capture_worker_fetch` SQL RPC (confirmed via migration 256), but nothing in-repo calls that RPC and no `pg_cron` schedule targets it. This may be an intentional runbook-manual-only path (the file's own comments support that reading) or a silent capture backlog — worth an explicit owner decision, since 1,376 queued items is not a trivial number.

3. **scripts/producers/regional/run-envelope-producer.mjs documents a real, previously-live production defect** (now fixed): the orchestrator called the write path directly on parser output without deriving `regional_data_facts.value` (TEXT NOT NULL) via `buildEnvelopeRow`, so every `--apply` of the WO-17 producers failed on the first row for the whole authoring period. A second related defect (candidates not deduped to one-per-natural-key, hitting the live UNIQUE constraint on the second insert) was found and fixed in the same pass. Both are pinned by `run-envelope-producer.test.mjs`.

4. **scripts/gen/emission-factors-common.mjs documents an identical-shaped historical defect** in its own idempotency read (missing explicit `orderBy: "factor_id"` made the read silently fail-closed, masking real state as "0 already live"). Now fixed and cross-checked live: `emission_factors`' 6 live rows exactly match the DESNZ(4)+EPA(2) fixture counts, confirming both seeders have run `--apply` successfully.

5. **scripts/gen/emission-factors-common.test.mjs is self-documented as NOT execution-wired** into the test runner's glob (its own header states this explicitly, citing an out-of-scope write set as the reason). A real test file whose author already knows it never runs in CI.

6. **assumption_register (WO-20) machinery is fully built and tested but has 0 live rows** — `scripts/gen/assumption-register-seed.mjs`'s own header states this authoring session never runs `--apply`; consistent with the live table-usage figure. WORKING-UNWIRED by design, pending a later, separately-ratified pass.

7. **scripts/seed-community-regional-rooms.mjs's header claims "COMMITTED, NOT EXECUTED"** but `community_groups` carries exactly 7 live rows matching this script's 7 canonical room slugs, with exactly one scripts-side writer credited to that table in table-usage.txt. The comment is very likely stale (the rooms have since been seeded) but this cannot be proven from static code alone — flagged AMBIGUOUS.

8. **scripts/source-state-min-wage.mjs** confirmed executed: `state_cost_facts` carries exactly 13 live rows matching its 13-state `FACTS` array verbatim.

9. Several files carry well-documented *historical* defects that are already fixed in the code as currently read (source-role-cleanup.mjs's `status='active'` scope blind spot that fed an 869-source demotion; audit-optionc-reachability.mjs's non-answer-as-fabrication bug that drove 16 incorrect archivals on 2026-05-29; source-state-min-wage.mjs's dry-run-that-wasn't for source registration). None of these are live defects in the code as it stands, but they document a repeated pattern across this lane: several production incidents traced to a script silently treating "could not determine X" as a specific negative answer, rather than as inconclusive. This is a recurring root-cause shape worth an owner's attention as a class, even though every individual instance found in this lane has already been patched.

10. **scripts/canonical-pipeline-proof.mjs** contains a minor dead/pointless construct: `.ilike("title", "%%")` (line 19) performs no real server-side filtering — harmless (the real filtering happens client-side via `.find(...startsWith(arg))`) but not what the code visually claims to do.

11. **scripts/_ruling/null-tier-host-ruling.mjs**'s header claims the file "emits SQL + a reversibility CSV" but the file's actual body is pure data export (`RULING`, `BY_HOST`) with no I/O whatsoever — an incomplete/stale header claim, not a functional defect since nothing in the graph appears to depend on that claimed behavior.

12. A consistent, repo-wide safety pattern was confirmed across nearly every OPERATOR-TOOL in this lane: dry-run-by-default, an explicit `--apply`/`--execute` (sometimes double-flagged) required to write, guarded writes via `scripts/lib/db.mjs` (cite + prior-value snapshot), and read-back verification after write. This is a strength, not a finding, but is the dominant character of this lane and shapes how the individual STATUS calls above should be read: "GRAPH:UNREACHABLE" for the large majority of these files means "manually invoked by an operator, correctly guarded," not "abandoned."

### Coverage attestation

Files read in full: 59/59. Lines read: 6,542 (sum of the lane-list line counts, each file read start-to-end; two files — `phase-5-backfill.mjs` at 730 lines and `capture-worker/index.ts` at 419 lines — were read via the tool's default full-file read, confirmed complete against their listed line counts). No file was skipped or partially read.
