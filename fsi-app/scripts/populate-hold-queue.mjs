/** populate-hold-queue.mjs — Phase E, E3 increment 2: seed hold_resolution_queue from the CURRENT held set.
 *  Idempotent (hrq_enqueue coalesces one active row per entity+class). Derives hold_class from each item's
 *  live validate_item_provenance failures + names a next_action. Also enqueues items carrying an open
 *  mint_gate_s_numeric soft-flag. $0, read-then-enqueue. --apply writes; default is a dry preview.
 *  A hold cannot exist without a queue row (holds-are-conveyor-not-parking) — this is the backfill of the
 *  pre-loop backlog; going forward, entry is event-driven (a later increment wires the trigger).
 *  Usage: node scripts/populate-hold-queue.mjs [--apply]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { enqueue, HOLD_CLASSES } from "./lib/hold-queue.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// dominant hold-class from an item's validate failures (first match wins, most-actionable first)
function classify(reasons) {
  const has = (r) => reasons.includes(r);
  if (has("fact_mint_hold")) return { cls: "mint_gate_conflate", action: "re-ground: strip the conflated instrument identity, re-attribute each claim to its own primary" };
  if (has("fact_below_authority_floor")) return { cls: "floor", action: "seek a floor-qualifying primary for the sub-floor facts; else relabel to ANALYSIS or GAP" };
  if (has("fact_span_not_in_source") || has("fact_missing_source_span") || has("missing_source_id") || has("source_not_active") || has("source_tier_null") || has("ungrounded_url"))
    return { cls: "hold_to_find", action: "seek + register the correct primary source, then re-stamp/re-ground the facts" };
  return { cls: "quarantine_next_action", action: `resolve labeling/slot criteria: ${reasons.filter((r) => r.startsWith("unlabeled") || r.startsWith("analysis") || r.startsWith("legal") || r.startsWith("missing_required")).join(", ") || reasons.join(", ")}` };
}

async function main() {
  console.log(`\n=== POPULATE HOLD QUEUE (${APPLY ? "APPLY" : "DRY"}) ===`);
  const { data: q } = await sb.from("intelligence_items").select("id, title").eq("provenance_status", "quarantined").eq("is_archived", false);
  const tally = {}; let enq = 0;
  for (const it of q || []) {
    const { data: v } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
    const val = Array.isArray(v) ? v[0] : v;
    const reasons = [...new Set((val?.failures || []).map((f) => f.reason))];
    const { cls, action } = classify(reasons);
    tally[cls] = (tally[cls] || 0) + 1;
    if (APPLY) { await enqueue(sb, { entityType: "item", entityRef: it.id, holdClass: cls, nextAction: action }); enq += 1; }
  }
  // items carrying an open S-NUMERIC soft flag (item stays verified-eligible; the flag is the review record)
  const { data: sn } = await sb.from("integrity_flags").select("subject_ref").eq("created_by", "mint_gate_s_numeric").eq("status", "open").eq("subject_type", "item");
  const snItems = [...new Set((sn || []).map((r) => r.subject_ref))];
  for (const id of snItems) { tally.s_numeric_soft = (tally.s_numeric_soft || 0) + 1; if (APPLY) { await enqueue(sb, { entityType: "item", entityRef: id, holdClass: "s_numeric_soft", nextAction: "live-verify the flagged numeric; fix citation if the figure confirms, correct content only if it does not" }); enq += 1; } }

  console.log(`quarantined items: ${(q || []).length}; S-NUMERIC soft-flagged items: ${snItems.length}`);
  console.log(`hold-class tally: ${HOLD_CLASSES.map((c) => `${c}=${tally[c] || 0}`).join("  ")}`);
  if (APPLY) {
    const { count: active } = await sb.from("hold_resolution_queue").select("id", { count: "exact", head: true }).in("state", ["queued", "seeking", "grounding"]);
    console.log(`enqueued ${enq} (idempotent); active queue rows now: ${active}`);
  } else console.log(`(dry) would enqueue the above. Re-run with --apply.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
