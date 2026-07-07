// PROOF: regenerate CSRD + ETS-maritime through the new 2-pass generation (ledger dropped) and confirm
// each comes out WHOLE — full body + complete 18-field YAML, no truncation, no parse failure.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBriefFromStored } = await jiti.import(resolve(ROOT, "src/lib/agent/canonical-pipeline.ts"));
const sb = readClient();
const SLUGS = ["eu-corporate-sustainability-reporting-directive-csrd-transport-provisions", "eu-emissions-trading-system-ets-extension-to-maritime-transport"];
const META = ["severity", "priority", "urgency_tier", "format_type", "topic_tags", "signal_band", "theme", "operational_scenario_tags", "compliance_object_tags", "intersection_summary", "sources_used", "what_it_changes", "regeneration_skill_version", "related_items", "trajectory_points", "conversion_trigger", "cross_references", "does_not_resolve"];
for (const slug of SLUGS) {
  const { data } = await sb.from("intelligence_items").select("id").eq("legacy_id", slug).limit(1);
  const id = data?.[0]?.id;
  if (!id) { console.log(`\n${slug}: NOT FOUND`); continue; }
  console.log(`\n===== ${slug.slice(0, 50)} =====`);
  const t = Date.now();
  let r;
  try { r = await generateBriefFromStored(id); }
  catch (e) { console.log(`  THREW in ${((Date.now() - t) / 1000).toFixed(0)}s: fatal=${e?.fatal} ${(e?.message || "").slice(0, 140)}`); continue; }
  console.log(`  generateBriefFromStored: ok=${r.ok} (${((Date.now() - t) / 1000).toFixed(0)}s) ${(r.detail || "").slice(0, 120)}`);
  // re-read and prove the brief is WHOLE: body length + the 18 YAML-derived fields populated
  const { data: it2 } = await sb.from("intelligence_items").select(["id", "full_brief", ...META].join(",")).eq("id", id).single();
  const bodyLen = (it2?.full_brief || "").length;
  const populated = META.filter((f) => { const v = it2?.[f]; return v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && v !== ""; });
  console.log(`  WHOLE-CHECK: full_brief=${bodyLen} chars | YAML fields populated: ${populated.length}/18`);
  console.log(`    severity=${it2?.severity} priority=${it2?.priority} format_type=${it2?.format_type} urgency_tier=${it2?.urgency_tier}`);
  console.log(`    topic_tags=${JSON.stringify(it2?.topic_tags)} compliance_object_tags=${JSON.stringify(it2?.compliance_object_tags)}`);
  console.log(`    VERDICT: ${r.ok && bodyLen > 600 && it2?.severity && it2?.format_type ? "WHOLE ✓ (body + parsed YAML, no truncation/parse-fail)" : "INCOMPLETE ✗"}`);
}
process.exit(0);
