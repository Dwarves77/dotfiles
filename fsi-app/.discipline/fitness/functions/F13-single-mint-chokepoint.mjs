// F13: THE SINGLE MINT CHOKEPOINT. Every INSERT into intelligence_items must go through
// mintIntelligenceItem() (src/lib/intake/mint-item.ts) — the one place source-role congruence (1a/1b),
// subject-existence dedup, and the Fork-4 relevance surface run. Any other runtime INSERT into
// intelligence_items bypasses the intake gate (the exact defect that let drain-first-fetch mint 38
// pre-gate polluters with neither congruence nor dedup). Mechanically enforces the phase-intake-gate
// "single chokepoint" claim as an INVARIANT, not an assertion.
//
// Governing: phase-intake-gate contract (docs/design/intake-gate-plan.md v2.2, dispatch §2).
//
// Scope: fsi-app/src/**/*.{ts,tsx,mjs}, EXCLUDING the chokepoint itself and test files
// (__tests__/**, *.test.*). Scripts (fsi-app/scripts/**) are one-shot tools, out of runtime scope.
//
// Override: trailing `// fitness-allow: F13 (reason)` on the matching line.

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

const CHOKEPOINT = 'fsi-app/src/lib/intake/mint-item.ts';

// The scan is line-anchored on `from("intelligence_items")`; an INSERT is flagged when `.insert(`
// appears on the same line or within the next 3 lines (supabase-js allows the chained call to wrap).
const FROM_ITEMS_RE = /\bfrom\(\s*["']intelligence_items["']\s*\)/;

export function isMintBypass(content) {
  const lines = content.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const codePart = lines[i].split('//')[0];
    if (!FROM_ITEMS_RE.test(codePart)) continue;
    if (isOverridden(lines[i], 'F13')) continue;
    const window = lines.slice(i, Math.min(lines.length, i + 4)).map((l) => l.split('//')[0]).join('\n');
    if (/\.insert\s*\(/.test(window)) hits.push(i + 1);
  }
  return hits;
}

export const fitnessFunction = {
  id: 'F13',
  name: 'single-mint-chokepoint',
  description: 'Every intelligence_items INSERT must go through mintIntelligenceItem() (src/lib/intake/mint-item.ts). Any other runtime INSERT bypasses the intake gate (congruence + dedup + relevance). Enforces the phase-intake-gate single-chokepoint invariant.',
  source: 'phase-intake-gate contract v2.2 (dispatch §2); the drain-first-fetch direct-mint bypass finding',

  enumerate() {
    return globFiles(['fsi-app/src/**/*.{ts,tsx,mjs}']).filter(
      (p) =>
        p !== CHOKEPOINT &&
        !p.includes('/__tests__/') &&
        !/\.test\.(ts|tsx|mjs)$/.test(p)
    );
  },

  check(filepath, content) {
    if (filepath === CHOKEPOINT) return PASS;
    const hits = isMintBypass(content);
    if (hits.length === 0) return PASS;
    return hits.map((line) =>
      violation(
        line,
        `INSERT into intelligence_items outside the mint chokepoint. Route this mint through mintIntelligenceItem() (src/lib/intake/mint-item.ts) so congruence (1a/1b) + subject-existence dedup + the Fork-4 relevance surface run — a direct INSERT bypasses the intake gate. Override: trailing \`// fitness-allow: F13 (reason)\`. Governing: phase-intake-gate.`,
      )
    );
  },
};
