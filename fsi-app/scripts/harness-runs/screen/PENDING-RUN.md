# Pending run — screen

**Governing files changed:** Wave MH-2 (2026-09-01) wired artifact emission directly into
`scripts/mint/screen-worklist.mjs`'s own execution path (`buildRunArtifact`, `nextRunId`, the
`writeRunArtifact` call at the end of `main()` — see the file's own header note) so every future
invocation writes its `screen-run-NNN.json` as part of running, not as a separate step a coordinator
remembers afterward (build plan §2). `screen-worklist.mjs` is one of the screen family's two governing
files per `scripts/harness-runs/CONVENTION.md`'s `harness_version` table (the other, `screen-rules.mjs`,
is untouched — byte-identical to `screen-run-003.json`'s recorded state), so this edit moved
`harness_version` even though no screen batch ran against real census data this wave.

**Re-stamped 2026-09-02 (operator ruling, screen-rules.mjs CHANGED):** two round-2 OFF rules flipped
`on_vertical` after population runs #9–#11 surfaced them on live record-grade items and the operator ruled
"these are 100% in vert" — `rhine_navigation_administration` (CCNR/CESNI positions: inland-waterway
emission standards sit with the CCNR) and `road_vehicle_weight_dimensions_administration` (weights and
dimensions carry the zero-emission-truck allowance); `reviewed-verdicts.json` has six entries flipped
`on_vertical` by the same ruling (TEN-T 2024/1679, the three CEF 1316/2013 rows, the TEN-T coordinator
designation, 2020/349 aerodynamic devices). Match logic untouched; verdicts and mechanism annotations only.
Tests updated (10 flips; reviewed counts 810 off / 680 on / 256 ambiguous). The screen now runs INSIDE
the population export every dispatch (`export-census-rows.mjs` → `lib/screen-verdict.mjs`), so the run
that supersedes this marker is the next `population-turn` dispatch's screened export — the screen family
still has no round-4 `screen-worklist.mjs` batch of its own; that remains the honest gap below.

**Re-stamped 2026-09-04 (lane GOV-SINGLE, governing-files.mjs single-source refactor):**
`SCREEN_GOVERNING_FILES` moved from a plain literal array declared inside `screen-worklist.mjs` to
`export const SCREEN_GOVERNING_FILES = GOVERNING_FILES.screen;`, importing its entry from the new single
source `scripts/harness-runs/governing-files.mjs` — F28 now imports the SAME array instead of separately
importing `SCREEN_GOVERNING_FILES` from this file, so the two can no longer drift by construction (they
already couldn't since Wave MH-2, but the direction of truth was screen-worklist.mjs -> F28; it is now
governing-files.mjs -> both). The FILE LIST this family's `harness_version` hashes is byte-identical
(`scripts/mint/screen-rules.mjs`, `scripts/mint/screen-worklist.mjs` — unchanged); only
`screen-worklist.mjs` itself — one of its own two governing files — changed BYTES (the import line and the
declaration), which is what moved the hash again. `screen-rules.mjs` is untouched.

**harness_version at write time:** `sha256:bcba50585bb00ce3` (superseded above: `sha256:a6cb87abf8e61cd9`)

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
