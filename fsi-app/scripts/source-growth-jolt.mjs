/** Prove source-growth on the REAL JOLT brief (not isolation math). Parses item 388b2ce8's
 * "New Sources Identified", registers the corroborators, records citation edges (corroborator ->
 * the brief's subject source SRF), compounds SRF's credibility. Reports source_citations 0->N and
 * trust_score_citation before/after. This is the source-growth half of the step-3 acceptance bar
 * proven on real data (the workflow plumbing that auto-triggers it is the remaining step-2 piece).
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { growSourcesFromBrief, parseNewSourcesFromBrief } = await jiti.import("../src/lib/sources/source-growth.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: items } = await sb.from("intelligence_items").select("id, source_id, full_brief").eq("item_type", "research_finding").eq("provenance_status", "verified").limit(50);
const it = (items || []).find((r) => r.id.startsWith("388b2ce8"));
if (!it) { console.error("JOLT item not found"); process.exit(1); }

const { data: subj0 } = await sb.from("sources").select("name, independent_citers, highest_citing_tier, total_citations, trust_score_citation").eq("id", it.source_id).single();
const { count: cit0 } = await sb.from("source_citations").select("id", { count: "exact", head: true });
console.log(`subject source: ${subj0.name}`);
console.log(`BEFORE: source_citations(total)=${cit0}  independent_citers=${subj0.independent_citers}  trust_score_citation=${subj0.trust_score_citation}`);
console.log(`\nparsed New Sources Identified:`);
for (const s of parseNewSourcesFromBrief(it.full_brief)) console.log(`  [tier ${s.tier_estimate}${s.rejection_reason ? ", BLOCKED:" + s.rejection_reason : ""}] ${s.name.slice(0, 48)} -> ${s.url.slice(0, 60)}`);

const res = await growSourcesFromBrief(sb, it.source_id, it.full_brief);

console.log(`\nregistered:`);
for (const r of res.registered) console.log(`  ${r.registered.padEnd(11)} ${r.url.slice(0, 64)}`);
console.log(`citation edges recorded: ${res.citationsRecorded}`);
const { count: cit1 } = await sb.from("source_citations").select("id", { count: "exact", head: true });
console.log(`\nAFTER: source_citations(total)=${cit0}->${cit1}`);
console.log(`subject ${subj0.name}: independent_citers ${res.compound.before.independent_citers}->${res.compound.after.independent_citers}  highest_tier=${res.compound.after.highest_citing_tier}  trust_score_citation ${res.compound.before.trust_score_citation}->${res.compound.after.trust_score_citation.toFixed(3)}`);
console.log(res.compound.after.trust_score_citation > res.compound.before.trust_score_citation ? "\nPASS — source-growth compounded on the real JOLT brief; trust_score_citation MOVED." : "\n(no movement)");
