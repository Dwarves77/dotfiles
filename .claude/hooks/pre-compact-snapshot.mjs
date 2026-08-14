#!/usr/bin/env node
// PreCompact hook — bank the working state to a FILE before the transcript is summarised.
//
// WHY A FILE, not stdout. Per the hooks contract, PreCompact stdout goes to the debug log
// only — it is never shown in the transcript and never reaches the model. So a PreCompact
// hook CANNOT inject anything into the compaction context directly. What it can do is write
// a durable snapshot that survives the compaction, which the SessionStart hook then reads
// back and prints (SessionStart stdout IS injected, and it fires with matcher `compact`).
// The pair is the read-path across a compaction; neither half works alone.
//
// WHAT IT BANKS. The three things a compaction summary reliably loses and that are
// expensive to reconstruct: which lane the work is on, what the last session recorded as
// open, and which files are dirty (uncommitted work is invisible to every future session
// and to every cloud clone — Addendum 14's finding).
//
// NEVER BLOCKS. Exit 2 would block the compaction, which could wedge a long session. Every
// failure path exits 0 and simply banks less.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.CLAUDE_PROJECT_DIR
  || join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const git = (...args) => {
  try {
    return execFileSync('git', ['-C', REPO, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { return null; }
};

try {
  const lines = [];
  lines.push('_Banked by the PreCompact hook. The transcript was summarised after this point;');
  lines.push('treat the summary as lossy and this as the factual record._');
  lines.push('');

  // Lane.
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const head = git('log', '--oneline', '-1');
  lines.push(`**Lane at compaction:** branch \`${branch || 'unknown'}\``);
  if (head) lines.push(`**HEAD:** ${head}`);
  lines.push('');

  // Uncommitted work — the part that does not exist for anyone else.
  const status = git('status', '--porcelain');
  if (status) {
    const rows = status.split(/\r?\n/).filter(Boolean);
    lines.push(`**Uncommitted (${rows.length}) — invisible to every other session until committed:**`);
    for (const r of rows.slice(0, 40)) lines.push(`- \`${r}\``);
    if (rows.length > 40) lines.push(`- …and ${rows.length - 40} more (not listed; run \`git status\`)`);
  } else {
    lines.push('**Uncommitted:** none — working tree clean.');
  }
  lines.push('');

  // Open threads, as the vault last recorded them.
  try {
    const p = join(REPO, 'docs/ops/session-log.md');
    if (existsSync(p)) {
      const log = readFileSync(p, 'utf8');
      const heads = log.split(/\r?\n/).filter((l) => /^## /.test(l)).slice(-2);
      if (heads.length) {
        lines.push('**Last vault entries:**');
        for (const h of heads) lines.push(`- ${h.replace(/^#+\s*/, '')}`);
        lines.push('');
      }
    }
  } catch { /* best effort */ }

  lines.push('**On resume:** re-read `docs/PROGRAM-BOARD.md` and the final session-log addendum');
  lines.push('before acting. Do not trust the compaction summary\'s account of architecture or');
  lines.push('of operator rulings — that is exactly what compaction loses (Addendum 14).');

  const dest = join(REPO, '.claude', 'precompact-state.md');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, lines.join('\n') + '\n', 'utf8');
} catch {
  // Banking is best-effort; never wedge a compaction over it.
}

process.exit(0);
