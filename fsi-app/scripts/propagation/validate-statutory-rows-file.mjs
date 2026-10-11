#!/usr/bin/env node

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
