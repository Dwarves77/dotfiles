/** Phase 3 — scale the deep dive across a surface's in-scope items, AFTER its exemplar verified.
 *  Crash-SAFE (per-item try/catch; one bad item never kills the run — the WEO-2025 lesson) and
 *  spend-GATED (HALT cap, not a target). Selects non-archived, not-yet-verified items of the given
 *  item_types with a real (path-bearing) source_url; runs generate->section->ground->grow per item.
 *    node scripts/phase3-generate.mjs --types=market_signal,initiative --cap=20 [--limit=N]
 *  cap is a HALT in estimated dollars (~$0.20/item). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split("=")[1] : d; };
const types = (arg("types", "")).split(",").filter(Boolean);
const cap = parseFloat(arg("cap", "20"));
const limit = parseInt(arg("limit", "999"), 10);
const PER_ITEM = 0.2; // rough $/item estimate for the HALT math
if (!types.length) { console.error("pass --types=a,b"); process.exit(1); }

const isReal = (u) => /^https?:\/\//i.test(u || "") && !/^https?:\/\/[^/]+\/?$/.test(u || "");
const { data: items } = await sb.from("intelligence_items")
  .select("id,title,item_type,source_url,provenance_status,full_brief")
  .in("item_type", types).eq("is_archived", false).neq("provenance_status", "verified").not("source_url", "is", null)
  .order("priority", { ascending: true }).limit(400);
// --shard=i/n runs a disjoint slice (every n-th item). Queue is built once from a single ordered
// query, so concurrent shards started together partition the same snapshot without overlap.
const [si, sn] = (arg("shard", "0/1")).split("/").map(Number);
let queue = (items || []).filter((r) => isReal(r.source_url));
queue = queue.filter((_, idx) => idx % sn === si).slice(0, limit);
console.log(`Phase 3 [${types.join(",")}] shard ${si}/${sn}: ${queue.length} items queued; est ~$${(queue.length * PER_ITEM).toFixed(2)}; HALT cap $${cap}.\n`);

let spent = 0, verified = 0, quarantined = 0, failed = 0, n = 0;
for (const it of queue) {
  if (spent >= cap) { console.log(`\n*** HALT: est spend $${spent.toFixed(2)} reached cap $${cap}. ${queue.length - n} items left unprocessed. ***`); break; }
  n++; const t0 = Date.now();
  process.stdout.write(`[${n}/${queue.length}] ${it.id.slice(0, 8)} ${(it.title || "").slice(0, 44)} `);
  try {
    const g = await P.generateBrief(it.id); if (!g.ok) { failed++; console.log(`generate FAIL: ${g.detail.slice(0, 70)}`); spent += PER_ITEM / 2; continue; }
    const s = await P.sectionBrief(it.id); if (!s.ok) { failed++; console.log(`section FAIL: ${s.detail.slice(0, 50)}`); spent += PER_ITEM; continue; }
    const gr = await P.groundBrief(it.id);
    if (gr.ok) { await P.growSources(it.id); verified++; console.log(`VERIFIED (${gr.detail.slice(0, 40)}) ${Math.round((Date.now() - t0) / 1000)}s`); }
    else { quarantined++; console.log(`QUARANTINED: ${gr.detail.slice(0, 60)} ${Math.round((Date.now() - t0) / 1000)}s`); }
    spent += PER_ITEM;
  } catch (e) { failed++; console.log(`EXCEPTION: ${String(e.message || e).slice(0, 80)}`); spent += PER_ITEM; }
}
console.log(`\n=== Phase 3 [${types.join(",")}] done === processed=${n} VERIFIED=${verified} QUARANTINED=${quarantined} FAILED=${failed}  est ~$${spent.toFixed(2)}`);
process.exit(0);
