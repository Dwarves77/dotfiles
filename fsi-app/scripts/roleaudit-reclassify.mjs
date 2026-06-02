// Role-audit reclassification — TWO separately-verified data-ops (role + tier), from the
// orchestration workflow's manifests. Blocks A/B/D (role) + B/C (tier). EXCLUDES NREL (URL-dead,
// held) and the 6 taxonomy-held rows. Investigation-first: --dry-run (DEFAULT) reads current
// values and shows old->new with ZERO writes; --execute-role / --execute-tier each perform their
// own per-row UPDATE ... WHERE field=expectedOld + read-back assert + halt-on-mismatch. Idempotent,
// drift-guarded. Kept as DISTINCT ops (separate flags, separate read-back, separate ledger).
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const DO_ROLE = process.argv.includes("--execute-role");
const DO_TIER = process.argv.includes("--execute-tier");
import { assertExecutedDataOp } from "./_dataops/interlock.mjs";
assertExecutedDataOp("roleaudit-reclassify", { applied: "2026-06-01", commit: "post-exec", effect: "role-audit reclass: source_role on 28 (A/B/D) + base_tier on 13 (B/C)", idempotent: true });

const A = "intergovernmental_body", B = "industry_association", D = "standards_body";
const ROLE = [
  ...["aae0af9b-3dc7-4ca5-91c0-95769b590f8a","fd042e62-8955-4fa7-8248-0a296942f537","e50b19a7-1ea4-44c7-beb1-33dcc0cc0b38",
      "e3a3818a-7e8b-4aad-8bbb-b7668f0fbc17","f939efd5-a76c-474a-b181-5738e99482ad","9b01a831-e570-4ce4-80e1-183af21d9fb5",
      "f4946a56-8854-4e0a-8e85-014316ef54e8","7fb0e8dc-1f87-46e0-8748-269ba548f669","687a082b-65eb-4b9a-9e0d-e3bccda8f64b",
      "a2b2fe29-5a42-4231-8214-f7d86f56f87f","5ce39da7-a55b-41bf-bc58-a3d33746213c","a7475879-6fb6-4bfd-bd0f-41f96e5f280d",
      "a2afa79d-1d47-43aa-8d7d-d789ac880241","25fb1adb-2db7-498a-bd6b-aecf9961ea0f","fb877c31-51f3-4ae7-9c03-13f88771fd8f",
      "77d910f4-d638-4b43-970e-f47b3fa74181","fbeec262-732a-48c0-8f0e-8dd1597c7189","860f7c3b-54e1-4ccd-9842-c70bf3146ca1"].map(id=>({id,new:A})),
  ...["126dcf68-9322-4ed4-895e-671f72b85fa0","39f36d8e-cc26-461e-a913-a551d4e9aa0c","2a49d892-15fb-4c7d-ac61-276b2f2a7fd9",
      "e267a65c-1110-4fcb-8f50-bbd234069763","a4c2b71c-b1ca-4892-b28c-aa9b9c24f096","be829d1f-231c-4db6-81c7-d4ed5e65d6e2",
      "f0fb0b4a-52ba-480b-8de4-7fb6830b7b4a","72661585-957d-4db3-bd73-c4a03cd2e64a","0a8adfba-0f00-464b-b476-555b2f162e5f"].map(id=>({id,new:B})),
  { id: "d6e87364-309a-4f1b-90e9-93223133f29a", new: D },
].map(r => ({ ...r, expectedOld: "academic_research", col: "source_role" }));

const TIER = [
  ...["126dcf68-9322-4ed4-895e-671f72b85fa0","39f36d8e-cc26-461e-a913-a551d4e9aa0c","2a49d892-15fb-4c7d-ac61-276b2f2a7fd9",
      "e267a65c-1110-4fcb-8f50-bbd234069763","a4c2b71c-b1ca-4892-b28c-aa9b9c24f096","f0fb0b4a-52ba-480b-8de4-7fb6830b7b4a",
      "72661585-957d-4db3-bd73-c4a03cd2e64a","0a8adfba-0f00-464b-b476-555b2f162e5f"].map(id=>({id,expectedOld:3,new:5})),
  { id: "be829d1f-231c-4db6-81c7-d4ed5e65d6e2", expectedOld: 2, new: 5 }, // WBCSD was T2
  { id: "622d0e55-ed6c-4ec2-83a0-229425f73797", expectedOld: 1, new: 4 }, // MIT Climate Machine
  ...["071dff9e-4841-4955-8c04-9012c7836a49","da604866-450e-47c0-9d2b-04d606bc6267","9fde471c-fada-4c4c-a148-fa8f4b29cd39"].map(id=>({id,expectedOld:2,new:4})),
].map(r => ({ ...r, col: "base_tier" }));

const c = new pg.Client({ connectionString: CONN });
await c.connect();

async function runOp(label, rows, col, doExec) {
  console.log(`\n=== ${label} — ${doExec ? "EXECUTE" : "DRY-RUN (no writes)"} (${rows.length} rows) ===`);
  let planned = 0, already = 0, drift = 0, written = 0;
  for (const r of rows) {
    const cur = await c.query(`SELECT name, ${col} AS v FROM sources WHERE id=$1`, [r.id]);
    if (cur.rowCount === 0) { console.log(`  MISSING ${r.id}`); drift++; continue; }
    const v = cur.rows[0].v, name = cur.rows[0].name?.slice(0, 38);
    if (String(v) === String(r.new)) { console.log(`  [already] ${r.id} ${col}=${v}  ${name}`); already++; continue; }
    if (String(v) !== String(r.expectedOld)) { console.log(`  [DRIFT expected ${r.expectedOld}, found ${v}] ${r.id} ${name}`); drift++; continue; }
    planned++;
    if (!doExec) { console.log(`  [plan] ${r.id}  ${v} -> ${r.new}  ${name}`); continue; }
    await c.query(`UPDATE sources SET ${col}=$1 WHERE id=$2 AND ${col}=$3`, [r.new, r.id, r.expectedOld]);
    const back = (await c.query(`SELECT ${col} AS v FROM sources WHERE id=$1`, [r.id])).rows[0].v;
    if (String(back) === String(r.new)) { console.log(`  [OK] ${r.id}  ${v}->${back}  ${name}`); written++; }
    else { console.log(`  [FAIL read-back] ${r.id} -> ${back}`); await c.end(); process.exit(1); }
  }
  console.log(`  -> planned=${planned} already=${already} drift=${drift}${doExec ? ` written=${written}` : ""}`);
  if (drift) console.log("  DRIFT — investigate before --execute (do NOT blind-write).");
}

await runOp("OP 1 — source_role (Blocks A/B/D)", ROLE, "source_role", DO_ROLE);
await runOp("OP 2 — base_tier (Blocks B/C)", TIER, "base_tier", DO_TIER);
await c.end();
console.log(`\n(${DO_ROLE||DO_TIER ? "post-execute: add interlock + ledger entries for the executed op(s)" : "dry-run only — authorize with --execute-role and/or --execute-tier"})`);
