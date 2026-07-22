// @ts-check
// Red-then-green for F17 (size-cap doctrine). A NEW unregistered cap constant on the path is RED; registered
// caps are clean; an override suppresses. Plus: the real CAP_REGISTRY carries NO silent-binding grounding cap,
// and the shipped path files pass clean (the category-2 defect stays dead).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, CAP_REGISTRY, PATH_FILES } from './F17-size-cap-doctrine.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

test('RED: a new UNREGISTERED cap constant on the path is flagged with file:line', () => {
  const src = 'export const STORAGE_MAX_CHARS = 10000000;\nexport const SNEAKY_SECTION_MAX_CHARS = Number(process.env.X || 8000);';
  const v = fitnessFunction.check('fsi-app/src/lib/agent/generation-config.ts', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 2);
  assert.match(v[0].message, /SNEAKY_SECTION_MAX_CHARS[\s\S]*CAP_REGISTRY/);
});

test('GREEN: a registered cap is clean', () => {
  const src = 'export const STORAGE_MAX_CHARS = Number(process.env.STORAGE_MAX_CHARS || 10000000);';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/agent/generation-config.ts', src), []);
});

test('override: a trailing `// fitness-allow: F17 (reason)` suppresses a new cap', () => {
  const src = 'export const NEW_THING_MAX_CHARS = 5000; // fitness-allow: F17 (one-off, classified in follow-up)';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/agent/generation-config.ts', src), []);
});

test('non-path files are ignored', () => {
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/other.ts', 'export const FOO_MAX_CHARS = 10;'), []);
});

test('DOCTRINE: the real CAP_REGISTRY carries NO silent-binding grounding cap', () => {
  for (const [name, e] of Object.entries(CAP_REGISTRY)) {
    assert.ok(e.status === 'surfaced' || e.status === 'never-binds', `${name} must be surfaced or never-binds, got ${e.status}`);
    assert.ok(e.why && e.why.length > 10, `${name} needs a classification reason`);
  }
});

test('LIVE: the shipped path files pass F17 clean (category-2 defect stays dead)', () => {
  for (const f of PATH_FILES) {
    const content = readFileSync(resolve(REPO_ROOT, f), 'utf8');
    assert.deepEqual(fitnessFunction.check(f, content), [], `${f} must pass F17`);
  }
});
