// META-GATE: invariant coverage. This is the check the operator demanded — it fails the build when
// ANY skill invariant is neither mechanically enforced (with an enforcement that ACTUALLY EXISTS) nor
// explicitly exempted with a reason. It is the per-invariant measure of "wired", and it verifies
// itself against live code (no attestation): every enforcedBy token must resolve to a real artifact.
//
// Checks (all must pass):
//   1. ENFORCED-OR-EXEMPT: each invariant has either ≥1 resolving enforcedBy OR exempt.reason.
//      (An invariant with neither, or with exempt AND no reason, FAILS.)
//   2. ENFORCEMENT RESOLVES: every enforcedBy token points at a real rule/fitness/check/file/migration.
//   3. ANCHOR PRESENT: each invariant's anchor substring still exists in its skill file (catches an
//      invariant being edited out of the skill while staying "covered" here).
//   4. MARKER BASELINE: each skill's normative-marker line count == its baseline (catches a new/removed
//      normative statement that must be triaged into the registry).
//   5. NO ORPHAN MECHANISM: every rule/fitness/consistency check in the manifests is referenced by ≥1
//      invariant (catches a mechanism that exists but maps to no invariant — the inverse drift).
//   6. EVERY RULE HAS A FIRE-TEST: every rules/NNN-*.mjs has a sibling rules/NNN-*.test.mjs (so no
//      rule ships unexercised — the class that left 015-018 untested).
//
// NAMED RESIDUAL on check 6 (efficacy, not existence) — exempt-with-REVISIT, same category as SC-5:
//   Check 6 enforces a test EXISTS, NOT that it is NON-VACUOUS. A do-nothing `test('x', () => {})`
//   satisfies it while proving nothing. Non-vacuousness is currently PRACTICE (the break-it-confirm-RED
//   discipline used on every gate here), not itself a gate. The buildable-but-expensive mechanization is
//   MUTATION TESTING (mutate the rule, assert a test fails). Deferred for that cost. Do NOT read
//   "every rule ships with a fire-test" as "every rule is meaningfully tested" — it is the former only.
//
// The per-invariant logic (checks 1-3) is extracted into the pure, injectable auditInvariants() so the
// gate's OWN catching behaviour is proven by a committed NEGATIVE test (invariant-coverage.test.mjs):
// feed it an unwired invariant → it must report a problem. Without that, the gate could become a silent
// no-op and everything underneath would look "wired" falsely (the turtle-at-the-top).
//
// Exit 0 = wired. Exit 1 = at least one gap. Run: node fsi-app/.discipline/governance/invariant-coverage.mjs

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { INVARIANTS, SKILL_FILES, SKILL_MARKER_BASELINE, MARKER_SOURCE } from './invariants.mjs';
import { DOCTRINES } from './doctrine-register.mjs';
import { rules } from '../manifest.mjs';
import { fitnessFunctions } from '../fitness/manifest.mjs';
import { consistencyChecks } from '../consistency/manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');           // dotfiles repo root
const MIGRATIONS_DIR = join(REPO, 'fsi-app', 'supabase', 'migrations');

const ruleIds = new Set(rules.map((r) => r.id));
const fitnessIds = new Set(fitnessFunctions.map((f) => f.id));
const consistencyIds = new Set(consistencyChecks.map((c) => c.id));

function readRepoFile(rel) {
  try { return readFileSync(join(REPO, rel), 'utf8'); } catch { return null; }
}

// CI-FAITHFULNESS (class fix, 2026-06-12): CI runs the meta-gate on a fresh checkout = git-TRACKED files
// ONLY. The gate previously resolved enforcement files with existsSync/readdirSync over the WORKING TREE,
// so an UNTRACKED enforcement file (e.g. quarantine-disposition-audit.mjs after #132) passed locally but
// failed in CI — "CI-parity" was false by construction. Resolution now keys on the tracked set, so an
// untracked enforcement file fails the gate LOCALLY (caught at pre-push), making parity real.
let TRACKED = null; // null => git unavailable; fall back to disk existence (CI always has git)
try {
  TRACKED = new Set(execSync('git ls-files', { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean));
} catch { TRACKED = null; }
const isTracked = (rel) => (TRACKED ? TRACKED.has(rel.replace(/\\/g, '/')) : existsSync(join(REPO, rel)));

// migration files as CI sees them: tracked basenames under fsi-app/supabase/migrations/ (not readdir,
// which would include an untracked migration present only in the working tree).
let migrationFiles = [];
if (TRACKED) {
  const pfx = 'fsi-app/supabase/migrations/';
  migrationFiles = [...TRACKED].filter((p) => p.startsWith(pfx) && p.endsWith('.sql')).map((p) => p.slice(pfx.length));
} else {
  try { migrationFiles = readdirSync(MIGRATIONS_DIR); } catch { /* none */ }
}

// Resolve a single enforcedBy token. Returns { ok, detail }.
function resolveToken(tok) {
  const [type, ...rest] = tok.split(':');
  const locator = rest.join(':');
  switch (type) {
    case 'rule':
      return { ok: ruleIds.has(locator), detail: `rule ${locator} ${ruleIds.has(locator) ? 'in manifest' : 'NOT in manifest'}` };
    case 'fitness':
      return { ok: fitnessIds.has(locator), detail: `fitness ${locator} ${fitnessIds.has(locator) ? 'in fitness manifest' : 'NOT in fitness manifest'}` };
    case 'consistency':
      return { ok: consistencyIds.has(locator), detail: `consistency ${locator} ${consistencyIds.has(locator) ? 'registered' : 'NOT registered'}` };
    case 'audit': {
      if (!isTracked(locator)) return { ok: false, detail: `audit file NOT git-tracked (CI checkout cannot see it): ${locator}` };
      const content = readRepoFile(locator);
      if (content === null) return { ok: false, detail: `audit file missing: ${locator}` };
      if (!/GOVERNING/i.test(content)) return { ok: false, detail: `audit file lacks GOVERNING skill-cite: ${locator}` };
      return { ok: true, detail: `audit ${locator} tracked + skill-cited` };
    }
    case 'selftest': {
      const ok = isTracked(locator);
      return { ok, detail: `selftest ${locator} ${ok ? 'tracked' : 'NOT git-tracked (CI cannot see it)'}` };
    }
    case 'migration': {
      const re = new RegExp(`^0*${locator}_.*\\.sql$`);
      const hit = migrationFiles.find((f) => re.test(f) || f.startsWith(`${locator}_`));
      return { ok: Boolean(hit), detail: hit ? `migration ${hit}` : `migration ${locator}_*.sql MISSING` };
    }
    default:
      return { ok: false, detail: `unknown enforcedBy token type: ${tok}` };
  }
}

function countMarkers(content) {
  const re = new RegExp(MARKER_SOURCE);
  return content.split(/\r?\n/).filter((l) => re.test(l)).length;
}

// PURE per-invariant audit (checks 1-3), injectable so the gate's catching behaviour is
// negative-testable. `env.resolveToken(tok) -> {ok, detail}`, `env.getSkillContent(skill) -> string|null`.
// Returns { problems, referenced }. This is the load-bearing core the committed negative test exercises.
export function auditInvariants(invariants, env) {
  const problems = [];
  const referenced = { rule: new Set(), fitness: new Set(), consistency: new Set() };
  for (const inv of invariants) {
    const where = `${inv.id} (${inv.skill})`;
    const hasEnforced = Array.isArray(inv.enforcedBy) && inv.enforcedBy.length > 0;
    const hasExempt = inv.exempt && typeof inv.exempt.reason === 'string' && inv.exempt.reason.trim().length > 0;

    // 1: exactly one of enforced / exempt; both is contradictory; neither is the forbidden honor-system.
    if (!hasEnforced && !hasExempt) {
      problems.push(`UNWIRED: ${where} has neither enforcedBy nor exempt.reason — this is the silent honor-system the gate forbids.`);
    }
    if (hasEnforced && hasExempt) {
      problems.push(`CONTRADICTORY: ${where} is both enforced and exempt — pick one.`);
    }
    if (inv.exempt && !hasExempt) {
      problems.push(`EMPTY-EXEMPTION: ${where} has exempt without a non-empty reason.`);
    }

    // 2: every enforcedBy token must resolve to a real artifact.
    if (hasEnforced) {
      for (const tok of inv.enforcedBy) {
        const r = env.resolveToken(tok);
        if (!r.ok) problems.push(`UNRESOLVED ENFORCEMENT: ${where} → ${tok} (${r.detail})`);
        const [t, ...rest] = tok.split(':');
        if (t === 'rule') referenced.rule.add(rest.join(':'));
        if (t === 'fitness') referenced.fitness.add(rest.join(':'));
        if (t === 'consistency') referenced.consistency.add(rest.join(':'));
      }
    }

    // 3: anchor present in skill file.
    const content = env.getSkillContent(inv.skill);
    if (content == null) {
      problems.push(`NO SKILL CONTENT for ${where} (cannot verify anchor)`);
    } else if (!inv.anchor || !content.includes(inv.anchor)) {
      problems.push(`ANCHOR DRIFT: ${where} anchor not found in skill: ${JSON.stringify(inv.anchor)}`);
    }
  }
  return { problems, referenced };
}

// PURE doctrine-register audit (the "UNENFORCED DOCTRINE = FAIL" core), injectable + negative-testable.
// A doctrine is legitimate iff EITHER it is enforced by ≥1 invariant that EXISTS and is ITSELF enforced
// (not exempt — a doctrine cannot inherit enforcement from an exempt invariant), XOR it is exempt with a
// non-empty reason. A doctrine mapping to a missing invariant, to an exempt invariant, or to nothing —
// the doctrine-register bugs this unit exists to surface — FAILS. `conflicts` IDs must resolve to a real
// doctrine (the conflict-ledger integrity check). env.enforcedInvariantIds / env.allInvariantIds /
// env.doctrineIds are Sets.
export function auditDoctrines(doctrines, env) {
  const problems = [];
  for (const d of doctrines) {
    const where = `doctrine ${d.id}`;
    const hasEnforced = Array.isArray(d.enforcedBy) && d.enforcedBy.length > 0;
    const hasExempt = d.exempt && typeof d.exempt.reason === 'string' && d.exempt.reason.trim().length > 0;

    if (!hasEnforced && !hasExempt) {
      problems.push(`UNENFORCED DOCTRINE: ${where} maps to no invariant and is not exempt-with-reason — this is the silent-listing the register forbids (wire it or exempt-with-reason).`);
    }
    if (hasEnforced && hasExempt) {
      problems.push(`CONTRADICTORY DOCTRINE: ${where} is both enforced and exempt — pick one.`);
    }
    if (d.exempt && !hasExempt) {
      problems.push(`EMPTY-EXEMPTION: ${where} has exempt without a non-empty reason.`);
    }
    if (hasEnforced) {
      for (const invId of d.enforcedBy) {
        if (!env.allInvariantIds.has(invId)) {
          problems.push(`UNKNOWN INVARIANT: ${where} → ${invId} is not a registered invariant id.`);
        } else if (!env.enforcedInvariantIds.has(invId)) {
          problems.push(`DOCTRINE ENFORCED BY EXEMPT INVARIANT: ${where} → ${invId} is itself EXEMPT (not mechanically enforced) — the doctrine has no live mechanism through it.`);
        }
      }
    }
    if (Array.isArray(d.conflicts)) {
      for (const cid of d.conflicts) {
        if (!env.doctrineIds.has(cid)) problems.push(`DANGLING CONFLICT: ${where} references conflict '${cid}' that is not a registered doctrine id.`);
      }
    }
  }
  return { problems };
}

export function runInvariantCoverage() {
  // Pre-read skill files once.
  const skillContent = {};
  const preProblems = [];
  for (const [skill, rel] of Object.entries(SKILL_FILES)) {
    const c = readRepoFile(rel);
    if (c === null) preProblems.push(`SKILL FILE MISSING: ${skill} → ${rel}`);
    skillContent[skill] = c;
  }

  // Checks 1-3 via the pure core (real resolvers + skill content).
  const { problems: invProblems, referenced } = auditInvariants(INVARIANTS, {
    resolveToken,
    getSkillContent: (s) => skillContent[s],
  });
  const problems = [...preProblems, ...invProblems];

  // 4: marker baselines.
  for (const [skill, rel] of Object.entries(SKILL_FILES)) {
    const content = skillContent[skill];
    if (content == null) continue;
    const actual = countMarkers(content);
    const baseline = SKILL_MARKER_BASELINE[skill];
    if (baseline === undefined) {
      problems.push(`NO BASELINE: ${skill} has no marker baseline (set SKILL_MARKER_BASELINE.${skill} = ${actual}).`);
    } else if (actual !== baseline) {
      problems.push(`MARKER DRIFT: ${skill} normative-marker count ${actual} != baseline ${baseline} — a normative statement changed; triage into INVARIANTS then re-baseline to ${actual}.`);
    }
  }

  // 5: no orphan mechanism (every rule/fitness/consistency mapped by ≥1 invariant).
  for (const id of ruleIds) if (!referenced.rule.has(id)) problems.push(`ORPHAN MECHANISM: rule ${id} is in the manifest but no invariant references it (map it or remove it).`);
  for (const id of fitnessIds) if (!referenced.fitness.has(id)) problems.push(`ORPHAN MECHANISM: fitness ${id} exists but no invariant references it.`);
  for (const id of consistencyIds) if (!referenced.consistency.has(id)) problems.push(`ORPHAN MECHANISM: consistency ${id} exists but no invariant references it.`);

  // 6: every rule ships with a committed fire-test (the "everything built is wired" floor for rules —
  // the class that left 015-018 untested). For each rules/NNN-*.mjs there must be a sibling .test.mjs.
  try {
    const rulesDir = join(REPO, 'fsi-app', '.discipline', 'rules');
    const files = readdirSync(rulesDir);
    const impls = files.filter((f) => /\.mjs$/.test(f) && !/\.test\.mjs$/.test(f));
    for (const impl of impls) {
      const testName = impl.replace(/\.mjs$/, '.test.mjs');
      if (!files.includes(testName)) problems.push(`RULE WITHOUT FIRE-TEST: rules/${impl} has no committed ${testName} (every rule must be exercised by node --test).`);
    }
  } catch { problems.push('RULE TEST SCAN FAILED: cannot read rules dir.'); }

  // DOCTRINE REGISTER (Disposition Engine Unit 0): unenforced doctrine = FAIL. A doctrine's enforcedBy
  // must point at an invariant that EXISTS and is itself ENFORCED (not exempt).
  const enforcedInvariantIds = new Set(
    INVARIANTS.filter((i) => Array.isArray(i.enforcedBy) && i.enforcedBy.length && !i.exempt).map((i) => i.id)
  );
  const allInvariantIds = new Set(INVARIANTS.map((i) => i.id));
  const doctrineIds = new Set(DOCTRINES.map((d) => d.id));
  const { problems: docProblems } = auditDoctrines(DOCTRINES, { enforcedInvariantIds, allInvariantIds, doctrineIds });
  problems.push(...docProblems);

  const enforced = INVARIANTS.filter((i) => Array.isArray(i.enforcedBy) && i.enforcedBy.length).length;
  const exempt = INVARIANTS.filter((i) => i.exempt && i.exempt.reason).length;
  const docEnforced = DOCTRINES.filter((d) => Array.isArray(d.enforcedBy) && d.enforcedBy.length).length;
  const docExempt = DOCTRINES.filter((d) => d.exempt && d.exempt.reason).length;
  return {
    ok: problems.length === 0,
    problems,
    summary: {
      invariants: INVARIANTS.length, enforced, exempt, skills: Object.keys(SKILL_FILES).length,
      doctrines: DOCTRINES.length, docEnforced, docExempt,
    },
  };
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('invariant-coverage.mjs')) {
  const { ok, problems, summary } = runInvariantCoverage();
  console.log(`\n===== INVARIANT COVERAGE (meta-gate) =====`);
  console.log(`skills: ${summary.skills}  invariants: ${summary.invariants}  |  ENFORCED ${summary.enforced}  EXEMPT ${summary.exempt}`);
  console.log(`doctrine register: ${summary.doctrines}  |  ENFORCED ${summary.docEnforced}  EXEMPT ${summary.docExempt}  (unenforced doctrine = FAIL)`);
  if (ok) {
    console.log(`\nALL ${summary.invariants} invariants + ${summary.doctrines} doctrines are wired: each is enforced by a resolving mechanism OR exempt-with-reason; every enforcement exists; every anchor present; marker baselines hold; no orphan mechanisms.`);
    console.log(`=== meta-gate PASS ===`);
    process.exit(0);
  }
  console.error(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`\n=== meta-gate FAIL ===`);
  process.exit(1);
}
