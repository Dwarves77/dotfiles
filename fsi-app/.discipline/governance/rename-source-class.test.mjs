// A rename is classed by its SOURCE path as well as its destination (lane GATE-7, 2026-10-08).
// Run: node --test fsi-app/.discipline/governance/rename-source-class.test.mjs
//
// Attacks from the AUD-AT-3 register: A-P0c-1 (code moved into docs/ read as docs-only, both range forms),
// A-P2b-1 (a script moved out of the CODE directories did not count as code for the memory gate), A-P3-3
// (the same disguise with the heavy steps opted in). `git diff --name-only` lists a rename by its destination
// alone; the classifiers now read `--no-renames`, so the source shows up as a deletion.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { changedFiles, isDocsOnlyDiff } from './docs-only-range.mjs';
import { memoryGateVerdict } from './memory-gate.mjs';
import { gitChangedPaths, gitChangedFiles } from '../lib/change-range.mjs';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'rename-class-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q', '-b', 'master']);
  git(['config', 'user.name', 'T']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'commit.gpgsign', 'false']);
  git(['config', 'core.autocrlf', 'false']);
  const put = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
  return { dir, git, put };
}

const BODY = Array.from({ length: 12 }, (_, i) => `export const value${i} = ${i}; // line ${i} of a script body`).join('\n') + '\n';

test('A-P0c-1: code git-mv-ed into docs/ is not docs-only, in either range form', () => {
  const { dir, git, put } = repo();
  try {
    put('fsi-app/scripts/tool.mjs', BODY);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'base']);
    mkdirSync(join(dir, 'docs'), { recursive: true });
    git(['mv', 'fsi-app/scripts/tool.mjs', 'docs/keep.md']);
    git(['commit', '-q', '-m', 'move']);
    for (const range of ['HEAD~1..HEAD', 'HEAD~1...HEAD']) {
      const files = changedFiles(range, dir);
      assert.deepEqual([...files].sort(), ['docs/keep.md', 'fsi-app/scripts/tool.mjs'], range);
      assert.equal(isDocsOnlyDiff(files), false, range);
    }
    assert.deepEqual(gitChangedFiles('HEAD~1..HEAD', { cwd: dir }), ['docs/keep.md'], 'the shared name-only list still shows the destination alone');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('A-P2b-1: a script moved out of the CODE directories still counts as code for the memory gate', () => {
  const { dir, git, put } = repo();
  try {
    put('fsi-app/scripts/tool.mjs', BODY);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'base']);
    git(['mv', 'fsi-app/scripts/tool.mjs', 'fsi-app/tool.mjs']);
    git(['commit', '-q', '-m', 'move']);
    const verdict = memoryGateVerdict(gitChangedPaths('HEAD~1..HEAD', { cwd: dir }), { range: 'HEAD~1..HEAD' });
    assert.equal(verdict.ok, false);
    const old = memoryGateVerdict(gitChangedFiles('HEAD~1..HEAD', { cwd: dir }), { range: 'HEAD~1..HEAD' });
    assert.equal(old.ok, true, 'the destination-only list is what the gate used to read');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a docs-to-docs rename stays docs-only', () => {
  const { dir, git, put } = repo();
  try {
    put('docs/a.md', 'one\ntwo\nthree\nfour\nfive\nsix\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'base']);
    git(['mv', 'docs/a.md', 'docs/b.md']);
    git(['commit', '-q', '-m', 'move']);
    assert.equal(isDocsOnlyDiff(changedFiles('HEAD~1..HEAD', dir)), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
