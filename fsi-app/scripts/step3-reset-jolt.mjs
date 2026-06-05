/** STEP 3 prep — reset the JOLT item (388b2ce8) to a clean 0-state so the route pull
 * proves the canonical chain rebuilds it from scratch (source_citations 0->N,
 * provenance quarantined->verified, subject trust 0->N). Operator-authorized
 * (2026-06-04: "if you need to delete jolt to make sure the system is working...").
 *
 * REVERSIBLE: backs up the brief + state to scripts/_diag/ before any delete. If the
 * re-run fails, restore by re-grounding the saved brief.
 *
 *   node scripts/step3-reset-jolt.mjs
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PREFIX = "388b2ce8";
const { data: items } = await sb.from("intelligence_items").select("id,title,source_url,source_id,provenance_status,full_brief").ilike("title", "%JOLT%");
const item = (items || []).find((r) => r.id.startsWith(PREFIX));
if (!item) { console.error("JOLT 388b2ce8 not found"); process.exit(1); }
const subjectId = item.source_id;

// snapshot
const { data: claims } = await sb.from("section_claim_provenance").select("*").eq("intelligence_item_id", item.id);
const { data: cites } = await sb.from("source_citations").select("*").eq("cited_source_id", subjectId);
const { data: src } = await sb.from("sources").select("*").eq("id", subjectId).single();
mkdirSync(resolve(ROOT, "scripts/_diag"), { recursive: true });
const backupPath = resolve(ROOT, "scripts/_diag/jolt-388b2ce8-backup.json");
writeFileSync(backupPath, JSON.stringify({ item, claims, cites, source: src }, null, 2));
console.log(`backup -> ${backupPath}`);
console.log(`BEFORE: provenance=${item.provenance_status} brief=${(item.full_brief || "").length}ch claims=${claims?.length} cites_to_subject=${cites?.length} subject_trust_cit=${src?.trust_score_citation} indep=${src?.independent_citers}\n`);

// reset (per-step, verified)
const d1 = await sb.from("section_claim_provenance").delete().eq("intelligence_item_id", item.id);
console.log(`deleted claims: ${d1.error ? "ERR " + d1.error.message : "ok"}`);
const d2 = await sb.from("agent_run_searches").delete().eq("intelligence_item_id", item.id);
console.log(`deleted agent_run_searches: ${d2.error ? "ERR " + d2.error.message : "ok"}`);
const d3 = await sb.from("source_citations").delete().eq("cited_source_id", subjectId);
console.log(`deleted source_citations to subject: ${d3.error ? "ERR " + d3.error.message : "ok"}`);
const u1 = await sb.from("sources").update({ independent_citers: 0, highest_citing_tier: null, confirmation_count: 0, total_citations: 0, trust_score_citation: 0 }).eq("id", subjectId);
console.log(`reset subject convergence: ${u1.error ? "ERR " + u1.error.message : "ok"}`);
const u2 = await sb.from("intelligence_items").update({ provenance_status: "quarantined", full_brief: null }).eq("id", item.id);
console.log(`reset item (quarantined, brief=null): ${u2.error ? "ERR " + u2.error.message : "ok"}`);

// verify clean
const { data: it2 } = await sb.from("intelligence_items").select("provenance_status, full_brief").eq("id", item.id).single();
const { count: scp2 } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", item.id);
const { count: cit2 } = await sb.from("source_citations").select("id", { count: "exact", head: true }).eq("cited_source_id", subjectId);
const { data: src2 } = await sb.from("sources").select("trust_score_citation, independent_citers").eq("id", subjectId).single();
const clean = it2?.provenance_status === "quarantined" && !(it2?.full_brief) && scp2 === 0 && cit2 === 0 && Number(src2?.trust_score_citation) === 0;
console.log(`\nAFTER RESET: provenance=${it2?.provenance_status} brief=${(it2?.full_brief || "").length}ch claims=${scp2} cites_to_subject=${cit2} subject_trust_cit=${src2?.trust_score_citation} indep=${src2?.independent_citers}`);
console.log(clean ? "\nCLEAN — JOLT 388b2ce8 reset to 0-state; ready for the route pull." : "\nNOT CLEAN — inspect above; do NOT run the pull.");
process.exit(clean ? 0 : 1);
