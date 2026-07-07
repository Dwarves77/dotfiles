// READ-ONLY duplicate-CLASSIFICATION map (no merges). Uses the CANONICAL resolver grouping
// (institution.ts hostInstitution — encodes super-domain splits so eur-lex/ec/eea stay distinct)
// + url-canonicalize for exact-dup detection. Separates TRUE-DUPLICATE rows from legitimately-distinct
// sources, gives the honest distinct-source count, and surfaces tier conflicts collapsing would force.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { hostOf, hostInstitution } = await jiti.import("../../src/lib/sources/institution.ts");
const { canonicalizeUrl } = await jiti.import("../../src/lib/sources/url-canonicalize.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let rows = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await sb.from("sources").select("id,url,name,status,base_tier,effective_tier,tier_override").order("id").range(f, f + 999);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
}
const canon = (u) => { try { return canonicalizeUrl(u); } catch { return (u||"").toLowerCase(); } };
for (const r of rows) { r._host = hostOf(r.url); r._inst = hostInstitution(r._host) || "(none)"; r._canon = canon(r.url); }

const distinct = (arr) => new Set(arr).size;
const statusOf = (rs) => { const m={}; for (const r of rs) m[r.status]=(m[r.status]||0)+1; return m; };
console.log(`========== SOURCE-ROW vs ACTUAL-SOURCE MAP ==========`);
console.log(`source ROWS (table count): ${rows.length}   [status: ${JSON.stringify(statusOf(rows))}]`);
console.log(`distinct HOSTS: ${distinct(rows.map(r=>r._host))}`);
console.log(`distinct INSTITUTIONS (hostInstitution, super-domain-aware) = ACTUAL SOURCES: ${distinct(rows.map(r=>r._inst))}`);
console.log(`distinct CANONICAL URLs: ${distinct(rows.map(r=>r._canon))}`);
const active = rows.filter(r=>r.status==="active");
console.log(`\nACTIVE rows: ${active.length}  -> distinct active institutions (actual active sources): ${distinct(active.map(r=>r._inst))}`);
const prov = rows.filter(r=>r.status==="provisional");
console.log(`PROVISIONAL rows: ${prov.length}  -> distinct provisional institutions: ${distinct(prov.map(r=>r._inst))}`);

// redundancy
const redundantRows = rows.length - distinct(rows.map(r=>r._inst));
console.log(`\nREDUNDANT rows (rows - distinct institutions): ${redundantRows}  (these are NOT distinct sources)`);

// EXACT duplicates: same canonical URL on >1 row (unambiguous true dup)
const byCanon = {}; for (const r of rows) (byCanon[r._canon] ??= []).push(r);
const exactDup = Object.entries(byCanon).filter(([,rs])=>rs.length>1);
const exactDupRows = exactDup.reduce((n,[,rs])=>n+(rs.length-1),0);
console.log(`\n--- EXACT DUPLICATES (same canonical URL, multiple rows = unambiguous) ---`);
console.log(`exact-dup URL clusters: ${exactDup.length} | extra rows (collapse-safe): ${exactDupRows}`);
for (const [u,rs] of exactDup.sort((a,b)=>b[1].length-a[1].length).slice(0,12))
  console.log(`  ${rs.length}x  tiers={${[...new Set(rs.map(r=>r.base_tier))].join(",")}}  ${u.slice(0,72)}`);

// cluster by institution
const byInst = {}; for (const r of rows) (byInst[r._inst] ??= []).push(r);
const multi = Object.entries(byInst).filter(([,rs])=>rs.length>1).sort((a,b)=>b[1].length-a[1].length);
console.log(`\n--- MULTI-ROW INSTITUTION CLUSTERS (candidate duplicates, super-domain-aware grouping) ---`);
console.log(`institutions with >1 row: ${multi.length}`);
console.log(`TOP CLUSTERS (institution | rows | distinct hosts | distinct canon-URLs | base_tiers | overrides | status):`);
for (const [inst,rs] of multi.slice(0,25)) {
  const tiers=[...new Set(rs.map(r=>r.base_tier))].sort(); const ov=rs.filter(r=>r.tier_override!=null).length;
  console.log(`  ${inst.padEnd(26)} rows=${String(rs.length).padStart(3)} hosts=${String(distinct(rs.map(r=>r._host))).padStart(2)} canon=${String(distinct(rs.map(r=>r._canon))).padStart(3)} tiers={${tiers.join(",")}}${ov?` ovr=${ov}`:""} ${JSON.stringify(statusOf(rs))}`);
}

// TIER CONFLICTS: cluster rows carry >1 distinct base_tier with NO override -> collapse forces a tier decision
const tierConflicts = multi.filter(([,rs])=>new Set(rs.filter(r=>r.tier_override==null).map(r=>r.base_tier)).size>1);
console.log(`\n--- TIER CONFLICTS (same institution, rows at DIFFERENT base_tier, no override) — collapse must resolve these ---`);
console.log(`conflicted institutions: ${tierConflicts.length}`);
for (const [inst,rs] of tierConflicts.sort((a,b)=>b[1].length-a[1].length).slice(0,30)) {
  const dist={}; for (const r of rs){ const k=r.base_tier; dist[k]=(dist[k]||0)+1; }
  console.log(`  ${inst.padEnd(26)} rows=${rs.length} base_tiers=${JSON.stringify(dist)}`);
}

// europa.eu family — explicit, to confirm eur-lex/ec/eea stay DISTINCT (not merged)
console.log(`\n--- europa.eu FAMILY (confirm distinct EU bodies are NOT collapsed) ---`);
const euFam = Object.entries(byInst).filter(([k])=>k.includes("europa.eu")).sort((a,b)=>b[1].length-a[1].length);
for (const [inst,rs] of euFam) console.log(`  ${inst.padEnd(30)} rows=${String(rs.length).padStart(3)} tiers={${[...new Set(rs.map(r=>r.base_tier))].sort().join(",")}} ${JSON.stringify(statusOf(rs))}`);

// provisional share of the redundancy
const redundantProvisional = multi.reduce((n,[,rs])=>{ const extra=rs.length-1; const provInExtra=Math.min(extra, rs.filter(r=>r.status==="provisional").length); return n+provInExtra; },0);
console.log(`\n--- PROVISIONAL SHARE OF REDUNDANCY ---`);
console.log(`of the multi-row clusters, provisional rows: ${multi.reduce((n,[,rs])=>n+rs.filter(r=>r.status==="provisional").length,0)} | active: ${multi.reduce((n,[,rs])=>n+rs.filter(r=>r.status==="active").length,0)}`);
console.log(`(dedup of these overlaps the provisional-triage backlog)`);
process.exit(0);
