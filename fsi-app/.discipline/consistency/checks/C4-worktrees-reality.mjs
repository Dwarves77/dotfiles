// C4: each worktree listed in docs/inventories/worktrees.md exists on disk;
// each existing worktree (per git worktree list) is listed in inventory.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { drift, DRIFT_KIND, NO_DRIFT } from '../lib/drift.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { readInventory, parseMarkdownTables, cleanCell } from '../lib/inventory-parser.mjs';

function gitWorktreeList() {
  try {
    const out = execFileSync('git', ['-C', getRepoRoot(), 'worktree', 'list', '--porcelain'], {
      encoding: 'utf-8',
    });
    // Parse worktree entries; each starts with "worktree <path>"
    const paths = [];
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^worktree\s+(.+)$/);
      if (m) paths.push(m[1].trim());
    }
    return paths;
  } catch {
    return [];
  }
}

// The MAIN repo root, regardless of which worktree this check runs from. `git rev-parse
// --show-toplevel` (what getRepoRoot() returns) resolves to the CURRENT worktree's own directory
// when run from a secondary worktree — using it to derive the sibling-path convention broke
// resolution for any push originating outside the main checkout. `--git-common-dir` is the one
// .git directory shared by every worktree of a repo and always lives inside the main worktree, so
// its dirname is stable no matter where this executes.
function getMainRepoRoot() {
  const commonDir = execFileSync(
    'git',
    ['-C', getRepoRoot(), 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    { encoding: 'utf-8' },
  ).trim();
  return dirname(commonDir);
}

export const consistencyCheck = {
  id: 'C4',
  name: 'worktrees.md reality',
  description: 'Each worktree listed in docs/inventories/worktrees.md exists on disk; each git-tracked worktree is listed.',
  source: 'Layer 4 dispatch + ADR-005',

  run() {
    const drifts = [];
    const liveWorktrees = gitWorktreeList();
    const inventoryContent = readInventory('docs/inventories/worktrees.md');

    if (!inventoryContent) {
      drifts.push(drift(
        DRIFT_KIND.ORPHAN_CLAIM,
        'docs/inventories/worktrees.md does not exist.',
        'docs/inventories/worktrees.md',
      ));
      return drifts;
    }

    // Parse worktree paths from inventory tables (Path column)
    const tables = parseMarkdownTables(inventoryContent);
    const inventoryPaths = new Set();
    for (const t of tables) {
      const pathCol = t.header.find((h) => /path/i.test(h));
      if (!pathCol) continue;
      for (const row of t.rows) {
        const cell = cleanCell(row[pathCol] || '');
        // Cell shape like `dotfiles-wt-foo` or `dotfiles` (relative names)
        if (cell) inventoryPaths.add(cell);
      }
    }

    // Each inventory path: verify it exists at the conventional location.
    // Inventory uses RELATIVE names like "dotfiles-wt-foo" referring to a
    // sibling directory of the repo root (historical anti-pattern; deprecated
    // by FaDB convention). Derive the sibling path from the repo root's parent
    // rather than hardcoding any user-home string.
    const repoRoot = getMainRepoRoot();
    const repoParent = dirname(repoRoot);
    for (const relName of inventoryPaths) {
      // Try sibling-to-repo-root (the historical anti-pattern documented in worktrees.md)
      const sibling = join(repoParent, relName);
      // Try .worktrees/<name> (the new FaDB-recognized convention)
      const newConvention = join(repoRoot, '.worktrees', `wt-${relName.replace('dotfiles-wt-', '')}`);
      // Main repo
      const isMain = relName === 'dotfiles';
      const found = isMain ? existsSync(repoRoot) : (existsSync(sibling) || existsSync(newConvention));
      if (!found) {
        drifts.push(drift(
          DRIFT_KIND.ORPHAN_CLAIM,
          `docs/inventories/worktrees.md lists worktree "${relName}" but no matching directory exists at sibling or .worktrees/ convention paths.`,
          'docs/inventories/worktrees.md',
        ));
      }
    }

    // Each live git worktree: should be listed in inventory by either its
    // bare basename (new `.worktrees/wt-<name>` convention) OR the
    // historical `dotfiles-wt-<name>` form. Inventory entries that resolve
    // to the same path under EITHER format count as a match. This mirrors
    // the bidirectional intent of the existence check above.
    //
    // Worktrees under `.worktrees/` (FaDB convention) OR `.claude/worktrees/`
    // (the Claude Code agent-harness convention) are EXEMPT from both directions
    // of the check. Both are developer-local / harness-local transient state;
    // parallel-agent worktrees created there exist only on the developer or agent
    // machine and disappear after cleanup. Forcing inventory tracking on every
    // ephemeral worktree creates a local-state-vs-CI drift exactly like the
    // migration 067 incident (file exists locally, missing in CI checkout).
    for (const livePath of liveWorktrees) {
      const normalized = livePath.replace(/\\/g, '/');
      if (normalized.includes('/.worktrees/') || normalized.includes('/.claude/worktrees/')) continue; // ephemeral by convention
      const basename = livePath.split(/[\\/]/).pop();
      const historicalForm = basename === 'dotfiles' ? 'dotfiles' : `dotfiles-${basename}`;
      const matched = inventoryPaths.has(basename) || inventoryPaths.has(historicalForm);
      if (!matched) {
        drifts.push(drift(
          DRIFT_KIND.MISSING_CLAIM,
          `Git worktree at ${livePath} (basename "${basename}") exists but is not listed in docs/inventories/worktrees.md.`,
          livePath,
        ));
      }
    }

    return drifts.length === 0 ? NO_DRIFT : drifts;
  },
};
