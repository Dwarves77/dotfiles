// Fire-tests for F27 (producer seam proof).
// Run: node --test fsi-app/.discipline/fitness/functions/F27-producer-seam-proof.test.mjs
//
// Behavioural, in the F23/F25 style: extractSeams / isProducerEntryPoint / the auditSeamCoverage
// comparator are driven with CONSTRUCTED inputs, never only the live repo — a gate tested only against
// the current tree degrades into re-asserting whatever the repo happens to contain today and stops being
// able to state what the RULE is. One assertion at the bottom runs the real gate against the live tree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isSeamScope,
  extractSeams,
  isProducerEntryPoint,
  auditSeamCoverage,
  fitnessFunction,
  SEAM_EXEMPTIONS,
} from './F27-producer-seam-proof.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { globFiles } from '../lib/glob.mjs';

/** Build a fake tree: { path: contents }. Mirrors F25's test tree() helper. */
function tree(map) {
  return { files: Object.keys(map), read: (f) => map[f] };
}

// FIXTURE CONSTRUCTION (same convention as F25's own test, and for the same reason). These tests need
// fixture text that LOOKS like an import statement. `.discipline/glob-portability.test.mjs` scans every
// discipline test's SOURCE TEXT for `from "..."` specifiers — including ones sitting inside a fixture
// string literal in this very file — and flags a bare (non-relative) specifier as a non-portable npm
// import. It cannot tell a real import from fixture data; splitting the keyword avoids the false match
// without changing what the fixture proves.
const IMPORT_OF = (spec) => 'im' + 'port { z } fr' + 'om "' + spec + '";';

// ── isSeamScope ──────────────────────────────────────────────────────────────

test('a src/lib/** module is in seam scope', () => {
  assert.ok(isSeamScope('fsi-app/src/lib/market/write-market-series.mjs'));
});

test('a sibling scripts/producers/** module is in seam scope', () => {
  assert.ok(isSeamScope('fsi-app/scripts/producers/regional/run-envelope-producer.mjs'));
});

test('scripts/lib/** (the guarded I/O boundary) is NEVER in seam scope', () => {
  assert.equal(isSeamScope('fsi-app/scripts/lib/db.mjs'), false);
});

test('a test file is never counted as a seam, even under src/lib/**', () => {
  assert.equal(isSeamScope('fsi-app/src/lib/market/write-market-series.test.mjs'), false);
});

test('null (unresolved / external specifier) is not in seam scope', () => {
  assert.equal(isSeamScope(null), false);
});

// ── extractSeams ─────────────────────────────────────────────────────────────

test('extracts a first-party src/lib import and resolves it repo-relative', () => {
  const t = tree({
    'fsi-app/src/lib/market/parsers/eu-weekly-oil-bulletin.mjs': 'export const x = 1;',
    'fsi-app/scripts/producers/market/eu-weekly-oil-bulletin.mjs':
      '#!/usr/bin/env node\nimport { x } from "../../../src/lib/market/parsers/eu-weekly-oil-bulletin.mjs";',
  });
  const tracked = new Set(t.files);
  const seams = extractSeams(
    'fsi-app/scripts/producers/market/eu-weekly-oil-bulletin.mjs',
    t.read('fsi-app/scripts/producers/market/eu-weekly-oil-bulletin.mjs'),
    tracked,
  );
  assert.deepEqual(seams, ['fsi-app/src/lib/market/parsers/eu-weekly-oil-bulletin.mjs']);
});

test('a sibling producer import is a seam; a scripts/lib import is not', () => {
  const t = tree({
    'fsi-app/scripts/producers/regional/run-envelope-producer.mjs': 'export function runEnvelopeProducer() {}',
    'fsi-app/scripts/lib/db.mjs': 'export function readAll() {}',
    'fsi-app/scripts/producers/regional/bls-oews-producer.mjs':
      '#!/usr/bin/env node\n' +
      'import { runEnvelopeProducer } from "./run-envelope-producer.mjs";\n' +
      'import { readAll } from "../../lib/db.mjs";',
  });
  const tracked = new Set(t.files);
  const seams = extractSeams(
    'fsi-app/scripts/producers/regional/bls-oews-producer.mjs',
    t.read('fsi-app/scripts/producers/regional/bls-oews-producer.mjs'),
    tracked,
  );
  assert.deepEqual(seams, ['fsi-app/scripts/producers/regional/run-envelope-producer.mjs']);
});

test('a bare (npm) package specifier resolves to nothing and is never a seam', () => {
  const t = tree({
    'fsi-app/scripts/producers/market/x.mjs': '#!/usr/bin/env node\n' + IMPORT_OF('some-package'),
  });
  const tracked = new Set(t.files);
  assert.deepEqual(extractSeams('fsi-app/scripts/producers/market/x.mjs', t.read('fsi-app/scripts/producers/market/x.mjs'), tracked), []);
});

test('a module never counts itself as its own seam', () => {
  // Pathological input — a self-referential relative specifier — must not self-loop.
  const t = tree({ 'fsi-app/src/lib/a.mjs': 'import { a } from "./a.mjs";' });
  const tracked = new Set(t.files);
  assert.deepEqual(extractSeams('fsi-app/src/lib/a.mjs', t.read('fsi-app/src/lib/a.mjs'), tracked), []);
});

// ── isProducerEntryPoint ───────────────────────────────────────────────────

test('a shebang-marked script directly under scripts/producers/** IS an entry point', () => {
  assert.ok(isProducerEntryPoint('fsi-app/scripts/producers/market/eu-weekly-oil-bulletin.mjs', '#!/usr/bin/env node\n// ...'));
});

test('a shebang-LESS module under scripts/producers/** is NOT an entry point (it is a shared seam)', () => {
  // run-envelope-producer.mjs's real shape: no shebang, exported functions other producers import.
  assert.equal(
    isProducerEntryPoint('fsi-app/scripts/producers/regional/run-envelope-producer.mjs', '// run-envelope-producer.mjs\nexport function runEnvelopeProducer() {}'),
    false,
  );
});

test('a *.test.mjs file is never an entry point, shebang or not', () => {
  assert.equal(isProducerEntryPoint('fsi-app/scripts/producers/regional/run-envelope-producer.test.mjs', '#!/usr/bin/env node\n'), false);
});

// ── auditSeamCoverage: the comparator's catching behaviour ──────────────────

test('a producer with an uncovered seam set and no proof at all is RED', () => {
  const producers = [{ file: 'fsi-app/scripts/producers/x/p.mjs', seams: ['fsi-app/src/lib/x/a.mjs'] }];
  const problems = auditSeamCoverage(producers, [], []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /NO COMPOSITION PROOF/);
  assert.match(problems[0], /p\.mjs/);
  assert.match(problems[0], /a\.mjs/);
});

// The exact real-world shape this gate exists to catch: two seams, each proven by its OWN proof, never
// proven together.
test('a two-seam producer covered by TWO SEPARATE proofs (each half) is RED — not a composition proof', () => {
  const producers = [{
    file: 'fsi-app/scripts/producers/x/p.mjs',
    seams: ['fsi-app/src/lib/x/parser.mjs', 'fsi-app/src/lib/x/planner.mjs'],
  }];
  const proofs = [
    { file: 'fsi-app/src/__tests__/x-parser.test.mjs', imports: ['fsi-app/src/lib/x/parser.mjs'] },
    { file: 'fsi-app/src/__tests__/x-planner.test.mjs', imports: ['fsi-app/src/lib/x/planner.mjs'] },
  ];
  const problems = auditSeamCoverage(producers, proofs, []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /NO COMPOSITION PROOF/);
});

test('a two-seam producer covered by ONE proof that imports BOTH seams is GREEN', () => {
  const producers = [{
    file: 'fsi-app/scripts/producers/x/p.mjs',
    seams: ['fsi-app/src/lib/x/parser.mjs', 'fsi-app/src/lib/x/planner.mjs'],
  }];
  const proofs = [
    { file: 'fsi-app/src/__tests__/x-parser.test.mjs', imports: ['fsi-app/src/lib/x/parser.mjs'] },
    {
      file: 'fsi-app/src/__tests__/x-composition.test.mjs',
      imports: ['fsi-app/src/lib/x/parser.mjs', 'fsi-app/src/lib/x/planner.mjs'],
    },
  ];
  assert.deepEqual(auditSeamCoverage(producers, proofs, []), []);
});

test('a producer with NO first-party seams (pure I/O shell) is never a violation', () => {
  const producers = [{ file: 'fsi-app/scripts/producers/x/shell.mjs', seams: [] }];
  assert.deepEqual(auditSeamCoverage(producers, [], []), []);
});

// ── the reverse audit: exemptions must shrink, never grandfather ────────────

test('an exemption naming a producer that no longer exists is RED (stale)', () => {
  const problems = auditSeamCoverage([], [], [{ file: 'fsi-app/scripts/producers/x/gone.mjs', reason: 'r', remedy: 'm' }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALE EXEMPTION/);
  assert.match(problems[0], /no longer exists/);
});

test('an exemption whose producer now imports no seams is RED (stale)', () => {
  const producers = [{ file: 'fsi-app/scripts/producers/x/p.mjs', seams: [] }];
  const problems = auditSeamCoverage(producers, [], [{ file: 'fsi-app/scripts/producers/x/p.mjs', reason: 'r', remedy: 'm' }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALE EXEMPTION/);
  assert.match(problems[0], /pure I\/O shell/);
});

// The half that makes it shrink rather than grandfather: an exemption whose gap got FIXED must go red
// until the entry is removed, exactly the F25 "now HAS a production importer" idiom one layer over.
test('an exemption whose seam set GAINED a covering proof is RED (it got fixed — remove the entry)', () => {
  const producers = [{
    file: 'fsi-app/scripts/producers/x/p.mjs',
    seams: ['fsi-app/src/lib/x/a.mjs', 'fsi-app/src/lib/x/b.mjs'],
  }];
  const proofs = [{
    file: 'fsi-app/src/__tests__/x.test.mjs',
    imports: ['fsi-app/src/lib/x/a.mjs', 'fsi-app/src/lib/x/b.mjs'],
  }];
  const problems = auditSeamCoverage(producers, proofs, [{ file: 'fsi-app/scripts/producers/x/p.mjs', reason: 'r', remedy: 'm' }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALE EXEMPTION/);
  assert.match(problems[0], /got fixed/);
});

test('a genuinely still-uncovered exemption passes silently (no violation) while it stays uncovered', () => {
  const producers = [{
    file: 'fsi-app/scripts/producers/x/p.mjs',
    seams: ['fsi-app/src/lib/x/a.mjs', 'fsi-app/src/lib/x/b.mjs'],
  }];
  const proofs = [{ file: 'fsi-app/src/__tests__/x-a.test.mjs', imports: ['fsi-app/src/lib/x/a.mjs'] }];
  assert.deepEqual(
    auditSeamCoverage(producers, proofs, [{ file: 'fsi-app/scripts/producers/x/p.mjs', reason: 'r', remedy: 'm' }]),
    [],
  );
});

test('an exemption without reason + remedy is RED', () => {
  const producers = [{ file: 'fsi-app/scripts/producers/x/p.mjs', seams: ['fsi-app/src/lib/x/a.mjs'] }];
  const problems = auditSeamCoverage(producers, [], [{ file: 'fsi-app/scripts/producers/x/p.mjs', reason: 'r' }]);
  assert.ok(problems.some((p) => /EXEMPTION WITHOUT A REASON/.test(p)));
});

// ── shape ─────────────────────────────────────────────────────────────────

test('F27 is holistic: one sentinel so the seam analysis runs exactly once', () => {
  assert.equal(fitnessFunction.enumerate().length, 1);
});

test('every shipped exemption carries a reason and a remedy', () => {
  assert.ok(SEAM_EXEMPTIONS.every((e) => e.file && e.reason && e.remedy));
});

test('the shipped exemption list has no duplicate files', () => {
  const files = SEAM_EXEMPTIONS.map((e) => e.file);
  assert.equal(new Set(files).size, files.length);
});

// ── live tree: the gate is clean today ───────────────────────────────────────

test('F27 passes GREEN against the live tree', () => {
  const result = fitnessFunction.check();
  if (result.length !== 0) {
    assert.fail(`F27 is RED against the live tree:\n${result.map((v) => `  - ${v.message}`).join('\n')}`);
  }
});

// Sanity: the market composition proof this same change adds is what makes the market entry point
// GREEN — if it is ever deleted, this catches the regression directly rather than only via the summary.
test('eu-weekly-oil-bulletin.mjs is covered by market-producer-composition.test.mjs specifically', () => {
  const root = getRepoRoot();
  const tracked = new Set(globFiles(['fsi-app/src/**/*.mjs', 'fsi-app/scripts/**/*.mjs']));
  const producerFile = 'fsi-app/scripts/producers/market/eu-weekly-oil-bulletin.mjs';
  const producerContent = readFileSync(join(root, producerFile), 'utf8');
  const seams = extractSeams(producerFile, producerContent, tracked);
  assert.ok(seams.length >= 3, 'expected eu-weekly-oil-bulletin.mjs to import multiple first-party seams');

  const proofFile = 'fsi-app/src/__tests__/market-producer-composition.test.mjs';
  const proofContent = readFileSync(join(root, proofFile), 'utf8');
  const covered = new Set(extractSeams(proofFile, proofContent, tracked));
  for (const s of seams) assert.ok(covered.has(s), `market-producer-composition.test.mjs does not import seam ${s}`);
});
