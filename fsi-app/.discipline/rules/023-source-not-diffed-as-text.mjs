// Rule 023: A source file must be diffed as text.
// Source: AUD-AT-3 (docs register of 2026-10-08), attacks A012-8, A012-9, A015-12, A017-9, A019-7, A022-7,
// A022-8, A-CI-binary, A-CI-022; lane GATE-7.
//
// Every content rule (012, 015, 017, 019, 022) reads the lines git reports as added. Git reports no lines for
// a file it does not diff as text: a `.gitattributes` entry that marks the path binary or `-diff`, a single
// NUL byte anywhere in the file, a UTF-16 encoding (every character carries a NUL). The file is then
// invisible to every rule at once, in the commit hook and in CI, and nothing says so. The honest ways to get
// there are accidents (an editor saving UTF-16, a stray control character pasted in, an attribute written for
// a generated file that also matches a source path); the effect is the same either way, so the finding is the
// file itself: ONE check, here, instead of a blind spot in five rules.
//
// Trigger: a staged file (not deleted) with a SOURCE extension that git did not diff as text (the diff says
//          "Binary files ... differ"; lib/context.mjs sets `binary` on the staged file).
// Check:   FAIL, naming each path and the usual causes. A file that is genuinely binary does not carry a source
//          extension; rename it, or fix the attribute or the encoding.

import { pass, fail } from '../lib/result.mjs';

const SOURCE_EXTENSIONS = [
  '.mjs', '.cjs', '.js', '.jsx', '.mts', '.cts', '.ts', '.tsx', '.json', '.yml', '.yaml', '.sh', '.sql',
  '.md', '.css', '.html', '.toml', '.py', '.ps1', '.txt',
];

function isSourceFile(path) {
  const lower = String(path).toLowerCase();
  return SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function relevant(ctx) {
  return ctx.stagedFiles.filter((f) => f.status !== 'D' && f.binary === true && isSourceFile(f.path));
}

export const rule = {
  id: '023',
  name: 'Source file not diffed as text',
  description: 'A file with a source extension that git does not diff as text (a binary or -diff attribute, a NUL byte, UTF-16) hides its lines from every content rule; it is itself a finding.',
  ruleSource: 'AUD-AT-3 attack register 2026-10-08 (A012-8, A012-9, A022-7, A022-8); lane GATE-7',

  trigger(ctx) {
    if (ctx.isMergeCommit || ctx.isRevertCommit) return false;
    return relevant(ctx).length > 0;
  },

  check(ctx) {
    const files = relevant(ctx);
    if (files.length === 0) return pass();
    return fail({
      locations: files.map((f) => ({ path: f.path, line: 1 })),
      message: `${files.length} source file(s) are not diffed as text, so no content rule can read them.`,
      remediation: [
        'Git reports no lines for these files. The usual causes:',
        '  - a .gitattributes entry marking the path binary or -diff (remove it for source paths);',
        '  - a NUL byte in the file (a pasted control character, or UTF-16 encoding: re-save as UTF-8 without a BOM);',
        'Files:',
        ...files.map((f) => `    ${f.path}`),
        'Emergency bypass: git commit --no-verify.',
      ].join('\n  '),
    });
  },
};

export const _SOURCE_EXTENSIONS = SOURCE_EXTENSIONS;
