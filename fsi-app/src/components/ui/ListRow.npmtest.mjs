// Structural regression test for src/components/ui/ListRow.tsx (lane uimapcomm, 2026-09-06).
//
// WHY A TEXT-LEVEL TEST. This repo has no JSX mount infrastructure for a plain `node --test` run
// (the rendering guard's Playwright smoke specs are the real-DOM check, and this file's own
// `endStat` cells are covered live by map-smoke.mjs). This test guards the two SPECIFIC regressions
// a future edit could reintroduce without a browser: (1) the `endStat` extension silently losing its
// "additive, default-undefined" contract — every existing caller (Regulations, Market, Research,
// Operations, Watchlist, Dashboard) passes no `endStat` and must keep rendering the original
// impact/due/timeline/tier four-cell anatomy untouched; (2) the mobile reflow rule disappearing,
// which would reopen the 375px clipping map-smoke.mjs found and fixed this lane.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "ListRow.tsx"),
  "utf8"
);

test("endStat is optional and defaults to the original four-cell anatomy", () => {
  assert.match(SOURCE, /endStat\?:\s*\{[^}]*\}\s*\|\s*null;/, "endStat must be an optional prop (undefined-safe)");
  assert.match(SOURCE, /\{endStat \? \(/, "rendering must branch on endStat rather than always taking the new path");
  // The original four cells must still exist verbatim in the non-endStat branch.
  assert.match(SOURCE, /<ImpactMeter scores=\{impact\} \/>/);
  assert.match(SOURCE, /tier != null \? <TierChip tier=\{tier\} \/> : <Absence reason="not in primary source" \/>/);
});

test("endStat replaces columns 4-7 as one merged band-coloured stat, never a fifth column", () => {
  assert.match(SOURCE, /gridColumn:\s*"4 \/ span 4"/);
});

test("the row reflows (does not scroll) at phone width, per this codebase's established policy", () => {
  assert.match(SOURCE, /@media \(max-width: 640px\)/);
  assert.match(SOURCE, /display:\s*flex\s*!important;\s*flex-wrap:\s*wrap\s*!important/);
  // A bare overflow-x:auto exemption is explicitly NOT the sanctioned fix (globals.css's
  // .cl-row-grid comment) — this row must not reach for it as its mobile strategy.
  assert.doesNotMatch(SOURCE, /overflowX:\s*["']auto["']/);
});

test("the whole row stays the one click target — no second nested Link/button wraps the row", () => {
  const linkMatches = SOURCE.match(/<Link\b/g) || [];
  assert.equal(linkMatches.length, 1, "exactly one <Link> (the full-row overlay) — never a second competing click target");
});
