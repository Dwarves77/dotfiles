# Spec audit: user chrome (8 pages) vs caros-ledge-platform-intent

Date: 2026-05-23
Branch: chore/spec-audit-user-chrome
Base: origin/master at 9ca913c
Scope: 8 user-facing chrome / utility / account pages plus /privacy
Spec source: fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md
Adjunct: docs/decisions/ADR-001-platform-model.md

## Approach

This audit covers 8 user-visible pages that are NOT intelligence-content surfaces. They cluster as account, chrome, and utility. Combined into one audit because each is small and the spec is intentionally thin for chrome (the spec governs the five customer-facing surfaces and three cross-cutting capabilities; chrome appears mainly under the Onboarding cross-cutting capability).

Methodology per page:
1. Spec coverage check (quote if present, state if silent)
2. Built reality with file:line citations
3. Functional end-to-end check per operator's "no dead code on the site" rule
4. Customer purpose check
5. Operator questions

A consolidated section follows.

=== Value Delivery Check ===

This dispatch's work does NOT directly advance customer-facing value delivery.

This is a READ-ONLY audit dispatch. It produces a gap report comparing built chrome against the platform intent spec. It surfaces operator decisions but ships no code. Closure of any surfaced gap is Sprint 2+ scope, currently unscoped per caros-ledge-platform-intent SKILL.md "Customer-Facing Value Gap".

Surface coverage of the audit itself: chrome pages cluster under the Onboarding cross-cutting capability (signup, onboarding, invitations, workspace/new), with the remaining four (login, profile, settings, events, privacy) being utility / legal / account chrome. The five customer-facing surfaces (Regulations, Market Intel, Research, Operations, Community) are out of audit scope here.

Dual-posture: chrome serves both current and expansion cohorts equally; no narrowing flags emerged from this audit.

---

## 1. /login

File: fsi-app/src/app/login/page.tsx (155 lines)

**Spec coverage.** Silent. The spec does not mention /login directly. The closest mention is under ONBOARDING FLOW (Section "Cross-Cutting Capabilities" line 156): "Multi-step wizard at /onboarding, plus /signup, /invitations/[token], /workspace/new." Login is not enumerated. Login is a precondition for every customer-facing surface, treated as a given.

**Built reality.** Email + password sign-in form. Reads ?redirect= query param and routes there on success (login/page.tsx:16). Calls supabase.auth.signInWithPassword (line 24), surfaces error inline, redirects on success with router.refresh (line 35-36). Link to /signup at line 144. No OAuth providers (Google, LinkedIn) on this surface; signup notes Phase C scope explicitly excluded them.

**Functional end-to-end.** Yes. Standard Supabase email/password flow.

**Customer purpose.** Clear. Customers sign in here.

**Gap or status.** Matches operator expectations. Spec is silent because login is plumbing, not a surface.

**Operator questions:**
- Should LinkedIn OAuth ever land on /login (Phase D+), or remain wizard-only at /onboarding?
- Is "no Forgot password link" intentional? Customers with forgotten passwords currently have no recovery path from this surface.

---

## 2. /signup

File: fsi-app/src/app/signup/page.tsx (294 lines)

**Spec coverage.** Mentioned in passing under ONBOARDING FLOW (line 156): "/signup" is enumerated as a wizard adjunct. No spec content beyond the route enumeration.

**Built reality.** Email + password + confirm-password form. Server-side and client-side guard against already-signed-in users (signup/page.tsx:35-49). Posts to supabase.auth.signUp with emailRedirectTo pointing at /auth/callback?next=/onboarding so the verified user lands in the wizard (line 70-76). On submit, shows a "Check your email" component with the entered address (CheckYourEmail at line 242). Comments at top explicitly call out scope: "No Google OAuth, no LinkedIn OAuth. LinkedIn import shown as a 'Coming soon' stub on the onboarding wizard, not here." (line 12-15).

**Functional end-to-end.** Yes. Form to Supabase signup to email verification to wizard. The email verification path is necessary; the comments note the callback hand-off.

**Customer purpose.** Clear.

**Gap or status.** Matches spec intent (wizard adjunct). Note that signup comments are slightly stale because the wizard now does have LinkedIn import live behind LINKEDIN_CLIENT_ID gating (per the LinkedIn import landing at a5db2fa); the "Coming soon" stub framing in signup/page.tsx:14 is no longer accurate.

**Operator questions:**
- Update signup/page.tsx:13-15 comment to reflect that LinkedIn is live on /onboarding when configured?
- Surface a deployment-state hint on /signup if LinkedIn import is available, so users can preview the wizard option before creating credentials?

---

## 3. /onboarding

File: fsi-app/src/app/onboarding/page.tsx (40 lines, mostly server gate); component: fsi-app/src/components/onboarding/OnboardingWizard.tsx (985 lines)

**Spec coverage.** Present. ONBOARDING FLOW section (lines 154-162):

> Function. Mechanism for expansion-time users to join the Workspace layer with appropriate sector_profile customization and Community participation. Required for the architectural intent to materialize.
>
> Current state. Partially shipped per Multi-Tenant Foundation Workstream B (4-step wizard, signup, invitation accept/decline plumbing, minimal NoWorkspaceLanding). Gaps: sector taxonomy expansion in the wizard (currently highlights 6 current niches), email-delivered invitations (currently copy-URL only), LinkedIn import (currently stub), chrome polish on NoWorkspaceLanding, sector_profile-driven Community group seeding for new workspaces.

**Built reality.** 4-step wizard at /onboarding with optional 5th confirmation step. Steps: Choose path (LinkedIn import live when LINKEDIN_CLIENT_ID set, OnboardingWizard.tsx:486-559, OR Start fresh), Identity (name, pronouns, role, employer, region, locked work email; OnboardingWizard.tsx:620), Sector profile (6 highlighted niches + all sectors via SectorPill; OnboardingWizard.tsx:738), Notifications (NotificationPreferences component; OnboardingWizard.tsx:863), Done (Browse the community CTA; OnboardingWizard.tsx:880-919). Server gate at page.tsx:19-23 bounces no-user to /login and no-workspace to /workspace/new. Sector persistence writes to workspace_settings.sector_profile (OnboardingWizard.tsx:230-251) which is the dashboard-anchored destination (per inline comment at 219-228). LinkedIn callback round-trip handled at OnboardingWizard.tsx:136-171 with success toast + profile prefill, and 7 distinct error-reason copies in LINKEDIN_ERROR_COPY (line 68-77).

**Functional end-to-end.** Yes. LinkedIn import landed at a5db2fa. Sector destination is correct (workspace_settings.sector_profile per OnboardingWizard.tsx:230-251, post-2026-05-18 fix). Three of the spec's listed gaps remain open (email-delivered invitations, sector taxonomy expansion beyond highlighted 6, sector_profile-driven Community group seeding). One gap closed since spec wording (LinkedIn import).

**Customer purpose.** Clear and load-bearing. This is the bridge from a fresh signup to functional workspace-scoped intelligence delivery.

**Gap or status.** Matches spec, with one spec-listed gap now closed (LinkedIn import). Three spec-listed gaps remain.

**Operator questions:**
- Update spec wording at SKILL.md:160 to remove "LinkedIn import (currently stub)" given a5db2fa shipped a live import behind LINKEDIN_CLIENT_ID gating?
- Sector taxonomy expansion: is the wizard's current "6 highlighted + all sectors" two-tier model the intended UX for expansion-cohort users, or is a sector-search UI planned?
- Sector_profile-driven Community group seeding (spec line 160) for new workspaces: should the wizard's Step 3 trigger a server-side group-seed routine on save, or is this a separate workflow?

---

## 4. /invitations/[token]

Files: fsi-app/src/app/invitations/[token]/page.tsx (27 lines); fsi-app/src/components/onboarding/InvitationLandingPage.tsx (237 lines)

**Spec coverage.** Enumerated under ONBOARDING FLOW (SKILL.md line 156): "/invitations/[token]" listed alongside /signup and /workspace/new. No spec content beyond the route enumeration.

**Built reality.** Server gate redirects unauthenticated users to /login with ?redirect= preservation (page.tsx:22-24). Client-side component fetches /api/invitations/[token] on mount, renders Accept / Decline buttons, surfaces an "invited email doesn't match your signed-in email" warning panel (InvitationLandingPage.tsx:166-179) and disables Accept in that case. Accept POSTs and hard-reloads to / so server-bootstrap re-resolves new org membership (line 56-70). Decline POSTs and surfaces a "you can close this page" terminal state (line 72-83, 223-233). Handles invitation lifecycle states (pending, expired, non-actionable) at lines 181-207.

**Functional end-to-end.** Yes. Token-to-action plumbing is wired against /api/invitations/[token], /accept, /decline endpoints.

**Customer purpose.** Clear. Multi-tenant invitation acceptance is the operator-defined Workstream B deliverable.

**Gap or status.** Matches spec. The spec note at line 160 ("email-delivered invitations, currently copy-URL only") flags a delivery-mechanism gap; the landing page itself is functional once a customer has the URL.

**Operator questions:**
- Email delivery for invitations (spec gap): who owns wiring this? Is it onboarding scope or notifications scope?
- Should the "invited email doesn't match" warning offer a switch-account link or sign-out shortcut, rather than just disabling Accept?

---

## 5. /workspace/new

Files: fsi-app/src/app/workspace/new/page.tsx (30 lines); fsi-app/src/components/onboarding/NoWorkspaceLanding.tsx (308 lines)

**Spec coverage.** Enumerated under ONBOARDING FLOW (SKILL.md line 156). Spec also calls out "chrome polish on NoWorkspaceLanding" as a gap (line 160).

**Built reality.** Server gate bounces no-user to /login and ALREADY-has-workspace users to / (workspace/new/page.tsx:17-23). The landing has three panels (NoWorkspaceLanding.tsx:168-275): Pending invitations (auto-fetches /api/invitations/mine on mount, renders inline Accept/Decline for each row), Have an invitation URL (paste-token form that strips and accepts), Or start your own workspace (org name input that POSTs /api/orgs and routes to /onboarding). On accept of an invitation, hard-reloads to / (line 82-83). On create-org, hard-reloads to /onboarding so server-bootstrap re-resolves (line 124-125). AppShell also has a separate "no workspace yet" banner with a Set up workspace link (AppShell.tsx:74-85) that points here.

**Functional end-to-end.** Yes. Per the NoWorkspaceLanding.tsx:17 comment, the chrome is intentionally minimal per dispatch decision I.3 (operator-functional, not visually polished). This matches the spec's "minimal NoWorkspaceLanding" note (SKILL.md line 159).

**Customer purpose.** Clear. Three-state onboarding state machine entry point (page.tsx:7-12).

**Gap or status.** Matches spec, including the explicit "minimal chrome" framing on both sides.

**Operator questions:**
- Is "chrome polish on NoWorkspaceLanding" (spec gap line 160) planned for Sprint 2 or later? If later, the spec note can stay; if soon, what visual standard governs?
- The three panels render simultaneously regardless of state. Should the layout prioritize one panel based on the auto-fetched invitation count (e.g. collapse Create panel if pending invitations exist)?

---

## 6. /profile

Files: fsi-app/src/app/profile/page.tsx (25 lines); fsi-app/src/components/profile/UserProfilePage.tsx (994 lines); fsi-app/src/components/profile/OrganizationPanel.tsx (437 lines); fsi-app/src/components/profile/MembersPanel.tsx (378 lines)

**Spec coverage.** Silent on /profile as a distinct surface. /profile is referenced indirectly through ADR-001 (three-layer tenant model) which mandates the Workspace layer including org_memberships and roles; the spec then commits to Phase 7 Org + Members panels per commits 6b86b04 and 52f7c29.

**Built reality.** Tabbed shell with 7 tabs (UserProfilePage.tsx:68-76): Personal, Organization, Members & roles, Sector profile, Jurisdictions, Verifier badge, Activity. All marked phaseC: true now (line 67-69 comment). Personal panel writes full_name, bio, avatar_url to profiles table (PanelPersonal at line 519-584). Sector panel writes profiles.sector_overrides (the per-user override layer, not the workspace-anchored sector_profile that the dashboard reads; this is by design per the per-user override mention at lib/api/server-bootstrap.ts:42-46). Jurisdictions panel writes jurisdiction_overrides and transport_mode_overrides. Verifier panel submits a status flip to "pending". Activity panel renders. Organization tab loads OrganizationPanel (line 442-444) which fetches /api/orgs/[org_id] (GET) and PATCHes name + slug for owners. Members tab loads MembersPanel (line 445-447) which fetches /api/orgs/[org_id]/members and supports role changes + revoke for owners, guarded against demoting/revoking the only owner and against owner self-revoke. Owner callout banner at line 253-286 ("You are Owner of {orgName}") renders for workspace owners only.

**Functional end-to-end.** Yes for all 7 tabs. Phase 7 chrome (Organization, Members) shipped at 6b86b04 and 52f7c29, fully wired against the three-layer tenant model (ADR-001).

**Customer purpose.** Clear. Personal profile, sector / jurisdiction / mode preferences, verifier badge application, plus org + member management for owners.

**Gap or status.** Matches the post-Phase-7 build. Stale comment at UserProfilePage.tsx:30-31 still says Workspace org, Members, and Billing show "Coming soon" panels gated to a future multi-tenant phase, but the code below shipped real surfaces for Organization and Members. Billing tab does not exist in the TABS array (line 68-76); it is mentioned in the stale comment block but never rendered. Personal panel still saves to profiles.sector_overrides as a per-user override layer; the per-user-to-per-workspace composition layer is flagged at server-bootstrap.ts:42-46 as not wired into the dashboard query path. This was the bug the onboarding wizard's sector writer was rerouted to fix (OnboardingWizard.tsx:219-228), but the /profile Sectors panel still writes the per-user destination. Customers editing sectors on /profile may see no dashboard change.

**Operator questions:**
- Should the /profile Sectors panel ALSO write workspace_settings.sector_profile (mirroring the onboarding wizard fix), or is the per-user override semantically distinct on this surface? Currently the documentation says sectors on /profile is "per-user override" but the composition layer it depends on is not wired, making it functionally inert.
- Update UserProfilePage.tsx:30-31 stale comment to reflect Phase 7 reality (Organization and Members tabs are live, Billing is not in the TABS array).
- Billing: is /profile the right home for billing (per stale comment), or does billing live elsewhere?

---

## 7. /settings

Files: fsi-app/src/app/settings/page.tsx (33 lines); fsi-app/src/components/pages/SettingsPage.tsx (360 lines)

**Spec coverage.** Silent on /settings as a distinct surface. Settings is utility chrome for personal preferences.

**Built reality.** Tabbed shell with 7 tabs (SettingsPage.tsx:95-103): General, Dashboard, Exports, Saved searches, Data & supersessions, Archive, Help. General contains DashboardSettings, NotificationPreferences (relocated here per PR-D IA refactor; line 196-218), and BriefingScheduleSection (PR-L Settings restoration). Dashboard tab also renders DashboardSettings (a known not-yet-split monolith per line 237-239 comment). Exports tab renders DashboardSettings again with different framing. Saved searches stores to localStorage (line 288-298 comment; flags L2 backend split candidate). Data tab renders DataSummary + SupersessionHistory. Archive tab renders ArchiveViewer. Help tab renders HelpSection (which links to /privacy per HelpSection.tsx:43). All non-default tabs are dynamic-imported with ssr:false per Hotfix-3 (line 10-20).

**Functional end-to-end.** Yes. Each tab renders functional content. DashboardSettings being rendered three times (under General, Dashboard, Exports) is acknowledged scaffolding to be split later (line 237-239 comment).

**Customer purpose.** Clear. Personal preferences, exports, saved searches, supersession audit, archive recovery, help.

**Gap or status.** Functional and reasonably comprehensive. The DashboardSettings triple-render is a known design-debt item. Saved searches stays in localStorage (acknowledged); no server persistence for cross-device sync. Briefing schedule reads/writes workspace_settings.alert_config (line 219-228 comment); functional.

**Operator questions:**
- Saved searches as localStorage-only: when does the L2 backend split (saved_searches table) happen, given the spec is silent here but the inline comment flags it as candidate?
- DashboardSettings split: is splitting the monolith per-tab a Phase 8+ workstream or current sprint scope?
- Help tab: should the /privacy link be promoted to a global footer link (currently only reachable through Settings → Help)?

---

## 8. /events

File: fsi-app/src/app/events/page.tsx (15 lines)

**Spec coverage.** Silent. The spec mentions Community as a surface but events as a sub-feature is not enumerated. Per operator's 2026-05-21 dead-code disposition and NO VENDORS / NO EVENTS rule, /community/events was removed.

**Built reality.** A 15-line server component that calls `permanentRedirect("/community/events")` (line 13). The file comment at line 4-10 says: "moved to /community/events as part of PR-D IA refactor (2026-05-06)" and frames itself as "defense-in-depth fallback so the route still redirects if Next config redirects are ever bypassed".

**The /events finding (investigation).**
- next.config.ts does NOT contain a redirects() function; there is no canonical 308 the file claims to back up. The file comment is stale.
- /community/events does NOT exist in the codebase. Confirmed by listing fsi-app/src/app/community/ which contains only [slug], browse, moderation, page.tsx.
- Therefore /events 308s to a 404. Defense-in-depth is now defense-in-broken.
- No outbound links to /events from anywhere in fsi-app/src (Grepped href patterns: zero matches). /events is unreachable through any UI navigation.
- The redirect target /community/events was removed in commit 9cd364f (dead-code disposition 2026-05-21) per operator's NO EVENTS rule.

**Functional end-to-end.** No. The redirect target is gone; any deep link or stale bookmark to /events now lands on a 404. This is dead code per operator's "no dead code on the site" rule.

**Customer purpose.** None. Vestigial from the PR-D IA refactor era when /community/events existed.

**Gap or status.** DEAD CODE. The file should be deleted. The spec is silent because events is not a customer-facing scope.

**Operator questions:**
- Confirm authorization to delete fsi-app/src/app/events/page.tsx outright. Per operator's "site code deletes need operator signoff" rule, claude does NOT decide here; surfacing for explicit operator decision.

---

## 9. /privacy

File: fsi-app/src/app/privacy/page.tsx (381 lines)

**Spec coverage.** Silent. Legal pages are not part of the customer-facing surface model.

**Built reality.** Full privacy policy with metadata (title, description, robots index/follow), Last updated April 30, 2026. Sections: Introduction, Information We Collect (Provided, Automatically, Third Parties), How We Use Information, Legal Bases (GDPR), Information Sharing (Service Providers, Legal, Business Transfers), Data Retention, Your Rights (with CCPA sub-section), International Data Transfers, Data Security, Cookies and Tracking, Children's Privacy, Third-Party Links, Changes to This Policy, Contact (with Pet Pursuit LLC address, privacy contact email), Data Protection Officer. Service providers list at line 151-156 includes Supabase, Vercel, Anthropic, LinkedIn, Browserless, Stripe.

**Functional end-to-end.** Yes. The page is reachable from Settings → Help (HelpSection.tsx:43). It is also exposed to search engines (robots index:true at line 7).

**Customer purpose.** Legal compliance (GDPR, CCPA), service-provider disclosure, contact path for data-subject rights.

**Gap or status.** Not a stub. Real policy content. The Service Providers list at line 151-156 includes Stripe ("when applicable") which may be aspirational rather than current. The DPO section explicitly says "Pet Pursuit LLC has not appointed a dedicated Data Protection Officer" (line 321-323).

**Operator questions:**
- Should /privacy also be linked from the global AppShell footer or login/signup pages, given it is currently reachable only through Settings → Help (one click deep into authenticated chrome)? Unauthenticated visitors cannot reach the policy.
- Stripe is listed in service providers (line 156): is Stripe live, or is the "when applicable" qualifier a forward-looking commitment that should be removed until billing ships?
- Last updated April 30, 2026: is this current, or does the policy need a refresh given the post-April three-layer tenant model + Phase 7 Org/Members shipment?

---

## Consolidated findings

### Overall posture: how much of the chrome is functional vs scaffolded vs dead?

Of the 9 surfaces audited (8 plus /privacy):
- 7 functional and matching their respective spec or operator intent: /login, /signup, /onboarding, /invitations/[token], /workspace/new, /settings, /privacy.
- 1 functional with stale comment debt and one inert sub-surface: /profile (Organization and Members tabs shipped at Phase 7, comment block at UserProfilePage.tsx:30-31 still says "Coming soon Phase D"; the Sectors panel writes to a per-user override layer whose composition path is not wired into the dashboard, making sector edits on /profile functionally inert per the lib/api/server-bootstrap.ts:42-46 note).
- 1 dead: /events.

Sprint 1 phase-language anti-patterns DID leak into chrome in one place: UserProfilePage.tsx:30-31 comment references "Phase D" but it is in a code comment, not customer-visible UI. Other chrome surfaces do not appear to leak phase-language to customers.

### Cross-page flow concerns

The signup-to-onboarding-to-workspace/new hand-off is clean in most paths but has one ordering question:

1. /signup posts auth.signUp with emailRedirectTo `/auth/callback?next=/onboarding`. User clicks email link, arrives at /onboarding.
2. /onboarding server gate checks bootstrap.orgId. If no orgId, bounces to /workspace/new.
3. /workspace/new offers three panels: accept pending invitation, paste invitation URL, create own workspace.
4. Create own workspace POSTs /api/orgs then hard-reloads to /onboarding.
5. /onboarding now has orgId, proceeds with the 4-step wizard.

This flow works but it routes a brand-new user to a "no workspace" page mid-onboarding before they realize the issue. Decision: is the /signup → /onboarding → /workspace/new → /onboarding bounce intentional UX, or should /signup land users directly on /workspace/new for the no-org case? The current bounce is functional but adds a redirect hop that could be a single page.

The /workspace/new → /onboarding hand-off after org creation goes through `window.location.href = "/onboarding"` (NoWorkspaceLanding.tsx:124-125), which is a full-document load. Necessary so server-bootstrap re-resolves; documented in the comment.

### The /events verdict

/events is dead code. It 308-redirects to /community/events which was removed in commit 9cd364f (dead-code disposition 2026-05-21) per operator's NO EVENTS rule. The defense-in-depth claim in the file comment (line 4-10) is stale: next.config.ts does not contain a redirects() function, so the file is now backing up a non-existent canonical redirect to a non-existent target. No UI in fsi-app/src links to /events. Per operator's "site code deletes need operator signoff" rule, claude does not unilaterally delete; this audit surfaces the disposition for operator decision.

### Top 5 operator decisions surfaced across all 9 pages

1. **Delete /events.** Confirm authorization to remove fsi-app/src/app/events/page.tsx given the redirect target /community/events was removed at 9cd364f and no UI links to /events. (1-line server component, zero blast radius.)

2. **Resolve the /profile Sectors panel inert-writer issue.** Currently the Sectors panel at UserProfilePage.tsx (PanelSectors) writes to profiles.sector_overrides as a per-user override, but the composition layer that would mix per-user overrides with per-workspace sector_profile is not wired (per server-bootstrap.ts:42-46 note that drove the OnboardingWizard rewrite at 2026-05-18). Customers editing sectors on /profile see no dashboard effect. Either mirror the wizard's write to workspace_settings.sector_profile, OR wire the composition layer so per-user overrides take effect, OR explicitly remove the panel as misleading until either path is implemented.

3. **Update spec wording at SKILL.md:160 to remove the "LinkedIn import (currently stub)" gap.** LinkedIn import landed at a5db2fa as a live OAuth round-trip behind LINKEDIN_CLIENT_ID gating. The spec's current-state paragraph still lists it as a stub. The signup/page.tsx:13-15 comment is also stale on this point.

4. **Email-delivered invitations gap (spec line 160).** Currently /invitations works once a user has the URL but invitations are copy-URL only. Assign ownership: does this fall under onboarding completion or notifications fan-out scope?

5. **/privacy reachability.** /privacy is only reachable from Settings → Help (HelpSection.tsx:43), which means an unauthenticated visitor or anyone outside of Settings cannot reach the legal policy. Decision: link from global AppShell footer and from /login + /signup? This is a low-effort change with potential legal implication for GDPR / CCPA compliance.

### Caveats

- This audit is READ-ONLY. No code changes. Operator decisions surfaced, not executed.
- Spec is intentionally thin on chrome surfaces; the audit does not fabricate spec where the spec is silent.
- The /privacy "Stripe is a service provider when applicable" question is a legal-content question not a code question; operator may want to consult counsel before changing.
- The OrganizationPanel and MembersPanel were spot-checked (first 80 and 50 lines respectively) rather than fully read; both have load + PATCH/DELETE plumbing wired against /api/orgs/[org_id] and /api/orgs/[org_id]/members per their respective headers, consistent with Phase 7 shipment per 6b86b04 and 52f7c29.
- Audit did not test runtime end-to-end (e.g. signup-to-onboarding actual round-trip); inferences are from code inspection.

## Related

- [[ADR-001-platform-model]] — Audit's adjunct spec; /profile Org+Members panels are wired against this ADR's three-layer tenant model
- [[multi-tenant-foundation-followups-2026-05-15]] — Open chrome gaps (email-delivered invitations, group seeding, chrome polish) are multi-tenant-foundation followups
- [[dead-code-disposition-2026-05-21]] — The /events dead-code finding traces to the /community/events removal (commit 9cd364f) this disposition ordered
- [[multi-tenant-foundation-prework-2026-05-15]] — Onboarding wizard, invitations, workspace/new chrome audited were shipped under the Multi-Tenant Foundation Workstream B this prework scopes
- [[spec-audit-synthesis-2026-05-23]] — One of eight audits synthesized (commit c23091a); supplies the Class-C drift and /events-delete decisions
