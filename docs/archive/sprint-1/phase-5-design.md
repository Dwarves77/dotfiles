# Sprint 1 Phase 5: Data Migration Design

**Date:** 2026-05-18
**Phase:** 5 of 11 (DESIGN ONLY, no SQL, no app code)
**Branch:** `feat/sprint-1-phase-5-design`
**Predecessor:** Phase 4b (migration 082 applied 2026-05-17 18:34 UTC)
**Pre-flight:** `fsi-app/scripts/tmp/phase-5-design-preflight.mjs` + `phase-5-design-preflight.json` (run 2026-05-18)

This doc designs the Phase 5 data migration: backfill the canonical-entity columns added in 079, backfill `jurisdiction_iso` for ISO-empty rows under the extended CASE from 080, and merge the 5 RC-9 duplicate clusters via supersession. The migration runs once, manually, with the operator at the keyboard. No code ships here.

## 1. Scope and counts

### 1.1 Pre-flight findings vs prior estimates

| Metric | Prior estimate | Live count (2026-05-18) | Delta |
|---|---|---|---|
| NYC-related items (jurisdictions OR jurisdiction_iso) | 13 (Phase 4a) | **5** | -8, large revision |
| ISO-empty rows with non-empty jurisdictions | 460 (Phase 3) | **457** | -3, within margin |
| ISO-empty total (incl. fully-empty rows) | n/a | 460 | matches Phase 3 number, was always "fully empty" |
| item_supersessions exists | unknown | **YES**, 5 rows already | confirms supersession path is open |
| item_cross_references FK rewrites needed for losers | 1 row (per Phase 2) | **0** | -1, EPA Phase 3 winner held the xref, not a loser |
| RC-9 loser UUIDs still present | 6 of 6 | **6 of 6** | unchanged, dedup is safe |

### 1.2 NYC token breakdown

All 5 hits come from the single token `NEW YORK CITY`. The other 9 tokens scanned (NEW_YORK_CITY, NYC, BROOKLYN, MANHATTAN, QUEENS, BRONX, STATEN ISLAND, STATEN_ISLAND, THE BRONX) return zero rows in the live `intelligence_items.jurisdictions` and `jurisdiction_iso` columns. The Phase 4a estimate of 13 was a loose count that may have included rows since archived, or counted token-occurrences instead of distinct items. Phase 5 NYC re-normalization scope is therefore much smaller than originally framed: 5 rows, all of which will canonicalize `NEW YORK CITY` -> `US-NYC` via the 080 CASE.

Two of the 5 NYC rows are the LL97 losers themselves (`b8b6fde3...`, `d56ca4e1...`), so the actual NYC backfill touches 3 non-loser rows after dedup.

### 1.3 RC-9 cluster restatement (loser UUIDs reconfirmed present)

| Cluster | Winner (prefix) | Loser UUIDs (prefixes) | Status |
|---|---|---|---|
| LL97 | `f67aabad` | `b8b6fde3`, `d56ca4e1` | both losers present |
| EPA Phase 3 | `4d5670cb` | `33ca228c`, `bec305e1` | both losers present |
| EU Automotive | `3ae89ce6` (sole row, per Phase 2 § cluster C) | none, single-row cluster | nothing to merge; Phase 6 RC-4 candidate |
| Norway Fjords | `03b5f234` | `82f09535` | loser present |
| Matrix Hudson | `fb86ee11` | `daaa7e3a` | loser present; merge-then-flag (Sprint 2 RC-8 deletes) |

Total losers: 6 rows across 4 active clusters. EU Automotive has no loser to merge in Phase 5; it stays a single UUID-routed stub for Phase 6 RC-4 handling.

### 1.4 Cross-reference rewrite workload

`item_cross_references` exists with columns `id, source_item_id, target_item_id, relationship`. Pre-flight scanned all 6 loser UUIDs against both FK columns. **Zero hits.** The EPA Phase 3 cross-reference flagged in Phase 2 § cluster B (1 row on `target_item_id`) was attached to the winner `4d5670cb`, not a loser. No xref rewrites are needed during dedup. CASCADE on the loser delete still fires safely with nothing to cascade.

## 2. Trigger pollution mitigation (OBS-5)

Locking in **Option 1 from OBS-5**: disable the trigger during backfill, route rejected tokens manually from the backfill script. Sprint 1 ships no migration 083; Sprint 2 carries the in-trigger TG_OP guard as a follow-up if ongoing UPDATE traffic proves to be a real pollution source post-Phase-5.

### 2.1 Disable / re-enable pattern

```sql
BEGIN;
  ALTER TABLE public.intelligence_items
    DISABLE TRIGGER trg_intelligence_items_normalize_jurisdictions;
  -- ... backfill UPDATEs run here ...
  -- ... manual routing INSERTs into ingest_rejections / pending_jurisdiction_review ...
  ALTER TABLE public.intelligence_items
    ENABLE TRIGGER trg_intelligence_items_normalize_jurisdictions;
COMMIT;
```

`ALTER TABLE ... DISABLE TRIGGER` takes `AccessExclusiveLock` on `intelligence_items` for the duration of the lock acquisition (millisecond-scale), then holds the lock until the wrapping transaction commits. Inside the transaction, the table is fully blocked to all readers and writers. This is the hard production block the design must account for; see § 5.

The trigger name `trg_intelligence_items_normalize_jurisdictions` is the public name installed by migration 072 and untouched through 082.

### 2.2 Manual routing logic in the backfill script

Inside the trigger-disabled window the backfill script must replicate the trigger's routing rules exactly. For each row being updated:

1. Call `SELECT canonical, rejected FROM _normalize_jurisdictions(input_array)` for each of `jurisdictions` and `jurisdiction_iso`.
2. Write `NEW.jurisdictions := canonical` and `NEW.jurisdiction_iso := canonical_iso` (the canonical arrays from step 1).
3. For each rejected token, call `SELECT _classify_jurisdiction_token(token)`.
4. If classification is in `('continent', 'region_bucket', 'undefined_group')`, INSERT into `pending_jurisdiction_review (intelligence_item_id, current_value, flagged_reason, source_column)` with the same `ON CONFLICT ... DO NOTHING` clause migration 082 uses.
5. Else, INSERT into `ingest_rejections (raw_value, rejection_reason, source_url, source_id)` using the item's current `source_url` and `source_id`.

This is the same routing migration 082 lines 248-290 implement; the backfill script must call the same helpers in the same order to produce the same routing decisions.

### 2.3 Drift-hazard mitigation

The backfill script's routing logic must stay in sync with the trigger function across any future change to the routing rules. Picking **mitigation (b): verification step on a seeded 10-row sample.**

Rationale for the pick:
- **(a) shared SQL helper function called by both** would require migration 083 to extract `_route_rejected_token(item_id, token, source_column, source_url, source_id)` from the trigger body. That is a schema change and Sprint 1 scope is closed to additive-only schema work. Defer to Sprint 2.
- **(b) verification step on a seeded 10-row sample.** Before the trigger-disabled window opens, the backfill script creates a temp table of 10 synthetic rows with known canonical + rejected tokens, runs them through the live trigger (still enabled at this point) and captures the resulting `ingest_rejections` / `pending_jurisdiction_review` rows. Then the script runs the same 10 inputs through its own manual routing logic and asserts the outputs match exactly (same `flagged_reason`, same `source_column`, same `rejection_reason`). If they don't match, the backfill aborts before disabling the trigger. **Picked.** Zero schema change, catches drift at runtime.
- **(c) other** options like dual-write (both trigger and script route) defeat the purpose of disabling the trigger and re-introduce the pollution OBS-5 is trying to avoid.

The 10-row verification sample lives in the backfill script body. Each Phase 5 dispatch re-runs it against the live trigger before opening the disable window.

## 3. Dedup strategy

### 3.1 Mechanism: archive losers via item_supersessions; no hard delete in Phase 5

Pre-flight confirmed `public.item_supersessions` exists with columns `(id uuid, old_item_id uuid, new_item_id uuid, supersession_date date, severity text, note text, created_at timestamptz)`. The table holds 5 rows already, so it is a live supersession path the platform already uses.

Strategy per cluster:
1. UPDATE the winner row to populate `instrument_type` and `instrument_identifier` per Phase 2 § 7 picking rule.
2. INSERT a row into `item_supersessions (old_item_id = loser, new_item_id = winner, supersession_date = today, severity = 'duplicate_merge', note = 'Phase 5 RC-9 dedup; loser archived under canonical winner.')` for each loser.
3. UPDATE the loser row's `hidden_reason` (column added by migration 062) to a sentinel like `'rc9_dedup_archived'` so reader RPCs filter it from operator-facing surfaces.
4. **Do NOT hard-delete the loser in Phase 5.** Hard-delete is deferred to Phase 11 per Phase 2 § 5 (agent_runs decision; operator may pick Option II / let SET NULL fire). Phase 5 only archives.

The `severity` column on `item_supersessions` is `text` (not constrained per the schema introspection); the value `'duplicate_merge'` is new but the table accepts free text. If the operator wants a constrained vocabulary on this column, that is a Phase 11 / Sprint 2 schema decision and not in Phase 5 scope.

### 3.2 Per-cluster decisions

All 4 active clusters use the same archive-via-supersession mechanism. Cluster-specific notes:

- **LL97** (2 losers): winner gets `instrument_type = 'local_law'`, `instrument_identifier = '97/2019'`. Standard merge.
- **EPA Phase 3** (2 losers): winner gets `instrument_type = 'federal_rule'`, `instrument_identifier = 'RIN 2060-AV50'` per Phase 2 § 7 picking rule (RIN wins over CFR citation). Standard merge.
- **Norway Fjords** (1 loser): winner gets `instrument_type = 'national_regulation'`, `instrument_identifier = 'world-heritage-fjords-ZE-2026'`. Phase 2 § 3 cluster D operator decision pending on instrument_type (could be `agency_guidance` instead). **See § 9 open question 1.**
- **Matrix Hudson** (1 loser): winner gets `instrument_type = 'market_signal'`, `instrument_identifier = 'matrix-hudson-2br-lottery'`. Per Phase 2 § 8 item 6, the merged winner is flagged with a sentinel in `hidden_reason` (e.g., `'sprint_2_rc8_pending_delete'`) so Sprint 2 RC-8 dispatches against a single row instead of two.

### 3.3 Cross-reference rewrites

`item_cross_references` rewrites are zero rows per pre-flight. The design retains the rewrite step as defensive code (in case the pre-flight count drifts between authoring and dispatch):

```text
UPDATE item_cross_references
   SET source_item_id = $WINNER_ID
 WHERE source_item_id = $LOSER_ID;

UPDATE item_cross_references
   SET target_item_id = $WINNER_ID
 WHERE target_item_id = $LOSER_ID;
```

If pre-flight counts hold (0 hits), these UPDATEs no-op. The cost of running them is negligible and the guarantee against a future drift is worth keeping.

### 3.4 agent_runs handling

Per Phase 2 § 5, the operator decision on agent_runs (Option I remap vs Option II let SET NULL fire at hard-delete vs Option III new column) was carried forward unresolved. Phase 5 does NOT hard-delete losers, so the SET NULL path does not fire here. The loser rows remain in `intelligence_items` (with `hidden_reason` set), and their agent_runs FKs continue to point at the loser id. **Phase 11 inherits the decision unchanged.** Phase 5 is a no-op for this question.

## 4. Backfill sequencing

Two backfill workloads run in Phase 5:
- **A.** Re-normalize `jurisdictions` and backfill `jurisdiction_iso` for the 457 ISO-empty rows (and any rows whose canonical jurisdictions drift under the extended 080 CASE).
- **B.** Merge the 6 RC-9 losers under their canonical winners (dedup transactions).

### 4.1 Recommended order: A first (full re-normalize), then B (dedup)

If B runs first:
- The 6 loser rows still have non-empty `jurisdictions` and empty `jurisdiction_iso` at merge time. The merge would archive them as-is, with stale denormalized data attached. Operator-facing surfaces filter them via `hidden_reason`, so the staleness is invisible. But the supersession audit trail captures `old_item_id` -> `new_item_id`; a future inspector pulling the loser row sees stale jurisdictions, with no indication of why the row was archived under the canonical winner. Cosmetic but ugly.
- More importantly, if any of the 6 losers carry tokens that route to `pending_jurisdiction_review` or `ingest_rejections`, those routes would fire during A (after the loser was already archived). The queue tables would gain entries referencing the archived loser id, which the operator cannot triage meaningfully.

If A runs first:
- All 463 rows in the workload set (457 ISO-empty + 6 losers minus overlap) get re-normalized cleanly. Any rejected tokens route to the queue tables under the rows' canonical post-normalize state. The 6 losers then enter B with normalized jurisdictions/jurisdiction_iso already populated. The supersession row archives a clean loser.
- Items in both sets get processed exactly once (the re-normalize touches them in A; the merge archives them in B).

**Picked: A first, then B.** Order is enforced by transaction boundary (see § 5).

## 5. Transaction boundaries

### 5.1 Per-cluster transactions (recommended)

Picking **per-cluster transactions**:
- Workload A (re-normalize) runs as **one transaction per batch of 100 rows**. ~5 batches for the 457-row workload. Each batch wraps DISABLE TRIGGER -> UPDATE -> manual routing INSERTs -> ENABLE TRIGGER -> COMMIT.
- Workload B (dedup) runs as **one transaction per cluster** (4 clusters total).
- Each cluster transaction wraps: UPDATE winner (set canonical-entity columns) -> INSERT item_supersessions row(s) for each loser -> UPDATE losers (set hidden_reason) -> defensive UPDATEs on item_cross_references -> COMMIT.

### 5.2 Lock posture and production-impact window

The dominant lock cost is `ALTER TABLE ... DISABLE TRIGGER` in workload A. That takes `AccessExclusiveLock` on `intelligence_items` for the duration of the wrapping transaction. With 100-row batches and the manual routing INSERTs running per row, each transaction is expected to hold the lock for ~3-10 seconds. **Production impact window per batch: ~5 seconds median, ~10 seconds worst-case.** Total accumulated lock time across all 5 batches: ~25-50 seconds, but not contiguous (each batch commits and releases before the next opens).

For workload B, the per-cluster transactions take row-level locks on the winner + losers + supersession rows. No DISABLE TRIGGER needed in B because dedup UPDATEs do not modify jurisdictions/jurisdiction_iso (those were already normalized in A). The trigger fires harmlessly on the winner UPDATE; the rejected array is empty post-A. Per-cluster duration: <1 second each.

### 5.3 Why not single transaction

Single transaction (atomic everything) would hold `AccessExclusiveLock` on `intelligence_items` for the entire duration (~5+ minutes including manual routing). That blocks all reads and writes platform-wide for the window. Per-batch trades granularity for shorter lock windows. Rollback granularity is also better: a single bad row in batch 3 only loses batch 3, not the prior batches.

The trade-off is that a partial-failure state is observable: if batch 3 fails, batches 1+2 are committed and batches 4+5 are not. The rollback gate (§ 6) handles this via snapshot restore.

### 5.4 Coordination with ingest pause

Per Phase 3 operator decision § "Verification gates", ingest must be paused during the backfill window. The platform's existing `processing_pause` mechanism (migration 016) handles this. Pre-flight gate must confirm `SELECT * FROM ingestion_control_log` shows ingest paused before opening any batch transaction.

## 6. Rollback gate

### 6.1 Snapshot approach (recommended)

Picking **snapshot table** over pg_dump:

```text
CREATE TABLE intelligence_items_pre_phase5 AS
SELECT * FROM public.intelligence_items;

CREATE TABLE pending_jurisdiction_review_pre_phase5 AS
SELECT * FROM public.pending_jurisdiction_review;

CREATE TABLE ingest_rejections_pre_phase5 AS
SELECT * FROM public.ingest_rejections;

CREATE TABLE item_supersessions_pre_phase5 AS
SELECT * FROM public.item_supersessions;
```

Pre-flight gate creates these 4 snapshot tables in the same database, same schema (public, or a dedicated `_phase5_snapshot` schema if cleaner). The snapshots are point-in-time copies created before any batch runs. Restore procedure if the backfill goes sideways:

```text
BEGIN;
  TRUNCATE public.intelligence_items CASCADE;  -- CASCADE handles the 21 FKs per Phase 2 § 1
  INSERT INTO public.intelligence_items SELECT * FROM intelligence_items_pre_phase5;
  -- ... same for the other 3 tables ...
  -- Then restore CASCADE'd child rows from their own snapshots (children
  -- need their own snapshots if rollback is required; not part of this
  -- design as Phase 5 does not modify child tables).
COMMIT;
```

### 6.2 Why snapshot over pg_dump

- **Same-database**: rollback is a SQL transaction, not a Supabase CLI restore. Operator restores in seconds, not minutes.
- **Atomic with the migration**: the snapshot CREATE TABLE statements run in the same migration script as the backfill, on the same connection. No external coordination.
- **Smaller risk surface**: pg_dump-to-backup-target requires writing to S3 or local disk, depending on tooling. Snapshot tables stay inside the Postgres instance.
- **Cost**: a snapshot of `intelligence_items` (655 rows, ~5-50MB depending on full_brief size) costs negligible storage. The 3 other snapshots are even smaller. Total snapshot footprint: <100MB.

### 6.3 Snapshot retention

Drop the 4 snapshot tables after the operator confirms post-flight verification (§ 7) passes. Recommend keeping them for 72 hours after the backfill window closes, then dropping. If kept longer, they drift from production and lose value as restore targets.

## 7. Verification gates

### 7.1 Pre-flight

Before opening the first batch transaction:

1. **Row counts match expectations.** `SELECT COUNT(*) FROM intelligence_items` matches the count from `phase-5-design-preflight.json`. If drift, halt and reconcile.
2. **No in-flight ingest.** `SELECT * FROM ingestion_control_log ORDER BY id DESC LIMIT 1` shows ingest paused. `SELECT COUNT(*) FROM agent_runs WHERE started_at > now() - interval '5 minutes' AND completed_at IS NULL` returns 0.
3. **Snapshot tables created.** 4 `intelligence_items_pre_phase5`, etc., exist and row counts match production.
4. **10-row routing verification (§ 2.3) passes.** Manual routing output matches trigger output exactly.

### 7.2 Post-flight

After all batches commit:

#### 7.2a Every backfilled row has non-empty canonical jurisdictions OR a queue entry

```text
SELECT COUNT(*) FROM intelligence_items ii
WHERE (cardinality(COALESCE(jurisdictions, ARRAY[]::text[])) = 0
       AND cardinality(COALESCE(jurisdiction_iso, ARRAY[]::text[])) = 0)
  AND NOT EXISTS (
    SELECT 1 FROM pending_jurisdiction_review pjr
    WHERE pjr.intelligence_item_id = ii.id AND pjr.resolved_at IS NULL
  );
```

Expected: 0 (or, the count of "pre-existing" empty-both rows that never had source data; pre-flight reports this number for comparison). Any drift means a row got normalized to empty and was not flagged for triage.

#### 7.2b No canonical-key duplicates (079 partial unique index holds)

```text
SELECT jurisdiction_iso, instrument_type, instrument_identifier, COUNT(*) AS n
FROM intelligence_items
WHERE instrument_type IS NOT NULL AND instrument_identifier IS NOT NULL
GROUP BY jurisdiction_iso, instrument_type, instrument_identifier
HAVING COUNT(*) > 1;
```

Expected: 0 rows. The 079 partial unique index `intelligence_items_canonical_key_idx` (WHERE both NOT NULL) prevents duplicates by construction; this query is a belt-and-braces verification.

#### 7.2c Queue counts match backfill script output

The backfill script logs `pending_jurisdiction_review` and `ingest_rejections` INSERTs as it runs. Post-flight compares the script's logged counts to actual table deltas:

```text
SELECT COUNT(*) FROM pending_jurisdiction_review;
-- compare to (107 pre-existing + script's pending_logged_count)

SELECT COUNT(*) FROM ingest_rejections;
-- compare to (0 pre-existing + script's rejection_logged_count)
```

Drift indicates a routing-logic bug or a missing INSERT in the script.

#### 7.2d OBS-2 validation-shape audit

Per OBS-2 in `followups.md`, scan canonical arrays for valid-shape-but-invalid-content tokens (XX, US-ZZZZ, etc.). The pre-flight ran this audit and returned ZERO hits:

- 2-letter token reject sample (XX, ZZ, QQ, AA, BB, OO, ZX): 0 hits
- ISO 3166-2 shape reject sample (US-ZZZZ, US-XX, GB-ZZ, XX-YYZZ, AA-AA): 0 hits
- Distinct 2-letter tokens in canonical arrays (46 total): all match real ISO 3166-1 codes plus the platform canonical `EU` and `UN` (UN warrants a Phase 6 review; not a Phase 5 gate)
- Distinct ISO 3166-2 shape tokens (60 total): all match real subdivisions including platform extensions `US-NYC` and `US-LAX`

Post-Phase-5 the audit re-runs against the post-backfill state. If new invalid tokens appear, the operator triages them. Sample output is committed alongside this design at `fsi-app/scripts/tmp/phase-5-design-preflight.json` (sections `two_letter_invalid_content_hits`, `iso_3166_2_invalid_content_hits`).

## 8. Estimated effort and risk

- **Agent work hours for implementation:** ~6 hours. Breakdown: backfill script + manual routing replica (~3h); per-cluster dedup SQL (~1h); snapshot + restore scripting (~1h); pre-flight + post-flight verification scripts (~1h).
- **Production impact window:** ~50 seconds accumulated lock time across 5 batches (workload A), distributed in 5-10 second blocks. Workload B (dedup) is row-level locks only, sub-second per cluster. Total window during which the platform is degraded: ~1 minute, non-contiguous. Ingest pause covers a longer window (estimate: 30 minutes for safe ramp-up plus run plus verification).
- **Rollback time estimate:** <2 minutes from snapshot tables (single `TRUNCATE CASCADE` + 4 INSERT-SELECTs). Compares favorably to a pg_dump restore (10-30 minutes depending on backup target).
- **Cost frame:**
  - One-time agent work: $40-80 (low; the routing logic is mechanical replication of the trigger)
  - Ongoing runtime: zero (one-shot migration)
  - Ongoing infrastructure: zero (snapshot tables dropped post-flight)
  - Inheritance: high (every future ingest enforces 079's unique index by construction; RC-9 closes)
  - Value frame: revenue-blocking-adjacent (LL97 wrong-urgency-on-stub-rows resolved)
  - Manual gate: operator runs the dispatch interactively, confirms each pre-flight and post-flight gate before advancing

## 9. Open questions for operator

1. **Norway Fjords instrument_type.** Phase 2 § 3 cluster D and § 8 item 5 carried this forward unresolved. Audit proposed `national_regulation`; operator may prefer `agency_guidance` depending on legal status reading. Phase 5 needs the answer before populating the canonical key. Default: ship `national_regulation` and accept post-flight reclassification via UPDATE if operator picks otherwise. Confirm.

2. **EU Automotive cluster Phase 5 action.** Phase 2 § 3 cluster C reports a single UUID-routed stub `3ae89ce6` (audit said 2, found 1). Phase 5 has no merge work for this cluster. Should Phase 5 also populate canonical-entity columns on this sole row (`instrument_type = 'eu_regulation'`, identifier = the OJ citation), or defer to Phase 6 RC-4 handling? Recommend populate-in-Phase-5 for symmetry with the other clusters. Confirm.

3. **agent_runs decision (carried forward from Phase 2 § 5).** Phase 5 does NOT hard-delete, so the decision does not fire here. Phase 11 inherits the question unchanged: remap to winner (Option I), let SET NULL fire at hard-delete (Option II, audit recommendation), or add a new archived_with_item_id column (Option III, out of Sprint 1 scope). No Phase 5 action needed; flagging so the open item does not get lost across phase boundaries.

4. **Snapshot retention.** Recommend 72 hours post-backfill. Operator may want longer (e.g., 7 days) if cross-team review windows are larger. Confirm.

5. **`item_supersessions.severity` value for dedup merges.** Pre-flight shows the column is free-text and currently holds 5 rows; the design proposes the new value `'duplicate_merge'` for Phase 5 supersessions. If the operator wants a different label (e.g., `'rc9_dedup'`, `'phase5_merge'`), confirm. If a CHECK constraint should be added to constrain the vocabulary, that is Sprint 2 schema scope and not Phase 5.

6. **Matrix Hudson hidden_reason sentinel value.** Proposed `'sprint_2_rc8_pending_delete'`. Confirm this is the right marker for the Sprint 2 RC-8 dispatch to find the row, or specify a different sentinel.

7. **Workload-A batch size.** Recommended 100 rows per batch. If the operator wants finer granularity (e.g., 50 rows) to shorten lock windows further, or coarser (e.g., 250 rows) to reduce total batch count, confirm.

8. **OBS-2 audit scope expansion.** Pre-flight scanned a hand-built reject sample (7 two-letter codes, 5 ISO-3166-2 shape codes). All returned zero hits. If the operator wants a broader audit (e.g., cross-reference all 46 distinct two-letter tokens against the `i18n-iso-countries` reference list), that is bigger work, recommend deferring to a standalone follow-up dispatch. Confirm scope.
