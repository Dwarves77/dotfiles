// Fire-tests for F28 (harness-run integrity).
// Run: node --test fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.test.mjs
//
// Behavioural, in the F23/F25/F27 style: scanArtifacts / auditSchema / auditFamilyCurrency /
// auditProposerAttestation are driven with CONSTRUCTED inputs so the RULES are proven, not just today's
// tree. RED FIRST: every rule below has a test proving a violating fixture actually fails before the
// "live tree passes" test at the bottom.
//
// Lane GATE-3, 2026-10-08: the pending-marker range rule and tree-state rule (and listPendingFiles, and
// the three-lane pending-file collision replay that only existed to prove them) are DELETED. Currency is
// now judged from the harness ledger export (governing_hash equal to the live governing-file hash). No test
// here reads the wall clock: every date is a fixed constant, the reference date is injected.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as f28 from './F28-harness-run-integrity.mjs';
import {
  scanArtifacts,
  auditSchema,
  auditFamilyCurrency,
  auditProposerAttestation,
  safeHashGoverningFiles,
  CURRENCY_WINDOW_DAYS,
  CURRENCY_WINDOW_DAYS_BUILD_MODE,
  GOVERNING_FILES,
  fitnessFunction,
} from './F28-harness-run-integrity.mjs';
import { ALLOWED_FAMILIES, validateRunArtifact, isRunArtifactFilename } from '../../../scripts/lib/run-artifact.mjs';
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
    'fsi-app/scripts/harness-runs/mint/family.json': 'not an artifact',
  });
  assert.equal(byFamily.size, 0);
});

test('scanArtifacts: a .json file two levels under a family directory (traces/) is never scanned as an artifact', () => {
  // Even a file whose bare name matches the run-artifact shape exactly is excluded once it sits two levels
  // under the family directory, the same structural exclusion traces/ and family.json already relied on.
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/mint/traces/mint-run-001.json': JSON.stringify(validArtifact()),
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

// ── auditFamilyCurrency: rule (b), CURRENCY from the harness ledger export (lane GATE-3) ──────────────────

const LIVE = 'sha256:1111111111111111';
const OLD = 'sha256:2222222222222222';
const REF = new Date('2026-10-08T00:00:00Z');

function currency(overrides = {}) {
  return auditFamilyCurrency({
    family: 'widget',
    liveHash: LIVE,
    ledgerRows: [],
    ledgerPresent: true,
    registered: '2026-06-01',
    refDate: REF,
    buildMode: false,
    ...overrides,
  });
}

test('GREEN: a ledger row of the family at the live governing hash makes it current, whatever the mode or the age', () => {
  const rows = [{ family: 'widget', started_at: '2026-01-01T00:00:00Z', governing_hash: LIVE }];
  for (const buildMode of [true, false]) {
    const r = currency({ ledgerRows: rows, buildMode });
    assert.equal(r.status, 'current');
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.notices, []);
  }
});

test('RED: outside build mode, a family registered long ago with no ledger row at all fails NEVER RUN', () => {
  const r = currency({ registered: '2026-08-01' }); // 68 days before REF
  assert.equal(r.status, 'never-run');
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /NEVER RUN/);
  assert.match(r.problems[0], /"widget"/);
  assert.match(r.problems[0], /holds no row/);
});

test('GREEN: outside build mode, a family registered inside the window with no ledger row is a notice, not a failure', () => {
  const r = currency({ registered: '2026-09-25' }); // 13 days before REF
  assert.deepEqual(r.problems, []);
  assert.equal(r.notices.length, 1);
  assert.match(r.notices[0], /inside the 30-day window/);
});

test('GREEN: in BUILD_MODE a family with no ledger row at all is a notice, however old the registration (nothing has run)', () => {
  const r = currency({ buildMode: true, registered: '2025-01-01' });
  assert.equal(r.status, 'never-run');
  assert.deepEqual(r.problems, []);
  assert.match(r.notices[0], /build mode/);
});

test('an absent export is named as absent (not as an empty ledger), failing outside build mode and a notice inside it', () => {
  const off = currency({ ledgerPresent: false, registered: '2026-06-01' });
  assert.match(off.problems[0], /export is absent/);
  const on = currency({ ledgerPresent: false, buildMode: true });
  assert.deepEqual(on.problems, []);
  assert.match(on.notices[0], /export is absent/);
});

test('RED: rows exist but none at the live hash, and the newest row is older than 30 days - STALE RUN outside build mode', () => {
  const rows = [{ family: 'widget', started_at: '2026-08-20T00:00:00Z', governing_hash: OLD }]; // 49 days
  const r = currency({ ledgerRows: rows });
  assert.equal(r.status, 'owed');
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /STALE RUN/);
  assert.match(r.problems[0], /49 days old/);
  assert.match(r.problems[0], new RegExp(LIVE));
});

test('GREEN: the same 49 day old row is only a notice in BUILD_MODE (window 90), and fails again past 90 days', () => {
  const young = currency({ buildMode: true, ledgerRows: [{ family: 'widget', started_at: '2026-08-20T00:00:00Z', governing_hash: OLD }] });
  assert.deepEqual(young.problems, []);
  assert.match(young.notices[0], /90-day window/);
  const old = currency({ buildMode: true, ledgerRows: [{ family: 'widget', started_at: '2026-06-20T00:00:00Z', governing_hash: OLD }] }); // 110 days
  assert.equal(old.problems.length, 1);
  assert.match(old.problems[0], /STALE RUN/);
});

test('GREEN: rows at an older hash but a recent newest row is a notice that a run is owed, not a failure', () => {
  const r = currency({ ledgerRows: [{ family: 'widget', started_at: '2026-10-01T00:00:00Z', governing_hash: OLD }] });
  assert.equal(r.status, 'owed');
  assert.deepEqual(r.problems, []);
  assert.match(r.notices[0], /a run is owed/);
});

test('a row at the live hash for a DIFFERENT family does not make this family current', () => {
  const rows = [{ family: 'gadget', started_at: '2026-10-01T00:00:00Z', governing_hash: LIVE }];
  const r = currency({ ledgerRows: rows, registered: '2026-08-01' });
  assert.equal(r.status, 'never-run');
  assert.equal(r.problems.length, 1);
});

test('the windows are the documented 30 and 90 days', () => {
  assert.equal(CURRENCY_WINDOW_DAYS, 30);
  assert.equal(CURRENCY_WINDOW_DAYS_BUILD_MODE, 90);
});

test('GATE-3: the pending-marker rules and helpers are gone from the module', () => {
  for (const gone of ['auditPendingRange', 'auditPendingTreeState', 'listPendingFiles']) {
    assert.equal(f28[gone], undefined, `${gone} must not be exported any more`);
  }
});

test('GATE-3: no pending/ directory is left under scripts/harness-runs', () => {
  const root = join(getRepoRoot(), 'fsi-app', 'scripts', 'harness-runs');
  const offenders = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, e.name, 'pending')))
    .map((e) => e.name);
  assert.deepEqual(offenders, []);
});

// ── auditProposerAttestation: rule (c), unchanged by this lane ──────────────

test('N<2 artifacts: no attestation required yet', () => {
  const artifacts = [validArtifact()];
  assert.deepEqual(auditProposerAttestation('mint', artifacts, null), []);
});

test('RED: N>=2 artifacts and no LAST-PROPOSER-PASS.md at all', () => {
  const artifacts = [
    validArtifact({ run_id: 'screen-run-001', harness_family: 'screen', started_at: '2026-08-31T17:00:00Z' }),
    validArtifact({ run_id: 'screen-run-002', harness_family: 'screen', started_at: '2026-08-31T18:00:00Z' }),
  ];
  const problems = auditProposerAttestation('screen', artifacts, null);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /NO PROPOSER ATTESTATION/);
  assert.match(problems[0], /screen-run-002/); // names the LATEST run it expects to see
});

test('RED: LAST-PROPOSER-PASS.md exists but does not name the latest run_id (stale - an older pass)', () => {
  const artifacts = [
    validArtifact({ run_id: 'screen-run-001', harness_family: 'screen', started_at: '2026-08-31T17:00:00Z' }),
    validArtifact({ run_id: 'screen-run-002', harness_family: 'screen', started_at: '2026-08-31T18:00:00Z' }),
  ];
  const problems = auditProposerAttestation('screen', artifacts, 'Artifacts read: screen-run-001. Proposal: none.');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALE PROPOSER ATTESTATION/);
});

test('GREEN: LAST-PROPOSER-PASS.md names the latest run_id (order-independent - sorted by started_at)', () => {
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
    // 'b.mjs' is listed but does not exist on disk - the exact shape a stale/typo'd GOVERNING_FILES entry
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

test('check() does not throw when a family has a missing governing file - reports a named problem instead (fixture: forward-events with an unregistered/missing governing file)', () => {
  // Drive the actual internal helper (safeHashGoverningFiles) directly against a family with a governing
  // file that does not exist - this is what check() itself calls internally, so a passing result here
  // proves check() cannot crash on this input without re-deriving getRepoRoot().
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

// FAMILY-DESCRIPTOR-REALITY (lane N2, 2026-09-19, build plan section 6.8 Rule A, replacing
// CONVENTION-TABLE-PARITY). CONVENTION.md no longer carries a hand-maintained harness_version table for a
// registration to find and edit (the exact 2026-09-18 collision this lane's own family-registry.mjs
// exists to make impossible): each family's governing files now live only in that family's own
// family.json, and governing-files.mjs's GOVERNING_FILES is DERIVED from every family's descriptor. So
// the parity question this test proves is no longer "does the table match the module," it is "does every
// path the derived GOVERNING_FILES actually names exist on the tree it is checked against," the same
// reality-check role CONVENTION-TABLE-PARITY served, aimed at the new source of truth instead of a
// markdown table.
test('FAMILY-DESCRIPTOR-REALITY: every governing_files path of every registered family exists on disk', () => {
  const root = getRepoRoot();
  const fsiRoot = join(root, 'fsi-app');
  const missing = [];
  for (const family of ALLOWED_FAMILIES) {
    const files = GOVERNING_FILES[family];
    if (!files) continue; // defensive; GOVERNING_FILES and ALLOWED_FAMILIES are kept 1:1 by construction
    for (const rel of files) {
      const abs = join(fsiRoot, rel);
      if (!existsSync(abs)) missing.push(`${family}: ${rel} (resolved ${abs})`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `family.json governing_files paths that do not exist on disk:\n${missing.join('\n')}`,
  );
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
  // only via the live-tree check() above. isRunArtifactFilename (lane N2, 2026-09-19, Amendment 2, the
  // same predicate scanArtifacts now uses) replaces the plain ".json" suffix filter, which used to also
  // match each family's own family.json descriptor and fail this test on a file that is not a run
  // artifact at all, a THIRD occurrence of the same defect class Amendment 2's two named readers already
  // fixed (this test has its own independent readdirSync, never routed through scanArtifacts).
  const root = getRepoRoot();
  const families = ['mint', 'screen', 'fetch-drain', 'meta-harness'];
  let checked = 0;
  for (const family of families) {
    const dir = `${root}/fsi-app/scripts/harness-runs/${family}`;
    let files;
    try {
      files = readdirSync(dir).filter(isRunArtifactFilename);
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
