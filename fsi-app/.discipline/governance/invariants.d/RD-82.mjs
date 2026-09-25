// RD-82: registered by lane MASTHEAD-AUTH (brief-live-findings.md finding 2, 2026-09-24). One
// entry, one file; see invariants.d/README.md.

export const invariant = {
  id: 'RD-82',
  skill: 'remediation-discipline',
  section:
    'Section 4 - category 51: no title renders narrower than its longest word, and no title is measured on a fallback face',
  text:
    'No heading or marked title renders with a content box narrower than the rendered width of its ' +
    'longest word (measured in the element\'s own computed face), unless that word is wider than the ' +
    'title\'s whole container; and the rendering guard never measures text on a page whose own ' +
    'stylesheet did not load the declared faces. [CONFIRMED, 2026-09-24, real chromium on the ' +
    'guard\'s compose-login mount and read-only on carosledge.com/login]: Masthead.tsx applied its ' +
    '1440 grid (minmax(0,1fr) 420px, the command bar\'s column) by viewport width to every masthead, ' +
    'including the auth frame\'s bar-less 330px right panel, so the title track resolved to 0px and ' +
    '"SIGN IN" broke one letter per line (onboarding: 26px against a 103.8px "FREIGHT?"). Enforced ' +
    'by one detector, ux-assert.mjs detectWordBrokenTitles, run by the layout guard as L13 (1440 and ' +
    '1024, every route) and by the auth page leg of auth-onboarding-smoke.mjs (375, 1024, 1440), both ' +
    'behind the verifyFontsLoaded precondition (smoke-fixtures.mjs), which checks the page\'s own ' +
    'declarations without injecting any.',
  anchor:
    '### Section 4 - category 51: no title renders narrower than its longest word, and no title is measured on a fallback face',
  enforcedBy: [
    'selftest:fsi-app/.discipline/rendering/ux-assert.test.mjs',
    'selftest:fsi-app/.discipline/rendering/rd-82-title-words.npmtest.mjs',
  ],
  residual:
    'rd-82-title-words.npmtest.mjs needs a real chromium and self-skips, diagnosably, where ' +
    'playwright is not in node_modules (the RD-80 posture); ux-assert.test.mjs proves the detector ' +
    'red-then-green in the no-npm suite on every run, and the rendering-guard CI job runs the rule ' +
    'itself over the real mounts. The layout guard still measures only 1440 and 1024; the 375 ' +
    'coverage of this rule on the auth pages comes from the auth page leg, and on row components from ' +
    'the UX smoke slot (assertUxClean now carries the rule), not from the layout guard.',
};
