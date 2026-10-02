// F68: actions-artifact-budget (lane R22, 2026-10-01, ACTIONS-STORAGE-AND-DOCS-ONLY-PUSH). Why: the
// coordinator measured GitHub Actions storage at 90% of plan on 2026-10-01 -- 311 artifacts, 6.2 GB,
// every one from September, every one of 13 workflows uploading its whole fsi-app/scripts/_snapshots/
// tree (guarded-write row snapshots -- regenerable machine evidence, CLAUDE.md rule 5) at a 90-day
// retention. The coordinator's own cleanup deleted 290 artifacts older than 3 days and got to 0.43 GB;
// this gate makes the regression mechanically impossible to re-introduce, workflow by workflow.
//
// WHAT THIS CHECKS, per `uses: actions/upload-artifact@...` step found in any .github/workflows/*.yml:
//   1. retention-days, if the step sets one, must be <= 7. (A step that sets none inherits the
//      repository's own default; this gate does not reach outside the repo to that setting -- it
//      enforces the explicit value every one of this lane's own edits now sets.)
//   2. the step's `path:` value (inline or block-scalar) must not contain `_snapshots` or `scripts/tmp`
//      anywhere, in any path entry. Both are this repo's own gitignored, regenerable scratch
//      (root .gitignore; CLAUDE.md rule 5's "gitignored scratch ... if regenerable"), never a durable
//      artifact's own content. A workflow that needs a full-trace file to survive past the runner (the
//      forward-events class corpus-turn.yml's own header documents) moves that file under its family's
//      own scripts/harness-runs/<family>/ directory instead -- never back under _snapshots/ or
//      scripts/tmp/, which this gate would then catch again.
//
// PARSING. Line-based, indentation-based text scan, the same convention F52 (workflow-file-validity) and
// F54 (push-gate-npm-parity) already use for this file family -- no YAML parser is a direct dependency of
// this repository. HOLISTIC (enumerate() returns a single sentinel, the F23/F25/F27/F47/F50/F52 precedent)
// so the runner's own file:line columns point at that sentinel, not at the real offending file; every
// real violation message below names the actual file and line itself.
//
// Negative-tested (F68-actions-artifact-budget.test.mjs): a fixture workflow with retention-days: 90
// fails; a fixture with a `_snapshots` path fails; a fixture with a `scripts/tmp` path fails; a fixture
// with retention-days: 7 and a harness-runs-only path passes.

import { readdirSync } from 'node:fs';
import { violation } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { readFile } from '../lib/file-content.mjs';

const RETENTION_BUDGET_DAYS = 7;
const FORBIDDEN_PATH_SUBSTRINGS = ['_snapshots', 'scripts/tmp'];

function indentOf(line) {
  return line.match(/^( *)/)[1].length;
}

/**
 * List every .github/workflows/*.yml file, repo-relative, sorted for determinism.
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function listWorkflowFiles(repoRoot) {
  const dir = `${repoRoot}/.github/workflows`;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => `.github/workflows/${f}`)
    .sort();
}

/**
 * Every `uses: actions/upload-artifact@...` step in a workflow file's text: for each, the step's own
 * `retention-days:` value (number, or null when the step sets none) and `path:` value (raw string, inline
 * or the joined body of a block scalar), plus the 1-based line each was found on (-1 when absent). PURE:
 * takes text, returns plain data, never touches the filesystem.
 * @param {string} text
 * @returns {{usesLine: number, retentionDays: number|null, retentionDaysLine: number, pathValue: string, pathLine: number}[]}
 */
export function extractUploadArtifactSteps(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const steps = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*uses:\s*actions\/upload-artifact@/.test(lines[i])) continue;
    const propIndent = indentOf(lines[i]);

    // `with:` is a sibling property of `uses:` at the same indent, somewhere later in this same step's
    // property block (before the block dedents past propIndent, which ends the step).
    let withLine = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === '') continue;
      const ind = indentOf(lines[j]);
      if (ind < propIndent) break;
      if (ind === propIndent && /^\s*with:\s*$/.test(lines[j])) {
        withLine = j;
        break;
      }
    }

    let retentionDays = null;
    let retentionDaysLine = -1;
    let pathValue = '';
    let pathLine = -1;

    if (withLine !== -1) {
      const childIndent = propIndent + 2;
      for (let j = withLine + 1; j < lines.length; j++) {
        const line = lines[j];
        if (line.trim() === '') continue;
        const ind = indentOf(line);
        if (ind < childIndent) break;
        if (ind !== childIndent) continue;

        const rdMatch = line.match(/^\s*retention-days:\s*(\d+)\s*$/);
        if (rdMatch) {
          retentionDays = Number(rdMatch[1]);
          retentionDaysLine = j;
          continue;
        }

        const pathMatch = line.match(/^\s*path:\s*(.*)$/);
        if (pathMatch) {
          pathLine = j;
          const inline = pathMatch[1].trim();
          if (inline && !['|', '>', '|-', '>-', '|+', '>+'].includes(inline)) {
            pathValue = inline;
          } else {
            // Block scalar: collect every more-indented line until the block dedents.
            const bodyIndent = childIndent + 2;
            const collected = [];
            for (let k = j + 1; k < lines.length; k++) {
              if (lines[k].trim() === '') {
                collected.push('');
                continue;
              }
              if (indentOf(lines[k]) < bodyIndent) break;
              collected.push(lines[k].trim());
            }
            pathValue = collected.join('\n');
          }
        }
      }
    }

    steps.push({ usesLine: i, retentionDays, retentionDaysLine, pathValue, pathLine });
  }
  return steps;
}

/**
 * Pure comparison core: evaluate every upload-artifact step extracted from one file's text against the
 * budget. Returns plain-string violation messages (never throws, never touches the filesystem).
 * @param {string} file
 * @param {string} text
 * @returns {string[]}
 */
export function evaluateArtifactBudget(file, text) {
  const out = [];
  for (const step of extractUploadArtifactSteps(text)) {
    if (step.retentionDays !== null && step.retentionDays > RETENTION_BUDGET_DAYS) {
      out.push(
        `${file}:${step.retentionDaysLine + 1}: F68 retention-days: ${step.retentionDays} exceeds the ` +
          `${RETENTION_BUDGET_DAYS}-day Actions-storage budget (docs/runbooks/fleet-budget-control.md).`,
      );
    }
    for (const bad of FORBIDDEN_PATH_SUBSTRINGS) {
      if (step.pathValue.includes(bad)) {
        out.push(
          `${file}:${step.pathLine + 1}: F68 upload-artifact path references '${bad}' -- regenerable ` +
            `scratch (CLAUDE.md rule 5) must not ride the Actions artifact store; narrow to the run's own ` +
            `harness artifact (scripts/harness-runs/<family>/) and any log the step writes.`,
        );
      }
    }
  }
  return out;
}

export const fitnessFunction = {
  id: 'F68',
  name: 'actions-artifact-budget',
  description:
    'Every actions/upload-artifact step in every .github/workflows/*.yml file: retention-days (when set) ' +
    'must be <= 7, and the path: value must never contain _snapshots or scripts/tmp (gitignored, ' +
    'regenerable scratch per CLAUDE.md rule 5). Closes the class measured 2026-10-01: 311 artifacts, ' +
    '6.2 GB, 13 workflows each uploading the whole fsi-app/scripts/_snapshots/ tree at 90-day retention.',
  source: 'lane R22 (ACTIONS-STORAGE-AND-DOCS-ONLY-PUSH), 2026-10-01, operator-approved remediation plan.',

  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F68-actions-artifact-budget.mjs'];
  },

  check() {
    const out = [];
    const repoRoot = getRepoRoot();
    for (const file of listWorkflowFiles(repoRoot)) {
      const text = readFile(file);
      if (text === null) {
        out.push(violation(1, `${file}: F68 could not be read (missing?).`));
        continue;
      }
      for (const message of evaluateArtifactBudget(file, text)) out.push(violation(1, message));
    }
    return out;
  },
};
