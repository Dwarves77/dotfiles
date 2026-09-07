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

// UPDATED (lane uitags, 2026-09-07): the fold assembling train/wave55 carried the operator's
// 2026-09-07 ruling forward — no page gets an ad hoc mobile treatment ahead of the real mobile
// artboards (see this file's own header comment and DEVIATION-LOG.md) — and removed the @media
// mobile-reflow rule this test used to require. The row is desktop-only by design now; a phone-width
// check belongs to the rendering guard's dated per-page exemption entries, not to this file.
test("desktop-only by design: no phone-width @media reflow rule (removed per operator ruling 2026-09-07)", () => {
  assert.doesNotMatch(SOURCE, /@media \(max-width: 640px\)/);
  assert.match(SOURCE, /Desktop-only/);
});

test("the whole row stays the one click target — no second nested Link/button wraps the row", () => {
  const linkMatches = SOURCE.match(/<Link\b/g) || [];
  assert.equal(linkMatches.length, 1, "exactly one <Link> (the full-row overlay) — never a second competing click target");
});

// ── tags (lane uitags, 2026-09-07, README "Workspace tags" / ruling R6) ──
test("tags is an optional prop, additive — every pre-existing caller (no tags passed) is unaffected", () => {
  assert.match(SOURCE, /tags\?:\s*\{\s*id:\s*string;\s*name:\s*string\s*\}\[\]\s*\|\s*null;/);
});
test("tags render on the second line, beside meta — not a fifth grid column", () => {
  assert.match(SOURCE, /tags && tags\.length > 0 && \(/);
  assert.match(SOURCE, /WorkspaceTagPill/);
});
