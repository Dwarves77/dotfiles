// READ-ONLY: is 1185 sources inflated? break down by status/admin_only/base_tier + institution dedup ratio.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let rows = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await sb.from("sources").select("id,url,name,status,admin_only,base_tier,created_at").order("id").range(f, f + 999);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
}
console.log(`TOTAL source rows: ${rows.length}`);

const tally = (key, fn) => { const m = {}; for (const r of rows) { const k = fn(r); m[k] = (m[k]||0)+1; } console.log(`\nby ${key}:`); Object.entries(m).sort((a,b)=>b[1]-a[1]).forEach(([k,n]) => console.log(`  ${String(k).padEnd(22)} ${n}`)); };
tally("status", r => r.status ?? "NULL");
tally("admin_only", r => String(r.admin_only));
tally("base_tier", r => r.base_tier ?? "NULL");

// institution dedup: eTLD+1 approximation
const host = (u) => { try { return new URL(u).host.replace(/^www\./,"").toLowerCase(); } catch { return "(bad-url)"; } };
const inst = (h) => { const p = h.split("."); return p.length <= 2 ? h : p.slice(-2).join("."); };
const byHost = {}, byInst = {};
for (const r of rows) { const h = host(r.url); byHost[h]=(byHost[h]||0)+1; byInst[inst(h)]=(byInst[inst(h)]||0)+1; }
console.log(`\ndistinct hosts: ${Object.keys(byHost).length} | distinct institutions (eTLD+1): ${Object.keys(byInst).length}`);
console.log(`row:institution inflation = ${(rows.length/Object.keys(byInst).length).toFixed(2)}x`);

// ACTIVE & processable (the doctrine gate: status='active' AND admin_only=false)
const active = rows.filter(r => r.status === "active" && r.admin_only === false);
console.log(`\nACTIVE & processable (status=active AND admin_only=false): ${active.length}`);
const activeInst = {}; for (const r of active) activeInst[inst(host(r.url))] = 1;
console.log(`  distinct institutions among active: ${Object.keys(activeInst).length}`);

// top institutions by row count (duplicate hotspots)
console.log(`\ntop 15 institutions by row count (duplicate-row hotspots):`);
Object.entries(byInst).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([k,n]) => console.log(`  ${k.padEnd(28)} ${n}`));
process.exit(0);
