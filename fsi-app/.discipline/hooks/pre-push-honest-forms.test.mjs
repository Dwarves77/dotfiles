// Pre-push honest forms (lane GATE-7, 2026-10-08). Run: node --test fsi-app/.discipline/hooks/pre-push-honest-forms.test.mjs
//
// A-P0-3: the tracked hook file edited in the working tree and never committed (the hook that runs is the
// working-tree copy). A-P1-2: an untracked file under hooks/lib/ (gate-adjacent). The real tracked hook is
// run with the trampoline variable set, inside a throwaway repository that carries copies of the hook files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, appendFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const HOOKS = 'fsi-app/.discipline/hooks';

function hookRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'prepush-honest-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q', '-b', 'master']);
  git(['config', 'user.name', 'T']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'commit.gpgsign', 'false']);
  git(['config', 'core.autocrlf', 'false']);
  for (const rel of [`${HOOKS}/pre-push`, `${HOOKS}/lib/prepush-logdir.sh`, `${HOOKS}/lib/worktree-node-modules.sh`]) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    copyFileSync(join(REPO, rel), join(dir, rel));
  }
  // The dependency-link helper is stubbed: the real one repairs links beside the checkout, which a throwaway
  // repository must never trigger. The stub stops the hook at step 0b with a known message.
  writeFileSync(join(dir, `${HOOKS}/lib/worktree-node-modules.sh`), ['wt_nm_ensure_link() { return 0; }', 'wt_nm_require() { echo "stub: stop at 0b" >&2; return 1; }', ''].join('\n'));
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'base']);
  return { dir, git };
}

function runHook(dir) {
  const r = spawnSync('sh', [join(dir, HOOKS, 'pre-push')], {
    cwd: dir, encoding: 'utf8', input: '', env: { ...process.env, DISCIPLINE_HOOK_TRAMPOLINE: '1' },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test('A-P0-3: a tracked hook edited and not committed refuses the push at step 0d, naming the file and the diff', () => {
  const { dir } = hookRepo();
  try {
    appendFileSync(join(dir, HOOKS, 'pre-push'), '\n# exit 0 injected\n');
    const r = runHook(dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /STEP 0d FAIL/);
    assert.match(r.out, /fsi-app\/\.discipline\/hooks\/pre-push/);
    assert.match(r.out, /exit 0 injected/, 'the diff is printed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('control: the same hook committed is not refused at step 0d', () => {
  const { dir, git } = hookRepo();
  try {
    appendFileSync(join(dir, HOOKS, 'pre-push'), '\n# committed change\n');
    git(['commit', '-q', '-am', 'hook change']);
    const r = runHook(dir);
    assert.doesNotMatch(r.out, /STEP 0d FAIL/, r.out);
    assert.match(r.out, /STEP 0b FAIL/, 'the hook went on to step 0b');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the hook source lists hooks/ and lib/ in the untracked-critical step and runs step 0d before step 0b', () => {
  const src = readFileSync(join(REPO, HOOKS, 'pre-push'), 'utf8');
  assert.match(src, /'fsi-app\/\.discipline\/hooks\/' \\/);
  assert.match(src, /'fsi-app\/\.discipline\/lib\/' \\/);
  assert.ok(src.indexOf('Step 0d:') < src.indexOf('Step 0b:'), '0d is checked first');
  assert.ok(readdirSync(join(REPO, HOOKS)).includes('pre-push'));
});
