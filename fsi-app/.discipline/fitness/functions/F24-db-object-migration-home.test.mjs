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
} from './F24-db-object-migration-home.mjs';

const EMPTY_ALLOW = new Map();

test('an object with no migration and no allowlist entry is RED', () => {
  const cat = { tables: ['widgets'], views: [], rpcFunctions: [], triggerFunctions: [] };
  const problems = auditCatalog(cat, 'CREATE TABLE public.other (id uuid);', EMPTY_ALLOW, EMPTY_ALLOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /OUT-OF-REPO DDL/);
  assert.match(problems[0], /widgets/);
});

test('an object created by a migration passes', () => {
  const cat = { tables: ['widgets'], views: [], rpcFunctions: [], triggerFunctions: [] };
  assert.deepEqual(auditCatalog(cat, 'CREATE TABLE IF NOT EXISTS public.widgets (id uuid);', EMPTY_ALLOW, EMPTY_ALLOW), []);
});

test('an allowlisted object with no migration passes', () => {
  const cat = { tables: ['widgets'], views: [], rpcFunctions: [], triggerFunctions: [] };
  const allow = new Map([['widgets', { object: 'widgets', reason: 'r', reviewByPhase: 'p' }]]);
  assert.deepEqual(auditCatalog(cat, 'SELECT 1;', allow, EMPTY_ALLOW), []);
});

// The half that makes it a ratchet rather than a permission list: the allowlist must shrink on its own.
test('an allowlist entry whose object HAS gained a migration is RED (stale entry)', () => {
  const cat = { tables: ['widgets'], views: [], rpcFunctions: [], triggerFunctions: [] };
  const allow = new Map([['widgets', { object: 'widgets', reason: 'r', reviewByPhase: 'p' }]]);
  const problems = auditCatalog(cat, 'CREATE TABLE public.widgets (id uuid);', allow, EMPTY_ALLOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALE ALLOWLIST/);
});

test('an allowlist entry for an object no longer in the catalog is RED (stale entry)', () => {
  const cat = { tables: [], views: [], rpcFunctions: ['kept'], triggerFunctions: [] };
  const allow = new Map([
    ['kept', { object: 'kept', reason: 'r', reviewByPhase: 'p' }],
    ['dropped', { object: 'dropped', reason: 'r', reviewByPhase: 'p' }],
  ]);
  const problems = auditCatalog(cat, 'SELECT 1;', allow, EMPTY_ALLOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no longer in db-catalog\.json/);
});

test('an allowlist entry without reason + reviewByPhase is RED', () => {
  const cat = { tables: ['widgets'], views: [], rpcFunctions: [], triggerFunctions: [] };
  const allow = new Map([['widgets', { object: 'widgets', reason: 'r' }]]);
  const problems = auditCatalog(cat, 'SELECT 1;', allow, EMPTY_ALLOW);
  assert.ok(problems.some((p) => /ALLOWLIST ENTRY WITHOUT A REASON/.test(p)));
});

test('an unexplained DB-internal broken reference is RED', () => {
  const cat = {
    tables: ['widgets'], views: [], rpcFunctions: [], triggerFunctions: [],
    internalBrokenRefs: [{ owner: 'fn:foo', missingRelation: 'gone_table' }],
  };
  const allow = new Map([['widgets', { object: 'widgets', reason: 'r', reviewByPhase: 'p' }]]);
  const problems = auditCatalog(cat, 'SELECT 1;', allow, EMPTY_ALLOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /BROKEN DB-INTERNAL REFERENCE/);
  assert.match(problems[0], /gone_table/);
});

test('a broken-ref allowlist entry that no longer appears in the snapshot is RED', () => {
  const cat = { tables: [], views: [], rpcFunctions: ['f'], triggerFunctions: [], internalBrokenRefs: [] };
  const allowBroken = new Map([['gone_table', { missingRelation: 'gone_table', reason: 'r', reviewByPhase: 'p' }]]);
  const allow = new Map([['f', { object: 'f', reason: 'r', reviewByPhase: 'p' }]]);
  const problems = auditCatalog(cat, 'SELECT 1;', allow, allowBroken);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no longer appears/);
});

test('an empty catalog is RED rather than silently green', () => {
  const problems = auditCatalog({ tables: [], views: [], rpcFunctions: [], triggerFunctions: [] }, 'SELECT 1;', EMPTY_ALLOW, EMPTY_ALLOW);
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
  assert.ok(NO_MIGRATION_HOME.length > 0, 'the allowlist is explicit, not empty');
  assert.ok(NO_MIGRATION_HOME.every((e) => e.object && e.reason && e.reviewByPhase));
  assert.ok(BROKEN_REF_ALLOWLIST.every((e) => e.missingRelation && e.reason && e.reviewByPhase));
});

test('the shipped allowlist has no duplicate objects', () => {
  const names = NO_MIGRATION_HOME.map((e) => e.object);
  assert.equal(new Set(names).size, names.length);
});
