// RD-8 RETRIEVAL CHECK (read-only): before adding/fetching Reg (EU) 2025/2083 for CBAM, is it ALREADY
// in CBAM's agent_run_searches pool? And what are the current pool's hosts + which carry the amendment
// text (so we know if web_search already pulled EUR-Lex 2025/2083 or only the ICAP tracker).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(ROOT + "/.env.local");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return "(none)"; } };

const ID = (await sb.from("intelligence_items").select("id,title,source_url").ilike("title", "%CBAM%").limit(10)).data.find((r) => r.id.startsWith("51b2c91e")).id;
const { data: pool } = await sb.from("agent_run_searches").select("result_url,result_title,result_index,result_content_excerpt").eq("intelligence_item_id", ID).order("result_index");
console.log(`CBAM pool rows: ${pool.length}`);
const byHost = {}; for (const p of pool) { const h = hostOf(p.result_url); byHost[h] = (byHost[h] || 0) + 1; }
console.log("pool by host (count, with content length):");
for (const p of pool) console.log(`  idx${String(p.result_index).padEnd(3)} ${hostOf(p.result_url).padEnd(30)} ${String((p.result_content_excerpt || "").length).padStart(7)}ch  ${p.result_url.slice(0, 70)}`);

// RD-8: is 2025/2083 anywhere in the pool (url or excerpt)?
const re2083 = /2025\/2083|32025R2083|2025R2083/i;
const inUrl = pool.filter((p) => re2083.test(p.result_url || ""));
const inText = pool.filter((p) => re2083.test(p.result_content_excerpt || ""));
console.log(`\nRD-8 CHECK — Reg (EU) 2025/2083 already present in CBAM pool?`);
console.log(`  as a pool URL (fetched/discovered): ${inUrl.length}${inUrl.length ? " -> " + inUrl.map((p) => p.result_url).join(", ") : "  (NO)"}`);
console.log(`  mentioned in any pool excerpt text : ${inText.length} row(s)`);

// also: is the postponement fact text present in any EUR-Lex pool row (would let it ground T1 already)?
const eurlexRows = pool.filter((p) => /eur-lex/i.test(p.result_url || ""));
console.log(`\n  EUR-Lex pool rows: ${eurlexRows.length} (these resolve T1). Do any contain "1 February 2027" / "February 2027"?`);
for (const p of eurlexRows) console.log(`    ${p.result_url.slice(0, 60)}  -> "1 February 2027": ${/1 february 2027|february 2027/i.test(p.result_content_excerpt || "")}`);
process.exit(0);
