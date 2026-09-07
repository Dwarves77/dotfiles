// Design audit runner (lane uxaudit-harness, 2026-09-07). GOVERNING skill: caros-ledge-platform-intent.
//
// WHAT IT DOES. For every spec JSON in ./spec: mounts the named real component tree (./mounts.mjs,
// built on the rendering guard's own esbuild + Playwright machinery), reads getComputedStyle for
// every property the spec names, reads textContent for every `text` key, normalises both sides
// (./normalise.mjs) and records one row per property with a status:
//
//   MATCH        measured value equals the design source value
//   MISMATCH     measured value differs — the row carries BOTH numbers, never a verdict without one
//   NOT BUILT    the spec's selector matched nothing in the mounted tree
//   NOT IN SPEC  a `forbid` selector matched — the design does not have this element
//
// It then regenerates docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md IN FULL from those results
// (the seed document's source-level A-list is preserved verbatim as its own section, read from
// ./seed-2026-09-07.md) and writes ./results.json.
//
// Run: npm run audit:design   (from fsi-app/), or
//      node fsi-app/.discipline/rendering/audit/run-audit.mjs
// Optional: --spec=factcard,listrow  runs only those spec files.
//
// COST: filesystem + one headless chromium process. No network (every request the mounted tree
// issues is answered by page.route), no database, no model call, no credential — the same posture as
// every other file under .discipline/rendering/.
//
// EXIT CODE. 0 whenever the sweep RAN, whatever it found — this is an audit that reports, not a gate
// that blocks. A non-zero exit means the harness itself failed (a mount threw, chromium is missing).
// The fix lanes are driven by the document, not by this process's status.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRepoRoot } from '../../lib/context.mjs';
import { bundleEntry, newSmokePage, mountBundle } from '../smoke/harness.mjs';
import { AUDIT_MOUNTS } from './mounts.mjs';
import { compareValue, collapse } from './normalise.mjs';
import { detectBoundsViolations } from '../assertions.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SPEC_DIR = join(HERE, 'spec');
const AUDIT_DATE = '2026-09-07';

function loadSpecs(only) {
  const files = readdirSync(SPEC_DIR).filter((f) => f.endsWith('.json')).sort();
  const picked = only ? files.filter((f) => only.includes(basename(f, '.json'))) : files;
  return picked.map((f) => {
    const spec = JSON.parse(readFileSync(join(SPEC_DIR, f), 'utf8'));
    spec.__file = `fsi-app/.discipline/rendering/audit/spec/${f}`;
    spec.__id = basename(f, '.json');
    return spec;
  });
}

/** Flatten a spec into the target list the in-page probe reads. */
function targetsOf(spec) {
  const targets = [];
  if (spec.expect && Object.keys(spec.expect).length > 0) {
    targets.push({ name: spec.part, selector: spec.selector, expect: spec.expect, matchStyle: spec.matchStyle, textMatch: spec.textMatch });
  }
  for (const child of spec.children || []) {
    targets.push({ name: child.name, selector: child.selector, expect: child.expect, note: child.note, matchStyle: child.matchStyle, textMatch: child.textMatch });
  }
  return targets;
}

/**
 * Read, in the page, every property each target names. Returns one record per target:
 * `{ found, count, fontSize, styles: {prop: serialised}, text }`. `count` is reported so a spec that
 * expects exactly one of something (5.2's "one coloured rule per screen") can assert on it.
 */
async function probe(page, targets, forbids) {
  return page.evaluate(
    ({ targets, forbids }) => {
      // `matchStyle` narrows a selector by computed style — the only way to address an element the
      // product gives no marker attribute to (e.g. "a 3px rule whose background is the four-band
      // gradient"). Values are either an exact computed string or `contains:<substring>`.
      const styleFilter = (nodes, matchStyle) => {
        if (!matchStyle) return nodes;
        return nodes.filter((n) => {
          const cs = getComputedStyle(n);
          return Object.entries(matchStyle).every(([prop, want]) => {
            const got = cs.getPropertyValue(prop);
            return String(want).startsWith('contains:')
              ? got.includes(String(want).slice('contains:'.length))
              : got.trim() === String(want).trim();
          });
        });
      };
      const readTarget = (t) => {
        let nodes = styleFilter(Array.from(document.querySelectorAll(t.selector)), t.matchStyle);
        // HARNESS FIX, found independently by two fix lanes (fix58-tokens and fix58-detail,
        // 2026-09-07): `textMatch` narrows a selector to elements whose OWN text contains a
        // substring — already honored for `forbid` entries (see readForbid below) but silently
        // dropped here for ordinary targets, so a spec like page-frame.json's "+ Tag" trigger
        // count (`header:not(.cl-masthead) button` + `textMatch: "Tag"`) measured every button
        // under the selector (5: the overflow menu, Export brief, Share, Watch, + Tag) instead
        // of the one it named. Same filter, same rule. Both lanes' fixes were identical; kept
        // once here at the fold.
        if (t.textMatch) nodes = nodes.filter((n) => (n.textContent || '').includes(t.textMatch));
        if (nodes.length === 0) return { found: false, count: 0, styles: {}, text: null, fontSize: null, placeholder: null };
        const el = nodes[0];
        const cs = getComputedStyle(el);
        const styles = {};
        for (const prop of Object.keys(t.expect)) {
          if (prop === 'text' || prop === 'count' || prop === 'placeholder') continue;
          styles[prop] = cs.getPropertyValue(prop);
        }
        return {
          found: true,
          count: nodes.length,
          fontSize: parseFloat(cs.fontSize),
          // `<input>`/`<textarea>` placeholder text lives in the `placeholder` DOM property, not
          // textContent — an input's `text` key would always read empty. A spec that wants to assert
          // a placeholder string uses the `placeholder` key instead.
          placeholder: 'placeholder' in el ? el.placeholder : null,
          styles,
          text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        };
      };
      const readForbid = (f) => {
        let nodes = styleFilter(Array.from(document.querySelectorAll(f.selector)), f.matchStyle);
        if (f.textMatch) nodes = nodes.filter((n) => (n.textContent || '').includes(f.textMatch));
        // Visible text only: several shared parts carry their own responsive rules in a nested
        // `<style>` tag (ListRow, CommandBar, TierChip), whose textContent is CSS and would make an
        // otherwise correct forbid finding unreadable.
        const visibleText = (el) => {
          const clone = el.cloneNode(true);
          for (const s of clone.querySelectorAll('style,script')) s.remove();
          return (clone.textContent || '').replace(/\s+/g, ' ').trim();
        };
        return {
          count: nodes.length,
          sample: nodes.length ? visibleText(nodes[0]).slice(0, 90) : null,
        };
      };
      return {
        targets: targets.map(readTarget),
        forbids: forbids.map(readForbid),
      };
    },
    { targets, forbids },
  );
}

/**
 * D1 audit check (operator report 2026-09-07): a `boundsCheck` entry names a row/header selector
 * and a cell selector — for every matched row, every matched cell's `getBoundingClientRect()` is
 * checked against its row's own box (no cell escapes it) and against its sibling cells (no two
 * overlap). This is what `expect`/`children`'s value-level checks structurally cannot do (they
 * read `getComputedStyle`, never geometry against a SIBLING), and what `detectOverflows`
 * (the smoke specs' own guard) cannot do either (it only sees a container's own scrollWidth vs
 * clientWidth — never one cell bleeding into another while the container itself stays scroll-
 * free, which is exactly the reported defect).
 */
async function probeBounds(page, checks) {
  return page.evaluate((checks) => {
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    return checks.map((check) => {
      const rows = Array.from(document.querySelectorAll(check.container));
      const perRow = rows.map((row) => ({
        containerRect: rectOf(row),
        cells: Array.from(row.querySelectorAll(check.cells)).map((el) => ({ name: el.className || el.tagName, rect: rectOf(el) })),
      }));
      return { rowCount: rows.length, perRow };
    });
  }, checks);
}

function rowsForBounds(spec, checks, measured) {
  const rows = [];
  const base = { spec: spec.__id, part: spec.part, artboards: spec.artboards, source: spec.source, viewport: spec.viewport };
  checks.forEach((check, i) => {
    const { rowCount, perRow } = measured[i];
    if (rowCount === 0) {
      rows.push({
        ...base,
        target: check.name,
        selector: check.container,
        property: '(bounds)',
        expected: 'present',
        actual: 'no element matched this selector',
        status: 'NOT BUILT',
        note: check.reason ?? null,
      });
      return;
    }
    const allViolations = [];
    perRow.forEach(({ containerRect, cells }, rowIdx) => {
      const v = detectBoundsViolations(containerRect, cells);
      if (v.length > 0) allViolations.push(`row ${rowIdx}: ${v.join('; ')}`);
    });
    rows.push({
      ...base,
      target: check.name,
      selector: `${check.container} > ${check.cells}`,
      property: '(cell containment)',
      expected: 'no cell overlaps a sibling or exceeds its row',
      actual: allViolations.length === 0 ? `clean across ${rowCount} row(s)` : allViolations.join(' | '),
      status: allViolations.length === 0 ? 'MATCH' : 'MISMATCH',
      note: check.reason ?? null,
    });
  });
  return rows;
}

function rowsFor(spec, targets, measuredTargets, forbids, measuredForbids) {
  const rows = [];
  const base = {
    spec: spec.__id,
    part: spec.part,
    artboards: spec.artboards,
    source: spec.source,
    viewport: spec.viewport,
  };

  targets.forEach((t, i) => {
    const m = measuredTargets[i];
    if (!m.found) {
      rows.push({
        ...base,
        target: t.name,
        selector: t.selector,
        property: '(element)',
        expected: 'present',
        actual: 'no element matched this selector',
        status: 'NOT BUILT',
        note: t.note ?? null,
      });
      return;
    }
    for (const [prop, expected] of Object.entries(t.expect)) {
      let actual;
      if (prop === 'text') actual = m.text;
      else if (prop === 'placeholder') actual = m.placeholder;
      else if (prop === 'count') actual = String(m.count);
      else actual = m.styles[prop];
      const cmp =
        prop === 'text' || prop === 'placeholder'
          ? { ok: collapse(String(expected)) === collapse(String(actual ?? '')), expected: String(expected), actual: String(actual ?? '') }
          : compareValue(String(expected), String(actual ?? ''), { fontSizePx: m.fontSize });
      // An `em` expectation is compared in px against the element's OWN computed font-size; show
      // that resolved number beside it so a reader never has to redo the arithmetic to judge the row.
      const shown =
        /\dem\b/.test(cmp.expected) && Number.isFinite(m.fontSize)
          ? `${cmp.expected} (= ${Math.round(parseFloat(cmp.expected) * m.fontSize * 100) / 100}px at ${m.fontSize}px)`
          : cmp.expected;
      rows.push({
        ...base,
        target: t.name,
        selector: t.selector,
        property: prop,
        expected: shown,
        actual: cmp.actual,
        status: cmp.ok ? 'MATCH' : 'MISMATCH',
        note: t.note ?? null,
      });
    }
  });

  forbids.forEach((f, i) => {
    const m = measuredForbids[i];
    rows.push({
      ...base,
      target: f.name,
      selector: f.selector + (f.textMatch ? ` [text contains "${f.textMatch}"]` : ''),
      property: '(forbidden element)',
      expected: 'absent',
      actual: m.count === 0 ? 'absent' : `${m.count} present${m.sample ? ` — "${m.sample}"` : ''}`,
      status: m.count === 0 ? 'MATCH' : 'NOT IN SPEC',
      note: f.reason ?? null,
    });
  });

  return rows;
}

function esc(v) {
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderDocument(results, meta) {
  const counts = { MATCH: 0, MISMATCH: 0, 'NOT BUILT': 0, 'NOT IN SPEC': 0 };
  for (const r of results.rows) counts[r.status] = (counts[r.status] ?? 0) + 1;

  const out = [];
  out.push(`# Audit: build vs design, value-level (${AUDIT_DATE})`);
  out.push('');
  out.push(
    'GENERATED FILE. Every table below is regenerated in full by',
    '`node fsi-app/.discipline/rendering/audit/run-audit.mjs` (`npm run audit:design`) from the spec',
    'JSON files in `fsi-app/.discipline/rendering/audit/spec/`. Do not hand-edit the generated',
    'sections: edit the spec file and rerun. The hand-written source-level pass that seeded this',
    'document is preserved verbatim at the end.',
  );
  out.push('');
  out.push(`- Repo state: \`${meta.head}\` (branch \`${meta.branch}\`)`);
  out.push(`- Run at: ${meta.runAt}`);
  out.push(`- Spec files run: ${results.specs.length} (${results.specs.map((s) => s.__id).join(', ')})`);
  out.push(`- Checks: ${results.rows.length}`);
  out.push('');
  out.push('## Method');
  out.push('');
  out.push(
    'Each spec file names a mount (`fsi-app/.discipline/rendering/audit/mounts.mjs`), which bundles the',
    'REAL `src/components/**` module with esbuild and mounts it in Playwright chromium at the stated',
    'viewport — the same machinery the rendering guard\'s smoke specs already use, so the audit',
    'exercises the actual `.tsx` file rather than a reproduction of it. For every selector in the spec',
    'the runner reads `getComputedStyle`, normalises both the design value and the measured value to',
    'one canonical form (colours to `rgb()`/`rgba()`, lengths to px, `em` resolved against the',
    'element\'s own font-size) and records both numbers on every row. `[CONFIRMED]`: every MATCH and',
    'MISMATCH row below is a measurement taken this run, not a source read.',
  );
  out.push('');
  out.push('| Status | Meaning | Count |');
  out.push('|---|---|---|');
  out.push(`| MATCH | measured value equals the design source value | ${counts.MATCH ?? 0} |`);
  out.push(`| MISMATCH | measured value differs from the design source value | ${counts.MISMATCH ?? 0} |`);
  out.push(`| NOT BUILT | the spec's selector matched no element in the mounted tree | ${counts['NOT BUILT'] ?? 0} |`);
  out.push(`| NOT IN SPEC | a forbidden element is present | ${counts['NOT IN SPEC'] ?? 0} |`);
  out.push('');
  out.push('Everything not covered by a spec file in `spec/` is NOT AUDITED. The coverage list is');
  out.push('exactly the spec files named above; nothing else in the product has been measured by this run.');
  out.push('');

  for (const spec of results.specs) {
    const rows = results.rows.filter((r) => r.spec === spec.__id);
    const bad = rows.filter((r) => r.status !== 'MATCH').length;
    out.push(`## ${spec.part}`);
    out.push('');
    out.push(`- Spec file: \`${spec.__file}\``);
    out.push(`- Mount: \`${spec.mount}\` at ${spec.viewport} px`);
    out.push(`- Artboards: ${spec.artboards.join(', ')}`);
    out.push(`- Design source: ${spec.source}`);
    out.push(`- Result: ${rows.length - bad} MATCH, ${bad} not matching`);
    out.push('');
    for (const n of spec.notes || []) out.push(`> ${n}`);
    if ((spec.notes || []).length) out.push('');
    out.push('| Target | Property | Design source | Measured | Status |');
    out.push('|---|---|---|---|---|');
    for (const r of rows) {
      out.push(`| ${esc(r.target)} | \`${esc(r.property)}\` | \`${esc(r.expected)}\` | \`${esc(r.actual)}\` | ${r.status} |`);
    }
    out.push('');
  }

  out.push('## Failures the harness itself hit');
  out.push('');
  if (results.errors.length === 0) {
    out.push('None. Every spec file mounted and measured.');
  } else {
    for (const e of results.errors) out.push(`- \`${e.spec}\`: ${e.message}`);
  }
  out.push('');

  out.push('---');
  out.push('');
  out.push('# Appendix: the seed source-level pass (2026-09-07, preserved verbatim)');
  out.push('');
  out.push(
    'The pass below is a SOURCE read, not a rendered measurement — it is kept because its A-list is',
    'the numbered handoff the fix lanes are working from. Where a generated table above measures the',
    'same element, the measurement is the authority.',
  );
  out.push('');
  out.push(meta.seed.trim());
  out.push('');
  return out.join('\n');
}

async function main() {
  const argSpec = process.argv.find((a) => a.startsWith('--spec='));
  const only = argSpec ? argSpec.slice('--spec='.length).split(',').map((s) => s.trim()) : null;
  const specs = loadSpecs(only);
  if (specs.length === 0) {
    console.error('no spec files matched');
    process.exit(2);
  }

  const repoRoot = getRepoRoot();
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  );

  const rows = [];
  const errors = [];
  const bundleCache = new Map();

  for (const spec of specs) {
    const mount = AUDIT_MOUNTS[spec.mount];
    if (!mount) {
      errors.push({ spec: spec.__id, message: `unknown mount "${spec.mount}" (see mounts.mjs AUDIT_MOUNTS)` });
      continue;
    }
    try {
      if (!bundleCache.has(spec.mount)) {
        bundleCache.set(spec.mount, await bundleEntry(mount.entry, { alias: mount.alias || {} }));
      }
      const page = await newSmokePage(browser, { apiRoutes: mount.apiRoutes || [] });
      try {
        await page.setViewportSize({ width: spec.viewport, height: 1400 });
        await mountBundle(page, bundleCache.get(spec.mount), '__mount', null);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
        await page.waitForTimeout(80);
        const targets = targetsOf(spec);
        const forbids = spec.forbid || [];
        const measured = await probe(
          page,
          targets.map((t) => ({ selector: t.selector, expect: t.expect, matchStyle: t.matchStyle ?? null, textMatch: t.textMatch ?? null })),
          forbids.map((f) => ({ selector: f.selector, textMatch: f.textMatch ?? null, matchStyle: f.matchStyle ?? null })),
        );
        rows.push(...rowsFor(spec, targets, measured.targets, forbids, measured.forbids));

        const boundsChecks = spec.boundsCheck || [];
        if (boundsChecks.length > 0) {
          const measuredBounds = await probeBounds(page, boundsChecks);
          rows.push(...rowsForBounds(spec, boundsChecks, measuredBounds));
        }
      } finally {
        await page.close();
      }
    } catch (err) {
      errors.push({ spec: spec.__id, message: String(err?.stack || err).split('\n').slice(0, 3).join(' ') });
    }
  }

  await browser.close();

  const results = { runAt: new Date().toISOString(), specs, rows, errors };
  writeFileSync(join(HERE, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);

  const seedPath = join(HERE, `seed-${AUDIT_DATE}.md`);
  const seed = existsSync(seedPath) ? readFileSync(seedPath, 'utf8') : '(no seed document found)';
  const meta = {
    head: process.env.AUDIT_HEAD || 'working tree',
    branch: process.env.AUDIT_BRANCH || 'working tree',
    runAt: results.runAt,
    seed,
  };
  const docPath = join(repoRoot, 'docs/design/handoff-2026-09-06', `AUDIT-${AUDIT_DATE}.md`);
  writeFileSync(docPath, renderDocument(results, meta));

  const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  console.log('\n===== DESIGN AUDIT =====');
  console.log(`specs: ${specs.length}  checks: ${rows.length}`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  if (errors.length) {
    console.log('\nharness errors:');
    for (const e of errors) console.log(`  ! ${e.spec}: ${e.message}`);
  }
  console.log(`\nwrote ${docPath}`);
  console.log(`wrote ${join(HERE, 'results.json')}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('design audit ERROR:', e);
  process.exit(2);
});
