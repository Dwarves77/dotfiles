// job-inputs.test.mjs (lane CI-MIN-1, 2026-10-10; reshaped by lane PIPE-1, 2026-10-11 for the one-pipeline ci.yml).
// Tests for the one job-inputs classifier. node:test, no npm deps. (a) ATTACK, parameterised over the map: a new entry
// is covered with no edit here. (b) COVERAGE: no tracked non-docs file can skip every gate (the `code` verdict makes the
// static job's heavy steps run). (c) a workflow or the classifier itself runs every job. (d) the FIVE-JOB MAP: the job
// set of ci.yml, which jobs are always on, scoped or master-only, and the expected job set for a docs-only, a
// migrations-only, a components-only and a routes pull request. Plus the derivation and the CLI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALWAYS_ON,
  CLASSIFIER_FILES,
  CODE_KEY,
  MASTER_ONLY,
  SCOPED,
  SCOPED_KEYS,
  buildJobInputs,
  globToRegex,
  importClosure,
  jobBlockCode,
  jobIdOf,
  jobsTouched,
  sampleFileFor,
  scriptsRunBy,
} from './job-inputs.mjs';
import { isDocsOnlyPath, loadReadDocPaths } from './docs-only-range.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const MAP = buildJobInputs(ROOT);
const CI = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
const READ_DOCS = loadReadDocPaths(ROOT);

/** The job-level lines of one job of ci.yml: from its id line to its `steps:` line. */
function jobHeader(text, id) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `  ${id}:`);
  assert.ok(start >= 0, `ci.yml has job ${id}`);
  const stepsAt = lines.findIndex((l, i) => i > start && l === '    steps:');
  return lines.slice(start, stepsAt).join('\n');
}

test('the five-job map: ci.yml has exactly inputs, static, schema, app, master, and the classifier names each as always-on, scoped or master-only', () => {
  const ids = CI.split(/\r?\n/).filter((l) => /^ {2}[a-z][a-z0-9_-]*:\s*$/.test(l) && !['push:', 'pull_request:', 'workflow_dispatch:'].includes(l.trim())).map((l) => l.trim().slice(0, -1));
  const jobsStart = CI.indexOf('\njobs:\n');
  const jobIds = CI.slice(jobsStart).split(/\r?\n/).filter((l) => /^ {2}[a-z][a-z0-9_-]*:\s*$/.test(l)).map((l) => l.trim().slice(0, -1));
  assert.deepEqual(jobIds, ['inputs', 'static', 'schema', 'app', 'master']);
  assert.ok(ids.length >= 5);
  assert.deepEqual([...ALWAYS_ON], ['inputs', 'static']);
  assert.deepEqual([...MASTER_ONLY], ['master']);
  const scopedJobIds = new Set(SCOPED_KEYS.map(jobIdOf));
  assert.deepEqual([...scopedJobIds].sort(), ['app', 'master', 'schema']);
  const named = new Set([...ALWAYS_ON, ...MASTER_ONLY, ...SCOPED_KEYS.filter((k) => SCOPED[k].level === 'job').map(jobIdOf)]);
  assert.deepEqual([...named].sort(), [...jobIds].sort(), 'every job of ci.yml is classified exactly once');
});

test('every scoped key has a map entry that names its workflow file and the shared actions', () => {
  assert.deepEqual(Object.keys(MAP).sort(), [...SCOPED_KEYS].sort());
  for (const key of SCOPED_KEYS) {
    assert.ok(MAP[key].includes(`.github/workflows/${SCOPED[key].workflow}`), `${key}: its own workflow`);
    assert.ok(MAP[key].includes('.github/actions/**'), `${key}: the shared actions`);
  }
});

test('ATTACK (a): for every scoped entry, touching exactly one file from each of its globs returns that entry', () => {
  let probes = 0;
  for (const key of SCOPED_KEYS) {
    for (const glob of MAP[key]) {
      const file = sampleFileFor(glob);
      assert.ok(globToRegex(glob).test(file), `${key}: the probe ${file} matches its glob ${glob}`);
      const verdict = jobsTouched([file], MAP, READ_DOCS);
      assert.ok(verdict.touched.includes(key), `${key}: touching ${file} (glob ${glob}) must run the job; got ${JSON.stringify(verdict.touched)}`);
      probes++;
    }
  }
  assert.ok(probes > 100, `the attack covered ${probes} globs`);
});

test('ATTACK (a): an entry whose glob is removed from the map is no longer run by its own file (the attack bites)', () => {
  const cut = { ...MAP, app: MAP.app.filter((g) => g !== 'docs/design/**') };
  assert.equal(jobsTouched(['docs/design/handoff/x.md'], cut, READ_DOCS).touched.includes('app'), false);
  assert.equal(jobsTouched(['docs/design/handoff/x.md'], MAP, READ_DOCS).touched.includes('app'), true);
});

test('COVERAGE (b): every git-tracked non-docs file makes the static job run its code steps (code is true), and no file leaves the pull request with no job', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
  let checked = 0;
  for (const f of tracked) {
    if (isDocsOnlyPath(f, READ_DOCS)) continue;
    const v = jobsTouched([f], MAP, READ_DOCS);
    assert.equal(v.code, true, `${f}: a non-docs file must make the static code steps run`);
    assert.ok(v.alwaysOn.length + v.touched.length > 0, `${f}: no job would run`);
    checked++;
  }
  assert.ok(checked > 1000, `${checked} non-docs files checked`);
});

test('COVERAGE (b): the always-on jobs are real jobs of ci.yml and their job-level condition never reads a classifier output; master runs on a push only', () => {
  const lines = CI.split(/\r?\n/);
  for (const id of ALWAYS_ON) {
    assert.ok(lines.includes(`  ${id}:`), `ci.yml has the always-on job ${id}`);
    assert.doesNotMatch(jobHeader(CI, id), /^ {4}if:.*needs\.inputs\.outputs/m, `${id} is never scoped by the inputs job`);
  }
  assert.match(jobHeader(CI, 'static'), /^ {4}if: github\.event_name == 'pull_request'$/m);
  assert.match(jobHeader(CI, 'master'), /^ {4}if: github\.event_name == 'push'$/m);
});

test('COVERAGE (b): every scoped job id exists in ci.yml; a job-level entry carries the job-level if, a step-level entry carries the step-level if', () => {
  for (const key of SCOPED_KEYS) {
    assert.ok(CI.split('\n').includes(`  ${jobIdOf(key)}:`), `ci.yml has job ${jobIdOf(key)}`);
    if (SCOPED[key].level === 'job') {
      assert.match(jobHeader(CI, jobIdOf(key)), new RegExp(`^ {4}if: .*needs\\.inputs\\.outputs\\.${key} == 'true'`, 'm'), `${key}: job-level if`);
      assert.match(jobHeader(CI, jobIdOf(key)), /^ {4}needs: inputs$/m, `${key}: needs inputs`);
    } else {
      assert.match(jobBlockCode(CI, jobIdOf(key)), new RegExp(`^ {8}if: needs\\.inputs\\.outputs\\.${key} == 'true'$`, 'm'), `${key}: step-level if`);
    }
  }
});

test('the inputs job outputs the code verdict and every scoped key from the one classify step', () => {
  const header = jobHeader(CI, 'inputs');
  for (const key of [CODE_KEY, ...SCOPED_KEYS]) assert.match(header, new RegExp(`^ {6}${key}: \\$\\{\\{ steps\\.classify\\.outputs\\.${key} \\}\\}$`, 'm'), key);
});

test('(c) a change to the classifier, its test, or any workflow returns every job and the code verdict', () => {
  for (const f of [...CLASSIFIER_FILES, '.github/workflows/brief-apply.yml', '.github/workflows/ci.yml', '.github/workflows/new-one.yml']) {
    const v = jobsTouched([f, 'docs/ops/session-log.d/x.md'], MAP, READ_DOCS);
    assert.deepEqual([...v.touched].sort(), [...SCOPED_KEYS].sort(), f);
    assert.deepEqual(v.unchanged, []);
    assert.equal(v.code, true, f);
  }
});

test('fail toward running: an empty or unreadable change list runs every job and the code steps', () => {
  for (const files of [[], undefined]) {
    const v = jobsTouched(files, MAP, READ_DOCS);
    assert.deepEqual([...v.touched].sort(), [...SCOPED_KEYS].sort());
    assert.equal(v.code, true);
  }
});

test('expected job sets: a docs only PR, a migrations only PR, a components only PR, a routes PR, a proof-script PR', () => {
  const docs = jobsTouched(['docs/ops/session-log.d/2026-10-11-x.md', 'docs/decisions/ADR-999-x.md'], MAP, READ_DOCS);
  assert.deepEqual(docs.touched, []);
  assert.equal(docs.code, false, 'a docs-only change runs the cheap static steps only');
  assert.deepEqual(docs.alwaysOn, [...ALWAYS_ON]);
  const mig = jobsTouched(['fsi-app/supabase/migrations/390_x.sql', 'docs/ops/session-log.d/y.md'], MAP, READ_DOCS);
  assert.deepEqual([...mig.touched].sort(), ['schema']);
  assert.equal(mig.code, true);
  const src = jobsTouched(['fsi-app/src/components/ui/Chip.tsx'], MAP, READ_DOCS);
  assert.deepEqual([...src.touched].sort(), ['app', 'master_build']);
  assert.deepEqual(src.unchanged, ['schema']);
  assert.equal(src.code, true);
  const route = jobsTouched(['fsi-app/src/app/api/admin/x/route.ts'], MAP, READ_DOCS);
  assert.deepEqual([...route.touched].sort(), ['app', 'master_build', 'schema']);
  const proof = jobsTouched(['fsi-app/scripts/proof/replay-migrations.mjs'], MAP, READ_DOCS);
  assert.deepEqual([...proof.touched].sort(), ['schema']);
});

test('a governing doc is code: PROGRAM-BOARD and the lane contract make the static code steps run, and docs/design and docs/specs are app inputs', () => {
  assert.equal(jobsTouched(['docs/PROGRAM-BOARD.md'], MAP, READ_DOCS).code, true);
  assert.equal(jobsTouched(['docs/dispatches/lane-common-contract.md'], MAP, READ_DOCS).code, true);
  assert.deepEqual(jobsTouched(['docs/specs/04-x.md'], MAP, READ_DOCS).touched, ['app']);
});

test('the master build step is scoped to the old build-proof inputs: src, package files and the next config', () => {
  assert.deepEqual(jobsTouched(['fsi-app/next.config.ts'], MAP, READ_DOCS).touched.sort(), ['app', 'master_build']);
  assert.equal(jobsTouched(['fsi-app/package-lock.json'], MAP, READ_DOCS).touched.includes('master_build'), true);
  assert.equal(jobsTouched(['docs/design/x.md'], MAP, READ_DOCS).touched.includes('master_build'), false);
  assert.equal(MAP.master_build.includes('fsi-app/.discipline/governance/**'), false, 'a step-level entry takes no derived scripts');
});

test('globToRegex: ** crosses directories, * does not, dots are literal', () => {
  assert.equal(globToRegex('a/**').test('a/b/c.txt'), true);
  assert.equal(globToRegex('a/*').test('a/b/c.txt'), false);
  assert.equal(globToRegex('a/*.json').test('a/xjson'), false);
  assert.equal(globToRegex('a/b.json').test('a/b.json'), true);
});

test('derivation: the scripts a scoped job runs and their imports are inputs without being typed in the map', () => {
  assert.ok(MAP.app.includes('fsi-app/.discipline/rendering/run-rendering-guard.mjs'));
  assert.ok(MAP.app.includes('fsi-app/.discipline/lib/context.mjs'), 'a transitive import is an input');
  assert.ok(MAP.app.includes('fsi-app/.discipline/rendering/audit/run-audit.mjs'), 'npm run audit:design resolves through package.json');
  assert.ok(MAP.app.includes('fsi-app/scripts/verify/attacks/forbid-fires-attack.mjs'));
  assert.ok(MAP.schema.includes('fsi-app/scripts/verify/attacks/rls-persona-matrix.mjs'));
  assert.ok(MAP.schema.includes('fsi-app/scripts/verify/attacks/routes-attacked.mjs'));
  assert.ok(MAP.schema.includes('fsi-app/scripts/proof/replay-migrations.mjs'));
});

test('derivation: scriptsRunBy ignores comment lines (jobBlockCode) and reads npm run bodies', () => {
  const yml = ['jobs:', '  a:', '    steps:', '      # node scripts/lib/commented.mjs', '      - run: node scripts/lib/real.mjs', '      - run: npm run thing', '  b:', '    steps:', '      - run: node scripts/lib/other.mjs'].join('\n');
  const block = jobBlockCode(yml, 'a');
  assert.deepEqual(scriptsRunBy(block, { thing: 'node .discipline/x/y.mjs --flag' }).sort(), ['fsi-app/.discipline/x/y.mjs', 'fsi-app/scripts/lib/real.mjs']);
});

test('derivation: importClosure follows static, re-export and dynamic relative imports and skips bare specifiers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'job-inputs-'));
  try {
    mkdirSync(join(dir, 'p'), { recursive: true });
    writeFileSync(join(dir, 'p', 'a.mjs'), "import x from './b.mjs';\nexport * from './c';\nconst d = await import('./d.mjs');\nimport 'node:fs';\nimport y from 'typescript';\n");
    for (const f of ['b.mjs', 'c.mjs', 'd.mjs']) writeFileSync(join(dir, 'p', f), '// leaf\n');
    assert.deepEqual(importClosure(['p/a.mjs'], dir), ['p/a.mjs', 'p/b.mjs', 'p/c.mjs', 'p/d.mjs']);
    assert.deepEqual(importClosure(['p/missing.mjs'], dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- CLI ----------------------------------------------------------------------------------------------------------

function gitIn(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
}

test('CLI: --pr-merge classifies HEAD^1..HEAD of a merge commit, prints skipped jobs and writes GITHUB_OUTPUT', () => {
  // The script resolves the repo root from its own location, so run it from a clone of this checkout's files.
  const dir = mkdtempSync(join(tmpdir(), 'job-inputs-cli-'));
  try {
    mkdirSync(join(dir, 'fsi-app', '.discipline', 'governance'), { recursive: true });
    gitIn(dir, 'init', '-q', '-b', 'master');
    writeFileSync(join(dir, 'README.md'), 'x\n');
    gitIn(dir, 'add', '-A');
    gitIn(dir, 'commit', '-q', '-m', 'base');
    gitIn(dir, 'checkout', '-q', '-b', 'pr');
    mkdirSync(join(dir, 'fsi-app', 'supabase', 'migrations'), { recursive: true });
    writeFileSync(join(dir, 'fsi-app', 'supabase', 'migrations', '999_x.sql'), 'select 1;\n');
    gitIn(dir, 'add', '-A');
    gitIn(dir, 'commit', '-q', '-m', 'pr change');
    gitIn(dir, 'checkout', '-q', 'master');
    writeFileSync(join(dir, 'other.txt'), 'y\n');
    gitIn(dir, 'add', '-A');
    gitIn(dir, 'commit', '-q', '-m', 'base moves');
    gitIn(dir, 'merge', '-q', '--no-ff', '-m', 'merge', 'pr');
    const outFile = join(dir, 'gh-output');
    const res = spawnSync('node', [join(HERE, 'job-inputs.mjs'), '--pr-merge', '--github-output', '--print-unchanged'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: outFile },
    });
    assert.equal(res.status, 0, res.stderr);
    const out = readFileSync(outFile, 'utf8');
    assert.match(out, /^code=true$/m);
    assert.match(out, /^schema=true$/m);
    assert.match(out, /^app=false$/m);
    assert.match(out, /^master_build=false$/m);
    assert.match(res.stdout, /^inputs unchanged: app$/m);
    assert.doesNotMatch(res.stdout, /inputs unchanged: schema/);
    assert.doesNotMatch(res.stdout, /inputs unchanged: master/, 'a step-level entry is never printed as a skipped job');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: --range classifies before..after (a push to master) and a docs-only range writes code=false', () => {
  const dir = mkdtempSync(join(tmpdir(), 'job-inputs-cli3-'));
  try {
    gitIn(dir, 'init', '-q', '-b', 'master');
    writeFileSync(join(dir, 'README.md'), 'x\n');
    gitIn(dir, 'add', '-A');
    gitIn(dir, 'commit', '-q', '-m', 'base');
    const before = gitIn(dir, 'rev-parse', 'HEAD').trim();
    mkdirSync(join(dir, 'docs', 'notes'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'notes', 'a.md'), 'doc\n');
    gitIn(dir, 'add', '-A');
    gitIn(dir, 'commit', '-q', '-m', 'docs');
    const after = gitIn(dir, 'rev-parse', 'HEAD').trim();
    const outFile = join(dir, 'gh-output');
    const res = spawnSync('node', [join(HERE, 'job-inputs.mjs'), `--range=${before}..${after}`, '--github-output'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: outFile } });
    assert.equal(res.status, 0, res.stderr);
    const out = readFileSync(outFile, 'utf8');
    assert.match(out, /^code=false$/m);
    for (const key of SCOPED_KEYS) assert.match(out, new RegExp(`^${key}=false$`, 'm'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: --all (a dispatch) marks every job and the code verdict true', () => {
  const dir = mkdtempSync(join(tmpdir(), 'job-inputs-cli4-'));
  try {
    gitIn(dir, 'init', '-q', '-b', 'master');
    const outFile = join(dir, 'gh-output');
    const res = spawnSync('node', [join(HERE, 'job-inputs.mjs'), '--all', '--github-output'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: outFile } });
    assert.equal(res.status, 0, res.stderr);
    const out = readFileSync(outFile, 'utf8');
    for (const key of [CODE_KEY, ...SCOPED_KEYS]) assert.match(out, new RegExp(`^${key}=true$`, 'm'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: a checkout that is not a merge commit runs every job (fails toward running)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'job-inputs-cli2-'));
  try {
    gitIn(dir, 'init', '-q', '-b', 'master');
    writeFileSync(join(dir, 'README.md'), 'x\n');
    gitIn(dir, 'add', '-A');
    gitIn(dir, 'commit', '-q', '-m', 'only');
    const outFile = join(dir, 'gh-output');
    const res = spawnSync('node', [join(HERE, 'job-inputs.mjs'), '--pr-merge', '--github-output', '--print-unchanged'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: outFile },
    });
    assert.equal(res.status, 0, res.stderr);
    const out = readFileSync(outFile, 'utf8');
    for (const key of [CODE_KEY, ...SCOPED_KEYS]) assert.match(out, new RegExp(`^${key}=true$`, 'm'));
    assert.doesNotMatch(res.stdout, /inputs unchanged/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: bad arguments exit 2', () => {
  const res = spawnSync('node', [join(HERE, 'job-inputs.mjs'), '--bogus'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
});
