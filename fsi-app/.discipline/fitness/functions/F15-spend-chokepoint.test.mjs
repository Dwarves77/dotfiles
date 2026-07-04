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
