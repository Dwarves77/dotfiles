// W1.C — Source attribution audit (READ ONLY)
//
// Walks every intelligence_items row, joins to sources via source_id, and
// compares the host of intelligence_items.source_url against the host of
// the linked sources.url.
//
// The known confirmed bug: CARB regulatory items are linked to the EPA
// source row even though arb.ca.gov ≠ epa.gov. This script flags every
// such mismatch and proposes a `suggested_action` per row that W4 can
// act on (link_to_existing | create_new_source | manual_review).
//
// Read-only: the script only issues SELECTs. It writes one JSON report
// to docs/W1C-source-attribution-audit.json.
//
// Usage (from fsi-app/):
//   node supabase/seed/audit-source-attribution.mjs
//
// Env: prefers SUPABASE_URL, falls back to NEXT_PUBLIC_SUPABASE_URL
// (the canonical name in .env.local for this repo). Service-role key
// required for full read coverage across RLS-protected tables.
//
// ─── eTLD+1 heuristic ───────────────────────────────────────────────
// We do NOT depend on the public-suffix-list package. Instead we apply
// a conservative rule:
//
//   1. lowercase the hostname, strip trailing dot, strip leading "www."
//   2. if the hostname ends with one of the known multi-part suffixes
//      (e.g. .gov.uk, .co.jp, .gov.au, .org.uk, .ac.uk, .com.br, ...),
//      keep the last 3 dotted parts as the eTLD+1.
//   3. otherwise keep the last 2 dotted parts.
//
// This covers the freight/regulator domains we care about:
//   www.epa.gov           → epa.gov
//   ww2.arb.ca.gov        → arb.ca.gov   (ca.gov is NOT in our multi-part list,
//                          so 2-part rule yields ca.gov; we add ca.gov as a
//                          special multi-part because California state agencies
//                          live under sibling subdomains of ca.gov.)
//   www.legislation.gov.uk → legislation.gov.uk
//   eur-lex.europa.eu     → europa.eu
//   www.gov.br/ana        → gov.br        (gov.br IS multi-part — Brazilian
//                          federal portal; everything under it is a sub-agency)
//
// Edge cases we deliberately accept:
//  • europa.eu vs ec.europa.eu vs eur-lex.europa.eu all collapse to
//    europa.eu — that's correct; they're the same publisher.
//  • epa.gov vs www3.epa.gov — same.
//  • sub-state agencies under ca.gov / ny.gov are treated as DIFFERENT
//    eTLD+1s (arb.ca.gov ≠ cdpr.ca.gov ≠ www.ca.gov). We add `.ca.gov`,
//    `.ny.gov`, `.tx.gov` to multi-part to enforce that distinction.
//    This is the whole point of the audit — CARB ≠ EPA ≠ generic ca.gov.
//

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { writeFileSync, mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── eTLD+1 extraction ──────────────────────────────────────────────
// Multi-part public suffixes we treat as one logical TLD. The presence
// of one of these as the trailing portion of the host triggers the
// 3-part eTLD+1 rule. Ordered longest-first so matching is greedy.
const MULTI_PART_SUFFIXES = [
  // sub-state US agencies — each state agency is a distinct publisher
  "ca.gov", "ny.gov", "tx.gov", "fl.gov", "wa.gov", "or.gov", "il.gov",
  "ma.gov", "pa.gov", "mi.gov", "nj.gov", "co.gov", "ga.gov", "nc.gov",
  // common ccTLD multi-parts
  "gov.uk", "ac.uk", "org.uk", "co.uk",
  "gov.au", "com.au", "org.au", "edu.au",
  "gov.br", "com.br", "org.br",
  "gov.in", "co.in", "org.in", "ac.in",
  "co.jp", "or.jp", "ac.jp", "go.jp",
  "gov.cn", "com.cn", "org.cn",
  "gov.sg", "com.sg", "edu.sg",
  "gov.kr", "co.kr", "or.kr",
  "gov.za", "co.za", "org.za",
  "gob.cl", "gob.mx", "gob.ar",
  "gov.it", "gov.es", "gov.fr", "gov.de",
];

function extractHost(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  let s = rawUrl.trim();
  if (!s) return null;
  // Tolerate bare domains pasted as URLs (some sources.url rows lack scheme)
  if (!/^[a-z]+:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    let h = u.hostname.toLowerCase();
    if (h.endsWith(".")) h = h.slice(0, -1);
    if (h.startsWith("www.")) h = h.slice(4);
    return h || null;
  } catch {
    return null;
  }
}

function eTLDPlus1(host) {
  if (!host) return null;
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".") || null;
  // Try multi-part suffix match (longest first, sorted by length desc)
  const sorted = [...MULTI_PART_SUFFIXES].sort((a, b) => b.length - a.length);
  for (const suf of sorted) {
    if (host === suf) return host; // exact (no subdomain)
    if (host.endsWith("." + suf)) {
      // take the label immediately before the suffix + the suffix itself
      const sufParts = suf.split(".").length;
      return parts.slice(-1 - sufParts).join(".");
    }
  }
  // Default: last two dotted parts
  return parts.slice(-2).join(".");
}

// ─── Fetch ──────────────────────────────────────────────────────────
// We fetch all sources first and build a host→source lookup so we can
// suggest link_to_existing candidates without an N+1 query pattern.

console.log("Loading sources …");
const { data: sources, error: srcErr } = await supabase
  .from("sources")
  .select("id, name, url, tier, status");
if (srcErr) {
  console.error("sources query failed:", srcErr.message);
  process.exit(1);
}
console.log(`  ${sources.length} sources`);

// Build lookup: eTLD+1 → array of {id, name, url, tier, status}
const sourcesByETLD = new Map();
for (const s of sources) {
  const host = extractHost(s.url);
  const e = eTLDPlus1(host);
  if (!e) continue;
  if (!sourcesByETLD.has(e)) sourcesByETLD.set(e, []);
  sourcesByETLD.get(e).push({ ...s, _host: host, _etld: e });
}

console.log("Loading intelligence_items with source_url …");
// Fetch in batches to avoid the default 1000-row cap.
async function fetchAllItems() {
  const all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("intelligence_items")
      .select("id, legacy_id, title, source_url, source_id")
      .order("legacy_id", { nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
const items = await fetchAllItems();
console.log(`  ${items.length} intelligence_items rows`);

// ─── Audit pass ─────────────────────────────────────────────────────
const sourceById = new Map(sources.map((s) => [s.id, s]));

let nullSourceIdCount = 0;
let nullSourceIdWithUrl = 0;
let withSourceId = 0;
let mismatches = [];

for (const it of items) {
  if (!it.source_id) {
    nullSourceIdCount++;
    if (it.source_url && it.source_url.trim()) nullSourceIdWithUrl++;
    continue;
  }
  withSourceId++;

  const linkedSource = sourceById.get(it.source_id);
  if (!linkedSource) continue; // dangling FK — extremely unlikely with ON DELETE SET NULL

  const itemHost = extractHost(it.source_url);
  const linkedHost = extractHost(linkedSource.url);
  const itemETLD = eTLDPlus1(itemHost);
  const linkedETLD = eTLDPlus1(linkedHost);

  // Skip rows where intelligence_items.source_url is empty/unparseable —
  // we can't meaningfully compare. Track them under manual_review buckets
  // ONLY if the source_id-vs-url contradiction is detectable.
  if (!itemETLD) continue;
  if (!linkedETLD) {
    // The linked source has no parseable URL — that itself is suspect,
    // but it's a different problem (data quality on sources). Flag it.
    mismatches.push({
      item_id: it.id,
      legacy_id: it.legacy_id,
      item_title: it.title,
      item_source_url: it.source_url,
      item_source_host: itemHost,
      item_source_etld: itemETLD,
      linked_source_id: linkedSource.id,
      linked_source_name: linkedSource.name,
      linked_source_url: linkedSource.url,
      linked_source_host: linkedHost,
      linked_source_etld: linkedETLD,
      reason: "linked_source_has_unparseable_url",
      ...classify(itemETLD, sourcesByETLD, linkedSource.id),
    });
    continue;
  }

  if (itemETLD !== linkedETLD) {
    mismatches.push({
      item_id: it.id,
      legacy_id: it.legacy_id,
      item_title: it.title,
      item_source_url: it.source_url,
      item_source_host: itemHost,
      item_source_etld: itemETLD,
      linked_source_id: linkedSource.id,
      linked_source_name: linkedSource.name,
      linked_source_url: linkedSource.url,
      linked_source_host: linkedHost,
      linked_source_etld: linkedETLD,
      reason: "host_etld_mismatch",
      ...classify(itemETLD, sourcesByETLD, linkedSource.id),
    });
  }
}

function classify(itemETLD, lookup, currentSourceId) {
  // Find candidate sources that match the item's eTLD+1.
  const candidates = (lookup.get(itemETLD) || []).filter(
    (s) => s.id !== currentSourceId,
  );

  if (candidates.length === 1) {
    const c = candidates[0];
    return {
      suggested_action: "link_to_existing",
      candidate_correct_source_id: c.id,
      candidate_correct_source_name: c.name,
      candidate_correct_source_url: c.url,
    };
  }
  if (candidates.length > 1) {
    return {
      suggested_action: "manual_review",
      manual_review_reason: "multiple_candidate_sources",
      candidate_source_ids: candidates.map((c) => c.id),
      candidate_source_names: candidates.map((c) => c.name),
    };
  }
  return {
    suggested_action: "create_new_source",
    proposed_source: {
      name: deriveProposedName(itemETLD),
      url: "https://" + itemETLD,
      type: "regulator",
      tier: "T2",
    },
  };
}

function deriveProposedName(etld) {
  // Best-effort human label from eTLD+1; W4 will refine.
  const known = {
    "arb.ca.gov": "California Air Resources Board (CARB)",
    "cdpr.ca.gov": "California Dept. of Pesticide Regulation",
    "energy.ca.gov": "California Energy Commission",
    "cpuc.ca.gov": "California Public Utilities Commission",
    "epa.gov": "U.S. Environmental Protection Agency",
    "ferc.gov": "Federal Energy Regulatory Commission",
    "doe.gov": "U.S. Department of Energy",
    "energy.gov": "U.S. Department of Energy",
    "nrel.gov": "National Renewable Energy Laboratory",
    "europa.eu": "European Union (europa.eu portal)",
    "legislation.gov.uk": "UK Legislation",
    "gov.uk": "UK Government",
    "imo.org": "International Maritime Organization",
    "icao.int": "International Civil Aviation Organization",
    "iea.org": "International Energy Agency",
    "iso.org": "ISO",
    "unfccc.int": "UNFCCC",
    "worldbank.org": "World Bank",
  };
  if (known[etld]) return known[etld];
  return etld; // raw eTLD+1 — W4 reviewer can rename
}

// ─── Report ─────────────────────────────────────────────────────────
const report = {
  generated_at: new Date().toISOString(),
  totals: {
    intelligence_items_total: items.length,
    items_with_source_id: withSourceId,
    items_with_null_source_id: nullSourceIdCount,
    items_with_null_source_id_but_have_source_url: nullSourceIdWithUrl,
    total_mismatches: mismatches.length,
  },
  // Pivot: for each linked source, list the distinct mismatched item eTLD+1s
  pivot_by_linked_source: pivotByLinkedSource(mismatches),
  // Action plan summary for W4
  suggested_action_counts: countBy(mismatches, "suggested_action"),
  mismatches,
};

function pivotByLinkedSource(rows) {
  const byName = new Map();
  for (const m of rows) {
    const key = m.linked_source_name || m.linked_source_id;
    if (!byName.has(key)) byName.set(key, { linked_source_name: key, linked_source_id: m.linked_source_id, linked_source_etld: m.linked_source_etld, mismatched_etlds: new Map() });
    const entry = byName.get(key);
    const cur = entry.mismatched_etlds.get(m.item_source_etld) || 0;
    entry.mismatched_etlds.set(m.item_source_etld, cur + 1);
  }
  return [...byName.values()]
    .map((e) => ({
      linked_source_name: e.linked_source_name,
      linked_source_id: e.linked_source_id,
      linked_source_etld: e.linked_source_etld,
      total_mismatched_items: [...e.mismatched_etlds.values()].reduce((a, b) => a + b, 0),
      mismatched_etld_breakdown: [...e.mismatched_etlds.entries()]
        .map(([etld, count]) => ({ etld, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.total_mismatched_items - a.total_mismatched_items);
}

function countBy(rows, key) {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) || 0) + 1);
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
}

const reportPath = resolve(__dirname, "..", "..", "..", "docs", "W1C-source-attribution-audit.json");
const mdPath = resolve(__dirname, "..", "..", "..", "docs", "W1C-source-attribution-summary.md");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
writeFileSync(mdPath, renderMarkdown(report), "utf8");

function renderMarkdown(r) {
  const lines = [];
  lines.push("# W1.C — Source attribution audit summary");
  lines.push("");
  lines.push(`Generated: ${r.generated_at}`);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- intelligence_items rows: **${r.totals.intelligence_items_total}**`);
  lines.push(`- with source_id set: **${r.totals.items_with_source_id}**`);
  lines.push(`- with NULL source_id: **${r.totals.items_with_null_source_id}**`);
  lines.push(`  - …of which have a non-empty source_url (recoverable): **${r.totals.items_with_null_source_id_but_have_source_url}**`);
  lines.push(`- **total mismatches: ${r.totals.total_mismatches}**`);
  lines.push("");
  lines.push("## Top 10 mismatched source mappings");
  lines.push("");
  lines.push("Pivoted by the source that the items are *currently* linked to. The breakdown shows the eTLD+1 the item URLs *actually* belong to.");
  lines.push("");
  lines.push("| # | Linked source (current) | Linked eTLD+1 | Mismatched items | Actual host breakdown |");
  lines.push("|---|---|---|---|---|");
  r.pivot_by_linked_source.slice(0, 10).forEach((row, i) => {
    const breakdown = row.mismatched_etld_breakdown
      .slice(0, 5)
      .map((b) => `${b.etld} (${b.count})`)
      .join(", ");
    lines.push(`| ${i + 1} | ${row.linked_source_name} | \`${row.linked_source_etld}\` | ${row.total_mismatched_items} | ${breakdown} |`);
  });
  lines.push("");

  // CARB → EPA call-out
  const carbRows = r.mismatches.filter(
    (m) => m.item_source_etld === "arb.ca.gov" && (m.linked_source_etld === "epa.gov" || /epa/i.test(m.linked_source_name || "")),
  );
  lines.push("## CARB → EPA mis-attribution (confirmed bug)");
  lines.push("");
  if (carbRows.length === 0) {
    lines.push("No CARB items currently linked to EPA were found in this run. (Either already fixed, or the CARB items have a different linked source — see the pivot table above.)");
  } else {
    lines.push(`**${carbRows.length}** intelligence_items rows with \`source_url\` host \`arb.ca.gov\` are linked to an EPA source row.`);
    lines.push("");
    lines.push("Sample (first 5):");
    lines.push("");
    carbRows.slice(0, 5).forEach((m) => {
      lines.push(`- \`${m.legacy_id || m.item_id.slice(0, 8)}\` — ${m.item_title}`);
      lines.push(`  - linked to: \`${m.linked_source_name}\``);
      lines.push(`  - actual url: ${m.item_source_url}`);
      lines.push(`  - suggested action: \`${m.suggested_action}\``);
    });
  }
  lines.push("");

  lines.push("## Suggested action breakdown for W4");
  lines.push("");
  lines.push("| Action | Count | Meaning |");
  lines.push("|---|---|---|");
  const meanings = {
    link_to_existing: "A source row whose URL matches the item's host already exists; W4 just rewires `source_id`.",
    create_new_source: "No source matches this host; W4 must create a stub source row first, then rewire.",
    manual_review: "Multiple candidate sources match the host, OR the linked source has an unparseable URL — needs human eyes.",
  };
  for (const [k, v] of Object.entries(r.suggested_action_counts)) {
    lines.push(`| \`${k}\` | ${v} | ${meanings[k] || ""} |`);
  }
  lines.push("");

  lines.push("## Estimated W4 effort");
  lines.push("");
  const linkOnly = r.suggested_action_counts.link_to_existing || 0;
  const createNew = r.suggested_action_counts.create_new_source || 0;
  const manual = r.suggested_action_counts.manual_review || 0;
  // Rough effort heuristic, documented for caller transparency:
  //  - link_to_existing rows are a single UPDATE per row, batchable → ~1 min per 50 rows
  //  - create_new_source rows need 1 INSERT + ~N UPDATEs per distinct new source → ~5 min per distinct host
  //  - manual_review rows take a human ~3 min each on average
  const distinctNewHosts = new Set(
    r.mismatches.filter((m) => m.suggested_action === "create_new_source").map((m) => m.item_source_etld),
  ).size;
  const linkMin = Math.ceil(linkOnly / 50);
  const createMin = distinctNewHosts * 5;
  const manualMin = manual * 3;
  const totalMin = linkMin + createMin + manualMin;
  lines.push(`- \`link_to_existing\`: ${linkOnly} rows → batched UPDATE, ~${linkMin} minute(s)`);
  lines.push(`- \`create_new_source\`: ${createNew} rows across ${distinctNewHosts} distinct new host(s) → ~${createMin} minute(s) (mostly the new-source review)`);
  lines.push(`- \`manual_review\`: ${manual} rows → ~${manualMin} minute(s) of human triage`);
  lines.push(`- **estimated total: ~${totalMin} minute(s) (${(totalMin / 60).toFixed(1)} hour(s))** plus QA pass`);
  lines.push("");

  lines.push("## Heuristic notes");
  lines.push("");
  lines.push("- Host comparison uses **eTLD+1** matching, not exact host equality. `www.epa.gov` and `epa.gov` are the same; `arb.ca.gov` and `epa.gov` are not.");
  lines.push("- US sub-state agencies (`arb.ca.gov`, `energy.ca.gov`, etc.) are deliberately treated as DISTINCT eTLD+1s — see the multi-part suffix list in `audit-source-attribution.mjs`. CARB and CDPR are not the same publisher just because both end in `.ca.gov`.");
  lines.push("- Items with NULL `source_id` are tracked separately; they cannot mismatch by definition, but they're an attribution gap W4 should also address.");
  lines.push("");
  lines.push(`Full machine-readable mismatch list: \`docs/W1C-source-attribution-audit.json\``);
  return lines.join("\n") + "\n";
}

// ─── Console summary ────────────────────────────────────────────────
console.log("\n=== Source attribution audit ===");
console.log(`Total intelligence_items:            ${report.totals.intelligence_items_total}`);
console.log(`  with source_id:                     ${report.totals.items_with_source_id}`);
console.log(`  with NULL source_id:                ${report.totals.items_with_null_source_id}`);
console.log(`    (and a non-empty source_url):     ${report.totals.items_with_null_source_id_but_have_source_url}`);
console.log(`Total mismatches:                     ${report.totals.total_mismatches}`);
console.log("\nSuggested action breakdown:");
for (const [k, v] of Object.entries(report.suggested_action_counts)) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}
console.log("\nTop 10 mismatched source mappings:");
for (const row of report.pivot_by_linked_source.slice(0, 10)) {
  console.log(`  ${String(row.total_mismatched_items).padStart(4)}  linked="${row.linked_source_name}" (${row.linked_source_etld})`);
  for (const b of row.mismatched_etld_breakdown.slice(0, 5)) {
    console.log(`         ${String(b.count).padStart(4)}  actually from: ${b.etld}`);
  }
}
console.log(`\nReport written: ${reportPath}`);
