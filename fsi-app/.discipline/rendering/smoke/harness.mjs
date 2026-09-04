// SM smoke-spec harness (Lane GATES-1, 2026-09-02, finish plan Wave 1). Shared infrastructure for
// the four SM smoke specs (watchlist-team, personal-archive, list-order, notifications). GOVERNING
// skill: caros-ledge-platform-intent (customer-surface fidelity).
//
// WHAT THIS IS, AND HOW IT DIFFERS FROM fixtures.mjs. The rendering guard's existing fixture legs
// (fixtures.mjs) reproduce a fixed component's LAYOUT CONTRACT by hand (inline HTML/CSS matching the
// real DOM shape) — README.md's own "Fidelity boundary" section names the reason and names the gap
// left open: "A full-page E2E under auth + live data is the named not-yet-built extension." This
// harness is that extension's first slice, for FOUR specific components (spec-05's required
// notification bell/prefs, the watchlist team surface, the personal archive, and the list-order
// drag contract): it bundles the REAL `src/components/**` module with esbuild (already a transitive
// dependency of Next — see this lane's REPORT for the version pinned) and mounts it with
// `ReactDOM.createRoot` in the SAME Playwright chromium page run-rendering-guard.mjs already drives,
// so a smoke spec exercises the actual .tsx file, not a reproduction of it.
//
// WHY A FAKE SAME-ORIGIN URL, NOT page.setContent DIRECTLY. page.setContent() leaves the page at
// `about:blank`, whose origin cannot resolve a component's relative `fetch("/api/...")` call
// ("Failed to parse URL from /api/..." — reproduced and fixed while building this harness, see
// REPORT). Every smoke page instead navigates to a same-origin fake URL
// (https://smoke-guard.internal/) that this harness intercepts via `page.route`, so relative fetches
// resolve against a real origin and are answered by fixture data, never the network — same $0/no-
// network posture as every other guard file in this repo.
//
// WHAT IS STUBBED, AND WHY EACH ONE IS A STUB RATHER THAN THE REAL MODULE:
//   next/link            — Next's <Link> needs the App Router context this bundle has none of; the
//                           stub is a plain <a href> (prefetch prop dropped), which is what Link
//                           renders to the DOM anyway — the guard's overflow/placeholder detectors
//                           see the identical markup shape.
//   @/lib/supabase-browser — createBrowserClient(url, anonKey) reads NEXT_PUBLIC_SUPABASE_URL /
//                           NEXT_PUBLIC_SUPABASE_ANON_KEY from process.env, which is empty in an
//                           esbuild browser bundle with no env plumbing, and would throw at
//                           construction (an invalid Supabase URL). The stub returns a client
//                           carrying a fake session (so useListOrder/resourceStore's auth-gated
//                           writes proceed instead of failing closed with "sign in") and a
//                           `.from(table)` chain that resolves empty by default — a spec can
//                           override query results per call by passing `alias` overrides into
//                           `bundleEntry`.
// Every OTHER import (dnd-kit, zustand, lucide-react, the app's own lib modules) is the real package
// from node_modules — nothing else is reproduced or mocked.
//
// COST: filesystem + a headless chromium process, same posture as run-rendering-guard.mjs's fixture
// legs. No network (page.route intercepts every request the smoke page issues), no database, no
// model call, no schedule, no credential.

import * as esbuild from 'esbuild';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRepoRoot } from '../../lib/context.mjs';
import { assertGuardClean, detectOverflows, findPlaceholderLiterals } from './guard-assert.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));

// NEXT_LINK_STUB, SUPABASE_STUB, SMOKE_BASE_URL, fsiAppRoot: not exported (lane DEAD-EXEC, 2026-09-04) —
// each used only within this file, per the wiring audit's Appendix B (dead exports, 2026-09-04); no
// external importer anywhere in the repo names any of the four.
const NEXT_LINK_STUB = join(HERE, 'stub-next-link.mjs');
const SUPABASE_STUB = join(HERE, 'stub-supabase-browser.mjs');

/** The fake same-origin every smoke page navigates to. See header for why. */
const SMOKE_BASE_URL = 'https://smoke-guard.internal';

/** fsi-app/ — the esbuild resolveDir, so `@/*` resolves via the real tsconfig `paths` mapping and a
 *  bare specifier resolves against the real (symlinked, shared) node_modules install. */
function fsiAppRoot() {
  return join(getRepoRoot(), 'fsi-app');
}

const DEFAULT_ALIAS = {
  'next/link': NEXT_LINK_STUB,
  '@/lib/supabase-browser': SUPABASE_STUB,
};

/**
 * Bundle an in-memory TSX/JSX entry string that imports one or more REAL `src/**` modules into a
 * browser IIFE. `alias` overrides/extends DEFAULT_ALIAS (specifier string -> replacement file path);
 * a spec never needs to alias anything beyond the two defaults unless it deliberately wants a
 * different stub. Pure aside from the esbuild call: filesystem-read-only against the tracked tree,
 * no network (esbuild resolves node_modules + tsconfig paths locally), matching every other
 * discipline-engine file's cost posture.
 */
export async function bundleEntry(entryCode, { alias = {} } = {}) {
  const result = await esbuild.build({
    stdin: { contents: entryCode, loader: 'tsx', resolveDir: fsiAppRoot() },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    alias: { ...DEFAULT_ALIAS, ...alias },
  });
  return result.outputFiles[0].text;
}

/**
 * Open a fresh page at SMOKE_BASE_URL with an empty mount shell, wiring `apiRoutes` (an array of
 * `{ urlGlob, handler }`, each `handler` a Playwright route handler — `(route) => route.fulfill(...)`
 * or similar) BEFORE navigation so every fetch a mounted component issues on first render is answered
 * by fixture data. `rootIds` names the mount-point div ids the entry code expects (defaults to the
 * single `"smoke-root"` id every spec but notifications uses — that one mounts two components side
 * by side and passes its own ids).
 */
export async function newSmokePage(browser, { apiRoutes = [], rootIds = ['smoke-root'] } = {}) {
  const page = await browser.newPage();
  const body = `<!doctype html><html><body>${rootIds.map((id) => `<div id="${id}"></div>`).join('')}</body></html>`;
  await page.route(`${SMOKE_BASE_URL}/`, (route) =>
    route.fulfill({ contentType: 'text/html', body }),
  );
  for (const { urlGlob, handler } of apiRoutes) {
    await page.route(urlGlob, handler);
  }
  await page.goto(`${SMOKE_BASE_URL}/`);
  return page;
}

/** Inject a bundled entry and call the named `window.<mountFn>` export it defines with `props`
 *  (structured-cloned across the page.evaluate boundary — plain data only, no functions). */
export async function mountBundle(page, bundleJs, mountFn, props) {
  await page.addScriptTag({ content: bundleJs });
  await page.evaluate(({ fn, p }) => window[fn](p), { fn: mountFn, p: props ?? null });
}

/**
 * Measure the mounted page the SAME way run-rendering-guard.mjs measures a fixture (body +
 * `[data-guard-container]` scrollWidth/clientWidth pairs), and collect visible text from a broader
 * text-bearing element set than fixtures.mjs's `[data-guard-scan-text]` convention. WHY BROADER: the
 * fixture legs mark up a `[data-guard-scan-text]` region by hand because they are hand-authored HTML;
 * these specs mount unmodified production components, which carry no such marker attribute, so the
 * placeholder-literal scan here reads every table/text-bearing element in the mounted tree instead
 * (`th,td,p,span,li,button,a`) — a strictly WIDER net than the fixture convention, never narrower.
 */
export async function measureGuard(page) {
  return page.evaluate(() => {
    const els = [document.body, ...document.querySelectorAll('[data-guard-container]')];
    const measurements = els.map((el) => ({
      name: el === document.body ? 'body' : el.getAttribute('data-guard-container') || el.tagName,
      className: el.className || '',
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    // Non-empty only: isPlaceholderText (source-entry-filter.mjs) treats "" as a placeholder token
    // (a genuinely empty TABLE CELL is one) — correct for fixtures.mjs's [data-guard-scan-text]
    // table-cell scan, wrong for this broader element set, most of which (icon-only spans, layout
    // wrappers) is legitimately textless. An empty string here is "nothing rendered", not "a
    // placeholder literal rendered"; only non-empty text can BE one.
    const texts = [];
    for (const cell of document.body.querySelectorAll('th,td,p,span,li,button,a')) {
      const t = (cell.textContent || '').trim();
      if (t) texts.push(t);
    }
    return { measurements, texts };
  });
}

export { assertGuardClean, detectOverflows, findPlaceholderLiterals };
