---
name: ledger
description: Load Caro's Ledge project memory AND its verification discipline before doing anything. Use when starting any session touching the dotfiles/fsi-app repo, immediately after a context compaction, when the user says "ledger"/"resume"/"where were we"/"load the roadmap", when the agent is corrected for having forgotten a prior decision, and CRITICALLY before proposing any change to code, schema, or config, before diagnosing a defect, and before asserting how any part of the system behaves. If you are about to explain a mechanism, propose a fix, or name a root cause, invoke this first.
---

# Ledger: load memory AND discipline before working

Two jobs. Sections A0 and A load project state. **Section B is the rule set that state is useless without** — it exists because loading the roadmap does not stop an agent confidently inventing a root cause.

The vault is `docs/` inside the GitHub repo `Dwarves77/dotfiles`. Obsidian is only a local viewer pointed at `C:\Users\jason\dotfiles\docs`; it is not a service, nothing connects to it, and it syncs nowhere. **Git is the only transport.** A session that has not fetched the repo has no memory, and must say so rather than answering from the application database, from web search, or from its own context.

## A0. Locate the vault and pin it to origin/master

Do not assume a path and do not trust the checked-out branch. Run this block verbatim.

```bash
find_vault() {
  for d in "$HOME/work/dotfiles" /root/work/dotfiles "$HOME/dotfiles" "$HOME/mnt/dotfiles" ./dotfiles .; do
    [ -f "$d/.git/config" ] && grep -qi 'Dwarves77/dotfiles' "$d/.git/config" && { echo "$d"; return 0; }
  done
  d=$(find / -maxdepth 6 -name PROGRAM-BOARD.md -path '*/docs/*' 2>/dev/null | head -1)
  [ -n "$d" ] && { dirname "$(dirname "$d")"; return 0; }
  return 1
}
VAULT=$(find_vault) || {
  mkdir -p "$HOME/work" &&
  git clone --filter=blob:none https://github.com/Dwarves77/dotfiles.git "$HOME/work/dotfiles" &&
  VAULT="$HOME/work/dotfiles"
}
git -C "$VAULT" fetch --quiet origin
echo "VAULT=$VAULT"
echo "branch: $(git -C "$VAULT" rev-parse --abbrev-ref HEAD)  ahead/behind origin/master: $(git -C "$VAULT" rev-list --left-right --count HEAD...origin/master)"
git -C "$VAULT" log -1 --format='origin/master %h %ad %s' --date=short origin/master
```

**Read the memory files from `origin/master`, not from the working tree**, using `git show origin/master:<path>`. The working tree may sit on a stale or unmerged feature branch; `origin/master` is the shared memory. (Observed 2026-08-17: a Cowork container was on branch `dead-code-sweep`, ahead 1 and behind 7, and `git pull --ff-only` refused. Reading the working tree there would have returned three-day-old state presented as current.)

Fallbacks, in order:

1. **Clone fails** (no network, proxy-blocked) and this is Claude Code on the operator's machine: the vault is `C:\Users\jason\dotfiles`. Still `git fetch` and read `origin/master`.
2. **Cowork with the desktop bridge connected:** `mcp__remote-devices__device_stage_files` on `CLAUDE.md`, `docs/PROGRAM-BOARD.md`, `docs/INDEX.md`, `docs/ops/session-log.md` and read the staged copies. These are point-in-time snapshots of the operator's working tree, possibly dirty and possibly behind master. Say which source you used.
3. **Nothing works:** stop and say "I have no access to the vault, so I have no project memory this session." Do not proceed to answer architecture, cost, status, or history questions from the database or from search. The database is not the memory.

## A. Load the state

Paths are relative to `$VAULT`, read at `origin/master`. In this order:

1. `CLAUDE.md` at repo root — the constitution. **Cowork does not auto-load this. Read it in full.**
2. `docs/INDEX.md`, `## board` section only.
3. `docs/PROGRAM-BOARD.md`, first 150 lines — the authoritative resume state.
4. `docs/ops/session-log.md` — last 5 addendum headers (`grep -E '^## Addendum' | tail -5`), then the final addendum in full.
5. `git log --oneline -10 origin/master`.

Then state back in <=5 lines: **the vault path and the origin/master commit you read**, working branch and its divergence, what the last addendum says completed, open threads. If the user's request conflicts with the roadmap, surface the conflict.

## B. The verification discipline (non-negotiable)

**B1. Read the consumer before proposing a change to a producer.** Before proposing any change to a column, table, function, or module: find and read what CONSUMES it. `grep` the identifier across `src/` and `scripts/`. A change proposed without naming its consumers is structurally incomplete — say "I have not checked consumers" rather than proposing.

**B2. Search `docs/decisions/` before proposing a reversal.** Any cap, limit, threshold, schema shape, or vocabulary token may already be the subject of an ADR. `grep -ril "<identifier>" docs/decisions/` costs seconds. An ADR that names your target by column or field name is binding until the operator overrules it.

**B3. Label every factual claim with its evidence status.** `[CONFIRMED]` = you ran it or read it, this session. `[INFERRED]` = derived from something you read. `[HYPOTHESIS]` = plausible, unverified. Never state an inference in the same flat voice as a measurement. If a number could not be read directly (quota, plan tier, billing), it is `[HYPOTHESIS]` and stays labelled.

**B4. Measure, do not assume, even when a doc predicts the value.** If a prior audit predicts a baseline or count, re-run the check and compare. Agreement between prediction and measurement is the finding; asserting the prediction is not.

**B5. No system-level conclusion from a single data point.** A column name, one telemetry row, or one size statistic is not a diagnosis.

**B6. One writer per file per unit.** `docs/ops/session-log.md` and `PROGRAM-BOARD.md` are append-heavy shared files. Before writing, confirm no other session is mid-unit on them. A whole-file write (Cowork bridge, GitHub web upload) REPLACES and will silently delete another agent's work — verify your base is current `origin/master`, then diff before committing.

**B7. Cite the vault file, or declare its absence.** Every claim about architecture, cost, status, or history names the file it came from. If you did not read the vault this session, open with that fact before answering.

**B8. Verify Section C against `origin/master` before quoting it.** These corrections are a cache, and caches go stale. If a correction names a column, file path, or line number, confirm it still exists before you repeat it.

## C. Standing corrections (load these, they have been re-derived wrongly before)

- **`fsi-app/STATUS.md` is HISTORICAL.** Retired from Loading Priority 2026-08-14. Use `docs/PROGRAM-BOARD.md`.
- **"The flywheel" is TWO mechanisms.** (1) Connection discovery — live, pure computation, no LLM. (2) Decision propagation — `docs/specs/08-flywheel-design.md`, DESIGNED ONLY, no `entities` table exists. Do not conflate. There is no human-review loop and no customer-entered data anywhere in it.
- **Canonical transport mode is `ocean`** (operator ruling 2026-08-12, migration 263). `sea`/`maritime` are input aliases, never stored.
- **Community is a co-equal core surface**, not a bolt-on and not a trust-scoring input.
- **The Intelligence Assistant is a research helper**, never a synthesis or decision engine.
- **`agent_run_searches.result_content` is the GROUNDING SOURCE POOL.** It holds FULL captured source content, not an excerpt. ADR-016 forbids capping it at storage; `validate_item_provenance` checks every FACT's `source_span` verbatim against it, and the pipeline gates usability at >200 chars. Consumed in `fsi-app/src/lib/agent/canonical-pipeline.ts` (~line 1003). **The column was named `result_content_excerpt` until migration 264 (2026-08-17) renamed it precisely because the word "excerpt" invited the truncation ADR-016 refused.** Pre-264 docs, migrations, and audits still carry the old name; that is history, not the live schema.

## D. After a compaction

A compaction summary loses operator rulings and design distinctions. Re-run A0 and A in full and re-read C. **Trust `docs/specs/` and `docs/decisions/` at `origin/master` over your own summary's description of the architecture.**

## E. Failure log (why this file exists)

Each shipped as a confident, wrong claim and was caught by another agent reading primary sources:

- Flywheel described with an invented human-verification loop and invented customer data — corrected four times.
- "This commit satisfies its own gate" — false; the gate passed vacuously.
- Retention-14 for the backup quota — arithmetically re-breaks in two weeks; growth curve unchecked.
- "Truncate `result_content_excerpt`, it's a debug log" — would have destroyed the grounding pool and reinstated the exact defect ADR-016 exists to remove. Migration 264 renamed the column so the name can never make that argument again.
- **Loader failure, 2026-08-17.** This skill was named `resume`, colliding with the built-in `/resume` UI command, so invoking it by name always opened the session picker and never loaded the skill. It also hardcoded `/root/work/dotfiles`, a path that existed in exactly one container. A fresh Cowork session therefore answered a cost-and-architecture question from the application database with no vault citation, and the vault was never at fault. Fixed by renaming to `ledger` and adding A0. **Never name a skill after a reserved command, and never hardcode a container path as the source of shared memory.**

The common mechanism in all of these: **reasoning to a conclusion instead of reading the thing that settles it.** Reading first is slower and less satisfying than answering. Do it anyway.
