/** RESTORE JOLT 388b2ce8 to its original RICH researched exemplar from version history.
 * I erased it by re-running the thin single-source canonical generate; the platform's
 * intelligence_item_versions retained the original (ver 8fa40e91, 18937ch, multi-source:
 * Cambridge + Motor Transport + Commercial Motor). This puts that exact brief back live,
 * re-derives sections from it (deterministic, no LLM), then re-grounds + re-grows so the
 * rich corroboration + verified state are restored from the original document.
 *
 *   node scripts/restore-jolt.mjs
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { extractResearchSections } = await jiti.import("../src/lib/agent/extract-research-sections.ts");
const { groundBrief, growSources } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ID = "388b2ce8-1740-4e61-b3c6-a890ab4bdd03";
const VER = "8fa40e91"; // the 18937ch original

// 1. pull the original version
const { data: vers } = await sb.from("intelligence_item_versions").select("*").eq("intelligence_item_id", ID).order("created_at", { ascending: false });
const v = (vers || []).find((r) => r.id.startsWith(VER)) || (vers || []).sort((a, b) => (b.full_brief || "").length - (a.full_brief || "").length)[0];
if (!v) { console.error("original version not found"); process.exit(1); }
console.log(`restoring from version ${v.id.slice(0, 8)} — ${(v.full_brief || "").length}ch, v#${v.version_number}, ${v.created_at}`);

// 2. restore brief + metadata onto the live item (provenance reset so ground re-validates)
const u = await sb.from("intelligence_items").update({
  full_brief: v.full_brief,
  severity: v.severity, priority: v.priority, urgency_tier: v.urgency_tier,
  topic_tags: v.topic_tags, operational_scenario_tags: v.operational_scenario_tags,
  compliance_object_tags: v.compliance_object_tags, related_items: v.related_items,
  intersection_summary: v.intersection_summary,
  provenance_status: "quarantined",
}).eq("id", ID);
console.log("restore brief+metadata:", u.error ? "ERR " + u.error.message : "ok");

// 3. clear the thin-regen ledger so ground re-extracts from the RICH brief
await sb.from("section_claim_provenance").delete().eq("intelligence_item_id", ID);
await sb.from("agent_run_searches").delete().eq("intelligence_item_id", ID);
// reset subject convergence so grow recomputes from the rich corroboration
const { data: it } = await sb.from("intelligence_items").select("source_id").eq("id", ID).single();
await sb.from("source_citations").delete().eq("cited_source_id", it.source_id);
await sb.from("sources").update({ independent_citers: 0, highest_citing_tier: null, confirmation_count: 0, total_citations: 0, trust_score_citation: 0 }).eq("id", it.source_id);

// 4. re-derive sections from the rich brief (deterministic, no LLM)
const rows = extractResearchSections(v.full_brief);
for (const s of rows) {
  await sb.from("intelligence_item_sections").upsert(
    { item_id: ID, section_key: s.section_key, section_order: s.section_order, content_md: s.content_md, is_conditional: s.is_conditional },
    { onConflict: "item_id,section_key" }
  );
}
console.log(`re-derived ${rows.length} sections from the rich brief`);

// 5. re-ground (re-extract claim ledger from the rich brief + rich sources) + re-grow
const g = await groundBrief(ID); console.log(`ground: ${g.ok ? "OK" : "FAIL"} ${g.detail}`);
const w = await growSources(ID); console.log(`grow:   ${w.ok ? "OK" : "FAIL"} ${w.detail}`);

// 6. verify
const { data: fin } = await sb.from("intelligence_items").select("provenance_status, full_brief, source_id").eq("id", ID).single();
const { count: scp } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", ID);
const { count: cit } = await sb.from("source_citations").select("id", { count: "exact", head: true }).eq("cited_source_id", fin.source_id);
const { data: src } = await sb.from("sources").select("trust_score_citation, independent_citers").eq("id", fin.source_id).single();
console.log(`\nRESTORED: brief=${(fin.full_brief || "").length}ch provenance=${fin.provenance_status} claims=${scp} citations_to_subject=${cit} subject_trust_cit=${src?.trust_score_citation} indep=${src?.independent_citers}`);
console.log((fin.full_brief || "").length === (v.full_brief || "").length ? "\nrich brief is back live (exact original)." : "\nWARN brief length mismatch");
