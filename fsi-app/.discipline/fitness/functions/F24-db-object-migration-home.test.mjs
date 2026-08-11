// Fire-tests for F24 (db-object migration home).
// Run: node --test fsi-app/.discipline/fitness/functions/F24-db-object-migration-home.test.mjs
//
// Behavioural, in the F15/F22/F23 style: the comparator is exercised against CONSTRUCTED catalogs and
// migration text, never against the live tree. A gate tested only against the current repo degrades into
// re-asserting whatever the repo happens to contain, and stops being able to say what the rule IS.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditCatalog,
  hasMigrationHome,
  stripSqlComments,
  fitnessFunction,
  NO_MIGRATION_HOME,
  BROKEN_REF_ALLOWLIST,
  NET_EGRESS_SANCTIONED,
  CRON_SANCTIONED,
} from './F24-db-object-migration-home.mjs';

const EMPTY_ALLOW = new Map();

test('an object with no migration and no allowlist entry is RED', () => {
  const cat = { tables: ['widgets'], views: [], rpcFunctions: [], triggerFunctions: [] };
  const problems = auditCatalog(cat, 'CREATE TABLE public.other (id uuid);', EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /OUT-OF-REPO DDL/);
  assert.match(problems[0], /widgets/);
});

test('an object created by a migration passes', () => {
  const cat = { tables: ['widgets'], views: [], rpcFunctions: [], triggerFunctions: [] };
  assert.deepEqual(auditCatalog(cat, 'CREATE TABLE IF NOT EXISTS public.widgets (id uuid);', EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW), []);
});

test('an allowlisted object with no migration passes', () => {
  const cat = { tables: ['widgets'], views: [], rpcFunctions: [], triggerFunctions: [] };
  const allow = new Map([['widgets', { object: 'widgets', reason: 'r', reviewByPhase: 'p' }]]);
  assert.deepEqual(auditCatalog(cat, 'SELECT 1;', allow, EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW), []);
});

// The half that makes it a ratchet rather than a permission list: the allowlist must shrink on its own.
test('an allowlist entry whose object HAS gained a migration is RED (stale entry)', () => {
  const cat = { tables: ['widgets'], views: [], rpcFunctions: [], triggerFunctions: [] };
  const allow = new Map([['widgets', { object: 'widgets', reason: 'r', reviewByPhase: 'p' }]]);
  const problems = auditCatalog(cat, 'CREATE TABLE public.widgets (id uuid);', allow, EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALE ALLOWLIST/);
});

test('an allowlist entry for an object no longer in the catalog is RED (stale entry)', () => {
  const cat = { tables: [], views: [], rpcFunctions: ['kept'], triggerFunctions: [] };
  const allow = new Map([
    ['kept', { object: 'kept', reason: 'r', reviewByPhase: 'p' }],
    ['dropped', { object: 'dropped', reason: 'r', reviewByPhase: 'p' }],
  ]);
  const problems = auditCatalog(cat, 'SELECT 1;', allow, EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no longer in db-catalog\.json/);
});

test('an allowlist entry without reason + reviewByPhase is RED', () => {
  const cat = { tables: ['widgets'], views: [], rpcFunctions: [], triggerFunctions: [] };
  const allow = new Map([['widgets', { object: 'widgets', reason: 'r' }]]);
  const problems = auditCatalog(cat, 'SELECT 1;', allow, EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW);
  assert.ok(problems.some((p) => /ALLOWLIST ENTRY WITHOUT A REASON/.test(p)));
});

test('an unexplained DB-internal broken reference is RED', () => {
  const cat = {
    tables: ['widgets'], views: [], rpcFunctions: [], triggerFunctions: [],
    internalBrokenRefs: [{ owner: 'fn:foo', missingRelation: 'gone_table' }],
  };
  const allow = new Map([['widgets', { object: 'widgets', reason: 'r', reviewByPhase: 'p' }]]);
  const problems = auditCatalog(cat, 'SELECT 1;', allow, EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /BROKEN DB-INTERNAL REFERENCE/);
  assert.match(problems[0], /gone_table/);
});

test('a broken-ref allowlist entry that no longer appears in the snapshot is RED', () => {
  const cat = { tables: [], views: [], rpcFunctions: ['f'], triggerFunctions: [], internalBrokenRefs: [] };
  const allowBroken = new Map([['gone_table', { missingRelation: 'gone_table', reason: 'r', reviewByPhase: 'p' }]]);
  const allow = new Map([['f', { object: 'f', reason: 'r', reviewByPhase: 'p' }]]);
  const problems = auditCatalog(cat, 'SELECT 1;', allow, allowBroken, EMPTY_ALLOW, EMPTY_ALLOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no longer appears/);
});

test('an empty catalog is RED rather than silently green', () => {
  const problems = auditCatalog({ tables: [], views: [], rpcFunctions: [], triggerFunctions: [] }, 'SELECT 1;', EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /lists no objects/);
});

// The predicate itself. A name that merely APPEARS in a migration must not count as a definition —
// otherwise any out-of-repo object read by some unrelated migration launders itself into compliance.
test('a bare SELECT mentioning the name is NOT a migration home', () => {
  assert.equal(hasMigrationHome('widgets', 'SELECT count(*) FROM public.widgets;'), false);
});

test('CREATE / ALTER / DROP all count as a migration home', () => {
  assert.equal(hasMigrationHome('widgets', 'CREATE TABLE public.widgets (id uuid);'), true);
  assert.equal(hasMigrationHome('widgets', 'ALTER TABLE widgets ADD COLUMN x int;'), true);
  assert.equal(hasMigrationHome('widgets', 'DROP TABLE IF EXISTS public.widgets;'), true);
  assert.equal(hasMigrationHome('f_x', 'CREATE OR REPLACE FUNCTION public.f_x() RETURNS void AS $$ $$;'), true);
});

test('a name inside a comment does not confer a migration home', () => {
  const sql = stripSqlComments('-- CREATE TABLE public.widgets (id uuid);\nSELECT 1;');
  assert.equal(hasMigrationHome('widgets', sql), false);
});

test('block comments are stripped too', () => {
  const sql = stripSqlComments('/* CREATE TABLE public.widgets (id uuid); */ SELECT 1;');
  assert.equal(hasMigrationHome('widgets', sql), false);
});

// Shape assertions, matching the F14/F23 holistic convention.
test('F24 is holistic: one sentinel path so the analysis runs exactly once', () => {
  assert.equal(fitnessFunction.enumerate().length, 1);
});

test('every shipped allowlist entry carries a reason and a reviewByPhase', () => {
  // 2026-08-11: NO_MIGRATION_HOME reached EMPTY (22 dropped-or-backfilled via migrations 254 + 256).
  // Empty is the target state, not a defect — the shape assertion applies to whatever entries exist.
  assert.ok(NO_MIGRATION_HOME.every((e) => e.object && e.reason && e.reviewByPhase));
  assert.ok(BROKEN_REF_ALLOWLIST.every((e) => e.missingRelation && e.reason && e.reviewByPhase));
});

test('the shipped allowlist has no duplicate objects', () => {
  const names = NO_MIGRATION_HOME.map((e) => e.object);
  assert.equal(new Set(names).size, names.length);
});

// ── DATABASE-ORIGINATED EGRESS AND SCHEDULING (2026-08-11) ─────────────────────────────────────────
// pg_net and pg_cron are installed, so the database can reach the network and schedule its own work —
// neither of which passes through application code, so F15 (spend chokepoint) and F16 (transport hold)
// are blind to both by construction. These prove the snapshot's netCallers/cronJobs are gated the same
// way everything else here is: unsanctioned is RED, and a sanction that outlives its subject is RED.

test('an unsanctioned pg_net caller is RED', () => {
  // 't' has a migration home, so it contributes nothing — the only finding must be the egress one.
  const cat = { tables: ['t'], views: [], rpcFunctions: [], triggerFunctions: [], netCallers: ['rogue_fetch'] };
  const problems = auditCatalog(cat, 'CREATE TABLE public.t (id uuid);', EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /UNSANCTIONED DATABASE EGRESS/);
  assert.match(problems[0], /rogue_fetch/);
});

test('a sanctioned pg_net caller passes', () => {
  const cat = { tables: [], views: [], rpcFunctions: ['ok_fetch'], triggerFunctions: [], netCallers: ['ok_fetch'] };
  const allow = new Map([['ok_fetch', { object: 'ok_fetch', reason: 'r', reviewByPhase: 'p' }]]);
  const net = new Map([['ok_fetch', { object: 'ok_fetch', reason: 'r', reviewByPhase: 'p' }]]);
  assert.deepEqual(auditCatalog(cat, 'SELECT 1;', allow, EMPTY_ALLOW, net, EMPTY_ALLOW), []);
});

test('a net sanction whose function no longer calls net.http_* is RED (stale)', () => {
  const cat = { tables: [], views: [], rpcFunctions: ['f'], triggerFunctions: [], netCallers: [] };
  const allow = new Map([['f', { object: 'f', reason: 'r', reviewByPhase: 'p' }]]);
  const net = new Map([['gone', { object: 'gone', reason: 'r', reviewByPhase: 'p' }]]);
  const problems = auditCatalog(cat, 'SELECT 1;', allow, EMPTY_ALLOW, net, EMPTY_ALLOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no longer appears in the snapshot's netCallers/);
});

test('an unsanctioned pg_cron job is RED', () => {
  const cat = {
    tables: [], views: [], rpcFunctions: ['f'], triggerFunctions: [],
    cronJobs: [{ jobname: 'secret-nightly', schedule: '0 3 * * *' }],
  };
  const allow = new Map([['f', { object: 'f', reason: 'r', reviewByPhase: 'p' }]]);
  const problems = auditCatalog(cat, 'SELECT 1;', allow, EMPTY_ALLOW, EMPTY_ALLOW, EMPTY_ALLOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /UNSANCTIONED DATABASE SCHEDULE/);
  assert.match(problems[0], /secret-nightly/);
});

test('a cron sanction for a job that is no longer scheduled is RED (stale)', () => {
  const cat = { tables: [], views: [], rpcFunctions: ['f'], triggerFunctions: [], cronJobs: [] };
  const allow = new Map([['f', { object: 'f', reason: 'r', reviewByPhase: 'p' }]]);
  const cron = new Map([['old-job', { jobname: 'old-job', reason: 'r', reviewByPhase: 'p' }]]);
  const problems = auditCatalog(cat, 'SELECT 1;', allow, EMPTY_ALLOW, EMPTY_ALLOW, cron);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no longer scheduled/);
});

// The shipped state, asserted so a future refresh cannot quietly introduce either capability.
test('the shipped catalog has exactly one sanctioned net caller and ZERO cron jobs', () => {
  assert.equal(NET_EGRESS_SANCTIONED.length, 1);
  assert.equal(NET_EGRESS_SANCTIONED[0].object, 'capture_worker_fetch');
  assert.equal(CRON_SANCTIONED.length, 0, 'nothing is scheduled inside the database, and that is the correct state');
});

test('the broken-reference allowlist is EMPTY — migration 254 repaired rather than exempted', () => {
  assert.equal(BROKEN_REF_ALLOWLIST.length, 0);
});
