/**
 * sprint3-a5-backfill.mjs
 *
 * Sprint 3 A5.2 (2026-05-27). Backfills `intelligence_item_sections`
 * from each active D1 (Regulations) item's `full_brief` markdown,
 * using the A5.1 parser at src/lib/agent/extract-regulation-sections.ts.
 *
 * Idempotent: ON CONFLICT (item_id, section_key) DO UPDATE re-writes
 * the same row. Re-runnable.
 *
 * Per-section coverage log written at the end. No DDL changes.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");

// ── env ─────────────────────────────────────────────────────────────
const envText = readFileSync(resolve(APP_ROOT, ".env.local"), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── jiti-loaded TS parser ──────────────────────────────────────────
const jiti = createJiti(import.meta.url, { interopDefault: true });
const parserModule = await jiti.import("../src/lib/agent/extract-regulation-sections.ts");
const { extractRegulationSections } = parserModule;
if (typeof extractRegulationSections !== "function") {
  console.error("Failed to load extractRegulationSections from A5.1 parser");
  process.exit(1);
}

// ── section_order map ──────────────────────────────────────────────
// numeric matches the SKILL.md §N spec; A5.3 renderer sorts by section_order.
const SECTION_ORDER = {
  "3": 3,
  "4": 4,
  "8": 8,
  "10": 10,
  "11": 11,
  "14": 14,
  "15": 15,
};

// ── heading variants for raw-markdown re-extract ────────────────────
// Mirrors SECTION_HEADINGS in extract-regulation-sections.ts. Declared
// here so extractRawSectionMarkdown can reference it without TDZ issues.
const HEADINGS = {
  "3": ["Issues Requiring Immediate Action", "§3 Issues Requiring Immediate Action"],
  "4": ["How the Workspace Sits in the Compliance Chain", "§4 How the Workspace Sits in the Compliance Chain"],
  "8": ["Substantive Requirements", "§8 Substantive Requirements"],
  "10": ["Registration and Reporting Obligations", "§10 Registration and Reporting Obligations"],
  "11": ["Operational System Requirements", "§11 Operational System Requirements"],
  "14": ["Confirmed Regulatory Timeline", "§14 Confirmed Regulatory Timeline"],
  "15": ["Sources", "§15 Sources"],
};

// ── query active D1 items ──────────────────────────────────────────
console.log("[A5.2] querying active D1 items with non-empty full_brief…");
const { data: rows, error: qErr } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, full_brief")
  .eq("domain", 1)
  .eq("is_archived", false)
  .not("full_brief", "is", null);

if (qErr) {
  console.error("[A5.2] query failed:", qErr.message);
  process.exit(1);
}

const eligible = (rows || []).filter((r) => (r.full_brief || "").trim().length > 0);
console.log(`[A5.2] eligible rows: ${eligible.length}`);

// ── parse + upsert ─────────────────────────────────────────────────
const coverage = { "3": 0, "4": 0, "8": 0, "10": 0, "11": 0, "14": 0, "15": 0 };
const itemsWithAnySection = new Set();
const itemsWithoutAnySection = [];
let upsertedRows = 0;
let upsertFailed = 0;

for (let i = 0; i < eligible.length; i++) {
  const row = eligible[i];
  const sections = extractRegulationSections(row.full_brief);
  const keys = Object.keys(sections);

  if (keys.length === 0) {
    itemsWithoutAnySection.push({ id: row.id, legacy_id: row.legacy_id, title: row.title });
    if ((i + 1) % 25 === 0 || i === eligible.length - 1) {
      console.log(`[A5.2] progress ${i + 1}/${eligible.length}`);
    }
    continue;
  }

  itemsWithAnySection.add(row.id);

  // Build upsert payload — one row per parsed section.
  const sectionRows = keys.map((key) => ({
    item_id: row.id,
    section_key: key,
    section_order: SECTION_ORDER[key] ?? 999,
    // Per migration 103 comment, content_md is the authoritative markdown
    // body. The structured parse output is re-derived at render time by
    // the A5.3 renderer (which re-runs the A5.1 parser on the markdown).
    // Storing the raw section markdown here keeps the column type-faithful
    // and lets the parser evolve without DB migrations.
    content_md: extractRawSectionMarkdown(row.full_brief, key) ?? JSON.stringify(sections[key]),
    is_conditional: false, // all 7 sections are spec-mandated "Always"
    source_ids: [],
  }));

  const { error: upErr } = await supabase
    .from("intelligence_item_sections")
    .upsert(sectionRows, { onConflict: "item_id,section_key" });

  if (upErr) {
    upsertFailed++;
    console.error(`[A5.2] upsert failed for ${row.legacy_id || row.id}:`, upErr.message);
  } else {
    upsertedRows += sectionRows.length;
    for (const k of keys) coverage[k] += 1;
  }

  if ((i + 1) % 25 === 0 || i === eligible.length - 1) {
    console.log(`[A5.2] progress ${i + 1}/${eligible.length}, upserts ok ${upsertedRows}, fail ${upsertFailed}`);
  }
}

// ── coverage report ────────────────────────────────────────────────
console.log("\n[A5.2] === Coverage report ===");
console.log(`Items inspected:                ${eligible.length}`);
console.log(`Items with ≥1 parsed section:   ${itemsWithAnySection.size}`);
console.log(`Items with NO parseable sections: ${itemsWithoutAnySection.length}`);
console.log(`Rows upserted:                  ${upsertedRows}`);
console.log(`Upsert failures:                ${upsertFailed}`);
console.log("\nPer-section coverage (count of items where the section parsed):");
for (const key of ["3", "4", "8", "10", "11", "14", "15"]) {
  const pct = eligible.length > 0 ? ((coverage[key] / eligible.length) * 100).toFixed(1) : "0.0";
  console.log(`  §${key.padEnd(2)}: ${String(coverage[key]).padStart(4)} / ${eligible.length}  (${pct}%)`);
}

if (itemsWithoutAnySection.length > 0) {
  console.log("\n[A5.2] First 10 items with NO parseable sections:");
  for (const it of itemsWithoutAnySection.slice(0, 10)) {
    console.log(`  - ${it.legacy_id || it.id}: ${(it.title || "").slice(0, 80)}`);
  }
}

console.log("\n[A5.2] backfill complete.");

// ── helpers ────────────────────────────────────────────────────────

/**
 * Re-extract the raw markdown body for a section by heading. Mirrors
 * the A5.1 parser's internal call to extractSectionByHeading() but
 * returns just the contentMarkdown string. Used to store the raw
 * markdown in content_md.
 *
 * Heading variants must match the SECTION_HEADINGS map in
 * extract-regulation-sections.ts. Hardcoded here to avoid pulling
 * the helper through a second jiti round-trip.
 */
function extractRawSectionMarkdown(fullBrief, sectionKey) {
  const variants = HEADINGS[sectionKey];
  if (!variants) return null;

  for (const variant of variants) {
    const body = extractByHeading(fullBrief, variant);
    if (body) return body;
  }
  return null;
}

function normaliseHeading(raw) {
  let h = (raw || "").trim();
  h = h.replace(/^\*+\s*/, "").replace(/\s*\*+$/, "");
  h = h.replace(/^\d+\s*[.)]\s*/, "");
  return h.trim();
}

function headingsMatch(a, b) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}

function parseHeadingLine(line) {
  const m = /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line);
  if (!m) return null;
  const level = m[1].length;
  const text = normaliseHeading(m[2]);
  if (!text) return null;
  return { level, text };
}

function extractByHeading(fullBrief, headingText) {
  if (!fullBrief || !headingText) return null;
  const target = normaliseHeading(headingText);
  const lines = fullBrief.split(/\r?\n/);
  let inFence = false;
  let capturing = false;
  let captured = [];
  let matchedLevel = 1;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      if (capturing) captured.push(line);
      continue;
    }
    if (inFence) {
      if (capturing) captured.push(line);
      continue;
    }
    const heading = parseHeadingLine(line);
    if (!capturing) {
      if (heading && headingsMatch(heading.text, target)) {
        capturing = true;
        matchedLevel = heading.level;
      }
      continue;
    }
    if (heading && heading.level <= matchedLevel) break;
    captured.push(line);
  }
  if (!capturing) return null;
  return captured.join("\n").replace(/^\n+|\n+$/g, "");
}
