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
// cause from growing BACK: it does not fix anything itself, it holds the line five different ways.
//
// FIVE CHECKS, each proven by attack in the sibling .test.mjs (rule 15: a guard is proven by attack, not
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
//   5. THE HOTSPOT STANDING NUMBER: files changed by 3 or more of the last 30 first-parent commits of
//      `origin/master` AFTER a dated anchor commit (Amendment 2, 2026-09-19: the anchor is lane N4's own
//      merge, the last of plan 6.8's conversion lanes, so the conversion itself and three same-day
//      tree-wide mechanical passes are never counted as hotspot churn) are printed every run, so the NEXT
//      hotspot is caught while it is forming, not after an evening of stops.
//
// SCOPE, HONESTLY. Checks 1-3 are static/textual scans of specific, named files -- they are pattern
// checks against the shapes Cause A and Cause B actually took, not a general ban on the identifiers
// `_CEILING` or `id:` anywhere in the tree. Checks 4 and 5 are git-range and git-log reads through the
// same discipline `change-range.mjs` (lane N0) established: an argument array, never a shell string, and
// a resolved repository top level, never a raw `process.cwd()`.
//
// node: builtins plus the repo's own fitness/governance/harness-runs helpers only (loaded by the no-npm
// discipline test glob via run-test-suite.sh's existing `fitness/functions/*.test.mjs` line).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { resolveRange, gitChangedFiles } from '../../lib/change-range.mjs';
import { FAMILIES } from '../../../scripts/harness-runs/family-registry.mjs';

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// Entry directories: the Rule A/B derived registries lanes N1-N5 built. A file under one of these is
// never itself a "hand entry" or a "hotspot" violation -- adding a file HERE is the whole point.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
export const ENTRY_DIRS = [
  'fsi-app/.discipline/fitness/functions/',
  'fsi-app/.discipline/governance/invariants.d/',
  'fsi-app/scripts/harness-runs/',
  'fsi-app/.discipline/governance/skill-acks/',
];

export function underEntryDir(path) {
  const p = String(path).replace(/\\/g, '/');
  if (p.startsWith('docs/ops/session-log.d/')) return true;
  return ENTRY_DIRS.some((d) => p === d.slice(0, -1) || p.startsWith(d));
}

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
    if (!isManifest && !isGoverningFilesOrRunArtifact && !isInvariants) continue;

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
const FUNCTIONS_GLOB = 'fsi-app/.discipline/fitness/functions/*.mjs';
const INVARIANTS_D_GLOB = 'fsi-app/.discipline/governance/invariants.d/*.mjs';
const MIGRATIONS_GLOB = 'fsi-app/supabase/migrations/*.sql';
const HARNESS_RUNS_DIR = 'fsi-app/scripts/harness-runs/';

export function runCheck1(root) {
  const familyNames = FAMILIES.map((f) => f.family);
  const files = [MANIFEST_PATH, GOVERNING_FILES_PATH, RUN_ARTIFACT_PATH, INVARIANTS_PATH]
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

export const COORDINATOR_ONLY_EXACT = ['docs/ops/session-log.md', 'docs/PROGRAM-BOARD.md', 'docs/INDEX.md'];

export function runCheck4(root) {
  const branch = currentBranch(root);
  if (!branch || !branch.startsWith('lane/')) {
    console.log(`  [F51] check 4 (coordinator-only files) skipped: current branch "${branch ?? 'unknown'}" is not a lane/ branch.`);
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
        message: `branch "${branch}" (range ${range}) changes coordinator-only file "${f}" (docs/dispatches/lane-common-contract.md: "Never write docs/ops/session-log.md, docs/PROGRAM-BOARD.md, or docs/INDEX.md (coordinator only)" and "A lane never edits a file under docs/audits/"). A lane writes its own docs/ops/session-log.d/ file and records a finding's closure there instead.`,
      });
    }
  }
  return out;
}

// The six files this build's own coordinator owns by contract (docs/dispatches/lane-common-contract.md's
// "coordinator only" list plus the plan, the handoff addendum and the audit named in the brief). Seeded
// from the coordinator's own 2026-09-19 measurement; the other five files that measurement also named
// (run-artifact.mjs, meta-harness PENDING-RUN.md, CONVENTION.md, governing-files.mjs, F45) are NOT
// coordinator-owned and are deliberately absent here -- they are expected to fall out of the trailing
// window on their own now that lanes N1-N5 landed; if one is still hot, that is a finding to report, never
// a reason to add it here (plan 6.8, lane N6 brief).
export const HOTSPOT_ALLOWLIST = {
  'docs/ops/session-log.md': { decidedOn: '2026-09-19', reason: 'coordinator-only by contract' },
  'docs/INDEX.md': { decidedOn: '2026-09-19', reason: 'coordinator-only by contract' },
  'docs/PROGRAM-BOARD.md': { decidedOn: '2026-09-19', reason: 'coordinator-only by contract' },
  'docs/plans/complete-system-build-plan-2026-09-04.md': { decidedOn: '2026-09-19', reason: 'coordinator-only by contract' },
  'docs/ops/HANDOFF-2026-09-19-addendum.md': { decidedOn: '2026-09-19', reason: 'coordinator-only by contract' },
  'docs/audits/system-health-audit-2026-09-17.md': { decidedOn: '2026-09-19', reason: 'coordinator-only by contract' },
  'docs/dispatches/lane-briefs/2026-09-19/README.md': { decidedOn: '2026-09-19', reason: 'lane G1, Amendment 2: three coordinator docs PRs (#744, #751, #753) each appended a row to its per-brief table; the table is removed in this same commit so nothing appends to the file again; delete this entry once the file has left the 30-commit window' },
};

/** Pure core of check 5: given the ordered list of changed-file-lists (one per first-parent commit,
 *  newest first, as `git log --first-parent --name-only` prints them), returns the hotspot counts. */
export function countHotspots(perCommitFiles, threshold = 3) {
  const counts = new Map();
  for (const files of perCommitFiles) {
    for (const f of files) counts.set(f, (counts.get(f) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= threshold)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/** Parse `git log --first-parent --name-only --pretty=format:%x01%H` output into one array of changed
 *  files per commit (oldest-to-newest order does not matter here, only the per-commit grouping does). */
export function parseFirstParentLog(raw) {
  return String(raw ?? '')
    .split('\x01')
    .map((block) => block.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.slice(1)); // first line of each block is the commit sha
}

// Amendment 2 (coordinator, 2026-09-19 20:49 UTC), check 5. An EPOCH MARKER, not a measurement: the last
// 30 first-parent commits before this anchor ARE the plan 6.8 conversion itself (lanes N1-N5 each
// rewriting the very shared files they derived) plus three tree-wide mechanical passes landed the same
// day (T2's env-loader move over ~90 scripts, N1's audit-marker move over 34 files, N5's shared-writer-
// marker move over 94 files) -- the regime section 6.8 REPLACED, not the one this check guards. Counting
// that regime as "hotspot churn" flags the conversion that fixed Cause A/B as if it were a fresh instance
// of Cause A/B. The anchor is lane N4's own merge commit, #748, the LAST of the five conversion lanes
// (N0, T2, N2, N1, N3, N5, N4 all precede or land at this commit); every commit counted by check 5 is
// strictly AFTER it. Not re-seeded by a lane; a coordinator-only value, changed only by a coordinator
// ruling that a later commit should become the new baseline.
export const HOTSPOT_WINDOW_ANCHOR_COMMIT = 'ccb6aa0c091aba55f6e85d93ecc704c218acc20c';
export const HOTSPOT_WINDOW_ANCHOR_DECIDED_ON = '2026-09-19';
export const HOTSPOT_WINDOW_ANCHOR_REASON =
  'lane N4 merge (#748), the last of plan 6.8\'s five conversion lanes; commits at or before it are the ' +
  'conversion itself plus three same-day tree-wide mechanical passes, the regime 6.8 replaced, not the ' +
  'one this check guards.';

export function runCheck5(root, { anchor = HOTSPOT_WINDOW_ANCHOR_COMMIT } = {}) {
  let raw;
  try {
    raw = execFileSync(
      'git',
      ['log', '--first-parent', '-n', '30', '--name-only', '--pretty=format:%x01%H', `${anchor}..origin/master`],
      { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 },
    );
  } catch (e) {
    console.log(`  [F51] check 5 (hotspot standing number) skipped: origin/master or the anchor commit ${anchor.slice(0, 8)} unavailable (${e.message}).`);
    return [];
  }
  const perCommit = parseFirstParentLog(raw);
  if (perCommit.length < 3) {
    console.log(`F51 hotspots (3+ of last ${perCommit.length} first-parent commit(s) after anchor ${anchor.slice(0, 8)}): 0 (fewer than 3 commits since the anchor; no file can reach the threshold yet, skipping)`);
    return [];
  }
  const hotspots = countHotspots(perCommit);
  console.log(`F51 hotspots (3+ of last ${perCommit.length} merges after anchor ${anchor.slice(0, 8)}): ${hotspots.length}`);
  for (const [f, c] of hotspots) console.log(`  ${c}  ${f}`);

  const out = [];
  for (const [f, c] of hotspots) {
    if (!existsSync(join(root, f))) continue; // fell out of the tree; cannot cause a future conflict
    if (underEntryDir(f)) continue;
    if (HOTSPOT_ALLOWLIST[f]) continue;
    out.push({
      path: f, line: 1,
      message: `hotspot: "${f}" changed in ${c} of the last ${perCommit.length} first-parent commits of origin/master after anchor ${anchor.slice(0, 8)}, and is neither an entry-directory file, a docs/ops/session-log.d/ file, nor in the dated HOTSPOT_ALLOWLIST. This is the next Cause A/B candidate forming; investigate why separate lanes keep editing this one file (plan 6.8, check 5).`,
    });
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
    'never touches a coordinator-only file; (5) the standing hotspot count (files changed by 3+ of the ' +
    'last 30 first-parent commits of origin/master after a dated anchor commit) is printed every run and ' +
    'any file on it must be an entry-directory file, a session-log.d file, or a dated allowlist entry.',
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
      ...runCheck5(root),
    ];
    return raw.map((v) => violation(1, `${v.path}:${v.line}: ${v.message}`));
  },
};
