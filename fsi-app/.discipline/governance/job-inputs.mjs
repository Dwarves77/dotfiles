// job-inputs.mjs (lane CI-MIN-1, 2026-10-10, ADR-047 decision 5). THE ONE classifier that decides which scoped
// CI jobs a pull request must run. Actions minutes are metered (2,000 per month, spending limit 0), and a pull
// request used to run every job whatever it touched (about 25 runner minutes). A scoped job now runs only when the
// diff touches one of its INPUTS; an untouched job is SKIPPED at job level (an `if` over the outputs of the
// workflow's `inputs` job). A skipped job satisfies branch protection; a job that never reports does not, which is
// why the skip is job-level and never a workflow `paths:` filter (discipline.yml's 2026-08-12 note, R22).
//
// ONE HOME. The job -> input-globs map below is the single source. The workflows read its verdict through this
// file's CLI (`--pr-merge --github-output`), the F52 workflow-shape test reads the SCOPED table to assert every
// scoped job carries the `if` and `needs`, and the consistency backstop prints the skipped set. Nothing else lists
// a job's inputs.
//
// DERIVED, NOT TYPED, WHERE A LIST ALREADY EXISTS. A scoped job's own scripts are read out of its workflow job block
// (the `node scripts/...` and `.discipline/...` tokens on non-comment lines, and the body of any `npm run <name>`
// from package.json), and each script contributes its relative-import closure. A new import inside a detector or the
// rendering guard therefore becomes an input without anyone editing this file. Everything else is a glob.
//
// FAILS TOWARD RUNNING. A false "run" costs one job; a false "skip" skips the gate that guards the change. So an
// empty diff, an unreadable range, a checkout that is not a merge commit, or any git failure marks EVERY job
// touched. A change to this file, its test, or ANY workflow file marks every job touched (a workflow edit can break
// any job, including one whose own inputs it did not name). Every entry also lists its workflow file and
// `.github/actions/**`.
//
// ALWAYS-ON JOBS are never scoped: validate-commits, consistency-backstop, test-discipline-engine and
// fitness-check enforce across the whole tree, so no change can skip every gate (docs-only is the existing
// fast path inside those jobs, docs-only-range.mjs).
//
// CLI: node job-inputs.mjs --pr-merge [--github-output] [--print-unchanged]
//      node job-inputs.mjs --all --github-output   (not a pull request: every scoped job is true)
//      node job-inputs.mjs --range=<git-range> [...]
//   --pr-merge        the pull_request checkout is the merge commit: the diff is HEAD^1..HEAD (the pull request's
//                     effect on its base tip), never HEAD~1. No second parent -> every job runs.
//   --github-output   append `<job_key>=true|false` for every scoped job to $GITHUB_OUTPUT
//   --all             a push or a dispatch: every scoped job is marked touched, no diff is read
//   --print-unchanged print `inputs unchanged: <job id>` for every WIRED scoped job that is skipped (a job whose
//                     workflow does not yet carry the `if` still runs, so it is never reported as skipped)
// Always exits 0 on a classification (a classifier fault marks every job touched); exit 2 only on bad arguments.

import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import { getRepoRoot } from '../lib/context.mjs';
import { isMainModule } from '../../scripts/lib/is-main.mjs';
import { changedFiles } from './docs-only-range.mjs';

/** Jobs that run on every pull request, whatever it touched. */
export const ALWAYS_ON = Object.freeze(['validate-commits', 'consistency-backstop', 'test-discipline-engine', 'fitness-check']);

/** Files whose change marks every scoped job touched (the classifier and its proof). Workflows are matched by prefix. */
export const CLASSIFIER_FILES = Object.freeze([
  'fsi-app/.discipline/governance/job-inputs.mjs',
  'fsi-app/.discipline/governance/job-inputs.test.mjs',
]);
const WORKFLOW_PREFIX = '.github/workflows/';

const NPM_FILES = ['fsi-app/package.json', 'fsi-app/package-lock.json'];
const MIGRATIONS = 'fsi-app/supabase/migrations/**';

/**
 * The scoped jobs. `key` is the workflow output name (the job id with underscores), `workflow` the file that holds
 * the job, `jobId` the job id inside it. `globs` are the job's own inputs beyond its workflow file and
 * `.github/actions/**`; the scripts the job's workflow block runs, and their import closure, are added by
 * buildJobInputs. `wired` is true once the workflow carries the `if` and `needs` (the F52 test reads it).
 */
export const SCOPED = Object.freeze({
  rendering_guard: {
    workflow: 'discipline.yml',
    jobId: 'rendering-guard',
    globs: ['fsi-app/src/**', 'fsi-app/public/**', 'fsi-app/.discipline/rendering/**', ...NPM_FILES],
    wired: true,
  },
  design_audit: {
    workflow: 'design-audit.yml',
    jobId: 'design-audit',
    globs: ['fsi-app/src/**', 'fsi-app/public/**', 'docs/design/**', 'docs/specs/**', 'fsi-app/.discipline/rendering/audit/**', ...NPM_FILES],
    wired: true,
  },
  // migration-proof keeps its in-job scope decision until its workflow test is granted a write (that test asserts
  // "exactly one job" and "no job-level if"); the entry is classified and printed now, wired later.
  migration_proof: {
    workflow: 'migration-proof.yml',
    jobId: 'migration-proof',
    globs: [MIGRATIONS, 'fsi-app/scripts/proof/**'],
    wired: false,
  },
  rls_persona_matrix: {
    workflow: 'rls-persona-matrix.yml',
    jobId: 'rls-persona-matrix',
    globs: [MIGRATIONS, 'fsi-app/scripts/proof/**', 'fsi-app/scripts/verify/attacks/**', 'fsi-app/scripts/verify/fixtures/**', ...NPM_FILES],
    wired: true,
  },
  discrimination_guard: {
    workflow: 'bug-class-guard.yml',
    jobId: 'discrimination-guard',
    globs: ['fsi-app/src/**', ...NPM_FILES],
    wired: true,
  },
  bug_class_scan: {
    workflow: 'bug-class-guard.yml',
    jobId: 'bug-class-scan',
    globs: ['fsi-app/src/**', MIGRATIONS, ...NPM_FILES],
    wired: true,
  },
});

export const SCOPED_KEYS = Object.freeze(Object.keys(SCOPED));

/** The workflow job id of a scoped key (the id printed in `inputs unchanged: <job>`). */
export function jobIdOf(key) {
  return SCOPED[key].jobId;
}

// ---------------------------------------------------------------------------------------------------------------
// Glob matching: `**` any characters (slashes included), `*` anything but a slash, everything else literal.
// ---------------------------------------------------------------------------------------------------------------

/** @param {string} glob @returns {RegExp} */
export function globToRegex(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { out += '.*'; i++; }
    else if (c === '*') out += '[^/]*';
    else out += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** A file that matches `glob`: the glob with its wildcard replaced by a probe name. For the attack test. */
export function sampleFileFor(glob) {
  return glob.replace(/\*\*/g, 'probe/x.txt').replace(/\*/g, 'probe');
}

function normalizePath(p) {
  const s = String(p ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  return s ? posix.normalize(s).replace(/^\.\//, '') : '';
}

// ---------------------------------------------------------------------------------------------------------------
// Derivation: the scripts a job runs, and their relative-import closure.
// ---------------------------------------------------------------------------------------------------------------

/** The text of one job's block in a workflow file (column-2 id to the next column-2 id), comment lines removed. */
export function jobBlockCode(workflowText, jobId) {
  const lines = String(workflowText ?? '').split(/\r?\n/);
  const start = lines.findIndex((l) => l === `  ${jobId}:`);
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i]) || /^\S/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).filter((l) => !/^\s*#/.test(l)).join('\n');
}

const SCRIPT_TOKEN_RE = /(?<![\w./-])((?:fsi-app\/)?(?:scripts|\.discipline)\/[\w./-]+\.(?:mjs|js|sh))/g;

/** Repo-relative script paths a job block names, plus the scripts behind any `npm run <name>`. */
export function scriptsRunBy(blockCode, packageScripts = {}) {
  const found = new Set();
  const add = (text) => {
    for (const m of text.matchAll(SCRIPT_TOKEN_RE)) found.add(m[1].startsWith('fsi-app/') ? m[1] : `fsi-app/${m[1]}`);
  };
  add(blockCode);
  for (const m of blockCode.matchAll(/npm run ([\w:.-]+)/g)) add(String(packageScripts[m[1]] ?? ''));
  return [...found];
}

const IMPORT_RES = [
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g,
  /\bimport\s*['"](\.{1,2}\/[^'"]+)['"]/g,
  /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
];
const RESOLVE_SUFFIXES = ['', '.mjs', '.js', '.ts', '.tsx', '/index.mjs', '/index.js', '/index.ts'];
const FOLLOWED_RE = /\.(?:mjs|js|ts|tsx)$/;

function isFile(abs) {
  try { return statSync(abs).isFile(); } catch { return false; }
}

/**
 * Every repo file reachable from `entries` through relative imports (static, re-export and string-literal dynamic).
 * A bare specifier or an unresolved path contributes nothing.
 * @param {string[]} entries repo-relative
 * @param {string} repoRoot
 * @returns {string[]} repo-relative, sorted, the entries themselves included when they exist
 */
export function importClosure(entries, repoRoot) {
  const seen = new Set();
  const queue = [...entries].map(normalizePath);
  while (queue.length) {
    const rel = queue.pop();
    if (!rel || seen.has(rel)) continue;
    if (!isFile(`${repoRoot}/${rel}`)) continue;
    seen.add(rel);
    if (!FOLLOWED_RE.test(rel)) continue;
    let text;
    try { text = readFileSync(`${repoRoot}/${rel}`, 'utf8'); } catch { continue; }
    for (const re of IMPORT_RES) {
      for (const m of text.matchAll(re)) {
        const base = posix.join(posix.dirname(rel), m[1]);
        const hit = RESOLVE_SUFFIXES.map((s) => normalizePath(base + s)).find((p) => isFile(`${repoRoot}/${p}`));
        if (hit) queue.push(hit);
      }
    }
  }
  return [...seen].sort();
}

function readIfExists(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

/**
 * The job -> input globs map for a checkout. Each value is the list of globs and exact paths that make the job's
 * inputs; the derived parts are read from the repo at `repoRoot`.
 * @param {string} repoRoot
 * @returns {Record<string, string[]>}
 */
export function buildJobInputs(repoRoot) {
  let packageScripts = {};
  try { packageScripts = JSON.parse(readIfExists(`${repoRoot}/fsi-app/package.json`)).scripts ?? {}; } catch { packageScripts = {}; }
  const map = {};
  for (const [key, def] of Object.entries(SCOPED)) {
    const workflowPath = `${WORKFLOW_PREFIX}${def.workflow}`;
    const block = jobBlockCode(readIfExists(`${repoRoot}/${workflowPath}`), def.jobId);
    const derived = importClosure(scriptsRunBy(block, packageScripts), repoRoot);
    map[key] = [...new Set([workflowPath, '.github/actions/**', ...def.globs, ...derived])];
  }
  return map;
}

// ---------------------------------------------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------------------------------------------

/**
 * Which jobs a set of changed files makes the pull request run. PURE given `map`.
 * @param {string[]} files repo-relative changed paths (both sides of a rename)
 * @param {Record<string, string[]>} [map] defaults to the map built from the working repo
 * @returns {{ alwaysOn: string[], touched: string[], unchanged: string[], reason: string }} touched and unchanged
 *   hold scoped KEYS. An empty file list touches every scoped job (fail toward running).
 */
export function jobsTouched(files, map) {
  const inputs = map ?? buildJobInputs(getRepoRoot());
  const list = (files ?? []).map(normalizePath).filter(Boolean);
  const everyKey = Object.keys(inputs);
  if (list.length === 0) return { alwaysOn: [...ALWAYS_ON], touched: everyKey, unchanged: [], reason: 'no changed files readable: every job runs' };
  const trigger = list.find((f) => f.startsWith(WORKFLOW_PREFIX) || CLASSIFIER_FILES.includes(f));
  if (trigger) return { alwaysOn: [...ALWAYS_ON], touched: everyKey, unchanged: [], reason: `${trigger} is a workflow or the classifier: every job runs` };
  const touched = [];
  for (const key of everyKey) {
    const res = inputs[key].map(globToRegex);
    if (list.some((f) => res.some((re) => re.test(f)))) touched.push(key);
  }
  return {
    alwaysOn: [...ALWAYS_ON],
    touched,
    unchanged: everyKey.filter((k) => !touched.includes(k)),
    reason: `${list.length} changed file(s)`,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------

function resolveFiles(args, repoRoot) {
  const rangeArg = args.find((a) => a.startsWith('--range='));
  let range = rangeArg ? rangeArg.slice('--range='.length) : '';
  if (args.includes('--pr-merge')) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD^2'], { cwd: repoRoot, stdio: 'ignore' });
    } catch {
      return { files: [], note: 'the checkout is not a merge commit (no second parent)' };
    }
    range = 'HEAD^1..HEAD';
  }
  if (!range) return { files: [], note: 'no range given' };
  try {
    return { files: changedFiles(range, repoRoot), note: `range ${range}` };
  } catch (err) {
    return { files: [], note: `git diff failed for ${range}: ${String(err.message).split('\n')[0]}` };
  }
}

function main() {
  const args = process.argv.slice(2);
  const known = (a) => a === '--pr-merge' || a === '--all' || a === '--github-output' || a === '--print-unchanged' || a.startsWith('--range=');
  const bad = args.filter((a) => !known(a));
  if (bad.length || !(args.includes('--pr-merge') || args.includes('--all') || args.some((a) => a.startsWith('--range=')))) {
    console.error(`job-inputs: usage: --pr-merge | --all | --range=<git-range> [--github-output] [--print-unchanged]${bad.length ? `; unknown: ${bad.join(' ')}` : ''}`);
    process.exit(2);
  }
  const repoRoot = getRepoRoot();
  const { files, note } = args.includes('--all') ? { files: [], note: 'not a pull request' } : resolveFiles(args, repoRoot);
  let verdict;
  try {
    verdict = jobsTouched(files, buildJobInputs(repoRoot));
  } catch (err) {
    verdict = { alwaysOn: [...ALWAYS_ON], touched: [...SCOPED_KEYS], unchanged: [], reason: `classifier fault, every job runs: ${String(err.message).split('\n')[0]}` };
  }
  console.log(`job-inputs: ${note}; ${verdict.reason}`);
  for (const key of SCOPED_KEYS) console.log(`job-inputs: ${key}=${verdict.touched.includes(key)}`);
  if (args.includes('--print-unchanged')) {
    for (const key of verdict.unchanged.filter((k) => SCOPED[k].wired)) console.log(`inputs unchanged: ${jobIdOf(key)}`);
  }
  if (args.includes('--github-output')) {
    const out = process.env.GITHUB_OUTPUT;
    if (!out) { console.error('job-inputs: --github-output needs $GITHUB_OUTPUT'); process.exit(2); }
    appendFileSync(out, SCOPED_KEYS.map((k) => `${k}=${verdict.touched.includes(k)}\n`).join(''));
  }
  process.exit(0);
}

if (isMainModule(import.meta.url)) main();
