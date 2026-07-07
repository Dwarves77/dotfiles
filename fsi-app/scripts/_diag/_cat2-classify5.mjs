// READ-ONLY: classify the 5 remaining cat-2 quarantined items by their BLOCKING path so the cat-2
// re-ground line closes honestly. counsel-held(source-side) / batch-1 re-fetch(needs fetch) /
// blocked-on-4d / chokepoint-re-groundable-now. ZERO writes/fetch.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readAll } = await import("../lib/db.mjs");
const FIVE = ["e2e03e1b", "03b5f234", "7a0ead55", "t1", "d5ee6ab8"]; // short/legacy keys
const items = await readAll("intelligence_items", "id,legacy_id,provenance_status,source_url,is_archived");
const resolveKey = (k) => items.find((i) => i.legacy_id === k || i.id.startsWith(k));
// counsel-held set (phase2 priority review open flags)
const counsel = new Set((await readAll("integrity_flags", "subject_ref", { match: (q) => q.eq("subject_type", "item").eq("status", "open").eq("created_by", "phase2_priority_review") })).map((f) => f.subject_ref));
// completeness-exposure flags + recommended_actions (to see refetch vs reground disposition)
const ceFlags = await readAll("integrity_flags", "subject_ref,description,recommended_actions", { match: (q) => q.eq("subject_type", "item").eq("created_by", "completeness-exposure") });
const ceByRef = new Map(ceFlags.map((f) => [f.subject_ref, f]));
// any counsel-hold record type (NO_SOURCE_QUALIFIED / NO_SOURCE_FOUND)
const holds = await readAll("integrity_flags", "subject_ref,category,description", { match: (q) => q.eq("subject_type", "item").eq("status", "open") });
const holdByRef = new Map();
for (const h of holds) { if (/NO_SOURCE_(QUALIFIED|FOUND)|counsel|NO_REACHABLE/i.test(`${h.category} ${h.description}`)) holdByRef.set(h.subject_ref, h.description?.slice(0, 90)); }
console.log(`\n=== CAT-2 REMAINING-5 CLASSIFICATION ===`);
for (const k of FIVE) {
  const it = resolveKey(k);
  if (!it) { console.log(`  ${k}: NOT FOUND`); continue; }
  const ce = ceByRef.get(it.id);
  const act = ce?.recommended_actions?.[0]?.action || "-";
  const isCounsel = counsel.has(it.id);
  const hold = holdByRef.get(it.id);
  console.log(`  ${k} (${it.legacy_id || it.id.slice(0, 8)}) st=${it.provenance_status} arch=${!!it.is_archived}`);
  console.log(`      counsel-held=${isCounsel} | hold=${hold || "none"} | completeness-action=${act}`);
  console.log(`      source_url=${(it.source_url || "").slice(0, 70)}`);
}
process.exit(0);
