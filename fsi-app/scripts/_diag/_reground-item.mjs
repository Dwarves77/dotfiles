// REUSABLE backward-batch re-ground runner (one item). Optional guarded promote-from-pool (Stage 1
// portal re-point), then the FIXED pipeline END-TO-END in canonical order: generate -> register(#158
// pool-host registration) -> section -> ground. Reports the UNIVERSAL GATE (must hold every item):
// ZERO NULL-stamped FACT claims after; plus status, tier distribution, and light density/legal probes.
// Honest quarantine (sub-floor facts the floor now evaluates) is an EXPECTED, correct outcome — it is
// research-or-erase, NOT a failure of the run. SPENDS ~$1-1.5 per item.
//   node _reground-item.mjs <idPrefix> [--promote]
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const HERE = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const prefix = process.argv[2];
const doPromote = process.argv.includes("--promote");
const useStored = process.argv.includes("--stored");
const useRefreshPrimary = process.argv.includes("--refresh-primary"); // Path B: re-fetch full enacted text (#155, free) -> reuse pool corroborators -> stored re-synth, NO web_search
// --stored = the PRODUCTION no-web_search default (generateBriefFromStored): re-synthesise + re-ground
// against the EXISTING pool, zero web_search. Mirrors what /api/agent/run -> generateStep(refresh=false)
// actually runs. Default (no flag) = generateBrief (fresh web_search) for fallback/first-build proves.
if (!prefix) { console.error("usage: _reground-item.mjs <idPrefix> [--promote]"); process.exit(2); }

const { data: rows } = await sb.from("intelligence_items").select("id,title,item_type,source_url,provenance_status,is_archived").eq("is_archived", false);
const it = (rows || []).find((r) => r.id.startsWith(prefix));
if (!it) { console.error(`item ${prefix}* not found`); process.exit(1); }

const factStats = async () => {
  const { data } = await sb.from("section_claim_provenance").select("claim_kind,source_tier_at_grounding").eq("intelligence_item_id", it.id);
  const facts = (data || []).filter((c) => c.claim_kind === "FACT");
  const d = {}; for (const c of facts) { const k = c.source_tier_at_grounding == null ? "NULL" : "T" + c.source_tier_at_grounding; d[k] = (d[k] || 0) + 1; }
  return { facts: facts.length, dist: d, nulls: facts.filter((c) => c.source_tier_at_grounding == null).length };
};

const before = await factStats();
console.log(`RE-GROUND ${it.id.slice(0, 8)} [${it.item_type}] status=${it.provenance_status}  "${(it.title || "").slice(0, 52)}"`);
console.log(`  source: ${it.source_url}`);
console.log(`  BEFORE: FACT=${before.facts} NULL=${before.nulls} dist=${JSON.stringify(before.dist)}\n`);

if (doPromote) {
  const pr = spawnSync(process.execPath, [resolve(HERE, "_reg-promote-from-pool.mjs"), "--apply", prefix], { encoding: "utf8" });
  console.log("PROMOTE:\n  " + (pr.stdout || pr.stderr || "").trim().split("\n").join("\n  "));
  if (pr.status !== 0) { console.error("promote refused/failed — HALT (no reground)."); process.exit(1); }
  const { data: re } = await sb.from("intelligence_items").select("source_url").eq("id", it.id).single();
  console.log(`  source now: ${re?.source_url}\n`);
}

// FIXED pipeline, canonical order (register is the #158 step — runs between generate and section).
const g = useRefreshPrimary ? await P.generateBriefRefreshPrimary(it.id) : useStored ? await P.generateBriefFromStored(it.id) : await P.generateBrief(it.id);
console.log(`generate(${useRefreshPrimary ? "REFRESH-PRIMARY/no-web_search" : useStored ? "STORED/no-web_search" : "fresh/web_search"}): ${g.ok ? "OK" : "FAIL"} — ${(g.detail || "").slice(0, 110)}`);
if (g.ok) {
  const reg = await P.registerBriefSources(it.id); console.log(`register: ${reg.ok ? "OK" : "FAIL"} — ${reg.detail}`);
  const s = await P.sectionBrief(it.id); console.log(`section : ${s.ok ? "OK" : "FAIL"} — ${(s.detail || "").slice(0, 60)}`);
  if (s.ok) { const r = await P.groundBrief(it.id); console.log(`ground  : ${r.ok ? "OK" : "FAIL"} — ${(r.detail || "").slice(0, 88)}`); }
}

const { data: fin } = await sb.from("intelligence_items").select("provenance_status, full_brief").eq("id", it.id).single();
const after = await factStats();
const b = fin.full_brief || "";
console.log(`\n=== AFTER ===`);
console.log(`  status: ${fin.provenance_status}   brief=${b.length}ch`);
console.log(`  FACT=${after.facts}  NULL=${after.nulls}  dist=${JSON.stringify(after.dist)}`);
// light probes (generic): legal-line negative (no role assertion) + Article-3 anchoring + qualification markers
const overstep = (b.match(/workspace (is|as) (the |an |a )?(producer|importer|manufacturer|operator|trader|declarant|distributor)/gi) || []).length;
const art3 = (b.match(/article 3|art\.? ?3\b/gi) || []).length;
const quals = (b.match(/\bexcept\b|shall not apply|does not apply|provided that|by way of derogation|Legal Confirmation Required/gi) || []).length;
console.log(`  legal-line: ${overstep === 0 ? "HELD ✓" : `OVERSTEP ✗ (${overstep})`}   Article-3 anchors=${art3}   qualification markers=${quals}`);
console.log(`\n=== GATE ===`);
console.log(`  ZERO NULL-stamps: ${after.nulls === 0 ? "YES ✓" : `NO ✗ (${after.nulls})`}`);
console.log(`  disposition: ${fin.provenance_status === "verified" ? "VERIFIED" : `${fin.provenance_status} (honest — research-or-erase, NOT a failure)`}`);
process.exit(after.nulls === 0 ? 0 : 1);
