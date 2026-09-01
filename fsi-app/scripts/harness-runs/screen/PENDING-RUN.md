# Pending run — screen

**Governing files changed:** Wave MH-2 (2026-09-01) wired artifact emission directly into
`scripts/mint/screen-worklist.mjs`'s own execution path (`buildRunArtifact`, `nextRunId`, the
`writeRunArtifact` call at the end of `main()` — see the file's own header note) so every future
invocation writes its `screen-run-NNN.json` as part of running, not as a separate step a coordinator
remembers afterward (build plan §2). `screen-worklist.mjs` is one of the screen family's two governing
files per `scripts/harness-runs/CONVENTION.md`'s `harness_version` table (the other, `screen-rules.mjs`,
is untouched — byte-identical to `screen-run-003.json`'s recorded state), so this edit moved
`harness_version` even though no screen batch ran against real census data this wave.

**harness_version at write time:** `sha256:fecc9e4373cdd710`

**Planned run:** the next real screen batch (round 4, whenever the census worklist next needs a
re-screen — no round 4 is scheduled by this wave) is what supersedes this marker. Because emission is
now wired into the harness itself, that run's own `screen-run-004.json` will be written automatically
by `screen-worklist.mjs --input ... [--reviewed ...]` — no separate writer invocation to remember,
unlike mint's manual procedure (see `scripts/harness-runs/mint/PENDING-RUN.md`). When that run lands,
delete this file — F28 (`harness-run-integrity`) treats a `PENDING-RUN.md` whose recorded hash a landed
artifact already matches as stale and flags it for removal.

No classification RULE changed here (`screen-rules.mjs` is byte-identical to round 3's landed state;
`screen-run-003.json`'s empty `defects_found` and its 23 `mechanism_question_flags` open item both still
hold exactly as recorded) — only the runner script gained the ability to record its own history. A
future proposer pass over the screen family should still read `screen-run-003.json` in full (per
`PROPOSER-RUNBOOK.md`) before round 4, not treat this marker as that reading.
