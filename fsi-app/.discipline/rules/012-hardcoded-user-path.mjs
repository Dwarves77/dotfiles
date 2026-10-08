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
// Check:   FAIL on a match for any of the patterns expressed in HARDCODED_PATH_SOURCE below
//          (Windows user-home paths, Git Bash translated paths, and this operator's Unix/macOS
//          home directory) on a line the commit INTRODUCES. Report file:line:matched-text for
//          every violation. The literal patterns are intentionally not enumerated in this comment
//          block so the rule does not flag its own documentation.
//
// SCOPE (lane GATE-1, 2026-10-08): introduced lines, not the whole file. The rule used to read every
// staged file in full, so a path string anywhere in a file failed the commit that touched any other
// line of it. A line counts only when the pattern is absent from the removed line it replaces in the
// diff (an edited line that already carried it passes) and the line was not moved from elsewhere in the
// same diff. Both come from ctx.introducedLines (lib/context.mjs), one git diff per run.
//
// HONEST FORMS (lane GATE-7, 2026-10-08, attacks A012-1 to A012-10 of the AUD-AT-3 register). The pattern is
// read on the line with adjacent string literals folded together (a path split across a plus sign is the same
// path), accepts a doubled separator (the JS-escaped form of a Windows path), any drive letter in either case,
// a percent-encoded separator, and the two-argument join form; the extension list covers the module and script
// extensions the repo and its tooling use; the exempt prefixes are anchored to the START of the path (a
// directory named node_modules deep in the tree is not the install); and an edit that ADDS a second path to a
// line that already carried one is charged for the surplus (introducedMatches' extract argument). A file git
// does not diff as text is rule 023's finding, not a blind spot here.

import { pass, fail } from '../lib/result.mjs';
import { introducedMatches } from '../lib/context.mjs';
import { foldStringConcat } from '../lib/mask-source.mjs';

// The pattern set per the Sprint Foundation incident response. Asymmetric by design: the Windows variants
// match any user (broad enough to catch the OS layout); the Unix variants match the operator's username
// specifically (narrow enough to avoid false positives on legitimate test paths like /home/runner/ on
// GitHub Actions). The drive letter is any letter in either case and must not follow a word character (so a
// URL scheme such as https: never reads as a drive); a separator is one or more slashes or backslashes (a JS
// string writes a Windows path with a doubled backslash) or a percent-encoded one; the join form is the
// two-argument path.join of a drive and the Users directory.
const SEP = String.raw`(?:[\\/]+|%5[Cc]|%2[Ff])`;
const HARDCODED_PATH_SOURCE = [
  String.raw`(?<![A-Za-z0-9_])[A-Za-z]:${SEP}Users${SEP}`,
  String.raw`(?<![A-Za-z0-9_])[A-Za-z]:[\\/]*["'\x60]\s*,\s*["'\x60]Users\b`,
  // Written with escaped slashes so this file's own lines are not the literal paths the rule forbids.
  String.raw`\/c\/Users\/`,
  String.raw`\/home\/jason\/`,
  String.raw`\/Users\/jason\/`,
].join('|');
const HARDCODED_PATH_RE = new RegExp(HARDCODED_PATH_SOURCE, 'gi');

const CODE_EXTENSIONS = [
  '.mjs', '.cjs', '.mts', '.cts', '.ts', '.tsx', '.js', '.jsx', '.json', '.yml', '.yaml', '.sh', '.sql', '.ps1', '.py', '.toml',
];

// Path prefixes that exempt a file from the check, matched at the START of the repo-relative path (GATE-7:
// a substring match exempted fake_node_modules/ and a committed src/node_modules/ alike). Conservative list:
// - node_modules/          third-party code, not maintained here
// - .git/                  internal git state
// - scripts/tmp/           operator scratch space (per existing convention; many historical hardcoded paths)
// - .claude/settings.local.json  Claude Code PERMISSION ALLOWLIST: by design it holds absolute
//                          user-home Read()/Bash() grant globs (a permission scope literally naming a
//                          home-dir path). These are permission scopes, not repo-root/module paths the rule targets;
//                          they cannot be runtime-resolved. Exempted 2026-07-11 (Wave-alpha Track E) so
//                          editing the file, e.g. removing dead grants, doesn't trip on pre-existing
//                          legitimate grants. settings.json (shared, checked-in) is NOT exempt.
// - fsi-app/scripts/_snapshots/  Rule-015 reversibility evidence and population-turn traces: verbatim
//                          CAPTURED THIRD-PARTY CONTENT (census-rows*.json carry `captured_text` /
//                          `result_content`), never code. The first false positive was PR #562
//                          (2026-09-04): the EU Publications Office's own OJ fmx.xml metadata for
//                          L 2023/2463 carries a Windows path of ITS author's machine, and the grounding
//                          pool must stay byte-exact (ADR-016; `validate_item_provenance` matches spans
//                          verbatim), so the content cannot be rewritten to satisfy a code rule.
const SKIP_PATH_FRAGMENTS = [
  'node_modules/', 'fsi-app/node_modules/', '.git/', 'fsi-app/scripts/tmp/', '.claude/settings.local.json', 'fsi-app/scripts/_snapshots/',
];

// Stateless twin of the global regex above, for introducedMatches (a /g regex carries lastIndex). The line is
// read with adjacent string literals folded together.
const HAS_HARDCODED_PATH_RE = new RegExp(HARDCODED_PATH_SOURCE, 'i');
const hasHardcodedPath = (line) => HAS_HARDCODED_PATH_RE.test(foldStringConcat(line));
// The matched path text of a line, for edit-extend: a second path on a line that already carried one.
const pathTokens = (line) => foldStringConcat(line).match(new RegExp(HARDCODED_PATH_SOURCE, 'gi')) || [];

function isCodeFile(path) {
  const lower = path.toLowerCase();
  return CODE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isSkippedPath(path) {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  return SKIP_PATH_FRAGMENTS.some((frag) => normalized.startsWith(frag));
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
      for (const pair of introducedMatches(ctx.introducedLines(file.path), hasHardcodedPath, pathTokens)) {
        const line = foldStringConcat(pair.added);
        HARDCODED_PATH_RE.lastIndex = 0;
        let match;
        let perLine = 0;
        while ((match = HARDCODED_PATH_RE.exec(line)) !== null) {
          violations.push({
            path: file.path,
            lineNumber: pair.line,
            matchedText: match[0],
            lineSnippet: line.length > 120 ? line.slice(0, 117) + '...' : line,
          });
          // Cap per-line matches to avoid runaway output on pathological lines
          if (++perLine >= 3) break;
        }
      }
    }

    if (violations.length === 0) return pass();

    const displayed = violations.slice(0, 10);
    const remainder = violations.length - displayed.length;

    return fail({
      locations: violations.map((v) => ({ path: v.path, line: v.lineNumber })),
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
