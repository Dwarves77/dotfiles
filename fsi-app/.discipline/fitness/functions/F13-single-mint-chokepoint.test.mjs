// Tests for F13 (single mint chokepoint) — the DEMONSTRATED FAILING MODE (dispatch §2).
// Run: node --test fsi-app/.discipline/fitness/functions/F13-single-mint-chokepoint.test.mjs
//
// Fixtures build the trigger string by concatenation so this test file does not itself
// match the rule (it is excluded by enumerate anyway, but belt-and-suspenders).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction, isMintBypass } from './F13-single-mint-chokepoint.mjs';

const FROM = '.from("intelligence_items")';
const INSERT = '.insert(seedRow)';

// RED: a direct INSERT into intelligence_items outside the chokepoint is caught.
test('F13: FAIL — direct single-line INSERT into intelligence_items (simulated bypass)', () => {
  const bypass = `await supabase${FROM}${INSERT}.select("id").single();`;
  const v = fitnessFunction.check('fsi-app/src/app/api/worker/some-route/route.ts', bypass);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /mintIntelligenceItem/);
});

// RED: the wrapped form (from() and insert() on separate lines) is also caught.
test('F13: FAIL — wrapped INSERT (from + insert across lines)', () => {
  const bypass = `  await supabase\n    ${FROM}\n    ${INSERT}\n    .select("id");`;
  const v = fitnessFunction.check('fsi-app/src/lib/some/mint.ts', bypass);
  assert.equal(v.length, 1);
});

// GREEN: reads/updates/deletes on intelligence_items are not mints — not flagged.
test('F13: PASS — select/update on intelligence_items is not an INSERT', () => {
  const clean = `await sb${FROM}.select("id");\nawait sb${FROM}.update({ status: "x" }).eq("id", id);`;
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', clean), []);
});

// GREEN: going through the chokepoint (no direct INSERT) is not flagged.
test('F13: PASS — a caller that routes through mintIntelligenceItem()', () => {
  const clean = `const res = await mintIntelligenceItem(supabase, { seed, origin: "first_fetch" });`;
  assert.deepEqual(fitnessFunction.check('fsi-app/src/app/api/worker/drain-first-fetch/route.ts', clean), []);
});

// GREEN: the chokepoint file itself is exempt (it IS the sanctioned INSERT site).
test('F13: PASS — the chokepoint file is exempt', () => {
  const chokepointInsert = `await sb${FROM}${INSERT}.select("id").single();`;
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/intake/mint-item.ts', chokepointInsert), []);
});

// GREEN: override comment suppresses (escape hatch, must carry a reason).
test('F13: PASS — override comment', () => {
  const bypass = `await supabase${FROM}${INSERT}; // fitness-allow: F13 (one-shot backfill migration script)`;
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', bypass), []);
});

// enumerate excludes the chokepoint + tests.
test('F13: enumerate excludes the chokepoint and test files', () => {
  const files = fitnessFunction.enumerate();
  assert.equal(files.includes('fsi-app/src/lib/intake/mint-item.ts'), false);
  for (const f of files) {
    assert.equal(/\.test\.(ts|tsx|mjs)$/.test(f), false, `enumerate should not return test files; got ${f}`);
    assert.equal(f.includes('/__tests__/'), false, `enumerate should not return __tests__ files; got ${f}`);
  }
});

test('F13: isMintBypass helper is direct-usable and metadata present', () => {
  assert.equal(isMintBypass(`x${FROM}${INSERT}`).length, 1);
  assert.equal(fitnessFunction.id, 'F13');
});
