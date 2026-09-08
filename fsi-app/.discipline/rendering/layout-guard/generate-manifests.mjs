// L10 MANIFEST GENERATOR - reads the ARTBOARDS, never the build. Lane layoutguard, 2026-09-08.
//
// The operator's L10: "Every route has a manifest listing the cards it renders, in order, matching
// its artboard." A manifest generated from the current build would certify today's mistakes, so
// this reads `docs/design/handoff-2026-09-06/Caros Ledge UI System.dc.html` - the same file the
// design audit's per-artboard specs are authored from - and extracts, per artboard, the ordered
// card list of the content column and of the rail.
//
// A CARD IN THE ARTBOARD is the artboard's own card chrome, verbatim from the dc.html:
// `background:#fff` + `border:1px solid rgba(0,0,0,.12)` + `border-radius:10px`. A card's NAME is
// its first display-type run (uppercase or Anton), which is exactly how collect.mjs names a card in
// the build, so the two sides of the comparison are read the same way.
//
// BAND TILES ARE NOT CARDS. The four band tiles carry the card chrome but are the band scale, not
// panels (README §0.4 gives them their own anatomy: `padding:14px 16px 0`, a 4px band rule pinned
// to the bottom edge). They are excluded by name against the four band words, so a manifest is a
// list of PANELS.
//
// Run: node fsi-app/.discipline/rendering/layout-guard/generate-manifests.mjs
// Writes ./manifests.json. Rerun when the handoff file changes; the diff is the review.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRepoRoot } from '../../lib/context.mjs';
import { ROUTES } from './routes.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const BAND_WORDS = new Set(['IMMEDIATE', 'ACTION', 'MONITOR', 'AWARENESS']);

/** Minimal tag-stack parser: enough for one hand-authored, well-formed design file. */
function parse(html) {
  const root = { tag: 'root', style: '', id: '', children: [], text: '' };
  const stack = [root];
  const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'source']);
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[3] !== undefined) { stack[stack.length - 1].text += m[3]; continue; }
    const tag = m[1].toLowerCase();
    const isClose = m[0][1] === '/';
    if (isClose) {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    const attrs = m[2] || '';
    const style = (/style\s*=\s*"([^"]*)"/.exec(attrs) || [])[1] || '';
    const id = (/\bid\s*=\s*"([^"]*)"/.exec(attrs) || [])[1] || '';
    const node = { tag, style, id, children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push(node);
  }
  return root;
}

const findById = (n, id) => {
  if (n.id === id) return n;
  for (const c of n.children) { const r = findById(c, id); if (r) return r; }
  return null;
};

const isCard = (n) =>
  n.style.includes('border-radius:10px') &&
  n.style.includes('border:1px solid rgba(0,0,0,.12)') &&
  n.style.includes('background:#fff');

const clean = (s) => s.replace(/\s+/g, ' ').trim();

function firstDisplayRun(n) {
  const out = [];
  (function walk(x) {
    const t = clean(x.text);
    if (t && (x.style.includes('text-transform:uppercase') || x.style.includes('Anton'))) out.push(t);
    for (const c of x.children) walk(c);
  })(n);
  return out[0] || '';
}

function cardsIn(node) {
  const out = [];
  (function walk(x) {
    if (isCard(x)) { out.push(firstDisplayRun(x)); return; }
    for (const c of x.children) walk(c);
  })(node);
  return out;
}

/**
 * Derive the manifests from the artboards. Exported (lane layoutguard, 2026-09-08) so it is not a
 * write-once script: `manifests.mjs` calls it when `manifests.json` is absent, and
 * `layout-guard.test.mjs` calls it to assert that the CHECKED-IN manifests still match the
 * artboards - which is what keeps L10 measuring the design rather than a stale snapshot of it.
 */
export function generateManifests(repo = getRepoRoot()) {
  const html = readFileSync(join(repo, 'docs/design/handoff-2026-09-06/Caros Ledge UI System.dc.html'), 'utf8');
  const doc = parse(html);
  const manifests = {};
  for (const route of ROUTES) {
    const board = findById(doc, route.artboard);
    if (!board) { manifests[route.route] = { artboard: route.artboard, cards: [], rail: [], note: 'artboard not found' }; continue; }
    let frame = null;
    (function walk(x) {
      if (frame) return;
      if (x.style.includes('252px 1fr')) { frame = x; return; }
      for (const c of x.children) walk(c);
    })(board);
    if (!frame) {
      // Artboards 16/17 draw the AuthFrame identity split, not the nav+content frame.
      manifests[route.route] = { artboard: route.artboard, cards: [], rail: [], note: 'no nav+content frame in this artboard (auth/onboarding identity split)' };
      continue;
    }
    const content = frame.children[1];
    if (!content) {
      manifests[route.route] = { artboard: route.artboard, cards: [], rail: [], note: 'frame has no content column' };
      continue;
    }
    // Inside the content column the masthead is the first card and the two-column grid follows.
    let inner = null;
    (function walk(x) {
      if (inner || !x) return;
      if (x.style.includes('grid-template-columns:minmax(0,1fr) 300px')) { inner = x; return; }
      for (const c of x.children) walk(c);
    })(content);
    const railCards = inner && inner.children[1] ? cardsIn(inner.children[1]) : [];
    const all = cardsIn(content);
    const railSet = new Set(railCards);
    const cards = all.filter((c) => c && !BAND_WORDS.has(c.toUpperCase()) && !railSet.has(c));
    manifests[route.route] = {
      artboard: route.artboard,
      cards,
      rail: railCards.filter((c) => c && !BAND_WORDS.has(c.toUpperCase())),
    };
  }
  return manifests;
}

function main() {
  const manifests = generateManifests();
  const path = join(HERE, 'manifests.json');
  writeFileSync(path, `${JSON.stringify({ generatedFrom: 'docs/design/handoff-2026-09-06/Caros Ledge UI System.dc.html', generatedAt: new Date().toISOString().slice(0, 10), manifests }, null, 2)}\n`);
  for (const [route, mfst] of Object.entries(manifests)) {
    console.log(`${route.padEnd(28)} ${mfst.artboard.padEnd(4)} content ${String(mfst.cards.length).padStart(2)}  rail ${String(mfst.rail.length).padStart(2)}  ${mfst.cards.join(' | ')}`);
  }
  console.log(`\nwrote ${path}`);
}

if (process.argv[1] && process.argv[1].endsWith('generate-manifests.mjs')) main();
