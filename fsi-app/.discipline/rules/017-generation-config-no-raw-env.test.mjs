// Fire-tests for rule 017 (generation config, no raw env).
// Run: node --test fsi-app/.discipline/rules/017-generation-config-no-raw-env.test.mjs
//
// Lane GATE-1 (2026-10-08): the rule charges INTRODUCED lines only. A knob read that was already in a
// generation file, on a line the commit edits or moves, is not the commit's defect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './017-generation-config-no-raw-env.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// Built by fragments so this test file does not itself match the rule's regex.
const ENVREAD = 'const n = process' + '.env.' + 'BROWSERLESS_FETCH_CONCURRENCY;';        // a KNOB, a violation
const CREDREAD = 'const k = process' + '.env.' + 'ANTHROPIC_API_KEY;';                   // a CREDENTIAL, exempt
const SUPAREAD = 'createClient(process' + '.env.' + 'NEXT_PUBLIC_SUPABASE_URL, process' + '.env.' + 'SUPABASE_SERVICE_ROLE_KEY);';
const GEN = 'fsi-app/src/lib/agent/canonical-pipeline.ts';

// A change to one file: `change` is { added, removed?, status? }; the post-image is carried too so a rule
// that wrongly scanned the whole file would see the same read the diff view does.
function ctxFor(path, change, post) {
  return buildContextFromFixture({
    message: 'tune',
    files: [{ path, status: change.status }],
    changes: [{ path, ...change }],
    fileContents: { [path]: post ?? `${(change.added || []).join('\n')}\n` },
  });
}

test('017 check: FAIL, a raw KNOB env read introduced in a generation file', () => {
  const r = rule.check(ctxFor(GEN, { added: [ENVREAD], newStart: 12 }));
  assert.equal(r.status, 'FAIL');
  assert.ok(r.remediation.includes('generation-config.ts'));
  assert.deepEqual(r.locations, [{ path: GEN, line: 12 }]);
});

test('017 check: PASS, the config module itself may read env', () => {
  assert.equal(rule.check(ctxFor('fsi-app/src/lib/agent/generation-config.ts', { added: [ENVREAD] })).status, 'PASS');
});

test('017 check: PASS, a non-generation file may read env', () => {
  assert.equal(rule.check(ctxFor('fsi-app/src/lib/other.ts', { added: [ENVREAD] })).status, 'PASS');
});

test('017 check: PASS, CREDENTIAL env reads in a generation file are exempt (not knobs)', () => {
  assert.equal(rule.check(ctxFor(GEN, { added: [CREDREAD, SUPAREAD] })).status, 'PASS');
});

test('017 check: FAIL, a knob alongside credentials still trips (only the knob is flagged)', () => {
  const r = rule.check(ctxFor(GEN, { added: [CREDREAD, ENVREAD] }));
  assert.equal(r.status, 'FAIL');
  assert.ok(r.message.includes('1'), 'only the single knob read should be flagged');
});

test('017 scope: PASS, a pre-existing knob read elsewhere in the file is not read (no diff for it)', () => {
  const ctx = buildContextFromFixture({
    message: 'tune',
    files: [{ path: GEN }],
    changes: [{ path: GEN, removed: ['const a = 1;'], added: ['const a = 2;'] }],
    fileContents: { [GEN]: `${ENVREAD}\nconst a = 2;\n` },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('017 scope: PASS, a line that already read the knob is edited (still the same read)', () => {
  const ctx = ctxFor(GEN, { removed: [`${ENVREAD} // old`], added: [`${ENVREAD} // clarified`] });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('017 scope: PASS, a knob-read line is MOVED out of another generation file', () => {
  const ctx = buildContextFromFixture({
    message: 'refactor',
    files: [{ path: GEN }, { path: 'fsi-app/src/lib/agent/format-spec.ts', status: 'A' }],
    changes: [
      { path: GEN, removed: [ENVREAD] },
      { path: 'fsi-app/src/lib/agent/format-spec.ts', status: 'A', added: [ENVREAD] },
    ],
    fileContents: { 'fsi-app/src/lib/agent/format-spec.ts': `${ENVREAD}\n` },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('017 scope: FAIL, an edit that turns a constant into a knob read', () => {
  const ctx = ctxFor(GEN, { removed: ['const n = 4;'], added: [ENVREAD] });
  assert.equal(rule.check(ctx).status, 'FAIL');
});

test('017: metadata', () => { assert.equal(rule.id, '017'); });

// ---------------------------------------------------------------------------
// GATE-7 (2026-10-08): honest forms from the AUD-AT-3 attack register. Built from fragments so this file
// carries none of the patterns itself.
// ---------------------------------------------------------------------------
const PE = 'process' + '.env';

test('017 GATE-7 A017-1: a destructured read of the environment is a read', () => {
  assert.equal(rule.check(ctxFor(GEN, { added: [`const { GEN_KNOB, ANTHROPIC_API_KEY } = ${PE};`] })).status, 'FAIL');
  assert.equal(rule.check(ctxFor(GEN, { added: [`const { ANTHROPIC_API_KEY } = ${PE};`] })).status, 'PASS');
});

test('017 GATE-7 A017-2: an alias of the environment is charged where it is made', () => {
  assert.equal(rule.check(ctxFor(GEN, { added: [`const e = ${PE};`] })).status, 'FAIL');
  assert.equal(rule.check(ctxFor(GEN, { added: [`const o = { ...${PE} };`] })).status, 'FAIL');
});

test('017 GATE-7 A017-3: an optional chain is a read', () => {
  assert.equal(rule.check(ctxFor(GEN, { added: [`const n = process?.env.GEN_KNOB;`] })).status, 'FAIL');
  assert.equal(rule.check(ctxFor(GEN, { added: [`const n = ${PE}?.GEN_KNOB;`] })).status, 'FAIL');
});

test('017 GATE-7 A017-4: a computed key is charged, a literal bracket key is judged by its name', () => {
  assert.equal(rule.check(ctxFor(GEN, { added: [`const v = ${PE}[name];`] })).status, 'FAIL');
  assert.equal(rule.check(ctxFor(GEN, { added: [`const v = ${PE}["GEN_KNOB"];`] })).status, 'FAIL');
  assert.equal(rule.check(ctxFor(GEN, { added: [`const v = ${PE}["ANTHROPIC_API_KEY"];`] })).status, 'PASS');
});

test('017 GATE-7 A017-5: a credential-looking WORD inside a knob name does not make it a credential', () => {
  assert.equal(rule.check(ctxFor(GEN, { added: [`const n = ${PE}.GEN_TOKEN_BUDGET;`] })).status, 'FAIL');
  assert.equal(rule.check(ctxFor(GEN, { added: [`const n = ${PE}.MAX_TOKENS;`] })).status, 'FAIL');
  assert.equal(rule.check(ctxFor(GEN, { added: [`const n = ${PE}.WORKER_SECRET;`, `const m = ${PE}.OAUTH_TOKEN;`] })).status, 'PASS');
});

test('017 GATE-7 A017-6: a NEW file under src/lib/agent/ is a generation file (derived from the skill-map)', () => {
  const p = 'fsi-app/src/lib/agent/new-generator.ts';
  assert.equal(rule.trigger(buildContextFromFixture({ message: 'x', files: [{ path: p, status: 'A' }] })), true);
  assert.equal(rule.check(ctxFor(p, { status: 'A', added: [ENVREAD] })).status, 'FAIL');
  assert.equal(rule.check(ctxFor('fsi-app/src/lib/agent/new-generator.test.ts', { status: 'A', added: [ENVREAD] })).status, 'PASS');
});

test('017 GATE-7 A017-7: import.meta.env is the environment too', () => {
  assert.equal(rule.check(ctxFor(GEN, { added: ['const n = import.meta' + '.env.GEN_KNOB;'] })).status, 'FAIL');
});

test('017 GATE-7 A017-8: adding a second knob to a line that already read one is charged for the surplus', () => {
  const one = `const a = ${PE}.KNOB_A;`;
  const two = `const a = ${PE}.KNOB_A, b = ${PE}.KNOB_B;`;
  const mk = (added, removed) => buildContextFromFixture({ message: 'x', files: [{ path: GEN }], changes: [{ path: GEN, added: [added], removed: [removed] }] });
  assert.equal(rule.check(mk(two, one)).status, 'FAIL');
  assert.equal(rule.check(mk(`const aa = ${PE}.KNOB_A;`, one)).status, 'PASS');
});
