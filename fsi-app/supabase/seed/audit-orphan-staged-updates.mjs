// audit-orphan-staged-updates.mjs
//
// W1.B audit: enumerate staged_updates rows that are status='approved'
// (and update_type='new_item') but have NO corresponding intelligence_items
// row. These are the "orphans" the broken approval handler produced before
// migration 034 + the route fix landed.
//
// Matching strategy
// ─────────────────
// staged_updates does NOT historically have a foreign key to intelligence_items
// (that column — materialized_item_id — is added in migration 034 and starts
// NULL for everything pre-existing). So we cannot rely on it for the existing
// orphans.
//
// Instead we match on legacy_id when present, then fall back to source_url +
// title. Order:
//   1. proposed_changes.legacy_id  →  intelligence_items.legacy_id (UNIQUE)
//   2. (fallback) proposed_changes.source_url + title  →  intelligence_items
//      with same source_url AND title (loose; flagged in report).
//
// If migration 034 has run AND materialized_at is set on a row, we trust it
// (skip — already materialized).
//
// Output
// ──────
//   docs/W1B-orphan-staged-updates.json  (machine-readable report)
//   stdout                               (summary table)
//
// Usage:
//   cd fsi-app
//   node supabase/seed/audit-orphan-staged-updates.mjs

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
  "W1B-orphan-staged-updates.json"
);

function ageInDays(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((Date.now() - t) / 86_400_000);
}

function summarizePayload(proposed) {
  if (!proposed || typeof proposed !== "object") {
    return { keys: [], legacy_id: null, source_url: null, title: null };
  }
  return {
    keys: Object.keys(proposed),
    legacy_id: proposed.legacy_id ?? null,
    source_url: proposed.source_url ?? null,
    title: proposed.title ?? null,
    domain: proposed.domain ?? null,
    item_type: proposed.item_type ?? null,
  };
}

async function findIntelMatch(staged) {
  const proposed = staged.proposed_changes ?? {};

  // 1. legacy_id is UNIQUE on intelligence_items — strongest match.
  if (proposed.legacy_id) {
    const { data, error } = await supabase
      .from("intelligence_items")
      .select("id, legacy_id, title, source_url")
      .eq("legacy_id", proposed.legacy_id)
      .maybeSingle();
    if (error) {
      return { match: null, strategy: "legacy_id", error: error.message };
    }
    if (data) return { match: data, strategy: "legacy_id" };
  }

  // 2. Fallback: source_url + title. Looser; flag for manual review.
  if (proposed.source_url && proposed.title) {
    const { data, error } = await supabase
      .from("intelligence_items")
      .select("id, legacy_id, title, source_url")
      .eq("source_url", proposed.source_url)
      .eq("title", proposed.title)
      .limit(1);
    if (error) {
      return {
        match: null,
        strategy: "source_url+title",
        error: error.message,
      };
    }
    if (data && data.length > 0) {
      return { match: data[0], strategy: "source_url+title" };
    }
  }

  return { match: null, strategy: "none" };
}

async function main() {
  const t0 = Date.now();

  const { data: approved, error } = await supabase
    .from("staged_updates")
    .select("*")
    .eq("status", "approved")
    .eq("update_type", "new_item")
    .order("reviewed_at", { ascending: true });

  if (error) {
    console.error("Failed to query staged_updates:", error.message);
    process.exit(1);
  }

  const orphans = [];
  const matched = [];
  let alreadyMaterializedFlagged = 0;

  for (const su of approved ?? []) {
    // If migration 034 ran and this row was materialized via the new path,
    // trust the column. Skip — it's already known-good.
    if (su.materialized_at && su.materialized_item_id) {
      alreadyMaterializedFlagged += 1;
      matched.push({
        id: su.id,
        intel_item_id: su.materialized_item_id,
        strategy: "materialized_at_column",
      });
      continue;
    }

    const { match, strategy, error: matchErr } = await findIntelMatch(su);
    if (matchErr) {
      console.warn(
        `[warn] staged_update=${su.id} match query failed: ${matchErr}`
      );
    }

    if (match) {
      matched.push({
        id: su.id,
        intel_item_id: match.id,
        strategy,
      });
    } else {
      orphans.push({
        id: su.id,
        title:
          su.proposed_changes?.title ?? su.proposed_changes?.legacy_id ?? null,
        source_url: su.proposed_changes?.source_url ?? su.source_url ?? null,
        approved_at: su.reviewed_at ?? null,
        approved_by: su.reviewed_by ?? null,
        age_in_days: ageInDays(su.reviewed_at ?? su.created_at),
        materialization_error: su.materialization_error ?? null,
        payload_summary: summarizePayload(su.proposed_changes),
      });
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    elapsed_ms: Date.now() - t0,
    matching_strategy:
      "1) intelligence_items.legacy_id = proposed_changes.legacy_id (UNIQUE); " +
      "2) fallback intelligence_items.source_url+title = proposed_changes.source_url+title; " +
      "3) trust staged_updates.materialized_at column when set (post-034).",
    counts: {
      total_approved_new_item: approved?.length ?? 0,
      matched: matched.length,
      orphans: orphans.length,
      trusted_via_materialized_column: alreadyMaterializedFlagged,
    },
    orphans,
  };

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("─".repeat(60));
  console.log(`approved+new_item rows scanned : ${report.counts.total_approved_new_item}`);
  console.log(`matched to intelligence_items : ${report.counts.matched}`);
  console.log(`  (via materialized_at col)   : ${alreadyMaterializedFlagged}`);
  console.log(`orphans (NO intel item)       : ${report.counts.orphans}`);
  console.log(`elapsed                       : ${report.elapsed_ms} ms`);
  console.log(`report                        : ${REPORT_PATH}`);
  console.log("─".repeat(60));

  if (orphans.length > 0) {
    console.log("\nFirst 10 orphans:");
    for (const o of orphans.slice(0, 10)) {
      console.log(
        `  ${o.id}  age=${o.age_in_days}d  ${o.title?.slice(0, 70) ?? "<no title>"}`
      );
    }
    if (orphans.length > 10) {
      console.log(`  … and ${orphans.length - 10} more (see JSON report).`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
