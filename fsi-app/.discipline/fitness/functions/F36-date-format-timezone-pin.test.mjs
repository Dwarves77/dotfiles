// Fire-tests for F36 (date-format timezone pin).
// Run: node --test fsi-app/.discipline/fitness/functions/F36-date-format-timezone-pin.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isClientComponent,
  findUnpinnedDateCalls,
  fitnessFunction,
  PRE_EXISTING_ALLOWLIST,
} from './F36-date-format-timezone-pin.mjs';
import { stripNoise } from './F34-bundle-safe-module-evaluation.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');

test('isClientComponent: recognizes the directive with a leading comment, not without one', () => {
  assert.equal(isClientComponent('"use client";\nexport default function X() {}\n'), true);
  assert.equal(isClientComponent("'use client'\nexport default function X() {}\n"), true);
  assert.equal(
    isClientComponent('// header comment\n"use client";\nexport default function X() {}\n'),
    true,
  );
  assert.equal(isClientComponent('export default function X() {}\n'), false);
  assert.equal(isClientComponent('const s = "use client"; // not a directive, mid-file\n'), false);
});

test('RED: the exact 2026-09-04 #418 shape (toLocaleDateString, no timeZone) is caught', () => {
  const src = `const dateStr = md
    ? md.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;`;
  const hits = findUnpinnedDateCalls(stripNoise(src));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].call, 'toLocaleDateString()');
  assert.equal(hits[0].line, 2);
});

test('GREEN: the fixed shape (timeZone: "UTC" present) is not caught', () => {
  const src = `md.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })`;
  assert.deepEqual(findUnpinnedDateCalls(stripNoise(src)), []);
});

test('GREEN: toLocaleString (ambiguous with Number.prototype.toLocaleString) is never flagged', () => {
  const src = `count.toLocaleString()`;
  assert.deepEqual(findUnpinnedDateCalls(stripNoise(src)), []);
});

test('RED: toLocaleTimeString and Intl.DateTimeFormat are both covered', () => {
  const src = `
    const a = d.toLocaleTimeString("en-US", { hour: "2-digit" });
    const b = new Intl.DateTimeFormat("en-US", { month: "long" }).format(d);
  `;
  const hits = findUnpinnedDateCalls(stripNoise(src));
  assert.equal(hits.length, 2);
  assert.equal(hits[0].call, 'toLocaleTimeString()');
  assert.equal(hits[1].call, 'Intl.DateTimeFormat()');
});

test('GREEN: mentions inside strings/comments never fire', () => {
  const src = `
    // toLocaleDateString("en-US") in a comment
    const s = "call .toLocaleDateString(x) here";
  `;
  assert.deepEqual(findUnpinnedDateCalls(stripNoise(src)), []);
});

test('check(): a Server Component (no "use client") with the unpinned shape is out of scope, PASS', () => {
  const src = `const today = new Date().toLocaleDateString("en-US", { month: "long" });\n`;
  assert.deepEqual(fitnessFunction.check('fsi-app/src/app/whatever/page.tsx', src), []);
});

test('check(): a "use client" component with the unpinned shape is a violation naming the line', () => {
  const src = `"use client";\nexport function Row() {\n  return d.toLocaleDateString("en-US", { month: "short" });\n}\n`;
  const v = fitnessFunction.check('fsi-app/src/components/whatever/Row.tsx', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 3);
  assert.match(v[0].message, /React #418/);
});

test('check(): a "use client" component in PRE_EXISTING_ALLOWLIST passes despite the unpinned shape', () => {
  const allowed = Object.keys(PRE_EXISTING_ALLOWLIST)[0];
  const src = `"use client";\nexport function X() { return d.toLocaleDateString("en-US", {}); }\n`;
  assert.deepEqual(fitnessFunction.check(allowed, src), []);
});

test('LIVE: the fixed RegulationsLedger.tsx (RegRow) carries no unpinned date call — regression proof', () => {
  const p = join(REPO, 'fsi-app/src/components/regulations/RegulationsLedger.tsx');
  const content = readFileSync(p, 'utf8');
  assert.deepEqual(fitnessFunction.check('fsi-app/src/components/regulations/RegulationsLedger.tsx', content), []);
});

test('LIVE: the fixed format-fixed-date.ts helper pins timeZone at every call site', () => {
  const p = join(REPO, 'fsi-app/src/components/regulations/format-fixed-date.ts');
  const content = readFileSync(p, 'utf8');
  const hits = findUnpinnedDateCalls(stripNoise(content));
  assert.deepEqual(hits, []);
});

test('LIVE: enumerate() covers app/ and components/, excludes tests and _archive', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.length > 100);
  assert.ok(files.every((f) => f.startsWith('fsi-app/src/app/') || f.startsWith('fsi-app/src/components/')));
  assert.ok(files.every((f) => !/\.(test|selftest|npmtest|spec)\./.test(f) && !f.includes('/src/_archive/')));
});

test('LIVE: every PRE_EXISTING_ALLOWLIST entry is a real file under enumerate()', () => {
  const files = new Set(fitnessFunction.enumerate());
  for (const f of Object.keys(PRE_EXISTING_ALLOWLIST)) {
    assert.ok(files.has(f), `allowlisted file not found by enumerate(): ${f}`);
  }
});

// Lane settings60 (2026-09-08). `Intl.DateTimeFormat().resolvedOptions().timeZone` is a ZONE
// LOOKUP, not a format call: it returns the reader's own IANA zone name, produces no date string,
// and cannot make SSR and hydration disagree about a calendar day. Pinning `timeZone` on it would
// make it echo the pinned value back and destroy its only purpose. The carve-out is deliberately
// narrow — the very next token after the call must be `.resolvedOptions(` — and these cases are
// the attack on it: every other shape still has to be caught.
test('resolvedOptions() zone lookup is not a format call', () => {
  assert.deepEqual(
    findUnpinnedDateCalls('const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;'),
    [],
  );
  assert.deepEqual(
    findUnpinnedDateCalls('const tz = new Intl.DateTimeFormat() .resolvedOptions() .timeZone;'),
    [],
  );
});

test('the carve-out does NOT exempt a real formatter, however it is spelled', () => {
  assert.equal(findUnpinnedDateCalls('new Intl.DateTimeFormat("en").format(d)').length, 1);
  // A formatter built with options and only LATER queried is still a formatter at the call site.
  assert.equal(findUnpinnedDateCalls('const f = new Intl.DateTimeFormat("en"); f.resolvedOptions();').length, 1);
  // A pinned formatter stays clean; an unpinned toLocale* stays caught.
  assert.deepEqual(findUnpinnedDateCalls('new Intl.DateTimeFormat("en", { timeZone: "UTC" })'), []);
  assert.equal(findUnpinnedDateCalls('d.toLocaleDateString("en")').length, 1);
  assert.equal(findUnpinnedDateCalls('d.toLocaleTimeString("en")').length, 1);
});

test('LIVE: BriefingScheduleSection\'s zone lookup passes without an allowlist entry', () => {
  const rel = 'fsi-app/src/components/settings/BriefingScheduleSection.tsx';
  const content = readFileSync(join(REPO, rel), 'utf8');
  assert.ok(/resolvedOptions\(\)\.timeZone/.test(content), 'expected the zone lookup to still be there');
  assert.deepEqual(fitnessFunction.check(rel, content), []);
  assert.ok(!(rel in PRE_EXISTING_ALLOWLIST), 'the fix must not be an allowlist entry');
});
