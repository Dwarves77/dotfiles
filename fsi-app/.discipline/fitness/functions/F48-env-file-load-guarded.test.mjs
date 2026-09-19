// Red-then-green for F48 (env-file-load-guarded, one home since lane T2). Each of the three checks is
// proven by attack: a planted violation is RED with its line, the sanctioned form is GREEN, and the live
// tree is clean. See the function's own header for the two defects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitnessFunction, findBareEnvLoads, findUnswitchedCredentialStrips, findAmbientCredentialAssertions, inScope, inTestScope, ENV_FILE_HOME,
} from './F48-env-file-load-guarded.mjs';
import { readFile } from '../lib/file-content.mjs';

const CALL = 'process.loadEnvFile(resolve(ROOT, ".env.local"));';

test('(a) RED: a bare top-level load is flagged with its line', () => {
  const src = `import { resolve } from "node:path";\nconst ROOT = "x";\n${CALL}\nconst EXECUTE = true;\n`;
  assert.deepEqual(findBareEnvLoads(src), [3]);
  const v = fitnessFunction.check('fsi-app/scripts/remediation/refetch-capped-worklist.mjs', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 3);
  assert.match(v[0].message, /one home/);
});

test('(a) RED: the L41 try-wrapped forms are no longer a pass (the T2 defect lived inside them)', () => {
  const one = `try { ${CALL} } catch { /* CI: env injected */ }\n`;
  const multi = `async function main() {\n  try {\n    ${CALL}\n  } catch {\n  }\n}\n`;
  assert.deepEqual(findBareEnvLoads(one), [1]);
  assert.deepEqual(findBareEnvLoads(multi), [3]);
  assert.equal(fitnessFunction.check('fsi-app/scripts/x.mjs', one + multi).length, 2);
});

test('(a) GREEN: the sanctioned call and comment-only mentions are not live calls', () => {
  const src = `import { loadLocalEnvFile } from "../lib/env-file.mjs";\nloadLocalEnvFile();\n// an unguarded ${CALL} would crash here\n * ${CALL}\n`;
  assert.deepEqual(findBareEnvLoads(src), []);
  assert.equal(fitnessFunction.check('fsi-app/scripts/x.mjs', src).length, 0);
});

test('(a) scope: the home itself, the archived, reground and scratch trees and test files are out; live scripts under scripts and src are in', () => {
  assert.equal(inScope(ENV_FILE_HOME), false);
  assert.equal(inScope('fsi-app/scripts/_archive/phase2-reconcile.mjs'), false);
  assert.equal(inScope('fsi-app/scripts/_reground/lease.mjs'), false);
  assert.equal(inScope('fsi-app/scripts/tmp/t5-check-item.mjs'), false);
  assert.equal(inScope('fsi-app/src/_archive/lib/d3/hooks-reconstruction.mjs'), false);
  assert.equal(inScope('fsi-app/scripts/lib/db.test.mjs'), false);
  assert.equal(inScope('fsi-app/scripts/remediation/refetch-capped-worklist.mjs'), true);
  assert.equal(inScope('fsi-app/src/lib/trust.selftest.mjs'), false);
  assert.equal(inTestScope('fsi-app/scripts/lib/db.test.mjs'), true);
  assert.equal(inTestScope('fsi-app/src/__tests__/market-ecb-fx-parser.test.mjs'), true);
  assert.equal(inTestScope('fsi-app/scripts/_archive/x.test.mjs'), false);
});

test('(b) RED: a test that strips a credential by hand without withoutCredentials() is flagged, each strip line', () => {
  const src = `const env = { ...process.env };\ndelete env.NEXT_PUBLIC_SUPABASE_URL;\ndelete env.SUPABASE_SERVICE_ROLE_KEY;\nspawnSync(x, [], { env });\n`;
  assert.deepEqual(findUnswitchedCredentialStrips(src), [2, 3]);
  const v = fitnessFunction.check('fsi-app/scripts/producers/market/x.test.mjs', src);
  assert.equal(v.length, 2);
  assert.match(v[0].message, /withoutCredentials/);
  const objForm = `spawnSync(x, [], { env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: undefined, DATABASE_URL: "" } });\n`;
  assert.deepEqual(findUnswitchedCredentialStrips(objForm), [1]);
});

test('(b) GREEN: the same test built on withoutCredentials() passes', () => {
  const src = `import { withoutCredentials } from "../../lib/env-file.mjs";\nconst env = withoutCredentials();\nspawnSync(x, [], { env });\n`;
  assert.deepEqual(findUnswitchedCredentialStrips(src), []);
  assert.equal(fitnessFunction.check('fsi-app/scripts/producers/market/x.test.mjs', src).length, 0);
});

test('(b) GREEN: a strip in a file with no spawn call is not flagged (lane T2: data-public-surface-slugs.test.mjs unit-tests a pure function in-process, no child to hand credentials back to)', () => {
  const src = `const prior = process.env.SUPABASE_SERVICE_ROLE_KEY;\ndelete process.env.SUPABASE_SERVICE_ROLE_KEY;\nassert.equal(isServiceSupabaseConfigured(), false);\n`;
  assert.deepEqual(findUnswitchedCredentialStrips(src), []);
  assert.equal(fitnessFunction.check('fsi-app/src/lib/x.test.mjs', src).length, 0);
});

test('(c) RED: a spawning test that asserts a credentials refusal on an inherited environment is flagged', () => {
  const src = `const res = spawnSync(process.execPath, [P], { env: { ...process.env } });\nassert.equal(res.status, 1);\nassert.match(res.stderr, /DB creds/);\n`;
  assert.deepEqual(findAmbientCredentialAssertions(src), [3]);
  const v = fitnessFunction.check('fsi-app/scripts/producers/market/x.test.mjs', src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /inherited/);
});

test('(c) GREEN: no spawn means no ambient child; a pure unit assertion about creds is not flagged; the helper clears it', () => {
  const pure = `assert.match(decideApply({}).reason, /DB creds/);\n`;
  assert.deepEqual(findAmbientCredentialAssertions(pure), []);
  const helped = `import { withoutCredentials } from "../../lib/env-file.mjs";\nconst res = spawnSync(process.execPath, [P], { env: withoutCredentials() });\nassert.match(res.stderr, /DB creds/);\n`;
  assert.deepEqual(findAmbientCredentialAssertions(helped), []);
  assert.equal(fitnessFunction.check('fsi-app/scripts/x.test.mjs', pure + helped).length, 0);
});

test('(c) GREEN (amendment, lane T2): a file that spawns a child in one test and asserts a creds message on a plain object in another is not flagged (market-eia-v2-petroleum-spot-parser.test.mjs line 243\'s shape)', () => {
  const src = [
    'test("spawn test", () => {',
    '  const res = spawnSync(process.execPath, [P], { env: { ...process.env } });',
    '  assert.equal(res.status, 1);',
    '});',
    '',
    'test("pure decideApply test", () => {',
    '  const d = decideApply({ apply: true, enabled: true, killSwitchOn: true, hasCreds: false });',
    '  assert.match(d.reason, /DB creds/);',
    '});',
  ].join('\n');
  assert.deepEqual(findAmbientCredentialAssertions(src), []);
  assert.equal(fitnessFunction.check('fsi-app/scripts/x.test.mjs', src).length, 0);
});

test('LIVE: no live script carries a bare load and no test strips or asserts credentials without the helper', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.length > 50, `expected a real scan, got ${files.length} files`);
  assert.ok(files.some(inTestScope), 'the scan must include test files');
  const red = [];
  for (const f of files) {
    const v = fitnessFunction.check(f, readFile(f));
    if (v.length) red.push(`${f}:${v.map((x) => x.line).join(',')}`);
  }
  assert.deepEqual(red, [], `F48 violations: ${red.join(' ')}`);
});
