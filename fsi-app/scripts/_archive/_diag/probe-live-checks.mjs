/** READ-ONLY: dump the LIVE CHECK constraint definitions on intelligence_items straight from
 *  pg_constraint (the authoritative source — the migration file and the recon snapshot disagreed on
 *  severity, and the snapshot proved stale). Settles severity / theme / signal_band / format_type /
 *  priority / urgency_tier allowed-value sets so the B-fix maps EVERY constrained field from live truth.
 *  ZERO writes. */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c = new pg.Client({ connectionString: CONN });
await c.connect();
const { rows } = await c.query(
  `SELECT conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
    WHERE conrelid = 'public.intelligence_items'::regclass AND contype = 'c'
    ORDER BY conname`,
);
console.log(`\n===== LIVE CHECK constraints on intelligence_items (${rows.length}) =====`);
for (const r of rows) console.log(`\n• ${r.conname}\n    ${r.def}`);
await c.end();
