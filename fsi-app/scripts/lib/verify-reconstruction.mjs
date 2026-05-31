// D3 Component A — verification LAYER 3 (real-artifact reconstruction).
//
// Synthetic fixtures (selftest) prove the CATEGORY generalises. This proves A
// catches the REAL this-session failures, not just idealised synthetics:
//   - criterion-6 revert: a CRITICAL sentinel with un-ticked claims, UPDATE'd to
//     'verified', is reverted by the LIVE trigger → assertReadBack must catch it.
//     (No un-fixing required — the trigger still reverts un-ticked CRITICAL items.)
//   - expired-token 401: a real Supabase REST call with a bad key → real HTTP 401
//     → fetchOk must classify INCONCLUSIVE, never a pass.
// READ-ONLY except a SENTINEL-marked item it inserts + reverts + deletes. No real row.
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { assertReadBack, fetchOk, VERDICT } from "./verify.mjs";

const { Client } = pg;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);

const MARK = "SPRINT4_D3_RECON";
const ID = { source: "5b1a4d30-0000-4000-8000-000000000d30", item: "5b1a4d31-0000-4000-8000-000000000d30" };
const SRC_URL = "https://selftest.example.gov/d3-recon";
const EXCERPT =
  "The regulation enters force on effective_date 2026-01-01. The headline primary_deadline 2026-06-30 governs compliance. " +
  "The jurisdictional_scope European Union applies throughout. The penalty_summary fines up to EUR 50000 may be levied.";

async function cleanup(c) {
  await c.query("DELETE FROM public.intelligence_items WHERE legacy_id LIKE $1", [`${MARK}%`]);
  await c.query("DELETE FROM public.sources WHERE name LIKE $1", [`${MARK}%`]);
}
async function seed(c) {
  await cleanup(c);
  await c.query(
    `INSERT INTO public.sources (id,name,url,description,tier,tier_at_creation,base_tier,effective_tier,status)
     VALUES ($1,$2,$3,'d3 recon source',1,1,1,1,'active')`, [ID.source, `${MARK}_SRC`, SRC_URL]);
  await c.query(
    `INSERT INTO public.intelligence_items (id,legacy_id,title,summary,domain,item_type,source_id,source_url,priority,status)
     VALUES ($1,$2,$3,'d3 recon item',1,'regulation',$4,$5,'CRITICAL','monitoring')`,
    [ID.item, `${MARK}_CRIT`, `${MARK}_CRIT`, ID.source, SRC_URL]);
  const sec = (await c.query(
    `INSERT INTO public.intelligence_item_sections (item_id,section_key,section_order,content_md,source_ids)
     VALUES ($1,'key_obligations',1,$2,$3) RETURNING id`,
    [ID.item, `Facts grounded in source. See ${SRC_URL}. effective_date 2026-01-01; primary_deadline 2026-06-30; jurisdictional_scope European Union; penalty_summary fines up to EUR 50000.`, [ID.source]])).rows[0].id;
  const srch = (await c.query(
    `INSERT INTO public.agent_run_searches (intelligence_item_id,search_query,result_url,result_title,result_index,result_content_excerpt,searched_at)
     VALUES ($1,'q',$2,'r',0,$3,NOW()) RETURNING id`, [ID.item, SRC_URL, EXCERPT])).rows[0].id;
  for (const f of ["effective_date 2026-01-01", "primary_deadline 2026-06-30", "jurisdictional_scope European Union", "penalty_summary fines up to EUR 50000"]) {
    await c.query(
      `INSERT INTO public.section_claim_provenance (section_row_id,intelligence_item_id,claim_text,claim_kind,source_span,source_id,search_result_id,source_tier_at_grounding)
       VALUES ($1,$2,$3,'FACT',$4,$5,$6,1)`, [sec, ID.item, f, f, ID.source, srch]);
  }
}
const readStatus = async (c) => (await c.query("SELECT provenance_status::text s FROM public.intelligence_items WHERE id=$1", [ID.item])).rows[0]?.s;

async function main() {
  let fails = 0;
  const c = new Client({ connectionString: CONN });
  await c.connect();
  try {
    await seed(c);
    const ctrl = await assertReadBack("control: seeded → pending_human_verify", () => readStatus(c), "pending_human_verify");
    console.log(`  [${ctrl.verdict}] control: seeded status = ${ctrl.actual}`);
    if (ctrl.verdict !== VERDICT.PASS) { console.error("  control failed — fixture not in expected state"); fails++; }

    // Reconstruct the REAL revert: claim success by UPDATE'ing to 'verified'; the
    // live trigger re-validates an un-ticked CRITICAL item and reverts it.
    await c.query("UPDATE public.intelligence_items SET provenance_status='verified' WHERE id=$1", [ID.item]);
    const after = await readStatus(c);
    console.log(`  UPDATE→'verified' then read-back = ${after}  (revert ${after === "pending_human_verify" ? "OCCURRED" : "did NOT occur"})`);
    const recon = await assertReadBack("REAL criterion-6 revert", () => readStatus(c), "verified");
    console.log(`  [${recon.verdict}] assertReadBack(expected 'verified', actual '${recon.actual}')`);
    if (recon.verdict !== VERDICT.FAIL) { console.error("  FAIL: assertReadBack did NOT catch the real revert"); fails++; }
    else console.log("  ✓ assertReadBack CAUGHT the real criterion-6 revert (claimed verified; persisted pending)");
  } finally {
    await cleanup(c);
    await c.end();
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/sources?select=id&limit=1`;
  let v401 = "(no throw)";
  let status = null;
  try { await fetchOk(url, { headers: { apikey: "INVALID_KEY_D3_RECON", Authorization: "Bearer INVALID_KEY_D3_RECON" } }); }
  catch (e) { v401 = e.verdict; status = e.detail?.status; }
  console.log(`\n  [${v401}] fetchOk(real Supabase REST, bad key) — upstream status ${status}`);
  if (v401 !== VERDICT.INCONCLUSIVE) { console.error("  FAIL: fetchOk did not return INCONCLUSIVE on a real 401"); fails++; }
  else console.log("  ✓ fetchOk classified the REAL 401 as INCONCLUSIVE (not a pass)");

  console.log(`\n${fails === 0 ? "LAYER 3 PASS — A catches the reconstructed REAL failures" : fails + " LAYER-3 FAILURE(S)"}`);
  // Set exitCode (don't process.exit) so the event loop drains the HTTP socket
  // cleanly — process.exit() mid-close triggers a libuv UV_HANDLE_CLOSING assert on Windows.
  process.exitCode = fails === 0 ? 0 : 1;
}
main();
