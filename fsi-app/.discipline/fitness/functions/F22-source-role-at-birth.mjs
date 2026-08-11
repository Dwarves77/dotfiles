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
// Scope: fsi-app/src/**/*.{ts,tsx,mjs} + fsi-app/scripts/**/*.mjs, EXCLUDING the classifier itself
// and test files. Unlike F13, scripts are IN scope: scripts/lib/db.mjs registerSource is a live
// creation path, and one-shot scripts that already executed carry an explicit override.
//
// Override: trailing `// fitness-allow: F22 (reason)` on the matching line.

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

const CLASSIFIER = 'fsi-app/src/lib/sources/classify-source-role.ts';

// LEGACY ALLOWLIST — same idiom as F15's. These are one-shot region-population scripts that ALREADY
// RAN against the live DB; each is an execution record, not a live path. Wiring the classifier into
// them would change no data, and the rows they created are repaired by scripts/source-role-cleanup.mjs
// rather than by editing the record of what ran.
//
// This is deliberately a list, not a glob: a NEW script under scripts/ is still RED. It is also
// deliberately HERE rather than as trailing `fitness-allow` comments in the scripts themselves —
// adding those comments stages the files, which drags these pre-rule-015 scripts into the commit-time
// scope of rules 015/016 and fails them. Editing an already-executed script to satisfy a new gate is
// the wrong move twice over: it rewrites the record of what ran, and it trips two other rules.
export const LEGACY_ALLOWLIST = [
  { file: 'fsi-app/scripts/pr-a1-execute.mjs', reason: 'PR-A1 region population — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/pr-a2-execute.mjs', reason: 'PR-A2 region population — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/tier1-au-apac-execute.mjs', reason: 'Tier-1 AU/APAC population — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/tier1-ca-provinces-execute.mjs', reason: 'Tier-1 CA provinces — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/tier1-eu-southern-eastern-execute.mjs', reason: 'Tier-1 EU S/E — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/tier1-eu-western-nordic-execute.mjs', reason: 'Tier-1 EU W/Nordic — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/tier1-intl-cities-execute.mjs', reason: 'Tier-1 intl cities — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/tier1-uk-nations-execute.mjs', reason: 'Tier-1 UK nations — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/tier1-us-cities-execute.mjs', reason: 'Tier-1 US cities — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/tier1-us-dc-territories-execute.mjs', reason: 'Tier-1 US DC/territories — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/tier1-us-midwest-execute.mjs', reason: 'Tier-1 US midwest — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/tier1-us-northeast-execute.mjs', reason: 'Tier-1 US northeast — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/tier1-us-south-execute.mjs', reason: 'Tier-1 US south — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/tier1-us-west-execute.mjs', reason: 'Tier-1 US west — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/tier1-eu-2-clean-inserts-execute.mjs', reason: 'Tier-1 EU-2 clean inserts — executed once', reviewByPhase: 'never (execution record)' },
  { file: 'fsi-app/scripts/wave2-cleanup-execute.mjs', reason: 'Wave-2 cleanup — executed once', reviewByPhase: 'never (execution record)' },
];

const ALLOWLIST_FILES = new Set(LEGACY_ALLOWLIST.map((e) => e.file));

const FROM_SOURCES_RE = /\bfrom\(\s*["']sources["']\s*\)/;

// Line-anchored on `from("sources")`, flagging when `.insert(`/`.upsert(` appears in the same
// 4-line window (supabase-js allows the chained call to wrap). A `.update(` on the same anchor is
// NOT a creation and must not be flagged — the window stops at the next `.from(` so an unrelated
// insert on a DIFFERENT table further down the file cannot be attributed to this anchor. That exact
// false positive (a sources `.update(...)` followed by a source_trust_events `.insert(...)`) was
// produced by the first draft of this check.
export function isRolelessSourceInsert(content) {
  const lines = content.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const codePart = lines[i].split('//')[0];
    if (!FROM_SOURCES_RE.test(codePart)) continue;
    if (isOverridden(lines[i], 'F22')) continue;

    const raw = lines.slice(i, Math.min(lines.length, i + 4)).map((l) => l.split('//')[0]);
    // Truncate the window at a subsequent `.from(` so we never read into another table's call.
    let window = '';
    for (let j = 0; j < raw.length; j++) {
      const seg = j === 0 ? raw[j].slice(raw[j].search(FROM_SOURCES_RE)) : raw[j];
      const nextFrom = j === 0 ? -1 : seg.search(/\.from\(/);
      if (nextFrom !== -1) { window += seg.slice(0, nextFrom); break; }
      window += '\n' + seg;
    }
    if (!/\.(insert|upsert)\s*\(/.test(window)) continue;

    // The write is a creation. The enclosing file must reference the classifier — the row object is
    // frequently built above the call (a `newSource` literal, a spread of proposed_changes), so a
    // file-level reference is the honest granularity here rather than a same-window match.
    if (!content.includes('classifySourceRole')) hits.push(i + 1);
  }
  return hits;
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
      'fsi-app/src/**/*.{ts,tsx,mjs}',
      'fsi-app/scripts/**/*.mjs',
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
