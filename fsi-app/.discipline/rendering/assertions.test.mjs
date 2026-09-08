// rendering-guard assertion self-test (RENDER-1, 2026-07-11) — runs in the no-npm `node --test`
// discipline suite (portable: node builtins + relative .mjs/.ts only). This is the RED-THEN-GREEN
// proof of the guard's three detectors, and the harness self-test the mission requires: feed each
// detector a defect (must fire) and a fix (must pass). The Playwright runner reuses these SAME
// detectors over real browser measurements, so a green browser run cannot disagree with this proof.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isHorizontalOverflow,
  detectOverflows,
  findPlaceholderLiterals,
  PLACEHOLDER_LITERALS,
  hydrationAgrees,
  isNowIndependent,
  cellExceedsContainer,
  rectsOverlap,
  detectBoundsViolations,
} from "./assertions.mjs";
import {
  buildFixtures,
  markdownToHtml,
  stripSourcesSectionPreFix,
  BRIEF_WITH_SOURCES_ARTIFACT,
} from "./fixtures.mjs";
import { stripSourcesSection } from "../../src/lib/agent/brief-section-strip.mjs";
// The REAL V-07 formatters (extracted JSX-free so this portable suite can import them).
import { stableDateLabel, relativeTimeLabel } from "../../src/components/ui/relative-time-format.ts";

/** Pull visible <th>/<td> cell texts out of the fixture HTML (mirrors the browser text scan). */
function cellTexts(html) {
  const out = [];
  for (const m of html.matchAll(/>([^<>]+)<\/(?:th|td)>/g)) out.push(m[1].trim());
  return out;
}

// ── 1. Overflow detector (the harness self-test: overflowing DOM fails, fitting DOM passes) ─────

test("overflow detector: scrollWidth > clientWidth fires; fitting does not", () => {
  assert.equal(isHorizontalOverflow({ scrollWidth: 1619, clientWidth: 390 }), true); // the PPWR strip
  assert.equal(isHorizontalOverflow({ scrollWidth: 390, clientWidth: 390 }), false);
  assert.equal(isHorizontalOverflow({ scrollWidth: 391, clientWidth: 390 }), false); // 1px tolerance
  assert.equal(isHorizontalOverflow({ scrollWidth: 392, clientWidth: 390 }), true);
});

test("detectOverflows flags overflowing containers and EXCLUDES .leaflet-container", () => {
  const measurements = [
    { name: "body", scrollWidth: 400, clientWidth: 390, className: "" }, // overflow
    { name: "card", scrollWidth: 390, clientWidth: 390, className: "" }, // fits
    { name: "map", scrollWidth: 5000, clientWidth: 390, className: "leaflet-container" }, // excluded
  ];
  const hits = detectOverflows(measurements);
  assert.deepEqual(hits.map((h) => h.name), ["body"]);
  assert.equal(hits[0].overflowBy, 10);
});

// ── 2. Placeholder-literal detector (F-1) — reuses the REAL strip + isPlaceholderText ───────────

test("PLACEHOLDER_LITERALS carries the F-1 header literals (reused SoT, not hand-copied)", () => {
  for (const lit of ["source name", "url", "tier estimate", "why this source matters"]) {
    assert.ok(PLACEHOLDER_LITERALS.includes(lit), `missing literal: ${lit}`);
  }
});

test("F-1 RED: pre-fix strip leaves 'New Sources Identified' → header literals render as cells", () => {
  const rendered = markdownToHtml(stripSourcesSectionPreFix(BRIEF_WITH_SOURCES_ARTIFACT));
  const hits = findPlaceholderLiterals(cellTexts(rendered));
  // The reconstructed pre-fix behaviour renders "Source Name", "URL", "Tier estimate", … verbatim.
  assert.ok(hits.length >= 3, `expected placeholder literals to render, got ${JSON.stringify(hits)}`);
  assert.ok(hits.some((h) => /source name/i.test(h)));
});

test("F-1 GREEN: current stripSourcesSection removes the artifact → no placeholder literals", () => {
  const rendered = markdownToHtml(stripSourcesSection(BRIEF_WITH_SOURCES_ARTIFACT));
  const hits = findPlaceholderLiterals(cellTexts(rendered));
  assert.deepEqual(hits, []);
  assert.ok(!/New Sources Identified/i.test(rendered));
});

// ── 3. Hydration detector (V-07) — uses the REAL formatters ─────────────────────────────────────

test("V-07 GREEN: stableDateLabel (initial-render formatter) is now-independent → hydration agrees", () => {
  const iso = "2026-03-15T12:00:00.000Z";
  assert.equal(isNowIndependent(stableDateLabel, iso), true);
  // Server render and first client render both use stableDateLabel → identical → agree.
  assert.equal(hydrationAgrees(stableDateLabel(iso), stableDateLabel(iso)), true);
});

test("V-07 RED: relativeTimeLabel (pre-fix render formatter) is now-DEPENDENT → hydration mismatch", () => {
  const iso = new Date(1_000_000_000_000 - 30_000).toISOString(); // 30s before the stub's first 'now'
  assert.equal(isNowIndependent(relativeTimeLabel, iso), false);
  // Simulate SSR at instant A and hydration at instant B (different minute/day) with the pre-fix
  // render-time formatter → the two outputs differ → the React #418 mismatch the guard forbids.
  const realNow = Date.now;
  try {
    Date.now = () => 1_000_000_000_000;
    const server = relativeTimeLabel(iso);
    Date.now = () => 1_000_000_000_000 + 2 * 86_400_000;
    const clientFirst = relativeTimeLabel(iso);
    assert.equal(hydrationAgrees(server, clientFirst), false);
  } finally {
    Date.now = realNow;
  }
});

// ── 4. Fixture-set integrity: every RED fixture has a GREEN sibling in its class ─────────────────

test("fixture set: each layout class has a RED (defect) and a GREEN (fix) fixture", () => {
  const fx = buildFixtures();
  assert.ok(fx.length >= 6, `expected the fixture set to cover the classes, got ${fx.length}`);
  // Overflow classes L-1 and L-4 each need a red + a green; F-1 needs a placeholder red + green.
  const reds = fx.filter((f) => f.red);
  assert.ok(reds.some((f) => f.cls === "L-1" && f.expectOverflow));
  assert.ok(reds.some((f) => f.cls === "L-4" && f.expectOverflow));
  assert.ok(reds.some((f) => f.cls === "F-1" && f.expectPlaceholder));
  for (const cls of ["L-1", "L-4", "F-1"]) {
    assert.ok(fx.some((f) => f.cls === cls && !f.red), `class ${cls} lacks a GREEN fixture`);
  }
});

// ── 5. Cell-bounds detector (D1 class) — RED-THEN-GREEN, the ListRow impact-cell defect ──────────
// Reproduces the actual shipped defect at scale: an 88px impact column (grid column 4 of ListRow's
// `3px 56px 1fr 88px 84px 76px 40px 44px`) whose unscored content (30px dashed baseline + gap +
// "UNSCORED" reason) measured wider than the column, so its content box spilled into the DUE
// column's box — never a container-level horizontal scrollbar, so `detectOverflows` alone could
// never have caught it. These are the rects a `getBoundingClientRect()` collection would produce
// pre-fix (RED, content wraps to nothing so the reason renders on one line past the column) and
// post-fix (GREEN, the same content wrapped inside the column per the ImpactMeter/ListRow fix).

const ROW_CONTAINER = { left: 0, top: 0, right: 780, bottom: 56, width: 780, height: 56 };
// Column x-offsets for GRID = "3px 56px 1fr 88px 84px 76px 40px 44px" at a 780px row, gap 14:
// spine 0-3, juris 17-73, title 87-568 (1fr absorbs remainder), impact 582-670, due 684-768, ...
const IMPACT_COLUMN = { left: 582, right: 670 };
const DUE_COLUMN = { left: 684, right: 768 };

test("D1 RED: unscored impact cell (one-line, no containment) bleeds past its 88px column into the DUE cell", () => {
  const impactCellRect = { left: IMPACT_COLUMN.left, top: 19, right: IMPACT_COLUMN.left + 118, bottom: 37, width: 118, height: 18 }; // 118px content in an 88px (582-670) column, painting past the 14px gap and into the DUE column's box (matches the measured production screenshot)
  const dueCellRect = { left: DUE_COLUMN.left, top: 19, right: DUE_COLUMN.right, bottom: 37, width: 84, height: 18 };
  const violations = detectBoundsViolations(ROW_CONTAINER, [
    { name: "cl-row-impact", rect: impactCellRect },
    { name: "cl-row-due", rect: dueCellRect },
  ]);
  assert.ok(violations.length > 0, "expected the oversized impact cell to be flagged");
  assert.ok(violations.some((v) => v.includes("cl-row-impact") && v.includes("cl-row-due")));
});

test("D1 GREEN: unscored impact cell wraps inside its own 88px column — no overlap, no container escape", () => {
  const impactCellRect = { left: IMPACT_COLUMN.left, top: 19, right: IMPACT_COLUMN.right, bottom: 37, width: 88, height: 18 };
  const dueCellRect = { left: DUE_COLUMN.left, top: 19, right: DUE_COLUMN.right, bottom: 37, width: 84, height: 18 };
  const violations = detectBoundsViolations(ROW_CONTAINER, [
    { name: "cl-row-impact", rect: impactCellRect },
    { name: "cl-row-due", rect: dueCellRect },
  ]);
  assert.deepEqual(violations, []);
});

test("cellExceedsContainer / rectsOverlap: unit behaviour at the tolerance boundary", () => {
  const container = { left: 0, top: 0, right: 100, bottom: 20 };
  assert.equal(cellExceedsContainer({ left: 0, top: 0, right: 100, bottom: 20 }, container), false);
  assert.equal(cellExceedsContainer({ left: 0, top: 0, right: 105, bottom: 20 }, container), true);
  assert.equal(rectsOverlap({ left: 0, top: 0, right: 50, bottom: 20 }, { left: 60, top: 0, right: 100, bottom: 20 }), false);
  assert.equal(rectsOverlap({ left: 0, top: 0, right: 50, bottom: 20 }, { left: 40, top: 0, right: 100, bottom: 20 }), true);
});

test("detectBoundsViolations ignores zero-size (unrendered) cells", () => {
  const container = { left: 0, top: 0, right: 100, bottom: 20 };
  const violations = detectBoundsViolations(container, [
    { name: "empty-overflow-slot", rect: { left: 40, top: 0, right: 40, bottom: 0, width: 0, height: 0 } },
    { name: "visible", rect: { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 } },
  ]);
  assert.deepEqual(violations, []);
});
