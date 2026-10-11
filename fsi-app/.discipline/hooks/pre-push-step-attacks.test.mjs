// The pre-push hook attacked step by step through the REAL full run (lane TESTS-2, 2026-10-10; AUD-AT-3 section 6 owed leg
// "Pre-push steps 3, 3b, 3d, 3e, 3f, 3g, 3h, 4: a content attack per step through the real full run").
//
// AUD-AT-3 proved only that a default push and an opt-in push SKIP these steps. The opt-in run (DISCIPLINE_PREPUSH_FULL=1) needs
// the full install and tens of minutes (ADR-040), so the gates' own contents are attacked by their own subsystems (the fitness
// functions, the governance gates, the CI job steps). What this subsystem owns, and what is attacked here, is the HOOK's side of
// each step: that a step which fails blocks the push (exit 1, naming the step), that no later step runs after it, that a step
// whose command exits 0 does not block, and that the hook is a pure AND of its steps.
//
// The real tracked hook, prepush-logdir.sh and the hook's own step ordering are run inside a throwaway git repository whose
// step commands (at the same relative paths the hook invokes) are STUBS that fail exactly when their step id is named in the
// PP_FAIL variable. The tracked hook and libraries are copied byte for byte; nothing the hook runs is the real gate, so the run is
// fast and independent of the install. The dependency-link helper is stubbed as in pre-push-honest-forms.test.mjs.
//
// Node built-ins only (the no-npm suite). Throwaway repositories are removed afterwards.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const HOOKS = 'fsi-app/.discipline/hooks';

/** [step id as the hook prints it, the stub's own id for PP_FAIL, relative path of the stubbed command]. In hook order. */
const STEPS = [
  ['2', 'consistency', 'fsi-app/.discipline/consistency/override-check.mjs'],
  ['2b', 'memory', 'fsi-app/.discipline/governance/memory-gate.mjs'],
  ['3', 'suite', 'fsi-app/.discipline/run-test-suite.sh'],
  ['3b', 'invariants', 'fsi-app/.discipline/governance/invariant-coverage.mjs'],
  ['3c', 'pretooluse', 'fsi-app/.discipline/governance/check-pretooluse-wired.mjs'],
  ['3d', 'lint', 'fsi-app/package.json'],
  ['3e', 'fitness', 'fsi-app/.discipline/fitness/runner.mjs'],
  ['3f', 'npmtest', 'fsi-app/.discipline/hooks/lib/run-npmtest-suites.sh'],
  ['3g', 'goldens', 'fsi-app/scripts/verify/run-goldens.mjs'],
  ['3h', 'closure', 'fsi-app/.discipline/governance/closure-gate.mjs'],
  ['3h', 'skillmap', 'fsi-app/.discipline/governance/skill-contract-map.mjs'],
  ['4', 'tsc', 'fsi-app/node_modules/.bin/tsc'],
];

// every stub appends its id to the trace file first: which steps RAN is read from the trace, not from output that the hook
// redirects into a log directory it deletes on success
const NODE_STUB = (id) => `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.PP_TRACE,'${id}' + String.fromCharCode(10));
if ((process.env.PP_FAIL || '').split(',').includes('${id}')) { console.error('stub ${id}: forced failure'); process.exit(1); }
console.log('stub ${id}: ok');
`;
const SH_STUB = (id) => `#!/bin/sh
echo ${id} >> "$PP_TRACE"
case ",$PP_FAIL," in *,${id},*) echo "stub ${id}: forced failure" >&2; exit 1;; esac
echo "stub ${id}: ok"
exit 0
`;

function put(dir, rel, content, mode) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
  if (mode) chmodSync(join(dir, rel), mode);
}

function hookRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'prepush-steps-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-q', '-b', 'master']);
  git(['config', 'user.name', 'T']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'commit.gpgsign', 'false']);
  git(['config', 'core.autocrlf', 'false']);
  for (const rel of [`${HOOKS}/pre-push`, `${HOOKS}/lib/prepush-logdir.sh`]) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    copyFileSync(join(REPO, rel), join(dir, rel));
  }
  put(dir, `${HOOKS}/lib/worktree-node-modules.sh`, 'wt_nm_ensure_link() { return 0; }\nwt_nm_require() { return 0; }\n');
  // step 0c: "not docs-only" is exit 1 of the classifier
  put(dir, 'fsi-app/.discipline/governance/docs-only-range.mjs', "console.log('stub: not docs-only');\nprocess.exit(process.env.PP_DOCS_ONLY === '1' ? 0 : 1);\n");
  for (const [, id, rel] of STEPS) {
    if (rel.endsWith('.mjs')) put(dir, rel, NODE_STUB(id));
    else if (rel.endsWith('.sh')) put(dir, rel, SH_STUB(id), 0o755);
  }
  // 3d runs `npm run lint -- --max-warnings=0` in fsi-app
  put(dir, 'fsi-app/package.json', JSON.stringify({ name: 'stub', private: true, scripts: { lint: 'node lint-stub.mjs' } }));
  put(dir, 'fsi-app/lint-stub.mjs', NODE_STUB('lint'));
  // 4 runs `npx --no-install tsc --noEmit` in fsi-app: a local bin, in the two forms npx resolves on each platform
  put(dir, 'fsi-app/node_modules/.bin/tsc-stub.mjs', NODE_STUB('tsc'));
  put(dir, 'fsi-app/node_modules/.bin/tsc', '#!/bin/sh\nexec node "$(dirname "$0")/tsc-stub.mjs" "$@"\n', 0o755);
  put(dir, 'fsi-app/node_modules/.bin/tsc.cmd', '@node "%~dp0tsc-stub.mjs" %*\r\n');
  put(dir, '.gitignore', 'node_modules/\nfsi-app/.discipline/governance/.hook-firings.log\n');
  git(['add', '-A']);
  git(['add', '-f', 'fsi-app/node_modules/.bin/tsc', 'fsi-app/node_modules/.bin/tsc.cmd', 'fsi-app/node_modules/.bin/tsc-stub.mjs']);
  git(['commit', '-q', '-m', 'base']);
  git(['update-ref', 'refs/remotes/origin/master', 'HEAD']);
  put(dir, 'fsi-app/src/lib/change.ts', 'export const x = 1;\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'code change']);
  return { dir, git };
}

function runHook(dir, env = {}) {
  const trace = join(dir, '.git', 'pp-trace');
  const e = { ...process.env, DISCIPLINE_HOOK_TRAMPOLINE: '1', DISCIPLINE_PREPUSH_FULL: '1', PP_FAIL: '', PP_TRACE: trace, ...env };
  for (const k of Object.keys(e)) if (k.startsWith('NODE_TEST')) delete e[k];
  const r = spawnSync('sh', [join(dir, HOOKS, 'pre-push')], { cwd: dir, encoding: 'utf8', input: '', env: e });
  const ran = existsSync(trace) ? readFileSync(trace, 'utf8').split('\n').filter(Boolean) : [];
  return { code: r.status, out: `${r.stdout}${r.stderr}`, ran };
}

test('CONTROL: with every step stubbed green the full run exits 0 and reaches the last step', () => {
  const { dir } = hookRepo();
  try {
    const r = runHook(dir);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /all checks pass; push proceeding/);
    assert.deepEqual(r.ran, STEPS.map(([, id]) => id), 'every step ran, once, in hook order');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const [stepId, id] of STEPS) {
  test(`ATTACK: step ${stepId} (${id}) failing blocks the push with exit 1, names the step, and no later step runs`, () => {
    const { dir } = hookRepo();
    try {
      const r = runHook(dir, { PP_FAIL: id });
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, new RegExp(`STEP ${stepId} FAIL`), r.out);
      assert.doesNotMatch(r.out, /all checks pass/);
      const at = STEPS.findIndex(([, i]) => i === id);
      assert.deepEqual(r.ran, STEPS.slice(0, at + 1).map(([, i]) => i), `exactly the steps up to ${id} ran, none after it`);
      assert.match(r.out, /step logs kept for diagnosis/, 'the log directory is kept when the hook blocks');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('ATTACK: every step failing at once still exits 1 at the FIRST failing step (the hook is a short-circuit AND)', () => {
  const { dir } = hookRepo();
  try {
    const r = runHook(dir, { PP_FAIL: STEPS.map(([, id]) => id).join(',') });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /STEP 2 FAIL/);
    assert.doesNotMatch(r.out, /STEP 2b FAIL|STEP 3 FAIL/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('by design (ADR-040): without DISCIPLINE_PREPUSH_FULL=1 the heavy steps are SKIPPED, so a failing step 3 does not block, and steps 2 and 2b still do', () => {
  const { dir } = hookRepo();
  try {
    const skipped = runHook(dir, { DISCIPLINE_PREPUSH_FULL: '0', PP_FAIL: 'suite,tsc,lint' });
    assert.equal(skipped.code, 0, skipped.out);
    assert.match(skipped.out, /steps 3-4 .* SKIPPED/);
    assert.deepEqual(skipped.ran, ['consistency', 'memory'], 'only steps 2 and 2b ran');
    const consistency = runHook(dir, { DISCIPLINE_PREPUSH_FULL: '0', PP_FAIL: 'consistency' });
    assert.equal(consistency.code, 1, consistency.out);
    assert.match(consistency.out, /STEP 2 FAIL/);
    const memory = runHook(dir, { DISCIPLINE_PREPUSH_FULL: '0', PP_FAIL: 'memory' });
    assert.equal(memory.code, 1, memory.out);
    assert.match(memory.out, /STEP 2b FAIL/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('by design (R22): a docs-only push skips steps 3 to 4 even in the full run, and steps 2 and 2b still run', () => {
  const { dir } = hookRepo();
  try {
    const r = runHook(dir, { PP_DOCS_ONLY: '1', PP_FAIL: 'suite' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /step 0c \(docs-only fast path\): every changed file is docs/);
    assert.deepEqual(r.ran, ['consistency', 'memory']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
