/**
 * sprint3-a16-reconciliation.mjs — Cross-surface count reconciliation
 * after A1.6.A/B/C land. Per Phase 2A pattern.
 *
 * READ-ONLY. Surfaces:
 *   - Per-domain item counts (pre-from-manifest vs post-actual)
 *   - Per-item_type counts (pre-from-manifest vs post-actual)
 *   - Category histogram (post-actual only)
 *   - Items still without category (should be small now)
 *   - Items in A1.5 archive bucket (sanity check on archived-EcoVadis)
 *
 * Pre-counts derived from the manifest's `current` state (the
 * snapshot taken before A1.5 + A1.6 landed). Post-counts queried
 * live from the DB.
 *
 * Output: docs/audits/sprint3-a16-reconciliation-2026-05-25.json
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const LOG_DIR = resolve("docs", "audits");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const OUT = resolve(LOG_DIR, "sprint3-a16-reconciliation-2026-05-25.json");

const MANIFEST = JSON.parse(readFileSync(resolve(LOG_DIR, "sprint3-a1-revised-manifest-2026-05-25.json"), "utf8"));

const DOMAIN_LABELS = {
  1: "Regulations",
  2: "Energy & Tech",
  3: "Regional Ops",
  4: "Geopolitical",
  5: "Source Intel",
  6: "Facilities",
  7: "Research Pipeline",
};

async function main() {
  console.log("[A1.6/Reconcile] running cross-surface count reconciliation...");

  // Total item count (active, non-archived).
  const { count: totalActive } = await supabase
    .from("intelligence_items")
    .select("id", { count: "exact", head: true })
    .eq("is_archived", false);

  const { count: totalAll } = await supabase
    .from("intelligence_items")
    .select("id", { count: "exact", head: true });

  // Per-domain counts (active only — matches what customer surfaces see).
  const domainCounts = {};
  for (let d = 1; d <= 7; d++) {
    const { count } = await supabase
      .from("intelligence_items")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("domain", d);
    domainCounts[d] = count ?? 0;
  }

  // Per-item_type counts (active only).
  const itemTypes = [
    "regulation", "directive", "standard", "guidance", "framework",
    "technology", "innovation", "tool",
    "regional_data",
    "market_signal", "initiative",
    "research_finding",
  ];
  const itemTypeCounts = {};
  for (const it of itemTypes) {
    const { count } = await supabase
      .from("intelligence_items")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("item_type", it);
    itemTypeCounts[it] = count ?? 0;
  }

  // Items still without category (active only).
  const { count: nullCategory } = await supabase
    .from("intelligence_items")
    .select("id", { count: "exact", head: true })
    .eq("is_archived", false)
    .is("category", null);

  // Items archived (sanity check on A1.5 takedowns).
  const { count: archivedCount } = await supabase
    .from("intelligence_items")
    .select("id", { count: "exact", head: true })
    .eq("is_archived", true);

  // Category histogram (active only).
  const { data: catRows } = await supabase
    .from("intelligence_items")
    .select("category")
    .eq("is_archived", false);
  const categoryHist = {};
  for (const r of catRows ?? []) {
    const k = r.category ?? "(null)";
    categoryHist[k] = (categoryHist[k] ?? 0) + 1;
  }
  const categoryHistSorted = Object.fromEntries(
    Object.entries(categoryHist).sort((a, b) => b[1] - a[1])
  );

  // Pre-counts derived from manifest's `current` field (what the rows
  // looked like before A1.5 + A1.6 landed). Note: manifest covers only
  // the 474 batch rows, NOT the whole DB. So "expected delta" per the
  // manifest tells us how the touched rows should have moved, even
  // though absolute counts will not match (DB has more rows than just
  // the 474 in the batch).
  const allManifestRows = [
    ...MANIFEST.apply_plan.commit_A_category_only.rows,
    ...MANIFEST.apply_plan.commit_B_domain_changes.rows,
    ...MANIFEST.apply_plan.commit_C_item_type_changes.rows,
    ...MANIFEST.no_change_rows.rows,
    ...MANIFEST.item_type_guard_triggers.rows.map((r) => ({
      id: r.id,
      current: { item_type: r.current_item_type },
      changes: {},
    })),
  ];
  // Dedup by id (rows may appear in multiple commit groups).
  const dedupById = new Map();
  for (const r of allManifestRows) {
    if (!dedupById.has(r.id)) dedupById.set(r.id, r);
  }

  // Expected domain shifts.
  const expectedDomainShifts = { net: {} };
  for (let d = 1; d <= 7; d++) expectedDomainShifts.net[d] = 0;
  for (const r of MANIFEST.apply_plan.commit_B_domain_changes.rows) {
    const from = r.changes.domain.from;
    const to = r.changes.domain.to;
    if (from >= 1 && from <= 7) expectedDomainShifts.net[from] -= 1;
    if (to >= 1 && to <= 7) expectedDomainShifts.net[to] += 1;
  }

  // Expected item_type shifts.
  const expectedItemTypeShifts = { net: {} };
  for (const it of itemTypes) expectedItemTypeShifts.net[it] = 0;
  for (const r of MANIFEST.apply_plan.commit_C_item_type_changes.rows) {
    const from = r.changes.item_type.from;
    const to = r.changes.item_type.to;
    if (from && itemTypes.includes(from)) expectedItemTypeShifts.net[from] -= 1;
    if (to && itemTypes.includes(to)) expectedItemTypeShifts.net[to] += 1;
  }

  const output = {
    run_date: new Date().toISOString(),
    summary: {
      total_items_in_db: totalAll,
      active_items: totalActive,
      archived_items: archivedCount,
      manifest_distinct_touched_rows: dedupById.size,
    },
    per_domain_post_counts: Object.fromEntries(
      Object.entries(domainCounts).map(([d, c]) => [`${d} ${DOMAIN_LABELS[d]}`, c])
    ),
    expected_domain_net_shifts_from_A16B: expectedDomainShifts.net,
    per_item_type_post_counts: itemTypeCounts,
    expected_item_type_net_shifts_from_A16C: expectedItemTypeShifts.net,
    category_histogram_post: categoryHistSorted,
    items_still_without_category: nullCategory,
    a15_archived_items_expected: 5,
    a15_archived_items_actual: archivedCount,
  };

  writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`[A1.6/Reconcile] wrote ${OUT}`);
  console.log(`\n=== SUMMARY ===`);
  console.log(JSON.stringify(output.summary, null, 2));
  console.log(`\n=== DOMAINS (post-A1.6) ===`);
  for (const [k, v] of Object.entries(output.per_domain_post_counts)) {
    const shift = expectedDomainShifts.net[k.charAt(0)] ?? 0;
    console.log(`  ${k}: ${v}${shift !== 0 ? ` (manifest expected net shift: ${shift > 0 ? "+" : ""}${shift})` : ""}`);
  }
  console.log(`\n=== ITEM TYPES (post-A1.6, non-zero only) ===`);
  for (const [k, v] of Object.entries(itemTypeCounts).sort((a, b) => b[1] - a[1])) {
    if (v === 0) continue;
    const shift = expectedItemTypeShifts.net[k] ?? 0;
    console.log(`  ${k}: ${v}${shift !== 0 ? ` (manifest expected net shift: ${shift > 0 ? "+" : ""}${shift})` : ""}`);
  }
  console.log(`\n=== CATEGORIES (post-A1.6, top 15) ===`);
  for (const [k, v] of Object.entries(categoryHistSorted).slice(0, 15)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`\n=== INTEGRITY CHECKS ===`);
  console.log(`  Items still without category: ${nullCategory} (was 409 before A1.6.A)`);
  console.log(`  Items archived: ${archivedCount} (A1.5 took down 5 EcoVadis; pre-Sprint3 archived count was 5 ghost FK targets per CLAUDE.md)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
