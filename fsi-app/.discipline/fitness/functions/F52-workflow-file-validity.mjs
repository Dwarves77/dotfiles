// F52: workflow-file-validity (lane F52, 2026-09-20). Why: [CONFIRMED 2026-09-20, GitHub run
// 35533637184] Lane M9d put `${{ runner.temp }}` in a job-level `env:` of
// .github/workflows/producers.yml. The `runner` context exists only inside steps, so GitHub refused the
// file: the workflow "failed" with zero jobs on the branch push. The lane's locked push gate PASSED and
// PR #756's required checks were green or going green: nothing in pre-push or CI validated workflow
// files, and the coordinator's runner would have merged a dead workflow. This gate closes that hole for
// the five structural defects a workflow author can commit that GitHub itself would refuse or silently
// misinterpret, WITHOUT depending on a real YAML parser (none is a direct dependency of this repository -
// see ../lib/yml-read.mjs's own header) and without duplicating a full linter (item 2 of brief-f52.md
// wires actionlint into CI for that; this gate is a fast, dependency-free floor that also runs in the
// no-npm test suite).
//
// SCOPE, HONESTLY. This is a line-based, indentation-based text scan, not a YAML parser. It assumes the
// 2-space block-style indentation every workflow and action file in this repository actually uses today
// (jobs: at column 0, a job id at column 2, job properties at column 4, a step item's dash at column 6,
// a step property at column 8). A workflow file written with a different indentation width, flow-style
// mappings for these particular keys, or multi-line block-scalar env/if values would not be read
// correctly by this scanner. actionlint (item 2) is the real parser; this gate is the fast, dependency-
// free floor that also runs in the no-npm suite and catches the M9d class specifically.
//
// FIVE CHECKS (brief-f52.md item 1), each producing a violation message that itself names the file, the
// line, and the check letter (a-e), because this function is HOLISTIC (enumerate() returns a single
// sentinel per the F23/F25/F27/F47/F50 precedent) so the runner's own file:line columns point at that
// sentinel, not at the real offending file.
//   a. the file parses (readable, non-empty) and: a workflow file has a top-level `on:` and at least one
//      job with `runs-on:` or `uses:`; an action.yml file has a `runs:` block with a `using:` value.
//   b. a workflow-level or job-level `env:` entry's value may reference only github, needs, strategy,
//      matrix, vars, secrets, inputs - never runner, env, steps or job (the M9d class itself: `runner`
//      does not exist until a step runs).
//   c. a job-level `if:` may not reference `steps.` or `runner.` (same non-existence-until-a-step-runs
//      class as (b), for the job's own gate condition).
//   d. every `needs:` entry names a job that exists in the same file; every `steps.<id>.outputs`
//      reference inside a job names a step `id:` that exists in THAT SAME job.
//   e. every `workflow_run:` trigger's `workflows:` list entry names some workflow's own top-level
//      `name:` field, somewhere in the tree.
//
// actionlint, locally, when on PATH (brief item 2's local half; CI runs it as its own PINNED,
// checksum-verified step instead - .github/workflows/discipline.yml's fitness-check job, after "Run
// fitness functions": downloads a named actionlint release archive, verifies it against the sha256 read
// verbatim from that release's own checksums file, then runs it over .github/workflows/ with no -ignore
// and no `|| true`): never a false red (a real actionlint finding is a violation), never a silent skip
// (its absence here prints a one-line notice, not nothing).
//
// ON A REFUSAL (what to do when this gate or the CI actionlint step fails a PR): fix the CAUSE in the
// offending workflow/action file, never widen this gate's allowed contexts, never add a per-line
// suppression, and never add an actionlint `-ignore` pattern for a NEW finding (an `-ignore` entry is
// reserved for a pre-existing finding on master that a lane could not fix in its own write set, dated and
// naming the owner lane - see RD-77's residual). A real finding here means the workflow file itself is
// wrong, not that the gate is too strict; this class of defect (a file GitHub silently refuses, wired but
// broken) is exactly what left PR #756 green while shipping a dead workflow.
//
// Invariant RD-77 (.discipline/governance/invariants.d/RD-77.mjs) registers this gate; documentation
// lives here and there rather than in a shared runbook (2026-09-20 correction: an earlier draft of this
// lane added a section to docs/runbooks/CORPUS-TURN-RUNBOOK.md, which F51 (no-shared-append)'s hotspot
// check correctly refused as that runbook's third touch inside its churn window - a shared append point,
// not a place for this lane's own documentation).

import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { violation } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { readFile } from '../lib/file-content.mjs';
import { extractWorkflowRunNames, extractWorkflowName } from '../lib/yml-read.mjs';

const JOB_ID_INDENT = 2;
const JOB_PROP_INDENT = 4;
const STEP_PROP_INDENT = 8;

const ALLOWED_ENV_CONTEXTS = ['github', 'needs', 'strategy', 'matrix', 'vars', 'secrets', 'inputs'];
const FORBIDDEN_ENV_CONTEXTS = ['runner', 'env', 'steps', 'job'];

function indentOf(line) {
  return line.match(/^( *)/)[1].length;
}

function toLines(text) {
  return text.split(/\r?\n/);
}

/**
 * List every `.github/workflows/*.yml` and `.github/actions/<name>/action.yml` file, repo-relative,
 * sorted for determinism.
 * @param {string} repoRoot
 * @returns {{path: string, kind: 'workflow'|'action'}[]}
 */
export function listWorkflowAndActionFiles(repoRoot) {
  const out = [];
  const wfDir = `${repoRoot}/.github/workflows`;
  if (existsSync(wfDir)) {
    for (const f of readdirSync(wfDir)) {
      if (f.endsWith('.yml') || f.endsWith('.yaml')) {
        out.push({ path: `.github/workflows/${f}`, kind: 'workflow' });
      }
    }
  }
  const actDir = `${repoRoot}/.github/actions`;
  if (existsSync(actDir)) {
    for (const name of readdirSync(actDir)) {
      const rel = `.github/actions/${name}/action.yml`;
      if (existsSync(`${repoRoot}/${rel}`)) out.push({ path: rel, kind: 'action' });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Extract each top-level job from a workflow file's lines: { id, idLine (0-based), startLine, endLine }.
 * endLine is inclusive. Assumes `jobs:` at column 0 and job ids at column 2 (JOB_ID_INDENT), the
 * convention every workflow file in this repository uses.
 * @param {string[]} lines
 * @returns {{id: string, idLine: number, startLine: number, endLine: number}[]}
 */
export function extractJobs(lines) {
  const jobsIdx = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsIdx === -1) return [];
  const jobs = [];
  for (let i = jobsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const indent = indentOf(line);
    if (indent < JOB_ID_INDENT) break; // dedented past the whole jobs: block
    if (indent === JOB_ID_INDENT) {
      const m = line.match(/^ {2}([A-Za-z0-9_.-]+):/);
      if (!m) continue;
      if (jobs.length) jobs[jobs.length - 1].endLine = i - 1;
      jobs.push({ id: m[1], idLine: i, startLine: i, endLine: lines.length - 1 });
    }
  }
  return jobs;
}

/**
 * Job-level (column JOB_PROP_INDENT) direct properties of a job: { key, line, valueInline }.
 * @param {{startLine: number, endLine: number}} job
 * @param {string[]} lines
 */
export function jobPropertyLines(job, lines) {
  const props = [];
  const re = new RegExp(`^ {${JOB_PROP_INDENT}}([A-Za-z0-9_.-]+):\\s*(.*)$`);
  for (let i = job.startLine + 1; i <= job.endLine; i++) {
    const line = lines[i];
    if (line.trim() === '' || /^\s*#/.test(line)) continue;
    if (indentOf(line) !== JOB_PROP_INDENT) continue;
    const m = line.match(re);
    if (m) props.push({ key: m[1], line: i, valueInline: m[2] });
  }
  return props;
}

/**
 * Entries of a block-style mapping (`env:` etc) that starts at `headerLine` with `headerIndent`.
 * Returns entries at headerIndent+2, stopping at the first line whose indent is <= headerIndent.
 * @param {string[]} lines
 * @param {number} headerLine
 * @param {number} headerIndent
 * @returns {{key: string, value: string, line: number}[]}
 */
export function extractBlockEntries(lines, headerLine, headerIndent) {
  const childIndent = headerIndent + 2;
  const entries = [];
  const re = new RegExp(`^ {${childIndent}}([A-Za-z0-9_.-]+):\\s*(.*)$`);
  for (let i = headerLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const indent = indentOf(line);
    if (indent <= headerIndent) break;
    if (/^\s*#/.test(line)) continue;
    if (indent === childIndent) {
      const m = line.match(re);
      if (m) entries.push({ key: m[1], value: m[2], line: i });
    }
  }
  return entries;
}

/**
 * Parse a `needs:` value into job ids, whether written inline (`[a, b]`) or as a block list starting on
 * the following lines (`- a` / `- b`) at propIndent+2.
 * @param {string[]} lines
 * @param {{line: number, valueInline: string}} prop
 * @param {number} propIndent
 * @returns {string[]}
 */
export function parseNeedsIds(lines, prop, propIndent) {
  const inline = prop.valueInline.trim();
  if (inline.startsWith('[')) {
    const inner = inline.slice(1, inline.indexOf(']') === -1 ? undefined : inline.indexOf(']'));
    return inner
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  if (inline) return [inline.replace(/^["']|["']$/g, '')]; // needs: single-job-name (no brackets)
  const childIndent = propIndent + 2;
  const ids = [];
  const re = new RegExp(`^ {${childIndent}}-\\s*(.+)$`);
  for (let i = prop.line + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const indent = indentOf(line);
    if (indent < childIndent) break;
    if (indent === childIndent) {
      const m = line.match(re);
      if (m) ids.push(m[1].trim().replace(/^["']|["']$/g, ''));
    }
  }
  return ids;
}

/**
 * Every `id:` step field defined inside a job's own line range (job.startLine..job.endLine), at
 * STEP_PROP_INDENT (a step's own property level - "        id: foo" or the inline "- id: foo" dash form).
 * @param {{startLine: number, endLine: number}} job
 * @param {string[]} lines
 * @returns {Set<string>}
 */
export function stepIdsInJob(job, lines) {
  const ids = new Set();
  const re = new RegExp(`^ {${STEP_PROP_INDENT - 2}}- id:\\s*(\\S+)|^ {${STEP_PROP_INDENT}}id:\\s*(\\S+)`);
  for (let i = job.startLine + 1; i <= job.endLine; i++) {
    const m = lines[i].match(re);
    if (m) ids.add((m[1] || m[2]).trim());
  }
  return ids;
}

/**
 * Every `steps.<id>.outputs` id referenced anywhere inside a job's own line range, deduped, in order of
 * first appearance.
 * @param {{startLine: number, endLine: number}} job
 * @param {string[]} lines
 * @returns {{id: string, line: number}[]}
 */
export function stepOutputReferencesInJob(job, lines) {
  const out = [];
  const seen = new Set();
  const re = /steps\.([A-Za-z0-9_.-]+)\.outputs\b/g;
  for (let i = job.startLine; i <= job.endLine; i++) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(lines[i]))) {
      const key = `${m[1]}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: m[1], line: i });
    }
  }
  return out;
}

function forbiddenContextIn(value) {
  const re = /\$\{\{\s*([A-Za-z][A-Za-z0-9_]*)\./g;
  let m;
  while ((m = re.exec(value))) {
    if (FORBIDDEN_ENV_CONTEXTS.includes(m[1])) return m[1];
  }
  // `if:` values may omit the `${{ }}` wrapper entirely (GitHub Actions allows a bare expression there).
  const bareRe = /\b(steps|runner)\./;
  const bareM = value.match(bareRe);
  if (bareM) return bareM[1];
  return null;
}

function checkA(file, kind, text, lines, out) {
  if (!text.trim()) {
    out.push(violation(1, `${file}: F52a the file is empty.`));
    return;
  }
  if (kind === 'action') {
    if (!/^runs:\s*$/m.test(text)) {
      out.push(violation(1, `${file}: F52a an action.yml has no top-level 'runs:' block.`));
      return;
    }
    if (!/^\s*using:\s*\S+/m.test(text)) {
      out.push(violation(1, `${file}: F52a an action.yml's 'runs:' block has no 'using:' value.`));
    }
    return;
  }
  if (!/^on:/m.test(text)) {
    out.push(violation(1, `${file}:1: F52a a workflow file has no top-level 'on:' trigger.`));
  }
  const jobs = extractJobs(lines);
  if (jobs.length === 0) {
    out.push(violation(1, `${file}:1: F52a a workflow file's 'jobs:' block defines no job.`));
    return;
  }
  const hasRunnable = jobs.some((job) =>
    jobPropertyLines(job, lines).some((p) => p.key === 'runs-on' || p.key === 'uses'),
  );
  if (!hasRunnable) {
    out.push(
      violation(
        1,
        `${file}:${jobs[0].idLine + 1}: F52a no job has 'runs-on:' or 'uses:' (GitHub would refuse this file).`,
      ),
    );
  }
}

function checkBEnvBlock(file, lines, headerLine, headerIndent, levelLabel, out) {
  for (const entry of extractBlockEntries(lines, headerLine, headerIndent)) {
    const ctx = forbiddenContextIn(entry.value);
    if (ctx) {
      out.push(
        violation(
          1,
          `${file}:${entry.line + 1}: F52b ${levelLabel} env.${entry.key} references '${ctx}.', ` +
            `which does not exist at ${levelLabel} evaluation time (only ${ALLOWED_ENV_CONTEXTS.join(', ')} do).`,
        ),
      );
    }
  }
}

function checkB(file, kind, lines, jobs, out) {
  if (kind !== 'workflow') return;
  const wfEnvLine = lines.findIndex((l) => /^env:\s*$/.test(l));
  if (wfEnvLine !== -1) checkBEnvBlock(file, lines, wfEnvLine, 0, 'workflow-level', out);
  for (const job of jobs) {
    const envProp = jobPropertyLines(job, lines).find((p) => p.key === 'env' && p.valueInline === '');
    if (envProp) checkBEnvBlock(file, lines, envProp.line, JOB_PROP_INDENT, 'job-level', out);
  }
}

function checkC(file, kind, lines, jobs, out) {
  if (kind !== 'workflow') return;
  for (const job of jobs) {
    const ifProp = jobPropertyLines(job, lines).find((p) => p.key === 'if');
    if (!ifProp) continue;
    const ctx = forbiddenContextIn(ifProp.valueInline);
    if (ctx) {
      out.push(
        violation(
          1,
          `${file}:${ifProp.line + 1}: F52c job '${job.id}'s if: references '${ctx}.', which does not ` +
            `exist at job-if evaluation time.`,
        ),
      );
    }
  }
}

function checkD(file, kind, lines, jobs, out) {
  if (kind !== 'workflow') return;
  const jobIds = new Set(jobs.map((j) => j.id));
  for (const job of jobs) {
    const needsProp = jobPropertyLines(job, lines).find((p) => p.key === 'needs');
    if (needsProp) {
      for (const neededId of parseNeedsIds(lines, needsProp, JOB_PROP_INDENT)) {
        if (!jobIds.has(neededId)) {
          out.push(
            violation(
              1,
              `${file}:${needsProp.line + 1}: F52d job '${job.id}' needs '${neededId}', which is not a job in this file.`,
            ),
          );
        }
      }
    }
    const definedStepIds = stepIdsInJob(job, lines);
    for (const ref of stepOutputReferencesInJob(job, lines)) {
      if (!definedStepIds.has(ref.id)) {
        out.push(
          violation(
            1,
            `${file}:${ref.line + 1}: F52d job '${job.id}' references steps.${ref.id}.outputs, but no ` +
              `step with id: ${ref.id} exists in this job.`,
          ),
        );
      }
    }
  }
}

function checkE(file, kind, text, allWorkflowNames, out) {
  if (kind !== 'workflow') return;
  const names = extractWorkflowRunNames(text);
  if (!names) return;
  names.forEach((name, idx) => {
    if (!allWorkflowNames.has(name)) {
      const lineIdx = text.split(/\r?\n/).findIndex((l) => l.includes(name));
      out.push(
        violation(
          1,
          `${file}:${lineIdx === -1 ? 1 : lineIdx + 1}: F52e workflow_run names "${name}" (entry ${idx + 1}), ` +
            `which is not any workflow's own 'name:' in this tree.`,
        ),
      );
    }
  });
}

function runActionlintIfAvailable(repoRoot, out) {
  try {
    execFileSync('actionlint', ['-version'], { cwd: repoRoot, stdio: 'pipe' });
  } catch {
    console.log('  [F52] actionlint not on PATH, skipped locally; CI runs it.');
    return;
  }
  try {
    execFileSync('actionlint', [], { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' });
  } catch (err) {
    const output = String(err.stdout || err.message || '').trim();
    if (output) {
      for (const line of output.split(/\r?\n/)) {
        if (line.trim()) out.push(violation(1, `actionlint: F52-actionlint ${line.trim()}`));
      }
    } else {
      out.push(violation(1, `actionlint: F52-actionlint exited non-zero with no output (exit ${err.status}).`));
    }
  }
}

export const fitnessFunction = {
  id: 'F52',
  name: 'workflow-file-validity',
  description:
    'Every .github/workflows/*.yml and .github/actions/*/action.yml file is checked against five ' +
    'structural rules GitHub itself would refuse or misinterpret: (a) parses, has on: and a runnable ' +
    'job / an action has runs.using; (b) a workflow- or job-level env: value never references runner., ' +
    'env., steps. or job. (the M9d class); (c) a job-level if: never references steps. or runner.; ' +
    '(d) every needs: names a real job and every steps.<id>.outputs reference names a real step id in ' +
    'the same job; (e) a workflow_run trigger names a real workflow. Also runs actionlint locally when ' +
    'it is on PATH (CI runs it as its own pinned step - see .github/workflows/discipline.yml).',
  source:
    'brief-f52.md (lane F52, 2026-09-20), after lane M9d\'s ${{ runner.temp }} job-level env: broke ' +
    '.github/workflows/producers.yml (GitHub run 35533637184) and every existing gate passed it anyway.',

  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F52-workflow-file-validity.mjs'];
  },

  check() {
    const out = [];
    const repoRoot = getRepoRoot();
    const files = listWorkflowAndActionFiles(repoRoot);

    const allWorkflowNames = new Set();
    for (const f of files) {
      if (f.kind !== 'workflow') continue;
      const text = readFile(f.path);
      if (text === null) continue;
      const name = extractWorkflowName(text);
      if (name) allWorkflowNames.add(name);
    }

    for (const f of files) {
      const text = readFile(f.path);
      if (text === null) {
        out.push(violation(1, `${f.path}: F52a could not be read (missing?).`));
        continue;
      }
      const lines = toLines(text);
      checkA(f.path, f.kind, text, lines, out);
      const jobs = extractJobs(lines);
      checkB(f.path, f.kind, lines, jobs, out);
      checkC(f.path, f.kind, lines, jobs, out);
      checkD(f.path, f.kind, lines, jobs, out);
      checkE(f.path, f.kind, text, allWorkflowNames, out);
    }

    runActionlintIfAvailable(repoRoot, out);

    return out;
  },
};
