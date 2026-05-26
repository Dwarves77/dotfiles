/**
 * sprint3-a1-masthead-verify.mjs — A1 verification gate (READ-ONLY)
 *
 * Verifies actual post-A1 masthead counts across /regulations, /research,
 * /market, /operations against the per-domain net shifts captured in
 * docs/audits/sprint3-a16-reconciliation-2026-05-25.json.
 *
 * Mirrors the EXACT filtering each surface applies:
 *   /regulations  → getScopedWorkspaceAggregates({domains:[1]}) →
 *                   get_workspace_intelligence_aggregates_scoped RPC
 *                   (masthead "<n> active regulations" from .totalItems)
 *   /research     → getResearchItems() (get_research_items RPC)
 *                   INTERSECTED with intelligence_items WHERE is_archived=false
 *                   ordered by added_date DESC LIMIT 100 (pipeline cap)
 *                   masthead total = filteredRows.length (or pipeline.total
 *                   when category allow-list empty)
 *   /market       → getMarketIntelItems() (get_market_intel_items RPC)
 *                   masthead total = resources.length
 *   /operations   → getOperationsItems() (get_operations_items RPC)
 *                   masthead total = resources.length
 *
 * No DB writes. No code changes. No agent calls.
 *
 * Output: docs/audits/sprint3-a1-masthead-verify-2026-05-26.json
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
const OUT = resolve(LOG_DIR, "sprint3-a1-masthead-verify-2026-05-26.json");

// Same ORG_ID as the other Sprint 3 read-only investigation scripts
// (sprint3-e1-payload-measure.mjs). Dietl/Rockit dev workspace.
const ORG_ID = "a0000000-0000-0000-0000-000000000001";

// /research caps the pipeline page at this many rows (RESEARCH_PAGE_CAP in
// src/lib/data.ts). The masthead total displayed is filteredRows.length
// AFTER intersecting category-routed IDs with the pipeline rows.
const RESEARCH_PAGE_CAP = 100;

async function main() {
  const results = {
    run_date: new Date().toISOString(),
    org_id: ORG_ID,
    research_page_cap: RESEARCH_PAGE_CAP,
    surfaces: {},
  };

  // ── /regulations ───────────────────────────────────────────────
  // Masthead reads activeRegulationsCount = aggregates.totalItems via
  // get_workspace_intelligence_aggregates_scoped with {domains:[1]}.
  console.log("[regulations] aggregates RPC {domains:[1]}...");
  const regsAgg = await supabase.rpc(
    "get_workspace_intelligence_aggregates_scoped",
    { p_org_id: ORG_ID, p_scope_filter: { domains: [1] } }
  );
  if (regsAgg.error) console.error("regulations RPC error:", regsAgg.error);
  results.surfaces.regulations = {
    rpc: "get_workspace_intelligence_aggregates_scoped",
    scope: { domains: [1] },
    rpc_error: regsAgg.error?.message ?? null,
    masthead_total: Number(regsAgg.data?.total_items ?? 0),
    by_priority: regsAgg.data?.by_priority ?? null,
    total_jurisdictions: regsAgg.data?.total_jurisdictions ?? null,
  };

  // ── /market ────────────────────────────────────────────────────
  // Masthead reads marketIntel.resources.length (or aggregates for the
  // StatStrip; the masthead total per code is resources.length). Per the
  // category RPC: filters source_role/category for market_news.
  console.log("[market] get_market_intel_items RPC...");
  const marketRpc = await supabase.rpc("get_market_intel_items", {
    p_org_id: ORG_ID,
  });
  if (marketRpc.error) console.error("market RPC error:", marketRpc.error);
  const marketRows = Array.isArray(marketRpc.data) ? marketRpc.data : [];
  results.surfaces.market = {
    rpc: "get_market_intel_items",
    rpc_error: marketRpc.error?.message ?? null,
    masthead_total: marketRows.length,
  };

  // ── /operations ────────────────────────────────────────────────
  console.log("[operations] get_operations_items RPC...");
  const opsRpc = await supabase.rpc("get_operations_items", {
    p_org_id: ORG_ID,
  });
  if (opsRpc.error) console.error("operations RPC error:", opsRpc.error);
  const opsRows = Array.isArray(opsRpc.data) ? opsRpc.data : [];
  results.surfaces.operations = {
    rpc: "get_operations_items",
    rpc_error: opsRpc.error?.message ?? null,
    masthead_total: opsRows.length,
  };

  // ── /research ──────────────────────────────────────────────────
  // Two-step:
  //   1. get_research_items RPC (category-routed allow-list)
  //   2. intelligence_items WHERE is_archived=false ORDER BY added_date DESC
  //      LIMIT RESEARCH_PAGE_CAP (the pipeline rows)
  // Masthead total = pipeline rows filtered by allow-list ID intersection.
  console.log("[research] get_research_items RPC...");
  const researchRpc = await supabase.rpc("get_research_items", {
    p_org_id: ORG_ID,
  });
  if (researchRpc.error) console.error("research RPC error:", researchRpc.error);
  const researchAllow = Array.isArray(researchRpc.data) ? researchRpc.data : [];
  // Build the allow-list of IDs (legacy_id || uuid) per rpcRowToResource shape.
  // RPC returns rows with `legacy_id` and `id` (uuid) fields.
  const allowIds = new Set(
    researchAllow.map((r) => r.legacy_id || r.id).filter(Boolean)
  );

  console.log("[research] pipeline rows query...");
  // Pipeline counts: head=true count and a slice mirroring the LIMIT 100 cap.
  const pipelineCount = await supabase
    .from("intelligence_items")
    .select("id", { count: "exact", head: true })
    .eq("is_archived", false);

  const pipelineRowsQ = await supabase
    .from("intelligence_items")
    .select("id, legacy_id")
    .eq("is_archived", false)
    .order("added_date", { ascending: false })
    .limit(RESEARCH_PAGE_CAP);

  const pipelineRows = Array.isArray(pipelineRowsQ.data) ? pipelineRowsQ.data : [];
  const pipelineRowsTyped = pipelineRows.map((r) => ({
    id: r.legacy_id || r.id,
  }));
  // Mirrors page logic: if allow set is empty (RPC failure / anon), no filter.
  const filteredRows = allowIds.size
    ? pipelineRowsTyped.filter((r) => allowIds.has(r.id))
    : pipelineRowsTyped;
  // ResearchView passes total = allow.size ? filteredRows.length : pipeline.total
  const researchMastheadTotal = allowIds.size
    ? filteredRows.length
    : (pipelineCount.count ?? 0);

  results.surfaces.research = {
    rpcs: ["get_research_items", "intelligence_items (pipeline)"],
    rpc_error: researchRpc.error?.message ?? null,
    pipeline_total: pipelineCount.count ?? 0,
    pipeline_rows_capped_at: RESEARCH_PAGE_CAP,
    pipeline_rows_returned: pipelineRows.length,
    category_routed_allow_size: allowIds.size,
    intersected_rows: filteredRows.length,
    masthead_total: researchMastheadTotal,
  };

  // ── Cross-check: per-domain active counts ──────────────────────
  // Independent ground truth for the reconciliation comparison.
  console.log("[xcheck] per-domain active counts...");
  const domainCounts = {};
  for (let d = 1; d <= 7; d++) {
    const { count } = await supabase
      .from("intelligence_items")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("domain", d);
    domainCounts[d] = count ?? 0;
  }
  results.per_domain_active_xcheck = domainCounts;

  const { count: totalActive } = await supabase
    .from("intelligence_items")
    .select("id", { count: "exact", head: true })
    .eq("is_archived", false);
  results.total_active_items = totalActive ?? 0;

  writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log("Wrote", OUT);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
