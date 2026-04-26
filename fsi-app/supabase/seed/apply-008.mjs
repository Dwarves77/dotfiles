#!/usr/bin/env node
/**
 * apply-008.mjs — apply migration 008_platform_admin_profiles.sql
 *
 * Single-command runner for the platform-admin migration. Shells out
 * to the Supabase CLI (`npx supabase db query --linked -f ...`) which
 * was the proven path for prior schema migrations (per CLAUDE.md
 * session log "2026-04-04 final — Supabase Live").
 *
 * Run:        node supabase/seed/apply-008.mjs
 * Prereq:     `npx supabase link --project-ref kwrsbpiseruzbfwjpvsp`
 *             must have been run once (asks for DB password, caches).
 *
 * Failure fallback: paste the SQL into the Supabase Dashboard SQL
 * Editor at https://supabase.com/dashboard/project/kwrsbpiseruzbfwjpvsp/sql/new
 *
 * This script is committed as documentation of how the migration ran.
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlFile = resolve(__dirname, "../migrations/008_platform_admin_profiles.sql");

if (!existsSync(sqlFile)) {
  console.error(`✗ Migration file not found: ${sqlFile}`);
  process.exit(1);
}

const sql = readFileSync(sqlFile, "utf8");
console.log(`Migration: 008_platform_admin_profiles.sql`);
console.log(`  ${sql.split("\n").length} lines, ${sql.length} chars`);
console.log("");
console.log(`Running: npx supabase db query --linked -f ${sqlFile}`);
console.log("(Will prompt for DB password if not cached.)");
console.log("");

try {
  execSync(`npx supabase db query --linked -f "${sqlFile}"`, {
    stdio: "inherit",
    cwd: resolve(__dirname, "../.."),
  });
  console.log("\n✓ Migration 008 applied.");
  console.log("");
  console.log("Next: edit the seed UPDATE at the bottom of the .sql file");
  console.log("with real internal-account emails, then run that UPDATE");
  console.log("separately via Supabase SQL Editor.");
} catch (err) {
  console.error("\n✗ Migration failed:", err.message);
  console.error("");
  console.error("Manual fallback:");
  console.error(
    "  1. Open https://supabase.com/dashboard/project/kwrsbpiseruzbfwjpvsp/sql/new"
  );
  console.error(`  2. Paste contents of ${sqlFile}`);
  console.error("  3. Run.");
  process.exit(1);
}
