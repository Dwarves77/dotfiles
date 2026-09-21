#!/usr/bin/env node
// validate-statutory-rows-file.mjs, the pre-flight PRODUCTION-APPLY gate for a write-statutory.mjs
// --rows-file. Lane FUELEU-ROWS, 2026-09-06 (audit W3-W4 finding 3: statutory_computations has 0 rows
// because the one rows-file in the tree, scripts/_worklists/statutory-fueleu-annex-iv-2026-09-05.json ,
// is self-labeled a non-production FIXTURE and sits at a path propagation-drain.yml does not read).
//
// WHAT THIS CHECKS THAT write-statutory.mjs's OWN parseRow() DOES NOT (that file is not in this lane's
// write set, see fueleu-annex-i-iv-statutory-constants-2026-09-06.json's own header): parseRow() only
// checks STRUCTURAL shape (every field present, targetYear supported), it has no opinion on whether a
// citation string is a REAL source or a placeholder. This validator is the rule-18 gate ("a figure with a
// source is published with that source's rating; the source is found and rated, never the figure
// refused") applied BEFORE apply, not after: every row must carry a structured `source` block per
// StatutoryInput (url/article/quote/verified_at, the same shape scripts/spec09/lib/rows-file.mjs's
// requireCitation() already established for the other rows-file-driven producers, reused here rather than
// re-invented, no copy of that logic, this file imports classTierForHost the same way rows-file.mjs
// does), and no row/file may carry the words FIXTURE or SYNTHETIC anywhere a real filing would not.
//
// EXIT CODES: 0 = every row passes (safe to hand to write-statutory.mjs --apply). 1 = at least one
// violation (every violation printed by name, never silently dropped). 2 = could not read/parse the file.
// SAFE BY CONSTRUCTION: this script never calls the DB and never writes anything, read-only gate.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
// ONE PATH, NOT A SECOND DEFINITION. validateSourceBlock/validateRow/validateRowsFile all live in
// src/lib/propagation/statutory-rows.ts (lane M7a FIX, 2026-09-21, the pure home the route's logic.mjs
// and this CLI gate both import from). This file's own residual job is the CLI entrypoint only.
// (imported, not re-exported directly, so main() below can call validateRowsFile() itself.)
import { validateSourceBlock, validateRow, validateRowsFile } from "../../src/lib/propagation/statutory-rows.ts";
export { validateSourceBlock, validateRow, validateRowsFile };

// ── CLI entrypoint, never reached on import ────────────────────────────────────────────────────────────
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: node validate-statutory-rows-file.mjs <path-to-rows-file.json>");
    process.exit(2);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
  } catch (e) {
    console.error(`validate-statutory-rows-file: could not read/parse "${path}": ${e.message}`);
    process.exit(2);
  }
  const violations = validateRowsFile(parsed);
  if (violations.length) {
    console.error(`validate-statutory-rows-file: ${violations.length} violation(s), NOT apply-ready:`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`validate-statutory-rows-file: "${path}" passes, every row carries a real, rated source. Safe to hand to write-statutory.mjs --apply.`);
  process.exit(0);
}

if (IS_MAIN) main();
