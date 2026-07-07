import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();
const id = (await readAll("intelligence_items", "id")).find((i) => String(i.id).startsWith("50ccd5cc")).id;

const { data: it } = await sb.from("intelligence_items").select("provenance_status,regeneration_skill_version,full_brief,format_type,last_regenerated_at").eq("id", id).single();
console.log("item:", { status: it.provenance_status, skill: it.regeneration_skill_version, fmt: it.format_type, brief_len: (it.full_brief || "").length, regen_at: it.last_regenerated_at });

const { data: claims } = await sb.from("section_claim_provenance").select("claim_kind,source_id,source_tier_at_grounding,source_span").eq("intelligence_item_id", id);
const fact = (claims || []).filter((c) => (c.claim_kind || "").toUpperCase() === "FACT");
const nullStampFact = fact.filter((c) => c.source_tier_at_grounding == null);
const nullSrcFact = fact.filter((c) => !c.source_id);
console.log(`claims: ${claims?.length} total | FACT ${fact.length} | FACT null-stamp ${nullStampFact.length} | FACT null-source ${nullSrcFact.length}`);

// recent agent_runs for this item (did the generate actually persist a run?)
const { data: runs } = await sb.from("agent_runs").select("id,status,created_at,error").eq("intelligence_item_id", id).order("created_at", { ascending: false }).limit(3);
console.log("recent agent_runs:");
for (const r of runs || []) console.log(`  [${r.status}] ${r.created_at} ${r.error ? "ERR:" + String(r.error).slice(0, 120) : ""}`);

const { data: verdict } = await sb.rpc("validate_item_provenance", { p_item_id: id });
console.log("gate verdict:", JSON.stringify(verdict));
process.exit(0);
