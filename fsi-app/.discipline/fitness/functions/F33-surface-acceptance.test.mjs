// Fire-tests for F33 (surface acceptance).
// Run: node --test fsi-app/.discipline/fitness/functions/F33-surface-acceptance.test.mjs
//
// Behavioural, in the F25/F30 style: auditSurfaceAcceptance/invertToForward/isReachable are driven with
// CONSTRUCTED fixtures, never the live repo — a gate tested only against the current repo degrades into
// re-asserting whatever the repo happens to contain and stops being able to state what the rule IS. The
// final block proves the SHIPPED register against the SHIPPED SPEC_SURFACES list actually passes, which
// is the live-repo check this file's other tests deliberately avoid making load-bearing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditSurfaceAcceptance,
  invertToForward,
  isReachable,
  SPEC_SURFACES,
  fitnessFunction,
} from './F33-surface-acceptance.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));

const SPEC_A = { id: 'a', name: 'Surface A', basis: 'docs/specs/aa.md §1' };
const SPEC_B = { id: 'b', name: 'Surface B', basis: 'docs/specs/bb.md §2' };

const ALWAYS_TRUE_ENV = { fileExists: () => true, canReach: () => true };

// ── invertToForward / isReachable ────────────────────────────────────────────

test('invertToForward turns target->importers into importer->targets', () => {
  const importsMap = new Map([['x.ts', new Set(['a.ts', 'b.ts'])]]);
  const forward = invertToForward(importsMap);
  assert.deepEqual([...forward.get('a.ts')], ['x.ts']);
  assert.deepEqual([...forward.get('b.ts')], ['x.ts']);
});

test('isReachable finds a direct edge', () => {
  const forward = new Map([['route.tsx', new Set(['data.ts'])]]);
  assert.equal(isReachable('route.tsx', 'data.ts', forward), true);
});

test('isReachable finds a transitive path', () => {
  const forward = new Map([
    ['route.tsx', new Set(['mid.ts'])],
    ['mid.ts', new Set(['data.ts'])],
  ]);
  assert.equal(isReachable('route.tsx', 'data.ts', forward), true);
});

test('isReachable is false when no path exists', () => {
  const forward = new Map([['route.tsx', new Set(['other.ts'])]]);
  assert.equal(isReachable('route.tsx', 'data.ts', forward), false);
});

test('isReachable does not loop forever on a cycle', () => {
  const forward = new Map([
    ['route.tsx', new Set(['mid.ts'])],
    ['mid.ts', new Set(['route.tsx'])],
  ]);
  assert.equal(isReachable('route.tsx', 'data.ts', forward), false);
});

// ── auditSurfaceAcceptance: missing / unknown entries ───────────────────────

test('a spec-named surface with no register entry is RED', () => {
  const problems = auditSurfaceAcceptance([SPEC_A], [], ALWAYS_TRUE_ENV);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /MISSING REGISTER ENTRY/);
  assert.match(problems[0], /"a"/);
});

test('a register entry naming an id not in SPEC_SURFACES is RED', () => {
  const entry = { id: 'ghost', route: 'r', data_path: 'd', rendering_spec: 's' };
  const problems = auditSurfaceAcceptance([SPEC_A], [entry], ALWAYS_TRUE_ENV);
  assert.ok(problems.some((p) => /UNKNOWN SURFACE/.test(p) && /ghost/.test(p)));
});

// ── auditSurfaceAcceptance: the triple ───────────────────────────────────────

test('a complete, existing, reachable triple passes', () => {
  const entry = { id: 'a', route: 'r', data_path: 'd', rendering_spec: 's' };
  const problems = auditSurfaceAcceptance([SPEC_A], [entry], ALWAYS_TRUE_ENV);
  assert.deepEqual(problems, []);
});

test('an entry missing all three of route/data_path/rendering_spec, with no exemption, is RED', () => {
  const entry = { id: 'a' };
  const problems = auditSurfaceAcceptance([SPEC_A], [entry], ALWAYS_TRUE_ENV);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /INCOMPLETE ENTRY/);
  assert.match(problems[0], /route, data_path, rendering_spec/);
});

test('an entry missing only rendering_spec is RED and names exactly the missing field', () => {
  const entry = { id: 'a', route: 'r', data_path: 'd' };
  const problems = auditSurfaceAcceptance([SPEC_A], [entry], ALWAYS_TRUE_ENV);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /INCOMPLETE ENTRY/);
  assert.match(problems[0], /rendering_spec/);
  assert.doesNotMatch(problems[0], /route,/);
});

test('a triple whose route file does not exist is RED', () => {
  const entry = { id: 'a', route: 'missing.tsx', data_path: 'd', rendering_spec: 's' };
  const env = { fileExists: (p) => p !== 'missing.tsx', canReach: () => true };
  const problems = auditSurfaceAcceptance([SPEC_A], [entry], env);
  assert.ok(problems.some((p) => /MISSING FILE/.test(p) && /missing\.tsx/.test(p)));
});

test('a triple whose data_path file does not exist is RED', () => {
  const entry = { id: 'a', route: 'r', data_path: 'missing.ts', rendering_spec: 's' };
  const env = { fileExists: (p) => p !== 'missing.ts', canReach: () => true };
  const problems = auditSurfaceAcceptance([SPEC_A], [entry], env);
  assert.ok(problems.some((p) => /MISSING FILE/.test(p) && /missing\.ts/.test(p)));
});

test('a triple whose rendering_spec file does not exist is RED', () => {
  const entry = { id: 'a', route: 'r', data_path: 'd', rendering_spec: 'missing.mjs' };
  const env = { fileExists: (p) => p !== 'missing.mjs', canReach: () => true };
  const problems = auditSurfaceAcceptance([SPEC_A], [entry], env);
  assert.ok(problems.some((p) => /MISSING FILE/.test(p) && /missing\.mjs/.test(p)));
});

test('an existing route+data_path pair the route cannot reach is RED (verified by graph, not name)', () => {
  const entry = { id: 'a', route: 'r', data_path: 'd', rendering_spec: 's' };
  const env = { fileExists: () => true, canReach: () => false };
  const problems = auditSurfaceAcceptance([SPEC_A], [entry], env);
  assert.ok(problems.some((p) => /UNREACHABLE DATA PATH/.test(p)));
});

// ── auditSurfaceAcceptance: exemptions ───────────────────────────────────────

test('a well-formed exemption passes with no triple', () => {
  const entry = { id: 'a', exemption: { reason: 'not built', ruled_by: 'operator', date: '2026-09-02' } };
  const problems = auditSurfaceAcceptance([SPEC_A], [entry], ALWAYS_TRUE_ENV);
  assert.deepEqual(problems, []);
});

test('an exemption missing reason/ruled_by/date is RED, one message per missing field', () => {
  const entry = { id: 'a', exemption: {} };
  const problems = auditSurfaceAcceptance([SPEC_A], [entry], ALWAYS_TRUE_ENV);
  assert.equal(problems.length, 3);
  assert.ok(problems.every((p) => /EMPTY EXEMPTION/.test(p)));
});

test('an entry with BOTH a full triple AND an exemption is RED (contradictory)', () => {
  const entry = {
    id: 'a',
    route: 'r',
    data_path: 'd',
    rendering_spec: 's',
    exemption: { reason: 'x', ruled_by: 'y', date: 'z' },
  };
  const problems = auditSurfaceAcceptance([SPEC_A], [entry], ALWAYS_TRUE_ENV);
  assert.ok(problems.some((p) => /CONTRADICTORY ENTRY/.test(p)));
});

test('two surfaces, one built one exempt, both pass independently', () => {
  const entries = [
    { id: 'a', route: 'r', data_path: 'd', rendering_spec: 's' },
    { id: 'b', exemption: { reason: 'x', ruled_by: 'y', date: 'z' } },
  ];
  const problems = auditSurfaceAcceptance([SPEC_A, SPEC_B], entries, ALWAYS_TRUE_ENV);
  assert.deepEqual(problems, []);
});

// ── shape ─────────────────────────────────────────────────────────────────

test('F33 is holistic: one sentinel so the graph is built exactly once', () => {
  assert.equal(fitnessFunction.enumerate().length, 1);
});

test('every SPEC_SURFACES entry carries an id, a name and a basis', () => {
  assert.ok(SPEC_SURFACES.length > 0, 'the surface list is explicit, not empty');
  assert.ok(SPEC_SURFACES.every((s) => s.id && s.name && s.basis));
});

test('SPEC_SURFACES has no duplicate ids', () => {
  const ids = SPEC_SURFACES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ── the shipped register, read from disk, against the shipped SPEC_SURFACES — the one test in this
//    file that touches the real repo, deliberately isolated from the pure-logic tests above. ──────
test('the shipped register satisfies auditSurfaceAcceptance against SPEC_SURFACES (ids only; file/reach checks stubbed true here — file()s own check() proves those against the real filesystem)', () => {
  const registerPath = join(HERE, '..', 'surface-acceptance-register.json');
  const json = JSON.parse(readFileSync(registerPath, 'utf8'));
  assert.ok(Array.isArray(json.surfaces) && json.surfaces.length > 0);
  const problems = auditSurfaceAcceptance(SPEC_SURFACES, json.surfaces, ALWAYS_TRUE_ENV);
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the shipped register has no duplicate surface ids', () => {
  const registerPath = join(HERE, '..', 'surface-acceptance-register.json');
  const json = JSON.parse(readFileSync(registerPath, 'utf8'));
  const ids = json.surfaces.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});
