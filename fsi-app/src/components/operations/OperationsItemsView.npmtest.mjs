// Structural regression test for OperationsItemsView.tsx's severity derivation and pill render.
// Coordinator check (2026-10-01): 1,757 live items have NULL severity (the backfill migration is
// retired; severity is set only by regeneration). `deriveSeverity` used to fall through to a
// text/priority heuristic for ANY unmatched severity (including null), ending in a silent "low"
// default and a coloured "LOW" pill, exactly the WRONG DEFAULT this check exists to catch. Fixture
// test: an item shaped like a real null-severity row (`{ severity: null, title: "...", priority:
// "HIGH" }`, matching the 1,757 live rows, with a priority present so the OLD heuristic would have
// classified it as "high" rather than falling through further, proving the null check runs first)
// must render the coordinator's exact needs-phrase instead. Source-text regression, same
// convention as StateNote.npmtest.mjs's own header (no JSX render harness in this repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "OperationsItemsView.tsx"),
  "utf8"
);

test("deriveSeverity checks r.severity == null and returns null BEFORE any text/priority heuristic runs", () => {
  const sevTypeIndex = SOURCE.indexOf("function deriveSeverity(r: Resource): Severity | null {");
  assert.ok(sevTypeIndex > -1, "deriveSeverity must return Severity | null, not a non-null Severity");
  const bucketMatchIndex = SOURCE.indexOf("SEVERITY_TO_OPERATIONS_BUCKET[r.severity]");
  const nullCheckIndex = SOURCE.indexOf("if (r.severity == null) return null;");
  const textHeuristicIndex = SOURCE.indexOf('const text = `${r.title} ${r.note || ""}`.toLowerCase();');
  assert.ok(nullCheckIndex > -1, "the null check must exist");
  // Order: live DB-value match first (unchanged), then the null check, THEN the heuristic. A
  // fixture item with severity: null and priority: "HIGH" present (the case the old "low" default
  // bug could not distinguish from "no priority at all") hits the null check and returns before
  // ever reaching the text/priority heuristic below it.
  assert.ok(sevTypeIndex < bucketMatchIndex, "DB-value bucket match reads first");
  assert.ok(bucketMatchIndex < nullCheckIndex, "the null check comes after the live DB-value match");
  assert.ok(nullCheckIndex < textHeuristicIndex, "the null check runs before the text/priority heuristic, so a fixture with severity: null and priority: \"HIGH\" never reaches it");
});

test("SeverityPill renders the coordinator's exact needs-phrase for a null severity, never a coloured pill", () => {
  assert.match(SOURCE, /function SeverityPill\(\{ severity \}: \{ severity: Severity \| null \}\) \{/);
  assert.match(SOURCE, /if \(severity == null\) \{/);
  assert.match(SOURCE, /<span style=\{ABSENCE_TEXT_STYLE\}>needs regeneration for severity<\/span>/);
});

test("the absence treatment is the shared ui/Absence.tsx type style, not a page-local style object", () => {
  assert.match(SOURCE, /import \{ ABSENCE_TEXT_STYLE \} from "@\/components\/ui\/Absence";/);
});

test("the pre-existing, out-of-scope regex/priority heuristic is unchanged for the separate case of a non-null, non-vocabulary severity value", () => {
  assert.match(SOURCE, /if \(\/\\b\(action required\|immediate\|deadline\|effective \\d\|in force\)\\b\/\.test\(text\)\) return "critical";/);
  assert.match(SOURCE, /if \(r\.priority === "CRITICAL"\) return "critical";/);
  assert.match(SOURCE, /return "low";\n\}/);
});
