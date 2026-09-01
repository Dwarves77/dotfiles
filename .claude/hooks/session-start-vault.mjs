#!/usr/bin/env node
// SessionStart hook — emit the vault read-path so a session does not start blind.
//
// WHY. docs/ is the project memory and nothing loads it automatically. CLAUDE.md's
// "Loading priority" list is an instruction INSIDE the file that only auto-loads when the
// session's cwd is the repo root — a session started elsewhere never sees it, so the
// dependency is circular. This hook breaks the circle from the outside: it prints the
// resume state to stdout, and per the hooks contract SessionStart stdout is added to the
// session's context.
//
// FIRES ON EVERY START, deliberately no matcher: startup, resume, clear, compact, fork.
// The `compact` case is the important one — it is the only documented mechanism that can
// re-inject state after a compaction, because PreCompact/PostCompact stdout goes to the
// debug log and never reaches the model. The PreCompact snapshot is picked up here.
//
// NEVER FAILS THE SESSION. Every read is guarded and the process always exits 0: a broken
// hook must not wedge a session. Exit 2 would render an error notice the model cannot see,
// which is strictly worse than a short report.

import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.CLAUDE_PROJECT_DIR
  || join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (rel) => {
  try {
    const p = join(REPO, rel);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  } catch { return null; }
};

const git = (...args) => {
  try {
    return execFileSync('git', ['-C', REPO, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { return null; }
};

const out = [];
out.push('## Caro\'s Ledge — vault resume state (SessionStart hook)');
out.push('');
out.push('Loaded from docs/ because nothing else loads it. This is the roadmap; do not re-derive it.');
out.push('');

// 1. Current branch + HEAD.
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const head = git('log', '--oneline', '-1');
out.push('### Lane');
out.push(`- Branch: \`${branch || 'unknown'}\``);
if (head) out.push(`- HEAD: ${head}`);
const behind = git('rev-list', '--count', 'HEAD..origin/master');
if (behind && behind !== '0') {
  out.push(`- **Local is ${behind} commit(s) behind origin/master** — you may be reading stale state.`);
}
out.push('');

// 2. The ## board section of docs/INDEX.md.
const index = read('docs/INDEX.md');
if (index) {
  const m = index.match(/^## board\s*$([\s\S]*?)(?=^## )/m);
  const board = m && m[1].trim();
  if (board) {
    out.push('### docs/INDEX.md — board');
    out.push(board);
    out.push('');
  }
} else {
  out.push('_docs/INDEX.md not found — vault may be missing or cwd is not the repo._');
  out.push('');
}

// 3. Last 3 addendum headers from the session log.
const log = read('docs/ops/session-log.md');
if (log) {
  // `^## ` exactly: top-level entries only. `^##+ ` would also match the `###`
  // sub-headings inside an addendum (corrections, sub-sections) and crowd out real entries.
  const headers = log.split(/\r?\n/).filter((l) => /^## /.test(l)).slice(-3);
  if (headers.length) {
    out.push('### docs/ops/session-log.md — last 3 entries');
    for (const h of headers) out.push(`- ${h.replace(/^#+\s*/, '')}`);
    out.push('');
    out.push('Read the final addendum in full before acting: `sed -n \'/^## Addendum/,$p\' docs/ops/session-log.md | tail -60`');
    out.push('');
  }
}

// 4. Anything PreCompact banked on the way out. One-shot: consumed then deleted, so a
//    stale snapshot cannot masquerade as current state in a later unrelated session.
const SNAPSHOT = '.claude/precompact-state.md';
const snap = read(SNAPSHOT);
if (snap && snap.trim()) {
  out.push('### Recovered from the pre-compaction snapshot');
  out.push(snap.trim());
  out.push('');
  try { unlinkSync(join(REPO, SNAPSHOT)); } catch { /* best effort */ }
}

// 5. The traps that keep costing sessions. Kept short on purpose — this text is billed on
//    every turn for the life of the session (CLAUDE.md rule 11).
out.push('### Standing traps');
out.push('- `fsi-app/STATUS.md` is HISTORICAL (April state). `docs/PROGRAM-BOARD.md` is the resume state.');
out.push('- The vault outranks account memory. If a memory one-liner conflicts with `docs/`, the vault wins.');
out.push('- Run the `ledger` skill (`.claude/skills/ledger/SKILL.md`) for the full read protocol.');

process.stdout.write(out.join('\n') + '\n');
process.exit(0);
