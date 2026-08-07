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

Related: [ADR index](../decisions/), [INDEX](../INDEX.md).
