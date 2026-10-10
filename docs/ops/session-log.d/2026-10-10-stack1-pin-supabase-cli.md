## 2026-10-10, lane STACK-1 (stack1-pin-supabase-cli): the Supabase CLI in the shared local-stack action is pinned and its version lookup is authenticated

Defect: `.github/actions/local-stack/action.yml` installed the CLI with `supabase/setup-cli@v1` and `version: latest`. Resolving `latest` calls the GitHub releases API anonymously, so every stack job (migration proof, chain proof) depends on a shared rate limit and on silent CLI drift.

### Accomplished

1. `.github/actions/local-stack/action.yml`: `version: 2.120.0` and `github-token: ${{ github.token }}` on the setup-cli step, with a dated comment stating the pin, why, and that bumping it is a deliberate PR.
2. `fsi-app/scripts/proof/chain-proof-workflow.test.mjs` (the existing test that already reads the action): `cliPinProblems(action)` plus two tests. The first asserts the real action has a literal semver version (never `latest`), `github-token` equals `${{ github.token }}`, and a dated pin comment exists. The second is the attack: `latest`, `2.x`, no version, no token, and a non-github token each turn it red.

### Evidence

- [CONFIRMED: run 38019007029 log, job "Migration proof", setup-cli step] the step ran with `version: latest`.
- [CONFIRMED: same log, `supabase start` image pulls] the last green stack job started postgres 17.11.0.004, gotrue v2.197.0, edge-runtime v1.77.4.
- [CONFIRMED: `gh api` of `apps/cli-go/pkg/config/templates/Dockerfile` at tag v2.120.0] those three image tags are exactly the ones CLI v2.120.0 bundles; v2.119.0 bundles postgres 17.11.0.002, so it is not the version the stack was proven with. v2.120.0 is the latest stable release (published 2026-10-06, before that run).
- [CONFIRMED: `gh api` of `supabase/setup-cli` action.yml at ref v1] the input is named `github-token` (the brief said `token`; `token` is not an input of v1 and would be ignored). A fixed `version` skips the releases lookup entirely in v1, so the token only covers a remaining lookup.
- [HYPOTHESIS, unverified] the rate-limit message itself: the log of run 38019007029 shows the setup-cli step succeeding (2.2 s), so the quoted failure is from another attempt; the unpinned `latest` call is confirmed, the failure text was not seen by this lane.

### Read and reused

Read: COMMON, root `CLAUDE.md`, the action, `chain-proof-workflow.test.mjs` (action checks, `isolationProblems`), `migration-proof-workflow.test.mjs` (the token and action assertions), the PROOF-7 session log for format. Reused: the existing `ACTION` constant and the existing action test in `chain-proof-workflow.test.mjs`; no new test file, no new module. Both workflow tests assert "no GitHub token" on the workflow text only, never on the action, so they stay valid and need no change.

### Red then green (`node --test <file>`)

| File | Before the action change | After |
|---|---|---|
| chain-proof-workflow.test.mjs | 2 of 34 fail (the two new tests), 32 pass | 34 of 34 |
| migration-proof-workflow.test.mjs | n/a | passes (43 of 43 across both files) |

### Decisions

- Pin 2.120.0 (the CLI release matching the image tags of the last green stack job), not a newer one: a newer CLI changes the stack images, which is the drift being removed.
- `github-token` receives the job's own `github.token` (contents: read in both workflows), not a production credential; the action stays free of `secrets.` and of every forbidden credential name.

### NOT done

- The CI run of this PR is the first execution of the pinned install; its result is reported in the PR, not here. [NOT-WORK: CI is the gate, COMMON rule 9]
- Nothing watches for a newer stable CLI release, so the pin is bumped only when someone opens a bump PR. [NOT-WORK: scope statement, the pin is deliberate by design; a bump is a reviewed PR]
