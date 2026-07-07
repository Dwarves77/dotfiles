// READ-ONLY: full untruncated hold reasons + created_by for every counsel/NO_SOURCE-held non-verified item,
// to split per Earth-Exhaustion item 2: genuine legal-interpretation (->Jason question) vs
// NO_SOURCE_QUALIFIED/NO_REACHABLE retrieval (->seek-more queue). ZERO writes/fetch.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readAll } = await import("../lib/db.mjs");
const items = (await readAll("intelligence_items", "id,legacy_id,provenance_status,source_url,is_archived")).filter((i) => i.provenance_status !== "verified" && !i.is_archived);
const byId = new Map(items.map((i) => [i.id, i]));
const ids = new Set(items.map((i) => i.id));
const flags = await readAll("integrity_flags", "subject_ref,category,created_by,description,recommended_actions", { match: (q) => q.eq("subject_type", "item").eq("status", "open") });
const RETRIEVAL = /NO_SOURCE_QUALIFIED|NO_SOURCE_FOUND|NO_REACHABLE|roadblock|sub-floor|best.*tier|primary.*fetch/i;
const LEGAL = /legal|counsel|interpretation|role|determination|applies to|defined term|scope question/i;
const seen = new Map();
for (const f of flags) {
  if (!ids.has(f.subject_ref)) continue;
  const isCounsel = f.created_by === "phase2_priority_review" || RETRIEVAL.test(f.description || "") || LEGAL.test(f.description || "");
  if (!isCounsel) continue;
  const it = byId.get(f.subject_ref);
  const key = it.legacy_id || it.id.slice(0, 8);
  const cls = RETRIEVAL.test(f.description || "") ? "RETRIEVAL(seek-more)" : (f.created_by === "phase2_priority_review" ? "phase2-review?" : "LEGAL?");
  const rec = seen.get(key) || { key, url: (it.source_url || "").slice(0, 85), by: new Set(), cls: new Set(), descs: [] };
  rec.by.add(f.created_by); rec.cls.add(cls); rec.descs.push(`[${f.category}/${f.created_by}] ${f.description || ""}`);
  seen.set(key, rec);
}
console.log(`\n=== COUNSEL / NO_SOURCE HELD — ${seen.size} items, full reasons ===\n`);
for (const r of [...seen.values()].sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(`### ${r.key}  [${[...r.cls].join(",")}]  by=${[...r.by].join(",")}`);
  console.log(`    url: ${r.url}`);
  for (const d of r.descs) console.log(`    - ${d}`);
  console.log("");
}
process.exit(0);
