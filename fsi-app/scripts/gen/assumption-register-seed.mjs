/**
 * WO-20 seeder — the 10 catalogued modelling constants from
 * docs/plans/wo20-assumption-register-spec.md §2, from the committed fixture
 * fixtures/assumption-register/wo20-catalogued-assumptions-2026-08-30.json.
 *
 * NOT RUNNABLE AGAINST A REAL DATABASE UNTIL MIGRATION 271 IS APPLIED. Two-track policy (CLAUDE.md
 * standing rule 3) — schema DDL applies via the coordinator's sanctioned lane BEFORE this seeder's
 * write path can succeed; a --apply run against a pre-migration database fails on the missing table,
 * loudly, which is the correct failure (never a silent partial write).
 *
 * DRY-RUN by default; --apply writes through the guarded path (scripts/lib/db.mjs guardedInsertMany).
 * Idempotent on the natural key assumption-register-common.mjs defines (assumption_key itself — the
 * table's own UNIQUE NOT NULL natural key, spec §3).
 *
 * THIS SESSION NEVER RUNS --apply. Sonnet executor lane, wave18/la, 2026-08-30: no DB access, no
 * Supabase calls, no service-role credentials — dry-run capability only, per this lane's explicit brief.
 *
 * Rule-012: import.meta.url-relative fixture + env paths, no hardcoded absolute paths.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtureRows, seedAssumptions } from "./assumption-register-common.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const FIXTURE = resolve(HERE, "fixtures/assumption-register/wo20-catalogued-assumptions-2026-08-30.json");
const APPLY = process.argv.includes("--apply");

const CITE = {
  skill: "ledger",
  reason: "WO-20 assumption register seeding: the 10 catalogued modelling constants from wo20-assumption-register-spec.md §2",
};

async function main() {
  const rows = loadFixtureRows(FIXTURE);
  const summary = await seedAssumptions({ label: "assumption-register-seed", rows, cite: CITE, apply: APPLY });
  if (summary.mode === "apply" && !summary.written && summary.toWrite > 0) process.exit(1);
}

main().catch((e) => { console.error("[assumption-register-seed] fatal:", e.message); process.exit(1); });
