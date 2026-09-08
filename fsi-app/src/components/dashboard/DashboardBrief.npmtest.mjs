// Structural regression test for src/components/dashboard/DashboardBrief.tsx (audit item 1.1,
// 2026-09-07, operator ruling — CLOSED). The "Due next" card's footer used to read
// "All N immediate" as PLAIN TEXT inside CardFoot's `left` slot — a dead control, clicking it did
// nothing. Verified against this base (grep, this session): no `<a`/`<Link` wrapped that text, and
// no `?band=` query param existed anywhere the Regulations list read.
//
// Fixed by wiring `left` to a `<Link href="/regulations?band=immediate">` — the SAME `?band=`
// contract regulations/page.tsx now reads server-side (list-surface-helpers.ts's
// BAND_FACET_PARAM/bandFromSearchParam; see that file's own npmtest for the contract's own unit
// coverage) — never a second, page-local inline expansion of the Immediate band built here on the
// dashboard.
//
// WHY A TEXT-LEVEL TEST. This repo has no JSX test infrastructure (no .test.tsx anywhere) to mount
// DashboardBrief and click the control. This is the same posture WatchButton.npmtest.mjs already
// takes for its own no-JSX-harness constraint.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "DashboardBrief.tsx"),
  "utf8"
);

test("the 'All N immediate' CardFoot control is wired to /regulations with the Immediate band facet, not plain text", () => {
  // UPDATED (lane opsclip, train 61, defect 5): the anchor itself moved into CardFoot's shared
  // `leftHref` so the sibling foot on the What Changed card could not be built without it. The
  // invariant this test guards is unchanged, the control has a real target built from the shared
  // facet constant, only the part that renders the anchor moved.
  assert.match(
    SOURCE,
    /leftHref=\{`\/regulations\?\$\{BAND_FACET_PARAM\}=immediate`\}/,
    "expected CardFoot leftHref = /regulations?band=immediate built from the shared BAND_FACET_PARAM constant"
  );
});

test("the 'All N changes in the last 7 days' CardFoot control is a real link too (defect 5)", () => {
  // Production shipped this as a bare <span> while its counterpart above was an anchor. Its target
  // is the regulations list ordered newest-first, through the `?sort=` contract that sits beside
  // `?band=` in the same shared helper file.
  assert.match(SOURCE, /All \{formatNumber\(totalChanges\)\} changes in the last 7 days/);
  assert.match(SOURCE, /leftHref=\{`\/regulations\?\$\{SORT_FACET_PARAM\}=newest`\}/);
});

test("DashboardBrief imports BAND_FACET_PARAM from the shared list-surface-helpers contract, not a hardcoded '?band=' string", () => {
  assert.match(
    SOURCE,
    /import\s*\{\s*BAND_FACET_PARAM,\s*SORT_FACET_PARAM\s*\}\s*from\s*["']@\/components\/list-surface\/list-surface-helpers["']/
  );
});

test("no second, page-local inline expansion of the Immediate band was built on the dashboard (dispatch: 'no second inline expansion')", () => {
  // A local inline-expansion implementation would declare its own expanded/open state for the
  // Immediate band specifically (e.g. useState tied to an "immediate" literal) distinct from the
  // pre-existing per-band `expanded` Set the band tiles already use elsewhere on this page. This
  // guards against that regression creeping back in beside the Link fix.
  assert.doesNotMatch(SOURCE, /useState\([^)]*immediate[^)]*\)/i);
});

test("the CardFoot 'left' slot still carries the live immediateTotal count (not a fabricated or hardcoded number)", () => {
  const footBlock = SOURCE.slice(SOURCE.indexOf("<CardFoot"), SOURCE.indexOf("<CardFoot") + 1600);
  assert.match(footBlock, /All \{formatNumber\(immediateTotal\)\} immediate/);
});
