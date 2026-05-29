// Read-only — extract the 16 items from the B audit report that have >=1
// fabrication-class flag, with each item's flag count and flag types.

import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPORT_PATH = join(tmpdir(), "optionc-b-audit.txt");
const text = readFileSync(REPORT_PATH, "utf8");

// Split by item.
const itemBlocks = text.split(/\n--- ITEM /).slice(1);

const flagged = [];
const clean = [];

for (const block of itemBlocks) {
  const headerMatch = /^([a-z0-9-]+)\s+\[(CRITICAL|HIGH)\]/.exec(block);
  if (!headerMatch) continue;
  const id = headerMatch[1];
  const pri = headerMatch[2];

  const sourceMatch = /source_url:\s+(\S+)/.exec(block);
  const sourceUrl = sourceMatch ? sourceMatch[1] : "(none)";

  // Lines marked with ***  ___ are the fabrication flags.
  const fabUrls = (block.match(/\s\*\*\*\s+FABRICATED_URL/g) || []).length;
  const fabMeta = (block.match(/\s\*\*\*\s+FABRICATED_METADATA/g) || []).length;
  const total = fabUrls + fabMeta;

  const row = { id, pri, sourceUrl, fabUrls, fabMeta, total };
  if (total > 0) flagged.push(row);
  else clean.push(row);
}

console.log(`=== Flagged items (>=1 fabrication flag): ${flagged.length} ===\n`);
for (const r of flagged.sort((a, b) => b.total - a.total)) {
  console.log(
    `[${r.pri.padEnd(8)}] ${r.id.padEnd(50)} URL_fab=${r.fabUrls} META_fab=${r.fabMeta} src=${r.sourceUrl.slice(0, 80)}`
  );
}

console.log(`\n=== Clean items (zero fabrication flags): ${clean.length} ===\n`);
for (const r of clean) {
  console.log(`[${r.pri.padEnd(8)}] ${r.id.padEnd(50)} src=${r.sourceUrl.slice(0, 80)}`);
}

console.log(`\nTotal: ${flagged.length} flagged + ${clean.length} clean = ${flagged.length + clean.length}`);
