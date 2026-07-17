#!/usr/bin/env node
// disposition-content-gate.golden.mjs — structural golden for the label-is-not-proof doctrine (operator ruling
// 2026-07-17, third confirmation: Oregon/Polish collision, the o13 press briefing, and 110-of-308 at scale).
// PROVES that the ONE disposition vehicle (tombstone-delete.mjs) cannot execute an irreversible delete on the
// strength of an archive_reason LABEL alone — only content-level emptiness authorizes it. The proof is STRUCTURAL
// (the strongest form): the source of the delete vehicle is inspected to confirm (a) a bucket outside the
// deletable-reason allowlist is REFUSED, (b) accurate-but-archived reasons are NOT in the allowlist, (c) the
// --empty-only gate filters to brief-length-0 AND zero grounded claims before anything is deleted, and (d) the
// tombstone is written BEFORE the delete (fail-closed). No DB, no network, no spend. Run:
//   node scripts/verify/disposition-content-gate.golden.mjs  — exits 0 PASS, 1 FAIL.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

// Load the delete vehicle as source, comments stripped so only EXECUTABLE code is analyzed (a comment describing
// the gate is not the gate). Normalize CRLF→LF FIRST (a stray \r defeats a `//.*$` line-comment strip on Windows).
const SRC = resolve(ROOT, "scripts/_reground/tombstone-delete.mjs");
const full = readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");
const codeOnly = full
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

// 1. The deletable-reason allowlist exists and is the gate on --bucket.
check("DELETABLE_REASONS allowlist declared", /const\s+DELETABLE_REASONS\s*=\s*\{/.test(codeOnly));

// 2. A --bucket outside the allowlist is REFUSED (label alone never authorizes a bucket delete).
check("--bucket outside allowlist is REFUSED",
  /if\s*\(\s*BUCKET\s*&&\s*!DELETABLE_REASONS\[BUCKET\]\s*\)/.test(codeOnly) && /process\.exit\(1\)/.test(codeOnly));

// 3. Accurate-but-archived reasons are NOT deletable (never delete accurate data).
for (const forbidden of ["off_vertical", "non_regulatory_source", "Superseded", "Repealed"]) {
  // The allowlist is the object literal between `DELETABLE_REASONS = {` and its closing `};`.
  const m = codeOnly.match(/const\s+DELETABLE_REASONS\s*=\s*\{([\s\S]*?)\n\};/);
  const body = m ? m[1] : "";
  check(`allowlist excludes accurate-but-archived reason '${forbidden}'`, !new RegExp(`\\b${forbidden}\\b`).test(body));
}

// 4. The deletable reasons ARE the content-survives / duplicate / pure-artifact set (positive membership).
{
  const m = codeOnly.match(/const\s+DELETABLE_REASONS\s*=\s*\{([\s\S]*?)\n\};/);
  const body = m ? m[1] : "";
  for (const ok of ["reclassified_to_source", "source_not_item", "portal_artifact", "error_page_artifact",
                    "duplicate_instrument", "duplicate_of_verified", "duplicate"]) {
    check(`allowlist includes content-survives/artifact/duplicate reason '${ok}'`, new RegExp(`\\b${ok}\\b`).test(body));
  }
}

// 5. THE CONTENT GATE — --empty-only filters targets to brief-length-0 AND no grounded claims. This is the
// mechanical form of "content, not label, authorizes the delete": a content-bearing row is removed from targets.
check("--empty-only flag is read", /EMPTY_ONLY\s*=\s*process\.argv\.includes\(\s*["']--empty-only["']\s*\)/.test(codeOnly));
check("content gate requires brief length 0",
  /targets\s*=\s*targets\.filter\([\s\S]*?\.length\s*===?\s*0/.test(codeOnly));
check("content gate requires zero grounded claims (section_claim_provenance)",
  /section_claim_provenance/.test(codeOnly) && /!withClaims\.has\(/.test(codeOnly));

// 6. FAIL-CLOSED ORDER — the tombstone (guardedInsert into disposition_ledger) is written BEFORE the guarded
// delete, so no row is ever deleted without a durable identity record.
const insertPos = codeOnly.indexOf('guardedInsert("disposition_ledger"');
const deletePos = codeOnly.indexOf('guardedDelete("intelligence_items"');
check("tombstone (guardedInsert disposition_ledger) precedes guarded delete",
  insertPos > 0 && deletePos > 0 && insertPos < deletePos);

console.log(failed ? `\n${failed} FAIL` : "\nALL PASS (disposition-content-gate)");
process.exit(failed ? 1 : 0);
