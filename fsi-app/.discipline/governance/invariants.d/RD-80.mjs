// RD-80: registered by lane G3 (brief-g3.md, 2026-09-22). One entry, one file; see
// invariants.d/README.md.

export const invariant = {
  id: 'RD-80',
  skill: 'remediation-discipline',
  section:
    "Section 4 - category 49: the Rendering guard measures the site's real fonts, not the OS fallback",
  text:
    'The Rendering guard measures with the application\'s own font files loaded and ready; a run ' +
    'whose fonts did not resolve is an error, never a pass. [CONFIRMED, 2026-09-22, read-only ' +
    'diagnosis then reproduced live by this lane]: `fullAppCss()` read globals.css and theme.css ' +
    'only; the fonts (`Plus Jakarta Sans` 400/500/600/700/800, `Anton` 400) are `@fontsource/*` ' +
    'imports in `src/app/layout.tsx`, so no `@font-face` ever reached a mounted fixture, ' +
    '`document.fonts.size` was 0 on every guard page, and both declared stacks resolved to whatever ' +
    'OS font-matching fell back to - a DIFFERENT fallback on CI (Ubuntu) than on a Windows machine, ' +
    'so the same commit measured different text-dependent layout (clipping, wrapping, hit targets, ' +
    'the 21c card heights) on each platform, and every text-dependent measurement the guard has ever ' +
    'made was against the wrong typography on both. The fix vendors the exact woff2 files the app ' +
    'ships (`.discipline/rendering/fixtures/fonts/`, latin subset + the weights layout.tsx imports ' +
    'only, each package\'s LICENSE beside its files, ~84 KB total) and declares `@font-face` rules ' +
    'against them in ONE home, `fontFaceCss()` in smoke-fixtures.mjs, consumed by `fullAppCss()` / ' +
    '`fullAppCssCompiled()` for every smoke spec that already reads them and, directly, by ' +
    '`assertFontsReady()` (same file), which run-rendering-guard.mjs calls via `page.addStyleTag()` ' +
    'after every `page.setContent()` - covering the fixtures.mjs legacy legs too, which never called ' +
    'fullAppCss() at all. `data:` URIs, not `file://`: a `file://` @font-face src from an ' +
    '`about:blank`/opaque-origin `setContent()` document is blocked by the browser (the same ' +
    'restriction compose-composite.mjs\'s own header already documented for images), reproduced live ' +
    'as a permanently-`unloaded` FontFace plus a `NetworkError` from an explicit `document.fonts.load()`. ' +
    '`assertFontsReady()` explicitly calls `document.fonts.load()` for every required family+weight ' +
    'before awaiting `document.fonts.ready` (a declared face is lazy - it never starts loading until ' +
    'something on the page matches it, so a hand-reproduced fixture that never renders that exact ' +
    'text would read "ready" with nothing pending) and, [CONFIRMED by attack, this lane], does NOT ' +
    'trust `document.fonts.check()` alone: `check()` reads VACUOUSLY TRUE when the FontFaceSet holds ' +
    'zero entries for a family at all, which is precisely the original defect\'s shape - a page a ' +
    '`@font-face` injection never reached would report a clean pass on `check()` alone. The function ' +
    'additionally confirms a `loaded` FontFace is actually registered for each required family+weight ' +
    'before trusting `check()`\'s answer. Determinism knobs (`deviceScaleFactor: 1, locale: \'en-US\', ' +
    'timezoneId: \'UTC\', colorScheme: \'light\'`) are set on every `browser.newPage()` call the ' +
    'guard makes, in the harness itself rather than the workflow, so CI and a local run launch every ' +
    'page identically.',
  anchor:
    "### Section 4 - category 49: the Rendering guard measures the site's real fonts, not the OS fallback",
  enforcedBy: [
    'selftest:fsi-app/.discipline/rendering/rd-80-real-fonts.npmtest.mjs',
  ],
  residual:
    'The enforcer is an `*.npmtest.mjs` (playwright is a real chromium dependency, not portable to ' +
    'the no-npm-ci glob) that self-skips, diagnosably, wherever playwright is not installed in ' +
    'node_modules - the same posture as layout-guard.npmtest.mjs\'s L9 real-chromium test. This repo ' +
    'does not add playwright to package.json (discipline.yml installs it scoped, `npm install ' +
    '--no-save playwright@1.61.1`, only in the dedicated rendering-guard job), so the plain `npm ci` ' +
    'App-unit-tests job never puts it in node_modules and the enforcer is a no-op there; it runs for ' +
    'real wherever a lane has run the scoped install locally, per the gate in ' +
    'docs/dispatches/lane-common-contract.md. The glyph-width pin the enforcer asserts was measured ' +
    'on this lane\'s own machine (Windows) via the exact method it documents; it is expected to hold ' +
    'cross-platform because the advance widths a real webfont\'s own hmtx table declares are ' +
    'independent of host-OS text rasterization, but that cross-platform claim is UNVERIFIED against ' +
    'a second OS by this lane - a future CI run of this npmtest (once playwright is available there) ' +
    'is the confirmation.',
};
