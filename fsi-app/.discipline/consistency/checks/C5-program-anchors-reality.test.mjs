// Proves C5 (program-anchors reality, invariant RG-1): passes GREEN against the live tree, and
// actually CATCHES every drift shape it exists to catch (CLAUDE.md rule 15: proven by attack, not by
// presence). Same shape as C3/C4's sibling tests in this directory: the negative cases write a real
// throwaway edit into the LIVE docs/program/GOVERNING-PROGRAM.md (there is no injectable root on
// consistencyCheck.run() today, matching every other check in this directory) and restore it in a
// finally block, so a failure mid-test never leaves the tree dirty. No fixture ever rewrites a SOURCE
// file's content: the present/absent drift cases point their anchors at this very test's own sibling
// module (C5-program-anchors-reality.mjs) and assert against substrings already known true/false there
// (a guaranteed-present export name, a guaranteed-absent fixture token), so a real run() exercises the
// real present/absent comparison without ever touching code other than the one doc this check reads.
//
// Run: node --test fsi-app/.discipline/consistency/checks/C5-program-anchors-reality.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRepoRoot } from '../../lib/context.mjs';
import { consistencyCheck } from './C5-program-anchors-reality.mjs';

const ROOT = getRepoRoot();
const DOC_PATH_REL = 'fsi-app/docs/program/GOVERNING-PROGRAM.md';
const DOC_PATH = resolve(ROOT, DOC_PATH_REL);

// A target file guaranteed to exist and be stable for the duration of this test run: C5's own sibling
// module. ANCHOR_PRESENT_SUBSTR is a real export this file declares (so a "present" anchor against it is
// genuinely true); ANCHOR_ABSENT_SUBSTR is a fixture token guaranteed never to appear in real source
// (rule 012's own convention for a marker that must never collide with real content).
const ANCHOR_FILE_REL = 'fsi-app/.discipline/consistency/checks/C5-program-anchors-reality.mjs';
const ANCHOR_PRESENT_SUBSTR = 'export const consistencyCheck';
const ANCHOR_ABSENT_SUBSTR = 'ZZZ_C5_TEST_FIXTURE_TOKEN_NEVER_IN_REAL_SOURCE';

function withDoc(content, fn) {
  const before = readFileSync(DOC_PATH, 'utf8');
  writeFileSync(DOC_PATH, content);
  try {
    return fn();
  } finally {
    writeFileSync(DOC_PATH, before);
  }
}

function buildDoc({ activePhaseLine = 'ACTIVE_PHASE: fixture-phase', anchorsBlock } = {}) {
  const fence = anchorsBlock === undefined
    ? `\`\`\`anchors\npresent :: ${ANCHOR_FILE_REL} :: ${ANCHOR_PRESENT_SUBSTR}\nabsent :: ${ANCHOR_FILE_REL} :: ${ANCHOR_ABSENT_SUBSTR}\n\`\`\``
    : anchorsBlock;
  return `# Fixture governing program doc\n\n${activePhaseLine}\n\n## fixture-phase\n\n${fence}\n`;
}

test('C5 passes GREEN against the live tree', () => {
  const drifts = consistencyCheck.run();
  assert.deepEqual(drifts, [], `C5 found drift on the live tree:\n${drifts.map((d) => '  - ' + d.detail).join('\n')}`);
});

test('ACTIVE_PHASE: none is a no-op between phases: nothing finished to re-check, and no phase being switched off', () => {
  const unfinished = [
    '# Fixture governing program doc',
    '',
    'ACTIVE_PHASE: none',
    '',
    '### fixture-phase planned',
    '```anchors',
    'not a real line',
    '```',
    '',
  ].join('\n');
  withDoc(unfinished, () => {
    const drifts = consistencyCheck.run();
    // the only drift the fixture can draw is the flip-from-active check against the merge-base doc, never a malformed-anchors one
    assert.ok(!drifts.some((d) => d.kind === 'malformed'), JSON.stringify(drifts));
  });
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (well-formedness): a doc missing the governing file entirely is caught as an orphan claim', () => {
  // PROGRAM_DOC is a module-level constant in C5-program-anchors-reality.mjs, not injectable (same
  // posture as C3's MIG_DIR_REL) -- so this exercises the missing-doc branch by RENAMING the live file
  // away and back, the same real-filesystem-mutation-with-restore shape withDoc() uses for content, one
  // level up. A try/finally guarantees the rename back even if an assertion throws mid-test.
  const backupPath = `${DOC_PATH}.r23-test-backup`;
  renameSync(DOC_PATH, backupPath);
  try {
    const drifts = consistencyCheck.run();
    assert.ok(
      drifts.some((d) => d.kind === 'orphan-claim' && d.location === DOC_PATH_REL),
      `expected an orphan-claim drift for the missing doc, got: ${JSON.stringify(drifts)}`,
    );
  } finally {
    renameSync(backupPath, DOC_PATH);
  }
  assert.equal(existsSync(DOC_PATH), true, 'the real governing program doc must survive this test');
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (well-formedness): no parseable ACTIVE_PHASE line is caught', () => {
  withDoc('# Fixture governing program doc\n\nNo ACTIVE_PHASE line in this fixture at all.\n', () => {
    const drifts = consistencyCheck.run();
    assert.ok(
      drifts.some((d) => d.kind === 'malformed' && d.location === DOC_PATH_REL && d.detail.includes('ACTIVE_PHASE')),
      `expected a malformed ACTIVE_PHASE drift, got: ${JSON.stringify(drifts)}`,
    );
  });
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (well-formedness): ACTIVE_PHASE set but no matching heading/anchors block is caught', () => {
  withDoc('# Fixture governing program doc\n\nACTIVE_PHASE: phase-nowhere\n\nNo heading names this phase at all.\n', () => {
    const drifts = consistencyCheck.run();
    assert.ok(
      drifts.some((d) => d.kind === 'malformed' && d.location === DOC_PATH_REL && d.detail.includes('phase-nowhere')),
      `expected a malformed "no anchors block" drift, got: ${JSON.stringify(drifts)}`,
    );
  });
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (well-formedness): an anchors block with zero parseable lines is caught', () => {
  withDoc(buildDoc({ anchorsBlock: '```anchors\njust prose, no present/absent lines\n```' }), () => {
    const drifts = consistencyCheck.run();
    assert.ok(
      drifts.some((d) => d.kind === 'malformed' && d.location === DOC_PATH_REL && d.detail.includes('no parseable')),
      `expected an empty-anchors malformed drift, got: ${JSON.stringify(drifts)}`,
    );
  });
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (dead reference): an anchor naming a file that does not exist is caught', () => {
  withDoc(
    buildDoc({ anchorsBlock: '```anchors\npresent :: fsi-app/does/not/exist/at/all.mjs :: anything\n```' }),
    () => {
      const drifts = consistencyCheck.run();
      assert.ok(
        drifts.some((d) => d.kind === 'reference-dead' && d.location === 'fsi-app/does/not/exist/at/all.mjs'),
        `expected a reference-dead drift, got: ${JSON.stringify(drifts)}`,
      );
    },
  );
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (plan-vs-code drift, "present" anchor): a substring expected PRESENT but actually absent is caught', () => {
  withDoc(
    buildDoc({ anchorsBlock: `\`\`\`anchors\npresent :: ${ANCHOR_FILE_REL} :: ${ANCHOR_ABSENT_SUBSTR}\n\`\`\`` }),
    () => {
      const drifts = consistencyCheck.run();
      assert.ok(
        drifts.some((d) => d.kind === 'stale-status' && d.location === ANCHOR_FILE_REL && d.detail.includes('GONE')),
        `expected a stale-status "GONE" drift, got: ${JSON.stringify(drifts)}`,
      );
    },
  );
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (plan-vs-code drift, "absent" anchor): a substring expected ABSENT but actually present is caught', () => {
  withDoc(
    buildDoc({ anchorsBlock: `\`\`\`anchors\nabsent :: ${ANCHOR_FILE_REL} :: ${ANCHOR_PRESENT_SUBSTR}\n\`\`\`` }),
    () => {
      const drifts = consistencyCheck.run();
      assert.ok(
        drifts.some((d) => d.kind === 'stale-status' && d.location === ANCHOR_FILE_REL && d.detail.includes('PRESENT')),
        `expected a stale-status "PRESENT" drift, got: ${JSON.stringify(drifts)}`,
      );
    },
  );
  assert.deepEqual(consistencyCheck.run(), []);
});

test('CONTROL: a correctly matched present+absent anchor pair against a real file yields zero drift', () => {
  withDoc(buildDoc(), () => {
    assert.deepEqual(consistencyCheck.run(), []);
  });
  assert.deepEqual(consistencyCheck.run(), []);
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

import { anchorView, flippedToNoneWithoutFinishing } from './C5-program-anchors-reality.mjs';

test('C5 B7-38: an anchor kept alive only in a comment is GONE; the same text in code is present', () => {
  const commented = '// export const consistencyCheck is documented here\nexport const other = 1;\n/* export const consistencyCheck */';
  assert.equal(anchorView('x.mjs', commented).includes('export const consistencyCheck'), false);
  assert.equal(anchorView('x.mjs', 'export const consistencyCheck = {};\n').includes('export const consistencyCheck'), true);
  assert.equal(anchorView('x.sql', '-- COALESCE(a, b)\nSELECT 1;').includes('COALESCE(a, b)'), false);
  assert.equal(anchorView('x.sql', 'SELECT COALESCE(a, b);').includes('COALESCE(a, b)'), true);
  assert.equal(anchorView('notes.md', '// not code').includes('// not code'), true, 'other file types are matched raw');
});

test('C5 B7-38: a PRESENT anchor whose identifier survives only in a comment of the target is flagged GONE', () => {
  withDoc(buildDoc({ anchorsBlock: `\`\`\`anchors\npresent :: ${ANCHOR_FILE_REL} :: ZZZ_C5_COMMENT_ONLY_TOKEN\n\`\`\`` }), () => {
    // the token is not in the target at all, so this is the plain GONE path; the comment path is covered by anchorView above
    const drifts = consistencyCheck.run();
    assert.ok(drifts.some((d) => d.kind === 'stale-status' && d.detail.includes('GONE')), JSON.stringify(drifts));
  });
});

const finishedDoc = (phaseHeading, anchors) => `# Fixture governing program doc\n\nACTIVE_PHASE: none\n\n## Phases\n\n### ${phaseHeading}\nbody\n\`\`\`anchors\n${anchors}\n\`\`\`\n`;

test('C5 B7-39: ACTIVE_PHASE none still checks the anchors of a phase marked DONE', () => {
  const doc = finishedDoc('phase-fixture-done  ✅ DONE 2026-10-08', `present :: ${ANCHOR_FILE_REL} :: ${ANCHOR_ABSENT_SUBSTR}`);
  withDoc(doc, () => {
    const drifts = consistencyCheck.run();
    assert.ok(drifts.some((d) => d.kind === 'stale-status' && d.detail.includes('GONE')), `a finished phase's rotted anchor must be caught under none: ${JSON.stringify(drifts)}`);
  });
  const ok = finishedDoc('phase-fixture-done  ✅ DONE 2026-10-08', `present :: ${ANCHOR_FILE_REL} :: ${ANCHOR_PRESENT_SUBSTR}`);
  withDoc(ok, () => {
    const drifts = consistencyCheck.run();
    // none is a no-op when every finished phase's anchors hold (a flip-from-active drift can still come from the merge-base)
    assert.ok(!drifts.some((d) => d.detail.includes('GONE')), JSON.stringify(drifts));
  });
  assert.deepEqual(consistencyCheck.run(), []);
});

test('C5 B7-39: a phase active at the merge-base cannot be switched off by writing none unless it is marked DONE', () => {
  const doc = (active, heading) => [`ACTIVE_PHASE: ${active}`, '', heading, 'body'].join('\n');
  const base = doc('phase-2', '### phase-2 planned');
  const switchedOff = doc('none', '### phase-2 planned');
  assert.match(flippedToNoneWithoutFinishing(base, switchedOff), /phase-2.*not marked DONE or LANDING/);
  const finished = doc('none', '### phase-2  ✅ DONE 2026-10-08');
  assert.equal(flippedToNoneWithoutFinishing(base, finished), null);
  assert.equal(flippedToNoneWithoutFinishing(null, switchedOff), null, 'no baseline: skipped, never failed');
  assert.equal(flippedToNoneWithoutFinishing('ACTIVE_PHASE: none', switchedOff), null, 'none to none is not a flip');
  assert.equal(flippedToNoneWithoutFinishing(base, base), null, 'still active: the normal anchors path judges it');
});
