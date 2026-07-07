// READ-ONLY root-cause check for the unregistered-span-host FAIL. Hypothesis: FACT spans are grounded
// against POOL corroborators (agent_run_searches) that are NOT in the brief's "# New Sources Identified"
// table, so the register step (which parses only that table) never registers them -> NULL tier stamp.
// For each NULL-stamped FACT claim: is its span-host (a) in the item's pool, (b) in the item's brief
// New-Sources table? (a&&!b) = the pool-not-cited gap. Service-role (RLS).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(ROOT + "/.env.local");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { hostOf, buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");
const { parseNewSourcesFromBrief } = await jiti.import("../../src/lib/sources/source-growth.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = async (t, c) => { const o = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from(t).select(c).order("id").range(f, f + 999); if (!data?.length) break; o.push(...data); if (data.length < 1000) break; } return o; };

const sources = await all("sources", "id,url,base_tier,effective_tier,tier_override");
const resolver = buildResolver(sources);
const claims = await all("section_claim_provenance", "id,claim_kind,search_result_id,intelligence_item_id");
const searches = await all("agent_run_searches", "id,result_url,intelligence_item_id");
const searchById = new Map(searches.map((r) => [r.id, r]));

// NULL-stamped FACT claims
const nullFacts = claims.filter((c) => c.claim_kind === "FACT" && c.search_result_id && searchById.get(c.search_result_id) && resolver.resolveSpan(searchById.get(c.search_result_id).result_url).tier == null);
console.log(`NULL-stamped FACT claims: ${nullFacts.length}`);

// per-item brief New-Sources host set (cache)
const briefHostCache = new Map();
async function briefHosts(itemId) {
  if (briefHostCache.has(itemId)) return briefHostCache.get(itemId);
  const { data } = await sb.from("intelligence_items").select("full_brief").eq("id", itemId).single();
  const hosts = new Set(parseNewSourcesFromBrief(data?.full_brief || "").map((c) => hostOf(c.url)).filter(Boolean));
  briefHostCache.set(itemId, hosts);
  return hosts;
}
// pool host set per item
const poolByItem = new Map();
for (const s of searches) { if (!poolByItem.has(s.intelligence_item_id)) poolByItem.set(s.intelligence_item_id, new Set()); poolByItem.get(s.intelligence_item_id).add(hostOf(s.result_url)); }

let inPoolNotCited = 0, citedButUnregistered = 0, notInPool = 0;
const sample = [];
const itemsTouched = [...new Set(nullFacts.map((c) => c.intelligence_item_id))];
for (const c of nullFacts) {
  const sr = searchById.get(c.search_result_id); const h = hostOf(sr.result_url);
  const inPool = poolByItem.get(c.intelligence_item_id)?.has(h);
  const cited = (await briefHosts(c.intelligence_item_id)).has(h);
  if (cited) citedButUnregistered++;
  else if (inPool) { inPoolNotCited++; if (sample.length < 12) sample.push(`${h}  item=${c.intelligence_item_id.slice(0, 8)}`); }
  else notInPool++;
}
console.log(`\nNULL-stamped FACT span-host classification:`);
console.log(`  (a) in item POOL but NOT in brief New-Sources table  : ${inPoolNotCited}   <- register step never sees it`);
console.log(`  (b) IN brief New-Sources table but still unregistered: ${citedButUnregistered}   <- register ran but didn't register host`);
console.log(`  (c) not even in the item pool (legacy/other)         : ${notInPool}`);
console.log(`  items touched: ${itemsTouched.length}`);
console.log(`\nsample (a) pool-not-cited:`); for (const s of sample) console.log("  " + s);
process.exit(0);
