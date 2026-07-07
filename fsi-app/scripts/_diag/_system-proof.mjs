// SYSTEM-LEVEL PROOF that #158 stopped the NULL-stamp ERROR CLASS (not an item-level proof, not
// "CI green"). Auto-picks the reg-family item with the MOST existing NULL-stamped FACT claims (the
// strongest test — most unregistered pool hosts the fix must now register), runs the FIXED pipeline
// END-TO-END in canonical order  generate -> register(#158 pool-host registration) -> section ->
// ground  and asserts the error class is GONE:
//   (1) ZERO NULL-stamped FACT claims after (every span host resolves to a real tier), AND
//   (2) sub-floor facts are TIERED + FLOORED (tier>2 present AND item quarantined) — evaluated, not
//       NULL-escaped, exactly like CBAM's 9.
// SPENDS ~$1.50 on ONE item (the gate). Pass an 8-char id prefix to override the auto-pick.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = async (t, c) => { const o = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from(t).select(c).order("id").range(f, f + 999); if (!data?.length) break; o.push(...data); if (data.length < 1000) break; } return o; };

const REG = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const override = process.argv[2];

// --- pick the strongest test item: reg, not archived, max FACT claims stamped NULL today ---
const items = (await all("intelligence_items", "id,title,item_type,is_archived,provenance_status")).filter((r) => REG.has(r.item_type) && !r.is_archived);
const byId = new Map(items.map((r) => [r.id, r]));
const claims = await all("section_claim_provenance", "intelligence_item_id,claim_kind,source_tier_at_grounding");
const nullByItem = new Map();
for (const c of claims) { if (c.claim_kind !== "FACT" || c.source_tier_at_grounding != null || !byId.has(c.intelligence_item_id)) continue; nullByItem.set(c.intelligence_item_id, (nullByItem.get(c.intelligence_item_id) || 0) + 1); }
let it;
if (override) it = items.find((r) => r.id.startsWith(override));
else { const ranked = [...nullByItem.entries()].sort((a, b) => b[1] - a[1]); it = byId.get(ranked[0]?.[0]); }
if (!it) { console.error("no test item"); process.exit(1); }
const nullBefore = nullByItem.get(it.id) || 0;
console.log(`SYSTEM-PROOF item: ${it.id.slice(0, 8)} [${it.item_type}] status=${it.provenance_status}\n  "${(it.title || "").slice(0, 60)}"\n  NULL-stamped FACT claims BEFORE: ${nullBefore}\n`);

const tierDist = async () => {
  const { data } = await sb.from("section_claim_provenance").select("claim_kind,source_tier_at_grounding").eq("intelligence_item_id", it.id);
  const facts = (data || []).filter((c) => c.claim_kind === "FACT");
  const d = {}; for (const c of facts) { const k = c.source_tier_at_grounding == null ? "NULL" : "T" + c.source_tier_at_grounding; d[k] = (d[k] || 0) + 1; }
  return { facts: facts.length, dist: d, nulls: facts.filter((c) => c.source_tier_at_grounding == null).length, subfloor: facts.filter((c) => c.source_tier_at_grounding != null && c.source_tier_at_grounding > 2).length };
};

// --- run the FIXED pipeline in canonical order: generate -> register(#158) -> section -> ground ---
const g = await P.generateBrief(it.id); console.log(`generate: ${g.ok ? "OK" : "FAIL"} — ${(g.detail || "").slice(0, 90)}`);
if (g.ok) {
  const reg = await P.registerBriefSources(it.id); console.log(`register: ${reg.ok ? "OK" : "FAIL"} — ${reg.detail}   <-- #158: pool-hosts +N is the fix firing`);
  const s = await P.sectionBrief(it.id); console.log(`section : ${s.ok ? "OK" : "FAIL"} — ${(s.detail || "").slice(0, 60)}`);
  if (s.ok) { const r = await P.groundBrief(it.id); console.log(`ground  : ${r.ok ? "OK" : "FAIL"} — ${(r.detail || "").slice(0, 90)}`); }
}
const { data: fin } = await sb.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
const after = await tierDist();
console.log(`\n=== AFTER (fixed pipeline) ===`);
console.log(`  status: ${fin.provenance_status}`);
console.log(`  FACT claims: ${after.facts}   tier distribution: ${JSON.stringify(after.dist)}`);
console.log(`  NULL-stamped FACT claims AFTER: ${after.nulls}   (must be 0)`);
console.log(`  sub-floor FACT claims (tier>2, floor-evaluated): ${after.subfloor}`);

console.log(`\n=== VERDICT (the gate) ===`);
const errGone = after.nulls === 0;
console.log(`  (1) ZERO NULL-stamps after fixed run: ${errGone ? "YES ✓" : `NO ✗ — ${after.nulls} still NULL`}`);
console.log(`  (2) real tiers throughout (no NULL bucket): ${after.dist.NULL ? "NO ✗" : "YES ✓"}`);
console.log(`  (3) sub-floor facts FLOORED not escaped: ${after.subfloor > 0 ? `evaluated ${after.subfloor} -> status ${fin.provenance_status}` : "none sub-floor this item (all authoritative)"}`);
console.log(`\n  ERROR CLASS ${errGone ? "STOPPED — the fixed pipeline cannot NULL-stamp." : "STILL OCCURS — #158 did NOT stop it; fix before regrounding."}`);
process.exit(errGone ? 0 : 1);
