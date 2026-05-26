/**
 * sprint3-e1-payload-measure.mjs — Sprint 3 E1 /map cache-payload investigation.
 *
 * READ-ONLY. Measures the byte size of each key returned by
 * fetchDashboardData + fetchSourceData (the two halves of the
 * cachedAppData payload). Identifies which keys contribute to the
 * 2.8MB cache-exceeded warning surfaced in v3 Phase 7 build.
 *
 * No DB writes. No code changes.
 *
 * Output: docs/audits/sprint3-e1-payload-composition-2026-05-25.json
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const LOG_DIR = resolve("docs", "audits");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const OUT = resolve(LOG_DIR, "sprint3-e1-payload-composition-2026-05-25.json");

const ORG_ID = "a0000000-0000-0000-0000-000000000001";

function byteSize(obj) {
  return Buffer.byteLength(JSON.stringify(obj));
}

function format(n) {
  if (n > 1_048_576) return `${(n / 1_048_576).toFixed(2)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

async function main() {
  console.log("[E1] measuring cachedAppData payload composition...");

  // Mirror the data path that getAppData / cachedAppData runs.
  // fetchDashboardData calls:
  //   - get_workspace_intelligence_dashboard RPC (resources + archived)
  //   - item_timelines, item_disputes-like via fetchChangelog/Disputes/etc.
  //   - intelligence_changes (LIMIT 100)
  //   - sector_contexts
  //   - workspace_item_overrides
  // fetchSourceData calls:
  //   - sources, provisional_sources, source_conflicts (open)

  const [
    { data: rpcResult, error: rpcErr },
    { data: timelines },
    { data: changes },
    { data: sectors },
    { data: overrides },
    { data: sources },
    { data: provisionalSources },
    { data: openConflicts },
  ] = await Promise.all([
    supabase.rpc("get_workspace_intelligence_dashboard", { p_org_id: ORG_ID }),
    supabase.from("item_timelines").select("item_id, milestone_date, label, is_completed, sort_order"),
    supabase
      .from("intelligence_changes")
      .select("item_id, change_type, change_severity, change_summary")
      .order("detected_at", { ascending: false })
      .limit(100),
    supabase.from("sector_contexts").select("sector, display_name"),
    supabase
      .from("workspace_item_overrides")
      .select("item_id, priority_override, is_archived, archive_reason, archive_note, notes")
      .eq("org_id", ORG_ID),
    supabase.from("sources").select("*").eq("admin_only", false).neq("status", "provisional"),
    supabase.from("provisional_sources").select("*").limit(200),
    supabase.from("source_conflicts").select("*").eq("status", "open"),
  ]);

  if (rpcErr) console.error("rpc error:", rpcErr);

  const payload = {
    rpc_intelligence: rpcResult ?? [],
    item_timelines: timelines ?? [],
    intelligence_changes: changes ?? [],
    sector_contexts: sectors ?? [],
    workspace_item_overrides: overrides ?? [],
    sources: sources ?? [],
    provisional_sources: provisionalSources ?? [],
    open_conflicts: openConflicts ?? [],
  };

  const composition = {};
  for (const [key, value] of Object.entries(payload)) {
    composition[key] = {
      row_count: Array.isArray(value) ? value.length : 1,
      bytes: byteSize(value),
      formatted: format(byteSize(value)),
    };
  }

  const total = byteSize(payload);

  // Field-level breakdown for the largest contributor — typically resources.
  // Measure each column's contribution.
  const fieldBreakdown = {};
  if (rpcResult && rpcResult.length > 0) {
    const fields = Object.keys(rpcResult[0]);
    for (const field of fields) {
      const fieldOnly = rpcResult.map((r) => ({ [field]: r[field] }));
      const fieldBytes = byteSize(fieldOnly);
      fieldBreakdown[field] = {
        bytes: fieldBytes,
        formatted: format(fieldBytes),
        avg_per_row: format(Math.floor(fieldBytes / rpcResult.length)),
      };
    }
  }

  // Sort field breakdown by byte size descending for the report.
  const sortedFieldBreakdown = Object.fromEntries(
    Object.entries(fieldBreakdown).sort((a, b) => b[1].bytes - a[1].bytes)
  );

  // Also measure sources field-level since it's a likely co-contributor.
  const sourceFieldBreakdown = {};
  if (sources && sources.length > 0) {
    const fields = Object.keys(sources[0]);
    for (const field of fields) {
      const fieldOnly = sources.map((r) => ({ [field]: r[field] }));
      const fieldBytes = byteSize(fieldOnly);
      sourceFieldBreakdown[field] = {
        bytes: fieldBytes,
        formatted: format(fieldBytes),
        avg_per_row: format(Math.floor(fieldBytes / sources.length)),
      };
    }
  }
  const sortedSourceFieldBreakdown = Object.fromEntries(
    Object.entries(sourceFieldBreakdown).sort((a, b) => b[1].bytes - a[1].bytes)
  );

  const output = {
    measured_at: new Date().toISOString(),
    org_id: ORG_ID,
    total_bytes: total,
    total_formatted: format(total),
    next_js_cache_limit_bytes: 2_097_152,
    over_limit_by_bytes: total - 2_097_152,
    over_limit_by_formatted: format(Math.max(0, total - 2_097_152)),
    composition,
    rpc_intelligence_field_breakdown: sortedFieldBreakdown,
    sources_field_breakdown: sortedSourceFieldBreakdown,
  };

  writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`[E1] wrote ${OUT}`);
  console.log(`[E1] total payload: ${format(total)} (limit ${format(2_097_152)})`);
  console.log(`[E1] over by: ${format(Math.max(0, total - 2_097_152))}`);
  console.log(`\n[E1] composition (top contributors):`);
  for (const [key, v] of Object.entries(composition).sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${key}: ${v.formatted} (${v.row_count} rows)`);
  }
  console.log(`\n[E1] rpc_intelligence top fields:`);
  for (const [k, v] of Object.entries(sortedFieldBreakdown).slice(0, 8)) {
    console.log(`  ${k}: ${v.formatted}`);
  }
  console.log(`\n[E1] sources top fields:`);
  for (const [k, v] of Object.entries(sortedSourceFieldBreakdown).slice(0, 8)) {
    console.log(`  ${k}: ${v.formatted}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
