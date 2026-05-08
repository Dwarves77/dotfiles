/**
 * topic-backfill-investigate.mjs — read-only audit of intelligence_items.category
 * (the column that surfaces as Resource.topic in the UI).
 *
 * Wave 5 data-track investigation. Per Wave 2 PR-G's surfaced "Uncategorized"
 * pattern: MarketPage.tsx's groupByCategory() falls back to "Technology"/
 * "Market signal"/"Other" when an item's topic (Resource.topic) is empty.
 * The Resource.topic value is mapped from intelligence_items.category in
 * src/lib/supabase-server.ts (`topic: row.category || undefined`).
 *
 * The dispatch references `intelligence_items.topic` but the actual storage
 * column is `category`. This script audits `category` since that is what
 * the UI reads via the Resource mapper.
 *
 * Output: docs/topic-backfill-investigation-2026-05-07.json
 *   - pre_state.total_rows
 *   - pre_state.null_or_empty_count
 *   - pre_state.non_canonical_count (category set but not in TOPICS list)
 *   - pre_state.canonical_distribution (count per canonical topic id)
 *   - candidates: per-row {legacy_id, title, summary excerpt, item_type,
 *     current category, tags, derived_topic, derivation_reason,
 *     ambiguous: bool}
 *
 * No writes.
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

// Canonical TOPICS — mirrors fsi-app/src/lib/constants.ts
const TOPICS = [
  "emissions", "fuels", "transport", "reporting", "packaging", "corridors",
  "customs", "trade", "sanctions", "origin",
  "dangerous-goods", "food-safety", "pharma", "security",
  "cabotage", "labor", "infrastructure", "digital", "insurance",
  "standards", "research",
];
const TOPIC_SET = new Set(TOPICS);

// Topic-keyword overlap rules. Each keyword is matched as a *whole-word*
// regex (\b boundaries) against the lowercased title+summary+what_is_it+
// why_matters haystack. Multi-word phrases are matched as a phrase. Use
// only high-precision keywords — a single hit assigns a topic, so any
// false-positive risk pushes the row to ambiguous.
const TOPIC_KEYWORDS = {
  emissions: [
    "carbon pricing", "carbon price", "emissions trading", "ghg emissions",
    "greenhouse gas emissions", "endangerment finding",
    "carb", "advanced clean fleet", "advanced clean truck",
    "cbam", "carbon border adjustment", "low carbon fuel standard", "lcfs",
    "emission standard", "co2 emission", "carbon intensity standard",
    "eu ets", "ets directive", "maritime ets", "carbon market",
  ],
  fuels: [
    "saf", "sustainable aviation fuel", "biofuel", "renewable fuel",
    "refueleu", "fueleu", "hydrogen strategy", "hydrogen fuel", "lng bunker",
    "ammonia fuel", "alternative fuel", "afir", "clean fuel regulation",
    "bunker fuel",
  ],
  transport: [
    "vehicle ghg", "vehicle emission", "fuel economy", "cafe standard",
    "truck efficiency", "freight emission", "transport emission",
    "iso 14083", "glec",
  ],
  reporting: [
    "csrd", "esrs", "issb", "ifrs s1", "ifrs s2",
    "climate disclosure", "tcfd", "scope 3", "scope 3 reporting", "sb 253", "sb253",
    "sb 261", "sb261", "ab 1305", "ab1305", "climate-related financial",
    "corporate sustainability reporting directive", "secr",
    "streamlined energy and carbon reporting",
  ],
  packaging: [
    "packaging waste", "ppwr", "extended producer responsibility",
    "circular economy", "single-use plastic", "recyclable",
  ],
  corridors: [
    "green corridor", "green shipping corridor", "trans-european network",
    "ten-t", "shore power", "cold ironing",
  ],
  customs: [
    "customs declaration", "border control", "import declaration",
    "union customs code", "automated manifest system", "advance commercial",
    "entry summary",
  ],
  trade: [
    "tariff", "trade policy", "free trade agreement", "section 301",
    "section 232", "antidumping", "countervailing",
  ],
  sanctions: [
    "sanction", "export control", "ofac", "entity list", "denied party",
    "embargo", "dual-use",
  ],
  origin: [
    "rules of origin", "rule of origin", "preferential origin",
    "non-preferential origin", "certificate of origin",
  ],
  "dangerous-goods": [
    "dangerous goods", "hazmat", "imdg", "iata dgr", "icao ti",
    "un number",
  ],
  "food-safety": [
    "food safety", "fsma", "haccp", "cold chain food", "food import",
    "food contact",
  ],
  pharma: [
    "pharmaceutical", "good distribution practice", "vaccine logistics",
    "clinical trial",
  ],
  security: [
    "cargo security", "cargo screening", "ctpat", "known shipper",
    "tsa air cargo", "isps code",
  ],
  cabotage: [
    "cabotage", "market access", "operating authority", "domestic point",
  ],
  labor: [
    "driver hours", "hours of service", "electronic logging device",
    "driver shortage",
  ],
  infrastructure: [
    "port authority", "airport authority", "port congestion",
    "slot allocation", "airspace",
  ],
  digital: [
    "single window", "electronic bill of lading", "e-bol",
    "data privacy", "gdpr",
  ],
  insurance: [
    "marine insurance", "cargo insurance", "freight liability",
    "carmack",
  ],
  standards: [
    "smartway",
  ],
  research: [
    "research finding", "white paper", "study finds", "academic study",
    "icct study", "international transport forum",
  ],
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Cache compiled regexes per phrase, with word boundaries.
const KW_REGEX_CACHE = new Map();
function kwRegex(phrase) {
  if (!KW_REGEX_CACHE.has(phrase)) {
    // \b only works for word chars; for phrases ending in non-word chars or
    // for hyphenated tokens, we use a more permissive boundary: start/end
    // of string OR adjacent to non-letter/non-digit char. Standard \b works
    // for all current keyword phrases since they all start and end with a
    // word character.
    KW_REGEX_CACHE.set(phrase, new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i"));
  }
  return KW_REGEX_CACHE.get(phrase);
}

function lower(s) {
  return (s || "").toString().toLowerCase();
}

/**
 * Derive a canonical TOPICS id for a row. Returns:
 *   { topic: string|null, reason: string, ambiguous: boolean, candidates: string[] }
 *
 * Rules (in order):
 *   1. tags array — exact match against a TOPICS id
 *   2. title+summary keyword scan — single best match
 *   3. item_type fallback (technology→"transport"-ish? — see below)
 *
 * For item_type fallback we map by the dispatch's hinted mapping but prefer
 * canonical TOPICS values:
 *   technology / innovation / tool  → "transport" (closest canonical for
 *     "Green Transport Standards" — covers green-tech freight innovations)
 *   market_signal                   → null  (no canonical "market" topic;
 *     skip as ambiguous)
 *   regional_data                   → null  (no canonical "operations" topic
 *     either; the closest is "infrastructure" but that's port/airport-
 *     specific, so skip rather than wrong-tag)
 *   research_finding                → "research"
 *   regulation/directive/standard/guidance/framework/initiative → null
 *     (these should already have a topic; if missing, skip)
 */
function deriveTopic(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const tagMatches = tags.filter((t) => TOPIC_SET.has(t));
  if (tagMatches.length === 1) {
    return {
      topic: tagMatches[0],
      reason: `tag-exact:${tagMatches[0]}`,
      ambiguous: false,
      candidates: tagMatches,
    };
  }
  if (tagMatches.length > 1) {
    // Multiple canonical tags — ambiguous unless we can break the tie
    // via title/summary. Drop into keyword check and require it to
    // disambiguate.
    const haystack = `${lower(row.title)} ${lower(row.summary)} ${lower(row.what_is_it)} ${lower(row.why_matters)}`;
    const tieBreaker = tagMatches.find((t) =>
      (TOPIC_KEYWORDS[t] || []).some((kw) => kwRegex(kw).test(haystack))
    );
    if (tieBreaker) {
      return {
        topic: tieBreaker,
        reason: `tag-multi+keyword-tiebreak:${tieBreaker}`,
        ambiguous: false,
        candidates: tagMatches,
      };
    }
    return {
      topic: null,
      reason: `tag-multi-ambiguous:${tagMatches.join(",")}`,
      ambiguous: true,
      candidates: tagMatches,
    };
  }

  // No canonical-tag match. Run title+summary keyword scan.
  const haystack = `${lower(row.title)} ${lower(row.summary)} ${lower(row.what_is_it)} ${lower(row.why_matters)}`;
  const matches = [];
  for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of kws) {
      if (kwRegex(kw).test(haystack)) {
        matches.push({ topic, kw });
        break;
      }
    }
  }
  if (matches.length === 1) {
    return {
      topic: matches[0].topic,
      reason: `keyword:${matches[0].kw} -> ${matches[0].topic}`,
      ambiguous: false,
      candidates: [matches[0].topic],
    };
  }
  if (matches.length > 2) {
    return {
      topic: null,
      reason: `keyword-multi-ambiguous:${matches.map((m) => m.topic).join(",")}`,
      ambiguous: true,
      candidates: matches.map((m) => m.topic),
    };
  }
  if (matches.length === 2) {
    // Two-way tie — skip as ambiguous per dispatch (>2 plausible halts; ==2
    // is borderline. Per "skip rather than wrong-tag", skip).
    return {
      topic: null,
      reason: `keyword-tie-ambiguous:${matches.map((m) => m.topic).join(",")}`,
      ambiguous: true,
      candidates: matches.map((m) => m.topic),
    };
  }

  // No keyword hit. item_type fallback.
  const it = row.item_type || "regulation";
  if (it === "research_finding") {
    return {
      topic: "research",
      reason: "item_type-fallback:research_finding -> research",
      ambiguous: false,
      candidates: ["research"],
    };
  }
  // technology / innovation / tool / market_signal / regional_data and the
  // regulation-class types do not have a clean canonical fallback. Skip.
  return {
    topic: null,
    reason: `no-derivation:item_type=${it}`,
    ambiguous: true,
    candidates: [],
  };
}

function isEmpty(v) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

const out = {
  generated_at: new Date().toISOString(),
  schema_note:
    "intelligence_items.category is the storage column for Resource.topic " +
    "(see src/lib/supabase-server.ts: `topic: row.category || undefined`). " +
    "The dispatch references `topic` but the column is `category`.",
  topics_canonical: TOPICS,
  pre_state: {},
  candidates: [],
  ambiguous_skipped: [],
  non_canonical_existing: [],
  derivation_summary: {},
};

// 1. Total rows
const { count: total } = await supabase
  .from("intelligence_items")
  .select("id", { count: "exact", head: true });
out.pre_state.total_rows = total;

// 2. NULL/empty category
const { count: nullCount } = await supabase
  .from("intelligence_items")
  .select("id", { count: "exact", head: true })
  .or("category.is.null,category.eq.");
out.pre_state.null_or_empty_count = nullCount;

// 3. Pull all rows (we need to inspect category vs TOPICS)
const { data: rows, error } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, summary, what_is_it, why_matters, item_type, category, tags");
if (error) {
  console.error("query error:", error);
  process.exit(1);
}

let nonCanonical = 0;
const distribution = {};
for (const r of rows || []) {
  if (isEmpty(r.category)) continue;
  if (TOPIC_SET.has(r.category)) {
    distribution[r.category] = (distribution[r.category] || 0) + 1;
  } else {
    nonCanonical++;
    out.non_canonical_existing.push({
      legacy_id: r.legacy_id,
      title: (r.title || "").slice(0, 80),
      current_category: r.category,
      item_type: r.item_type,
    });
  }
}
out.pre_state.non_canonical_count = nonCanonical;
out.pre_state.canonical_distribution = distribution;

// 4. Per-row derivation for NULL/empty rows
const targets = (rows || []).filter((r) => isEmpty(r.category));
const reasonCounts = {};
for (const r of targets) {
  const d = deriveTopic(r);
  reasonCounts[d.reason] = (reasonCounts[d.reason] || 0) + 1;
  const entry = {
    id: r.id,
    legacy_id: r.legacy_id,
    title: (r.title || "").slice(0, 100),
    summary_excerpt: (r.summary || "").slice(0, 140),
    item_type: r.item_type,
    current_category: r.category,
    tags: r.tags,
    derived_topic: d.topic,
    derivation_reason: d.reason,
    candidates: d.candidates,
    ambiguous: d.ambiguous,
  };
  if (d.ambiguous || d.topic === null) {
    out.ambiguous_skipped.push(entry);
  } else {
    out.candidates.push(entry);
  }
}
out.derivation_summary = {
  null_or_empty_targets: targets.length,
  derivable: out.candidates.length,
  skipped_ambiguous: out.ambiguous_skipped.length,
  reason_counts: reasonCounts,
};

writeFileSync(
  resolve("..", "docs", "topic-backfill-investigation-2026-05-07.json"),
  JSON.stringify(out, null, 2),
  "utf8"
);

console.log("\n── topic-backfill investigation ──");
console.log(`Total rows: ${out.pre_state.total_rows}`);
console.log(`NULL/empty category: ${out.pre_state.null_or_empty_count}`);
console.log(`Non-canonical category (not in TOPICS): ${out.pre_state.non_canonical_count}`);
console.log(`Derivable backfills: ${out.candidates.length}`);
console.log(`Ambiguous (will skip): ${out.ambiguous_skipped.length}`);
console.log(`\nWrote docs/topic-backfill-investigation-2026-05-07.json`);
if (out.candidates.length > 50) {
  console.log(
    `\n[HALT] >50 derivable candidates (${out.candidates.length}). ` +
    `Per dispatch: surface and propose per-batch approach before executing.`
  );
}
