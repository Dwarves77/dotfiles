/** Deep-dive batch runner for the screened research_finding items. Runs the PROVEN canonical lib
 * fns (generate -> section -> ground -> grow) per item — the same code /api/agent/run drives — with
 * per-item verification, a self-imposed spend cap (direct execution bypasses the workflow preflight),
 * cost tracking, and checkpoint-resume (skips already-verified). Gated: a failure leaves the item
 * quarantined and moves on; it never corrupts.
 *
 *   node scripts/research-deepdive-batch.mjs --ids=7e4f2b36,d131224a,68af10b5     # pilot subset
 *   node scripts/research-deepdive-batch.mjs --from-screen                        # all GENERATE-set ids
 *   node scripts/research-deepdive-batch.mjs --from-screen --cap=15               # cap headroom (USD)
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const EST_PER_ITEM = 0.2; // generate ($0.10) + ground ($0.05) + web_search/discovery (~$0.05)
const CAP = Number(arg("cap", "15"));

let ids = [];
if (arg("ids")) ids = arg("ids").split(",").map((s) => s.trim()).filter(Boolean);
else if (process.argv.includes("--from-screen")) {
  const screen = JSON.parse(readFileSync(resolve(ROOT, "scripts/_diag/research-screen.json"), "utf8"));
  ids = screen.gen.map((g) => g.id);
}
if (!ids.length) { console.error("no ids — pass --ids=... or --from-screen"); process.exit(1); }

// resolve full ids from prefixes
const { data: pool } = await sb.from("intelligence_items").select("id,title,source_url,source_id,provenance_status").eq("item_type", "research_finding");
const items = ids.map((p) => (pool || []).find((r) => r.id === p || r.id.startsWith(p))).filter(Boolean);
console.log(`batch: ${items.length} items; est ~$${(items.length * EST_PER_ITEM).toFixed(2)} (cap halts at $${CAP}); cap is a HALT, not a target.\n`);

let spent = 0, ok = 0, fail = 0;
const results = [];
for (const it of items) {
  if (spent + EST_PER_ITEM > CAP) { console.log(`\nHALT: next item would exceed cap $${CAP} (spent ~$${spent.toFixed(2)})`); break; }
  if (it.provenance_status === "verified") { console.log(`SKIP ${it.id.slice(0, 8)} already verified`); continue; }
  const t0 = Date.now();
  process.stdout.write(`\n[${it.id.slice(0, 8)}] ${(it.title || "").slice(0, 50)}\n`);
  // clean slate for this item (idempotent re-gen)
  await sb.from("section_claim_provenance").delete().eq("intelligence_item_id", it.id);
  const { data: cur } = await sb.from("intelligence_items").select("source_id").eq("id", it.id).single();
  const g = await P.generateBrief(it.id); console.log(`  generate: ${g.ok ? "OK" : "FAIL"} ${g.detail}`);
  let s = { ok: false, detail: "skipped" }, r = { ok: false, detail: "skipped" }, w = { ok: false, detail: "skipped" };
  if (g.ok) { s = await P.sectionBrief(it.id); console.log(`  section : ${s.ok ? "OK" : "FAIL"} ${s.detail}`); }
  if (s.ok) { r = await P.groundBrief(it.id); console.log(`  ground  : ${r.ok ? "OK" : "FAIL"} ${String(r.detail).slice(0, 110)}`); }
  if (r.ok) { w = await P.growSources(it.id); console.log(`  grow    : ${w.ok ? "OK" : "FAIL"} ${w.detail}`); }
  spent += EST_PER_ITEM;
  const { data: fin } = await sb.from("intelligence_items").select("provenance_status, full_brief").eq("id", it.id).single();
  const verified = fin?.provenance_status === "verified";
  if (verified) ok++; else fail++;
  results.push({ id: it.id.slice(0, 8), title: (it.title || "").slice(0, 40), verified, brief: (fin?.full_brief || "").length, gen: g.detail, ground: String(r.detail).slice(0, 60), secs: Math.round((Date.now() - t0) / 1000) });
  console.log(`  => ${verified ? "VERIFIED" : "NOT verified (" + fin?.provenance_status + ")"}  brief=${(fin?.full_brief || "").length}ch  ${Math.round((Date.now() - t0) / 1000)}s`);
}

console.log(`\n=== BATCH RESULT ===  verified=${ok}  failed=${fail}  est spent ~$${spent.toFixed(2)}`);
for (const r of results) console.log(`  ${r.verified ? "OK  " : "FAIL"} ${r.id} ${r.brief}ch ${r.secs}s  ${r.title}`);
