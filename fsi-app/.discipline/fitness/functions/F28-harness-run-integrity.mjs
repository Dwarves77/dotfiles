// F28: HARNESS-RUN INTEGRITY. The meta-harness layer's own enforcement gate (Wave MH-2, build plan section 2):
// "new fitness function F28 fails CI when a harness family's code changed without a run artifact
// recording why, or when an artifact is missing required fields." Four rules, all against the
// COMMITTED TREE (a static check, like every fitness function here - no DB, no network, no run of the
// harnesses themselves):
//
//   (a) SCHEMA - every artifact file under scripts/harness-runs/*/ validates against CONVENTION.md's
//       schema. Reuses validateRunArtifact (imported from scripts/lib/run-artifact.mjs, the module
//       Wave MH-1 built) rather than re-implementing the schema here - the exact "reuse by import"
//       discipline F27 uses for resolveSpecifier/isTestFile from F25.
//   (b) RANGE RULE - "the harness changed in this range without a run or an acknowledgment landing in
//       the same range." For each registered family, if any of its governing files is among
//       gitChangedFiles(range) and no new <family>-run-NNN.json artifact is among gitAddedFiles(range),
//       then gitAddedFiles(range) must contain a file under that family's own pending/ directory -
//       otherwise a violation naming the family, the changed governing file(s), and the pending file it
//       must add. Needs a range: when change-range.mjs's resolveRange() reports 'unavailable' (no
//       origin/master reachable), this rule is SKIPPED, not failed, and the skip is printed so a reader
//       can tell "nothing to report" apart from "not checked" (RULE B REPORT LINE below).
//   (c) TREE-STATE RULE - always runs, independent of any range: a family with NO valid artifact whose
//       recorded harness_version equals the CURRENT (live) governing-file hash must have at least one
//       file under its own pending/ directory (the honest acknowledgment that a run is owed - this
//       subsumes the old "zero artifacts at all" case too, since zero artifacts trivially has none
//       matching). A family that DOES have an artifact at the live hash must have NO pending files left
//       (the reverse audit: "the run happened, delete them").
//   (d) PROPOSER ATTESTATION - a family with ≥2 valid artifacts (enough history for a proposer pass to
//       mean something - PROPOSER-RUNBOOK.md section 1's precondition) must carry a LAST-PROPOSER-PASS.md that
//       NAMES the latest artifact's run_id verbatim. A family with exactly one artifact is not required
//       to have one yet (there is nothing to compare a first run against).
//
// RULE B (lane N3, 2026-09-19, build plan section 6.8 Rule B: "a gate compares the tree to its
// merge-base, never to a stored number"). Rules (b) and (c) above REPLACE the prior hash-pinned
// PENDING-RUN.md mechanism (rules (b) CENSUS / (c) STALENESS COUPLING, which required a marker to record
// the exact governing-file hash at the moment it was written, and re-pinned that recorded hash by hand every time a
// governing file moved again before the promised run landed). The measured cost of the old mechanism:
// 17 scripted re-pins across four logged days, three lanes (M8, M9b, M9a) colliding on the SAME marker
// line on 2026-09-18 alone (build plan section 6.8's own count). The stored hash was a pure function of
// the tree - two lanes that each computed a correct value collided on the LINE, and the merged tree's
// correct value was a THIRD value neither lane wrote, which is a proof by presence (a machine re-stamps
// it), not the proof by acknowledgment the marker was meant to be (CLAUDE.md standing rule 15).
//
// THE FIX: a family that owes a run declares it as ONE FILE IT OWNS -
// scripts/harness-runs/<family>/pending/<YYYY-MM-DD>-<lane>.md, no hash anywhere in it. Two lanes that
// each add their OWN pending file never collide (an add/add on two different filenames merges clean in
// any order - see F28-harness-run-integrity.test.mjs's collision replay). Nothing is stored that a
// machine has to keep in sync with the tree: the range rule and the tree-state rule both re-derive the
// live hash and the live git range at CHECK TIME, from `scripts/lib/run-artifact.mjs`'s
// `hashHarnessVersion` and `fsi-app/.discipline/lib/change-range.mjs`'s `resolveRange`/`gitChangedFiles`/
// `gitAddedFiles` (lane N0's module - the ONE home for "what changed in this range", reused here rather
// than a third private git-plumbing copy). Nothing under a family's own pending/ directory is EVER a
// governing file or a run artifact: `family-registry.mjs`'s `validateFamilyDescriptor` refuses a
// `governing_files` entry under a pending/ path outright, and `scanArtifacts` below never scans into a
// family's pending/ subdirectory (a file two levels under scripts/harness-runs/ - <family>/pending/<x> -
// fails the `parts.length !== 2` check the same way traces/ and a family's own family.json already do;
// proven directly by this file's own test, not left implicit).
//
// COST: filesystem + git only - no network, no database, no model call, no schedule. Reads
// scripts/harness-runs/**/*.json, each family's own pending/ directory and LAST-PROPOSER-PASS.md if
// present, re-hashes GOVERNING_FILES from disk (same hashHarnessVersion the harnesses themselves use to
// self-hash), and - for the range rule only - one `git diff --name-only` pair against the resolved range.
//
// Holistic, so it follows the F23/F25/F27 shape: enumerate() returns a single sentinel and the whole
// analysis runs once inside check().

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { resolveRange, gitChangedFiles, gitAddedFiles } from '../../lib/change-range.mjs';
import { validateRunArtifact, hashHarnessVersion, ALLOWED_FAMILIES, isRunArtifactFilename } from '../../../scripts/lib/run-artifact.mjs';
import { GOVERNING_FILES } from '../../../scripts/harness-runs/governing-files.mjs';

const HARNESS_RUNS_REL = 'fsi-app/scripts/harness-runs';
const PENDING_DIR = 'pending';

// Governing files per family, fsi-app-relative - see governing-files.mjs's own header for the "wrong
// copy of the truth" defect this single import closes (this array used to be either hardcoded here or
// hand-copied into each family's own runner script, and the two copies proved live to have drifted for
// mint). Every family's own canonical runner script AND this file both import the SAME array.
export { GOVERNING_FILES };

const PROPOSER_PASS_FILE = 'LAST-PROPOSER-PASS.md';

/**
 * Parse every *.json artifact file grouped by family from a flat { path -> content } map (repo-relative
 * paths under HARNESS_RUNS_REL/<family>/<file>.json). Pure - no I/O - so the red-tests can drive it with
 * a constructed fixture tree instead of only the live repo (F23/F25/F27's negative-test discipline).
 * Returns { byFamily: Map<family, { valid: object[], invalid: {file, reason}[] }> }.
 */
export function scanArtifacts(fileContents) {
  const byFamily = new Map();
  for (const [path, content] of Object.entries(fileContents)) {
    const rel = path.startsWith(`${HARNESS_RUNS_REL}/`) ? path.slice(HARNESS_RUNS_REL.length + 1) : path;
    const parts = rel.split('/');
    // parts.length !== 2 excludes anything not a DIRECT child of a family directory - a family's own
    // family.json, its traces/ subdirectory, and (lane N3, 2026-09-19) a file under its pending/
    // subdirectory all fail this check the same way: <family>/pending/<file> is THREE parts, never two.
    // isRunArtifactFilename (lane N2, 2026-09-19, Amendment 2) then matches the convention's
    // <family>-run-NNN.json shape and nothing else, so a family's own family.json descriptor is never
    // scanned as a run-artifact candidate either. Both checks are proven directly by this file's own
    // test (a stray .json placed IN a pending/ directory is still never scanned), not left to the reader
    // to infer from the two predicates alone.
    if (parts.length !== 2 || !isRunArtifactFilename(parts[1])) continue; // not a family-level artifact file
    const [family, file] = parts;
    if (!byFamily.has(family)) byFamily.set(family, { valid: [], invalid: [] });
    const bucket = byFamily.get(family);
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      bucket.invalid.push({ file, reason: `unparseable JSON: ${err.message}` });
      continue;
    }
    const errors = validateRunArtifact(parsed);
    if (errors.length) {
      bucket.invalid.push({ file, reason: errors.join('; ') });
      continue;
    }
    bucket.valid.push(parsed);
  }
  return { byFamily };
}

/** Rule (a): every artifact file must validate. Pure comparator over scanArtifacts()'s output. */
export function auditSchema(byFamily) {
  const problems = [];
  for (const [family, { invalid }] of byFamily) {
    for (const { file, reason } of invalid) {
      problems.push(
        `INVALID ARTIFACT - ${HARNESS_RUNS_REL}/${family}/${file} does not validate against ` +
          `CONVENTION.md's schema (validateRunArtifact): ${reason}`,
      );
    }
  }
  return problems;
}

/**
 * Rule (b), the RANGE RULE (build plan section 6.8 Rule B): for ONE family, if any of its governing
 * files (fsi-app-relative) was changed in the range and no new run artifact of this family was added in
 * the range, then the range must also add a pending/ file for this family. Pure comparator, injectable
 * with pre-resolved changed/added file lists so the red-tests drive it with a constructed range instead
 * of a real git checkout.
 * @param {string} family
 * @param {string[]} governingFilesFsiRelative - GOVERNING_FILES[family] (fsi-app-relative paths)
 * @param {string[]} changedFiles - gitChangedFiles(range) - repo-relative
 * @param {string[]} addedFiles - gitAddedFiles(range) - repo-relative
 * @returns {string[]} problems ([] = pass, including "nothing in scope changed")
 */
export function auditPendingRange(family, governingFilesFsiRelative, changedFiles, addedFiles) {
  const governingRepoRelative = governingFilesFsiRelative.map((f) => `fsi-app/${f}`);
  const changedGoverning = governingRepoRelative.filter((f) => changedFiles.includes(f));
  if (changedGoverning.length === 0) return [];

  const familyDir = `${HARNESS_RUNS_REL}/${family}/`;
  const addedArtifact = addedFiles.some(
    (f) => f.startsWith(familyDir) && isRunArtifactFilename(f.slice(familyDir.length)),
  );
  if (addedArtifact) return [];

  const pendingPrefix = `${familyDir}${PENDING_DIR}/`;
  const addedPending = addedFiles.some((f) => f.startsWith(pendingPrefix) && f.length > pendingPrefix.length);
  if (addedPending) return [];

  return [
    `PENDING FILE REQUIRED (range) - harness family "${family}"'s governing file(s) ` +
      `${changedGoverning.join(', ')} changed in this range with no new ${family}-run-NNN.json artifact ` +
      `added in the same range. Add ${pendingPrefix}<YYYY-MM-DD>-<lane>.md naming the change and the ` +
      `planned run, or land the run itself.`,
  ];
}

/**
 * Rule (c), the TREE-STATE RULE (build plan section 6.8 Rule B): always runs, independent of any range.
 * A family with no valid artifact recorded at the CURRENT live hash must have ≥1 pending file (the run
 * is owed); a family WITH an artifact at the live hash must have NO pending files (the run happened -
 * delete them, the reverse audit). Pure comparator, injectable.
 * @param {string} family
 * @param {string} currentHash - hashHarnessVersion(GOVERNING_FILES[family]) against the CURRENT tree
 * @param {object[]} validArtifacts - this family's valid artifacts
 * @param {string[]} pendingFiles - bare filenames currently under this family's pending/ directory
 * @returns {string[]} problems ([] = pass)
 */
export function auditPendingTreeState(family, currentHash, validArtifacts, pendingFiles) {
  const matchingArtifact = validArtifacts.some((a) => a.harness_version === currentHash);
  const pendingDir = `${HARNESS_RUNS_REL}/${family}/${PENDING_DIR}/`;

  if (matchingArtifact) {
    if (pendingFiles.length > 0) {
      return [
        `STALE PENDING FILE(S) - harness family "${family}" has a run artifact recorded at the current ` +
          `governing-file hash (${currentHash}), but still carries ${pendingFiles.length} file(s) under ` +
          `${pendingDir} (${pendingFiles.join(', ')}). The run happened - delete them.`,
      ];
    }
    return [];
  }

  if (pendingFiles.length === 0) {
    return [
      `PENDING FILE REQUIRED (tree-state) - harness family "${family}" has no run artifact recorded at ` +
        `the current governing-file hash (${currentHash}) and no file under ${pendingDir}. Add one ` +
        `naming the change and the planned run, or land the run itself.`,
    ];
  }
  return [];
}

/** Rule (d): a family with ≥2 valid artifacts must have a LAST-PROPOSER-PASS.md naming the latest run_id. */
export function auditProposerAttestation(family, validArtifacts, proposerPassContent) {
  if (validArtifacts.length < 2) return [];
  const latest = [...validArtifacts].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at)).at(-1);
  if (proposerPassContent == null) {
    return [
      `NO PROPOSER ATTESTATION - harness family "${family}" has ${validArtifacts.length} artifacts but no ` +
        `${HARNESS_RUNS_REL}/${family}/${PROPOSER_PASS_FILE}. PROPOSER-RUNBOOK.md's precondition (read the ` +
        `full prior record before the next run) is machine-checkable once a family has ≥2 runs to compare - ` +
        `write ${PROPOSER_PASS_FILE} naming ${latest.run_id} and the hypotheses/proposal(s) read from it, or ` +
        `"none warranted" with basis.`,
    ];
  }
  if (!proposerPassContent.includes(latest.run_id)) {
    return [
      `STALE PROPOSER ATTESTATION - ${HARNESS_RUNS_REL}/${family}/${PROPOSER_PASS_FILE} does not name ` +
        `${latest.run_id} (the family's latest artifact). A proposer pass that does not name the run it ` +
        `read is indistinguishable from one that read an older run, or none.`,
    ];
  }
  return [];
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** Bare filenames (sorted) currently under <root>/<HARNESS_RUNS_REL>/<family>/pending/. Never throws -
 *  a family with no pending/ directory yet simply has none. Exported so the red-tests can drive it
 *  against a constructed fixture directory as well as the live tree. */
export function listPendingFiles(root, family) {
  try {
    return readdirSync(join(root, HARNESS_RUNS_REL, family, PENDING_DIR)).filter((f) => !f.startsWith('.')).sort();
  } catch {
    return [];
  }
}

/**
 * Hash one family's GOVERNING_FILES, converting a missing file into a NAMED fitness failure instead of
 * letting hashHarnessVersion's raw ENOENT (it does a plain readFileSync per listed file, by design - see
 * its own doc comment in scripts/lib/run-artifact.mjs) escape check() as an unhandled throw. Before this,
 * a single missing governing file (a typo'd path in GOVERNING_FILES, a file renamed without updating this
 * table, or a family whose governing files a DIFFERENT lane is still expected to land) would abort
 * check() for EVERY family and EVERY other rule in the same pass with an opaque Node stack trace, not a
 * fitness-function violation a coordinator can act on. Only ENOENT is translated here - any other
 * hashHarnessVersion failure still propagates unchanged, since silently swallowing those would hide a
 * genuine bug in F28 itself rather than report the legitimate "this family's governing file set doesn't
 * match the tree yet" state this exists to name.
 * Returns { hash: string|null, problems: string[] } - `hash` is null exactly when `problems` is non-empty.
 * Exported so this ENOENT-to-named-failure conversion is unit-testable without a full repo-root check().
 */
export function safeHashGoverningFiles(family, governing, baseDir) {
  try {
    return { hash: hashHarnessVersion(governing, baseDir), problems: [] };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return {
        hash: null,
        problems: [
          `MISSING GOVERNING FILE - harness family "${family}"'s entry in F28's GOVERNING_FILES names a ` +
            `file that does not exist on the current tree (${err.message}). Land the missing file, or ` +
            `if it was intentionally renamed/removed, correct that family's own family.json.`,
        ],
      };
    }
    throw err;
  }
}

export const fitnessFunction = {
  id: 'F28',
  name: 'harness-run-integrity',
  description:
    'Every scripts/harness-runs/*/*.json artifact validates against CONVENTION.md\'s schema; a family ' +
    'whose governing files changed in this range with no new run artifact added must also add a ' +
    'pending/ file in the same range (the range rule); a family with no artifact at the current ' +
    'governing-file hash must have ≥1 pending/ file, and a family with an artifact at the current hash ' +
    'must have none left (the tree-state rule); a family with ≥2 artifacts carries a ' +
    'LAST-PROPOSER-PASS.md naming the latest run. The meta-harness layer\'s own enforcement gate (build ' +
    'plan section 2): fails CI when a harness family\'s code changed without a run artifact recording why.',
  source: 'META-HARNESS-BUILD-PLAN.md section 2 ("Smarter on its own, made structural") and build plan section 6.8 Rule B',

  // Holistic: one pass over the harness-runs tree, built once. Single sentinel => check() runs once.
  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.mjs'];
  },

  check() {
    const root = getRepoRoot();
    const jsonFiles = globFiles([`${HARNESS_RUNS_REL}/**/*.json`]);
    const fileContents = {};
    for (const f of jsonFiles) fileContents[f] = readFileSync(join(root, f), 'utf8');
    const { byFamily } = scanArtifacts(fileContents);

    const problems = [...auditSchema(byFamily)];

    let familyDirs = [];
    try {
      familyDirs = readdirSync(join(root, HARNESS_RUNS_REL), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      familyDirs = [];
    }

    for (const family of familyDirs) {
      if (!ALLOWED_FAMILIES.includes(family)) {
        problems.push(
          `UNKNOWN FAMILY - ${HARNESS_RUNS_REL}/${family}/ is not in run-artifact.mjs's ALLOWED_FAMILIES. ` +
            `Register it there AND add its own scripts/harness-runs/${family}/family.json, or remove the ` +
            `directory.`,
        );
      }
    }

    // Rule (b), the RANGE RULE. Needs a resolved range; when unavailable this rule is SKIPPED (never
    // failed) and the skip is printed so a reader can tell "nothing to report" apart from "not checked".
    const { range, source, reason } = resolveRange({ cwd: root });
    if (source === 'unavailable') {
      console.log(`  [F28] range rule: skipped (${reason})`);
    } else {
      let changed = null;
      let added = null;
      try {
        changed = gitChangedFiles(range, { cwd: root });
        added = gitAddedFiles(range, { cwd: root });
      } catch (err) {
        console.log(`  [F28] range rule: skipped (${err.message})`);
      }
      if (changed !== null && added !== null) {
        for (const family of ALLOWED_FAMILIES) {
          const governing = GOVERNING_FILES[family];
          if (!governing) continue;
          problems.push(...auditPendingRange(family, governing, changed, added));
        }
      }
    }

    // Rule (c), the TREE-STATE RULE (always runs) + the per-family report line + rule (d).
    for (const family of ALLOWED_FAMILIES) {
      const validArtifacts = byFamily.get(family)?.valid ?? [];
      const governing = GOVERNING_FILES[family];
      if (!governing) continue; // defensive; ALLOWED_FAMILIES and GOVERNING_FILES are kept 1:1 by test

      const { hash: currentHash, problems: hashProblems } = safeHashGoverningFiles(
        family,
        governing,
        join(root, 'fsi-app'),
      );
      if (hashProblems.length) {
        problems.push(...hashProblems);
        continue; // no hash to couple the tree-state/proposer-attestation checks against this pass
      }

      const pendingFiles = listPendingFiles(root, family);
      const atLiveHash = validArtifacts.some((a) => a.harness_version === currentHash);
      console.log(
        `  [F28] ${family}: live hash ${currentHash}, artifact at live hash: ${atLiveHash ? 'yes' : 'no'}, ` +
          `pending files: ${pendingFiles.length}`,
      );

      problems.push(...auditPendingTreeState(family, currentHash, validArtifacts, pendingFiles));

      const proposerPassPath = join(root, HARNESS_RUNS_REL, family, PROPOSER_PASS_FILE);
      problems.push(...auditProposerAttestation(family, validArtifacts, readIfExists(proposerPassPath)));
    }

    if (problems.length === 0) return PASS;
    return problems.map((msg) => violation(1, msg));
  },
};
