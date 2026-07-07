import { readClient } from "../lib/db.mjs";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\//, "");
try { process.loadEnvFile(ROOT + ".env.local"); } catch {}
const sb = readClient();
for (const slug of ["india-s-national-logistics-policy-carbon-intensity-standards", "japan-green-transformation-gx-freight-transport-standards"]) {
  const { data } = await sb.from("intelligence_items").select("id,provenance_status,status").eq("legacy_id", slug).limit(1);
  const it = data?.[0];
  let tiers = {};
  if (it) {
    const { data: claims } = await sb.from("item_claims").select("source_tier,claim_type").eq("intelligence_item_id", it.id);
    for (const c of claims || []) { const k = c.source_tier ?? "null"; tiers[k] = (tiers[k] || 0) + 1; }
  }
  console.log(`${slug.slice(0, 30).padEnd(31)} prov=${it?.provenance_status} status=${it?.status} factTiers=${JSON.stringify(tiers)}`);
}
process.exit(0);
