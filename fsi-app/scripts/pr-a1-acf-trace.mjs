/**
 * pr-a1-acf-trace.mjs — read-only follow-up: find the ACF priority origin.
 *
 * Dispatch claimed "California ACF: proposed HIGH, materialized LOW" should
 * be in staged_updates drift. The bulk audit found zero drift on that field.
 * Either the ACF priority was set by a path other than staged_updates, the
 * proposed_changes JSON doesn't include 'priority' as a key, or the drift
 * has been remediated and ACF is now LOW intentionally.
 *
 * This script answers: are there ANY staged_updates that target w4_ca_acf
 * (by item_id, by reason text, by proposed_changes content)?
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ACF_ITEM_ID = "94caa400-9c93-4eed-87f8-bcdaeb43d4cb"; // we'll re-fetch; placeholder
const out = { generatedAt: new Date().toISOString() };

// First get the actual ACF UUID
const { data: acfRow } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, priority, source_id, item_changelog:item_changelog(field, prev_value, new_value, changed_at, change_reason)")
  .eq("legacy_id", "w4_ca_acf")
  .maybeSingle();

out.acf_item = acfRow;

if (acfRow?.id) {
  // Look for staged_updates that target this exact item_id
  const { data: byItemId } = await supabase
    .from("staged_updates")
    .select(
      "id, update_type, item_id, status, proposed_changes, reason, created_at, reviewed_at, materialized_at"
    )
    .eq("item_id", acfRow.id)
    .order("created_at", { ascending: true });
  out.staged_updates_by_item_id = byItemId;

  // Also any staged_updates whose reason text mentions ACF or Advanced Clean Fleets
  const { data: byReason } = await supabase
    .from("staged_updates")
    .select(
      "id, update_type, item_id, status, proposed_changes, reason, created_at"
    )
    .or("reason.ilike.%advanced clean fleets%,reason.ilike.%ACF%,reason.ilike.%w4_ca_acf%")
    .order("created_at", { ascending: true });
  out.staged_updates_by_reason = byReason;
}

// And: did any staged_updates ever propose 'priority' as a change?
const { data: priorityChanges } = await supabase
  .from("staged_updates")
  .select("id, update_type, item_id, status, proposed_changes, reason, created_at")
  .eq("status", "approved");
out.approved_staged_updates_with_priority = (priorityChanges ?? [])
  .filter((su) => Object.keys(su.proposed_changes ?? {}).includes("priority"))
  .map((su) => ({
    id: su.id,
    item_id: su.item_id,
    reason: su.reason,
    proposed_priority: su.proposed_changes.priority,
    created_at: su.created_at,
  }));

const outPath = resolve("..", "docs", "pr-a1-acf-trace.json");
writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));
console.log(`\n[written] ${outPath}`);
