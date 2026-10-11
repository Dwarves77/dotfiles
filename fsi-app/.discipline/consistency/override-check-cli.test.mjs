// override-check.mjs attacked end to end (lane TESTS-2, 2026-10-10; AUD-AT-5 OWED-5, DS18 and DS19, the consistency backstop).
//
// AUD-AT-5 could not attack the backstop: in any scratch clone the real consistency runner is red at baseline ("[C4]
// missing-claim ... basename "m1" exists inside the repository path but is not listed in docs/inventories/worktrees.md"),
// so "the job failed" could not be told apart from "the attack was caught". This file removes the confound: the CLI is copied
// into a scratch git repository next to a STUB runner whose verdict this test chooses (clean, drift on named checks, or a
// runner error), and the commit messages carry real trailers. The CLI's own decision is then attacked: a drift with no
// trailer, an expired deadline, an empty rationale, a trailer for a different check, a partial override and a trailer on an
// older commit than the one judged must all fail it, and a valid trailer must pass it. The real runner is covered by its own
// tests (C3, C4 and C5); this file proves the DECISION layer that the CI job and the pre-push hook both run.
//
// Scratch repositories live under the temporary directory and are removed afterwards. Node built-ins and relative imports.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DISCIPLINE = resolve(HERE, '..');
// The rationale must name the check id or its invariant (override-check.mjs rationaleNamesInvariant), so the helper does.
// The rationale must also be a sentence of 20 characters and 3 words, and the deadline today to +30 days (MAX_DEADLINE_DAYS).
const TRAILER = (check, rationale, deadline) => `Consistency-Override: ${check} (rationale: ${check} ${rationale} pending the followup lane; remediation-deadline: ${deadline})`;
const SOON = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// The stub reads its verdict from STUB_RUNNER: "clean", "error" or "drift:C3,C4". It prints the drift lines the real runner
// writes to stderr (`  [C3] <kind>`) and exits 1, exactly the surface the CLI parses.
const STUB_RUNNER = `
const v = process.env.STUB_RUNNER || 'clean';
if (v === 'clean') process.exit(0);
if (v === 'error') { console.error('stub runner crashed'); process.exit(2); }
for (const id of v.replace('drift:', '').split(',')) console.error('  [' + id + '] stub drift record');
process.exit(1);
`;

const CHECK_NAMES = { C3: 'migrations.md reality', C4: 'worktrees.md reality', C5: 'program-anchors reality' };
const STUB_MANIFEST = `const NAMES = ${JSON.stringify(CHECK_NAMES)};
export function getCheckById(id) { return NAMES[id] ? { id, name: NAMES[id] } : undefined; }
`;

let SCRATCH;
before(() => {
  SCRATCH = mkdtempSync(join(tmpdir(), 'override-cli-'));
  const dir = join(SCRATCH, '.discipline');
  mkdirSync(join(dir, 'consistency'), { recursive: true });
  mkdirSync(join(dir, 'lib'), { recursive: true });
  // override-check.mjs imports the manifest (getCheckById, for the check names a rationale may cite). The real manifest imports every
  // check and, through them, half the repository, so the scratch tree gets a stub manifest carrying the three real names (pinned to
  // the check files by a test below) and a stub runner: the unit under test is the CLI.
  cpSync(join(HERE, 'override-check.mjs'), join(dir, 'consistency', 'override-check.mjs'));
  cpSync(join(DISCIPLINE, 'lib', 'change-range.mjs'), join(dir, 'lib', 'change-range.mjs'));
  writeFileSync(join(dir, 'consistency', 'manifest.mjs'), STUB_MANIFEST);
  writeFileSync(join(dir, 'consistency', 'runner.mjs'), STUB_RUNNER);
});
after(() => { rmSync(SCRATCH, { recursive: true, force: true }); });

function repoWith(messages) {
  const repo = mkdtempSync(join(tmpdir(), 'override-cli-repo-'));
  const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', '--local', 'user.name', 'override-cli-test']);
  git(['config', '--local', 'user.email', 'override-cli-test@example.com']);
  messages.forEach((m, i) => {
    writeFileSync(join(repo, `f${i}.txt`), `${i}\n`);
    git(['add', '-A']);
    git(['commit', '-q', '-m', m]);
  });
  return { repo, base: git(['rev-parse', 'HEAD~' + (messages.length - 1)]).trim() };
}

function runCli({ stub, messages, args = ['--commit=HEAD'] }) {
  const { repo } = repoWith(messages);
  try {
    const env = { ...process.env, STUB_RUNNER: stub };
    for (const k of Object.keys(env)) if (k.startsWith('NODE_TEST')) delete env[k];
    const r = spawnSync(process.execPath, [join(SCRATCH, '.discipline', 'consistency', 'override-check.mjs'), ...args], { cwd: repo, encoding: 'utf8', env });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

test('CONTROL: a clean runner passes', () => {
  const r = runCli({ stub: 'clean', messages: ['work'] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /runner clean/);
});

test('ATTACK: drift with no trailer fails, naming the check', () => {
  const r = runCli({ stub: 'drift:C3', messages: ['work, no trailer'] });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /uncovered: C3/);
});

test('a valid trailer (non-empty rationale, deadline in the future) passes the same drift', () => {
  const r = runCli({ stub: 'drift:C3', messages: [`work\n\n${TRAILER('C3', 'known gap tracked in a followup', SOON)}`] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /VALIDLY OVERRIDDEN: C3/);
});

test('ATTACK: an expired deadline is not an override', () => {
  const r = runCli({ stub: 'drift:C3', messages: [`work\n\n${TRAILER('C3', 'known gap', '2020-01-01')}`] });
  assert.equal(r.code, 1, r.out);
});

test('ATTACK: a rationale that names neither the check nor its invariant is not an override', () => {
  const r = runCli({ stub: 'drift:C3', messages: [`work

Consistency-Override: C3 (rationale: known gap tracked in a followup; remediation-deadline: ${SOON})`] });
  assert.equal(r.code, 1, r.out);
});

test('ATTACK: a deadline more than 30 days out is not an override', () => {
  const r = runCli({ stub: 'drift:C3', messages: [`work

${TRAILER('C3', 'known gap tracked in a followup', '2099-01-01')}`] });
  assert.equal(r.code, 1, r.out);
});

test('ATTACK: an empty rationale is not an override', () => {
  const r = runCli({ stub: 'drift:C3', messages: [`work\n\nConsistency-Override: C3 (rationale: ; remediation-deadline: ${SOON})`] });
  assert.equal(r.code, 1, r.out);
});

test('ATTACK: a trailer for a different check does not cover the drift', () => {
  const r = runCli({ stub: 'drift:C3', messages: [`work\n\n${TRAILER('C4', 'known gap', SOON)}`] });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /uncovered: C3/);
});

test('ATTACK: a partial override fails on the check it does not cover', () => {
  const r = runCli({ stub: 'drift:C3,C4', messages: [`work\n\n${TRAILER('C3', 'known gap', SOON)}`] });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /uncovered: C4/);
  const both = runCli({ stub: 'drift:C3,C4', messages: [`work\n\n${TRAILER('C3', 'gap a', SOON)}\n${TRAILER('C4', 'gap b', SOON)}`] });
  assert.equal(both.code, 0, both.out);
});

test('a runner error is exit 2, never a pass and never a drift verdict', () => {
  const r = runCli({ stub: 'error', messages: [`work\n\n${TRAILER('C3', 'known gap', SOON)}`] });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /runner ERROR/);
});

test('the commit judged is the one named: a trailer on an OLDER commit does not cover --commit=HEAD, and does cover a range containing it', () => {
  const messages = ['root', `first

${TRAILER('C3', 'known gap', SOON)}`, 'second, no trailer'];
  const head = runCli({ stub: 'drift:C3', messages, args: ['--commit=HEAD'] });
  assert.equal(head.code, 1, head.out);
  const onlyLast = runCli({ stub: 'drift:C3', messages, args: ['--range=HEAD~1..HEAD'] });
  assert.equal(onlyLast.code, 1, onlyLast.out);
  const whole = runCli({ stub: 'drift:C3', messages, args: ['--range=HEAD~2..HEAD'] });
  assert.equal(whole.code, 0, whole.out);
  assert.match(whole.out, /VALIDLY OVERRIDDEN: C3/);
});

test('the stub manifest names are the real check names (a renamed check must update this test)', () => {
  const files = { C3: 'C3-migrations-reality.mjs', C4: 'C4-worktrees-reality.mjs', C5: 'C5-program-anchors-reality.mjs' };
  for (const [id, file] of Object.entries(files)) {
    const text = readFileSync(join(HERE, 'checks', file), 'utf8');
    assert.ok(text.includes(`name: '${CHECK_NAMES[id]}'`), `${id} is no longer named '${CHECK_NAMES[id]}' in ${file}`);
  }
});
