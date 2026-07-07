// TRUNCATION EXPOSURE (read-only): how many VERIFIED items were synthesised/grounded against a source
// LONGER than the pipeline's caps (synthesis 12KB, grounding 16KB, browserless fetch 100KB). For each
// verified item, take the MAX stored result_content_excerpt length across its pool rows and bucket it.
// A source longer than 12-16KB means the brief was written/grounded against only the first slice of it.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const sb = readClient();

async function pageAll(table, cols, applyMatch) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols).order("id").range(from, from + 999);
    if (applyMatch) q = applyMatch(q);
    const { data, error } = await q; if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
  }
  return rows;
}

const REG_FAMILY = ["regulation", "directive", "standard", "guidance", "framework"];
const items = await pageAll("intelligence_items", "id,item_type,provenance_status",
  (q) => q.eq("provenance_status", "verified").eq("is_archived", false));
const itemById = new Map(items.map((i) => [i.id, i]));
// pull pool rows (only the content-bearing generate/ground rows carry source text)
const pool = await pageAll("agent_run_searches", "intelligence_item_id,result_content_excerpt,search_query");

const maxLen = new Map();        // itemId -> max excerpt length
const maxLenReg = new Map();
for (const r of pool) {
  if (!itemById.has(r.intelligence_item_id)) continue;
  const len = (r.result_content_excerpt || "").length;
  if (len <= 200) continue; // stubs/leads, not source content
  const cur = maxLen.get(r.intelligence_item_id) || 0;
  if (len > cur) maxLen.set(r.intelligence_item_id, len);
}
for (const [id, len] of maxLen) if (REG_FAMILY.includes(itemById.get(id).item_type)) maxLenReg.set(id, len);

function buckets(m) {
  const b = { "<=12KB (fine)": 0, "12-16KB (synthesis-truncated)": 0, "16-100KB (synth+ground truncated)": 0, "==100KB (fetch-capped, severe)": 0 };
  for (const len of m.values()) {
    if (len <= 12000) b["<=12KB (fine)"]++;
    else if (len <= 16000) b["12-16KB (synthesis-truncated)"]++;
    else if (len < 100000) b["16-100KB (synth+ground truncated)"]++;
    else b["==100KB (fetch-capped, severe)"]++;
  }
  return b;
}

const all = buckets(maxLen), reg = buckets(maxLenReg);
console.log(`══ TRUNCATION EXPOSURE — verified items, by longest stored source excerpt ══`);
console.log(`verified items with >=1 content source: ${maxLen.size}  (reg-family: ${maxLenReg.size})`);
console.log(`\nALL verified items:`);
for (const [k, v] of Object.entries(all)) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log(`\nREG-FAMILY verified items (where missing exceptions change legal meaning):`);
for (const [k, v] of Object.entries(reg)) console.log(`  ${String(v).padStart(4)}  ${k}`);
const truncAll = all["12-16KB (synthesis-truncated)"] + all["16-100KB (synth+ground truncated)"] + all["==100KB (fetch-capped, severe)"];
const truncReg = reg["12-16KB (synthesis-truncated)"] + reg["16-100KB (synth+ground truncated)"] + reg["==100KB (fetch-capped, severe)"];
console.log(`\n>>> synthesis-truncated (source > 12KB synthesis cap): ALL ${truncAll}/${maxLen.size}, REG ${truncReg}/${maxLenReg.size}`);
console.log(`    NOTE: LOWER BOUND — sources are already fetch-capped at 100KB, so any source >=100KB shows as 100000`);
console.log(`    and the true original length (and true truncation) is larger than stored.`);
// length distribution percentiles
const lens = [...maxLen.values()].sort((a, b) => a - b);
const pct = (p) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))];
console.log(`\nmax-excerpt length percentiles (all verified): p50=${pct(0.5)} p75=${pct(0.75)} p90=${pct(0.9)} p99=${pct(0.99)} max=${lens[lens.length - 1]}`);
process.exit(0);
