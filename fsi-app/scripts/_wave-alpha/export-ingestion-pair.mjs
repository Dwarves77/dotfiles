/** Wave-α Track E · e7 — READ-ONLY export of the frozen ingestion pair before its drop (mig 184).
 *
 *  ingestion_state (774 rows) + ingestion_control_log (709 rows) are a frozen, contradictory,
 *  zero-consumer pair (DB-3 F5 / DB-4 F4c). Migration 184 drops both. Because the control log is the
 *  ONLY record of the 2026-05-10 cold-start control history, the ORCHESTRATOR runs THIS script BEFORE
 *  applying 184 to capture a durable snapshot.
 *
 *  PURE READS. No writes, no DDL, no fetches. Service-role SELECT + local file writes only.
 *
 *  OUTPUT — LOCAL out-dir, NOT committed here. dotfiles is a PUBLIC repo, so corpus-content archives
 *  must NOT land in docs/archive. This writes JSONL to:
 *      --out <dir>   (CLI)         OR
 *      $WAVE_ALPHA_OUT             OR
 *      <repo>/fsi-app/scripts/tmp/_wave-alpha-ingestion-pair-2026-07-11   (gitignored default)
 *  The orchestrator then relocates the produced files to the PRIVATE repo
 *  Dwarves77/caros-ledge-backups under archives/ingestion-pair-2026-07-11/.
 *
 *  Files written: ingestion_state.jsonl, ingestion_control_log.jsonl, manifest.json
 *  (row counts + column lists + byte size per file for integrity).
 *
 *  Usage:  node scripts/_wave-alpha/export-ingestion-pair.mjs [--out <dir>]
 *  Env:    SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from .env.local)
 */
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may be pre-loaded */ }

function argOut() {
  const i = process.argv.indexOf("--out");
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (process.env.WAVE_ALPHA_OUT) return process.env.WAVE_ALPHA_OUT;
  // gitignored default inside the repo (scripts/tmp/ is in .gitignore) — the orchestrator relocates it.
  return join(ROOT, "scripts", "tmp", "_wave-alpha-ingestion-pair-2026-07-11");
}

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env (.env.local).");
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function readAllOrdered(table, orderCol) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select("*").order(orderCol, { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`read ${table} failed: ${error.message}`);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function main() {
  const outDir = argOut();
  mkdirSync(outDir, { recursive: true });

  const spec = [
    { table: "ingestion_state", order: "source_id" },
    { table: "ingestion_control_log", order: "id" },
  ];

  const manifest = { exported_at: new Date().toISOString(), source_project: URL, files: {} };

  for (const { table, order } of spec) {
    const rows = await readAllOrdered(table, order);
    const file = join(outDir, `${table}.jsonl`);
    writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
    const bytes = statSync(file).size;
    manifest.files[table] = {
      file: `${table}.jsonl`,
      rows: rows.length,
      columns: rows.length ? Object.keys(rows[0]) : [],
      bytes,
    };
    console.log(`  ${table}: ${rows.length} rows -> ${file}  (${bytes} bytes)`);
  }

  const manifestFile = join(outDir, "manifest.json");
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  manifest -> ${manifestFile}`);
  console.log(`\nDONE. Relocate ${outDir} to the PRIVATE repo Dwarves77/caros-ledge-backups`);
  console.log(`under archives/ingestion-pair-2026-07-11/ BEFORE applying migration 184.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
