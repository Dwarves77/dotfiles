// guard-assert-containers.test.mjs (lane GATES-2, 2026-10-05): assertGuardClean applies the shared phone-width
// scroll-container rule when a measurement carries a `containerScan`, and stays silent without one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertGuardClean } from './guard-assert.mjs';

const clean = { measurements: [{ name: 'body', className: '', scrollWidth: 375, clientWidth: 375 }], texts: [] };
const scan = (containers) => ({ viewportWidth: 375, containers });
const docC = { name: 'document', kind: 'document', scrollWidth: 375, clientWidth: 375, boxRight: 375, allowed: false };

test('no containerScan (a wide viewport): behaviour is unchanged', () => {
  assert.deepEqual(assertGuardClean('x', clean), []);
});

test('containerScan with only fitting containers is clean', () => {
  assert.deepEqual(assertGuardClean('x', { ...clean, containerScan: scan([docC]) }), []);
});

test('ATTACK: document and body pass but a main scrolls sideways, so the guard fails and names it', () => {
  const failures = assertGuardClean('spec:state@375', {
    ...clean,
    containerScan: scan([docC, { name: 'main', kind: 'main', scrollWidth: 1108, clientWidth: 375, boxRight: 375, allowed: false }]),
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^spec:state@375: 1 scroll container\(s\) overflow at phone width, main:/);
});

test('ATTACK: an overflow-x:auto parent whose inner wrapper overflows fails the guard', () => {
  const failures = assertGuardClean('x', {
    ...clean,
    containerScan: scan([docC, { name: 'div.row', kind: 'scroller', scrollWidth: 900, clientWidth: 340, boxRight: 357, allowed: false }]),
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /div\.row/);
});

test('a declared strip inside a box that fits the screen passes', () => {
  const failures = assertGuardClean('x', {
    ...clean,
    containerScan: scan([docC, { name: 'div[strip]', kind: 'scroller', scrollWidth: 1108, clientWidth: 339, boxRight: 357, allowed: true }]),
  });
  assert.deepEqual(failures, []);
});
