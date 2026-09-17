// Red-then-green for F46 (external-host-home). Pure core over {path, content} entries plus the LIVE
// ratchet against the tree. No DB, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostsByFile, evaluate, scanTree, MULTI_HOME_CEILING, HOST_HOMES, REFERENCE_FILES, fitnessFunction } from './F46-external-host-home.mjs';

const entries = (map) => Object.entries(map).map(([path, content]) => ({ path, content }));

test('hostsByFile: attributes URL literals to hosts and files, ignores comments and platform hosts', () => {
  const m = hostsByFile(entries({
    'fsi-app/src/a.mjs': 'const u = "https://api.example-vendor.org/v1?x=1";\n// https://commented.example-vendor.org/skip\nfetch("https://x.supabase.co/rest");',
    'fsi-app/src/b.ts': 'const base = `https://api.example-vendor.org/v2`;\n/* https://blocked.example-vendor.org */',
  }));
  assert.deepEqual([...m.keys()].sort(), ['api.example-vendor.org']);
  assert.deepEqual([...m.get('api.example-vendor.org')].sort(), ['fsi-app/src/a.mjs', 'fsi-app/src/b.ts']);
});

test('evaluate: a host in two non-reference files is multi-home; a reference file does not count as a home', () => {
  const byHost = hostsByFile(entries({
    'fsi-app/src/lib/x.mjs': 'fetch("https://data.example-vendor.org/a")',
    'fsi-app/src/lib/y.mjs': 'fetch("https://data.example-vendor.org/b")',
    'fsi-app/src/lib/z.mjs': 'fetch("https://single.example-vendor.org/c")',
    'ref.mjs': 'export const T = { "https://single.example-vendor.org": "licence" }',
  }));
  const r = evaluate(byHost, { homes: {}, reference: new Set(['ref.mjs']) });
  assert.deepEqual(r.strict, []);
  assert.deepEqual(r.multi.map((m) => m.host), ['data.example-vendor.org']);
});

test('evaluate: a homed host named outside its home is a STRICT violation even when the ratchet would pass', () => {
  const byHost = hostsByFile(entries({
    'fsi-app/scripts/lib/home.mjs': 'export const BASE = "https://homed.example-vendor.org/resource/"',
    'fsi-app/scripts/other.mjs': 'const u = "https://homed.example-vendor.org/resource/x"',
  }));
  const r = evaluate(byHost, { homes: { 'homed.example-vendor.org': 'fsi-app/scripts/lib/home.mjs' }, reference: new Set() });
  assert.equal(r.multi.length, 0);
  assert.deepEqual(r.strict, [{ host: 'homed.example-vendor.org', home: 'fsi-app/scripts/lib/home.mjs', extra: ['fsi-app/scripts/other.mjs'] }]);
});

test('registry shape: every home and reference file is a repo path under fsi-app', () => {
  for (const home of Object.values(HOST_HOMES)) assert.match(home, /^fsi-app\/(src|scripts)\//);
  for (const f of REFERENCE_FILES) assert.match(f, /^fsi-app\/src\//);
});

test('LIVE ratchet: no homed host has a second home, and the multi-home count equals the ceiling (re-seed DOWN when a host is consolidated)', () => {
  const r = scanTree();
  assert.deepEqual(r.strict, [], 'a consolidated host is named outside its home: ' + JSON.stringify(r.strict));
  assert.equal(
    r.multi.length,
    MULTI_HOME_CEILING,
    `multi-home hosts ${r.multi.length} vs ceiling ${MULTI_HOME_CEILING}: ${r.multi.map((m) => m.host).join(', ')}. Above: a host gained a home, import its module. Below: set MULTI_HOME_CEILING to ${r.multi.length} and add the consolidated host to HOST_HOMES.`
  );
  assert.deepEqual(fitnessFunction.check(), []);
});
