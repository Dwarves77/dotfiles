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

test('ACTIVE_PHASE: none is a no-op (between phases), even with a malformed anchors block present', () => {
  withDoc(buildDoc({ activePhaseLine: 'ACTIVE_PHASE: none', anchorsBlock: '```anchors\nnot a real line\n```' }), () => {
    assert.deepEqual(consistencyCheck.run(), []);
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
