// Structural regression test for src/components/operations/RegionDimensionMatrix.tsx (DEFECT-FIX
// item 3.3, 2026-09-07). No JSX render harness exists in this repo (see WatchButton.npmtest.mjs's
// own header for the same constraint) — this reads the component's source text to guard the
// contract point the audit named: an empty cell (no sourced facts) renders the shared `Absence`
// convention, never a bare "no data" text span and never a blank.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "RegionDimensionMatrix.tsx"),
  "utf8"
);

test("imports the shared Absence part rather than a bare text span", () => {
  assert.match(SOURCE, /from "@\/components\/ui\/Absence"/);
});

test("both empty-cell branches (desktop table cell, mobile card summary) render <Absence>, never the old '— no data' / 'no data' literal", () => {
  const matches = SOURCE.match(/<Absence reason="not in primary source" \/>/g) ?? [];
  assert.equal(matches.length, 2, "one in the desktop <td> branch, one in the mobile card branch");
  assert.doesNotMatch(SOURCE, />\s*—\s*no data\s*</, "no bare em-dash 'no data' text node survives");
  assert.doesNotMatch(SOURCE, />\s*no data\s*</, "no bare 'no data' text node survives");
});

// ── Defect D4 (lane HYDRATION-59, 2026-09-07) ──────────────────────────────────────────────────
// The "N linked regulations" figure under each region column is derived from OperationsLedger's
// PROGRESSIVELY LOADED row set (a first server page of LIST_FIRST_PAGE_SIZE rows, then an
// after-paint remainder fetch). Published mid-flight it is a wrong number that changes under the
// reader — the "27 -> 777 on click" the clickthrough audit recorded (the count does not depend on
// the selected base region at all; `orderRegions` only reorders columns and `coverageByRegion` is
// keyed by region, both asserted below). While the row set is incomplete the line must say it is
// counting, never name a figure — README §0.6's own rule for a count still loading.

// FOLD-59 (2026-09-08): the INVARIANT is unchanged and is what this test still enforces — BOTH
// branches are gated on the pending flag, and each one NAMES the loading state instead of printing
// a figure. What changed is the desktop branch's copy. comp-08 rebuilt that branch as artboard
// 08/id="p8"'s compact one-line column subhead ("2/5 sourced · 778 regs"), where the mobile card's
// full "counting linked regulations…" sentence does not fit; it says "counting regs…" in the same
// slot the figure would occupy. Matching either phrasing keeps the rule (never a figure mid-flight)
// without pinning copy the artboard itself sets differently in the two places.
test("D4: both 'linked regulations' branches are gated on the pending flag", () => {
  const gated = SOURCE.match(/crossRefCountsPending \?/g) ?? [];
  assert.equal(gated.length, 2, "one in the desktop <th> branch, one in the mobile card branch");
  const pendingText = SOURCE.match(/counting (?:linked regulations|regs)/g) ?? [];
  assert.equal(pendingText.length, 2, "each branch names the loading state rather than a number");
});

test("D4: the count is keyed by region, so column reordering cannot change it", () => {
  assert.match(
    SOURCE,
    /const coverageByRegion = Object\.fromEntries\(grid\.regionCoverage\.map\(\(r: any\) => \[r\.regionKey, r\]\)\)/,
    "counts are looked up by regionKey, never by column position",
  );
  assert.match(SOURCE, /orderRegions\(regions\.map\(\(r\) => r\.key\), baseRegion\)/);
});

test("D4: the wide table keeps a scroll container AND a visible affordance", () => {
  assert.match(SOURCE, /className="cl-ops-matrix-table cl-ops-matrix-scroll"/);
  assert.match(SOURCE, /\.cl-ops-matrix-scroll \{[\s\S]*overflow-x: auto/, "the scroll container survives");
  assert.match(SOURCE, /scrollbar-gutter: stable/, "the scrollbar is present before the pointer arrives");
  assert.match(SOURCE, /background-attachment: local, local, scroll, scroll/, "edge scroll shadows say there is more table");
});
