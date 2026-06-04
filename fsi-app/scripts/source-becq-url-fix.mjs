/** Guarded single-row URL fix (authorized 2026-06-04): CNMI BECQ stored host becq.cnmi.gov is
 * wrong; the live authority is becq.gov.mp (web-verified). Same discipline as the SD DANR fix:
 * dry-run default (--execute --confirm), UPDATE … WHERE url=expectedOld, RETURNING read-back,
 * halt-on-mismatch, reversible ledger. Host-swap only — path preserved. Supply stays paused.
 */
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __d = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(__d, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const EXECUTE = process.argv.includes("--execute") && process.argv.includes("--confirm");

const audit = JSON.parse(readFileSync(resolve(__d, "_diag/source-relevance-audit-result.json"), "utf8"));
const becq = audit.inconclusiveDns.find((s) => /becq\.cnmi\.gov/.test(s.url));
if (!becq) { console.error("HALT: becq row not found in audit artifact"); process.exit(1); }
const neu = becq.url.replace("becq.cnmi.gov", "becq.gov.mp");

const c = new pg.Client({ connectionString: CONN }); await c.connect();
const q = (s, p) => c.query(s, p).then((r) => r);
try {
  console.log(`===== BECQ URL FIX — ${EXECUTE ? "EXECUTE" : "DRY-RUN"} =====`);
  console.log(`  ${becq.name}\n     ${becq.url}\n  -> ${neu}`);
  if (EXECUTE) {
    const u = await q(`UPDATE sources SET url=$2 WHERE id=$1 AND url=$3 RETURNING url`, [becq.id, neu, becq.url]);
    if (u.rowCount !== 1 || u.rows[0].url !== neu) { console.error("  HALT: read-back mismatch"); process.exit(1); }
    const ledger = { mode: "EXECUTE", at: "2026-06-04", urlFixes: [{ id: becq.id, name: becq.name, old: becq.url, neu }] };
    writeFileSync(resolve(__d, "_diag/source-becq-url-fix-log.json"), JSON.stringify(ledger, null, 2));
    console.log("    ✓ updated + read-back confirmed; ledger written");
  } else console.log("\n  dry-run only — re-run with --execute --confirm");
} finally { await c.end(); }
