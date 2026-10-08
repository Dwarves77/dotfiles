// The commit rules engine's BASELINE: the one place that decides what "introduced" is measured against.
// (lane GATE-5, 2026-10-08; ADR-046 "scope is the change, not the file".)
//
// THE DEFECT [CONFIRMED by DEAD-1, docs/ops/session-log.d/2026-10-08-dead1-whole-file.md]. GATE-1 scoped the
// content rules (012, 015, 017, 019, 022) to INTRODUCED lines, but "introduced" meant "not in the previous
// commit": the staged diff was `git diff --cached` (index against HEAD) and a CI commit was `git show`
// (commit against its parent). A byte-identical RESTORE of a file that exists on master, made on a branch
// whose earlier commit had deleted it, therefore read as a brand-new file, and rule 022 blocked it for
// glyphs that master already carries. The same blindness hits a revert of a deletion, and any block moved
// across two commits of one branch.
//
// THE FIX. Introduced means NOT PRESENT AT THE MERGE BASE with the integration branch, the same tree a
// squash merge diffs against. Every context loads its one diff against the baseline this module returns, so
// every rule that reads ctx.introducedLines / ctx.stagedFiles reads the same baseline (one check, one site):
//   staged (commit-msg)  baseline = merge-base(origin/<base>, HEAD)             diff --cached <baseline>
//   commit (CI, one sha) baseline = merge-base(origin/<base>, <sha>)            diff <baseline> <sha>
//   range  (CI, whole)   baseline = the range's own base, already a merge-base  diff <range>
// <base> is BASE_REF when the workflow sets it (the PR base ref it already resolves), else master.
//
// FALLBACK, NAMED NEVER SILENT. When there is no merge base to use, the baseline is the previous commit (the
// pre-GATE-5 behaviour) and the context says so in `baseline.label`, which the runner prints and writes to
// the firing log:
//   - origin/<base> does not resolve (a fresh clone with no remote refs, a repo with no origin)
//   - HEAD or the commit does not resolve (an initial commit)
//   - git merge-base finds no common ancestor
//   - a commit CI checks is itself on origin/<base> (a push to master): merge-base would be the commit
//     itself, the diff would be empty and no rule would ever fire. Its baseline is its parent, which is what
//     the push-to-master squash check has always diffed.
//
// The merge-base itself is computed by change-range.mjs's resolveRange (the one function the pre-push hook,
// the CI step and F51 already resolve ranges through); this module adds the integration-branch probe, the
// "commit is on the base" guard and the labels, and never runs git itself except through the injected `git`.

import { resolveRange } from './change-range.mjs';

const QUIET = { stdio: ['ignore', 'pipe', 'ignore'] };

function oneLine(s) {
  return String(s ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 160) || 'unknown';
}

function fallback(kind, reason) {
  return {
    ref: null,
    source: 'fallback',
    label: `fallback ${kind === 'staged' ? 'previous commit (HEAD)' : 'parent commit'}: ${reason}`,
  };
}

/**
 * @param {{ kind: 'staged'|'commit', head?: string, env?: NodeJS.ProcessEnv, cwd?: string,
 *           git: (args: string[], opts?: object) => string }} opts
 *   kind 'staged': the baseline for the index against HEAD. kind 'commit': for the commit `head` (a sha).
 *   `git` runs one git command at the repo root and returns stdout; it throws on a non-zero exit.
 * @returns {{ ref: string|null, source: 'merge-base'|'fallback', label: string }}
 *   `ref` is the commit the diff is taken against, or null when the caller must use the previous-commit
 *   shape (git diff --cached / git show).
 */
export function resolveBaseline({ kind, head, env = process.env, cwd, git }) {
  const baseName = String(env.BASE_REF || '').trim() || 'master';
  const baseRef = `origin/${baseName}`;
  const headRef = kind === 'staged' ? 'HEAD' : head;

  let headSha;
  try {
    headSha = git(['rev-parse', '--verify', '--quiet', `${headRef}^{commit}`], QUIET).trim();
  } catch {
    headSha = '';
  }
  if (!headSha) return fallback(kind, `${headRef} does not resolve to a commit`);

  try {
    git(['rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`], QUIET);
  } catch {
    return fallback(kind, `${baseRef} does not resolve (no remote-tracking ref)`);
  }

  const r = resolveRange({ env: { BASE_REF: baseName, PR_HEAD: headSha }, cwd });
  if (r.source === 'unavailable' || !r.base) return fallback(kind, `no merge base with ${baseRef} (${oneLine(r.reason)})`);

  if (kind === 'commit' && r.base === headSha) {
    return fallback(kind, `the commit is already on ${baseRef}`);
  }
  return { ref: r.base, source: 'merge-base', label: `merge base with ${baseRef} (${r.base.slice(0, 8)})` };
}
