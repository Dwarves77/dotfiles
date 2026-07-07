/** E2 reclassify-to-source (2 items): register the portal as a scannable source + archive the item as
 *  reclassified_to_source (the sanctioned register-then-verify-then-archive path). NOT a destructive erase.
 *  GOVERNING: source-credibility-model (§1/§5 source registration) + remediation-discipline (research-or-erase). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll, reclassifyToSource } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const sb = readClient();

const cite = { skill: "source-credibility-model", reason: "E2: portal mis-ingested as item -> register as scannable source, never plain-archive (source-registration invariant)" };

// resolve the two item ids by legacy_id
const items = await readAll("intelligence_items", "id,legacy_id,title,source_url,provenance_status");
const byKey = new Map(items.map((it) => [it.legacy_id, it]));
const TARGETS = [
  { key: "r17", name: "Project Drawdown", base_tier: 4 },   // established climate-research nonprofit (analytical/research body)
  { key: "r24", name: "ZEMBA — Zero Emission Maritime Buyers Alliance", base_tier: 4 }, // on-vertical industry buyers alliance
];

for (const t of TARGETS) {
  const it = byKey.get(t.key);
  if (!it) { console.log(`[${t.key}] NOT FOUND — skipped`); continue; }
  console.log(`\n[${t.key}] reclassify "${it.title}"  src=${it.source_url}`);
  const res = await reclassifyToSource(it.id, { url: it.source_url, name: t.name, base_tier: t.base_tier }, { cite });
  console.log(`  registered source ${res.source_id} (created=${res.created}, host=${res.host}); item archived=${res.archived} as reclassified_to_source`);
  console.log(`  snapshot: ${res.snapshot}`);
}
console.log("\nDONE: 2 reclassify-to-source. These exit quarantine as sources (reconcile: source-reclass, not part of the 8 archives).");
process.exit(0);
