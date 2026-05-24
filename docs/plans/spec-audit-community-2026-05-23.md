# Community surface: built vs caros-ledge-platform-intent spec

Date: 2026-05-23
Branch: chore/spec-audit-community
Auditor scope: READ-ONLY. Compare `/community` index, `/community/browse`,
`/community/[slug]`, `/community/moderation` against the binding
five-surface spec in
`fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md`.

Operator's diagnosis under test: "Community, Spec: peer info-sharing
across orgs (core value driver). Built: post threads + groups + masthead,
partial. Direction is correct; depth is missing."

Headline finding: operator's "partial" framing UNDERSTATES the gap.
What ships is a generic forum app keyed to private/public groups with
post threads. The spec defines Community as the answer to freight
industry information isolation, the core value of the platform.
None of the four customer questions in the audit brief is answered by
what is shipped today. The build's direction is broadly correct (groups,
forums, promote-to-public). The depth missing is not "a few more
features." It is the entire fabric that turns a forum into a
peer-information-sharing surface: org/role context on every author,
expertise/specialism tagging on members, topic-clustered cross-group
discovery, peer-org directory, trusted-peer DM, and cross-surface
"what peers are saying" signals on Regulations / Market Intel /
Research / Operations. The skill calls Community "co-equal" with the
four intelligence pages. Today's build does not yet honour that
co-equal designation in any structural sense.

This report is mechanical: it cites spec lines, cites built code with
file:line refs, and asks operator questions before any rebuild.

---

## 1. Spec excerpt (verbatim)

From `fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md`:

Line 21:

> Community is a CORE customer-facing surface, co-equal with the four
> intelligence pages. Not Category 5. Not an onboarding mechanism. Not
> a sub-feature. The freight industry has a structural information-
> isolation problem: industry professionals and clients across
> geographies duplicate efforts because they do not know what others
> are doing. Caro's Ledge exists in significant part to fix this. The
> vendor directory sub-feature of Community can be deprecated or
> later-phased without affecting the core. The peer information-sharing
> function (working groups, forums, peer connection) is non-negotiable.

Line 35 (the community half):

> One surface (Community) addressing the freight industry information-
> isolation problem. Industry professionals and clients in different
> geographies duplicate efforts because they do not know what others
> are doing. Community is the peer resource that fixes this through
> working groups, forums, and peer connection.

Lines 110-126 (Community scope and shipped components):

> Scope. Peer information-sharing across organizations and client
> cohorts to address freight industry information isolation. CORE value
> surface, equal status with the four intelligence pages.
>
> Components currently shipped (per Multi-Tenant Foundation Workstream
> B, 2026-05-15):
> - Private working groups (org-scoped or cross-org peer collaboration
>   spaces)
> - Public forums (open discussion threads)
> - Vendor directory (a sub-feature; see deprecation note below)
> - Promote-to-public workflow (private content can be promoted to
>   public discussion)
> - Editorial pickup pipeline (Caro's Ledge editors can surface a
>   public Community thread inside platform intelligence)
>
> Vendor directory sub-feature. Can be deprecated or later-phased
> without affecting Community's core function. The core information-
> sharing function (working groups, forums, peer connection) is
> non-negotiable.

Line 124 (source category):

> Community does NOT map to the four-category source taxonomy.
> Community content is user-generated peer discussion plus editorial
> pickups; it is not classifier output from external sources.

From `fsi-app/.claude/skills/source-credibility-model/SKILL.md`:

Lines 319-328 (Community uses author-identity-shaped signals, NOT bias
tags):

> The Community surface renders user-generated content. The bias tag
> vocabulary applies to external publisher sources only and does not
> apply to Community content. Community credibility uses author-
> identity-shaped signals.
>
> When a member shares a FreightWaves article on Community, the
> FreightWaves source carries its bias tags (separate sources-registry
> signal); the member's act of sharing carries author-identity signals
> (Community model). Both render on the Community surface side by side.

Section 9 anti-pattern (line 344): "Adding bias tags to user-generated
Community content. The sources registry concept does not apply to user-
generated content. Community uses a different credibility model (author
identity + workspace verification + posting history)."

Implication: the credibility model already presumes author identity is
a first-class concept on every Community post. Today's posts surface
only `name + headshot_url` (see `fsi-app/src/app/api/community/posts/route.ts:158`).
No author identity beyond a display string is rendered.

---

## 2. Current built reality

### 2.1 `/community` index (`fsi-app/src/app/community/page.tsx`)

- Server fetches six things in parallel (lines 58-134): caller's group
  memberships, pending invitations, personal sidebar topics, per-region
  group counts, profile, primary org name.
- Renders `<CommunityShell>` with a default body that is one of three:
  (a) pending invitation panel + memberships preview if hasGroups
  (lines 412-481); (b) "No groups yet" empty state + Browse/Onboard
  CTAs (lines 374-410); (c) invitation panel only when no groups but
  invites exist.
- Right rail mounts `<HowPublishingWorks>` (lines 264-275), a static
  three-step explainer.
- There is NO post feed on the index, NO "what is happening across all
  my groups right now" view, NO topic-based discovery, NO peer activity
  signal, NO "across the industry" surface. The user lands on a list of
  groups they already belong to.

### 2.2 `/community/browse` (`fsi-app/src/app/community/browse/page.tsx`)

- Lists PUBLIC groups in a single requested region (default EU). Lines
  61-65 + 87-97. Private groups are deliberately excluded from browse
  (line 31-36 comment: "BROWSE shows PUBLIC GROUPS ONLY").
- Two-phase parallel fetch (Phase 1 lines 80-142, Phase 2 lines 197-212)
  resolves membership state (`member` / `pending-invite` / `none`) per
  group.
- Renders `<BrowseGroupsGrid>` with rows (lines 379-386).
- Discovery axes available: region only. NO discovery by topic, sector,
  cargo class (art/live events/luxury/auto/humanitarian), member
  expertise, recency-of-activity, or "groups your peers joined."

### 2.3 `/community/[slug]` group page (`fsi-app/src/app/community/[slug]/page.tsx`)

- Two-phase parallel fetch (Phase 1 lines 72-117, Phase 2 lines 149-172).
- Renders `<GroupHeader>` (line 277), an optional description card
  (lines 279-300), then a two-column body with `<PostList>` (line 314)
  on the left and `<HowPublishingWorks>` + `<CouncilMembersRail>` on
  the right (lines 332-337).
- GroupHeader (`fsi-app/src/components/community/GroupHeader.tsx`) has
  star toggle (line 220-230), Members modal (line 232-237), admin-only
  Invite (lines 238-245) and Settings (lines 246-253), and renders
  privacy pill, member count, weekly post count, last-active dot, role
  badge (lines 184-213).
- PostList (`fsi-app/src/components/community/PostList.tsx`) fetches
  `/api/community/posts?group_id=...` paginated 20 at a time (lines
  42-67), renders `<PostComposer>` for members (line 115), `<Post>`
  rows newest-first (line 215), and "Load older" cursor pagination
  (lines 225-247).
- Post card (`fsi-app/src/components/community/Post.tsx`): author
  headshot + name, relative timestamp (lines 150-211), title + body
  (212-263), reply count + lazy-load + reply composer for members
  (289-330), promote-to-intelligence for admins/moderators (332-351),
  report menu for members (356-361), delete for author/admin (226-249).
- VerifierBadge (`fsi-app/src/components/community/VerifierBadge.tsx`)
  is wired into the card (line 178) BUT the posts API does not yet
  return `verifier_status` (`VerifierBadge.tsx:14-23`), so it renders
  null in practice. RoleBadge similarly depends on a `role` field the
  API does not return.

### 2.4 `/community/moderation` (`fsi-app/src/app/community/moderation/page.tsx`)

- Same shell context fetch (lines 47-159), then renders the global
  `<ModerationQueue />` (line 211) which RLS-narrows to reports filed
  by the caller, reports on posts in groups the caller administers,
  and (for platform admins) every open report.

### 2.5 Cross-cutting components landing in Build 10

- `CommunityMasthead.tsx`: editorial title plus pill-shape search
  (Cmd+K), four scope chips (All / Posts / Groups / People), with a
  `NotificationsBell` slot. Search submit is wired into
  `CommunitySearchResults`.
- `CommunitySearchResults.tsx`: dropdown that hits
  `/api/community/search` and shows groups / posts / people. ILIKE
  substring match against `name + description` (groups) and
  `title + body` (posts) and `full_name` (people) (see
  `fsi-app/src/app/api/community/search/route.ts:81-115`). FTS deferred
  per route comment lines 5-13. Cap: 8 per scope.
- `CommunitySidebar.tsx`: 280-px Slack-style sidebar. Sections
  Starred / Private groups / Public forums / My topics / Browse.
  Per-group unread + mention pills poll
  `/api/community/notifications/counts` every 60s (lines 74-109).
- `GroupModals.tsx` (1201 lines): MembersModal (members directory +
  leave action), SettingsModal (rename / description / privacy edits),
  InviteModal (candidate search, send, list-and-revoke pending invites).
- `dispatch.ts` (`fsi-app/src/lib/notifications/dispatch.ts`):
  service-role helper that inserts into the `notifications` table.
  Kinds: `reply | invite | moderation | promote | mention` (line 19-24).

### 2.6 Spec-listed components that DO NOT EXIST in the surface

- Vendor directory: spec line 118 lists it as shipped. The codebase
  search for `vendor`, `directory` under `fsi-app/src/app/community`
  and `fsi-app/src/components/community` returns nothing. The only
  match is the unrelated `vendorClaims` reference in Market Intel
  scoping. The spec's own "Components currently shipped" enumeration
  is OUT OF SYNC with reality on this point. (It is also listed as a
  sub-feature that can be deprecated, so the gap is non-fatal.
  Flagged so operator is aware the spec is currently lying.)
- Editorial pickup pipeline: spec line 120 lists it as shipped. The
  built artifact is `PromotePostButton` (Post.tsx:336) + the promote
  route, which copies a post into `intelligence_items`. There is no
  editorial review surface, no "Caro's Ledge editor desk," no audit
  trail of which threads were picked up, and no surface on
  Regulations / Market Intel / Research / Operations that renders
  "promoted from Community thread" attribution. The button exists; the
  pipeline does not, as a customer-facing capability.

---

## 3. Line-cited gap analysis against the four customer questions

For each of the four customer questions in the audit brief, mapped
against the built code:

### Q1. "What are peers at other forwarders dealing with right now?"

PRESENT (partial):
- Public forums exist (browse page surfaces them in the user's region)
  per `fsi-app/src/app/community/browse/page.tsx:87-97`.
- A user IN a public forum can read its post feed
  (`fsi-app/src/components/community/PostList.tsx:215`).

MISSING (substantive):
- No cross-group "industry pulse" view on `/community` index. The
  default body (`fsi-app/src/app/community/page.tsx:251-275`) shows the
  user's OWN groups and pending invitations. No "active threads across
  the industry today" stream, no "trending topics across all public
  forums," no "what new questions did peers raise this week."
- No org context on post authors. Posts API
  (`fsi-app/src/app/api/community/posts/route.ts:156-159`) selects only
  `id, full_name, avatar_url`. Reader CANNOT see what organization,
  cargo type, or geography the poster works at. "Peers at other
  forwarders" is invisible because the surface does not render
  forwarder identity.
- No filter on browse for "active right now" or "most active this week."
  Browse sorts by `member_count desc` only
  (`fsi-app/src/app/community/browse/page.tsx:97`).

MIS-FRAMED: HowPublishingWorks rail (rendered on /community index AND
on every group page) frames Community as a DRAFTING surface that feeds
platform intelligence, not as a peer-information-sharing surface where
the value is the conversation itself. Lines 22-39 of
`fsi-app/src/components/community/HowPublishingWorks.tsx`.

VERDICT: not answered. The user can drill into one public forum they
joined; nothing surfaces "what peers are dealing with right now" as a
first-class affordance.

### Q2. "Has anyone else solved [my problem]?"

PRESENT:
- Masthead search exists. Submit fires a query against
  `/api/community/search?q=...&scope=...`
  (`fsi-app/src/components/community/CommunityShell.tsx:119-133`).
- ILIKE substring match runs across `community_posts(title, body)`
  (lines 92-99 of search route), `community_groups(name, description)`
  (lines 100-107), and `profiles(full_name)` (108-114).

MISSING (substantive):
- ILIKE substring. Per route comment lines 5-13, FTS is deferred. A
  user typing "CBAM hydrogen exemption" against substring match will
  miss any thread that phrases it as "carbon border adjustment for
  green hydrogen." There is no stemming, no query expansion, no
  synonym handling, no ranking by relevance.
- No "similar threads" affordance on a post. The Post component
  (`fsi-app/src/components/community/Post.tsx`) does not surface
  related discussions, does not link to prior threads on the same
  topic, does not invoke the Intelligence Assistant for "find me
  prior discussions on this."
- No tagging on posts. `community_posts` migration 030 has no tag/
  topic field; the only category-like concept is the per-user sidebar
  bookmark (community_topics) which is private and does not span
  users.
- Search results cap at 8 per scope (search route line 38). For
  "has anyone solved..." this is too narrow when the corpus grows.

PRESENT_BUT_UNAUTHORIZED: posts API caps body at 8000 chars
(PostComposer.tsx:47); no attachment surface; no "code/snippet/data
attachment" affordance for technical solutions.

VERDICT: weakly answered. Substring search works for exact phrasing.
For real "has anyone solved X" semantics this falls down.

### Q3. "Who in my industry is talking about [topic relevant to my decisions]?"

PRESENT:
- People scope in the masthead search returns rows with
  `name + headshot_url` (`fsi-app/src/app/api/community/search/route.ts:108-114`).
- CouncilMembersRail (`fsi-app/src/components/community/CouncilMembersRail.tsx`)
  surfaces a small preview of admins/moderators on the group page
  right rail.

MISSING (substantive):
- People search returns ONLY name and headshot. No employer, no role,
  no region, no sector specialization, no recent post count. A user
  searching "find peers working on EU ETS for air freight" gets a list
  of strangers' names.
- No peer-org directory. The spec line 21 calls out "industry
  professionals and clients across geographies" but the surface has no
  way to discover who is at which forwarder.
- No expertise tagging. No member can declare "I work on PPWR
  packaging compliance" so that question-askers can find them.
- No "people who post frequently in [topic]" discovery. Posting
  history is not surfaced.

VERDICT: not answered.

### Q4. "Where can I privately discuss something with peers I trust?"

PRESENT:
- Private groups exist and are gated by RLS
  (`fsi-app/src/app/community/[slug]/page.tsx:124-126, 180-182`).
- Private groups appear in the user's sidebar
  (`fsi-app/src/components/community/CommunitySidebar.tsx:54-60`).
- Admins can invite specific users via the InviteModal candidate
  search (`fsi-app/src/components/community/GroupModals.tsx:677-1027`).

MISSING (substantive):
- No direct messages. CommunitySidebar comment lines 14-18 explicitly:
  "NO Direct messages section (out of scope for Phase C and D)." Yet
  the SidebarRow comment on line 553 references "DMs sections" as if
  they used to exist. Either way, today there is no 1:1 or small-group
  private message surface. Trusted peer DM is the most common
  "private discussion" pattern and it is absent.
- No "trusted peer" affordance distinct from group membership. The
  only way to privately discuss is to belong to the same private
  group; you cannot pull aside one person you trust.
- VerifierBadge exists (`fsi-app/src/components/community/VerifierBadge.tsx`)
  but the posts API does not return `verifier_status`, so verification
  signals are invisible in practice (line 14-23 of VerifierBadge
  acknowledges this).

VERDICT: partially answered for already-existing private groups; not
answered for trusted-peer pulled-aside conversation.

### Cross-surface peer commentary check

Spec implication (line 21 + the "co-equal with intelligence pages"
framing): a freight forwarder reading a Regulations brief should be
able to see "what peers are saying about this" inline. Grep across
`fsi-app/src/components/regulations`, `market`, `research`,
`onboarding` for `community|peer|discussion` returns nothing
substantive. There is NO cross-surface peer commentary today. A user
reading a CBAM brief does not see "3 active discussions in EU groups
on this." A user reading a Market Intel signal does not see "peer
discussion in your forum on this trend." This is the single largest
structural omission the audit found and it is the operator's "depth
is missing" point made concrete.

---

## 4. Missing data shapes the spec calls for

These are shapes that the spec language requires for Community to
function as defined, that DO NOT exist in the codebase today. Each is
sourced from spec language, not invented.

1. **Org/employer on post authors**. Spec line 21: "peers at other
   forwarders." Built (`posts/route.ts:158`) returns only name +
   avatar. Required shape: `author.organization_name`,
   `author.workspace_role`, optional `author.sector_profile` (from
   `org_memberships` + `organizations` + `workspace_settings`). This
   is the single most important fix because "peer information sharing
   across organizations" reduces to vapor without it.

2. **Author-identity credibility signals** per source-credibility-model
   Section 8 row "Community" (cited line 301): "author identity +
   workspace verification". Built: VerifierBadge component exists,
   posts API does not return `verifier_status`. Required: posts API
   widening; per source-credibility-model line 321-326, also expose
   "posting history" signal.

3. **Topic-clustered cross-group discussion threads**. Spec line 35:
   the value is fixing duplicated efforts because peers "do not know
   what others are doing." A group-scoped feed alone cannot solve this
   because the same topic recurs across many regional groups. Required:
   topic taxonomy at the platform layer (NOT the per-user
   `community_topics` table at `migration 031` which is private sidebar
   bookmarks). Posts need a `topic_id` or tag array. Discovery surfaces
   need a "by topic" view across groups.

4. **Peer-org directory**. Spec line 21: "industry professionals and
   clients in different geographies." A directory of organizations on
   the platform with their sector / region / size, joinable to
   community participation, is missing entirely. Required schema link:
   `organizations` (exists) + `org_memberships` (exists) + a public
   directory surface that respects the spec's expansion intent
   (current cohort: art logistics + live events + luxury + auto +
   humanitarian; expansion: broader freight forwarding).

5. **Expertise / specialism tagging on members**. Implicit from the
   spec's expansion model (line 41: `sector_profile` customization)
   and the source-credibility model's "author identity" signals.
   Required: `profile.expertise_tags` or `org_membership.specialism`
   that surface on author rows and are searchable in the People scope.

6. **Trusted peer DM / small-group private**. Spec line 35: "peer
   connection." Not just group membership. Required: direct messages
   table + UI surface. Sidebar already gestures at it ("DMs sections"
   comment) but the feature is explicitly out of scope per
   `CommunitySidebar.tsx:14-18`.

7. **Cross-surface peer commentary signals**. Spec lines 47-48:
   Community is "co-equal" with the four intelligence pages. Co-equal
   in practice means a Regulations brief shows "n active discussions
   in your groups on this regulation." Required: a join from
   `intelligence_items` to `community_posts` (by topic / regulation_id /
   item_id reference) and a small panel on each intelligence page that
   surfaces the link.

8. **Editorial pickup pipeline as a customer-facing artifact**. Spec
   line 120 lists it shipped. Built: `PromotePostButton` + promote
   route copy posts into intelligence_items. Missing: any editorial
   review surface, any audit trail surface, any "promoted from
   community" attribution on the receiving intelligence page. The
   pipeline exists as a one-shot copy, not as a curatorial loop.

9. **Sector-profile-driven group seeding for new workspaces**. Spec
   line 209 (Customer-Facing Value Gap item 5). New workspaces today
   land in NoWorkspaceLanding with no automatic group seeding. For the
   "core value driver" framing, this is the on-ramp to peer
   information sharing and is not built.

10. **Vendor directory**. Spec line 118 lists it shipped; not present
    in the routes or components. The spec says this is deprecable so
    treat as low priority, but flag the spec/reality mismatch so
    operator can either ship it or remove the claim from the spec
    enumeration.

---

## 5. Operator questions before rebuild

These are decisions the operator must make. They are not
recommendations.

1. **"Co-equal" rendered how?** The spec says Community is co-equal
   with the four intelligence pages. Concretely: should each
   intelligence page (Regulations / Market Intel / Research /
   Operations) render a "peer activity on this item" panel that links
   into Community threads? Or is "co-equal" satisfied by Community
   being one of five sidebar nav items with its own URL? The audit
   evidence (zero cross-surface peer commentary) suggests the current
   interpretation is the latter. If that is wrong, the rebuild scope
   is much larger.

2. **Org/employer surfacing.** If Community is "peer information
   sharing across organizations," every post needs author org context.
   Should the rebuild widen `posts/route.ts` to denormalize
   `org_membership.organization_name` plus optionally `sector_profile`
   onto every author block? RLS considerations: some users may want
   org affiliation private. Acceptable to default opt-out, default
   opt-in, or operator-decision?

3. **Topic taxonomy at the platform layer.** Today the only "topic"
   concept is a per-user sidebar bookmark (migration 031). For
   "anyone else solved [my problem]" to work across groups, posts need
   a shared topic / tag scheme. Should the rebuild introduce a
   platform-curated topic taxonomy (operator decides the list, posts
   get tagged on creation), or a freeform tag system, or a hybrid?

4. **Direct messages, in or out?** CommunitySidebar.tsx:14-18 says
   "out of scope for Phase C and D" but Q4 in the customer-question
   battery cannot be answered without it. Is DM in Phase E scope, in
   the operator's next sprint scope, or permanently out?

5. **Vendor directory: ship, deprecate, or remove from spec?** Spec
   line 118 says shipped; reality says not present. Three valid
   resolutions: (a) build it, (b) deprecate it formally and remove
   from the "shipped" list in the spec, (c) leave the spec as-is
   knowing the line is aspirational. Pick one.

6. **Editorial pickup: a button or a pipeline?** Today
   PromotePostButton + promote route is a one-shot copy from Community
   into intelligence_items. Spec line 120 calls it an "editorial pickup
   PIPELINE" with editorial gating. Two interpretations:
   (a) the current button IS the pipeline as defined, ship is correct;
   (b) the spec means editorial review + audit trail + attribution
   on the receiving page, and that work is unstarted. Which is right?

7. **People search: identity or roster?** Today People scope returns
   `name + headshot_url` only. For "who in my industry is talking
   about X" this is useless. The minimum useful shape is name +
   employer + region + active-group-list. Bigger: name + employer +
   region + expertise tags + recent post topics. Pick a target shape
   so the rebuild has a destination.

---

## Constraint compliance

- READ-ONLY: confirmed. No code edits made.
- No em or en dashes: report uses commas only.
- No vendor references: no third-party vendor / hosting / billing
  references in this report.
- `docs/inventories/worktrees.md`: not touched.
- Single commit on `chore/spec-audit-community`, push to
  `origin/chore/spec-audit-community`. No merge.
