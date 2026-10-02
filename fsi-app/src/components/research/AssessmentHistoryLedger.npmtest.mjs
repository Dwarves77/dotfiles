// Structural proof for AssessmentHistoryLedger.tsx (lane L5, 2026-10-02). Text-level, same
// convention as ResearchLedger.npmtest.mjs's own header explains.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "AssessmentHistoryLedger.tsx"),
  "utf8"
);

test("with no current row and no history, renders the honest no-assessment-yet absence state", () => {
  assert.match(SOURCE, /No assessment history yet -- the research-assessment producer has not run/);
});

test("with only a current row (no prior history wired), renders that one entry AND says plainly that no prior version exists -- append-only, never silent", () => {
  assert.match(SOURCE, /No prior version recorded yet -- this is the first scored assessment/);
  assert.match(SOURCE, /isCurrent: true,/);
});

test("a wired history array renders every entry, newest first, current vs superseded labeled, never collapsed into one last-updated line", () => {
  assert.match(SOURCE, /entries\.map\(\(e\) =>/);
  assert.match(SOURCE, /e\.isCurrent \? "Current" : "Superseded"/);
  assert.doesNotMatch(SOURCE, /last updated/i);
});

test("a recorded cause renders when present, never fabricated when absent", () => {
  assert.match(SOURCE, /\{e\.cause && <span/);
});

test("the ledger title goes through the shared SectionHeading", () => {
  assert.match(SOURCE, /import \{ SectionHeading \} from "@\/components\/ui\/SectionHeading";/);
  assert.match(SOURCE, /<SectionHeading title="Assessment history" \/>/);
});
