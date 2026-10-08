// PreToolUse SCOPE: does a tool call belong to Caro's Ledge (the fsi-app project and its worktrees)?
//
// The out-of-repo shim (~/.claude/hooks/pretooluse-fsi-app-scope.mjs) calls this before the skill gate so that
// any OTHER project on the machine (Pet Pursuit and the like) is never blocked by fsi-app governance, and so
// that this decision is versioned, reviewed and tested HERE rather than living in an untracked file. Pure and
// dependency-free apart from node builtins (the shim imports it; a failed import makes the shim fail TOWARD
// the gate, never away from it).
//
// Lane GATE-7 (2026-10-08, register attacks A-PT-S1 to A-PT-S8). The old shim scoped on a regex that needed a
// path separator immediately before "fsi-app", read from the cwd, the command text or the file path:
//   * `node fsi-app/scripts/x.mjs --apply`, `cd fsi-app && ...` have no separator before the name: out of scope;
//   * a `git push` from a worktree ROOT (cwd is not inside fsi-app) was out of scope;
//   * a relative file path (`fsi-app/src/...`, or `src/...` with the cwd inside fsi-app) was matched on its text
//     alone;
//   * an MCP write or an Agent dispatch was scoped on the cwd only, so a payload that NAMED an fsi-app path from
//     another cwd was allowed;
//   * a clone whose directory is renamed (fsi-app-copy) matched nothing.
// The rules now: fsi-app as a whole path segment or a bare word anywhere in the command text, the file path or
// the tool input; a relative file path resolved against the cwd; a cwd that IS, or sits under, a directory that
// holds an `fsi-app` directory (a repository root or a worktree root); and the repo-root governed files the
// skill map names (the CI workflow, the repo Claude Code hooks). A call that names no fsi-app path from a cwd
// outside every such directory is NOT attributable to this project and stays out of scope: scoping by project
// is this shim's purpose (an apply_migration against another project's database is that project's business).

import { existsSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";

// fsi-app as a path part (`/fsi-app/`, `fsi-app\`), or as a bare word at a command position or after a quote,
// equals sign, separator or redirect (`node fsi-app/x`, `cd fsi-app && ...`), and not as part of a longer name.
const WORD_RE = /(?:^|[\\/\s"'=;&|(<>:])fsi-app(?![\w-])/i;
const SEGMENT_RE = /(?:^|[\\/])fsi-app(?![\w-])/i;

const FILE_EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const SHELL_TOOLS = new Set(["Bash", "PowerShell", "Monitor"]);
const MAX_INPUT_TEXT = 200000;

/** A cwd that is, or sits under, a directory holding an `fsi-app` directory (a repo or worktree root). */
export function cwdHoldsFsiApp(cwd, exists = existsSync) {
  let dir = String(cwd ?? "");
  if (!dir) return false;
  for (let hops = 0; hops < 10 && dir; hops++) {
    if (SEGMENT_RE.test(dir)) return true;
    try { if (exists(join(dir, "fsi-app"))) return true; } catch { /* keep walking */ }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return false;
}

/** The repo-root files the skill map governs that sit outside fsi-app/ (GATE-7): the CI workflow and the repo's own
 *  Claude Code hooks. The user-level ~/.claude/hooks is not the repo's and is not matched. */
function isRepoRootGoverned(path) {
  const p = String(path ?? "").replaceAll("\\", "/").toLowerCase();
  if (p.endsWith("/.github/workflows/discipline.yml")) return true;
  return p.includes("/.claude/hooks/") && (p.includes("/.claude/worktrees/") || p.includes("/dotfiles/"));
}

/**
 * @param {object} payload the PreToolUse payload (tool_name, tool_input, cwd)
 * @param {{ exists?: (p: string) => boolean }} [deps] file-system probe, injectable for tests
 * @returns {boolean} true when the call must go through the skill gate
 */
export function inScope(payload, deps = {}) {
  const exists = deps.exists ?? existsSync;
  const tool = payload?.tool_name || "";
  const input = payload?.tool_input || {};
  const cwd = payload?.cwd || "";

  if (FILE_EDIT_TOOLS.has(tool)) {
    const raw = String(input.file_path || input.notebook_path || "");
    if (!raw) return false;
    const target = isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("/") ? raw : join(cwd || ".", raw);
    return SEGMENT_RE.test(raw) || SEGMENT_RE.test(target) || isRepoRootGoverned(target);
  }

  if (SHELL_TOOLS.has(tool)) {
    const command = String(input.command || input.script || "");
    return WORD_RE.test(command) || cwdHoldsFsiApp(cwd, exists);
  }

  // MCP tools, dispatches, worktree and artifact tools: the PATHS the call names decide; a call that names none
  // falls back to the cwd (a session working in the repo).
  let named = "";
  try { named = JSON.stringify(input).slice(0, MAX_INPUT_TEXT); } catch { named = ""; }
  return WORD_RE.test(named) || cwdHoldsFsiApp(cwd, exists);
}
