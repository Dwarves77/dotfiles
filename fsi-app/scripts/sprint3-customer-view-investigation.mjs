/**
 * sprint3-customer-view-investigation.mjs — Pre-step for RPC-MASTHEAD
 * Option B fix.
 *
 * READ-ONLY. The A1 verification measured RPC row count (13/46/30).
 * The actual masthead JSX reads `aggregates?.totalItems ?? initialResources.length`.
 * Confirm what customers actually see by computing BOTH values per surface:
 *   - aggregates.totalItems (from get_workspace_intelligence_aggregates_scoped)
 *   - initialResources.length (from the category-routed RPC row count)
 *
 * Per surface: if aggregates.totalItems is non-null, customer sees that
 * number. If aggregates fails/null, customer sees the fallback (row count).
 *
 * Output: docs/audits/sprint3-customer-view-2026-05-26.json
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const LOG_DIR = resolve("docs", "audits");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const OUT = resolve(LOG_DIR, "sprint3-customer-view-2026-05-26.json");

const ORG_ID = "a0000000-0000-0000-0000-000000000001";

// Surface scope maps — mirror what each page.tsx passes to
// getScopedWorkspaceAggregates.
const SURFACES = {
  regulations: { scope: { domains: [1] } },
  market: { scope: { item_types: ["technology", "innovation", "market_signal"], domains: [2, 4] } },
  operations: { scope: { item_types: ["regional_data"], domains: [3, 6] } },
  research: { scope: {} }, // research passes empty scope; aggregates resolves to workspace-wide total
};

// Category-routing RPCs per surface.
const CATEGORY_RPC = {
  market: "get_market_intel_items",
  operations: "get_operations_items",
  research: "get_research_items",
};

async function main() {
  console.log("[customer-view] computing aggregates AND fallback values per surface...");

  const result = { run_date: new Date().toISOString(), org_id: ORG_ID, surfaces: {} };

  for (const [name, def] of Object.entries(SURFACES)) {
    const surfaceData = { scope: def.scope };

    // Aggregates path.
    try {
      const { data, error } = await supabase.rpc(
        "get_workspace_intelligence_aggregates_scoped",
        { p_org_id: ORG_ID, p_scope_filter: def.scope }
      );
      if (error) {
        surfaceData.aggregates_error = error.message;
        surfaceData.aggregates_total = null;
      } else {
        // RPC returns SETOF; take first row's totals
        const row = Array.isArray(data) ? data[0] : data;
        surfaceData.aggregates_total = row?.total_items ?? null;
        surfaceData.aggregates_raw = row;
      }
    } catch (e) {
      surfaceData.aggregates_error = e.message;
      surfaceData.aggregates_total = null;
    }

    // Category-routed RPC path (where applicable).
    if (CATEGORY_RPC[name]) {
      try {
        const { data, error } = await supabase.rpc(CATEGORY_RPC[name], { p_org_id: ORG_ID });
        if (error) {
          surfaceData.rpc_error = error.message;
          surfaceData.rpc_row_count = null;
        } else {
          surfaceData.rpc_row_count = (data ?? []).length;
        }
      } catch (e) {
        surfaceData.rpc_error = e.message;
        surfaceData.rpc_row_count = null;
      }
    }

    // Compute what the masthead would display.
    // Pattern from MarketPage.tsx:222 + OperationsPage.tsx:330:
    //   total = aggregates?.totalItems ?? initialResources.length
    // For /research, the pattern from page.tsx:97:
    //   total = allow.size ? filteredRows.length : pipeline.total
    //   where pipeline.total = workspace active count
    if (name === "research") {
      // Special case: research uses (allow size && intersection) || pipeline.total
      // For this investigation, capture what's available.
      surfaceData.surface_note = "uses allow.size ? filteredRows.length : pipeline.total — see A1 verify script for full path";
    } else if (name === "regulations") {
      // Regulations reads aggregates directly per the A1 verify finding (works clean).
      surfaceData.masthead_predicted =
        surfaceData.aggregates_total ?? surfaceData.rpc_row_count ?? null;
      surfaceData.fallback_active = surfaceData.aggregates_total == null;
    } else {
      surfaceData.masthead_predicted =
        surfaceData.aggregates_total ?? surfaceData.rpc_row_count ?? null;
      surfaceData.fallback_active = surfaceData.aggregates_total == null;
    }

    result.surfaces[name] = surfaceData;
  }

  // Verdict.
  const fallbackHits = Object.entries(result.surfaces)
    .filter(([_, s]) => s.fallback_active)
    .map(([n]) => n);
  if (fallbackHits.length === 0) {
    result.verdict = "AGGREGATES_HEALTHY: aggregates RPC resolves cleanly on all surfaces. Customer sees aggregates values; row-count fallback never activates. Option B fix scope is the aggregates RPC widening, not the row-count fallback.";
  } else {
    result.verdict = `AGGREGATES_PARTIAL_FAILURE: aggregates fallback active on [${fallbackHits.join(", ")}]. Customer sees row-count on those surfaces. Option B fix must address both the aggregates RPC (for the working surfaces) AND the row-count narrowing (for the fallback surfaces).`;
  }

  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`[customer-view] wrote ${OUT}\n`);
  for (const [name, s] of Object.entries(result.surfaces)) {
    console.log(`=== ${name.toUpperCase()} ===`);
    console.log(`  scope: ${JSON.stringify(s.scope)}`);
    console.log(`  aggregates.totalItems: ${s.aggregates_total} ${s.aggregates_error ? "[ERROR: " + s.aggregates_error + "]" : ""}`);
    if ("rpc_row_count" in s) {
      console.log(`  category RPC row count: ${s.rpc_row_count} ${s.rpc_error ? "[ERROR: " + s.rpc_error + "]" : ""}`);
    }
    if ("masthead_predicted" in s) {
      console.log(`  PREDICTED CUSTOMER VIEW: ${s.masthead_predicted}${s.fallback_active ? " (fallback active — aggregates failed)" : " (aggregates resolved)"}`);
    }
    if (s.surface_note) console.log(`  ${s.surface_note}`);
    console.log();
  }
  console.log(`VERDICT: ${result.verdict}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
