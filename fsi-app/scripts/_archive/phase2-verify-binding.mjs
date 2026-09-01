// Phase 2 #43 binding — VERIFY BY CONSTRUCTION (3-layer). All probes are NON-COMMITTING
// (BEGIN/ROLLBACK) or are rejected before any write — the corpus stays 657-unverified
// until the sanctioned reconcile. Halt-on-failure: if any assertion fails, the script
// exits non-zero and the reconcile MUST NOT run.
//
//   L1  the bound reconciler credential CAN perform the legitimate flip.
//   L2  (load-bearing) the reconciler credential CANNOT do anything out of scope —
//       cannot disable/drop the guard, cannot SET ROLE to owner/service_role, cannot
//       write content columns or other tables. AND the named adversary (service-role
//       key) is REJECTED by the guard; break the binding (disable the trigger as owner)
//       and the rejection stops — proving the trigger is what enforces it.
//   L3  on the real schema: the flip path resolves to current_user='reconciler'; the
//       service-role key is not in the flip path; the guard is present + enabled.
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const ownerConn = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const reconConn = POOL.replace(`postgres.${REF}`, `reconciler.${REF}`).replace(`reconciler.${REF}@`, `reconciler.${REF}:${encodeURIComponent(process.env.RECONCILER_DB_PASSWORD)}@`);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failures = 0;
const PASS = (m) => console.log(`  PASS  ${m}`);
const FAIL = (m) => { console.log(`  FAIL  ${m}`); failures++; };
// expect a query to be REJECTED; pass iff it throws.
async function expectReject(client, label, sql) {
  try { await client.query(sql); FAIL(`${label} — expected rejection, but it SUCCEEDED`); }
  catch (e) { PASS(`${label} — rejected: ${e.code || ""} ${e.message.split("\n")[0]}`); }
}

// pick one active, still-unverified item to probe against (read-only).
const owner = new pg.Client({ connectionString: ownerConn });
await owner.connect();
const testItem = (await owner.query(
  `SELECT id, title FROM public.intelligence_items
   WHERE is_archived = false AND provenance_status = 'unverified' ORDER BY id LIMIT 1`)).rows[0];
console.log(`Probe item: ${testItem.id}  "${(testItem.title||"").slice(0,48)}"\n`);

// ── connect the bound credential (must be reconciler.<ref> via the pooler) ──
const recon = new pg.Client({ connectionString: reconConn });
try { await recon.connect(); }
catch (e) { console.error(`HALT: the bound reconciler credential could not connect via the pooler (${e.message}). The strong reading requires the flip to run as reconciler. Aborting before any reconcile.`); process.exit(2); }

// ════════════════════════ L3 (identity of the flip path) ════════════════════════
console.log("== L3 — flip path resolves to the bound non-owner credential ==");
const who = (await recon.query("SELECT current_user, session_user")).rows[0];
if (who.current_user === "reconciler" && who.session_user === "reconciler") PASS(`bound connection is current_user=session_user=reconciler (no SET ROLE, no owner)`);
else FAIL(`bound connection identity unexpected: ${JSON.stringify(who)}`);
const guard = (await owner.query(`SELECT tgenabled FROM pg_trigger WHERE tgname='guard_provenance_flip_trg' AND tgrelid='public.intelligence_items'::regclass`)).rows[0];
if (guard?.tgenabled === "O") PASS("guard_provenance_flip_trg present and ENABLED on the real schema"); else FAIL(`guard trigger state: ${JSON.stringify(guard)}`);

// ════════════════════════ L1 (reconciler CAN flip — non-committing) ════════════════════════
console.log("\n== L1 — bound reconciler CAN perform the legitimate flip ==");
await recon.query("BEGIN");
await recon.query(`UPDATE public.intelligence_items SET updated_at = now() WHERE id = $1`, [testItem.id]);
const flipped = (await recon.query(`SELECT provenance_status FROM public.intelligence_items WHERE id=$1`, [testItem.id])).rows[0].provenance_status;
await recon.query("ROLLBACK");
if (flipped !== "unverified") PASS(`reconciler touch drove the trigger flip: unverified -> ${flipped} (rolled back; not committed)`);
else FAIL(`reconciler touch did NOT flip (still ${flipped})`);

// ════════════════════════ L2a (reconciler CANNOT act out of scope) ════════════════════════
console.log("\n== L2a — bound reconciler CANNOT escalate or act out of scope ==");
await expectReject(recon, "DISABLE the guard trigger", `ALTER TABLE public.intelligence_items DISABLE TRIGGER guard_provenance_flip_trg`);
await expectReject(recon, "DROP the guard trigger",    `DROP TRIGGER guard_provenance_flip_trg ON public.intelligence_items`);
await expectReject(recon, "SET ROLE postgres (owner)", `SET ROLE postgres`);
await expectReject(recon, "SET ROLE service_role",     `SET ROLE service_role`);
await expectReject(recon, "write a CONTENT column (title)", `UPDATE public.intelligence_items SET title='__x__' WHERE id='${testItem.id}'`);
await expectReject(recon, "write another table (sources)",  `UPDATE public.sources SET status='__x__' WHERE id IS NOT NULL`);
await expectReject(recon, "DELETE from the corpus",         `DELETE FROM public.intelligence_items WHERE id='${testItem.id}'`);

// ════════════════════════ L2b (named adversary service_role is REJECTED by the guard) ════════════════════════
console.log("\n== L2b — the unrestricted service-role key CANNOT flip (the named #43 invariant) ==");
const r1 = await sb.from("intelligence_items").update({ updated_at: new Date().toISOString() }).eq("id", testItem.id).select("id");
if (r1.error) PASS(`service_role touch (drives trigger flip) rejected by guard: ${r1.error.code || ""} ${r1.error.message.split("\n")[0]}`);
else FAIL(`service_role touch SUCCEEDED — guard did not block it`);
const r2 = await sb.from("intelligence_items").update({ provenance_status: "verified" }).eq("id", testItem.id).select("id");
if (r2.error) PASS(`service_role direct provenance_status write rejected by guard: ${r2.error.code || ""} ${r2.error.message.split("\n")[0]}`);
else FAIL(`service_role direct provenance write SUCCEEDED — guard did not block it`);
const stillUnv = (await owner.query(`SELECT provenance_status FROM public.intelligence_items WHERE id=$1`, [testItem.id])).rows[0].provenance_status;
if (stillUnv === "unverified") PASS(`probe item remains 'unverified' after both service_role attempts (no leak)`); else FAIL(`probe item is now '${stillUnv}' — a service_role attempt leaked through`);

// ════════════════════════ L2c (break the binding -> rejection stops; proves the trigger is the enforcer) ════════════════════════
console.log("\n== L2c — break the binding (disable the guard as OWNER), rejection stops -> the trigger is what enforces it ==");
await owner.query("BEGIN");
await owner.query(`ALTER TABLE public.intelligence_items DISABLE TRIGGER guard_provenance_flip_trg`);
await owner.query(`SET ROLE service_role`);
await owner.query(`UPDATE public.intelligence_items SET updated_at = now() WHERE id = $1`, [testItem.id]);
const afterBreak = (await owner.query(`SELECT provenance_status FROM public.intelligence_items WHERE id=$1`, [testItem.id])).rows[0].provenance_status;
await owner.query("RESET ROLE");
await owner.query("ROLLBACK"); // undoes BOTH the flip and the DISABLE — zero net change
if (afterBreak !== "unverified") PASS(`with the guard disabled, the same service_role touch NOW flips (unverified -> ${afterBreak}); rolled back. The guard was the enforcer.`);
else FAIL(`even with the guard disabled the flip did not occur (${afterBreak}) — enforcement attribution unclear`);
const reEnabled = (await owner.query(`SELECT tgenabled FROM pg_trigger WHERE tgname='guard_provenance_flip_trg' AND tgrelid='public.intelligence_items'::regclass`)).rows[0].tgenabled;
if (reEnabled === "O") PASS("guard trigger re-enabled after rollback (binding intact)"); else FAIL(`guard trigger left in state '${reEnabled}'`);

await recon.end();
await owner.end();
console.log(`\n=== VERIFY ${failures === 0 ? "PASS (all layers)" : `FAIL (${failures} failed assertion(s))`} ===`);
if (failures === 0) console.log("Binding is impossible-to-bypass for the bound credential AND rejects the service-role key. Cleared to reconcile through reconciler.");
else console.log("HALT: do NOT run the reconciliation behind an unverified gate. Fix the binding first.");
process.exit(failures === 0 ? 0 : 1);
