// F14 negative self-test — RED-then-GREEN on a simulated orphan (same discipline as F13 / the meta-gate).
// The "tree" is injected file records fed to the PURE core (buildOrphanReport): deterministic, no real
// file mutation racing CI. Proves the detector goes RED with a named writer file:line, and GREEN once the
// orphan gains a reader OR is allowlisted — the catching behaviour is itself proven, not assumed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction } from './F14-producer-consumer-orphan.mjs';
import {
  buildOrphanReport,
  scanCode,
  scanSchema,
  scanSql,
} from '../../governance/producer-consumer-orphan.mjs';

const SCHEMA = [{ file: 'm.sql', content: 'CREATE TABLE sim_orphan (id uuid);' }];
const WRITER = { file: 'sim/writer.ts', content: 'await sb.from("sim_orphan").insert({ id });' };

test('F14: RED on a simulated write-orphan, with a named writer file:line', () => {
  const r = buildOrphanReport({
    schema: scanSchema(SCHEMA),
    code: scanCode([WRITER]),
    sql: scanSql(SCHEMA), // CREATE TABLE has no FROM/JOIN → no SQL reader
    allowlist: {},
  });
  const hit = r.gatingOrphans.find((o) => o.table === 'sim_orphan');
  assert.ok(hit, 'the simulated orphan must be flagged as a gating write-orphan');
  assert.equal(hit.writers[0].file, 'sim/writer.ts');
  assert.ok(hit.writers[0].line >= 1, 'the finding must name the writer line');
  assert.equal(r.ok, false);
});

test('F14: GREEN once the orphan gains a reader (remove the orphan → clean)', () => {
  const r = buildOrphanReport({
    schema: scanSchema(SCHEMA),
    code: scanCode([WRITER, { file: 'sim/reader.ts', content: 'await sb.from("sim_orphan").select("id");' }]),
    sql: scanSql([{ content: '' }]),
    allowlist: {},
  });
  assert.equal(r.gatingOrphans.length, 0, 'a reader removes the orphan');
  assert.equal(r.ok, true);
});

test('F14: GREEN when the orphan is allowlisted WITH a reason + reviewByPhase', () => {
  const r = buildOrphanReport({
    schema: scanSchema(SCHEMA),
    code: scanCode([WRITER]),
    sql: scanSql([{ content: '' }]),
    allowlist: { sim_orphan: { reason: 'append-only test audit sink', reviewByPhase: 'Phase 7' } },
  });
  assert.equal(r.gatingOrphans.length, 0);
  assert.equal(r.allowlistIssues.length, 0);
  assert.equal(r.ok, true);
});

test('F14: allowlist audit RED on a stale entry (table not in schema)', () => {
  const r = buildOrphanReport({
    schema: scanSchema(SCHEMA),
    code: scanCode([WRITER]),
    sql: scanSql([{ content: '' }]),
    allowlist: {
      sim_orphan: { reason: 'sink', reviewByPhase: 'Phase 7' },
      ghost_table: { reason: 'gone', reviewByPhase: 'Phase 7' },
    },
  });
  assert.ok(r.allowlistIssues.some((i) => /ghost_table/.test(i)), 'a stale allowlist entry must be reported');
  assert.equal(r.ok, false);
});

test('F14: live tree is GREEN (grandfathered allowlist; no NEW orphan)', () => {
  const v = fitnessFunction.check('sentinel', '');
  assert.deepEqual(v, [], `F14 must be green on the current tree; got: ${JSON.stringify(v)}`);
});

test('F14: metadata', () => {
  assert.equal(fitnessFunction.id, 'F14');
  assert.ok(fitnessFunction.source.length > 0);
  assert.ok(typeof fitnessFunction.check === 'function');
});
