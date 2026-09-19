// INVARIANT REGISTRY — the per-INVARIANT enforcement map for all 6 platform skills.
//
// WHY THIS EXISTS (the "why wasn't this wired" answer, encoded): "wired" was previously measured
// per-SKILL ("a fitness function references this skill") instead of per-INVARIANT. A skill is a SET
// of invariants; wiring one (e.g. F10's syndication math) left the others honor-system — which is how
// the source-registration invariant (source-not-item → registered, never archived) slipped, producing
// 25 orphaned archives. This registry measures wiring per invariant.
//
// THE STANDARD (enforced by invariant-coverage.mjs, the meta-gate):
//   Every invariant is EITHER
//     (E) enforced  — `enforcedBy` lists ≥1 mechanism that RESOLVES to a real artifact, OR
//     (X) exempt    — `exempt.reason` states why it is NOT mechanically enforceable.
//   "Buildable but unbuilt" is NOT a valid exemption. Exemption is only for genuinely
//   non-mechanizable invariants (semantic generation properties, design judgment, process, or
//   signals too ambiguous for a low-false-positive gate). Each exemption names WHY.
//   `residual` (on enforced entries) names honestly what the mechanism does NOT cover (proxies).
//
// STANDING EXEMPTION-PROCESS RULE (2026-06-06 audit): before exempting an invariant as
// "weak-signal" or "non-mechanizable", you MUST check whether a DIFFERENT formulation is cleanly
// mechanizable — first-check-noisy does not mean none exists. Examples from the audit:
//   - a CEILING ("at most one") is often zero-false-positive where a FLOOR ("at least one") is noisy
//     (but VERIFY against live data — EP-7's ceiling was disproven: 224/361 briefs validly carry 2+);
//   - a branded TYPE makes a literal-scan-noisy invariant clean (SC-5 → mechanizable-via-refactor);
//   - a FK / table separation makes a "re-derived?" invariant structural (SC-4 → enforced);
//   - pgTAP makes a SQL-layer invariant testable (SC-3 SQL half → deferred-infra, named residual).
// If the cleaner formulation needs a refactor/infra you are NOT building now, the entry is
// "mechanizable-via-X, deferred for cost, REVISIT" — that is a NAMED-RESIDUAL, distinct from a true
// non-mechanizable exemption. Do not let deferred-for-cost masquerade as non-mechanizable.
//
// enforcedBy tokens (resolved by the meta-gate against live code/migrations):
//   rule:NNN          → a rule id present in ../manifest.mjs
//   fitness:FN        → a fitness id present in ../fitness/manifest.mjs
//   consistency:CN    → a check id present in ../consistency/manifest.mjs
//   audit:<path>      → a read-only verifier file that exists AND contains a GOVERNING skill-cite
//   selftest:<path>   → a *.selftest.mjs / *.test.mjs file that exists
//   migration:NNN     → a supabase/migrations/NNN_*.sql file that exists
//
// COMPLETENESS (also enforced by the meta-gate): each invariant carries an `anchor` (verbatim
// substring that MUST still be present in its skill file — catches an invariant being edited out),
// and each skill carries a normative-marker COUNT BASELINE (the gate fails if the marker count
// changes, forcing any new/removed normative statement to be triaged into this registry).

export const SKILL_FILES = {
  'environmental-policy-and-innovation': 'fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md',
  'source-credibility-model': 'fsi-app/.claude/skills/source-credibility-model/SKILL.md',
  'analysis-construction-spec': 'fsi-app/.claude/skills/analysis-construction-spec/SKILL.md',
  'caros-ledge-platform-intent': 'fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md',
  'remediation-discipline': 'fsi-app/.claude/skills/remediation-discipline/SKILL.md',
  'sprint-followups-discipline': 'fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md',
  // 7th governing skill, added 2026-08-10 (U8, skill↔code drift gate closure): the standalone,
  // operator-side copy of the five-surface-test rule. It was cited throughout doctrine-register.mjs
  // (the every-decline-names-the-five-contracts residual: "The five contracts also live verbatim in
  // caros-ledge-platform-intent... and the standalone caros-ledge-surface-contracts skill") and in
  // skill-map.mjs's design-constraints comment ("Every skill is linked to an automatic trigger"), but
  // was ABSENT from this map — meaning this file had ZERO marker-baseline / anchor-drift protection.
  // A silent edit here (e.g. weakening "MUST record a five-surface test" to "should") would have gone
  // undetected by the meta-gate even though the identical content in caros-ledge-platform-intent is
  // drift-guarded via PI-5. See SCS-1 below.
  'caros-ledge-surface-contracts': 'fsi-app/.claude/skills/caros-ledge-surface-contracts/SKILL.md',
};

// The exact normative-marker pattern (case-sensitive, matches rg default). The meta-gate counts
// lines-with-a-match per skill and compares HEAD's count to the SAME count on the merge-base tree with
// origin/master (plan 6.8, Rule B, lane N4, 2026-09-19: the SKILL_MARKER_BASELINE constant that used to
// live here is deleted -- two lanes triaging the same skill file each wrote a correct re-seeded value and
// collided on the line, Cause B, plan 6.8). A REMOVED normative statement drops the count below the
// merge-base's and fails; an ADDED one is fine and needs no gate here (it gets triaged into this registry
// on its own). See invariant-coverage.mjs's auditMarkerBaselines() and its caller for the comparison.
export const MARKER_SOURCE =
  'mandatory|never violated|non-negotiable|Non-negotiable|MUST NOT|DO NOT|No invented|forbidden|never, never|binding|MUST';

// ───────────────────────── INVARIANTS, derived (plan 6.8, Rule A, lane N5) ─────────────────────────
// The 1,500+-line array literal that used to live here is now one file per invariant under
// invariants.d/ (see invariants.d/README.md). This loader reads that directory, imports every file,
// validates it, and sorts the result by id with a natural number sort (RD-2 before RD-10) so file order
// on disk never matters and two lanes adding an invariant each add one file, never one shared-array
// append (the Cause A class plan 6.8 removes). Top-level await is used deliberately: every existing
// consumer reaches INVARIANTS through a static `import … from './invariants.mjs'`, and Node's ESM
// loader awaits a module's own top-level await before resolving that import, so this stays a plain
// synchronous-looking named export to every caller.

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const INVARIANTS_DIR_URL = new URL('./invariants.d/', import.meta.url);

// Natural sort: split each id into digit-runs and non-digit-runs, compare digit-runs numerically so
// 'RD-2' sorts before 'RD-10' (a plain string compare would put 'RD-10' first).
export function compareInvariantIds(a, b) {
  const toChunks = (s) => s.match(/\d+|\D+/g) ?? [];
  const ac = toChunks(a);
  const bc = toChunks(b);
  const len = Math.max(ac.length, bc.length);
  for (let i = 0; i < len; i++) {
    const x = ac[i] ?? '';
    const y = bc[i] ?? '';
    if (x === y) continue;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
      continue;
    }
    return x < y ? -1 : 1;
  }
  return 0;
}

export async function loadInvariantsFromDir(dirUrl = INVARIANTS_DIR_URL) {
  const dirPath = fileURLToPath(dirUrl);
  const files = readdirSync(dirPath).filter((f) => f.endsWith('.mjs')).sort();
  const byId = new Map();
  for (const file of files) {
    const stem = file.slice(0, -'.mjs'.length);
    const mod = await import(new URL(file, dirUrl).href);
    if (!mod.invariant || typeof mod.invariant !== 'object') {
      throw new Error(`invariants.d/${file} must export \`invariant\` as an object.`);
    }
    const inv = mod.invariant;
    if (inv.id !== stem) {
      throw new Error(`invariants.d/${file}: invariant.id ('${inv.id}') does not match its filename stem ('${stem}').`);
    }
    if (byId.has(inv.id)) {
      throw new Error(`invariants.d: duplicate invariant id '${inv.id}' (${byId.get(inv.id).__file} and ${file}).`);
    }
    if ('enforcedBy' in inv && !Array.isArray(inv.enforcedBy)) {
      throw new Error(`invariants.d/${file}: enforcedBy must be an array when present.`);
    }
    byId.set(inv.id, { inv, __file: file });
  }
  return [...byId.keys()]
    .sort(compareInvariantIds)
    .map((id) => byId.get(id).inv);
}

export const INVARIANTS = await loadInvariantsFromDir();
