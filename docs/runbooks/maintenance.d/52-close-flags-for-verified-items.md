## 52. `close-flags-for-verified-items`

**New this runbook, D17 family 14 CORRECTION, defect-fix-plan-2026-09-12 (lane L11, coordinator
directive 2026-09-12). Extended by the D17 family 14 addendum (lane L11b, 2026-09-13).**

**THE CORRECTION**: this lane's first pass wrongly guessed `gate-a-verifier-sweep` was a run-log family
and added a [HYPOTHESIS] fixture vocabulary to `close-run-logs.mjs`'s allowlist (section 41). Live SQL
over the 37 open rows [CONFIRMED by the coordinator] found they are PER-ITEM findings, two shapes: "Item
<title> has no full_brief at all (NULL/empty) while quarantined; a structural authoring gap" and
"<title>: two of three Gate A orphans fixed this pass; the remaining orphan is <named>" -- never a run
summary. The `close-run-logs.mjs` guess is reverted (back to its original three families, the fixture and
its tests removed); this step is the real resolver.

**Purpose**: resolves every open, item-subject `integrity_flags` row whose `created_by` is in the named
per-item-family list `PER_ITEM_VERIFIED_SUPERSEDE_FAMILIES` (`gate-a-verifier-sweep` the first entry,
extensible for a future family with the same shape). Two closing rules, checked per row against its
subject item's CURRENT state:
1. `provenance_status = 'verified'` -- resolves with `resolution_note` "item verified on <date>; finding
   superseded" (the finding's own quarantined-item premise no longer holds once the item verifies).
2. **(D17 family 14 addendum, 2026-09-13)** `is_archived = true` -- resolves with `resolution_note` "item
   archived on <date>; finding moot" (the finding is equally moot for an archived item, for a different
   reason than verification). Added after the first apply left 30 rows open and the batch-003 export
   showed 24 of those subject items were archived, not still quarantined. Counted in its own dry-output
   bucket (`counts.would_resolve_archived`), separate from the verified-item bucket. **[CONFIRMED]
   deviation, disclosed**: the plan's own wording names "<archived_at or updated_at>"; `intelligence_items`
   carries no `archived_at` column (only `is_archived boolean` + `archive_reason text` --
   `supabase/migrations/001_schema.sql` / `004_source_trust_framework.sql`), so this rule always falls
   back to `updated_at` for the dated note (the read/compute stays generic, so a future `archived_at`
   column needs no code change here).

A row whose item is neither verified nor archived (still live-quarantined) stays open; its item id is
carried in `summary.json`'s own `still_open_item_ids` (every run, dry AND apply, never truncated to the
20-row sample) for the coordinator to feed into the next brief-export batch (D1, task 6.2d's `--ids`
re-grounding path) -- after the addendum this list names only genuinely live quarantined items.

**Upstream**: `scripts/lib/db.mjs` (`readAll`, `guardedUpdateByIds`).

**Ruling**: D17 family 14 correction (defect-fix-plan-2026-09-12, "Correction to the Family 14 ruling");
D17 family 14 addendum (2026-09-13, lane L11b).

**Dispatch**: no `--arg`. `mode=dry` reports the would-resolve (verified) / would-resolve-archived /
still-open counts and the full still-open item id list; `mode=apply` resolves every verified-item row (one
batched write, one shared dated note) and every archived-item row (grouped by the note text each item's
own archived/updated date produces, since that date can differ row to row -- same date, one batched write;
different dates, one write per distinct note).

**Artifact / read back**: `summary.json`'s `counts.would_resolve` / `counts.would_resolve_archived` /
`counts.still_open` / `still_open_item_ids` / `read_back.remaining_open`. Confirm against `SELECT
count(*) FROM integrity_flags f JOIN intelligence_items i ON i.id = f.subject_ref::uuid WHERE
f.created_by = 'gate-a-verifier-sweep' AND f.status = 'open' AND (i.provenance_status = 'verified' OR
i.is_archived = true)` (expect 0 after apply) and `SELECT subject_ref FROM integrity_flags WHERE
created_by = 'gate-a-verifier-sweep' AND status = 'open'` (should match `still_open_item_ids` exactly).

**Idempotency**: a second run with no newly-verified and no newly-archived items resolves 0 rows -- a row
this step already resolved (either rule) drops out of the next run's own `status IN ('open','in_review')`
candidate read.

---

