# Lane W10-FactCard-b: FactCard part 2 of 2 (coordinator, 2026-09-21)

Model: Sonnet. Worktree: `C:/Users/jason/dotfiles/.worktrees/wt-w10-factcard` (has node_modules). Branch: `lane/w10-factcard-b`, cut from `origin/master` (at or past `b1dd38e4`; part 1 is PR #763, squash `2b2ac415`). Read, in this order: `docs/dispatches/lane-common-contract.md`; `docs/design/ux-laws.md` and `docs/design/design-principles.md` (DP-1, DP-2); the bundle `docs/design/handoff-2026-09-07/` (README sections on FactCard and "Undrawn cases, rulings 2026-09-20"; artboard 08); sections A, B.1, B.2 and C of `docs/dispatches/lane-briefs/2026-09-20/brief-w10-factcard-amendment-1.md`. The bundle is the standard: a live page that does not match it is not correct. STOP on anything not covered.

## Premises checked by the coordinator on `b1dd38e4`

- [CONFIRMED] `MatrixFactCard` still lives in `src/components/operations/RegionDimensionMatrix.tsx` (also named in its `.npmtest.mjs` and in `.discipline/rendering/audit/mounts.mjs`).
- [CONFIRMED] `src/app/admin/` holds `page.tsx` and `factors/` only: no `/admin/parts` exists.
- [CONFIRMED] the one model is `src/lib/detail/fact-card-model.ts`; the part is `src/components/ui/FactCard.tsx`; none of the files above is an F51 hotspot today.
- [HYPOTHESIS, open from 2026-09-20] the live DOM showed 56 and 37 literal-markdown matches at FULL BRIEF depth, in plain `<p>` elements with no rendered children. Part 1 found and fixed the Summary-depth cause only (the v1 card printed a raw string).

## Build

1. **Operations matrix panel: migrate.** `MatrixFactCard` is deleted; the panel renders the ONE part with `density="matrix"` (lead Anton 18, claim 12.5px, source line; artboard 08). Its header comment cites operator ruling 4 of 2026-09-20. RUN the panel's spec suite (`RegionDimensionMatrix.npmtest.mjs` and any rendering audit spec that mounts it) in the lane and fix what it shows; update `mounts.mjs` to the new name. The panel stays CLOSED on first navigation (F43, RD-67): no default selection.
2. **Full brief depth: find the second insertion point.** Read `RegulationDetailSurface.tsx`, `MarketSignalDetailSurface.tsx` and whatever renders `[data-section-card]` bodies at Full brief depth; find where `full_brief` (or a section body) reaches a `<p>` or `{value}` without passing through the model or the GFM component. Fix at the cause: a fact paragraph goes through `fact-card-model.ts`, running prose through the existing GFM component. One render test per insertion point; fixture = the measured pattern (`**Cause:** FACT: "..."`, `*Source: ... 02/04/2025.`); assertion = no `*` character in the rendered text. If a value is printed raw in more than four places, fix the two surfaces, list the rest, and STOP on those. Label your finding [CONFIRMED] with the file and line, or say it stays [HYPOTHESIS].
3. **`/admin/parts` and `/admin/parts/fact-card`.** Platform-admin gated with the same guard and frame as the other `/admin` routes. The index lists parts (one today). The part page renders, from static fixture models and NO database read: every one of the nine kinds, every form, the no-lead case, `density="matrix"`, a long claim, a card with no provenance. This is the one home for every part's sign-off picture; later part lanes add a page each. Register it wherever the rendering guard, F35 or F25 requires so it is reachable and measured at 375 and 1280.
4. Every part root carries `data-part`; FactCard already does (`data-part="fact-card"`, `data-kind`). Keep it on the matrix density.
5. Session-log addendum file for this lane with a "UX compliance" block (the discipline CI fails a surface PR without it), written where the lane contract says a lane writes it (never `docs/ops/session-log.md` itself: F51 check 4).

NOT yours: the no-lead count (coordinator, bounded read-only sample); the live-DOM re-measure after deploy (coordinator).

## Gates

- Playwright is NOT installed on this PC by operator ruling ("We do not need to install extra software use GitHub"). Prove everything else locally: the npm test suites you touch, `tsc`, the FULL fitness runner. The Rendering guard is judged on GitHub after the push; a red Rendering guard there is a review result you will be asked to fix. Do not install anything.
- First tool calls: Skill tool, `fsi-app:environmental-policy-and-innovation`, then `frontend-design`, and `remediation-discipline` if the write gate asks.
- Never `git stash` (clean master: `git worktree add --detach <scratch path> origin/master`). Never `git add -A`, never `--no-verify`. Never run `repin.mjs`, `reseed-f45.mjs`, `repin-skills.mjs`, `resolve-conflicts.mjs`. Commit trailer exactly: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. Skill-ack files copy the exact heading shape of an existing one.
- F42: no hand-built card shell outside `SectionCard`. F49: no part literal in a `page.tsx`. F40: a browser call to a guarded route goes through `authedFetch`. F45 must not rise.
- F51 check 5: if your own range would make a file's third touch in the window, restructure or STOP, never allowlist.
- `coverage-scan.mjs` rewrites the tracked `fsi-app/.discipline/governance/coverage-report.json`; restore it with `git checkout --` before the gate.
- Run the FULL fitness runner (`node .discipline/fitness/runner.mjs`, all functions) to 0 violations, then the locked push gate once, last, as one background task. A FAIL from your own change is fixed at the cause and the gate runs once more; a second FAIL on the same step is a STOP. You do not push. Past about 400k tokens, stop and report.
- No workaround of any kind.

## Report

ONE final report, five lines maximum, no interim messages: commit sha(s); fitness violations (number) and push gate result; the Full-brief finding with its status token and file:line; the two route paths built; anything you STOPped on, with the measurement. Also write a PR body file `pr-w10-factcard-b.md` into `C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason/fddbeade-7f79-480a-9254-e8fdb3278567/scratchpad/` (that exact path; it is the coordinator's scratchpad, `C--Users-jason`, not your own), ending with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
