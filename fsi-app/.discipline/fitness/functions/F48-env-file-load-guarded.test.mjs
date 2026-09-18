// Red-then-green for F48 (env-file-load-guarded). An UNGUARDED process.loadEnvFile in a live script under
// fsi-app/scripts/** is RED; the try-wrapped forms already used across the tree are GREEN; the archived
// and scratch trees are out of scope. See the function's own header for the defect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction, findUnguardedEnvLoads, inScope } from './F48-env-file-load-guarded.mjs';
import { readFile } from '../lib/file-content.mjs';

const CALL = 'process.loadEnvFile(resolve(ROOT, ".env.local"));';

test('RED: a bare top-level load is flagged with its line', () => {
  const src = `import { resolve } from "node:path";\nconst ROOT = "x";\n${CALL}\nconst EXECUTE = true;\n`;
  assert.deepEqual(findUnguardedEnvLoads(src), [3]);
  const v = fitnessFunction.check('fsi-app/scripts/remediation/refetch-capped-worklist.mjs', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 3);
  assert.match(v[0].message, /ENOENT/);
});

test('GREEN: the one-line guarded form and the multi-line try form are not flagged', () => {
  const one = `try { ${CALL} } catch { /* CI: env injected */ }\n`;
  const multi = `async function main() {\n  try {\n    ${CALL}\n  } catch {\n  }\n}\n`;
  const withBlank = `try {\n\n    ${CALL}\n} catch {}\n`;
  assert.deepEqual(findUnguardedEnvLoads(one), []);
  assert.deepEqual(findUnguardedEnvLoads(multi), []);
  assert.deepEqual(findUnguardedEnvLoads(withBlank), []);
  assert.equal(fitnessFunction.check('fsi-app/scripts/x.mjs', one + multi).length, 0);
});

test('GREEN: comment-only mentions are not live calls', () => {
  const src = `// an unguarded ${CALL} would crash here\n * ${CALL}\n`;
  assert.deepEqual(findUnguardedEnvLoads(src), []);
});

test('scope: archived, reground and scratch trees and test files are excluded; live scripts are in', () => {
  assert.equal(inScope('fsi-app/scripts/_archive/phase2-reconcile.mjs'), false);
  assert.equal(inScope('fsi-app/scripts/_reground/lease.mjs'), false);
  assert.equal(inScope('fsi-app/scripts/tmp/t5-check-item.mjs'), false);
  assert.equal(inScope('fsi-app/scripts/lib/db.test.mjs'), false);
  assert.equal(inScope('fsi-app/scripts/remediation/refetch-capped-worklist.mjs'), true);
});

test('LIVE: no live script under fsi-app/scripts carries an unguarded load', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.length > 50, `expected a real scan, got ${files.length} files`);
  const red = [];
  for (const f of files) {
    const v = fitnessFunction.check(f, readFile(f));
    if (v.length) red.push(`${f}:${v.map((x) => x.line).join(',')}`);
  }
  assert.deepEqual(red, [], `unguarded env loads: ${red.join(' ')}`);
});
