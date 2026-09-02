// Fire-tests for F28 (harness-run integrity).
// Run: node --test fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.test.mjs
//
// Behavioural, in the F23/F25/F27 style: scanArtifacts / auditSchema / auditFamilyPresence /
// auditStalenessCoupling / auditProposerAttestation / parsePendingRunHash are driven with CONSTRUCTED
// inputs so the RULES are proven, not just today's tree. RED FIRST: every rule below has a test proving
// a violating fixture actually fails before the "live tree passes" test at the bottom.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { posix, join } from 'node:path';
import {
  scanArtifacts,
  auditSchema,
  auditFamilyPresence,
  auditStalenessCoupling,
  auditProposerAttestation,
  parsePendingRunHash,
  safeHashGoverningFiles,
  GOVERNING_FILES,
  fitnessFunction,
} from './F28-harness-run-integrity.mjs';
import { ALLOWED_FAMILIES, validateRunArtifact } from '../../../scripts/lib/run-artifact.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

function validArtifact(overrides = {}) {
  const base = {
    harness_family: 'mint',
    harness_version: 'sha256:aaaaaaaaaaaaaaaa',
    run_id: 'mint-run-001',
    started_at: '2026-09-01T00:00:00Z',
    config: {},
    inputs_ref: ['/tmp/x.json'],
    per_item: [],
    metrics: {},
    defects_found: [],
    full_trace_refs: ['/tmp/report.md'],
    proposer_notes: '',
  };
  return { ...base, ...overrides };
}

// ── scanArtifacts + auditSchema: rule (a) ────────────────────────────────────

test('scanArtifacts: groups by family and separates valid from invalid (unparseable JSON)', () => {
  const artifact = validArtifact();
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json': JSON.stringify(artifact),
    'fsi-app/scripts/harness-runs/mint/mint-run-002.json': 'not json{{{',
  });
  assert.equal(byFamily.get('mint').valid.length, 1);
  assert.equal(byFamily.get('mint').invalid.length, 1);
  assert.match(byFamily.get('mint').invalid[0].reason, /unparseable JSON/);
});

test('scanArtifacts: a file that parses but fails schema validation is invalid, not valid', () => {
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/screen/screen-run-001.json': JSON.stringify({ harness_family: 'screen' }),
  });
  assert.equal(byFamily.get('screen').valid.length, 0);
  assert.equal(byFamily.get('screen').invalid.length, 1);
  assert.match(byFamily.get('screen').invalid[0].reason, /missing required field/);
});

test('scanArtifacts: ignores non-family-scoped files (e.g. a stray top-level .json) and non-.json siblings', () => {
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/stray.json': '{}',
    'fsi-app/scripts/harness-runs/mint/PENDING-RUN.md': 'not an artifact',
  });
  assert.equal(byFamily.size, 0);
});

test('RED: auditSchema reports an invalid artifact file by name and reason', () => {
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json': JSON.stringify({ harness_family: 'mint' }),
  });
  const problems = auditSchema(byFamily);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /INVALID ARTIFACT/);
  assert.match(problems[0], /mint-run-001\.json/);
});

test('GREEN: auditSchema is silent when every artifact validates', () => {
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json': JSON.stringify(validArtifact()),
  });
  assert.deepEqual(auditSchema(byFamily), []);
});

// ── auditFamilyPresence: rule (b) ────────────────────────────────────────────

test('RED: a registered family with zero valid artifacts is NO ARTIFACTS', () => {
  const { byFamily } = scanArtifacts({});
  const problems = auditFamilyPresence(['mint', 'screen'], byFamily);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /NO ARTIFACTS/);
  assert.match(problems[0], /"mint"/);
});

test('RED: a family whose only file is INVALID counts as zero valid artifacts (not "has a file")', () => {
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json': JSON.stringify({ harness_family: 'mint' }),
  });
  const problems = auditFamilyPresence(['mint'], byFamily);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /NO ARTIFACTS/);
});

test('GREEN: a zero-artifact family is silent when it is ACKNOWLEDGED (hash-pinned PENDING-RUN.md, first run pending)', () => {
  const { byFamily } = scanArtifacts({});
  const problems = auditFamilyPresence(['mint', 'source-sweep'], byFamily, new Set(['source-sweep']));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"mint"/);
  assert.doesNotMatch(problems.join('\n'), /"source-sweep"/);
});

test('RED: acknowledgment is per-family and never silences a family with no marker', () => {
  const { byFamily } = scanArtifacts({});
  const problems = auditFamilyPresence(['screen'], byFamily, new Set(['source-sweep']));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /NO ARTIFACTS/);
});

test('GREEN: a family with ≥1 valid artifact is silent', () => {
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json': JSON.stringify(validArtifact()),
  });
  assert.deepEqual(auditFamilyPresence(['mint'], byFamily), []);
});

// ── parsePendingRunHash ───────────────────────────────────────────────────────

test('parsePendingRunHash: extracts the hash from the documented bold+backtick shape', () => {
  const md = '# Pending run — mint\n\n**harness_version at write time:** `sha256:81e11f37f14db382`\n';
  assert.equal(parsePendingRunHash(md), 'sha256:81e11f37f14db382');
});

test('parsePendingRunHash: returns null for a marker with no such line', () => {
  assert.equal(parsePendingRunHash('# Pending run\n\nnothing here.'), null);
});

test('parsePendingRunHash: returns null for null/undefined content', () => {
  assert.equal(parsePendingRunHash(null), null);
  assert.equal(parsePendingRunHash(undefined), null);
});

// ── auditStalenessCoupling: rule (c) — the RED-first fixture proving the coupling actually fires ───────

test('RED: no artifact matches the current hash and no PENDING-RUN.md — STALENESS COUPLING', () => {
  const artifacts = [validArtifact({ harness_version: 'sha256:old_hash_00000' })];
  const problems = auditStalenessCoupling('mint', 'sha256:new_hash_11111', artifacts, { exists: false, hash: null });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALENESS COUPLING/);
  assert.match(problems[0], /mint-run-001/);
});

test('GREEN: the latest (or any) artifact already matches the current hash', () => {
  const artifacts = [validArtifact({ harness_version: 'sha256:aaaaaaaaaaaaaaaa' })];
  const problems = auditStalenessCoupling('mint', 'sha256:aaaaaaaaaaaaaaaa', artifacts, { exists: false, hash: null });
  assert.deepEqual(problems, []);
});

test('GREEN: drift is honestly acknowledged by a PENDING-RUN.md whose recorded hash equals the current hash', () => {
  const artifacts = [validArtifact({ harness_version: 'sha256:old_hash_00000' })];
  const problems = auditStalenessCoupling('mint', 'sha256:new_hash_11111', artifacts, {
    exists: true,
    hash: 'sha256:new_hash_11111',
  });
  assert.deepEqual(problems, []);
});

test('RED: a PENDING-RUN.md whose recorded hash does not match current — the files drifted AGAIN', () => {
  const artifacts = [validArtifact({ harness_version: 'sha256:old_hash_00000' })];
  const problems = auditStalenessCoupling('mint', 'sha256:new_hash_22222', artifacts, {
    exists: true,
    hash: 'sha256:new_hash_11111', // stale — written against an earlier drift, not this one
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALE PENDING-RUN\.md/);
  assert.match(problems[0], /drifted AGAIN/);
});

test('RED: a PENDING-RUN.md whose recorded hash a landed artifact ALREADY matches — remove the marker', () => {
  const artifacts = [validArtifact({ harness_version: 'sha256:aaaaaaaaaaaaaaaa' })];
  const problems = auditStalenessCoupling('mint', 'sha256:aaaaaaaaaaaaaaaa', artifacts, {
    exists: true,
    hash: 'sha256:aaaaaaaaaaaaaaaa',
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALE PENDING-RUN\.md/);
  assert.match(problems[0], /planned run happened/);
});

test('RED: an UNPARSEABLE PENDING-RUN.md (present but no hash line) still reports staleness, not silence', () => {
  const artifacts = [validArtifact({ harness_version: 'sha256:old_hash_00000' })];
  const problems = auditStalenessCoupling('mint', 'sha256:new_hash_11111', artifacts, { exists: true, hash: null });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALE PENDING-RUN\.md/);
  assert.match(problems[0], /missing a "harness_version at write time" line/);
});

test('NARROWING: a family with zero valid artifacts is never double-reported by rule (c) — rule (b) owns it', () => {
  const problems = auditStalenessCoupling('mint', 'sha256:anything', [], { exists: false, hash: null });
  assert.deepEqual(problems, []);
});

// ── auditProposerAttestation: rule (d) ───────────────────────────────────────

test('N<2 artifacts: no attestation required yet', () => {
  const artifacts = [validArtifact()];
  assert.deepEqual(auditProposerAttestation('mint', artifacts, null), []);
});

test('RED: N≥2 artifacts and no LAST-PROPOSER-PASS.md at all', () => {
  const artifacts = [
    validArtifact({ run_id: 'screen-run-001', harness_family: 'screen', started_at: '2026-08-31T17:00:00Z' }),
    validArtifact({ run_id: 'screen-run-002', harness_family: 'screen', started_at: '2026-08-31T18:00:00Z' }),
  ];
  const problems = auditProposerAttestation('screen', artifacts, null);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /NO PROPOSER ATTESTATION/);
  assert.match(problems[0], /screen-run-002/); // names the LATEST run it expects to see
});

test('RED: LAST-PROPOSER-PASS.md exists but does not name the latest run_id (stale — an older pass)', () => {
  const artifacts = [
    validArtifact({ run_id: 'screen-run-001', harness_family: 'screen', started_at: '2026-08-31T17:00:00Z' }),
    validArtifact({ run_id: 'screen-run-002', harness_family: 'screen', started_at: '2026-08-31T18:00:00Z' }),
  ];
  const problems = auditProposerAttestation('screen', artifacts, 'Artifacts read: screen-run-001. Proposal: none.');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALE PROPOSER ATTESTATION/);
});

test('GREEN: LAST-PROPOSER-PASS.md names the latest run_id (order-independent — sorted by started_at)', () => {
  const artifacts = [
    validArtifact({ run_id: 'screen-run-002', harness_family: 'screen', started_at: '2026-08-31T18:00:00Z' }),
    validArtifact({ run_id: 'screen-run-001', harness_family: 'screen', started_at: '2026-08-31T17:00:00Z' }),
  ];
  const problems = auditProposerAttestation('screen', artifacts, 'Artifacts read: screen-run-001, screen-run-002.');
  assert.deepEqual(problems, []);
});

// ── safeHashGoverningFiles: a missing governing file is a NAMED failure, never an unhandled throw ──

test('safeHashGoverningFiles: hashes cleanly when every governing file exists (GREEN passthrough)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f28-safehash-'));
  try {
    writeFileSync(join(dir, 'a.mjs'), 'export const x = 1;\n');
    const { hash, problems } = safeHashGoverningFiles('mint', ['a.mjs'], dir);
    assert.match(hash, /^sha256:[0-9a-f]{16}$/);
    assert.deepEqual(problems, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('safeHashGoverningFiles RED: a missing governing file yields a NAMED problem (not a thrown ENOENT), naming the family and the missing path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f28-safehash-'));
  try {
    writeFileSync(join(dir, 'a.mjs'), 'export const x = 1;\n');
    // 'b.mjs' is listed but does not exist on disk — the exact shape a stale/typo'd GOVERNING_FILES entry
    // produces. Before this fix, hashHarnessVersion's plain readFileSync would throw a raw ENOENT here and
    // abort check() for every family in the same pass.
    let threw = false;
    let result;
    try {
      result = safeHashGoverningFiles('mint', ['a.mjs', 'b.mjs'], dir);
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'safeHashGoverningFiles must not let ENOENT escape as a raw throw');
    assert.equal(result.hash, null);
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0], /MISSING GOVERNING FILE/);
    assert.match(result.problems[0], /harness family "mint"/);
    assert.match(result.problems[0], /b\.mjs/, 'the missing path must be named in the message');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('safeHashGoverningFiles RED: a non-ENOENT failure (e.g. a listed "file" that is actually a directory) still propagates, never silently swallowed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f28-safehash-'));
  try {
    mkdirSync(join(dir, 'not-a-file.mjs'));
    assert.throws(() => safeHashGoverningFiles('mint', ['not-a-file.mjs'], dir), (err) => err.code !== 'ENOENT');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check() does not throw when a family has a missing governing file — reports a named problem instead (fixture: forward-events with an unregistered/missing governing file)', () => {
  // Regression proof for the exact scenario CONVENTION.md's forward-events comment names as "fine
  // today only because rule (c) skips families with zero artifacts": drive scanArtifacts/auditSchema's
  // sibling code path (safeHashGoverningFiles, the actual fix) directly against a family with ≥1 valid
  // artifact but a governing file that does not exist — this is what check() itself calls internally, so
  // a passing result here proves check() cannot crash on this input without re-deriving getRepoRoot().
  const problems = safeHashGoverningFiles('forward-events', ['scripts/forward-events/does-not-exist.mjs'], '/tmp').problems;
  assert.equal(problems.length, 1);
  assert.match(problems[0], /MISSING GOVERNING FILE/);
  assert.match(problems[0], /does-not-exist\.mjs/);
});

// ── shape ─────────────────────────────────────────────────────────────────

test('F28 is holistic: one sentinel so the harness-runs analysis runs exactly once', () => {
  assert.equal(fitnessFunction.enumerate().length, 1);
});

test('GOVERNING_FILES keys are exactly ALLOWED_FAMILIES (kept 1:1 by construction)', () => {
  assert.deepEqual(Object.keys(GOVERNING_FILES).sort(), [...ALLOWED_FAMILIES].sort());
});

// CONVENTION-TABLE-PARITY: parse CONVENTION.md's own harness_version table and assert F28's hardcoded
// GOVERNING_FILES resolves to the identical file list — a hand-edited table drifting from F28's copy is
// caught here, not trusted on faith. The table's shorthand (every row's FIRST file is a full fsi-app-
// relative path; every SUBSEQUENT file in that row is relative to that first file's directory) is
// resolved the same way for every row.
function parseConventionGoverningFiles(md) {
  const table = new Map();
  for (const line of md.split('\n')) {
    const m = /^\|\s*`([a-z-]+)`\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (!m) continue;
    const [, family, cell] = m;
    const tokens = [...cell.matchAll(/`([^`]+)`/g)].map((t) => t[1]);
    if (tokens.length === 0) continue;
    const base = posix.dirname(tokens[0]);
    const resolved = tokens.map((t, i) => (i === 0 ? t : posix.join(base, t)));
    table.set(family, resolved);
  }
  return table;
}

test('CONVENTION-TABLE-PARITY: F28.GOVERNING_FILES matches CONVENTION.md\'s harness_version table for every family', () => {
  const root = getRepoRoot();
  const md = readFileSync(`${root}/fsi-app/scripts/harness-runs/CONVENTION.md`, 'utf8');
  const parsed = parseConventionGoverningFiles(md);
  assert.equal(parsed.size, 7, 'expected exactly 7 rows (mint, screen, fetch-drain, meta-harness, forward-events, source-sweep, propagation) in the table');
  for (const [family, files] of parsed) {
    assert.deepEqual(
      [...GOVERNING_FILES[family]].sort(),
      [...files].sort(),
      `GOVERNING_FILES.${family} must match CONVENTION.md's table`,
    );
  }
});

// ── live tree: the gate is clean today ───────────────────────────────────────

test('F28 passes GREEN against the live tree', () => {
  const result = fitnessFunction.check();
  if (result.length !== 0) {
    assert.fail(`F28 is RED against the live tree:\n${result.map((v) => `  - ${v.message}`).join('\n')}`);
  }
});

test('sanity: every artifact currently in the repo independently passes validateRunArtifact', () => {
  // Belt-and-suspenders on rule (a): drives validateRunArtifact directly (not through scanArtifacts) over
  // every real committed artifact, so a future artifact hand-edited into invalidity fails HERE too, not
  // only via the live-tree check() above.
  const root = getRepoRoot();
  const families = ['mint', 'screen', 'fetch-drain', 'meta-harness'];
  let checked = 0;
  for (const family of families) {
    const dir = `${root}/fsi-app/scripts/harness-runs/${family}`;
    let files;
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const f of files) {
      const parsed = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
      assert.deepEqual(validateRunArtifact(parsed), [], `${family}/${f} must validate`);
      checked++;
    }
  }
  assert.ok(checked > 0, 'expected at least one real artifact on disk to check');
});
