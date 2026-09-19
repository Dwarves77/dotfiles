// RED-THEN-GREEN proof for the memory gate + UX-compliance gate (task 7.8, W9 brief-chain build plan).
// Hermetic: exercises the PURE decision functions (classifyChanged / memoryGateVerdict / uxGateVerdict)
// with injected file lists and diff text, no real git repo, so this needs no fixture range and cannot
// drift from a live checkout's history. Cases are the exact ones the brief names, each mirroring one
// clause of the inline shell this file replaces (.github/workflows/discipline.yml, memory-gate step).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyChanged, memoryGateVerdict, uxGateVerdict, memoryDiffPaths } from './memory-gate.mjs';

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// classifyChanged
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('classifyChanged: fsi-app/src file is CODE, not MEMORY or SURFACE', () => {
  const r = classifyChanged(['fsi-app/src/x.ts']);
  assert.deepEqual(r.code, ['fsi-app/src/x.ts']);
  assert.deepEqual(r.memory, []);
  assert.deepEqual(r.surface, []);
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

test('classifyChanged: .tsx and .css under fsi-app/src are SURFACE, other extensions are not', () => {
  const r = classifyChanged([
    'fsi-app/src/components/Foo.tsx',
    'fsi-app/src/app/globals.css',
    'fsi-app/src/lib/util.ts',
  ]);
  assert.deepEqual(r.surface, ['fsi-app/src/components/Foo.tsx', 'fsi-app/src/app/globals.css']);
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
// uxGateVerdict
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('uxGateVerdict: .tsx change with a session-log diff lacking "UX compliance" FAILS', () => {
  const diff = ['diff --git a/docs/ops/session-log.md b/docs/ops/session-log.md', '+some unrelated line'];
  const v = uxGateVerdict(['fsi-app/src/components/Foo.tsx'], diff, { range: 'a..b' });
  assert.equal(v.applicable, true);
  assert.equal(v.ok, false);
  assert.match(v.message, /UX compliance gate/);
});

test('uxGateVerdict: .tsx change with an added "UX compliance" line PASSES', () => {
  const diff = ['+### UX compliance (task 7.8)', '+Not applicable: no .tsx/.css touched.'];
  const v = uxGateVerdict(['fsi-app/src/components/Foo.tsx'], diff, { range: 'a..b' });
  assert.equal(v.applicable, true);
  assert.equal(v.ok, true);
  assert.equal(v.message, 'UX compliance gate OK');
});

test('uxGateVerdict: a REMOVED "UX compliance" line (context/deleted, not added) does not satisfy the gate', () => {
  const diff = ['-### UX compliance (old)', ' unrelated context line'];
  const v = uxGateVerdict(['fsi-app/src/components/Foo.tsx'], diff, { range: 'a..b' });
  assert.equal(v.ok, false);
});

test('uxGateVerdict: docs-only range (no surface files) is NOT APPLICABLE, no message', () => {
  const v = uxGateVerdict(['docs/runbooks/SOME-RUNBOOK.md'], []);
  assert.equal(v.applicable, false);
  assert.equal(v.ok, true);
  assert.equal(v.message, null);
});

test('uxGateVerdict: .css change also gates on the UX compliance block', () => {
  const v = uxGateVerdict(['fsi-app/src/app/globals.css'], [], { range: 'a..b' });
  assert.equal(v.applicable, true);
  assert.equal(v.ok, false);
});

// review-7.8.md finding F2, coordinator ruling D6: the failure message must use the original shell's
// single Unicode ellipsis glyph (U+2026), byte-identical, not three ASCII periods.
test('uxGateVerdict: failure message ends the file sample with the single ellipsis glyph U+2026', () => {
  const v = uxGateVerdict(['fsi-app/src/components/Foo.tsx', 'fsi-app/src/app/globals.css'], [], { range: 'a..b' });
  assert.equal(v.ok, false);
  assert.ok(v.message.includes('…'), 'message must contain U+2026');
  assert.ok(!v.message.includes('...'), 'message must not contain the three-ASCII-period placeholder');
  assert.equal(v.message.match(/…/g).length, 1, 'exactly one ellipsis glyph');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// memoryDiffPaths (lane D28b, 2026-09-19): the UX-compliance check was fed only docs/ops/session-log.md's
// own diff by the CLI main, so a lane writing its UX block into its own docs/ops/session-log.d/ file
// (D28's own fix) was refused at push. This is the pure function the CLI now uses to pick every path
// whose diff should be combined and handed to uxGateVerdict.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('memoryDiffPaths: the shared file and two per-lane files returns all three, shared first', () => {
  const r = memoryDiffPaths([
    'fsi-app/src/x.ts',
    'docs/ops/session-log.d/2026-09-19-l38.md',
    'docs/ops/session-log.md',
    'docs/ops/session-log.d/2026-09-19-d28b.md',
  ]);
  assert.deepEqual(r, [
    'docs/ops/session-log.md',
    'docs/ops/session-log.d/2026-09-19-l38.md',
    'docs/ops/session-log.d/2026-09-19-d28b.md',
  ]);
});

test('memoryDiffPaths: only a per-lane file present returns just it', () => {
  const r = memoryDiffPaths(['fsi-app/src/x.ts', 'docs/ops/session-log.d/2026-09-19-l38.md']);
  assert.deepEqual(r, ['docs/ops/session-log.d/2026-09-19-l38.md']);
});

test('memoryDiffPaths: the README and a malformed session-log.d name are excluded', () => {
  const r = memoryDiffPaths([
    'docs/ops/session-log.d/README.md',
    'docs/ops/session-log.d/l18.md',
    'docs/ops/session-log.d/2026-09-13.md',
  ]);
  assert.deepEqual(r, []);
});

test('memoryDiffPaths: no vault file present returns an empty array', () => {
  const r = memoryDiffPaths(['fsi-app/src/x.ts']);
  assert.deepEqual(r, []);
});

test('uxGateVerdict PASSES when the only added "UX compliance" line comes from a per-lane file diff, ' +
  'combined the way the CLI now builds it', () => {
  // The CLI concatenates `git diff <range> -- <path>` output for every memoryDiffPaths() path, in order.
  // docs/ops/session-log.md's own diff (present, but with no UX compliance line) comes first, then the
  // per-lane file's diff (which does carry the block), mirroring a real lane like L38 or D28b.
  const sharedDiffLines = [
    'diff --git a/docs/ops/session-log.md b/docs/ops/session-log.md',
    '+## 2026-09-19, coordinator: landing notes',
    '+unrelated line, no compliance block here',
  ];
  const perLaneDiffLines = [
    'diff --git a/docs/ops/session-log.d/2026-09-19-d28b.md b/docs/ops/session-log.d/2026-09-19-d28b.md',
    '+## 2026-09-19, W9 lane D28b: fix',
    '+### UX compliance (d28b)',
    '+Not a UI change; no customer surface touched by this branch.',
  ];
  const combined = [...sharedDiffLines, ...perLaneDiffLines];
  const v = uxGateVerdict(['fsi-app/src/components/Foo.tsx'], combined, { range: 'a..b' });
  assert.equal(v.applicable, true);
  assert.equal(v.ok, true);
  assert.equal(v.message, 'UX compliance gate OK');
});
