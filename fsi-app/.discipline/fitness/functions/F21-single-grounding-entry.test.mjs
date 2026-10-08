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
  // a continuation line is a comment only inside an open block comment (B1-26 and B2-26 family: a bare line
  // that starts with an asterisk is code, not JSDoc)
  assert.deepEqual(groundingEntryLines('// groundBrief deletes prior claims first\n/**\n * generateBriefWorkflow note\n */'), []);
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

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

const ROGUE = 'fsi-app/src/lib/x/rogue.mjs';

test('F21 B2-26: an indirect call (0, generateBrief)(x) names the entry point', () => {
  assert.equal(fitnessFunction.check(ROGUE, 'const r = await (0, generateBrief)(sys, usr);').length, 1);
});

test('F21 B2-27: an import alias, then a call of the alias, names the entry point', () => {
  const src = 'import { groundBrief as g } from "./canonical-pipeline";\nawait g(item);';
  assert.equal(fitnessFunction.check(ROGUE, src).length, 1);
});

test('F21 B2-28: a namespace bracket call m["generateBrief"](x) names the entry point', () => {
  assert.equal(fitnessFunction.check(ROGUE, 'const m = await import("./p");\nawait m["generateBrief"](x);').length, 1);
});

test('F21 B2-29: a call split across lines (name, newline, paren) names the entry point', () => {
  assert.equal(fitnessFunction.check(ROGUE, 'await groundBrief\n  (item, pool);').length, 1);
});

test('F21 B2-30 B2-31: scripts and components are enumerated', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.some((f) => f.startsWith('fsi-app/scripts/')), 'scripts');
  assert.ok(files.some((f) => f.startsWith('fsi-app/src/components/')), 'components (.tsx)');
});

test('F21: a forged override marker inside a string is not an override; a string or comment mention is not a call', () => {
  assert.equal(fitnessFunction.check(ROGUE, 'const m = "// fitness-allow: F21 (forged)"; await groundBrief(x);').length, 1);
  assert.deepEqual(fitnessFunction.check(ROGUE, 'const s = "groundBrief is not called here";\n/* groundBrief(x) */'), []);
});

test('F21: every sanctioned path exists, and every sanctioned script still names an entry point (a stale entry is red)', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { getRepoRoot } = await import('../../lib/context.mjs');
  for (const f of SANCTIONED) {
    const abs = join(getRepoRoot(), f);
    assert.ok(existsSync(abs), `${f} exists`);
    if (f.startsWith('fsi-app/scripts/')) assert.ok(groundingEntryLines(readFileSync(abs, 'utf8')).length > 0, `${f} still names an entry point, or its entry is stale`);
  }
});
