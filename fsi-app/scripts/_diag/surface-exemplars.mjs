/** Build-contract exemplar validation: ONE item per surface (Market, Technology, Operations) end-to-end
 *  through the canonical deep-dive pipeline, with slots now seeded. Proves each format grounds (or
 *  quarantines honestly) before any scaling. Metered: 3 items.
 *    node scripts/_diag/surface-exemplars.mjs */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SURFACES = [
  { label: "market", types: ["market_signal", "initiative"] },
  { label: "technology", types: ["technology", "innovation", "tool"] },
  { label: "operations", types: ["regional_data"] },
];

const isReal = (u) => /^https?:\/\//i.test(u || "") && !/^https?:\/\/[^/]+\/?$/.test(u || ""); // has a path, not bare host

for (const s of SURFACES) {
  const { data: items } = await sb.from("intelligence_items")
    .select("id,title,item_type,source_url,provenance_status,full_brief")
    .in("item_type", s.types).eq("is_archived", false).not("source_url", "is", null).limit(60);
  // prefer a real (path-bearing) URL that is not already verified
  const cand = (items || []).filter((r) => isReal(r.source_url) && r.provenance_status !== "verified")
    .sort((a, b) => (a.full_brief ? 1 : 0) - (b.full_brief ? 1 : 0))[0] || (items || [])[0];
  if (!cand) { console.log(`\n[${s.label}] no candidate item`); continue; }
  const t0 = Date.now();
  console.log(`\n[${s.label}] ${cand.id.slice(0, 8)} ${(cand.title || "").slice(0, 50)}  (${cand.item_type})\n  source=${cand.source_url}`);
  try {
    const g = await P.generateBrief(cand.id); console.log(`  generate: ${g.ok ? "OK" : "FAIL"} ${g.detail}`);
    if (!g.ok) { console.log(`  => stop (generate failed)`); continue; }
    const se = await P.sectionBrief(cand.id); console.log(`  section : ${se.ok ? "OK" : "FAIL"} ${se.detail}`);
    if (!se.ok) { console.log(`  => stop (section failed)`); continue; }
    const gr = await P.groundBrief(cand.id); console.log(`  ground  : ${gr.ok ? "OK" : "FAIL"} ${gr.detail}`);
    if (gr.ok) { const gw = await P.growSources(cand.id); console.log(`  grow    : ${gw.ok ? "OK" : "FAIL"} ${gw.detail}`); }
    const { data: fin } = await sb.from("intelligence_items").select("provenance_status").eq("id", cand.id).single();
    const { count: secN } = await sb.from("intelligence_item_sections").select("id", { count: "exact", head: true }).eq("item_id", cand.id);
    const { count: factN } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", cand.id).eq("claim_kind", "FACT");
    console.log(`  => ${fin?.provenance_status?.toUpperCase()}  sections=${secN} FACT=${factN}  ${Math.round((Date.now() - t0) / 1000)}s`);
  } catch (e) { console.log(`  EXCEPTION: ${String(e.message || e).slice(0, 160)}`); }
}
console.log("\n=== exemplar validation done ===");
process.exit(0);
