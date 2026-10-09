// audit-finding-status.test.mjs — red-then-green proof for the rule-14 enforcer's own logic (this
// lane's scope is wiring the script into a real runner, not relabeling the historical backlog, so the
// test drives the exported, pure pieces against fixtures rather than the live docs/audits/ tree).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listAuditFiles, dispositionProblem, auditFindings, sessionLogFindings, dateOfPath, collectOpenFindings, contractContradiction,
} from './audit-finding-status.mjs';

function withTmpAuditsDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'audit-finding-status-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('listAuditFiles finds a top-level .md file', () => {
  withTmpAuditsDir((dir) => {
    writeFileSync(join(dir, 'top.md'), '# top');
    assert.deepEqual(listAuditFiles(dir), ['top.md']);
  });
});

test('listAuditFiles RECURSES into dated subdirectories (the bug this lane fixed: a non-recursive ' +
  'readdirSync silently skipped every subdirectory audit — 27 of 101 tracked files, docs/audits/ ' +
  'wiring-audit-2026-09-04/ and full-read-2026-08-31/ among them)', () => {
  withTmpAuditsDir((dir) => {
    mkdirSync(join(dir, 'nested-2026-09-04'));
    writeFileSync(join(dir, 'nested-2026-09-04', 'B1-modules.md'), '# nested');
    writeFileSync(join(dir, 'top.md'), '# top');
    const found = listAuditFiles(dir).sort();
    assert.deepEqual(found, [join('nested-2026-09-04', 'B1-modules.md'), 'top.md'].sort());
  });
});

test('listAuditFiles ignores non-.md files at any depth', () => {
  withTmpAuditsDir((dir) => {
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'notes.txt'), 'not markdown');
    writeFileSync(join(dir, 'sub', 'raw.json'), '{}');
    writeFileSync(join(dir, 'sub', 'real.md'), '# real');
    assert.deepEqual(listAuditFiles(dir), [join('sub', 'real.md')]);
  });
});

test('listAuditFiles on a missing directory throws (caller handles the exit-0 no-audits-dir case)', () => {
  assert.throws(() => listAuditFiles(join(tmpdir(), 'definitely-does-not-exist-' + Date.now())), /ENOENT/);
});

// ---------------------------------------------------------------------------------------------
// Rule 13 (lane FLAG-1): every finding carries exactly one disposition. Attack-named tests.
// ---------------------------------------------------------------------------------------------
const problems = (text) => auditFindings(text).map((f) => f.problem).filter(Boolean);

test('ATTACK disposition: a finding with no disposition fails', () => {
  assert.deepEqual(problems('- [CONFIRMED] the writer is broken and drops rows\n'), ['no disposition']);
});

test('ATTACK disposition: two dispositions on one finding fail', () => {
  const p = problems('- [CONFIRMED] the writer is broken [WORK: flag1] [CLOSED: PR 1040]\n');
  assert.deepEqual(p, ['multiple dispositions']);
});

test('ATTACK disposition: [NOT-WORK] without a reason fails (bare, empty, and blank forms)', () => {
  for (const tok of ['[NOT-WORK]', '[NOT-WORK:]', '[NOT-WORK:   ]']) {
    const p = problems(`- [CONFIRMED] the writer is broken ${tok}\n`);
    assert.equal(p.length, 1, tok);
    assert.match(p[0], /malformed/, tok);
  }
});

test('ATTACK disposition: a malformed WORK, CLOSED or REFUTED fails; a bare [REFUTED] is the status token, not a disposition', () => {
  assert.match(dispositionProblem('x [CLOSED: soon]'), /CLOSED names a PR/);
  assert.match(dispositionProblem('x [CLOSED]'), /malformed/);
  assert.match(dispositionProblem('x [WORK: two words]'), /WORK names a lane id or PR N/);
  assert.match(dispositionProblem('x [REFUTED:]'), /malformed/);
  assert.equal(dispositionProblem('x [REFUTED]'), 'no disposition');
});

test('disposition: every well-formed token passes', () => {
  assert.equal(dispositionProblem('a [CLOSED: PR 1040]'), null);
  assert.equal(dispositionProblem('a [CLOSED: PR #1040]'), null);
  assert.equal(dispositionProblem('a [WORK: flag1-disposition-gate]'), null);
  assert.equal(dispositionProblem('a [WORK: PR 1050]'), null);
  assert.equal(dispositionProblem('a [REFUTED: re-run on 2026-10-09 returned the row]'), null);
  assert.equal(dispositionProblem('a [NOT-WORK: a count, implies no action]'), null);
});

test('disposition: [CLOSED: PR 1040] on a finding line passes the whole scan', () => {
  assert.deepEqual(problems('- [CONFIRMED] the writer is broken [CLOSED: PR 1040]\n'), []);
});

test('disposition: a token wrapped onto the continuation line still belongs to its item', () => {
  assert.deepEqual(problems('- [CONFIRMED] the writer is broken and the retry\n  never fires [WORK: flag1]\n'), []);
});

test('ATTACK sections: a plain fact under Owed / Facts / Observed / Open / Not done / Residual is a finding with no severity', () => {
  for (const h of ['Owed', 'Facts', 'Observed', 'Open', 'Not done', 'Residual', 'Confirmed facts']) {
    const text = `## ${h}\n\n- the leg is recorded here in passing\n- second one\n\n## Next\n\n- an ordinary note\n`;
    assert.deepEqual(problems(text), ['no disposition', 'no disposition'], h);
  }
});

test('sections: a dispositioned fact passes; a nested heading stays inside the section; a sibling heading ends it', () => {
  const text = '## Owed\n- one [NOT-WORK: a count]\n### Detail\n- two [WORK: flag1]\n## Other\n- three\n';
  assert.deepEqual(problems(text), []);
});

test('sections: fenced code and tables are ignored', () => {
  assert.deepEqual(problems('## Owed\n```\n- in a fence\n```\n| a | b |\n| - | - |\n'), []);
});

test('session logs: only Not done / Open items / Open questions / Residual sections are held, and [NOT-WORK: reason] counts', () => {
  const text = [
    '## Accomplished', '- shipped it', '',
    '## NOT done', '- the second leg', '- the third leg [NOT-WORK: out of scope per brief]', '',
    '## Open questions', '- which lane', '',
    '## What is NOT done', '- a thing [WORK: next-lane]', '',
  ].join('\n');
  assert.deepEqual(sessionLogFindings(text).map((f) => [f.text.slice(2), f.problem]), [
    ['the second leg', 'no disposition'],
    ['the third leg [NOT-WORK: out of scope per brief]', null],
    ['which lane', 'no disposition'],
    ['a thing [WORK: next-lane]', null],
  ]);
});

test('dateOfPath takes the last date in the path and is null for an undated path', () => {
  assert.equal(dateOfPath('wiring-audit-2026-09-04/B1-2026-10-02.md'), '2026-10-02');
  assert.equal(dateOfPath('BRIEF-STRUCTURE-AUDIT.md'), null);
});

function withRepo(files, fn) {
  const root = mkdtempSync(join(tmpdir(), 'rule13-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(join(root, rel, '..'), { recursive: true });
      writeFileSync(join(root, rel), body);
    }
    return fn(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('SCOPE: a pre-2026-10-01 audit and an undated audit are out of scope (the backlog before the attack registers is the catalogue owed list, not this gate)', () => {
  withRepo({
    'docs/audits/old-2026-09-30.md': '## Owed\n- an old fact\n',
    'docs/audits/UNDATED.md': '## Owed\n- an undated fact\n',
    'docs/audits/new-2026-10-01.md': '## Owed\n- a new fact\n',
    'docs/audits/sub-2026-10-03/x.md': '## Owed\n- a nested fact\n',
  }, (root) => {
    const open = collectOpenFindings(root);
    assert.deepEqual(open.map((o) => o.file).sort(), ['docs/audits/new-2026-10-01.md', 'docs/audits/sub-2026-10-03/x.md']);
    assert.equal(open[0].source, 'audit');
  });
});

test('collectOpenFindings reaches all three sources and honours dispositions', () => {
  withRepo({
    'docs/audits/a-2026-10-05.md': '## Owed\n- open one\n- done one [CLOSED: PR 1040]\n',
    'docs/ops/session-log.d/2026-10-06-x.md': '## NOT done\n- open two\n- fine [NOT-WORK: reason]\n',
    'docs/ops/session-log.d/2026-09-30-old.md': '## NOT done\n- ancient\n',
    'fsi-app/scripts/tmp/x-register-y.md': '- a register line that is missing a guard\n',
    'fsi-app/scripts/tmp/notes.md': '- a line that is missing a guard\n',
  }, (root) => {
    const open = collectOpenFindings(root);
    assert.deepEqual(open.map((o) => [o.source, o.file, o.line]), [
      ['audit', 'docs/audits/a-2026-10-05.md', 2],
      ['session-log', 'docs/ops/session-log.d/2026-10-06-x.md', 2],
      ['register', 'fsi-app/scripts/tmp/x-register-y.md', 1],
    ]);
  });
});

test('the cache follows the file: a disposition added after a scan is seen on the next scan', () => {
  withRepo({ 'docs/audits/c-2026-10-05.md': '## Owed\n- open one\n' }, (root) => {
    assert.equal(collectOpenFindings(root).length, 1);
    const p = join(root, 'docs/audits/c-2026-10-05.md');
    writeFileSync(p, '## Owed\n- open one [NOT-WORK: counted elsewhere, longer so the size differs]\n');
    assert.equal(collectOpenFindings(root).length, 0);
  });
});

const GATE_SRC = 'BLOCKED. LOADED this session via the Skill tool. Invoke e.g. Skill: x, THEN retry.';
test('ATTACK contradiction: a contract that says stop on any hook failure while the gate says load the skills and retry fails', () => {
  const contract = '# c\n- On ANY hook or CI failure, or any decision your brief does not settle: STOP. Report the exact error.\n- other\n';
  const hits = contractContradiction(contract, GATE_SRC);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 2);
});

test('contradiction: a contract line that carves out the skill-load block, or a gate that no longer says load, passes', () => {
  assert.deepEqual(contractContradiction('- Stop on a hook failure, except a block naming skills to load: load them and retry.\n', GATE_SRC), []);
  assert.deepEqual(contractContradiction('- Stop on any hook failure.\n', 'BLOCKED without a retry instruction'), []);
  assert.deepEqual(contractContradiction('- Push once. If CI is red, stop and report.\n', GATE_SRC), []);
});

test('the real lane contract does not contradict the real skill gate', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const contract = readFileSync(join(here, '..', '..', '..', 'docs', 'dispatches', 'lane-common-contract.md'), 'utf8');
  const gate = readFileSync(join(here, '..', '..', '.discipline', 'governance', 'pretooluse-skill-gate.mjs'), 'utf8');
  assert.deepEqual(contractContradiction(contract, gate), []);
});

// ── GATE-FIX-1 item 3: a scratch register younger than the grace window is not an open finding for the dispatch gate ──
import { utimesSync } from 'node:fs';
import { REGISTER_GRACE_MS } from './audit-finding-status.mjs';

const ageFile = (root, rel, hours, now) => { const t = (now - hours * 3600 * 1000) / 1000; utimesSync(join(root, rel), t, t); };

test('GATE-FIX-1: REGISTER_GRACE_MS is 24 hours', () => {
  assert.equal(REGISTER_GRACE_MS, 24 * 3600 * 1000);
});

test('GATE-FIX-1 item 3: with the grace window, a 25-hour-old register with one open finding is listed with its age, a 1-hour-old one is not', () => {
  withRepo({
    'fsi-app/scripts/tmp/old-register.md': '- a guard that is missing here\n',
    'fsi-app/scripts/tmp/new-register.md': '- a guard that is missing there\n',
  }, (root) => {
    const now = Date.now();
    ageFile(root, 'fsi-app/scripts/tmp/old-register.md', 25, now);
    ageFile(root, 'fsi-app/scripts/tmp/new-register.md', 1, now);
    const open = collectOpenFindings(root, { registerGraceMs: REGISTER_GRACE_MS, now });
    assert.deepEqual(open.map((o) => o.file), ['fsi-app/scripts/tmp/old-register.md']);
    assert.ok(open[0].ageMs > 24.9 * 3600 * 1000 && open[0].ageMs < 25.1 * 3600 * 1000, String(open[0].ageMs));
    assert.equal(collectOpenFindings(root, { now }).length, 2, 'no grace window (the CLI): every register is reported');
  });
});

test('ATTACK GATE-FIX-1 item 3: a committed audit or session log is never given the grace window, however fresh', () => {
  withRepo({
    'docs/audits/f-2026-10-09.md': '## Owed\n- fresh audit fact\n',
    'docs/ops/session-log.d/2026-10-09-f.md': '## NOT done\n- fresh log fact\n',
  }, (root) => {
    const open = collectOpenFindings(root, { registerGraceMs: REGISTER_GRACE_MS });
    assert.deepEqual(open.map((o) => o.source), ['audit', 'session-log']);
    assert.equal(open[0].ageMs, undefined);
  });
});
