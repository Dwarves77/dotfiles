// READ-ONLY: is the convergence engine's output stranded (effective_tier never diverges) or LEAKING
// (q7 writes `tier` -> 094 shim propagates to base_tier -> base_tier mutated by reputation)?
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// pull all sources
let srcs = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await sb.from("sources").select("id,base_tier,effective_tier,tier,tier_override").order("id").range(f, f + 999);
  if (error) { console.error("sources:", error.message); break; }
  if (!data?.length) break; srcs.push(...data); if (data.length < 1000) break;
}
console.log(`sources: ${srcs.length}`);
const nn = (v) => v == null ? "NULL" : v;
let effNull = 0, effEqBase = 0, effDiverge = 0, tierNeBase = 0;
const diverged = [];
for (const s of srcs) {
  if (s.effective_tier == null) effNull++;
  else if (s.effective_tier === s.base_tier) effEqBase++;
  else { effDiverge++; if (diverged.length < 10) diverged.push(`${s.id.slice(0,8)} base=${nn(s.base_tier)} eff=${nn(s.effective_tier)} tier=${nn(s.tier)} ovr=${nn(s.tier_override)}`); }
  if (s.tier !== s.base_tier) tierNeBase++;
}
console.log(`effective_tier: NULL=${effNull}  ==base_tier=${effEqBase}  DIVERGES from base_tier=${effDiverge}`);
console.log(`tier != base_tier (shim broken?): ${tierNeBase}`);
if (diverged.length) { console.log("diverged samples:"); diverged.forEach(d => console.log("  " + d)); }

// did the q7 cron ever actually change a tier? (source_trust_events from the worker)
const { data: ev, error: evErr } = await sb.from("source_trust_events")
  .select("event_type,created_by,created_at").in("event_type", ["tier_promotion", "tier_demotion"]).order("created_at", { ascending: false }).limit(2000);
if (evErr) console.log("source_trust_events err:", evErr.message);
else {
  console.log(`\ntier_promotion/demotion events total: ${ev.length}`);
  const byCreator = {}; for (const e of ev) byCreator[e.created_by||"?"] = (byCreator[e.created_by||"?"]||0)+1;
  console.log("by created_by:", JSON.stringify(byCreator));
  if (ev.length) console.log(`most recent: ${ev[0].created_at} (${ev[0].event_type}, by ${ev[0].created_by})`);
  const workerEv = ev.filter(e => e.created_by === "worker");
  console.log(`q7-cron (created_by=worker) tier-change events: ${workerEv.length}` + (workerEv.length ? ` — these WROTE sources.tier -> 094 shim -> base_tier (potential moat leak)` : ` — cron has never changed a tier (stranded, no leak yet)`));
}
process.exit(0);
