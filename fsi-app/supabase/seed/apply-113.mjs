/**
 * apply-113.mjs — direct apply of migration 113 (Sprint 4 Block 1 task 1.2:
 * seed item_type_required_slots) to remote Supabase, then read-back verify.
 *
 * Follows the established direct-apply pattern (see apply-051.mjs): the local
 * migration history diverges from remote schema_migrations, so `supabase db
 * push` is unreliable. This applies ONLY 113 in a transaction, registers it in
 * schema_migrations, and verifies the seed rows via read-back.
 *
 * Idempotent: the INSERT uses ON CONFLICT DO NOTHING; the schema_migrations
 * insert is guarded by a pre-check.
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const FSI_APP_ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(FSI_APP_ROOT, ".env.local"));

const PROJECT_REF = readFileSync(resolve(FSI_APP_ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOLER_URL = readFileSync(resolve(FSI_APP_ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const MIGRATION_PATH_ABS = resolve(FSI_APP_ROOT, "supabase/migrations/113_seed_item_type_required_slots.sql");
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) {
  console.error("SUPABASE_DB_PASSWORD missing from .env.local");
  process.exit(1);
}

const CONN_STRING = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@`
);

const VERSION = "113";
const NAME = "seed_item_type_required_slots";

const EXPECTED_TYPES = ["regulation", "directive", "standard", "guidance", "framework"];
const EXPECTED_SLOTS = ["effective_date", "primary_deadline", "jurisdictional_scope", "penalty_summary"];

async function main() {
  const client = new Client({ connectionString: CONN_STRING });
  await client.connect();
  console.log(`[apply-113] connected to ${PROJECT_REF}`);

  try {
    // Pre-check: the target table must exist (task 1.1 / migration 112 applied).
    const { rows: tbl } = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='item_type_required_slots'"
    );
    if (tbl.length !== 1) {
      console.error("[apply-113] FAILED: table item_type_required_slots does not exist; migration 112 (task 1.1) must be applied first");
      process.exit(2);
    }

    const { rows: existing } = await client.query(
      "SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1",
      [VERSION]
    );

    const sql = readFileSync(MIGRATION_PATH_ABS, "utf8");
    console.log(`[apply-113] applying ${MIGRATION_PATH_ABS} (idempotent ON CONFLICT DO NOTHING)`);
    await client.query(sql);

    if (existing.length > 0) {
      console.log(`[apply-113] migration ${VERSION} already in schema_migrations; seed re-run was a no-op on conflict`);
    } else {
      await client.query(
        "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)",
        [VERSION, NAME]
      );
      console.log(`[apply-113] migration ${VERSION} registered in schema_migrations`);
    }

    console.log("[apply-113] reloading PostgREST schema cache");
    await client.query("NOTIFY pgrst, 'reload schema'");

    // ── Read-back verification (the auto-test from the task row) ──────────
    console.log("\n[apply-113] VERIFY: seed rows per item_type");
    const { rows: perType } = await client.query(
      `SELECT item_type, count(*)::int AS slot_count,
              array_agg(slot_key ORDER BY slot_key) AS slots
         FROM item_type_required_slots
        WHERE item_type = ANY($1)
        GROUP BY item_type
        ORDER BY item_type`,
      [EXPECTED_TYPES]
    );

    for (const r of perType) {
      console.log(`  ${r.item_type.padEnd(11)} count=${r.slot_count}  slots=[${r.slots.join(", ")}]`);
    }

    // Assertions: each of the 5 item_types has exactly the 4 expected slots.
    const sortedExpected = [...EXPECTED_SLOTS].sort();
    let ok = true;
    if (perType.length !== EXPECTED_TYPES.length) {
      console.error(`[apply-113] FAILED: expected ${EXPECTED_TYPES.length} item_types, got ${perType.length}`);
      ok = false;
    }
    for (const t of EXPECTED_TYPES) {
      const row = perType.find((r) => r.item_type === t);
      if (!row) {
        console.error(`[apply-113] FAILED: item_type '${t}' missing`);
        ok = false;
        continue;
      }
      const slotsSorted = [...row.slots].sort();
      if (row.slot_count !== 4 || JSON.stringify(slotsSorted) !== JSON.stringify(sortedExpected)) {
        console.error(`[apply-113] FAILED: item_type '${t}' slots mismatch. got=[${slotsSorted.join(", ")}] expected=[${sortedExpected.join(", ")}]`);
        ok = false;
      }
    }

    const { rows: totalRows } = await client.query(
      "SELECT count(*)::int AS n FROM item_type_required_slots WHERE item_type = ANY($1)",
      [EXPECTED_TYPES]
    );
    console.log(`\n[apply-113] total seeded rows across 5 D1 item_types: ${totalRows[0].n} (expected 20)`);
    if (totalRows[0].n !== 20) {
      console.error("[apply-113] FAILED: expected 20 total seed rows");
      ok = false;
    }

    if (!ok) {
      console.error("[apply-113] VERIFICATION FAILED");
      process.exit(3);
    }
    console.log("[apply-113] VERIFICATION PASSED: all 5 D1 item_types have the 4 required slots");
  } catch (err) {
    console.error(`[apply-113] ERROR: ${err.message}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
