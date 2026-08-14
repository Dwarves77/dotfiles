---
name: done
description: Caro's Ledge memory checkpoint. Writes session state back to the vault (docs/) and commits it, so future sessions in Claude Code and Cowork can read it. Run at the end of every completed work unit and before every push, not only at session end. Use when the user says "/done", "checkpoint", "save state", "wrap up", or when a unit of work is complete, or when compaction risk is high (long session, large context).
---

# Done: checkpoint memory to the vault

The project's memory is `docs/` in the repo, and it only exists for other sessions once it is COMMITTED. An Obsidian edit or a working-tree change that never lands in git is invisible to every cloud session and every future local session. This skill writes the checkpoint and gets it into git.

## When to run

- After completing any unit of work, not just at session end. Session-end-only checkpointing is the failure mode this skill replaces.
- Before any push.
- When a session has grown long enough that compaction is plausible: checkpoint FIRST, then continue. A checkpoint written before compaction survives it; context does not.

## Steps

1. **Append a dated addendum to `docs/ops/session-log.md`.** First person. What was done, what was decided and by whom (operator rulings quoted or paraphrased faithfully), errors made and corrected (record them honestly, this log's value is that it does not flatter), open threads, and the single next step a cold session should take.

2. **Update `docs/PROGRAM-BOARD.md`** for any thread opened, advanced, or closed this session. The board is the resume state; an addendum without a board update strands the next session.

3. **Update `docs/INDEX.md`** if any new living doc was created (one line, correct section).

4. **Commit the memory files in the same commit or PR as the work they describe.** Never a separate "docs later" commit that may not happen. If the environment cannot push (proxy-blocked, no credentials), still commit locally if possible, and end the session message with an explicit list: which files carry uncommitted memory and where they live, so the operator can land them.

5. **Verify**: `git status` shows the memory files staged/committed, and the addendum header carries today's date.

## What this skill is not

It is not the enforcement. Enforcement is server-side: the discipline CI gate that fails a push touching code without touching memory files. This skill is the pen; CI is the rule. If the CI gate does not exist yet, say so in the addendum rather than assuming it.
