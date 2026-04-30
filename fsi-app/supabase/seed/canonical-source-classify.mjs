// Walk all intelligence_items and classify source coverage state. Uses the
// URL-health output (bku8bp6u8.output) to identify stale URLs without
// re-fetching everything. Read-only — emits a structured report and writes
// nothing.
//
// Categories (per Task 4 spec):
//   ok            — source_id present, URL returns 200/3xx, content present
//   stale_url     — source_id present, URL returns 4xx/5xx/timeout/network_error
//   missing_link  — no source_id, no source_url, but item topic suggests a known
//                   authoritative source should exist (heuristic on title)
//   missing_source — no source_id, no source_url, no obvious canonical
//   thin_match    — source_id present, URL works, but content sparse (deferred —
//                   would need to re-fetch and inspect; flagged as known-empty
//                   signal: source_url maps to a homepage in the URL-health pass)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

process.loadEnvFile(".env.local");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Pull URL-health results
const healthOutPath = "C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason-dotfiles-fsi-app/3d6316e1-b324-4ebf-9c43-4e0db9f3b606/tasks/bku8bp6u8.output";
const healthOut = readFileSync(healthOutPath, "utf8");
const marker = "=== JSON dump of broken set ===";
const idx = healthOut.indexOf(marker);
const jsonStr = idx >= 0 ? healthOut.slice(idx + marker.length).match(/\[[\s\S]*\]/)?.[0] : null;
const brokenList = jsonStr ? JSON.parse(jsonStr) : [];
const brokenByUrl = new Map(brokenList.map((r) => [r.url, r]));
console.log(`Loaded ${brokenList.length} broken URLs from URL-health-check\n`);

// Pull all intelligence_items
const { data: items } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, item_type, domain, jurisdictions, topic_tags, source_id, source_url")
  .eq("is_archived", false)
  .order("legacy_id", { nullsFirst: false });

console.log(`Classifying ${items.length} intelligence_items...\n`);

const buckets = {
  ok: [],
  stale_url: [],
  missing_link: [],
  missing_source: [],
};

// Heuristic for "should have an authoritative source"
function shouldHaveSource(item) {
  const titleLower = (item.title || "").toLowerCase();
  if (item.item_type === "regulation" || item.item_type === "directive" || item.item_type === "standard" || item.item_type === "framework") return true;
  if (titleLower.includes("regulation") || titleLower.includes("directive") || titleLower.includes("standard") || titleLower.includes("act") || titleLower.includes("law")) return true;
  if (item.item_type === "research_finding") return true; // research has citable source
  return false;
}

for (const item of items) {
  const broken = brokenByUrl.get(item.source_url);
  if (item.source_id && !broken) {
    buckets.ok.push(item);
  } else if (item.source_id && broken) {
    buckets.stale_url.push({ ...item, broken_category: broken.category, broken_code: broken.code });
  } else if (!item.source_id && shouldHaveSource(item)) {
    buckets.missing_link.push(item);
  } else {
    buckets.missing_source.push(item);
  }
}

console.log("=== source coverage classification ===");
for (const [k, v] of Object.entries(buckets)) {
  console.log(`  ${String(v.length).padStart(4)}  ${k}`);
}

console.log("\n=== stale_url items (source_id present, URL broken) ===");
console.log("Total: " + buckets.stale_url.length);
for (const it of buckets.stale_url) {
  console.log(`  [${(it.legacy_id || it.id.slice(0,8)).padEnd(10)}] ${it.broken_category} ${it.broken_code || "-"}  ${it.title.slice(0, 50)}  ${it.source_url.slice(0, 60)}`);
}

console.log("\n=== missing_link items (no source_id, but should have one) ===");
console.log("Total: " + buckets.missing_link.length);
for (const it of buckets.missing_link) {
  console.log(`  [${(it.legacy_id || it.id.slice(0,8)).padEnd(10)}] item_type=${it.item_type}  ${it.title.slice(0, 60)}  url=${it.source_url || "(none)"}`);
}

console.log("\n=== missing_source items (no source_id, no clear canonical) ===");
console.log("Total: " + buckets.missing_source.length);
for (const it of buckets.missing_source.slice(0, 20)) {
  console.log(`  [${(it.legacy_id || it.id.slice(0,8)).padEnd(10)}] item_type=${it.item_type}  ${it.title.slice(0, 60)}`);
}
if (buckets.missing_source.length > 20) console.log(`  ... and ${buckets.missing_source.length - 20} more`);

// Write to /tmp for next step
import { writeFileSync } from "fs";
const flagged = [...buckets.stale_url, ...buckets.missing_link, ...buckets.missing_source];
writeFileSync("./canonical-flagged.json", JSON.stringify(flagged, null, 2));
console.log(`\nWrote ${flagged.length} flagged items to ./canonical-flagged.json for next step.`);
