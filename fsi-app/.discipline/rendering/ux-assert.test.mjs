// Red-then-green proof for the UX detectors (2026-09-03). Runs in the no-npm node --test suite
// (fsi-app/.discipline/rendering/*.test.mjs glob). The browser runner feeds these SAME functions real
// measurements, so a detector that passes here and fires there cannot disagree with itself.
// Run: node --test fsi-app/.discipline/rendering/ux-assert.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
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
