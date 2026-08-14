---
name: resume
description: Load Caro's Ledge project memory at session start or after any compaction. Reads the vault (docs/) resume state so the session continues the roadmap instead of re-deriving it. Use when starting any session touching the dotfiles/fsi-app repo, immediately after a context compaction, or when the user says "resume", "load the roadmap", "where were we", or corrects the agent for having forgotten prior decisions.
---

# Resume: load project memory before working

You are resuming work on Caro's Ledge (repo: `dotfiles`, app: `fsi-app/`). The project's memory lives in the repo under `docs/`, not in your context. Nothing loads it automatically. Load it now, before any other work.

## Locate the repo

- Claude Code on Windows: `C:\Users\jason\dotfiles`
- Cowork cloud session: usually `/root/work/dotfiles` (find it: `ls /root/work/ 2>/dev/null || find / -maxdepth 3 -name "fsi-app" -type d 2>/dev/null`)
- In a cloud clone, run `git fetch origin` and compare `git log -1 origin/master` to the local HEAD. If the clone lags, say so: you are reading yesterday's memory and must not present it as current.

## Read, in this exact order

1. `CLAUDE.md` at the repo root. The constitution. Read fully.
2. `docs/INDEX.md`, the `## board` section only. One line per living doc.
3. `docs/PROGRAM-BOARD.md`, first 150 lines. This is the authoritative resume state: thread table, open/closed, evidence.
4. `docs/ops/session-log.md`, the LAST 5 addendum headers (`grep -E '^##+ ' | tail -5`), then read the final addendum in full. This is what the previous session did and what it left open.
5. `git log --oneline -10` for what actually shipped.

## Traps, learned the hard way

- **Do NOT trust `fsi-app/STATUS.md`.** It describes April state (branch `redesign/full-migration`, PR #5 draft) and has misled sessions repeatedly. PROGRAM-BOARD is the resume state.
- **The vault outranks account memory.** If a memory one-liner conflicts with `docs/`, the vault wins.
- **"The flywheel" is two mechanisms** (connection discovery, live; decision propagation, designed only, spec `docs/specs/08-flywheel-design.md`). Do not conflate them; do not invent human-review or customer-data loops. Operator has corrected this multiple times.
- The canonical transport mode token is `ocean` (operator ruling 2026-08-12). Community is a co-equal core surface. The Intelligence Assistant is a research helper, never a decision engine.

## Finish the resume

Before doing any work, state back in 5 lines or fewer: current branch/lane, what the last session's addendum says was completed, and the open threads you can see. If the user's request conflicts with the roadmap, surface the conflict rather than silently following either.

## After a compaction

If you have just been resumed from a compacted context (a summary replaced the transcript), run this skill's read list again in full. Compaction summaries lose operator rulings and design distinctions; the vault has them. Do not trust your summary's description of the architecture over `docs/specs/`.
