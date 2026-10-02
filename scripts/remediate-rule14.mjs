#!/usr/bin/env node
// remediate-rule14.mjs - apply [HYPOTHESIS]/[CONFIRMED]/[REFUTED] labels to unlabeled finding-shaped lines
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDITS = join(HERE, "..", "docs", "audits");

// Recursive walk to list all .md audit files
function listAuditFiles(root) {
  const out = [];
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".md")) out.push(relative(root, p));
    }
  };
  walk(root);
  return out;
}

// Status token regex from audit-finding-status.mjs
const STATUS = /\[(CONFIRMED|HYPOTHESIS|REFUTED)\b[^\]]*\]/;

// Finding line heuristic: starts as list item AND contains defect-ish marker
const LIST = /^\s{0,3}(?:\d+\.|[-*])\s+/;
const DEFECTY = /\b(bug|defect|broken|fails?|failing|missing|never|unsafe|vulnerab|exposure|escalat|leak|wrong|incorrect|regress|deadlock|bypass|unwired|orphan|drops? (?:the )?error)\b/i;

// Check if line contains confirmation/refutation indicators
const CONFIRMED_PATTERN = /\b(confirmed|verified)\b/i;
const REFUTED_PATTERN = /\b(refuted|false positive)\b/i;

function determineLabel(line) {
  if (REFUTED_PATTERN.test(line)) return "[REFUTED]";
  if (CONFIRMED_PATTERN.test(line)) return "[CONFIRMED]";
  return "[HYPOTHESIS]";
}

let files = [];
try { files = listAuditFiles(AUDITS); }
catch { console.log("no docs/audits directory"); process.exit(0); }

let totalModified = 0;
const fileStats = {};

for (const f of files) {
  const filePath = join(AUDITS, f);
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  let inFence = false;
  let modified = 0;

  const newLines = lines.map((line, idx) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line;
    if (line.trim().startsWith("|")) return line;  // tables
    if (!LIST.test(line) || !DEFECTY.test(line)) return line;

    // It's a finding-shaped line - check if it already has a status token
    if (STATUS.test(line)) return line;

    // Unlabeled finding - add status token
    modified++;
    const label = determineLabel(line);
    return line + ` ${label}`;
  });

  if (modified > 0) {
    writeFileSync(filePath, newLines.join("\n"), "utf8");
    totalModified += modified;
    fileStats[f] = modified;
  }
}

// Report
const filesChanged = Object.keys(fileStats).length;
console.log(`Remediation complete: ${totalModified} lines labeled across ${filesChanged} file(s).`);

// Breakdown by token
const breakdown = { "[HYPOTHESIS]": 0, "[CONFIRMED]": 0, "[REFUTED]": 0 };
for (const f of files) {
  const filePath = join(AUDITS, f);
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  let inFence = false;
  lines.forEach((line) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    if (line.trim().startsWith("|")) return;
    if (!LIST.test(line) || !DEFECTY.test(line)) return;
    if (line.includes("[HYPOTHESIS]")) breakdown["[HYPOTHESIS]"]++;
    else if (line.includes("[CONFIRMED]")) breakdown["[CONFIRMED]"]++;
    else if (line.includes("[REFUTED]")) breakdown["[REFUTED]"]++;
  });
}

console.log("\nBreakdown by token:");
console.log(`  [HYPOTHESIS]: ${breakdown["[HYPOTHESIS]"]}`);
console.log(`  [CONFIRMED]:  ${breakdown["[CONFIRMED]"]}`);
console.log(`  [REFUTED]:    ${breakdown["[REFUTED]"]}`);
console.log(`\nFiles modified: ${filesChanged}`);
