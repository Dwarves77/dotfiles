// Tier reconcile — Decision 2 (A canonical: news=T6) + the clean Class-1 mis-tiers.
// TWO categories, tracked separately, NEVER lumped. Investigation-first: --dry-run (DEFAULT)
// reads current base_tier and prints the id->old->new manifest with ZERO writes; --execute
// performs per-row UPDATE then a fresh read-back assert (halts on mismatch). Idempotent: a row
// already at its target is skipped. Role-mislabels (Class 2) are deliberately EXCLUDED — those
// are a role audit, not a tier fix.
//
// SCOPE NOTE: this is a NEW data op (not yet executed). After a verified --execute run, add it to
// scripts/_dataops/interlock.mjs + the ledger (so it cannot double-apply), per the data-op discipline.
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { assertExecutedDataOp } from "./_dataops/interlock.mjs";
assertExecutedDataOp("tier-reconcile", { applied: "2026-06-01", commit: "post-exec", effect: "move base_tier on 25 sources (11 news T5->T6 + 14 Class-1 fixes)", idempotent: true });

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const EXECUTE = process.argv.includes("--execute");

// CAT 1 — A/B reconcile: genuine-news trade_press T5 -> T6 (A canonical). expectedOld=5.
const CAT1 = [
  "5a70d4a5-27af-4b11-9a6c-d4d193731c4e", "2dff892f-eafb-4b88-8e9b-0746675e6fea",
  "e1cf70bc-7981-4c83-b9f3-bae57b035cee", "98ea1dbe-6ddf-4af9-bb13-9420d13c3fae",
  "20fb520a-38d2-4c68-928c-e359d9ff5d41", "81f10615-1e7e-4646-9fd4-e576a38fd232",
  "28d0b9a7-39c3-48f8-a3c6-76e1002896e4", "e0e3b24b-f709-4e97-ab8e-03c6f8a72891",
  "e99e2f18-dba1-45e4-87bc-ab7a412314b7", "928dd768-e5f0-4a71-8157-9335df8116db",
  "60031159-cc44-4baa-94e6-521298d140aa",
].map((id) => ({ id, expectedOld: 5, new: 6, cat: "CAT1 news T5->T6" }));

// CAT 2 — clean Class-1 mis-tiers.
const CAT2 = [
  // vendor_corporate EcoVadis x5 @T5 -> T6
  ...["a2d25d50-0bb7-4b7c-8cda-e37d26803e8e", "4fdb662c-3ab1-4987-b754-5530c9e511e1",
      "a6b20a8a-e6a9-41aa-9c6c-0f38b71016ba", "4a956756-9117-451e-b3f1-1e976dd79e39",
      "6f698bf0-8e67-4432-83d1-83f9daff7283"].map((id) => ({ id, expectedOld: 5, new: 6, cat: "CAT2 vendor T5->T6" })),
  // statistical_data_agency US EIA x3 @T1 -> T4
  ...["d2d7bd93-ba75-4d69-b92f-09912c78e9a4", "6901afb7-faaf-4156-9492-9907a09c5daf",
      "924fe43e-a7ff-4f3b-bf4c-2040567f0d23"].map((id) => ({ id, expectedOld: 1, new: 4, cat: "CAT2 stat T1->T4" })),
  // trade_press @T4 -> T6 (A: news=T6)
  ...["1c2b33a5-f9ae-4d2e-977f-5212174814d5", "6a4fbc59-5412-4541-a9a3-eeb155b15cc6",
      "d3e7c0b9-7550-4805-84cb-6aad42ef3275"].map((id) => ({ id, expectedOld: 4, new: 6, cat: "CAT2 trade T4->T6" })),
  // J.P. Morgan market commentary @T3 -> T6
  { id: "4f60d453-3dc6-4e87-b3aa-ef96fc4bac35", expectedOld: 3, new: 6, cat: "CAT2 vendor T3->T6" },
  // genuine regulators @T3 -> T2
  { id: "4c97d1ce-7153-4474-a990-d4e85f113646", expectedOld: 3, new: 2, cat: "CAT2 regulator T3->T2" },
  { id: "89fae12f-63e6-472a-bf11-1fafa6f7b4ec", expectedOld: 3, new: 2, cat: "CAT2 regulator T3->T2" },
];

const ALL = [...CAT1, ...CAT2];

const c = new pg.Client({ connectionString: CONN });
await c.connect();

let drift = 0, alreadyDone = 0, planned = 0, written = 0, verified = 0;
console.log(`=== TIER RECONCILE — ${EXECUTE ? "EXECUTE" : "DRY-RUN (manifest only, zero writes)"} ===\n`);
for (const row of ALL) {
  const cur = await c.query("SELECT name, source_role, base_tier FROM sources WHERE id=$1", [row.id]);
  if (cur.rowCount === 0) { console.log(`  MISSING ${row.id}`); continue; }
  const { name, source_role, base_tier } = cur.rows[0];
  const tag = `${row.cat.padEnd(22)} ${row.id}  T${base_tier}->T${row.new}  ${name?.slice(0, 34)} [${source_role}]`;
  if (base_tier === row.new) { console.log(`  [already] ${tag}`); alreadyDone++; continue; }
  if (base_tier !== row.expectedOld) { console.log(`  [DRIFT! expected old T${row.expectedOld}, found T${base_tier}] ${tag}`); drift++; continue; }
  planned++;
  if (!EXECUTE) { console.log(`  [plan]    ${tag}`); continue; }
  await c.query("UPDATE sources SET base_tier=$1 WHERE id=$2 AND base_tier=$3", [row.new, row.id, row.expectedOld]);
  const back = await c.query("SELECT base_tier FROM sources WHERE id=$1", [row.id]);
  if (back.rows[0].base_tier === row.new) { console.log(`  [OK]      ${tag}`); written++; verified++; }
  else { console.log(`  [FAIL read-back] ${tag} -> stored T${back.rows[0].base_tier}`); await c.end(); process.exit(1); }
}
await c.end();
const c1 = ALL.filter((r) => r.cat.startsWith("CAT1")).length, c2 = ALL.length - c1;
console.log(`\n=== ${ALL.length} rows (CAT1=${c1} CAT2=${c2}) | planned=${planned} already=${alreadyDone} drift=${drift}` +
  (EXECUTE ? ` | written=${written} read-back-verified=${verified}` : " | (dry-run: no writes)") + " ===");
if (drift > 0) console.log("DRIFT detected — current tier != expected old. Investigate before --execute (do NOT blind-write).");
