#!/usr/bin/env node
// Installs the Rules-as-Code discipline hooks into the local .git/hooks/ dir.
// Sprint Foundation Wave 3 (Agent D), 2026-05-20.
//
// Usage:
//   node fsi-app/.discipline/install-hooks.mjs           # install / refresh
//   node fsi-app/.discipline/install-hooks.mjs --force   # overwrite without backup
//   node fsi-app/.discipline/install-hooks.mjs --dry-run # report what would happen
//   node fsi-app/.discipline/install-hooks.mjs --hooks-dir=<path>  # override (tests)
//
// D19 (lane L12, defect-fix-plan-2026-09-12.md, 2026-09-13): this installer used to copy every FILE in
// fsi-app/.discipline/hooks/ byte-for-byte into .git/hooks/<name>, with no freshness check -- a stale
// installed copy silently ran forever, out of sync with the tracked source, and a non-hook file dropped
// into the hooks dir (D19's own named example: pre-push-tmpdir.test.mjs, L3's own test file) was copied
// too. Root-caused and fixed at the source: this installer now writes a small TRAMPOLINE for each real
// git hook name (buildTrampoline, below), never a copy of the hook's own content. The trampoline resolves
// the pushing worktree's own top level at run time (`git rev-parse --show-toplevel`, which is
// worktree-aware) and execs the TRACKED hook from there, so the hook that actually runs is always the
// branch's own tracked file -- CI parity by construction, per worktree, and a hook change takes effect on
// the very next push with no re-install step. `fsi-app/.discipline/hooks/pre-push` gains its own step 0
// (see that file) refusing to run at all unless invoked through the trampoline, so a pre-D19 stale COPY
// (if one is still sitting in some other worktree's .git/hooks/) can never silently run again either --
// git would report step 0's refusal instead of silently executing stale logic.
//
// Behaviour:
//   - Tracked source hooks live in fsi-app/.discipline/hooks/.
//   - Only files whose NAME is a real git hook name (KNOWN_GIT_HOOK_NAMES, below) are installed -- any
//     other file in the hooks dir (a *.test.mjs, a lib/ subdirectory, a .md doc) is never touched.
//   - For each such hook name, a trampoline (buildTrampoline) is written to .git/hooks/<name> (via
//     --git-common-dir, so the install is shared across linked worktrees).
//   - Idempotent: if the destination already matches the trampoline content, no write.
//   - If destination exists and differs, back up to <name>.backup-<ISO-ts> unless --force.
//   - Executable bit set to 0o755 (no-op on Windows filesystems but harmless).
//   - Run once after this lane merges, and again only when a NEW hook name is added -- never again for an
//     ordinary change to an existing tracked hook's own logic (the trampoline picks that up automatically).

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_HOOKS_DIR = join(__dirname, 'hooks');

// The complete set of git client-side + server-side hook names (per `git help hooks`) this installer will
// ever recognise as an installable hook. A file in fsi-app/.discipline/hooks/ whose name is NOT in this
// set (a *.test.mjs, a lib/ helper, a .md doc) is never installed -- D19's own named defect was
// pre-push-tmpdir.test.mjs (a plain file, not a directory, not a dotfile, not a .md) being copied into
// .git/hooks/pre-push-tmpdir.test.mjs by the prior "copy every file" behaviour.
const KNOWN_GIT_HOOK_NAMES = new Set([
  'applypatch-msg', 'pre-applypatch', 'post-applypatch',
  'pre-commit', 'pre-merge-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit',
  'pre-rebase', 'post-checkout', 'post-merge',
  'pre-push', 'pre-receive', 'update', 'proc-receive', 'post-receive', 'post-update',
  'push-to-checkout', 'pre-auto-gc', 'post-rewrite', 'sendemail-validate', 'fsmonitor-watchman',
  'p4-changelist', 'p4-prepare-changelist', 'p4-post-changelist', 'p4-pre-submit', 'post-index-change',
]);

/**
 * The trampoline body installed at .git/hooks/<hookName>. Resolves the pushing/committing worktree's own
 * top level at RUN time (`git rev-parse --show-toplevel` is worktree-aware: it resolves to the linked
 * worktree's own top, not the shared bare repo) and execs the TRACKED hook from there with the same
 * arguments and stdin passed through unchanged (D19: pre-push reads its ref-update lines from stdin, and a
 * bare `exec` preserves the calling process's stdin/stdout/stderr rather than opening new ones).
 * @param {string} hookName @returns {string}
 */
export function buildTrampoline(hookName) {
  return (
    '#!/bin/sh\n' +
    `# discipline trampoline, installed by fsi-app/.discipline/install-hooks.mjs; the tracked hook is the source of truth\n` +
    'top=$(git rev-parse --show-toplevel) || exit 1\n' +
    'DISCIPLINE_HOOK_TRAMPOLINE=1\n' +
    'export DISCIPLINE_HOOK_TRAMPOLINE\n' +
    `exec sh "$top/fsi-app/.discipline/hooks/${hookName}" "$@"\n`
  );
}

function parseArgs(argv) {
  const out = { force: false, dryRun: false, hooksDir: null };
  for (const arg of argv.slice(2)) {
    if (arg === '--force') out.force = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--hooks-dir=')) out.hooksDir = arg.slice('--hooks-dir='.length);
  }
  return out;
}

function resolveHooksDir() {
  // --git-common-dir is worktree-aware: returns the shared .git dir for linked
  // worktrees, or the same as --git-dir for the primary worktree.
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf-8' }).trim();
  // If common is relative (rare; happens in some git versions), resolve from cwd.
  const absCommon = resolve(common);
  return join(absCommon, 'hooks');
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * List the installable hook names under `sourceDir` -- names that are both a real FILE and a member of
 * KNOWN_GIT_HOOK_NAMES (D19: excludes *.test.mjs, lib/ subdirectories, and any other non-hook file that
 * happens to sit in the same directory). `sourceDir` defaults to the real tracked hooks directory and is
 * overridable for tests (never for the real installer's own CLI, which always uses the tracked source).
 * @param {string} [sourceDir] @returns {{name: string, sourcePath: string}[]}
 */
function readSourceHooks(sourceDir = SOURCE_HOOKS_DIR) {
  if (!existsSync(sourceDir)) {
    throw new Error(`Source hooks directory not found: ${sourceDir}`);
  }
  return readdirSync(sourceDir)
    .filter((name) => {
      const full = join(sourceDir, name);
      return statSync(full).isFile() && KNOWN_GIT_HOOK_NAMES.has(name);
    })
    .map((name) => ({ name, sourcePath: join(sourceDir, name) }));
}

export function installHooks({
  hooksDir,
  force = false,
  dryRun = false,
  log = console.log,
  sourceHooksDir,
} = {}) {
  const targetDir = hooksDir || resolveHooksDir();
  const sources = readSourceHooks(sourceHooksDir);

  if (!existsSync(targetDir)) {
    if (dryRun) {
      log(`[dry-run] would create directory: ${targetDir}`);
    } else {
      mkdirSync(targetDir, { recursive: true });
    }
  }

  const report = [];

  for (const { name } of sources) {
    // D19: the installed artifact is ALWAYS the trampoline for this hook name, never a copy of the
    // tracked hook's own content -- see buildTrampoline's own header comment.
    const trampolineContent = buildTrampoline(name);
    const target = join(targetDir, name);
    const exists = existsSync(target);
    const existingContent = exists ? readFileSync(target, 'utf-8') : null;

    if (exists && existingContent === trampolineContent) {
      report.push({ name, action: 'unchanged', path: target, content: trampolineContent });
      log(`  unchanged: ${target}`);
      continue;
    }

    let backupPath = null;
    if (exists && !force) {
      backupPath = `${target}.backup-${nowStamp()}`;
      if (dryRun) {
        log(`[dry-run] would back up existing hook to: ${backupPath}`);
      } else {
        writeFileSync(backupPath, existingContent ?? '', 'utf-8');
      }
    }

    if (dryRun) {
      log(`[dry-run] would write hook: ${target}${backupPath ? ` (existing backed up to ${backupPath})` : ''}`);
      report.push({
        name,
        action: exists ? 'would-replace' : 'would-create',
        path: target,
        backupPath,
        content: trampolineContent,
      });
      continue;
    }

    writeFileSync(target, trampolineContent, 'utf-8');
    try {
      chmodSync(target, 0o755);
    } catch {
      // chmod is a no-op on most Windows filesystems; ignore.
    }

    const action = exists ? (force ? 'replaced' : 'replaced-with-backup') : 'created';
    report.push({ name, action, path: target, backupPath, content: trampolineContent });
    log(`  ${action}: ${target}${backupPath ? `  (backup: ${backupPath})` : ''}`);
  }

  return report;
}

function main() {
  const args = parseArgs(process.argv);

  console.log('Installing Rules-as-Code discipline hooks...');
  console.log(`  Source: ${SOURCE_HOOKS_DIR}`);

  let targetDir;
  try {
    targetDir = args.hooksDir || resolveHooksDir();
  } catch (err) {
    console.error(`Error: cannot resolve git hooks directory: ${err.message}`);
    process.exit(2);
  }
  console.log(`  Target: ${targetDir}`);
  if (args.dryRun) console.log('  Mode:   dry-run (no files written)');
  if (args.force) console.log('  Mode:   force (existing hooks overwritten without backup)');

  // Warn (but do not fail) if node missing from PATH; hooks need it at runtime.
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', ['node'], { stdio: 'ignore' });
  } catch {
    console.warn('  WARNING: "node" was not found on PATH. Installed hooks will skip the check at commit time until node is installed.');
  }

  let report;
  try {
    report = installHooks({ hooksDir: targetDir, force: args.force, dryRun: args.dryRun });
  } catch (err) {
    console.error(`Error installing hooks: ${err.message}`);
    process.exit(2);
  }

  const counts = report.reduce((acc, r) => {
    acc[r.action] = (acc[r.action] || 0) + 1;
    return acc;
  }, {});

  console.log('\nDone.');
  console.log(`  Summary: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'no hooks processed'}`);
  console.log('\nTo bypass the discipline gate in a genuine emergency:');
  console.log('  git commit --no-verify');
  console.log('(future Phase 6 will surface bypass usage in audit reports.)');
}

// Run only when invoked directly (not when imported by tests).
const invokedDirectly = (() => {
  try {
    return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main();
}
