// Red-then-green for F45 (duplicate-code). The gate is a ratchet against the MERGE-BASE tree, never a
// stored number (plan 6.8, Rule B): HEAD's total duplicated normalized lines across fsi-app/src and
// fsi-app/scripts must not exceed the same measurement taken at origin/master's merge-base. No DB, no
// network (the fixture-proof test below uses a throwaway LOCAL git repo, never a remote).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRepoRoot } from '../../lib/context.mjs';
import { resolveRange } from '../../lib/change-range.mjs';
import {
  normalizeLines, detectClones, inScope, scanTree, ignoredFiles, isIgnored, resetIgnoredCache,
  matchesScopeGlobs, measureAtBase, evaluateRatchet, parseCatFileBatch, WINDOW, fitnessFunction,
} from './F45-duplicate-code.mjs';

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

test('gitignored paths never count (CI parity): a file under an ignored directory entry and an exact ignored path are both excluded', () => {
  const ignored = ['fsi-app/node_modules/', 'fsi-app/src/app/.well-known/workflow/v1/flow/route.js'];
  assert.equal(isIgnored('fsi-app/node_modules/x/index.js', ignored), true);
  assert.equal(isIgnored('fsi-app/src/app/.well-known/workflow/v1/flow/route.js', ignored), true);
  assert.equal(isIgnored('fsi-app/src/app/page.tsx', ignored), false);
  assert.ok(Array.isArray(ignoredFiles()));
});

test('attack: a gitignored duplicate planted under scripts/tmp does not move the live count (CI parity)', () => {
  const before = scanTree().duplicatedLines;
  const dir = join(getRepoRoot(), 'fsi-app', 'scripts', 'tmp');
  mkdirSync(dir, { recursive: true });
  const plant = join(dir, 'f45-attack-plant.mjs');
  writeFileSync(plant, readFileSync(join(getRepoRoot(), 'fsi-app', 'src', 'lib', 'api', 'route-guard.ts'), 'utf8'));
  resetIgnoredCache();
  try {
    assert.equal(isIgnored('fsi-app/scripts/tmp/f45-attack-plant.mjs'), true, 'scripts/tmp must be gitignored for this attack to mean anything');
    assert.equal(scanTree().duplicatedLines, before, 'a gitignored copy of a tracked file must not count');
  } finally {
    rmSync(plant, { force: true });
    resetIgnoredCache();
  }
});

test('evaluateRatchet: HEAD no worse than base yields no violation (equal, and strictly better)', () => {
  const base = { duplicatedLines: 10, clones: [] };
  assert.deepEqual(evaluateRatchet({ duplicatedLines: 10, clones: [] }, base), []);
  assert.deepEqual(evaluateRatchet({ duplicatedLines: 4, clones: [] }, base), []);
});

test('evaluateRatchet: HEAD worse than base is a REGRESSION naming the delta and the changed-file clone pairs first', () => {
  const base = { duplicatedLines: 10, clones: [] };
  const head = {
    duplicatedLines: 18,
    clones: [
      { a: 'fsi-app/src/new-copy.mjs', b: 'fsi-app/src/other.mjs', windows: 5 },
      { a: 'fsi-app/src/unrelated-a.mjs', b: 'fsi-app/src/unrelated-b.mjs', windows: 40 },
    ],
  };
  const problems = evaluateRatchet(head, base, new Set(['fsi-app/src/new-copy.mjs']));
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /REGRESSION: 18 duplicated lines vs base 10 \(\+8\)/);
  assert.match(problems[0].message, /new-copy\.mjs/);
});

test('matchesScopeGlobs: same prefix/extension truth SCOPE_GLOBS states, checkable against a bare path (no filesystem)', () => {
  assert.equal(matchesScopeGlobs('fsi-app/src/lib/x.mjs'), true);
  assert.equal(matchesScopeGlobs('fsi-app/scripts/turns/y.ts'), true);
  assert.equal(matchesScopeGlobs('fsi-app/supabase/migrations/001_x.sql'), false);
  assert.equal(matchesScopeGlobs('docs/plans/x.mjs'), false);
});

test('parseCatFileBatch: order-correlates results with the requested path list, skipping a missing object', () => {
  const objA = 'const a = 1;\n';
  const objB = 'const b = 2;\n';
  const header = (bytes) => `deadbeef blob ${Buffer.byteLength(bytes, 'utf8')}\n`;
  const buf = Buffer.concat([
    Buffer.from(header(objA)), Buffer.from(objA), Buffer.from('\n'),
    Buffer.from('deadbeef:missing.mjs missing\n'),
    Buffer.from(header(objB)), Buffer.from(objB), Buffer.from('\n'),
  ]);
  const entries = parseCatFileBatch(buf, ['a.mjs', 'missing.mjs', 'b.mjs']);
  assert.deepEqual(entries.map((e) => e.path), ['a.mjs', 'b.mjs']);
  assert.equal(entries[0].content, objA);
  assert.equal(entries[1].content, objB);
});

test('measureAtBase: fixture proof (plan 6.8 Rule B) -- two branches each remove a different duplicated block from a shared base merge clean and both pass against their base', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'f45-fixture-'));
  const git = (args, opts = {}) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8', ...opts });
  try {
    git(['init', '-q']);
    git(['config', 'user.email', 'f45-fixture@test.local']);
    git(['config', 'user.name', 'f45-fixture']);
    git(['config', 'commit.gpgsign', 'false']);
    mkdirSync(join(tmp, 'fsi-app', 'src'), { recursive: true });
    const blockA = Array.from({ length: 10 }, (_, i) => `const alpha${i} = computeAlpha(${i});`).join('\n');
    const blockB = Array.from({ length: 10 }, (_, i) => `const beta${i} = computeBeta(${i});`).join('\n');
    const bothBlocks = blockA + '\n' + blockB + '\n';
    writeFileSync(join(tmp, 'fsi-app', 'src', 'x.mjs'), bothBlocks);
    writeFileSync(join(tmp, 'fsi-app', 'src', 'y.mjs'), bothBlocks);
    git(['add', '.']);
    git(['commit', '-q', '-m', 'base: both files carry blockA and blockB, each duplicated']);
    const baseSha = git(['rev-parse', 'HEAD']).trim();

    git(['checkout', '-q', '-b', 'branch-a']);
    const notBlockA = Array.from({ length: 10 }, (_, i) => `const changedAlpha${i} = somethingElse(${i});`).join('\n');
    writeFileSync(join(tmp, 'fsi-app', 'src', 'x.mjs'), notBlockA + '\n' + blockB + '\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'branch-a: de-duplicate blockA (rewrite it only in x.mjs)']);
    const branchASha = git(['rev-parse', 'HEAD']).trim();

    git(['checkout', '-q', baseSha]);
    git(['checkout', '-q', '-b', 'branch-b']);
    const notBlockB = Array.from({ length: 10 }, (_, i) => `const changedBeta${i} = somethingDifferent(${i});`).join('\n');
    writeFileSync(join(tmp, 'fsi-app', 'src', 'y.mjs'), blockA + '\n' + notBlockB + '\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'branch-b: de-duplicate blockB (rewrite it only in y.mjs)']);
    const branchBSha = git(['rev-parse', 'HEAD']).trim();

    const baseMeasure = measureAtBase(baseSha, { cwd: tmp });
    const aMeasure = measureAtBase(branchASha, { cwd: tmp });
    const bMeasure = measureAtBase(branchBSha, { cwd: tmp });

    assert.equal(baseMeasure.duplicatedLines, 40, 'base: blockA + blockB each duplicated across x.mjs and y.mjs (10*2 + 10*2)');
    assert.ok(aMeasure.duplicatedLines < baseMeasure.duplicatedLines, `branch-a ${aMeasure.duplicatedLines} should improve on base ${baseMeasure.duplicatedLines}`);
    assert.ok(bMeasure.duplicatedLines < baseMeasure.duplicatedLines, `branch-b ${bMeasure.duplicatedLines} should improve on base ${baseMeasure.duplicatedLines}`);
    assert.deepEqual(evaluateRatchet(aMeasure, baseMeasure), [], 'branch-a passes against the shared base');
    assert.deepEqual(evaluateRatchet(bMeasure, baseMeasure), [], 'branch-b passes against the shared base');

    // Both branches touch different files (x.mjs vs y.mjs) -- the merge is clean, no conflict.
    git(['checkout', '-q', 'branch-a']);
    git(['merge', '-q', '--no-ff', '-m', 'merge branch-b into branch-a', 'branch-b']);
    const mergedSha = git(['rev-parse', 'HEAD']).trim();
    const mergedMeasure = measureAtBase(mergedSha, { cwd: tmp });
    assert.equal(mergedMeasure.duplicatedLines, 0, 'merged tree: neither block is duplicated any more');
    assert.deepEqual(evaluateRatchet(mergedMeasure, baseMeasure), [], 'the merged tree also passes against the original shared base');

    // Cache hit: measuring the same base a second time must not shell out to git again. Renaming the
    // git repo's own .git directory away and re-measuring proves the second call read the cache, not
    // git (a real git call here would throw, since `tmp` is no longer a working tree).
    const gitDir = join(tmp, '.git');
    const gitDirBak = join(tmp, '.git.bak');
    rmSync(gitDirBak, { recursive: true, force: true });
    execFileSync('mv', [gitDir, gitDirBak]);
    let cachedMeasure;
    try {
      cachedMeasure = measureAtBase(baseSha, { cwd: tmp });
    } finally {
      execFileSync('mv', [gitDirBak, gitDir]);
    }
    assert.deepEqual(cachedMeasure, baseMeasure, 'cache hit must return the same result without touching git');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('LIVE ratchet (plan 6.8 Rule B): HEAD does not exceed the merge-base tree with origin/master', () => {
  const { base, source, reason } = resolveRange({});
  if (source === 'unavailable') {
    console.log(`  (skipped: no merge-base to compare against -- ${reason})`);
    return;
  }
  const head = scanTree();
  const baseMeasure = measureAtBase(base);
  assert.ok(
    head.duplicatedLines <= baseMeasure.duplicatedLines,
    `HEAD ${head.duplicatedLines} duplicated lines exceeds base (${base}) ${baseMeasure.duplicatedLines}: new duplication landed on this branch.`
  );
  assert.deepEqual(fitnessFunction.check(), []);
});
