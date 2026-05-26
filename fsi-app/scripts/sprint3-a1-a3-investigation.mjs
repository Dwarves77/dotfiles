/**
 * sprint3-a1-a3-investigation.mjs — Sprint 3 prework investigation
 * for A1 (classifier-quality cost estimate) + A3 (profiles projection
 * completion).
 *
 * SAFETY PROPERTIES:
 *   - READ-ONLY. No INSERT, UPDATE, or DELETE on any table.
 *   - No Haiku invocation; only counts the rows that would be targeted.
 *   - No service role mutation; uses service role to read RLS-protected
 *     tables (intelligence_items, profiles, org_memberships) without
 *     gating.
 *   - Outputs prework reports to:
 *       docs/audits/sprint3-a1-prework-2026-05-25.json
 *       docs/audits/sprint3-a3-prework-2026-05-25.json
 *
 * Run: node scripts/sprint3-a1-a3-investigation.mjs
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

// Canonical TOPICS list mirrors src/lib/constants.ts. Non-canonical
// category = NOT NULL AND value not in this list.
const TOPICS = [
  "emissions", "fuels", "transport", "reporting", "packaging", "corridors",
  "customs", "trade", "sanctions", "origin",
  "dangerous-goods", "food-safety", "pharma", "security",
  "cabotage", "labor", "infrastructure", "digital", "insurance",
  "standards", "research",
];

const LOG_DIR = resolve("docs", "audits");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────
// A1 — Classifier-quality counts
// ─────────────────────────────────────────────────────────────────

async function a1Investigation() {
  console.log("[A1] counting target rows for classifier-quality batch...");

  // Total items.
  const { count: totalCount } = await supabase
    .from("intelligence_items")
    .select("id", { count: "exact", head: true });

  // Category IS NULL (ambiguous bucket — Phase 3D deferral remainder).
  const { count: nullCategoryCount } = await supabase
    .from("intelligence_items")
    .select("id", { count: "exact", head: true })
    .is("category", null);

  // domain=1 AND category='research' (cross-axis misalignment bucket).
  const { count: d1ResearchCount } = await supabase
    .from("intelligence_items")
    .select("id", { count: "exact", head: true })
    .eq("domain", 1)
    .eq("category", "research");

  // Non-canonical category (set but not in TOPICS).
  const { data: nonCanonicalRows } = await supabase
    .from("intelligence_items")
    .select("id, title, category")
    .not("category", "is", null)
    .not("category", "in", `(${TOPICS.map((t) => `"${t}"`).join(",")})`);
  const nonCanonicalCount = nonCanonicalRows?.length ?? 0;

  // Sample of non-canonical categories.
  const nonCanonicalCategoryHistogram = {};
  for (const r of nonCanonicalRows ?? []) {
    const c = r.category ?? "(null)";
    nonCanonicalCategoryHistogram[c] = (nonCanonicalCategoryHistogram[c] ?? 0) + 1;
  }

  // 3 specific misclassifications — Green Corridors, UNDP Environmental
  // Finance, EcoVadis. Search by title fragment.
  const { data: specificHits } = await supabase
    .from("intelligence_items")
    .select("id, title, category, domain")
    .or(
      "title.ilike.%green corridors%,title.ilike.%UNDP%,title.ilike.%EcoVadis%"
    );

  const a1 = {
    investigation_date: new Date().toISOString(),
    totals: {
      total_intelligence_items: totalCount,
      category_is_null: nullCategoryCount,
      d1_category_research: d1ResearchCount,
      non_canonical_category: nonCanonicalCount,
      specific_misclassifications_hit_count: specificHits?.length ?? 0,
    },
    expected_per_dispatch_brief: {
      "409 ambiguous category rows": "category IS NULL bucket",
      "24 d=1 'research' category rows": "domain=1 AND category='research'",
      "32 non-canonical category rows": "category NOT NULL AND NOT IN TOPICS",
      "3 specific surfaced misclassifications": "title ILIKE %Green Corridors% OR %UNDP% OR %EcoVadis%",
    },
    deltas: {
      ambiguous_actual_vs_expected_409: (nullCategoryCount ?? 0) - 409,
      d1_research_actual_vs_expected_24: (d1ResearchCount ?? 0) - 24,
      non_canonical_actual_vs_expected_32: nonCanonicalCount - 32,
    },
    non_canonical_category_histogram: nonCanonicalCategoryHistogram,
    specific_misclassifications: (specificHits ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      current_category: r.category,
      current_domain: r.domain,
    })),
    cost_estimate: {
      per_call_usd: 0.0025,
      per_call_calibration_source: "Step 2 source-classification calibration (v3 dispatch)",
      total_rows_to_classify:
        (nullCategoryCount ?? 0) +
        (d1ResearchCount ?? 0) +
        nonCanonicalCount,
      estimated_total_usd:
        ((nullCategoryCount ?? 0) +
          (d1ResearchCount ?? 0) +
          nonCanonicalCount) *
        0.0025,
      ceiling_usd_per_dispatch_brief: 5,
    },
    next_step: "Operator review of cost estimate. If estimate ≤ $5, authorize Haiku batch invocation.",
  };

  writeFileSync(
    resolve(LOG_DIR, "sprint3-a1-prework-2026-05-25.json"),
    JSON.stringify(a1, null, 2)
  );
  console.log(`[A1] wrote ${resolve(LOG_DIR, "sprint3-a1-prework-2026-05-25.json")}`);
  return a1;
}

// ─────────────────────────────────────────────────────────────────
// A3 — Profiles projection completion counts
// ─────────────────────────────────────────────────────────────────

async function a3Investigation() {
  console.log("[A3] counting profiles projection NULLs + multi-org users...");

  // Total profiles.
  const { count: totalProfiles } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });

  // NULL counts on each projection column. Migration 105 set defaults
  // sector='{}' (empty array) and region='{}' (empty array), so for
  // those we count empty-array values rather than NULL. org_id and
  // workspace_role default to NULL.
  const { count: nullOrgId } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .is("org_id", null);

  const { count: nullWorkspaceRole } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .is("workspace_role", null);

  // For sector + region, count rows where array length = 0 (empty array
  // is the migration 105 default; we want to know how many have NOT been
  // populated). Server-side array_length isn't accessible via the JS SDK
  // cleanly; fetch all rows and count client-side.
  const { data: sectorRegionRows } = await supabase
    .from("profiles")
    .select("id, sector, region");
  let emptySector = 0;
  let emptyRegion = 0;
  for (const r of sectorRegionRows ?? []) {
    if (!Array.isArray(r.sector) || r.sector.length === 0) emptySector++;
    if (!Array.isArray(r.region) || r.region.length === 0) emptyRegion++;
  }

  // org_memberships — how many users have memberships in multiple orgs?
  // Single query, count by user_id.
  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("user_id, org_id, role");
  const userOrgCount = new Map();
  for (const m of memberships ?? []) {
    const set = userOrgCount.get(m.user_id) ?? new Set();
    set.add(m.org_id);
    userOrgCount.set(m.user_id, set);
  }
  let multiOrgUsers = 0;
  let singleOrgUsers = 0;
  let noOrgUsers = 0;
  for (const [uid, orgs] of userOrgCount) {
    if (orgs.size > 1) multiOrgUsers++;
    else if (orgs.size === 1) singleOrgUsers++;
  }
  // Users with no membership are profiles - users-with-membership.
  noOrgUsers = (totalProfiles ?? 0) - (multiOrgUsers + singleOrgUsers);

  // Spot-check: pick 5 profiles where org_id IS NULL and find what
  // membership rows they have (the backfill source).
  const { data: nullOrgIdSamples } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .is("org_id", null)
    .limit(5);
  const sampleBackfillPreviews = [];
  for (const p of nullOrgIdSamples ?? []) {
    const userMemberships = (memberships ?? []).filter((m) => m.user_id === p.id);
    sampleBackfillPreviews.push({
      profile_id: p.id,
      full_name: p.full_name,
      email: p.email,
      memberships_count: userMemberships.length,
      memberships_sample: userMemberships.slice(0, 3),
    });
  }

  const a3 = {
    investigation_date: new Date().toISOString(),
    profiles_totals: {
      total_profiles: totalProfiles,
      org_id_null: nullOrgId,
      workspace_role_null: nullWorkspaceRole,
      sector_empty_array: emptySector,
      region_empty_array: emptyRegion,
    },
    org_memberships_totals: {
      total_membership_rows: memberships?.length ?? 0,
      unique_users_with_memberships: userOrgCount.size,
      multi_org_users: multiOrgUsers,
      single_org_users: singleOrgUsers,
      no_org_users: noOrgUsers,
    },
    multi_org_implication: {
      note: "If multi_org_users > 0, profiles.org_id needs a deterministic 'active org' selection rule. Per dispatch brief: org_memberships is source of truth, profiles.org_id is 'current active org' pointer. Backfill picks the oldest membership (joined_at ASC) as the default active org.",
      multi_org_count: multiOrgUsers,
    },
    sample_backfill_previews: sampleBackfillPreviews,
    next_step: "Operator review of NULL counts + multi-org count. Authorize backfill SQL when ready.",
  };

  writeFileSync(
    resolve(LOG_DIR, "sprint3-a3-prework-2026-05-25.json"),
    JSON.stringify(a3, null, 2)
  );
  console.log(`[A3] wrote ${resolve(LOG_DIR, "sprint3-a3-prework-2026-05-25.json")}`);
  return a3;
}

// ─────────────────────────────────────────────────────────────────

async function main() {
  const a1 = await a1Investigation();
  const a3 = await a3Investigation();
  console.log("\n===== A1 SUMMARY =====");
  console.log(JSON.stringify(a1.totals, null, 2));
  console.log(JSON.stringify(a1.deltas, null, 2));
  console.log(JSON.stringify(a1.cost_estimate, null, 2));
  console.log("\n===== A3 SUMMARY =====");
  console.log(JSON.stringify(a3.profiles_totals, null, 2));
  console.log(JSON.stringify(a3.org_memberships_totals, null, 2));
  console.log(JSON.stringify(a3.multi_org_implication, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
