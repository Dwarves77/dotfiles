// Real-hook proof for the worktree-isolation guard (RD-19), lane GATE-7 (2026-10-08).
// Run: node --test fsi-app/.discipline/governance/worktree-isolation-hooks.test.mjs
//
// Attacks from the AUD-AT-3 register (H1 pre-commit, H3 post-checkout): A-H1-1 (marker 0, false, empty),
// A-H1-2 (marker dropped), A-H1-3 (no node on PATH), A-H1-4 (agent-owned branch names), A-H1-5 (cherry-pick),
// A-H1-6 (merge --no-ff), A-H3-2 (symbolic-ref), A-H3-3 (reset --hard). A throwaway repository whose
// installed hooks are the real trampolines onto copies of the real tracked hooks; every commit below goes
// through git, not through the pure verdict functions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { installHooks } from '../install-hooks.mjs';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const gitIn = (dir, args, env = {}) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
const NO_MARKER = { CLAUDE_CODE_CHILD_SESSION: '' };
const BYPASS = ['-c', 'core.hooksPath=/dev/null']; // history set-up only; never the thing under test

function hookedRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'wt-iso-'));
  execFileSync('git', ['init', '-q', '-b', 'master', dir]);
  for (const [k, v] of [['user.email', 't@example.com'], ['user.name', 'T'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) {
    execFileSync('git', ['-C', dir, 'config', k, v]);
  }
  for (const rel of [
    'fsi-app/.discipline/hooks/pre-commit', 'fsi-app/.discipline/hooks/pre-merge-commit', 'fsi-app/.discipline/hooks/post-commit',
    'fsi-app/.discipline/hooks/reference-transaction', 'fsi-app/.discipline/hooks/lib/main-checkout-guard.sh',
    'fsi-app/.discipline/governance/worktree-isolation-hook.mjs', 'fsi-app/.discipline/governance/worktree-isolation.mjs',
    'fsi-app/.discipline/lib/firing-log.mjs', 'fsi-app/scripts/lib/is-main.mjs',
  ]) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    copyFileSync(join(REPO, rel), join(dir, rel));
  }
  installHooks({ hooksDir: join(dir, '.git', 'hooks'), force: true, log: () => {}, sourceHooksDir: join(dir, 'fsi-app/.discipline/hooks') });
  writeFileSync(join(dir, 'README.md'), 'base\n');
  return dir;
}

function baseHistory(dir) {
  gitIn(dir, [...BYPASS, 'add', '-A']); // the hook files too, so a linked worktree has them
  gitIn(dir, [...BYPASS, 'commit', '-q', '-m', 'base']);
}

test('A-H1-1 / A-H1-2 / A-H1-4: a commit in the MAIN checkout is refused whatever the marker says', () => {
  const dir = hookedRepo();
  try {
    gitIn(dir, ['add', 'README.md']);
    for (const marker of ['0', 'false', '', 'unset']) {
      const env = marker === 'unset' ? { CLAUDE_CODE_CHILD_SESSION: undefined } : { CLAUDE_CODE_CHILD_SESSION: marker };
      const r = gitIn(dir, ['commit', '-q', '-m', 'x'], env);
      assert.notEqual(r.status, 0, `marker ${JSON.stringify(marker)}: ${r.stderr}`);
      assert.match(r.stderr, /WORKTREE-ISOLATION VIOLATION/);
    }
    assert.equal(gitIn(dir, ['rev-parse', '--verify', '-q', 'HEAD']).status, 1, 'nothing was committed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('A-H1-3: with node off the PATH the shell fallback still refuses in the main checkout', () => {
  const dir = hookedRepo();
  try {
    gitIn(dir, ['add', 'README.md']);
    const first = (cmd) => execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
    const sep = process.platform === 'win32' ? ';' : ':';
    const shDir = dirname(first('sh'));
    const PATH = [dirname(first('git')), shDir, join(shDir, '..', '..', 'usr', 'bin')].join(sep);
    const env = { PATH, Path: PATH, CLAUDE_CODE_CHILD_SESSION: '' };
    const nodeVisible = spawnSync('sh', ['-c', 'command -v node'], { env: { ...process.env, ...env }, encoding: 'utf8' }).stdout.trim();
    if (nodeVisible) return; // node sits beside git or sh on this machine: the no-node leg cannot be exercised here
    const r = gitIn(dir, ['commit', '-q', '-m', 'x'], env);
    assert.notEqual(r.status, 0, r.stderr);
    assert.match(r.stderr, /decided in shell/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('A-H1-5 / A-H1-6: a --no-ff merge is refused (pre-merge-commit) and a cherry-pick alarms (post-commit) in the MAIN checkout', () => {
  const dir = hookedRepo();
  try {
    baseHistory(dir);
    gitIn(dir, [...BYPASS, 'checkout', '-q', '-b', 'side']);
    writeFileSync(join(dir, 'side.txt'), 's\n');
    gitIn(dir, [...BYPASS, 'add', 'side.txt']);
    gitIn(dir, [...BYPASS, 'commit', '-q', '-m', 'side']);
    const sideSha = gitIn(dir, ['rev-parse', 'HEAD']).stdout.trim();
    gitIn(dir, [...BYPASS, 'checkout', '-q', 'master']);
    writeFileSync(join(dir, 'main.txt'), 'm\n');
    gitIn(dir, [...BYPASS, 'add', 'main.txt']);
    gitIn(dir, [...BYPASS, 'commit', '-q', '-m', 'main']);

    const merge = gitIn(dir, ['merge', '--no-ff', '-m', 'merge', 'side'], NO_MARKER);
    assert.notEqual(merge.status, 0, merge.stderr);
    assert.match(merge.stderr, /merge commit BLOCKED/);
    gitIn(dir, ['merge', '--abort']);

    const pick = gitIn(dir, ['cherry-pick', sideSha], NO_MARKER);
    assert.match(pick.stderr, /WORKTREE-ISOLATION VIOLATION/, pick.stderr);
    assert.match(pick.stderr, /LANDED|landed|already exists/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('A-H3-2 / A-H3-3: an AGENT context moving HEAD by symbolic-ref or reset --hard in the MAIN checkout raises the alarm; a human does not', () => {
  const dir = hookedRepo();
  const log = join(dir, 'firings.log');
  try {
    baseHistory(dir);
    gitIn(dir, [...BYPASS, 'branch', 'other']);
    writeFileSync(join(dir, 'b.txt'), 'b\n');
    gitIn(dir, [...BYPASS, 'add', 'b.txt']);
    gitIn(dir, [...BYPASS, 'commit', '-q', '-m', 'two']);

    const human = gitIn(dir, ['symbolic-ref', 'HEAD', 'refs/heads/x1'], { ...NO_MARKER, DISCIPLINE_FIRING_LOG: log });
    assert.equal(human.status, 0, human.stderr);
    assert.equal(/WORKTREE-ISOLATION/.test(human.stderr), false);
    gitIn(dir, ['symbolic-ref', 'HEAD', 'refs/heads/master']);

    const agentEnv = { CLAUDE_CODE_CHILD_SESSION: '1', DISCIPLINE_FIRING_LOG: log };
    const sym = gitIn(dir, ['symbolic-ref', 'HEAD', 'refs/heads/x3'], agentEnv);
    assert.match(sym.stderr, /WORKTREE-ISOLATION VIOLATION/, sym.stderr);
    gitIn(dir, ['symbolic-ref', 'HEAD', 'refs/heads/master']);
    const reset = gitIn(dir, ['reset', '--hard', 'other'], agentEnv);
    assert.match(reset.stderr, /WORKTREE-ISOLATION VIOLATION/, reset.stderr);

    assert.ok(existsSync(log), 'the alarms are in the firing log');
    assert.match(readFileSync(log, 'utf8'), /worktree-isolation:reference-transaction/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inside a linked worktree the same commit passes, marker or no marker', () => {
  const dir = hookedRepo();
  const wt = `${dir}-wt`;
  try {
    baseHistory(dir);
    const added = gitIn(dir, [...BYPASS, 'worktree', 'add', '-q', '-b', 'lane/x', wt]);
    assert.equal(added.status, 0, added.stderr);
    writeFileSync(join(wt, 'w.txt'), 'w\n');
    gitIn(wt, ['add', 'w.txt']);
    const r = gitIn(wt, ['commit', '-q', '-m', 'in worktree'], { CLAUDE_CODE_CHILD_SESSION: '1' });
    assert.equal(r.status, 0, r.stderr);
  } finally {
    rmSync(wt, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── post-commit runs the commit rules on a commit that skipped commit-msg (A-H2-11, A-H2-13, A-H2-14) ──
import { readdirSync } from 'node:fs';

function copyTree(dir, relDir, keep) {
  for (const name of readdirSync(join(REPO, relDir), { withFileTypes: true })) {
    if (name.isDirectory()) continue;
    if (!keep(name.name)) continue;
    mkdirSync(join(dir, relDir), { recursive: true });
    copyFileSync(join(REPO, relDir, name.name), join(dir, relDir, name.name));
  }
}

function engineRepo() {
  const dir = hookedRepo();
  const src = (n) => /\.mjs$/.test(n) && !/\.test\.mjs$/.test(n);
  for (const rel of ['fsi-app/.discipline', 'fsi-app/.discipline/lib', 'fsi-app/.discipline/rules', 'fsi-app/.discipline/governance']) copyTree(dir, rel, src);
  return dir;
}

test('A-H2-11 / A-H2-13 / A-H2-14: a cherry-picked commit that violates a rule is flagged by post-commit; an ordinary commit is not re-run', () => {
  const dir = engineRepo();
  const wt = `${dir}-wt`;
  const bad = `const p = '${String.fromCharCode(67)}:/Users/someone/project';\n`;
  try {
    baseHistory(dir);
    gitIn(dir, [...BYPASS, 'branch', 'side']);
    gitIn(dir, [...BYPASS, 'worktree', 'add', '-q', '-b', 'lane/x', wt, 'master']);
    // the violating commit is made on side, with hooks bypassed (a cherry-pick source from elsewhere)
    const sideWt = `${dir}-side`;
    gitIn(dir, [...BYPASS, 'worktree', 'add', '-q', sideWt, 'side']);
    writeFileSync(join(sideWt, 'fsi-app', 'x.mjs'), bad);
    gitIn(sideWt, [...BYPASS, 'add', 'fsi-app/x.mjs']);
    gitIn(sideWt, [...BYPASS, 'commit', '-q', '-m', 'violating']);
    const sha = gitIn(sideWt, ['rev-parse', 'HEAD']).stdout.trim();

    const pick = gitIn(wt, ['cherry-pick', sha], { DISCIPLINE_FIRING_LOG: 'off' });
    assert.match(pick.stderr, /skipped commit-msg/, pick.stderr);
    assert.match(pick.stderr, /FAIL\s+\[012\]/, pick.stderr);
    assert.match(pick.stderr, /commit rules FAILED on the landed commit/);

    // an ordinary commit in the worktree does not trigger the post-commit engine run (commit-msg is not
    // installed in this fixture, so the absence of the run is the point)
    writeFileSync(join(wt, 'ok.txt'), 'ok\n');
    gitIn(wt, ['add', 'ok.txt']);
    const plain = gitIn(wt, ['commit', '-q', '-m', 'plain'], { DISCIPLINE_FIRING_LOG: 'off' });
    assert.doesNotMatch(plain.stderr, /skipped commit-msg/);
    rmSync(sideWt, { recursive: true, force: true });
  } finally {
    rmSync(wt, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});
