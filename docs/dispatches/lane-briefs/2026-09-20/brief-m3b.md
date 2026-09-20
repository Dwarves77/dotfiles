# Lane M3b: the loop id reaches every hop downstream of the mint; two stale gate claims corrected

Coordinator brief, 2026-09-20. Executor: Sonnet. Read `brief-common-local.md` first (Amendment 1 wins over its body), then this. Lane id `m3b`. Worktree `wt-l34-detail-admin-primitives`, branch `lane/m3b-loop-id-downstream-2026-09-20`, cut from `origin/master` (the worktree holds a merged branch: `git fetch origin && git switch -c lane/m3b-loop-id-downstream-2026-09-20 origin/master`). Never operate in the main checkout.

## Step 0, before any edit (binding, lane G1 #754)

The skill gate judges YOUR OWN transcript. `fsi-app/scripts/turns/` and `fsi-app/src/lib/intake/` are governed by `environmental-policy-and-innovation` (`fsi-app/.discipline/governance/skill-map.mjs`). Your FIRST tool call is the Skill tool: `fsi-app:environmental-policy-and-innovation` (if that name is unknown, `environmental-policy-and-innovation`). You do not need to act on the skill's content; the load is the requirement. If an Edit or Write is still denied after a successful load, STOP and return the deny text verbatim. Do not retry more than once, do not read SKILL.md as a substitute.

## Why (premises, each checked by the coordinator on master `cc038a47`, 2026-09-20)

Plan 6.2 passes only when an artifact at EVERY hop carries the proof run's `loop_run_id`: sweep, fetch-drain, ledger-consume, population-turn (family `mint`), downstream-chain, propagation-drain, brief-export, gate-a-rescan. Lane M3 landed `config.github_run_id` on every artifact (`scripts/lib/run-artifact.mjs`) and `resolveLoopRunId` (`scripts/lib/loop-run-id.mjs`), wired into `run-fetch-drain.mjs`, `run-ledger-consume.mjs`, `run-mint-batch.mjs`. [CONFIRMED by grep from the repo root, control search hit 12 files] no other script mentions `loop_run_id`:

- `scripts/turns/emit-downstream-chain-artifact.mjs`: not wired (M3 was gate-blocked; design in `docs/ops/session-log.d/2026-09-19-m3.md`, "Stop ... Amendment 2 item 4").
- `scripts/turns/emit-corpus-turn-artifact.mjs`: not wired. M3's design maps "Corpus turn" to family `corpus-turn` and would resolve null there forever. `corpus-turn.yml` line 178 already exports `GITHUB_EVENT_WORKFLOW_RUN_ID`; its upstream is "Ledger consume".
- `scripts/turns/run-propagation-drain.mjs`: not wired. It already receives `--trigger-context '{name, run_id, conclusion}'` from `propagation-drain.yml` (upstreams "Data producers", "Downstream chain").

brief-export and gate-a-rescan are NOT yours (lanes M4 and M6 carry them).

## The change

1. **One home for workflow-name to family.** In `fsi-app/scripts/lib/loop-run-id.mjs` add and export `FAMILY_BY_WORKFLOW_NAME`, a frozen object keyed by the workflow `name:` exactly as the ymls spell it: `"Source sweep": "source-sweep"`, `"Ledger consume": "ledger-consume"`, `"Population turn": "mint"`, `"Corpus turn": "corpus-turn"`, `"Downstream chain": "downstream-chain"`, `"Brief apply": "brief-apply"`, `"Data producers": null` (producers are their own loop head: no sweep id exists upstream of them; null is the honest value, with that comment). Add and export `resolveLoopRunIdFromUpstream({ explicit = null, upstreamName, upstreamRunId, fsiRoot })`: looks the family up in the map; an unknown name or a null family returns `explicit ?? null`; otherwise it calls `resolveLoopRunId` with `harnessRunsDir = <fsiRoot>/scripts/harness-runs/<family>`. Before writing, read how the three existing callers build `harnessRunsDir` and match them exactly; if they disagree with that shape, STOP.
2. **Gate against recurrence (test, attack form).** In `loop-run-id.test.mjs`: import `LOOP_MANIFEST` (or whatever `fsi-app/.discipline/governance/loop-manifest.mjs` exports: read its export line first) and assert every hop's `producer.name` is an OWN KEY of `FAMILY_BY_WORKFLOW_NAME`. Prove the test bites: a temp copy of the map with one key removed must make the same assertion function fail (write the assertion as a small exported-in-test helper so both cases call it). A new hop with an unmapped producer now fails the suite instead of resolving null in production.
3. **`emit-downstream-chain-artifact.mjs`**: `buildArtifact` gains `loopRunId = null`, written to `config.loop_run_id`. `main()` resolves it with `resolveLoopRunIdFromUpstream({ upstreamName: DC_UPSTREAM_NAME, upstreamRunId: DC_UPSTREAM_RUN_ID, fsiRoot: FSI_ROOT })`. Do NOT add a second name map in this file (M3's design had one; item 1 replaces it). Keep the call site's property order unlike the signature's (M3 tripped F45 on a self-clone here).
4. **`emit-corpus-turn-artifact.mjs`**: same shape. `buildArtifact` gains `loopRunId = null` to `config.loop_run_id`; `main()` resolves with `upstreamName: "Ledger consume"` and `upstreamRunId: process.env.GITHUB_EVENT_WORKFLOW_RUN_ID || null` (a hand dispatch resolves null).
5. **`run-propagation-drain.mjs`**: `config.loop_run_id` resolved from `triggerContext?.name` and `triggerContext?.run_id` (stringify the run id) through the same helper; null when there is no trigger context. Read the file's artifact-building block (around lines 200 to 235) before editing; if the run id in `--trigger-context` is not the upstream GitHub run id (check `propagation-drain.yml` lines 175 to 200 and its `RUN_TRIGGER_CONTEXT` assembly), STOP.
6. **Tests**, in each file's existing `*.test.mjs`: default null; a value passed to `buildArtifact` is recorded verbatim; for the downstream-chain and corpus-turn emitters one fixture test through `resolveLoopRunIdFromUpstream` with a temp harness-runs dir (an upstream artifact with `config.github_run_id: "111"`, `config.loop_run_id: "loop-x"` resolves `"loop-x"`; a different run id resolves null). Extend the existing four-hop attack chain in `loop-run-id.test.mjs` to six hops (add downstream-chain and propagation) and keep its break-one-hop-null-cascades assertion.
7. **Pending files.** From the repo root, one grep of every `fsi-app/scripts/harness-runs/*/family.json` for each file you changed. For each family that lists a changed file as governing and gets no new run artifact from you, add `fsi-app/scripts/harness-runs/<family>/pending/2026-09-20-m3b.md` (`## Change`, `## Planned run`: the coordinator's proof run 6.2). If `pending/2026-09-19-m3.md` exists in that family, still add your own file; do not edit M3's.
8. **Two stale claims, corrected in place (rule 13 corollary).**
   - `fsi-app/.discipline/governance/worktree-isolation.mjs` lines 15 to 16 say PreToolUse "is session-scoped and does NOT fire inside subagents/workflows (project memory, verified 2026-06-07)". [REFUTED 2026-09-19: the main checkout's `.gate-audit.log` recorded 11 denials of a sub-agent's own Edit/Write calls.] Rewrite the sentence so the incident history stays true and the present is correct: it did not fire inside sub-agents when verified on 2026-06-07; it does now (observed 2026-09-19, lane M3; lane G1 #754 made the skill gate judge the acting agent's own transcript). Comment only, no code change in this file.
   - `fsi-app/.claude/skills/remediation-discipline/SKILL.md`: grep it for `PreToolUse` and for `does not fire`/`session-scoped`; correct each statement of the same claim the same way, dated. If the file does not state the claim (the coordinator's grep matched only two long lines, 117 and 142, not read), report that as [REFUTED] and change nothing there. If you change it, add `fsi-app/.discipline/governance/skill-acks/2026-09-20-m3b.md` naming the skill and the citing files you reviewed (`git grep -l remediation-discipline` from the repo root).
   - `git grep -n "does NOT fire inside\|not fire inside sub" -- fsi-app docs/runbooks` from the repo root after your edits: list any remaining live statement of the claim in your report. Fix those under `fsi-app/.discipline/` and `fsi-app/.claude/`; leave dated historical docs (`docs/ops/`, `docs/audits/`, `docs/archive/`) alone.

## Out of scope: STOP, do not solve

Any yml edit (none should be needed: all three workflows already pass the upstream name and run id); `brief-export`, `gate-a-rescan`, `apply-record-briefs.mjs`; `loop-manifest.mjs` (`enforceFired` flips are the coordinator's); any registry list (derived); `session-log.md`, PROGRAM-BOARD, INDEX, any README under `docs/dispatches/`.

## Gates, each once, in this order, from `fsi-app/` unless noted

`node --test` on the files you touched plus `loop-manifest.test.mjs`, `F50-loop-wiring.test.mjs`, `run-artifact.test.mjs`, `family-registry.test.mjs`; `npx tsc --noEmit`; `node .discipline/fitness/runner.mjs` (F45 must not exceed the merge-base count; F50 "hops not yet enforced" stays 11); `node .discipline/consistency/override-check.mjs --range=origin/master..HEAD`; then, LAST and ONCE, the locked push gate `bash "C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason/fddbeade-7f79-480a-9254-e8fdb3278567/scratchpad/lane-prepush-check.sh"` from the worktree root. You commit; you do NOT push. Commit message ends with `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`.

## Your session-log file

`docs/ops/session-log.d/2026-09-20-m3b.md` (date from the `date` command): what landed, gates verbatim, the [REFUTED]/[CONFIRMED] labels above carried through, a "UX compliance" block (not applicable, no `.tsx`/`.css`).

## Amendment 1 (coordinator, 2026-09-20, sent to the running lane by message; wins over the body)

(1) The commit trailer is exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (handoff 2026-09-18 section 1C), not the Sonnet line the Gates section gave. (2) No em dash, en dash or section sign in new prose or comments (pre-commit rule 022). (3) Never `git stash`, never `git add -A`, never `--no-verify`.

## Report (return as TEXT; you cannot write report files)

(a) the commit sha(s) and `git diff --stat origin/master..HEAD`; (b) gate outputs, the summary line of each; (c) every STOP or deviation; (d) a PR body, as text, titled `Lane M3b: the loop id reaches downstream-chain, corpus-turn and propagation; stale PreToolUse claim corrected`, ending with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
