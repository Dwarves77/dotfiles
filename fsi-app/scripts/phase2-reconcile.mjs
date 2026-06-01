// Phase 2 — provenance reconciliation THROUGH THE BOUND reconciler credential.
// Connects as the non-owner `reconciler` role (NOT postgres, NOT service_role): the
// flip path literally cannot bypass the guard. For each active 'unverified' item it
// touches updated_at, which fires set_provenance_status to re-derive and stamp the
// terminal status. Verify BY OUTCOME: predict recommended_status via the read-only
// validator, then assertReadBack the ACTUAL stored provenance_status (never the write's
// return) and assert they agree.
//
//   --dry-run (DEFAULT): predict only; tally the recommended distribution; ZERO writes.
//   --execute          : perform the flip per item + per-item read-back. Resumable +
//                        idempotent (already-flipped rows are no longer 'unverified',
//                        the guard ignores them, the trigger re-derives to the same value).
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { assertReadBack, VERDICT } from "./lib/verify.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const reconConn = POOL.replace(`postgres.${REF}`, `reconciler.${REF}`).replace(`reconciler.${REF}@`, `reconciler.${REF}:${encodeURIComponent(process.env.RECONCILER_DB_PASSWORD)}@`);

const EXECUTE = process.argv.includes("--execute");
const c = new pg.Client({ connectionString: reconConn });
await c.connect();

// Hard guarantee the flip path is the bound non-owner credential.
const who = (await c.query("SELECT current_user")).rows[0].current_user;
if (who !== "reconciler") { console.error(`HALT: connected as '${who}', not 'reconciler'. The flip must run through the bound credential.`); process.exit(2); }

console.log("=".repeat(68));
console.log(`PHASE 2 PROVENANCE RECONCILIATION — via bound credential (current_user=${who})`);
console.log(`mode: ${EXECUTE ? "EXECUTE (flipping via reconciler)" : "DRY-RUN (predict only; nothing written)"}`);
console.log("=".repeat(68));

const items = (await c.query(
  `SELECT id, legacy_id, title, provenance_status FROM public.intelligence_items
   WHERE is_archived = false ORDER BY id`)).rows;
const startDist = {};
for (const it of items) startDist[it.provenance_status] = (startDist[it.provenance_status] || 0) + 1;
console.log(`active items: ${items.length}   starting distribution: ${JSON.stringify(startDist)}\n`);

const tally = { verified: 0, pending_human_verify: 0, quarantined: 0 };
let flipped = 0, alreadyDone = 0, mismatches = 0, predicted = 0;
const sampleQuarantine = [];

for (let i = 0; i < items.length; i++) {
  const it = items[i];

  // read-only prediction (same function the trigger consumes)
  const recommended = (await c.query(`SELECT recommended_status FROM public.validate_item_provenance($1)`, [it.id])).rows[0].recommended_status;

  if (!EXECUTE) {
    predicted++;
    tally[recommended] = (tally[recommended] || 0) + 1;
    if (recommended === "quarantined" && sampleQuarantine.length < 8) sampleQuarantine.push(it.legacy_id || it.id.slice(0, 8));
    continue;
  }

  if (it.provenance_status !== "unverified") { alreadyDone++; tally[it.provenance_status] = (tally[it.provenance_status] || 0) + 1; continue; }

  // flip: touch updated_at -> set_provenance_status re-derives + stamps the terminal status
  await c.query(`UPDATE public.intelligence_items SET updated_at = now() WHERE id = $1`, [it.id]);

  // verify by OUTCOME: read-back the STORED status, assert it equals the prediction
  const rb = await assertReadBack(`readback ${it.legacy_id || it.id.slice(0, 8)}`, async () =>
    (await c.query(`SELECT provenance_status FROM public.intelligence_items WHERE id=$1`, [it.id])).rows[0].provenance_status, recommended);
  if (rb.verdict === VERDICT.PASS) { flipped++; tally[recommended] = (tally[recommended] || 0) + 1; if (recommended === "quarantined" && sampleQuarantine.length < 8) sampleQuarantine.push(it.legacy_id || it.id.slice(0, 8)); }
  else { mismatches++; console.log(`  [MISMATCH] ${it.legacy_id || it.id.slice(0, 8)}: predicted '${recommended}', stored '${rb.actual}'`); }

  if ((i + 1) % 100 === 0) console.log(`  ...${i + 1}/${items.length}`);
}

const endDist = {};
for (const r of (await c.query(`SELECT provenance_status, count(*)::int n FROM public.intelligence_items WHERE is_archived=false GROUP BY 1`)).rows) endDist[r.provenance_status] = r.n;

console.log("\n" + "-".repeat(68));
console.log(`RECONCILIATION ${EXECUTE ? "EXECUTED" : "DRY-RUN"}`);
console.log("-".repeat(68));
if (!EXECUTE) {
  console.log(`predicted terminal status for ${predicted} active items:`);
} else {
  console.log(`flipped (read-back confirmed): ${flipped}   already-reconciled (skipped): ${alreadyDone}   MISMATCHES: ${mismatches}`);
}
console.log(`  -> verified:             ${tally.verified || 0}`);
console.log(`  -> pending_human_verify: ${tally.pending_human_verify || 0}`);
console.log(`  -> quarantined:          ${tally.quarantined || 0}`);
if (sampleQuarantine.length) console.log(`  quarantine sample: ${sampleQuarantine.join(", ")}`);
console.log(`\nending distribution (active): ${JSON.stringify(endDist)}`);

await c.end();
if (EXECUTE && mismatches > 0) { console.log("\nHALT: read-back mismatches detected — investigate before trusting the run."); process.exit(1); }
console.log(EXECUTE ? "\nDONE — provenance reconciled through the bound reconciler credential; every flip read-back confirmed." : "\nDRY-RUN only. Re-run with --execute to flip via reconciler.");
process.exit(0);
