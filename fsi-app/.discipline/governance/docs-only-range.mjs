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
// CLI: node docs-only-range.mjs --range=<git-range>
//   exit 0  = every changed file in the range matches docs/** or *.md (docs-only)
//   exit 1  = at least one changed file is outside that set (not docs-only) -- including an EMPTY diff,
//             which is treated as "not provably docs-only" rather than vacuously true
//   exit 2  = engine error (bad/missing --range, git failure)
// The changed-file list is printed to stderr either way, for diagnosis; the verdict line goes to stdout
// ("docs-only: true" / "docs-only: false") so a caller can also read it instead of relying on exit code.

import { execFileSync } from 'node:child_process';
import { getRepoRoot } from '../lib/context.mjs';
import { isMainModule } from '../../scripts/lib/is-main.mjs';

/**
 * @param {string} path repo-relative path (either slash convention)
 * @returns {boolean}
 */
export function isDocsOnlyPath(path) {
  const p = String(path ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p) return false;
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
 * @param {string} range a git revision range, e.g. "origin/master..HEAD"
 * @param {string} cwd repo root
 * @returns {string[]} repo-relative changed file paths
 */
export function changedFiles(range, cwd) {
  // --no-renames (GATE-7): a rename is a delete of its SOURCE plus an add of its destination, so code moved
  // into docs/ is classed by where it came from (a code change), not only by where it landed.
  const out = execFileSync('git', ['diff', '--no-renames', '--name-only', range], { cwd, encoding: 'utf8' });
  return out.split(/\r?\n/).filter(Boolean);
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
