#!/usr/bin/env node
// no-generic-source-audit.golden.mjs — behavioral golden for the factsOnSuspended pure core (hardening A1
// seam 3). No DB. Locks: a FACT whose source_id is a suspended source is a violation; a FACT on an active
// source (or with null source) is not flagged by THIS detector. Invariant RD-40.
// Run: node scripts/verify/no-generic-source-audit.golden.mjs — exits 0 PASS, 1 FAIL.
import { factsOnSuspended } from './no-generic-source-audit.mjs';

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failed++; };

const suspended = new Set(['dead-eurlex', 'montreal-portal']);
const facts = [
  { id: 'f1', source_id: 'dead-eurlex' },   // violation (grounds to suspended junk-drawer)
  { id: 'f2', source_id: 'real-instrument' }, // clean (active source)
  { id: 'f3', source_id: 'montreal-portal' }, // violation (suspended generic portal)
  { id: 'f4', source_id: null },              // not flagged here (null-source is a separate seam-2 gate)
];
const hits = factsOnSuspended(facts, suspended);

check('flags exactly the 2 facts on suspended sources', hits.length === 2);
check('flags the dead-eurlex fact', hits.some((h) => h.id === 'f1'));
check('flags the montreal-portal fact', hits.some((h) => h.id === 'f3'));
check('does NOT flag the active-source fact', !hits.some((h) => h.id === 'f2'));
check('does NOT flag the null-source fact (separate gate)', !hits.some((h) => h.id === 'f4'));
check('accepts an array of ids as well as a Set', factsOnSuspended([{ id: 'x', source_id: 'a' }], ['a']).length === 1);

console.log(failed ? `\nGOLDEN FAILED (${failed})` : '\nGOLDEN PASSED');
process.exit(failed ? 1 : 0);
