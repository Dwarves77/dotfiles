import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const sb = readClient();
const KEYS = ["india-s-national-logistics-policy-carbon-intensity-standards","japan-green-transformation-gx-freight-transport-standards"];
const items = await readAll("intelligence_items","id,legacy_id,provenance_status");
for (const k of KEYS){ const it = items.find(x=>x.legacy_id===k); if(!it){console.log(k,"NOT FOUND");continue;}
  const cl = await readAll("section_claim_provenance","claim_kind,source_tier_at_grounding",{match:q=>q.eq("intelligence_item_id",it.id).eq("claim_kind","FACT")});
  const tiers={}; for(const c of cl) tiers[c.source_tier_at_grounding??"null"]=(tiers[c.source_tier_at_grounding??"null"]||0)+1;
  const fl = await readAll("integrity_flags","created_by,status",{match:q=>q.eq("subject_ref",it.id).eq("status","open")});
  console.log(`${k}\n  status=${it.provenance_status} FACTtiers=${JSON.stringify(tiers)} openFlags=${JSON.stringify(fl.map(f=>f.created_by))}`);
}
process.exit(0);
