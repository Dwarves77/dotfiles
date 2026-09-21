# Lane R7m: the loop manifest is a directory (coordinator, 2026-09-21)

Model: Sonnet. Worktree: `C:/Users/jason/dotfiles/.worktrees/wt-landdocs-0911`. Branch: `lane/r7m-loop-hops-dir`, cut from `origin/master` (at or past `b1dd38e4`). Read `docs/dispatches/lane-common-contract.md` first. STOP on anything this brief does not cover.

## Why (measured, 2026-09-21)

`fsi-app/.discipline/governance/loop-manifest.mjs` holds `LOOP_HOPS` as a hand-edited array. Every M lane flips a hop in it, and the hop proofs will flip `enforceFired` on up to eleven hops. [CONFIRMED, `git log --first-parent -30 origin/master`] the file is touched by 2 of the last 30 first-parent commits (window positions 11 and 17); the next lane that edits it is refused by F51 check 5. This is the plan 6.8 class (remediation-discipline category 48: a registry is a directory). Fix the cause once, before M6b and before the hop proofs.

## Build

1. `fsi-app/.discipline/governance/loop-hops.d/<order>-<hop-id>.json`, one file per hop, every field of today's entry carried over byte for byte in meaning (`id`, `producer`, `consumer`, `trigger`, `family`, `enforceEdge`, `enforceFired`, `consumerPending`, `familyPending` where present, `note`). The two-digit `<order>` prefix keeps the build plan section 1 loop order; a duplicate order prefix or duplicate `id` is an error the loader throws on.
2. `loop-manifest.mjs` keeps its export name and shape: `LOOP_HOPS` is derived at import by reading the directory (sorted by filename), frozen. No consumer changes its import (F50, RD-74, `loop-manifest.test.mjs`, `loop-run-id.test.mjs`). The header comments that describe individual hops move into each hop's `note`; the file keeps only the contract.
3. Proof by attack in `loop-manifest.test.mjs` (fixture directories, never the live one): a duplicate id throws; a duplicate order prefix throws; a file missing a required field throws naming the file; the derived array deep-equals a pinned snapshot of TODAY's eleven hops taken before the conversion (so the conversion is proven lossless), and that snapshot assertion is then replaced by a shape assertion so the test never pins the list again (the R6t lesson: no pinned list of live entries).
4. F51: add `loop-manifest.mjs` to check 1's converted-registry set (it must not regrow a hand-written hop entry; attack test planted and removed), and `loop-hops.d/` to the entry-directory set so a hop file is never a hotspot. Coordinator ruling, because F51's own message names this path and the conversion is the last hand edit of the file: one dated `HOTSPOT_ALLOWLIST` entry for `fsi-app/.discipline/governance/loop-manifest.mjs`, `decidedOn: '2026-09-21'`, reason: "coordinator, lane R7m: the conversion of LOOP_HOPS to loop-hops.d/ is this file's last hand edit; after it a hop is its own file. Delete once the file has left the 30-commit window." No other allowlist entry. If F51's own file would become a hotspot by this range, STOP with the measurement.
5. `remediation-discipline` SKILL.md is NOT edited. Skill-ack file only if the gate asks for one, copied from an existing ack's exact heading shape.

## Standing lines (each cost a lane cycle)

- First tool call: Skill tool, `fsi-app:environmental-policy-and-innovation`; then `remediation-discipline` (the write gate asks for both).
- Never `git stash` (clean master: `git worktree add --detach <scratch path> origin/master`). Never `git add -A`, never `--no-verify`. Never run `repin.mjs`, `reseed-f45.mjs`, `repin-skills.mjs`, `resolve-conflicts.mjs`. Commit trailer exactly: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose.
- `coverage-scan.mjs` rewrites the tracked `fsi-app/.discipline/governance/coverage-report.json`; restore it with `git checkout --` before the gate.
- Run the FULL fitness runner (`node .discipline/fitness/runner.mjs`, all functions) to 0 violations, then the locked push gate once, last, as one background task. A FAIL from your own change is fixed at the cause and the gate runs once more; a second FAIL on the same step is a STOP. You do not push; the coordinator's runner does.
- No workaround of any kind: no exclude, no flag, no allowlist beyond the one ruled above.

## Report

ONE final report, five lines maximum, no interim messages: commit sha; fitness runner violations (number); push gate result; the hop count read back from the directory; anything you STOPped on, with the measurement.
