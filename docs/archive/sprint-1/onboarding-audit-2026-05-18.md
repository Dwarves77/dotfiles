# Caro's Ledge Onboarding Flow Audit, 2026-05-18

- Date: 2026-05-18
- Branch: feat/sprint-1-phase-5-implementation (HEAD as of read; commit 49628a0 or later)
- Method: Read-only code inspection. No browser automation, no live account creation.
- Skill load:
  - `fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md` (Onboarding framed as Sprint 2+ cross-cutting capability per Section 4 and Section 7 Item 5)
  - `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md` (workspace-anchored rule applies to any UI copy)
  - `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md` (OBS coverage table + DP compliance)
- Status: PARTIAL. Code paths exist and are wired; multiple structural gaps and one stubbed-coming-soon string leak; live UX NOT VERIFIED.
- NOT VERIFIED scope: anything requiring live form submission, email receipt, browser interaction with the production site, or running invitation/accept flows end-to-end. The dispatch brief authorized live account creation but the agent has no browser automation tool. Operator may follow up with manual walkthrough or browser-equipped dispatch.

## Audit summary

Onboarding state: PARTIAL.

Test account: NOT CREATED. The agent has Read/Glob/Grep/Bash(git only) tools, no browser automation, and the standing rule forbids POSTs to a real signup endpoint. Live walkthrough must be performed by the operator or a follow-up dispatch with browser tooling.

Two-sentence summary: The onboarding code paths are wired end-to-end (signup, email-callback to wizard, four-step wizard, no-workspace landing with three CTAs, invitation accept/decline/lookup APIs, admin InvitationsPanel), and the routing is correct, but the wizard writes to the wrong destination for sector data (it writes `profiles.sector_overrides`, a per-user override column, NOT `workspace_settings.sector_profile`, the workspace-anchored intelligence-driver the dashboard and platform-intent skill expect), and the wizard never touches `workspace_settings` at all. The flow also leaks one customer-facing "Coming soon, Phase D" string (LinkedIn import card), drops `region`/`pronouns`/`role`/`employer` inputs silently (no destination columns on `profiles`), and ships an orphan `SectorOnboarding.tsx` component that would have written `workspace_settings.sector_profile` correctly but is not referenced by any route.

## OBS coverage table

| OBS | State | Decision | Reasoning |
|---|---|---|---|
| OBS-1 | Cleared | NO ACTION | Phase 5 sequencing; orthogonal. |
| OBS-2 | Open | NOT APPLICABLE | Jurisdiction soft validation; not onboarding. |
| OBS-3 | Open | NOT APPLICABLE | ICAO fragility; orthogonal. |
| OBS-4 | Implemented | NO ACTION | jurisdiction_iso trigger; orthogonal. |
| OBS-5 | Open | NOT APPLICABLE | Trigger pollution; ingest concern. |
| OBS-6 | Implemented | NO ACTION | Supersession severity; orthogonal. |
| OBS-7 | Open | NOT APPLICABLE | Norway Fjords counsel; orthogonal. |
| OBS-8 | Deferred | NO ACTION | Sprint 1 follow-up owner. |
| OBS-9 | Deferred | NOT APPLICABLE | Sprint 2 classifier loop. |
| OBS-10 | Open | NOT APPLICABLE | Drift monitoring; orthogonal. |
| OBS-11 | Implemented | NO ACTION | Rollback bracket; orthogonal. |
| OBS-12 | Implemented | NO ACTION | Bulk SQL CTE; orthogonal. |
| OBS-13 | Open | NOT APPLICABLE | Gate 7.2a; admin chrome. |
| OBS-14 | Open | NOT APPLICABLE | Triage UI source metadata; admin chrome. |
| OBS-15 | Open | NOT APPLICABLE | Brief article-level source; orthogonal. |
| OBS-16 | Open | NO ACTION | Placeholder. |
| OBS-17 | Open | RELEVANT | `/admin` gates on workspace role but renders platform-wide data; freshly-onboarded admins land in /admin and see cross-workspace data, breaking the workspace boundary onboarding established. Defer to existing OBS owner. |
| OBS-18 | Open | NOT APPLICABLE | /market SideCard; surface chrome. |
| OBS-19 | Open | RELEVANT | "Coming soon, Phase D" on /operations is the SAME anti-pattern class as the OnboardingWizard Step 1 LinkedIn button (OnboardingWizard.tsx:376); see REC-OBS-O-1. |
| OBS-20 | Open | RELEVANT | EmptyState worker-language; wizard copy was reviewed and clean of worker-language, but the LinkedIn "Phase D" leak is the sibling anti-pattern. |
| OBS-21 | Open | NOT APPLICABLE | Migration gap; orthogonal. |
| OBS-22 | Open | NOT APPLICABLE | Scheduler idle; orthogonal. |
| OBS-23 | Open | NOT APPLICABLE | /admin audit ComingSoon; admin chrome. |

## DP compliance section

| DP | Compliance test | Result | Evidence or reasoning |
|---|---|---|---|
| DP-1 (Single-Pane Operator Review) | Can the operator complete every related decision and edit on a single item without leaving the current screen, form, or workflow? | NOT APPLICABLE | DP-1 explicitly excludes customer-facing UI (DP-1 § "Out of scope"). The Onboarding flow is customer-facing (signup, wizard, NoWorkspaceLanding, InvitationLandingPage). The admin InvitationsPanel IS an operator surface; its create/revoke/copy-URL actions are inlined on one screen and the panel is mounted inside AdminDashboard; PASS for the operator-facing slice. The customer-facing slices (wizard, NWL, invitation landing) are out of DP-1 scope. |

## Section A: Signup flow

File: `C:/Users/jason/dotfiles/fsi-app/src/app/signup/page.tsx`.

Fields: email (required, type=email), password (required, minLength=8), confirm password.

Validation: client-side password >= 8 chars and password === confirmPassword (lines 55-62); browser-native email format via type=email; no custom server validation (Supabase Auth handles).

Submission: `supabase.auth.signUp({ email, password, options: { emailRedirectTo: ${origin}/auth/callback?next=/onboarding } })` (lines 70-76). Success swaps form for "Check your email" panel. Errors render inline.

Redirect target: email-link click -> `/auth/callback?next=/onboarding`. Verified at `auth/callback/route.ts` lines 12-43 (exchangeCodeForSession then redirect to next).

Mid-session guard: lines 35-49 client-side bounce signed-in users to `/login`; proxy.ts lines 41-45 server-side redirects signed-in users hitting `/signup` to `/`.

Worker-language: NONE in signup. All copy customer-facing. Workspace-anchored rule PASS.

NOT VERIFIED: live submission, Supabase Auth email delivery, callback round-trip.

## Section B: NoWorkspaceLanding

Files: `app/workspace/new/page.tsx` (server gate) -> `components/onboarding/NoWorkspaceLanding.tsx`.

State machine: authenticated + no membership -> render; authenticated + has membership -> redirect /; unauthenticated -> /login?redirect=/workspace/new. Uses `resolveServerBootstrap()` to read `org_memberships`.

Three CTAs:
1. Pending invitations: fetches `/api/invitations/mine`, renders Accept/Decline per pending invite. Accept hard-reloads to `/`. Decline removes from list.
2. Paste invitation URL/token: freeform input; `acceptInvitation()` (line 70-83) strips URL prefix via `split("/").pop()`.
3. Create your own workspace: name input; POSTs `/api/orgs`; hard-redirects to `/onboarding` (line 125) for fresh-org owners.

Inline comment at line 17 verified: "Chrome is intentionally minimal per dispatch decision I.3, operator-functional, not visually polished."

Acceptability current cohort: ACCEPTABLE. Three CTAs functional, errors surface, role/expiry shown.

Acceptability expansion-time: NOT ACCEPTABLE. Unprimed expansion-cohort user lands at "you have no workspace yet" with three minimally-styled panels, no value-prop, no taxonomy preview, no explanation. Sprint 2+ Onboarding completion (platform-intent Section 7 Item 5) must redesign.

Workspace-anchored rule: PASS.

## Section C: OnboardingWizard

Files: `app/onboarding/page.tsx` (server gate, auth-check, redirects unauth to `/login?redirect=/onboarding`); `components/onboarding/OnboardingWizard.tsx`.

Structure: 4 steps + done (5 internal Step states; header reads "Step N of 4").

Step 1 Choose path (lines 331-435): two cards.
- "Import from LinkedIn": DISABLED, opacity 0.7, button text "Coming soon - Phase D" (line 376). VIOLATION: phase-language leaked to customer (same anti-pattern class as OBS-19).
- "Start fresh": selectable, sets path="fresh". Continue disabled unless path==="fresh".

Step 2 Identity (lines 437-553): fields full name (required), pronouns, role/title, employer, primary region (select default "global"), work email (read-only locked).
- `persistIdentity()` (lines 104-126) UPDATEs `profiles` with `{ full_name, updated_at }` ONLY. Pronouns, role, employer, region collected and SILENTLY DROPPED. Inline comment (lines 98-103) admits region is "collected for future use"; pronouns/role/employer are not even mentioned.

Step 3 Sector profile (lines 555-624): renders `HIGHLIGHTED_SECTOR_IDS` (6 niches) on top, then "All sectors" (remaining 34, total 40 from `ALL_SECTORS`).
- `persistSectors()` (lines 128-146) UPDATEs `profiles` with `{ sector_overrides: sectors, updated_at }`. WRITES WRONG TABLE/COLUMN. See Section D.
- Must select >=1 sector to advance.

Step 4 Notifications: renders `<NotificationPreferences userId compact />`. `seedNotificationDefaults()` upserts `notification_preferences` with `DEFAULT_NOTIFICATION_PREFS`, `ignoreDuplicates: true`.

Step 5 Done: two CTAs, "Browse the community" -> /community, "Go to dashboard" -> /. No auto-redirect.

Coming-soon stubs visible vs hidden:
- Step 1 LinkedIn: VISIBLE "Coming soon - Phase D" leak.
- Sector taxonomy expansion: HIDDEN gracefully (all 40 visible; 6 floated to top).
- Email-delivered invitations: HIDDEN from end user (admin sees "Email delivery not yet wired" copy).
- NoWorkspaceLanding polish: HIDDEN polish-gap (unlabeled).

Worker-language: copy mostly clean; "tailored from day one" (line 410-411) is aspirational given the dropped-field reality, no workspace-naming violation.

## Section D: Sector_profile customization

`HIGHLIGHTED_SECTOR_IDS` at OnboardingWizard.tsx:34-41 verified: 6 niches (fine-art, live-events, luxury-goods, film-tv, automotive, humanitarian). Matches platform-intent Section 2.

`ALL_SECTORS` at `lib/constants.ts:171-222`: 40 entries grouped into 10 commented buckets. Comment lines 161-163 confirms extensibility intent.

Wizard presents BOTH 6 highlighted niches AND all 40 sectors. Highlighted at top with Star icon; remainder under "All sectors". DUAL-POSTURE COMPLIANT for sector visibility. PASS per platform-intent Section 2 on this slice.

Write path: WRONG DESTINATION (critical finding).
- Wizard writes `profiles.sector_overrides` (per-user override; verified OnboardingWizard.tsx:131-139 and server-bootstrap.ts:78-86).
- Platform expects sector intelligence from `workspace_settings.sector_profile` (per-workspace; verified server-bootstrap.ts:92-98, constants.ts:161-163 and :271 "FilterBar and scoring pull the active subset from workspace_settings.sector_profile").
- `workspace_settings.sector_profile` is written ONLY by:
  - `components/admin/WorkspaceProfile.tsx:54` (admin /admin editor)
  - `components/onboarding/SectorOnboarding.tsx:34` (ORPHAN; not imported anywhere per Grep)
- Result: wizard-completing user ends up with `profiles.sector_overrides` populated, but their workspace's `sector_profile` carries the create_org_for_self default (empty). Server-bootstrap.ts:38-39 confirms per-user semantics: "Empty means use workspace defaults." Per-user composition layer ("Section 6.8") is documented as not yet wired (server-bootstrap.ts:42-46), so even per-user overrides do not reach the dashboard query path.
- Founder of an art-logistics org picks "fine-art + live-events"; the workspace's sector_profile stays empty; downstream invitees inherit empty; workspace-anchored briefs (per environmental-policy-and-innovation Section 6) see no sectors until an admin opens /admin and rewrites.
- Invitation-accept users skip the wizard entirely (no sector write at all).

`SectorOnboarding.tsx` (orphan) is the correct implementation; it writes `workspace_settings.sector_profile`, `notify_on_sector_activation`, `sectors_activation_signup_at`, but is not wired into any route. Likely the intended Step 3 implementation that was never wired.

## Section E: Invitation flow

Files: `app/invitations/[token]/page.tsx` (auth gate); `components/onboarding/InvitationLandingPage.tsx`; `api/invitations/[token]/{route,accept,decline}/route.ts`; `api/invitations/mine/route.ts`.

Token validation: 32-byte hex regex `^[0-9a-f]{64}$/i` on all token routes; 400 on malformed.

Auth: `requireCommunityAuth` (signed-in caller); token IS the credential; email match enforced inside RPC.

Lookup: `lookup_invitation()` RPC (SECURITY DEFINER) returns id, org_id, org_name, invited_email, proposed_role, status, dates, is_expired.

Accept: `accept_invitation(p_token)` RPC. 42501 -> 403 (email mismatch). P0002 -> 404. 22023 -> 409. Success -> `{ ok: true, org_id }`.

Decline: `decline_invitation(p_token)` RPC, same error pattern.

Mine: service-role query on `org_invitations` by lowercased invited_email, filters out expired, returns up to 50 pending.

Email-match enforcement: client-side InvitationLandingPage lines 166-179 (warning banner + disabled Accept); server-side 42501.

Redirect after accept: InvitationLandingPage hard reload to `/` after 800ms; NoWorkspaceLanding panel hard reload to `/`. NO `/onboarding` detour. INVITATION-ACCEPTING USERS SKIP THE WIZARD ENTIRELY: no sector customization, no notification seeding, no full_name set.

Workspace-anchored rule: PASS (workspace name surfaced is operator-set, not worker-language).

NOT VERIFIED: Live invitation creation/lookup/accept/decline round-trip.

## Section F: Admin InvitationsPanel

File: `components/admin/InvitationsPanel.tsx`. Mounted by AdminDashboard scoped to active org.

Create flow: email + role select; POST `/api/orgs/[orgId]/invitations`. Server validates EMAIL_RE and ROLE_VALUES `{admin, member, viewer}`. RLS enforces caller is org admin/owner. Returns `invite_url` from `NEXT_PUBLIC_APP_URL` or request origin. Also `console.log`s the URL.

Revoke flow: DELETE `/api/orgs/[orgId]/invitations/[id]`; refreshes list.

Copy-URL behavior: freshly-created invitation rendered inline as `<code>` with Copy button (clipboard.writeText). Copy: "Invitation created. Email delivery is not yet wired - copy this URL and send it to the invitee." Admin-facing, acknowledges email-stub model per dispatch I.4.

Role select: `ROLES = ["member", "admin", "viewer"]` (line 37). MISMATCH with 4-tier vocabulary in platform-intent Section 8 (owner/admin/member/viewer). Owner is not invitable; owner role is auto-granted only to org creator by `create_org_for_self()` RPC. Whether intentional (owner transfer is a different flow) or a gap (admin cannot invite co-owner) is undocumented.

Workspace-anchored rule: Admin chrome; rule applies to customer-facing briefs not admin guidance. PASS.

NOT VERIFIED: Live admin login as owner/admin role, live creation/revoke against real workspace.

## Section G: Post-onboarding state

Routing after wizard Step 5: two CTAs ("Browse the community" -> /community; "Go to dashboard" -> /). No auto-redirect; ignored CTAs leave user on Step 5.

Routing after invitation-accept: hard reload to `/`. Wizard SKIPPED.

Signed-in-no-membership user landing: proxy.ts checks auth only, NOT org_memberships. Such a user hitting `/` receives a dashboard render against an empty workspace, NOT a redirect to `/workspace/new`. The `/workspace/new` page is only reached on explicit navigation. Gap visible in code, NOT VERIFIED live.

Dashboard state for freshly-onboarded user with new org: `app/page.tsx:34-100` does not branch on sector_profile or onboarding state; always renders EditorialMasthead + DashboardHero + HomeSurface. `getAppData()` is sector-filtered by `workspace_settings.sector_profile` resolved via cookies. Because the wizard writes `profiles.sector_overrides` and the per-user composition layer is documented as "downstream Section 6.8 work" (server-bootstrap.ts:42-46, NOT YET IMPLEMENTED), the dashboard renders against `workspace_settings.sector_profile` only, which is empty for fresh orgs (create_org_for_self default). Sector personalization does NOT take effect for fresh users. Same unfiltered / workspace-default payload as anon. The dashboard does not read `profiles.sector_overrides`. The wizard's sector step is functionally inert for dashboard personalization until that composition lands.

## Sector_profile coverage

Current verticals highlighted: fine-art, live-events, luxury-goods, film-tv, automotive, humanitarian.

All 40 sectors visible under "All sectors": cold-chain, pharma, flowers, wine-spirits, ecommerce, textiles, retail-fmcg, furniture, industrial, construction, metals-steel, mining-minerals, aerospace-defense, energy, oil-gas, chemicals, dangerous-goods, electronics, medical-devices, agriculture, live-animals, forestry, general-air, general-ocean, general-road, rail-intermodal, oversized-oog, personal-effects, government-military, sports-equipment, precious-valuables, nuclear-radioactive, bulk-commodity, liquid-bulk.

Gaps for expansion-cohort: taxonomy is 40-sector and dual-posture (no taxonomy gap). Persistence gap is SEVERE: wizard writes per-user not per-workspace; per-user composition layer not wired into dashboard query path. Expansion-cohort founder picks "general-ocean" or "chemicals" and nothing changes downstream. Orphan `SectorOnboarding.tsx` would close this; minimum-viable fix is wiring it in or rewriting Wizard Step 3 to UPDATE `workspace_settings.sector_profile`.

## Expansion-readiness

Onboarding needs for broader freight forwarding cohorts:

1. Sector write destination corrected: wizard writes `workspace_settings.sector_profile` for the founding workspace, OR per-user composition layer wired into dashboard query path. Without either, sector personalization is inert.
2. NoWorkspaceLanding redesigned for expansion-cohort first impression. Per platform-intent Section 7 Item 5 "chrome polish on NoWorkspaceLanding".
3. Identity inputs persisted (pronouns, role, employer, region). Either drop the inputs or extend persistence.
4. LinkedIn import implemented or de-leaked. "Coming soon - Phase D" is the same phase-language anti-pattern as OBS-19.
5. Email-delivered invitations. Per dispatch I.4 out of Workstream B scope; needed before broader cohort can self-serve.
6. Invitation-accept users get sector customization (currently skipped). Route through slimmed wizard or first-login prompt.
7. Sector_profile-driven Community group seeding. Per platform-intent Section 7 Item 5; not currently wired.
8. Per-user-override > workspace-default composition layer in dashboard query path. Per server-bootstrap.ts:42-46 marked as "Section 6.8" future work.

## Recommended new OBS entries

Do NOT add to followups.md per dispatch brief. Listed for operator review:

- REC-OBS-O-1: OnboardingWizard Step 1 leaks "Coming soon - Phase D" customer-facing (OnboardingWizard.tsx:376). Same anti-pattern class as OBS-19. Customers do not know what Phase D is. Owner: Sprint 2+ Onboarding completion. xref: OBS-19, OBS-20.

- REC-OBS-O-2: OnboardingWizard writes sector data to wrong destination. Step 3 UPDATEs `profiles.sector_overrides` (per-user) instead of `workspace_settings.sector_profile` (per-workspace). Combined with unimplemented Section 6.8 composition layer (server-bootstrap.ts:42-46), wizard sector selection is functionally inert. Orphan `SectorOnboarding.tsx` writes correctly but not wired. Owner: Sprint 2+ Onboarding completion. xref: platform-intent Section 7 Item 5.

- REC-OBS-O-3: OnboardingWizard Identity step silently drops 4 of 6 inputs (pronouns, role, employer, region). Inline comment acknowledges region only. Either drop inputs OR extend `profiles`. Owner: Sprint 2+ Onboarding completion. xref: REC-OBS-O-2.

- REC-OBS-O-4: Invitation-accept users skip onboarding wizard entirely (no sector customization, no notification seeding, no full_name). Owner: Sprint 2+ Onboarding completion. xref: REC-OBS-O-2.

- REC-OBS-O-5: Signed-in-no-membership user not routed to `/workspace/new`. Proxy checks auth only, not org_memberships. Hits `/` and receives empty dashboard. Owner: Sprint 2+ Onboarding completion. xref: OBS-17.

- REC-OBS-O-6: InvitationsPanel role select cannot promote to owner. ROLES = `["member", "admin", "viewer"]` (InvitationsPanel.tsx:37); 4-tier vocab includes owner. Either intentional or gap. Owner: Sprint 2+ Onboarding completion. xref: platform-intent Section 8.

## Methodology and limits

Code-level inspection only. Read end to end: signup/page.tsx, onboarding/page.tsx, workspace/new/page.tsx, invitations/[token]/page.tsx, OnboardingWizard.tsx, NoWorkspaceLanding.tsx, InvitationLandingPage.tsx, SectorOnboarding.tsx (orphan), InvitationsPanel.tsx, api/invitations/[token]/{route,accept,decline}, api/invitations/mine, api/orgs, api/orgs/[org_id]/invitations, auth/callback, proxy.ts, server-bootstrap.ts, constants.ts, WorkspaceProfile.tsx.

NOT VERIFIED: live form submission, Supabase Auth email delivery, live dashboard render for freshly-onboarded user, live admin role behavior, real RPC invocations, the content of `getAppData()` / `resolveOrgIdFromCookies()` regarding per-user override composition.

Operator may follow up with manual walkthrough or browser-automation-enabled dispatch.

=== Value Delivery Check ===

This dispatch's work does NOT directly advance customer-facing value delivery on any of the five surfaces (Regulations, Market Intel, Research, Operations, Community) or cross-cutting capabilities (Map, Intelligence Assistant, Onboarding).

This is an Onboarding flow audit; it produces findings for Sprint 2+ Onboarding completion work (per platform-intent SKILL.md Section 7 Item 5). Live UX is marked NOT VERIFIED per agent tool constraints; operator may dispatch a follow-up with browser automation OR perform the live walkthrough manually.

Dual-posture: audit applies equally to current operational scope and expansion-time users. The Onboarding flow is the explicit mechanism by which expansion-time users gain access to the platform per platform-intent SKILL.md Section 4 (cross-cutting capabilities).
