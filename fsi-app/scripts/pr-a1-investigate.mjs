/**
 * pr-a1-investigate.mjs — read-only investigation for PR-A1.
 *
 * Captures the four investigation steps required by the dispatch:
 *   1. Schema check: jurisdictions and jurisdiction_iso columns on
 *      intelligence_items, accept arbitrary TEXT[] (already known from
 *      migrations; this script confirms by sampling).
 *   2. California baseline: pull the four w4_ca_* items, dump
 *      jurisdictions, jurisdiction_iso, source_id, priority. Surface
 *      candidate California-tagged items not already in the four.
 *   3. Source registry baseline: query sources for arb.ca.gov and
 *      leginfo.legislature.ca.gov.
 *   4. Staged_updates materialization audit: count of approved
 *      staged_updates, count where materialized_at IS NULL, plus a
 *      drift check comparing proposed_changes to materialized rows.
 *
 * NO WRITES. Output is a JSON report to stdout AND to
 * docs/pr-a1-investigation-2026-05-06.json so Jason can read either form.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

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

const report = {
  generatedAt: new Date().toISOString(),
  step1_schema: {},
  step2_california_baseline: {},
  step3_source_registry: {},
  step4_staged_updates_audit: {},
};

// ─── Step 1: Schema check ──────────────────────────────────────────────
// Confirm the two jurisdiction columns exist and accept arbitrary TEXT[].
// We sample distinct values from each to confirm shape (lowercase legacy
// vs uppercase ISO).
{
  const { data: jurisSample, error: e1 } = await supabase
    .from("intelligence_items")
    .select("jurisdictions, jurisdiction_iso")
    .limit(50);
  if (e1) {
    report.step1_schema.error = e1.message;
  } else {
    const allLegacy = new Set();
    const allIso = new Set();
    for (const row of jurisSample) {
      for (const j of row.jurisdictions ?? []) allLegacy.add(j);
      for (const j of row.jurisdiction_iso ?? []) allIso.add(j);
    }
    report.step1_schema = {
      legacy_jurisdictions_distinct_sample: Array.from(allLegacy).sort(),
      jurisdiction_iso_distinct_sample: Array.from(allIso).sort(),
      schema_unbounded: true,
      note:
        "Both columns are TEXT[]. No schema migration required to accept 'us-ca' or 'US-CA'. Legacy `jurisdictions` uses lowercase free-text; canonical `jurisdiction_iso` uses ISO 3166-1/2 uppercase codes. Sub-national tagging belongs in jurisdiction_iso per migration 033's design.",
    };
  }
}

// ─── Step 2: California baseline ───────────────────────────────────────
const FOUR_CA_LEGACY_IDS = [
  "w4_ca_sb253",
  "w4_ca_sb261",
  "w4_ca_ab1305",
  "w4_ca_acf",
];
{
  const { data: caRows, error: e2 } = await supabase
    .from("intelligence_items")
    .select(
      "id, legacy_id, title, jurisdictions, jurisdiction_iso, source_id, priority, item_type, is_archived"
    )
    .in("legacy_id", FOUR_CA_LEGACY_IDS);
  if (e2) {
    report.step2_california_baseline.error = e2.message;
  } else {
    report.step2_california_baseline.four_items = caRows.map((r) => ({
      legacy_id: r.legacy_id,
      title: r.title,
      jurisdictions: r.jurisdictions,
      jurisdiction_iso: r.jurisdiction_iso,
      source_id: r.source_id,
      priority: r.priority,
      item_type: r.item_type,
      is_archived: r.is_archived,
    }));
    const present = new Set(caRows.map((r) => r.legacy_id));
    report.step2_california_baseline.missing_ids = FOUR_CA_LEGACY_IDS.filter(
      (id) => !present.has(id)
    );
  }
}

// Candidate scan: items that mention California regulators/laws by title
// or summary content but are NOT in the four. Surface for awareness only.
{
  const { data: caCandidates, error: e2b } = await supabase
    .from("intelligence_items")
    .select("legacy_id, title, jurisdictions, jurisdiction_iso, priority")
    .or(
      "title.ilike.%california%,title.ilike.%CARB%,title.ilike.%SB 253%,title.ilike.%SB 261%,title.ilike.%AB 1305%,title.ilike.%advanced clean fleets%"
    )
    .eq("is_archived", false);
  if (e2b) {
    report.step2_california_baseline.candidate_scan_error = e2b.message;
  } else {
    report.step2_california_baseline.candidates_outside_four = (
      caCandidates ?? []
    )
      .filter((r) => !FOUR_CA_LEGACY_IDS.includes(r.legacy_id))
      .map((r) => ({
        legacy_id: r.legacy_id,
        title: r.title,
        jurisdictions: r.jurisdictions,
        jurisdiction_iso: r.jurisdiction_iso,
        priority: r.priority,
      }));
  }
}

// Items already tagged us-ca / US-CA somewhere
{
  const { data: caIsoTagged, error: e2c } = await supabase
    .from("intelligence_items")
    .select("legacy_id, title, jurisdictions, jurisdiction_iso")
    .or("jurisdictions.cs.{us-ca},jurisdiction_iso.cs.{US-CA}");
  if (e2c) {
    report.step2_california_baseline.iso_tagged_scan_error = e2c.message;
  } else {
    report.step2_california_baseline.already_us_ca_tagged_count =
      caIsoTagged?.length ?? 0;
    report.step2_california_baseline.already_us_ca_tagged = (caIsoTagged ?? []).map(
      (r) => ({
        legacy_id: r.legacy_id,
        title: r.title,
        jurisdictions: r.jurisdictions,
        jurisdiction_iso: r.jurisdiction_iso,
      })
    );
  }
}

// ─── Step 3: Source registry baseline ──────────────────────────────────
{
  const { data: caSources, error: e3 } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, jurisdictions, jurisdiction_iso, admin_only")
    .or("url.ilike.%arb.ca.gov%,url.ilike.%leginfo.legislature.ca.gov%");
  if (e3) {
    report.step3_source_registry.error = e3.message;
  } else {
    report.step3_source_registry.matches = caSources ?? [];
    report.step3_source_registry.count = caSources?.length ?? 0;
  }
}

// ─── Step 4: Staged_updates materialization audit ──────────────────────
{
  // Total approved staged_updates
  const { count: totalApproved, error: e4a } = await supabase
    .from("staged_updates")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");
  report.step4_staged_updates_audit.total_approved = totalApproved ?? null;
  if (e4a) report.step4_staged_updates_audit.total_approved_error = e4a.message;

  // Approved-but-unmaterialized (per migration 034 partial index)
  const { count: unmaterialized, error: e4b } = await supabase
    .from("staged_updates")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .is("materialized_at", null);
  report.step4_staged_updates_audit.approved_unmaterialized = unmaterialized ?? null;
  if (e4b)
    report.step4_staged_updates_audit.approved_unmaterialized_error = e4b.message;

  // Detailed list of approved-but-unmaterialized
  const { data: unmatRows, error: e4c } = await supabase
    .from("staged_updates")
    .select(
      "id, update_type, item_id, source_id, proposed_changes, reason, status, reviewed_by, reviewed_at, materialization_error, materialized_at, materialized_item_id, created_at"
    )
    .eq("status", "approved")
    .is("materialized_at", null)
    .order("created_at", { ascending: true });
  if (e4c) {
    report.step4_staged_updates_audit.unmaterialized_list_error = e4c.message;
  } else {
    report.step4_staged_updates_audit.unmaterialized_list = (unmatRows ?? []).map(
      (r) => ({
        id: r.id,
        update_type: r.update_type,
        item_id: r.item_id,
        source_id: r.source_id,
        reason: r.reason,
        materialization_error: r.materialization_error,
        proposed_changes_keys: Object.keys(r.proposed_changes ?? {}),
        created_at: r.created_at,
        reviewed_at: r.reviewed_at,
      })
    );
  }

  // Drift check: approved + materialized, but proposed_changes not reflected
  // in target row. Inspect approvals that DID materialize and check at least
  // priority and title fields for divergence — those are the high-signal
  // ones for the California ACF case Jason flagged.
  const { data: matRows, error: e4d } = await supabase
    .from("staged_updates")
    .select(
      "id, update_type, item_id, proposed_changes, materialized_item_id, materialized_at"
    )
    .eq("status", "approved")
    .not("materialized_at", "is", null);
  if (e4d) {
    report.step4_staged_updates_audit.materialized_list_error = e4d.message;
  } else {
    report.step4_staged_updates_audit.total_materialized = matRows?.length ?? 0;
    const drift = [];
    // Bulk fetch the items referenced for drift comparison
    const itemIds = (matRows ?? [])
      .map((r) => r.materialized_item_id || r.item_id)
      .filter(Boolean);
    let itemsById = {};
    if (itemIds.length > 0) {
      const { data: items, error: e4e } = await supabase
        .from("intelligence_items")
        .select("id, legacy_id, title, priority, jurisdictions, jurisdiction_iso")
        .in("id", itemIds);
      if (e4e) {
        report.step4_staged_updates_audit.items_lookup_error = e4e.message;
      } else {
        for (const it of items ?? []) itemsById[it.id] = it;
      }
    }
    for (const su of matRows ?? []) {
      const targetId = su.materialized_item_id || su.item_id;
      const item = targetId ? itemsById[targetId] : null;
      if (!item) continue;
      const changes = su.proposed_changes ?? {};
      const drifted = [];
      for (const k of ["priority", "title", "jurisdictions", "jurisdiction_iso"]) {
        if (changes[k] === undefined) continue;
        const proposed = changes[k];
        const current = item[k];
        const equal = JSON.stringify(proposed) === JSON.stringify(current);
        if (!equal) {
          drifted.push({
            field: k,
            proposed,
            current,
          });
        }
      }
      if (drifted.length > 0) {
        drift.push({
          staged_update_id: su.id,
          update_type: su.update_type,
          item_legacy_id: item.legacy_id,
          item_id: targetId,
          item_title: item.title,
          drifted_fields: drifted,
        });
      }
    }
    report.step4_staged_updates_audit.drift_cases = drift;
    report.step4_staged_updates_audit.drift_count = drift.length;
  }
}

// ─── Output ────────────────────────────────────────────────────────────
const outPath = resolve("..", "docs", "pr-a1-investigation-2026-05-06.json");
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`\n[written] ${outPath}`);
