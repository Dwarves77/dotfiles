// @ts-check
// Red-then-green for F20 (pause-flag-one-writer). A second-writer (direct .update/assignment/SQL SET on the
// stop flags) is RED; reads + type annotations + the RPC caller are GREEN; an override suppresses; and the
// LIVE census: the whole src tree passes (the only writer is the admin_set_pause_state RPC — no direct writer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, findPauseFlagWrite } from './F20-pause-flag-one-writer.mjs';

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

test('LIVE census: the whole src tree passes F20 (the RPC is the only writer)', () => {
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
