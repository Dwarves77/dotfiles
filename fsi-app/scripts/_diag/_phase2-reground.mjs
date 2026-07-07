// Phase 2 RE-GROUND probe (read-only) + 50ccd5cc details. Grounds the hierarchy plan in real data:
// institution grouping reality, multi-page rows, exact-URL dups, per-institution base_tier conflicts,
// sinir rows, institution_id backfill state. Plus the substrate-agreement item for the operator's look.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { hostOf, hostInstitution } = await jiti.import("../../src/lib/sources/institution.ts");
const sb = readClient();

const canon = (u) => { try { const x = new URL(u); return (x.host.replace(/^www\./, "") + x.pathname.replace(/\/$/, "")).toLowerCase(); } catch { return (u || "").toLowerCase(); } };

// ───────────────────────── 50ccd5cc (substrate-agreement) ─────────────────────────
console.log("════════ 50ccd5cc — substrate-agreement item (release-vs-keep look) ════════");
const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,provenance_status,is_archived,source_id,source_url,agent_integrity_flag,agent_integrity_phrase,regeneration_skill_version,updated_at");
const it = items.find((i) => i.id.startsWith("50ccd5cc"));
if (!it) { console.log("  NOT FOUND"); }
else {
  console.log(`  id=${it.id}`);
  console.log(`  title: ${it.title}`);
  console.log(`  type=${it.item_type} priority=${it.priority} provenance_status=${it.provenance_status} archived=${it.is_archived}`);
  console.log(`  source_url: ${it.source_url}`);
  console.log(`  regeneration_skill_version: ${it.regeneration_skill_version}  updated_at: ${it.updated_at}`);
  console.log(`  agent_integrity_flag: ${it.agent_integrity_flag}  phrase: ${it.agent_integrity_phrase ?? "—"}`);
  const { data: flags } = await sb.from("integrity_flags").select("category,subject_type,subject_ref,description,status,created_by,created_at").eq("subject_ref", it.id);
  console.log(`  platform integrity_flags (subject_ref=item): ${flags?.length || 0}`);
  for (const f of flags || []) console.log(`    [${f.status}] ${f.category}/${f.subject_type} by ${f.created_by}: ${f.description}`);
  const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const v = Array.isArray(vr) ? vr[0] : vr;
  console.log(`  validate() NOW: valid=${v?.valid} recommended=${v?.recommended_status} failures=${JSON.stringify(v?.failures)?.slice(0, 300)}`);
  const { data: br } = await sb.from("intelligence_items").select("full_brief").eq("id", it.id).single();
  console.log(`  full_brief (first 400ch): ${(br?.full_brief || "").slice(0, 400).replace(/\n/g, " ")}`);
}

// ───────────────────────── Phase 2 hierarchy reality ─────────────────────────
console.log("\n════════ Phase 2 — source hierarchy reality ════════");
const sources = await readAll("sources", "id,url,name,base_tier,tier_override,effective_tier,status,institution_id");
const insts = await readAll("institutions", "id,name,registrable_domain");
const active = sources.filter((s) => s.status === "active");
console.log(`sources: ${sources.length} (active ${active.length}) | institutions table rows: ${insts.length} | sources with institution_id: ${sources.filter((s) => s.institution_id).length}`);

// group by eTLD+1 (the resolver's key)
const byInst = new Map();
for (const s of sources) { const k = hostInstitution(hostOf(s.url)); if (!k) continue; (byInst.get(k) || byInst.set(k, []).get(k)).push(s); }
const multi = [...byInst.entries()].filter(([, rows]) => rows.length > 1);
const multiPageRows = multi.reduce((n, [, rows]) => n + rows.length, 0);
console.log(`institution groups (eTLD+1): ${byInst.size} | multi-source groups: ${multi.length} | rows in multi-source groups: ${multiPageRows}`);
console.log(`  largest groups: ${multi.sort((a,b)=>b[1].length-a[1].length).slice(0,8).map(([k,r])=>`${k}(${r.length})`).join(" ")}`);

// per-institution base_tier conflict (the one-tier-per-host reds): >1 distinct non-null base_tier, no override
const conflicts = multi.filter(([, rows]) => {
  const tiers = new Set(rows.filter((r) => r.base_tier != null && r.tier_override == null).map((r) => r.base_tier));
  return tiers.size > 1;
});
console.log(`\nbase_tier CONFLICTS (>1 distinct base_tier, no override — the one-tier-per-host reds): ${conflicts.length}`);
for (const [k, rows] of conflicts) console.log(`  ${k}: tiers ${[...new Set(rows.map((r)=>r.base_tier))].join("/")} across ${rows.length} rows`);

// exact-URL dups (same canonical url across >1 source row)
const byUrl = new Map();
for (const s of sources) { const c = canon(s.url); (byUrl.get(c) || byUrl.set(c, []).get(c)).push(s); }
const dups = [...byUrl.entries()].filter(([, rows]) => rows.length > 1);
console.log(`\nexact-URL dups (same canonical url, >1 source row): ${dups.length} url(s), ${dups.reduce((n,[,r])=>n+r.length,0)} rows`);
for (const [u, rows] of dups.slice(0, 10)) console.log(`  ${u} -> ${rows.length} rows [tiers ${rows.map((r)=>r.base_tier ?? "·").join(",")}] [status ${[...new Set(rows.map((r)=>r.status))].join(",")}]`);

// sinir
console.log(`\nsinir.gov.br rows:`);
for (const s of sources.filter((s) => hostInstitution(hostOf(s.url)) === "sinir.gov.br")) console.log(`  ${s.id.slice(0,8)} base_tier=${s.base_tier} override=${s.tier_override} status=${s.status} inst_id=${s.institution_id?"set":"null"} ${s.url}`);
