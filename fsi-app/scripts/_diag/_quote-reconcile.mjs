// READ-ONLY quote-scope reconciliation: the 45 completeness-exposure flags vs the re-fetch quote, split into
// batch-1 re-fetch / re-ground (no fetch) / resolved / no-re-fetch-path (event-bound). ZERO writes.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const { isErrorBody } = await import("../../src/lib/sources/entity-gate.mjs");
const sb = readClient();
const audit = JSON.parse(readFileSync(resolve(ROOT, "scripts", "_plans", "completeness-audit.json"), "utf8"));
const cat1 = new Set(audit.cat1.map((x) => x.id)), cat2 = new Set(audit.cat2.map((x) => x.id));

const items = await readAll("intelligence_items", "id,legacy_id,provenance_status,source_url,is_archived");
const byId = new Map(items.map((i) => [i.id, i]));
const keyOf = (id) => byId.get(id)?.legacy_id || id.slice(0, 8);
// counsel-held set
const counsel = new Set((await readAll("integrity_flags", "subject_ref", { match: (q) => q.eq("subject_type", "item").eq("status", "open").eq("created_by", "phase2_priority_review") })).map((f) => f.subject_ref));
// error-body-grounded (post-remediation, should be ~0 now, but check for any residual)
const pool = await readAll("agent_run_searches", "id,result_content_excerpt");
const capById = new Map(pool.map((r) => [r.id, r]));
const facts = (await readAll("section_claim_provenance", "intelligence_item_id,claim_kind,search_result_id")).filter((c) => c.claim_kind === "FACT" && c.search_result_id);
const residualErr = new Set();
for (const f of facts) { const c = capById.get(f.search_result_id); if (c && isErrorBody(c.result_content_excerpt || "")) residualErr.add(f.intelligence_item_id); }

// the 45 completeness-exposure flags
const flags = await readAll("integrity_flags", "subject_ref,status,description", { match: (q) => q.eq("subject_type", "item").eq("created_by", "completeness-exposure") });
const DEAD = /eur-lex\.europa\.eu/i;
const buckets = { refetch1: [], reground: [], resolved: [], nopath: [] };
for (const fl of flags) {
  const it = byId.get(fl.subject_ref); if (!it) continue;
  const key = keyOf(fl.subject_ref), st = it.provenance_status;
  if (fl.status === "resolved") { buckets.resolved.push(`${key}`); continue; }
  // open flags:
  if (counsel.has(fl.subject_ref)) { buckets.nopath.push(`${key}(counsel-hold)`); continue; }
  if (cat2.has(fl.subject_ref) && !cat1.has(fl.subject_ref)) { buckets.reground.push(`${key}(${st})`); continue; }
  if (cat1.has(fl.subject_ref)) { buckets.refetch1.push(`${key}(cat1/${st})`); continue; }
  if (st === "quarantined") { buckets.refetch1.push(`${key}(dropped/errbody)`); continue; }
  buckets.reground.push(`${key}(${st})`);
}
console.log(`\n=== QUOTE-SCOPE RECONCILIATION (${flags.length} completeness-exposure flags) ===`);
console.log(`residual error-body-grounded items (should be 0 post-remediation): ${residualErr.size}`);
console.log(`\n[BATCH 1 — RE-FETCH at hold-lift] ${buckets.refetch1.length}: ${buckets.refetch1.join(", ")}`);
console.log(`\n[RE-GROUND — no fetch, cheap now/next] ${buckets.reground.length}: ${buckets.reground.join(", ")}`);
console.log(`\n[RESOLVED — remained verified, no action] ${buckets.resolved.length}: ${buckets.resolved.join(", ")}`);
console.log(`\n[NO RE-FETCH PATH — event-bound, named] ${buckets.nopath.length}: ${buckets.nopath.join(", ")}`);
