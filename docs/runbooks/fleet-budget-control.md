# Runbook: Fleet budget control and the halt switch

Created 2026-08-07 after the token-usage audit. Governs the 15 recurring Caro's Ledge
scheduled workers (12 authorship shards, citation harvest, legacy remediation,
short-summary convention sweep).

## Why this exists

Between 2026-08-01 and 2026-08-02 the fleet ran hourly and, together with the
orchestration session that monitored it, consumed a full weekly token budget in two
days. A second top-up was consumed in roughly four hours. Root cause was not any single
worker: it was firing frequency multiplied by a fixed per-firing startup cost, plus an
orchestration session whose context was re-billed on every turn.

The fleet had no awareness of remaining budget. It fired on schedule regardless, which is
what turned an overspend into an outage. This runbook is the fix.

## The halt switch

There is exactly one control for the whole fleet. It is a row in `integrity_flags`,
reusing the same convention as the Layer C data-audit block (see
`fsi-app/src/lib/agent/audit-gate.ts`), so no new table and no DDL is involved.

Shape: `category='workflow_gap'`, `subject_type='system'`,
`subject_ref='fleet-budget-halt'`, `status='open'`.

Every worker charter begins with STEP 0 (a), which runs:

```sql
SELECT id FROM integrity_flags
WHERE subject_ref='fleet-budget-halt' AND status='open' LIMIT 1;
```

If that returns any row the worker stops immediately, does no work, and reports one line.
The charter states that this check overrides every other instruction it contains,
including any instruction to continue or re-arm.

### Halt the fleet

```sql
INSERT INTO integrity_flags (category, subject_type, subject_ref, description, status, created_by)
VALUES ('workflow_gap','system','fleet-budget-halt','Halted <date>: <reason>','open','operator-budget-control');
```

### Release the fleet

```sql
UPDATE integrity_flags SET status='resolved'
WHERE subject_ref='fleet-budget-halt' AND status='open';
```

Releasing is a deliberate act. Time alone never clears it, matching the waiver doctrine in
`audit-gate-core.mjs`.

## Two independent layers

Pausing the scheduled tasks and the halt row are separate protections and both are
currently engaged. Re-enabling the tasks does **not** restart work while the halt row is
open. Both must be cleared for the fleet to run, which is deliberate: it makes an
accidental restart impossible through any single action.

## Current cadence

| Worker | Cron | Firings/day |
|---|---|---|
| authorship shards 0-11 | `<2..57> */6 * * *` | 4 each, 48 total |
| citation harvest | `35 3 * * *` | 1 |
| legacy remediation | `15 4 * * *` | 1 |
| short-summary sweep | `50 5 * * *` | 1 |

Total 51 firings/day, down from 360 under the previous hourly schedule, an 86 percent
reduction in session startups.

Note the previous `:07` collision between authorship shard 1 and citation harvest is
resolved by moving citation harvest to a daily slot. Shard 1's cron minute was left
unchanged, per the operator's earlier ruling against moving it.

## Charter cost rules

Two rules are now written into the charters themselves:

1. **No unbounded reads.** Orientation queries carry explicit `LIMIT` clauses. The
   previous `read recent integrity_flags run-logs and codified ruling precedents` had no
   bound and scanned a table that had grown past 1,400 open rows.
2. **No full template read.** Workers read only the 15-section skeleton via
   `left(content_md,240)`, not the full template item. The full read cost about 11,900
   tokens per firing and, at 12 shards firing hourly, about 3.4M tokens per day for
   information that never changed.

## Before re-enabling

Re-enable **one** shard for **one** firing, then read the usage dashboard to get a real
per-firing cost. The fleet's own sessions run in a separate environment and their token
usage is not visible from an interactive session, so this is the only way to measure it
rather than infer it. Multiply out before restoring the rest.

## GitHub Actions artifact storage budget (lane R22, 2026-10-01)

A second, separate budget on the same platform: GitHub Actions artifact storage, not the scheduled-worker
token budget the rest of this runbook governs. Same failure shape though: a fixed per-firing cost (one
`actions/upload-artifact` step per run) multiplied by firing frequency, with no awareness of the running
total, turned into an overspend nobody was watching.

### What happened

The coordinator measured Actions storage at 90 percent of plan on 2026-10-01: 311 artifacts, 6.2 GB, every
one from September, every one of 13 workflows uploading its whole `fsi-app/scripts/_snapshots/` tree
(guarded-write row snapshots, regenerable machine evidence, CLAUDE.md rule 5) at a 90-day retention. The
coordinator's own cleanup deleted 290 artifacts older than 3 days, landing at 0.43 GB.

**[CONFIRMED]** (method: `gh api repos/Dwarves77/dotfiles/actions/artifacts --paginate`, run 2026-10-02,
read-only), the post-cleanup live state, 21 artifacts, 411.8 MB total:

| Workflow (artifact name prefix) | Live artifacts | Per-run size | Total |
|---|---|---|---|
| `ledger-consume-snapshots` | 2 | 47.79 MB | 91.16 MB |
| `population-turn-snapshots` | 2 | 47.79 MB | 91.16 MB |
| `source-sweep-snapshots` | 2 | 47.79 MB | 91.16 MB |
| `fetch-drain-snapshots` | 2 | 47.79 MB | 91.16 MB |
| `corpus-turn-snapshots` | 1 | 47.93 MB | 45.71 MB |
| `brief-export` | 2 | 0.77 MB | 1.48 MB |
| `gate-a-rescan` | 4 | ~2 KB | 9.3 KB |
| `maintenance-plan-quarantine-disposition` | 6 | ~0.5 KB | 2.9 KB |

Every `*-snapshots` artifact lands within half a percent of the same ~47.8 MB regardless of which
family's workflow uploaded it. That is itself a finding: `fsi-app/scripts/_snapshots/` is one flat,
shared directory (`db.mjs`'s `snapDir()`), not scoped per family, so five different workflows uploading
"their own" snapshots in the same CI window were each uploading a near-duplicate of the same
whole-directory contents. The two "heaviest workflows" for this measurement (`ledger-consume` and
`population-turn`, tied with `source-sweep`/`fetch-drain` at 91.16 MB live each) are not meaningfully
heavier than the other three; the whole class was the defect, not an outlier workflow.

Only 2 runs per family survive the coordinator's 3-day cleanup (deleted artifacts are not retrievable via
the Artifacts API), so "last 3 runs" above is the full surviving set, not a truncation.

### The fix (this lane)

1. **Retention: 7 days, down from 90**, on every `actions/upload-artifact` step across all 14 workflows
   that upload anything (`brief-apply`, `brief-export`, `change-detection`, `corpus-turn`, `date-chain`,
   `downstream-chain`, `fetch-drain`, `gate-a-rescan`, `ledger-consume`, `maintenance`, `population-turn`,
   `producers`, `source-monitoring`, `source-sweep`).
2. **Path narrowed off `_snapshots`/`scripts/tmp` entirely.** No upload path references
   `fsi-app/scripts/_snapshots/` (whole or scoped) or `scripts/tmp/` any more. Where a family's own
   harness-run artifact exists (`scripts/harness-runs/<family>/`), that is what rides the Actions
   artifact instead; where a family had no harness artifact of its own (`date-chain`), only its run logs
   ride it. `corpus-turn`'s full-trace files (previously under `scripts/_snapshots/turn-<run_id>/`, needed
   so the forward-events artifact's `full_trace_refs` resolve past the runner) moved to
   `scripts/harness-runs/corpus-turn/traces/turn-<run_id>/`, the same family directory, same
   survivability, no `_snapshots` substring.
3. **Gated mechanically**: `F68-actions-artifact-budget` (fitness function) fails the build if any
   workflow sets `retention-days` above 7, or any `path:` contains `_snapshots` or `scripts/tmp`.
   Negative-tested (`F68-actions-artifact-budget.test.mjs`): a 90-day fixture fails, a `_snapshots`-path
   fixture fails (inline and inside a block scalar), a `scripts/tmp`-path fixture fails, the clean pair
   passes, and the live tree passes post-fix.

**[HYPOTHESIS]** (method: average size of the already-committed `scripts/harness-runs/<family>/*-run-*.json`
files on disk per family, 2026-10-02, a real measurement of harness-artifact size, but not yet a real
post-fix CI run, since this lane does not push). The expected per-run artifact size after the fix, next to
the measured ~47.8 MB `_snapshots` bulk upload it replaces:

| Family | Run files on disk | Avg size/run | vs. the 47.8 MB bulk upload it replaces |
|---|---|---|---|
| `ledger-consume` | 10 | ~54 KB | ~880x smaller |
| `source-sweep` | 18 | ~11 KB | ~4,300x smaller |
| `fetch-drain` | 5 | ~14 KB | ~3,300x smaller |
| `corpus-turn` | 2 | ~34 KB | ~1,400x smaller |

A confirmed before/after pair (the next real run of each workflow once this lane merges, read back via
the same `gh api .../actions/artifacts` call) belongs in this table the first time someone re-opens this
section after that. This entry is the setup for that measurement, not a substitute for it.

### Rules going forward

- **Retention ceiling: 7 days** on every Actions artifact in this repository. A workflow needing longer
  retention for a real reason gets a dated, reasoned exception recorded here, the same convention
  `EXEMPT_STEPS` in F54 uses, never a silent bump back to 90.
- **No gitignored scratch (`_snapshots/`, `scripts/tmp/`) rides an Actions artifact.** It is regenerable
  machine evidence (CLAUDE.md rule 5); the durable record for a harness run is `harness_runs`
  (migration 331), not the artifact. If a future workflow genuinely needs a trace file to survive past
  the runner, it writes that file under its own `scripts/harness-runs/<family>/` directory, never under
  `_snapshots/` or `scripts/tmp/`; F68 fails the build if it does.
- Enforced by `fsi-app/.discipline/fitness/functions/F68-actions-artifact-budget.mjs`, wired into the
  fitness runner (pre-push step 3d and CI's "Fitness functions" job) by the manifest-directory
  convention, no separate registration step to forget.

Related: [ADR index](../decisions/), [INDEX](../INDEX.md).
