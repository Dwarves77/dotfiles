// Phase 5 turn-2 UPSERT rollback (NOT TRUNCATE CASCADE).
//
// The design's documented rollback (§ 6.1) used TRUNCATE intelligence_items
// CASCADE, but that would destroy 21 child tables' data. UPSERT-style
// rollback restores only the columns workload A modified (jurisdictions,
// jurisdiction_iso) for rows that differ from snapshot, and DELETEs the
// new ingest_rejections rows created during the partial run.
//
// Turn-2 start timestamp: 2026-05-18T16:22:31Z (pause flipped ON; first
// possible queue write was after this moment).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const TURN_2_START = "2026-05-18T16:22:31Z";

const DB_PASSWORD = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync(resolve(process.cwd(), "supabase/.temp/pooler-url"), "utf8").trim();
const PROJECT_REF = readFileSync(resolve(process.cwd(), "supabase/.temp/project-ref"), "utf8").trim();
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

const client = new pg.Client({ connectionString });
await client.connect();
const out = { turn_2_start: TURN_2_START };

try {
  await client.query("BEGIN");

  // DISABLE the routing trigger for the rollback duration.
  // Without this, UPDATE jurisdictions = snap.jurisdictions fires the
  // trigger which re-normalizes (stripping unmapped tokens like ASIA
  // back to []) AND writes new IR rows for the rejected tokens. First
  // attempt revealed this: drift_remaining stayed at 57 post-UPDATE +
  // IR count grew from 30 to 60 inside the same transaction.
  await client.query(`
    ALTER TABLE public.intelligence_items
    DISABLE TRIGGER trg_intelligence_items_normalize_jurisdictions
  `);

  // 1. UPDATE the differing rows from snapshot.
  // Only restore the columns workload A could have modified.
  const rollbackResult = await client.query(`
    UPDATE public.intelligence_items ii
       SET jurisdictions = snap.jurisdictions,
           jurisdiction_iso = snap.jurisdiction_iso
      FROM public.intelligence_items_pre_phase5 snap
     WHERE ii.id = snap.id
       AND (
         cardinality(COALESCE(ii.jurisdictions, ARRAY[]::text[]))
           <> cardinality(COALESCE(snap.jurisdictions, ARRAY[]::text[]))
         OR cardinality(COALESCE(ii.jurisdiction_iso, ARRAY[]::text[]))
           <> cardinality(COALESCE(snap.jurisdiction_iso, ARRAY[]::text[]))
         OR ii.jurisdictions IS DISTINCT FROM snap.jurisdictions
         OR ii.jurisdiction_iso IS DISTINCT FROM snap.jurisdiction_iso
       )
     RETURNING ii.id
  `);
  out.rows_rolled_back = rollbackResult.rowCount;

  // 2. DELETE ingest_rejections rows created during the partial run.
  // Use turn-2 start timestamp to scope cleanly; pre-existing rows were 0
  // per snapshot, so this should match the 30 new rows exactly.
  const deleteIR = await client.query(`
    DELETE FROM public.ingest_rejections
     WHERE ingest_attempted_at > $1
     RETURNING id
  `, [TURN_2_START]);
  out.ir_rows_deleted = deleteIR.rowCount;

  // 3. Verify PJR unchanged (should already match snapshot at 107).
  const pjrCheck = (await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.pending_jurisdiction_review) AS pjr_now,
      (SELECT COUNT(*)::int FROM public.pending_jurisdiction_review_pre_phase5) AS pjr_snap;
  `)).rows[0];
  out.pjr_check = pjrCheck;
  if (pjrCheck.pjr_now !== pjrCheck.pjr_snap) {
    throw new Error(`HALT: PJR drift detected (now=${pjrCheck.pjr_now}, snap=${pjrCheck.pjr_snap}). Investigate before commit.`);
  }

  // 4. Verify post-rollback baseline.
  const baseline = (await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.intelligence_items
        WHERE (jurisdiction_iso IS NULL OR cardinality(jurisdiction_iso) = 0)
          AND jurisdictions IS NOT NULL AND cardinality(jurisdictions) > 0) AS iso_empty,
      (SELECT COUNT(*)::int FROM public.ingest_rejections) AS ir_total,
      (SELECT COUNT(*)::int FROM public.pending_jurisdiction_review) AS pjr_total,
      (SELECT COUNT(*)::int FROM public.intelligence_items) AS items_total,
      (SELECT COUNT(*)::int FROM public.intelligence_items_pre_phase5) AS items_snap;
  `)).rows[0];
  out.post_rollback_baseline = baseline;

  // 5. Verify all snapshot rows match live for jurisdictions/jurisdiction_iso.
  const driftCheck = (await client.query(`
    SELECT COUNT(*)::int AS drift_remaining
    FROM public.intelligence_items ii
    JOIN public.intelligence_items_pre_phase5 snap ON snap.id = ii.id
    WHERE ii.jurisdictions IS DISTINCT FROM snap.jurisdictions
       OR ii.jurisdiction_iso IS DISTINCT FROM snap.jurisdiction_iso;
  `)).rows[0];
  out.drift_remaining_after_rollback = driftCheck.drift_remaining;
  if (driftCheck.drift_remaining !== 0) {
    throw new Error(`HALT: ${driftCheck.drift_remaining} rows still drift from snapshot post-UPDATE. Investigate.`);
  }

  // Verify pause still ON
  out.pause_state = (await client.query(`
    SELECT global_processing_paused FROM public.system_state WHERE id = true;
  `)).rows[0];

  // Re-enable the trigger before commit. CRITICAL: must complete or the
  // trigger stays disabled and any future ingest silently drops rejected
  // tokens.
  await client.query(`
    ALTER TABLE public.intelligence_items
    ENABLE TRIGGER trg_intelligence_items_normalize_jurisdictions
  `);

  await client.query("COMMIT");
  out.committed = true;
} catch (err) {
  await client.query("ROLLBACK");
  out.error = err.message;
  out.error_stack = err.stack;
  out.committed = false;
} finally {
  await client.end();
  console.log(JSON.stringify(out, null, 2));
  if (out.error) process.exit(1);
}
