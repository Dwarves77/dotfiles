/**
 * pr-a2-investigate-deeper.mjs — broader content scan for retag
 * candidates the primary investigation may have missed.
 *
 * Searches ALL non-archived intelligence_items for state references
 * in title + summary + full_brief, then filters to items currently
 * tagged with bare ["US"] (no sub-national) for NY/WA/TX-specific
 * content. NO WRITES.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const STATE_KEYWORDS = {
  NY: {
    iso: "US-NY",
    needles: [
      /\bnew\s*york(?!er)/i,
      /\bnyc\b/i,
      /\bnysdec\b/i,
      /\bnyserda\b/i,
      /\bny\s*dec\b/i,
      /\balbany\b/i,
    ],
    excludeIfAny: ["nyc-local-law-97-building-carbon-emissions-caps"],
  },
  WA: {
    iso: "US-WA",
    needles: [
      /\bwashington\s+state\b/i,
      /\bwa\s+ecology\b/i,
      /\bseattle\b/i,
      /\btacoma\b/i,
      /\bpuget\s*sound\b/i,
      /\bwsdot\b/i,
    ],
    excludeIfAny: [],
  },
  TX: {
    iso: "US-TX",
    needles: [
      /\btexas\b/i,
      /\btceq\b/i,
      /\bhouston\b/i,
      /\bgalveston\b/i,
      /\bgulf\s*coast\b/i,
      /\bdallas\b/i,
    ],
    excludeIfAny: [],
  },
};

const report = { generatedAt: new Date().toISOString(), per_state: {} };

const PAGE = 1000;
let from = 0;
let allRows = [];
while (true) {
  const { data, error } = await supabase
    .from("intelligence_items")
    .select("legacy_id, title, summary, full_brief, jurisdictions, jurisdiction_iso, source_id, priority, item_type")
    .eq("is_archived", false)
    .range(from, from + PAGE - 1);
  if (error) throw error;
  if (!data || data.length === 0) break;
  allRows = allRows.concat(data);
  if (data.length < PAGE) break;
  from += PAGE;
}
report.total_active_rows_scanned = allRows.length;

for (const [code, def] of Object.entries(STATE_KEYWORDS)) {
  const matches = [];
  for (const row of allRows) {
    const haystack = [
      row.title ?? "",
      row.summary ?? "",
      typeof row.full_brief === "string"
        ? row.full_brief
        : JSON.stringify(row.full_brief ?? ""),
    ].join(" \n ");
    if (!def.needles.some((re) => re.test(haystack))) continue;
    if (def.excludeIfAny.includes(row.legacy_id)) continue;

    const iso = Array.isArray(row.jurisdiction_iso) ? row.jurisdiction_iso : [];
    // Skip if already sub-national tagged
    if (iso.some((j) => j.startsWith("US-"))) continue;
    // Only consider items tagged with bare "US" (no sub-national)
    if (!iso.includes("US")) continue;

    matches.push({
      legacy_id: row.legacy_id,
      title: row.title,
      jurisdiction_iso: iso,
      source_id: row.source_id,
      priority: row.priority,
      item_type: row.item_type,
      summary_excerpt: (row.summary ?? "").slice(0, 300),
    });
  }
  report.per_state[code] = {
    iso: def.iso,
    candidate_count: matches.length,
    candidates: matches,
  };
}

const outPath = resolve("..", "docs", "pr-a2-investigation-deeper-2026-05-07.json");
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`\n[written] ${outPath}`);
