// F13: THE SINGLE MINT CHOKEPOINT. Every INSERT into intelligence_items must go through
// mintIntelligenceItem() (src/lib/intake/mint-item.ts) — the one place source-role congruence (1a/1b),
// subject-existence dedup, and the Fork-4 relevance surface run. Any other runtime INSERT into
// intelligence_items bypasses the intake gate (the exact defect that let drain-first-fetch mint 38
// pre-gate polluters with neither congruence nor dedup). Mechanically enforces the phase-intake-gate
// "single chokepoint" claim as an INVARIANT, not an assertion.
//
// Governing: phase-intake-gate contract (docs/design/intake-gate-plan.md v2.2, dispatch §2).
//
// Scope: every JavaScript or TypeScript file under fsi-app/src and fsi-app/scripts (any of .ts .tsx .mjs .js
// .cjs .jsx), EXCLUDING the chokepoint itself and test files (__tests__/**, *.test.*). Lane GATE-8 (2026-10-08,
// AUD-AT-4 B1-18, B1-19) widened the scope from src/**/*.{ts,tsx,mjs}: a route.js, a .cjs helper or a script
// that mints through a direct insert bypasses the gate the same way a route.ts does.
//
// How it reads (lane GATE-8, AUD-AT-4 B1-13 to B1-17, B1-21): through ../lib/table-access.mjs, on the
// comment-and-string-lexed source. It finds each `.from(<table>)` call, resolves the argument against the
// file's own string constants (a template literal, a `const T = "intelligence_items"`, a name split over a
// `+`), and walks the whole method chain that follows, so an `.insert(` or `.upsert(` is seen however far down
// the chain it sits. A URL earlier on the line no longer hides the call, and an override marker inside a string
// is not a marker. Raw SQL `INSERT INTO intelligence_items` in a string is also a mint.
//
// Override: trailing `// fitness-allow: F13 (reason)` on the matching line.

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { overrideLines } from '../lib/code-scan.mjs';
import { tableWriteLines, rawSqlLines } from '../lib/table-access.mjs';

const CHOKEPOINT = 'fsi-app/src/lib/intake/mint-item.ts';
const TABLE = 'intelligence_items';

// Scripts that insert into intelligence_items on purpose, each with its reason. An adversarial audit ATTACKS the
// provenance guard (rule 15: a guard is proven by attack, not by presence): it issues the forbidden insert inside
// a transaction that is always rolled back and asserts the database refuses it. It mints nothing.
export const SANCTIONED_ADVERSARIAL_SCRIPTS = new Map([
  ['fsi-app/scripts/verify/prov-guard-adversarial-audit.mjs', 'migration 250 provenance-guard attack; every case runs in a transaction that is always rolled back'],
]);

export function isMintBypass(content) {
  const overridden = overrideLines(content, 'F13');
  const lines = new Set([...tableWriteLines(content, TABLE), ...rawSqlLines(content, 'INSERT\\s+INTO', TABLE)]);
  return [...lines].filter((ln) => !overridden.has(ln)).sort((a, b) => a - b);
}

export const fitnessFunction = {
  id: 'F13',
  name: 'single-mint-chokepoint',
  description: 'Every intelligence_items INSERT must go through mintIntelligenceItem() (src/lib/intake/mint-item.ts). Any other runtime INSERT bypasses the intake gate (congruence + dedup + relevance). Enforces the phase-intake-gate single-chokepoint invariant.',
  source: 'phase-intake-gate contract v2.2 (dispatch §2); the drain-first-fetch direct-mint bypass finding',

  enumerate() {
    return globFiles(['fsi-app/src/**/*.{ts,tsx,mjs,js,cjs,jsx}', 'fsi-app/scripts/**/*.{mjs,js,cjs,ts}']).filter(
      (p) =>
        p !== CHOKEPOINT &&
        !p.includes('/__tests__/') &&
        !/\.test\.(ts|tsx|mjs|js|cjs)$/.test(p)
    );
  },

  check(filepath, content) {
    if (filepath === CHOKEPOINT || SANCTIONED_ADVERSARIAL_SCRIPTS.has(filepath)) return PASS;
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
