import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectBiasChipsForDisplay } from './chip-selection.mjs';

// Regression: hotfix 2026-05-22 (bias-chip unbounded stacking on Dashboard).
// The DB unique constraint on source_bias_tags caps a source at ~22 tags
// (full vocabulary) and in practice regulators carry 5-7. Five dashboard
// items with similar regulator sources visually stacked to 25-35 chips per
// page and overflowed the viewport. The bounded display + overflow indicator
// is the contract this suite locks in.

test('returns all tags when count <= maxChips', () => {
  const tags = [
    { dimension: 'funding', tag: 'government-funded', confidence: 0.95 },
    { dimension: 'methodology', tag: 'standards-defining', confidence: 0.9 },
  ];
  const r = selectBiasChipsForDisplay(tags, 3);
  assert.equal(r.displayed.length, 2);
  assert.equal(r.remaining, 0);
});

test('caps display at maxChips and reports remaining', () => {
  const tags = Array.from({ length: 7 }, (_, i) => ({
    dimension: 'funding',
    tag: `t${i}`,
    confidence: 0.5 + i * 0.05,
  }));
  const r = selectBiasChipsForDisplay(tags, 3);
  assert.equal(r.displayed.length, 3);
  assert.equal(r.remaining, 4);
});

test('sorts by confidence desc so highest-confidence tags survive the cap', () => {
  const tags = [
    { dimension: 'funding', tag: 'low', confidence: 0.4 },
    { dimension: 'funding', tag: 'high', confidence: 0.95 },
    { dimension: 'funding', tag: 'mid', confidence: 0.7 },
    { dimension: 'funding', tag: 'lowest', confidence: 0.1 },
  ];
  const r = selectBiasChipsForDisplay(tags, 2);
  assert.equal(r.displayed.length, 2);
  assert.equal(r.displayed[0].tag, 'high');
  assert.equal(r.displayed[1].tag, 'mid');
  assert.equal(r.remaining, 2);
});

test('handles undefined / non-positive maxChips by returning all', () => {
  const tags = [
    { dimension: 'funding', tag: 'a', confidence: 0.9 },
    { dimension: 'methodology', tag: 'b', confidence: 0.8 },
  ];
  assert.equal(selectBiasChipsForDisplay(tags, undefined).displayed.length, 2);
  assert.equal(selectBiasChipsForDisplay(tags, 0).displayed.length, 2);
  assert.equal(selectBiasChipsForDisplay(tags, -1).displayed.length, 2);
});

test('handles missing or null confidence (treats as lowest priority)', () => {
  const tags = [
    { dimension: 'funding', tag: 'has-conf', confidence: 0.5 },
    { dimension: 'methodology', tag: 'null-conf', confidence: null },
    { dimension: 'stakeholder', tag: 'no-conf' },
  ];
  const r = selectBiasChipsForDisplay(tags, 2);
  assert.equal(r.displayed[0].tag, 'has-conf');
  assert.equal(r.remaining, 1);
});

test('empty / non-array input returns empty displayed and 0 remaining', () => {
  assert.deepEqual(selectBiasChipsForDisplay([], 3), { displayed: [], remaining: 0 });
  assert.deepEqual(selectBiasChipsForDisplay(null, 3), { displayed: [], remaining: 0 });
  assert.deepEqual(selectBiasChipsForDisplay(undefined, 3), { displayed: [], remaining: 0 });
});

test('regression: 5 items each with 7 tags do not exceed N chips per item when bounded', () => {
  // Simulates the Dashboard scenario: 5 top-priority items, each from a
  // regulator-class source with 7 (dim, tag) pairs. Bounded at 3 per item.
  const oneItemTags = Array.from({ length: 7 }, (_, i) => ({
    dimension: i % 3 === 0 ? 'funding' : i % 3 === 1 ? 'methodology' : 'stakeholder',
    tag: `tag-${i}`,
    confidence: 0.8 - i * 0.05,
  }));
  for (let item = 0; item < 5; item += 1) {
    const r = selectBiasChipsForDisplay(oneItemTags, 3);
    assert.ok(r.displayed.length <= 3, `item ${item}: ${r.displayed.length} chips exceeded cap`);
    assert.equal(r.remaining, 4);
  }
});

test('stable order across two calls with the same input (no Math.random / Date.now)', () => {
  const tags = [
    { dimension: 'funding', tag: 'a', confidence: 0.7 },
    { dimension: 'methodology', tag: 'b', confidence: 0.7 },
    { dimension: 'stakeholder', tag: 'c', confidence: 0.7 },
  ];
  const r1 = selectBiasChipsForDisplay(tags, 2);
  const r2 = selectBiasChipsForDisplay(tags, 2);
  assert.deepEqual(
    r1.displayed.map((t) => t.tag),
    r2.displayed.map((t) => t.tag),
  );
});
