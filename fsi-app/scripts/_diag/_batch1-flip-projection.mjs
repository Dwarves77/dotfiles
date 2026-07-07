// READ-ONLY batch-1 FLIP PROJECTION (owed item 3). For each of the 47 non-verified items, read
// validate_item_provenance failures + item_type and project whether RETRIEVAL (seek-more/re-fetch to a
// floor-qualifying primary) CAN flip it, vs a STRUCTURAL HOLD that retrieval alone cannot cure — the
// research/tech class stuck at fact_below_authority_floor (resolver-excluded: a higher-tier source for that
// finding likely does not exist) + relabel-only holds. Cheapest-sufficient routing. ZERO spend/fetch.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readAll, readClient } = await import("../lib/db.mjs");
const sb = readClient();
const items = (await readAll("intelligence_items", "id,legacy_id,title,item_type,provenance_status,is_archived"))
  .filter((i) => i.provenance_status !== "verified" && !i.is_archived);

const NONREG_FLOORED = new Set(["research_finding", "technology", "tool"]); // T4/T5 floors — resolver-excluded when below
const flippable = [], structural = [];
for (const it of items) {
  const { data } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const r = Array.isArray(data) ? data[0] : data;
  const reasons = [...new Set((r?.failures || []).map((f) => f.reason))];
  const key = it.legacy_id || it.id.slice(0, 8);
  const belowFloor = reasons.includes("fact_below_authority_floor");
  const missingSlot = reasons.includes("missing_required_slot");
  const onlyRelabel = reasons.length > 0 && reasons.every((x) => x === "unlabeled_assertion" || x === "analysis_missing_label_syntax");
  // STRUCTURAL: below-floor on a non-reg floored type (resolver-excluded, no higher tier exists), OR relabel-only.
  const isStructural = (belowFloor && NONREG_FLOORED.has(it.item_type) && !missingSlot) || onlyRelabel;
  const rec = { key, type: it.item_type, reasons: reasons.join("|") || "(none)" };
  if (isStructural) structural.push(rec); else flippable.push(rec);
}
console.log(`\n=== BATCH-1 FLIP PROJECTION — ${items.length} items ===\n`);
console.log(`[RETRIEVAL-FLIPPABLE] ${flippable.length} — a floor-qualifying primary via seek-more/re-fetch can cover the slot`);
for (const r of flippable) console.log(`   ${r.key.padEnd(16)} ${r.type.padEnd(14)} ${r.reasons}`);
console.log(`\n[STRUCTURAL-HOLD] ${structural.length} — retrieval alone CANNOT flip (below-floor non-reg / relabel-only); cheapest-sufficient = pool-repair ONLY if the ticket justifies, else defer to named event`);
for (const r of structural) console.log(`   ${r.key.padEnd(16)} ${r.type.padEnd(14)} ${r.reasons}`);
console.log(`\n=== HONEST FLIP PROJECTION ===`);
console.log(`  Batch-1 closed list: ${items.length}. Retrieval flip-eligible: ~${flippable.length}. Structural (won't flip on retrieval): ${structural.length}.`);
console.log(`  Jason rules on the flip projection (~${flippable.length}), NOT the raw ${items.length}. Structural items route to pool-repair-if-justified or defer to their named event, not a paid fetch by default.`);
process.exit(0);
