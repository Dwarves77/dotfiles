// Tests for the override-aware consistency primitive (g1/g1b): drift parsing + VALID override parsing
// (non-empty rationale + future deadline) + the pure verdict + pre-push stdin range parsing.
// Run: node --test fsi-app/.discipline/consistency/override-check.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseDriftCheckIds,
  parseValidOverrides,
  invariantTerms,
  namesInvariant,
  MAX_DEADLINE_DAYS,
  evaluate,
  messagesFromPrepushStdin,
  messagesForRange,
} from './override-check.mjs';
import { resolveRange } from '../lib/change-range.mjs';

const NOW = new Date('2026-07-11T12:00:00Z');

test('parseDriftCheckIds: pulls C-ids from stderr drift lines only', () => {
  const stderr = '=== Consistency drift ===\n\n  [C3] missing-claim\n        detail\n  [C4] orphan\n';
  assert.deepEqual([...parseDriftCheckIds(stderr)].sort(), ['C3', 'C4']);
});

test('parseValidOverrides: a non-empty rationale + FUTURE deadline is valid', () => {
  const msg = 'subject\n\nConsistency-Override: C3 (rationale: migration lands next PR; remediation-deadline: 2026-08-01)';
  assert.deepEqual([...parseValidOverrides([msg], { now: NOW })], ['C3']);
});

test('parseValidOverrides: accepts the C-3 hyphen form, normalizes to C3', () => {
  const msg = 'Consistency-Override: C-4 (rationale: worktree cleanup pending; remediation-deadline: 2026-08-05)';
  assert.deepEqual([...parseValidOverrides([msg], { now: NOW })], ['C4']);
});

test('parseValidOverrides: an EXPIRED deadline is NOT a valid override', () => {
  const msg = 'Consistency-Override: C3 (rationale: stale; remediation-deadline: 2026-01-01)';
  assert.deepEqual([...parseValidOverrides([msg], { now: NOW })], []);
});

test('parseValidOverrides: today counts as valid (>= today)', () => {
  const msg = 'Consistency-Override: C3 (rationale: C3 fixing today in this PR; remediation-deadline: 2026-07-11)';
  assert.deepEqual([...parseValidOverrides([msg], { now: NOW })], ['C3']);
});

test('parseValidOverrides: EMPTY rationale is rejected', () => {
  const msg = 'Consistency-Override: C3 (rationale: ; remediation-deadline: 2026-08-01)';
  assert.deepEqual([...parseValidOverrides([msg], { now: NOW })], []);
});

// ---- GATE-FIX-2 (aud-at3 line 528): a rationale must name the invariant, a deadline must be near ----
const trailer = (rationale, deadline, id = 'C3') => `Consistency-Override: ${id} (rationale: ${rationale}; remediation-deadline: ${deadline})`;
const validIds = (msg) => [...parseValidOverrides([msg], { now: NOW })];

test('GATE-FIX-2 ATTACK: rationale "because" with a 2030 date is refused (the brief attack)', () => {
  assert.deepEqual(validIds(trailer('because', '2030-01-01')), []);
});
test('GATE-FIX-2 ATTACK: the audit attack, rationale "x" and 2099, is refused', () => {
  assert.deepEqual(validIds(trailer('x', '2099-01-01')), []);
});
test('GATE-FIX-2 ATTACK: a good rationale with a date a year out is refused', () => {
  assert.deepEqual(validIds(trailer('migrations inventory row lands in the next PR', '2027-07-11')), []);
});
test('GATE-FIX-2: the 30 day boundary is inclusive and day 31 is refused', () => {
  const r = 'migrations inventory row lands in the next PR';
  const d = (n) => new Date(Date.UTC(2026, 6, 11 + n)).toISOString().slice(0, 10);
  assert.equal(MAX_DEADLINE_DAYS, 30);
  assert.deepEqual(validIds(trailer(r, d(30))), ['C3']);
  assert.deepEqual(validIds(trailer(r, d(31))), []);
});
test('GATE-FIX-2 ATTACK: a rationale that names no invariant is refused even with a near date', () => {
  assert.deepEqual(validIds(trailer('will fix this later on', '2026-07-20')), []);
  assert.deepEqual(validIds(trailer('because', '2026-07-20')), []);
});
test('GATE-FIX-2 ATTACK: a one-word rationale that does name the invariant is still not a sentence', () => {
  assert.deepEqual(validIds(trailer('C3', '2026-07-20')), []);
  assert.deepEqual(validIds(trailer('migrations', '2026-07-20')), []);
});
test('GATE-FIX-2: the invariant is named by the check id (either spelling) or by a word of the check name', () => {
  assert.deepEqual(validIds(trailer('C3 drift is owned by the follow-up lane', '2026-07-20')), ['C3']);
  assert.deepEqual(validIds(trailer('C-3 drift is owned by the follow-up lane', '2026-07-20', 'C-3')), ['C3']);
  assert.deepEqual(validIds(trailer('the migration inventory is regenerated post merge', '2026-07-20')), ['C3']);
  assert.deepEqual(validIds(trailer('worktrees listing is stale until cleanup', '2026-07-20', 'C4')), ['C4']);
  assert.deepEqual(validIds(trailer('program anchors move with the next phase', '2026-07-20', 'C5')), ['C5']);
});
test('GATE-FIX-2 ATTACK: naming ANOTHER check invariant does not cover this check', () => {
  assert.deepEqual(validIds(trailer('worktrees listing is stale until cleanup', '2026-07-20', 'C3')), []);
  assert.equal(namesInvariant('C4 drift is owned elsewhere', 'C3'), false);
  assert.equal(namesInvariant('C13 drift is owned elsewhere', 'C3'), false, 'C13 is not C3');
});
test('GATE-FIX-2: invariantTerms come from the manifest names', () => {
  assert.deepEqual(invariantTerms('C3'), ['migrations']);
  assert.deepEqual(invariantTerms('C4'), ['worktrees']);
  assert.deepEqual(invariantTerms('C99'), []);
});
test('GATE-FIX-2: evaluate refuses the audit-line-528 override end to end (drift stays uncovered)', () => {
  const v = evaluate({ runnerStatus: 1, stderr: '  [C3] missing-claim\n', messages: [trailer('x', '2099-01-01')], now: NOW });
  assert.equal(v.ok, false);
  assert.deepEqual(v.uncovered, ['C3']);
});

test('evaluate: clean runner (status 0) passes with no drift', () => {
  const v = evaluate({ runnerStatus: 0, stderr: '', messages: [], now: NOW });
  assert.equal(v.ok, true);
  assert.deepEqual(v.failing, []);
});

test('evaluate: drift with NO override FAILS (uncovered)', () => {
  const v = evaluate({ runnerStatus: 1, stderr: '  [C3] missing-claim\n', messages: ['no trailer'], now: NOW });
  assert.equal(v.ok, false);
  assert.deepEqual(v.uncovered, ['C3']);
});

test('evaluate: drift with a matching VALID override PASSES', () => {
  const msg = 'Consistency-Override: C3 (rationale: C3 migrations inventory fix lands next; remediation-deadline: 2026-08-01)';
  const v = evaluate({ runnerStatus: 1, stderr: '  [C3] missing-claim\n', messages: [msg], now: NOW });
  assert.equal(v.ok, true);
  assert.deepEqual(v.uncovered, []);
});

test('evaluate: PARTIAL override (C3 covered, C4 not) FAILS on the uncovered one', () => {
  const msg = 'Consistency-Override: C3 (rationale: C3 migrations inventory fix lands next; remediation-deadline: 2026-08-01)';
  const v = evaluate({ runnerStatus: 1, stderr: '  [C3] x\n  [C4] y\n', messages: [msg], now: NOW });
  assert.equal(v.ok, false);
  assert.deepEqual(v.uncovered, ['C4']);
});

test('evaluate: runner ERROR (status 2) is not passable', () => {
  const v = evaluate({ runnerStatus: 2, stderr: '', messages: [], now: NOW });
  assert.equal(v.ok, false);
  assert.equal(v.runnerError, true);
});

test('messagesFromPrepushStdin: deleting a ref (zero local sha) yields nothing', () => {
  const stdin = 'refs/heads/x 0000000000000000000000000000000000000000 refs/heads/x abc123\n';
  assert.deepEqual(messagesFromPrepushStdin(stdin, process.cwd()), []);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// Lane R23 item 1 (2026-10-02): the CLI's default branch now resolves its range via change-range.mjs's
// resolveRange() instead of trusting a caller-built --range string, so a CI-PR caller (BASE_REF+PR_HEAD
// env, no --range flag) reads only ITS OWN branch's commit messages, never messages from commits master
// gained after the fork (proven directly here, not by presence).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'override-check-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', '--local', 'user.name', 'override-check-test']);
  git(['config', '--local', 'user.email', 'override-check-test@example.com']);
  return { dir, git };
}

function commit(git, message) {
  git(['commit', '-q', '-m', message]);
  return git(['rev-parse', 'HEAD']).trim();
}

test('CLI default branch (BASE_REF+PR_HEAD, no --range): resolveRange + messagesForRange reads only ' +
  "the branch's own commit messages, not a commit master gained after the fork", () => {
  const { dir, git } = makeRepo();
  try {
    writeFileSync(join(dir, 'a.txt'), 'base\n');
    git(['add', 'a.txt']);
    const forkSha = commit(git, 'shared history');
    git(['update-ref', 'refs/remotes/origin/master', forkSha]);
    const trunk = git(['symbolic-ref', '--short', 'HEAD']).trim();

    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(dir, 'b.txt'), 'branch work\n');
    git(['add', 'b.txt']);
    const headSha = commit(
      git,
      'branch: own work\n\nConsistency-Override: C3 (rationale: known gap; remediation-deadline: 2099-01-01)'
    );

    // Master advances on its own line AFTER the fork, with a commit that must NOT be visible to the PR.
    git(['checkout', '-q', trunk]);
    writeFileSync(join(dir, 'a.txt'), 'fixed on master\n');
    git(['add', 'a.txt']);
    const masterTipSha = commit(git, 'master: unrelated fix, must not leak into the PR range');
    git(['update-ref', 'refs/remotes/origin/master', masterTipSha]);

    const resolved = resolveRange({ env: { BASE_REF: 'master', PR_HEAD: headSha }, cwd: dir });
    assert.equal(resolved.base, forkSha);
    const messages = messagesForRange(resolved.range, dir);
    assert.equal(messages.length, 1, 'exactly one commit message: the branch\'s own, not master\'s post-fork commit');
    assert.ok(messages[0].includes('Consistency-Override: C3'));
    assert.ok(!messages.some((m) => m.includes('must not leak')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI default branch, no BASE_REF/PR_HEAD, no --range: falls back to the local merge-base range ' +
  '(same shape runner.mjs/F51 use)', () => {
  const { dir, git } = makeRepo();
  try {
    writeFileSync(join(dir, 'a.txt'), 'base\n');
    git(['add', 'a.txt']);
    const baseSha = commit(git, 'base');
    git(['update-ref', 'refs/remotes/origin/master', baseSha]);
    writeFileSync(join(dir, 'b.txt'), 'second\n');
    git(['add', 'b.txt']);
    commit(git, 'second: local work, no trailer');

    const resolved = resolveRange({ env: {}, cwd: dir });
    assert.equal(resolved.source, 'local-merge-base');
    assert.equal(resolved.base, baseSha);
    const messages = messagesForRange(resolved.range, dir);
    assert.deepEqual(messages, ['second: local work, no trailer']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── lane GATE-9 (2026-10-08, AUD-AT-5 gate-script neuter row): the CLI's EXIT STATUS, not only its output ──────
test("GATE-9 exit status: override-check.mjs exits 0 on a clean tree, and its source maps runner error to 2, a valid verdict to 0, uncovered drift to 1", async () => {
  const { spawnSync } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { withoutCredentials } = await import("../../scripts/lib/env-file.mjs");
  const script = fileURLToPath(new URL("./override-check.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [script, "--commit=HEAD"], { encoding: "utf8", env: withoutCredentials() });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /consistency runner clean|VALIDLY OVERRIDDEN/);
  const src = readFileSync(script, "utf8");
  assert.deepEqual([...src.matchAll(/process\.exit\(([^)]*)\)/g)].map((m) => m[1]), ["2", "0", "1"]);
  assert.match(src, /runner\.status === 2\) \{[\s\S]*?process\.exit\(2\);\s*\}/, "a runner error is exit 2");
  assert.match(src, /if \(verdict\.ok\) \{[\s\S]*?process\.exit\(0\);\s*\}[\s\S]*?uncovered consistency drift[\s\S]*?process\.exit\(1\);/, "0 only inside the ok verdict, 1 after the uncovered-drift report");
  assert.doesNotMatch(src, /process\.exit\s*=[^=]|process\.exitCode\s*=/, "the exit status is never reassigned");
});
