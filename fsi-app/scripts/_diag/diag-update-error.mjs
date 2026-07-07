import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient } = await import("../lib/db.mjs");
const sb = readClient();
const id = (await sb.from("intelligence_items").select("id").eq("legacy_id","a5").single()).data.id;
// Try minimal first
let { error: e1 } = await sb.from("intelligence_items").update({ format_type: "market_signal_brief", severity: "MONITORING" }).eq("id", id);
console.log("minimal {format_type,severity}:", e1 ? "ERROR: "+e1.message : "OK");
const after1 = (await sb.from("intelligence_items").select("format_type,severity").eq("id",id).single()).data;
console.log("  read-back:", JSON.stringify(after1));
// Try the fuller set
let { error: e2 } = await sb.from("intelligence_items").update({ priority: "LOW", urgency_tier: "informational", topic_tags: ["transport"], operational_scenario_tags: [], compliance_object_tags: [], related_items: [], intersection_summary: null, sources_used: [], regeneration_skill_version: "2026-04-29", last_regenerated_at: new Date().toISOString(), signal_band: null, theme: null, trajectory_points: null, what_it_changes: null, does_not_resolve: null, conversion_trigger: null, cross_references: null }).eq("id", id);
console.log("fuller set:", e2 ? "ERROR: "+e2.message : "OK");
const after2 = (await sb.from("intelligence_items").select("priority,urgency_tier,topic_tags,regeneration_skill_version").eq("id",id).single()).data;
console.log("  read-back:", JSON.stringify(after2));
