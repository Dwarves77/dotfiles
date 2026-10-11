// The pre-push hook attacked step by step through the REAL hook (lane TESTS-2, 2026-10-10; rewritten by HOOK-1, 2026-10-11 for
// the three-step hook: A the gate and the critical surfaces, B ESLint and unit tests of the changed files, C the memory gate).
//
// What this subsystem owns, and what is attacked here, is the HOOK's side of each step: that a step which fails blocks the push
// (exit 1, naming the step), that no later step runs after it, that a step whose command exits 0 does not block, that a WIP push
// (tip carries a skip token), a deletion and an empty push run only step A, and that the hook logs one line per push to the
// firing log whether it blocks or lets the push through. The gates' own contents are attacked by their own subsystems.
//
// The tracked hook and its libraries are copied byte for byte into a throwaway git repository whose step commands (at the same
// relative paths the hook invokes) are STUBS that fail exactly when their step id is named in the PP_FAIL variable and record
// that they ran. Node built-ins only (the no-npm suite). Throwaway repositories are removed afterwards.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const HOOKS = 'fsi-app/.discipline/hooks';
const ZERO = '0'.repeat(40);

/** [step id as the hook prints it, the stub's own id for PP_FAIL]. In hook order: B runs ESLint, then the tests; C is the memory gate. */
const FINAL_STEPS = [
  ['B', 'lint'],
  ['B', 'tests'],
  ['C', 'memory'],
];

// every stub appends its id to the trace file first: which steps RAN is read from the trace, not from output that the hook
// redirects into a log directory it deletes on success
const NODE_STUB = (id) => `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.PP_TRACE,'${id}' + String.fromCharCode(10));
if ((process.env.PP_FAIL || '').split(',').includes('${id}')) { console.error('stub ${id}: forced failure'); process.exit(1); }
console.log('stub ${id}: ok');
`;

function put(dir, rel, content, mode) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
  if (mode) chmodSync(join(dir, rel), mode);
}

/** `message` is the tip commit's message: a skip token in it makes the push a WIP push. */
function hookRepo(message = 'code change') {
  const dir = mkdtempSync(join(tmpdir(), 'prepush-steps-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-q', '-b', 'master']);
  git(['config', 'user.name', 'T']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'commit.gpgsign', 'false']);
  git(['config', 'core.autocrlf', 'false']);
  // every library the hook sources is copied: a missing one stops the hook
  for (const rel of [`${HOOKS}/pre-push`, `${HOOKS}/lib/prepush-logdir.sh`, `${HOOKS}/lib/final-push-tier.sh`]) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    copyFileSync(join(REPO, rel), join(dir, rel));
  }
  // the dependency-link helper is stubbed: the real one repairs links beside the checkout, which a throwaway repository must not trigger
  put(dir, `${HOOKS}/lib/worktree-node-modules.sh`, 'wt_nm_ensure_link() { return 0; }\nwt_nm_require() { return 0; }\n');
  put(dir, 'fsi-app/.discipline/governance/memory-gate.mjs', NODE_STUB('memory'));
  put(dir, 'fsi-app/.discipline/lib/run-explicit-tests.mjs', NODE_STUB('tests'));
  // B1 runs `npm run lint -- --max-warnings=0 ...` in fsi-app
  put(dir, 'fsi-app/package.json', JSON.stringify({ name: 'stub', private: true, scripts: { lint: 'node lint-stub.mjs' } }));
  put(dir, 'fsi-app/lint-stub.mjs', NODE_STUB('lint'));
  put(dir, '.gitignore', 'node_modules/\nfsi-app/.discipline/governance/.hook-firings.log\n');
  put(dir, 'README.md', 'base\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'base']);
  git(['update-ref', 'refs/remotes/origin/master', 'HEAD']);
  put(dir, 'fsi-app/src/lib/change.ts', 'export const x = 1;\n');
  put(dir, 'fsi-app/scripts/change.test.mjs', 'import "node:test";\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', message]);
  const refs = () => `refs/heads/x ${git(['rev-parse', 'HEAD']).trim()} refs/heads/x ${ZERO}\n`;
  return { dir, git, refs };
}

/** `refs` is git's pre-push stdin (`<local ref> <local sha> <remote ref> <remote sha>`); '' is an empty push, which step 0e classes as no tier. */
function runHook(dir, env = {}, refs = '') {
  const trace = join(dir, '.git', 'pp-trace');
  const e = { ...process.env, DISCIPLINE_HOOK_TRAMPOLINE: '1', PP_FAIL: '', PP_TRACE: trace, ...env };
  for (const k of Object.keys(e)) if (k.startsWith('NODE_TEST')) delete e[k];
  delete e.DISCIPLINE_PREPUSH_FULL;
  const r = spawnSync('sh', [join(dir, HOOKS, 'pre-push')], { cwd: dir, encoding: 'utf8', input: refs, env: e });
  const ran = existsSync(trace) ? readFileSync(trace, 'utf8').split('\n').filter(Boolean) : [];
  const logPath = join(dir, 'fsi-app/.discipline/governance/.hook-firings.log');
  const firings = existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { code: r.status, out: `${r.stdout}${r.stderr}`, ran, firings };
}

const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

test('CONTROL: a final push (no skip token) with every step green exits 0, runs B then C once each in order, and logs one pass line', () => {
  const { dir, refs } = hookRepo();
  try {
    const r = runHook(dir, {}, refs());
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /all checks pass/);
    assert.deepEqual(r.ran, FINAL_STEPS.map(([, id]) => id), 'every step ran, once, in hook order');
    assert.equal(r.firings.length, 1, 'one line for the push');
    assert.equal(r.firings[0].rule, 'pre-push:push');
    assert.equal(r.firings[0].verdict, 'pass');
    assert.match(r.firings[0].line, /tier=final A=ok B=ok\(eslint 2 files, tests 1 files\) C=ok/);
  } finally { cleanup(dir); }
});

for (const [stepId, id] of FINAL_STEPS) {
  test(`ATTACK: step ${stepId} (${id}) failing blocks the push with exit 1, names the step, logs the failure, and no later step runs`, () => {
    const { dir, refs } = hookRepo();
    try {
      const r = runHook(dir, { PP_FAIL: id }, refs());
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, new RegExp(`STEP ${stepId} FAIL`), r.out);
      assert.doesNotMatch(r.out, /all checks pass/);
      const at = FINAL_STEPS.findIndex(([, i]) => i === id);
      assert.deepEqual(r.ran, FINAL_STEPS.slice(0, at + 1).map(([, i]) => i), `exactly the steps up to ${id} ran, none after it`);
      assert.match(r.out, /step logs kept for diagnosis/, 'the log directory is kept when the hook blocks');
      assert.equal(r.firings.length, 1);
      assert.equal(r.firings[0].rule, `pre-push:${stepId}`);
      assert.equal(r.firings[0].verdict, 'fail');
      assert.ok(!r.firings.some((f) => f.verdict === 'pass'), 'a blocked push logs no pass line');
    } finally { cleanup(dir); }
  });
}

test('ATTACK: every step failing at once still exits 1 at the FIRST failing step (the hook is a short-circuit AND)', () => {
  const { dir, refs } = hookRepo();
  try {
    const r = runHook(dir, { PP_FAIL: FINAL_STEPS.map(([, id]) => id).join(',') }, refs());
    assert.equal(r.code, 1, r.out);
    assert.deepEqual(r.ran, ['lint']);
    assert.match(r.out, /STEP B FAIL: ESLint/);
    assert.doesNotMatch(r.out, /STEP C FAIL/);
  } finally { cleanup(dir); }
});

test('by design: a WIP push (tip carries a skip token) runs only step A, even when B and C would fail, and logs a pass line naming the tier', () => {
  const { dir, refs } = hookRepo('WIP lane: step [skip ci]');
  try {
    const r = runHook(dir, { PP_FAIL: 'lint,tests,memory' }, refs());
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /step 0e: WIP push \(skip token\), B and C skipped/);
    assert.deepEqual(r.ran, []);
    assert.equal(r.firings.length, 1);
    assert.equal(r.firings[0].verdict, 'pass');
    assert.match(r.firings[0].line, /tier=wip A=ok/);
  } finally { cleanup(dir); }
});

test('by design: a skip token in the commit BODY counts (rule 024 recognises it anywhere), so the tip is a WIP push', () => {
  const { dir, refs } = hookRepo('WIP lane: step\n\nsaved [skip ci]');
  try {
    const r = runHook(dir, { PP_FAIL: 'lint' }, refs());
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(r.ran, []);
  } finally { cleanup(dir); }
});

test('by design: a branch deletion (all-zero local sha) and an empty push run only step A and log tier=none', () => {
  const { dir, git } = hookRepo();
  try {
    const sha = git(['rev-parse', 'HEAD']).trim();
    for (const refs of [`(delete) ${ZERO} refs/heads/x ${sha}\n`, '']) {
      const r = runHook(dir, { PP_FAIL: 'lint,tests,memory' }, refs);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /step 0e: no pushed commit/);
      assert.deepEqual(r.ran, []);
      assert.match(r.firings.at(-1).line, /tier=none A=ok/);
    }
  } finally { cleanup(dir); }
});

test('ATTACK step A: an untracked file in a critical surface blocks the push, a WIP push included, and nothing else runs', () => {
  for (const message of ['code change', 'WIP lane: step [skip ci]']) {
    const { dir, refs } = hookRepo(message);
    try {
      put(dir, 'fsi-app/.discipline/lib/never-added.mjs', 'export const x = 1;\n');
      const r = runHook(dir, {}, refs());
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /STEP A FAIL: untracked file\(s\) in critical surfaces/);
      assert.match(r.out, /never-added\.mjs/);
      assert.deepEqual(r.ran, [], 'B and C did not run');
      assert.equal(r.firings.length, 1);
      assert.equal(r.firings[0].rule, 'pre-push:A');
    } finally { cleanup(dir); }
  }
});

test('ATTACK step A: a tracked hook file edited and not committed blocks the push, a WIP push included, naming the file and the diff', () => {
  for (const message of ['code change', 'WIP lane: step [skip ci]']) {
    const { dir, git, refs } = hookRepo(message);
    try {
      writeFileSync(join(dir, HOOKS, 'lib', 'prepush-logdir.sh'), `${readFileSync(join(dir, HOOKS, 'lib', 'prepush-logdir.sh'), 'utf8')}\n# exit 0 injected\n`);
      assert.match(git(['status', '--porcelain']), /prepush-logdir\.sh/);
      const r = runHook(dir, {}, refs());
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /STEP A FAIL: a tracked hook file has uncommitted changes/);
      assert.match(r.out, /exit 0 injected/);
      assert.deepEqual(r.ran, []);
    } finally { cleanup(dir); }
  }
});

test('control: step A does not block a clean tree, and the pass line is the last line the log holds', () => {
  const { dir, refs } = hookRepo('WIP lane [skip ci]');
  try {
    runHook(dir, {}, refs());
    const second = runHook(dir, {}, refs());
    assert.equal(second.firings.length, 2, 'one line per push, accumulating');
    assert.ok(second.firings.every((f) => f.verdict === 'pass'));
  } finally { cleanup(dir); }
});
