// #2 (high-value slice): ground CSRD + ETS-maritime (now whole briefs) to customer-ready via the proven
// generateBriefWorkflow. Stored pool → 0/low Browserless. Reports final verified + customer-visible.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBriefWorkflow } = await jiti.import(resolve(ROOT, "src/workflows/generate-brief.ts"));
const sb = readClient();
const SLUGS = ["eu-corporate-sustainability-reporting-directive-csrd-transport-provisions", "eu-emissions-trading-system-ets-extension-to-maritime-transport"];
for (const slug of SLUGS) {
  const { data } = await sb.from("intelligence_items").select("id").eq("legacy_id", slug).limit(1);
  const id = data?.[0]?.id;
  if (!id) { console.log(`\n${slug}: NOT FOUND`); continue; }
  console.log(`\n===== ${slug.slice(0, 50)} =====`);
  const t = Date.now();
  let r;
  try { r = await generateBriefWorkflow(id, false); }
  catch (e) { console.log(`  WORKFLOW THREW (${((Date.now() - t) / 1000).toFixed(0)}s): fatal=${e?.fatal} ${(e?.message || "").slice(0, 150)}`); continue; }
  console.log(`  status=${r.status} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
  for (const [k, v] of Object.entries(r.steps || {})) console.log(`    ${k.padEnd(10)} ${typeof v === "object" ? JSON.stringify(v).slice(0, 90) : v}`);
  const { data: it } = await sb.from("intelligence_items").select("provenance_status,is_archived,full_brief").eq("id", id).single();
  const viz = it.provenance_status === "verified" && !it.is_archived;
  const { data: claims } = await sb.from("section_claim_provenance").select("source_tier_at_grounding,claim_kind").eq("intelligence_item_id", id);
  const th = {}; for (const c of claims || []) if (c.claim_kind === "FACT") { const k = c.source_tier_at_grounding ?? "null"; th[k] = (th[k] || 0) + 1; }
  console.log(`  FINAL: prov=${it.provenance_status} briefLen=${(it.full_brief || "").length} customer-visible=${viz ? "YES ✓" : "NO ✗"}  factTiers=${JSON.stringify(th)}`);
}
process.exit(0);
