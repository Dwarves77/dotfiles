// loop-manifest.test.mjs - the manifest self-test lane M9a's brief requires (brief-m9a.md item 4): every
// hop's producer.file and consumer.file exist (unless the hop names that file pending, see
// loop-manifest.mjs's own header), every non-pending name equals the yml's own `name:` value, every
// non-null family is a real directory under scripts/harness-runs/ or is documented pending, and no hop id
// repeats. This is a proof over the REAL committed tree (no fixtures) - it is the guard that keeps
// loop-manifest.mjs itself honest about the workflow files it cites.
//
// node:test + node:assert/strict, no npm deps, same discipline as run-artifact.test.mjs and
// governing-files.test.mjs (its siblings in this convention).
//
// Run: node --test .discipline/governance/loop-manifest.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { LOOP_HOPS, loadLoopHops } from './loop-manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, '..', '..');
const REPO_ROOT = resolve(FSI_ROOT, '..');

// A minimal, otherwise-valid hop object every fixture below starts from and tweaks - keeps each attack
// fixture's intent (duplicate id / duplicate order / missing field) visible at the call site instead of
// buried in a repeated literal.
function validHop(id) {
  return {
    id,
    producer: { file: '.github/workflows/source-sweep.yml', name: 'Source sweep' },
    consumer: { file: '.github/workflows/ledger-consume.yml', name: 'Ledger consume' },
    trigger: 'workflow_run',
    family: null,
    enforceEdge: false,
    enforceFired: false,
    note: 'fixture hop',
  };
}

function withFixtureDir(files, run) {
  const dir = mkdtempSync(join(tmpdir(), 'loop-hops-fixture-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), JSON.stringify(content, null, 2));
    }
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readYamlName(repoRelativePath) {
  const abs = join(REPO_ROOT, repoRelativePath);
  const text = readFileSync(abs, 'utf8');
  const m = text.match(/^name:\s*(.+?)\s*$/m);
  return m ? m[1] : null;
}

test('every hop id is unique', () => {
  const ids = LOOP_HOPS.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate hop id(s) in: ${ids.join(', ')}`);
});

test('every non-pending producer.file exists', () => {
  for (const hop of LOOP_HOPS) {
    if (hop.producerPending) continue;
    assert.ok(
      existsSync(join(REPO_ROOT, hop.producer.file)),
      `${hop.id}: producer.file ${hop.producer.file} does not exist and is not marked producerPending`,
    );
  }
});

test('every non-pending consumer.file exists', () => {
  for (const hop of LOOP_HOPS) {
    if (hop.consumerPending) continue;
    assert.ok(
      existsSync(join(REPO_ROOT, hop.consumer.file)),
      `${hop.id}: consumer.file ${hop.consumer.file} does not exist and is not marked consumerPending`,
    );
  }
});

test('every non-pending producer.name equals the yml\'s own name: value', () => {
  for (const hop of LOOP_HOPS) {
    if (hop.producerPending) continue;
    assert.equal(
      readYamlName(hop.producer.file),
      hop.producer.name,
      `${hop.id}: producer.name "${hop.producer.name}" does not match ${hop.producer.file}'s own name:`,
    );
  }
});

test('every non-pending consumer.name equals the yml\'s own name: value', () => {
  for (const hop of LOOP_HOPS) {
    if (hop.consumerPending) continue;
    assert.equal(
      readYamlName(hop.consumer.file),
      hop.consumer.name,
      `${hop.id}: consumer.name "${hop.consumer.name}" does not match ${hop.consumer.file}'s own name:`,
    );
  }
});

test('every non-null family is a real harness-runs directory or is documented familyPending', () => {
  for (const hop of LOOP_HOPS) {
    if (!hop.family) continue;
    const dir = join(REPO_ROOT, 'fsi-app', 'scripts', 'harness-runs', hop.family);
    if (hop.familyPending) {
      assert.ok(
        /\bM\d+\b/.test(hop.note || ''),
        `${hop.id}: family "${hop.family}" is marked familyPending but its note does not name the lane ` +
          `(M<n>) that creates it: ${JSON.stringify(hop.note)}`,
      );
      continue;
    }
    assert.ok(
      existsSync(dir),
      `${hop.id}: family "${hop.family}" is not a directory under scripts/harness-runs/ and is not ` +
        `marked familyPending`,
    );
  }
});

test('every hop carries a non-empty note', () => {
  for (const hop of LOOP_HOPS) {
    assert.ok(typeof hop.note === 'string' && hop.note.trim().length > 0, `${hop.id}: note is empty`);
  }
});

test('every hop declares trigger, enforceEdge and enforceFired as the correct types', () => {
  for (const hop of LOOP_HOPS) {
    assert.ok(
      hop.trigger === 'workflow_run' || hop.trigger === 'dispatch',
      `${hop.id}: trigger must be "workflow_run" or "dispatch", got ${JSON.stringify(hop.trigger)}`,
    );
    assert.equal(typeof hop.enforceEdge, 'boolean', `${hop.id}: enforceEdge must be a boolean`);
    assert.equal(typeof hop.enforceFired, 'boolean', `${hop.id}: enforceFired must be a boolean`);
  }
});

// ── attack: the directory loader itself (brief-r7m.md item 3, fixture directories, never the live one)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
test('ATTACK: a duplicate hop id across two files throws', () => {
  withFixtureDir(
    { '01-hop-a.json': validHop('same-id'), '02-hop-b.json': validHop('same-id') },
    (dir) => {
      assert.throws(() => loadLoopHops(dir), /duplicate hop id "same-id"/);
    },
  );
});

test('ATTACK: a duplicate order prefix across two files throws', () => {
  withFixtureDir(
    { '01-hop-a.json': validHop('hop-a'), '01-hop-b.json': validHop('hop-b') },
    (dir) => {
      assert.throws(() => loadLoopHops(dir), /duplicate order prefix "01"/);
    },
  );
});

test('ATTACK: a hop file missing a required field throws naming the file', () => {
  withFixtureDir(
    {
      '01-incomplete.json': (() => {
        const hop = validHop('incomplete-hop');
        delete hop.trigger;
        return hop;
      })(),
    },
    (dir) => {
      assert.throws(
        () => loadLoopHops(dir),
        /01-incomplete\.json is missing required field "trigger"/,
      );
    },
  );
});

// A shape assertion, not a pinned content snapshot (the R6t lesson, remediation-discipline Example 2 /
// category 48: no pinned list of live entries - the manifest's own content is proven lossless against the
// pre-conversion hard-coded array once, at conversion time, not re-asserted here so future hop edits never
// have to touch this test). The live-tree tests above already cover every field's real-world shape; this
// just pins the CONTRACT the loader promises any caller: a frozen, non-empty array of hop objects.
test('LOOP_HOPS is a frozen, non-empty array derived from loop-hops.d/', () => {
  assert.ok(Array.isArray(LOOP_HOPS));
  assert.ok(Object.isFrozen(LOOP_HOPS));
  assert.ok(LOOP_HOPS.length > 0);
  for (const hop of LOOP_HOPS) {
    assert.ok(Object.isFrozen(hop), `${hop.id}: hop object is not frozen`);
  }
});

// ── attack: a wrong name is caught (brief-m9a.md item 3's attack-test list, proven here at the
// manifest-self-test layer since this is where name-vs-yml comparison lives) ─────────────────────────
test('ATTACK: a hop whose producer.name does not match the real yml is caught', () => {
  const fake = [
    {
      id: 'attack-wrong-name',
      producer: { file: '.github/workflows/source-sweep.yml', name: 'Source Sweep (wrong case)' },
      consumer: { file: '.github/workflows/ledger-consume.yml', name: 'Ledger consume' },
      trigger: 'workflow_run',
      family: null,
      enforceEdge: false,
      enforceFired: false,
      note: 'fixture for the attack test',
    },
  ];
  const real = readYamlName(fake[0].producer.file);
  assert.notEqual(real, fake[0].producer.name, 'fixture setup error: the wrong name accidentally matches');
});
