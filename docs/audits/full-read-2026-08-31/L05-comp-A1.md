# Lane L05-comp-A1 — Full-Read Audit Report

Repo: /root/work/dotfiles/fsi-app. Lane file: /root/work/audit/lanes/L05-comp-A1.txt (34 files, `src/components/**`, mostly the top-level shell components, `account/`, `admin/` (+ `admin/redesign/`), `auth/`, and the start of `community/`).

Evidence basis: full read of every listed file (Read tool, chunked where >2000 lines was not needed — largest file was 1967 lines, read in five overlapping chunks covering 1–1967 with no gaps) plus `/root/work/audit/table-usage.txt` and targeted `Grep` to confirm import wiring. `docs/plans`, `docs/PROGRAM-BOARD.md`, `docs/ops/session-log.md` were not consulted, per brief.

---

## Per-file verdicts

`src/components/AppShell.tsx` — WORKING-WIRED — root shell: sidebar/no-sidebar routing, no-workspace banner, mounts `AskAssistant` + `BackToTop`.
- NOTE: no-workspace banner reads `orgId` from `AuthContext` (not `useWorkspaceStore`) specifically to avoid a hydration-flash (comment cites Sprint 3 SF-WS-1, 2026-05-27) — intentional divergence from the store, not a bug.

`src/components/AskAssistant.tsx` — WORKING-WIRED — floating "Ask AI" launcher + drawer; POSTs to `/api/ask` with bearer token, renders citations/flagged-citations.
- NOTE (line 280-284): if there is no Supabase session, it shows "Please sign in..." and returns — correct fail path, not silent.

`src/components/BackToTop.tsx` — WORKING-WIRED — scroll-position FAB, self-gated at 400px scroll, mounted unconditionally in `AppShell.tsx:101`.

`src/components/Sidebar.tsx` — WORKING-WIRED — primary nav + community nav + role-gated Admin footer button. Explicit `prefetch={false}` on data-heavy routes (comment explains RSC fan-out cost, lines 44-59).

`src/components/ThemeInitializer.tsx` — WORKING-WIRED — 14-line effect setting `data-theme` from `useSettingsStore`. Confirmed mounted in `src/app/layout.tsx` (grep).

`src/components/account/AccountMasthead.tsx` — WORKING-WIRED — Account page header/tabs (Profile/Settings), refs=2 matches the two account routes.

`src/components/account/AccountPrimitives.tsx` — WORKING-WIRED — shared presentational kit (SubTabBar, AccountCard, HonestFrame, Chip, ToggleSwitch, TextInput/TextArea, InkButton). refs=6 plausible for a shared kit; purely presentational, no data logic to break.

`src/components/admin/AdminDashboard.tsx` — WORKING-WIRED — the `/admin` shell: 7-section grid (Workspaces/Sources/Ingest/Coverage/Research pipeline/Community pickups/Runtime), issues rail, badges computed from `useAdminAttention`.
- NOTE: section badge/sub-tab counts and the rail total are explicitly computed, never hard-coded (design invariant stated in the header comment and enforced in `AdminIssuesRail.tsx`).
- NOTE (lines 214-220): approve/reject on staged updates is explicitly RETIRED — the surface is visibility-only; documented, not a bug.

`src/components/admin/BulkImportView.tsx` — WORKING-WIRED — CSV/JSON bulk source import with preview/commit against `/api/admin/sources/bulk-import`. Mounted from `AdminDashboard.tsx:579`.

`src/components/admin/CommunityPickupsQueueView.tsx` — WORKING-WIRED — "posts worth reviewing" queue (reply_count ≥ 3, <30d, `promoted_at IS NULL`); Promote opens `PromotePostDialog` (outside this lane).
- WIRING: two-step fetch (`community_posts` then `profiles` by author id) — comment explains this is because `author_user_id` FKs to `auth.users`, not `profiles`, so PostgREST can't embed directly (lines 80-82). Confirmed no embed-join attempted.

`src/components/admin/CoverageCatalogueView.tsx` — WORKING-WIRED — admin-only dual-verified catalogue browser against `/api/coverage/entries`.
- INCOMPLETE (line 8, corroborated by line 125): the header doc-comment states "Promotion controls (the P2 engine) mount here alongside," but no promotion controls exist anywhere in the render tree — the component is read-only filter/sort/list. The loading-state string itself says "Promotion controls arrive with the policy engine," i.e. the file's own runtime text admits the promised feature isn't built. Corroborated by table-usage: `promotion_policy` has 0 live rows and only 1 src reference (elsewhere, not this file).

`src/components/admin/CoverageMatrixView.tsx` — WORKING-WIRED — jurisdiction × item_type coverage matrix against `/api/admin/coverage`, tier filter, group-by-country, action panel emits `bulk-add` to the parent.
- NOTE (lines 87-91): a prior "discover" action kind was deliberately removed because "the AdminDashboard handler only ever wired bulk-add; the discover button emitted an action nothing consumed" — a documented dead-affordance fix, not a currently-live defect. Confirmed only `"bulk-add"` exists in the `CoverageMatrixAction` type today.

`src/components/admin/ErrorGroupsView.tsx` — WORKING-WIRED — read-only runtime error-group table, server-hydrated props (no client fetch). `error_events` table-usage shows 14 live rows, src=2 — consistent with this file + its server-side page reader.

`src/components/admin/IngestRejectionsView.tsx` — WORKING-WIRED — triage queue for unparseable jurisdiction tokens (reclassify/retry/archive) against `/api/admin/triage/ingest-rejections`.
- WIRING: refs=1 confirmed — mounted only via `FlagsRejectionsQueue.tsx:26,174` (the "Rejections" kind), not directly by `AdminDashboard.tsx`.

`src/components/admin/IntegrityFlagsView.tsx` — WORKING-WIRED — per-brief agent integrity flags (migration 035) against `/api/admin/integrity-flags`.
- WIRING: refs=1 confirmed — mounted only via `FlagsRejectionsQueue.tsx:24,172` (the "Integrity · per-brief" kind). `AdminDashboard.tsx` does NOT import this component directly (it imports `FlagsRejectionsQueue` instead); a plain-text grep hit inside `BulkImportView.tsx`'s doc-comment ("mirrors the visual idiom of IntegrityFlagsView") is a comment reference, not an import.

`src/components/admin/InvitationsPanel.tsx` — WORKING-WIRED — org invitation create/list/revoke against `/api/orgs/[org_id]/invitations`; honest rendering of email-delivery state (delivered / configured-but-failed / not-configured) rather than assuming success.

`src/components/admin/IssueFilterCaption.tsx` — WORKING-WIRED — small filter-scope banner; used from `AdminDashboard.tsx:587` on the Sources tab.

`src/components/admin/OrganizationsTable.tsx` — WORKING-WIRED — presentational org roster derived from props (no direct Supabase query); "last activity" is explicitly labeled a proxy (most-recent `org_memberships.created_at`), not fabricated.

`src/components/admin/PendingJurisdictionReviewView.tsx` — WORKING-WIRED — triage queue for flagged jurisdiction tokens (confirm/manually-classify/dismiss) against `/api/admin/triage/pending-jurisdiction-review`.

`src/components/admin/PlatformIntegrityFlagsView.tsx` — WORKING-WIRED — platform-level (non-per-brief) integrity flags (migration 048), category+status filters, status transitions.
- WIRING: refs=1 confirmed — mounted only via `FlagsRejectionsQueue.tsx:25,173`.
- NOTE (lines 45-47, 574-580): `workflow_gap` category and a palette fallback were added after a documented production incident — "its omission here crashed this tab the moment any workflow_gap flag existed" / "the defect class that took this tab down." Historical defect, already fixed in the code as read; flagging as a NOTE since a future new CHECK-constraint category value would still only get the generic fallback palette, not a crash.

`src/components/admin/ProvenanceFailures.tsx` — WORKING-WIRED — pure presentational/derivation module (`extractFailures`, `ProvenanceFailures`) grouping provenance-gate failure reasons into 5 reviewer modes; mounted from `AdminDashboard.tsx:691` inside `renderStaged()`.

`src/components/admin/ResearchPipelineQueueView.tsx` — WORKING-WIRED — draft-item visibility queue (`pipeline_stage='draft' AND is_archived=false`); explicitly no publish/archive button — comment (lines 103-106) documents the human editorial gate was retired in favor of machine-gated `provenance_status='verified'`.

`src/components/admin/TierOpinionDisagreementsView.tsx` — WORKING-WIRED — source tier-override triage (Accept/Reject/Defer) against `/api/admin/sources/tier-opinions` + `/api/admin/sources/[id]/tier-override`.
- NOTE: "Defer" (line 186-192) is explicitly local-only — no server call, row just hidden from the current view and will re-surface on next load. Correctly documented as such, not a hidden no-op.
- NOTE (lines 140-146): "accept" is a two-step operation (tier-override POST, then dismiss POST); if the second call fails the row is NOT removed from the list and an error is flashed, so the UI does not silently claim success on partial failure.

`src/components/admin/redesign/AdminIssuesRail.tsx` — WORKING-WIRED — right rail of `/admin`; total is `rows.reduce(sum)`, never a separate API scalar, so the badge cannot contradict its own list (invariant asserted in the comment and verified in the code, lines 118-120).

`src/components/admin/redesign/FlagsRejectionsQueue.tsx` — WORKING-WIRED — merged 3-way flags/rejections queue, wraps `IntegrityFlagsView` / `PlatformIntegrityFlagsView` / `IngestRejectionsView`; mounted from `AdminDashboard.tsx:596`.
- INCOMPLETE (lines 58-61, 177-189): the "Rejections" filter chip has `count: null` — "No RPC scalar tracks ingest-rejection count at this layer, so the Rejections chip is label-only." Also the footer text promises "One-click bulk resolve for the recurring seed-fallback trigger class lands with the flag-class batch endpoint" — that endpoint does not exist yet; both gaps are self-documented in the component's own copy, not silently hidden.

`src/components/admin/redesign/MembersPanel.tsx` — WORKING-WIRED — workspace member management (add-by-email PUT, role PATCH, remove DELETE, org-scoped ban POST) against `/api/orgs/[org_id]/members`.
- NOTE: last-owner guard and typed-confirmation-required ban are client-side UX affordances; the comment (lines 12-15) states server-side guards are authoritative — cannot verify server enforcement from this file alone (route not in this lane).

`src/components/admin/redesign/WorkspacesUsageRow.tsx` — WORKING-WIRED — Companies/Individuals/Newest-join tiles computed from `orgs`+`members` props.
- INCOMPLETE (lines 152-164): the fourth tile "Active this month" is explicitly HONEST-PENDING — a dashed frame, em-dash figure, and the caption "populates when per-org activity events ship." Self-documented incompleteness (the backend event stream doesn't exist), not a bug.

`src/components/auth/AuthProvider.tsx` — WORKING-WIRED — client auth context, hydrated synchronously from server props (comment explains this replaced a version that fired 3 client round-trips per page). Cross-tab `SIGNED_OUT`/`SIGNED_IN` handling forces a hard reload rather than silently trusting stale server props.

`src/components/auth/UserMenu.tsx` — WORKING-WIRED — user-menu trigger; dynamic-imports `UserMenuDropdown` with `ssr:false` only when opened (perf fix per Hotfix-3 Fix #4 comment).

`src/components/auth/UserMenuDropdown.tsx` — WORKING-WIRED — **overturns GRAPH:UNREACHABLE**. Ground truth shows refs=0, but `UserMenu.tsx:18-21` does `dynamic(() => import("./UserMenuDropdown"), { ssr: false })` and renders it at `UserMenu.tsx:73` when `open`. A static import-graph scan misses `next/dynamic`'s string-literal-in-a-function-call import path, producing a false UNREACHABLE. The component is live and reachable from every authenticated page's user-menu click.

`src/components/community/BrowseGroupsGrid.tsx` — WORKING-WIRED — grid wrapper around `GroupCard` with join-toast state and an honest empty state. Confirmed imported by `src/app/community/browse/page.tsx` (grep).

`src/components/community/CommunityMasthead.tsx` — WORKING-WIRED — editorial masthead + search pill (Cmd/Ctrl+K focus) + scope chips for `/community`; the masthead is purely presentational, `onSearchSubmit` callback is the parent's responsibility (documented, not this file's job to wire the actual search).

`src/components/community/CommunityRegionTabs.tsx` — WORKING-WIRED — region filter tabs; shallow-updates `?region=` via `router.push` with `scroll:false`.

`src/components/community/CommunityRooms.tsx` — WORKING-WIRED — the large (1967-line) regional-rooms surface: room grid, selected-room panel (join/leave, "live in region" ledger, discussion composer/threads, reply, cite-source, sign-off request/withdraw/decide), rail (who's-here, why-post-here, verifier sign-off, vertical groups + create-group modal). Confirmed imported by `src/app/community/page.tsx` (grep), matching refs=1.
- NOTE: sign-off lifecycle (`requestSignoff` / `withdrawSignoff` / `decideSignoff`, lines 389-468) is wired against `/api/community/posts/[id]/signoff`, `/api/community/signoff/[id]/withdraw`, `/api/community/signoff/[id]/decide`, writing to `community_post_signoff_requests` per the header comment (migration 153). **table-usage.txt shows `community_post_signoff_requests` at 0 live rows** (src=4). The code path is real and reachable (this is the only component in the lane that exercises it), but zero live rows means either the feature has never been exercised in production, or the table was wiped — the write path itself cannot be confirmed to have ever succeeded end-to-end from this evidence.
- NOTE: "Leave room" (`toggleJoin`, lines 320-347) does a direct client-side `supabase.from("community_group_members").delete()...` rather than going through an API route — relies entirely on RLS to scope the delete to the caller's own row (`user_id = currentUserId`). Cannot verify RLS policy from this file; flagging only as a NOTE since the query itself is correctly scoped by both `group_id` and `user_id`.

---

## Lane summary

**Counts by STATUS** (34/34 files):
- WORKING-WIRED: 34
- WORKING-UNWIRED: 0
- DEFECTIVE: 0
- INCOMPLETE (as primary status): 0 — all incompleteness found was sub-feature-level inside otherwise-working, wired components (flagged inline above), not a whole file that fails to do its job
- STUB: 0
- DEAD-HISTORICAL: 0
- OPERATOR-TOOL: 0
- TEST-ONLY: 0
- TEST: 0

No file in this lane is dead, unreachable, or a stub. This lane skews toward mature admin/community chrome with unusually thorough self-documentation (many components carry "honest-pending" framing in their own UI copy for gaps they know about).

**Top findings, ranked:**

1. **GRAPH:UNREACHABLE flag on `auth/UserMenuDropdown.tsx` is a false positive.** It is loaded via `next/dynamic(() => import("./UserMenuDropdown"), { ssr: false })` from `UserMenu.tsx:18-21` and rendered on every menu-open (`UserMenu.tsx:73`). This is the single WIRING correction in the lane — worth flagging because it's a general risk pattern (static import-graph tools will systematically under-report anything behind `next/dynamic`).

2. **`community_post_signoff_requests` has 0 live rows** (table-usage.txt) despite `CommunityRooms.tsx` shipping a complete, wired request/withdraw/decide UI against it (lines 389-468) with matching API routes named in the header comment. Either the feature has never actually been used end-to-end in production, or the table was wiped. Worth an operator check — this is exactly the "write path that has never run in production" case the brief calls out.

3. **`CoverageCatalogueView.tsx` promises a feature it doesn't have.** The file's own doc-comment (line 8) says promotion controls "mount here alongside," and its own runtime loading-state text (line 125) says they "arrive with the policy engine" — i.e., the component's own copy documents that promised functionality is absent. Corroborated by `promotion_policy` at 0 live rows / 1 src reference elsewhere in table-usage.txt.

4. **`FlagsRejectionsQueue.tsx` has two self-documented gaps**: the Rejections-kind filter chip carries no live count (no RPC scalar exists for it), and the "bulk-resolve seed-fallback" affordance is described in footer copy but has no button — both explicitly labeled as pending a not-yet-built batch endpoint, not silently broken.

5. **`WorkspacesUsageRow.tsx`'s "Active this month" tile is honest-pending** — dashed border, em-dash value, explicit "populates when per-org activity events ship" caption. No per-org activity event stream exists yet; correctly never fabricates a number.

6. **`admin/IntegrityFlagsView.tsx`, `admin/PlatformIntegrityFlagsView.tsx`, and `admin/IngestRejectionsView.tsx` are only reachable through `admin/redesign/FlagsRejectionsQueue.tsx`**, not directly from `AdminDashboard.tsx` as their doc-comments might suggest in isolation — confirmed by reading `AdminDashboard.tsx`'s import list (it imports `FlagsRejectionsQueue`, not the three sub-views) and `FlagsRejectionsQueue.tsx`'s own imports/mounts (lines 24-26, 172-174). refs=1 for all three checks out against this single indirect mount point.

7. **`PlatformIntegrityFlagsView.tsx` carries scar tissue from a real past production incident**: the comment at lines 45-47 states a missing `workflow_gap` category "crashed this tab the moment any workflow_gap flag existed," and the palette lookup at line 576 now has a defensive fallback (`palette[category] ?? {...}`) specifically to prevent recurrence. The current code is not defective, but the pattern (a hardcoded `Record<Category,...>` keyed off a DB CHECK constraint) means any future new category value added at the DB layer without a matching code change reads with the generic fallback silently — no crash, but also no visual distinction, until someone remembers to update this file.

8. **`AdminIssuesRail.tsx`'s "badge = sum(rows)" invariant is real and enforced in code** (line 120: `rows.reduce((t, r) => t + r.count, 0)`), not just asserted in comments — worth noting as a positive finding since the brief's honesty bar cuts both ways.

9. **`CoverageMatrixView.tsx`'s removed "discover" action** is a clean, fully-completed dead-affordance removal (comment lines 87-91 explains the history; the current `CoverageMatrixAction` type has only `"bulk-add"`). No residual dead code — flagged only as a documented example of the class of bug this lane otherwise did not find live instances of.

10. No wrong-column, swallowed-error-masking-failure, race-condition, or fail-open defects were found in any of the 34 files that I can defend from the code alone. All network-error branches in this lane surface a visible error/notice state to the user rather than pretending success (spot-checked: `AskAssistant.tsx:311-313`, `AdminDashboard.tsx:244-246`, `TierOpinionDisagreementsView.tsx:148-150`, `CommunityRooms.tsx` all four action handlers).

**Coverage attestation:** files read in full: 34/34, lines read: 12,474 (matches the sum of the lane file's per-file line counts). No file was partially read or skipped.
