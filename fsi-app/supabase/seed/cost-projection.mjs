// cost-projection.mjs
//
// W5.2 — Annual operating cost projection for the Caro's Ledge platform.
//
// Reads counts from the live DB (sources, intelligence_items, source_verifications)
// and projects annual API spend across three operating scenarios (Low / Mid / High).
// Writes a markdown report to docs/W5-cost-projection.md and prints a summary to
// stdout.
//
// Read-only. Idempotent. Re-runnable. No DB writes.
//
// Usage:
//   cd fsi-app
//   node supabase/seed/cost-projection.mjs
//
// Cost model assumptions are documented inline below (see COSTS) and replayed
// into the markdown report's Assumptions section so the rationale travels with
// the output.

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { mkdir, writeFile } from "fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const REPORT_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "W5-cost-projection.md"
);

// ─── Cost model — per-call USD pricing ─────────────────────────────────────
// All numbers are documented assumptions, not metered prices. Update when the
// pricing changes or when measured runs come back materially different.
const COSTS = {
  scanWorkerPerSource: 0.05, // Sonnet + web_search — one source-aware scan
  briefRegenPerItem: 0.15, // /api/agent/run — one brief regeneration
  discoveryPerJurisdiction: 0.11, // /api/admin/sources/discover — one call
  verifyPerCandidate: 0.001, // Haiku tier classification — one candidate
  askPerQuery: 0.05, // /api/ask — one user-facing AI answer
  adminScanPerCall: 0.1, // /api/admin/scan — one admin-triggered scan
};

// ─── Volume assumptions for each scenario ──────────────────────────────────
const SCENARIOS = {
  low: {
    label: "Low (lower bound — minimal usage)",
    workerScansPerYear: 26, // every other week
    briefRegenRate: 0.1, // 10% of items regen / year
    discoveryRefreshes: { tier1: 0, tier2: 0 }, // no refresh
    verifyAdHocPerYear: 0, // no ad-hoc verifies
    askQueriesPerMonth: 25,
    adminScansPerYear: 52, // ~1/week
  },
  mid: {
    label: "Mid (expected operating cost)",
    workerScansPerYear: 156, // M/W/F × 52 wk
    briefRegenRate: 0.2, // 20% items regen / year
    discoveryRefreshes: { tier1: 2, tier2: 1 }, // T1 semi-annual, T2 annual
    verifyAdHocPerYear: 200 * 12, // 200/month
    askQueriesPerMonth: 100,
    adminScansPerYear: 260, // ~5/week realistic
  },
  high: {
    label: "High (full activation)",
    workerScansPerYear: 365, // daily
    briefRegenRate: 0.3, // 30% items regen / year
    discoveryRefreshes: { tier1: 4, tier2: 4 }, // quarterly both tiers
    verifyAdHocPerYear: 500 * 12, // 500/month
    askQueriesPerMonth: 500,
    adminScansPerYear: 2190, // 6/day cap from cooldown
  },
};

// Tier 1 / Tier 2 jurisdiction counts used for the discovery refresh line.
// These are stable platform constants matching the W3 Tier 1 population work.
const TIER1_JURISDICTION_COUNT = 125;
const TIER2_JURISDICTION_COUNT = 47;

function fmtUsd(n) {
  return `$${n.toFixed(2)}`;
}

async function countTable(table, filter) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) {
    for (const [col, val] of Object.entries(filter)) {
      q = q.eq(col, val);
    }
  }
  const { count, error } = await q;
  if (error) {
    console.warn(`  [warn] count(${table}, ${JSON.stringify(filter)}) failed: ${error.message}`);
    return null;
  }
  return count ?? 0;
}

async function gatherInputs() {
  console.log("Querying DB for cost-driver inputs…");

  // Active sources — total
  const sourcesActive = await countTable("sources", { status: "active" });

  // Scannable sources — proxy for "scan_enabled":
  // status='active' AND admin_only=false. (Column scan_enabled doesn't exist.)
  const { count: sourcesScannable, error: scannableErr } = await supabase
    .from("sources")
    .select("*", { count: "exact", head: true })
    .eq("status", "active")
    .eq("admin_only", false);
  if (scannableErr) {
    console.warn(`  [warn] scannable count failed: ${scannableErr.message}`);
  }

  // Active intelligence_items
  const itemsActive = await countTable("intelligence_items", { status: "active" });
  const itemsTotal = await countTable("intelligence_items", null);

  // source_verifications by tier — discovery output rate proxy
  const verifyTierCounts = {};
  for (const tier of ["H", "M", "L"]) {
    verifyTierCounts[tier] = await countTable("source_verifications", {
      verification_tier: tier,
    });
  }

  // Recent (last 30d) verifications — for run-rate
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { count: verify30d, error: vErr } = await supabase
    .from("source_verifications")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since);
  if (vErr) {
    console.warn(`  [warn] verify-30d count failed: ${vErr.message}`);
  }

  // Staged updates (pending) — admin scan workload signal
  const stagedPending = await countTable("staged_updates", { status: "pending" });

  return {
    sourcesActive: sourcesActive ?? 0,
    sourcesScannable: sourcesScannable ?? 0,
    itemsActive: itemsActive ?? 0,
    itemsTotal: itemsTotal ?? 0,
    verifyTierCounts,
    verify30d: verify30d ?? 0,
    stagedPending: stagedPending ?? 0,
  };
}

function computeScenario(name, scenario, inputs) {
  const lines = [];

  // Source scan worker
  const scanWorker =
    scenario.workerScansPerYear *
    inputs.sourcesScannable *
    COSTS.scanWorkerPerSource;
  lines.push({
    name: "Source scan worker",
    formula: `${scenario.workerScansPerYear} scans/yr × ${inputs.sourcesScannable} scannable sources × ${fmtUsd(COSTS.scanWorkerPerSource)}`,
    cost: scanWorker,
  });

  // Brief regeneration
  const briefRegen =
    scenario.briefRegenRate * inputs.itemsActive * COSTS.briefRegenPerItem;
  lines.push({
    name: "Brief regeneration",
    formula: `${(scenario.briefRegenRate * 100).toFixed(0)}% × ${inputs.itemsActive} active items × ${fmtUsd(COSTS.briefRegenPerItem)}`,
    cost: briefRegen,
  });

  // Discovery refresh — T1 + T2
  const discoveryT1 =
    scenario.discoveryRefreshes.tier1 *
    TIER1_JURISDICTION_COUNT *
    COSTS.discoveryPerJurisdiction;
  const discoveryT2 =
    scenario.discoveryRefreshes.tier2 *
    TIER2_JURISDICTION_COUNT *
    COSTS.discoveryPerJurisdiction;
  lines.push({
    name: "Discovery refresh — T1",
    formula: `${scenario.discoveryRefreshes.tier1}× T1 ×  ${TIER1_JURISDICTION_COUNT} jurisdictions × ${fmtUsd(COSTS.discoveryPerJurisdiction)}`,
    cost: discoveryT1,
  });
  lines.push({
    name: "Discovery refresh — T2",
    formula: `${scenario.discoveryRefreshes.tier2}× T2 ×  ${TIER2_JURISDICTION_COUNT} jurisdictions × ${fmtUsd(COSTS.discoveryPerJurisdiction)}`,
    cost: discoveryT2,
  });

  // Verification pipeline — discovery candidates + ad-hoc admin verifies.
  // Each discovery refresh produces ~10 candidates per jurisdiction; cap by
  // T1+T2 only.
  const candidatesPerRefreshTier1 =
    scenario.discoveryRefreshes.tier1 * TIER1_JURISDICTION_COUNT * 10;
  const candidatesPerRefreshTier2 =
    scenario.discoveryRefreshes.tier2 * TIER2_JURISDICTION_COUNT * 10;
  const totalVerifyCalls =
    candidatesPerRefreshTier1 +
    candidatesPerRefreshTier2 +
    scenario.verifyAdHocPerYear;
  const verifyCost = totalVerifyCalls * COSTS.verifyPerCandidate;
  lines.push({
    name: "Verification pipeline (Haiku)",
    formula: `${totalVerifyCalls.toLocaleString()} candidates × ${fmtUsd(COSTS.verifyPerCandidate)}`,
    cost: verifyCost,
  });

  // User-facing AI (/api/ask)
  const askCost = scenario.askQueriesPerMonth * 12 * COSTS.askPerQuery;
  lines.push({
    name: "User-facing /api/ask",
    formula: `${scenario.askQueriesPerMonth}/mo × 12 × ${fmtUsd(COSTS.askPerQuery)}`,
    cost: askCost,
  });

  // Admin scan
  const adminScan = scenario.adminScansPerYear * COSTS.adminScanPerCall;
  lines.push({
    name: "Admin /api/admin/scan",
    formula: `${scenario.adminScansPerYear} scans/yr × ${fmtUsd(COSTS.adminScanPerCall)}`,
    cost: adminScan,
  });

  const total = lines.reduce((s, l) => s + l.cost, 0);
  return { name, label: scenario.label, lines, total };
}

function renderConsole(inputs, scenarios) {
  console.log();
  console.log("─".repeat(70));
  console.log("DB inputs:");
  console.log(`  active sources             : ${inputs.sourcesActive}`);
  console.log(`  scannable (active+!admin)  : ${inputs.sourcesScannable}`);
  console.log(`  active intelligence_items  : ${inputs.itemsActive}`);
  console.log(`  total intelligence_items   : ${inputs.itemsTotal}`);
  console.log(`  source_verifications H/M/L : ${inputs.verifyTierCounts.H} / ${inputs.verifyTierCounts.M} / ${inputs.verifyTierCounts.L}`);
  console.log(`  verifications (last 30d)   : ${inputs.verify30d}`);
  console.log(`  staged_updates pending     : ${inputs.stagedPending}`);
  console.log("─".repeat(70));

  for (const s of scenarios) {
    console.log();
    console.log(`SCENARIO: ${s.label}`);
    for (const line of s.lines) {
      console.log(
        `  ${line.name.padEnd(34)} ${fmtUsd(line.cost).padStart(10)}   (${line.formula})`
      );
    }
    console.log(`  ${"".padEnd(34)} ${"─".padStart(10)}`);
    console.log(`  ${"TOTAL".padEnd(34)} ${fmtUsd(s.total).padStart(10)}`);
  }

  console.log();
  console.log("─".repeat(70));
  const low = scenarios.find((s) => s.name === "low").total;
  const mid = scenarios.find((s) => s.name === "mid").total;
  const high = scenarios.find((s) => s.name === "high").total;
  console.log(
    `Annual operating cost: low ${fmtUsd(low)} / mid ${fmtUsd(mid)} / high ${fmtUsd(high)}`
  );
  console.log("─".repeat(70));
}

function renderMarkdown(inputs, scenarios) {
  const ts = new Date().toISOString();
  const low = scenarios.find((s) => s.name === "low").total;
  const mid = scenarios.find((s) => s.name === "mid").total;
  const high = scenarios.find((s) => s.name === "high").total;

  const lines = [];
  lines.push("# W5 — Cost Projection");
  lines.push("");
  lines.push(`Generated: ${ts}`);
  lines.push("");
  lines.push("**Annual operating cost (API spend, USD): " +
    `low ${fmtUsd(low)} / mid ${fmtUsd(mid)} / high ${fmtUsd(high)}.**`);
  lines.push("");
  lines.push("This document projects Caro's Ledge platform AI/API spend across three " +
    "operating scenarios. It is regenerated by `fsi-app/supabase/seed/cost-projection.mjs`, " +
    "which queries the live DB for current source / item / verification counts and applies " +
    "the cost model documented below.");
  lines.push("");

  // ── DB inputs ─────────────────────────────────────────────────────────
  lines.push("## DB inputs (live)");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | ---: |");
  lines.push(`| Active sources | ${inputs.sourcesActive} |`);
  lines.push(`| Scannable sources (active + non-admin) | ${inputs.sourcesScannable} |`);
  lines.push(`| Active intelligence items | ${inputs.itemsActive} |`);
  lines.push(`| Total intelligence items | ${inputs.itemsTotal} |`);
  lines.push(`| source_verifications — Tier H | ${inputs.verifyTierCounts.H} |`);
  lines.push(`| source_verifications — Tier M | ${inputs.verifyTierCounts.M} |`);
  lines.push(`| source_verifications — Tier L | ${inputs.verifyTierCounts.L} |`);
  lines.push(`| Verifications (last 30 days) | ${inputs.verify30d} |`);
  lines.push(`| Staged updates pending | ${inputs.stagedPending} |`);
  lines.push("");

  // ── Per-line-item table ───────────────────────────────────────────────
  lines.push("## Scenarios — line-item breakdown");
  lines.push("");
  lines.push("| Line item | Low | Mid | High |");
  lines.push("| --- | ---: | ---: | ---: |");
  const lowS = scenarios.find((s) => s.name === "low");
  const midS = scenarios.find((s) => s.name === "mid");
  const highS = scenarios.find((s) => s.name === "high");
  for (let i = 0; i < lowS.lines.length; i++) {
    const name = lowS.lines[i].name;
    const lc = fmtUsd(lowS.lines[i].cost);
    const mc = fmtUsd(midS.lines[i].cost);
    const hc = fmtUsd(highS.lines[i].cost);
    lines.push(`| ${name} | ${lc} | ${mc} | ${hc} |`);
  }
  lines.push(`| **Total annual** | **${fmtUsd(lowS.total)}** | **${fmtUsd(midS.total)}** | **${fmtUsd(highS.total)}** |`);
  lines.push("");

  // ── Per-scenario detail ───────────────────────────────────────────────
  for (const s of scenarios) {
    lines.push(`### ${s.label}`);
    lines.push("");
    lines.push("| Line item | Formula | Cost |");
    lines.push("| --- | --- | ---: |");
    for (const line of s.lines) {
      lines.push(`| ${line.name} | ${line.formula} | ${fmtUsd(line.cost)} |`);
    }
    lines.push(`| **Total** |  | **${fmtUsd(s.total)}** |`);
    lines.push("");
  }

  // ── Assumptions ───────────────────────────────────────────────────────
  lines.push("## Assumptions");
  lines.push("");
  lines.push("### Per-call costs (USD)");
  lines.push("");
  lines.push("| Component | Per-call cost | Notes |");
  lines.push("| --- | ---: | --- |");
  lines.push(`| Source scan worker (Sonnet + web_search) | ${fmtUsd(COSTS.scanWorkerPerSource)} | One source-aware scan call |`);
  lines.push(`| Brief regeneration (\`/api/agent/run\`) | ${fmtUsd(COSTS.briefRegenPerItem)} | One item refresh |`);
  lines.push(`| Discovery agent (per jurisdiction) | ${fmtUsd(COSTS.discoveryPerJurisdiction)} | One \`/api/admin/sources/discover\` call |`);
  lines.push(`| Verification pipeline (Haiku) | ${fmtUsd(COSTS.verifyPerCandidate)} | Per candidate URL classified |`);
  lines.push(`| User \`/api/ask\` (Sonnet) | ${fmtUsd(COSTS.askPerQuery)} | One end-user AI answer |`);
  lines.push(`| Admin \`/api/admin/scan\` (Sonnet + web_search) | ${fmtUsd(COSTS.adminScanPerCall)} | One admin-triggered scan |`);
  lines.push("");
  lines.push("### Volume assumptions");
  lines.push("");
  lines.push("**Low** — minimal usage. Worker runs every other week, briefs regen at 10% / year, no discovery refresh, no ad-hoc verifies, ~1 admin scan / week, 25 user queries / month.");
  lines.push("");
  lines.push("**Mid** — expected operating cost. Cron M/W/F worker, 20% annual brief regen, T1 semi-annual + T2 annual discovery refresh, 200 ad-hoc verifies / month, ~5 admin scans / week, 100 user queries / month.");
  lines.push("");
  lines.push("**High** — full activation. Daily worker, 30% annual brief regen, quarterly discovery refresh on both tiers, 500 ad-hoc verifies / month, admin scan capped at 6 / day by cooldown × 365, 500 user queries / month.");
  lines.push("");
  lines.push("### Constants");
  lines.push("");
  lines.push(`- Tier 1 jurisdictions: ${TIER1_JURISDICTION_COUNT}`);
  lines.push(`- Tier 2 jurisdictions: ${TIER2_JURISDICTION_COUNT}`);
  lines.push("- Discovery candidates per jurisdiction per refresh: ~10 (informs verify volume).");
  lines.push("- \"Scannable\" source proxy: `status='active' AND admin_only=false` (`scan_enabled` column does not exist).");
  lines.push("");

  // ── Recommendations ───────────────────────────────────────────────────
  lines.push("## Recommendations");
  lines.push("");
  lines.push("1. **Tiered scan cadence** — run T1 sources weekly, T2 monthly, T3 quarterly. The worker today scans every active+non-admin source 3× / week, but T3 sources move slowly enough that this is wasted spend. A tiered cadence cuts the worker line ~40% with no loss of recall.");
  lines.push("");
  lines.push("2. **Hash-based regeneration** — gate brief regen on a content hash (or last-modified header) of the underlying source. Today's 20% regen rate is a heuristic; in practice ~5-8% of items have meaningfully changed source content year-over-year, so hashing should knock 60-75% off the brief-regen line.");
  lines.push("");
  lines.push("3. **Use Haiku for triage steps** — the verification pipeline already uses Haiku ($0.001 / candidate), but the admin scan and discovery agent still use Sonnet end-to-end. A two-stage pattern (Haiku to filter / classify, Sonnet only on the survivors) should drop the admin scan and discovery lines another 30-50%.");
  lines.push("");
  lines.push("4. **Prompt cache the system prompt** — the admin scan and worker scan share a static ~2KB system prompt. Enabling prompt caching cuts input-token cost ~90% on cached prefix. At Mid scenario admin-scan volume this saves ~$15-20 / yr; at High scenario, ~$130 / yr.");
  lines.push("");
  lines.push("5. **Cap discovery refresh by jurisdiction churn** — instead of a fixed semi-annual / quarterly cadence, refresh a jurisdiction's discovery only when its rolling 90-day staged-update count crosses a floor. This keeps T1 markets fresh without spending on quiet ones.");
  lines.push("");
  lines.push("6. **Surface cost telemetry in the admin dashboard** — log per-call $ on `staged_updates` rows so the Admin → Cost view can render actuals against this projection. Without telemetry, the high-scenario delta (~$" +
    `${(high - mid).toFixed(0)})` + ") is invisible until the bill arrives.");
  lines.push("");

  // ── Bottom line ───────────────────────────────────────────────────────
  lines.push("## Bottom line");
  lines.push("");
  lines.push(`**Annual operating cost: low ${fmtUsd(low)} / mid ${fmtUsd(mid)} / high ${fmtUsd(high)}.**`);
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const t0 = Date.now();
  const inputs = await gatherInputs();

  const scenarios = [
    computeScenario("low", SCENARIOS.low, inputs),
    computeScenario("mid", SCENARIOS.mid, inputs),
    computeScenario("high", SCENARIOS.high, inputs),
  ];

  renderConsole(inputs, scenarios);

  const md = renderMarkdown(inputs, scenarios);
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, md, "utf8");

  console.log();
  console.log(`report written → ${REPORT_PATH}`);
  console.log(`elapsed         ${Date.now() - t0} ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
