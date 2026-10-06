// scroll-container-attack-smoke.mjs (lane GATES-2, 2026-10-05): the guard proven BY ATTACK in a real browser.
//
// The production defect: a theme strip 1108px wide inside a 375px screen scrolled inside `<main>`, so the
// document's scrollWidth never moved and a document-only check passed. The guard now measures every scroll
// container (overflow-rule.mjs). This spec mounts hand-written fixtures at 375px and runs the REAL
// measureGuard + assertGuardClean over them, the same functions every UX spec uses:
//   ATTACK 1  an inner wrapper wider than its overflow-x:auto parent        -> the guard MUST fail
//   ATTACK 2  a <main> that scrolls sideways while the document does not    -> the guard MUST fail
//   ATTACK 3  a declared strip whose own box is wider than the screen        -> the guard MUST fail
//   CONTROL A a clean page                                                   -> the guard MUST pass
//   CONTROL B a declared strip that scrolls inside a box that fits the screen -> the guard MUST pass
// A broken detector fails here (an attack that does not fail the guard is itself a failure).

import { measureGuard, assertGuardClean } from './harness.mjs';

const WIDTH = 375;
const NEEDLE = /scroll container\(s\) overflow at phone width/;

const doc = (body) => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
html,body{margin:0;padding:0}*{box-sizing:border-box}</style></head><body>${body}</body></html>`;

const FIXTURES = [
  {
    id: 'attack-inner-wrapper-in-overflow-auto-parent',
    expectFail: true,
    html: doc(`<main><div style="overflow-x:auto;width:100%"><div style="width:900px;height:20px">wide inner wrapper</div></div></main>`),
  },
  {
    id: 'attack-main-scrolls-while-document-fits',
    expectFail: true,
    html: doc(`<main style="overflow-x:auto;width:100%"><section><div style="width:1108px;height:20px">theme strip, 1108px</div></section></main>`),
  },
  {
    id: 'attack-declared-strip-box-wider-than-screen',
    expectFail: true,
    html: doc(`<div style="overflow:hidden;width:100%"><div data-guard-strip style="overflow-x:auto;width:1108px"><div style="width:2000px;height:20px">strip content</div></div></div>`),
  },
  {
    id: 'control-clean-page',
    expectFail: false,
    html: doc(`<main><p>Nothing here scrolls.</p></main>`),
  },
  {
    id: 'control-declared-strip-inside-its-box',
    expectFail: false,
    html: doc(`<main><div data-guard-strip style="overflow-x:auto;width:100%;display:flex;gap:8px"><div style="flex:0 0 260px;height:20px">a</div><div style="flex:0 0 260px;height:20px">b</div><div style="flex:0 0 260px;height:20px">c</div></div></main>`),
  },
];

/** @param {import('playwright').Browser} browser @returns {Promise<{checks:number, failures:string[]}>} */
export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  for (const fx of FIXTURES) {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: 812 } });
    try {
      await page.setContent(fx.html, { waitUntil: 'load' });
      const lines = assertGuardClean(`scroll-container-attack:${fx.id}@${WIDTH}`, await measureGuard(page));
      const flagged = lines.some((l) => NEEDLE.test(l));
      checks += 1;
      if (fx.expectFail && !flagged) {
        failures.push(`scroll-container-attack:${fx.id}@${WIDTH}: the guard did NOT fail on an overflow attack (detector broken). Lines: ${JSON.stringify(lines)}`);
      }
      if (!fx.expectFail && lines.length > 0) {
        failures.push(...lines);
      }
    } finally {
      await page.close();
    }
  }
  return { checks, failures };
}
