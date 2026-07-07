import { readClient } from "../lib/db.mjs";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\//, "");
try { process.loadEnvFile(ROOT + ".env.local"); } catch {}
const sb = readClient();
const keys = ["007f42b1", "6f1e6615", "t7", "sustainable-aviation-fuel-saf-production-pricing", "77b2b073", "45006684", "74a54415", "r25"];
// resolve keys (legacy_id OR id-prefix)
const { data: items } = await sb.from("intelligence_items").select("id,legacy_id,title,item_type,provenance_status").eq("is_archived", false);
const byKey = new Map(); for (const it of items) { byKey.set(it.legacy_id, it); byKey.set(it.id.slice(0, 8), it); }
for (const k of keys) {
  const it = byKey.get(k);
  if (!it) { console.log(`\n${k}: NOT FOUND`); continue; }
  // claim tally
  const { data: claims } = await sb.from("item_claims").select("claim_type,verification_status").eq("intelligence_item_id", it.id);
  const tally = {};
  for (const c of claims || []) { const key = `${c.claim_type}/${c.verification_status}`; tally[key] = (tally[key] || 0) + 1; }
  // provenance validation failures
  const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const row = Array.isArray(vr) ? vr[0] : vr;
  const failures = row?.failures ?? row?.failure_reasons ?? [];
  console.log(`\n${(it.legacy_id || it.id.slice(0, 8))}  [${it.item_type}]  prov=${it.provenance_status}`);
  console.log(`   title: ${(it.title || "").slice(0, 72)}`);
  console.log(`   claims: ${JSON.stringify(tally)}`);
  console.log(`   validate failures: ${JSON.stringify(failures).slice(0, 300)}`);
}
process.exit(0);
