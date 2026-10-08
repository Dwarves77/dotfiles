// docs-only-range.mjs (lane R22, ACTIONS-STORAGE-AND-DOCS-ONLY-PUSH, 2026-10-01). THE ONE shared
// primitive that decides whether a commit range's diff touches only docs/** and *.md files. Both
// fsi-app/.discipline/hooks/pre-push (its docs-only fast path, step -1) and
// .github/workflows/discipline.yml (the SAME filter, in the two heavy jobs) call THIS file so the two
// surfaces cannot drift the way run-test-suite.sh / override-check.mjs / memory-gate.mjs already
// prevent for their own classes (lane-common-contract's own "ONE HOME" precedent). Never duplicate the
// glob logic in shell AND YAML separately.
//
// WHY A PATH FILTER HERE IS SAFE, UNLIKE discipline.yml's OWN REJECTED ONE (2026-08-12 header, "Filtering
// paths was considered and REJECTED: a skipped required check reports neither success nor failure").
// That rejection was about filtering at the WORKFLOW TRIGGER level (`on.push.paths` / `paths-ignore`),
// which stops the job from running at all -- a required check with no run blocks the merge forever. This
// primitive is read INSIDE an already-running job, to skip a SUBSET of that job's own steps; the job
// itself always runs its Checkout/Setup Node steps and reports a real pass/fail, so the required-check
// hazard the 2026-08-12 header warned about does not apply here.
//
// GATE-9 (2026-10-08, AUD-AT-5 DO-1, DO-2, DO-3): the verdict is about WHAT CHANGED, judged from both
// sides of every rename and with the files the heavy gates READ taken out of the fast path.
//   1. A rename is classed by its SOURCE as well as its destination. `git diff --name-only` lists a rename
//      by its new path alone, so `git mv fsi-app/src/lib/api/auth.ts docs/auth-moved.ts` read as a docs
//      change and the heavy steps never ran on code that left its directory (DO-1). changedFiles() reads
//      `--name-status -M -z`, which names both paths of a rename or copy.
//   2. A GOVERNING docs file is never docs-only. The lane contract (closure gate LANE-CONTRACT), the doctrine
//      files the invariant-coverage meta-gate sweeps, any SKILL.md (skill-contract-map pins them), the COMMON
//      terms briefs, PROGRAM-BOARD (closure gate STALE-NEXT) and the maintenance runbook index are INPUTS to
//      the gates this fast path skips. A heading edit to the contract failed the closure gate when it was run
//      directly while this primitive said docs-only (DO-2); a deleted pinned SKILL.md failed
//      skill-contract-map and the meta-gate the same way (DO-3).
//   3. A test, a golden or an executable file under docs/ is code. docs/** is documentation, but a `.mjs`,
//      `.ts`, `.sh` or `.yml` file there is run by something, and a `*.test.*` file is a test whatever
//      directory holds it.
//
// CLI: node docs-only-range.mjs --range=<git-range>
//   exit 0  = every changed file in the range is docs-only (see isDocsOnlyPath)
//   exit 1  = at least one changed file is outside that set (not docs-only) -- including an EMPTY diff,
//             which is treated as "not provably docs-only" rather than vacuously true
//   exit 2  = engine error (bad/missing --range, git failure)
// The changed-file list is printed to stderr either way, for diagnosis; the verdict line goes to stdout
// ("docs-only: true" / "docs-only: false") so a caller can also read it instead of relying on exit code.

import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import { getRepoRoot } from '../lib/context.mjs';
import { isMainModule } from '../../scripts/lib/is-main.mjs';
import { DOCTRINE_FILES } from './doctrine-contradiction.mjs';
import { TEST_FILE_RE } from '../lib/test-discovery.mjs';

/** Code-like extensions: a file with one of these is run, imported or executed by something. */
const CODE_EXTENSION_RE = /\.(?:[cm]?[jt]sx?|sh|bash|yml|yaml|sql|py)$/i;
/** Doctrine and contract files the skipped gates read. Exact paths; the doctrine list is the contradiction
 *  scan's own (reused, never copied). */
const GOVERNING_EXACT = new Set([
  ...DOCTRINE_FILES,
  'docs/dispatches/lane-common-contract.md',
  'docs/plans/complete-system-build-plan-2026-09-04.md',
  'docs/PROGRAM-BOARD.md',
  'docs/runbooks/MAINTENANCE-RUNBOOK.md',
]);
const GOVERNING_PATTERNS = [
  /(?:^|\/)\.claude\/skills\/[^/]+\/SKILL\.md$/,
  /^docs\/runbooks\/maintenance\.d\//,
  /(?:^|\/)(?:brief-)?common[^/]*\.md$/i,
];

function normalize(path) {
  const p = String(path ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p) return '';
  return posix.normalize(p).replace(/^\.\//, '');
}

/**
 * @param {string} path repo-relative path (either slash convention)
 * @returns {boolean} true when the path is a governing docs file: a heavy gate reads it, so it is never docs-only
 */
export function isGoverningDocPath(path) {
  const p = normalize(path);
  if (!p) return false;
  return GOVERNING_EXACT.has(p) || GOVERNING_PATTERNS.some((re) => re.test(p));
}

/**
 * @param {string} path repo-relative path (either slash convention)
 * @returns {boolean}
 */
export function isDocsOnlyPath(path) {
  const p = normalize(path);
  if (!p) return false;
  if (isGoverningDocPath(p)) return false;
  // docs/ holds design handoff scripts (.js, .jsx) that no runner executes; any other code-like file is code.
  const designScript = p.startsWith('docs/') && /\.jsx?$/i.test(p);
  if (TEST_FILE_RE.test(p) || (CODE_EXTENSION_RE.test(p) && !designScript)) return false;
  if (p.startsWith('docs/')) return true;
  if (p.endsWith('.md')) return true;
  return false;
}

/**
 * @param {string[]} files repo-relative paths
 * @returns {boolean} true only when the list is non-empty AND every entry is docs-only
 */
export function isDocsOnlyDiff(files) {
  const list = (files ?? []).map((f) => String(f ?? '').trim()).filter(Boolean);
  if (list.length === 0) return false;
  return list.every(isDocsOnlyPath);
}

/**
 * Parse `git diff --name-status -M -z` output into the flat list of every path the diff names: a rename or
 * copy contributes BOTH its source and its destination, anything else its one path. PURE.
 * @param {string} raw NUL-separated: <status> NUL <path> [NUL <path2>] ...
 * @returns {string[]}
 */
export function parseNameStatusZ(raw) {
  const tokens = String(raw ?? '').split('\0');
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i];
    if (!status) continue;
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    for (let k = 1; k <= pathCount; k++) {
      const p = tokens[i + k];
      if (p) out.push(p.replace(/\\/g, '/'));
    }
    i += pathCount;
  }
  return out;
}

/**
 * @param {string} range a git revision range, e.g. "origin/master..HEAD"
 * @param {string} cwd repo root
 * @returns {string[]} repo-relative changed file paths, both sides of every rename
 */
export function changedFiles(range, cwd) {
  // Both sides of a rename (GATE-7 chose --no-renames for the same end: a rename is a delete of its SOURCE plus an
  // add of its destination, so code moved into docs/ is classed by where it came from).
  const out = execFileSync('git', ['diff', '--name-status', '-M', '-z', range], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return parseNameStatusZ(out);
}

function main() {
  const rangeArg = process.argv.find((a) => a.startsWith('--range='));
  if (!rangeArg || rangeArg.length <= '--range='.length) {
    console.error('docs-only-range: --range=<git-range> is required.');
    process.exit(2);
  }
  const range = rangeArg.slice('--range='.length);
  const repoRoot = getRepoRoot();
  let files;
  try {
    files = changedFiles(range, repoRoot);
  } catch (err) {
    console.error(`docs-only-range: git diff failed for range "${range}": ${err.message}`);
    process.exit(2);
  }
  const docsOnly = isDocsOnlyDiff(files);
  console.error(`docs-only-range: ${files.length} changed file(s) in ${range}:`);
  for (const f of files) console.error(`  ${f}`);
  console.log(`docs-only: ${docsOnly}`);
  process.exit(docsOnly ? 0 : 1);
}

if (isMainModule(import.meta.url)) main();
