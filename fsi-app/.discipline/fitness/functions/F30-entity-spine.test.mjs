// Fire-tests for F30 (entity spine text-keyed-site ratchet).
// Run: node --test fsi-app/.discipline/fitness/functions/F30-entity-spine.test.mjs
//
// Behavioural, in the F15/F22/F23/F24 style: countPatterns/compareToBaseline are exercised against
// CONSTRUCTED file maps and baselines, never against the live tree. A gate tested only against the
// current repo degrades into re-asserting whatever the repo happens to contain, and stops being able to
// say what the rule IS.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PATTERNS,
  BASELINE_COUNTS,
  stripComments,
  countPatterns,
  compareToBaseline,
  fitnessFunction,
} from './F30-entity-spine.mjs';

test('PATTERNS/BASELINE_COUNTS have exactly the same five keys', () => {
  assert.deepEqual(Object.keys(PATTERNS).sort(), Object.keys(BASELINE_COUNTS).sort());
});

test('stripComments removes block and line comments so a doc-comment MENTIONING a pattern is not counted', () => {
  const src = [
    '// old: .eq("jurisdiction_iso", "US") is wrong, array column',
    '/* .eq("canonical_instrument_key", key) — migrate to instrument_entity_id */',
    'const x = 1;',
  ].join('\n');
  const stripped = stripComments(src);
  assert.doesNotMatch(stripped, /jurisdiction_iso/);
  assert.doesNotMatch(stripped, /canonical_instrument_key/);
  assert.match(stripped, /const x = 1;/);
});

test('countPatterns: finds a real .eq("jurisdiction_iso", ...) call site and reports its path:line', () => {
  const files = [{ path: 'src/a.ts', content: 'const q = db.from("t").eq("jurisdiction_iso", "US");' }];
  const { counts, sites } = countPatterns(files);
  assert.equal(counts.jurisdiction_iso_eq, 1);
  assert.deepEqual(sites.jurisdiction_iso_eq, ['src/a.ts:1']);
  assert.equal(counts.jurisdiction_iso_contains, 0);
});

test('countPatterns: ignores the SAME text inside a comment (a doc-comment describing the old shape does not count)', () => {
  const files = [{ path: 'src/a.ts', content: '// .eq("jurisdiction_iso", "US") — the old, wrong shape\nconst y = 2;' }];
  const { counts } = countPatterns(files);
  assert.equal(counts.jurisdiction_iso_eq, 0);
});

test('countPatterns: counts .contains("jurisdiction_iso", ...), .eq("canonical_instrument_key", ...), .eq("source_url", ...), and new URL(...).host/.hostname, independently, across files', () => {
  const files = [
    { path: 'a.ts', content: 'db.from("t").contains("jurisdiction_iso", ["US"]);' },
    { path: 'b.ts', content: 'db.from("t").eq("canonical_instrument_key", key);' },
    { path: 'c.ts', content: 'db.from("t").eq("source_url", url);' },
    { path: 'd.ts', content: 'const h = new URL(url).host; const h2 = new URL(url).hostname;' },
  ];
  const { counts } = countPatterns(files);
  assert.equal(counts.jurisdiction_iso_contains, 1);
  assert.equal(counts.canonical_instrument_key_eq, 1);
  assert.equal(counts.source_url_eq, 1);
  assert.equal(counts.url_host_derivation, 2);
});

test('countPatterns: multiple occurrences across multiple files all counted, line numbers correct for a later occurrence', () => {
  const files = [
    { path: 'a.ts', content: 'x();\ny();\ndb.eq("source_url", u);' },
    { path: 'b.ts', content: 'db.eq("source_url", v);' },
  ];
  const { counts, sites } = countPatterns(files);
  assert.equal(counts.source_url_eq, 2);
  assert.deepEqual(sites.source_url_eq.sort(), ['a.ts:3', 'b.ts:1']);
});

// ── compareToBaseline: ONE-DIRECTIONAL (unlike F23's bidirectional GAP_BASELINE) ─────────────────────

test('compareToBaseline: equal to baseline passes', () => {
  const baseline = { source_url_eq: 2 };
  const { problems, deltas } = compareToBaseline({ source_url_eq: 2 }, { source_url_eq: [] }, baseline);
  assert.deepEqual(problems, []);
  assert.equal(deltas.source_url_eq, 0);
});

test('compareToBaseline: BELOW baseline (improvement) passes — this ratchet is one-directional, unlike F23', () => {
  const baseline = { source_url_eq: 2 };
  const { problems, deltas } = compareToBaseline({ source_url_eq: 0 }, { source_url_eq: [] }, baseline);
  assert.deepEqual(problems, [], 'a migrated-away site must never fail the gate');
  assert.equal(deltas.source_url_eq, -2);
});

test('compareToBaseline: ABOVE baseline (regression) fails, names the pattern, count, delta, and offending sites', () => {
  const baseline = { source_url_eq: 2 };
  const { problems } = compareToBaseline(
    { source_url_eq: 3 },
    { source_url_eq: ['a.ts:1', 'b.ts:9', 'new-site.ts:42'] },
    baseline,
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /REGRESSION/);
  assert.match(problems[0], /"source_url_eq"/);
  assert.match(problems[0], /3 text-keyed site\(s\), baseline 2 \(\+1\)/);
  assert.match(problems[0], /new-site\.ts:42/);
});

test('compareToBaseline: a new site added on a ZERO-baseline pattern (jurisdiction_iso_eq) is caught, not silently allowed', () => {
  const baseline = { jurisdiction_iso_eq: 0 };
  const { problems } = compareToBaseline({ jurisdiction_iso_eq: 1 }, { jurisdiction_iso_eq: ['x.ts:5'] }, baseline);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /REGRESSION/);
  assert.match(problems[0], /jurisdiction_iso_eq/);
});

test('compareToBaseline: caps the offending-site list at 10 and notes truncation', () => {
  const sites = Array.from({ length: 15 }, (_, i) => `f${i}.ts:1`);
  const { problems } = compareToBaseline({ source_url_eq: 15 }, { source_url_eq: sites }, { source_url_eq: 2 });
  assert.match(problems[0], /f9\.ts:1/);
  assert.doesNotMatch(problems[0].split(', …')[0], /f10\.ts:1/);
  assert.match(problems[0], /…/);
});

test('compareToBaseline: multiple patterns regress independently, one problem message per pattern', () => {
  const baseline = { source_url_eq: 2, url_host_derivation: 13 };
  const { problems } = compareToBaseline(
    { source_url_eq: 3, url_host_derivation: 13 },
    { source_url_eq: ['x.ts:1'], url_host_derivation: [] },
    baseline,
  );
  assert.equal(problems.length, 1, 'only source_url_eq regressed');
  assert.match(problems[0], /source_url_eq/);
});

// ── fitnessFunction shape ────────────────────────────────────────────────────────────────────────────

test('fitnessFunction: id F30, holistic (single-sentinel enumerate)', () => {
  assert.equal(fitnessFunction.id, 'F30');
  assert.equal(fitnessFunction.name, 'entity-spine');
  const files = fitnessFunction.enumerate();
  assert.equal(files.length, 1);
  assert.equal(files[0], 'fsi-app/.discipline/fitness/functions/F30-entity-spine.mjs');
});

test('fitnessFunction.check(): runs against the LIVE tree and passes (or reports only real regressions) — smoke test, not a behavioural proof', () => {
  const problems = fitnessFunction.check();
  // This is intentionally weak: it proves check() runs end-to-end (globs the tree, reads files, strips
  // comments, compares) without throwing. The behavioural claims above (what counts, what fails, what
  // the message says) are proven against constructed input, not the live tree, per this file's header.
  assert.ok(Array.isArray(problems));
});
