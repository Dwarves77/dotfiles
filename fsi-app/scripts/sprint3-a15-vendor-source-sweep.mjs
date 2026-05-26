/**
 * sprint3-a15-vendor-source-sweep.mjs — Sprint 3 A1.5 commercial-vendor
 * source sweep (read-only).
 *
 * SAFETY: READ-ONLY. No INSERT/UPDATE/DELETE. Just runs the operator-
 * authored sweep query against the sources table and outputs results
 * for operator review.
 *
 * Surfaces sources whose name or description match commercial-vendor
 * SaaS / ESG ratings / audit-service patterns. Operator reviews and
 * flags which are commercial-vendor (route to domain 5 or archive)
 * vs. legitimate intelligence sources.
 *
 * Output: docs/audits/sprint3-a15-vendor-source-sweep-2026-05-25.json
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
const OUT = resolve(LOG_DIR, "sprint3-a15-vendor-source-sweep-2026-05-25.json");

async function main() {
  console.log("[A1.5] running commercial-vendor source sweep...");

  // Operator-authored sweep. Two passes: name patterns + description patterns.
  // PostgREST .or() is shape-constrained, so split into two queries and
  // merge results client-side (dedup by id).
  const namePatterns = [
    "name.ilike.%ecovadis%",
    "name.ilike.%sustainalytics%",
    "name.ilike.%msci esg%",
    "name.ilike.%refinitiv esg%",
    "name.ilike.%cdp%",
    "name.ilike.%isos labs%",
  ].join(",");

  const descPatterns = [
    "description.ilike.%ratings platform%",
    "description.ilike.%esg saas%",
    "description.ilike.%audit services%",
  ].join(",");

  const [nameRes, descRes] = await Promise.all([
    supabase
      .from("sources")
      .select("id, name, url, category, base_tier, status, admin_only, description, notes")
      .or(namePatterns),
    supabase
      .from("sources")
      .select("id, name, url, category, base_tier, status, admin_only, description, notes")
      .or(descPatterns),
  ]);

  if (nameRes.error) console.error("name query error:", nameRes.error);
  if (descRes.error) console.error("desc query error:", descRes.error);

  // Dedup by id; tag each row with which patterns matched.
  const seen = new Map();
  for (const r of nameRes.data ?? []) {
    seen.set(r.id, { ...r, matched_via: ["name"] });
  }
  for (const r of descRes.data ?? []) {
    if (seen.has(r.id)) {
      seen.get(r.id).matched_via.push("description");
    } else {
      seen.set(r.id, { ...r, matched_via: ["description"] });
    }
  }
  const merged = Array.from(seen.values());

  // Per-source: pull attributed intelligence_items so operator can
  // review titles + current routing inline. Surfaces the downstream
  // blast radius if the source gets reclassified or its items archived.
  const sourceIds = merged.map((s) => s.id);
  const itemsBySource = new Map();
  if (sourceIds.length > 0) {
    const { data: items } = await supabase
      .from("intelligence_items")
      .select("id, title, source_id, category, domain, item_type, is_archived, pipeline_stage")
      .in("source_id", sourceIds);
    for (const it of items ?? []) {
      const arr = itemsBySource.get(it.source_id) ?? [];
      arr.push({
        id: it.id,
        title: it.title,
        category: it.category,
        domain: it.domain,
        item_type: it.item_type,
        is_archived: it.is_archived,
        pipeline_stage: it.pipeline_stage,
      });
      itemsBySource.set(it.source_id, arr);
    }
  }

  const enriched = merged.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    category: s.category,
    base_tier: s.base_tier,
    status: s.status,
    admin_only: s.admin_only,
    matched_via: s.matched_via,
    intelligence_item_count: (itemsBySource.get(s.id) ?? []).length,
    intelligence_items: itemsBySource.get(s.id) ?? [],
    description_snippet: s.description ? s.description.slice(0, 280) : null,
    notes_snippet: s.notes ? s.notes.slice(0, 280) : null,
  }));

  // Sort by intelligence_item_count DESC (biggest blast radius first).
  enriched.sort((a, b) => b.intelligence_item_count - a.intelligence_item_count);

  const output = {
    run_date: new Date().toISOString(),
    operator_query: {
      name_patterns: ["%ecovadis%", "%sustainalytics%", "%msci esg%", "%refinitiv esg%", "%cdp%", "%isos labs%"],
      description_patterns: ["%ratings platform%", "%esg saas%", "%audit services%"],
    },
    total_matches: enriched.length,
    total_items_attributed: enriched.reduce((sum, s) => sum + s.intelligence_item_count, 0),
    sources: enriched,
  };

  writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`[A1.5] wrote ${OUT}`);
  console.log(`[A1.5] ${enriched.length} sources matched; ${output.total_items_attributed} intelligence items attributed.`);
  for (const s of enriched) {
    console.log(`  [${s.id.slice(0, 8)}] T${s.base_tier ?? "?"} cat=${s.category ?? "null"} items=${s.intelligence_item_count} matched_via=${s.matched_via.join("+")} ${s.name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
