// Fire-tests for F26 (storage-ceiling parity).
// Run: node --test fsi-app/.discipline/fitness/functions/F26-storage-ceiling-parity.test.mjs
//
// Behavioural, in the F15/F22/F23/F24/F25 style: the comparator is driven with CONSTRUCTED file
// bodies, never the live repo. A gate tested only against the current repo degrades into
// re-asserting whatever the repo happens to contain and stops being able to state what the rule IS.
//
// This is the RED half standing rule 15 demands. The live green — 21 functions / 0 violations — only
// proves the current repo satisfies the rule. It cannot prove the gate would FIRE if the repo
// stopped satisfying it, and a gate that cannot be shown to fail is indistinguishable from a gate
// that does nothing. Every test below that asserts a violation is that proof.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditCeilingParity,
  readCeiling,
  fitnessFunction,
  NEXT_CONFIG,
  WORKER,
  ENV_NAME,
  LOUD_MARKERS,
} from './F26-storage-ceiling-parity.mjs';

// ── fixture builders ────────────────────────────────────────────────────────
// Deliberately minimal: only the lines the gate reads. Anything more would make a passing test
// depend on prose that has nothing to do with the rule.

const nextSrc = (literal = '10_000_000') =>
  `export const STORAGE_MAX_CHARS = Number(process.env.STORAGE_MAX_CHARS || ${literal});\n`;

/** A worker body that is loud by default; drop markers to build the silent-ceiling cases. */
const workerSrc = (literal = '10_000_000', { warn = true, flag = true } = {}) =>
  [
    `const STORAGE_MAX_CHARS = Number(Deno.env.get("STORAGE_MAX_CHARS") || ${literal});`,
    warn ? 'console.warn(`[truncation-guard] capture-worker: collected/full`);' : '',
    flag ? 'await supabase.from("integrity_flags").insert({ category: "coverage_gap" });' : '',
  ]
    .filter(Boolean)
    .join('\n') + '\n';

// ── the green baseline ──────────────────────────────────────────────────────

test('agreeing literals + a loud worker PASS', () => {
  assert.deepEqual(auditCeilingParity(nextSrc(), workerSrc()), []);
});

test('the literals may be any value, so long as BOTH sides move together', () => {
  // Parity, not a magic number: raising the ceiling is legitimate, raising it on one side is not.
  assert.deepEqual(auditCeilingParity(nextSrc('20_000_000'), workerSrc('20_000_000')), []);
});

test('underscore separators are normalised, so 10_000_000 and 10000000 agree', () => {
  assert.deepEqual(auditCeilingParity(nextSrc('10_000_000'), workerSrc('10000000')), []);
});

// ── THE RED: divergence ─────────────────────────────────────────────────────
// This is the attack that was run by hand against the live worker on 2026-08-17 (literal moved to
// 5_000_000 → DIVERGED; reverted → PASS). Encoding it here is what makes that proof repeatable.

test('a literal bumped on the WORKER side only is RED', () => {
  const problems = auditCeilingParity(nextSrc('10_000_000'), workerSrc('5_000_000'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /DIVERGED/);
  assert.match(problems[0], /10000000/);
  assert.match(problems[0], /5000000/);
});

test('a literal bumped on the NEXT side only is RED (the rule is symmetric)', () => {
  const problems = auditCeilingParity(nextSrc('50_000_000'), workerSrc('10_000_000'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /DIVERGED/);
});

// Order-independence is the reason this function is holistic rather than per-file. The first draft
// carried a module-level Map to pass the first file's reading to the second, which made the verdict
// depend on enumeration order; these two assertions are what forbid regressing to that.
test('the divergence verdict does not depend on which side is read first', () => {
  const a = auditCeilingParity(nextSrc('10_000_000'), workerSrc('5_000_000'));
  const b = auditCeilingParity(nextSrc('10_000_000'), workerSrc('5_000_000'));
  assert.deepEqual(a, b);
  assert.equal(a.length, 1);
});

// ── THE RED: the ceiling removed or reshaped ────────────────────────────────

test('a worker with NO ceiling at all is RED — the exact pre-fix state', () => {
  const problems = auditCeilingParity(nextSrc(), 'const MIN_BYTES = 1000;\n');
  assert.equal(problems.length, 1);
  assert.match(problems[0], new RegExp(WORKER.replace(/[/.]/g, '\\$&')));
  assert.match(problems[0], /does not resolve STORAGE_MAX_CHARS/);
});

test('a hard-coded worker ceiling (no env read) is RED — a literal is the divergence itself', () => {
  const problems = auditCeilingParity(nextSrc(), 'const STORAGE_MAX_CHARS = 10_000_000;\n');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /does not resolve STORAGE_MAX_CHARS/);
});

test('a worker reading a DIFFERENT env var name is RED', () => {
  const worker = 'const STORAGE_MAX_CHARS = Number(Deno.env.get("MAX_CHARS") || 10_000_000);\n';
  const problems = auditCeilingParity(nextSrc(), worker);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /does not resolve STORAGE_MAX_CHARS/);
});

test('the NEXT side losing its env read is RED too', () => {
  const problems = auditCeilingParity('export const STORAGE_MAX_CHARS = 10_000_000;\n', workerSrc());
  assert.equal(problems.length, 1);
  assert.match(problems[0], new RegExp(NEXT_CONFIG.replace(/[/.]/g, '\\$&')));
});

test('both sides missing reports BOTH, not just the first', () => {
  const problems = auditCeilingParity('', '');
  assert.equal(problems.length, 2);
});

// ── THE RED: a ceiling that binds SILENTLY ──────────────────────────────────
// The class this half exists for: a silent ceiling satisfies parity perfectly and still slices the
// grounding pool. Presence is necessary and never sufficient (standing rule 15).

test('a worker ceiling with no [truncation-guard] warning is RED', () => {
  const problems = auditCeilingParity(nextSrc(), workerSrc('10_000_000', { warn: false }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /truncation-guard/);
  assert.match(problems[0], /LOUD ON BIND/);
});

test('a worker ceiling that never writes integrity_flags is RED', () => {
  const problems = auditCeilingParity(nextSrc(), workerSrc('10_000_000', { flag: false }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /integrity_flags/);
  assert.match(problems[0], /operator/);
});

test('a fully silent ceiling reports BOTH loudness failures', () => {
  const problems = auditCeilingParity(nextSrc(), workerSrc('10_000_000', { warn: false, flag: false }));
  assert.equal(problems.length, 2);
});

// A worker with no ceiling is already RED for absence; it must not ALSO be dinged for silence, or
// the message would tell the reader to make a ceiling loud that does not exist yet.
test('loudness is only demanded of a worker that actually declares the ceiling', () => {
  const problems = auditCeilingParity(nextSrc(), 'const MIN_BYTES = 1000;\n');
  assert.equal(problems.length, 1);
  assert.doesNotMatch(problems[0], /truncation-guard/);
});

// ── the reader ──────────────────────────────────────────────────────────────

test('readCeiling returns the normalised number, or null when the form is absent', () => {
  assert.equal(readCeiling('next', nextSrc('10_000_000')), 10000000);
  assert.equal(readCeiling('worker', workerSrc('2_500')), 2500);
  assert.equal(readCeiling('worker', nextSrc()), null, 'the next-side form is not a worker-side form');
  assert.equal(readCeiling('next', workerSrc()), null, 'and vice versa');
  assert.equal(readCeiling('next', undefined), null);
});

// ── shape ───────────────────────────────────────────────────────────────────

test('F26 is holistic: one sentinel so the pair is compared exactly once', () => {
  assert.equal(fitnessFunction.enumerate().length, 1);
});

test('F26 declares its identity and cites its source', () => {
  assert.equal(fitnessFunction.id, 'F26');
  assert.equal(fitnessFunction.name, 'storage-ceiling-parity');
  assert.match(fitnessFunction.source, /ADR-016/);
  assert.ok(fitnessFunction.description.includes(ENV_NAME));
});

test('every loudness marker carries a why, so a violation is actionable', () => {
  assert.ok(LOUD_MARKERS.length > 0);
  assert.ok(LOUD_MARKERS.every((m) => m.re instanceof RegExp && typeof m.why === 'string' && m.why.length > 20));
});
