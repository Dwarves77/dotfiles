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
// Behaviour:
//   - Tracked source hooks live in fsi-app/.discipline/hooks/.
//   - They are copied byte-for-byte into .git/hooks/<name> (via --git-common-dir,
//     so the install is shared across linked worktrees).
//   - Idempotent: if the destination already matches the source, no write.
//   - If destination exists and differs, back up to <name>.backup-<ISO-ts>
//     unless --force.
//   - Executable bit set to 0o755 (no-op on Windows filesystems but harmless).

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

function readSourceHooks() {
  if (!existsSync(SOURCE_HOOKS_DIR)) {
    throw new Error(`Source hooks directory not found: ${SOURCE_HOOKS_DIR}`);
  }
  return readdirSync(SOURCE_HOOKS_DIR)
    .filter((name) => {
      const full = join(SOURCE_HOOKS_DIR, name);
      return statSync(full).isFile() && !name.startsWith('.') && !name.endsWith('.md');
    })
    .map((name) => ({
      name,
      sourcePath: join(SOURCE_HOOKS_DIR, name),
      sourceContent: readFileSync(join(SOURCE_HOOKS_DIR, name), 'utf-8'),
    }));
}

export function installHooks({ hooksDir, force = false, dryRun = false, log = console.log } = {}) {
  const targetDir = hooksDir || resolveHooksDir();
  const sources = readSourceHooks();

  if (!existsSync(targetDir)) {
    if (dryRun) {
      log(`[dry-run] would create directory: ${targetDir}`);
    } else {
      mkdirSync(targetDir, { recursive: true });
    }
  }

  const report = [];

  for (const { name, sourceContent } of sources) {
    const target = join(targetDir, name);
    const exists = existsSync(target);
    const existingContent = exists ? readFileSync(target, 'utf-8') : null;

    if (exists && existingContent === sourceContent) {
      report.push({ name, action: 'unchanged', path: target });
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
      report.push({ name, action: exists ? 'would-replace' : 'would-create', path: target, backupPath });
      continue;
    }

    writeFileSync(target, sourceContent, 'utf-8');
    try {
      chmodSync(target, 0o755);
    } catch {
      // chmod is a no-op on most Windows filesystems; ignore.
    }

    const action = exists ? (force ? 'replaced' : 'replaced-with-backup') : 'created';
    report.push({ name, action, path: target, backupPath });
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
