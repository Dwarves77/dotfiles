// F35: ROW UX COVERAGE. Coordinator, 2026-09-03, after the operator's phone screenshots: every ledger page
// wrapped card titles ONE WORD PER LINE and the Operations regional matrix ran off the right edge. Root
// cause [CONFIRMED, MarketIntelLedger.tsx ~L900]: an inline-styled flex row with a non-shrinking aside
// beside a `flex:1; minWidth:0` title; at 375 px the title got ~40 px. Every gate was green because no gate
// measured a real row component at a phone width: the rendering guard's fixture legs are hand-reproduced
// HTML, and the four SM smoke specs mount other components.
//
// RULE. Every row component in ROW_COMPONENTS (the customer-facing ledger/card rows and the section
// headers that carry a title beside an aside) MUST be (a) mounted by a UX smoke spec registered in
// .discipline/rendering/smoke/ux-smoke-specs.mjs, which measures it at 375 × 812 and 1280 × 800 with
// ux-assert.mjs (law-2 target floor, squeezed-title wrap, overflow), and (b) carry at least one
// `data-guard-title` attribute, so the squeezed-title detector has an element to measure (a spec cannot
// pass by never marking a title). F35 is the COVERAGE half: it proves the measurement is wired to the
// component. The measurement itself runs in the rendering-guard job (run-rendering-guard.mjs, UX smoke
// slot). Invariant RD-60 names both.
//
// WHY A HARDCODED LIST. "Is this component a row?" is a judgment; the list is the auditable artifact, the
// same posture as F33's SPEC_SURFACES. Adding a row component to the app means adding it here (reviewed
// change) and shipping its spec; F35 turns red the moment one is listed without a spec.
//
// HOW A SPEC IS RESOLVED. ux-smoke-specs.mjs is read as text: every `import ... from './<file>'` that is
// referenced by an ACTIVE (non-comment) `{ name, run }` entry is followed, and the spec file's text is
// searched for the component's `@/components/<path>` import (the ENTRY string every spec embeds). A spec
// that imports the component is coverage; a commented-out registry line is not.
//
// COST: filesystem only. Per-file: enumerate() lists the registry + the row components; check() scans one.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const FSI = 'fsi-app';
export const REGISTRY = `${FSI}/.discipline/rendering/smoke/ux-smoke-specs.mjs`;

/** Customer-facing row/card components and section headers. Basis per entry: the 2026-09-03 screenshot
 *  that showed it broken, or the same layout shape read in the file. */
export const ROW_COMPONENTS = Object.freeze({
  'src/components/market/MarketIntelLedger.tsx': 'screenshot 04-market-signals (one word per line)',
  'src/components/operations/OperationsLedger.tsx': 'screenshot 02-operations-items (one word per line)',
  'src/components/operations/OperationsItemsView.tsx': 'same row shape as OperationsLedger (read)',
  'src/components/operations/RegionDimensionMatrix.tsx': 'screenshot 01-operations-regions (text off the right edge)',
  'src/components/research/ResearchLedger.tsx': 'screenshot 03-research-findings (one word per line, label overlap)',
  'src/components/regulations/RegulationsLedger.tsx': 'same row shape as MarketIntelLedger (read)',
  'src/components/regulations/UpcomingObligationsStrip.tsx': 'screenshot 05-regulations-upcoming (narrow title column, icon-only control)',
  'src/components/regulations/ObligationRegister.tsx': 'table rows; must scroll inside its own container',
  'src/components/home/HomeSurface.tsx': 'screenshots 06/07-home (section header title beside a subtitle that runs off page)',
  'src/components/community/PostList.tsx': 'community rows (COMMUNITY-B surface)',
  'src/components/community/Post.tsx': 'community post row (COMMUNITY-B surface)',
});

/** Strip line and block comments (keeping newlines). Pure. */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
}

/** Spec files referenced by ACTIVE registry entries: [{ file (repo-relative), name }]. Pure over text. */
export function activeSpecFiles(registrySrc, registryPath = REGISTRY) {
  const clean = stripComments(registrySrc);
  const imports = new Map(); // identifier -> relative file
  const importRe = /import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(clean))) {
    for (const part of m[1].split(',')) {
      const [orig, alias] = part.split(/\s+as\s+/).map((s) => s.trim());
      if (orig) imports.set(alias || orig, m[2]);
    }
  }
  const out = [];
  const entryRe = /\{\s*name\s*:\s*['"]([^'"]+)['"]\s*,\s*run\s*:\s*([A-Za-z0-9_$]+)\s*\}/g;
  while ((m = entryRe.exec(clean))) {
    const rel = imports.get(m[2]);
    if (!rel) continue;
    const file = join(dirname(registryPath), rel).replace(/\\/g, '/') + (rel.endsWith('.mjs') ? '' : '.mjs');
    out.push({ name: m[1], file });
  }
  return out;
}

/** True when `specSrc` mounts the component at `componentPath` (a `@/components/...` import of it). Pure. */
export function specMounts(specSrc, componentPath) {
  const alias = componentPath.replace(/^src\//, '@/').replace(/\.tsx?$/, '');
  const re = new RegExp(`from\\s*['"]${alias.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?:\\.tsx?)?['"]`);
  return re.test(specSrc);
}

/** Components with no active spec mounting them. Pure over the loaded texts. */
export function uncoveredComponents(registrySrc, readSpec, components = Object.keys(ROW_COMPONENTS)) {
  const specs = activeSpecFiles(registrySrc);
  const texts = specs.map((s) => ({ ...s, src: readSpec(s.file) })).filter((s) => typeof s.src === 'string');
  return components.filter((c) => !texts.some((s) => specMounts(s.src, c)));
}

export const fitnessFunction = {
  id: 'F35',
  name: 'row-ux-coverage',
  description:
    'Every customer-facing row/ledger component in ROW_COMPONENTS is mounted by a registered UX smoke spec ' +
    '(measured at 375 × 812 and 1280 × 800: law-2 target floor, squeezed-title wrap, overflow) and carries a ' +
    'data-guard-title attribute. 2026-09-03: every ledger page wrapped titles one word per line on a phone and ' +
    'no gate measured a real row at a phone width.',
  source: 'docs/design/ux-laws.md (laws 2, 4, 12); invariant RD-60; operator screenshots docs/plans/mobile-evidence/',

  enumerate() {
    return [REGISTRY, ...Object.keys(ROW_COMPONENTS).map((c) => `${FSI}/${c}`)];
  },

  check(file, content) {
    const root = getRepoRoot();
    if (file === REGISTRY) {
      const readSpec = (rel) => {
        const p = join(root, rel);
        return existsSync(p) ? readFileSync(p, 'utf8') : null;
      };
      const missing = uncoveredComponents(content, readSpec);
      return missing.map((c) =>
        violation(1, `${c} has no active UX smoke spec mounting it (register one in ux-smoke-specs.mjs; basis: ${ROW_COMPONENTS[c]})`),
      );
    }
    const rel = file.replace(`${FSI}/`, '');
    if (!ROW_COMPONENTS[rel]) return PASS;
    if (/data-guard-title/.test(content)) return PASS;
    return [violation(1, `${rel} carries no data-guard-title attribute: the squeezed-title detector has nothing to measure`)];
  },
};
