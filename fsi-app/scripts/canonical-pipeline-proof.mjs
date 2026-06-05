/** Prove the canonical pipeline lib fns by DIRECT execution (not blind, not via the runtime yet):
 * generate -> section -> ground -> grow on a fresh research_finding item. Reports each StepResult +
 * the final DB state (provenance, sections, claims, source_citations delta, trust). This proves the
 * step BODIES work before they are wrapped as "use step" + run through /api/agent/run.
 *   node scripts/canonical-pipeline-proof.mjs [itemIdPrefix]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const arg = process.argv[2];
let item;
if (arg) { const { data } = await sb.from("intelligence_items").select("id,title,source_url,provenance_status").ilike("title", "%%"); item = (data || []).find((r) => r.id.startsWith(arg)); }
if (!item) {
  const { data } = await sb.from("intelligence_items").select("id,title,source_url,full_brief,provenance_status")
    .eq("item_type", "research_finding").eq("is_archived", false).eq("provenance_status", "quarantined").not("source_url", "is", null).limit(40);
  // prefer an empty-brief item with a non-portal http source
  item = (data || []).find((r) => !(r.full_brief || "").trim() && /^https?:\/\//.test(r.source_url) && !/\/(index|home)?$/i.test(new URL(r.source_url).pathname.replace(/\/$/, "") || "x"));
  item = item || (data || [])[0];
}
if (!item) { console.error("no candidate research_finding item"); process.exit(1); }
console.log(`ITEM ${item.id.slice(0, 8)}  "${(item.title || "").slice(0, 56)}"\n  source=${item.source_url}\n`);

const { count: cit0 } = await sb.from("source_citations").select("id", { count: "exact", head: true });

const g = await P.generateBrief(item.id); console.log(`  generate: ${g.ok ? "OK" : "FAIL"} ${g.detail}`);
if (!g.ok) process.exit(1);
const s = await P.sectionBrief(item.id); console.log(`  section : ${s.ok ? "OK" : "FAIL"} ${s.detail}`);
if (!s.ok) process.exit(1);
const r = await P.groundBrief(item.id); console.log(`  ground  : ${r.ok ? "OK" : "FAIL"} ${r.detail}`);
if (!r.ok) process.exit(1);
const w = await P.growSources(item.id); console.log(`  grow    : ${w.ok ? "OK" : "FAIL"} ${w.detail}`);

const { data: fin } = await sb.from("intelligence_items").select("provenance_status").eq("id", item.id).single();
const { count: sc } = await sb.from("intelligence_item_sections").select("id", { count: "exact", head: true }).eq("item_id", item.id);
const { count: cc } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", item.id);
const { count: cit1 } = await sb.from("source_citations").select("id", { count: "exact", head: true });
console.log(`\nFINAL: provenance=${fin.provenance_status}  sections=${sc}  claims=${cc}  source_citations ${cit0}->${cit1}`);
console.log(g.ok && s.ok && r.ok && w.ok && fin.provenance_status === "verified" ? "\nPASS — canonical pipeline lib fns prove the full chain on a fresh item." : "\nINCOMPLETE");
