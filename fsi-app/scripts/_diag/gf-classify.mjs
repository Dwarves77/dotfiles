/** READ-ONLY: Classify guidance/framework items as KEEP (genuinely regulatory)
 *  or RECLASSIFY-TO-<type> based on title + full_brief content inspection.
 *  Makes NO data changes. Outputs a decision table for operator review.
 *
 *  Purpose: pre-flight gate before regulation grounding/generation pass —
 *  ensure mis-typed guidance/framework items do NOT generate Regulatory Fact
 *  Documents when their content is actually a market signal, research finding,
 *  technology, or regional ops item.
 *
 *  node scripts/_diag/gf-classify.mjs
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ── 1. Fetch all non-archived guidance/framework items ──────────────────────
const { data: items, error } = await sb
  .from("intelligence_items")
  .select(
    "id, legacy_id, title, item_type, provenance_status, source_url, full_brief, summary, why_matters"
  )
  .in("item_type", ["guidance", "framework"])
  .eq("is_archived", false)
  .order("item_type", { ascending: true })
  .order("title", { ascending: true });

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

if (!items || items.length === 0) {
  console.log("No guidance/framework items found (non-archived).");
  process.exit(0);
}

// ── 2. Classification logic ──────────────────────────────────────────────────
// Examine title + content snippet. Judge on content semantics, not item_type.

/** Return a short text blob for content inspection (title + summary + why_matters + brief head) */
function contentBlob(item) {
  const parts = [
    item.title || "",
    item.summary || "",
    item.why_matters || "",
    (item.full_brief || "").slice(0, 1200),
  ];
  return parts.join(" ").toLowerCase();
}

/** Patterns that signal MARKET_SIGNAL / INITIATIVE content */
const MARKET_SIGNAL_PATTERNS = [
  /incentive scheme/i,
  /green finance/i,
  /green bond/i,
  /sustainable finance/i,
  /green loan/i,
  /investment incentive/i,
  /tax incentive/i,
  /subsidy/i,
  /grant programme/i,
  /market-based measure/i,
  /voluntary pledge/i,
  /industry initiative/i,
  /voluntary commitment/i,
  /net.zero pledge/i,
  /private sector initiative/i,
  /carbon credit market/i,
  /carbon offset/i,
  /voluntary carbon/i,
  /green shipping corridor/i,
  /shipping corridor/i,
  /partnership/i,
  /alliance/i,
  /coalition/i,
];

/** Patterns that signal RESEARCH_FINDING content */
const RESEARCH_PATTERNS = [
  /study/i,
  /research report/i,
  /academic/i,
  /findings/i,
  /analysis report/i,
  /white paper/i,
  /working paper/i,
  /technical report/i,
  /emissions measurement/i,
  /life.?cycle assessment/i,
  /LCA/i,
  /peer.reviewed/i,
];

/** Patterns that signal TECHNOLOGY / INNOVATION content */
const TECH_PATTERNS = [
  /technology roadmap/i,
  /digital platform/i,
  /software/i,
  /tool/i,
  /methodology tool/i,
  /calculator/i,
  /tracking platform/i,
  /blockchain/i,
  /AI.powered/i,
  /data platform/i,
];

/** Patterns that signal REGIONAL_DATA / operations content */
const REGIONAL_PATTERNS = [
  /port statistics/i,
  /regional data/i,
  /trade corridor/i,
  /logistics hub/i,
  /infrastructure programme/i,
  /regional strategy/i,
  /national logistics/i,
  /country.level data/i,
];

/** Strong signals that the item IS genuinely regulatory/official guidance */
const REGULATORY_SIGNALS = [
  /regulation\b/i,
  /directive\b/i,
  /implementing regulation/i,
  /delegated regulation/i,
  /official journal/i,
  /\beur.?lex\b/i,
  /\blegislation\b/i,
  /legally binding/i,
  /compliance obligation/i,
  /mandatory requirement/i,
  /penalty/i,
  /fine/i,
  /enforcement/i,
  /authority\b/i,
  /regulator\b/i,
  /statutory/i,
  /national law/i,
  /primary legislation/i,
  /secondary legislation/i,
  /code of practice/i, // official code (not voluntary)
  /technical standard.*mandatory/i,
  /requires.*operator/i,
  /obligat/i, // obligation/obligatory
  /IMO.*resolution/i,
  /MEPC\b/i,
  /CORSIA/i,
  /ETS\b/i,
  /CII\b/i,
  /CBAM\b/i,
  /MARPOL/i,
  /annex.*marpol/i,
  /customs.*procedure/i,
  /decree\b/i,
  /ordinance\b/i,
  /circular\b.*ministry/i,
  /ministry.*circular\b/i,
  /order\b.*minister/i,
  /official.*guidance/i,
  /regulatory.*guidance/i,
  /compliance.*guidance/i,
  /implementation.*guidance/i,
  /government.*guidance/i,
];

/**
 * Classify one item. Returns:
 *   { verdict: "KEEP" | "RECLASSIFY", targetType: string|null, reason: string }
 */
function classify(item) {
  const blob = contentBlob(item);
  const title = (item.title || "").trim();

  // Count regulatory signals
  const regHits = REGULATORY_SIGNALS.filter((re) => re.test(blob));

  // Count each reclassify-class signal
  const mktHits = MARKET_SIGNAL_PATTERNS.filter((re) => re.test(blob));
  const resHits = RESEARCH_PATTERNS.filter((re) => re.test(blob));
  const techHits = TECH_PATTERNS.filter((re) => re.test(blob));
  const regDataHits = REGIONAL_PATTERNS.filter((re) => re.test(blob));

  // Score: regulatory confidence vs reclassify signal strength
  const regScore = regHits.length;
  const mktScore = mktHits.length * 2; // market misfits carry more weight
  const resScore = resHits.length * 1.5;
  const techScore = techHits.length * 1.5;
  const rdScore = regDataHits.length;

  // If strong market/incentive signal dominates, reclassify
  if (mktScore > regScore && mktScore >= 2) {
    return {
      verdict: "RECLASSIFY",
      targetType: "market_signal",
      reason: `Market/incentive signals (${mktHits.slice(0, 3).join(", ")}) outweigh regulatory signals (${regScore})`,
    };
  }
  if (resScore > regScore && resScore >= 3) {
    return {
      verdict: "RECLASSIFY",
      targetType: "research_finding",
      reason: `Research-content signals (${resHits.slice(0, 3).join(", ")}) outweigh regulatory signals (${regScore})`,
    };
  }
  if (techScore > regScore && techScore >= 3) {
    return {
      verdict: "RECLASSIFY",
      targetType: "technology",
      reason: `Technology/tool signals (${techHits.slice(0, 3).join(", ")}) outweigh regulatory signals (${regScore})`,
    };
  }
  if (rdScore > regScore && rdScore >= 2) {
    return {
      verdict: "RECLASSIFY",
      targetType: "regional_data",
      reason: `Regional/ops data signals (${regDataHits.slice(0, 2).join(", ")}) outweigh regulatory signals (${regScore})`,
    };
  }

  // Title-level quick reads that override score (known patterns from context)
  if (/incentive scheme/i.test(title) || /green finance incentive/i.test(title)) {
    return {
      verdict: "RECLASSIFY",
      targetType: "market_signal",
      reason: "Title explicitly names an incentive scheme — market signal, not a binding rule",
    };
  }
  if (/voluntary.*programme/i.test(title) || /programme.*voluntary/i.test(title)) {
    return {
      verdict: "RECLASSIFY",
      targetType: "market_signal",
      reason: "Voluntary programme by title — not a binding regulatory obligation",
    };
  }
  if (/corridor.*agreement/i.test(title) || /green corridor/i.test(title)) {
    return {
      verdict: "RECLASSIFY",
      targetType: "market_signal",
      reason: "Green corridor / partnership agreement — initiative, not binding regulation",
    };
  }

  // Default: if any regulatory signals present OR no strong reclassify signal, KEEP
  if (regScore >= 1) {
    return {
      verdict: "KEEP",
      targetType: null,
      reason: `${regScore} regulatory signal(s) present (${regHits.slice(0, 3).join(", ")}); content consistent with regulatory/official guidance`,
    };
  }

  // No regulatory signal, no strong reclassify signal — flag as low-confidence KEEP with note
  return {
    verdict: "KEEP",
    targetType: null,
    reason: "No strong regulatory OR reclassify signals detected — needs manual review; keeping as-is conservatively",
  };
}

// ── 3. Run classifications ────────────────────────────────────────────────────
const results = items.map((item) => ({
  item,
  ...classify(item),
}));

// ── 4. Output table ───────────────────────────────────────────────────────────
const COLS = {
  id: 10,
  type: 9,
  status: 11,
  verdict: 22,
  title: 52,
  reason: 72,
};

function pad(s, n) {
  s = String(s || "").replace(/\n/g, " ");
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

console.log("\n" + "=".repeat(110));
console.log("  GUIDANCE / FRAMEWORK CLASSIFICATION GATE — read-only, no data changed");
console.log("=".repeat(110));
console.log(
  pad("ID", COLS.id) +
    pad("TYPE", COLS.type) +
    pad("PROV STATUS", COLS.status) +
    pad("VERDICT", COLS.verdict) +
    pad("TITLE", COLS.title)
);
console.log("-".repeat(110));

for (const r of results) {
  const label =
    r.verdict === "KEEP"
      ? "KEEP"
      : `RECLASSIFY-TO-${(r.targetType || "?").toUpperCase()}`;
  console.log(
    pad(r.item.legacy_id || r.item.id.slice(0, 8), COLS.id) +
      pad(r.item.item_type, COLS.type) +
      pad(r.item.provenance_status, COLS.status) +
      pad(label, COLS.verdict) +
      pad(r.item.title, COLS.title)
  );
  console.log(" ".repeat(COLS.id + COLS.type + COLS.status) + "  reason: " + r.reason.slice(0, 100));
  console.log(" ".repeat(COLS.id + COLS.type + COLS.status) + "  url:    " + (r.item.source_url || "(none)").slice(0, 90));
  console.log();
}

// ── 5. Summary counts ─────────────────────────────────────────────────────────
const keep = results.filter((r) => r.verdict === "KEEP");
const reclassify = results.filter((r) => r.verdict === "RECLASSIFY");
const byTarget = {};
for (const r of reclassify) {
  byTarget[r.targetType] = (byTarget[r.targetType] || 0) + 1;
}

console.log("=".repeat(110));
console.log("SUMMARY");
console.log("=".repeat(110));
console.log(`Total guidance/framework (non-archived): ${items.length}`);
console.log(`  KEEP (safe to generate as Regulatory Fact Document): ${keep.length}`);
console.log(`  RECLASSIFY: ${reclassify.length}`);
for (const [t, n] of Object.entries(byTarget)) {
  console.log(`    -> ${t.padEnd(20)} ${n}`);
}
console.log();
console.log("KEEP ids (safe for generation pass):");
for (const r of keep) {
  console.log(`  ${(r.item.legacy_id || r.item.id.slice(0, 8)).padEnd(12)} ${r.item.title}`);
}
console.log();
console.log("RECLASSIFY ids (must reclassify first — do NOT generate Regulatory Fact Documents):");
for (const r of reclassify) {
  console.log(
    `  ${(r.item.legacy_id || r.item.id.slice(0, 8)).padEnd(12)} -> ${(r.targetType || "?").padEnd(18)} ${r.item.title}`
  );
}
console.log("\n[READ-ONLY — no data changed]");
