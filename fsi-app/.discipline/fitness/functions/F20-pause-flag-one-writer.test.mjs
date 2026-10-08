// @ts-check
// Red-then-green for F20 (pause-flag-one-writer). A second-writer (direct .update/assignment/SQL SET on the
// stop flags) is RED; reads + type annotations + the RPC caller are GREEN; an override suppresses; and the
// LIVE census: the whole src tree passes (the only writer is the admin_set_pause_state RPC — no direct writer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction } from './F20-pause-flag-one-writer.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

test('RED: a second-writer property assignment (update.global_processing_paused = x) is flagged', () => {
  const src = 'const update = {};\nupdate.global_processing_paused = body.paused;\nawait sb.from("system_state").update(update);';
  const v = fitnessFunction.check('fsi-app/src/lib/rogue.ts', src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /one writer/i);
});

test('RED: an inline .update({ scrape_cadence: ... }) is flagged', () => {
  const src = 'await sb.from("system_state").update({ scrape_cadence: "off" }).eq("id", true);';
  assert.equal(fitnessFunction.check('fsi-app/src/lib/rogue.ts', src).length, 1);
});

test('RED: a raw SQL SET on the flag is flagged', () => {
  const src = 'await client.query(`UPDATE system_state SET global_processing_paused = $1 WHERE id = true`, [v]);';
  assert.equal(fitnessFunction.check('fsi-app/src/lib/rogue.ts', src).length, 1);
});

test('RED: a direct write to judgement_drain (migration 354) is flagged in all three shapes', () => {
  assert.equal(fitnessFunction.check('fsi-app/src/lib/rogue.ts', 'update.judgement_drain = "on";').length, 1);
  assert.equal(fitnessFunction.check('fsi-app/src/lib/rogue.ts', 'await sb.from("system_state").update({ judgement_drain: "on" }).eq("id", true);').length, 1);
  assert.equal(fitnessFunction.check('fsi-app/src/lib/rogue.ts', 'await client.query(`UPDATE system_state SET judgement_drain = $1 WHERE id = true`, [v]);').length, 1);
});

test('GREEN: judgement_drain reads, comparisons and the sibling RPC caller are clean', () => {
  const src = [
    'const s = await sb.from("system_state").select("judgement_drain").eq("id", true);',
    'return data?.judgement_drain === "on";',
    'await sb.rpc("admin_set_judgement_drain", { p_actor: "a", p_state: "on" });',
  ].join(String.fromCharCode(10));
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', src), []);
});

test('GREEN: a string-literal READ (.select / .eq) is not a write', () => {
  const sel = 'await sb.from("system_state").select("scrape_cadence, scrape_start_date, global_processing_paused, updated_at").eq("id", true);';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', sel), []);
  const eq = 'await sb.from("system_state").select("id").eq("global_processing_paused", true);';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', eq), []);
});

test('GREEN: a type annotation (global_processing_paused?: boolean) is not a write', () => {
  const src = 'interface S { scrape_cadence?: string | null; global_processing_paused?: boolean | null; }';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', src), []);
});

test('GREEN: the RPC caller (p_paused / p_cadence params) is clean', () => {
  const src = 'await sb.rpc("admin_set_pause_state", { p_actor: "a", p_paused: true, p_cadence: "off" });';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', src), []);
});

test('override suppresses a reviewed exception', () => {
  const src = 'update.global_processing_paused = x; // fitness-allow: F20 (test)';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', src), []);
});

// GATE-4 (2026-10-07): this test runs the fitness function against the live repo, which the Fitness
// functions job already does on every pull request (gate evaluation B section 7.6: it failed the unit-test
// step while the gate itself passed in the fitness job). It stays runnable here with FITNESS_LIVE_TESTS=1.
const LIVE_TREE = process.env.FITNESS_LIVE_TESTS === '1' ? {} : { skip: 'live-tree self-test, run by the Fitness functions job; set FITNESS_LIVE_TESTS=1 to run it here' };

test('LIVE census: the whole src tree passes F20 (the RPC is the only writer)', LIVE_TREE, () => {
  const offenders = [];
  for (const rel of fitnessFunction.enumerate()) {
    const abs = resolve(REPO_ROOT, rel);
    let content;
    try { content = readFileSync(abs, 'utf8'); } catch { continue; }
    const v = fitnessFunction.check(rel, content);
    if (v.length) offenders.push(`${rel}:${v[0].line}`);
  }
  assert.deepEqual(offenders, [], `direct pause-flag writers present: ${offenders.join(', ')}`);
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

test('B2-18: nested braces before the key inside .update({...}) is still a direct write', () => {
  const src = 'await sb.from("system_state").update({ meta: { by: "x" }, scrape_cadence: "off" }).eq("id", true);';
  assert.equal(fitnessFunction.check('fsi-app/src/lib/rogue.ts', src).length, 1);
});

test('B2-19: .upsert( is a direct write the same way .update( is', () => {
  const src = 'await sb.from("system_state").upsert({ id: true, scrape_cadence: "off" });';
  assert.equal(fitnessFunction.check('fsi-app/src/lib/rogue.ts', src).length, 1);
});

test('B2-20: an update through a variable payload is a direct write', () => {
  const src = 'const patch = { global_processing_paused: true };\nawait sb.from("system_state").update(patch).eq("id", true);';
  assert.equal(fitnessFunction.check('fsi-app/src/lib/rogue.ts', src).length, 1);
});

test('B2-21: a PostgREST PATCH through fetch with a JSON body is a direct write', () => {
  const src = 'await fetch(`${base}/rest/v1/system_state?id=eq.true`, { method: "PATCH", body: JSON.stringify({ scrape_cadence: "off" }) });';
  assert.equal(fitnessFunction.check('fsi-app/src/lib/rogue.ts', src).length, 1);
});

test('B2-22: a column name built by concatenation is the same column', () => {
  const src = 'await sb.from("system_state").update({ ["scrape_" + "cadence"]: "off" }).eq("id", true);';
  assert.equal(fitnessFunction.check('fsi-app/src/lib/rogue.ts', src).length, 1);
});

test('B2-23: a direct write in scripts (.mjs, .cjs, .ts) is in scope', () => {
  const g = fitnessFunction.enumerate.toString();
  assert.match(g, /scripts/);
  assert.match(g, /cjs/);
});

test('B2-24: a file whose path merely ends with the sanctioned suffix is not the sanctioned route', () => {
  const src = 'await sb.from("system_state").update({ scrape_cadence: "off" });';
  assert.equal(fitnessFunction.check('fsi-app/src/lib/evil/src/app/api/admin/sources/pause-global/route.ts', src).length, 1);
  assert.deepEqual(fitnessFunction.check('fsi-app/src/app/api/admin/sources/pause-global/route.ts', src), []);
});

test('a column mentioned in a comment, a forged marker in a string, and a type member are not writes or overrides', () => {
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', '// update.global_processing_paused = x\nconst a = 1;'), []);
  const forged = 'const m = "// fitness-allow: F20 (forged)"; update.global_processing_paused = x;';
  assert.equal(fitnessFunction.check('fsi-app/src/lib/x.ts', forged).length, 1);
  const types = 'const a = await sb.from("system_state").update(x);\ninterface S {\n  scrape_cadence: string;\n  global_processing_paused: boolean;\n}';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', types), []);
});
