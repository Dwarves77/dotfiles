// @ts-check
// Red-then-green for F16 (transport hold gate). The single fetch primitive missing assertFetchAllowed is RED;
// present, GREEN. A raw Browserless content fetch in a non-sanctioned file is RED with file:line; the primitive
// + hold-gate core are sanctioned. Plus a live check that the REAL primitive carries the gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, rawBrowserlessLines, PRIMITIVE, HOLD_GATE_CORE, SANCTIONED, TRANSPORT_MODULES } from './F16-transport-hold-gate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

test('RED: the fetch primitive WITHOUT the hold gate is flagged', () => {
  const noGate = 'export async function browserlessFetch(url) {\n  const key = process.env.BROWSERLESS_API_KEY;\n  return fetch(key);\n}';
  const v = fitnessFunction.check(PRIMITIVE, noGate);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /missing the scrape-hold gate/);
});

test('GREEN: the fetch primitive WITH assertFetchAllowed is clean', () => {
  const withGate = 'import { assertFetchAllowed } from "./fetch-hold.mjs";\nexport async function browserlessFetch(url) {\n  assertFetchAllowed(url);\n  return fetch(url);\n}';
  assert.deepEqual(fitnessFunction.check(PRIMITIVE, withGate), []);
});

test('RED: a raw Browserless content fetch in a NON-sanctioned file bypasses the gate → flagged with line', () => {
  const bypass = [
    'export async function sneakyFetch(u) {',
    '  const r = await fetch("https://chrome.browserless.io/content?token=X", { body: JSON.stringify({ url: u }) });',
    '  return r;',
    '}',
  ].join('\n');
  const v = fitnessFunction.check('fsi-app/src/lib/sources/some-new-fetcher.mjs', bypass);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 2);
});

test('GREEN: a caller routing through browserlessFetch (no raw endpoint) is clean', () => {
  const clean = 'import { browserlessFetch } from "./canonical-fetch.mjs";\nexport const go = (u) => browserlessFetch(u);';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/sources/some-caller.ts', clean), []);
});

test('GREEN: the hold-gate core itself may reference the endpoint context (sanctioned)', () => {
  assert.ok(SANCTIONED.has(HOLD_GATE_CORE));
  assert.deepEqual(fitnessFunction.check(HOLD_GATE_CORE, 'BROWSERLESS_BASE_URL reference in a comment or doc'), []);
});

test('override: a trailing `// fitness-allow: F16 (reason)` suppresses the line', () => {
  const overridden = 'const r = await fetch("https://chrome.browserless.io/content"); // fitness-allow: F16 (one-off diag)';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/sources/x.mjs', overridden), []);
});

test('LIVE: the real canonical fetch primitive carries the hold gate', () => {
  const content = readFileSync(resolve(REPO_ROOT, PRIMITIVE), 'utf8');
  assert.deepEqual(fitnessFunction.check(PRIMITIVE, content), [], 'the shipped primitive must contain assertFetchAllowed(');
});

// ── C5 widening: transport-module hold gate (all four transports) ──
test('RED: a transport module WITHOUT assertFetchAllowed is flagged', () => {
  const noGate = 'export async function rssFetch(source) {\n  return fetch(source.url);\n}';
  const v = fitnessFunction.check(TRANSPORT_MODULES[0], noGate);
  assert.ok(v.length >= 1);
  assert.match(v[0].message, /missing the scrape-hold gate/);
});

test('GREEN: a transport module WITH assertFetchAllowed is clean', () => {
  // relative-.mjs fixture path (keeps glob-portability happy — the F16 check only needs the gate call present)
  const withGate = 'import { assertFetchAllowed } from "./fetch-hold.mjs";\nexport async function rssFetch(s) {\n  assertFetchAllowed(s.url);\n  return fetch(s.url);\n}';
  assert.deepEqual(fitnessFunction.check(TRANSPORT_MODULES[0], withGate), []);
});

test('LIVE: every real transport module carries the hold gate', () => {
  for (const rel of TRANSPORT_MODULES) {
    const content = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
    assert.deepEqual(fitnessFunction.check(rel, content), [], `${rel} must contain assertFetchAllowed(`);
  }
});
