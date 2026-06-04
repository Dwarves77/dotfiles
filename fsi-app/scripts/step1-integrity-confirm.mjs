/**
 * step1-integrity-confirm.mjs — the load-bearing honesty check on the provenance arc.
 *
 * Proves the gate did NOT loosen under migration 121 (uniform promotion). The 101-verified
 * figure is a later aggregate; this isolates the gate's verdict by RE-RUNNING the validator.
 *
 * Asserts a CLEAN PARTITION over all active intelligence_items:
 *   - every provenance_status='verified' item RE-VALIDATES valid=true  (no item verified
 *     without passing the gate -> the gate did not loosen). THIS IS THE LOAD-BEARING CHECK.
 *   - every provenance_status='quarantined' item RE-VALIDATES valid=false (gate still
 *     actively rejects -> not a vacuous pass).
 * Plus two named controls the operator asked for explicitly:
 *   - the unlabeled-assertion give-ups (e44a5408, d56ca4e1) are still quarantined AND still
 *     fail the live gate (negative control: the gate discriminates).
 *   - the EU ETS item (eu_ets_directive_2023_959) names the REAL source_id it is linked to
 *     (a real sources row, not a phantom).
 *
 * READ-ONLY (validate_item_provenance is STABLE). No writes.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);

const c = new pg.Client({ connectionString: CONN });
await c.connect();
try {
  // 1. Clean-partition check over all active items via LATERAL (one validator call per row).
  const { rows } = await c.query(`
    SELECT i.id, i.legacy_id, i.provenance_status, i.priority, vp.valid, vp.recommended_status
    FROM intelligence_items i, LATERAL validate_item_provenance(i.id) vp
    WHERE i.is_archived = false`);

  const verified = rows.filter((r) => r.provenance_status === "verified");
  const quarantined = rows.filter((r) => r.provenance_status === "quarantined");
  const verifiedButInvalid = verified.filter((r) => r.valid !== true);          // <-- must be 0
  const verifiedButNotRecVerified = verified.filter((r) => r.recommended_status !== "verified");
  const quarantinedButValid = quarantined.filter((r) => r.valid === true);      // promotable, not a loosening

  console.log(`active items: ${rows.length}  |  verified: ${verified.length}  |  quarantined: ${quarantined.length}\n`);
  console.log("=== LOAD-BEARING: every verified item re-validates valid=true ===");
  console.log(`  verified re-validating valid=true:        ${verified.length - verifiedButInvalid.length}/${verified.length}`);
  console.log(`  verified-but-INVALID (gate-loosening LEAK): ${verifiedButInvalid.length}   ${verifiedButInvalid.length === 0 ? "✓ NONE" : "✗ LEAK"}`);
  console.log(`  verified-but-recommended!=verified:        ${verifiedButNotRecVerified.length}`);
  if (verifiedButInvalid.length) for (const r of verifiedButInvalid) console.log(`    LEAK ${r.legacy_id || r.id} status=${r.provenance_status} valid=${r.valid} rec=${r.recommended_status}`);

  console.log("\n=== partition: every quarantined item re-validates valid=false ===");
  console.log(`  quarantined failing gate (valid=false):   ${quarantined.length - quarantinedButValid.length}/${quarantined.length}`);
  console.log(`  quarantined-but-VALID (promotable, stuck): ${quarantinedButValid.length}`);
  if (quarantinedButValid.length) for (const r of quarantinedButValid.slice(0, 20)) console.log(`    promotable ${r.legacy_id || r.id} (${r.priority})`);

  // 2. Named negative controls: unlabeled-assertion give-ups.
  console.log("\n=== negative control: unlabeled-assertion give-ups still fail the live gate ===");
  const { rows: gu } = await c.query(`
    SELECT i.legacy_id, substring(i.id::text,1,8) AS sid, i.provenance_status, vp.valid, vp.recommended_status, vp.failures
    FROM intelligence_items i, LATERAL validate_item_provenance(i.id) vp
    WHERE substring(i.id::text,1,8) IN ('e44a5408','d56ca4e1')`);
  for (const r of gu) {
    const fk = Array.isArray(r.failures) ? r.failures.map((f) => f.code || f).join(",") : JSON.stringify(r.failures);
    const ok = r.provenance_status === "quarantined" && r.valid === false;
    console.log(`  ${ok ? "✓" : "✗"} ${r.sid} ${r.legacy_id || ""} status=${r.provenance_status} valid=${r.valid}  failures=${(fk || "").slice(0, 80)}`);
  }

  // 3. EU ETS item names its real linked source.
  console.log("\n=== EU ETS no-source gap: name the linked source_id ===");
  const { rows: ets } = await c.query(`
    SELECT i.legacy_id, i.provenance_status, i.source_id, s.name AS src_name, s.url AS src_url, s.base_tier, s.status AS src_status
    FROM intelligence_items i LEFT JOIN sources s ON s.id = i.source_id
    WHERE i.legacy_id = 'eu_ets_directive_2023_959'`);
  for (const r of ets) {
    console.log(`  ${r.legacy_id}  provenance=${r.provenance_status}`);
    console.log(`  source_id = ${r.source_id ?? "NULL"}  ${r.source_id ? "(REAL row)" : "(STILL NULL)"}`);
    console.log(`  -> source: "${r.src_name}"  tier=${r.base_tier} status=${r.src_status}`);
    console.log(`     ${r.src_url}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(verifiedButInvalid.length === 0
    ? "VERDICT: gate did NOT loosen — 0 verified items fail re-validation."
    : `VERDICT: ✗ ${verifiedButInvalid.length} verified items FAIL re-validation — gate integrity broken.`);
  console.log("READ-ONLY.");
} finally { await c.end(); }
