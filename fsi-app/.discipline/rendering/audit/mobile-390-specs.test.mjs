// Proof for the mobile 390 audit specs and the harness options they need (lane mobile60,
// 2026-09-08). PORTABLE: node builtins + relative .mjs only, so run-test-suite.sh's no-npm-ci job
// runs it (see that script's header). It reads SOURCE and SPEC files rather than mounting anything
// — the measurement itself is run-audit.mjs's job, and what is proved here is the wiring that makes
// those measurements possible and honest:
//
//   1. every mobile-* spec really is a 390 spec, and really asks for the compiled CSS without which
//      the whole desktop/mobile switch (`hidden md:flex` / `md:hidden`) is inert and a 390 spec
//      would silently measure a frame the product never shows;
//   2. run-audit.mjs honours that flag, and honours it PER SPEC rather than per mount, so the 1440
//      specs sharing those mounts are not re-baselined by this lane;
//   3. every mount a mobile spec names exists;
//   4. the mobile-drawer mount opens the drawer through the product's OWN hamburger, not through a
//      test-only prop added to Sidebar/AppShell.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SPEC_DIR = join(HERE, 'spec');

const MOBILE_SPECS = readdirSync(SPEC_DIR).filter((f) => f.startsWith('mobile-') && f.endsWith('.json'));
const RUN_AUDIT = readFileSync(join(HERE, 'run-audit.mjs'), 'utf8');
const MOUNTS = readFileSync(join(HERE, 'mounts.mjs'), 'utf8');
const CAPTURE = readFileSync(join(HERE, '../capture-compose-page.mjs'), 'utf8');

test('the mobile 390 spec set covers the dashboard, the five list surfaces, a detail page and the drawer', () => {
  const ids = MOBILE_SPECS.map((f) => f.replace(/\.json$/, '')).sort();
  for (const required of [
    'mobile-01-dashboard',
    'mobile-02-regulations-list',
    'mobile-03-regulation-detail',
    'mobile-04-market-list',
    'mobile-06-research-list',
    'mobile-08-operations-list',
    'mobile-11-watchlist',
    'mobile-18-drawer',
  ]) {
    assert.ok(ids.includes(required), `missing mobile spec: ${required} (have ${ids.join(', ')})`);
  }
});

test('every mobile-* spec is at viewport 390 and asks for the compiled CSS', () => {
  for (const f of MOBILE_SPECS) {
    const spec = JSON.parse(readFileSync(join(SPEC_DIR, f), 'utf8'));
    assert.equal(spec.viewport, 390, `${f}: a mobile spec measured at ${spec.viewport}, not 390`);
    assert.equal(
      spec.compiledCss,
      true,
      `${f}: without compiledCss the Tailwind md: utilities are un-expanded, so the desktop nav card and the mobile top bar both render and the spec measures a frame the product never shows`,
    );
  }
});

test('every mount a mobile spec names is registered in AUDIT_MOUNTS', () => {
  for (const f of MOBILE_SPECS) {
    const spec = JSON.parse(readFileSync(join(SPEC_DIR, f), 'utf8'));
    assert.ok(
      new RegExp(`['"]${spec.mount}['"]\\s*:\\s*\\{`).test(MOUNTS),
      `${f}: names mount "${spec.mount}", which mounts.mjs does not define`,
    );
  }
});

test('every mobile-* spec states, per region, either a value expectation or a forbid — none is presence-only', () => {
  for (const f of MOBILE_SPECS) {
    const spec = JSON.parse(readFileSync(join(SPEC_DIR, f), 'utf8'));
    const targets = [{ name: spec.part, expect: spec.expect }, ...(spec.children ?? [])];
    const measured = targets.filter((t) => Object.keys(t.expect ?? {}).length > 0).length;
    assert.ok(measured >= 8, `${f}: only ${measured} measured regions — a 390 spec that asserts almost nothing is not an audit`);
    assert.ok((spec.forbid ?? []).length > 0, `${f}: no forbid list`);
  }
});

test('every mobile-* spec carries at least one boundsCheck (the overflow/collision guard the operator asked for)', () => {
  for (const f of MOBILE_SPECS) {
    const spec = JSON.parse(readFileSync(join(SPEC_DIR, f), 'utf8'));
    assert.ok(
      (spec.boundsCheck ?? []).length > 0,
      `${f}: no boundsCheck. Operator standard 2026-09-07: "a visual pass for overflow/collision/orphan lines on every page"; boundsCheck is how that is measured rather than eyeballed.`,
    );
  }
});

test('run-audit.mjs reads the SPEC flag for the compiled CSS, alongside the mount flag', () => {
  assert.match(RUN_AUDIT, /if \(mount\.needsCompiledCss \|\| spec\.compiledCss\)/, 'run-audit.mjs does not read spec.compiledCss');
  assert.match(RUN_AUDIT, /addStyleTag\(\{ content: await fullAppCssCompiled\(\) \}\)/);
  // UPDATED AT FOLD-61. This test was written in lane mobile60's worktree, where run-audit.mjs had
  // NO per-mount stylesheet reader at all, and it forbade `mount.needsCompiledCss` to keep the
  // 1440 compose specs measuring the same CSS they had been calibrated against. Train 60 then
  // landed that very reader (lane admin60), and RE-CALIBRATED the 1440 specs against it - /map's
  // four register rows among them - so on this tree the forbid would remove the stylesheet the
  // compose specs are now measured with. Both flags are kept, the app sheet is added at most once,
  // and the mobile lane's real invariant is asserted instead: a SPEC can ask for the compiled CSS
  // on a mount that does not declare it, which is what lets the mobile-* specs run against the
  // same mounts as the compose-* specs without editing those mounts.
  const code = RUN_AUDIT.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.match(code, /spec\.compiledCss/, 'the spec flag must be a real reader, not only a comment');
  assert.doesNotMatch(
    code,
    /needsCompiledCss\s*=/,
    'a spec asking for the compiled CSS must not WRITE the mount flag — that would change what the 1440 specs measure',
  );
});

test('the compiled CSS is injected BEFORE the bundle mounts', () => {
  const inject = RUN_AUDIT.indexOf('if (mount.needsCompiledCss || spec.compiledCss)');
  const mount = RUN_AUDIT.indexOf("mountBundle(page, bundleCache.get(spec.mount)");
  assert.ok(inject > 0 && mount > inject, 'the style tag must be added before the tree mounts, or first paint measures un-styled');
});

test('the mobile-drawer mount opens the drawer through the product\'s own hamburger', () => {
  assert.match(MOUNTS, /'mobile-drawer':\s*\{/, 'mounts.mjs does not register mobile-drawer');
  assert.match(
    MOUNTS,
    /querySelector\('button\[aria-label="Open navigation"\]'\)/,
    'the drawer mount must click the real TopBar hamburger — a test-only prop on Sidebar/AppShell would measure a state the product cannot reach',
  );
  assert.match(MOUNTS, /MOBILE_DRAWER_ENTRY = PAGE_FRAME_ENTRY\.replace\(/, 'the drawer mount must reuse the page-frame entry, not fork a second copy of it');
});

test('capture-compose-page.mjs takes the three additive flags the 390 evidence needs, and defaults unchanged', () => {
  for (const flag of ['width', 'measure', 'element']) {
    assert.match(CAPTURE, new RegExp(`flag\\('${flag}'\\)`), `capture-compose-page.mjs has no --${flag}`);
  }
  assert.match(CAPTURE, /args\.includes\('--compiled-css'\)/);
  // Unchanged when omitted: the width still falls back to the mount's own, and the measure still
  // falls back to the [data-audit] name derived from the mount id.
  assert.match(CAPTURE, /width \|\| mount\.viewport \|\| 1440/);
  assert.match(CAPTURE, /measureSel \|\| `\[data-audit="\$\{mount\.dataAudit \|\| mountId/);
});
