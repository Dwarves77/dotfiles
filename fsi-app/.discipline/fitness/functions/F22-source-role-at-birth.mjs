// F22: SOURCE ROLE AT BIRTH. Every INSERT/UPSERT into `sources` must set source_role on the row it
// writes — via classifySourceRole(name, url) (src/lib/sources/classify-source-role.ts), whose own
// header states the contract: "a source is never created with a NULL role + placeholder content-type".
//
// That contract was enforced NOWHERE. It held for the three admin onboarding routes by convention
// only, and was FALSE for every automated creation path: the intake mint chokepoint
// (apply-staged-update.ts `new_source`, reached by runIntakeCycle + portalHarvest), the W2.F
// auto-approval pipeline (verification.ts), the citation auto-surfacer (source-growth.ts), and the
// guarded script helper (scripts/lib/db.mjs registerSource). Measured 2026-08-11: 1,719 of 2,549
// registry rows carried source_role IS NULL, and a triage then read "no role" as evidence of
// inertness and demoted 869 live sources — the US SEC, eCFR, ESMA, NYS DEC, China's MEE, Australia's
// Clean Energy Regulator — to `provisional`, which is gated out of every scrape/AI/index job.
//
// A NULL role is not a cosmetic gap. It is read downstream as worthlessness, so the classifier must
// run at the point of INSERT, not in a later backfill that may never be run.
//
// Governing: classify-source-role.ts's stated onboarding contract; source-credibility-model (§1/§5
// registration). Same shape as F13 (single-mint-chokepoint) one table over: F13 makes the mint gate
// an invariant for intelligence_items, F22 makes role-at-birth an invariant for sources.
//
// Scope: fsi-app/src (ts tsx mjs js cjs jsx) + fsi-app/scripts (mjs js cjs ts), EXCLUDING the classifier itself
// and test files. Unlike F13, scripts are IN scope: scripts/lib/db.mjs registerSource is a live
// creation path, and one-shot scripts that already executed carry an explicit override.
//
// Override: trailing `// fitness-allow: F22 (reason)` on the matching line.

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { overrideLines, hasCodeIdentifier } from '../lib/code-scan.mjs';
import { tableWriteLines, rawSqlLines } from '../lib/table-access.mjs';

const CLASSIFIER = 'fsi-app/src/lib/sources/classify-source-role.ts';

// LEGACY ALLOWLIST — same idiom as F15's: a list, not a glob, each entry reason-bearing +
// reviewByPhase-tagged, shrinking to empty. These 16 already-executed one-shot region-population
// scripts ALSO carry zero inbound references (wiring census 2026-08-11) and are enumerated for removal
// in docs/audits/dead-code-manifest-2026-08-11.txt; the sweep PR deletes the files and empties this
// list together. Wiring the classifier into them would change no data — they ran once against the live
// DB and the rows they created are repaired by scripts/source-role-cleanup.mjs. A NEW roleless sources
// INSERT anywhere under src/ or scripts/ is RED.
export const LEGACY_ALLOWLIST = [
];

const ALLOWLIST_FILES = new Set(LEGACY_ALLOWLIST.map((e) => e.file));

// Reads the call as a call (lane GATE-8, 2026-10-08, AUD-AT-4 B2-33 to B2-39): ../lib/table-access.mjs finds each
// `.from(<table>)` whose argument is the literal "sources", a template literal, or a file constant, and walks the
// whole method chain, so an `.insert(` or `.upsert(` is seen however far down it sits and however the call is
// wrapped. A `.update(` on the same anchor is NOT a creation, and an insert on a DIFFERENT table is a different
// chain (the first draft's false positive: a sources update followed by a source_trust_events insert). Raw SQL
// `INSERT INTO sources` in a string is a creation too. The enclosing file must reference the classifier IN CODE:
// a comment or a string that names classifySourceRole is not a classification (B2-33, B2-34). The file-level
// reference is the honest granularity because the row object is frequently built above the call.
export function isRolelessSourceInsert(content) {
  const overridden = overrideLines(content, 'F22');
  const lines = new Set([...tableWriteLines(content, 'sources'), ...rawSqlLines(content, 'INSERT\\s+INTO', 'sources')]);
  if (lines.size === 0) return [];
  if (hasCodeIdentifier(content, 'classifySourceRole')) return [];
  return [...lines].filter((ln) => !overridden.has(ln)).sort((a, b) => a - b);
}

export const fitnessFunction = {
  id: 'F22',
  name: 'source-role-at-birth',
  description:
    'Every sources INSERT/UPSERT must set source_role via classifySourceRole(name, url) at the point of creation. A row born with a NULL role is read downstream as "no role" and then as inert — the defect that demoted 869 live regulators to provisional. Enforces classify-source-role.ts\'s own stated onboarding contract.',
  source:
    "classify-source-role.ts onboarding contract; source-credibility-model §1/§5 registration; the 2026-08-11 wiring audit (1,719 of 2,549 rows born role-less)",

  enumerate() {
    return globFiles([
      'fsi-app/src/**/*.{ts,tsx,mjs,js,cjs,jsx}',
      'fsi-app/scripts/**/*.{mjs,js,cjs,ts}',
    ]).filter(
      (p) =>
        p !== CLASSIFIER &&
        !p.includes('/__tests__/') &&
        !/\.(test|selftest|npmtest)\.(ts|tsx|mjs)$/.test(p)
    );
  },

  check(filepath, content) {
    if (filepath === CLASSIFIER) return PASS;
    if (ALLOWLIST_FILES.has(filepath)) return PASS;
    const hits = isRolelessSourceInsert(content);
    if (hits.length === 0) return PASS;
    return hits.map((line) =>
      violation(
        line,
        `INSERT/UPSERT into sources without classifying source_role at birth. Set \`source_role: <explicit> ?? classifySourceRole(name, url)\` on the inserted row (src/lib/sources/classify-source-role.ts) — deterministic, name+URL only, no fetch, no LLM, and null stays null when genuinely undeterminable. A row born with a NULL role is read downstream as "no role" and then as inert. Override: trailing \`// fitness-allow: F22 (reason)\`. Governing: classify-source-role onboarding contract.`,
      )
    );
  },
};
