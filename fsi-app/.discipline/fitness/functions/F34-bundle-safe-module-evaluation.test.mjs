// Fire-tests for F34 (bundle-safe module evaluation).
// Run: node --test fsi-app/.discipline/fitness/functions/F34-bundle-safe-module-evaluation.test.mjs
//
// Behavioural on CONSTRUCTED sources (the incident's exact shape reconstructed, not the live repo), plus
// one live-repo proof: the module that took production down on 2026-09-02 is green in its fixed form and
// its pre-fix form (kept verbatim below) is red.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findModuleScopeFsCalls, stripNoise, fitnessFunction, ALLOWLIST } from './F34-bundle-safe-module-evaluation.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');

const INCIDENT_SHAPE = `import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const REQUIRED_SLOTS = JSON.parse(
  readFileSync(resolve(HERE, "../../../scripts/mint/item-type-required-slots.json"), "utf8"),
);
export function loadSeriesItemMap(jsonPath = resolve(HERE, "series-item-map.json")) {
  const raw = JSON.parse(readFileSync(jsonPath, "utf8"));
  return raw;
}
export const SERIES_ITEM_MAP = loadSeriesItemMap();
`;

test('RED: the 2026-09-02 incident shape (top-level JSON.parse(readFileSync(...))) is a module-scope read', () => {
  const hits = findModuleScopeFsCalls(INCIDENT_SHAPE);
  assert.equal(hits.length, 1, JSON.stringify(hits));
  assert.equal(hits[0].call, 'readFileSync');
  assert.equal(hits[0].line, 6);
});

test('GREEN: a read inside a function, an arrow body, a nested block, or a class method is not module scope', () => {
  const src = `import { readFileSync } from "node:fs";
import fs from "node:fs";
export function load(p) { return readFileSync(p, "utf8"); }
export const g = () => { if (x) { readFileSync("a"); } };
export class A { load() { return fs.readFileSync("a"); } }
`;
  assert.deepEqual(findModuleScopeFsCalls(src), []);
});

test('RED: a read inside a top-level object literal still runs on import', () => {
  const src = `import { readFileSync } from "node:fs";\nexport const cfg = { a: readFileSync("a"), b: 1 };\n`;
  assert.equal(findModuleScopeFsCalls(src).length, 1);
});

test('RED: top-level await of fs/promises readFile', () => {
  const src = `import { readFile } from "node:fs/promises";\nconst data = await readFile("a");\n`;
  assert.equal(findModuleScopeFsCalls(src).length, 1);
});

test('GREEN: no fs import means no finding, whatever the identifiers say', () => {
  assert.deepEqual(findModuleScopeFsCalls('const x = readFileSync("a");\n'), []);
});

test('GREEN: mentions in strings, template literals and comments never fire', () => {
  const src = `import { readFileSync } from "node:fs";
const doc = "call readFileSync( here";
const tpl = \`readFileSync( in a template
spanning lines\`;
// readFileSync( in a line comment
/* readFileSync( in a block comment */
export function f() { return readFileSync("x"); }
`;
  assert.deepEqual(findModuleScopeFsCalls(src), []);
});

test('stripNoise keeps line count', () => {
  const src = 'a\n"b\nc"\n/* d\ne */\n// f\ng';
  assert.equal(stripNoise(src).split('\n').length, src.split('\n').length);
});

test('check(): a finding outside the allowlist is a violation with the file line; an allowlisted file passes', () => {
  const v = fitnessFunction.check('fsi-app/src/lib/x.mjs', INCIDENT_SHAPE);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 6);
  assert.match(v[0].message, /module scope/);
  const allowed = Object.keys(ALLOWLIST)[0];
  assert.deepEqual(fitnessFunction.check(allowed, INCIDENT_SHAPE), []);
});

test('LIVE: the fixed src/lib/market/refresh-published-price-statistics.mjs has no module-scope fs call', () => {
  const p = join(REPO, 'fsi-app/src/lib/market/refresh-published-price-statistics.mjs');
  assert.deepEqual(findModuleScopeFsCalls(readFileSync(p, 'utf8')), []);
});

test('LIVE: enumerate() excludes tests, selftests, npmtests and _archive', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.length > 100);
  assert.ok(files.every((f) => !/\.(test|selftest|npmtest|spec)\./.test(f) && !f.includes('/src/_archive/')));
});
