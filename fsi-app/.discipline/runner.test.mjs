// Integration tests for the runner. Verifies the engine wires manifest -> trigger -> check -> result correctly.
// Run: node --test fsi-app/.discipline/runner.test.mjs
//
// History: post-slim (2026-05-21) the engine had 2 rules; lane GATE-1 (2026-10-08) removed rules 014, 016
// and 020 and moved the content rules to introduced-lines scope. The registered set is now 012, 015, 017,
// 018, 019, 021, 022. The end-to-end tests below build a real throwaway git repository, stage a change and
// run the commit-msg mode the hook runs, so the one-diff context, the introduced-lines scope and the firing
// log are proven through the same entry point a commit uses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';

const RUNNER = resolvePath(import.meta.dirname, 'runner.mjs');

// Banned characters and a home-directory path are built at runtime: this file's own source must carry none.
const EM = String.fromCharCode(0x2014);
const HOME_PATH = 'C:/Users' + '/' + 'someone/project';

function runFixture(message, files) {
  const dir = mkdtempSync(join(tmpdir(), 'discipline-test-'));
  const msgPath = join(dir, 'msg.txt');
  const filesPath = join(dir, 'files.json');
  writeFileSync(msgPath, message);
  writeFileSync(filesPath, JSON.stringify(files));
  try {
    const out = execFileSync('node', [RUNNER, '--mode=fixture', `--message-file=${msgPath}`, `--files-file=${filesPath}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, output: out };
  } catch (err) {
    return { exitCode: err.status, output: (err.stdout || '') + (err.stderr || '') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('runner: --list prints the registered rules and none of the removed ones', () => {
  const out = execFileSync('node', [RUNNER, '--list'], { encoding: 'utf-8' });
  for (const id of ['012', '015', '017', '018', '019', '021', '022']) assert.ok(out.includes(`[${id}]`), `rule ${id} registered`);
  for (const id of ['014', '016', '020']) assert.ok(!out.includes(`[${id}]`), `rule ${id} removed`);
  assert.ok(out.includes('Hardcoded user-home path'));
  assert.ok(out.includes('Registered rules (7)'));
});

test('runner: fixture for trivial commit exits 0', () => {
  const result = runFixture(
    'chore: typo',
    [{ path: 'README.md', additions: 1, deletions: 1 }]
  );
  assert.equal(result.exitCode, 0, `expected exit 0, got ${result.exitCode}. Output:\n${result.output}`);
});

test('runner: fixture for substantial commit with no trailers exits 0 (no attestation required)', () => {
  const result = runFixture(
    'feat: ship the thing\n\nplain body, no trailers, no attestation.',
    Array.from({ length: 10 }, (_, i) => ({ path: `fsi-app/src/f${i}.ts`, additions: 5, deletions: 5 }))
  );
  assert.equal(result.exitCode, 0, `expected exit 0, got ${result.exitCode}. Output:\n${result.output}`);
});

test('runner: an inventory-touching commit needs no consistency run at commit time (rule 014 removed)', () => {
  const result = runFixture(
    'docs: inventory',
    [{ path: 'docs/inventories/migrations.md', additions: 3, deletions: 0 }]
  );
  assert.equal(result.exitCode, 0, `expected exit 0, got ${result.exitCode}. Output:\n${result.output}`);
});

// ---------------------------------------------------------------------------
// End to end on a real repository
// ---------------------------------------------------------------------------

function git(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function write(dir, rel, content) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
}

function newRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'discipline-e2e-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 't@example.com']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['config', 'core.autocrlf', 'false']);
  return dir;
}

// The baseline content carries, on lines the later change never touches: a banned glyph, a home path, a
// raw database write and a knob read. Under the old whole-file rules any edit to these files failed.
function baseline(kind, i) {
  const common = [`// file ${kind} ${i}`, `// note ${EM} written long ago`, `const keep = ${i};`];
  if (kind === 'script') {
    return [...common, `const REPO = '${HOME_PATH}';`, 'const sb = createClient(u, k);', 'await sb.from("sources").update({ x: 1 }).eq("id", 1);', 'export {};'].join('\n') + '\n';
  }
  if (kind === 'ts') return [...common, `export const HOME = '${HOME_PATH}';`].join('\n') + '\n';
  if (kind === 'doc') return [`# doc ${i}`, `an old aside ${EM} kept as written`, 'text'].join('\n') + '\n';
  return [...common, 'export default function C() { return null; }'].join('\n') + '\n';
}

function seed77(dir) {
  const files = [];
  for (let i = 0; i < 30; i++) files.push([`fsi-app/scripts/gen/s${i}.mjs`, 'script', i]);
  for (let i = 0; i < 20; i++) files.push([`fsi-app/src/lib/x/t${i}.ts`, 'ts', i]);
  for (let i = 0; i < 10; i++) files.push([`fsi-app/src/components/c${i}.tsx`, 'tsx', i]);
  for (let i = 0; i < 17; i++) files.push([`docs/notes/n${i}.md`, 'doc', i]);
  for (const [rel, kind, i] of files) write(dir, rel, baseline(kind, i));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  return files;
}

function editAll(dir, files, extra = () => null) {
  for (const [rel, kind, i] of files) {
    const added = extra(rel, kind, i);
    write(dir, rel, baseline(kind, i) + (added ?? `// edited ${i}`) + '\n');
  }
  git(dir, ['add', '-A']);
}

function commitMsg(dir, env = {}) {
  const msg = join(dir, '.git', 'COMMIT_EDITMSG');
  writeFileSync(msg, 'chore: touch many files');
  const started = process.hrtime.bigint();
  const r = spawnSync('node', [RUNNER, '--mode=commit-msg', `--message-file=${msg}`], {
    cwd: dir, encoding: 'utf-8', env: { ...process.env, ...env },
  });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), ms };
}

test('e2e: 77 staged files whose UNTOUCHED lines carry glyphs, home paths, raw writes and knob reads pass', () => {
  const dir = newRepo();
  try {
    const files = seed77(dir);
    editAll(dir, files);
    assert.equal(git(dir, ['diff', '--cached', '--name-only']).trim().split('\n').length, 77);
    const r = commitMsg(dir, { DISCIPLINE_FIRING_LOG: 'off' });
    assert.equal(r.code, 0, r.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: commit-msg over 77 staged files spawns exactly ONE git diff (the old engine spawned 154 plus a numstat)', () => {
  const dir = newRepo();
  const trace = join(dir, 'git-trace.log');
  try {
    const files = seed77(dir);
    editAll(dir, files);
    const r = commitMsg(dir, { DISCIPLINE_FIRING_LOG: 'off', GIT_TRACE: trace });
    assert.equal(r.code, 0, r.out);
    const diffs = readFileSync(trace, 'utf-8').split('\n').filter((l) => /built-in: git (-c [^ ]+ )?diff\b/.test(l));
    assert.equal(diffs.length, 1, `expected 1 git diff process, saw ${diffs.length}:\n${diffs.join('\n')}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The budget is 2000 ms on a quiet machine (the register measured 12.5 s for the old engine at this size).
// An absolute number is only meaningful relative to the host, so the limit is the larger of 2000 ms and
// four times this host's own floor: node start plus the single `git diff --cached --numstat` over the same
// 77 files, which any engine must pay. A loaded shared runner raises the floor and the limit with it; a
// regression to per-file git spawns (154 extra processes) exceeds either by an order of magnitude.
test('e2e: commit-msg at 77 staged files runs within budget (2000 ms, or 4x the host floor on a loaded machine)', () => {
  const dir = newRepo();
  try {
    const files = seed77(dir);
    editAll(dir, files);
    const timeIt = (cmd, args) => {
      const t0 = process.hrtime.bigint();
      spawnSync(cmd, args, { cwd: dir, stdio: 'ignore' });
      return Number(process.hrtime.bigint() - t0) / 1e6;
    };
    const floor = Math.min(...[1, 2, 3].map(() => timeIt('node', ['-e', '0']) + timeIt('git', ['diff', '--cached', '--numstat'])));
    const runs = [1, 2, 3].map(() => commitMsg(dir, { DISCIPLINE_FIRING_LOG: 'off' }));
    for (const r of runs) assert.equal(r.code, 0, r.out);
    const best = Math.min(...runs.map((r) => r.ms));
    const limit = Math.max(2000, 4 * floor);
    console.log(`# commit-msg, 77 staged files, best of 3: ${Math.round(best)} ms (runs: ${runs.map((r) => Math.round(r.ms)).join(', ')} ms; host floor ${Math.round(floor)} ms; limit ${Math.round(limit)} ms)`);
    assert.ok(best < limit, `commit-msg took ${Math.round(best)} ms at 77 staged files; the limit on this host is ${Math.round(limit)} ms`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: an INTRODUCED glyph, home path and raw database write are each blocked, with file and line', () => {
  const dir = newRepo();
  try {
    const files = seed77(dir);
    editAll(dir, files, (rel, kind, i) => {
      if (i !== 3) return null;
      if (kind === 'ts') return `export const BAD = '${HOME_PATH}';`;
      if (kind === 'script') return `// fresh ${EM} aside\nawait sb.from("sources").delete().eq("id", 2);`;
      return null;
    });
    const r = commitMsg(dir, { DISCIPLINE_FIRING_LOG: 'off' });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL {2}\[012\]/);
    assert.match(r.out, /FAIL {2}\[015\]/);
    assert.match(r.out, /FAIL {2}\[022\]/);
    assert.match(r.out, /fsi-app\/src\/lib\/x\/t3\.ts:\d+/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: renaming a file that carries glyphs and a home path is not a violation', () => {
  const dir = newRepo();
  try {
    write(dir, 'docs/notes/old-name.md', baseline('doc', 1).repeat(4));
    write(dir, 'fsi-app/src/lib/x/old.ts', baseline('ts', 1).repeat(3));
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'base']);
    git(dir, ['mv', 'docs/notes/old-name.md', 'docs/notes/new-name.md']);
    git(dir, ['mv', 'fsi-app/src/lib/x/old.ts', 'fsi-app/src/lib/x/new.ts']);
    const r = commitMsg(dir, { DISCIPLINE_FIRING_LOG: 'off' });
    assert.equal(r.code, 0, r.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: the firing log gets one line per firing {ts, rule, mode, path, line, verdict}', () => {
  const dir = newRepo();
  const log = join(dir, 'firings.log');
  try {
    write(dir, 'fsi-app/src/lib/x/a.ts', 'export const a = 1;\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'base']);
    write(dir, 'fsi-app/src/lib/x/a.ts', `export const a = 1;\nexport const HOME = '${HOME_PATH}';\n`);
    git(dir, ['add', '-A']);
    const r = commitMsg(dir, { DISCIPLINE_FIRING_LOG: log });
    assert.equal(r.code, 1, r.out);
    assert.ok(existsSync(log), 'the firing log was written');
    const rows = readFileSync(log, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    const fail = rows.find((x) => x.rule === '012' && x.verdict === 'FAIL');
    assert.ok(fail, 'rule 012 FAIL logged');
    assert.deepEqual(Object.keys(fail).sort(), ['line', 'mode', 'path', 'rule', 'ts', 'verdict']);
    assert.equal(fail.path, 'fsi-app/src/lib/x/a.ts');
    assert.equal(fail.line, 2);
    assert.equal(fail.mode, 'commit-msg');
    assert.ok(!Number.isNaN(Date.parse(fail.ts)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: DISCIPLINE_FIRING_LOG=off writes no log, and fixture mode writes none unless a path is named', () => {
  const dir = newRepo();
  try {
    write(dir, 'fsi-app/src/lib/x/a.ts', 'export const a = 1;\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'base']);
    write(dir, 'fsi-app/src/lib/x/a.ts', 'export const a = 2;\n');
    git(dir, ['add', '-A']);
    const r = commitMsg(dir, { DISCIPLINE_FIRING_LOG: 'off' });
    assert.equal(r.code, 0, r.out);
    assert.ok(!existsSync(join(dir, 'off')));

    // fixture mode: no env var means no write even though a rule fires and FAILS
    const msg = join(dir, 'm.txt');
    const filesJson = join(dir, 'f.json');
    writeFileSync(msg, 'feat: x');
    writeFileSync(filesJson, JSON.stringify({ files: [{ path: 'fsi-app/src/a.ts' }], changes: [{ path: 'fsi-app/src/a.ts', added: [`const H = '${HOME_PATH}';`] }] }));
    const env = { ...process.env };
    delete env.DISCIPLINE_FIRING_LOG;
    const defaultLog = join(import.meta.dirname, 'governance', '.hook-firings.log');
    const sizeBefore = existsSync(defaultLog) ? readFileSync(defaultLog).length : -1;
    const fx = spawnSync('node', [RUNNER, '--mode=fixture', `--message-file=${msg}`, `--files-file=${filesJson}`], { cwd: dir, encoding: 'utf-8', env });
    assert.equal(fx.status, 1, 'the fixture diff view reaches the rules through the CLI');
    const sizeAfter = existsSync(defaultLog) ? readFileSync(defaultLog).length : -1;
    assert.equal(sizeAfter, sizeBefore, 'fixture mode left the default firing log untouched');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
