# Lane G4: the funded-pass run-lock golden cleans up by its real key, never leaves a row, never collides (coordinator, 2026-09-22)

Model: Sonnet. Worktree: `C:/Users/jason/dotfiles/.worktrees/wt-l25-slot-mirror` (node_modules present; no Playwright needed, no `.tsx`/`.css` in this lane). Branch: `lane/g4-runlock-golden-cleanup`, cut from `origin/master` at or past `bfde1be8`. Read `docs/dispatches/lane-common-contract.md` first. STOP on anything not covered.

## Finding [CONFIRMED by the coordinator, 2026-09-22, method named per line]

1. `fsi-app/scripts/verify/funded-pass-lock-golden.mjs` `cleanup()` runs `sb.from("funded_pass_runlock").select("id").eq("lock_key", KEY)`. The table has NO `id` column (migration 205: primary key is `lock_key`; live query returned Postgres `42703 column funded_pass_runlock.id does not exist`). The error is discarded, `ids` is empty, `guardedDelete` is never called. Cleanup has been a silent no-op since the golden was written (`e99f4f4a`, 2026-07-15).
2. Step 6 of the golden acquires the lock as holder A after the release and relies on the final `cleanup()` to remove it. It never does. Live table right now: one row, `lock_key = funded-pass-golden-test`, holder A pid 990001, acquired `2026-09-22T17:29:16Z` (read-only SELECT).
3. The next run, more than 300 s later, finds that row stale, and `acquireRunLock` returns `takeover=true`; the first check (`a1.takeover === false`) FAILS. Observed at the locked push gate for `wt-session-d` at 13:29 EDT 2026-09-22: `FAIL — first acquisition succeeds :: ok=true takeover=true` <!-- glyph:verbatim -->, goldens 15 pass 1 fail, push refused. The golden runs for real only where `.env.local` exists (`wt-session-d`); lane G2 (#774, 2026-09-21) wired the goldens into the push gate, so the first gated run passed (#776) and every later one fails. This is a defect in the golden, not in the lock.

## Build

1. `cleanup()` deletes by the real key: `guardedDelete("funded_pass_runlock", [KEY], { cite, matchColumn: "lock_key" })` (the `matchColumn` option exists in `scripts/lib/db.mjs`). A select error is thrown, never swallowed. After cleanup, assert with a `count: "exact", head: true` query that zero rows carry the key, and FAIL loud if not.
2. The key is unique per run: `funded-pass-golden-test-<pid>-<Date.now()>`, so two gates on one machine (a lane's locked gate and the coordinator's queue run at the same minute on 2026-09-22) cannot share a row. Guard the prefix in code: every delete in this file asserts the key starts with `funded-pass-golden-test`; the real `funded-pass` key can never match.
3. Abandoned fixture rows are swept at start: rows whose `lock_key` starts with `funded-pass-golden-test` and whose `heartbeat_at` is older than 10 minutes (a gate killed by `signal 9` mid-golden leaves one). Same guarded path, same prefix assertion. This sweep removes the live row from finding 2 on its first run; say so in the log.
4. The checks run inside `try/finally` so a failing check still cleans up its own key.
5. Bounded sweep of the same pattern: `grep -n 'select("id")' scripts/verify/*.mjs`. Two other hits (`run-data-audit-lane.mjs:42`, `surface-visibility-audit.mjs:88`) select from `integrity_flags`; confirm from `supabase/migrations/` that `integrity_flags` has an `id` column and record the result. Fix in place only if it does not; otherwise no change there.

## Proof (the golden is proven by execution, rule 15)

Run the golden twice in a row with real credentials, both must print `=== GOLDEN PASS ===`. Credentials: `fsi-app/.env.local` exists only in `C:/Users/jason/dotfiles/.worktrees/wt-session-d/fsi-app/`. Load it through the ONE loader (`scripts/lib/env-file.mjs`; F48 refuses any other load): copy that file to your worktree's `fsi-app/.env.local` (untracked, gitignored; confirm with `git status` that it never appears), run the golden twice, then DELETE the copy and confirm with `ls`. Never commit it, never print its contents. Then a read-only SELECT: the count of rows whose `lock_key` starts with `funded-pass-golden-test` is 0. Quote all three results in the log.

## Gates

Every npm suite with CI's shared script, `tsc`, the FULL fitness runner (all functions) to 0 violations, restore `coverage-report.json` if dirtied, the locked push gate once (`lane-prepush-check.sh <worktree>` from the coordinator scratchpad `C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason/fddbeade-7f79-480a-9254-e8fdb3278567/scratchpad/`) as one background task; silence is normal; `signal 9` is contention, wait and retry once; a second named FAIL is a STOP. Because the copied `.env.local` must be deleted before the gate, the gate's own golden run self-skips (exit 2) in this worktree; the proof above is the execution. First tool calls: Skill tool, `fsi-app:environmental-policy-and-innovation`, then `remediation-discipline`. Never `git stash`, never `git add -A`, never `--no-verify`. Trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. No workaround: no skip, no allowlist, no baseline. You do not push.

Log: `docs/ops/session-log.d/2026-09-22-g4.md` with the finding, the fix, the three proof results, the sweep result, and a `## UX compliance` block reading "Not a UI change".

## Report

ONE final report, six lines maximum, sent once: commit sha; the two golden results quoted; the row count after; npm totals, fitness violations, gate exit code; any STOP. Write `pr-g4.md` into the coordinator scratchpad above: first line `## Lane G4: the funded-pass run-lock golden cleans up by its real key and never leaves a row`, `## Summary`, `## Evidence`, `## UX compliance`, last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
