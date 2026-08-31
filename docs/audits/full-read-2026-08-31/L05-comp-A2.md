# Lane L05-comp-A2 — Community + Credibility components

Repo: /root/work/dotfiles/fsi-app. 27 files read in full per BRIEF.md.

## Per-file verdicts

### src/components/community/CommunitySearchResults.tsx — WORKING-WIRED — dropdown rendering `/api/community/search` results (posts/groups/people)
- WIRING: imported and mounted by `CommunityShell.tsx` (only caller, matches refs=1).
- NOTE: `community_posts` has only 1 live row and `community_groups` only 7 (table-usage.txt) — in production this dropdown will almost never return non-empty `posts` results.

### src/components/community/CommunityShell.tsx — WORKING-WIRED — top-level layout for `/community/*`, hides global AppShell sidebar via `body[data-side]` CSS hack, hosts search + default body (invitations/empty-state/memberships)
- WIRING: imported by `app/community/[slug]/page.tsx`, `app/community/moderation/page.tsx`, `app/community/browse/page.tsx` (matches refs=3).
- NOTE: `community_group_invitations` has 0 live rows (table-usage.txt) — the `InvitationsPanel` code path (lines 210-224, 226-276) is fully functional but has never rendered in production because no invitation row has ever existed.

### src/components/community/CommunitySidebar.tsx — WORKING-WIRED (with one DEFECT) — 280px Slack-style sidebar (Starred/Private/Public/Topics/Browse)
- WIRING: mounted only by `CommunityShell.tsx` (matches refs=1).
- DEFECT (line 603): `GroupRow` links to `href={`/community/groups/${membership.group.slug}`}`. The actual route is `/community/[slug]` (confirmed: `src/app/community` contains `[slug]`, `browse`, `moderation` — no `groups/` segment; no rewrite for `community/groups` in `next.config.ts`). Every group link in the sidebar's Starred/Private/Public sections 404s. This is the sidebar's primary navigation affordance, so it's a real, user-facing broken-link bug. Contrast with `GroupCard.tsx:111` and `CommunitySearchResults.tsx:276/323`, which correctly link to `/community/${slug}`.
- INCOMPLETE (lines 214-229): the "Jump to a group, channel, person…" filter `<input>` has no `value`/`onChange` — it's decorative only, filters nothing.
- NOTE: `community_topics` and `community_topic_groups` both have 0 live rows (table-usage.txt) — the "My topics" section (lines 282-304) always renders its empty state in production.
- NOTE: comment at lines 62-69/584 documents that per-group unread/mention pill counts (`groupCounts`) come from a live `/api/community/notifications/counts` fetch; `notifications` table has 0 live rows, so all pills are currently 0 regardless of code correctness.

### src/components/community/CouncilMembersRail.tsx — WORKING-WIRED — server component listing up to 6 group members in the right rail of `/community/[slug]`
- WIRING: imported by `app/community/[slug]/page.tsx` (matches refs=1).
- NOTE: `community_group_members` has only 1 live row and `profiles` only 2 (table-usage.txt) — this component's query logic (role-priority sort, avatar fallback, "+N more" tail) is correct but has essentially nothing to render against in production.

### src/components/community/GroupCard.tsx — WORKING-WIRED — group tile for `/community/browse` grid with Join CTA state machine
- WIRING: imported by `BrowseGroupsGrid.tsx` (matches refs=1).
- No defects found. CTA state machine (member/pending-invite/none×public/private) is internally consistent; join POSTs to `/api/community/groups/[id]/join`.

### src/components/community/GroupHeader.tsx — WORKING-WIRED — sticky header for `/community/[slug]` (star toggle, Members/Settings/Invite modals)
- WIRING: imported by `app/community/[slug]/page.tsx` (matches refs=1).
- No defects found. Star toggle does optimistic update + revert on failure; modal triggers are role-gated correctly (`isAdmin` for Settings/Invite).

### src/components/community/GroupModals.tsx — WORKING-WIRED — MembersModal / SettingsModal / InviteModal (1201 lines)
- WIRING: imported only by `GroupHeader.tsx` (matches refs=1).
- No defects found across all three modals. Leave flow correctly confirms + calls `onAfterLeave`; Settings privacy-downgrade warning is correctly gated on `group.privacy === "private" && privacy === "public"`; Invite flow debounces search (250ms) and separately manages pending-invitation list with revoke.

### src/components/community/HowPublishingWorks.tsx — WORKING-WIRED — static 3-step explainer card, no data dependency
- WIRING: imported by `app/community/[slug]/page.tsx` (matches refs=1). Pure presentational, nothing to break.

### src/components/community/ModerationActions.tsx — WORKING-WIRED — action buttons (Dismiss/Warn/Remove/Ban) for one moderation report
- WIRING: imported only by `ModerationQueue.tsx` (matches refs=1).
- NOTE: response handling (lines 76-90) branches on `j?.phase_d_stub` and `j?.side_effect_errors` from the API — this component correctly surfaces server-reported partial failures rather than swallowing them, which is good defensive design (flagging as NOTE, not a defect, since the branching logic itself is correct).

### src/components/community/ModerationQueue.tsx — WORKING-WIRED — admin moderation report list with status/reason filters
- WIRING: imported by `app/community/moderation/page.tsx` (matches refs=1).
- NOTE: `moderation_reports` table has 0 live rows (table-usage.txt) — this queue has never had a real report to display in production; the empty-state copy ("Nothing to review. New reports appear here.") is the only thing that has ever rendered.

### src/components/community/NotificationsBell.tsx — WORKING-WIRED — bell icon + unread badge + dropdown, polls every 60s while tab visible
- WIRING: imported by `CommunityMasthead.tsx` (matches refs=1).
- NOTE: `notifications` table has 0 live rows — badge will always show 0/hidden in current production data, though the polling/visibility-pause logic itself is correctly implemented.

### src/components/community/NotificationsList.tsx — WORKING-WIRED — dropdown body: paginated notification list, mark-read/mark-all-read
- WIRING: imported only by `NotificationsBell.tsx` (matches refs=1).
- No defects found. Optimistic mark-read/mark-all-read with rollback on failure (mark-all) is correctly implemented; `Kind`/`KIND_LABEL` correctly sourced from `@/lib/notifications/dispatch`'s `NotificationKind` type (comment at lines 41-45 explains this was previously a hand-duplicated union that had drifted — now a type-only import so it can't drift again).

### src/components/community/Post.tsx — WORKING-WIRED — single post card: replies, delete, promote button, report menu, verifier/role badges
- WIRING: imported only by `PostList.tsx` (matches refs=1).
- INCOMPLETE (lines 174-200): `VerifierBadge` and `RoleBadge` are rendered but fed via an `as unknown as {...}` cast onto `post.author`, reading `verifier_status`/`role` fields that `/api/community/posts/route.ts` does not select (confirmed: that route's `.select(...)` calls at lines 158 and 261 only project `user_id:id, name:full_name, headshot_url:avatar_url`). Both badge components are self-documented as "silently render null" pending this API widening (see their own file headers) — confirmed still true by reading the live route. Not a crash risk (cast is safe at runtime, fields are just `undefined`), but the two badges are permanently invisible in the current build.

### src/components/community/PostComposer.tsx — WORKING-WIRED — top-of-feed post composer (title + body, plain text)
- WIRING: imported by `PostList.tsx`, `Post.tsx` (re-exports `CommunityPost` type used by `ReplyComposer.tsx` too) (matches refs=3).
- No defects found. `canSubmit` gate correctly blocks over-length submissions; the `maxLength` on the raw `<input>`/`<textarea>` is intentionally 50/200 chars higher than the submit cap, letting the user type past the limit and see the disabled-submit state rather than being hard-truncated — a UX choice, not a bug.

### src/components/community/PostList.tsx — WORKING-WIRED — group feed: composer + paginated post list
- WIRING: imported by `app/community/[slug]/page.tsx` (matches refs=1).
- No defects found. Cursor pagination (`before`), optimistic prepend on post, optimistic filter-out on delete are all correctly implemented.

### src/components/community/PromotePostButton.tsx — WORKING-WIRED — button that opens PromotePostDialog, gated to group admin/mod or platform admin
- WIRING: imported by `Post.tsx` and `components/admin/CommunityPickupsQueueView.tsx` (matches refs=3, third being `PromotePostDialog.tsx` itself).
- No functional defect. Uses Tailwind utility classes with `var(--color-*)` arbitrary values rather than the inline-style idiom every sibling community component uses — stylistically inconsistent but not broken (Tailwind v4 via `@tailwindcss/postcss` is configured; see PromotePostDialog note below for one real token gap).

### src/components/community/PromotePostDialog.tsx — WORKING-WIRED — modal form staging a community post into `staged_updates` for admin review
- WIRING: imported by `PromotePostButton.tsx` and `components/admin/CommunityPickupsQueueView.tsx` (matches refs=2).
- DEFECT (lines 193, 367): `hover:bg-[var(--color-surface-alt)]` — `--color-surface-alt` is not defined anywhere in `src/app/globals.css` or `src/app/theme.css` (confirmed by grepping both files' full custom-property lists). The CSS `var()` with no fallback resolves to nothing, so these two hover states (close button, Cancel button) silently no-op — cosmetic, not a crash, but a real dead style rule. (`--color-danger` and `--color-on-primary`, used elsewhere in the same file, are also undefined but every use supplies a literal fallback via `var(--color-danger,#b91c1c)` etc., so those are not broken.)
- No other defects. Source-URL validation correctly requires `http:`/`https:` protocol; success path calls `router.refresh()` so the "Promoted" tag appears without a full reload.

### src/components/community/ReplyComposer.tsx — WORKING-WIRED — inline reply box under an expanded post
- WIRING: imported only by `Post.tsx` (matches refs=1). No defects found; mirrors `PostComposer.tsx` pattern at smaller scale.

### src/components/community/ReportPostMenu.tsx — WORKING-WIRED — "Report this post" flag button + reason/detail dialog
- WIRING: imported only by `Post.tsx` (matches refs=1). No defects found. Supports an optional `trigger` render-prop for host-owned menu integration (currently unused by `Post.tsx`, which uses the default button — dead flexibility, not a bug).

### src/components/community/RoleBadge.tsx — INCOMPLETE — presentational role chip (admin/mod), documented as receiving `undefined` in the live build
- WIRING: imported only by `Post.tsx` (matches refs=1) — component itself renders correctly for a given `role` prop, but confirmed above (see Post.tsx) that the API never supplies that prop's source field, so it always returns `null` in practice today.

### src/components/community/VerifierBadge.tsx — INCOMPLETE — presentational "Verified" chip, documented as receiving `undefined` in the live build
- WIRING: imported only by `Post.tsx` (matches refs=1) — same situation as RoleBadge.tsx: correct component, permanently-null input given the current `/api/community/posts` SELECT.

### src/components/community/types.ts — WORKING-WIRED — shared TypeScript types for the community shell
- WIRING: imported across 9 community files per lane ground truth (`CommunityShell`, `CommunitySidebar`, `GroupCard`, `GroupHeader`, `CommunitySearchResults`, etc. — confirmed via direct reads of files that `import type {...} from "./types"`). No defects; pure type definitions.

### src/components/credibility/BiasBadge.tsx — WORKING-UNWIRED (GRAPH:UNREACHABLE confirmed) — bias-tag chip group (Funding/Methodology/Stakeholder dimensions)
- WIRING: only importer is `ProvenancePanel.tsx` (`import { BiasBadge, type BiasTag } from "./BiasBadge"`, used at line 148); `ProvenancePanel.tsx` itself has refs=0 and is imported nowhere in `src/` (confirmed via repo-wide grep — only self-referential comments in `BiasBadge.tsx`/`CitationCountChip.tsx` mention "ProvenancePanel" in prose, no actual import). Component is functionally complete but structurally dead: it is reachable only through another dead component.

### src/components/credibility/CitationCountChip.tsx — WORKING-UNWIRED (GRAPH:UNREACHABLE confirmed) — citation-count chip with optional expand-to-panel and inline RecencyChip composition
- WIRING: same situation as BiasBadge — only importer is `ProvenancePanel.tsx` (line 158), which is itself unreachable. `app/research/page.tsx` has a comment (line 79) referencing this component and RecencyChip by name but does not actually import or render either — the comment describes an intended future wiring that has not been done.

### src/components/credibility/CredibilityBadge.tsx — WORKING-UNWIRED (GRAPH:UNREACHABLE confirmed) — canonical T1-T7 tier badge
- WIRING: only importer is `ProvenancePanel.tsx` (line 126); no other consumer in `src/` (repo-wide grep confirms). File header explicitly says it's meant to "replace ... `SourceProvenanceBadge` in `src/components/sources/`" as a future migration that (per the graph) has not happened — `SourceProvenanceBadge` is still presumably the live badge elsewhere (not in this lane, not verified further).

### src/components/credibility/JurisdictionChip.tsx — WORKING-UNWIRED (GRAPH:UNREACHABLE confirmed, refs=0) — jurisdiction code + label chip
- WIRING: repo-wide grep found zero importers anywhere, including `ProvenancePanel.tsx` (which does NOT import it despite the whole credibility set otherwise being composed there). This is the most orphaned file in the lane: not even wired into its own sibling subsystem.

### src/components/credibility/ProvenancePanel.tsx — WORKING-UNWIRED (GRAPH:UNREACHABLE confirmed, refs=0) — composed provenance detail panel (tier + bias + citations + recency)
- WIRING: repo-wide grep found zero importers of `ProvenancePanel` anywhere in `src/` — confirmed nothing calls this. It is the root of the credibility-chip island: it imports `CredibilityBadge`, `BiasBadge`, `CitationCountChip`, `RecencyChip` (all four otherwise-unreachable) but nothing imports it in turn. File header describes intended mount points (Assistant citation footnote click, Research citation-count expansion, Operations/Regulations source-badge expansion, Market Intel signal-source expansion) — none of these integrations exist in the current codebase per this grep.
- DEAD: as a consequence, `CredibilityBadge`, `BiasBadge`, `CitationCountChip`, `RecencyChip` are only "used" by this dead file — none of the four is reachable from any route.

### src/components/credibility/RecencyChip.tsx — WORKING-UNWIRED (GRAPH:UNREACHABLE, refs=2 — confirmed both are dead-adjacent) — relative-time chip
- WIRING: two importers found: `ProvenancePanel.tsx` (line 33, unreachable) and `CitationCountChip.tsx` (line 24, itself only reachable through `ProvenancePanel.tsx`). `app/research/page.tsx` line 79 comment-references it but does not import it. Both real import paths terminate in the same dead root, so refs=2 does not indicate live wiring.

### src/components/credibility/SignalStrength.tsx — WORKING-UNWIRED (GRAPH:UNREACHABLE confirmed, refs=0) — five-step Market Intel signal-strength indicator
- WIRING: repo-wide grep found zero importers, including inside `ProvenancePanel.tsx`. Like JurisdictionChip, orphaned even from its own subsystem's composition root. File header claims the vocabulary "matches ... PolicySignals, WatchlistSidebar, and KeyMetricsRow" (none of those are in this lane; not verified whether they duplicate this logic independently).

## Lane summary

**Counts by STATUS** (27 files):
- WORKING-WIRED: 18 (all `community/*` files except RoleBadge.tsx and VerifierBadge.tsx)
- INCOMPLETE: 2 (`community/RoleBadge.tsx`, `community/VerifierBadge.tsx` — correct components fed an input the API never supplies)
- WORKING-UNWIRED: 7 (the entire `credibility/*` directory — `BiasBadge`, `CitationCountChip`, `CredibilityBadge`, `JurisdictionChip`, `ProvenancePanel`, `RecencyChip`, `SignalStrength`)
- DEFECTIVE / DEAD-HISTORICAL / STUB / OPERATOR-TOOL / TEST / TEST-ONLY: 0

**Top findings, ranked:**

1. **Broken sidebar navigation** — `CommunitySidebar.tsx:603` links every Starred/Private/Public group row to `/community/groups/${slug}`, a route that does not exist (`src/app/community/` only has `[slug]`, `browse`, `moderation`). Every click from the sidebar's group list 404s. This is the primary navigation surface for the whole community feature and is live-wired (mounted by `CommunityShell.tsx`, which every `/community/*` page renders).

2. **Entire `credibility/` component subsystem is unreachable** — all 7 files (`BiasBadge`, `CitationCountChip`, `CredibilityBadge`, `JurisdictionChip`, `ProvenancePanel`, `RecencyChip`, `SignalStrength`) are dead code. `ProvenancePanel.tsx` composes 4 of them but is itself imported nowhere; `JurisdictionChip.tsx` and `SignalStrength.tsx` are orphaned even from that composition. File headers describe an intended integration across Assistant/Research/Operations/Regulations/Market-Intel surfaces that was never wired up. Confirmed by repo-wide grep, not just the graph flag.

3. **Community feature has almost no live data despite full engineering** — cross-referencing table-usage.txt against every table this lane's UI reads/displays: `community_posts`=1 row, `community_group_members`=1 row, `community_groups`=7 rows, `profiles`=2 rows, `community_group_invitations`=0, `community_topics`=0, `community_topic_groups`=0, `moderation_reports`=0, `notifications`=0, `post_promotions`=0. Every list/empty-state code path in this lane (`InvitationsPanel`, "My topics" section, `ModerationQueue`, `NotificationsBell` badge, `CouncilMembersRail`) is correctly implemented but has essentially never rendered real content in production.

4. **`VerifierBadge`/`RoleBadge` permanently null** — `Post.tsx` (lines 174-200) feeds both badges from a type-cast onto `post.author` reading `verifier_status`/`role`, but `/api/community/posts/route.ts`'s SELECT (confirmed at lines 158, 261) never projects those fields. Both components are self-documented as pending-widen stubs; confirmed still true by reading the live route.

5. **Dead CSS custom property** — `PromotePostDialog.tsx:193,367` use `var(--color-surface-alt)` with no fallback; that token is not defined in `globals.css` or `theme.css`. Hover states on the dialog's close/Cancel buttons silently no-op. Low severity, but a genuine defect (not present in `--color-danger`/`--color-on-primary` uses elsewhere in the same file, which all specify literal fallbacks).

6. **Decorative sidebar filter input** — `CommunitySidebar.tsx:214-229`'s "Jump to a group, channel, person…" text input has no `value`/`onChange` wiring; it visually exists but filters nothing.

7. **Style-idiom inconsistency, not a defect** — `PromotePostButton.tsx` and `PromotePostDialog.tsx` use Tailwind utility classes with `var(--color-*)` arbitrary values, while every other file in `community/` (and the `credibility/` set) uses inline `style={{...}}` objects referencing the same CSS custom properties. Both approaches work (Tailwind v4 via `@tailwindcss/postcss` is configured), but the two files are visually/architecturally the odd ones out in this lane.

**Coverage attestation:** files read in full: 27/27, lines read: 9250 (sum of the lane list's per-file line counts; every file was read start to end, in single reads for all but none required chunked offset reads).
