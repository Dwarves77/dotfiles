// Tests for the derived fitness manifest (plan 6.8, Rule A): the live load off the real functions/
// directory, the duplicate-id refusal, and the id/filename-mismatch refusal, both against temp fixture
// directories so they do not touch the real registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fitnessFunctions, getFunctionById, loadAll } from './manifest.mjs';

function fixtureFn(id) {
  return (
    `export const fitnessFunction = {\n` +
    `  id: '${id}',\n` +
    `  name: 'fixture ${id}',\n` +
    `  description: 'fixture for manifest.test.mjs',\n` +
    `  source: 'test',\n` +
    `  enumerate: () => [],\n` +
    `  check: () => [],\n` +
    `};\n`
  );
}

function makeFixtureDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'fitness-manifest-fixture-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

test('live load: fitnessFunctions is derived from the real functions/ directory', () => {
  assert.ok(Array.isArray(fitnessFunctions));
  assert.ok(fitnessFunctions.length > 0, 'expected at least one fitness function loaded');
  for (const fn of fitnessFunctions) {
    assert.equal(typeof fn.id, 'string');
    assert.match(fn.id, /^F\d+$/);
    assert.equal(typeof fn.check, 'function');
    assert.equal(typeof fn.enumerate, 'function');
  }
  // sorted by numeric id
  const numericId = (id) => Number(id.slice(1));
  for (let i = 1; i < fitnessFunctions.length; i++) {
    assert.ok(
      numericId(fitnessFunctions[i].id) > numericId(fitnessFunctions[i - 1].id),
      `expected ascending numeric ids, got ${fitnessFunctions[i - 1].id} then ${fitnessFunctions[i].id}`,
    );
  }
  // no duplicate ids
  assert.equal(new Set(fitnessFunctions.map((f) => f.id)).size, fitnessFunctions.length);
});

test('getFunctionById finds a real function and returns undefined for an unknown id', () => {
  const first = fitnessFunctions[0];
  assert.equal(getFunctionById(first.id), first);
  assert.equal(getFunctionById('F999999'), undefined);
});

test('duplicate-id refusal: two files exporting the same fitnessFunction.id throw a named error', async () => {
  const dir = makeFixtureDir({
    'F1-alpha.mjs': fixtureFn('F1'),
    'F1-beta.mjs': fixtureFn('F1'),
  });
  try {
    await assert.rejects(
      () => loadAll(dir, pathToFileURL(dir + '/')),
      (err) => {
        assert.match(err.message, /duplicate fitness function id "F1"/);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('id/filename-mismatch refusal: a file whose fitnessFunction.id does not match its filename prefix throws, naming the file', async () => {
  const dir = makeFixtureDir({
    'F2-mismatch.mjs': fixtureFn('F3'),
  });
  try {
    await assert.rejects(
      () => loadAll(dir, pathToFileURL(dir + '/')),
      (err) => {
        assert.match(err.message, /F2-mismatch\.mjs/);
        assert.match(err.message, /does not match its/);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a *.test.mjs file in the functions directory is excluded from the load', async () => {
  const dir = makeFixtureDir({
    'F4-ok.mjs': fixtureFn('F4'),
    'F4-ok.test.mjs': 'export const fitnessFunction = { id: "F4", name: "wrong" };\n',
  });
  try {
    const loaded = await loadAll(dir, pathToFileURL(dir + '/'));
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].name, 'fixture F4');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
