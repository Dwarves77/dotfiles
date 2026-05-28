/**
 * sprint3-corpus-reclassify-crosscheck.mjs
 *
 * Sprint 3 CORPUS-RECLASSIFY-SOURCES — URL cross-check phase
 * (operator-locked 2026-05-27). Read-only.
 *
 * Re-queries the 319 active D1 intelligence_items, re-applies the same
 * 7 source-aggregator regex patterns the prior audit (committed 7ceb80e)
 * used to identify 111 candidates, then for each pattern-matched row
 * queries `sources` table for a URL match.
 *
 * Output: docs/audits/sprint3-corpus-reclassify-crosscheck-2026-05-27.json
 *   - All 111 candidates with their cross-check status (URL_MATCH /
 *     NO_MATCH) and the matched sources row when present
 *   - Summary: per-status counts, by-priority breakdown, sample rows
 *
 * Operator uses this output to confirm the duplicate set count + sample
 * before any UPDATE / INSERT writes are drafted.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");

// ── env ─────────────────────────────────────────────────────────────
const envText = readFileSync(resolve(APP_ROOT, ".env.local"), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

// ── 7 patterns from the prior audit ────────────────────────────────
const PATTERNS = [
  { label: "homepage_or_portal", re: /\b(homepage|main portal|portal)\b/i },
  { label: "framework_or_overview", re: /\b(framework|overview|organizational overview)\b/i },
  { label: "key_regulatory_updates", re: /\b(key regulatory updates|regulatory resources)\b/i },
  { label: "parliamentary_legislative_portal", re: /\b(parliamentary information|legislative portal)\b/i },
  { label: "current_notices", re: /\b(current environmental notices)\b/i },
  { label: "org_then_generic_descriptor", re: /[A-Z][a-z]+ (Department|Ministry|Agency|Authority|Council|Commission)\s*[-—:]\s*(Organizational|Portal|Resources)\b/i },
  { label: "dash_key_dash_resources", re: /\s[-–—]\s.*\b(Resources|Resources and|Updates|Updates and)\b/i },
];

function matchPatterns(text) {
  const hits = [];
  for (const p of PATTERNS) if (p.re.test(text)) hits.push(p.label);
  return hits;
}

// URL-key normalization: lowercase, strip trailing slash, drop query+fragment.
function urlKey(u) {
  if (!u) return null;
  try {
    const url = new URL(u);
    return (url.origin + url.pathname).toLowerCase().replace(/\/$/, "");
  } catch {
    return u.toLowerCase().replace(/\/$/, "");
  }
}

// ── 1. Re-query D1 active rows ─────────────────────────────────────
console.log("[crosscheck] querying D1 active intelligence_items …");
const { data: rows, error: qErr } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, summary, source_url, source_id, priority, item_type")
  .eq("domain", 1)
  .eq("is_archived", false);
if (qErr) {
  console.error("query failed:", qErr.message);
  process.exit(1);
}
console.log(`[crosscheck] loaded ${rows.length} rows`);

// ── 2. Pattern-match to 111 candidates ─────────────────────────────
// Title-only match to align with the prior audit's 111 count.
// (The audit script tested against r.title only, not title + summary.)
const candidates = [];
for (const r of rows) {
  const hits = matchPatterns(r.title || "");
  if (hits.length > 0) candidates.push({ ...r, hits });
}
console.log(`[crosscheck] pattern-matched (title-only): ${candidates.length} candidates`);

// ── 3. Load sources table for URL cross-check ──────────────────────
console.log("[crosscheck] loading sources table for URL cross-check …");
const { data: allSources, error: srcErr } = await supabase
  .from("sources")
  .select("id, name, url, source_role, base_tier, status, category");
if (srcErr) {
  console.error("sources load failed:", srcErr.message);
  process.exit(1);
}
console.log(`[crosscheck] loaded ${allSources.length} sources rows`);

// Build URL → sources map.
const sourcesByKey = new Map();
for (const s of allSources) {
  const k = urlKey(s.url);
  if (!k) continue;
  if (!sourcesByKey.has(k)) sourcesByKey.set(k, []);
  sourcesByKey.get(k).push(s);
}

// ── 4. Cross-check each candidate ──────────────────────────────────
const results = candidates.map((c) => {
  const candidateKey = urlKey(c.source_url);
  const matched = candidateKey ? sourcesByKey.get(candidateKey) || [] : [];
  return {
    id: c.id,
    legacy_id: c.legacy_id,
    title: c.title,
    source_url: c.source_url,
    intel_source_id: c.source_id,
    priority: c.priority,
    item_type: c.item_type,
    hits: c.hits,
    summary_excerpt: (c.summary || "").slice(0, 120),
    url_match_status: matched.length > 0 ? "URL_MATCH" : "NO_MATCH",
    matched_sources: matched.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      source_role: s.source_role,
      base_tier: s.base_tier,
      status: s.status,
      category: s.category,
    })),
    // Sanity flag: does the intel_source_id already point at the same
    // sources row? If so, that's confirmation the URL/source link is
    // already wired — the intelligence_item is the duplicate.
    intel_source_id_matches_url_source: matched.some((s) => s.id === c.source_id),
  };
});

// ── 5. Summary ─────────────────────────────────────────────────────
const urlMatch = results.filter((r) => r.url_match_status === "URL_MATCH");
const noMatch = results.filter((r) => r.url_match_status === "NO_MATCH");

const priorityDist = (rs) =>
  rs.reduce((acc, r) => {
    acc[r.priority] = (acc[r.priority] || 0) + 1;
    return acc;
  }, {});

const itemTypeDist = (rs) =>
  rs.reduce((acc, r) => {
    acc[r.item_type] = (acc[r.item_type] || 0) + 1;
    return acc;
  }, {});

const intelSourceIdAligned = urlMatch.filter((r) => r.intel_source_id_matches_url_source).length;

console.log("\n--- CROSSCHECK SUMMARY ---");
console.log(`candidates evaluated:           ${candidates.length}`);
console.log(`URL_MATCH (in sources table):   ${urlMatch.length}`);
console.log(`  of which intel.source_id already = matched source: ${intelSourceIdAligned}`);
console.log(`NO_MATCH:                       ${noMatch.length}`);
console.log("");
console.log("URL_MATCH priority distribution:", priorityDist(urlMatch));
console.log("URL_MATCH item_type distribution:", itemTypeDist(urlMatch));
console.log("");
console.log("NO_MATCH priority distribution:", priorityDist(noMatch));
console.log("NO_MATCH item_type distribution:", itemTypeDist(noMatch));
console.log("");
console.log("Sample URL_MATCH rows (first 10):");
for (const r of urlMatch.slice(0, 10)) {
  const aligned = r.intel_source_id_matches_url_source ? "✓" : "✗";
  console.log(`  ${aligned} ${r.id.slice(0, 8)}  ${r.priority.padEnd(8)} ${r.item_type.padEnd(12)} ${(r.title || "").slice(0, 70)}`);
}
console.log("");
console.log("Sample NO_MATCH rows (first 10):");
for (const r of noMatch.slice(0, 10)) {
  console.log(`    ${r.id.slice(0, 8)}  ${r.priority.padEnd(8)} ${r.item_type.padEnd(12)} ${(r.title || "").slice(0, 70)}`);
}

// ── 6. Persist ─────────────────────────────────────────────────────
const outPath = resolve(APP_ROOT, "docs/audits/sprint3-corpus-reclassify-crosscheck-2026-05-27.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      run_date: new Date().toISOString(),
      candidates_evaluated: candidates.length,
      url_match_count: urlMatch.length,
      url_match_with_aligned_source_id: intelSourceIdAligned,
      no_match_count: noMatch.length,
      url_match_priority_distribution: priorityDist(urlMatch),
      url_match_item_type_distribution: itemTypeDist(urlMatch),
      no_match_priority_distribution: priorityDist(noMatch),
      no_match_item_type_distribution: itemTypeDist(noMatch),
      url_match_rows: urlMatch,
      no_match_rows: noMatch,
    },
    null,
    2
  )
);
console.log(`\n[crosscheck] wrote ${outPath}`);
