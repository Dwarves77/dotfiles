# Caro's Ledge — Design Handoff for Claude Code

This package is a **design reference bundle** to be implemented in the live `fsi-app/` Next.js codebase at `carosledge.com`. The HTML files are prototypes — they show the intended look, layout, copy, and interactions. They are **not** to be copied into the codebase as-is. Recreate each design using the existing Next.js / Tailwind / shadcn/ui patterns already in `fsi-app/src/`.

**Fidelity:** High. Colors, typography, spacing, copy, and component structure are intentional and final. Match them.

---

## How to use this bundle

1. **Read `DESIGN_SYSTEM.md` first.** It is the authoritative spec for voice, palette, type, spacing, iconography, and "no-go" rules. Every screen below assumes you've internalized it. The aesthetic is editorial / trade-press, **not** SaaS dashboard.
2. **Read `colors_and_type.css`.** It contains the canonical token values. Map these to the existing Tailwind/CSS-vars system in `fsi-app/src/app/theme.css` and `globals.css` — do not introduce a parallel system.
3. **Open `preview/index.html` in a browser.** It links to every screen in this bundle.
4. **For each route below, the HTML file in `preview/` is the source of truth** for layout, copy, and interaction. The matching path in `fsi-app/src/app/` is where it must land.

---

## What changed since the last sync

The product surface has grown. The list below is exhaustive — anything not in `fsi-app/src/app/` today should be created; anything that exists should be updated to match the design.

### New top-level routes / surfaces

| Design file | Live route | Status in `fsi-app` today | Action |
|---|---|---|---|
| `preview/dashboard-v3.html` | `/` | Exists (`Dashboard.tsx`) | **Replace** layout. Editorial masthead, vol/no eyebrow, 3-column rhythm, urgency-led brief stack. |
| `preview/regulations.html` | `/regulations` | Exists | **Update**. New filter chips, jurisdiction strip, urgency-budgeted oxblood rule. |
| `preview/regulation-detail.html` | `/regulations/[id]` | Exists | **Update**. New brief detail layout — citation promoted, cause/effect tree, related-instruments rail. |
| `preview/market-intel.html` | `/market` | Exists | **Update** to new layout. |
| `preview/research.html` | `/research` | Exists | **Update**. |
| `preview/operations.html` | `/operations` | Exists | **Update**. |
| `preview/map.html` | `/map` | Exists | **Update** with new jurisdiction overlay + filter strip. |
| `preview/community.html` | `/community` | Exists (`/community` folder) | **Major rebuild.** See "Community" section below. |
| `preview/admin.html` | `/admin` | Exists | **Update**. |
| `preview/profile.html` | `/profile` | Exists | **Update**. |
| `preview/settings.html` | `/settings` | Exists | **Update**. |

### New shell-level resources

These are shared chrome / primitives. Implement them once, reuse everywhere.

- **App shell (`preview/shell.css` + `preview/shell.js`)** — sidebar, masthead, mobile burger, sidebar collapse persistence (`localStorage` key `cl-side-collapsed`). Map onto `src/components/AppShell.tsx` + `Sidebar.tsx`.
- **Standard left nav** — Dashboard, Regulations, Market Intel, Research, Operations, Map, Community, Admin, Profile, Settings. Iconography uses geometric monoglyphs (▼ ⚐ ⏚ ⌬ ⊕ ⊙ ⬢ ⏶ ⏯) — these are the spec, not Lucide; keep them as inline glyphs in the nav (or replace with matching Lucide if the team prefers, but they must be 1.25–1.5px stroke and `currentColor`).
- **Shared AI prompt bar (`.ai` block in `shell.css`)** — pill-shaped row with sparkline icon, input, submit button, plus chip suggestions below. Used identically on every page that has one. Don't fork it per page.
- **Tokens preview cards** (`tokens-*.html`, `type-scale.html`, `spacing-radius-shadow.html`, `badges.html`, `cards.html`, `patterns.html`, `gradient-bars.html`) — these are **documentation**, not user-facing pages. Use them to verify your token values render correctly.

### Community — the largest new surface

`preview/community.html` is a full rebuild and introduces several new concepts not present in the current `src/app/community/` or `src/components/community/`:

#### 1. Slack-style sidebar replacement
When a user enters Community, the **standard Caro's Ledge left nav is replaced** by a Community-specific sidebar. A "‹ Back to Caro's Ledge" link at the top swaps it back. This is a per-section nav swap, not a permanent change to the global shell.

The Community sidebar has these sections, all collapsible, each with a count and (where appropriate) a `+` add affordance:
- **Starred** — pinned groups, channels, DMs (drag-promote to top)
- **Private groups** — invite-only working groups (🔒 high-amber accent + left rule)
- **Public forums** — regional + global (🌐 green accent)
- **My topics** — user-defined tag groups bundling several groups under one label (e.g. "CBAM" → 3 groups, "FuelEU + SAF" → 2 groups)
- **Direct messages** — 1:1 DMs with presence dot (active = green dot, idle = grey)
- **Browse** — All groups, Events, Vendor directory

#### 2. Sidebar interactions
- **Drag-to-reorder** within any section (HTML5 drag-and-drop; rendered with `drop-before` / `drop-after` 2px accent rules).
- **Right-click context menu** with: Star / Unstar, Mute, Add to topic, Move up/down, Leave group.
- **Star** moves the item into the Starred section. **Topic tagging** lets a user bundle groups under a label they create (the topic shows in the "My topics" section as a "#"-prefixed item with a "3 grps" count).
- **Search input at the top of the sidebar** — local "jump to" filter; complements the global search bar in the masthead (see below).
- **Footer** with current user avatar, name, employer; gear icon to settings.
- Unread / mention badges:
  - **Mention badge** = `var(--accent)` navy pill with white number
  - **Unread badge** = `var(--critical)` red pill with white number

#### 3. Global Community search bar
Sits in the masthead, below the title. Pill-shaped row with:
- ⌕ icon (accent-colored)
- Input placeholder: *"Search posts, groups, members, vendors, regulations cited in discussions…"*
- ⌘K kbd hint
- "Search" submit button
- **Scope chips** below: All / Posts / Groups / People / Vendors / Events
- **Filter chips** (toggle, multi-select): 🔒 Private only, 🌐 Public only, EU only (or the active region)
- **Results dropdown** opens on focus or input, grouped by Groups / Posts / People / Vendors with each row showing icon + bolded match + meta
- **`⌘K` / `Ctrl+K` opens it from anywhere**, `Esc` closes

#### 4. Region tab strip
Beneath the masthead, full-width: EU · UK · US · LATAM · APAC · Hong Kong · Middle East & Africa · Global. Active region underlined in oxblood, count chip filled. Switching the active region reframes the page (composer default target, "Your groups in X", side rails).

#### 5. Composer
Persistent at top of the feed. Avatar + textarea + bottom toolbar:
- **Target picker** — pill-shaped button that color-shifts: amber (private destination) / green (public destination) / neutral (cross-post). Click opens dropdown listing user's private groups, then public forums, then a "Cross-post to multiple groups…" option.
- Inline tools: ＋ (tag a regulation), @ (mention a vendor), 📎 (attach).
- "Post →" submit on right.

#### 6. Group header strip
When a group is selected, a header card appears above the feed with: icon plate, group name (display font), privacy pill, member count, weekly post count, last-active dot, role badge (Admin/Mod/Member), and right-aligned actions (Star / Members / Settings).

#### 7. Feed
List of posts. Each post:
- 40px round avatar (color-coded by author type — accent / critical / high / green)
- Header line: bold name · employer · timeago · group pill (private = amber, public = green) · optional `Promoted` chip
- Title (15px bold)
- Snippet (12.5px text-2)
- Foot: reply count, last-reply time, participant count, attachments, **`↗ Promote to public` button** (admin-only, see below)
- Filter chips on the feed head: All / Threads / Mentions / Promoted

#### 8. Promote-to-public modal
Group admins can promote a private post to a public forum. Modal walks through:
1. **From** — shows source private post (locked amber card)
2. **To** — destination public forum select (or "Both")
3. **Public title** — editable, defaults to a public-safe rewrite
4. **Public summary** — editable textarea, what members see
5. **Auto-strip note** — flags how many confidential items will be removed; "Review →" to inspect
6. **Attribution** — Caro's Ledge attribution / original-author with consent / anonymous-summary

#### 9. Onboarding flow
First-run modal (also reachable from sidebar header `+ Onboard` button and from Tweaks → "Show onboarding"). 4 steps:
1. **Choose path** — two cards: "Import from LinkedIn" (blue `in` glyph) or "Start fresh" (manual entry)
2. **Path-specific** — either LinkedIn import preview with checkboxes (Profile basics / Industry tags / Verified employer / Connections cross-match) **or** fresh-signup form (name / role / employer / region / work email)
3. **Suggested groups** — 6 recommendations as cards. Public forums prefilled as "Joined ✓"; private workplace groups detected from work email show "Request to join"; senior groups show "Apply"
4. **Done** — confirmation + drag/right-click/promote tutorial copy

State machine: `{ step: 1..4, path: 'linkedin' | 'fresh' }`. The skeleton lives in `community.html` — port to a `<OnboardingDialog>` component using the shadcn `Dialog`.

#### 10. Right rail (sidebar of the feed page)
Stacked cards:
- **Council members** (avatars + role + last-active + verified ✓ for verifiers)
- **Vendors mentioned this week** (avatar + name + verified mark + description + mention count) → links to vendor directory
- **Upcoming events** (date plate + title + source group + lock icon for private events)
- **How publishing works** (3 short paragraphs explaining private/public/promote — keep this; new users need it)

---

## Data model additions

The community surface introduces concepts the current types in `src/types/community.ts` likely don't cover yet. Extend:

```ts
type CommunityGroup = {
  id: string;
  name: string;
  region: 'EU' | 'UK' | 'US' | 'LATAM' | 'APAC' | 'HK' | 'MEA' | 'GLOBAL';
  privacy: 'private' | 'public' | 'workplace';
  joinPolicy: 'open' | 'request' | 'invite' | 'auto-domain';
  memberCount: number;
  weeklyPostCount: number;
  lastActiveAt: string;
  myRole?: 'admin' | 'moderator' | 'member' | null;
  myMembershipState: 'member' | 'pending' | 'none';
  starred: boolean;
  muted: boolean;
  topicIds: string[];                 // user's own topic tags this group is in
  description: string;
};

type CommunityTopic = {                // user-defined sidebar groupings
  id: string;
  ownerId: string;
  label: string;
  groupIds: string[];
  order: number;
};

type CommunityPost = {
  id: string;
  groupId: string;
  authorId: string;
  title: string;
  body: string;
  createdAt: string;
  lastReplyAt: string;
  replyCount: number;
  participantCount: number;
  promotedFromPostId?: string;        // set when this is a public promotion
  promotedFromGroupId?: string;
  attribution?: 'editorial' | 'original-author' | 'anonymous';
  attachmentCount: number;
};

type SidebarOrder = {                  // per-user persistent ordering
  userId: string;
  starred: string[];                   // group ids in user's chosen order
  private: string[];
  public: string[];
  topics: string[];
  dms: string[];
};

type OnboardingState = {
  step: 1 | 2 | 3 | 4;
  path: 'linkedin' | 'fresh' | null;
  linkedinImport?: { name: string; role: string; employer: string; location: string; verifiedEmployer: boolean; };
  fresh?: { name: string; role: string; employer: string; region: string; workEmail: string; };
  recommendedGroupIds: string[];
  joinedGroupIds: string[];
  pendingGroupIds: string[];
};
```

The promote-to-public flow needs a server action that creates a new public `CommunityPost` referencing the source via `promotedFromPostId`, with redaction metadata logged.

---

## Implementation order (suggested)

1. **Tokens** — sync `colors_and_type.css` into `fsi-app/src/app/theme.css`. Verify oxblood, paper, ash, brass values exactly match. Ship before any UI.
2. **Shell** — confirm `AppShell` + `Sidebar` use the new masthead, eyebrow, hairlines, and that `data-side="standard"` mode is the default everywhere except `/community/*`.
3. **Dashboard `/`** — port `dashboard-v3.html` first; it exercises masthead + AI bar + brief blocks + urgency rule budget.
4. **Regulations + detail** — port `regulations.html` and `regulation-detail.html`. These set the citation-prominence pattern.
5. **Community shell + sidebar swap** — implement the per-section nav replacement and the Community sidebar with all interactions.
6. **Community search bar + region strip + composer**.
7. **Group header + feed + post detail**.
8. **Promote-to-public modal + onboarding modal**.
9. **Remaining routes** — Market Intel, Research, Operations, Map, Admin, Profile, Settings.

---

## Rules that must not bend

These are repeated from `DESIGN_SYSTEM.md` because they're easy to forget mid-implementation:

- **No box-shadow.** Anywhere. If something needs lift, use a hairline or step to `paper-2`.
- **No rounded corners** except the 2px on chips and the search pill. Buttons are square.
- **No gradients on surfaces.** The `linear-gradient(...)` you'll see on private group cards is a deliberate top-down paper-2 wash on the amber-tinted block — keep it; it's one of two exceptions and is documented in `colors_and_type.css`.
- **No emoji in product copy.** The 🔒 / 🌐 / # / ⌕ glyphs in the Community design are functional iconography (privacy state, channel type, search) and acceptable in chrome — but never in editorial copy or empty states.
- **Hover = paper-2 background step + 1px text underline appearing.** Never lift, never scale.
- **Animation budget:** fades and opacity only, 120–180 ms, `cubic-bezier(0.2, 0, 0.2, 1)`.
- **Urgency rule scarcity:** at most one oxblood 2px rule per screen.

---

## Files in this bundle

```
design_handoff/
├── README.md                       ← you are here
├── DESIGN_SYSTEM.md                ← canonical voice + visual spec
├── colors_and_type.css             ← canonical tokens
├── preview/
    ├── index.html                  ← entry — links to every screen
    ├── shell.css, shell.js         ← shared chrome
    ├── _preview.css                ← preview-page chrome only (don't ship)
    │
    ├── dashboard-v3.html           ← /
    ├── dashboard-v2a.html          ← alternate dashboard layout (reference, not to ship)
    ├── dashboard-v2b.html          ← alternate dashboard layout (reference, not to ship)
    ├── regulations.html            ← /regulations
    ├── regulation-detail.html      ← /regulations/[id]
    ├── regulation-detail-v2.html   ← alternate detail layout (reference)
    ├── market-intel.html           ← /market
    ├── research.html               ← /research
    ├── operations.html             ← /operations
    ├── map.html                    ← /map
    ├── community.html              ← /community  (LARGEST CHANGE)
    ├── admin.html                  ← /admin
    ├── profile.html                ← /profile
    ├── settings.html               ← /settings
    │
    ├── tokens-brand.html           ← documentation
    ├── tokens-priority.html        ← documentation
    ├── tokens-surfaces.html        ← documentation
    ├── tokens-topic-impact.html    ← documentation
    ├── type-scale.html             ← documentation
    ├── spacing-radius-shadow.html  ← documentation
    ├── badges.html                 ← documentation
    ├── cards.html                  ← documentation
    ├── patterns.html               ← documentation
    ├── ai-bar.html                 ← documentation (canonical AI prompt bar)
    └── gradient-bars.html          ← documentation
```

---

## How to ask Claude Code to take this on

Drop this folder into the `fsi-app/` repo (or alongside it) and start your Claude Code session with something like:

> The folder `design_handoff/` contains the new design spec for Caro's Ledge. Read `design_handoff/README.md` first, then `design_handoff/DESIGN_SYSTEM.md`. The HTML files in `design_handoff/preview/` are reference prototypes — recreate them in this Next.js codebase using existing patterns in `src/components/` and `src/app/`, mapping tokens via `src/app/theme.css`. Start with the implementation order in the README. Show me a plan before you write code.

If the model asks what's new vs existing, point it at the "What changed" table in this README and at `src/app/community/` for the surface that changes most.
