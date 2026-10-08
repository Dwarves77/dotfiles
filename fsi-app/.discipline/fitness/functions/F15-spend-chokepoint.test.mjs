// @ts-check
// Red-then-green for F15 (spend chokepoint). A simulated bypass (a direct Anthropic call in a
// non-allowlisted file) is RED with file:line; removed, it is GREEN. Plus the A2 guarantee: every
// LEGACY_ALLOWLIST entry's file MUST still contain a direct call (a stale entry is RED — the shrinking
// allowlist can never grandfather a file that no longer needs it).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, directApiCallLines, SANCTIONED, LEGACY_ALLOWLIST } from './F15-spend-chokepoint.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../'); // functions→fitness→.discipline→fsi-app→repo

test('RED: a direct Anthropic call in a non-allowlisted file is flagged with file:line', () => {
  const bypass = [
    'export async function sneakySpend() {',
    '  const r = await fetch("https://api.anthropic.com/v1/messages", { headers: { "x-api-key": KEY } });',
    '  return r;',
    '}',
  ].join('\n');
  const v = fitnessFunction.check('fsi-app/src/lib/agent/some-new-runner.ts', bypass);
  assert.equal(v.length, 1, 'a new direct-API file must be RED');
  assert.equal(v[0].line, 2);
});

test('GREEN: the same logic routed through the spend client is clean', () => {
  // Fixture import is RELATIVE, not "@/lib/llm/spend-client" — the glob-portability guard is TEXTUAL and
  // flags any bare/`@/` import STRING in a discipline-glob test file (CI runs this suite without npm ci).
  // F15 only inspects for a direct Anthropic call (DIRECT_API_RE); the import path is cosmetic here. Do NOT
  // "clean this up" back to the `@/` alias form — it will red the portability guard in CI.
  const clean = [
    'import { spendStream } from "../../llm/spend-client.mjs";',
    'export async function properSpend(ticket) {',
    '  const { text } = await spendStream(ticket, { system: "s", user: "u" });',
    '  return text;',
    '}',
  ].join('\n');
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/agent/some-new-runner.ts', clean), []);
});

test('GREEN: the sanctioned chokepoint + transport are never flagged', () => {
  const withCall = 'const r = await fetch("https://api.anthropic.com/v1/messages");';
  for (const f of SANCTIONED) assert.deepEqual(fitnessFunction.check(f, withCall), [], `${f} is sanctioned`);
});

test('GREEN: an allowlisted legacy file with a direct call is not flagged', () => {
  const withCall = 'headers: { "x-api-key": process.env.ANTHROPIC_API_KEY }';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/llm/haiku-classify.ts', withCall), []);
});

test('override: a trailing `// fitness-allow: F15 (reason)` suppresses the line', () => {
  const overridden = 'const r = await fetch("https://api.anthropic.com/v1/messages"); // fitness-allow: F15 (one-off diag)';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/agent/x.ts', overridden), []);
});

test('A2 STALE-ALLOWLIST AUDIT: every LEGACY_ALLOWLIST entry still has a direct call (a stale entry is RED)', () => {
  const stale = [];
  for (const entry of LEGACY_ALLOWLIST) {
    assert.ok(entry.reason && entry.reviewByPhase, `allowlist entry ${entry.file} needs reason + reviewByPhase (A2)`);
    let content = '';
    try { content = readFileSync(resolve(REPO_ROOT, entry.file), 'utf8'); }
    catch { stale.push(`${entry.file} (file missing)`); continue; }
    if (directApiCallLines(content).length === 0) stale.push(`${entry.file} (no direct call — migrated; remove from allowlist)`);
  }
  assert.deepEqual(stale, [], `stale allowlist entries — the allowlist must SHRINK, not grandfather migrated files:\n  ${stale.join('\n  ')}`);
});

// SANCTIONED STALENESS AUDIT (2026-08-11). Added when the module-liveness sweep (F25) found that
// scripts/lib/anthropic.mjs — the one SANCTIONED script-side call site — is imported ONLY by scripts on
// the dead-code manifest, so the sweep leaves it consumerless and a later deletion would leave F15
// permanently sanctioning a path that does not exist. LEGACY_ALLOWLIST was already stale-audited above;
// SANCTIONED was not, which made it the one list in this gate that could silently grandfather a ghost.
// A sanctioned path is a hole punched in the chokepoint on purpose; a hole pointing at nothing is a hole
// nobody re-examines.
test('SANCTIONED STALENESS AUDIT: every sanctioned path still exists (a ghost entry is RED)', () => {
  const missing = [];
  for (const f of SANCTIONED) {
    try { readFileSync(resolve(REPO_ROOT, f), 'utf8'); }
    catch { missing.push(f); }
  }
  assert.deepEqual(
    missing,
    [],
    `SANCTIONED names paths that no longer exist — remove them, or the chokepoint carries exemptions for ghosts:\n  ${missing.join('\n  ')}`,
  );
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

test('F15 B1-23: a host split across a concatenation is the same host', () => {
  assert.equal(directApiCallLines('const u = "https://api." + "anthropic.com/v1/messages";').length, 1);
});

test('F15 B1-24: the header spelled X-API-Key in a file that names Anthropic is the same header', () => {
  assert.equal(directApiCallLines('const h = { "X-API-Key": key, "anthropic-version": "2023-06-01" };').length, 1);
  // the same header for another provider is not a model call
  assert.equal(directApiCallLines('headers["X-Api-Key"] = REGULATIONS_GOV_API_KEY;').length, 0);
  assert.equal(directApiCallLines('const h = { "X-Api-Key": k };').length, 0);
});

test('F15 B1-25: an SDK import through a split specifier in a dynamic import', () => {
  // the fixture text is built from pieces so this test file carries no literal bare-package import (glob-portability)
  const fixture = 'const sdk = await im' + 'port("@anthropic' + '-ai/" + "sdk");';
  assert.equal(directApiCallLines(fixture).length, 1);
});

test('F15 B1-26: a continuation line that begins with an asterisk is code, not a skipped comment line', () => {
  const src = 'const total = a\n  * b + fetch("https://api.anthropic.com/v1/messages");';
  assert.equal(directApiCallLines(src).length, 1);
  assert.equal(directApiCallLines('/**\n * api.anthropic.com is documented here\n */\nconst a = 1;').length, 0);
});

test('F15 B1-27 B1-28 B1-30: scripts of every extension and components are in scope', () => {
  const body = fitnessFunction.enumerate.toString();
  assert.match(body, /cjs/);
  assert.match(body, /tsx/);
  assert.match(body, /scripts/);
});

test('F15 B1-31: a base URL read from the ANTHROPIC_BASE_URL variable is a direct-call signal', () => {
  assert.equal(directApiCallLines('const base = process.env.ANTHROPIC_BASE_URL;\nawait fetch(base + "/v1/messages");').length, 1);
});

test('F15: a URL earlier on the line does not hide the call, a forged marker in a string is not an override', () => {
  assert.equal(directApiCallLines('const a = "https://x.test/a"; fetch("https://api.anthropic.com/v1/messages");').length, 1);
  assert.equal(directApiCallLines('const m = "// fitness-allow: F15 (forged)"; fetch("https://api.anthropic.com/v1");').length, 1);
  assert.equal(directApiCallLines('fetch("https://api.anthropic.com/v1"); // fitness-allow: F15 (migration pending)').length, 0);
});
