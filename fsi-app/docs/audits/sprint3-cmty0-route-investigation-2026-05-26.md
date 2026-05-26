# CMTY0 — /community route investigation

**Date:** 2026-05-26
**Status:** READ-ONLY investigation complete.

## Finding (one sentence)

(a) Operator is viewing `/community/[slug]` (group detail page), not `/community` (index) — the legacy `CommunityShell` is still the mount for the group detail route, and its rendered chrome (8 region tabs, 280px Slack-style sidebar with "Back to Caro's Ledge" + Starred / Private groups / Public forums / My topics / Browse, search bar with All/Posts/Groups/People scope chips) matches the operator's screenshot exactly.

## Evidence

### page.tsx mount (`/community`)

`fsi-app/src/app/community/page.tsx` lines 3–8 import the H6 component:

```ts
import {
  CommunityView,
  type CommunityViewMembership,
  type CommunityViewThread,
  type CommunityViewPublicForum,
} from "@/components/community/CommunityView";
```

Lines 249–257: the page returns `<CommunityView .../>` with no wrapping shell. The route is a pure H6 mount — there is no fallback path that would render `CommunityShell` from this file.

### CommunityView state

`fsi-app/src/components/community/CommunityView.tsx` is the H6 rebuild. Header comment lines 1–34 documents the rebuild explicitly. Verified against `design_handoff_2026-05/community.html`:

- 5-tab strip rendered lines 200–235. Tab labels (lines 162–168): `By Region & Group / Industry Pulse / Hot Topics / People / Editorial Picks`. Mockup line 156–160 lists the same 5.
- `<EditorialMasthead title="Community" .../>` at lines 172–187 (matches mockup `mh-title` at line 148).
- "Activity by region" 4-card grid (Europe / Americas / APAC / MEAF) lines 294–326 — matches mockup `region-grid` lines 165 onward.
- "Topics this week, by region" matrix (lines 329–383) matches mockup `topic-row` block.
- "Recent activity in your groups" + "Public forums in your network" sections (lines 388–432) match mockup group-sec / public-forum layout.
- No composer. The header comment explicitly notes the omission: "compose flow routes via group navigation; existing PostComposer is mounted on /community/[slug]" (page.tsx lines 33–35).

H6 rebuild matches the mockup. The INDEX route would render the 5-tab strip + Activity-by-region surface, NOT what the operator screenshotted.

### Legacy `CommunityShell`

`fsi-app/src/components/community/CommunityShell.tsx` is the legacy 280px-sidebar shell for the `/community/*` family. Header comment lines 6–22 explicitly describe the "Slack-style 280px sidebar" with global-sidebar suppression. Layout (lines 103–115):

- Renders `<CommunitySidebar>` on the left.
- Renders `<CommunityMasthead>` + `<CommunityRegionTabs>` + body content stack on the right.

`CommunitySidebar.tsx` (lines 4–17 header):

> Sections (collapsible, each with a count and an optional "+" button):
> - Starred (memberships where starred=true)
> - Private groups (memberships where group.privacy='private')
> - Public forums (memberships where group.privacy='public')
> - My topics (user-defined community_topics with group counts)
> - Browse (static link: All groups)

Line 153 confirms the "← Back to Caro's Ledge" link.

`CommunityRegionTabs.tsx` (line 7) canonical region codes: `EU · UK · US · LATAM · APAC · HK · MEA · GLOBAL` — exactly the 7 the operator described (the 8th, GLOBAL, was likely off-screen or the operator counted the visible set).

`CommunityMasthead.tsx` line 25: `const SCOPES = ["All", "Posts", "Groups", "People"]` — the screenshot's "All / Posts / Groups / People" filter pills, exactly. Lines 14–18: "below it, a pill-shaped search input with a Cmd+K kbd hint and a Search button. Scope chips (All / Posts / Groups / People)." Matches the screenshot's centered search bar.

Structural comparison vs. operator's screenshot:

| Operator screenshot element            | Legacy CommunityShell source                                                          | Match |
| -------------------------------------- | ------------------------------------------------------------------------------------- | ----- |
| 7 region tabs (EU/UK/US/LATAM/...)     | `CommunityRegionTabs` (codes: EU UK US LATAM APAC HK MEA GLOBAL)                      | YES   |
| Left rail "Back to Caro's Ledge"       | `CommunitySidebar` line 153                                                            | YES   |
| Starred / Private groups / Public forums / My topics / Browse | `CommunitySidebar` sections (header lines 5–10) | YES   |
| Search bar at top center               | `CommunityMasthead` search form (lines 58–end)                                         | YES   |
| Filter pills (All / Posts / Groups / People) | `CommunityMasthead` `SCOPES` const line 25                                     | YES   |
| No composer at top                     | Composer lives in `PostList` per `[slug]/page.tsx` line 5; not in shell               | YES   |
| No "Activity by region" grid           | Shell does not render H6 region-card grid                                              | YES   |
| No group sections / no thread rows in masthead area | Shell renders these only when child body provides them                    | YES   |

Every element of the screenshot maps to a legacy `CommunityShell` (+ `CommunitySidebar` + `CommunityMasthead` + `CommunityRegionTabs`) feature. The screenshot is the `/community/[slug]` shell.

### Route mapping

- `/community` → `CommunityView` (H6 rebuild). Per `fsi-app/src/app/community/page.tsx` line 250.
- `/community/[slug]` → `CommunityShell` wrapping `<GroupHeader>` + `<PostList>` + `<HowPublishingWorks>` + `<CouncilMembersRail>`. Per `fsi-app/src/app/community/[slug]/page.tsx` lines 260–340.
- `/community/browse` → separate page (`fsi-app/src/app/community/browse/page.tsx`).
- `/community/moderation` → separate page (`fsi-app/src/app/community/moderation/page.tsx`).

Note on caching: `fsi-app/next.config.ts` lines 127–135 sets `/community(/.*)?` to `Cache-Control: private, max-age=30, stale-while-revalidate=300`. This is browser SWR, not a stale Vercel bundle — does not change verdict.

### Mockup scope

`design_handoff_2026-05/community.html` is the **INDEX** mockup.

Direct evidence:
- Line 148: `<h1 class="mh-title">Community</h1>` (top-level Community title, not a group name).
- Line 149: `<div class="mh-meta">Peer information sharing across regions and groups. · <b>147</b> active threads · <b>23</b> organizations · <b>4</b> of your groups · <b>96</b> public forums</div>` — the masthead meta enumerates across-network counts (147 threads, 23 orgs, "4 of your groups"). This is a roll-up surface, not a group detail page.
- Lines 155–161: 5-tab strip (`By Region & Group / Industry Pulse / Hot Topics / People / Editorial Picks`) — this is the index navigation. A group detail page would have group-name title + group-scoped meta, not a 5-tab roll-up.
- Lines 163 onward: `<!-- — REGION OVERVIEW — -->` followed by 4-card region grid and topic-matrix — index-level aggregation.

The mockup file does NOT contain a `/community/[slug]` group-detail design. Per H6's reading, the mockup is index-only.

## Verdict

**(a)** — Operator is viewing `/community/[slug]` (group detail page), not `/community` (index). Every structural element in the screenshot (7 region tabs, left rail with Starred / Private / Public / My topics / Browse + "Back to Caro's Ledge", centered search bar with All / Posts / Groups / People scope pills, absence of composer + Activity-by-region grid + group sections) maps to the legacy `CommunityShell` mounted at `/community/[slug]/page.tsx` line 261. The H6 rebuild at `/community` is intact and uncompromised; the operator is simply on a different route than the mockup describes. H6 (b) is disproven: `/community/page.tsx` cleanly renders `CommunityView` with no shell wrapper. H6 (c) is disproven: the H6 source matches the mockup line-for-line; no stale deploy is needed to explain the divergence — operator route is the explanation.

## Downstream implications

If (a): CMTY1 scope = group-detail rebuild against a *separate* group-detail mockup, because `community.html` is index-only and does not specify the group-detail surface. CMTY1's first sub-task should be sourcing or producing a group-detail mockup (whether the legacy `CommunityShell` chrome is the intended shape going forward, or whether a Sprint 3 group-detail design is owed) before any code change. The H6 rebuild at `/community` does not need touching.
