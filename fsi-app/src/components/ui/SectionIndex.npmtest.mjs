// Structural regression test for src/components/ui/SectionIndex.tsx. No JSX render harness exists
// in this repo (see WatchButton.npmtest.mjs's own header for the same constraint), this reads the
// component's source text to guard the contract points lane W10-ActionCard-a and lane PARITY-PARTS
// (2026-09-24) bind: the sticky nav uses the shared style helper, tabs never truncate, and the
// Summary|Full switch is a DOM descendant of the SAME bordered strip card the tabs render in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, "SectionIndex.tsx"), "utf8");
const STYLES_SOURCE = readFileSync(resolve(HERE, "section-index-styles.ts"), "utf8");

test("SectionIndex calls the shared sticky-nav style helper, not a hand-typed style object", () => {
  assert.match(SOURCE, /sectionIndexNavStyle\(\)/);
});

test("sectionIndexNavStyle renders sticky (position: sticky), the README section 0.5 'sticky section index' requirement", () => {
  assert.match(STYLES_SOURCE, /position: "sticky"/);
});

test("tabs never truncate: the tab link's own sizing prop is empty (no maxWidth/ellipsis), the strip itself scrolls", () => {
  assert.match(SOURCE, /<SectionIndexLink[^>]*sizing=\{\{\}\}/);
});

// Operator check 7 (lane PARITY-PARTS, 2026-09-24): "the Summary|Full switch sits inside the index
// bar at the same position on every detail page." [CONFIRMED by the harness, 2026-09-24 local run]:
// the switch previously rendered as a SIBLING of the bordered `[data-guard-strip]` tab-strip card
// (pinned to the outer <nav>'s own right edge), which the harness measured as "switch outside the
// index bar (tab strip)" on every detail route. Fixed by moving `data-guard-strip` to an OUTER
// wrapper that contains both the scrolling tab row and the switch, so the switch is now a real DOM
// descendant of the strip card, not merely visually adjacent to it. This test is the static half of
// that fix (structural containment); the harness's own measurement is the rendered half.
test("the Summary|Full switch renders INSIDE data-guard-strip, not as its sibling", () => {
  const stripStart = SOURCE.indexOf("data-guard-strip");
  assert.notEqual(stripStart, -1, "data-guard-strip must exist");
  // The strip's own JSX element runs from its opening <div ... data-guard-strip ...> to the matching
  // top-level close before the outer <nav> itself closes. Locate the outer nav's closing tag and
  // confirm the switch component call appears BEFORE it (inside the nav) and AFTER the strip's own
  // opening div (inside the strip), i.e. strictly nested, never a sibling positioned after the
  // strip's own closing </div>.
  const switchStart = SOURCE.indexOf("<SummaryDepthSwitch", stripStart);
  assert.notEqual(switchStart, -1, "SummaryDepthSwitch call must exist after data-guard-strip opens");
  const navCloseStart = SOURCE.indexOf("</nav>", stripStart);
  assert.notEqual(navCloseStart, -1);
  assert.ok(switchStart < navCloseStart, "the switch must render before the outer <nav> closes");
  // The strip wrapper itself must close AFTER the switch (proving the switch is a child of the
  // strip, not a sibling that merely precedes the strip's own close).
  // The inner scrolling tab row closes with its own </div> before the switch; the OUTER
  // data-guard-strip wrapper's close is the one immediately preceding </nav>. Find the last </div>
  // before </nav> and confirm it comes after switchStart.
  const beforeNavClose = SOURCE.slice(stripStart, navCloseStart);
  const lastDivClose = beforeNavClose.lastIndexOf("</div>");
  assert.notEqual(lastDivClose, -1);
  const lastDivCloseAbsolute = stripStart + lastDivClose;
  assert.ok(lastDivCloseAbsolute > switchStart, "the strip's own closing </div> must come after the switch, proving the switch is nested inside it");
});
