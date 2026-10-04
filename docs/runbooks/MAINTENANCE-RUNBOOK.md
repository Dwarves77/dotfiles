# Maintenance runtime runbook

To add a maintenance step, add ONE new file under `maintenance.d/` (named `NN-<step-name>.md`, starting with its own numbered step heading) and ONE line to the step index below; do not append to this file or to another step's file.

The dispatch-only runtime for the coordinator-only applies `docs/plans/finish-plan-2026-09-02.md`'s
MAINT paragraph names, one section per step below, in dispatch order, added as each was built
dry-by-default with no runtime to run it from. The section list grows as new MAINT steps land; do not
assume a fixed count, read the numbered headings below for the current set.
Workflow: `.github/workflows/maintenance.yml`. Modeled on `.github/workflows/producers.yml` (secrets
verification, `mode` choice, per-step gating, population BEFORE/AFTER, artifact upload) and
`.github/workflows/population-turn.yml` (dispatch-only, no schedule). Every wrapper lives under
`fsi-app/scripts/maintenance/` and writes a `summary.json` into its own out-dir on every run.

## How to dispatch

Actions tab → **Maintenance** → Run workflow. Three inputs:

- **mode** — `dry` (default; reads/plans, writes nothing) or `apply` (writes through the guarded path
  in `fsi-app/scripts/lib/db.mjs`, when the step makes any write at all).
- **step** — one of the names below (see the numbered section headings for the current list), or `all`
  (fans out every step in one dispatch, **dry only** — the workflow refuses `all` with `apply`; a single
  dispatch cannot carry every step's own ruling's worth of `arg` tokens, and naming one step per apply
  is the point).
- **arg** — optional per-step argument; several steps *require* an exact value in `apply` mode (a
  ruling-acceptance token, an archive/park choice, or a comma-separated id list). Named per step below.

**Secrets** (repository secrets, verified at the top of every run, same pair every guarded script
already requires): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**Artifact**: `maintenance-<step>-<run_id>` (or `maintenance-all-<run_id>` for a dry `all` run),
containing one `<step>/summary.json` per step that ran — `{ step, mode, counts, applied, read_back,
... }`. Read every artifact against the live table it claims to have changed before the next dispatch
(finish-plan-2026-09-02.md §4) — the sections below name what to read back for each step.

## Cache flush after apply (CAP-1000, 2026-09-05)

**Every apply-mode dispatch of this workflow ends with one more step: "Flush public/detail caches after
a real apply."** It runs whenever `mode=apply` (any step, `always()` so a failure earlier in the job does
not skip it), and calls `scripts/lib/revalidate.mjs`'s own CLI —

```
node scripts/lib/revalidate.mjs --apply app-data public-items regulations-detail market-detail operations-detail research-detail
```

— flushing `APP_DATA_TAG` (the org-scoped index ledgers), `PUBLIC_ITEMS_TAG` (the public, org-independent
`/regulations` `/market` `/operations` `/research` index reads, ADR-026's PERF-10 addendum), and all four
coarse `<surface>-detail` tags (every item-scoped detail-page cache, ADR-026's own subject). It needs
`APP_URL` + `WORKER_SECRET` (repository secrets, same pair `change-detection.yml` already uses) — with
either unset it logs "skipped (no APP_URL/WORKER_SECRET)" and exits clean; the run's own dry/apply outcome
is never affected by this step (`|| true`). The 60s (`APP_DATA_TAG` consumers)/300s (detail cache)/6h
(`PUBLIC_ITEMS_REVALIDATE_SECONDS`) backstops still bound staleness on top of this, but this step is what
makes a real apply visible on the public site within seconds instead of waiting for those backstops.

**WHY EVERY STEP, not just the ones that obviously touch a public table**: revalidation is a property of
every apply that writes a row a public cache reads, not a property of `apply-mint-batch.mjs`'s own mint
path alone (that script already had its own in-process flush, unconditionally, since PERF-10 — this
workflow-level step is the SAME mechanism reused for every OTHER apply that never routed through it).
`revalidateTag` is idempotent and cheap; flushing on a step that turns out not to have touched a
public-visible table costs nothing, while missing one serves stale data for up to
`PUBLIC_ITEMS_REVALIDATE_SECONDS` (6h) with zero signal — exactly what happened on Maintenance #47
(`forward-events-retext` apply, 01:20 UTC 2026-09-05: 331 forward events + 331 obligations deleted;
`/regulations` still served the pre-cleanup register at 01:35). See `docs/decisions/
ADR-026-detail-cache-and-viewer-state-split.md`'s CAP-1000 addendum for the full defect history, and this
lane's REPORT for the audit of every `.limit()`/full-table-read site that motivated it.

**The same step (same CLI, same tags) was added to `corpus-turn.yml`, `propagation-drain.yml`,
`producers.yml`, and `population-turn.yml`** — every workflow whose apply-mode jobs write
`intelligence_items`/`obligations`/`item_forward_events`/`market_series`/`entities`/`derived_values`.
`source-sweep.yml` (writes only `portal_link_candidates`) and `ledger-consume.yml` (writes only
`census_worklist`) do NOT carry this step — neither table is read by a cache this ADR or PERF-10 governs.

## Harness-run artifact and dispatch-ledger row (lane M9b, 2026-09-18)

Closing stage-audit-2026-09-18 `s6-gates-harness.md`'s finding: three mechanisms that record whether a
maintenance dispatch ran were themselves not running -- the dispatch ledger stopped being hand-appended
2026-09-07, this family's own runs were recorded only as the 90-day ephemeral `upload-artifact` step
above (never git history), and `closure-gate.mjs` no longer finished inside a short local budget. All three
are fixed this lane:

1. **Committed harness-run artifact.** Every dispatch now ALSO writes and commits
   `scripts/harness-runs/maintenance/maintenance-run-NNN.json` (`scripts/maintenance/write-run-artifact.mjs`,
   claiming the next run number and hashing `harness_version` against `../.github/workflows/maintenance.yml`
   + `scripts/maintenance/lib/cli.mjs`, the family's own governing files per
   `scripts/harness-runs/governing-files.mjs`) plus a `traces/maintenance-run-NNN.summaries.json` companion
   consolidating every step's own `summary.json` this run produced -- the full trace CONVENTION.md's schema
   requires, never only inlined. This is IN ADDITION TO the `upload-artifact` step above, not instead of it.
   The family is registered in `ALLOWED_FAMILIES` (`scripts/lib/run-artifact.mjs`), `GOVERNING_FILES`
   (`scripts/harness-runs/governing-files.mjs`) and `CONVENTION.md`'s table; its first-run marker is
   `scripts/harness-runs/maintenance/PENDING-RUN.md` (F28 rule (b)) until the coordinator's next dispatch
   lands `maintenance-run-001.json`.
2. **Machine-appended dispatch ledger.** The workflow's own final steps now append one row to
   `docs/ops/dispatch-ledger.jsonl` per dispatch (`scripts/harness-runs/append-dispatch-ledger.mjs`, a pure
   row builder + unit-tested append) and commit it alongside the harness-run artifact -- the SAME
   branch-plus-PR mechanism `source-sweep.yml`/`corpus-turn.yml` already use
   (`scripts/turns/deliver-artifact-branch.sh`), copied here, not reimplemented. **The hand procedure this
   runbook and `docs/doctrine/closure-gate.md` described (the coordinator appends a row per dispatch) is
   SUPERSEDED for the `maintenance` workflow specifically** -- every other dispatchable workflow
   (source-sweep, ledger-consume, population-turn, corpus-turn, downstream-chain, propagation-drain) still
   needs it hand-appended until each gets the same treatment. `docs/ops/dispatch-ledger.jsonl` carries one
   marker row (`{"date":"2026-09-18","note":"machine-appended from this date; 2026-09-07 to 2026-09-17 not
   recorded (see stage-audit-2026-09-18 s6)"}`) rather than a backfill of the 11-day gap (2026-09-07 to
   2026-09-17, 24 maintenance steps landed in that window per the audit) -- those runs are not retroactively
   fabricated evidence.
3. **Closure gate performance.** `.discipline/governance/closure-gate.mjs`'s `gatherNeverRunTargets` used
   to spawn one `git merge-base --is-ancestor` per (target, train) pair (linear scan) and one
   `git log -S<literal>` pickaxe search per maintenance step (62 separate spawns against the same file) --
   measured before this lane: did not finish inside two prior audit attempts' wall-clock budgets. Fixed at
   its cause, not with a bigger timeout: `trainOf()` now binary-searches the (monotonic, by construction)
   ascending train list and memoizes by commit hash within a run; the 62 pickaxe searches and the ~19
   per-other-workflow `--diff-filter=A` searches are each replaced by ONE batched `git log -p` /
   `git log --diff-filter=A --name-only` scan, parsed in memory. Measured, this lane, same tree: the LIVE
   NEVER-RUN test alone went from >90s (two attempts, did not finish) to ~8s; the full
   `closure-gate.test.mjs` (34 tests, all four checks plus the combined gate) now completes in ~11s. The
   gate's checks and allowlists are unchanged -- this is a performance fix only, not a behavior change (see
   `closure-gate.mjs`'s own inline comments at `trainOf`/`buildIntroducingCommitIndex` for the full
   reasoning and the monotonicity argument the binary search depends on).

---

## Step index

One line per step, in dispatch order. The step text lives in its own file.

- [1. `community-topics-seed`, RETIRED (Lane REVIEW-WIRE, 2026-09-04)](maintenance.d/01-community-topics-seed.md)
- [2. `tier-opinions`](maintenance.d/02-tier-opinions.md)
- [3. `w1-dispositions`](maintenance.d/03-w1-dispositions.md)
- [4. `origin-class-backfill`](maintenance.d/04-origin-class-backfill.md)
- [4a. `source-type-backfill`](maintenance.d/04a-source-type-backfill.md)
- [4b. `derive-obligations`](maintenance.d/04b-derive-obligations.md)
- [4c. `seed-corridors`](maintenance.d/04c-seed-corridors.md)
- [5. `census-off-vertical`](maintenance.d/05-census-off-vertical.md)
- [6. `review-digests`](maintenance.d/06-review-digests.md)
- [6a. `tag-proposals`](maintenance.d/06a-tag-proposals.md)
- [7. `tag-ratification`](maintenance.d/07-tag-ratification.md)
- [8. `provenance-heal`](maintenance.d/08-provenance-heal.md)
- [8a. `institution-canonicalize`](maintenance.d/08a-institution-canonicalize.md)
- [8b. `attach-found-sources`](maintenance.d/08b-attach-found-sources.md)
- [9. `reopen-validation-holds`](maintenance.d/09-reopen-validation-holds.md)
- [10. `record-hollow-sweep`](maintenance.d/10-record-hollow-sweep.md)
- [11. `canonical-key-dedup`](maintenance.d/11-canonical-key-dedup.md)
- [12. `forward-events-retext`](maintenance.d/12-forward-events-retext.md)
- [13. `review-apply-provisional-sources`](maintenance.d/13-review-apply-provisional-sources.md)
- [14. `review-apply-canonical-candidates`](maintenance.d/14-review-apply-canonical-candidates.md)
- [15. `review-apply-portal-links`](maintenance.d/15-review-apply-portal-links.md)
- [16. `review-apply-coverage-gaps`](maintenance.d/16-review-apply-coverage-gaps.md)
- [17. `apply-classifications`](maintenance.d/17-apply-classifications.md)
- [18. `seed-benchmark-instruments` (REMOVED, ADR-042)](maintenance.d/18-seed-benchmark-instruments.md)
- [19. `spec09-reroute`](maintenance.d/19-spec09-reroute.md)
- [20. `spec09-grid-queue`](maintenance.d/20-spec09-grid-queue.md)
- [21. `spec09-oem-roadmap`](maintenance.d/21-spec09-oem-roadmap.md)
- [22. `propose-classifications`](maintenance.d/22-propose-classifications.md)
- [23. `generate-theme-brief`](maintenance.d/23-generate-theme-brief.md)
- [24. `ratify-flag-to-census`](maintenance.d/24-ratify-flag-to-census.md)
- [25. `assumption-register-seed`](maintenance.d/25-assumption-register-seed.md)
- [26. `backfill-lineage-edges`](maintenance.d/26-backfill-lineage-edges.md)
- [27. `screen-worklist`](maintenance.d/27-screen-worklist.md)
- [28. `verification-audit-report`](maintenance.d/28-verification-audit-report.md)
- [29. `spec09-surcharge-audit-csv` (REMOVED, ADR-042)](maintenance.d/29-spec09-surcharge-audit-csv.md)
- [30. `spec09-dqi-csv` (REMOVED, ADR-042)](maintenance.d/30-spec09-dqi-csv.md)
- [31. `spec09-auxiliary-energy-csv`](maintenance.d/31-spec09-auxiliary-energy-csv.md)
- [32. `spec09-indexation-csv`](maintenance.d/32-spec09-indexation-csv.md)
- [33. `tier-opinions` / `derive-obligations` / `tag-proposals` / `apply-classifications`, also chained automatically](maintenance.d/33-chained-automatically.md)
- [34. `regen-quarantined`](maintenance.d/34-regen-quarantined.md)
- [35. `close-acquire-primaries-holds` (supersedes the retired `acquire-primaries` step)](maintenance.d/35-close-acquire-primaries-holds.md)
- [36. `refetch-capped`](maintenance.d/36-refetch-capped.md)
- [37. `source-role-cleanup`](maintenance.d/37-source-role-cleanup.md)
- [38. `canonical-autoverify`](maintenance.d/38-canonical-autoverify.md)
- [39. `remediate-orphan-sources`](maintenance.d/39-remediate-orphan-sources.md)
- [40. `timeline-backfill`](maintenance.d/40-timeline-backfill.md)
- [41. `close-run-logs`](maintenance.d/41-close-run-logs.md)
- [42. `resolve-error-body-gate`](maintenance.d/42-resolve-error-body-gate.md)
- [43. `resolve-cited-host-gate`](maintenance.d/43-resolve-cited-host-gate.md)
- [44. `uk-series-code-reconcile`](maintenance.d/44-uk-series-code-reconcile.md)
- [45. `resolve-signals`](maintenance.d/45-resolve-signals.md)
- [46. `resolve-provisional-sources`](maintenance.d/46-resolve-provisional-sources.md)
- [46a. `enumerate-unclassified-hosts`](maintenance.d/46a-enumerate-unclassified-hosts.md)
- [47. `finish-staged-updates`](maintenance.d/47-finish-staged-updates.md)
- [48. `schema-vocabulary-inventory`](maintenance.d/48-schema-vocabulary-inventory.md)
- [49. `resolve-refetch-holds`](maintenance.d/49-resolve-refetch-holds.md)
- [50. `close-coverage-reflections`](maintenance.d/50-close-coverage-reflections.md)
- [51. `close-legal-confirmation-rows`](maintenance.d/51-close-legal-confirmation-rows.md)
- [52. `close-flags-for-verified-items`](maintenance.d/52-close-flags-for-verified-items.md)
- [56. `capture-static-primaries`](maintenance.d/56-capture-static-primaries.md)
- [57. Disk IO budget: apply ceiling, cooldown, restart](maintenance.d/57-disk-io-budget.md)
- [58. `recompute-tiers`](maintenance.d/58-recompute-tiers.md)
- [Appendix: `holdings-audit`, wired via the data-audit lane, not this runtime](maintenance.d/A1-holdings-audit.md)
- [Appendix: three more scripts/verify/ checks wired via the data-audit lane (lane F25-WAVE52, 2026-09-07)](maintenance.d/A2-verify-checks-wired-via-data-audit-lane.md)
- [Appendix: `check-vocabulary-drift`, wired via the data-audit lane (lane w9-d5-d7, D7 part 3, 2026-09-12)](maintenance.d/A3-check-vocabulary-drift.md)
- [Appendix: F51 check 5, the hotspot standing number (`.discipline/fitness/functions/F51-no-shared-append.mjs`, lane F51b, 2026-09-20, second occurrence)](maintenance.d/A4-f51-hotspot-standing-number.md)
