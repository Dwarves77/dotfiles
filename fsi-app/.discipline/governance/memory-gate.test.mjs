// RED-THEN-GREEN proof for the memory gate (task 7.8, W9 brief-chain build plan; the UX-compliance half was
// removed by lane GATE-2, 2026-10-08). Hermetic: exercises the PURE decision functions (classifyChanged / memoryGateVerdict)
// with injected file lists and diff text, no real git repo, so this needs no fixture range and cannot
// drift from a live checkout's history. Cases are the exact ones the brief names, each mirroring one
// clause of the inline shell this file replaces (.github/workflows/discipline.yml, memory-gate step).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as memoryGate from './memory-gate.mjs';
import { classifyChanged, memoryGateVerdict } from './memory-gate.mjs';

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// classifyChanged
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('classifyChanged: fsi-app/src file is CODE, not MEMORY', () => {
  const r = classifyChanged(['fsi-app/src/x.ts']);
  assert.deepEqual(r.code, ['fsi-app/src/x.ts']);
  assert.deepEqual(r.memory, []);
});

test('classifyChanged: harness-runs and LAST-TURN.json alone are NOT code', () => {
  const r = classifyChanged([
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json',
    'fsi-app/scripts/turns/LAST-TURN.json',
  ]);
  assert.deepEqual(r.code, []);
});

test('classifyChanged: a real script alongside harness-runs still counts the script as CODE', () => {
  const r = classifyChanged([
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json',
    'fsi-app/scripts/turns/LAST-TURN.json',
    'fsi-app/scripts/turns/record-briefs/schema.mjs',
  ]);
  assert.deepEqual(r.code, ['fsi-app/scripts/turns/record-briefs/schema.mjs']);
});

// D20 (defect-fix-plan-2026-09-12.md, lane L12, 2026-09-13): a record-briefs batch file is lane-emitted
// DATA on an apply-target branch that is never merged (the same posture harness-runs/** and
// turns/LAST-TURN.json already had) -- excluded from CODE, same as those two.
test('classifyChanged: a record-briefs batch file alone is NOT code', () => {
  const r = classifyChanged(['fsi-app/scripts/turns/record-briefs/batches/record-briefs-002.json']);
  assert.deepEqual(r.code, []);
});

test('classifyChanged: a record-briefs batch file alongside a real script still counts the script as CODE', () => {
  const r = classifyChanged([
    'fsi-app/scripts/turns/record-briefs/batches/record-briefs-002.json',
    'fsi-app/scripts/turns/record-briefs/schema.mjs',
  ]);
  assert.deepEqual(r.code, ['fsi-app/scripts/turns/record-briefs/schema.mjs']);
});

test('classifyChanged: session-log.md and PROGRAM-BOARD.md are MEMORY', () => {
  const r = classifyChanged(['docs/ops/session-log.md', 'docs/PROGRAM-BOARD.md', 'docs/other.md']);
  assert.deepEqual(r.memory, ['docs/ops/session-log.md', 'docs/PROGRAM-BOARD.md']);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// D28 (defect-fix-plan-2026-09-12.md, W9 lane L18): docs/ops/session-log.d/YYYY-MM-DD-<slug>.md also
// satisfies MEMORY, so a per-lane-per-day file ends the shared-file rebase conflicts on session-log.md.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('classifyChanged: a docs/ops/session-log.d/YYYY-MM-DD-<slug>.md file is MEMORY', () => {
  const r = classifyChanged(['docs/ops/session-log.d/2026-09-13-l18.md']);
  assert.deepEqual(r.memory, ['docs/ops/session-log.d/2026-09-13-l18.md']);
});

test('classifyChanged: docs/ops/session-log.d/README.md does NOT satisfy MEMORY (no date/slug in the name)', () => {
  const r = classifyChanged(['docs/ops/session-log.d/README.md']);
  assert.deepEqual(r.memory, []);
});

test('classifyChanged: a session-log.d file with a malformed name (no date prefix) does NOT satisfy MEMORY', () => {
  const r = classifyChanged(['docs/ops/session-log.d/l18.md', 'docs/ops/session-log.d/2026-09-13.md']);
  assert.deepEqual(r.memory, []);
});

test('memoryGateVerdict: a range adding ONLY a session-log.d file PASSES', () => {
  const v = memoryGateVerdict(['fsi-app/src/x.ts', 'docs/ops/session-log.d/2026-09-13-l18.md'], { range: 'a..b' });
  assert.equal(v.ok, true);
  assert.equal(v.message, 'memory gate OK');
});

test('memoryGateVerdict: a range with code and NONE of the three vault forms FAILS, and names the session-log.d option', () => {
  const v = memoryGateVerdict(['fsi-app/src/x.ts'], { range: 'a..b' });
  assert.equal(v.ok, false);
  assert.match(v.message, /session-log\.d\/YYYY-MM-DD-<slug>\.md/);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// memoryGateVerdict: the brief's five named cases
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('memoryGateVerdict: fsi-app/src/x.ts with no vault file FAILS', () => {
  const v = memoryGateVerdict(['fsi-app/src/x.ts'], { range: 'a..b' });
  assert.equal(v.ok, false);
  assert.match(v.message, /Memory gate/);
  assert.match(v.message, /a\.\.b/);
});

test('memoryGateVerdict: fsi-app/src/x.ts plus docs/ops/session-log.md PASSES', () => {
  const v = memoryGateVerdict(['fsi-app/src/x.ts', 'docs/ops/session-log.md'], { range: 'a..b' });
  assert.equal(v.ok, true);
  assert.equal(v.message, 'memory gate OK');
});

test('memoryGateVerdict: harness-runs and LAST-TURN.json alone are not code, PASSES with no vault file', () => {
  const v = memoryGateVerdict([
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json',
    'fsi-app/scripts/turns/LAST-TURN.json',
  ]);
  assert.equal(v.ok, true);
});

// D20's own two named cases.
test('memoryGateVerdict: a range touching only a record-briefs batch file PASSES with no vault file', () => {
  const v = memoryGateVerdict(['fsi-app/scripts/turns/record-briefs/batches/record-briefs-002.json']);
  assert.equal(v.ok, true);
});

test('memoryGateVerdict: a record-briefs batch file plus a script change still FAILS without a vault file', () => {
  const v = memoryGateVerdict([
    'fsi-app/scripts/turns/record-briefs/batches/record-briefs-002.json',
    'fsi-app/scripts/turns/record-briefs/schema.mjs',
  ]);
  assert.equal(v.ok, false);
  assert.match(v.message, /Memory gate/);
});

test('memoryGateVerdict: docs-only range PASSES (no code touched at all)', () => {
  const v = memoryGateVerdict(['docs/runbooks/SOME-RUNBOOK.md', 'docs/decisions/ADR-999-x.md']);
  assert.equal(v.ok, true);
});

test('memoryGateVerdict: PROGRAM-BOARD.md alone also satisfies the vault requirement', () => {
  const v = memoryGateVerdict(['fsi-app/src/x.ts', 'docs/PROGRAM-BOARD.md']);
  assert.equal(v.ok, true);
});

test('memoryGateVerdict: empty changed-file list PASSES', () => {
  const v = memoryGateVerdict([]);
  assert.equal(v.ok, true);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// GATE-2 (2026-10-08): the UX-compliance substring gate is gone from the memory gate. It matched the words
// "UX compliance" on an added session-log line and checked no content; the rendering guard is the UX check.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('GATE-2: a .tsx/.css change with a session-log.d entry that has NO "UX compliance" block PASSES', () => {
  for (const surface of ['fsi-app/src/components/Foo.tsx', 'fsi-app/src/app/globals.css']) {
    const v = memoryGateVerdict([surface, 'docs/ops/session-log.d/2026-10-08-gate2.md'], { range: 'a..b' });
    assert.equal(v.ok, true, surface);
    assert.equal(v.message, 'memory gate OK');
  }
});

test('GATE-2: a .tsx change with NO vault entry still FAILS the memory gate (the memory half is intact)', () => {
  const v = memoryGateVerdict(['fsi-app/src/components/Foo.tsx'], { range: 'a..b' });
  assert.equal(v.ok, false);
  assert.match(v.message, /Memory gate/);
});

test('GATE-2: the UX-compliance API is gone, so no caller can still run the substring check', () => {
  assert.equal(memoryGate.uxGateVerdict, undefined);
  assert.equal(memoryGate.memoryDiffPaths, undefined);
  assert.equal(memoryGate.gitMemoryDiffLines, undefined);
  assert.equal('surface' in classifyChanged(['fsi-app/src/components/Foo.tsx']), false);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// Lane R23 item 1 (2026-10-02): the CLI's range argument is now resolved via change-range.mjs's
// resolveRange() when --range is omitted, instead of erroring. Proven directly against resolveRange +
// gitChangedFiles (the same functions the CLI main uses), not by presence.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('resolveRange (as the memory-gate CLI now calls it): BASE_REF+PR_HEAD resolves to the real ' +
  "merge-base, not the branch's own commit sha", async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { resolveRange, gitChangedFiles } = await import('../lib/change-range.mjs');

  const dir = mkdtempSync(join(tmpdir(), 'memory-gate-cli-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git(['init', '-q']);
    git(['config', '--local', 'user.name', 'memory-gate-test']);
    git(['config', '--local', 'user.email', 'memory-gate-test@example.com']);

    writeFileSync(join(dir, 'untouched.ts'), 'v1\n');
    git(['add', 'untouched.ts']);
    git(['commit', '-q', '-m', 'shared history']);
    const forkSha = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/master', forkSha]);
    const trunk = git(['symbolic-ref', '--short', 'HEAD']).trim();

    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(dir, 'docs-ops-session-log.md'), 'lane note\n');
    git(['add', 'docs-ops-session-log.md']);
    git(['commit', '-q', '-m', 'branch: own vault note']);
    const headSha = git(['rev-parse', 'HEAD']).trim();

    // Master advances AFTER the fork, touching a file the branch never touches.
    git(['checkout', '-q', trunk]);
    writeFileSync(join(dir, 'untouched.ts'), 'v2 -- master fix\n');
    git(['add', 'untouched.ts']);
    git(['commit', '-q', '-m', 'master: unrelated change after fork']);
    const masterTipSha = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/master', masterTipSha]);

    const resolved = resolveRange({ env: { BASE_REF: 'master', PR_HEAD: headSha }, cwd: dir });
    assert.equal(resolved.base, forkSha);
    const changed = gitChangedFiles(resolved.range, { cwd: dir });
    assert.deepEqual(changed, ['docs-ops-session-log.md'], 'only the branch\'s own file, never untouched.ts');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
