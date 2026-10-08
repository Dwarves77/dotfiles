// Proves C5 (program-anchors reality, invariant RG-1): passes GREEN against the live tree, and
// actually CATCHES every drift shape it exists to catch (CLAUDE.md rule 15: proven by attack, not by
// presence).
//
// ISOLATION (lane TESTFIX-1, 2026-10-08). The negative cases used to write a throwaway edit into the LIVE
// docs/program/GOVERNING-PROGRAM.md (and rename it away) for the length of each test, restoring it in a
// finally block. That left a window in which the real working tree was changed, the GATE-5 race class (a
// concurrent reader sees the fixture). C5 reads its root through getRepoRoot(), which honours
// DISCIPLINE_REPO_ROOT, so the negative cases now run C5 against a throwaway root under the OS temp
// directory holding a copy of the doc and of the one source file the anchors point at; the real tree is
// only ever read (the GREEN-on-live-tree test). The last test proves it: the real doc is byte-identical
// and was never renamed.
//
// The present/absent drift cases point their anchors at C5's own sibling module
// (C5-program-anchors-reality.mjs) and assert against substrings already known true/false there (a
// guaranteed-present export name, a guaranteed-absent fixture token), so a real run() exercises the real
// present/absent comparison.
//
// Run: node --test fsi-app/.discipline/consistency/checks/C5-program-anchors-reality.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { getRepoRoot, _clearRepoRootCache } from '../../lib/context.mjs';
import { consistencyCheck } from './C5-program-anchors-reality.mjs';

const ROOT = getRepoRoot();
const DOC_PATH_REL = 'fsi-app/docs/program/GOVERNING-PROGRAM.md';
const DOC_PATH = resolve(ROOT, DOC_PATH_REL);
const REAL_DOC_BEFORE = readFileSync(DOC_PATH, 'utf8');

// A target file guaranteed to exist and be stable for the duration of this test run: C5's own sibling
// module. ANCHOR_PRESENT_SUBSTR is a real export this file declares (so a "present" anchor against it is
// genuinely true); ANCHOR_ABSENT_SUBSTR is a fixture token guaranteed never to appear in real source
// (rule 012's own convention for a marker that must never collide with real content).
const ANCHOR_FILE_REL = 'fsi-app/.discipline/consistency/checks/C5-program-anchors-reality.mjs';
const ANCHOR_PRESENT_SUBSTR = 'export const consistencyCheck';
const ANCHOR_ABSENT_SUBSTR = 'ZZZ_C5_TEST_FIXTURE_TOKEN_NEVER_IN_REAL_SOURCE';

// Run `fn` with C5's repo root pointed at a throwaway tree under the OS temp directory: the anchor file
// is copied in, the governing doc is `content` (or absent when `content` is null). The env override and
// the root cache are restored whatever `fn` does.
function withDoc(content, fn) {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'c5-test-'));
  const anchorDst = join(tmpRoot, ANCHOR_FILE_REL);
  mkdirSync(dirname(anchorDst), { recursive: true });
  copyFileSync(resolve(ROOT, ANCHOR_FILE_REL), anchorDst);
  if (content !== null) {
    const docDst = join(tmpRoot, DOC_PATH_REL);
    mkdirSync(dirname(docDst), { recursive: true });
    writeFileSync(docDst, content);
  }
  const saved = process.env.DISCIPLINE_REPO_ROOT;
  process.env.DISCIPLINE_REPO_ROOT = tmpRoot;
  _clearRepoRootCache();
  try {
    // In flight, not only afterwards: the real doc is untouched and in place while the case runs.
    assert.equal(readFileSync(DOC_PATH, 'utf8'), REAL_DOC_BEFORE, 'the real governing doc is untouched while a negative case runs');
    return fn();
  } finally {
    if (saved === undefined) delete process.env.DISCIPLINE_REPO_ROOT; else process.env.DISCIPLINE_REPO_ROOT = saved;
    _clearRepoRootCache();
    rmSync(tmpRoot, { recursive: true, force: true });
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
  // The throwaway root simply has no governing doc (content null), the real file is never renamed away.
  withDoc(null, () => {
    const drifts = consistencyCheck.run();
    assert.ok(
      drifts.some((d) => d.kind === 'orphan-claim' && d.location === DOC_PATH_REL),
      `expected an orphan-claim drift for the missing doc, got: ${JSON.stringify(drifts)}`,
    );
  });
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

test('ISOLATION: the real governing program doc is byte-identical after every negative case and was never renamed', () => {
  assert.equal(readFileSync(DOC_PATH, 'utf8'), REAL_DOC_BEFORE, 'the real doc was never written');
  assert.equal(existsSync(DOC_PATH + '.r23-test-backup'), false, 'no rename backup was ever made beside the real doc');
});
