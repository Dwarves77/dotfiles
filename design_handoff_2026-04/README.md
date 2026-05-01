# Caro's Ledge — Design Handoff (April 2026 snapshot)

This package is a **design reference bundle** to be implemented in the live `fsi-app/` Next.js codebase at `carosledge.com`. The HTML files are prototypes — they show the intended look, layout, copy, and interactions. They are **not** to be copied into the codebase as-is. Recreate each design using the existing Next.js / Tailwind / shadcn/ui patterns already in `fsi-app/src/`.

**Fidelity:** High. Colors, typography, spacing, copy, and component structure are intentional and final. Match them.

---

## Files in this bundle

```
design_handoff_2026-04/
├── README.md                            ← you are here (orientation + this session's deltas)
├── README_PREVIOUS.md                   ← prior handoff (still authoritative for everything not changed below)
├── DESIGN_SYSTEM.md                     ← canonical voice + visual spec
├── colors_and_type.css                  ← canonical tokens
├── preview/                             ← latest HTML reference for every screen
    ├── index.html                       ← entry point — links to every screen
    ├── shell.css, shell.js              ← shared chrome (sidebar, masthead, mobile)
    ├── shell-globals.css                ← NEW: global primitives (UserMenu / AI assistant / Toast / Modal)
    ├── _preview.css                     ← preview-page chrome only (not for shipping)
    │
    ├── dashboard-v3.html                ← /
    ├── regulations.html                 ← /regulations
    ├── regulation-detail.html           ← /regulations/[id]
    ├── market-intel.html                ← /market
    ├── research.html                    ← /research
    ├── operations.html                  ← /operations
    ├── map.html                         ← /map
    ├── community.html                   ← /community
    ├── admin.html                       ← /admin    ← MAJOR REWRITE this session
    ├── profile.html                     ← /profile  ← MAJOR REWRITE this session
    ├── settings.html                    ← /settings ← MAJOR REWRITE this session
    │
    ├── *-old.html                       ← pre-redesign snapshots kept for diffing only — do not ship
    ├── community-v1.html, community-v2.html ← alternate community layouts (reference only)
    ├── dashboard-v2a.html, dashboard-v2b.html, dashboard-compare.html ← alternate dashboards (reference only)
    ├── regulation-detail-v2.html        ← alternate detail layout (reference only)
    │
    └── tokens-*.html, type-scale.html, spacing-radius-shadow.html, badges.html, cards.html, patterns.html, ai-bar.html, gradient-bars.html
        ← documentation pages, not user-facing
```

---

## How to read this handoff

1. **Read this file first** for what's changed in this session.
2. **Read `README_PREVIOUS.md`** — it is still the authoritative spec for everything that hasn't changed. It covers the global shell, dashboard, regulations, regulation detail, market intel, research, operations, map, and the community surface in detail.
3. **Read `DESIGN_SYSTEM.md`** for voice / palette / type / iconography / no-go rules.
4. **Open `preview/index.html` in a browser** — it links to every screen.
5. The HTML in `preview/` is the **source of truth** for layout, copy, and interaction.

---

## What's new since the previous handoff

This session focused on the back-of-house surfaces (Profile, Settings, Admin) plus a handful of global primitives. All editorial / customer-facing surfaces from the previous handoff are unchanged unless explicitly listed below.

### 1. Profile — split from Settings, fully rebuilt (`profile.html`)

Profile and Settings were previously a single mixed page. They are now distinct top-level routes with different audiences and IA. Profile is **about the human** — who they are, what they cover, what they're certified to do.

**Tabs (in this order):**

| Tab | Purpose |
|---|---|
| Personal | Name, pronouns, role, employer, contact, headshot, bio, time zone |
| Workspace org | Workspace name, subdomain, industry, HQ, reporting jurisdictions, internal description (this is the *org owner's* workspace metadata — the one place a user can edit it) |
| Members & roles | Members table; per-row role / 2FA / last-active / filings-owned (only visible to org owners + admins) |
| Billing & plan | Plan tiers (Desk / Bureau / Enterprise), invoice list (only org owners) |
| Sector profile | **40-sector multi-select** — see below |
| Jurisdictions | Home jurisdiction chips (EU / UK / US / IMO / ICAO / CN / JP / SG / IN / BR / +) and transport-mode chips (Air / Ocean / Road / Rail / Inland water) |
| Verifier badge | Application + status of the editorial-board verifier credential |
| Activity | Member's posts / briefs / comments / dispute decisions |

**40-sector multi-select** (`#sectors` panel)
- Two-column grid of 40 sectors organised into two visual sections: **Highlighted niches** (premium specialist coverage, marked ★) and **Standard sectors**.
- Each row: checkbox + sector name + count of regulations currently mapped to it (e.g. "Fine Art & Museum Logistics — 6").
- Live counter at top: **"7 sectors selected · this is what 'Reset to my sectors' reads from across the product."**
- Save commits to `profile.sectors` and propagates across Regulations / Market Intel / Research / Map as the default filter set.
- The sector list is the canonical taxonomy; reuse the same dataset on `regulations.html`'s sector filter sidebar.

**Verifier badge flow**
- Inactive state: circle ✓ icon + "You are not a verifier" + descriptive copy + apply form
- Active state: solid disc ✓ icon + accent background + "Verified · since Mar 2024" + revoke / renew controls
- The ✓ badge appears next to verified users' names in community threads, briefs, and dispute reviews.

**Data writes from this page reach:**
- `users.profile.*` (personal, sectors, jurisdictions, verifier status)
- `organizations.*` (workspace org tab — owners only)
- `organization_members.*` (members tab — owners + admins only)

---

### 2. Settings — split from Profile, sub-tabbed (`settings.html`)

Settings is **about the application** — preferences that change how the product behaves *for this user*.

**Tabs:**

| Tab | Contents |
|---|---|
| General | Account email, password, 2FA, language, timezone, notifications (email / Slack / digest cadence), keyboard shortcuts toggle, session management |
| Dashboard | What appears on the user's dashboard: brief stack ordering, AI bar default scope, masthead density, urgency rule budget on/off, "show disputed items" toggle |
| Exports | Default export format (CSV / PDF / DOCX / Excel), include-citations toggle, audit-trail-in-footer toggle, Bulk Export Builder default scope |
| Data & supersessions | How long to keep superseded regulations visible (30 / 90 / 365 days / forever), include-archived in search toggle, "Show field-level diffs on supersession" toggle |
| Archive | Per-user archived regulations list with un-archive bulk action |

These are **per-user** settings. Org-wide policies (e.g. seat limits, integrations) live on Admin.

---

### 3. Admin — fully reframed as Caro's Ledge platform-ops console (`admin.html`)

This is the biggest semantic change in the bundle.

**Before:** `/admin` was the org-owner's workspace settings — members table, billing, source registry.

**After:** `/admin` is the **Caro's Ledge internal platform-ops console**. Per-org settings (members, billing, workspace details) moved to **Profile** (where they belong; they're owner-managed metadata about *one* org). `/admin` is now an internal-staff-only route that operates on **all 28 customer organizations** and the platform-wide regulation pipeline.

A persistent navy banner at the top of the page makes this clear:

> **Caro's Ledge admin view** — you are looking at platform-wide controls. Per-org settings (members, billing) live on each org owner's Profile.

**Tabs:**

| Tab | Purpose |
|---|---|
| Organizations | Directory of all 28 customer orgs with plan, MRR, health status, owner, last-active. Each row has a "Manage →" link that opens an inline drill-in card with full org editing controls. |
| API & integrations | Platform-wide master catalog of integrations (SAP S/4HANA, CBAM API sandbox + production, Slack, Teams, Webhooks, Oracle TMS, Salesforce Net Zero) and a live event log across all orgs |
| Source registry | Unchanged — 159-source tier-graded registry (covered in `README_PREVIOUS.md`) |
| Staged updates | Review queue for auto-detected and user-submitted regulations awaiting publish |
| Regulatory scan | Crawler health table + global scan rules + keyword watchlist |
| Audit log | Unchanged |

**Organizations directory (`#orgs` panel)**
- 4-stat strip: Organizations (28) / Active members (412) / MRR (€68k) / Health alerts (3)
- Filterable table: All / Enterprise / Bureau / Desk × Healthy / At risk / Suspended
- Row columns: org (avatar + subdomain + industry), owner (name + email), plan (BUREAU / ENTERPRISE / DESK pill), members (used / limit), MRR, health (Healthy / At risk + reason / Suspended + reason), last active, "Manage →"
- Health states surface real risk: e.g. "DHL: 2FA below 80%", "Trafigura: Payment overdue 14d → Suspended"

**Org drill-in card** (opens below the directory when "Manage →" is clicked; navy 3px top accent)
- Audit warning banner: amber "Editing this organization affects the customer's live data. All changes are logged in the audit trail."
- Form: org name, subdomain, plan, seats limit, status (Active / At risk / Suspended / Terminated), MRR override, internal Caro's Ledge-only notes
- Owner block with Reset 2FA / Reset password
- Members snapshot: counts by role + "View all 42 members →"
- "Sign in as owner" (impersonation) button, and Suspend / Terminate destructive actions
- Save / Cancel

**Staged updates (`#staged` panel)**
- 4-stat strip: Staged (14) / Auto-detected (9) / User-submitted (5) / Avg time to publish (3.2h)
- Explainer block: "Items here have been ingested but not yet published to customer dashboards. Each item must be reviewed, classified into the correct sector(s) & jurisdictions, and confidence-scored before it appears in any organization's feed. Approving publishes platform-wide."
- Pending review queue: bulk checkbox column, Detected timestamp, Title / source, Jurisdiction, suggested sector pills, Confidence (color-graded: green ≥80%, amber 60–79%, red <60%), Submitted by (Auto-scan or user avatar + employer), "Review →"
- Review form (opens inline below the queue): editable Title, Effective date, Tier (T1–T7), Jurisdiction, Priority (Low/Medium/High/Critical), multi-select Sectors, AI-generated summary textarea, Source URL
- Footer: "Will publish to N organizations matching X sectors in Y jurisdiction." + Reject / Save draft / Approve & publish

**Regulatory scan (`#scan` panel)**
- 4-stat strip: Sources monitored (159) / Scan frequency (15min avg) / Detections 24h (23) / Failing crawlers (3)
- Crawler health table: Source, Tier, Last successful scan, Detections 30d, Avg latency, Status (Healthy / Slow + reason / Failing + reason)
- Global scan rules form: T1 / T2 / T3-T6 frequency selects, Auto-stage threshold (≥70/80/90% confidence), Keyword watchlist (CBAM, MRV, EU ETS, CORSIA, CARB, SAF, bunker fuel, scope 3, +)

---

### 4. New global UI primitives (`shell-globals.css` + additions to `shell.js`)

Four shared primitives are injected by the shell on every page. Implement them once as React components in `src/components/`.

#### UserMenu (sidebar bottom block)
- Sits at the bottom of the left nav, below the sources section
- Trigger: 30px round avatar (accent) + name + role caption + chevron
- Click opens a popover anchored to the trigger:
  - Avatar + name + employer header
  - Links: Profile / Admin (only if `user.isPlatformAdmin`) / Settings / Theme (light/dark/system) / Help / Sign out
- Collapsed sidebar mode: trigger collapses to just the avatar (chevron + name fade out)
- Popover dismisses on outside click, Esc, or selecting an item

#### AI Assistant
- Floating button bottom-right (oxblood accent disc with sparkline icon)
- Click expands into a 380px-wide panel: header (✦ icon + "Ask Caro" + close), conversation area (assistant message bubbles), input pill, suggestion chips
- Available on every page; the inline `.ai` prompt bar from the previous handoff is the *contextual* version (page-specific scope chips); this floating one is the *global* version (asks across the whole product)
- Same `claude-haiku-4-5` `window.claude.complete()` API hook

#### Toast pattern
- Bottom-center, max 3 stacked, auto-dismiss after 4s
- Variants: default (paper-2 bg), success (low-impact green left rule), warning (high-impact amber left rule), error (critical red left rule)
- 1px hairline only — **no shadow**

#### Modal pattern
- Centered, max-width 560px, backdrop is `rgba(15, 23, 42, 0.5)`
- Header bar: title + ✕ close
- Body padding 22px, footer with right-aligned actions
- Used by: Onboarding (community), Promote-to-public (community), Bulk Export Builder, Approve & publish (admin staged updates)
- Dismisses on backdrop click, Esc, or close button

---

### 5. Smaller fixes and polish

- `shell-globals.css` was extracted from inline styles in individual pages — pull it in alongside `shell.css`
- Several pages (`regulations.html`, `regulation-detail.html`, `market-intel.html`, `research.html`, `operations.html`, `map.html`) received minor copy + spacing tightening; the `*-old.html` siblings are kept *only* for diffing
- Community has alternate layouts saved as `community-v1.html` and `community-v2.html` for reference; `community.html` is the canonical one

---

## Data-model additions for this batch

Extending `src/types/`:

```ts
// users
type UserProfile = {
  id: string;
  name: string;
  pronouns?: string;
  role: string;
  employerId: string;
  email: string;
  bio: string;
  headshotUrl?: string;
  timezone: string;
  sectors: SectorKey[];                  // 40-sector taxonomy — see SECTORS const in profile.html
  jurisdictions: JurisdictionKey[];      // EU | UK | US | IMO | ICAO | CN | JP | SG | IN | BR | ...
  transportModes: ('air' | 'ocean' | 'road' | 'rail' | 'inland-water')[];
  verifierStatus: 'none' | 'pending' | 'active' | 'revoked';
  verifierSince?: string;
  isPlatformAdmin: boolean;              // true only for Caro's Ledge internal staff
};

// settings
type UserSettings = {
  userId: string;
  general: {
    language: string;
    timezone: string;
    notifications: { email: boolean; slack: boolean; digest: 'daily' | 'weekly' | 'off' };
    keyboardShortcuts: boolean;
  };
  dashboard: {
    briefStackOrder: string[];
    aiBarDefaultScope: 'all' | 'my-sectors' | 'my-jurisdictions';
    mastheadDensity: 'comfortable' | 'compact';
    urgencyRuleBudget: boolean;
    showDisputedItems: boolean;
  };
  exports: {
    defaultFormat: 'csv' | 'pdf' | 'docx' | 'xlsx';
    includeCitations: boolean;
    auditTrailFooter: boolean;
    bulkExportDefaultScope: 'visible' | 'all-matching' | 'my-sectors';
  };
  data: {
    supersessionVisibilityDays: 30 | 90 | 365 | -1;   // -1 = forever
    includeArchivedInSearch: boolean;
    showFieldDiffsOnSupersession: boolean;
  };
  archivedRegulationIds: string[];
};

// admin / orgs
type Organization = {
  id: string;
  name: string;
  subdomain: string;
  industry: string;
  hq: string;
  reportingJurisdictions: JurisdictionKey[];
  description: string;
  plan: 'desk' | 'bureau' | 'enterprise';
  seatsLimit: number;
  seatsUsed: number;
  status: 'active' | 'at-risk' | 'suspended' | 'terminated';
  mrrOverride?: number;                  // null = derived from plan
  ownerId: string;
  internalNotes: string;                 // platform-admin-only
  createdAt: string;
  lastActiveAt: string;
  healthFlags: HealthFlag[];             // e.g. { kind: '2fa-below-threshold', threshold: 0.8 }
};

type StagedRegulation = {
  id: string;
  detectedAt: string;
  source: 'auto-scan' | 'user-submitted';
  submittedByUserId?: string;            // when source = 'user-submitted'
  rawTitle: string;
  rawSourceUrl: string;
  jurisdiction: JurisdictionKey;
  suggestedSectors: SectorKey[];
  confidence: number;                    // 0–100
  aiSummary: string;
  status: 'pending' | 'approved' | 'rejected' | 'draft';
  reviewedByUserId?: string;
  reviewedAt?: string;
};

type CrawlerSource = {
  id: string;
  name: string;
  url: string;
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  scanFrequency: 'every-5min' | 'every-15min' | 'every-30min' | 'hourly' | 'every-4h' | 'daily';
  lastSuccessfulScanAt: string;
  detections30d: number;
  avgLatencyMs: number;
  status: 'healthy' | 'slow' | 'failing';
  statusReason?: string;
};

type ScanRules = {
  t1Frequency: CrawlerSource['scanFrequency'];
  t2Frequency: CrawlerSource['scanFrequency'];
  t3to6Frequency: CrawlerSource['scanFrequency'];
  autoStageThreshold: 70 | 80 | 90 | -1;  // -1 = manual review only
  keywordWatchlist: string[];
};
```

---

## Routing & permissions

- `/admin` — requires `user.isPlatformAdmin === true`. Anyone else gets 404 (don't even render a "no access" page; pretend it doesn't exist).
- `/profile` — every user. The Workspace org / Members & roles / Billing tabs are conditionally rendered:
  - Workspace org tab: visible to `org.ownerId === user.id`
  - Members & roles tab: visible to org owners + org admins
  - Billing tab: visible to org owners only
- `/settings` — every user; per-user only.

The previous "owner can do everything from /admin" model is replaced by this split. Platform admins have `/admin` for cross-org work and use `/profile` (with their own org context) for their own org's settings.

---

## Implementation order (suggested for this batch)

1. **Tokens & shell-globals.css** — pull `shell-globals.css` and integrate the global primitives (UserMenu, AI assistant, Toast, Modal) into `src/components/shell/`.
2. **Profile** — start here because it has the 40-sector dataset that other pages will read. Build `/profile` with all 8 tabs; gate the org-related tabs by role.
3. **Settings** — straightforward CRUD on `UserSettings`, 5 sub-tabs.
4. **Admin** — last and largest. Build behind a `isPlatformAdmin` gate.
   - Order: Organizations directory → drill-in → API & integrations → Staged updates (the only one with a non-trivial review form) → Regulatory scan → Audit (already exists; keep).

---

## Rules that must not bend (still)

Repeated from `DESIGN_SYSTEM.md` because they're easy to forget mid-implementation:

- **No box-shadow** anywhere. (Exception: the global UserMenu popover uses one — see `shell-globals.css` — to lift over the sidebar. Don't extend the exception.)
- **No rounded corners** except the 2px on chips and the search pill. Buttons are square.
- **No gradients on surfaces** except the documented two.
- **No emoji in product copy.** Functional iconography (privacy locks, channel globes, search glyphs, ✓ verifier marks, ◯ inactive state) is acceptable in chrome.
- **Hover = paper-2 background step + 1px text underline.** Never lift, never scale.
- **Animation budget:** fades and opacity only, 120–180 ms, `cubic-bezier(0.2, 0, 0.2, 1)`.
- **Urgency rule scarcity:** at most one oxblood 2px rule per screen.

---

## How to ask Claude Code to take this on

Drop this folder into `fsi-app/` (or alongside it) and start your Claude Code session with:

> The folder `design_handoff_2026-04/` contains the latest design spec for Caro's Ledge. Read `design_handoff_2026-04/README.md` first — it lists everything new in this batch. Then `README_PREVIOUS.md` for everything else, and `DESIGN_SYSTEM.md` for the visual rules. The HTML files in `preview/` are reference prototypes — recreate them in this Next.js codebase using existing patterns in `src/components/` and `src/app/`, mapping tokens via `src/app/theme.css`. Start with the implementation order in the new README. Show me a plan before you write code.
