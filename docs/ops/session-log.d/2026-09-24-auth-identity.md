# Lane AUTH-IDENTITY session log (2026-09-24)

Brief: `docs/dispatches/lane-briefs/2026-09-24/brief-auth-identity-retry.md`, with finding 1 of
`docs/dispatches/lane-briefs/2026-09-24/brief-live-findings.md` folded in. Branch `lane/auth-identity`
from `origin/master` at `44187dfa`, in an isolated agent worktree.

Skills loaded via the Skill tool: `caros-ledge-platform-intent` (the governed-file hook required it
before the identity route edit). Read before any `.tsx` edit: `docs/design/ux-laws.md`,
`docs/design/design-principles.md` (DP-1, DP-2), `docs/dispatches/lane-common-contract.md`.

## Findings (each labelled)

1. [CONFIRMED by code read] A failed identity lookup and "this user has no workspace" were one state.
   `AuthProvider.tsx` fetched `/api/auth/identity` once per tab; any rejection or non-200 called
   `seed(null)`; `resolveAuthSeed(null)` returned `orgId: null`, the resolved-no-org value. The "No
   workspace yet" banner showed, the workspace role was never written so Admin hid, and nothing retried.
2. [CONFIRMED by code read] A second path to the same false state: the identity route's own `catch`
   answered **200** with the anonymous shape (`orgId: null`), and `resolveServerBootstrapFromClient`
   never read `membershipRes.error` / `profileRes.error`, so a failed membership read also came back as
   `orgId: null`. The client paired that with the browser session user: "signed in, no workspace".
3. [CONFIRMED by code read] Two admin gates. The nav's Admin row showed for workspace role
   owner/admin; `/admin` (`requirePlatformAdmin`) admits only `profiles.is_platform_admin = true`.
4. [REFUTED] Live finding 1, "the nav footer shows `jasonlosh@gmail.com · owner`": the text is not in
   the nav. A read-only live check (the operator's saved session, headless, `/admin`) found the one text
   node `jasonlosh@gmail.com · owner` inside `div.admin-t08-frame`, which is /admin's "Newest join" tile
   (`src/components/admin/redesign/WorkspacesUsageRow.tsx:134`, `[memberDisplayName(newest), newest.role]`).
   A SELECT on `org_memberships` for org `a0000000-...0001` confirms the newest membership is the gmail
   account (owner, created 2026-05-28); hotmail joined 2026-04-05. That tile is a members-table figure
   by design, not an identity display. The nav footer on the same load read `Account / Dietl / Rockit /
   Admin 1,693 OWNER` and `/api/auth/identity` returned hotmail (`2b7d21eb-...`, owner, 200). No nav or
   menu field derives from a membership pick: the account menu renders `user.email`
   (`UserMenuDropdown.tsx:73`) where `user` is `useAuth().user` (`Sidebar.tsx`), and the bootstrap
   filters `org_memberships` by the authenticated `user.id`.
   The nav's `userRole` source: `AuthProvider.tsx` `seed()` -> `useWorkspaceStore.setUserRole(applied.role)`
   from the identity route's per-user membership row.
5. [HYPOTHESIS, open] Why the 16:51Z request failed is still unknown. `error_events` has no row in
   16:40-17:10Z [CONFIRMED by SELECT], and before this lane the route recorded nothing on failure, so
   the cause cannot be read back from the database. Vercel runtime logs for that window would say; the
   Vercel connector needs the operator's authorization. From now on a failed lookup lands in
   `error_events` (route `/api/auth/identity`).

## Built

- `src/components/shell/bootstrap-seed.ts`: `IdentityStatus` (`pending` | `resolved` | `error`);
  `resolveAuthSeed(null)` returns the frozen `IDENTITY_ERROR_SEED` (`status: "error"`, `orgId: undefined`);
  a signed-out 200 resolves with `orgId: undefined` ("no workspace" is only said of a known user);
  `shouldApplySeed(current, incoming)` (a resolved answer is final; a success replaces an error);
  `shouldShowAdminNav`; `noWorkspaceLabel`; the retry schedule (3 attempts, 600 ms then 1800 ms).
- `src/components/auth/identity-loader.ts` (new): the bounded attempt loop; `rearm()` starts one new
  round only after an `error`. No polling, no timer beyond the backoff.
- `src/components/auth/AuthProvider.tsx`: runs the loader; re-arms on window focus and on
  `visibilitychange` to visible; exposes `identityStatus`, `retryingIdentity`, `retryIdentity`,
  `isPlatformAdmin`. An error answer leaves `user` to the session and writes nothing to the store.
- `src/components/app-shell-banner.ts` + `src/components/AppShell.tsx`: the banner requires
  `identityStatus === "resolved"`; the `error` state renders a CRITICAL-band `StateNote` with Retry.
- `src/lib/auth/platform-admin-gate.ts` (new): `isPlatformAdminProfile` and `decidePlatformAdmin`, the
  one predicate. `admin.ts` (`requirePlatformAdmin`, `isPlatformAdmin`) and `server-bootstrap.ts` both
  use it; the bootstrap now returns `isPlatformAdmin`.
- `src/lib/api/server-bootstrap.ts`: `IdentityLookupError` on a membership or profiles read error and
  on a transient (`AuthRetryableFetchError`) getClaims error; `resolveServerBootstrap()` rethrows it so
  `/onboarding` and `/workspace/new` render their error boundary instead of redirecting a real member
  to "create a workspace". Other auth errors (no session, expired JWT) stay anonymous, unchanged.
- `src/app/api/auth/identity/route.ts`: a failed resolution answers 503 and calls `captureError`.
- `src/components/Sidebar.tsx`: Admin row on `shouldShowAdminNav` (the platform bit); the role badge
  renders only when there is a role. `src/lib/hooks/useAdminAttention.ts` enables on the same bit
  (its route is platform-admin gated; a non-staff owner used to get a 403 on every poll).
- `src/components/profile/UserProfilePage.tsx`: the two "No workspace" / "Not in a workspace" strings
  go through `noWorkspaceLabel` (error says "Workspace unavailable").
- `.discipline/rendering/smoke/stub-auth-provider.mjs`: the audit stub returns the new context fields
  (resolved, platform admin), so the nav footer mounts exactly as before.

Workspace-owner-only admin sub-pages: none exist. Every `/admin/**` page calls `requirePlatformAdmin`
(`admin/page.tsx`, `admin/factors`, all thirteen `admin/parts/**`). Workspace-owner management lives on
`/profile` (MembersPanel, OrganizationPanel), gated on the workspace role, unchanged.

## Presence report: consumers that read null as "no workspace"

- `AppShell.tsx` banner: fixed (status-gated). `UserProfilePage.tsx` dek and "Member since" note: fixed.
- `Sidebar.tsx` Admin row and `useAdminAttention.ts`: moved to the platform bit.
- `onboarding/page.tsx` (`!bootstrap.orgId` -> `/workspace/new`) and `workspace/new/page.tsx`: fixed at
  the source (a failed lookup throws to the error boundary).
- Checked, no false claim, left as is: `Sidebar.tsx` Account row (a dash placeholder when there is no name), `DashboardMasthead.tsx:73`
  (Absence), `SettingsPage.tsx:174` (omits the clause), `BriefingScheduleSection.tsx:283`,
  `RegulationDetailSurface.tsx:162` (hides the integrity banner without a role), `AdminDashboard.tsx:588`
  ("Invitations need a resolved workspace", platform-admin page).

## Failing-first proofs

- `bootstrap-seed.test.mjs` "AUTH-IDENTITY failing-first" x2: against master's module 0 pass / 2 fail;
  on this branch pass.
- `AppShell.npmtest.mjs` "a FAILED identity lookup with a signed-in session never shows 'No workspace
  yet'": against master's modules 0 / 1; on this branch pass.
- `identity-loader.npmtest.mjs` (9 tests): fails on master (no loader; master's AuthProvider has the
  single-shot `seed(null)` the wiring test forbids); 9 / 9 on this branch.
- `platform-admin-gate.npmtest.mjs` (11 tests): 4-combination agreement all pass; the sanity test shows
  the old nav predicate disagreed with the route in exactly 2 of 4; two owners in one org each see only
  their own email.

## UX compliance

- **App shell, failed identity lookup (all signed-in routes except the setup routes)**. Primary goal:
  recover the reader's workspace and role without a false statement about their account. Path: the
  note appears under the top bar, one step: Retry (or return to the tab, which re-arms automatically).
  One primary action: Retry, the note's single action (law 7). Feedback per async action: Retry
  acknowledges at once by reading "Retrying…" while the round runs (law 6); success removes the note
  and restores the nav's Admin row and workspace name; a second failure keeps the note with Retry
  available (law 15: says what failed, that nothing in the account changed, and how to recover). Target:
  StateNote's 28px + 8px clearance action box (law 2), unchanged house component (laws 3, 16).
- **App shell, "No workspace yet" banner**: unchanged markup; now shown only for a resolved no-org
  answer, never while loading or after a failure (no false state while data loads).
- **Nav card footer (desktop card and drawer)**: unchanged layout; the Admin row appears exactly when
  `/admin` admits (law 14: no link to a destination that will bounce the reader). Badge omitted when
  there is no workspace role rather than an empty bordered box.
- **Account page masthead dek and "Member since" note**: copy only; "No workspace" is said only after a
  resolved lookup ("Workspace unavailable" after a failure, "Loading workspace" before an answer).

## Next steps

- Coordinator: after merge, run the live after-check (`live-check.mjs /` and `/admin`); expect the nav
  unchanged for hotmail and no gmail text outside /admin's "Newest join" tile.
- Open question for the operator: authorize the Vercel connector (or read the runtime logs) for
  2026-09-24 16:51Z to name the original failure.
