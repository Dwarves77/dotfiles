// F51: no-shared-append (lane N6, 2026-09-19, plan section 6.8, "the gate that holds the line").
// Category 48, invariant RD-75.
//
// WHY THIS EXISTS. Plan 6.8 named two structural causes of the six merge-train stops on 2026-09-18: Cause
// A, a hand-edited append list (a registry that is one shared file two lanes both edit at the SAME line),
// and Cause B, a stored value that is a pure function of the tree (a ceiling or a hash pin two lanes each
// compute correctly and then collide on, because a machine re-stamping it afterwards is a proof by
// presence, not by acknowledgment, standing rule 15). Lanes N0 to N5 removed every occurrence of both
// causes this build knew about (the fitness manifest, the harness family lists, the pending-run marker,
// F45's ceiling, the skill-manifest pins, the invariant registry). This function is what stops either
// cause from growing BACK: it does not fix anything itself, it holds the line four different ways.
//
// FOUR CHECKS, each proven by attack in the sibling .test.mjs (rule 15: a guard is proven by attack, not
// by presence).
//   1. NO HAND ENTRY reappears in a file N0-N5 converted to a derived directory read (Cause A, back).
//   2. NO STORED MEASUREMENT (a nonzero `_CEILING` constant, or a hash-pin literal) reappears in a fitness
//      function (Cause B, back). The two committed constant-ZERO ceilings (F46, F47) are a strict rule,
//      not a measurement, and are named in a small dated allowlist, never silently exempted by the zero
//      value alone.
//   3. IDS ARE UNIQUE across every entry-file category (fitness functions, invariants, harness families,
//      migrations): a true collision is an honest add/add conflict on one filename for three of the four
//      categories, but nothing stopped two DIFFERENT numbered migration files from sharing one leading
//      number, so this check still earns its place there.
//   4. A `lane/` BRANCH NEVER TOUCHES a coordinator-only file (the lane contract already said so in prose;
//      nothing enforced it).
//   (Check 5, the hotspot / concurrency check, was DELETED by lane GATE-3, 2026-10-08. Evidence
//   [CONFIRMED, gate evaluation B, `git merge-tree` dry merge of each PR head into origin/master at the run
//   time]: all 14 of its CI firings in 30 days were PROCESS, git merged every one of those branches cleanly,
//   and the correct change was unchanged by the re-cut. The only thing it added over git's own merge was
//   the refusal itself. HOTSPOT_ALLOWLIST, the 30-commit window, its anchor commit and the fork-point
//   classifier went with it, and so did the generated-files registry (`governance/generated-files.mjs`), whose
//   only consumer was check 5.)
//
// SCOPE, HONESTLY. Checks 1-3 are static/textual scans of specific, named files -- they are pattern
// checks against the shapes Cause A and Cause B actually took, not a general ban on the identifiers
// `_CEILING` or `id:` anywhere in the tree. Check 4 is a git-range read through the same discipline
// `change-range.mjs` (lane N0) established: an argument array, never a shell string, and a resolved
// repository top level, never a raw `process.cwd()`.
//
// node: builtins plus the repo's own fitness/governance/harness-runs helpers only (loaded by the no-npm
// discipline test glob via run-test-suite.sh's existing `fitness/functions/*.test.mjs` line).

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { resolveRange, gitChangedFiles } from '../../lib/change-range.mjs';
import { FAMILIES } from '../../../scripts/harness-runs/family-registry.mjs';

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 1: converted files stay derived (Cause A, back). Pure: takes [{ path, text }], never touches fs.
// Patterns match Amendment 1 item 3's own reading of the current shape of each file:
//   - manifest.mjs:        `import { fitnessFunction as F` line, OR an array literal of `F<n>` identifiers
//   - governing-files.mjs / run-artifact.mjs: a family name used as a hand object-literal key
//     (`mint: [...]`), or a hand array literal naming a family outside `FAMILIES.map(...)`
//   - invariants.mjs:      an `id: '...'` entry (the array-literal element shape the split replaced)
//   - loop-manifest.mjs:   a hand-written `LOOP_HOPS = [` array literal (not the `loadLoopHops(...)` derived
//     read), or a hand hop `id: '...'` entry (the loop-hops.d/*.json split, lane R7m, replaced)
//   - src/app/admin/parts/page.tsx: a hand-written `PARTS: PartEntry[] = [` array literal (not the
//     `loadPartEntries(...)` derived read, src/lib/admin/parts-registry.ts), or a hand `slug: '...'`
//     entry (the src/app/admin/parts/<slug>/part.json split, lane W10-ListRow-2, replaced)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
export function scanHandEntries(files, { familyNames = [] } = {}) {
  const out = [];
  for (const { path, text } of files) {
    const p = String(path).replace(/\\/g, '/');
    const isManifest = p.endsWith('/fitness/manifest.mjs') || p === 'fsi-app/.discipline/fitness/manifest.mjs';
    const isGoverningFilesOrRunArtifact =
      p.endsWith('/harness-runs/governing-files.mjs') || p.endsWith('/scripts/lib/run-artifact.mjs') ||
      p === 'fsi-app/scripts/harness-runs/governing-files.mjs' || p === 'fsi-app/scripts/lib/run-artifact.mjs';
    const isInvariants = p.endsWith('/governance/invariants.mjs') || p === 'fsi-app/.discipline/governance/invariants.mjs';
    const isLoopManifest = p.endsWith('/governance/loop-manifest.mjs') || p === 'fsi-app/.discipline/governance/loop-manifest.mjs';
    const isAdminPartsPage = p.endsWith('/app/admin/parts/page.tsx') || p === 'fsi-app/src/app/admin/parts/page.tsx';
    if (!isManifest && !isGoverningFilesOrRunArtifact && !isInvariants && !isLoopManifest && !isAdminPartsPage) continue;

    const lines = String(text ?? '').split(/\r?\n/);
    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      if (isManifest) {
        if (/import\s*\{\s*fitnessFunction\s+as\s+F\d*/.test(line)) {
          out.push({
            path: p, line: lineNo,
            message: `hand-written "import { fitnessFunction as F..." line reappeared in the fitness manifest (Rule A, Cause A): "${line.trim()}". fitnessFunctions is derived from functions/F*.mjs by directory scan; add a new function file under functions/ instead of importing it here.`,
          });
        }
        if (/=\s*\[\s*F\d+\b/.test(line)) {
          out.push({
            path: p, line: lineNo,
            message: `hand-written array literal of fitness-function identifiers reappeared in the fitness manifest (Rule A, Cause A): "${line.trim()}". fitnessFunctions is derived, never a hand-listed array.`,
          });
        }
      }
      if (isGoverningFilesOrRunArtifact) {
        for (const fam of familyNames) {
          const keyRe = new RegExp(`^\\s*['"]?${escapeRegex(fam)}['"]?\\s*:\\s*[\\[{]`);
          if (keyRe.test(line)) {
            out.push({
              path: p, line: lineNo,
              message: `hand object-literal entry for family "${fam}" reappeared outside the FAMILIES derivation (Rule A, Cause A): "${line.trim()}". Register the family in scripts/harness-runs/<family>/family.json instead of a hand-maintained key here.`,
            });
          }
          const arrLitRe = new RegExp(`=\\s*\\[[^\\]]*['"]${escapeRegex(fam)}['"]`);
          if (arrLitRe.test(line) && !/\.map\(/.test(line)) {
            out.push({
              path: p, line: lineNo,
              message: `hand array literal names family "${fam}" outside "FAMILIES.map(...)" (Rule A, Cause A): "${line.trim()}".`,
            });
          }
        }
      }
      if (isInvariants) {
        if (/^\s*id:\s*['"][A-Za-z]+-\d+['"]/.test(line)) {
          out.push({
            path: p, line: lineNo,
            message: `hand-written invariant "id:" entry reappeared in invariants.mjs (Rule A, Cause A): "${line.trim()}". Invariants are one file per id under invariants.d/; add a new file there, see invariants.d/README.md.`,
          });
        }
      }
      if (isLoopManifest) {
        if (/LOOP_HOPS\s*=\s*\[/.test(line)) {
          out.push({
            path: p, line: lineNo,
            message: `hand-written array literal reappeared assigning LOOP_HOPS directly (Rule A, Cause A): "${line.trim()}". LOOP_HOPS is derived from loop-hops.d/ by loadLoopHops(); add a new hop file there instead of an array literal here.`,
          });
        }
        if (/^\s*id:\s*['"][a-z][a-z0-9-]*['"]/.test(line)) {
          out.push({
            path: p, line: lineNo,
            message: `hand-written hop "id:" entry reappeared in loop-manifest.mjs (Rule A, Cause A): "${line.trim()}". Hops are one file per id under loop-hops.d/; add a new hop file there instead.`,
          });
        }
      }
      if (isAdminPartsPage) {
        if (/PARTS\s*:\s*PartEntry\[\]\s*=\s*\[/.test(line)) {
          out.push({
            path: p, line: lineNo,
            message: `hand-written array literal reappeared assigning PARTS (Rule A, Cause A): "${line.trim()}". PARTS is derived from loadPartEntries() (src/lib/admin/parts-registry.ts), never an array literal here.`,
          });
        }
        if (/^\s*slug:\s*['"][a-z][a-z0-9-]*['"]/.test(line)) {
          out.push({
            path: p, line: lineNo,
            message: `hand-written part "slug:" entry reappeared in admin/parts/page.tsx (Rule A, Cause A): "${line.trim()}". Parts are one file per slug under src/app/admin/parts/<slug>/part.json; add a new part.json file there instead.`,
          });
        }
      }
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 2: no stored measurement (Cause B, back). Pure: takes [{ path, text }].
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

// The two files, and only these, where a constant-ZERO ceiling is a strict rule (never a measurement),
// each with the date it was seeded and why. Nonzero is ALWAYS a violation; zero is a violation too unless
// it is named here (a new zero ceiling appearing anywhere else still needs an operator decision, not a
// silent pass because the number happens to be zero).
export const ZERO_CEILING_ALLOWLIST = {
  'fsi-app/.discipline/fitness/functions/F46-external-host-home.mjs': {
    MULTI_HOME_CEILING: {
      decidedOn: '2026-09-18',
      reason: 'lane L35h: eur-lex.europa.eu homed onto identifier-variants.mjs, the one multi-home host dropped to zero. A zero ceiling here is a strict rule (no host may have two homes), not a measurement.',
    },
  },
  'fsi-app/.discipline/fitness/functions/F47-db-object-reference.mjs': {
    UNREFERENCED_TABLES_CEILING: {
      decidedOn: '2026-09-17',
      reason: 'lane L32: migration 324 dropped drain_worklist, the one unreferenced table. A zero ceiling here is a strict rule, not a measurement.',
    },
    UNREAD_TABLES_CEILING: {
      decidedOn: '2026-09-17',
      reason: 'lane L32 / m9c: write-only tables carry their own reason-bearing ALLOWLIST entries in this file; a zero ceiling here is a strict rule, not a measurement.',
    },
  },
};

export function scanStoredMeasurements(files, { allowlist = ZERO_CEILING_ALLOWLIST } = {}) {
  const out = [];
  for (const { path, text } of files) {
    const p = String(path).replace(/\\/g, '/');
    const lines = String(text ?? '').split(/\r?\n/);
    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      const ceilingMatch = /\b([A-Z][A-Z0-9_]*_CEILING)\s*=\s*(-?\d+)\b/.exec(line);
      if (ceilingMatch) {
        const [, name, valueStr] = ceilingMatch;
        const value = Number(valueStr);
        if (value !== 0) {
          out.push({
            path: p, line: lineNo,
            message: `REGRESSION: a nonzero stored ceiling "${name} = ${value}" reappeared (Rule B, Cause B): "${line.trim()}". A gate compares the tree to its merge-base at check time; nothing is stored that a lane could collide on.`,
          });
        } else if (!allowlist[p]?.[name]) {
          out.push({
            path: p, line: lineNo,
            message: `a zero-valued "${name} = 0" is not in the dated ZERO_CEILING_ALLOWLIST (Rule B, Cause B): "${line.trim()}". A strict zero ceiling is permitted only for an operator-decided, dated, reason-bearing entry; add one or remove the constant.`,
          });
        }
      }
      const hashMatch = /=\s*['"`](sha256:[0-9a-f]{16}|[0-9a-f]{64})['"`]/.exec(line);
      if (hashMatch) {
        out.push({
          path: p, line: lineNo,
          message: `a hash-pin literal "${hashMatch[1]}" reappeared (Rule B, Cause B): "${line.trim()}". The comparison is derived at check time; nothing is stored that a lane could collide on.`,
        });
      }
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 3: ids unique across each entry-file category. Pure: takes [{ id, file }] and a category label.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
export function findDuplicateIds(idsByFile) {
  const byId = new Map();
  for (const { id, file } of idsByFile) {
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(file);
  }
  const dups = [];
  for (const [id, files] of byId) {
    if (files.length > 1) dups.push({ id, files: [...files].sort() });
  }
  return dups.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PRODUCTION READS: the real repo. Every function above is pure and takes plain data; everything below
// reads the live tree (or the live git range/log) and feeds that data in.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function readFileOrNull(root, relPath) {
  const abs = join(root, relPath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8');
}

const MANIFEST_PATH = 'fsi-app/.discipline/fitness/manifest.mjs';
const GOVERNING_FILES_PATH = 'fsi-app/scripts/harness-runs/governing-files.mjs';
const RUN_ARTIFACT_PATH = 'fsi-app/scripts/lib/run-artifact.mjs';
const INVARIANTS_PATH = 'fsi-app/.discipline/governance/invariants.mjs';
const LOOP_MANIFEST_PATH = 'fsi-app/.discipline/governance/loop-manifest.mjs';
const ADMIN_PARTS_PAGE_PATH = 'fsi-app/src/app/admin/parts/page.tsx';
const FUNCTIONS_GLOB = 'fsi-app/.discipline/fitness/functions/*.mjs';
const INVARIANTS_D_GLOB = 'fsi-app/.discipline/governance/invariants.d/*.mjs';
const MIGRATIONS_GLOB = 'fsi-app/supabase/migrations/*.sql';
const HARNESS_RUNS_DIR = 'fsi-app/scripts/harness-runs/';

export function runCheck1(root) {
  const familyNames = FAMILIES.map((f) => f.family);
  const files = [MANIFEST_PATH, GOVERNING_FILES_PATH, RUN_ARTIFACT_PATH, INVARIANTS_PATH, LOOP_MANIFEST_PATH, ADMIN_PARTS_PAGE_PATH]
    .map((path) => ({ path, text: readFileOrNull(root, path) }))
    .filter((f) => f.text != null);
  return scanHandEntries(files, { familyNames });
}

export function runCheck2(root) {
  const files = globFiles([FUNCTIONS_GLOB])
    .filter((f) => !f.endsWith('.test.mjs'))
    .map((path) => ({ path, text: readFileOrNull(root, path) }))
    .filter((f) => f.text != null);
  return scanStoredMeasurements(files);
}

export function runCheck3(root) {
  const idsByFile = [];

  // fitness functions: id from filename prefix (F<n>-...)
  for (const f of globFiles([FUNCTIONS_GLOB]).filter((f) => !f.endsWith('.test.mjs'))) {
    const m = /^F\d+/.exec(basename(f));
    if (m) idsByFile.push({ category: 'fitness', id: m[0], file: f });
  }

  // invariants.d: id is the filename stem
  for (const f of globFiles([INVARIANTS_D_GLOB])) {
    const stem = basename(f).replace(/\.mjs$/, '');
    idsByFile.push({ category: 'invariants', id: stem, file: f });
  }

  // harness families: id is the family.json's own "family" field (falls back to the directory name)
  for (const f of globFiles([HARNESS_RUNS_DIR])) {
    if (basename(f) !== 'family.json') continue;
    let id = basename(dirname(f));
    const text = readFileOrNull(root, f);
    try {
      const parsed = JSON.parse(text ?? '{}');
      if (parsed && typeof parsed.family === 'string') id = parsed.family;
    } catch {
      // malformed JSON is family-registry.mjs's own problem to refuse; this check just uses the fallback id.
    }
    idsByFile.push({ category: 'harness-family', id, file: f });
  }

  // migrations: id is the leading number prefix
  for (const f of globFiles([MIGRATIONS_GLOB])) {
    const m = /^(\d+)_/.exec(basename(f));
    if (m) idsByFile.push({ category: 'migration', id: m[1], file: f });
  }

  return evaluateIdDuplicates(idsByFile);
}

// Amendment 2 (coordinator, 2026-09-19 20:49 UTC), check 3. These two migration-number prefixes carry a
// real, pre-existing duplicate: five files, all applied, each with a distinct filename (Supabase CLI
// tracks migrations by filename, never by this leading number, so the CLI is unaffected). Renumbering an
// applied migration was refused by the coordinator the same day this allowlist was written. The entry
// pins the EXACT file set observed, not just the id: a third file later sharing the same prefix changes
// the observed set, no longer matches, and is caught again (a growing duplicate is not the one this
// allowlist excuses). Every other duplicate, migrations included, is still a violation.
export const MIGRATION_DUPLICATE_ALLOWLIST = {
  '006': {
    decidedOn: '2026-09-19',
    reason: 'pre-build history, applied; renumbering refused 2026-09-19',
    files: [
      'fsi-app/supabase/migrations/006_multi_tenant.sql',
      'fsi-app/supabase/migrations/006_rls_multi_tenant.sql',
    ],
  },
  '007': {
    decidedOn: '2026-09-19',
    reason: 'pre-build history, applied; renumbering refused 2026-09-19',
    files: [
      'fsi-app/supabase/migrations/007_community_layer.sql',
      'fsi-app/supabase/migrations/007_full_brief.sql',
      'fsi-app/supabase/migrations/007_rls_community.sql',
    ],
  },
};

/** Pure: takes the same [{ category, id, file }] shape runCheck3 builds and returns violations, applying
 *  MIGRATION_DUPLICATE_ALLOWLIST only to a migration duplicate whose observed file set matches the
 *  allowlisted set exactly (sorted comparison) -- any other file set for that same id (a growing
 *  duplicate, e.g. a planted third "006_" file) is still a violation. */
export function evaluateIdDuplicates(idsByFile, { migrationAllowlist = MIGRATION_DUPLICATE_ALLOWLIST } = {}) {
  const out = [];
  for (const category of ['fitness', 'invariants', 'harness-family', 'migration']) {
    const dups = findDuplicateIds(idsByFile.filter((e) => e.category === category));
    for (const { id, files } of dups) {
      if (category === 'migration') {
        const allowed = migrationAllowlist[id];
        if (allowed && [...files].sort().join('\u0001') === [...allowed.files].sort().join('\u0001')) {
          continue;
        }
      }
      out.push({
        path: files[0], line: 1,
        message: `duplicate id "${id}" across ${category} entry files: ${files.join(', ')}. Each entry file's id must be unique; the coordinator assigns ids (invariants.d/README.md's own rule), never a lane.`,
      });
    }
  }
  return out;
}

export function currentBranch(root) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export const COORDINATOR_ONLY_EXACT = ['docs/ops/session-log.md', 'docs/PROGRAM-BOARD.md', 'docs/INDEX.md', 'docs/runbooks/MAINTENANCE-RUNBOOK.md'];

// Lane GATE-8 (2026-10-08, AUD-AT-4 B6-32): check 4 used to apply only when the branch name started with `lane/`,
// so a lane branch named anything else (`claude/x`) passed, and in CI, where a pull request is checked out
// detached, no branch name was visible at all, so the check never ran. It now applies to EVERY branch except the
// coordinator's own: master (and main), and `coord/` branches, the coordinator's working branches. The branch name
// is read from git, and when HEAD is detached from the pull request's source ref (GITHUB_HEAD_REF) or the pushed ref
// (GITHUB_REF_NAME), which CI sets. A detached HEAD with no name at all is treated as a lane (the strict reading).
export function isCoordinatorBranch(branch) {
  return branch === 'master' || branch === 'main' || String(branch ?? '').startsWith('coord/');
}

export function effectiveBranch(root, env = process.env) {
  const git = currentBranch(root);
  if (git && git !== 'HEAD') return git;
  return env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || git || null;
}

export function runCheck4(root, env = process.env) {
  const branch = effectiveBranch(root, env);
  if (isCoordinatorBranch(branch)) {
    console.log(`  [F51] check 4 (coordinator-only files) skipped: "${branch}" is a coordinator branch.`);
    return [];
  }
  const { range, source, reason } = resolveRange({ cwd: root });
  if (source === 'unavailable' || !range) {
    console.log(`  [F51] check 4 (coordinator-only files) skipped: no git range available (${reason ?? 'unavailable'}).`);
    return [];
  }
  let changed;
  try {
    changed = gitChangedFiles(range, { cwd: root });
  } catch (e) {
    console.log(`  [F51] check 4 (coordinator-only files) skipped: git diff failed (${e.message}).`);
    return [];
  }
  const out = [];
  for (const f of changed) {
    if (COORDINATOR_ONLY_EXACT.includes(f) || f.startsWith('docs/audits/')) {
      out.push({
        path: f, line: 1,
        message: `branch "${branch}" (range ${range}) changes coordinator-only file "${f}" (docs/dispatches/lane-common-contract.md: "Never write docs/ops/session-log.md, docs/PROGRAM-BOARD.md, docs/INDEX.md, or docs/runbooks/MAINTENANCE-RUNBOOK.md (coordinator only)" and "A lane never edits a file under docs/audits/"). A lane writes its own docs/ops/session-log.d/ file and records a finding's closure there instead.`,
      });
    }
  }
  return out;
}

export const fitnessFunction = {
  id: 'F51',
  name: 'no-shared-append',
  description:
    'Holds the line plan 6.8 drew: (1) no hand-written entry reappears in a file lanes N1/N2/N5 converted ' +
    'to a derived directory read; (2) no fitness function stores a nonzero ceiling or a hash-pin literal, ' +
    'and a zero ceiling is allowlisted with a date and a reason or it fails too; (3) ids are unique within ' +
    'each entry-file category (fitness functions, invariants, harness families, migrations, with a dated ' +
    'allowlist for the two pre-build migration-number duplicates 006 and 007 only); (4) a lane/ branch ' +
    'never touches a coordinator-only file. The former check 5 (hotspot concurrency) was deleted by lane ' +
    'GATE-3, 2026-10-08: git merges concurrent edits itself and all 14 of its firings merged clean.',
  source: 'fsi-app/.discipline/fitness/functions/F51-no-shared-append.mjs',
  enumerate() {
    // One anchor file: the scan is tree-and-git-wide, reported once (the F23/F45/F47 shape).
    return ['fsi-app/.discipline/fitness/functions/F51-no-shared-append.mjs'];
  },
  check() {
    const root = getRepoRoot();
    const raw = [
      ...runCheck1(root),
      ...runCheck2(root),
      ...runCheck3(root),
      ...runCheck4(root),
    ];
    return raw.map((v) => violation(1, `${v.path}:${v.line}: ${v.message}`));
  },
};
