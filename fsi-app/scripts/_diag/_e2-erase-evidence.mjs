/** READ-ONLY: dump full evidence for the 10 ERASE candidates + 2 RELABEL regs (title, url, twin). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const sb = readClient();

const ERASE = ["2c45cae1", "31b18416", "6627ef8b", "6662ebeb", "r17", "mit-climatemachine-live-music-freight-emissions-research", "g10", "eb08d16c", "r24", "edb9b138"];
const RELABEL = ["india-s-national-logistics-policy-carbon-intensity-standards", "japan-green-transformation-gx-freight-transport-standards"];
const TWINS = { "31b18416": "c54cd5f2", "6627ef8b": "88a2918c", "mit-climatemachine-live-music-freight-emissions-research": "88c3a053", "g10": "r29" };

const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,provenance_status,source_url,is_archived");
const byKey = new Map();
for (const it of items) { byKey.set(it.legacy_id || it.id.slice(0, 8), it); byKey.set(it.id.slice(0, 8), it); }

console.log("\n===== ERASE CANDIDATES — full evidence (READ-ONLY) =====");
for (const k of ERASE) {
  const it = byKey.get(k); if (!it) { console.log(`  ${k}: NOT FOUND`); continue; }
  console.log(`\n[${k}] ${it.item_type}/${it.priority}/${it.provenance_status}`);
  console.log(`  title: ${it.title}`);
  console.log(`  src:   ${it.source_url}`);
  const tw = TWINS[k] ? byKey.get(TWINS[k]) : null;
  if (tw) { console.log(`  TWIN [${TWINS[k]}] ${tw.provenance_status}/${tw.item_type} archived=${tw.is_archived}`); console.log(`    twin title: ${tw.title}`); console.log(`    twin src:   ${tw.source_url}`); }
}

console.log("\n\n===== RELABEL REGS — claim-kind breakdown + validate failures =====");
const claims = await readAll("section_claim_provenance", "intelligence_item_id,claim_kind,source_tier_at_grounding");
for (const k of RELABEL) {
  const it = byKey.get(k); if (!it) { console.log(`  ${k}: NOT FOUND`); continue; }
  const cs = claims.filter((c) => c.intelligence_item_id === it.id);
  const kinds = {}; for (const c of cs) kinds[c.claim_kind] = (kinds[c.claim_kind] || 0) + 1;
  const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const v = Array.isArray(vr) ? vr[0] : vr;
  console.log(`\n[${k}] ${it.item_type}/${it.priority}`);
  console.log(`  title: ${it.title}`);
  console.log(`  src:   ${it.source_url}`);
  console.log(`  claim kinds: ${JSON.stringify(kinds)}`);
  console.log(`  validate failures: ${JSON.stringify((v?.failures) || [])}`);
}
process.exit(0);
