#!/usr/bin/env node
/**
 * apply-008-seed.mjs — apply 008_seed_platform_admins.sql
 *
 * Sets is_platform_admin = true for the internal accounts hard-coded
 * in the SQL file. Run AFTER apply-008.mjs succeeds.
 *
 * Run:  node supabase/seed/apply-008-seed.mjs
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlFile = resolve(__dirname, "../migrations/008_seed_platform_admins.sql");

if (!existsSync(sqlFile)) {
  console.error(`✗ Seed file not found: ${sqlFile}`);
  process.exit(1);
}

const sql = readFileSync(sqlFile, "utf8");
console.log(`Seed: 008_seed_platform_admins.sql`);
console.log(`  ${sql.split("\n").length} lines, ${sql.length} chars`);
console.log("");

try {
  execSync(`npx supabase db query --linked -f "${sqlFile}"`, {
    stdio: "inherit",
    cwd: resolve(__dirname, "../.."),
  });
  console.log("\n✓ Platform admin seed applied.");
} catch (err) {
  console.error("\n✗ Seed failed:", err.message);
  console.error("");
  console.error("Manual fallback:");
  console.error(
    "  1. Open https://supabase.com/dashboard/project/kwrsbpiseruzbfwjpvsp/sql/new"
  );
  console.error(`  2. Paste contents of ${sqlFile}`);
  console.error("  3. Run.");
  process.exit(1);
}
