// Red-then-green for F21 single-grounding-entry. Pure fixtures; the live tree is verified green by the runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction, groundingEntryLines, SANCTIONED } from './F21-single-grounding-entry.mjs';

test('F21: RED on a direct generateBriefWorkflow reference outside the sanctioned set', () => {
  const v = fitnessFunction.check('fsi-app/scripts/rogue-runner.mjs',
    'import { generateBriefWorkflow } from "../src/workflows/generate-brief";\nawait start(generateBriefWorkflow, [id]);');
  assert.ok(v.length >= 1, 'expected a violation for the workflow reference');
});

test('F21: RED on a direct groundBrief(/generateBrief( call outside the sanctioned set', () => {
  assert.ok(fitnessFunction.check('fsi-app/src/lib/x/rogue.mjs', 'const r = await groundBrief(item, pool);').length === 1);
  assert.ok(fitnessFunction.check('fsi-app/src/lib/x/rogue.mjs', 'await generateBrief(sys, usr);').length === 1);
});

test('F21: GREEN — sanctioned files may invoke the grounding entry', () => {
  for (const f of SANCTIONED) {
    assert.deepEqual(fitnessFunction.check(f, 'await generateBriefWorkflow(id);\nawait groundBrief(x);'), []);
  }
});

test('F21: GREEN — comments and regenerateBrief() are not calls', () => {
  assert.deepEqual(groundingEntryLines('// groundBrief deletes prior claims first\n * generateBriefWorkflow note'), []);
  assert.deepEqual(groundingEntryLines('async function regenerateBrief() {}\nx.regenerateBrief();'), []);
  assert.deepEqual(groundingEntryLines('const s = "groundBriefImpl";'), []); // identifier, not a call
});

test('F21: GREEN — a // fitness-allow: F21 override suppresses the line', () => {
  assert.deepEqual(groundingEntryLines('await groundBrief(x); // fitness-allow: F21 (one-shot recovery)'), []);
});

test('F21: metadata', () => {
  assert.equal(fitnessFunction.id, 'F21');
  assert.equal(fitnessFunction.name, 'single-grounding-entry');
  assert.equal(typeof fitnessFunction.enumerate, 'function');
});
