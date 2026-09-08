// Red-then-green proof for the UX detectors (2026-09-03). Runs in the no-npm node --test suite
// (fsi-app/.discipline/rendering/*.test.mjs glob). The browser runner feeds these SAME functions real
// measurements, so a detector that passes here and fires there cannot disagree with itself.
// Run: node --test fsi-app/.discipline/rendering/ux-assert.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectClippedOverflow,
  detectClippedText,
  detectSmallTargets,
  detectSqueezedTitles,
  assertUxClean,
  boxGap,
  TARGET_MIN_PX,
  TARGET_SMALL_MIN_PX,
  TARGET_CLEARANCE_PX,
  TITLE_MIN_RATIO,
} from './ux-assert.mjs';

const box = (name, x, y, width, height) => ({ name, x, y, width, height });

test('RED: the 2026-09-03 screenshot row — a 40px-wide title on 8 lines inside a 343px card is squeezed', () => {
  const hits = detectSqueezedTitles([{ name: 'p[The Loadstar Supply Chain]', width: 40, containerWidth: 343, lines: 8 }]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].ratio, 0.12);
});

test('GREEN: a long title wrapping at full card width is not squeezed; a one-line short title never is', () => {
  assert.deepEqual(detectSqueezedTitles([{ name: 'a', width: 330, containerWidth: 343, lines: 3 }]), []);
  assert.deepEqual(detectSqueezedTitles([{ name: 'b', width: 22, containerWidth: 343, lines: 1 }]), []);
  // exactly at the ratio passes; one px under fails
  assert.deepEqual(detectSqueezedTitles([{ name: 'c', width: TITLE_MIN_RATIO * 300, containerWidth: 300, lines: 2 }]), []);
  assert.equal(detectSqueezedTitles([{ name: 'd', width: TITLE_MIN_RATIO * 300 - 1, containerWidth: 300, lines: 2 }]).length, 1);
});

test('RED: an 11px-tall year-label button and a 20×20 "···" icon control are below the law-2 floor', () => {
  const hits = detectSmallTargets([box('button[2024]', 0, 0, 30, 11), box('button[···]', 200, 0, 20, 20)]);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].shortAxis, 11);
});

test('RED: a 30px target 4px from a neighbour fails; the same target with 8px clearance passes', () => {
  assert.equal(detectSmallTargets([box('a', 0, 0, 30, 30), box('b', 34, 0, 30, 30)]).length, 2);
  assert.deepEqual(detectSmallTargets([box('a', 0, 0, 30, 30), box('b', 38, 0, 30, 30)]), []);
});

test('GREEN: 44px targets pass at any spacing; a lone 24px target passes; 23px never passes', () => {
  assert.deepEqual(detectSmallTargets([box('a', 0, 0, 44, 44), box('b', 44, 0, 120, 44)]), []);
  assert.deepEqual(detectSmallTargets([box('a', 0, 0, 24, 24)]), []);
  assert.equal(detectSmallTargets([box('a', 0, 0, 23, 23)]).length, 1);
  assert.equal(TARGET_MIN_PX, 44);
  assert.equal(TARGET_SMALL_MIN_PX, 24);
  assert.equal(TARGET_CLEARANCE_PX, 8);
});

test('boxGap: overlapping or touching boxes are 0 apart; separated boxes report the larger axis gap', () => {
  assert.equal(boxGap(box('a', 0, 0, 10, 10), box('b', 5, 5, 10, 10)), 0);
  assert.equal(boxGap(box('a', 0, 0, 10, 10), box('b', 10, 0, 10, 10)), 0);
  assert.equal(boxGap(box('a', 0, 0, 10, 10), box('b', 17, 30, 10, 10)), 20);
});

test('assertUxClean: labelled human-readable lines, empty when clean, tolerant of missing inputs', () => {
  assert.deepEqual(assertUxClean('x', {}), []);
  const f = assertUxClean('market@375', {
    targets: [box('a[Full analysis →]', 0, 0, 120, 30), box('button[+]', 125, 0, 20, 20)],
    titles: [{ name: 'p[title]', width: 40, containerWidth: 343, lines: 8 }],
  });
  assert.equal(f.length, 2);
  assert.match(f[0], /^market@375: 2 interactive target\(s\) below the law-2 floor/);
  assert.match(f[1], /^market@375: 1 title\(s\) squeezed/);
});

test('RED: an element past the right edge with no scrolling ancestor is clipped; inside a strip it is not', () => {
  const hits = detectClippedOverflow([
    { name: 'table[Dimension]', right: 612, viewportWidth: 390, scrollable: false },
    { name: 'a[Compliance deadline]', right: 700, viewportWidth: 390, scrollable: true },
    { name: 'span[EU]', right: 391, viewportWidth: 390, scrollable: false },
  ]);
  assert.deepEqual(hits.map((h) => h.name), ['table[Dimension]']);
  assert.match(assertUxClean('ops@390', { clipped: hits })[0], /clipped past the viewport/);
});

// ── The declared clipping viewport (lane mapclip, 2026-09-08) ─────────────────
// Train 61's PR #610 was red in CI on exactly this geometry: a Leaflet tile whose unclipped rect ran
// 128px past a 1280px viewport inside a 420px map card. The three cases below are the same rule
// attacked from three directions; the browser half (that `inClipViewport` is set only for descendants
// of a declared, actually-clipping, itself-inside-the-viewport ancestor) is proven by the MAP-CLIP
// fixture trio in fixtures.mjs, which run through the real collector at all twelve viewports.

test('GREEN: a box past the right edge INSIDE a declared clipping viewport is carried (the map tile)', () => {
  assert.deepEqual(
    detectClippedOverflow([
      { name: 'img[leaflet-tile leaflet-tile-loaded]', right: 1408, viewportWidth: 1280, scrollable: false, inClipViewport: true },
    ]),
    [],
  );
});

test('RED: the SAME box outside any declared clipping viewport still fails', () => {
  const hits = detectClippedOverflow([
    { name: 'img[leaflet-tile leaflet-tile-loaded]', right: 1408, viewportWidth: 1280, scrollable: false, inClipViewport: false },
  ]);
  assert.equal(hits.length, 1);
  assert.match(assertUxClean('map-page:populated@1280', { clipped: hits })[0], /clipped past the viewport/);
});

test('RED: the declaring element itself past the right edge fails (the attribute never carries itself)', () => {
  // The collector walks from el.parentElement, so a declaring element is never exempted by its own
  // attribute, and it refuses to carry descendants at all while its own right edge is past the edge, so
  // both boxes arrive here with inClipViewport false and both must be reported.
  const hits = detectClippedOverflow([
    { name: 'div[map-canvas]', right: 1408, viewportWidth: 1280, scrollable: false, inClipViewport: false },
    { name: 'img[leaflet-tile]', right: 1500, viewportWidth: 1280, scrollable: false, inClipViewport: false },
  ]);
  assert.deepEqual(hits.map((h) => h.name), ['div[map-canvas]', 'img[leaflet-tile]']);
});

// ── detectClippedText (opsclip, train 61, defects 2 and 6) ────────────────────
// RED: each shape below is one of the five production clippings the operator's own click-through
// found on 2026-09-08. Nothing in the suite failed on any of them before this lane.
test("detectClippedText flags a run clipped horizontally with text-overflow: clip", () => {
  const hits = detectClippedText([
    { name: 'span[IMPACT LOW → H]', overflowX: 25, overflowY: 0, textOverflow: 'clip', clamped: false, inStrip: false },
  ]);
  assert.equal(hits.length, 1);
});

test("detectClippedText flags a run clipped vertically", () => {
  assert.equal(
    detectClippedText([{ name: 'div[meta]', overflowX: 0, overflowY: 14, textOverflow: 'clip', clamped: false, inStrip: false }]).length,
    1,
  );
});

test("detectClippedText passes a run that declares its truncation with an ellipsis", () => {
  assert.deepEqual(
    detectClippedText([{ name: 'span[title…]', overflowX: 40, overflowY: 0, textOverflow: 'ellipsis', clamped: false, inStrip: false }]),
    [],
  );
});

test("detectClippedText passes a line-clamped run (the clamp draws its own ellipsis)", () => {
  assert.deepEqual(
    detectClippedText([{ name: 'p[body]', overflowX: 0, overflowY: 30, textOverflow: 'clip', clamped: true, inStrip: false }]),
    [],
  );
});

test("detectClippedText passes a run inside a declared scrolling strip", () => {
  assert.deepEqual(
    detectClippedText([{ name: 'span[chip]', overflowX: 20, overflowY: 0, textOverflow: 'clip', clamped: false, inStrip: true }]),
    [],
  );
});

test("detectClippedText passes a run that fits, and is total on bad input", () => {
  assert.deepEqual(
    detectClippedText([{ name: 'span[fits]', overflowX: 0, overflowY: 0, textOverflow: 'clip', clamped: false, inStrip: false }]),
    [],
  );
  assert.deepEqual(detectClippedText(null), []);
});

test("detectClippedText holds a column header to fitting outright, ellipsis or not (defect 2)", () => {
  // Production shipped "IMPACT LOW → HIGH" as "IMPACT LOW → H" inside an 88px column with
  // `text-overflow: ellipsis`, so the declared-truncation carve-out above would have excused it.
  // A column header's text is fixed and known at build time; it must fit.
  const hits = detectClippedText([
    { name: 'span[IMPACT LOW → HIGH]', overflowX: 25, overflowY: 0, textOverflow: 'ellipsis', clamped: false, inStrip: false, mustFit: true },
  ]);
  assert.equal(hits.length, 1);
  assert.deepEqual(
    detectClippedText([
      { name: 'span[IMPACT LOW → HIGH]', overflowX: 0, overflowY: 0, textOverflow: 'clip', clamped: false, inStrip: false, mustFit: true },
    ]),
    [],
  );
});
