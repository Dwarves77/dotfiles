import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient } = await import("../lib/db.mjs");
const sb = readClient();
const { data } = await sb.from("intelligence_items").select("*").limit(1);
const cols = Object.keys(data?.[0]||{});
const meta = ["severity","priority","urgency_tier","format_type","topic_tags","signal_band","theme","trajectory_points","what_it_changes","does_not_resolve","conversion_trigger","cross_references","operational_scenario_tags","compliance_object_tags","related_items","intersection_summary","sources_used","last_regenerated_at","regeneration_skill_version"];
console.log("AgentMetadata fields PRESENT as columns:");
for (const m of meta) console.log(`  ${cols.includes(m)?"YES":"NO "}  ${m}`);
