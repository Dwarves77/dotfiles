# Lane G1: the skill gate reads the acting agent's own transcript (coordinator, 2026-09-19 night)

Read `brief-m-common.md` first (its Amendment 1 overrides the text above it). Lane id `g1`. Worktree
`C:/Users/jason/dotfiles/.worktrees/wt-hashsep-0911`; first command from its root:
`git status --short` (must print nothing, else STOP), then
`git fetch origin master && git switch -c lane/g1-skill-gate-agent-transcript-2026-09-19 origin/master`.
If `fsi-app/node_modules` is missing there, STOP. Shared ids assigned: NONE. If you need one, STOP.

## Why

`fsi-app/.discipline/governance/pretooluse-skill-gate.mjs` blocks a write to a governed file until the
governing skill was deliberately loaded (a `Skill` tool_use in the transcript). On 2026-09-20 00:55 UTC it
denied lane M3's edits to `fsi-app/scripts/turns/emit-downstream-chain-artifact.mjs` (correctly governed:
`skill-map.mjs` lists `fsi-app/scripts/turns/` under `environmental-policy-and-innovation`) AFTER the lane, a
sub-agent, had invoked that skill twice and read its SKILL.md twice. Audit log, main checkout
`.gate-audit.log`: 8 `Edit deny edit-governed-skillmissing`, 3 `Write deny`, in the minutes the sub-agent
worked, while the main session made no edits. Two facts follow. [CONFIRMED] The gate's header comments are
stale: they say PreToolUse does not fire inside sub-agents (verified 2026-06-07); it does now.
[HYPOTHESIS, yours to verify FIRST] The `transcript_path` the hook receives for a sub-agent's tool call is
the PARENT session's transcript, where the sub-agent's own `Skill` call never appears, so the demand can
never be met from inside a sub-agent. The operator's ruling is that Sonnet and Haiku lanes do all the work,
so a gate no lane can satisfy stops the build. No workaround: the gate must judge the agent that acts.

## What lands

1. Facts first, read-only, each labelled CONFIRMED or REFUTED with the method:
   a. Read `pretooluse-skill-gate.mjs`, `skill-token.mjs`, `skill-map.mjs` (the two lookup functions only),
      the wrapper command `.claude/settings.json` wires for PreToolUse, and the gate's existing test files.
   b. What a PreToolUse payload carries when a SUB-AGENT makes the call. One WebFetch of the official Claude
      Code hooks reference is allowed for this (record the documented input fields; look for an agent id, an
      agent type and an agent transcript path). Nothing else from the web.
   c. Where this machine stores sub-agent transcripts (search under `C:/Users/jason/.claude/projects/` for a
      recent `.jsonl` containing the string `lane-prepush-check`, list only file names and sizes, never print
      a transcript). Confirm whether a sub-agent's `Skill` tool_use is in the sub-agent's own file and absent
      from the parent's file.
   If nothing in the payload identifies the acting agent or its transcript: STOP with the evidence.
2. The fix, in the ONE function that reads the transcript: when the payload identifies a sub-agent, the gate
   judges the ACTING AGENT'S OWN transcript (payload path if given; else derived from the documented layout,
   derivation in one helper with its own test). A skill loaded only by the parent does NOT count for a
   sub-agent: the agent that writes is the agent that must have looked. A main-session call behaves exactly
   as today. Fail closed is kept: an agent transcript that is missing or unreadable denies with the existing
   no-transcript tag. The DEADLOCK ESCAPE rules are evaluated on that same transcript, unchanged.
3. The stale comments (file header "COVERAGE LIMIT", the worktree-isolation block, the dispatch-tools block)
   say what is true now, dated, citing the audit-log evidence above. The dispatch ASK stays; only its text
   stops claiming sub-agent calls are ungated.
4. Tests, attack form (rule 15), in the gate's existing test file: a sub-agent payload whose own transcript
   holds the Skill tool_use is allowed; the same payload when ONLY the parent transcript holds it is denied;
   a sub-agent payload whose transcript file is missing is denied no-transcript; a main-session payload is
   unchanged (existing tests untouched and green).
5. Docs: the gate's existing runbook or README section (grep for prior art; extend it, do not create a second
   doc); your session-log file.

## Stop conditions (report, do not solve)

The gate blocks one of YOUR OWN edits: stop at once, quote the BLOCKED text and the file, do not retry.
The payload cannot identify the acting agent. The hook the sessions actually run is not this file (say
which file and how it is wired). Any id needed.

## Note for the coordinator (not lane work)

Sessions run the MAIN checkout's copy of the gate, so the fix is live only after merge plus vault sync.

## Amendment 1 (coordinator, 2026-09-19 night, before dispatch)

The worktree named at the top is wrong: `wt-hashsep-0911` carries untracked files [CONFIRMED by `git status`].
Your worktree is `C:/Users/jason/dotfiles/.worktrees/wt-landdocs-0911` (clean, `node_modules` present). Same
first commands, same branch name.

## Amendment 2 (coordinator, 2026-09-20; answers lane G1's STOP at the push gate)

[CONFIRMED by lane G1, accepted] F51 check 5 fails on `docs/dispatches/lane-briefs/2026-09-19/README.md`: three coordinator docs PRs (#744, #751, #753) each appended rows to its per-brief table. That table is a hand-edited append list, the exact cause plan 6.8 removed (Cause A); the gate is right and the defect is the coordinator's. It fails EVERY lane's push until fixed, so it is fixed here, cause first:
1. That README: delete the whole per-brief table. In its place one static paragraph: one file per brief in this directory; amendments are appended in place inside each brief; what each lane landed is recorded in the lane's own `docs/ops/session-log.d/` file and in the coordinator's entries in `docs/ops/session-log.md`; this README carries NO per-brief rows (plan 6.8 Rule A; F51 check 5 caught the table forming on 2026-09-20). Keep the title, the first paragraph and the final "Related:" line as they are.
2. `fsi-app/.discipline/fitness/functions/F51-no-shared-append.mjs`, `HOTSPOT_ALLOWLIST`: one entry for that README path, in the exact shape of the existing entries, dated with today's date from the `date` command, reason: the three coordinator docs PRs named above appended to its table; the table is removed in this same commit so nothing appends to the file again; delete this entry once the file has left the 30-commit window. Nothing else in F51 changes: not the anchor, not the threshold, not any other entry.
3. Attack tests in `F51-no-shared-append.test.mjs`: (a) the live README contains no line starting with `| brief-` (plant one in a fixture copy and see it caught); (b) with the README hot in a fixture history, the allowlisted path passes and a second, non-allowlisted hot file still fails.
4. If F51's file is a governing file of any harness family (grep every `family.json`), extend or add that family's `pending/<date>-g1.md`; else nothing.
5. Commit (`Lane G1: ...`), update your session-log file in the same commit, then run the locked push gate ONCE more as one background task: this is your second and last run. FAIL again = STOP with the refusing step quoted.
6. You could not write the report and PR-body files (a tool rule refused them). Do not work around it: return the report and the FULL final PR body as text in your final reply; the coordinator's push runner writes the file.
