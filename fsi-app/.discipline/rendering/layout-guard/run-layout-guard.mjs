// SITE-WIDE LAYOUT GUARD - the runner. Lane layoutguard, 2026-09-08.
//
// Mounts every one of the 17 routes (18 mounts: /login and /signup share artboard 16) at 1440 and
// 1024 on the design audit's OWN mounts, collects one measurement bundle per route × width
// (collect.mjs) and judges it with the pure detectors (rules.mjs). Reports BY RULE and BY ROUTE.
//
// TWO ENTRY POINTS, one engine:
//   `runLayoutGuard(browser)`  - the rendering-guard slot. run-rendering-guard.mjs calls it with
//                                its own chromium instance, exactly as it calls every smoke spec,
//                                and adds the failures to its own list. That is the CI wiring: no
//                                train lands with a layout-guard failure.
//   `node run-layout-guard.mjs` - the standalone audit. Same measurements, plus the dated failure
//                                table written to docs/audits/.
//
// EVERY FAILURE LINE NAMES THE RULE, THE ROUTE, THE ELEMENT AND THE MEASURED NUMBERS. The operator's
// closing instruction, verbatim: "a guard that says only 'failed' costs more than it saves".

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot } from '../../lib/context.mjs';
import { bundleEntry, newSmokePage, mountBundle } from '../smoke/harness.mjs';
import { fullAppCssCompiled } from '../smoke/smoke-fixtures.mjs';
import { AUDIT_MOUNTS, mountExtraCss } from '../audit/mounts.mjs';
import { detectClippedText } from '../ux-assert.mjs';
import { collectLayout } from './collect.mjs';
import { checkAll, RULE_IDS, RULE_PROVENANCE } from './rules.mjs';
import { ROUTES, LAYOUT_WIDTHS, ROUTING } from './routes.mjs';
import { manifestFor, loadManifests, deviationsForRoute } from './manifests.mjs';
import { applyBaseline, findingKey, BASELINE_EXPIRY_DATE } from './baseline.mjs';

const AUDIT_DATE = '2026-09-08';

/** Format one finding as the guard's single-line failure string. */
export function formatFinding(f) {
  return `layout-guard ${f.rule} ${f.route}@${f.width}: ${f.element} - ${f.measured} [${f.message}]`;
}

/**
 * Measure every route × width and return the findings. `browser` is a live Playwright chromium; the
 * caller owns it (the rendering guard passes its own, so the whole guard costs no extra process).
 */
export async function measureAllRoutes(browser, { widths = LAYOUT_WIDTHS, only = null } = {}) {
  const manifests = loadManifests();
  const routes = only ? ROUTES.filter((r) => r.route === only || r.mount === only) : ROUTES;
  const findings = [];
  const errors = [];
  const bundles = new Map();
  let checks = 0;

  for (const route of routes) {
    const mount = AUDIT_MOUNTS[route.mount];
    if (!mount) {
      errors.push({ route: route.route, message: `unknown mount "${route.mount}" (see audit/mounts.mjs)` });
      continue;
    }
    for (const width of widths) {
      let page;
      try {
        if (!bundles.has(route.mount)) {
          bundles.set(route.mount, await bundleEntry(mount.entry, { alias: mount.alias || {} }));
        }
        page = await newSmokePage(browser, { apiRoutes: mount.apiRoutes || [] });
        await page.setViewportSize({ width, height: 1400 });
        // The compiled stylesheet unconditionally: this guard asks what the PRODUCT looks like, and
        // the desktop/tablet switch is expressed in Tailwind utility classes that a raw globals.css
        // read leaves un-expanded (see audit/run-audit.mjs's three-mechanism comment).
        await page.addStyleTag({ content: await fullAppCssCompiled() });
        const extra = mountExtraCss(mount);
        if (extra) await page.addStyleTag({ content: extra });
        await mountBundle(page, bundles.get(route.mount), '__mount', null);
        // SETTLE BEFORE MEASURING, and settle enough (lane layoutguard, 2026-09-08, the same flake
        // class run-audit.mjs already root-caused for `detailtagrow`). A region that arrives from a
        // resolved promise or a routed fetch - <DashboardWatchlist/>'s `use(promise)` empty state is
        // the one that showed it - had sometimes not painted at 150ms, so two runs of the SAME
        // commit produced different finding sets and the baseline reported phantom new failures. A
        // guard that disagrees with itself teaches its readers to re-run rather than to believe it.
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
        await page.waitForTimeout(400);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
        const bundle = await collectLayout(page);
        checks += 1;
        const m = { ...bundle, route: route.route, artboard: route.artboard, width };
        // The manifest compares the CONTENT column's cards; the rail is listed in the manifest too
        // and reported separately rather than mixed into the content order.
        m.cardTitles = (bundle.cardTitles || []).filter((c) => !c.inRail).map((c) => c.title);
        const raw = checkAll(m, {
          manifest: manifestFor(route.route, manifests),
          deviations: deviationsForRoute(route.route),
          detectClippedText,
        });
        // L1 does not apply to the two artboards that draw no nav+content frame (16 auth, 17
        // onboarding) - declared in routes.mjs as data, not decided here.
        findings.push(...(route.noFrame ? raw.filter((f) => f.rule !== 'L1') : raw));
      } catch (err) {
        errors.push({ route: route.route, width, message: String(err?.stack || err).split('\n').slice(0, 3).join(' ') });
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }
  }
  return { findings, errors, checks, routes };
}

/**
 * Programmatic single-route entry (lane facetfix, 2026-09-11): the same measurement the CLI's
 * `--route`/`--width` flags drive (see `main()` below), exposed as an importable function so a test
 * can measure one route without owning a browser itself. Launches its own chromium (honouring
 * `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, the same override `main()` reads), measures, closes, and returns
 * the RAW findings - no baseline application, no file writes, so a caller sees every finding the
 * detectors produced, dated exemptions included or not, and decides what to assert on it.
 */
export async function runLayoutGuardFor({ route, width }) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  );
  try {
    const { findings } = await measureAllRoutes(browser, { widths: [width], only: route });
    return findings;
  } finally {
    await browser.close();
  }
}

/**
 * The rendering-guard slot: `{ checks, failures }`, the shape every smoke spec returns.
 *
 * Only findings OUTSIDE the dated baseline fail the build (baseline.mjs's header states the whole
 * mechanism and its expiry). A harness error is never baselined: a route that would not mount is a
 * broken guard, not a known finding.
 */
export async function runLayoutGuard(browser, options = {}) {
  const { findings, errors, checks } = await measureAllRoutes(browser, options);
  const { baselined, blocking, expired, date } = applyBaseline(findings);
  const failures = [
    ...blocking.map(formatFinding),
    ...errors.map((e) => `layout-guard ${e.route}@${e.width ?? '-'}: harness error - ${e.message}`),
  ];
  if (baselined.length) {
    console.log(
      `layout guard: ${baselined.length} finding(s) covered by the dated baseline (expires ${BASELINE_EXPIRY_DATE}, today ${date}${expired ? ', EXPIRED' : ''}) - see docs/audits/layout-guard-2026-09-08.md for the owning part of each`,
    );
  }
  return { checks, failures };
}

function tableByRule(findings) {
  const out = ['| Rule | Provenance | Findings | Routes |', '|---|---|---|---|'];
  for (const id of RULE_IDS) {
    const hits = findings.filter((f) => f.rule === id);
    const routes = [...new Set(hits.map((f) => `${f.route}@${f.width}`))];
    out.push(`| ${id} | ${RULE_PROVENANCE[id]} | ${hits.length} | ${routes.slice(0, 8).join(', ') || '-'}${routes.length > 8 ? `, +${routes.length - 8} more` : ''} |`);
  }
  return out.join('\n');
}

function tableByRoute(findings, widths) {
  const out = [`| Route | Width | ${RULE_IDS.join(' | ')} | total |`, `|---|---|${RULE_IDS.map(() => '---').join('|')}|---|`];
  for (const r of ROUTES) {
    for (const w of widths) {
      const hits = findings.filter((f) => f.route === r.route && f.width === w);
      const cells = RULE_IDS.map((id) => {
        const n = hits.filter((f) => f.rule === id).length;
        return n === 0 ? '·' : String(n);
      });
      out.push(`| \`${r.route}\` | ${w} | ${cells.join(' | ')} | ${hits.length} |`);
    }
  }
  return out.join('\n');
}

function detailSections(findings) {
  const out = [];
  for (const id of RULE_IDS) {
    const hits = findings.filter((f) => f.rule === id);
    if (hits.length === 0) continue;
    out.push(`### ${id} - ${hits.length} finding(s)`, '', '| Route | Width | Element | Measured |', '|---|---|---|---|');
    for (const f of hits.slice(0, 60)) {
      out.push(`| \`${f.route}\` | ${f.width} | ${String(f.element).replace(/\|/g, '\\|').slice(0, 90)} | ${String(f.measured).replace(/\|/g, '\\|').slice(0, 130)} |`);
    }
    if (hits.length > 60) out.push(`| … | | ${hits.length - 60} further findings, in results.json | |`);
    out.push('');
  }
  return out.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
  const widths = flag('width') ? [Number(flag('width'))] : LAYOUT_WIDTHS;
  const only = flag('route');
  const writeBaseline = args.includes('--write-baseline');

  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  );
  const { findings, errors, checks } = await measureAllRoutes(browser, { widths, only });
  await browser.close();

  const repo = getRepoRoot();
  const outDir = join(repo, 'docs/audits');
  mkdirSync(outDir, { recursive: true });
  const doc = [
    `# Site-wide layout guard - first full run (${AUDIT_DATE})`,
    '',
    'GENERATED FILE. Regenerated in full by `node fsi-app/.discipline/rendering/layout-guard/run-layout-guard.mjs`',
    '(`npm run audit:layout`). Do not hand-edit: change the rule or the allowlist and rerun.',
    '',
    `- Routes: ${ROUTES.length} (17 artboards; /login and /signup share artboard 16)`,
    `- Widths: ${widths.join(', ')}`,
    `- Measurements taken: ${checks}`,
    `- Findings: ${findings.length}`,
    '',
    '`[CONFIRMED]`: every row below is a measurement taken this run in a real chromium against the',
    'real `src/components/**` modules, not a source read. The rules are the operator\'s L1-L12',
    '(SITE-WIDE LAYOUT GUARD, 2026-09-08), verbatim where they are mechanical and with the decision',
    'stated in `rules.mjs` where his text needed one.',
    '',
    '## By rule',
    '',
    tableByRule(findings),
    '',
    '## By route',
    '',
    tableByRoute(findings, widths),
    '',
    '## Routing: who owns each group of findings',
    '',
    'The shared parts this lane owns are FIXED (see the lane report and DEVIATION-LOG.md). Everything',
    'below belongs to a part another lane is actively rewriting; naming the owner here is what lets the',
    'coordinator route it instead of two lanes editing one file.',
    '',
    '| Rule / route | Owning part | Note |',
    '|---|---|---|',
    ...ROUTING.map((r) => `| \`${r.match}\` | ${r.owner} | ${r.note.replace(/\|/g, '\\|')} |`),
    '',
    '## Findings',
    '',
    detailSections(findings) || 'None.',
    '## Harness errors',
    '',
    errors.length === 0 ? 'None. Every route mounted and measured.' : errors.map((e) => `- \`${e.route}\`@${e.width ?? '-'}: ${e.message}`).join('\n'),
    '',
  ].join('\n');
  const docPath = join(outDir, `layout-guard-${AUDIT_DATE}.md`);
  writeFileSync(docPath, doc);
  const here = new URL('.', import.meta.url).pathname;
  writeFileSync(join(here, 'results.json'), `${JSON.stringify({ runAt: new Date().toISOString(), widths, checks, findings, errors }, null, 2)}\n`);
  if (writeBaseline) {
    writeFileSync(
      join(here, 'baseline.json'),
      `${JSON.stringify({
        note: 'GENERATED. See baseline.mjs for what this is and when it dies. Regenerate with --write-baseline; a lane that fixes its findings commits the SHRUNKEN file.',
        writtenAt: new Date().toISOString().slice(0, 10),
        expiryDate: BASELINE_EXPIRY_DATE,
        widths,
        count: findings.length,
        keys: findings.map(findingKey).sort(),
      }, null, 2)}\n`,
    );
    console.log(`wrote baseline.json (${findings.length} keys, expires ${BASELINE_EXPIRY_DATE})`);
  }

  console.log('\n===== SITE-WIDE LAYOUT GUARD =====');
  console.log(`routes: ${ROUTES.length}  widths: ${widths.join(',')}  measurements: ${checks}  findings: ${findings.length}`);
  console.log('');
  console.log(tableByRule(findings));
  if (errors.length) {
    console.log('\nharness errors:');
    for (const e of errors) console.log(`  ! ${e.route}@${e.width ?? '-'}: ${e.message}`);
  }
  console.log(`\nwrote ${docPath}`);
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith('run-layout-guard.mjs')) {
  main().catch((e) => { console.error('layout guard ERROR:', e); process.exit(2); });
}
