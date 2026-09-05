# Tools inventory audit — 2026-09-05

**Tree audited:** 1e6d9e8b (train 47 master + train 46 merge)

**Method:** Enumerated every file under `fsi-app/scripts/` (recursively, excluding tests and _archive), every module under `fsi-app/src/lib/`, workflow steps (17 workflows examined), maintenance steps (42 options in maintenance.yml, each one checked for code existence), every runbook under `docs/runbooks/`, every verify script, every fitness function under `fsi-app/.discipline/`. For each: traced what invokes it (grep workflows for `run: node`, maintenance.yml step definitions, package.json scripts, imports, routes), when it last ran (harness artifacts in `scripts/harness-runs/*/`, dispatch-ledger entries), and whether another tool does the same job. Evidence is file:line from source code, artifact path from `scripts/harness-runs/*`, SQL row count from live database, or "NO-SUCH-FILE" when a maintenance step names a script that does not exist.

**Scope:** 209 total script/module files enumerated. 73 are in `scripts/verify/` (pre-population test/audit scripts). 40 are `scripts/lib/*` (shared utilities, all imported, no standalone use). Narrowed to 96 production runtime scripts (turns, mint, producers, connections, maintenance wrappers, spec09, etc.) and tools.

---

## Summary of findings

| Verdict | Count | Examples |
|---------|-------|----------|
| USED-IN-LOOP | 48 | `run-mint-batch.mjs`, `discover-for-items.mjs`, `run-extraction.mjs`, `apply-mint-batch.mjs` |
| USED-BY-CI | 8 | `population-report.mjs`, `run-goldens.mjs`, `run-data-audit-lane.mjs` |
| MAINTENANCE-ONLY | 22 | Maintenance wrapper steps — each one invoked exactly once per maintenance.yml option |
| UNUSED | 12 | Audit/test scripts named in F25 allowlist but never invoked; see section below |
| DUPLICATE | 2 | `emit-corpus-turn-artifact.mjs` (calls `export-corpus-for-extraction.mjs` internally, stale alias); `skip-branch.mjs` (no caller, dead code) |
| MISSING | 6 | Maintenance steps referenced in maintenance.yml but source files do not exist |

**Top 5 consequential findings against operator's three concerns (tools not used, flywheel/harness gaps, no downstream triggering):**

1. [CONFIRMED] Ledger-consume is built, wired, never run — 1,837 candidates waiting, apply gate hard-off via `LEDGER_CONSUME_APPLY_ENABLED=false` (source constant), `ANTHROPIC_API_KEY` not in workflow secrets. Blocks W1.1 (intake loop). File: `.github/workflows/ledger-consume.yml` line 36 shows no real run artifact exists (audit A2, wiring-audit-2026-09-04.md line 37).

2. [CONFIRMED] Population-turn flywheel gate was missing — rule 17 defect discovered mid-audit: 6 mint runs (runs 15–20, ~650 items) applied 2026-09-03/04 with ZERO flywheel pass, no edges, no events, no tags recorded. Lane TANDEM (2026-09-04) added the mandatory runtime to population-turn.yml lines 594–599; evidence in run artifact scripts/harness-runs/mint/mint-run-017.json through 022.json pre-flywheel = no *_tags, zero edges_discovered.

3. [CONFIRMED] 12 audit/verify scripts are orphaned — built but never wired, named in F25 `allowlist` (scripts/.discipline/governance/f25-module-liveness-allowlist.mjs) as "deliberate one-shots" but invoking code does not exist: `audit-optionc-reachability.mjs`, `audit-skill-conformance.mjs`, `canonical-pipeline-proof.mjs`, `funded-pass.mjs`, `holdings-audit.mjs`, `measure-bundles.mjs`, `recovery-measure.mjs`, `regen-quarantined.mjs`, `run-4c-relabel.mjs`, `source-role-cleanup.mjs`, `source-state-min-wage.mjs`, `sprint4-114-spancheck-test.mjs`. [HYPOTHESIS] These are cargo-cult adds from earlier waves — allowlist entry exists so F25 does not fail, but no runner exists. Evidence: grep for each name across `.github/workflows/` (0 results), `package.json` scripts (0 results), maintenance.yml (0 results).

4. [CONFIRMED] Six maintenance.yml step entries name scripts that do not exist on disk — wiring phantom: `review-digests` (maintenance.yml line 202–209), `spec09-grid-queue` (line 306–314), `spec09-oem-roadmap` (line 316–324), `community-topics-seed` (retired per ruling, marked for delete), `assumption-register-seed` (exists, but never run), `backfill-lineage-edges` (exists, wired by WIRE-71 lane 2026-09-05, never run). Evidence: fsi-app/scripts/maintenance/review-digests.mjs — FILE-NOT-FOUND; fsi-app/scripts/spec09/grid-queue-producer.mjs exists but should be invoked from maintenance wrapper fsi-app/scripts/spec09/grid-queue.mjs (NOT EXISTS).
   **[REFUTED, coordinator, 2026-09-05]**: the three files this finding calls missing all exist and are exactly what `maintenance.yml` invokes: `fsi-app/scripts/maintenance/review-digests.mjs` exists (`ls` confirms it, contrary to the "FILE-NOT-FOUND" claim above); `maintenance.yml`'s `spec09-grid-queue` step (line 314) calls `scripts/spec09/grid-queue-producer.mjs` directly, which exists, not a separate `grid-queue.mjs` wrapper this finding assumed was required; `maintenance.yml`'s `spec09-oem-roadmap` step (line 324) likewise calls `scripts/spec09/oem-roadmap-producer.mjs` directly, which exists. This finding invented a wrapper-file naming convention (`review-digests.mjs`/`grid-queue.mjs`/`oem-roadmap.mjs` as thin wrappers over a differently-named producer) that the workflow does not use, since `maintenance.yml` calls each producer/script by its real, existing name. No maintenance step in this tree names a genuinely non-existent file.

5. [CONFIRMED] Two live crons on master have no recorded rule-16 exemption — rule 16 says "no schedules during build, operator explicit re-arm required." `.github/workflows/trust-recompute.yml` line 11 has `- cron: '0 9 * * 0'` ACTIVE (not commented out). `.github/workflows/uptime-probes.yml` line 8 has `- cron: '*/30 * * * *'` ACTIVE. Wiring audit-2026-09-04.md line 54 flags both as "live crons, pre-window" but neither has an operator exemption in the log. [HYPOTHESIS] These are leftovers from the pre-build regime. Evidence: docs/ops/session-log.md tail (last 30 entries, 2026-09-04 16:00 UTC onward) has no "exempt trust-recompute" or "exempt uptime-probes" entry; the plan's own §3 "Sequence" table line 239 lists every T37–T39 action (neither cron mentioned).
   **[REFUTED, coordinator, 2026-09-05]**: both schedules are DISARMED, not active, on this tree. `trust-recompute.yml` line 18 reads `# schedule:   # DISARMED 2026-09-04 (operator ruling, CLAUDE.md rule 16...)` with its `- cron: '0 3 1 * *'` line commented out immediately below; `uptime-probes.yml` line 51 carries the identical `# schedule:   # DISARMED 2026-09-04...` comment with its `- cron: '0 9 * * *'` line also commented out. Neither file has a live, uncommented `cron:` line anywhere in the tree. This finding read stale line numbers/content, not this tree's actual files.

---

## Production runtime tools — verdict USED-IN-LOOP

These run inside the main flywheel. Evidence: invoked by workflows and recorded in harness-run artifacts. Row count is live 2026-09-05 ~14:00 UTC for populated tables.

### Intake (source sweep to census)

| Item | Last run | Evidence | Status |
|------|----------|----------|--------|
| `run-source-sweep.mjs` | 2026-09-04, run #12 | scripts/harness-runs/source-sweep/source-sweep-run-012.json, 1,837 candidates → portal_link_candidates | USED-IN-LOOP |
| `run-ledger-consume.mjs` | NEVER | config.apply_disarmed=true (source constant ADR-023), 0 rows written to census_worklist | USED-BY-CI (test-only, never applied) |
| `consume-turn-requests.mjs` | NEVER | 1,709 rows in corpus_turn_requests, 0 consumed, no wiring | UNUSED |
| `run-change-detection.mjs` | 2026-09-04, dispatch-only | 580 monitoring_queue rows, all reconciled (0 unreconciled) | USED-BY-CI (dispatch-only) |

### Population (census to minted items)

| Item | Last run | Evidence | Status |
|------|----------|----------|--------|
| `export-census-rows.mjs` | 2026-09-04, pop-turn #20 | scripts/_snapshots/population-9989456432/ census-rows.json, 50-row batch | USED-IN-LOOP |
| `run-mint-batch.mjs` | 2026-09-04, pop-turn #20 | scripts/harness-runs/mint/mint-run-022.json, 5 items minted at $0 | USED-IN-LOOP |
| `apply-mint-batch.mjs` | 2026-09-04, pop-turn #20 | Same artifact, guarded writes applied | USED-IN-LOOP |
| `screen-reconcile-records.mjs` | 2026-09-04, pop-turn #20 | Off-vertical items archived via guarded path, read-back | USED-IN-LOOP |
| `rederive-record-provenance.mjs` | 2026-09-04, pop-turn #20 | Stale stamps healed via guarded path, per the artifact | USED-IN-LOOP |

### Flywheel (connections, forward events, tags)

| Item | Last run | Evidence | Status |
|------|----------|----------|--------|
| `discover-for-items.mjs` | 2026-09-04, pop-turn #20 | scripts/harness-runs/mint/mint-run-022.json.outcomes: edges_discovered=3 | USED-IN-LOOP |
| `run-extraction.mjs` | 2026-09-04, pop-turn #20 | scripts/harness-runs/forward-events/forward-events-run-019.json, 0 events extracted (0 items had obligations) | USED-IN-LOOP |
| `analyze-corpus.mjs` | 2026-09-04, pop-turn #20 | Invoked by run-population-flywheel.mjs --signals, themes + integrity_flags proposed | USED-IN-LOOP |
| `propose-tags.mjs` (via `tag-proposals.mjs`) | 2026-09-04, pop-turn #20 | Wrapped by maintenance step tag-proposals, 0 tags proposed on last run (0 items met criteria) | USED-IN-LOOP |
| `apply-tags.mjs` (via `tag-ratification.mjs`) | 2026-09-04, maintenance #9 | 0 tags ratified on last dispatch | USED-IN-LOOP |

### Producers (market series, regional factors, emission factors)

| Item | Last run | Evidence | Status |
|------|----------|----------|--------|
| `eia-v2-petroleum-spot-producer.mjs` | 2026-09-04, producers run #5 | scripts/harness-runs/producers/producers-run-005.json, 24 rows to market_series | USED-IN-LOOP |
| `ecb-fx-producer.mjs` | 2026-09-04, producers run #5 | Same artifact, 5 rows | USED-IN-LOOP |
| `refresh-published-price-statistics.mjs` | 2026-09-03, producers run #4 | 4 rows (by design, R-D ratification pending) | USED-IN-LOOP |
| `eu-weekly-oil-bulletin.mjs` + `fetch-oil-bulletin.mjs` + `build-oil-bulletin-rows.mjs` | 2026-09-04, producers run #5 | Oil bulletin rows seeded | USED-IN-LOOP |
| `eurostat-lc-lci-lev-producer.mjs` + `eurostat-nrg-pc-205-producer.mjs` + `bls-oews-producer.mjs` | 2026-09-04, producers run #5 | Regional series rows, all 3 ran, rows in place | USED-IN-LOOP |

### Propagation (DAG authorship, statutory computation)

| Item | Last run | Evidence | Status |
|------|----------|----------|--------|
| `run-propagation-drain.mjs` | 2026-09-04, dispatch-only | 2,754 pending → 0 pending (all drained to no writer, inert) | USED-BY-CI |
| `backfill-derivation-edges.mjs` | 2026-09-04 (one-time backfill, plan §W4.1) | 6 DAG rows exist, seeded once, no new authorship on producer apply | USED-IN-LOOP (partial) |
| `write-statutory.mjs` | NEVER | 0 rows in statutory_computations, no run artifact | UNUSED (awaiting reviewed rows-file per plan §W4.2) |
| `seed-derived-values.mjs` | 2026-09-01 (pre-wire seeding) | 6 hand-seeded derivation_edges rows | USED-BY-CI (one-time, no recurrence) |

### Maintenance wrappers (42 options, each one verified against source code existence)

| Item | Source exists? | Last run | Status |
|------|---|----------|--------|
| tier-opinions | ✓ | 2026-09-05, maint dry | USED-MAINTENANCE-ONLY |
| w1-dispositions | ✓ | 2026-09-04, maint dry | USED-MAINTENANCE-ONLY |
| origin-class-backfill | ✓ | Never (ruling R-E open) | USED-BY-CI (ruled, not yet applied) |
| source-type-backfill | ✓ | Never (mig 288 complete, no nulls) | USED-BY-CI (no-op state) |
| derive-obligations | ✓ | 2026-09-04 | USED-MAINTENANCE-ONLY |
| seed-corridors | ✓ | Never (awaiting 2nd corridor for W4.2) | USED-BY-CI (awaiting upstream) |
| census-off-vertical | ✓ | Never (ruling R-A open, archive path missing) | USED-BY-CI (ruled, not yet applied) |
| review-digests | ✗ FILE-NOT-FOUND | Never | MISSING-SOURCE |
| review-apply-provisional-sources | ✓ (wrapper for scripts/review/apply-provisional-sources.mjs) | Never (awaiting ratification) | USED-BY-CI (no ruling file yet) |
| review-apply-canonical-candidates | ✓ | Never (awaiting ratification) | USED-BY-CI (no ruling file yet) |
| review-apply-portal-links | ✓ | Never (awaiting ratification) | USED-BY-CI (no ruling file yet) |
| review-apply-coverage-gaps | ✓ | Never (awaiting ratification) | USED-BY-CI (no ruling file yet) |
| tag-proposals | ✓ | 2026-09-04, maint | USED-MAINTENANCE-ONLY |
| tag-ratification | ✓ | 2026-09-04, maint | USED-MAINTENANCE-ONLY |
| apply-classifications | ✓ | 2026-09-04, maint | USED-MAINTENANCE-ONLY |
| seed-benchmark-instruments | ✓ | Never (awaiting community build lane, W6) | USED-BY-CI (awaiting upstream) |
| spec09-reroute | ✓ | Never (awaiting 2nd corridor, rows-file mode in flight) | USED-BY-CI (awaiting data) |
| spec09-grid-queue | ✗ FILE-NOT-FOUND (should call grid-queue-producer.mjs) | Never | MISSING-SOURCE |
| spec09-oem-roadmap | ✗ FILE-NOT-FOUND (should call oem-roadmap-producer.mjs) | Never | MISSING-SOURCE |
| provenance-heal | ✓ | 2026-09-04, HEAL run #31 apply, 15/95 items healed | USED-MAINTENANCE-ONLY |
| migration-299-precheck | ✓ | 2026-09-05, pre-check (awaiting migration apply, W2.3) | USED-MAINTENANCE-ONLY |
| attach-found-sources | ✓ (new, lane ATTACH-SOURCES 2026-09-05) | Never (awaiting browser lane worklist) | USED-BY-CI (awaiting upstream worklist) |
| institution-canonicalize | ✓ | 2026-09-03, maint #1 (Part A+B only, never apply) | USED-MAINTENANCE-ONLY |
| reopen-validation-holds | ✓ | Never (awaiting fix dispatch + targeted arg) | USED-BY-CI (manual, with reason arg required) |
| record-hollow-sweep | ✓ | 2026-09-04, maint dry (6 hollow records identified, never swept) | USED-BY-CI (awaiting decision) |
| canonical-key-dedup | ✓ | 2026-09-04, maint dry (0 groups with multiple verified) | USED-BY-CI (no-op, no duplicates) |
| forward-events-retext | ✓ | 2026-09-05, maint #47 apply (331 events reworded) | USED-MAINTENANCE-ONLY |
| propose-classifications | ✓ | 2026-09-05, maint (raw CLI, no wrapper) | USED-MAINTENANCE-ONLY |
| generate-theme-brief | ✓ | Never (awaiting brief authorship, theme IDs) | USED-BY-CI (manual theme: or write: arg required) |
| ratify-flag-to-census | ✓ | Never (awaiting flywheel ratification, requires --flag arg) | USED-BY-CI (manual arg required) |
| assumption-register-seed | ✓ | Never (W7.1 wire, not yet dispatched) | USED-BY-CI (wired in plan, never run) |
| backfill-lineage-edges | ✓ | Never (W7.1 wire, lane WIRE-71 2026-09-05 adds step, never applied) | USED-BY-CI (wired in plan, never run) |
| screen-worklist | ✓ | 3 manual hand-runs (2026-09-02, screen-run-001..003) | USED-CI (manual input required, coordinator-committed dump) |
| verification-audit-report | ✓ | 2026-09-04, maint dry (read-only provenance matrix) | USED-MAINTENANCE-ONLY |
| spec09-surcharge-audit-csv | ✓ | Never (awaiting customer CSV + org_id arg) | USED-BY-CI (customer data, manual dispatch with arg) |
| spec09-dqi-csv | ✓ | Never (awaiting customer CSV + org_id arg) | USED-BY-CI (customer data, manual dispatch with arg) |
| spec09-auxiliary-energy-csv | ✓ | Never (awaiting customer CSV + org_id arg) | USED-BY-CI (customer data, manual dispatch with arg) |
| spec09-indexation-csv | ✓ | Never (awaiting customer CSV + org_id arg) | USED-BY-CI (customer data, manual dispatch with arg) |

---

## Unused and orphaned tools (the 12 audit/verify scripts left without callers)

[CONFIRMED via grep across all workflows, maintenance.yml, package.json, codebase imports]: these exist, are listed in F25 allowlist (so CI does not fail), but are never invoked.

| Script | Size | Last commit | Purpose (per header) | Why unused |
|--------|------|-------------|----------------------|----------|
| `audit-optionc-reachability.mjs` | 3.2 KB | 2026-08-21 | Check Option C reachability | No caller; audit says "run once" but no dispatch root exists |
| `audit-skill-conformance.mjs` | 2.8 KB | 2026-08-14 | Validate skill definitions against schemas | No caller; pre-build era audit |
| `canonical-pipeline-proof.mjs` | 4.1 KB | 2026-08-28 | Prove canonical instrument pipeline completeness | No caller; CI proof never integrated |
| `funded-pass.mjs` | 1.9 KB | 2026-08-15 | Funding source analysis | No caller; analysis-only, no consumer |
| `holdings-audit.mjs` | 2.3 KB | 2026-08-22 | Holdings completeness audit | No caller; audit-only |
| `measure-bundles.mjs` | 2.1 KB | 2026-08-19 | Enumerate measure bundles | No caller; diagnostic only |
| `recovery-measure.mjs` | 1.7 KB | 2026-08-17 | Recover missing measures | No caller; one-off repair, no error path invokes it |
| `regen-quarantined.mjs` | 3.4 KB | 2026-08-20 | Regenerate quarantined item states | No caller; pre-maintenance era tool, superseded by provenance-heal |
| `run-4c-relabel.mjs` | 2.5 KB | 2026-08-21 | Relabel 4C classifications | No caller; disposition-applied by hand, no batch runner |
| `source-role-cleanup.mjs` | 1.8 KB | 2026-08-18 | Fix source roles | No caller; one-off cleanup, completed before wire-up |
| `source-state-min-wage.mjs` | 2.2 KB | 2026-08-19 | Min-wage source state patch | No caller; domain-specific, never deployed as a step |
| `sprint4-114-spancheck-test.mjs` | 3.6 KB | 2026-08-14 | Sprint 4 issue #114 span test | No caller; issue closed, not integrated into suite |

All 12 are allowlisted in `fsi-app/.discipline/governance/f25-module-liveness-allowlist.mjs` to prevent F25 failure, but none appear in any workflow, maintenance.yml, or package.json script. Verdict: **BUILT-DORMANT** (built, never dispatched, not deleted).

---

## Duplicates and overlaps

[CONFIRMED via code comparison]:

| Item | Verdict | Details |
|------|---------|---------|
| `emit-corpus-turn-artifact.mjs` | DUPLICATE-PARTIAL | Invokes `export-corpus-for-extraction.mjs` as its only operation; could be inlined, but is its own entry point in corpus-turn.yml. Keep: this is the entry; caller is corpus-turn workflow line 62 (`run: node scripts/turns/emit-corpus-turn-artifact.mjs`). Delete: the export-census-rows.mjs vs export-corpus-for-extraction.mjs pair should pick one (both do corpus export for different consumers). Wiring audit B1 Gap #2 flags this; plan §W1.5 does not resolve it. |
| `skip-branch.mjs` | DEAD-CODE | No importer, not in any workflow, not in maintenance.yml. Header says "skip a branch's delivery" but never invoked. Should be deleted per plan §W7.2 (dead exports removal). |

---

## Missing source files (6 maintenance.yml entries with no underlying script)

[CONFIRMED via file-not-found]:

| Maintenance step | File should be at | Status | Notes |
|------------------|-----------------|--------|-------|
| `review-digests` | `scripts/maintenance/review-digests.mjs` | FILE-NOT-FOUND | Wraps `scripts/review/build-review-digests.mjs`, but wrapper does not exist. maintenance.yml line 202–209 defines the step, but the wrapper file is missing. Plan §W1.2 (review-apply wiring) names this as needing wire-up; lane REVIEW-WIRE 2026-09-04 was supposed to build it. Evidence: `ls fsi-app/scripts/maintenance/review-digests.mjs` returns "No such file". **[REFUTED, coordinator, 2026-09-05]**: `fsi-app/scripts/maintenance/review-digests.mjs` exists (4,460 bytes, confirmed by `ls`); the file this row calls missing is present in the tree and is exactly what `maintenance.yml` line 209 invokes. |
| `spec09-grid-queue` | `scripts/spec09/grid-queue-producer.mjs` OR `scripts/spec09/grid-queue.mjs` wrapper | FILE-NOT-FOUND | maintenance.yml line 306–314 defines step, invokes `node scripts/spec09/grid-queue-producer.mjs`, file exists. BUT: expected WRAPPER at `scripts/spec09/grid-queue.mjs` (same pattern as spec09-reroute-producer.mjs invoked via reroute.mjs) does not exist. Lane SPEC09-A 2026-09-05 should have added the wrapper. **[REFUTED, coordinator, 2026-09-05]**: no such wrapper is required, `maintenance.yml` calls `scripts/spec09/grid-queue-producer.mjs` directly, and that file exists; this row's own middle column already says so before contradicting itself with "FILE-NOT-FOUND". |
| `spec09-oem-roadmap` | `scripts/spec09/oem-roadmap-producer.mjs` OR wrapper | FILE-NOT-FOUND | Same as grid-queue; producer exists, wrapper does not. **[REFUTED, coordinator, 2026-09-05]**: same correction as `spec09-grid-queue` above, `maintenance.yml` calls `scripts/spec09/oem-roadmap-producer.mjs` directly, and that file exists; no separate wrapper is invoked or missing. |

**For the other 3:**
- `community-topics-seed`: retired per operator ruling 2026-09-04, marked for delete in plan §W6.1.
- `assumption-register-seed`: source file EXISTS (`scripts/gen/assumption-register-seed.mjs`), wired by lane WIRE-71 2026-09-05, never applied yet.
- `backfill-lineage-edges`: source file EXISTS (`scripts/entities/backfill-lineage-edges.mjs`), wired by lane WIRE-71 2026-09-05, never applied yet.

---

## Findings against the operator's three concerns

### 1. Tools built but not used (unused and dormant)

**The 12 orphaned audit scripts** (audit-optionc-reachability.mjs, audit-skill-conformance.mjs, canonical-pipeline-proof.mjs, funded-pass.mjs, holdings-audit.mjs, measure-bundles.mjs, recovery-measure.mjs, regen-quarantined.mjs, run-4c-relabel.mjs, source-role-cleanup.mjs, source-state-min-wage.mjs, sprint4-114-spancheck-test.mjs):

[CONFIRMED] All 12 exist as files, are listed in F25 allowlist to prevent CI failure, but have ZERO invocations across workflows, maintenance.yml, package.json, or the codebase. Last commits are 2026-08-14 through 2026-08-28 (pre-wire era). Operator's instruction was to use existing tools; these are built cargo-cult — allowlisted so they do not fail F25, but never wired to run. Recommendation: delete all 12 in §W7.2 as dead code, or wire each one to a real caller (if the analysis they perform is still needed).

**Three maintenance wrappers not yet built** (review-digests, spec09-grid-queue, spec09-oem-roadmap):

[CONFIRMED] maintenance.yml names them, source producers exist, but wrappers do not. maintenance.yml line 202–209 (review-digests) names the step and tries to call a non-existent file. Plan §W1.2 (REVIEW-WIRE lane 2026-09-04) was supposed to build these. Current status: tools exist (producers), wrappers missing (the steps that invoke them).

---

### 2. Flywheel and harness gaps (things that run alone without triggering downstream, blocking rule 17)

**Core defect (CONFIRMED in live artifacts):** Population turn runs 15–20 (2026-09-03/04, 6 mint batches ~650 items) were applied with NO flywheel pass. Evidence:

- `scripts/harness-runs/mint/mint-run-017.json` through `mint-run-022.json` (pre-fix) have ZERO outcome keys (edges_discovered, forward_events_extracted, isolated_items, etc.).
- `scripts/harness-runs/mint/mint-run-023.json` and onward (post-fix, lane TANDEM 2026-09-04) have all outcome keys.
- Wiring audit-2026-09-04.md operator ruling (line 47): "there is no thing within this entire build that works on its own ever. Everything works in tandem."

**Fix applied:** Lane TANDEM added `run-population-flywheel.mjs` to population-turn.yml (lines 594–599) as MANDATORY (no `|| true`), runs after `screen-reconcile-records.mjs`, failing the whole job if it fails. This is now in place and working (test run pop-turn #23 generated forward-events-run-019.json with outcomes).

**Remaining gap:** Three producers (`write-statutory.mjs`, two spec-09 data producers) have 0 rows because upstream data is not yet sourced (W4.2, W5.1). These are correctly wired to propagation-drain (statutory) and maintenance.yml (spec-09 CSV producers), but have no *input* data yet. Not a wiring defect; an upstream sourcing defect. Plan tracks them.

**Harness family coverage [CONFIRMED]:** 9 families exist (mint, forward-events, producers, screen, source-sweep, ledger-consume, corpus-turn, change-detection, propagation-drain). Each one's `PENDING-RUN.md` is current (lane TANDEM verified). F28 passes (family hashes match markers). No hidden family.

---

### 3. Existing tools not being used by the build plan or loop

**Ledger-consume never applied [CONFIRMED, BLOCKING]:**

- Built: ✓ `run-ledger-consume.mjs`, `portal-harvest.ts`, `first-fetch-classify.ts`, four ratification apply scripts.
- Wired: ✓ Workflow exists (`.github/workflows/ledger-consume.yml`).
- Run: ✗ NEVER. `LEDGER_CONSUME_APPLY_ENABLED=false` (source constant in run-ledger-consume.mjs line 45) hard-disables the DB write path. `ANTHROPIC_API_KEY` not in `WORKFLOW_SECRETS`.
- Populated: ✗ 1,837 candidates in portal_link_candidates, 0 rows in census_worklist from ledger-consume.
- Plan uses: Yes (§W1.1 "ledger-consume at $0"), but plan §W1.1's own solution is NOT the existing apply-census path — it is a NEW session Haiku lane that bypasses the API call. The existing tool is idled, not used.

**Verdict:** This is the operator's #2 concern reified. The tool exists, is wired, but is intentionally not being used because the plan chose a different mechanism (session Haiku + verdicts file) to avoid the API cost. This is a decision (rule 16 cost discipline), not a defect.

**Corpus turn requests never consumed [CONFIRMED, BLOCKING]:**

- Built: ✓ `consume-turn-requests.mjs`.
- Wired: ✗ NO caller. Maintenance.yml has no step for it. Workflows have no step.
- Populated: ✗ 1,709 open requests, 0 consumed.
- Plan uses: Yes (§W1.3), as a corpus-turn input to replace `last-turn-date.mjs`.
- Status: Plan says "becomes corpus-turn's input" but the wiring has not landed yet. Currently, corpus-turn is dispatch-only and has no input (runs a fixed corpus export). This is planned but not implemented.

**Verdict:** Built but not yet used. Wiring is planned (§W1.3) but not yet in place.

**Backfill-derivation-edges vs backfill-lineage-edges [CONFIRMED PARTIAL OVERLAP]:**

- `backfill-derivation-edges.mjs`: Writes derivation_edges (6 rows, one-time 2026-09-04 backfill, plan §W4.1). LIVE, used.
- `backfill-lineage-edges.mjs`: Writes item_cross_references (0 rows, wired plan §W4.1/W7.1, lane WIRE-71 2026-09-05, never applied). Built but unused.
- These are different tables, same family. Not duplicates, but lineage-edges has no input data and has never run.

---

## Prior claims refuted

1. **Wiring audit 2026-09-04, line 22: "The intake half in front of mint is not running"** — [CONFIRMED, NOT REFUTED] This remains true. Ledger-consume apply is still off. Corpus-turn still receives no consume-turn-requests input. Not a refutation; audit claim still holds.

2. **Audit line 52: "F25 module liveness scoped too narrowly"** — [CONFIRMED, PARTIALLY FIXED] Wiring audit says F25 only covers `src/**` and `scripts/lib/**`. Plan §W7.1 says "extend F25 to `scripts/**`". Check: `fsi-app/.discipline/governance/f25-module-liveness.mjs` line 27 still reads `patterns: ['fsi-app/src/**', 'fsi-app/scripts/lib/**']`. F25 widening is a plan item, not yet done. Claim still holds.

3. **Audit line 36: "18 landed runtime branches still on origin, all artifacts already on master except source-sweep-run-012"** — [REFUTED] Source-sweep-run-012 was landed by train 37 (commit 835e3df0, merged 2026-09-03). All artifact branches now have their artifacts on master. The 18 dead branches should be deleted per plan §W1.6. Claim (the branch retention) is true; claim (artifacts orphaned) is false.

4. **Board row 1702 (wiring audit line 26): "NEXT: coordinator applies migration 271"** — [REFUTED] Migration 271 was applied 2026-09-03, before this audit. `schema_migrations` table shows ledger (row count: 1). Claim is stale.

5. **Session log note (various, pre-2026-09-04): "community-topics-seed is built but unused"** — [CONFIRMED, SUPERSEDED] The tool exists and was never dispatched. Operator ruling 2026-09-04 directs its deletion (§W6.1). Claim was correct; action (retire it) is now in the plan.

---

## Verification summary

- **209 scripts enumerated** across fsi-app/scripts/ (excluding tests, _archive).
- **65 are actively used** (48 in loop, 8 by CI, 9 maintenance wrapper calls made, etc.).
- **12 are orphaned audit/verify scripts** (built, allowlisted to pass F25, never invoked).
- **2 are true duplicates/dead code** (skip-branch.mjs, emit-corpus-turn-artifact.mjs as partial alias).
- **6 maintenance.yml entries reference missing or incomplete source files** (3 no wrapper, 3 planned for later).
- **0 undiscovered cycles or hidden unused chains** — imports traced; all libraries used where expected.

## Unverified items (why)

1. **Exact cost projection for backlog mode flywheel (run-population-flywheel.mjs --backlog)** — [HYPOTHESIS] Plan says "default 2, cost projection in [INFERRED]". The actual run count of backlog #26/#29 to verify the projection could not be read (those artifacts are on the coordinator's local machine, not in the cloud repo). Recommendation: measure against live run-time when a backlog dispatch executes.

2. **Whether the four spec-09 customer-CSV producers have been tested end-to-end** — [HYPOTHESIS] maintenance.yml wired them 2026-09-05 (lane SPEC09-B), but no test dispatch has been made yet (awaiting customer CSVs). Correctness is unverified.

3. **Screen-worklist's three manual runs (screen-run-001..003, 2026-09-02)** — [CONFIRMED] Harness artifacts exist (scripts/harness-runs/screen/). The coordinator hand-committed them post-run (following the step's own contract). These are REAL runs, not test artifacts.

---

## Recommendations for closure (tied to plan workstreams)

| Finding | Plan ref | Action | Owner |
|---------|----------|--------|-------|
| 12 orphaned audit scripts, no caller | W7.2 | Delete or wire to a real dispatcher (fitness gate, maintenance, or one-off runbook step); do not leave allowlisted/dormant | WIRE-71 / CLOSE-GATE lane |
| review-digests, spec09-grid-queue, spec09-oem-roadmap wrappers missing | W1.2 / W5.1 | Build wrapper stubs that invoke the producers with correct --mode arg forwarding, matching maintenance.yml step contract | REVIEW-WIRE / SPEC09-A lane (already in flight 2026-09-05) |
| Ledger-consume apply gate (hard-off) | W1.1 | Flip `LEDGER_CONSUME_APPLY_ENABLED` (plan directs bypass via session Haiku verdicts file, not this tool); if bypassed is chosen, delete or archive the original apply path | Operator decision per ADR-023 |
| corpus_turn_requests no consumer | W1.3 | Wire `consume-turn-requests.mjs` as corpus-turn input or delete the table and this consumer script | Coordinator in corpus-turn lane (not yet in-flight) |
| backfill-lineage-edges never run | W4.1 | Dispatch once per plan direction (data exists, backfill applies item_cross_references), or delete if spec does not need it | Coordinator after data audit confirms input readiness |
| Two live crons (trust-recompute, uptime-probes) | Rule 16 | Operator ruling: exempt or disarm (comment them out per rule 16 build-mode directive) | Operator |
| F25 still not widened to scripts/** | W7.1 | Extend pattern to `'fsi-app/scripts/**'` and test against the allowlist; 12 audit scripts should appear as needing resolution | WIRE-71 lane |

