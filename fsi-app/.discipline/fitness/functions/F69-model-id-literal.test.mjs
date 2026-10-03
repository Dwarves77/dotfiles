// @ts-check
// Red-then-green for F69 (model-id literal). A hardcoded Anthropic model-id literal in a new file is
// RED with file:line; removed (imported from model-ids.mjs instead), it is GREEN. Plus a staleness
// audit: model-ids.mjs itself still declares the literals it claims to canonicalize.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, CANONICAL_HOME, SECURITY_ALLOWLIST_FILES } from './F69-model-id-literal.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../'); // functions->fitness->.discipline->fsi-app->repo

test('RED: a hardcoded Haiku literal in a new file is flagged with file:line', () => {
  const bypass = [
    'export async function classify() {',
    '  return client.messages.create({ model: "claude-haiku-4-5-20251001", maxTokens: 200 });',
    '}',
  ].join('\n');
  const v = fitnessFunction.check('fsi-app/src/lib/sources/some-new-classifier.ts', bypass);
  assert.equal(v.length, 1, 'a new hardcoded literal must be RED');
  assert.equal(v[0].line, 2);
});

test('RED: a hardcoded Sonnet literal (single quotes) is flagged', () => {
  const bypass = "const MODEL = 'claude-sonnet-4-6';";
  const v = fitnessFunction.check('fsi-app/src/lib/agent/some-new-runner.mjs', bypass);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 1);
});

test('GREEN: importing the shared constant instead is clean', () => {
  const clean = [
    'import { HAIKU_MODEL } from "@/lib/llm/model-ids.mjs";',
    'export async function classify() {',
    '  return client.messages.create({ model: HAIKU_MODEL, maxTokens: 200 });',
    '}',
  ].join('\n');
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/sources/some-new-classifier.ts', clean), []);
});

test('GREEN: a comment-line mention of the literal (a drift note, a doc comment) is not flagged', () => {
  const commented = [
    '// historical note: this used to be "claude-haiku-4-5-20251001" before the lane MODEL-IDS fix',
    'import { HAIKU_MODEL } from "@/lib/llm/model-ids.mjs";',
  ].join('\n');
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/sources/some-file.ts', commented), []);
});

test('GREEN: metered-gate.mjs\'s own security allowlist is never flagged', () => {
  const withLiteral = 'export const METERED_MODEL_ALLOWLIST = new Set(["claude-haiku-4-5-20251001"]);';
  for (const f of SECURITY_ALLOWLIST_FILES) {
    assert.deepEqual(fitnessFunction.check(f, withLiteral), [], `${f} is the sanctioned security allowlist`);
  }
});

test('override: a trailing `// fitness-allow: F69 (reason)` suppresses the line', () => {
  const overridden = 'const MODEL = "claude-haiku-4-5-20251001"; // fitness-allow: F69 (one-off diag)';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/agent/x.ts', overridden), []);
});

test('STALENESS AUDIT: the canonical home still declares the literals it claims to canonicalize', () => {
  const content = readFileSync(resolve(REPO_ROOT, CANONICAL_HOME), 'utf8');
  assert.match(content, /claude-haiku-4-5-20251001/, `${CANONICAL_HOME} must still export HAIKU_MODEL's literal`);
  assert.match(content, /claude-sonnet-4-6/, `${CANONICAL_HOME} must still export SONNET_MODEL's literal`);
});

test('ENUMERATE: the canonical home itself is excluded from the scan (it is the source of truth)', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(!files.includes(CANONICAL_HOME), `${CANONICAL_HOME} must not scan itself`);
});
