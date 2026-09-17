// Red-then-green for F45 (duplicate-code). The gate is a both-ways ratchet on the total duplicated
// normalized lines across fsi-app/src and fsi-app/scripts: above the ceiling fails (new duplication),
// below it fails naming the value to re-seed (an improvement that must be kept). No DB, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLines, detectClones, inScope, scanTree, DUPLICATED_LINES_CEILING, WINDOW, fitnessFunction } from './F45-duplicate-code.mjs';

const body = (tag) => Array.from({ length: 12 }, (_, i) => `const value${i} = compute(${tag}, ${i}) + offset;`).join('\n');

test('normalizeLines: drops blank, comment-only and import lines, collapses whitespace, keeps logic', () => {
  const lines = normalizeLines('import x from "node:fs";\n\n// a comment\n/* block\n comment */\nconst   a =  1;\n  return a + 1;\n');
  assert.deepEqual(lines, ['const a = 1;', 'return a + 1;']);
});

test('detectClones: a 12-line block present in two files is a clone; a distinct file is not', () => {
  const shared = body('"same"');
  const r = detectClones([
    { path: 'a.mjs', content: shared },
    { path: 'b.mjs', content: 'let z = 0;\n' + shared },
    { path: 'c.mjs', content: body('"other"') },
  ]);
  assert.equal(r.clones.length, 1);
  assert.deepEqual([r.clones[0].a, r.clones[0].b], ['a.mjs', 'b.mjs']);
  assert.equal(r.byFile['a.mjs'], 12);
  assert.equal(r.byFile['b.mjs'], 12);
  assert.equal(r.byFile['c.mjs'], undefined);
  assert.equal(r.duplicatedLines, 24);
});

test('detectClones: fewer than WINDOW shared lines is not a clone', () => {
  const short = Array.from({ length: WINDOW - 1 }, (_, i) => `const s${i} = f(${i});`).join('\n');
  const r = detectClones([{ path: 'a.mjs', content: short }, { path: 'b.mjs', content: short }]);
  assert.equal(r.duplicatedLines, 0);
});

test('inScope: tests, fixtures, archive, run artifacts, snapshots and .d.ts are named exclusions; ordinary source is in', () => {
  assert.equal(inScope('fsi-app/src/lib/x.mjs'), true);
  assert.equal(inScope('fsi-app/scripts/turns/y.ts'), true);
  for (const f of ['fsi-app/src/lib/x.test.mjs', 'fsi-app/src/lib/x.npmtest.mjs', 'fsi-app/src/lib/fixtures/x.mjs', 'fsi-app/scripts/_archive/x.mjs', 'fsi-app/scripts/harness-runs/mint/x.mjs', 'fsi-app/scripts/_snapshots/x.mjs', 'fsi-app/src/types.d.ts']) {
    assert.equal(inScope(f), false, f);
  }
});

test('LIVE ratchet: the tree measures exactly the committed ceiling (re-seed DOWN in the commit that removes duplication)', () => {
  const r = scanTree();
  assert.equal(
    r.duplicatedLines,
    DUPLICATED_LINES_CEILING,
    `duplicated lines ${r.duplicatedLines} vs ceiling ${DUPLICATED_LINES_CEILING}. Above: new duplication landed, extract the shared home. Below: set DUPLICATED_LINES_CEILING to ${r.duplicatedLines}.`
  );
  assert.deepEqual(fitnessFunction.check(), []);
});
