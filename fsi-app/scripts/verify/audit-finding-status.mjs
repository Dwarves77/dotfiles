#!/usr/bin/env node
// audit-finding-status.mjs — enforce standing rule 14: every finding in docs/audits/
// carries an explicit verification-status token.
//
// WHY THIS EXISTS (2026-08-09). In one session, eight audit findings were stated to the
// operator as fact and then retracted under verification: a "truncation defect" that was
// real treaty text; a table reported as having no RLS that had RLS enabled; a privilege
// escalation the app already gated; "EUR-Lex is capture-dead" against 645 successful
// captures; a per-item cost estimate off by roughly 10x. None were careless reads — they
// were produced by a read-then-report pass that deferred verification, so hypotheses
// reached the operator wearing the clothes of conclusions. Operator ruling: that is not how
// an audit is run. A rule alone would not hold (this repo's own root-cause finding is "soft
// gates for hard rules"), so the rule gets a gate: this one.
//
// CHECK: in every docs/audits/*.md, each numbered or bulleted FINDING line must carry one of
// [CONFIRMED] / [HYPOTHESIS] / [REFUTED]. Prose, headings, tables, and code blocks are
// ignored — only finding-shaped lines are held to it.
//
// Report-only by default (so the historical backlog does not block work); pass --strict to
// fail the build. Wire strict once the backlog is labeled.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const STRICT = process.argv.includes("--strict");
const HERE = dirname(fileURLToPath(import.meta.url));
const AUDITS = join(HERE, "..", "..", "..", "docs", "audits");

// docs/audits/ is not flat — most dated audits live one level down in their own dated subdirectory
// (docs/audits/wiring-audit-2026-09-04/B1-modules.md, docs/audits/full-read-2026-08-31/L16-disc-B.md,
// etc: see docs/INDEX.md's own audits/ rows). A non-recursive listing (the original implementation)
// silently checked only the top-level .md files — 74 of 101 tracked audit files, leaving every
// subdirectory audit permanently unchecked no matter how many unlabeled findings it carried. Walked
// recursively here (bounded depth is unnecessary: docs/audits/ has no nesting deeper than one level
// today, and a deeper future audit should be checked too, not silently skipped again).
export function listAuditFiles(root) {
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
// The token may carry explanatory text inside the brackets — "[CONFIRMED — pg introspection]"
// — because a bare token invites a rubber-stamp. The METHOD is the point: a CONFIRMED that
// cannot name how it was verified is a HYPOTHESIS wearing a badge.
const STATUS = /\[(CONFIRMED|HYPOTHESIS|REFUTED)\b[^\]]*\]/;

// A "finding line" = a numbered item or a bullet that makes a claim of defect. Heuristic and
// deliberately narrow: it must start as a list item AND contain a defect-ish marker. Prose
// bullets (context, method notes) are not findings and are not held to the rule.
const LIST = /^\s{0,3}(?:\d+\.|[-*])\s+/;
const DEFECTY = /\b(bug|defect|broken|fails?|failing|missing|never|unsafe|vulnerab|exposure|escalat|leak|wrong|incorrect|regress|deadlock|bypass|unwired|orphan|drops? (?:the )?error)\b/i;

// CLI body guarded (lane W71-A, 2026-09-05): this file is now also `import`ed as a library, by its own
// test (listAuditFiles) and by run-test-suite.sh's real wiring line — without this guard, either import
// ran the full scan and called process.exit() at MODULE LOAD, killing the importing process before its
// own code (a test runner's other test files, a wrapping script's own exit-code handling) ever got to
// run. Same idiom this repo's other scripts/verify/*.mjs CLIs already use (e.g. defect-signature-scan.mjs,
// no-generic-source-audit.mjs).
if (import.meta.url === `file://${process.argv[1]}`) {
  let files = [];
  try { files = listAuditFiles(AUDITS); }
  catch { console.log("audit-finding-status: no docs/audits directory; nothing to check."); process.exit(0); }

  let unlabeled = 0, checked = 0;
  const offenders = [];
  for (const f of files) {
    const text = readFileSync(join(AUDITS, f), "utf8");
    let inFence = false;
    text.split(/\r?\n/).forEach((line, idx) => {
      if (/^\s*```/.test(line)) { inFence = !inFence; return; }
      if (inFence) return;
      if (line.trim().startsWith("|")) return;          // tables carry their own status column
      if (!LIST.test(line) || !DEFECTY.test(line)) return;
      checked++;
      if (!STATUS.test(line)) {
        unlabeled++;
        if (offenders.length < 25) offenders.push(`${f}:${idx + 1}: ${line.trim().slice(0, 96)}`);
      }
    });
  }

  console.log(`audit-finding-status: ${checked} finding-shaped lines across ${files.length} audit file(s); ${unlabeled} unlabeled.`);
  if (unlabeled) {
    console.log("\nEach line below states a defect without a verification status (rule 14).");
    console.log("Add [CONFIRMED] (re-verified live / by repro), [HYPOTHESIS] (read but unverified), or [REFUTED]:\n");
    for (const o of offenders) console.log("  " + o);
    if (offenders.length < unlabeled) console.log(`  … and ${unlabeled - offenders.length} more`);
  }
  process.exit(STRICT && unlabeled ? 1 : 0);
}
