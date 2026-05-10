/**
 * _task4-backfill-preview.mjs
 *
 * READ-ONLY preview of the two backfills per multi-task wave dispatch v2 Task 4.
 * No UPDATE issued. Outputs the diff so operator can approve before
 * the execute script runs.
 *
 * Backfill 1: agent_runs.intelligence_item_id (currently 0 of 990 populated)
 *   For each agent_runs row with NULL intelligence_item_id and non-NULL
 *   source_id, find an intelligence_items row from the same source where
 *   created_at is within +/- 30 minutes of agent_runs.started_at.
 *   If exactly one match, propose link. If zero or multiple, leave NULL,
 *   surface as 'unmatched' for operator review.
 *
 * Backfill 2: sources.last_intelligence_item_at (NULL on all 783)
 *   For each source, set to MAX(intelligence_items.created_at) where
 *   source_id matches. If no items for source, leave NULL.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FSI_APP_ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(FSI_APP_ROOT, ".env.local"));

const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

console.log("=== Backfill 1: agent_runs.intelligence_item_id ===");

const { data: runs } = await c.from("agent_runs").select("id, source_id, started_at, status").is("intelligence_item_id", null).not("source_id", "is", null);
console.log("agent_runs with NULL intelligence_item_id and non-NULL source_id:", runs?.length || 0);

const sourceIds = [...new Set((runs || []).map(r => r.source_id))];
console.log("distinct source_ids in scope:", sourceIds.length);

// Pull all items in one paged sweep, no IN filter (718 ids exceeds URL limit).
const itemsBySource = {};
const PAGE_SIZE = 1000;
let from = 0;
while (true) {
  const { data: page, error } = await c.from("intelligence_items").select("id, source_id, created_at").not("source_id", "is", null).range(from, from + PAGE_SIZE - 1);
  if (error) { console.error("items page error:", error.message); break; }
  if (!page || page.length === 0) break;
  for (const it of page) {
    if (!itemsBySource[it.source_id]) itemsBySource[it.source_id] = [];
    itemsBySource[it.source_id].push(it);
  }
  if (page.length < PAGE_SIZE) break;
  from += PAGE_SIZE;
}

let matched = 0, ambiguous = 0, unmatched = 0;
const proposals = [];
const WINDOW_MS = 30 * 60 * 1000;

for (const r of runs || []) {
  const items = itemsBySource[r.source_id] || [];
  const startedMs = new Date(r.started_at).getTime();
  const candidates = items.filter(it => Math.abs(new Date(it.created_at).getTime() - startedMs) <= WINDOW_MS);
  if (candidates.length === 1) { matched++; proposals.push({ run_id: r.id, item_id: candidates[0].id, source_id: r.source_id, delta_minutes: Math.round((new Date(candidates[0].created_at).getTime() - startedMs) / 60000) }); }
  else if (candidates.length > 1) { ambiguous++; }
  else { unmatched++; }
}

console.log("  matched (1-to-1):", matched);
console.log("  ambiguous (multiple candidates):", ambiguous);
console.log("  unmatched (no item within 30min):", unmatched);
console.log("  match rate:", ((matched / (runs?.length || 1)) * 100).toFixed(1) + "%");

console.log("");
console.log("=== Backfill 2: sources.last_intelligence_item_at ===");

let allItems = [];
let from2 = 0;
while (true) {
  const { data: page, error } = await c.from("intelligence_items").select("source_id, created_at").not("source_id", "is", null).range(from2, from2 + 999);
  if (error) { console.error("backfill 2 page error:", error.message); break; }
  if (!page || page.length === 0) break;
  allItems.push(...page);
  if (page.length < 1000) break;
  from2 += 1000;
}
const maxBySource = {};
for (const it of allItems || []) {
  const t = new Date(it.created_at).getTime();
  if (!maxBySource[it.source_id] || maxBySource[it.source_id] < t) maxBySource[it.source_id] = t;
}
const distinctSourcesWithItems = Object.keys(maxBySource).length;
console.log("sources with at least one item:", distinctSourcesWithItems);
console.log("sources without items (will remain NULL):", 783 - distinctSourcesWithItems);

const sourceProposals = Object.entries(maxBySource).map(([sid, t]) => ({ source_id: sid, last_intelligence_item_at: new Date(t).toISOString() }));

const out = {
  backfill_1: { runs_in_scope: runs?.length || 0, matched, ambiguous, unmatched, sample_proposals: proposals.slice(0, 30), all_proposals: proposals },
  backfill_2: { sources_with_items: distinctSourcesWithItems, sources_without_items: 783 - distinctSourcesWithItems, sample_proposals: sourceProposals.slice(0, 30), all_proposals: sourceProposals },
};

writeFileSync(resolve(FSI_APP_ROOT, "scripts/tmp/task4-backfill-preview.json"), JSON.stringify(out, null, 2));
console.log("");
console.log("Wrote scripts/tmp/task4-backfill-preview.json");
