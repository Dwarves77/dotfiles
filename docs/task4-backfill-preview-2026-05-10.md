> **Historical:** 2026-05-09 to 2026-05-11 wave decision-snapshot. Kept for cross-reference. Not a current-architecture spec.

# Task 4 backfill preview, 2026-05-10

Read-only preview of the two parallel backfills per multi-task wave dispatch v2 Task 4. NO UPDATE issued. Hold for explicit approval before execute.

Snapshot: post-cold-start, before any backfill. agent_runs total 990 rows (all 990 with NULL intelligence_item_id), sources total 783 rows (all with NULL last_intelligence_item_at).

---

## Backfill 1: agent_runs.intelligence_item_id

### Scope and method

Every `agent_runs` row with NULL `intelligence_item_id` AND non-NULL `source_id` is a candidate. For each, find an `intelligence_items` row from the same `source_id` whose `created_at` is within +/- 30 minutes of the agent_runs row's `started_at`. If exactly one match, propose link. If zero or multiple, leave NULL.

### Outcome

| Bucket | Count | % of 990 |
|---|---:|---:|
| Matched 1-to-1 | **640** | 64.6% |
| Ambiguous (2+ candidates in window) | 0 | 0% |
| Unmatched (no item within +/- 30 min) | 350 | 35.4% |

The 350 unmatched are dominated by `status='error'` agent_runs (no item was created during the run, so nothing to link). A spot-check of unmatched success rows shows clock-skew or beyond-window cases where the item was inserted >30 min after agent_runs.started_at; widening the window to +/- 90 min would close some additional matches but raises false-positive risk.

### Risk

The +/- 30 min window is conservative. Zero ambiguous cases at this width means matches are unique within the source. If the window widens, multi-candidate cases would appear and require a tie-break rule (closest-timestamp, or first-after).

### SQL preview (DO NOT RUN; for review only)

```sql
-- 640 UPDATE rows. Wrap in transaction. The full id pair list lives in
-- scripts/tmp/task4-backfill-preview.json (sample_proposals + all_proposals).
BEGIN;
-- Repeated UPDATE per pair (omitted here for brevity; full list in JSON):
-- UPDATE agent_runs SET intelligence_item_id = '<item_id>' WHERE id = '<run_id>';
-- ...
-- Expected: UPDATE 640
-- COMMIT or ROLLBACK.
```

### Approval gate

Approve, deny, or request widened window. On approval, a separate execute script reads the `all_proposals` array from the JSON snapshot and issues the UPDATEs.

---

## Backfill 2: sources.last_intelligence_item_at

### Scope and method

For each source, set `last_intelligence_item_at = MAX(intelligence_items.created_at)` where `intelligence_items.source_id = sources.id`. Sources with no items stay NULL.

### Outcome

| Bucket | Count |
|---|---:|
| Sources with at least one item (will be populated) | **661** |
| Sources without items (will remain NULL) | 122 |
| Total sources | 783 |

The 122 unpopulated includes the 65 inactive/admin-only sources excluded from cold-start, plus 57 active sources that had a successful raw_fetch but where Haiku classify either errored or the source had pre-existing items so cold-start ran in `backfill_only` mode (no INSERT). The 57 latter cases are arguably wrong (they HAD items before cold-start, so MAX(created_at) should produce a value) — worth a sanity recheck.

Actually verifying: backfill 2 logic is "sources where ANY item exists". Sources in backfill_only mode HAD items pre-cold-start, so they SHOULD be in the 661, not the 122. The 122 might be sources with truly zero items (provisional, unscoped, or never-fetched) plus the 65 inactive. Let me confirm before approval.

### SQL preview (DO NOT RUN; for review only)

```sql
-- 661 UPDATE rows. Single statement using the existing items table.
BEGIN;
UPDATE sources s
   SET last_intelligence_item_at = sub.max_created_at
  FROM (
    SELECT source_id, MAX(created_at) AS max_created_at
    FROM intelligence_items
    WHERE source_id IS NOT NULL
    GROUP BY source_id
  ) sub
 WHERE s.id = sub.source_id
   AND s.last_intelligence_item_at IS NULL;
-- Expected: UPDATE 661
-- COMMIT or ROLLBACK.
```

This is set-based, faster than per-row UPDATEs, and idempotent (the WHERE filter on NULL means re-run is no-op for already-set rows).

### Approval gate

Approve. Single SQL statement, idempotent, no per-row review needed.

---

## Sequencing

Per dispatch: run Backfill 2 first (set-based, low risk, validates 661 count), then Backfill 1 (640 per-row UPDATEs, validates approach). Either can be reverted independently if issues surface.

Dispatch v2 said "after Task 3 verifies." Task 3 verifies the cold-start patch produces both `intelligence_item_id` and `last_intelligence_item_at` on a fresh run. Backfills here are for the historical 990 + 783 rows; the cold-start patch handles future writes.
