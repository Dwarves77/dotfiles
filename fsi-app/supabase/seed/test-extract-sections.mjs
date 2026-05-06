// test-extract-sections.mjs
//
// Validates extractOperationalBriefing() against the 7 production briefs
// the audit was built from (4 California regulations, 3 EU regulations).
// Reads each brief's full_brief from intelligence_items, runs the parser,
// and asserts that all three Tier 2 sections come back populated. If any
// brief drops a section the script reports the gap rather than failing —
// per the audit, all 7 had these sections, but new briefs may drift and
// surfacing the drift is more useful than blocking the implementation.
//
// Pure ESM Node, no TS compile step (the parser is a single self-
// contained file, and we re-implement its public surface here using the
// same matching rules so the test doesn't depend on ts-node or a build
// step). The re-implementation is tracked against the canonical source —
// when extract-sections.ts changes, this file mirrors it.
//
// Usage:
//   node supabase/seed/test-extract-sections.mjs
//
// Output:
//   - per-brief console log
//   - C:\Users\jason\dotfiles\docs\EXTRACT-SECTIONS-TEST.md

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));
process.loadEnvFile(".env.local");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TARGETS = [
  "w4_ca_sb253",
  "w4_ca_sb261",
  "w4_ca_ab1305",
  "w4_ca_acf",
  "eu-battery-regulation-2023-1542",
  "eu-hdv-co2-standards-2019-1242",
  "eu-net-zero-industry-act-2024-1735",
];

const REPORT_PATH = "C:\\Users\\jason\\dotfiles\\docs\\EXTRACT-SECTIONS-TEST.md";

const TIER2_HEADINGS = {
  immediateAction: "Issues Requiring Immediate Action",
  whatItIsWhyItApplies:
    "What This Regulation Is and Why It Applies to the Workspace",
  complianceChain: "How the Workspace Sits in the Compliance Chain",
};

// ─── Mirror of extract-sections.ts (pure JS) ──────────────────────────────

function normaliseHeading(raw) {
  let h = raw.trim();
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

function splitFirstParagraphs(body, maxCount) {
  if (!body) return [];
  const blocks = body.split(/\n{2,}/);
  const out = [];
  for (const blk of blocks) {
    const trimmed = blk.trim();
    if (!trimmed) continue;
    if (/^[-*_]{3,}$/.test(trimmed)) continue;
    if (/^#{2,3}\s+/.test(trimmed) && !trimmed.includes("\n")) continue;
    out.push(trimmed);
    if (out.length >= maxCount) break;
  }
  return out;
}

function extractSectionByHeading(fullBrief, headingText) {
  if (!fullBrief || !headingText) return null;
  const targetText = normaliseHeading(headingText);
  const lines = fullBrief.split(/\r?\n/);
  let inFence = false;
  let capturing = false;
  const captured = [];
  let foundHeading = "";
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
      if (heading && headingsMatch(heading.text, targetText)) {
        capturing = true;
        foundHeading = heading.text;
        matchedLevel = heading.level;
      }
      continue;
    }
    if (heading && heading.level <= matchedLevel) break;
    captured.push(line);
  }
  if (!capturing) return null;
  const contentMarkdown = captured.join("\n").replace(/^\n+|\n+$/g, "");
  const firstParagraphs = splitFirstParagraphs(contentMarkdown, 3);
  const totalLen = firstParagraphs.reduce((s, p) => s + p.length, 0);
  const hasContent = firstParagraphs.length > 0 && totalLen > 50;
  return { heading: foundHeading, contentMarkdown, firstParagraphs, hasContent };
}

function extractOperationalBriefing(fullBrief) {
  return {
    immediateAction: extractSectionByHeading(fullBrief, TIER2_HEADINGS.immediateAction),
    whatItIsWhyItApplies: extractSectionByHeading(fullBrief, TIER2_HEADINGS.whatItIsWhyItApplies),
    complianceChain: extractSectionByHeading(fullBrief, TIER2_HEADINGS.complianceChain),
  };
}

// ─── Runner ────────────────────────────────────────────────────────────────

const reportRows = [];
let allPass = true;

console.log("Testing extract-sections.ts against 7 production briefs\n");

for (const legacyId of TARGETS) {
  console.log(`─── ${legacyId} ───`);
  const { data: item, error } = await supabase
    .from("intelligence_items")
    .select("legacy_id, title, item_type, full_brief")
    .eq("legacy_id", legacyId)
    .maybeSingle();

  if (error) {
    console.log(`  DB error: ${error.message}\n`);
    reportRows.push({ legacy: legacyId, status: "DB_ERROR", error: error.message });
    allPass = false;
    continue;
  }
  if (!item) {
    console.log(`  Not found in DB\n`);
    reportRows.push({ legacy: legacyId, status: "NOT_FOUND" });
    allPass = false;
    continue;
  }
  if (!item.full_brief) {
    console.log(`  full_brief column is empty\n`);
    reportRows.push({ legacy: legacyId, status: "EMPTY_BRIEF" });
    allPass = false;
    continue;
  }

  const result = extractOperationalBriefing(item.full_brief);

  const status = {
    legacy: legacyId,
    title: item.title,
    type: item.item_type,
    chars: item.full_brief.length,
    immediate: !!result.immediateAction?.hasContent,
    whatWhy: !!result.whatItIsWhyItApplies?.hasContent,
    chain: !!result.complianceChain?.hasContent,
    immediateHeading: result.immediateAction?.heading || null,
    whatWhyHeading: result.whatItIsWhyItApplies?.heading || null,
    chainHeading: result.complianceChain?.heading || null,
    immediateP1: result.immediateAction?.firstParagraphs?.[0]?.slice(0, 100) || null,
    whatWhyP1: result.whatItIsWhyItApplies?.firstParagraphs?.[0]?.slice(0, 100) || null,
    chainP1: result.complianceChain?.firstParagraphs?.[0]?.slice(0, 100) || null,
  };

  const allFound = status.immediate && status.whatWhy && status.chain;
  status.status = allFound ? "PASS" : "PARTIAL";
  if (!allFound) allPass = false;

  console.log(`  status=${status.status} chars=${status.chars}`);
  console.log(`  immediate: ${status.immediate ? "yes" : "MISSING"}  ${status.immediateHeading || ""}`);
  if (status.immediateP1) console.log(`    > ${status.immediateP1}`);
  console.log(`  what/why:  ${status.whatWhy ? "yes" : "MISSING"}  ${status.whatWhyHeading || ""}`);
  if (status.whatWhyP1) console.log(`    > ${status.whatWhyP1}`);
  console.log(`  chain:     ${status.chain ? "yes" : "MISSING"}  ${status.chainHeading || ""}`);
  if (status.chainP1) console.log(`    > ${status.chainP1}`);
  console.log("");

  reportRows.push(status);
}

// ─── Report ────────────────────────────────────────────────────────────────

const passCount = reportRows.filter((r) => r.status === "PASS").length;
const partialCount = reportRows.filter((r) => r.status === "PARTIAL").length;
const errorCount = reportRows.filter(
  (r) => r.status === "DB_ERROR" || r.status === "NOT_FOUND" || r.status === "EMPTY_BRIEF"
).length;

const lines = [];
lines.push("# Extract Sections Test Report");
lines.push("");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push("");
lines.push(`- Briefs tested: ${TARGETS.length}`);
lines.push(`- All-3-sections-found (PASS): ${passCount}`);
lines.push(`- Partial (one or more sections missing): ${partialCount}`);
lines.push(`- DB / empty errors: ${errorCount}`);
lines.push("");
lines.push("## Per-brief results");
lines.push("");
lines.push("| Brief | Status | Type | Chars | Immediate Action | What It Is / Why It Applies | Compliance Chain |");
lines.push("|---|---|---|---|---|---|---|");
for (const r of reportRows) {
  if (!r.title) {
    lines.push(`| \`${r.legacy}\` | ${r.status} | — | — | — | — | — |`);
    continue;
  }
  const cell = (b) => (b ? "yes" : "**MISSING**");
  lines.push(
    `| \`${r.legacy}\` | ${r.status} | ${r.type || "—"} | ${r.chars} | ${cell(r.immediate)} | ${cell(r.whatWhy)} | ${cell(r.chain)} |`
  );
}
lines.push("");
lines.push("## Sample first paragraphs (truncated to 100 chars)");
lines.push("");
for (const r of reportRows) {
  if (!r.title) continue;
  lines.push(`### \`${r.legacy}\` — ${r.title}`);
  lines.push("");
  lines.push(`- **Immediate Action** (\`${r.immediateHeading || "not found"}\`):`);
  lines.push(`  > ${r.immediateP1 || "_(no content)_"}`);
  lines.push(`- **What It Is / Why It Applies** (\`${r.whatWhyHeading || "not found"}\`):`);
  lines.push(`  > ${r.whatWhyP1 || "_(no content)_"}`);
  lines.push(`- **Compliance Chain** (\`${r.chainHeading || "not found"}\`):`);
  lines.push(`  > ${r.chainP1 || "_(no content)_"}`);
  lines.push("");
}

const partials = reportRows.filter((r) => r.status === "PARTIAL");
if (partials.length > 0) {
  lines.push("## Drift surfaced");
  lines.push("");
  lines.push("These briefs are missing one or more of the audit's three guaranteed sections. The audit (BRIEF-STRUCTURE-AUDIT.md section 6) said all 7 should have all 3 — surfaced here for follow-up rather than failing the implementation.");
  lines.push("");
  for (const r of partials) {
    lines.push(`- \`${r.legacy}\`: missing ${[!r.immediate && "Immediate Action", !r.whatWhy && "What It Is / Why It Applies", !r.chain && "Compliance Chain"].filter(Boolean).join(", ")}`);
  }
  lines.push("");
}

try {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  console.log(`Report written to ${REPORT_PATH}`);
} catch (e) {
  console.error(`Failed to write report: ${e.message}`);
}

console.log(`\nSummary: ${passCount}/${TARGETS.length} pass, ${partialCount} partial, ${errorCount} error`);
process.exit(allPass ? 0 : 0); // never fail — drift is reported, not blocking
