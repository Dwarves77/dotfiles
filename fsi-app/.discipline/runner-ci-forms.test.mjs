// The validate-commits job's CI mode attacked end to end, in the shapes the job really runs (lane TESTS-2, 2026-10-10;
// AUD-AT-3 section 6 "CI side of the ACCEPTED local forms", rows A-CI-012, A-CI-binary, A-CI-022, A-CI-015, A-M-1, A-M-2).
//
// AUD-AT-3 ran the rules engine in CI mode for four content forms that the local hooks accepted and for an evil merge, but
// not the workflow's own shapes. ci.yml runs the engine two ways (static on a pull request, master on a push):
//   pull request   `runner.mjs --mode=ci` with BASE_REF and PR_HEAD in the environment and no --range (the range is resolved
//                  by change-range.mjs to the merge base, so a post-fork commit on master is never judged);
//   push to master `runner.mjs --mode=ci --commit=<sha>` (no usable before sha) or `--range=<before>..<sha>`.
// Every case below builds a throwaway git repository, makes origin/master point at the base, commits the form on a branch and
// runs the REAL runner in the job's shape, asserting the exit status: a form that must be refused exits 1 and names its rule,
// the control exits 0.
//
// Two forms are pinned as ACCEPTED because they are by design, not because nothing was tried: a home path ASSEMBLED through a
// template and a variable (a lexical rule cannot see it), and the per-commit view of an evil merge (a merge commit has no diff
// against its first parent in the per-commit walk; the whole-range pass of --range is the layer that catches it, asserted here).
//
// Banned characters and a home path are built at runtime so this file's own source carries none. Node built-ins only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const HERE = import.meta.dirname;
const RUNNER = resolve(HERE, 'runner.mjs');
const WORKFLOW = readFileSync(resolve(HERE, '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');

const EM = String.fromCharCode(0x2014);
// built from character codes so this file's own source holds no home path (rule 012 reads the added lines of this very file)
const DRIVE = String.fromCharCode(67, 58);
const USERS = String.fromCharCode(85, 115, 101, 114, 115);
const HOME = [DRIVE, USERS, 'someone', 'project'].join('/');
const git = (d, a) => execFileSync('git', a, { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const put = (d, rel, c) => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), c); };

function repo() {
  const d = mkdtempSync(join(tmpdir(), 'ci-forms-'));
  git(d, ['init', '-q', '-b', 'main']);
  git(d, ['config', 'user.name', 'ci-forms-test']);
  git(d, ['config', 'user.email', 'ci-forms-test@example.com']);
  git(d, ['config', 'core.autocrlf', 'false']);
  put(d, 'docs/notes/base.md', '# base\n');
  git(d, ['add', '-A']);
  git(d, ['commit', '-q', '-m', 'base']);
  git(d, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
  return { d, base: git(d, ['rev-parse', 'HEAD']).trim() };
}
const commitFiles = (d, files, msg = 'add the form') => {
  for (const [rel, c] of Object.entries(files)) put(d, rel, c);
  git(d, ['add', '-A']);
  git(d, ['commit', '-q', '-m', msg]);
  return git(d, ['rev-parse', 'HEAD']).trim();
};

function run(d, args, env = {}) {
  const e = { ...process.env, DISCIPLINE_FIRING_LOG: 'off', ...env };
  for (const k of Object.keys(e)) if (k.startsWith('NODE_TEST')) delete e[k];
  const r = spawnSync(process.execPath, [RUNNER, '--mode=ci', ...args], { cwd: d, encoding: 'utf8', env: e });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
/** The pull request shape: no flags, BASE_REF and PR_HEAD in the environment. */
const prShape = (d, head) => run(d, [], { BASE_REF: 'master', PR_HEAD: head });

const REFUSED_FORMS = [
  ['A-CI-012 a home path split across string halves', { 'fsi-app/src/lib/a.ts': `export const H = '${DRIVE}' + '/${USERS}/someone/project';\n` }, /FAIL {2}\[012\]/],
  ['A-CI-012 a home path split in three', { 'fsi-app/src/lib/a.ts': `export const H = '${DRIVE}/' + '${USERS}' + '/someone/p';\n` }, /FAIL {2}\[012\]/],
  ['A-CI-binary a .gitattributes entry hides the file from the text diff', { '.gitattributes': 'fsi-app/src/lib/a.ts -diff\n', 'fsi-app/src/lib/a.ts': `export const H = '${HOME}';\n` }, /FAIL {2}\[023\]/],
  ['A-CI-022 a NUL byte hides a banned glyph in a markdown file', { 'docs/notes/n.md': `x\0 aside ${EM} y\n` }, /FAIL {2}\[023\]/],
  ['A-CI-015 a guarded-import marker in a comment does not silence a raw write', { 'fsi-app/scripts/gen/a.mjs': '// guarded-import\nconst sb = createClient(u, k);\nawait sb.from("sources").update({ x: 1 }).eq("id", 1);\n' }, /FAIL {2}\[015\]/],
  ['the plain forms the rules always caught: a direct home path', { 'fsi-app/src/lib/a.ts': `export const H = '${HOME}';\n` }, /FAIL {2}\[012\]/],
];

test('CONTROL: a clean branch passes in the pull request shape, the push-range shape and the single-commit shape', () => {
  const { d, base } = repo();
  try {
    const head = commitFiles(d, { 'fsi-app/src/lib/a.ts': 'export const a = 1;\n' });
    assert.equal(prShape(d, head).code, 0, prShape(d, head).out);
    assert.equal(run(d, [`--range=${base}..${head}`]).code, 0);
    assert.equal(run(d, [`--commit=${head}`]).code, 0);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

for (const [name, files, rule] of REFUSED_FORMS) {
  test(`ATTACK: ${name} is refused in the pull request shape and the push-range shape, naming its rule`, () => {
    const { d, base } = repo();
    try {
      const head = commitFiles(d, files);
      const pr = prShape(d, head);
      assert.equal(pr.code, 1, `pull request shape: ${pr.out}`);
      assert.match(pr.out, rule);
      const range = run(d, [`--range=${base}..${head}`]);
      assert.equal(range.code, 1, `push range shape: ${range.out}`);
      assert.match(range.out, rule);
      const single = run(d, [`--commit=${head}`]);
      assert.equal(single.code, 1, `push single-commit shape: ${single.out}`);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
}

test('ATTACK: a violation hidden in an earlier commit of the branch is still refused in the pull request shape', () => {
  const { d } = repo();
  try {
    commitFiles(d, { 'fsi-app/src/lib/a.ts': `export const H = '${HOME}';\n` }, 'first, carries the violation');
    const head = commitFiles(d, { 'fsi-app/src/lib/b.ts': 'export const b = 1;\n' }, 'second, clean');
    const pr = prShape(d, head);
    assert.equal(pr.code, 1, pr.out);
    assert.match(pr.out, /FAIL {2}\[012\]/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('a commit master gained after the fork is not judged against the pull request (the range is the merge base, not the tip)', () => {
  const { d } = repo();
  try {
    git(d, ['checkout', '-q', '-b', 'feature']);
    const head = commitFiles(d, { 'fsi-app/src/lib/a.ts': 'export const a = 1;\n' }, 'branch work');
    git(d, ['checkout', '-q', 'main']);
    const tip = commitFiles(d, { 'fsi-app/src/lib/late.ts': `export const H = '${HOME}';\n` }, 'master gains a violation after the fork');
    git(d, ['update-ref', 'refs/remotes/origin/master', tip]);
    assert.equal(prShape(d, head).code, 0, prShape(d, head).out);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

function evilMerge() {
  const { d, base } = repo();
  git(d, ['checkout', '-q', '-b', 'side']);
  commitFiles(d, { 'fsi-app/src/lib/side.ts': 'export const s = 1;\n' }, 'side work');
  git(d, ['checkout', '-q', 'main']);
  commitFiles(d, { 'fsi-app/src/lib/main.ts': 'export const m = 1;\n' }, 'main work');
  git(d, ['merge', '--no-commit', '--no-ff', 'side']);
  put(d, 'fsi-app/src/lib/evil.ts', `export const H = '${HOME}';\n`);
  git(d, ['add', '-A']);
  git(d, ['commit', '-q', '-m', 'merge side']);
  return { d, base, head: git(d, ['rev-parse', 'HEAD']).trim() };
}

test('A-M-2 ATTACK: an evil merge (the violation only in the merge commit) is refused by the whole-range pass of --range and of the pull request shape', () => {
  const { d, base, head } = evilMerge();
  try {
    const range = run(d, [`--range=${base}..${head}`]);
    assert.equal(range.code, 1, range.out);
    assert.match(range.out, /FAIL {2}\[012\]/);
    assert.equal(prShape(d, head).code, 1, 'the pull request shape runs the same whole-range pass');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('A-M-1 PINNED: the per-commit view of the same merge (--commit=<merge>) has no diff to judge and exits 0; the layer that catches it is the whole-range pass above', () => {
  const { d, head } = evilMerge();
  try {
    assert.equal(run(d, [`--commit=${head}`]).code, 0);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('PINNED by design: a home path assembled through a template and a variable is not seen by a lexical rule (an accepted limit, not an unattacked one)', () => {
  const { d, base } = repo();
  try {
    const assembled = "const u = '" + USERS + "'; export const H = `" + DRIVE + "/${u}/someone/p`;\n";
    const head = commitFiles(d, { 'fsi-app/src/lib/a.ts': assembled });
    assert.equal(prShape(d, head).code, 0);
    assert.equal(run(d, [`--range=${base}..${head}`]).code, 0);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// The workflow's own shape: the jobs' path filters, conditions and fork behaviour (the part of the row that is text). The
// engine runs in two jobs of ci.yml since lane PIPE-1 (2026-10-11): `static` on a pull request and `master` on a push.
const jobBlock = (id) => {
  const lines = WORKFLOW.split('\n');
  const start = lines.findIndex((l) => l === `  ${id}:`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i])) { end = i; break; }
  return lines.slice(start, end).join('\n');
};
const staticJob = jobBlock('static');
const masterJob = jobBlock('master');

test('the engine jobs: full history, one engine step per event, the pull request step carries no --range, the push step guards the before sha', () => {
  assert.ok(staticJob.length > 500 && masterJob.length > 500, 'the job blocks were found');
  assert.match(staticJob, /fetch-depth: 0/);
  assert.match(masterJob, /fetch-depth: 0/);
  assert.match(staticJob, /^ {4}if: github\.event_name == 'pull_request'$/m);
  assert.match(masterJob, /^ {4}if: github\.event_name == 'push'$/m);
  assert.match(staticJob, /- name: Run discipline engine \(pull request\)\n/);
  assert.match(masterJob, /- name: Run discipline engine \(push to master\)\n/);
  const at = staticJob.indexOf('Run discipline engine (pull request)');
  const pr = staticJob.slice(at, staticJob.indexOf('- name: Memory gate', at));
  assert.match(pr, /BASE_REF: \$\{\{ github\.base_ref \}\}/);
  assert.match(pr, /PR_HEAD: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.doesNotMatch(pr.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n'), /--range=|--commit=/, 'the pull request step lets runner.mjs resolve the merge base');
  assert.match(masterJob, /\[ "\$PUSH_BEFORE" = "0000000000000000000000000000000000000000" \]/);
  assert.match(masterJob, /git cat-file -e "\$\{PUSH_BEFORE\}\^\{commit\}"/);
});

test('the engine jobs hold no secret and no continue-on-error, and both engine steps run under pipefail, so a fork pull request runs the same engine and a failure fails the check', () => {
  for (const job of [staticJob, masterJob]) {
    assert.doesNotMatch(job, /\$\{\{\s*secrets\./);
    assert.doesNotMatch(job, /continue-on-error/);
  }
  // the engine steps run under pipefail, so `| tee` cannot swallow the engine's exit status
  const stepOf = (job, name) => job.slice(job.indexOf(name)).split(/\n {6}(?:#|- name:)/)[0];
  const engineSteps = [stepOf(staticJob, '- name: Run discipline engine (pull request)'), stepOf(masterJob, '- name: Run discipline engine (push to master)')];
  assert.equal(engineSteps.length, 2);
  for (const s of engineSteps) assert.match(s, /set -euo pipefail/);
});
