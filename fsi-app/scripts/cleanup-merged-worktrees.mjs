// cleanup-merged-worktrees.mjs
//
// One-time + ongoing cleanup of git worktrees whose branches have been
// merged to master. Operates at the dotfiles repo level despite living
// under fsi-app/scripts/ (no scripts/ directory at repo root yet).
//
// Closes the class problem captured during the 2026-05-20 operator audit:
// 22+ stale worktrees at C:/Users/jason/dotfiles-wt-* accumulated because
// our worktree-creation convention bypassed superpowers:finishing-a-development-branch
// (FaDB) provenance check. FaDB only auto-cleans worktrees under
// .worktrees/, worktrees/, or ~/.config/superpowers/worktrees/; our
// sibling-to-repo-root paths weren't recognized, so cleanup never ran.
//
// This script:
//   - Enumerates all worktrees via `git worktree list --porcelain`
//   - Skips the main repo working tree and any worktree on the protect-list
//   - For each remaining worktree: checks branch is merged into master,
//     working tree is clean (no uncommitted changes), and no unpushed
//     commits exist
//   - Reports per-worktree status in dry-run; removes worktree + deletes
//     branch in --execute mode
//
// Convention going forward (Part 1 of the class fix): new worktrees go
// under C:/Users/jason/dotfiles/.worktrees/wt-<name> per FaDB recognized
// paths. After merge, FaDB Step 6 cleanup auto-applies. This script
// handles the historical bypass cleanup; FaDB owns the forward path.
//
// Usage:
//   node scripts/cleanup-merged-worktrees.mjs
//     Dry-run (default). Reports what would be removed.
//
//   node scripts/cleanup-merged-worktrees.mjs --execute
//     Actually removes merged + clean worktrees and deletes their branches.

import { execSync } from "node:child_process";

const REPO_ROOT = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const BASE_BRANCH = "master";

// Protect-list: active or just-landed worktrees that should NOT be touched
// even if their branch appears merged. Includes the in-flight Phase 1.5
// agent's worktree and recently-merged work the operator may want to
// inspect before removal.
const PROTECT = new Set([
  "phase1.5-consumers", // Item 2 agent a320022 still in flight
  "q4-resilience",      // Recently merged; operator may want to inspect
  "remediation-discipline", // Recently merged
]);

const EXECUTE = process.argv.includes("--execute");

function git(args, opts = {}) {
  return execSync(`git ${args}`, { encoding: "utf8", cwd: REPO_ROOT, ...opts }).trim();
}

function gitSafe(args, opts = {}) {
  try {
    return { ok: true, out: git(args, opts) };
  } catch (err) {
    return { ok: false, err: err.message };
  }
}

// Parse `git worktree list --porcelain` into { path, branch, isMain } objects.
function parseWorktrees() {
  const raw = git("worktree list --porcelain");
  const blocks = raw.split(/\n\n+/);
  const worktrees = [];
  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split("\n");
    const path = lines.find((l) => l.startsWith("worktree "))?.slice("worktree ".length) ?? null;
    const branchRef = lines.find((l) => l.startsWith("branch "))?.slice("branch ".length) ?? null;
    const branch = branchRef ? branchRef.replace(/^refs\/heads\//, "") : null;
    const isMain = path === REPO_ROOT;
    worktrees.push({ path, branch, isMain });
  }
  return worktrees;
}

function nameOf(worktreePath) {
  // dotfiles-wt-q1-brief-citations -> q1-brief-citations
  // .worktrees/wt-foo -> foo (future convention)
  const base = worktreePath.split(/[\\/]/).filter(Boolean).pop() ?? "";
  return base
    .replace(/^dotfiles-wt-/, "")
    .replace(/^wt-/, "");
}

function isMergedToBase(branch) {
  // Returns true if branch is reachable from base (i.e., already merged).
  const r = gitSafe(`merge-base --is-ancestor ${branch} ${BASE_BRANCH}`);
  return r.ok;
}

function hasUncommittedChanges(path) {
  // git status --porcelain returns empty if clean.
  const r = gitSafe("status --porcelain", { cwd: path });
  if (!r.ok) return true; // safe default: treat unreadable as dirty
  return r.out.trim().length > 0;
}

function hasUnpushedCommits(branch) {
  // Commits on local branch that are NOT in origin/branch.
  const r = gitSafe(`log ${branch} --not origin/${branch} --oneline`);
  if (!r.ok) {
    // If origin/branch doesn't exist, treat as having unpushed work to be safe.
    const r2 = gitSafe(`log ${branch} --not origin/${BASE_BRANCH} --oneline`);
    if (!r2.ok) return true;
    return r2.out.trim().length > 0;
  }
  return r.out.trim().length > 0;
}

const worktrees = parseWorktrees();
const decisions = [];

for (const wt of worktrees) {
  if (wt.isMain) {
    decisions.push({ ...wt, action: "skip", reason: "main repo working tree" });
    continue;
  }
  if (!wt.branch) {
    decisions.push({ ...wt, action: "skip", reason: "detached HEAD or no branch" });
    continue;
  }
  const name = nameOf(wt.path);
  if (PROTECT.has(name)) {
    decisions.push({ ...wt, name, action: "skip", reason: "on protect-list (active or recently merged)" });
    continue;
  }
  if (!isMergedToBase(wt.branch)) {
    decisions.push({ ...wt, name, action: "skip", reason: `branch not merged into ${BASE_BRANCH}` });
    continue;
  }
  if (hasUncommittedChanges(wt.path)) {
    decisions.push({ ...wt, name, action: "skip", reason: "uncommitted changes in working tree" });
    continue;
  }
  if (hasUnpushedCommits(wt.branch)) {
    decisions.push({ ...wt, name, action: "skip", reason: "unpushed commits on branch" });
    continue;
  }
  decisions.push({ ...wt, name, action: "remove", reason: `branch merged into ${BASE_BRANCH}; clean; pushed` });
}

console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY-RUN"}`);
console.log(`Repo root: ${REPO_ROOT}`);
console.log(`Base branch: ${BASE_BRANCH}`);
console.log(`Worktrees found: ${worktrees.length}`);
console.log("");

const removable = decisions.filter((d) => d.action === "remove");
const skipped = decisions.filter((d) => d.action === "skip");

console.log(`=== Removable (${removable.length}) ===`);
for (const d of removable) {
  console.log(`  ${d.name?.padEnd(30) ?? "(no name)"}  ${d.branch?.padEnd(40) ?? "(no branch)"}`);
}

console.log("");
console.log(`=== Skipped (${skipped.length}) ===`);
for (const d of skipped) {
  console.log(`  ${(d.name ?? "(main)")?.padEnd(30)}  ${d.reason}`);
}

if (!EXECUTE) {
  console.log("");
  console.log("Dry-run complete. To remove the above, re-run with --execute.");
  process.exit(0);
}

// Junction-aware fallback (OBS-53 fix, 2026-05-20). When git worktree
// remove --force fails on Windows (e.g., path edge cases, locked files),
// the LAST RESORT is filesystem-level removal. But naive `rm -rf` follows
// junctions transparently on Windows, which can destroy the junction
// TARGET's contents (e.g., main repo's node_modules if the worktree had
// a node_modules junction pointing there). The fallback:
//   1. Enumerate junctions under the worktree path (rare cases:
//      node_modules junction created by sub-agents during dispatch setup)
//   2. Remove each junction via `rmdir` (NOT `rm -rf`; rmdir removes the
//      junction itself without following it)
//   3. THEN remove the worktree directory recursively
// Powershell + cmd combination because Git Bash on Windows doesn't have
// reliable junction detection.
function listJunctions(worktreePath) {
  // PowerShell: enumerate reparse points under the worktree
  const cmd = `powershell -NoProfile -Command "Get-ChildItem -Path '${worktreePath}' -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.LinkType -eq 'Junction' -or $_.LinkType -eq 'SymbolicLink' } | Select-Object -ExpandProperty FullName"`;
  try {
    const out = execSync(cmd, { encoding: "utf8" }).trim();
    return out ? out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function removeJunction(junctionPath) {
  // Use cmd /c rmdir which removes the junction without following it
  try {
    execSync(`cmd /c rmdir "${junctionPath.replace(/\//g, "\\")}"`, { encoding: "utf8" });
    return { ok: true };
  } catch (err) {
    return { ok: false, err: err.message };
  }
}

function safeRemoveDirectory(worktreePath) {
  // Junction-aware recursive removal:
  // 1. Find any junctions/symlinks inside the worktree
  // 2. Remove each junction explicitly (rmdir, does not follow)
  // 3. Then rm -rf the remaining directory contents
  const junctions = listJunctions(worktreePath);
  for (const j of junctions) {
    const r = removeJunction(j);
    if (!r.ok) {
      return { ok: false, err: `junction removal failed at ${j}: ${r.err}` };
    }
  }
  try {
    execSync(`rm -rf "${worktreePath}"`, { encoding: "utf8" });
    return { ok: true, junctionsRemoved: junctions.length };
  } catch (err) {
    return { ok: false, err: err.message };
  }
}

console.log("");
console.log("=== Executing removals ===");
let removedCount = 0;
let failedCount = 0;
for (const d of removable) {
  const wtRemove = gitSafe(`worktree remove "${d.path}"`);
  if (!wtRemove.ok) {
    // Retry with --force in case of untracked file lockups
    const wtForce = gitSafe(`worktree remove --force "${d.path}"`);
    if (!wtForce.ok) {
      // Last resort: junction-aware filesystem removal (OBS-53 fix).
      // Removes any node_modules / nested junctions FIRST so they don't
      // get followed by the recursive remove and destroy junction targets.
      console.log(`  fallback  ${d.name}: git worktree remove failed; using junction-aware filesystem cleanup`);
      const fsRm = safeRemoveDirectory(d.path);
      if (!fsRm.ok) {
        console.log(`  FAIL  ${d.name}: ${fsRm.err.split("\n")[0]}`);
        failedCount++;
        continue;
      }
      // After fs removal, prune git's now-orphaned worktree registration
      gitSafe("worktree prune");
      if (fsRm.junctionsRemoved > 0) {
        console.log(`  fallback  ${d.name}: removed ${fsRm.junctionsRemoved} junction(s) before recursive rm`);
      }
    }
  }
  const branchDelete = gitSafe(`branch -d ${d.branch}`);
  if (!branchDelete.ok) {
    console.log(`  PARTIAL  ${d.name}: worktree removed but branch delete failed (${branchDelete.err.split("\n")[0]})`);
    failedCount++;
    continue;
  }
  console.log(`  OK  ${d.name}: worktree removed + branch deleted`);
  removedCount++;
}

// Always prune after batch removal to clean up any stale registrations.
gitSafe("worktree prune");

console.log("");
console.log(`Removed: ${removedCount} / ${removable.length}`);
if (failedCount > 0) console.log(`Failed: ${failedCount}`);
console.log("Done.");
