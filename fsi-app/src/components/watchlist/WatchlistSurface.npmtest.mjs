// Composition regression test for /watchlist against artboard 11 (lane comp-11, 2026-09-08).
//
// WHY SOURCE TEXT. There is no JSX render harness in this repo (see WatchButton.npmtest.mjs's own
// header); the RENDERED geometry of this page is measured instead by the design-audit spec
// `.discipline/rendering/audit/spec/compose-11-watchlist.json`, which mounts the real component.
// This file locks the things that spec cannot see: that each region is built from the SHARED part
// rather than a page-local copy, and that the regions the operator's 2026-09-07 audit moved have
// not drifted back into the content column.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(here, "WatchlistSurface.tsx"), "utf8");

test("every artboard-11 region is built from a shared part, never a page-local copy", () => {
  for (const [part, from] of [
    ["Masthead", "@/components/ui/Masthead"],
    ["ListRow, ListRowColumnHeader", "@/components/ui/ListRow"],
    ["SectionHeading", "@/components/ui/SectionHeading"],
    ["CardFoot", "@/components/ui/CardFoot"],
    ["StateNote", "@/components/ui/StateNote"],
  ]) {
    assert.ok(
      SRC.includes(`import { ${part} } from "${from}";`),
      `expected the shared import { ${part} } from "${from}"`,
    );
  }
});

test("the rail is Filters, Share with workspace, Legend — in that document order", () => {
  const filters = SRC.indexOf("<FiltersRailCard");
  const share = SRC.indexOf('<RailCard title="Share with workspace"');
  const legend = SRC.indexOf("<LegendRailCard />");
  assert.ok(filters > 0 && share > filters, "Filters rail card must precede Share with workspace");
  assert.ok(legend > share, "Legend rail card must come last");
});

test("no filter control survives in the content column (operator audit 2026-09-07: filters are on the right)", () => {
  // The two shapes the pre-composition page used: native <select>s for Scope/Type, and a
  // FilterChipGroup card for workspace tags, both above the rows.
  assert.doesNotMatch(SRC, /<select/);
  assert.doesNotMatch(SRC, /FilterChipGroup/);
  assert.doesNotMatch(SRC, /FilterChip\b/);
});

test("the column header row uses artboard 11's own labels", () => {
  assert.match(SRC, /<ListRowColumnHeader titleLabel="Title · type · modes" dueLabel="Next date" \/>/);
});

test("the card foot carries the artboard's line and its Browse regulations link", () => {
  // UPDATED, lane counts 2026-09-08 (COUNTS-61): the foot used to read "Watch from any row's ⋯
  // menu", which reads as a control on THIS page. It now names where the menu is. The invariant
  // this test holds is unchanged (the foot points the reader at the two ways to watch something,
  // and carries the Browse link); only the copy it anchors on moved.
  assert.match(SRC, /left="Watch an item from its ⋯ menu on any list page, or the Watch button on a detail page\."/);
  assert.match(SRC, /Browse regulations →/);
});

test("no region on this page claims a 'last visit' the product does not record", () => {
  // COUNTS-61: GET /api/notices applies a fixed 30-day window (its own DEFAULT_WINDOW_DAYS) and no
  // caller sends ?since=. The card used to print "SINCE YOUR LAST VISIT" twice and never a date.
  // Comments are stripped first: this file's own prose explains the defect and would match itself.
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /last visit/i, "no rendered string claims a last visit");
  // The window is stated ONCE, from the instant the feed itself reports, and mounted twice.
  assert.equal(code.split("noticesWindowLabel").length - 1, 3, "one derivation, two mounts");
  assert.match(code, /noticesSince/, "the label is derived from the feed's own since");
});

test("the masthead carries the scope line and the watchlist-scoped command-bar placeholder", () => {
  assert.match(SRC, /watched · personal ·/);
  assert.match(SRC, /shared by the workspace/);
  assert.match(SRC, /placeholder: 'Search your watchlist — or ask "what changed on my watched items\?"'/);
});

test("both changed-since-last-visit regions read the ONE existing notices feed, never a second fetch", () => {
  assert.match(SRC, /import \{ useRecalculationNotices \} from "@\/components\/figures\/NoticesRail"/);
  // One call site feeding both the state-note count and the notices card.
  assert.equal(SRC.split("useRecalculationNotices()").length - 1, 1);
  assert.doesNotMatch(SRC, /fetch\(/);
});

test("a count still loading is never rendered as 0 (a Skeleton stands in, per the build rules)", () => {
  // The notices card renders the Skeleton while `noticesLoading`, and the state-note strip is
  // suppressed entirely rather than announcing "0 items changed".
  assert.match(SRC, /noticesLoading \? \(\s*<SkeletonListRow \/>/);
  assert.match(SRC, /\{!noticesLoading && notices\.length > 0 && \(/);
});
