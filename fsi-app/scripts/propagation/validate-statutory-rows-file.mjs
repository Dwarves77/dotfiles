#!/usr/bin/env node
// validate-statutory-rows-file.mjs — the pre-flight PRODUCTION-APPLY gate for a write-statutory.mjs
// --rows-file. Lane FUELEU-ROWS, 2026-09-06 (audit W3-W4 finding 3: statutory_computations has 0 rows
// because the one rows-file in the tree — scripts/_worklists/statutory-fueleu-annex-iv-2026-09-05.json —
// is self-labeled a non-production FIXTURE and sits at a path propagation-drain.yml does not read).
//
// WHAT THIS CHECKS THAT write-statutory.mjs's OWN parseRow() DOES NOT (that file is not in this lane's
// write set — see fueleu-annex-i-iv-statutory-constants-2026-09-06.json's own header): parseRow() only
// checks STRUCTURAL shape (every field present, targetYear supported) — it has no opinion on whether a
// citation string is a REAL source or a placeholder. This validator is the rule-18 gate ("a figure with a
// source is published with that source's rating; the source is found and rated, never the figure
// refused") applied BEFORE apply, not after: every row must carry a structured `source` block per
// StatutoryInput (url/article/quote/verified_at — the same shape scripts/spec09/lib/rows-file.mjs's
// requireCitation() already established for the other rows-file-driven producers, reused here rather than
// re-invented — no copy of that logic, this file imports classTierForHost the same way rows-file.mjs
// does), and no row/file may carry the words FIXTURE or SYNTHETIC anywhere a real filing would not.
//
// EXIT CODES: 0 = every row passes (safe to hand to write-statutory.mjs --apply). 1 = at least one
// violation (every violation printed by name, never silently dropped). 2 = could not read/parse the file.
// SAFE BY CONSTRUCTION: this script never calls the DB and never writes anything — read-only gate.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classTierForHost } from "../../src/lib/sources/host-authority.ts";

const PLACEHOLDER_MARKERS = /\b(FIXTURE|SYNTHETIC|PLACEHOLDER|TODO|TBD|EXAMPLE ONLY)\b/i;
const REQUIRED_SOURCE_FIELDS = ["url", "article", "quote", "verified_at"];
const REQUIRED_INPUT_KEYS = ["ghgIntensityActual", "energyUsedMJ", "consecutiveDeficitYears"];

/** Validate one StatutoryInput's `source` block. Returns a list of violation strings (empty = passes). */
export function validateSourceBlock(source, where) {
  const violations = [];
  if (!source || typeof source !== "object") {
    violations.push(`${where}: missing a \`source\` block ({url, article, quote, verified_at}) — refused, not guessed (rule 18).`);
    return violations;
  }
  for (const field of REQUIRED_SOURCE_FIELDS) {
    if (typeof source[field] !== "string" || !source[field].trim()) {
      violations.push(`${where}.source.${field} is required and must be a non-empty string.`);
    }
  }
  if (typeof source.url === "string" && source.url.trim()) {
    let host;
    try {
      host = new URL(source.url).host.replace(/^www\./, "").toLowerCase();
    } catch {
      violations.push(`${where}.source.url is not a valid absolute URL: "${source.url}"`);
      host = null;
    }
    if (host) {
      const tier = classTierForHost(host);
      if (tier == null) {
        violations.push(
          `${where}.source.url's host "${host}" does not resolve to a codified class in ` +
          `src/lib/sources/host-authority.ts (classTierForHost) — an ambiguous host is worklisted, ` +
          `never guessed a tier (SC-13). A real EU statutory source should resolve to eur-lex.europa.eu ` +
          `(T1) or a europa.eu/gov host (T2, e.g. EMSA's mrv.emsa.europa.eu).`
        );
      }
    }
  }
  return violations;
}

/** Validate one rows-file row (already write-statutory.mjs parseRow()-shaped or raw). Returns violations. */
export function validateRow(row, index) {
  const violations = [];
  const shipKey = String(row?.shipKey ?? `row[${index}]`);
  if (PLACEHOLDER_MARKERS.test(shipKey)) {
    violations.push(`row[${index}] (${shipKey}): shipKey itself carries a placeholder marker — not a real ship key.`);
  }
  for (const key of REQUIRED_INPUT_KEYS) {
    const input = row?.[key];
    const where = `row[${index}] (${shipKey}).${key}`;
    if (!input || typeof input !== "object") {
      violations.push(`${where}: missing.`);
      continue;
    }
    if (typeof input.citation === "string" && PLACEHOLDER_MARKERS.test(input.citation)) {
      violations.push(`${where}.citation carries a placeholder marker ("${input.citation.slice(0, 80)}...") — a real filing's citation names the real source, never a fixture disclaimer.`);
    }
    violations.push(...validateSourceBlock(input.source, where));
  }
  return violations;
}

/** Validate a whole loaded rows-file object ({_file_status?, rows: [...]})  Returns violations. */
export function validateRowsFile(parsed) {
  const violations = [];
  if (typeof parsed?._file_status === "string" && PLACEHOLDER_MARKERS.test(parsed._file_status)) {
    violations.push(`_file_status carries a placeholder marker — this file self-identifies as non-production ("${parsed._file_status.slice(0, 120)}...").`);
  }
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows) || !rows.length) {
    violations.push("no rows[] array (or empty) — refusing to validate an empty file as apply-ready.");
    return violations;
  }
  rows.forEach((row, i) => violations.push(...validateRow(row, i)));
  return violations;
}

// ── CLI entrypoint — never reached on import ────────────────────────────────────────────────────────────
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
    console.error(`validate-statutory-rows-file: ${violations.length} violation(s) — NOT apply-ready:`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`validate-statutory-rows-file: "${path}" passes — every row carries a real, rated source. Safe to hand to write-statutory.mjs --apply.`);
  process.exit(0);
}

if (IS_MAIN) main();
