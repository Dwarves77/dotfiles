import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient } = await import("../lib/db.mjs");
const sb = readClient();
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBriefFromStored } = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const id = (await sb.from("intelligence_items").select("id").eq("legacy_id","a5").single()).data.id;
const before = (await sb.from("intelligence_items").select("format_type,severity,topic_tags,regeneration_skill_version").eq("id",id).single()).data;
console.log("BEFORE:", JSON.stringify(before));
const r = await generateBriefFromStored(id);
console.log("regen:", r.ok, r.detail);
const after = (await sb.from("intelligence_items").select("format_type,severity,topic_tags,operational_scenario_tags,regeneration_skill_version,last_regenerated_at").eq("id",id).single()).data;
console.log("AFTER :", JSON.stringify(after));
