// RED-THEN-GREEN proof for the memory gate + UX-compliance gate (task 7.8, W9 brief-chain build plan).
// Hermetic: exercises the PURE decision functions (classifyChanged / memoryGateVerdict / uxGateVerdict)
// with injected file lists and diff text, no real git repo, so this needs no fixture range and cannot
// drift from a live checkout's history. Cases are the exact ones the brief names, each mirroring one
// clause of the inline shell this file replaces (.github/workflows/discipline.yml, memory-gate step).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyChanged, memoryGateVerdict, uxGateVerdict } from './memory-gate.mjs';

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

test('classifyChanged: session-log.md and PROGRAM-BOARD.md are MEMORY', () => {
  const r = classifyChanged(['docs/ops/session-log.md', 'docs/PROGRAM-BOARD.md', 'docs/other.md']);
  assert.deepEqual(r.memory, ['docs/ops/session-log.md', 'docs/PROGRAM-BOARD.md']);
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
