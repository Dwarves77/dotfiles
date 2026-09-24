# Lane AUTH-IDENTITY: a failed identity lookup is never read as "no workspace"; one admin gate (coordinator, 2026-09-24)

Read `docs/dispatches/lane-common-contract.md` first. Worktree from `origin/master`; branch `lane/auth-identity`. Commit trailer: your own session's attribution line.

## The defect [HYPOTHESIS, strongly evidenced; diagnosis 2026-09-24]

On 2026-09-24 at 16:51:50Z and 16:52:00Z the operator (jasonlosh@hotmail.com, user `2b7d21eb-8ea0-4b8d-a313-744aa3789c75`) signed in on two computers and saw "No workspace yet" and no Admin item, while the database was correct throughout (profiles.org_id set, workspace_role owner, is_platform_admin true, org_memberships owner of "Dietl / Rockit") [CONFIRMED by SELECT]. A later load recovered with no data change.

- `fsi-app/src/components/AuthProvider.tsx:139-152` fetches `/api/auth/identity` exactly once per tab (empty-dependency effect, no retry, no revalidation).
- Any non-200 or network failure goes to `seed(null)`; `resolveAuthSeed(null)` in `fsi-app/src/lib/bootstrap-seed.ts:43,57-58` returns `EMPTY_SEED` with `orgId: null`. That is the RESOLVED-no-org value of the three-valued state from the 2026-09-04 PERF-MERGE fix (`fsi-app/src/components/app-shell-banner.ts:26-40`).
- So "the lookup failed" and "the user has no org" are one state, and it sticks for the tab's life.
- `Sidebar.tsx:116-118` `isAdmin` reads `userRole` from `useWorkspaceStore`, which `seed()` sets only when a role is present (`AuthProvider.tsx:129-131`), so Admin hides too.
- Not a cache: the identity route sets `Cache-Control: private, no-store`, and the store has no `persist` [CONFIRMED by code read].
- The #793 redeploy finished at 17:02:13Z, after the failure; the redeploy-cleared-a-cache theory is [REFUTED].
- Unknown: why the request failed at 16:51. Vercel runtime logs would say; the Vercel MCP needs the operator's authorization. Record it as an open question, do not guess.

## Build (class fix, not a patch)

1. **Failing-first tests.**
   - A `node --test` unit on `resolveAuthSeed` / `shouldApplySeed`: a failed fetch (null bootstrap or error) must produce a state DISTINCT from a real resolved-no-org bootstrap (real user, `orgId: null`). It fails on master today; show that.
   - A provider-level test: a rejected or non-200 first `fetch("/api/auth/identity")` triggers a retry, never a terminal no-org seed.
2. **A fourth state for a failed resolution** (e.g. `"error"`) through the seed type, `shouldApplySeed` and `computeShowNoWorkspaceBanner`:
   - The "No workspace yet" banner shows only for a resolved-no-org state, never for error or loading.
   - The error state renders the StateNote error variant with a retry action, not a silent empty.
3. **Bounded retry:** 3 attempts with backoff, then re-arm on window focus and visibility change. There are no timers beyond that and no polling.
4. **One admin gate.**
   - The Sidebar Admin item and `requirePlatformAdmin()` (`fsi-app/src/lib/auth/admin.ts:56-83`) currently check different things: workspace role vs `profiles.is_platform_admin`.
   - Make the nav show Admin exactly when the `/admin` route will admit the user. The identity route returns the platform-admin bit, and the nav reads it.
   - Keep workspace-owner-only admin sub-pages, if any exist, gated as they are, and name them in the report.
   - A test proves the nav and the route agree for all four combinations (platform admin yes/no × workspace owner yes/no).
5. Presence report: every consumer of `orgId`/`userRole` that treated null as no-org, with file:line, fixed to handle the error state.

## Gates

Each gate starts only when `tasklist | grep -ic node.exe` prints 3 or fewer:
1. The real Rendering guard twice (PASS both).
2. The npm-glob suite with CI's shared script.
3. `tsc`.
4. The FULL fitness runner (0 violations).
5. Restore `coverage-report.json` if it is dirtied.
6. The locked gate once: `bash "C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason/fddbeade-7f79-480a-9254-e8fdb3278567/scratchpad/lane-prepush-check.sh" <worktree>`.

A child crash (exit 3221225794 or `signal 9`) is contention: wait and re-run that step once. The session-log addendum carries a "UX compliance" block (this touches a surface).

The PR body goes in the coordinator scratchpad as `pr-auth-identity.md`; its first line is `## Lane AUTH-IDENTITY: a failed identity lookup is never "no workspace"; the Admin nav and the /admin gate agree`.

Do the work yourself; do not push. ONE final report, six lines maximum: commit shas; the failing-first test names with their before and after results; the states added and the banner rule; the admin-gate change and the 4-combination test; the guard's two results, npm totals, fitness violations and gate exit code; any STOP.
