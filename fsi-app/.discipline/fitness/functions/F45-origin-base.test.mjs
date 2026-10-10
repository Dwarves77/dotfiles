// F45's ratchet against a REAL origin/master base (lane TESTS-1, 2026-10-09; AUD-AT-4 line 458: "measureAtBase against
// a real origin/master base was not run (no remote in the throwaway repo)").
// The fixture is a bare origin repository and a clone of it, both under the OS temp directory (local paths only, no
// network). resolveRange runs with an empty env so a CI pull-request environment (BASE_REF/PR_HEAD) cannot redirect it.
//
// Attack: master ADVANCES after the feature branch forks, and the advance adds duplication of its own. A ratchet that
// compared the branch to the origin/master TIP would absorb that duplication and pass a branch that adds its own; the
// merge-base comparison must still call it a REGRESSION. The control is a branch that adds none.
//
// Run: node --test fsi-app/.discipline/fitness/functions/F45-origin-base.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveRange } from '../../lib/change-range.mjs';
import { measureAtBase, evaluateRatchet } from './F45-duplicate-code.mjs';

const block = (tag) => Array.from({ length: 12 }, (_, i) => `const ${tag}${i} = compute${tag}(${i}) + offset;`).join('\n') + '\n';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'f45-origin-'));
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  const other = join(root, 'other');
  const run = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const ident = (cwd) => {
    run(cwd, ['config', 'user.email', 'f45-origin@test.local']);
    run(cwd, ['config', 'user.name', 'f45-origin']);
    run(cwd, ['config', 'commit.gpgsign', 'false']);
  };
  const put = (cwd, rel, content) => {
    mkdirSync(join(cwd, 'fsi-app', 'src'), { recursive: true });
    writeFileSync(join(cwd, 'fsi-app', 'src', rel), content);
  };
  mkdirSync(origin, { recursive: true });
  run(origin, ['init', '-q', '--bare', '-b', 'master']);
  run(root, ['clone', '-q', origin, work]);
  ident(work);
  run(work, ['checkout', '-q', '-b', 'master']);
  put(work, 'a.mjs', block('Alpha'));
  put(work, 'b.mjs', block('Beta'));
  run(work, ['add', '.']);
  run(work, ['commit', '-q', '-m', 'base: two distinct blocks, no duplication']);
  run(work, ['push', '-q', 'origin', 'master']);
  return { root, origin, work, other, run, ident, put };
}

test('F45 against a real origin/master: the base is the merge-base, not the tip, so master absorbing duplication cannot hide a branch regression', () => {
  const t = setup();
  try {
    const { run, work, other } = t;
    const baseSha = run(work, ['rev-parse', 'HEAD']).trim();

    // The feature branch forks at baseSha and COPIES block Alpha into c.mjs.
    run(work, ['checkout', '-q', '-b', 'feature']);
    t.put(work, 'c.mjs', block('Alpha'));
    run(work, ['add', '.']);
    run(work, ['commit', '-q', '-m', 'feature: copies Alpha into c.mjs']);

    // Meanwhile origin/master moves on: another clone pushes a commit that duplicates block Beta three more times,
    // which is more duplication than the branch adds.
    run(t.root, ['clone', '-q', t.origin, other]);
    t.ident(other);
    t.put(other, 'd.mjs', block('Beta'));
    t.put(other, 'e.mjs', block('Beta'));
    t.put(other, 'f.mjs', block('Beta'));
    run(other, ['add', '.']);
    run(other, ['commit', '-q', '-m', 'master advance: Beta copied three times']);
    run(other, ['push', '-q', 'origin', 'master']);
    run(work, ['fetch', '-q', 'origin']);

    const range = resolveRange({ env: {}, cwd: work });
    assert.equal(range.source, 'local-merge-base', `resolveRange resolves a merge-base against the real origin/master ref (got ${JSON.stringify(range)})`);
    assert.equal(range.base, baseSha, 'the base is the fork point, not the advanced origin/master tip');
    assert.notEqual(range.base, run(work, ['rev-parse', 'origin/master']).trim());

    const baseMeasure = measureAtBase(range.base, { cwd: work });
    const tipMeasure = measureAtBase('origin/master', { cwd: work });
    assert.equal(baseMeasure.duplicatedLines, 0, 'the fork point carries no duplication');
    assert.ok(tipMeasure.duplicatedLines > 0, 'the advanced tip carries duplication of its own');

    const head = measureAtBase('feature', { cwd: work });
    assert.ok(head.duplicatedLines > 0, 'the feature branch added duplication');
    const verdict = evaluateRatchet(head, baseMeasure);
    assert.equal(verdict.length, 1, 'against the merge-base the branch is a REGRESSION');
    assert.match(JSON.stringify(verdict[0]), /REGRESSION/);
    // The attack a tip-comparing ratchet would lose to: against the tip the same branch passes.
    assert.deepEqual(evaluateRatchet(head, tipMeasure), [], 'against the tip the branch would pass, which is why the tip must never be the base');
  } finally { rmSync(t.root, { recursive: true, force: true }); }
});

test('F45 against a real origin/master: a branch that adds no duplication passes the merge-base ratchet', () => {
  const t = setup();
  try {
    const { run, work } = t;
    run(work, ['checkout', '-q', '-b', 'clean']);
    t.put(work, 'c.mjs', block('Gamma'));
    run(work, ['add', '.']);
    run(work, ['commit', '-q', '-m', 'clean: a new distinct block']);
    const range = resolveRange({ env: {}, cwd: work });
    assert.equal(range.source, 'local-merge-base');
    const baseMeasure = measureAtBase(range.base, { cwd: work });
    const head = measureAtBase('clean', { cwd: work });
    assert.deepEqual(evaluateRatchet(head, baseMeasure), []);
  } finally { rmSync(t.root, { recursive: true, force: true }); }
});

test('F45 with no origin/master ref reports the baseline unavailable instead of throwing', () => {
  const root = mkdtempSync(join(tmpdir(), 'f45-noorigin-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=x', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: root });
    const range = resolveRange({ env: {}, cwd: root });
    assert.equal(range.source, 'unavailable');
    assert.ok(range.reason);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
