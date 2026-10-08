// Proof for the SOURCE half of check-pretooluse-wired.mjs's wrapper verification (lane GATE-2, 2026-10-08).
// The scope shim may delegate to the gate by spawning it (the original shape) or by importing it and
// awaiting runGate at the in-scope call site (one node start instead of two). The importing shape is
// accepted only with the await, because without it the shim's trailing allow() runs before the gate and
// the gate is silently bypassed. Fixtures only; the real shim lives outside the repo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapperSourceDelegates } from './check-pretooluse-wired.mjs';

const GATE = 'C:/fixture/dotfiles/fsi-app/.discipline/governance/pretooluse-skill-gate.mjs';

const SPAWN_SHIM = `
import { spawnSync } from "node:child_process";
const GATE = "${GATE}";
function runGate(input) { const r = spawnSync("node", [GATE], { input, encoding: "utf8" }); process.stdout.write(r.stdout); process.exit(0); }
let inScope = true;
if (inScope) runGate(raw);
allow();
`;

const IMPORT_SHIM_AWAITED = `
import { pathToFileURL } from "node:url";
const GATE = "${GATE}";
async function runGate(input) {
  let out = "";
  try { out = (await import(pathToFileURL(GATE).href)).runGate(input); } catch { /* fail closed */ }
  process.stdout.write(out || "{}");
  process.exit(0);
}
let inScope = true;
if (inScope) await runGate(raw);
allow();
`;

test('a spawning shim that names the gate is accepted (the original shape)', () => {
  assert.equal(wrapperSourceDelegates(SPAWN_SHIM).ok, true);
});

test('an importing shim that awaits runGate at the in-scope call site is accepted', () => {
  const r = wrapperSourceDelegates(IMPORT_SHIM_AWAITED);
  assert.equal(r.ok, true, r.why);
  assert.match(r.why, /imports the gate/);
});

test('ATTACK: an importing shim whose in-scope call is NOT awaited is refused (allow() would run first)', () => {
  const r = wrapperSourceDelegates(IMPORT_SHIM_AWAITED.replace('if (inScope) await runGate(raw);', 'if (inScope) runGate(raw);'));
  assert.equal(r.ok, false);
  assert.match(r.why, /await/);
});

test('ATTACK: a shim that names the gate but neither spawns nor imports it is refused', () => {
  const r = wrapperSourceDelegates(`const GATE = "${GATE}";\nif (inScope) await runGate(raw);\n`);
  assert.equal(r.ok, false);
  assert.match(r.why, /neither spawns/);
});

test('ATTACK: a shim that stopped referencing the gate at all is refused', () => {
  const r = wrapperSourceDelegates('process.stdout.write("{}");\n');
  assert.equal(r.ok, false);
  assert.match(r.why, /stopped wrapping/);
});

test('an importing shim that imports the gate but never calls runGate is refused', () => {
  const r = wrapperSourceDelegates(`const GATE = "${GATE}";\nawait import(GATE);\nif (inScope) await go(raw);\n`);
  assert.equal(r.ok, false);
});
