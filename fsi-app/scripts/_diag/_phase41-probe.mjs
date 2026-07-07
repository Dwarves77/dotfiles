// READ-ONLY Phase 4.1 blast-radius probe. SC-7: a non-FACT claim's source_tier_at_grounding MUST be
// NULL (the tier LABEL for grounded-ANALYSIS is render-derived from source_id, never a stored stamp).
// edit-1 wrongly stamped res.tier on non-FACT claims. Quantify the errant set before any write.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = readClient();

// Pull every claim that carries a non-null stored tier stamp (the universe to reason about).
let rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("section_claim_provenance")
    .select("id, claim_kind, source_tier_at_grounding, source_id, intelligence_item_id")
    .not("source_tier_at_grounding", "is", null)
    .order("id")
    .range(from, from + 999);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
}

const fact = rows.filter((r) => r.claim_kind === "FACT");
const nonFact = rows.filter((r) => r.claim_kind !== "FACT");
const byKind = {}; for (const r of nonFact) byKind[r.claim_kind] = (byKind[r.claim_kind] || 0) + 1;
const withSource = nonFact.filter((r) => r.source_id != null).length;
const items = new Set(nonFact.map((r) => r.intelligence_item_id));

console.log("========== PHASE 4.1 BLAST RADIUS (stored tier stamps) ==========");
console.log(`rows with source_tier_at_grounding NOT NULL: ${rows.length}`);
console.log(`  FACT (legit — must stay stamped):           ${fact.length}`);
console.log(`  non-FACT (ERRANT — must become NULL):        ${nonFact.length}`);
console.log(`    by claim_kind: ${JSON.stringify(byKind)}`);
console.log(`    errant rows that DO carry a source_id (so the label can still render-derive): ${withSource}/${nonFact.length}`);
console.log(`    distinct items touched: ${items.size}`);
console.log(`    errant ids: ${nonFact.map((r) => r.id).join(",")}`);

// Also confirm the already-correct baseline (non-FACT with NULL stamp) is the norm.
const { count: nonFactNull } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).neq("claim_kind", "FACT").is("source_tier_at_grounding", null);
console.log(`\nnon-FACT rows ALREADY NULL (correct): ${nonFactNull}`);
console.log(`\n=> NULL exactly the ${nonFact.length} errant non-FACT rows; leave the ${fact.length} FACT stamps untouched.`);
process.exit(0);
