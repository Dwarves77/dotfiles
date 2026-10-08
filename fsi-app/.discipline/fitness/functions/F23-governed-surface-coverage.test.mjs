// Fire-tests for F23 (governed-surface coverage ratchet).
// Run: node --test fsi-app/.discipline/fitness/functions/F23-governed-surface-coverage.test.mjs
//
// Behavioural, in the style of the F13/F15/F21/F22 selftests: the ratchet comparator is exercised
// against CONSTRUCTED summaries so the test states the RULE, and cannot decay into re-asserting
// whatever the repo currently happens to measure. The live-tree assertions at the bottom are
// deliberately shape-only (keys exist, are numbers) for the same reason.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareToBaseline, GAP_BASELINE, fitnessFunction } from './F23-governed-surface-coverage.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCoverageScan, classify, stripComments, WRITE_RPCS, callsWriteRpc, listScanFiles } from '../../governance/coverage-scan.mjs';

const BASE = { orphaned_proofs: 10, unmapped_writes: 5, unmapped_model: 1, unmapped_routing: 0 };

test('F23 passes when every category sits exactly on its ceiling', () => {
  assert.deepEqual(compareToBaseline({ ...BASE }, BASE), []);
});

test('F23 FAILS on a regression above the ceiling', () => {
  const p = compareToBaseline({ ...BASE, unmapped_writes: 6 }, BASE);
  assert.equal(p.length, 1);
  assert.match(p[0], /REGRESSION/);
  assert.match(p[0], /UNMAPPED WRITES/);
});

// The half most "must not exceed" gates get wrong: without this, closing gaps leaves permanent slack
// and the count drifts back up inside the allowance with the build green the whole way.
test('F23 FAILS on an improvement, naming the value to re-seed to', () => {
  const p = compareToBaseline({ ...BASE, orphaned_proofs: 7 }, BASE);
  assert.equal(p.length, 1);
  assert.match(p[0], /RATCHET/);
  assert.match(p[0], /GAP_BASELINE\.orphaned_proofs = 7/);
});

test('F23 reports EVERY offending category, not just the first', () => {
  const p = compareToBaseline({ orphaned_proofs: 11, unmapped_writes: 6, unmapped_model: 1, unmapped_routing: 0 }, BASE);
  assert.equal(p.length, 2);
});

// A category ratchets on its OWN count. A flat total must not let one category hide another.
test('F23 does NOT let a fixed category mask a regressed one at a constant total', () => {
  const p = compareToBaseline({ ...BASE, orphaned_proofs: 9, unmapped_writes: 6 }, BASE);
  assert.equal(p.length, 2);
  assert.ok(p.some((m) => /RATCHET/.test(m)));
  assert.ok(p.some((m) => /REGRESSION/.test(m)));
});

// If the scan's summary shape changes, the gate must go RED rather than silently measure nothing —
// a comparator that reads undefined and passes is the turtle-at-the-top failure.
test('F23 FAILS LOUD when the summary shape changes rather than passing vacuously', () => {
  const p = compareToBaseline({ orphaned_proofs: 10 }, BASE);
  assert.equal(p.length, 3);
  for (const m of p) assert.match(m, /missing/);
});

// ---- the two detector defects this wiring fixed, pinned so they cannot return ----

test('coverage-scan classifies INSERT as a governed write (creation is birth, not cosmetics)', () => {
  const src = 'const { error } = await supabase.from("sources").insert(row);';
  assert.ok(classify('fsi-app/src/lib/x.ts', src).includes('WRITES'),
    'INSERT missing from WRITE_RE is what made the source-role-at-birth defect invisible to this scan.');
});

test('coverage-scan does NOT read a commented-out API mention as a model call', () => {
  const src = ['// isAnthropicRetryable(err)   for @anthropic-ai/sdk consumers',
               '//   () => anthropic.messages.create({...}),',
               'export function isAnthropicRetryable(err) { return err.status === 529; }'].join('\n');
  assert.equal(classify('fsi-app/scripts/lib/batch-primitives.mjs', src).includes('MODEL'), false);
});

test('comment stripping preserves URLs (a naive // strip would eat every https:// line)', () => {
  const kept = stripComments('const API_URL = "https://api.anthropic.com/v1/messages";');
  assert.match(kept, /api\.anthropic\.com/);
  assert.equal(stripComments('const a = 1; // trailing note').trim(), 'const a = 1;');
});

test('a real API call in live code is still MODEL after stripping', () => {
  assert.ok(classify('fsi-app/src/lib/x.mjs', 'await fetch("https://api.anthropic.com/v1/messages")').includes('MODEL'));
});

// ---- lane GATE-3 (2026-10-08): an rpc is a write only by NAME; the scan reads tracked files only ----

test('a READ rpc is not a governed write (OPS-1: gate-a-gauges.mjs, "a read RPC; the scan cannot tell")', () => {
  const src = 'const { data } = await sb.rpc("get_category_items", { p_category: c });';
  assert.equal(classify('fsi-app/scripts/verify/gate-a-gauges.mjs', src).includes('WRITES'), false);
});

test('a WRITE_RPCS rpc is a governed write, in all three quote styles; a name held in a variable is not counted', () => {
  for (const q of ['"', "'", '`']) {
    const src = `await sb.rpc(${q}admin_set_pause_state${q}, { p_flag: true });`;
    assert.ok(classify('fsi-app/src/lib/x.ts', src).includes('WRITES'), `quote ${q}`);
  }
  assert.equal(classify('fsi-app/src/lib/x.ts', 'await sb.rpc(name, args);').includes('WRITES'), false);
  assert.equal(callsWriteRpc('sb.rpc("create_org_for_self", {})'), true);
  assert.equal(callsWriteRpc('sb.rpc("create_org_for_self_not_really", {})'), false, 'exact name, not a prefix');
});

test('WRITE_RPCS carries the SECURITY DEFINER writers the brief seeded, and the lease and lock names the repo actually calls', () => {
  for (const name of ['admin_set_pause_state', 'admin_set_judgement_drain', 'create_item_correction', 'revoke_item_correction',
    'create_org_for_self', 'accept_invitation', 'request_verification', 'acquire_mutation_lease', 'heartbeat', 'release',
    'heartbeat_mutation_lease', 'release_mutation_lease', 'heartbeat_funded_pass_lock', 'release_funded_pass_lock']) {
    assert.ok(WRITE_RPCS.includes(name), name);
  }
});

test('an rpc name inside a comment is not a call', () => {
  const src = ['// we used to call sb.rpc("admin_set_pause_state") here', 'export const x = 1;'].join('\n');
  assert.equal(classify('fsi-app/src/lib/x.ts', src).includes('WRITES'), false);
});

test('listScanFiles enumerates git-tracked files only: a gitignored scratch file is never scanned', () => {
  const root = mkdtempSync(join(tmpdir(), 'f23-scan-'));
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  try {
    git(['init', '-q']);
    mkdirSync(join(root, 'fsi-app', 'src'), { recursive: true });
    mkdirSync(join(root, 'fsi-app', 'scripts', 'tmp'), { recursive: true });
    writeFileSync(join(root, 'fsi-app', 'src', 'tracked.mjs'), 'export const a = 1;' + String.fromCharCode(10));
    writeFileSync(join(root, 'fsi-app', 'scripts', 'tmp', 'scratch.mjs'), 'sb.from("t").insert(r);' + String.fromCharCode(10));
    writeFileSync(join(root, '.gitignore'), 'fsi-app/scripts/tmp/' + String.fromCharCode(10));
    git(['add', '.']);
    const found = listScanFiles(root, ['fsi-app/src', 'fsi-app/scripts']).map((f) => f.split(String.fromCharCode(92)).join('/').replace(root.split(String.fromCharCode(92)).join('/') + '/', ''));
    assert.deepEqual(found, ['fsi-app/src/tracked.mjs']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- live-tree shape (deliberately not value assertions) ----

test('F23 runs the real scan and gets a well-formed summary', () => {
  const { summary } = runCoverageScan();
  for (const key of Object.keys(GAP_BASELINE)) {
    assert.equal(typeof summary[key], 'number', `summary.${key} must be a number for the ratchet to measure it`);
  }
  assert.ok(summary.governed_files > 0);
});

test('F23 is holistic: one sentinel so the whole-tree check runs exactly once', () => {
  assert.equal(fitnessFunction.enumerate().length, 1);
});

test('a hash or Map .update/.delete call is NOT a governed write; a Supabase .from().update() is (one predicate with rule 015)', () => {
  const hash = 'const sha = createHash("sha256").update(body).digest("hex");';
  assert.equal(classify('fsi-app/scripts/verify/x.mjs', hash).includes('WRITES'), false);
  const map = 'const m = new Map(); m.delete(key); const s = new Set(); s.delete(k);';
  assert.equal(classify('fsi-app/scripts/verify/x.mjs', map).includes('WRITES'), false);
  const db = 'await sb.from("sources").update({ x: 1 }).eq("id", id);';
  assert.ok(classify('fsi-app/scripts/verify/x.mjs', db).includes('WRITES'));
  const del = 'await supabase.from("sources").delete().eq("id", id);';
  assert.ok(classify('fsi-app/src/lib/x.ts', del).includes('WRITES'));
  const both = hash + '\n' + db;
  assert.ok(classify('fsi-app/scripts/verify/x.mjs', both).includes('WRITES'), 'a real write next to a hash call is still a write');
});
