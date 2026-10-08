// @ts-check
// Red-then-green for F16 (transport hold gate). The single fetch primitive missing assertFetchAllowed is RED;
// present, GREEN. A raw Browserless content fetch in a non-sanctioned file is RED with file:line; the primitive
// + hold-gate core are sanctioned. Plus a live check that the REAL primitive carries the gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, PRIMITIVE, HOLD_GATE_CORE, SANCTIONED, TRANSPORT_MODULES } from './F16-transport-hold-gate.mjs';

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

// GATE-4 (2026-10-07): this test runs the fitness function against the live repo, which the Fitness
// functions job already does on every pull request (gate evaluation B section 7.6: it failed the unit-test
// step while the gate itself passed in the fitness job). It stays runnable here with FITNESS_LIVE_TESTS=1.
const LIVE_TREE = process.env.FITNESS_LIVE_TESTS === '1' ? {} : { skip: 'live-tree self-test, run by the Fitness functions job; set FITNESS_LIVE_TESTS=1 to run it here' };

test('LIVE: the real canonical fetch primitive carries the hold gate', LIVE_TREE, () => {
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

test('LIVE: every real transport module carries the hold gate', LIVE_TREE, () => {
  for (const rel of TRANSPORT_MODULES) {
    const content = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
    assert.deepEqual(fitnessFunction.check(rel, content), [], `${rel} must contain assertFetchAllowed(`);
  }
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

test('F16 B1-33: a Browserless host split across a concatenation is the same host', () => {
  const src = 'const u = "https://chrome." + "browserless.io/content";';
  assert.equal(fitnessFunction.check('fsi-app/src/lib/sources/new-fetcher.mjs', src).length, 1);
});

test('F16 B1-35: a websocket or puppeteer connect through the endpoint variable is the same bypass', () => {
  const src = 'const b = await puppeteer.connect({ browserWSEndpoint: process.env.BROWSERLESS_WS });';
  assert.ok(fitnessFunction.check('fsi-app/src/lib/sources/new-fetcher.mjs', src).length >= 1);
});

test('F16 B1-36: a raw Browserless host in scripts is enumerated', () => {
  const body = fitnessFunction.enumerate.toString();
  assert.match(body, /scripts/);
  assert.match(body, /cjs/);
});

test('F16 B1-37: a primitive that keeps only a comment naming the gate call is ungated', () => {
  const src = '// TODO: call assertFetchAllowed(url) here\nexport async function browserlessFetch(url) { return fetch(url); }';
  const v = fitnessFunction.check(PRIMITIVE, src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /missing the scrape-hold gate/);
});

test('F16 B1-38: a primitive whose gate call was reduced to a string literal is ungated', () => {
  const src = 'const note = "assertFetchAllowed(url)";\nexport async function browserlessFetch(url) { return fetch(url); }';
  assert.equal(fitnessFunction.check(PRIMITIVE, src).length, 1);
});

test('F16: a transport module with a commented gate call is also ungated', () => {
  const src = '/* assertFetchAllowed(url) */\nexport async function go(url) { return fetch(url); }';
  assert.equal(fitnessFunction.check(TRANSPORT_MODULES[0], src).length >= 1, true);
});
