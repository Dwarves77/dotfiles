/** READ-ONLY quarantine classifier (no writes, no Browserless). Classify-before-spend:
 *  for every non-archived quarantined item, collect validate_item_provenance failures and bucket:
 *    A) regen-fixable  — has unlabeled_assertion / ungrounded_url / no_section_content (content fixes)
 *    B) slot-only      — quarantined SOLELY on missing_required_slot (gate-calibration candidates)
 *    C) mixed          — both content failures AND missing slots
 *  Also emits the slot×item_type matrix for the slot-only set so calibration is a grounded decision,
 *  not a guess. GOVERNING: remediation-discipline (classify-before-delete), env-policy (integrity). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();

const targets = await readAll("intelligence_items", "id,legacy_id,title,item_type",
  { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });

const reasonTotals = {};         // reason -> count of items having it
const slotTotals = {};           // slot -> count (within missing_required_slot)
const slotByType = {};           // item_type -> { slot -> count } (slot-only items)
const buckets = { regenFixable: 0, slotOnly: 0, mixed: 0, clean: 0 };
const slotOnlyItems = [];
const CONTENT_REASONS = new Set(["unlabeled_assertion", "ungrounded_url", "no_section_content", "fact_span_missing"]);

for (const it of targets) {
  const { data } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const row = Array.isArray(data) ? data[0] : data;
  const failures = row?.failures || [];
  const reasons = new Set(failures.map((f) => f.reason));
  for (const r of reasons) reasonTotals[r] = (reasonTotals[r] || 0) + 1;
  const slots = failures.filter((f) => f.reason === "missing_required_slot").map((f) => f.slot_key || "?");
  for (const s of slots) slotTotals[s] = (slotTotals[s] || 0) + 1;

  const hasContent = [...reasons].some((r) => CONTENT_REASONS.has(r));
  const hasSlot = reasons.has("missing_required_slot");
  if (!failures.length) { buckets.clean++; }
  else if (hasContent && hasSlot) buckets.mixed++;
  else if (hasContent) buckets.regenFixable++;
  else if (hasSlot) {
    buckets.slotOnly++;
    slotOnlyItems.push({ key: it.legacy_id || it.id.slice(0, 8), type: it.item_type, slots });
    slotByType[it.item_type] = slotByType[it.item_type] || {};
    for (const s of slots) slotByType[it.item_type][s] = (slotByType[it.item_type][s] || 0) + 1;
  } else buckets.regenFixable++; // other reason classes -> attempt regen
}

console.log(`\n===== QUARANTINE CLASSIFICATION (read-only) =====`);
console.log(`quarantined non-archived: ${targets.length}`);
console.log(`\nBUCKETS:`);
console.log(`  A regen-fixable (content failures only): ${buckets.regenFixable}`);
console.log(`  B slot-only (gate-calibration candidates): ${buckets.slotOnly}`);
console.log(`  C mixed (content + slot): ${buckets.mixed}`);
console.log(`  (clean/no-failure anomaly: ${buckets.clean})`);
console.log(`\nfailure reason totals (items having each reason):`, JSON.stringify(reasonTotals));
console.log(`missing_required_slot — slot totals (all items):`, JSON.stringify(slotTotals));
console.log(`\nslot-only set — slot×item_type matrix (the calibration design surface):`);
for (const [type, slots] of Object.entries(slotByType)) console.log(`  ${type}:`, JSON.stringify(slots));
console.log(`\nslot-only items:`);
for (const it of slotOnlyItems) console.log(`  ${it.key.padEnd(12)} ${String(it.type).padEnd(16)} [${it.slots.join(", ")}]`);
