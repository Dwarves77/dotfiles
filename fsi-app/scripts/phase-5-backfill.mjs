// Sprint 1 Phase 5 implementation: jurisdictions/jurisdiction_iso backfill
// + RC-9 dedup transactions. Runs once, manually, with the operator at
// the keyboard.
//
// Usage:
//   node scripts/phase-5-backfill.mjs --verify-only
//     Runs preflight + 10-row verification sample inside a rollback
//     transaction. No production state modified. Reports findings and
//     exits. Use this in turn 1 (before the maintenance window opens).
//
//   node scripts/phase-5-backfill.mjs --execute
//     Runs preflight + verification + snapshot tables + workload A
//     (re-normalize 457 ISO-empty rows in 100-row batches) + workload B
//     (dedup 4 clusters via supersession) + EU Automotive populate +
//     post-flight. Halts on any non-negotiable violation.
//
// Operator decisions Q1-Q8 (per 2026-05-18 dispatch):
//   Q1 Norway Fjords instrument_type: DEFER (leave NULL pending counsel)
//   Q2 EU Automotive: populate canonical-entity columns in Phase 5
//   Q3 agent_runs: no action (Phase 11 question)
//   Q4 Snapshot retention: 7 days post-flight (2026-05-25)
//   Q5 item_supersessions.severity: 'duplicate_merge' (existing vocab is
//      major/minor = severity-level, not domain-semantic per dispatch rule)
//   Q6 Matrix Hudson hidden_reason sentinel: 'rc8_review_pending'
//   Q7 Workload A batch size: 100 rows
//   Q8 OBS-2 audit scope: current sample only (broader audit deferred)
//
// Non-negotiables enforced by the script:
//   - Norway Fjords instrument_type stays NULL (Q1).
//   - Migration 082 trigger function unchanged (only DISABLE/ENABLE).
//   - Losers archived via item_supersessions (no hard delete).
//   - 10-row verification sample MUST pass before workload A.
//   - system_state.global_processing_paused MUST be true before workload A.
//   - Snapshot retention >= 7 days.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

// Q5 amendment (2026-05-18, post-CHECK-constraint discovery): the
// item_supersessions table has CHECK (severity = ANY(ARRAY['major',
// 'minor', 'replacement'])). My original Q5 pick 'duplicate_merge' is
// blocked. 'replacement' IS in the allowed set and IS the domain-
// semantic match for dedup-via-supersession (the canonical winner
// REPLACES the loser). Per Q5 rule "if existing rows follow a domain-
// semantic convention, match it" — 'replacement' is the right pick
// under the existing-vocabulary fall-through. OBS-6 in followups
// updated to reflect this.
const SEVERITY_VALUE = "replacement";
const MATRIX_HIDDEN_REASON = "rc8_review_pending";
// BATCH_SIZE: reduced 100 -> 50 after Phase 5 turn-2 first attempt failed
// mid-batch with "DbHandler exited" (connection drop). Even though the
// refactored bulk SQL pattern uses a single round trip per batch and
// session-mode pooler should handle 100+ row batches, 50 is the failure-
// mode safety belt per operator instruction.
const BATCH_SIZE = 50;
const SNAPSHOT_RETENTION_DAYS = 7;

const CLUSTER_CONFIG = [
  {
    name: "LL97",
    winner_id_prefix: "f67aabad",
    loser_id_prefixes: ["b8b6fde3", "d56ca4e1"],
    instrument_type: "local_law",
    instrument_identifier: "97/2019",
    hidden_reason: "rc9_dedup_archived",
    note: "Phase 5 RC-9 dedup; loser archived under canonical winner.",
  },
  {
    name: "EPA Phase 3",
    winner_id_prefix: "4d5670cb",
    loser_id_prefixes: ["33ca228c", "bec305e1"],
    instrument_type: "federal_rule",
    instrument_identifier: "RIN 2060-AV50",
    hidden_reason: "rc9_dedup_archived",
    note: "Phase 5 RC-9 dedup; loser archived under canonical winner.",
  },
  {
    name: "Norway Fjords",
    winner_id_prefix: "03b5f234",
    loser_id_prefixes: ["82f09535"],
    // Q1: instrument_type DEFERRED pending counsel review. Leave NULL.
    instrument_type: null,
    instrument_identifier: "world-heritage-fjords-ZE-2026",
    hidden_reason: "rc9_dedup_archived",
    note: "Phase 5 RC-9 dedup; loser archived under canonical winner. Winner instrument_type pending counsel review (followups OBS-7).",
  },
  {
    name: "Matrix Hudson",
    winner_id_prefix: "fb86ee11",
    loser_id_prefixes: ["daaa7e3a"],
    instrument_type: "market_signal",
    instrument_identifier: "matrix-hudson-2br-lottery",
    // Q6: 'rc8_review_pending' on the WINNER (so Sprint 2 RC-8 finds it).
    // Loser uses standard archived sentinel.
    hidden_reason: "rc9_dedup_archived",
    winner_hidden_reason: MATRIX_HIDDEN_REASON,
    note: "Phase 5 RC-9 dedup; loser archived under canonical winner. Winner flagged for Sprint 2 RC-8 review.",
  },
];

const EU_AUTOMOTIVE_POPULATE = {
  // Q2: populate canonical-entity columns; no merge work (single row).
  winner_id_prefix: "3ae89ce6",
  instrument_type: "eu_regulation",
  // Picking rule § 7: authoritative public identifier (EU OJ citation).
  // The HDV CO2 amendment cited is Regulation (EU) 2024/1610.
  // Operator may UPDATE post-flight if a different OJ citation is preferred.
  instrument_identifier: "2024/1610",
};

const VERIFICATION_SAMPLE = [
  { id: "v1-all-canonical", jurisdictions: ["US"], expect_pjr: 0, expect_ir: 0 },
  { id: "v2-canonical-plus-continent", jurisdictions: ["US", "ASIA"], expect_pjr: 1, expect_ir: 0, expect_pjr_reasons: ["continent"] },
  { id: "v3-canonical-plus-region", jurisdictions: ["US", "LATAM"], expect_pjr: 1, expect_ir: 0, expect_pjr_reasons: ["region_bucket"] },
  { id: "v4-canonical-plus-undefined-group", jurisdictions: ["US", "G7"], expect_pjr: 1, expect_ir: 0, expect_pjr_reasons: ["undefined_group"] },
  { id: "v5-canonical-plus-waterway", jurisdictions: ["US", "CARSON_RIVER_WATERSHED"], expect_pjr: 0, expect_ir: 1, expect_ir_reasons: ["non_geographic"] },
  { id: "v6-canonical-plus-ministry", jurisdictions: ["US", "MINISTRY OF CLIMATE"], expect_pjr: 0, expect_ir: 1, expect_ir_reasons: ["institutional"] },
  { id: "v7-canonical-plus-county", jurisdictions: ["US", "BIHOR COUNTY"], expect_pjr: 0, expect_ir: 1, expect_ir_reasons: ["below_granularity"] },
  { id: "v8-unparseable", jurisdictions: ["ZZZNONSENSE123"], expect_pjr: 0, expect_ir: 1, expect_ir_reasons: ["unparseable"] },
  { id: "v9-multi-mixed", jurisdictions: ["US", "ASIA", "CARSON_RIVER_WATERSHED"], expect_pjr: 1, expect_ir: 1, expect_pjr_reasons: ["continent"], expect_ir_reasons: ["non_geographic"] },
  { id: "v10-nyc-borough", jurisdictions: ["NEW YORK CITY"], expect_pjr: 0, expect_ir: 0 },  // canonicalizes to US-NYC
];

function buildConnectionString() {
  // CONNECTION-PATTERN BUG (2026-05-18, fixed in this refactor):
  // The first Phase 5 turn-2 execute attempt used the transaction-mode
  // pooler at port 6543. Workload A's per-row loop issued ~5-10 round
  // trips per row x 100 rows per batch = ~1000 queries inside a single
  // long-lived transaction. The transaction-mode pooler terminated the
  // connection mid-batch with "DbHandler exited".
  //
  // FIX: switch to the session-mode pooler at port 5432. Session mode
  // holds the connection for the lifetime of the client, so long
  // transactions with high inner query counts run cleanly. The refactor
  // also restructures workload A to a single bulk SQL statement per
  // batch (CTE chain with normalize + UPDATE + classify + INSERTs in
  // one round trip), which removes the per-row query volume problem
  // entirely. Session-mode is belt-and-suspenders for the case where
  // workload B or any future code reintroduces per-row patterns.
  const DB_PASSWORD = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
  const POOLER_URL = readFileSync(resolve(process.cwd(), "supabase/.temp/pooler-url"), "utf8").trim();
  const PROJECT_REF = readFileSync(resolve(process.cwd(), "supabase/.temp/project-ref"), "utf8").trim();
  const withPassword = POOLER_URL.replace(
    `postgres.${PROJECT_REF}@`,
    `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
  );
  // Replace transaction-mode port (6543) with session-mode (5432).
  return withPassword.replace(/:6543(\/|\?|$)/, ":5432$1");
}

async function preflight(client, opts) {
  const report = { stage: "preflight" };

  // 1. Confirm 457 ISO-empty rows (within 10% tolerance per HALT trigger)
  const { rows: [{ n: iso_empty }] } = await client.query(`
    SELECT COUNT(*) AS n FROM public.intelligence_items
    WHERE (jurisdiction_iso IS NULL OR cardinality(jurisdiction_iso) = 0)
      AND jurisdictions IS NOT NULL AND cardinality(jurisdictions) > 0;
  `);
  report.iso_empty_count = parseInt(iso_empty, 10);
  if (Math.abs(report.iso_empty_count - 457) / 457 > 0.10) {
    throw new Error(`HALT: ISO-empty row count ${report.iso_empty_count} is more than 10% off design's 457`);
  }

  // 2. Confirm 6 loser UUIDs present
  const { rows: losers } = await client.query(`
    SELECT id FROM public.intelligence_items
    WHERE id::text LIKE 'b8b6fde3%' OR id::text LIKE 'd56ca4e1%'
       OR id::text LIKE '33ca228c%' OR id::text LIKE 'bec305e1%'
       OR id::text LIKE '82f09535%' OR id::text LIKE 'daaa7e3a%';
  `);
  report.losers_present = losers.length;
  if (losers.length !== 6) {
    throw new Error(`HALT: expected 6 loser UUIDs, found ${losers.length}`);
  }

  // 3. Confirm 5 winner UUIDs present
  const { rows: winners } = await client.query(`
    SELECT id FROM public.intelligence_items
    WHERE id::text LIKE 'f67aabad%' OR id::text LIKE '4d5670cb%'
       OR id::text LIKE '3ae89ce6%' OR id::text LIKE '03b5f234%'
       OR id::text LIKE 'fb86ee11%';
  `);
  report.winners_present = winners.length;
  if (winners.length !== 5) {
    throw new Error(`HALT: expected 5 winner UUIDs, found ${winners.length}`);
  }

  // 4. Trigger present + enabled (so DISABLE has something to disable)
  const { rows: [trigger] } = await client.query(`
    SELECT tgname, tgenabled FROM pg_trigger
    WHERE tgrelid = 'public.intelligence_items'::regclass
      AND tgname = 'trg_intelligence_items_normalize_jurisdictions';
  `);
  if (!trigger || trigger.tgenabled !== "O") {
    throw new Error(`HALT: trigger trg_intelligence_items_normalize_jurisdictions absent or disabled (tgenabled=${trigger?.tgenabled})`);
  }
  report.trigger_state = "enabled";

  // 5. Queue tables exist (from migration 082)
  const { rows: queueTables } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('ingest_rejections', 'pending_jurisdiction_review');
  `);
  if (queueTables.length !== 2) {
    throw new Error(`HALT: expected 2 queue tables, found ${queueTables.length}`);
  }
  report.queue_tables = "present";

  // 6. Ingest pause state (only enforced for --execute, not --verify-only)
  if (opts.enforce_pause) {
    const { rows: [pauseRow] } = await client.query(`
      SELECT global_processing_paused FROM public.system_state WHERE id = true;
    `);
    if (!pauseRow?.global_processing_paused) {
      throw new Error("HALT: system_state.global_processing_paused is false. Set to true before opening workload A.");
    }
    report.global_processing_paused = true;
  } else {
    const { rows: [pauseRow] } = await client.query(`
      SELECT global_processing_paused FROM public.system_state WHERE id = true;
    `);
    report.global_processing_paused = pauseRow?.global_processing_paused ?? null;
  }

  // 7. item_supersessions.severity vocabulary (Q5)
  const { rows: vocab } = await client.query(`
    SELECT severity, COUNT(*)::int AS n FROM public.item_supersessions
    GROUP BY severity ORDER BY n DESC;
  `);
  report.existing_severity_vocab = vocab;

  // 8. Snapshot tables presence: tolerate existing snapshots if they cover
  // the 4 expected tables. Re-use them rather than recreating (avoids a
  // transient no-rollback window during DROP + CREATE). Retry scenario
  // after a failed first attempt is the canonical use case.
  const { rows: snapshots } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE '%_pre_phase5';
  `);
  const expectedSnapshots = new Set([
    "intelligence_items_pre_phase5",
    "pending_jurisdiction_review_pre_phase5",
    "ingest_rejections_pre_phase5",
    "item_supersessions_pre_phase5",
  ]);
  const presentSnapshots = new Set(snapshots.map(s => s.table_name));
  const missingSnapshots = [...expectedSnapshots].filter(t => !presentSnapshots.has(t));
  const extraSnapshots = [...presentSnapshots].filter(t => !expectedSnapshots.has(t));
  if (opts.enforce_no_snapshots && extraSnapshots.length > 0) {
    throw new Error(`HALT: unexpected snapshot tables present: ${extraSnapshots.join(", ")}. Inspect before re-running.`);
  }
  if (opts.enforce_no_snapshots && missingSnapshots.length > 0 && missingSnapshots.length < 4) {
    throw new Error(`HALT: partial snapshot state (${missingSnapshots.length}/4 missing): ${missingSnapshots.join(", ")}. Drop remaining snapshots before re-running.`);
  }
  report.snapshot_tables_present = snapshots.map(s => s.table_name);
  report.snapshot_reuse = opts.enforce_no_snapshots && missingSnapshots.length === 0;

  return report;
}

async function verificationSample(client) {
  const report = { stage: "verification", samples: [] };

  for (const sample of VERIFICATION_SAMPLE) {
    await client.query("BEGIN");
    try {
      // Insert test row, let the trigger fire, capture queue inserts
      const { rows: [{ id: newId }] } = await client.query(
        `INSERT INTO public.intelligence_items
           (title, domain, jurisdictions, jurisdiction_iso)
         VALUES ($1, 1, $2, ARRAY[]::text[])
         RETURNING id`,
        [`phase-5-verify-${sample.id}`, sample.jurisdictions]
      );
      const { rows: triggerPJR } = await client.query(
        `SELECT current_value, flagged_reason, source_column
         FROM public.pending_jurisdiction_review
         WHERE intelligence_item_id = $1
         ORDER BY current_value`,
        [newId]
      );
      const { rows: triggerIR } = await client.query(
        `SELECT raw_value, rejection_reason
         FROM public.ingest_rejections
         WHERE ingest_attempted_at > now() - interval '10 seconds'
         ORDER BY raw_value`
      );

      // Manual routing: call SQL helpers directly
      const { rows: [{ canonical, rejected }] } = await client.query(
        `SELECT canonical, rejected FROM public._normalize_jurisdictions($1)`,
        [sample.jurisdictions]
      );
      const manualPJR = [];
      const manualIR = [];
      for (const token of rejected) {
        const { rows: [{ _classify_jurisdiction_token: cls }] } = await client.query(
          `SELECT public._classify_jurisdiction_token($1)`,
          [token]
        );
        if (["continent", "region_bucket", "undefined_group"].includes(cls)) {
          manualPJR.push({ current_value: token, flagged_reason: cls, source_column: "jurisdictions" });
        } else {
          manualIR.push({ raw_value: token, rejection_reason: cls });
        }
      }
      manualPJR.sort((a, b) => a.current_value.localeCompare(b.current_value));
      manualIR.sort((a, b) => a.raw_value.localeCompare(b.raw_value));

      // Compare
      const pjrMatch = JSON.stringify(triggerPJR) === JSON.stringify(manualPJR);
      const irMatch = JSON.stringify(triggerIR) === JSON.stringify(manualIR);
      const expectMatch =
        triggerPJR.length === (sample.expect_pjr ?? 0) &&
        triggerIR.length === (sample.expect_ir ?? 0);

      report.samples.push({
        id: sample.id,
        pjr_match: pjrMatch,
        ir_match: irMatch,
        expect_match: expectMatch,
        trigger_pjr: triggerPJR,
        manual_pjr: manualPJR,
        trigger_ir: triggerIR,
        manual_ir: manualIR,
        canonical_out: canonical,
        pass: pjrMatch && irMatch && expectMatch,
      });
    } finally {
      await client.query("ROLLBACK");
    }
  }

  const failed = report.samples.filter(s => !s.pass);
  if (failed.length > 0) {
    report.pass = false;
    report.failed_count = failed.length;
    throw new Error(`HALT: verification sample failed on ${failed.length}/10 samples: ${failed.map(f => f.id).join(", ")}`);
  }
  report.pass = true;
  return report;
}

async function createSnapshots(client) {
  const report = { stage: "snapshots", tables_created: [], tables_reused: [], retention_target: null };
  const tables = [
    "intelligence_items",
    "pending_jurisdiction_review",
    "ingest_rejections",
    "item_supersessions",
  ];
  for (const t of tables) {
    const snapshotName = `${t}_pre_phase5`;
    const { rows: [{ exists }] } = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`,
      [snapshotName]
    );
    if (exists) {
      const { rows: [{ n }] } = await client.query(`SELECT COUNT(*)::int AS n FROM public.${snapshotName}`);
      report.tables_reused.push({ snapshot: snapshotName, source: t, row_count: n });
    } else {
      await client.query(`CREATE TABLE public.${snapshotName} AS SELECT * FROM public.${t}`);
      const { rows: [{ n }] } = await client.query(`SELECT COUNT(*)::int AS n FROM public.${snapshotName}`);
      report.tables_created.push({ snapshot: snapshotName, source: t, row_count: n });
    }
  }
  const retentionDate = new Date();
  retentionDate.setDate(retentionDate.getDate() + SNAPSHOT_RETENTION_DAYS);
  report.retention_target = retentionDate.toISOString().slice(0, 10);
  return report;
}

// Bulk SQL for a single batch. Replaces the per-row loop that exhausted
// the transaction-mode pooler in the first turn-2 execute attempt.
//
// One round trip per batch: normalize + UPDATE + classify + route in a
// single CTE chain. Mirrors migration 082's trigger function routing
// logic exactly (see migration 082 lines 245-294); if the trigger logic
// ever changes, this SQL must follow.
//
// IMPORTANT: this SQL runs inside DISABLE TRIGGER bracket. Without the
// bracket, the UPDATE inside `updated` would fire the trigger and
// recursively re-route every rejected token, duplicating IR rows.
//
// ROLLBACK SAFETY (OBS-11): any rollback path that UPDATEs intelligence_items
// requires the same DISABLE TRIGGER bracket. Without it, snapshot-restore
// UPDATEs fire the trigger which re-normalizes the snapshot values and
// defeats the rollback. See fsi-app/scripts/tmp/phase-5-rollback.mjs.
const BULK_NORMALIZE_AND_ROUTE_SQL = `
  WITH normalized AS (
    SELECT
      ii.id AS item_id,
      ii.source_url,
      ii.source_id,
      n_j.canonical AS j_canon,
      n_j.rejected AS j_reject,
      n_iso.canonical AS iso_canon,
      n_iso.rejected AS iso_reject
    FROM public.intelligence_items ii
    CROSS JOIN LATERAL public._normalize_jurisdictions(ii.jurisdictions) n_j
    CROSS JOIN LATERAL public._normalize_jurisdictions(ii.jurisdiction_iso) n_iso
    WHERE ii.id = ANY($1::uuid[])
  ),
  updated AS (
    UPDATE public.intelligence_items ii
       SET jurisdictions = n.j_canon,
           jurisdiction_iso = n.iso_canon
      FROM normalized n
     WHERE ii.id = n.item_id
    RETURNING ii.id
  ),
  all_rejected AS (
    SELECT n.item_id, n.source_url, n.source_id,
           'jurisdictions'::text AS source_column,
           j_token AS token
      FROM normalized n,
           LATERAL unnest(n.j_reject) AS j_token
    UNION ALL
    SELECT n.item_id, n.source_url, n.source_id,
           'jurisdiction_iso'::text AS source_column,
           iso_token AS token
      FROM normalized n,
           LATERAL unnest(n.iso_reject) AS iso_token
  ),
  classified AS (
    SELECT ar.*,
           public._classify_jurisdiction_token(ar.token) AS classification
      FROM all_rejected ar
  ),
  pjr_inserts AS (
    INSERT INTO public.pending_jurisdiction_review
      (intelligence_item_id, current_value, flagged_reason, source_column)
    SELECT item_id, token, classification, source_column
      FROM classified
     WHERE classification IN ('continent', 'region_bucket', 'undefined_group')
    ON CONFLICT (intelligence_item_id, current_value, source_column)
      WHERE resolved_at IS NULL DO NOTHING
    RETURNING id
  ),
  ir_inserts AS (
    INSERT INTO public.ingest_rejections
      (raw_value, rejection_reason, source_url, source_id)
    SELECT token, classification, source_url, source_id
      FROM classified
     WHERE classification NOT IN ('continent', 'region_bucket', 'undefined_group')
    RETURNING id
  )
  SELECT
    (SELECT count(*)::int FROM updated) AS updated_count,
    (SELECT count(*)::int FROM pjr_inserts) AS pjr_count,
    (SELECT count(*)::int FROM ir_inserts) AS ir_count
`;

async function processBatch(client, rowIds, batchIndex) {
  const t0 = Date.now();
  await client.query("BEGIN");
  await client.query(`
    ALTER TABLE public.intelligence_items
    DISABLE TRIGGER trg_intelligence_items_normalize_jurisdictions
  `);

  const { rows: [counts] } = await client.query(BULK_NORMALIZE_AND_ROUTE_SQL, [rowIds]);

  await client.query(`
    ALTER TABLE public.intelligence_items
    ENABLE TRIGGER trg_intelligence_items_normalize_jurisdictions
  `);
  await client.query("COMMIT");
  const lock_duration_ms = Date.now() - t0;
  return {
    batch_index: batchIndex,
    row_count: rowIds.length,
    updated_count: counts.updated_count,
    pjr_inserts: counts.pjr_count,
    ir_inserts: counts.ir_count,
    lock_duration_ms,
  };
}

async function workloadA(client) {
  const report = { stage: "workload_a", batches: [] };

  const { rows: targetRows } = await client.query(`
    SELECT id FROM public.intelligence_items
    WHERE (jurisdiction_iso IS NULL OR cardinality(jurisdiction_iso) = 0)
      AND jurisdictions IS NOT NULL AND cardinality(jurisdictions) > 0
    ORDER BY id;
  `);
  report.total_rows = targetRows.length;

  for (let i = 0; i < targetRows.length; i += BATCH_SIZE) {
    const slice = targetRows.slice(i, i + BATCH_SIZE).map(r => r.id);
    const batchReport = await processBatch(client, slice, Math.floor(i / BATCH_SIZE) + 1);
    report.batches.push(batchReport);
  }

  report.total_pjr_inserts = report.batches.reduce((s, b) => s + b.pjr_inserts, 0);
  report.total_ir_inserts = report.batches.reduce((s, b) => s + b.ir_inserts, 0);
  report.total_lock_ms = report.batches.reduce((s, b) => s + b.lock_duration_ms, 0);
  return report;
}

async function processCluster(client, cluster) {
  await client.query("BEGIN");
  const report = { name: cluster.name, winner_id: null, loser_ids: [], supersession_ids: [], xref_rewrites: 0 };

  const { rows: [winner] } = await client.query(
    `SELECT id FROM public.intelligence_items WHERE id::text LIKE $1 LIMIT 1`,
    [`${cluster.winner_id_prefix}%`]
  );
  if (!winner) throw new Error(`Cluster ${cluster.name}: winner ${cluster.winner_id_prefix} not found`);
  report.winner_id = winner.id;

  // Populate winner canonical-entity columns
  // Norway Fjords keeps instrument_type NULL (Q1)
  await client.query(
    `UPDATE public.intelligence_items
       SET instrument_type = $1, instrument_identifier = $2
     WHERE id = $3`,
    [cluster.instrument_type, cluster.instrument_identifier, winner.id]
  );

  for (const loserPrefix of cluster.loser_id_prefixes) {
    const { rows: [loser] } = await client.query(
      `SELECT id FROM public.intelligence_items WHERE id::text LIKE $1 LIMIT 1`,
      [`${loserPrefix}%`]
    );
    if (!loser) throw new Error(`Cluster ${cluster.name}: loser ${loserPrefix} not found`);
    report.loser_ids.push(loser.id);

    // Defensive cross-reference rewrites (zero expected per pre-flight)
    const { rowCount: xrefSource } = await client.query(
      `UPDATE public.item_cross_references SET source_item_id = $1 WHERE source_item_id = $2`,
      [winner.id, loser.id]
    );
    const { rowCount: xrefTarget } = await client.query(
      `UPDATE public.item_cross_references SET target_item_id = $1 WHERE target_item_id = $2`,
      [winner.id, loser.id]
    );
    report.xref_rewrites += (xrefSource ?? 0) + (xrefTarget ?? 0);

    // Insert supersession row
    const { rows: [supersession] } = await client.query(
      `INSERT INTO public.item_supersessions
         (old_item_id, new_item_id, supersession_date, severity, note)
       VALUES ($1, $2, CURRENT_DATE, $3, $4)
       RETURNING id`,
      [loser.id, winner.id, SEVERITY_VALUE, cluster.note]
    );
    report.supersession_ids.push(supersession.id);

    // Archive loser via hidden_reason
    await client.query(
      `UPDATE public.intelligence_items SET hidden_reason = $1 WHERE id = $2`,
      [cluster.hidden_reason, loser.id]
    );
  }

  // Matrix Hudson: also mark the WINNER with rc8_review_pending sentinel (Q6)
  if (cluster.winner_hidden_reason) {
    await client.query(
      `UPDATE public.intelligence_items SET hidden_reason = $1 WHERE id = $2`,
      [cluster.winner_hidden_reason, winner.id]
    );
    report.winner_hidden_reason = cluster.winner_hidden_reason;
  }

  await client.query("COMMIT");
  return report;
}

async function workloadB(client) {
  const report = { stage: "workload_b", clusters: [] };
  for (const cluster of CLUSTER_CONFIG) {
    report.clusters.push(await processCluster(client, cluster));
  }
  return report;
}

async function processEUAutoPopulate(client) {
  // Q2: populate canonical-entity columns on EU Automotive single-row stub.
  await client.query("BEGIN");
  const { rows: [winner] } = await client.query(
    `SELECT id FROM public.intelligence_items WHERE id::text LIKE $1 LIMIT 1`,
    [`${EU_AUTOMOTIVE_POPULATE.winner_id_prefix}%`]
  );
  if (!winner) throw new Error(`EU Automotive winner ${EU_AUTOMOTIVE_POPULATE.winner_id_prefix} not found`);
  await client.query(
    `UPDATE public.intelligence_items
       SET instrument_type = $1, instrument_identifier = $2
     WHERE id = $3`,
    [EU_AUTOMOTIVE_POPULATE.instrument_type, EU_AUTOMOTIVE_POPULATE.instrument_identifier, winner.id]
  );
  await client.query("COMMIT");
  return { stage: "eu_automotive_populate", winner_id: winner.id, instrument_type: EU_AUTOMOTIVE_POPULATE.instrument_type, instrument_identifier: EU_AUTOMOTIVE_POPULATE.instrument_identifier };
}

async function postFlight(client) {
  const report = { stage: "post_flight" };

  // 7.2a: every row has canonical jurisdictions OR an unresolved PJR entry
  const { rows: [{ n: emptyNoFlag }] } = await client.query(`
    SELECT COUNT(*)::int AS n FROM public.intelligence_items ii
    WHERE (cardinality(COALESCE(jurisdictions, ARRAY[]::text[])) = 0
           AND cardinality(COALESCE(jurisdiction_iso, ARRAY[]::text[])) = 0)
      AND NOT EXISTS (
        SELECT 1 FROM public.pending_jurisdiction_review pjr
        WHERE pjr.intelligence_item_id = ii.id AND pjr.resolved_at IS NULL
      );
  `);
  report.empty_jurisdictions_without_pjr = emptyNoFlag;
  report.gate_7_2a_pass = emptyNoFlag === 0;

  // 7.2b: no canonical-key duplicates
  const { rows: dupes } = await client.query(`
    SELECT jurisdiction_iso, instrument_type, instrument_identifier, COUNT(*)::int AS n
    FROM public.intelligence_items
    WHERE instrument_type IS NOT NULL AND instrument_identifier IS NOT NULL
    GROUP BY jurisdiction_iso, instrument_type, instrument_identifier
    HAVING COUNT(*) > 1;
  `);
  report.canonical_key_duplicates = dupes;
  report.gate_7_2b_pass = dupes.length === 0;

  // 7.2c: queue counts (compare against script's logged totals externally)
  const { rows: [counts] } = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.pending_jurisdiction_review) AS pjr,
      (SELECT COUNT(*)::int FROM public.ingest_rejections) AS ir;
  `);
  report.final_queue_counts = counts;

  // 7.2d: OBS-2 sample audit (small reject samples; broader audit deferred per Q8)
  const { rows: invalid2letter } = await client.query(`
    SELECT DISTINCT j FROM public.intelligence_items, unnest(jurisdictions) AS j
    WHERE j IN ('XX','ZZ','QQ','AA','BB','OO','ZX');
  `);
  const { rows: invalidIso } = await client.query(`
    SELECT DISTINCT j FROM public.intelligence_items, unnest(jurisdictions) AS j
    WHERE j IN ('US-ZZZZ','US-XX','GB-ZZ','XX-YYZZ','AA-AA');
  `);
  report.obs2_two_letter_hits = invalid2letter;
  report.obs2_iso_hits = invalidIso;
  report.gate_7_2d_pass = invalid2letter.length === 0 && invalidIso.length === 0;

  // Cluster verification: each loser archived; each winner has canonical key
  const losersArchived = await client.query(`
    SELECT id, hidden_reason FROM public.intelligence_items
    WHERE id::text LIKE 'b8b6fde3%' OR id::text LIKE 'd56ca4e1%'
       OR id::text LIKE '33ca228c%' OR id::text LIKE 'bec305e1%'
       OR id::text LIKE '82f09535%' OR id::text LIKE 'daaa7e3a%';
  `);
  report.loser_hidden_reasons = losersArchived.rows;

  const winnersFinal = await client.query(`
    SELECT id, instrument_type, instrument_identifier, hidden_reason FROM public.intelligence_items
    WHERE id::text LIKE 'f67aabad%' OR id::text LIKE '4d5670cb%'
       OR id::text LIKE '3ae89ce6%' OR id::text LIKE '03b5f234%'
       OR id::text LIKE 'fb86ee11%';
  `);
  report.winners_final_state = winnersFinal.rows;

  // Supersession rows created today
  const { rows: [{ n: superToday }] } = await client.query(`
    SELECT COUNT(*)::int AS n FROM public.item_supersessions
    WHERE supersession_date = CURRENT_DATE AND severity = $1;
  `, [SEVERITY_VALUE]);
  report.supersessions_created_today = superToday;

  report.all_gates_pass = report.gate_7_2a_pass && report.gate_7_2b_pass && report.gate_7_2d_pass;
  return report;
}

async function main() {
  const mode = process.argv[2];
  if (!["--verify-only", "--execute"].includes(mode)) {
    console.error("Usage: node scripts/phase-5-backfill.mjs [--verify-only | --execute]");
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: buildConnectionString() });
  await client.connect();
  const out = { mode, started_at: new Date().toISOString() };
  try {
    out.preflight = await preflight(client, {
      enforce_pause: mode === "--execute",
      enforce_no_snapshots: mode === "--execute",
    });
    out.verification = await verificationSample(client);

    if (mode === "--verify-only") {
      out.verify_only_complete = true;
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    out.snapshots = await createSnapshots(client);
    // --skip-workload-a: for retry scenarios where workload A already
    // committed in a prior run. Re-running workload A would create
    // duplicate ingest_rejections rows (no ON CONFLICT on IR). Used
    // after the 2026-05-18 turn-2 v2 run that completed workload A
    // (457 rows, 130 IR) but failed at workload B's first cluster.
    if (process.argv.includes("--skip-workload-a")) {
      out.workload_a = { skipped: true, reason: "--skip-workload-a flag" };
    } else {
      out.workload_a = await workloadA(client);
    }
    out.workload_b = await workloadB(client);
    out.eu_automotive = await processEUAutoPopulate(client);
    out.post_flight = await postFlight(client);
    out.execute_complete = true;
  } catch (err) {
    out.error = err.message;
    out.error_stack = err.stack;
  } finally {
    out.ended_at = new Date().toISOString();
    await client.end();
    console.log(JSON.stringify(out, null, 2));
    if (out.error) process.exit(1);
  }
}

await main();
