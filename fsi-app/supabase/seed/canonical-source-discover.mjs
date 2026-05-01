// Canonical-source discovery agent. For each flagged item, call Claude with
// the web_search tool to propose 1-3 canonical-source candidate URLs. Verify
// each candidate by fetching it and confirming title/topic match. Store
// results in canonical_source_candidates.
//
// Usage:
//   node canonical-source-discover.mjs            # run on first 3 items (validation)
//   node canonical-source-discover.mjs --limit=N  # run on first N flagged items
//   node canonical-source-discover.mjs --all      # run on all 128 flagged items
//
// Cost: ~$0.05-0.10 per item (Claude Sonnet 4.6 with web_search tool, ~3-5
// search calls per discovery, ~3000 input + 1500 output tokens average).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

process.loadEnvFile(".env.local");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const args = process.argv.slice(2);
const allMode = args.includes("--all");
const limitMatch = args.find((a) => a.startsWith("--limit="));
const limit = allMode ? Infinity : limitMatch ? parseInt(limitMatch.split("=")[1], 10) : 3;
const SPEND_CEILING = 15.00;

const flagged = JSON.parse(readFileSync("./canonical-flagged.json", "utf8"));
const targets = flagged.slice(0, limit);
console.log(`Processing ${targets.length} of ${flagged.length} flagged items.`);
console.log(`Spend ceiling: $${SPEND_CEILING}\n`);

const DISCOVERY_SYSTEM = `You are a canonical-source-discovery agent for a freight sustainability intelligence platform. Your job: given an intelligence item (regulation, framework, research finding, etc.), find the authoritative canonical source URL.

Use the web_search tool to locate the canonical source. Prioritize, in order:
1. Primary legal/regulatory text on the issuing body's own site (Official Journal, Federal Register, regulator's portal)
2. Regulator guidance document
3. Intergovernmental body publication (IMO, ICAO, UNFCCC, World Bank)
4. Issuing institution's own site (university research center, NGO, industry body)
5. Reputable secondary tracker (climate-laws.org, Sabin Center) — only if primary unavailable

For each item, propose 1-3 candidate URLs. Output ONLY a JSON object — no prose, no markdown:

{
  "candidates": [
    {
      "url": "https://...",
      "title": "...",
      "publisher": "...",
      "confidence": "high|medium|low",
      "rationale": "one sentence on why this is canonical"
    }
  ]
}

high = exact-name match against authoritative publisher
medium = strong topic match against likely-authoritative publisher
low = best guess; reviewer should verify

Empty candidates array is acceptable: if no canonical source is locatable, output {"candidates": []}. Do not invent URLs. The integrity rule applies — better to surface fewer candidates than invent any.`;

async function discoverCandidates(item) {
  const userMessage = `INTELLIGENCE ITEM:
- title: ${item.title}
- item_type: ${item.item_type}
- jurisdictions: ${JSON.stringify(item.jurisdictions || [])}
- topic_tags: ${JSON.stringify(item.topic_tags || [])}
- current source_url: ${item.source_url || "(none)"}
- current source_url status: ${item.broken_category ? `${item.broken_category} ${item.broken_code || ""}` : "no source on file"}

Search for the authoritative canonical source. Return JSON.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-search-2025-03-05",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: DISCOVERY_SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const textBlocks = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const jsonMatch = textBlocks.match(/\{[\s\S]*"candidates"[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in output. raw tail: ${textBlocks.slice(-300)}`);
  const parsed = JSON.parse(jsonMatch[0]);
  return { candidates: parsed.candidates || [], usage: data.usage };
}

async function verifyCandidate(url, itemTitle) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CarosLedge-Discover/1.0" },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!res.ok) return { verified: false, code: res.status, excerpt: null };
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const excerpt = text.slice(0, 1000);
    // Title overlap check: do at least 2 distinct words ≥4 chars from itemTitle appear in fetched content?
    const titleWords = (itemTitle || "").split(/\s+/).filter((w) => w.length >= 3 && /[A-Za-z]/.test(w)).map((w) => w.toLowerCase());
    const lcText = text.slice(0, 5000).toLowerCase();
    const overlapCount = titleWords.filter((w) => lcText.includes(w.replace(/[^a-z0-9]/g, ""))).length;
    // Threshold scales with title size — short titles need just 1 hit.
    const threshold = titleWords.length <= 2 ? 1 : 2;
    return {
      verified: overlapCount >= threshold,
      code: res.status,
      excerpt: excerpt.slice(0, 500),
      title_overlap: overlapCount,
      title_words: titleWords.length,
    };
  } catch (e) {
    return { verified: false, code: null, excerpt: null, error: e.message.slice(0, 100) };
  }
}

let totalCost = 0;
const summary = [];

for (let i = 0; i < targets.length; i++) {
  const item = targets[i];
  console.log("\n" + "=".repeat(80));
  console.log(`ITEM ${i + 1}/${targets.length}: [${item.legacy_id || item.id.slice(0, 8)}] ${item.title}`);
  console.log("=".repeat(80));
  console.log(`item_type=${item.item_type} jurisdictions=${JSON.stringify(item.jurisdictions||[])} topic=${JSON.stringify(item.topic_tags||[])}`);
  console.log(`current url: ${item.source_url || "(none)"}  ${item.broken_category ? `(${item.broken_category} ${item.broken_code})` : ""}`);

  let candidates = [];
  let usage = null;
  try {
    const r = await discoverCandidates(item);
    candidates = r.candidates;
    usage = r.usage;
  } catch (e) {
    console.log(`  ✗ Discovery failed: ${e.message}`);
    summary.push({ item: item.title, candidates: 0, status: "discovery_failed", error: e.message });
    continue;
  }

  const cost = ((usage?.input_tokens || 0) / 1e6) * 3 + ((usage?.output_tokens || 0) / 1e6) * 15;
  totalCost += cost;
  console.log(`  Discovery: ${candidates.length} candidates  (in=${usage?.input_tokens} out=${usage?.output_tokens}  cost=$${cost.toFixed(3)}  total=$${totalCost.toFixed(3)})`);

  for (const c of candidates) {
    console.log(`    [${c.confidence}] ${c.url}`);
    console.log(`           ${c.title} — ${c.publisher}`);
    console.log(`           ${c.rationale}`);
  }

  // Verify each candidate
  for (const c of candidates) {
    const v = await verifyCandidate(c.url, item.title);
    c.verified = v.verified;
    c.verified_status_code = v.code;
    c.verified_content_excerpt = v.excerpt;
    console.log(`    verify ${c.url.slice(0, 70)}: ${v.verified ? "OK" : "FAIL"} (code=${v.code} overlap=${v.title_overlap}/${v.title_words}${v.error ? " err=" + v.error : ""})`);
  }

  // Insert into canonical_source_candidates
  if (candidates.length === 0) {
    summary.push({ item: item.title, candidates: 0, status: "no_candidates" });
    continue;
  }

  const issueClass =
    item.broken_category ? "stale_url" :
    !item.source_id && !item.source_url ? "missing_source" :
    !item.source_id ? "missing_link" : "thin_match";

  // Sanitize: strip stray `\u` escape sequences and other backslash sequences
  // that Postgres / JSON parsers reject. Any `\u` not followed by 4 hex digits
  // is replaced with `\\u`. Belt-and-braces also strip null bytes and BOMs.
  function clean(s) {
    if (!s) return s;
    return String(s)
      .replace(/\u0000/g, "")
      .replace(/\uFEFF/g, "")
      .replace(/\\u(?![0-9a-fA-F]{4})/g, "\\\\u")
      .replace(/\\(?![\\nrtbfv"'/u])/g, "\\\\");
  }

  const rows = candidates.map((c) => ({
    intelligence_item_id: item.id,
    current_source_id: item.source_id || null,
    current_source_url: clean(item.source_url) || null,
    issue_classification: issueClass,
    candidate_url: clean(c.url),
    candidate_title: clean(c.title),
    candidate_publisher: clean(c.publisher),
    confidence: c.confidence,
    rationale: clean(c.rationale),
    verified: c.verified || false,
    verified_status_code: c.verified_status_code,
    verified_content_excerpt: clean(c.verified_content_excerpt),
  }));

  const { error: insErr } = await supabase.from("canonical_source_candidates").insert(rows);
  if (insErr) {
    console.log(`  ✗ DB insert failed: ${insErr.message}`);
    summary.push({ item: item.title, candidates: candidates.length, status: "db_insert_failed" });
  } else {
    console.log(`  ✓ ${rows.length} candidates stored. Verified: ${rows.filter((r) => r.verified).length}/${rows.length}`);
    summary.push({ item: item.title, candidates: candidates.length, verified: rows.filter((r) => r.verified).length, status: "ok" });
  }

  if (totalCost > SPEND_CEILING) {
    console.log(`\n✗ SPEND CEILING $${SPEND_CEILING} EXCEEDED. Halting.`);
    break;
  }
}

console.log("\n" + "=".repeat(80));
console.log("DISCOVERY COMPLETE");
console.log("=".repeat(80));
console.log(`Items processed: ${summary.length}`);
console.log(`Total spend: $${totalCost.toFixed(3)}`);
const byStatus = {};
for (const s of summary) byStatus[s.status] = (byStatus[s.status] || 0) + 1;
for (const [k, v] of Object.entries(byStatus)) console.log(`  ${v}  ${k}`);
console.log(`Candidates stored: ${summary.reduce((a, s) => a + (s.status === "ok" ? s.candidates : 0), 0)}`);
console.log(`Verified candidates: ${summary.reduce((a, s) => a + (s.verified || 0), 0)}`);
