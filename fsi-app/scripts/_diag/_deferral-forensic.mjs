// READ-ONLY forensic: are the standing deferrals genuine individual dispositions or a bulk mass-silence?
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let rows = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await sb.from("integrity_flags")
    .select("subject_ref,created_at,created_by,status,recommended_actions")
    .eq("created_by", "disposition_deferred").order("created_at").range(f, f + 999);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
}
console.log(`disposition_deferred flags total: ${rows.length}`);
const open = rows.filter(r => r.status === "open");
console.log(`  open: ${open.length}`);

// creation-time clustering (bulk = many in one minute)
const byMin = {};
for (const r of rows) { const m = String(r.created_at).slice(0,16); byMin[m] = (byMin[m]||0)+1; }
const clusters = Object.entries(byMin).sort((a,b)=>b[1]-a[1]).slice(0,8);
console.log(`  creation clusters (minute -> count):`); for (const [m,n] of clusters) console.log(`    ${m}  ${n}`);

// distinct reasons + owners + resolution_events (genuine = varied + specific; dodge = identical generic)
const reasons = {}, owners = {}, events = {};
for (const r of rows) {
  const ra = r.recommended_actions;
  let p = null;
  if (Array.isArray(ra)) { for (const e of ra) { if (e?.deferral) { p = e.deferral; break; } } if (!p && ra[0]?.reason) p = ra[0]; }
  else if (ra && typeof ra === "object") p = ra.deferral || (ra.reason ? ra : null);
  if (!p) { reasons["(no-payload)"] = (reasons["(no-payload)"]||0)+1; continue; }
  reasons[String(p.reason||"(none)").slice(0,60)] = (reasons[String(p.reason||"(none)").slice(0,60)]||0)+1;
  owners[String(p.owner||"(none)")] = (owners[String(p.owner||"(none)")]||0)+1;
  events[String(p.resolution_event||"(none)").slice(0,50)] = (events[String(p.resolution_event||"(none)")||"(none)"]||0)+1;
}
const showTop = (o,label) => { const e = Object.entries(o).sort((a,b)=>b[1]-a[1]); console.log(`  distinct ${label}: ${e.length}`); for (const [k,n] of e.slice(0,8)) console.log(`    ${n}x  ${k}`); };
showTop(reasons, "reasons");
showTop(owners, "owners");
showTop(events, "resolution_events");
process.exit(0);
