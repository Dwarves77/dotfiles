// Run: node --test scripts/maintenance/w1-dispositions.test.mjs — no DB; deps.readDoc injected with a
// small synthetic fixture for the unit tests, and the REAL register document for the one integration
// check that pins the live-document counts (a read-only fs read, not a DB dependency).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  main, parseRegisterTable, classifyDisposition, parseSectionRecommendations,
  parseStatedSplit, buildRegisterReport, REGISTER_DOC_PATH, REQUIRED_ARG,
} from "./w1-dispositions.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// A small fixture reproducing the real document's tricky shapes: row #1's wordplay recommendation cell
// ("DELETE the urgency, WIRE the fix" — real disposition is WIRE, per its own body section), and a
// combined-heading section (### 2–3.) whose one Recommendation sentence covers two summary-table rows.
const FIXTURE = `
## Summary — ratify in one pass

| # | Module | Recommendation | One-line basis |
|---|---|---|---|
| 1 | \`a.mjs\` | **DELETE the urgency, WIRE the fix** — fold in | pun in the cell, real verdict is WIRE |
| 2 | \`b.mjs\` | **HOLD** | waiting on X |
| 3 | \`c.mjs\` | **HOLD** | waiting on X |
| 4 | \`d.mjs\` | **KEEP, no action** | false positive |

**Recommendation split: WIRE 1 · DELETE 0 · HOLD 2 · KEEP-NO-ACTION 1** (4 total)

### 1. \`a.mjs\`
**Recommendation: WIRE.** The real verdict, despite the pun above.

### 2–3. \`b.mjs\`, \`c.mjs\`
**Recommendation: HOLD, both.** Same orchestrator gap.

### 4. \`d.mjs\`
**Recommendation: KEEP, no action.** Golden fixture, not dead code.
`;

test("parseRegisterTable: reads every row, skips header/separator", () => {
  const rows = parseRegisterTable(FIXTURE);
  assert.deepEqual(rows.map((r) => r.num), [1, 2, 3, 4]);
  assert.equal(rows[0].module, "`a.mjs`");
});

test("classifyDisposition: first bold word (fallback only — misreads row #1's pun, by design)", () => {
  assert.equal(classifyDisposition("**DELETE the urgency, WIRE the fix** — fold in"), "DELETE");
  assert.equal(classifyDisposition("**WIRE.**"), "WIRE");
  assert.equal(classifyDisposition("no bold here"), "UNKNOWN");
});

test("parseSectionRecommendations: authoritative per-row verdict, including a combined-heading range", () => {
  const map = parseSectionRecommendations(FIXTURE);
  assert.equal(map.get(1), "WIRE"); // corrects the pun
  assert.equal(map.get(2), "HOLD"); // from the combined 2-3 section
  assert.equal(map.get(3), "HOLD");
  assert.equal(map.get(4), "KEEP");
});

test("buildRegisterReport: groups by the section-authoritative disposition, flags the stated-split mismatch", () => {
  const report = buildRegisterReport(FIXTURE);
  assert.deepEqual(report.computed, { wire: 1, delete: 0, hold: 2, keep_no_action: 1, unknown: 0, total: 4 });
  assert.deepEqual(report.stated, { wire: 1, delete: 0, hold: 2, keep_no_action: 1 });
  assert.equal(report.mismatch, false); // this fixture's split is internally consistent
  assert.deepEqual(report.grouped.WIRE.map((r) => r.num), [1]);
});

test("parseStatedSplit: null when the doc's split sentence isn't found (never guessed)", () => {
  assert.equal(parseStatedSplit("no split line here"), null);
});

test("main dry: reports counts, applies nothing", async () => {
  const r = await main({ mode: "dry" }, { readDoc: () => FIXTURE });
  assert.equal(r.step, "w1-dispositions");
  assert.equal(r.applied, 0);
  assert.deepEqual(r.read_back, {});
  assert.equal(r.exitCode, 0);
  assert.equal(r.wire.length, 1);
});

test("main apply: refused without the exact R-C-accepted arg, applies nothing", async () => {
  const r = await main({ mode: "apply", arg: "" }, { readDoc: () => FIXTURE });
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
});

test("main apply: R-C-accepted unlocks the report, still applies nothing (code change, not a DB write)", async () => {
  const r = await main({ mode: "apply", arg: REQUIRED_ARG }, { readDoc: () => FIXTURE });
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 0);
  assert.match(r.note, /R-C accepted/);
  assert.equal(r.wire.length, 1);
  assert.equal(r.hold.length, 2);
});

test("integration: the real register document (repaired 2026-09-03, ruling R-C) parses to WIRE 8 / DELETE 10 / HOLD 6 / KEEP-NO-ACTION 2 = 26, stated split now agrees with the rows, no mismatch", () => {
  const markdown = readFileSync(resolve(ROOT, REGISTER_DOC_PATH), "utf8");
  const report = buildRegisterReport(markdown);
  assert.deepEqual(report.computed, { wire: 8, delete: 10, hold: 6, keep_no_action: 2, unknown: 0, total: 26 });
  assert.deepEqual(report.stated, { wire: 8, delete: 10, hold: 6, keep_no_action: 2 });
  assert.equal(report.mismatch, false);
  assert.deepEqual(report.grouped.WIRE.map((r) => r.num), [1, 2, 5, 8, 23, 24, 25, 26]);
  assert.deepEqual(report.grouped.DELETE.map((r) => r.num), [3, 6, 7, 9, 10, 12, 18, 19, 20, 21]);
  assert.deepEqual(report.grouped.HOLD.map((r) => r.num), [11, 13, 14, 15, 16, 22]);
  assert.deepEqual(report.grouped.KEEP.map((r) => r.num), [4, 17]);
});
