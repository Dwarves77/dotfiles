// The registry's own test (lane REG-1, 2026-10-11). Rule 15 made mechanical: a row with neither evidence kind FAILS.
// Each negative case below is the red half; the live-tree cases are the green half against the real registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REGISTRY_ROWS, RETIRED, SUPPORT_FILES, LANE_WRITING_AUDITS, KINDS, RUNS_IN,
  auditRegistry, registrySummary, enforcedByFromRows, retiredByKind,
} from './registry.mjs';
import { fitnessFunctions } from './fitness/manifest.mjs';
import { rules } from './manifest.mjs';
import { consistencyChecks } from './consistency/manifest.mjs';
import { INVARIANTS, RETIRED_INVARIANTS } from './governance/invariants.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tracked = new Set(
  execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\0').filter(Boolean).map((p) => p.replace(/\\/g, '/')),
);
const liveEnv = {
  fitnessIds: new Set(fitnessFunctions.map((f) => f.id)),
  ruleIds: new Set(rules.map((r) => r.id)),
  consistencyIds: new Set(consistencyChecks.map((c) => c.id)),
  fileExists: (p) => tracked.has(p) && existsSync(resolve(REPO, p)),
  readFile: (p) => { try { return readFileSync(resolve(REPO, p), 'utf8'); } catch { return null; } },
};

const goodRow = {
  id: 'X1', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F2',
  governs: 'A well formed row governs one property in one line.',
  evidence: { failureRun: '31292312522' }, carries: [],
};
const fakeEnv = {
  fitnessIds: new Set(['F2']), ruleIds: new Set(), consistencyIds: new Set(),
  fileExists: (p) => p === 'a.test.mjs', readFile: (p) => (p === 'a.test.mjs' ? 'test("RED: it bites", () => {})' : null),
};
const audit = (row) => auditRegistry([row], fakeEnv).problems;

// ---------------------------------------------------------------- RED: the registry's own catching behaviour
test('RED: a row with neither evidence kind fails', () => {
  const { evidence, ...noEvidence } = goodRow;
  assert.ok(audit(noEvidence).some((p) => /NO EVIDENCE/.test(p)));
  assert.ok(audit({ ...goodRow, evidence: {} }).some((p) => /NO EVIDENCE/.test(p)));
});

test('RED: an attack test whose file is missing, or whose text is not in the file, fails', () => {
  assert.ok(audit({ ...goodRow, evidence: { attackTest: { file: 'gone.test.mjs', name: 'RED: it bites' } } }).some((p) => /not a tracked file/.test(p)));
  assert.ok(audit({ ...goodRow, evidence: { attackTest: { file: 'a.test.mjs', name: 'a name that is not there' } } }).some((p) => /does not appear/.test(p)));
});

test('RED: a failure run that is not a GitHub run id fails', () => {
  assert.ok(audit({ ...goodRow, evidence: { failureRun: 'abc' } }).some((p) => /not a GitHub run id/.test(p)));
});

test('RED: an unknown fitness enforcer, a bad kind, a bad runsIn and a glyph in governs all fail', () => {
  assert.ok(audit({ ...goodRow, enforcer: 'fitness:F999' }).some((p) => /not in the fitness manifest/.test(p)));
  assert.ok(audit({ ...goodRow, kind: 'gate' }).some((p) => /kind/.test(p)));
  assert.ok(audit({ ...goodRow, runsIn: 'nightly' }).some((p) => /runsIn/.test(p)));
  const dash = String.fromCharCode(0x2014);
  assert.ok(audit({ ...goodRow, governs: `A row that governs a thing ${dash} badly written.` }).some((p) => /glyph/.test(p)));
});

test('RED: a fitness function with no row, and a duplicate row id, fail', () => {
  const env = { ...fakeEnv, fitnessIds: new Set(['F2', 'F3']) };
  assert.ok(auditRegistry([goodRow], env).problems.some((p) => /fitness F3 has no registry row/.test(p)));
  assert.ok(auditRegistry([goodRow, goodRow], fakeEnv).problems.some((p) => /duplicate id/.test(p)));
});

test('GREEN: a well formed row passes, with a failure run, with an attack test, or with both', () => {
  assert.deepEqual(audit(goodRow), []);
  assert.deepEqual(audit({ ...goodRow, evidence: { attackTest: { file: 'a.test.mjs', name: 'RED: it bites' } } }), []);
  assert.deepEqual(audit({ ...goodRow, evidence: { failureRun: '31292312522', attackTest: { file: 'a.test.mjs', name: 'RED: it bites' } } }), []);
});

// ---------------------------------------------------------------- the real registry
test('LIVE: every row resolves and carries evidence; every fitness function, rule and consistency check has a row', () => {
  assert.deepEqual(auditRegistry(REGISTRY_ROWS, liveEnv).problems, []);
});

test('LIVE: the registry holds fewer than 150 rows (target of the whole-build plan, phase C)', () => {
  assert.ok(REGISTRY_ROWS.length < 150, `${REGISTRY_ROWS.length} rows`);
});

test('LIVE: every tracked verify script is a row enforcer, an attack-test file of a row, or a named support file', () => {
  const rowFiles = new Set();
  for (const r of REGISTRY_ROWS) {
    const m = /^(?:audit|selftest):(.+)$/.exec(r.enforcer);
    if (m) rowFiles.add(m[1]);
    if (r.evidence?.attackTest?.file) rowFiles.add(r.evidence.attackTest.file);
  }
  const orphans = [...tracked].filter((f) => f.startsWith('fsi-app/scripts/verify/') && !rowFiles.has(f) && !SUPPORT_FILES.some((re) => re.test(f)));
  assert.deepEqual(orphans, [], 'a verify script that is neither a registry row nor support has no evidence it bites: add the row or delete it');
});

test('LIVE: every data-audit marker script is a row enforcer or a named writer the smoke step skips', () => {
  const rowFiles = new Set(REGISTRY_ROWS.map((r) => (/^audit:(.+)$/.exec(r.enforcer) ?? [])[1]).filter(Boolean));
  const skipped = new Set(LANE_WRITING_AUDITS.map((a) => a.file));
  const marked = [...tracked].filter((f) => /^fsi-app\/scripts\/(?:verify\/)?[^/]+\.mjs$/.test(f) && !/\.test\.mjs$/.test(f)
    && /^\/\/ data-audit: label=/m.test(readFileSync(resolve(REPO, f), 'utf8')));
  const missing = marked.filter((f) => !rowFiles.has(f) && !skipped.has(f));
  assert.deepEqual(missing, []);
  for (const a of LANE_WRITING_AUDITS) assert.ok(marked.includes(a.file), `${a.file} no longer carries a marker; drop it from LANE_WRITING_AUDITS`);
});

test('LIVE: every golden under scripts/verify is a row enforcer or an attack test of a row', () => {
  const goldenRe = /(?:\.goldens?|-golden)\.(?:mjs|cjs)$|\/golden-[^/]+\.(?:mjs|cjs)$/;
  const rowFiles = new Set();
  for (const r of REGISTRY_ROWS) {
    const m = /^(?:audit|selftest):(.+)$/.exec(r.enforcer);
    if (m) rowFiles.add(m[1]);
    if (r.evidence?.attackTest?.file) rowFiles.add(r.evidence.attackTest.file);
  }
  assert.deepEqual([...tracked].filter((f) => f.startsWith('fsi-app/scripts/verify/') && goldenRe.test(f) && !rowFiles.has(f)), []);
});

test('LIVE: every invariant is carried by a row or is exempt, and every carried id is a real invariant', () => {
  const ids = new Set(INVARIANTS.map((i) => i.id));
  const carried = new Set(REGISTRY_ROWS.flatMap((r) => r.carries ?? []));
  assert.deepEqual(INVARIANTS.filter((i) => !i.exempt && !carried.has(i.id)).map((i) => i.id), []);
  assert.deepEqual([...carried].filter((c) => !ids.has(c)), []);
  assert.deepEqual(INVARIANTS.filter((i) => i.exempt && carried.has(i.id)).map((i) => i.id), [], 'an invariant is enforced or exempt, never both');
});

test('LIVE: every retired id is gone from the live set and names a survivor that is live (or none)', () => {
  const rowIds = new Set(REGISTRY_ROWS.map((r) => r.id));
  const invIds = new Set(INVARIANTS.map((i) => i.id));
  for (const [id, r] of Object.entries(retiredByKind('fitness'))) {
    assert.ok(!liveEnv.fitnessIds.has(id), `${id} is retired but still a fitness function`);
    assert.ok(rowIds.has(r.survivor), `${id}: survivor ${r.survivor} is not a row`);
  }
  for (const id of Object.keys(retiredByKind('invariant'))) assert.ok(!invIds.has(id), `${id} is retired but still an invariant`);
  for (const id of Object.keys(retiredByKind('script'))) {
    const name = id.slice('script:'.length);
    assert.ok(![...tracked].some((f) => f.startsWith('fsi-app/scripts/verify/') && basename(f).replace(/\.mjs$/, '') === name), `${id} is retired but the file is tracked`);
  }
  for (const r of Object.values(RETIRED)) {
    assert.ok(r.reason.split(/\s+/).length >= 6 && !Number.isNaN(Date.parse(r.retiredOn)), 'a retirement needs a reason and a date');
    if (r.survivor && r.kind !== 'workflow') assert.ok(rowIds.has(r.survivor) || invIds.has(r.survivor), `survivor ${r.survivor} is neither a row nor an invariant`);
  }
  assert.deepEqual(Object.keys(RETIRED_INVARIANTS).sort(), Object.keys(retiredByKind('invariant')).sort());
});

test('LIVE: live-smoke runs the read-only audit step and the old data-audit-lane workflow has no live schedule (rule 16)', () => {
  const lane = readFileSync(resolve(REPO, '.github/workflows/data-audit-lane.yml'), 'utf8');
  assert.doesNotMatch(lane, /^\s{2}schedule:/m, 'a standing schedule is forbidden in build mode');
  const smoke = readFileSync(resolve(REPO, '.github/workflows/live-smoke.yml'), 'utf8');
  assert.match(smoke, /node scripts\/verify\/run-data-audit-lane\.mjs --read-only/);
});

test('enforcedByFromRows: the enforcer comes first and a test file attack evidence adds a selftest token once', () => {
  const rows = [
    { enforcer: 'fitness:F2', evidence: { attackTest: { file: 'x/F2.test.mjs', name: 'n' } }, carries: ['I1'] },
    { enforcer: 'selftest:x/B.test.mjs', evidence: { attackTest: { file: 'x/B.test.mjs', name: 'n' } }, carries: ['I1', 'I2'] },
    { enforcer: 'audit:x/c.mjs', evidence: { failureRun: '12345678' }, carries: ['I2'] },
  ];
  assert.deepEqual(enforcedByFromRows(rows, 'I1'), ['fitness:F2', 'selftest:x/F2.test.mjs', 'selftest:x/B.test.mjs']);
  assert.deepEqual(enforcedByFromRows(rows, 'I2'), ['selftest:x/B.test.mjs', 'audit:x/c.mjs']);
  assert.deepEqual(enforcedByFromRows(rows, 'I3'), []);
});

test('registrySummary: one screen, rows by kind and by runs-in, the retired count and the evidence split', () => {
  const out = registrySummary();
  assert.match(out, new RegExp(`Enforcement registry: ${REGISTRY_ROWS.length} rows`));
  for (const k of KINDS) assert.ok(out.includes(`${k} `), k);
  for (const r of RUNS_IN) assert.ok(out.includes(`${r} `), r);
  assert.match(out, /retired ids on record: \d+/);
  assert.ok(out.split('\n').length <= 6);
});
