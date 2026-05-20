// Rule 012: Hardcoded user-home path
// Source: Sprint Foundation incident response 2026-05-20 (OBS-59)
//
// Mechanical content-level check. Complements the attestation-rule layer
// (rules 001-011) by reading the actual bytes of every staged code file
// and rejecting commits that contain hardcoded user-home path strings.
// The class of bug that produced REPO_ROOT hardcoding (lib/context.mjs,
// runner.mjs, runner.test.mjs, rule 009 in Sprint Foundation Waves 0-2)
// is now caught at commit time regardless of operator or agent discipline.
//
// Trigger: any commit that stages at least one code file in a relevant path.
// Check:   read each staged code file's content; FAIL on match for any of the
//          four patterns expressed in HARDCODED_PATH_RE below (Windows user-home
//          paths, Git Bash translated paths, and this operator's Unix/macOS
//          home directory). Report file:line:matched-text for every violation.
//          The literal patterns are intentionally not enumerated in this comment
//          block so the rule does not flag its own documentation.

import { pass, fail, skip } from '../lib/result.mjs';

// Regex matches operator's specified pattern set per Sprint Foundation
// incident response. Asymmetric by design: Windows variants match any user
// (broad enough to catch the OS layout); Unix variants match the operator's
// username specifically (narrow enough to avoid false positives on
// legitimate test paths like /home/runner/ on GitHub Actions).
const HARDCODED_PATH_RE = /C:[\\/]Users[\\/]|\/c\/Users\/|\/home\/jason\/|\/Users\/jason\//g;

const CODE_EXTENSIONS = ['.mjs', '.ts', '.tsx', '.js', '.json', '.yml', '.yaml', '.sh', '.sql'];

// Path fragments that exempt a file from the check. Conservative list:
// - node_modules/    third-party code, not maintained here
// - .git/            internal git state
// - scripts/tmp/     operator scratch space (per existing convention; many historical hardcoded paths)
const SKIP_PATH_FRAGMENTS = ['node_modules/', '.git/', 'fsi-app/scripts/tmp/'];

function isCodeFile(path) {
  const lower = path.toLowerCase();
  return CODE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isSkippedPath(path) {
  const normalized = path.replaceAll('\\', '/');
  return SKIP_PATH_FRAGMENTS.some((frag) => normalized.includes(frag));
}

function relevantFiles(ctx) {
  return ctx.stagedFiles.filter((f) => {
    if (f.status === 'D') return false; // deletions have no content to scan
    if (!isCodeFile(f.path)) return false;
    if (isSkippedPath(f.path)) return false;
    return true;
  });
}

export const rule = {
  id: '012',
  name: 'Hardcoded user-home path',
  description: 'Code files must not contain hardcoded user-home paths. Use getRepoRoot(), os.homedir(), or os.tmpdir() instead.',
  ruleSource: 'Sprint Foundation incident response 2026-05-20 (OBS-59); REPO_ROOT class issue',

  trigger(ctx) {
    if (ctx.isMergeCommit) return false;
    if (ctx.isRevertCommit) return false;
    return relevantFiles(ctx).length > 0;
  },

  check(ctx) {
    const violations = [];

    for (const file of relevantFiles(ctx)) {
      const content = ctx.getFileContent(file.path);
      if (content === null || content === undefined) continue;

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        HARDCODED_PATH_RE.lastIndex = 0;
        let match;
        while ((match = HARDCODED_PATH_RE.exec(line)) !== null) {
          violations.push({
            path: file.path,
            lineNumber: i + 1,
            matchedText: match[0],
            lineSnippet: line.length > 120 ? line.slice(0, 117) + '...' : line,
          });
          // Cap per-line matches to avoid runaway output on pathological lines
          if (violations.filter((v) => v.path === file.path && v.lineNumber === i + 1).length >= 3) break;
        }
      }
    }

    if (violations.length === 0) return pass();

    const displayed = violations.slice(0, 10);
    const remainder = violations.length - displayed.length;

    return fail({
      message: `Hardcoded user-home path(s) detected in ${violations.length} location(s).`,
      remediation: [
        'Replace hardcoded user-home paths with runtime-discovered values:',
        '  - Repo root: import { getRepoRoot } from "../lib/context.mjs" (resolves git rev-parse --show-toplevel; honors DISCIPLINE_REPO_ROOT)',
        '  - Home dir:  os.homedir() or process.env.HOME',
        '  - Temp dir:  os.tmpdir()',
        '  - Module dir (in .mjs): import.meta.dirname',
        'Violations:',
        ...displayed.map((v) => `    ${v.path}:${v.lineNumber}  matched "${v.matchedText}"  in: ${v.lineSnippet.trim()}`),
        remainder > 0 ? `    ... and ${remainder} more` : null,
        'Emergency bypass: git commit --no-verify (Phase 6 will surface bypass usage in audits)',
      ].filter(Boolean).join('\n  '),
    });
  },
};

// Exported for unit tests that want to assert regex behavior independently.
export const _HARDCODED_PATH_RE = HARDCODED_PATH_RE;
export const _CODE_EXTENSIONS = CODE_EXTENSIONS;
export const _SKIP_PATH_FRAGMENTS = SKIP_PATH_FRAGMENTS;
