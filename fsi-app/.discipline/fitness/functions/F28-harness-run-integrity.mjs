// F28: HARNESS-RUN INTEGRITY. The meta-harness layer's own enforcement gate (Wave MH-2, build plan §2):
// "new fitness function F28 fails CI when a harness family's code changed without a run artifact
// recording why, or when an artifact is missing required fields." Four rules, all against the
// COMMITTED TREE (a static check, like every fitness function here — no DB, no network, no run of the
// harnesses themselves):
//
//   (a) SCHEMA — every artifact file under scripts/harness-runs/*/ validates against CONVENTION.md's
//       schema. Reuses validateRunArtifact (imported from scripts/lib/run-artifact.mjs, the module
//       Wave MH-1 built) rather than re-implementing the schema here — the exact "reuse by import"
//       discipline F27 uses for resolveSpecifier/isTestFile from F25.
//   (b) CENSUS — every registered harness family (a subdirectory of scripts/harness-runs/) has at least
//       one VALID artifact. "At least one artifact FILE" would be a weaker, dishonest reading — a family
//       whose only file fails (a) is functionally historyless, so (b) requires a file that also passed
//       (a). A family with zero artifacts is reported ONCE, by (b); rule (c) below deliberately does not
//       also fire for it (see the narrowing note there) — one problem, one message.
//       FIRST-RUN ACKNOWLEDGMENT (2026-09-01, source-sweep registration): a family registered BEFORE its
//       first run can exist honestly only if it says so in a hash-pinned way. So (b) accepts, for a
//       zero-artifact family, a PENDING-RUN.md whose recorded "harness_version at write time" equals the
//       CURRENT governing hash — the same marker and the same reverse-audit rule (c) uses. A marker whose
//       hash no longer matches (the family's code drifted before its first run) does NOT satisfy (b):
//       the tree must either re-pin the marker or land the run. This is not an escape hatch: the moment
//       the first artifact lands, (c)'s reverse-audit demands the marker's deletion.
//   (c) STALENESS COUPLING — "the harness changed without a run recording why." For each family with
//       ≥1 valid artifact, re-hash CONVENTION.md's governing-file table (GOVERNING_FILES below) against
//       the CURRENT tree. If that hash does not match ANY of the family's valid artifacts' recorded
//       harness_version, the governing files drifted since every run on record. That is a violation
//       UNLESS the family directory also carries a PENDING-RUN.md whose own recorded
//       "harness_version at write time" equals the CURRENT hash — the honest acknowledgment CONVENTION.md's
//       harness_version design anticipates ("lets a proposer lane tell 'the harness changed' apart from
//       'the input changed' without reading a diff"). See "KEEP IT HONEST" below for what this rule does
//       and deliberately does NOT try to distinguish.
//   (d) PROPOSER ATTESTATION — a family with ≥2 valid artifacts (enough history for a proposer pass to
//       mean something — PROPOSER-RUNBOOK.md §1's precondition) must carry a LAST-PROPOSER-PASS.md that
//       NAMES the latest artifact's run_id verbatim. A family with exactly one artifact is not required
//       to have one yet (there is nothing to compare a first run against).
//
// KEEP IT HONEST — the narrowings actually applied, and the one considered and REJECTED (stated
// plainly, per the build plan's instruction not to ship a gate that cries wolf):
//
//   NARROWED: rule (c) is SKIPPED for a family with zero valid artifacts (rule (b) already reports that
//   family's real problem — "never run" — and firing (c) too would produce a second, misleading message
//   ("the harness changed without a run") about a family that was simply never run in the first place,
//   which is a different and more basic gap than staleness).
//
//   ADDED (not a narrowing, an honesty requirement the plain rule as stated would have missed):
//   PENDING-RUN.md is NOT a permanent escape hatch. It is reverse-audited exactly like this codebase's
//   other shrinking allowlists (F14/F22/F24/F25/F27's "an exemption whose gap got fixed is itself RED"
//   idiom): a marker whose recorded hash the CURRENT tree no longer matches (the governing files drifted
//   AGAIN after the marker was written) is stale and must be updated; a marker whose recorded hash a
//   LANDED artifact now matches (the planned run already happened) is stale and must be deleted. Without
//   this, a single PENDING-RUN.md written once would silence (c) forever, which is exactly the
//   "buildable but unbuilt is not a valid exemption" failure this registry's own standard forbids
//   elsewhere (invariants.mjs's header) — applied here to a marker file instead of an allowlist entry.
//
//   CONSIDERED AND NOT NARROWED: harness_version (scripts/lib/run-artifact.mjs's hashHarnessVersion) is
//   a WHOLE-FILE content hash — a comment-only or prose-only edit to a governing file (including
//   MINT-RUNBOOK.md's narrative sections; CONVENTION.md deliberately includes the runbook itself as
//   behavior-bearing, not "mere documentation") trips rule (c) exactly the same as a real behavior
//   change. This IS a real source of false-feeling positives, and it was considered for narrowing
//   (e.g. diffing only non-comment lines, or excluding prose paragraphs from MINT-RUNBOOK.md). It is NOT
//   narrowed, for two reasons stated honestly: (1) CONVENTION.md already made this exact trade-off
//   knowingly and explains why ("any edit to any hashed file changes it... lets a proposer lane tell
//   the harness changed apart from the input changed without reading a diff") — narrowing it here would
//   silently override a decision Wave MH-1 documented, not fix a bug F28 introduced; (2) the remedy for
//   a genuine false positive is cheap BY DESIGN — one PENDING-RUN.md, the same file a real change
//   requires — so treating every governing-file edit as "acknowledge or land a run" is a forcing
//   function, not noise: it is the literal mechanism build plan §2 asks F28 to be ("fails CI when a
//   harness family's code changed without a run artifact recording why"). A semantic content-diff would
//   need this gate to judge what counts as "behavior," which is exactly the honor-system judgment call
//   this whole registry exists to remove.
//
// COST: filesystem only — no network, no database, no model call, no schedule. Reads
// scripts/harness-runs/**/*.json, each family's PENDING-RUN.md / LAST-PROPOSER-PASS.md if present, and
// re-hashes GOVERNING_FILES from disk (same hashHarnessVersion the harnesses themselves use to self-hash).
//
// Holistic, so it follows the F23/F25/F27 shape: enumerate() returns a single sentinel and the whole
// analysis runs once inside check().

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { validateRunArtifact, hashHarnessVersion, ALLOWED_FAMILIES } from '../../../scripts/lib/run-artifact.mjs';
import { GOVERNING_FILES } from '../../../scripts/harness-runs/governing-files.mjs';

const HARNESS_RUNS_REL = 'fsi-app/scripts/harness-runs';

// Governing files per family, fsi-app-relative — CONVENTION.md's harness_version table, resolved to full
// paths. IMPORTED, not declared here (Wave GOV-SINGLE, 2026-09-04): every family's list used to be either
// hardcoded in THIS file (mint, fetch-drain, meta-harness, forward-events, source-sweep, ledger-consume,
// change-detection, propagation) or imported from the one script that also self-hashed with it (screen, via
// screen-worklist.mjs's SCREEN_GOVERNING_FILES) — while EVERY family's own canonical runner script ALSO
// declared its own hand-copied `*_GOVERNING_FILES` array to stamp `harness_version` on the artifacts it
// writes. Nothing forced the two copies to agree beyond a per-runner "matches F28's hardcoded entry" test
// only three of eight runners carried — and, proven live: mint's F28 copy gained
// `src/lib/agent/gate-a-scan.mjs` / `gate-a-match.mjs` (PR #580, the Gate-A single-source collapse) while
// `run-mint-batch.mjs`'s own copy never did, so real population runs (#34-#36, mint-run-024..026) stamped
// an 8-file `sha256:4f09523532bb7aee` no landed artifact could ever match against F28's 10-file
// `sha256:28c98ae2309a416a` re-hash (both independently reproduced against this tree). `scripts/harness-runs/
// governing-files.mjs` is now the ONE array every family's runner AND this file both import — see that
// module's own header for the full defect this closes and why a fitness function importing from `scripts/`
// is not a new pattern (this file already did, for `run-artifact.mjs` and, before this change,
// `screen-worklist.mjs`). CONVENTION.md's own markdown table is documentation the sibling test file
// (CONVENTION-TABLE-PARITY, below) checks against this import, never a third hand-maintained copy.
//
// meta-harness (Wave MH-4, build plan §3 "self-application") is the meta-harness layer's own family, and
// is now SELF-REFERENTIAL TWICE over: both this file (F28's own rules) and governing-files.mjs itself
// (what now DEFINES every family's governing files, meta-harness's own included) are named in
// meta-harness's own list. A future edit to either — a new F28 rule, a narrowed check, a new family added
// to the table — moves the meta-harness family's own harness_version exactly like editing
// validate-mint-payload.mjs moves mint's, which is the literal mechanism by which "the loop applies to
// itself" (plan §1) is enforced, not just narrated.
export { GOVERNING_FILES };

const PENDING_RUN_FILE = 'PENDING-RUN.md';
const PROPOSER_PASS_FILE = 'LAST-PROPOSER-PASS.md';
const PENDING_HASH_RE = /harness_version at write time:\**\s*`?(sha256:[0-9a-f]{16})`?/i;

/** Extract the "harness_version at write time" hash a PENDING-RUN.md records, or null if absent/unparseable. */
export function parsePendingRunHash(content) {
  const m = PENDING_HASH_RE.exec(content ?? '');
  return m ? m[1] : null;
}

/**
 * Parse every *.json artifact file grouped by family from a flat { path -> content } map (repo-relative
 * paths under HARNESS_RUNS_REL/<family>/<file>.json). Pure — no I/O — so the red-tests can drive it with
 * a constructed fixture tree instead of only the live repo (F23/F25/F27's negative-test discipline).
 * Returns { byFamily: Map<family, { valid: object[], invalid: {file, reason}[] }> }.
 */
export function scanArtifacts(fileContents) {
  const byFamily = new Map();
  for (const [path, content] of Object.entries(fileContents)) {
    const rel = path.startsWith(`${HARNESS_RUNS_REL}/`) ? path.slice(HARNESS_RUNS_REL.length + 1) : path;
    const parts = rel.split('/');
    if (parts.length !== 2 || !parts[1].endsWith('.json')) continue; // not a family-level artifact file
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
        `INVALID ARTIFACT — ${HARNESS_RUNS_REL}/${family}/${file} does not validate against ` +
          `CONVENTION.md's schema (validateRunArtifact): ${reason}`,
      );
    }
  }
  return problems;
}

/** Rule (b): every family in ALLOWED_FAMILIES has ≥1 VALID artifact. */
export function auditFamilyPresence(families, byFamily, acknowledged = new Set()) {
  const problems = [];
  for (const family of families) {
    const validCount = byFamily.get(family)?.valid.length ?? 0;
    if (validCount === 0 && acknowledged.has(family)) continue; // hash-pinned first-run acknowledgment
    if (validCount === 0) {
      problems.push(
        `NO ARTIFACTS — harness family "${family}" (${HARNESS_RUNS_REL}/${family}/) has zero VALID run ` +
          `artifacts. Every registered family must have run history; write its first ` +
          `${family}-run-001.json (scripts/lib/run-artifact.mjs's writeRunArtifact).`,
      );
    }
  }
  return problems;
}

/**
 * Rule (c): staleness coupling for ONE family. Pure comparator, injectable so the red-test can drive it
 * with constructed hashes/artifacts/marker state instead of the live tree.
 * @param {string} family
 * @param {string} currentHash - hashHarnessVersion(GOVERNING_FILES[family]) against the CURRENT tree
 * @param {object[]} validArtifacts - this family's valid artifacts (may be empty — caller skips in that case)
 * @param {{exists: boolean, hash: string|null}} pending - PENDING-RUN.md state
 * @returns {string[]} problems ([] = pass)
 */
export function auditStalenessCoupling(family, currentHash, validArtifacts, pending) {
  if (validArtifacts.length === 0) return []; // rule (b) already reports this family — no double-report
  const problems = [];
  const matchingArtifact = validArtifacts.some((a) => a.harness_version === currentHash);

  if (matchingArtifact) {
    if (pending.exists) {
      problems.push(
        `STALE PENDING-RUN.md — ${HARNESS_RUNS_REL}/${family}/${PENDING_RUN_FILE} anticipated a governing-` +
          `file change that a landed artifact already accounts for (its recorded harness_version matches ` +
          `the current tree). The planned run happened — delete the marker.`,
      );
    }
    return problems;
  }

  // No artifact matches the current hash: the governing files drifted since every run on record.
  const latest = [...validArtifacts].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at)).at(-1);
  if (!pending.exists) {
    problems.push(
      `STALENESS COUPLING — harness family "${family}"'s governing files (see F28's GOVERNING_FILES) ` +
        `re-hash to ${currentHash}, which no artifact in ${HARNESS_RUNS_REL}/${family}/ records ` +
        `(latest artifact ${latest.run_id} recorded ${latest.harness_version}). The harness changed ` +
        `without a run recording why. Either land a new ${family}-run-NNN.json under the current code, ` +
        `or add ${HARNESS_RUNS_REL}/${family}/${PENDING_RUN_FILE} naming the change and the planned run ` +
        `that will supersede it (harness_version at write time: \`${currentHash}\`).`,
    );
  } else if (pending.hash !== currentHash) {
    problems.push(
      `STALE PENDING-RUN.md — ${HARNESS_RUNS_REL}/${family}/${PENDING_RUN_FILE} records ` +
        `${pending.hash ?? '(unparseable — missing a "harness_version at write time" line)'}, but the ` +
        `governing files have drifted AGAIN since it was written (current hash ${currentHash}). Update ` +
        `the marker to the current hash, or land the run it was waiting for.`,
    );
  }
  // else: pending.hash === currentHash — the drift is honestly acknowledged. No violation.
  return problems;
}

/** Rule (d): a family with ≥2 valid artifacts must have a LAST-PROPOSER-PASS.md naming the latest run_id. */
export function auditProposerAttestation(family, validArtifacts, proposerPassContent) {
  if (validArtifacts.length < 2) return [];
  const latest = [...validArtifacts].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at)).at(-1);
  if (proposerPassContent == null) {
    return [
      `NO PROPOSER ATTESTATION — harness family "${family}" has ${validArtifacts.length} artifacts but no ` +
        `${HARNESS_RUNS_REL}/${family}/${PROPOSER_PASS_FILE}. PROPOSER-RUNBOOK.md's precondition (read the ` +
        `full prior record before the next run) is machine-checkable once a family has ≥2 runs to compare — ` +
        `write ${PROPOSER_PASS_FILE} naming ${latest.run_id} and the hypotheses/proposal(s) read from it, or ` +
        `"none warranted" with basis.`,
    ];
  }
  if (!proposerPassContent.includes(latest.run_id)) {
    return [
      `STALE PROPOSER ATTESTATION — ${HARNESS_RUNS_REL}/${family}/${PROPOSER_PASS_FILE} does not name ` +
        `${latest.run_id} (the family's latest artifact). A proposer pass that does not name the run it ` +
        `read is indistinguishable from one that read an older run, or none.`,
    ];
  }
  return [];
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * Hash one family's GOVERNING_FILES, converting a missing file into a NAMED fitness failure instead of
 * letting hashHarnessVersion's raw ENOENT (it does a plain readFileSync per listed file, by design — see
 * its own doc comment in scripts/lib/run-artifact.mjs) escape check() as an unhandled throw. Before this,
 * a single missing governing file (a typo'd path in GOVERNING_FILES, a file renamed without updating this
 * table, or — per the forward-events GOVERNING_FILES comment above — a family whose governing files a
 * DIFFERENT lane is still expected to land) would abort check() for EVERY family and EVERY other rule in
 * the same pass with an opaque Node stack trace, not a fitness-function violation a coordinator can act
 * on. Only ENOENT is translated here — any other hashHarnessVersion failure still propagates unchanged,
 * since silently swallowing those would hide a genuine bug in F28 itself rather than report the
 * legitimate "this family's governing file set doesn't match the tree yet" state this exists to name.
 * Returns { hash: string|null, problems: string[] } — `hash` is null exactly when `problems` is non-empty.
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
          `MISSING GOVERNING FILE — harness family "${family}"'s entry in F28's GOVERNING_FILES names a ` +
            `file that does not exist on the current tree (${err.message}). Land the missing file, or ` +
            `if it was intentionally renamed/removed, correct GOVERNING_FILES.${family} in ` +
            `F28-harness-run-integrity.mjs AND CONVENTION.md's harness_version table in the same commit.`,
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
    'Every scripts/harness-runs/*/*.json artifact validates against CONVENTION.md\'s schema; every ' +
    'registered harness family has ≥1 valid artifact; a family\'s governing files (CONVENTION.md\'s ' +
    'harness_version table) never drift from every recorded run without a newer run or a PENDING-RUN.md ' +
    'acknowledging why; a family with ≥2 artifacts carries a LAST-PROPOSER-PASS.md naming the latest run. ' +
    'The meta-harness layer\'s own enforcement gate (build plan §2): fails CI when a harness family\'s code ' +
    'changed without a run artifact recording why.',
  source: 'META-HARNESS-BUILD-PLAN.md §2 ("Smarter on its own, made structural") and Wave MH-2\'s scope',

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
          `UNKNOWN FAMILY — ${HARNESS_RUNS_REL}/${family}/ is not in run-artifact.mjs's ALLOWED_FAMILIES. ` +
            `Register it there AND add its governing files to F28's GOVERNING_FILES table (and ` +
            `CONVENTION.md's harness_version table), or remove the directory.`,
        );
      }
    }

    // Rule (b) first-run acknowledgment: a zero-artifact family whose PENDING-RUN.md pins the CURRENT
    // governing hash is registered-and-pending, not historyless (see header).
    const acknowledged = new Set();
    for (const family of ALLOWED_FAMILIES) {
      if ((byFamily.get(family)?.valid.length ?? 0) > 0) continue;
      const governing = GOVERNING_FILES[family];
      if (!governing) continue;
      const { hash } = safeHashGoverningFiles(family, governing, join(root, 'fsi-app'));
      const pendingHash = parsePendingRunHash(readIfExists(join(root, HARNESS_RUNS_REL, family, PENDING_RUN_FILE)));
      if (hash && pendingHash && hash === pendingHash) acknowledged.add(family);
    }
    problems.push(...auditFamilyPresence(ALLOWED_FAMILIES, byFamily, acknowledged));

    for (const family of ALLOWED_FAMILIES) {
      const validArtifacts = byFamily.get(family)?.valid ?? [];
      const governing = GOVERNING_FILES[family];
      if (!governing) continue; // defensive; ALLOWED_FAMILIES and GOVERNING_FILES are kept 1:1 by test
      if (validArtifacts.length === 0) continue; // rule (b) already reported; see "KEEP IT HONEST" above

      const { hash: currentHash, problems: hashProblems } = safeHashGoverningFiles(
        family,
        governing,
        join(root, 'fsi-app'),
      );
      if (hashProblems.length) {
        problems.push(...hashProblems);
        continue; // no hash to couple staleness/proposer-attestation checks against for this family this pass
      }
      const pendingPath = join(root, HARNESS_RUNS_REL, family, PENDING_RUN_FILE);
      const pendingContent = readIfExists(pendingPath);
      const pending = { exists: pendingContent != null, hash: parsePendingRunHash(pendingContent) };
      problems.push(...auditStalenessCoupling(family, currentHash, validArtifacts, pending));

      const proposerPassPath = join(root, HARNESS_RUNS_REL, family, PROPOSER_PASS_FILE);
      problems.push(...auditProposerAttestation(family, validArtifacts, readIfExists(proposerPassPath)));
    }

    if (problems.length === 0) return PASS;
    return problems.map((msg) => violation(1, msg));
  },
};
