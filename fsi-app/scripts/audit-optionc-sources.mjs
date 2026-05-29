// Read-only audit of the 80 Option C URL-anchor outputs.
//
// For each item:
//   - Pull source_url + section_count from <os.tmpdir>/optionc-items.json (DB query result)
//   - Pull S15 content from <os.tmpdir>/optionc-s15.json
//   - Extract all URLs from S15
//   - Cross-check each S15 URL against the item's source_url (hostname-level match)
//   - Pull per-item web_search count from scripts/.a5-sonnet-backfill.log
//
// Output:
//   <os.tmpdir>/optionc-audit.tsv — per-item table for operator inspection
//   stdout — summary stats

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");

const ITEMS_PATH = join(tmpdir(), "optionc-items.json");
const S15_PATH = join(tmpdir(), "optionc-s15.json");
const LOG_PATH = resolve(APP_ROOT, "scripts/.a5-sonnet-backfill.log");
const OUT_PATH = join(tmpdir(), "optionc-audit.tsv");

// Load DB rows. Supabase CLI emits a JSON envelope with a boundary marker and rows array.
function loadSupabaseRows(path) {
  const raw = readFileSync(path, "utf8");
  // The CLI sometimes prepends "npm warn" lines or appends a "warning:" block.
  // Locate the JSON object boundaries.
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error(`Cannot find JSON envelope in ${path}`);
  }
  const obj = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  return obj.rows || [];
}

const items = loadSupabaseRows(ITEMS_PATH);
const s15Rows = loadSupabaseRows(S15_PATH);
console.log(`[audit] items rows: ${items.length}, S15 rows: ${s15Rows.length}`);

// Build S15 content map: uuid -> content_md
const s15Map = new Map();
for (const r of s15Rows) s15Map.set(r.uuid, r.content_md || "");

// Build per-item search-count map from the backfill log.
// Log lines look like:
//   2026-05-29T03:50:49.625Z [<id-or-legacyid>] OK sections=7 [...] cost=$0.356 ms=145664 searches=4
//   2026-05-29T03:21:17.848Z [<id-or-legacyid>] ZERO_SECTIONS cost=$0.105 ms=11415 searches=2
// We index by the bracket value (id OR legacy_id) -> last-seen searches count.
const searchByKey = new Map();
const logText = readFileSync(LOG_PATH, "utf8");
const logRe = /\[([0-9a-f-]+|[a-z0-9-]+)\]\s+(OK|ZERO_SECTIONS)\s+.*?searches=(\d+)/g;
let m;
while ((m = logRe.exec(logText)) !== null) {
  const key = m[1];
  const searches = parseInt(m[3], 10);
  searchByKey.set(key, searches);
}

// URL extraction regex - matches http(s) URLs ending before whitespace, pipe, paren, or backtick.
const URL_RE = /https?:\/\/[^\s|)`<>"\]]+/g;

function hostOf(u) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Primary-instrument host whitelist.
const PRIMARY_HOSTS = new Set([
  "eur-lex.europa.eu",
  "legislation.gov.uk",
  "imo.org",
  "wwwcdn.imo.org",
  "federalregister.gov",
  "ec.europa.eu",
  "regulations.gov",
  "epa.gov",
  "carb.ca.gov",
  "leginfo.legislature.ca.gov",
  "icao.int",
  "unfccc.int",
]);

let totalS15Urls = 0;
let totalSourceMatchAtHost = 0;
let totalSourceMatchExact = 0;
let totalUrls = 0;
let itemsWithSourceInS15 = 0;
let itemsWithoutSourceInS15 = [];
const perItem = [];

for (const item of items) {
  const uuid = item.uuid;
  const sourceUrl = item.source_url === "(none)" ? null : item.source_url;
  const sourceHost = sourceUrl ? hostOf(sourceUrl) : null;
  const s15 = s15Map.get(uuid) || "";
  const urls = [...s15.matchAll(URL_RE)].map((x) => x[0]);
  const uniqueUrls = [...new Set(urls)];

  let sourceMatchExact = false;
  let sourceMatchAtHost = false;
  let urlsAtSourceHost = 0;

  for (const u of uniqueUrls) {
    const h = hostOf(u);
    if (!h) continue;
    if (sourceUrl && u === sourceUrl) {
      sourceMatchExact = true;
      sourceMatchAtHost = true;
    } else if (sourceHost && h === sourceHost) {
      sourceMatchAtHost = true;
      urlsAtSourceHost++;
    }
  }

  if (sourceMatchAtHost) {
    itemsWithSourceInS15++;
  } else {
    itemsWithoutSourceInS15.push({
      uuid,
      legacy_id: item.legacy_id,
      pri: item.pri,
      source_url: sourceUrl,
      s15_url_count: uniqueUrls.length,
    });
  }

  totalS15Urls += uniqueUrls.length;
  totalUrls += urls.length;
  if (sourceMatchAtHost) totalSourceMatchAtHost++;
  if (sourceMatchExact) totalSourceMatchExact++;

  const searchCount =
    searchByKey.get(uuid) ?? searchByKey.get(item.legacy_id) ?? null;

  // Heuristic: is the source a primary instrument?
  const isPrimary = sourceHost && PRIMARY_HOSTS.has(sourceHost);

  perItem.push({
    uuid,
    legacy_id: item.legacy_id,
    pri: item.pri,
    section_count: item.sec_count,
    source_host: sourceHost || "(none)",
    is_primary: isPrimary ? "PRIMARY" : "SECONDARY",
    source_url: sourceUrl || "(none)",
    search_count: searchCount === null ? "?" : searchCount,
    s15_url_count: uniqueUrls.length,
    s15_has_source_exact: sourceMatchExact ? "Y" : "N",
    s15_has_source_at_host: sourceMatchAtHost ? "Y" : "N",
  });
}

// Sort: CRITICAL first, then HIGH, then by source_host
const PRI_ORDER = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
perItem.sort(
  (a, b) =>
    (PRI_ORDER[a.pri] ?? 9) - (PRI_ORDER[b.pri] ?? 9) ||
    a.source_host.localeCompare(b.source_host)
);

// Write TSV.
const header = [
  "uuid",
  "legacy_id",
  "pri",
  "section_count",
  "source_host",
  "is_primary",
  "search_count",
  "s15_url_count",
  "s15_has_source_exact",
  "s15_has_source_at_host",
  "source_url",
];
const lines = [header.join("\t")];
for (const r of perItem) {
  lines.push(header.map((h) => String(r[h])).join("\t"));
}
writeFileSync(OUT_PATH, lines.join("\n"), "utf8");

// Summary stats.
console.log("");
console.log("=== Option C audit summary ===");
console.log(`Items audited: ${items.length}`);
console.log(`Total URLs in all S15 sections (incl duplicates): ${totalUrls}`);
console.log(`Avg unique URLs per S15: ${(totalS15Urls / items.length).toFixed(1)}`);
console.log("");
console.log(`Items whose source_url appears in S15 exactly: ${totalSourceMatchExact}`);
console.log(`Items whose source_url HOST appears in S15:   ${totalSourceMatchAtHost}`);
console.log(`Items where source_url is NOT cited in S15:   ${itemsWithoutSourceInS15.length}`);
console.log("");

// Distribution by priority + is_primary
const dist = { CRITICAL: { PRIMARY: 0, SECONDARY: 0 }, HIGH: { PRIMARY: 0, SECONDARY: 0 } };
for (const r of perItem) {
  if (dist[r.pri]) dist[r.pri][r.is_primary]++;
}
console.log("Priority x source type breakdown:");
console.log(`  CRITICAL PRIMARY:   ${dist.CRITICAL.PRIMARY}`);
console.log(`  CRITICAL SECONDARY: ${dist.CRITICAL.SECONDARY}`);
console.log(`  HIGH PRIMARY:       ${dist.HIGH.PRIMARY}`);
console.log(`  HIGH SECONDARY:     ${dist.HIGH.SECONDARY}`);
console.log("");

// Search count distribution
const searchCounts = perItem
  .map((r) => r.search_count)
  .filter((x) => x !== "?");
const searchHist = {};
for (const s of searchCounts) {
  searchHist[s] = (searchHist[s] || 0) + 1;
}
console.log("Web search count distribution:");
for (const k of Object.keys(searchHist).sort()) {
  console.log(`  ${k} searches: ${searchHist[k]} items`);
}
console.log(`  ? unknown (log scrape miss): ${perItem.length - searchCounts.length}`);
console.log("");

// Items with source_url NOT in S15 — these are the highest-attention candidates.
if (itemsWithoutSourceInS15.length > 0) {
  console.log("Items whose source_url is NOT cited anywhere in S15:");
  for (const r of itemsWithoutSourceInS15.slice(0, 20)) {
    console.log(
      `  [${r.pri}] ${r.legacy_id !== "-" ? r.legacy_id : r.uuid.slice(0, 8)} source=${r.source_url} S15_urls=${r.s15_url_count}`
    );
  }
  if (itemsWithoutSourceInS15.length > 20) {
    console.log(`  ... + ${itemsWithoutSourceInS15.length - 20} more`);
  }
}

console.log("");
console.log(`Per-item TSV written: ${OUT_PATH}`);
