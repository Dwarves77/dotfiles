# Caro's Ledge — Intent vs Reality Audit

**Date:** 2026-04-27
**Branch:** `redesign/full-migration`
**Purpose:** Single source of truth for what Caro's Ledge is built to do versus what it currently does end-to-end. Scopes the work needed to take the app from "today" to a minimum working product.

This document is read-only research. No code was modified to produce it. Where the deployed system could not be inspected from source files alone, runtime queries were used.

---

## Table of contents

1. [Product intent](#1-product-intent)
2. [Design folder feature inventory](#2-design-folder-feature-inventory)
3. [Complete database schema](#3-complete-database-schema)
4. [Complete API route inventory](#4-complete-api-route-inventory)
5. [Component inventory](#5-component-inventory)
6. [State management contracts](#6-state-management-contracts)
7. [Feature matrix](#7-feature-matrix)
8. [Five-paragraph summary](#8-five-paragraph-summary)

---

## 1 — Product intent

### 1.1 What is documented in the repo

The most authoritative product intent is in `fsi-app/.claude/CLAUDE.md`. There is no `README.md` at repo or app level (none found). There is no `ARCHITECTURE.md`, `INGEST.md`, `DATA.md`, `AGENT.md`, or `docs/` directory other than this one.

Two other files contribute to product intent:

- `fsi-app/STATUS.md` — branch-specific migration status, scopes the seven-surface visual migration. Describes design-system rules but not product intent.
- `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md` — describes the intelligence-skill model: source-prioritized regulatory monitoring across the Americas, Europe, Asia. Three operating modes (daily briefings, regulatory alerts, deep dives). Not invoked by application code; used by Claude Code (the CLI) for human-in-the-loop research.

Commit messages add operational direction:

- `01c0e36` — "10-section synopses (2,040 rows, zero API calls)" — the 10-section sector synopsis is the canonical content shape
- `89b4380` — "no duplicates, every item linked to single source, no blank full_briefs"
- `6b82189` — "no API calls on provisional sources — gate in agent route"
- `0f28b51` — "unified agent system prompt — business evaluation framework, cause-and-effect, severity labels, 10-section brief"
- `04f8b22` — "information architecture — type taxonomy, urgency vocabulary, legal disclaimer"

### 1.2 Full contents of CLAUDE.md

```
# Caro's Ledge — Project Status

## What This Is
Sustainability intelligence platform for international freight forwarding.
Not a regulation tracker — a source monitoring system covering 7 intelligence domains.

## Architecture Model
- Layer 1: Sources — Public portals where legislation lives (EUR-Lex, Federal Register, IMO, etc.)
- Layer 2: Intelligence Items — Specific regulations/findings that live INSIDE sources
- The system monitors sources. Sources produce intelligence items. Manual entry is not the model.
- Source trust: 7-tier hierarchy, trust scoring (accuracy 40% / timeliness 20% / reliability 20% / citation 20%)
- Promotion requires ALL criteria met + human review. Demotion triggered by ANY single condition.

## Tech Stack
- Next.js 16 / React 19 / TypeScript / Tailwind v4
- Supabase (PostgreSQL) — schema defined, not yet deployed
- Zustand stores (resourceStore, navigationStore, settingsStore, exportStore, sourceStore)
- lucide-react icons, GSAP available

## Design System
- Light-first (Apple HIG principles from frontend-design skill)
- Body typeface: Plus Jakarta Sans (300-700). Display typeface: Anton, scoped to masthead
  title, .card-head h3, and .brief-section h3 only — see STATUS.md and the design previews
  for the canonical surfaces. Do not use Anton in body copy or in arbitrary section headers.
- Semantic color tokens only — no raw hex in components
- 8pt spacing grid, WCAG AA contrast, 44pt touch targets
- No ambient orbs, no dark-first aesthetic

## Intelligence Domains (primary navigation)
1. Regulatory & Legislative (119 legacy resources live here)
2. Energy & Technology Innovation
3. Regional Operations Intelligence
4. Geopolitical & Market Signals
5. Source Intelligence (Source Health Dashboard)
6. Warehouse & Facility Optimization
7. University & Research Pipeline

## Source Registry
- 73 sources seeded across T1-T6, all 7 domains
- 1 provisional (DEWA Shams Dubai — needs live verification)
- Source mapping: 95/119 legacy resources mapped to sources (80%)
- 24 unmapped = provisional source candidates for discovery pipeline

## API Security Policy
- All API routes require authentication by default. Every route must call requireAuth()
  from src/lib/api/auth.ts before processing. Unauthenticated requests receive 401.
- Rate limiting is enforced on all API routes. 60 requests per minute per authenticated user.

## AGENT ARCHITECTURE
ONE Claude API call per source URL. Not per item. Not per sector.
Claude identifies all items in the source, runs all delta detection, and generates
all 15 sector synopses for all signal items in a single response.

Agent in Claude Console: agent_011CZwC8PTbAfM355bVK8w7G
System prompt: src/lib/agent/system-prompt.ts
API route: POST /api/agent/run

Cost: 1 API call per source URL. 73 sources = maximum 73 API calls per full scan.

DO NOT change this to per-item or per-sector calls.
DO NOT make live Claude API calls at page load or user request.
DO NOT rebuild the agent as a new file or route without reading this section first.
DO NOT create duplicate intelligence items.
DO NOT leave any item without a full_brief.
DO NOT process provisional sources.

The sector breakdown into 15 operationally distinct sectors happens because all 15
sector_contexts records are injected into the user message at runtime.

Permitted live Claude API calls in this codebase:
- /api/ask — user natural language questions, rate limited 10 per workspace per hour
- /api/admin/scan — admin triggered source scan, 4 hour cooldown minimum

Everything else reads from intelligence_summaries in the database.
```

(Session-log sections preserved but elided here for length — they document the build history and are not load-bearing for product intent.)

### 1.3 Distilled product intent

Caro's Ledge is intended to be:

1. **A source-monitoring system, not a regulation tracker.** The architecture distinguishes Layer 1 (sources) from Layer 2 (intelligence items). The agent monitors sources; sources produce items.
2. **A multi-tenant SaaS** with organization-scoped workspaces. Platform data (sources, intelligence items) is shared across all workspaces; per-workspace overrides (priority, archive, notes), settings, and sector profiles are isolated per org.
3. **A sector-aware intelligence product.** 15 freight sectors are first-class. Each item is translated into per-sector operational impact via runtime synopsis generation. Workspaces select which sectors apply to them; the AI assistant and urgency scoring tailor to that profile.
4. **A 7-domain editorial dashboard.** Regulatory, technology, regional operations, geopolitical/market, source health, facility optimisation, research pipeline. Each is a domain tab with its own urgency stat strip and category content.
5. **A peer community layer.** Forums (regional + topical), vendor directory, case studies, peer endorsements. Bidirectional links: a regulation triggers a thread; a thread links back to the regulation. Mediated by 7 verification tiers.
6. **A trust-graded source registry.** 7-tier source hierarchy (T1 = primary legal text → T7 = provisional). Trust scoring computed from accuracy (40%), timeliness (20%), reliability (20%), citation (20%). Discovery pipeline: provisional → reviewed → confirmed.
7. **A briefing-and-export tool for compliance leads.** Weekly briefing, share menu, export builder, slack delivery, branded HTML. Filings owned, supersession history, archive flow.
8. **A light-first editorial newspaper aesthetic.** Plus Jakarta Sans body, Anton masthead, urgency colour palette as severity language. AI prompt bar inline on every surface. Designed to read like an industry briefing, not a SaaS dashboard.

### 1.4 Where intent is unclear

- **Pricing/plans/billing model.** `organizations.plan` allows `free | pro | enterprise`; `profile.html` preview shows `Desk / Bureau / Enterprise` tiers with explicit pricing (€480 / €2,400 / Custom). The two vocabularies don't match. Unclear which is canonical.
- **Verifier model.** `profiles.verification_tier` allows `unverified | linkedin_verified | staff_verified` (per RLS); the `profile.html` preview describes "Verifier credentials" with editorial review board sign-off. Unclear how the verifier badge in the preview maps to the schema.
- **Skill vs. agent runtime.** The SKILL.md file in `.claude/skills/` is a Claude Code skill, not invoked at app runtime. CLAUDE.md describes a "Claude Console agent" with id `agent_011CZwC8PTbAfM355bVK8w7G`, but no app code references that ID — `/api/agent/run` makes a direct Messages API call. Unclear whether the Console agent is a parallel system, a deprecated artefact, or planned future state.
- **The Caro's Ledge editorial team.** Several previews reference `Sarah Chen · EU Desk`, `Marta Olesen`, `Jin-soo Kim`, `Mia Santos`, `Rosa Vega` as content owners. Unclear whether these are placeholder personas or a real internal team that staffs the platform.
- **Admin vs profile boundary.** STATUS.md states "per-org settings (members, billing) live on Profile, not Admin." The admin.html preview reflects this. The profile.html preview implements 8 tabs including Members & Billing. The current `/admin` page implements a 5-tab structure that overlaps. Unclear which slice is canonical post-migration.

---

## 2 — Design folder feature inventory

Source folder: `C:\Users\jason\Downloads\Caro_s Ledge Design System\design_handoff_2026-04\preview\`. 34 HTML files. The `index.html` page documents the canonical taxonomy: Foundations → Patterns → Surfaces → Components. Files marked "old" or "v2" are superseded.

### 2.1 Foundation / token / pattern previews (reference only — not surfaces)

| File | Purpose |
|---|---|
| `index.html` | Design reference catalogue. Lists all surface and pattern previews. |
| `tokens-surfaces.html` | Surface tokens: bg, surface, raised, sunken, AI strip; text/border. |
| `tokens-brand.html` | Brand colours: primary, secondary, gradient. |
| `tokens-priority.html` | Priority palette: Critical/High/Moderate/Low text+bg+border. |
| `tokens-topic-impact.html` | Topic colours and four impact dimensions. |
| `type-scale.html` | Plus Jakarta Sans + Anton type ramp. |
| `spacing-radius-shadow.html` | Radii, shadows, transitions. |
| `cards.html` | Three-card system: cl-card / cl-stat-card / cl-row-card. |
| `badges.html` | Priority pill badges. |
| `gradient-bars.html` | Severity spectrum bars. |
| `ai-bar.html` | AI prompt bar pattern. |
| `patterns.html` | Locked component library — single source of truth for surface composition. |
| `dashboard-compare.html` | Compare doc — side-by-side dashboard variants. |
| `dashboard-v2a.html`, `dashboard-v2b.html` | Superseded dashboard iterations. |
| `regulation-detail-old.html`, `regulation-detail-v2.html`, `regulations-old.html` (etc.) | Superseded surface iterations. |
| `community-v1.html`, `community-v2.html` | Superseded community iterations. |
| `map-old.html`, `market-intel-old.html`, `operations-old.html`, `research-old.html` | Superseded surface iterations. |

### 2.2 Surface previews — current (12 surfaces)

For each, a feature inventory at component granularity. "In scope" means part of the seven-surface migration as scoped in `STATUS.md`. "Future-state" means designed but deferred.

#### 2.2.1 `dashboard-v3.html` — Dashboard / Home (already shipped)

| Feature | Status |
|---|---|
| 3px navy→red gradient hairline above masthead | shipped |
| `.masthead` with `Vol IV · No. N · Day` eyebrow + Anton title + meta | shipped |
| `.hero` 4-up (1.4fr/1fr/1fr/1fr) Critical-wide hero strip with diagonal gradient on Critical, Anton numerals 72-84px, helper-copy line under Critical | shipped |
| Inline AI prompt bar with placeholder + Ask submit + 3 chip suggestions | shipped |
| `This Week` two-column: `Top priority this week — 5 items` brief + `What changed — 3 since last audit` strip | future-state (preview shows new layout; current renders old WeeklyBriefing + WhatChanged components) |
| `Replaced` 5-up small horizontal cards with arrows | future-state |
| Section header (`.sh` Anton 30px + 2px border-bottom) | shipped |
| Per-priority severity badges + side-meta countdowns | shipped |
| Sector synopsis collapse/expand (carried from previous design) | shipped |

#### 2.2.2 `regulations.html` — Regulations list

| Feature | Status |
|---|---|
| Full sidebar nav (10 items) | shipped (via `Sidebar` component) |
| Masthead | shipped |
| AI prompt bar | shipped |
| 4-up urgency stat strip (Critical/High/Moderate/Low) | shipped |
| FilterBar — modes / topics / jurisdictions / priorities / verticals / confidence | shipped |
| SearchBar | shipped |
| SortSelector | shipped |
| `bulk-toggle` + `bulk-bar` (sticky bottom action bar) | future-state |
| 4-column kanban (`.kanban` view) | future-state — explicitly deferred per STATUS |
| 3-column card grid (`.grid` view) | future-state |
| `Tweaks` panel (view switcher) | future-state |
| Timeline view (quarter-grouped) | shipped (TimelineView component exists) |
| Export Builder modal with drag-reorder, segmented format/level controls | shipped (visual) — backend wiring partial |
| Resource cards with priority left-rail accent | shipped |

#### 2.2.3 `regulation-detail.html` — Regulation detail page

| Feature | Status |
|---|---|
| `.reg-hero` strip with mode chips, title, pill-reg, pill-crit, deck text, tag chips, action buttons | future-state — current `/regulations/[slug]` is a stub |
| 4-stat strip — Effective / Penalty rate / Exposure / Lanes affected | future-state |
| 7 tabs — Summary, Exposure, Penalty calculator, Timeline, Full text, Sources, Team notes | future-state |
| AI summary block (lavender-blue accent, ✦ icon, ask-row inline) | future-state |
| Lead-paragraph "Why this matters" block with left-rail accent | future-state |
| Right rail — deadline countdown side-card (critical-tinted), kv metadata list, related-regulation links | future-state |
| Impact bars (rainbow gradient, 10px height, 4-dimension grid) | future-state |
| Horizontal timeline-bar with past/future event dots and ring shadow | future-state |
| Penalty calculator — 2-column input grid + summary result | future-state |
| Sources tab — source-row list with "View source" links | future-state |
| Team notes tab — note rows with avatar, author, when, paragraph body | future-state |
| Sticky right-rail TOC | explicitly deferred per STATUS |
| Verification badge component | explicitly deferred per STATUS |
| Cross-sector headline strip | explicitly deferred per STATUS |
| Disputes panel | explicitly deferred per STATUS |
| Priority Override control | explicitly deferred per STATUS |
| Archive flow | explicitly deferred per STATUS |
| Share/Export split-button menus | explicitly deferred per STATUS |
| 5 additional brief sections (to bring total to 10) | explicitly deferred per STATUS |

#### 2.2.4 `market-intel.html` — Market Intelligence

| Feature | Status |
|---|---|
| Masthead + AI bar | shipped |
| 4-up urgency stat strip — Watch / Elevated / Stable / Informational (Watch tile rail+tint) | shipped |
| 2-tab — Technology Readiness, Price Signals & Trade | shipped |
| Tech category accordion (`.cat`) — icon box, title, description, mode chips, TRL chip, key metrics, cost trajectory paragraph, policy acceleration signals, freight-forwarding-relevance banner | shipped (via `TechnologyTracker`) |
| Right-rail Watch alert card (high-bg + high-bd) | shipped |
| Watchlist row list with priority pills | shipped |
| Owners — content panel with avatars | future-state |
| Price-signals accordion (`.price-cat`) — energy, carbon, critical minerals, trade restrictions, chokepoints | shipped (via `GeopoliticalSignals`) |
| Per-price-row "Why this matters to your business" inline callout | shipped |
| Per-price-row source-of-truth link with update cadence | shipped |
| Methodology panel | future-state |

#### 2.2.5 `research.html` — Research Pipeline

| Feature | Status |
|---|---|
| Masthead + AI bar | shipped |
| 4-up urgency stat strip — Draft / Active review / Published / Archived | shipped |
| 2-tab — Pipeline, Source coverage | shipped |
| Filter bar — Stage + Region groupings + search | shipped (FilterBar) |
| Pipeline expand-card per item — title, status pill, partner-flagged/monitoring pill, region pill, tag pill, regulator + first-seen + owner meta | shipped (via `ResearchPipeline` — hardcoded) |
| Synopsis (draft) text inside expanded card | shipped |
| Per-item timeline event list inside expanded card | shipped |
| Per-item right-column meta-card with stage/source feed/researcher/validator/citations/confidence | shipped |
| Per-item right-column citations card with status dots + add citation button | future-state |
| Coverage matrix table (mode × region with full/partial/none dots) | future-state |
| Source coverage expand-card list with type/cadence/latency | future-state |
| Right-rail "Awaiting your review" queue | future-state |
| Right-rail by-owner counts | future-state |
| Right-rail throughput stats | future-state |
| Right-rail SLA card | future-state |
| Right-rail source-health rollup with per-source OK/Manual badges | shipped (SourceHealthDashboard partial) |
| Researcher avatars side-card | future-state |
| Backlog priorities side-card | future-state |
| Academic partner rows in Source coverage tab | future-state — preview shows only regulator feeds; STATUS asks for academic partners (MIT/Tyndall/Chalmers/ICCT/SFC) on this tab |

#### 2.2.6 `operations.html` — Operations

| Feature | Status |
|---|---|
| Masthead + AI bar | shipped |
| 4-up urgency stat strip — Critical / High / Moderate / Low | shipped |
| Legend strip below stats | future-state |
| 2-tab — By Jurisdiction, Facility Data | shipped |
| Region pills (All / Americas / Europe / APAC / Middle East / Africa) | shipped |
| Jurisdiction expand-card per region — title, priority pill, region group, sub-cards (Solar/Electricity/Labor/EV/Green Building) with `.data-chip` per metric | shipped (via `RegionalIntelligence` — hardcoded) |
| Active regulations bullet list inside expanded jurisdiction | shipped |
| Open questions banner (high-bg + high left-rail) inside expanded jurisdiction | future-state |
| Right-rail Coverage panel | future-state |
| Right-rail Owners panel with avatars | future-state |
| Right-rail Methodology panel | future-state |
| Right-rail Update cadence panel | future-state |
| Facility Data tab — `.tariff` accordion per category (Industrial Electricity / Rooftop Solar / BESS / Labor / Green Building) | shipped (via `FacilityOptimization` — hardcoded) |
| Per-tariff row table — country, value, update frequency, source link | shipped |
| Right-rail Tools & data sources panel | future-state |

#### 2.2.7 `settings.html` — Settings

| Feature | Status |
|---|---|
| Masthead | shipped |
| 5-tab — General · Dashboard · Exports · Data & supersessions · Archive | future-state — current `/settings` renders Dashboard with `page="settings"`, only DataSummary + SupersessionHistory + ArchiveViewer mounted |
| Notifications card with 6 toggle rows (Critical regulatory updates, Daily morning briefing, Weekly market intel digest, Filing reminders, Community replies, Marketing) | future-state |
| Briefing schedule card with 4-field form (day, time, format, market panel) | future-state |
| Display & appearance card with 4 toggles (reduce motion, compact density, default jurisdiction filter, default sector filter) | future-state |
| Security card — 2FA, Session expiry, SSO required + active-sessions buttons | future-state |
| Saved searches side-card | future-state |
| Help side-card with link to Profile | future-state |
| Dashboard cards toggle list (10 cards, drag-to-reorder grab handle, 6 default-on / 4 off) | shipped (DashboardSettings — partial) |
| Default sort/view/jurisdiction/confidence form | shipped (settingsStore) |
| Exports tab — format segmented (HTML / PDF / Slack / Plain), detail-level segmented, branding header, footer disclaimer, 3 toggle rows (source links / verifier badges / anonymise authorship) | shipped (visual only — limited persistence) |
| Slack delivery card with 3 toggles (send to slack, auto-thread, @channel on critical) | future-state |
| Data summary card with 6 stat rows | shipped (DataSummary) |
| Supersession history card with filter chips and supersession-row table | shipped (SupersessionHistory) |
| Portable export buttons (Request portable export, Download as JSON) | future-state |
| Archive list with filter chips (Regulations / Filings / Briefs / Saved searches), arch-row entries, restore button, empty-archive button | shipped (ArchiveViewer — partial) |

#### 2.2.8 `profile.html` — Profile

| Feature | Status |
|---|---|
| Masthead + 4-up small stat strip | future-state |
| 8-tab — Personal · Organization · Members & roles · Billing & plan · Sector profile · Jurisdictions · Verifier badge · Activity | future-state — current page renders only Sector profile |
| Personal profile card — photo + change/remove buttons, 9-field form (name/pronouns/title/team/email/locale/timezone/theme/bio) | future-state |
| At-a-glance side-card (joined / posts / briefs / owns / watching / verifier) | future-state |
| Quick links side-card | future-state |
| Owner banner — "You are Owner of TransAtlantic Cargo Holdings" | future-state |
| Organization tab — workspace stat strip (Workspace / Seats / API calls / Storage), workspace details form (name/subdomain/industry/HQ/jurisdictions/internal description), org-creator side-card, transfer-ownership side-card, danger-zone delete-workspace side-card | future-state |
| Members & roles tab — members table (avatar, role, last active, filings, 2FA, edit), roles-explanation grid (Owner/Admin/Editor/Viewer cards) | future-state |
| **Add member side panel form** — slides from right, full-width on mobile, org-admin scope | future-state — net-new on top of preview per STATUS |
| Billing & plan tab — 3-tier plan selector (Desk €480 / Bureau €2,400 / Enterprise Custom), payment-method card with VISA chip, invoices table | future-state |
| Sector profile tab — section-headed multi-select (Highlighted niches with ★, All sectors), 40 sectors, count badge | shipped (current state) |
| Jurisdictions tab — jurisdiction chips, modes chips, save | future-state |
| Verifier badge tab — verifier-state card with vs-i, credentials form (4 fields), active verifiers side-card | future-state |
| Activity tab — activity row list with when/what/meta | future-state |

#### 2.2.9 `admin.html` — Admin

| Feature | Status |
|---|---|
| Masthead | shipped |
| Caro's Ledge admin-view banner | future-state |
| 6-tab — Organizations · API & integrations · Source registry · Staged updates · Regulatory scan · Audit log | future-state — current `/admin` has `users / orgs / updates / scan / sources` (5 tabs, partly different) |
| Organizations tab — orgs table, plan distribution, per-org drill into Members | future-state |
| API & integrations tab | future-state |
| Source registry — `.reg-intro` headline + actions, `.tier-key` 7-tier explainer, `.tier-grid` per-tier health cards (count, last poll, OK/stale/err counts, score), `.subtabs` (Registry / Health / Provisional / Conflicts) | shipped (SourceHealthDashboard) |
| `.reg-filter` strip with search + tier/status/domain pills | shipped |
| `.src` source row with status dot, tier badge, name, jurisdiction, domain pills, score block, expandable body with metrics + meta-row + actions | shipped |
| `.prov` provisional source card with high left-rail accent + approve/reject/defer actions | shipped |
| `.conf` conflict card with critical left-rail, two-side claim grid, resolve actions | shipped |
| Staged updates tab — list of pending updates with approve/reject buttons | shipped |
| Regulatory scan tab — manual trigger UI for `/api/admin/scan` | shipped (limited) |
| Audit log tab — `source_trust_events` rendering | future-state |

#### 2.2.10 `map.html` — Map

| Feature | Status |
|---|---|
| Masthead + AI bar | shipped |
| Map style toggle (Real / Abstract editorial SVG) | future-state — current MapView is real-only |
| Real map host with Leaflet markers, jurisdictional pins, sub-jurisdictional centroids, clustering | shipped |
| Mode filter (All / Ocean / Air / Road / Facility) | future-state |
| Jurisdiction-row list right-rail with priority dots and counts | future-state |

#### 2.2.11 `community.html` — Community

The most complex preview at 88KB. Two-pane layout: community-specific sidebar (Starred / Private groups / Public sections / Direct messages / Channels) on the left, conversation pane on the right.

| Feature | Status |
|---|---|
| Community-specific sidebar with starred drag-reorder, private groups, public sections, search, onboard button | shipped (limited — current CommunityHub uses tab-based nav, not sidebar) |
| Section list with thread rows, vendor rows, case-study cards | shipped |
| Group head strip showing icon, name, meta, action buttons (private vs public lock state) | future-state |
| Promote-to-public modal — lock-state, body, footer with primary action | future-state |
| 3-step onboarding scrim — choose path (LinkedIn vs email), LinkedIn import preview + review form, recommended groups grid | future-state |
| New thread form | shipped |
| New case study form | shipped |
| Vendor directory grid with peer-validated badges, contact-detail gating | shipped (partial) |
| Case study cards with peer-validation count, cost reference, measurable outcome | shipped |
| Per-vendor endorsement flow | future-state |
| Per-case-study endorsement flow | future-state |
| Notification bell + delivery view | future-state |

### 2.3 Feature count summary

| Surface | Total features | Shipped | Future-state |
|---|---|---|---|
| Dashboard (home) | 9 | 7 | 2 |
| Regulations list | 14 | 10 | 4 |
| Regulation detail | 19 | 0 | 19 |
| Market Intel | 12 | 9 | 3 |
| Research | 16 | 7 | 9 |
| Operations | 15 | 7 | 8 |
| Settings | 17 | 5 | 12 |
| Profile | 16 | 1 | 15 |
| Admin | 15 | 9 | 6 |
| Map | 5 | 1 | 4 |
| Community | 12 | 5 | 7 |
| **Total** | **150** | **61** | **89** |

(Numbers are coarse — each feature row is a distinct UI element or tab, not a sub-element. Roughly 41% shipped, 59% designed-but-not-built.)

---

## 3 — Complete database schema

38 tables in the `public` schema. Verified via runtime query 2026-04-27. Grouped by purpose.

Notation: ✓ read by UI, ✓ written by UI/API, ✗ neither.

### 3.1 Intelligence content (8 tables)

Source: migrations 001 (resources family — legacy), 004 (intelligence_items family), 007_full_brief, 009.

#### 3.1.1 `intelligence_items`

**Rows:** 159. **Read:** ✓ (Dashboard via `get_workspace_intelligence` RPC; `/api/ask`; `/api/admin/scan`; `/api/staged-updates`; `/api/agent/run`). **Written:** ✓ (`/api/agent/run`, `/api/staged-updates` approve flow).

Columns (full): `id UUID PK`, `legacy_id TEXT UNIQUE`, `title TEXT NN`, `summary TEXT`, `what_is_it TEXT`, `why_matters TEXT`, `key_data TEXT[]`, `operational_impact TEXT`, `open_questions TEXT[]`, `tags TEXT[]`, `domain INT 1-7 NN`, `category TEXT`, `item_type TEXT NN CHECK regulation|directive|standard|guidance|technology|market_signal|regional_data|research_finding|innovation|framework|tool|initiative`, `source_id UUID FK→sources(id)`, `source_url TEXT`, `jurisdictions TEXT[]`, `transport_modes TEXT[]`, `verticals TEXT[]`, `status TEXT CHECK proposed|adopted|in_force|monitoring|superseded|repealed|expired`, `severity TEXT critical|high|medium|low`, `confidence TEXT confirmed|unconfirmed`, `priority TEXT CRITICAL|HIGH|MODERATE|LOW`, `reasoning TEXT`, `entry_into_force DATE`, `compliance_deadline DATE`, `next_review_date DATE`, `added_date DATE`, `last_verified TIMESTAMPTZ`, `is_archived BOOLEAN`, `archive_reason TEXT`, `archive_note TEXT`, `archived_date DATE`, `replaced_by UUID FK self`, `version_history JSONB`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, `full_brief TEXT` (added in 007_full_brief), `linked_forum_thread_ids UUID[]`, `linked_vendor_ids UUID[]`, `linked_case_study_ids UUID[]`, `linked_regulation_ids UUID[]`, `region_tags TEXT[]`, `topic_tags TEXT[]`, `vertical_tags TEXT[]` (added in 007_community_layer).

FKs: `source_id → sources(id) ON DELETE SET NULL`; `replaced_by → intelligence_items(id)`. 11 indexes.

RLS: SELECT public, INSERT/UPDATE/DELETE service_role only.

#### 3.1.2 `intelligence_summaries`

**Rows:** 2,325. **Read:** ✓ (`fetchDashboardData` → home + regulations pages — settings/research drop them). **Written:** ✓ (`/api/agent/run`, several seed scripts).

Columns: `id UUID PK`, `item_id UUID` (FK inferred to intelligence_items), `sector TEXT NN`, `summary TEXT NN`, `urgency_score NUMERIC`, `generated_at TIMESTAMPTZ NN`, `model_version TEXT`. Documented in `009_capture_undeclared_tables.sql` (capture-only — created via dashboard SQL editor pre-009).

RLS: not visible from migration files. Verify in dashboard.

#### 3.1.3 `intelligence_changes`

**Rows:** 0. **Read:** ✓ (`fetchDashboardData`, in-app via `useResourceStore.intelligenceChanges`). **Written:** ✓ (`/api/agent/run`).

Columns: `id UUID PK`, `item_id UUID`, `detected_at TIMESTAMPTZ NN`, `change_type TEXT NN`, `change_severity TEXT NN`, `previous_value JSONB`, `new_value JSONB`, `change_summary TEXT`, `raw_diff TEXT`. Documented in `009_capture_undeclared_tables.sql`.

#### 3.1.4 `item_changelog` (new schema)

**Rows:** 9. **Read:** ✗. **Written:** ✗ at runtime (declared in 004; legacy `changelog` table is read instead).

Columns: `id UUID PK`, `item_id UUID FK NN`, `change_date DATE`, `change_type TEXT NEW|UPDATED|STATUS_CHANGE|SEVERITY_CHANGE|ARCHIVED`, `field TEXT NN`, `previous_value TEXT`, `new_value TEXT`, `impact TEXT`, `impact_level TEXT CRITICAL|HIGH|MODERATE|LOW`, `detected_by TEXT`, `created_at TIMESTAMPTZ`.

#### 3.1.5 `item_cross_references`

**Rows:** 49. **Read:** ✗ (legacy `cross_references` is read). **Written:** ✗ at runtime.

Columns: `id UUID PK`, `source_item_id UUID FK NN`, `target_item_id UUID FK NN`, `relationship TEXT related|supersedes|implements|conflicts|amends|depends_on`. UNIQUE pair.

#### 3.1.6 `item_disputes`

**Rows:** 7. **Read:** ✗ (legacy `disputes` is read). **Written:** ✗ at runtime.

Columns: `id UUID PK`, `item_id UUID FK NN`, `is_active BOOLEAN`, `note TEXT NN`, `disputing_sources JSONB`, `created_at`, `resolved_at`.

#### 3.1.7 `item_supersessions`

**Rows:** 0. **Read:** ✗. **Written:** ✗ at runtime.

Columns: `id UUID PK`, `old_item_id UUID FK`, `new_item_id UUID FK`, `supersession_date DATE NN`, `severity TEXT major|minor|replacement`, `note TEXT`, `created_at`.

#### 3.1.8 `item_timelines`

**Rows:** 110. **Read:** ✗ (legacy `timelines` is read by `fetchWorkspaceResources` but matched on `legacy_id` not via this table). **Written:** ✗ at runtime.

Columns: `id UUID PK`, `item_id UUID FK NN`, `milestone_date DATE NN`, `label TEXT NN`, `is_completed BOOLEAN`, `sort_order INT`, `created_at`.

### 3.2 Source / trust framework (10 tables)

Source: migration 004, 009.

#### 3.2.1 `sources`

**Rows:** 159 (note: identical count to intelligence_items is coincidence). **Read:** ✓ (Dashboard, `/api/sources`, `/api/ask`, `/api/agent/run`, `/api/staged-updates`, `/api/admin/scan`, `/api/data/scan-all`, `/api/data/fetch-source`, `/api/worker/check-sources`). **Written:** ✓ (`/api/agent/run` updates `last_scanned`; worker updates `last_checked` etc.; `/api/staged-updates` insert on approve `new_source`).

40+ columns including identity (name/url/description/tier/tier_at_creation), classification (intelligence_types, domains, jurisdictions, transport_modes), monitoring (update_frequency, last_checked, status), access (paywalled, access_method api|rss|scrape|gazette|manual, api_endpoint, rss_feed_url), trust metrics (confirmation_count, conflict_count, accuracy_rate, accessibility_rate, independent_citers, total_citations, highest_citing_tier, self_citation_count), trust scores (overall + 4 components), tier_history JSONB, plus topic_tags/vertical_tags/reliability_score from 007.

Triggers: `update_updated_at`, `recompute_source_accuracy` (recomputes accuracy_rate and accessibility_rate on confirmation/conflict/check count change).

RLS: SELECT public, INSERT/UPDATE/DELETE service_role only.

#### 3.2.2 `source_citations`

**Rows:** 0. **Read:** ✗. **Written:** ✗ at runtime.

Columns: `id UUID PK`, `citing_source_id UUID FK`, `cited_source_id UUID FK`, `context TEXT`, `detected_at`. UNIQUE pair.

#### 3.2.3 `source_conflicts`

**Rows:** 0. **Read:** ✓ via `fetchOpenConflicts()` (Dashboard / Research / Admin SourceHealthDashboard; surfaced empty). **Written:** ✗ at runtime (no writer).

Columns: `id UUID PK`, `item_id UUID FK`, `source_a_id`, `source_b_id` (both UUID FK), `source_a_tier INT`, `source_b_tier INT`, `source_a_claim TEXT`, `source_b_claim TEXT`, `field_in_dispute TEXT`, `status TEXT open|resolved|inconclusive`, `resolution TEXT`, `resolution_note TEXT`, `resolved_by_source_id UUID`, `resolved_by_human TEXT`, `opened_at`, `resolved_at`.

#### 3.2.4 `source_trust_events`

**Rows:** 24. **Read:** ✗. **Written:** ✓ (`/api/worker/check-sources` inserts an `accessibility_check` event per scan).

Columns: `id UUID PK`, `source_id UUID FK NN`, `event_type TEXT CHECK confirmation|conflict_opened|conflict_resolved|accessibility_check|citation_received|tier_promotion|tier_demotion|manual_review|stale_flag|paywall_change|self_citation|discovery`, `details JSONB`, `created_by TEXT system|worker|human`, `reviewer_id TEXT`, `created_at`. Immutable — no UPDATE/DELETE policy.

#### 3.2.5 `monitoring_queue`

**Rows:** 0. **Read:** ✗. **Written:** ✓ (`/api/worker/check-sources` inserts a no_change/inaccessible record per scan).

Columns: `id UUID PK`, `source_id UUID FK`, `item_id UUID FK`, `scheduled_check TIMESTAMPTZ NN`, `priority TEXT urgent|high|normal|low`, `last_result TEXT`, `change_detected BOOLEAN`, `checked_at TIMESTAMPTZ`, `error_message TEXT`, `created_at`. (Note: row count is 0 despite source_trust_events having 24 — the worker has been called 24 times against existing sources but didn't insert into the queue table consistently, OR the queue is wiped after checks.)

#### 3.2.6 `provisional_sources`

**Rows:** 12. **Read:** ✓ via `fetchProvisionalSources` (SourceHealthDashboard provisional tab). **Written:** ✓ (`/api/admin/scan` upserts during agent scan).

Columns: `id UUID PK`, `name TEXT NN`, `url TEXT NN UNIQUE`, `description TEXT`, `domain INT`, `discovered_via TEXT skill_recommendation|citation_detection|worker_search|manual_add`, `cited_by_source_id UUID FK`, `cited_by_source_tier INT`, `citation_count INT`, `independent_citers INT`, `citing_source_ids UUID[]`, `highest_citing_tier INT`, `provisional_tier INT`, `recommended_tier INT`, `accessibility_verified BOOLEAN`, `publishes_structured_content BOOLEAN`, `entity_identified BOOLEAN`, `status TEXT pending_review|confirmed|rejected|needs_more_data`, `reviewer_notes TEXT`, `promoted_to_source_id UUID FK`, `created_at`, `reviewed_at`.

#### 3.2.7 `staged_updates`

**Rows:** 24. **Read:** ✓ (Admin browser-side load + `/api/staged-updates` GET). **Written:** ✓ (`/api/admin/scan` inserts; `/api/staged-updates` POST updates status; `/api/staged-updates` approve flow inserts/updates `intelligence_items` and `sources`).

Columns: `id UUID PK`, `item_id UUID FK`, `source_id UUID FK`, `update_type TEXT new_item|update_item|status_change|new_source|source_conflict|archive_item`, `proposed_changes JSONB`, `reason TEXT`, `source_url TEXT`, `confidence TEXT HIGH|MEDIUM|LOW`, `status TEXT pending|approved|rejected`, `reviewed_by TEXT`, `reviewed_at`, `batch_id TEXT`, `created_at`. Plus `full_brief TEXT` (added in 007_full_brief).

#### 3.2.8 `sector_contexts`

**Rows:** 15. **Read:** ✓ (`/api/agent/run` injects all 15 records into Claude user message; Dashboard `setSectorDisplayNames`). **Written:** ✗ at runtime (seeded only).

Columns: `sector TEXT PK`, `display_name TEXT NN`, `transport_modes TEXT[] NN`, `cargo_types TEXT[] NN`, `compliance_roles TEXT[] NN`, `synopsis_prompt TEXT NN`, `urgency_weights JSONB NN`. Documented in `009_capture_undeclared_tables.sql`.

#### 3.2.9 `source_health_summary` (VIEW)

**Read:** ✗. **Written:** N/A (view).

Aggregates per-tier-per-status source counts and avg trust score from `sources`. Defined in 004.

#### 3.2.10 `provisional_sources_review` and `open_conflicts` (VIEWS)

**Read:** ✗. **Written:** N/A. Both join helpful display fields onto provisional_sources / source_conflicts respectively. Currently unused — UI reads the underlying tables directly.

### 3.3 Legacy schema (7 tables)

Source: migration 001. Retained for backward compatibility per migration 004 comment.

#### 3.3.1 `resources`

**Rows:** 123. **Read:** ✓ (`fetchWorkspaceResources` falls back to `resources` if RPC fails or returns empty; `fetchArchived`). **Written:** ✗ at runtime in current code (seed scripts wrote it; one-time content rewrites via `rewrite-*.mjs`).

Columns: `id TEXT PK` (e.g. "o1", "a3"), 30+ columns paralleling intelligence_items. Plus `full_brief TEXT` from 007_full_brief.

RLS: SELECT public.

#### 3.3.2 `briefings`

**Rows:** 0. **Read:** ✗. **Written:** ✗.

Columns: `id SERIAL PK`, `week_date DATE NN`, `title`, `summary`, `content JSONB`, `format TEXT`, `created_at`. Plus `org_id UUID FK` (from 006), `source_count INT`, `item_count INT`, `domains_covered INT[]` (from 004).

This is the table intended to store generated weekly briefings; it has never been written to.

#### 3.3.3 `changelog`

**Rows:** 9. **Read:** ✓ via `fetchChangelog` (Home / Regulations Dashboard). **Written:** ✗ at runtime.

Columns: `id SERIAL PK`, `resource_id TEXT FK NN`, `date DATE`, `type TEXT NEW|UPDATED`, `fields TEXT[]`, `prev_value TEXT`, `now_value TEXT`, `impact TEXT`, `created_at`.

#### 3.3.4 `cross_references`

**Rows:** 49. **Read:** ✓ via `fetchXrefPairs`. **Written:** ✗ at runtime.

Columns: `id SERIAL PK`, `source_id TEXT FK NN`, `target_id TEXT FK NN`, `relationship TEXT`. UNIQUE pair.

#### 3.3.5 `disputes`

**Rows:** 7. **Read:** ✓ via `fetchDisputes`. **Written:** ✗ at runtime.

Columns: `id SERIAL PK`, `resource_id TEXT FK NN UNIQUE`, `active BOOLEAN`, `note TEXT NN`, `sources JSONB`, `created_at`, `updated_at`.

#### 3.3.6 `supersessions`

**Rows:** 5. **Read:** ✓ via `fetchSupersessions`. **Written:** ✗ at runtime.

Columns: `id SERIAL PK`, `old_id TEXT NN`, `old_title TEXT NN`, `old_url TEXT`, `new_id TEXT NN`, `new_title TEXT NN`, `severity TEXT`, `date TEXT NN`, `note TEXT`, `timeline JSONB`, `created_at`.

#### 3.3.7 `timelines`

**Rows:** 110. **Read:** ✓ via `fetchResources` and `fetchWorkspaceResources` (joined on `resource_id` matching `legacy_id`). **Written:** ✗ at runtime.

Columns: `id SERIAL PK`, `resource_id TEXT FK NN`, `date TEXT NN`, `label TEXT NN`, `status TEXT`, `sort_order INT`. UNIQUE (resource_id, date, label).

### 3.4 Multi-tenant (5 tables)

Source: migration 006, 007 (profiles extension), 008.

#### 3.4.1 `organizations`

**Rows:** 1. **Read:** ✓ (AdminDashboard browser). **Written:** ✓ (service-role only via RLS).

Columns: `id UUID PK`, `name TEXT NN`, `slug TEXT UNIQUE NN`, `plan TEXT free|pro|enterprise`, `settings JSONB`, `created_at`, `updated_at`.

RLS: SELECT to org members, INSERT service_role, UPDATE owner/admin.

#### 3.4.2 `org_memberships`

**Rows:** 1. **Read:** ✓ (AuthProvider on mount; AdminDashboard; `/api/admin/users` GET). **Written:** ✓ (AdminDashboard add member; `/api/admin/users` POST).

Columns: `id UUID PK`, `org_id UUID FK NN`, `user_id UUID NN`, `role TEXT owner|admin|member|viewer`, `created_at`. UNIQUE (org_id, user_id).

RLS: members can read; owner/admin can mutate.

#### 3.4.3 `profiles`

**Rows:** 1. **Read:** ✓ (community page joins on author_id; AuthProvider). **Written:** ✓ (auto-insert via `handle_new_auth_user` trigger from migration 008).

Columns: `id UUID PK`, `email TEXT UNIQUE`, `display_name TEXT`, `role TEXT`, `settings JSONB`, plus 15 community fields from 007 (full_name, headline, bio, avatar_url, organization, job_title, linkedin_url, linkedin_sub, linkedin_verified, linkedin_identity_verified, linkedin_workplace_verified, linkedin_verification_checked_at, verification_tier, affiliation_type, region, topic_interests, membership_tier, contribution_score, notification_preferences, last_active_at), plus `is_platform_admin BOOLEAN` from 008.

RLS: row-owner SELECT (`profiles_select_own` from 008).

#### 3.4.4 `workspace_item_overrides`

**Rows:** 0. **Read:** ✓ via RPC `get_workspace_intelligence` (joins to intelligence_items). **Written:** ✓ — declared, but no current UI write path actually persists overrides; resourceStore mutations write to in-memory Map only and never POST to Supabase.

Columns: `id UUID PK`, `org_id UUID FK NN`, `item_id UUID FK NN`, `priority_override TEXT`, `is_archived BOOLEAN`, `archive_reason`, `archive_note`, `archived_at`, `notes TEXT`, `workspace_tags TEXT[]`, `created_at`, `updated_at`. UNIQUE (org_id, item_id).

RLS: members can read/write own org's overrides.

#### 3.4.5 `workspace_settings`

**Rows:** 1. **Read:** ✓ (settingsStore.loadFromWorkspace; WorkspaceProfile mount). **Written:** ✓ (settingsStore debounced save; WorkspaceProfile save sectors).

Columns: `id UUID PK`, `org_id UUID FK NN UNIQUE`, `sector_profile TEXT[]`, `jurisdiction_weights JSONB`, `default_filters JSONB`, `alert_config JSONB`, `home_sections JSONB`, `default_export_format TEXT html|slack`, `created_at`, `updated_at`.

RLS: members can read; owner/admin can write.

### 3.5 Community (13 tables)

Source: migration 007. 17 forum sections + 38 taxonomy nodes seeded; minimal organic content.

| Table | Rows | Read by UI | Written by UI |
|---|---|---|---|
| `taxonomy_nodes` | 38 | ✗ | ✗ |
| `forum_sections` | 17 | ✓ (community page) | ✗ |
| `forum_threads` | 0 | ✓ (community page) | ✓ (CommunityHub new-thread form) |
| `forum_replies` | 0 | ✗ | ✗ |
| `vendors` | 0 | ✗ (CommunityHub renders empty) | ✓ (CommunityHub new-vendor form) |
| `vendor_regulations` | 0 | ✗ | ✗ |
| `vendor_technologies` | 0 | ✗ | ✗ |
| `vendor_endorsements` | 0 | ✗ | ✗ |
| `case_studies` | 6 | ✓ (community page) | ✓ (CommunityHub new-case-study form) |
| `case_study_endorsements` | 0 | ✗ | ✗ |
| `notification_subscriptions` | 0 | ✗ | ✗ (notification trigger reads) |
| `notification_events` | 0 | ✗ | ✓ (`/api/notifications/trigger` insert) |
| `notification_deliveries` | 0 | ✗ | ✓ (`/api/notifications/trigger` insert) |

Triggers (declared in 007):

- `reply_count_trigger` — auto-update `forum_threads.reply_count` on reply insert/delete
- `section_thread_count_trigger` — auto-update `forum_sections.thread_count`
- `vendor_endorsement_count_trigger` — auto-update `vendors.peer_endorsement_count`
- `case_study_validation_count_trigger` — auto-update `case_studies.peer_validation_count`, auto-promote to `peer_validated` when count ≥ 2

RLS: substantial verification-tier gating — threads visible to `member|contributor|verified|premium`; thread/reply inserts require `verification_tier != 'unverified'`; vendor/case-study endorsements require `linkedin_verified | staff_verified`. Notifications scoped to user_id.

### 3.6 Cross-cutting RPCs and triggers

**Functions:**

- `update_updated_at()` — generic timestamp trigger
- `recompute_source_accuracy()` — sources trigger that recomputes accuracy_rate and accessibility_rate
- `user_belongs_to_org(check_org_id UUID) → BOOLEAN` — used by RLS policies
- `get_workspace_intelligence(p_org_id UUID) RETURNS TABLE(...)` — workspace-scoped intelligence read with override merge
- `update_thread_reply_count()`, `update_section_thread_count()`, `update_vendor_endorsement_count()`, `update_case_study_validation_count()` — community count maintenance
- `handle_new_auth_user()` — trigger on `auth.users` INSERT, auto-creates profile

**Views:** `source_health_summary`, `open_conflicts`, `provisional_sources_review` (all unused by UI).

### 3.7 Schema findings summary

- **Duplicate-storage:** legacy `changelog/disputes/cross_references/supersessions/timelines` (110 + 49 + 9 + 7 + 5 = 180 rows) and their `item_*` equivalents (110 + 49 + 9 + 7 + 0 = 175 rows). The legacy versions are read by the UI; the `item_*` versions are written by no current code path. Migration to consolidate is overdue.
- **Briefings table is unused.** 0 rows. Designed to store weekly briefings.
- **Source health views are unused.** Three views declared, none read.
- **`item_supersessions` has 0 rows** despite legacy `supersessions` having 5 — supersessions never migrated.
- **`monitoring_queue` is empty** despite 24 `source_trust_events` — worker bypasses queue.
- **Community schema is mature, traffic is zero.** 13 community tables fully RLS-policy'd, 4 triggers, but only 6 case studies and zero forum activity.
- **Notifications fully schema'd, never delivered.** 3 tables, complete event/delivery flow, all empty.
- **40 sectors in code, 15 in DB.** `ALL_SECTORS` constant has 40 freight sectors; `sector_contexts` table has 15. The synopsis pipeline only generates summaries for 15.

---

## 4 — Complete API route inventory

10 routes under `src/app/api/**/route.ts`.

### 4.1 `/api/agent/run` — POST

**Auth:** Supabase JWT (requireAuth). Provisional-source gate. 1-hour cooldown per source URL.

**Reads:** `sources` (status check), `sector_contexts` (all 15), `intelligence_items` (existing items for delta detection).

**Writes:** `intelligence_items` (insert if new title, update updated_at if existing), `intelligence_changes` (insert per item processed), `intelligence_summaries` (delete-then-insert all 15 sector synopses per signal item), `sources` (update last_scanned).

**Claude API:** YES. One call to `/v1/messages` with model `claude-sonnet-4-6`, max_tokens 16000. System prompt = `SYSTEM_PROMPT` from `src/lib/agent/system-prompt.ts`. User message = source URL + scraped HTML (max 80,000 chars) + existing items + 15 sector_contexts. Expects JSON output with `items: [...]` array.

**Called from:** Not called from any UI component. Triggered manually by admin (likely via curl or dashboard button planned but not present in AdminDashboard component).

**Status:** live, end-to-end functional (per CLAUDE.md session log "10-section synopses 2,040 rows"). Output: 2,325 rows in intelligence_summaries.

### 4.2 `/api/ask` — POST

**Auth:** Supabase JWT + rate limit (60/min/user; CLAUDE.md says 10/hr/workspace but that limit is not in the code).

**Reads:** `intelligence_items` (top 30 active by priority), `sources` (top 20 active by tier).

**Writes:** none.

**Claude API:** YES. `claude-sonnet-4-6`, max_tokens 1500. System prompt built dynamically with workspace sectors/modes/jurisdictions. Reads new schema only — does NOT touch legacy resources.

**Called from:** `src/components/AskAssistant.tsx` (browser-side fetch on user submit). `AskAssistant` listens for `open-ask-assistant` events from `AiPromptBar`.

**Status:** live, functional. Limitation: doesn't JOIN sources to items, so source provenance is per-source-list not per-item.

### 4.3 `/api/admin/scan` — POST

**Auth:** Supabase JWT + rate limit. CLAUDE.md says 4-hour cooldown but not enforced in code.

**Reads:** `intelligence_items` (existing titles for dedupe), `staged_updates` (pending+approved titles).

**Writes:** `staged_updates` (insert new_item proposals, max 10 per scan), `provisional_sources` (upsert new source candidates, max 5 per scan).

**Claude API:** YES. `claude-sonnet-4-6`, max_tokens 3000. (Code comment says "Haiku for scanning" but model is sonnet — possibly a stale comment.) Returns JSON with `regulations[]` and `new_sources[]`.

**Called from:** AdminDashboard regulatory-scan tab (via UI button — implementation visible in admin component).

**Status:** live, has produced 24 staged updates and 12 provisional sources.

### 4.4 `/api/staged-updates` — GET, POST

**Auth:** Supabase JWT + rate limit.

**GET reads:** `staged_updates WHERE status='pending'`.

**POST writes:** `staged_updates` (status update), then on approve invokes `applyUpdate`:
- `new_item`: insert into `intelligence_items`
- `update_item`: update `intelligence_items` by id
- `status_change`: update `intelligence_items.status`
- `new_source`: insert into `sources`
- `archive_item`: update `intelligence_items.is_archived` + reason

**Claude API:** none.

**Called from:** AdminDashboard handleUpdate function. Browser fires POST per approve/reject click.

**Status:** live. Approval flow tested per CLAUDE.md.

### 4.5 `/api/sources` — GET

**Auth:** Supabase JWT + rate limit.

**Reads:** `sources` (all, ordered by tier).

**Writes:** none.

**Claude API:** none.

**Called from:** Not called from any UI in this audit. SourceHealthDashboard reads via `useSourceStore` populated by `getAppData()` from server-side `fetchSources`, not from this endpoint.

**Status:** live but vestigial — duplicate of the server-side fetch path used by all pages.

### 4.6 `/api/admin/users` — GET, POST

**Auth:** Supabase JWT + rate limit. (Note: doesn't verify caller is admin.)

**POST writes:** Creates user via `supabase.auth.admin.createUser` (service-role API) + inserts org_memberships row. Hardcoded org_id fallback `a0000000-0000-0000-0000-000000000001`.

**GET reads:** `org_memberships` ordered by created_at.

**Claude API:** none.

**Called from:** Not called from any UI in this audit. AdminDashboard's add-member uses direct supabase.from() insert instead.

**Status:** in-progress — built but not wired.

### 4.7 `/api/data/scan-all` — POST

**Auth:** Supabase JWT (requireAuth). Note: `vercel.json` cron is configured to call this Mon–Fri 07:00 UTC, but Vercel cron sends GET to a POST-only route AND doesn't supply auth, so the cron is currently inert.

**Reads:** `sources WHERE status='active'` (10 oldest by last_checked).

**Writes:** `sources` (last_checked, last_accessible/last_inaccessible). Computes a content "hash" but never stores or compares it. `changed` counter always returns 0.

**External calls:** Browserless API for HTML rendering, free APIs (EIA, NREL, DATA_GOV) per source's access_method. No Claude API.

**Called from:** vercel.json cron (broken). No UI caller.

**Status:** live route, but broken cron + no change-detection persistence = effectively dead.

### 4.8 `/api/data/fetch-source` — POST

**Auth:** Supabase JWT.

**Reads:** `sources WHERE id=?`. Gates on status='active'.

**Writes:** `sources` (last_checked/last_accessible counters).

**External calls:** Browserless or free API (same logic as scan-all). Returns content preview to caller.

**Claude API:** none.

**Called from:** Not called from any UI in this audit.

**Status:** in-progress — built but not wired into any admin UI.

### 4.9 `/api/worker/check-sources` — POST

**Auth:** `x-worker-secret` header (env-var WORKER_SECRET, default `dev-worker-secret`). NOT a JWT route.

**Reads:** `sources WHERE status='active' AND (next_scheduled_check IS NULL OR < now)`.

**Writes:** `sources` (last_checked, last_accessible/last_inaccessible, consecutive_accessible, total_checks, status=active|inaccessible). `source_trust_events` (insert one accessibility_check event per source). `monitoring_queue` (insert no_change/inaccessible row per source).

**External calls:** HEAD request to source URL only (10s timeout). No content fetch.

**Claude API:** none.

**Called from:** No scheduled trigger present. CLAUDE.md says "called by external cron (Railway / Vercel Cron / GitHub Actions)" — none of those exist in the repo.

**Status:** functional but unscheduled. 24 trust events accumulated (manual triggers in dev presumably).

### 4.10 `/api/notifications/trigger` — POST

**Auth:** `x-worker-secret` header.

**Reads:** `notification_subscriptions` (filtered by event type / target).

**Writes:** `notification_events` (insert), `notification_deliveries` (bulk insert).

**Claude API:** none.

**Called from:** No caller in repo. Designed to be called by DB webhooks or worker. Both subscription tables and delivery tables are empty.

**Status:** in-progress — wired but never invoked.

### 4.11 Auth helpers

`src/lib/api/auth.ts` and `src/lib/api/rate-limit.ts` provide `requireAuth(request)` + `checkRateLimit(userId)` + `rateLimitHeaders(userId)`. Rate limit is in-memory sliding window (60/min/user). CLAUDE.md notes "Replace with Redis in production."

### 4.12 Route-state summary

| Route | Live | Vestigial | In-progress |
|---|---|---|---|
| `/api/agent/run` | ✓ | | |
| `/api/ask` | ✓ | | |
| `/api/admin/scan` | ✓ | | |
| `/api/staged-updates` | ✓ | | |
| `/api/sources` | | ✓ (duplicates server-side fetch) | |
| `/api/admin/users` | | | ✓ |
| `/api/data/scan-all` | | ✓ (cron broken, change-detection stub) | |
| `/api/data/fetch-source` | | | ✓ |
| `/api/worker/check-sources` | (functional, unscheduled) | | |
| `/api/notifications/trigger` | | | ✓ |

---

## 5 — Component inventory

70+ components under `src/components/`. Grouped by directory.

### 5.1 Top-level shell

| File | Renders | Mounted at | Consumes | Status |
|---|---|---|---|---|
| `AppShell.tsx` | Root chrome — sidebar + 3px gradient + main + footer disclaimer | `app/layout.tsx` (implicit) | usePathname | live |
| `Sidebar.tsx` | 9-link primary nav + Community standalone + UserMenu bottom | AppShell | usePathname; UserMenu | live |
| `TabBar.tsx` | (legacy) Tab navigation for Dashboard's pre-domain SPA | Dashboard pre-rebuild | useNavigationStore | live (legacy) |
| `Dashboard.tsx` | Giant orchestrator — renders home/regulations/market/research/operations/sources/facilities/research/map/settings via `page` prop or `tab` from store | All seven page wrappers | All 6 stores; receives initial* props from page-level `getAppData()` | live |
| `NavigationStack.tsx` | Back-button breadcrumb | Dashboard | useNavigationStore | live |
| `FocusView.tsx` | Filtered list view (e.g., "Top Urgency →") | Dashboard | useNavigationStore | live |
| `ExportBuilder.tsx` | Multi-select + drag-reorder export modal | Dashboard | useExportStore; lib/export | live (visual; backend TODO) |
| `BackToTop.tsx` | Floating up-arrow | Dashboard | scroll listener | live |
| `ThemeInitializer.tsx` | Sets data-theme on document | layout | localStorage | live |
| `AskAssistant.tsx` | Floating chat panel — fires `/api/ask` | layout (mounted globally via Dashboard) | useWorkspaceStore | live |

### 5.2 Page wrappers (`src/components/pages/`)

| File | Renders | Mounted at | Consumes | Status |
|---|---|---|---|---|
| `RegulationsPage.tsx` | Wraps Dashboard with page="regulations" | `/regulations` | initialResources/synopses/etc props | live |
| `MarketPage.tsx` | Wraps Dashboard with page="technology", empty data | `/market` | none — passes empty arrays | live (no DB reads at request) |
| `ResearchPage.tsx` | Wraps Dashboard with page="research" + sources | `/research` | initialSources/provisional/conflicts | live (drops 6 of 9 getAppData fields) |
| `OperationsPage.tsx` | Wraps Dashboard with page="regional", empty data | `/operations` | none — passes empty arrays | live (no DB reads at request) |
| `SettingsPage.tsx` | Wraps Dashboard with page="settings" + resources/archived/supersessions | `/settings` | initialResources/archived/supersessions | live (drops 6 of 9 getAppData fields) |
| `MapPage.tsx` | (Likely wraps Dashboard with page="map") | `/map` | (not read in this audit) | live |

### 5.3 Shell primitives (`src/components/shell/`)

| File | Renders | Mounted at | Consumes | Status |
|---|---|---|---|---|
| `PageMasthead.tsx` | Eyebrow + Anton title + meta below 3px gradient | Dashboard.mastheadFor() per tab | props (eyebrow/title/meta/rightSlot/belowSlot) | live |
| `SectionHeader.tsx` | `.sh` Anton 30px + 2px border-bottom + aside | Dashboard sections | props (title/aside/id) | live |
| `StatStrip.tsx` | 4-equal-column urgency stat strip with per-tile colour role | Dashboard regulation/market/research/operations strips | props (tiles array, className) | live |

### 5.4 Home (`src/components/home/`)

| File | Renders | Mounted at | Consumes | Status |
|---|---|---|---|---|
| `DashboardHero.tsx` | 1.4fr/1fr/1fr/1fr Critical-wide hero (per dashboard-v3.html) | Dashboard home as belowSlot of PageMasthead | resources prop | live |
| `SummaryStrip.tsx` | (Legacy) 4-up summary bar | Dashboard pre-hero | resources/changelog/disputes | live (legacy — superseded by DashboardHero) |
| `WeeklyBriefing.tsx` | Expandable week brief — top urgency + disputed items + download buttons | Dashboard home | resources/changelog/disputes/auditDate; useWorkspaceStore for sector context; lib/scoring | live (visual current state, but reads legacy schema) |
| `WhatChanged.tsx` | New + updated items with field-level diffs | Dashboard home | resources/changelog | live |
| `TopUrgency.tsx` | Top-N items by urgency score | Dashboard home | resources | live |
| `DueThisQuarter.tsx` | Items with timeline milestone in next 90 days | Dashboard home | resources | live |
| `Supersessions.tsx` | Old→new replacement chain | Dashboard home | supersessions/resourceMap | live |

### 5.5 Resource (`src/components/resource/`)

| File | Renders | Mounted at | Consumes | Status |
|---|---|---|---|---|
| `ResourceCard.tsx` | Per-resource card with priority left-rail, mode badges, topic colour, expandable detail | Dashboard explore lists, FocusView, DomainItemList | useResourceStore expanded; useNavigationStore | live |
| `ResourceDetail.tsx` | Full detail view inside expanded card — what/why/keyData/impact/timeline/cross-refs/disputes | ResourceCard expanded | resource + changelog/disputes | live |
| `SectorSynopsis.tsx` | Per-sector synopsis viewer with "View all my sectors" toggle | ResourceCard | useResourceStore.synopses; useWorkspaceStore.sectorProfile | live |
| `IntelligenceBrief.tsx` | Markdown renderer for full_brief — TOC, colour-coded tables, Action Required callouts, severity pills | ResourceCard fullBrief mode | markdown prop; remark-gfm | live |
| `ImpactScores.tsx` | 4-dimension impact bar chart | ResourceDetail | scores + reasoning | live |
| `TimelineBar.tsx` | Horizontal milestone strip | ResourceDetail | items + colour | live |
| `ShareMenu.tsx` | Share menu — 3 detail levels × 2 formats | ResourceCard | resource/changelog/disputes; lib/export | live |

### 5.6 Domains (`src/components/domains/`)

| File | Renders | Mounted at | Consumes | Status |
|---|---|---|---|---|
| `DomainItemList.tsx` | Filters useResourceStore.resources by domain (2/3/4/6/7) and renders SectorSynopsisView per item | Dashboard tech/geo/regional/facilities/research tabs | useResourceStore | live |
| `TechnologyTracker.tsx` | (HARDCODED) 6 tech category cards (battery/SAF/H2/marine fuels/solar/autonomous) with metrics + policy signals + freight relevance banner | Dashboard tech tab (after DomainItemList) | static data only | live but DB-disconnected |
| `GeopoliticalSignals.tsx` | (HARDCODED) Price-signal categories (energy / carbon / minerals / trade / chokepoints) | Dashboard geo tab (after DomainItemList) | static data only | live but DB-disconnected |
| `RegionalIntelligence.tsx` | (HARDCODED) 12 jurisdiction profiles with data-chip per metric | Dashboard regional tab (after DomainItemList) | static data only | live but DB-disconnected |
| `FacilityOptimization.tsx` | (HARDCODED) Tariff tables (electricity/solar/BESS/labor/green building) | Dashboard facilities tab (after DomainItemList) | static data only | live but DB-disconnected |
| `ResearchPipeline.tsx` | (HARDCODED) MIT baselines + 7 partner cards | Dashboard research tab (after DomainItemList) | static data only | live but DB-disconnected |

### 5.7 Sources (`src/components/sources/`)

| File | Renders | Mounted at | Consumes | Status |
|---|---|---|---|---|
| `SourceHealthDashboard.tsx` | Tier summaries + registry browser + health monitor + provisional review + conflicts viewer; 4 sub-views | Dashboard sources tab; AdminDashboard sources tab | useSourceStore | live |

### 5.8 Explore (`src/components/explore/`)

| File | Renders | Mounted at | Consumes | Status |
|---|---|---|---|---|
| `FilterBar.tsx` | Mode/topic/jurisdiction/priority/vertical/confidence pill filters | Dashboard explore lists | useResourceStore.filters; useWorkspaceStore | live |
| `SearchBar.tsx` | Text search input | Dashboard | useResourceStore.filters.search | live |
| `SortSelector.tsx` | Sort dropdown (urgency/priority/alpha/added/modified) | Dashboard | useResourceStore.sort | live |
| `TimelineView.tsx` | Quarter-grouped timeline view of regulations | Dashboard regulations tab | resources prop | live |

### 5.9 Settings (`src/components/settings/`)

| File | Renders | Mounted at | Consumes | Status |
|---|---|---|---|---|
| `DashboardSettings.tsx` | Toggle list for home section visibility + sort/format dropdowns | Dashboard settings tab | useSettingsStore | live |
| `DataSummary.tsx` | 6 stat rows | Dashboard settings tab | resources/archived | live |
| `SupersessionHistory.tsx` | Filter chips + supersession-row list | Dashboard settings tab | supersessions/resourceMap | live |
| `ArchiveViewer.tsx` | Archive search + filter + restore | Dashboard settings tab | useResourceStore.archived | live |

### 5.10 Map (`src/components/map/`)

| File | Renders | Mounted at | Consumes | Status |
|---|---|---|---|---|
| `MapView.tsx` | Leaflet map with jurisdiction pins, clustering, fly-to-on-select | Dashboard map tab (dynamic import, ssr:false) | resources + jurisdictionCentroids | live |
| `jurisdictionCentroids.ts` | Lat/lng dictionary | MapView | static data | live |

### 5.11 Admin (`src/components/admin/`)

| File | Renders | Mounted at | Consumes | Status |
|---|---|---|---|---|
| `AdminDashboard.tsx` | 5-tab admin (users/orgs/updates/scan/sources) with browser-side reads + scan trigger + add-member form | `/admin` page | createSupabaseBrowserClient; SourceHealthDashboard for sources tab | live (limited; no audit log; no API integrations) |
| `WorkspaceProfile.tsx` | Sector profile multi-select; saves to workspace_settings | `/profile` page | createSupabaseBrowserClient; useWorkspaceStore | live (1 of 8 designed tabs) |

### 5.12 Auth (`src/components/auth/`)

| File | Renders | Mounted at | Consumes | Status |
|---|---|---|---|---|
| `AuthProvider.tsx` | Provides user/loading/signOut context; loads org membership on mount | `app/layout.tsx` | createSupabaseBrowserClient; useWorkspaceStore | live |
| `UserMenu.tsx` | User dropdown with sign out + theme toggle | Sidebar bottom | useAuth | live |

### 5.13 Community (`src/components/community/`)

| File | Renders | Mounted at | Consumes | Status |
|---|---|---|---|---|
| `CommunityHub.tsx` | 3-tab community (forums / vendor directory / case studies) with new-thread/case-study/vendor forms | `/community` page | sections/threads/caseStudies props; createSupabaseBrowserClient | live (forms work, content empty) |

### 5.14 UI primitives (`src/components/ui/`)

22 UI primitives: Button, Badge, Tag, Pill, ModeBadge, PriorityBadge, Toast, Toggle, Section, Skeleton (×5 variants), ErrorState, Tooltip, AcronymTooltip, AcronymText, AmbientOrbs, AiPromptBar, PageContext, UrgencyFilterBar (+ 3 preset constants).

All shipped, used across surfaces. `AmbientOrbs` is from the prior dark-luxury aesthetic and likely vestigial — referenced by `Dashboard.tsx` but design rule says "no ambient orbs."

### 5.15 Component-status summary

| Status | Count |
|---|---|
| Live, end-to-end functional | ~50 |
| Live but DB-disconnected (hardcoded content) | 5 (the five domain views) |
| Live (legacy) — superseded but still mounted | 3 (TabBar, SummaryStrip, AmbientOrbs) |
| In-progress — visual present, backend partial | ~10 (ExportBuilder, settings persistence, Profile tabs, Admin tabs) |
| Orphaned (not mounted anywhere) | 0 found |

---

## 6 — State management contracts

Six Zustand stores under `src/stores/`. No Redux, no Context (except AuthContext via AuthProvider). One custom hook (`useScrollToResource`).

### 6.1 `resourceStore.ts`

**State shape:**
```
resources: Resource[]
archived: Resource[]
synopses: Map<itemId, Map<sector, StoredSynopsis>>
intelligenceChanges: Map<itemId, StoredChange>
sectorDisplayNames: Map<sector, displayName>
overrides: Map<itemId, WorkspaceOverride>
filters: { modes, topics, jurisdictions, priorities, verticals, confidence, search, searchScope }
sort: 'urgency' | 'priority' | 'alpha' | 'added' | 'modified'
sessionSectorOverride: boolean
workspaceSectorSnapshot: string[]
expandedId: string | null
```

**Read by:** Dashboard, ResourceCard, ResourceDetail, SectorSynopsis, FilterBar, SearchBar, SortSelector, TopUrgency, WhatChanged, DueThisQuarter, ArchiveViewer, DomainItemList, ExportBuilder, FocusView, IntelligenceBrief, MapView, SummaryStrip, TimelineView, WeeklyBriefing.

**Written by:** Dashboard (setResources/setArchived/setSynopses/setIntelligenceChanges/setSectorDisplayNames on initial mount). FilterBar (toggleFilter). ResourceCard (setExpanded). All "override" mutations (updatePriority/archiveResource/restoreResource) write to in-memory Map only — **never persisted to Supabase via this store**.

**Hydrated by:** `getAppData()` server-side fetch.

**Bug/gap:** override actions don't post to `workspace_item_overrides` table. The migration 006 declared this table exactly for this use case but the store's mutations are local-only.

### 6.2 `workspaceStore.ts`

**State shape:**
```
orgId: string | null  (defaults to dev org "a0000000-...")
orgName: string  (defaults "Dietl / Rockit")
userRole: 'owner' | 'admin' | 'editor' | 'viewer' | null
sectorProfile: string[]  (defaults DEV_SECTORS — 6 sectors)
jurisdictionWeights: Record<string, number> | null
sectorWeights: Record<string, number> | null
```

**Read by:** Dashboard, AskAssistant, FilterBar, ResourceCard, SectorSynopsis, WeeklyBriefing, WorkspaceProfile, lib/scoring.

**Written by:** AuthProvider on mount (setWorkspace + setUserRole from org_memberships). WorkspaceProfile (setSectorProfile after save).

**Hydrated by:** AuthProvider browser-side query.

**Issue:** has hardcoded dev defaults. If user has no org membership (RLS fails), the dev org is silently used. Cross-tenant data exposure risk if a user belongs to a different org but the membership query fails.

### 6.3 `settingsStore.ts`

**State shape:**
```
showSummaryStrip / showWeeklyBriefing / showWhatChanged / showTopUrgency / showDueThisQuarter / showSupersessions: boolean
defaultSort: SortKey
exportFormat: 'html' | 'slack'
briefingDay: 'monday'..'friday'
alertPriorities: string[]
theme: 'light' | 'dark'
savedFilters: { modes, topics, jurisdictions, priorities } | null  (localStorage)
orgId: string | null
loaded: boolean
```

**Read by:** Dashboard (home section visibility), DashboardSettings (settings UI).

**Written by:** DashboardSettings (toggleSection/setDefaultSort/setExportFormat/setBriefingDay/setAlertPriorities/setTheme); persists via debouncedSave to `workspace_settings` table.

**Hydrated by:** `loadFromWorkspace(orgId)` browser-side query.

### 6.4 `navigationStore.ts`

**State shape:**
```
tab: TabId  (default 'home')
focusView: FocusView | null
navStack: NavEntry[]
```

**Read by:** Dashboard, NavigationStack, TabBar, FocusView, WeeklyBriefing (pushFocusView), WhatChanged (navigateToResource), DueThisQuarter (pushFocusView), Supersessions (pushFocusView).

**Written by:** TabBar (setTab on tab click), focus-view section headers (pushFocusView), navigation back button (popNav), tab clicks (clearNav).

**Hydrated by:** none — pure client state.

**Note:** when a `page` prop is passed to Dashboard (URL-driven routing), Dashboard ignores `tab` from the store. The store is still updated for legacy compatibility.

### 6.5 `sourceStore.ts`

**State shape:**
```
sources: Source[]
provisionalSources: ProvisionalSource[]
openConflicts: SourceConflict[]
filters: { tiers, statuses, domains, jurisdictions, search }
expandedSourceId: string | null
activeView: 'registry' | 'health' | 'provisional' | 'conflicts'
```

**Read by:** SourceHealthDashboard.

**Written by:** Dashboard (setSources/setProvisionalSources/setOpenConflicts on initial mount). SourceHealthDashboard (filter actions, expand actions).

**Hydrated by:** `getAppData() → fetchSourceData()` server-side.

### 6.6 `exportStore.ts`

**State shape:**
```
selectedIds: string[]
dragOrder: string[]
format: 'html' | 'slack'
level: 'summary' | 'standard' | 'full'
isOpen: boolean
```

**Read by:** ExportBuilder, Dashboard (selectedIds for bulk-select indicator).

**Written by:** ExportBuilder (toggleSelection, setDragOrder, setFormat, setLevel, clearSelection), Dashboard (toggleSelection on bulk-select), ExportBuilder open trigger.

**Hydrated by:** none — pure client state.

### 6.7 `useScrollToResource.ts`

Custom hook. Watches `expandedId` from resourceStore; auto-scrolls the expanded card into view with 80ms delay.

### 6.8 State store-to-table mapping

| Store | Backing table | Sync direction |
|---|---|---|
| resourceStore.resources/archived | intelligence_items (via RPC) + legacy resources | Server → store on page load |
| resourceStore.synopses | intelligence_summaries | Server → store on page load |
| resourceStore.intelligenceChanges | intelligence_changes | Server → store on page load |
| resourceStore.overrides | workspace_item_overrides | **Read NOT wired; writes never reach DB** |
| workspaceStore.orgId/role | org_memberships | Browser → store on auth |
| workspaceStore.sectorProfile | workspace_settings.sector_profile | Browser ⟷ DB on profile save |
| settingsStore.* | workspace_settings.* | Browser ⟷ DB (debouncedSave) |
| sourceStore.sources | sources | Server → store on page load |
| sourceStore.provisionalSources | provisional_sources | Server → store on page load |
| sourceStore.openConflicts | source_conflicts | Server → store on page load |
| navigationStore | none | Pure client |
| exportStore | none | Pure client |

---

## 7 — Feature matrix

Each row is a distinct end-user feature. Columns: **Designed** (preview HTML), **DB** (backing tables), **API** (serving routes), **Component** (UI), **Wired** (yes/partial/no), **Notes**.

Legend: ✅ full · 🟡 partial · ⛔ missing · ➖ N/A.

| Feature | Designed | DB | API | Component | Wired | Notes |
|---|---|---|---|---|---|---|
| **CHROME** | | | | | | |
| Sidebar nav, 9 links + Community + Settings | dashboard-v3 | ➖ | ➖ | ✅ Sidebar | ✅ yes | |
| 3px navy→red gradient masthead chrome | shell.css | ➖ | ➖ | ✅ AppShell | ✅ yes | |
| Page masthead — eyebrow + Anton title + meta | shell.css | ➖ | ➖ | ✅ PageMasthead | ✅ yes | |
| Section header — `.sh` Anton 30px + 2px rule | shell.css | ➖ | ➖ | ✅ SectionHeader | ✅ yes | |
| 4-equal-column StatStrip primitive | shell.css | ➖ | ➖ | ✅ StatStrip | ✅ yes | |
| 1.4fr Critical-wide DashboardHero variant | dashboard-v3 | ➖ | ➖ | ✅ DashboardHero | ✅ yes | |
| Inline AI prompt bar | ai-bar | ➖ | ➖ | ✅ AiPromptBar | ✅ yes | |
| Mobile hamburger + scrim sidebar | shell.css | ➖ | ➖ | ✅ Sidebar | ✅ yes | |
| Footer disclaimer | (current) | ➖ | ➖ | ✅ AppShell | ✅ yes | |
| **AI ASSISTANT** | | | | | | |
| Floating chat panel | (current) | ➖ | ➖ | ✅ AskAssistant | ✅ yes | |
| Sector-aware Q&A | dashboard-v3 | ✅ intelligence_items + sources | ✅ /api/ask | ✅ AskAssistant | ✅ yes | Reads new schema; doesn't JOIN |
| Per-question rate limit | (CLAUDE.md: 10/hr/workspace) | ➖ | 🟡 (60/min/user enforced) | ✅ | 🟡 partial | Stated limit not implemented |
| **DASHBOARD HOME** | | | | | | |
| Hero strip — Critical-wide 4-up | dashboard-v3 | ✅ intelligence_items | ➖ | ✅ DashboardHero | ✅ yes | Helper copy hardcoded |
| This Week — top 5 priorities | dashboard-v3 | ✅ intelligence_items | ➖ | 🟡 WeeklyBriefing | 🟡 partial | Reads legacy resources, not new layout |
| What Changed — diffs since last audit | dashboard-v3 | ✅ changelog (legacy) / intelligence_changes (new, 0 rows) | ➖ | ✅ WhatChanged | 🟡 partial | Reads legacy changelog |
| Replaced — 5-up small cards | dashboard-v3 | ✅ supersessions | ➖ | ✅ Supersessions | 🟡 partial | Visual differs from preview |
| Top Urgency section | (current) | ✅ intelligence_items | ➖ | ✅ TopUrgency | ✅ yes | |
| Due This Quarter | (current) | ✅ item_timelines (unread) / timelines (read) | ➖ | ✅ DueThisQuarter | 🟡 partial | Reads legacy timelines |
| Section visibility toggles | settings | ✅ workspace_settings.home_sections | ➖ | ✅ DashboardSettings | ✅ yes | |
| **REGULATIONS LIST** | | | | | | |
| Filter by mode/topic/jurisdiction/priority/vertical/confidence | regulations | ✅ intelligence_items columns | ➖ | ✅ FilterBar | ✅ yes | Confidence column exists |
| Search across title/note/tags/whatIsIt/whyMatters | regulations | ✅ intelligence_items | ➖ | ✅ SearchBar | ✅ yes | |
| Sort by urgency/priority/alpha/added/modified | regulations | ✅ | ➖ | ✅ SortSelector | ✅ yes | |
| Resource cards — priority left-rail, mode badges, topic colour | regulations | ✅ | ➖ | ✅ ResourceCard | ✅ yes | |
| Card expand — full detail (what/why/keyData/impact/timeline/xref/disputes/verification) | (current) | ✅ | ➖ | ✅ ResourceDetail | ✅ yes | |
| Sector synopsis collapse/expand | (current) | ✅ intelligence_summaries | ➖ | ✅ SectorSynopsis | ✅ yes | 2,325 rows live |
| Timeline view — quarter-grouped | regulations | ✅ item_timelines | ➖ | ✅ TimelineView | ✅ yes | |
| Kanban view — 4-column priority | regulations | ✅ | ➖ | ⛔ | ⛔ no | Explicitly deferred per STATUS |
| Card grid view — 3-column | regulations | ✅ | ➖ | ⛔ | ⛔ no | Deferred |
| Tweaks panel — view switcher | regulations | ➖ | ➖ | ⛔ | ⛔ no | Deferred |
| Bulk-select + sticky action bar | regulations | ✅ | ➖ | ⛔ | ⛔ no | Deferred |
| Export Builder modal — drag-reorder + format | regulations | ➖ | ➖ | 🟡 ExportBuilder | 🟡 partial | UI built, backend partial |
| Priority override per resource | (current) | ✅ workspace_item_overrides | ⛔ no API write | 🟡 ResourceCard | 🟡 partial | Mutations are in-memory only |
| Archive flow with reason | (current) | ✅ workspace_item_overrides | ⛔ | 🟡 ResourceCard | 🟡 partial | In-memory only |
| Share menu — 3 levels × 2 formats | (current) | ➖ | ➖ | ✅ ShareMenu | ✅ yes | Blob download |
| **REGULATION DETAIL** | | | | | | |
| Hero strip with mode chips, deck, tag chips, action buttons | regulation-detail | ✅ intelligence_items | ➖ | ⛔ | ⛔ no | Page is a stub |
| 4-stat strip — Effective/Penalty/Exposure/Lanes | regulation-detail | 🟡 (penalty_range exists; lanes column doesn't) | ➖ | ⛔ | ⛔ no | |
| 7 tabs — Summary/Exposure/Calculator/Timeline/Full text/Sources/Notes | regulation-detail | ✅ intelligence_summaries / item_timelines / sources | ➖ | ⛔ | ⛔ no | |
| AI summary block per regulation | regulation-detail | ✅ intelligence_summaries | ✅ /api/ask | ⛔ | ⛔ no | |
| Right-rail deadline countdown | regulation-detail | ✅ entry_into_force / compliance_deadline | ➖ | ⛔ | ⛔ no | |
| Penalty calculator — 2-column inputs + result | regulation-detail | ✅ penalty_range | ➖ | ⛔ | ⛔ no | |
| Disputes panel | regulation-detail | ✅ disputes (legacy) / item_disputes (unused) | ➖ | ⛔ | ⛔ no | Deferred per STATUS |
| Cross-references | regulation-detail | ✅ cross_references / item_cross_references | ➖ | ⛔ | ⛔ no | |
| Sources tab — JOIN sources to item | regulation-detail | ✅ intelligence_items.source_id → sources | ➖ | ⛔ | ⛔ no | The critical join |
| Team notes tab | regulation-detail | ⛔ no notes table | ➖ | ⛔ | ⛔ no | Schema gap |
| Sticky right-rail TOC | regulation-detail | ➖ | ➖ | ⛔ | ⛔ no | Deferred |
| Verification badge | regulation-detail | ✅ confidence column | ➖ | ⛔ | ⛔ no | Deferred |
| Cross-sector headline strip | regulation-detail | ✅ intelligence_summaries | ➖ | ⛔ | ⛔ no | Deferred |
| **MARKET INTEL** | | | | | | |
| Watch/Elevated/Stable/Informational stat strip | market-intel | ✅ intelligence_items (domain=2,4) | ➖ | ✅ StatStrip | ✅ yes | |
| Technology Readiness — category accordion w/ metrics+signals | market-intel | 🟡 hardcoded in TechnologyTracker | ➖ | 🟡 TechnologyTracker | 🟡 partial | DB-disconnected |
| Price Signals — accordion (energy/carbon/minerals/trade/chokepoints) | market-intel | 🟡 hardcoded | ➖ | 🟡 GeopoliticalSignals | 🟡 partial | DB-disconnected |
| DomainItemList per domain — synopsis-driven items | (current) | ✅ intelligence_items + intelligence_summaries | ➖ | ✅ DomainItemList | ✅ yes | Empty on cold load (page passes empty resources) |
| Right-rail Watch alert | market-intel | ⛔ no alert table | ➖ | ⛔ | ⛔ no | Hardcoded |
| Watchlist with priority pills | market-intel | ⛔ no watchlist table | ➖ | ⛔ | ⛔ no | |
| **RESEARCH** | | | | | | |
| Draft/Active review/Published/Archived stat strip | research | ✅ intelligence_items.status | ➖ | ✅ StatStrip | ✅ yes | |
| Pipeline expand-cards | research | 🟡 hardcoded in ResearchPipeline | ➖ | 🟡 ResearchPipeline | 🟡 partial | DB-disconnected |
| Per-item citations card with status dots | research | ⛔ no citations join | ➖ | ⛔ | ⛔ no | Schema gap |
| Coverage matrix — mode × region | research | ✅ sources.transport_modes + jurisdictions | ➖ | ⛔ | ⛔ no | Computable but not built |
| Source coverage expand-cards | research | ✅ sources | ➖ | 🟡 SourceHealthDashboard | 🟡 partial | Visual differs |
| Academic partners (MIT/Tyndall/Chalmers/ICCT/SFC) | (STATUS extension) | ✅ sources (some seeded) | ➖ | ⛔ | ⛔ no | |
| Right-rail Awaiting Review queue | research | ✅ staged_updates | ➖ | ⛔ | ⛔ no | |
| By-owner counts | research | ⛔ no owner column | ➖ | ⛔ | ⛔ no | |
| Throughput stats — published/archived/30d | research | ✅ intelligence_items | ➖ | ⛔ | ⛔ no | |
| **OPERATIONS** | | | | | | |
| Critical/High/Mod/Low stat strip | operations | ✅ intelligence_items (domain=3,6) | ➖ | ✅ StatStrip | ✅ yes | |
| By Jurisdiction — 12 region profiles with metric chips | operations | 🟡 hardcoded in RegionalIntelligence | ➖ | 🟡 RegionalIntelligence | 🟡 partial | DB-disconnected |
| Per-jurisdiction Active regulations list | operations | ✅ intelligence_items.jurisdictions | ➖ | ✅ DomainItemList | 🟡 partial | Empty on cold load |
| Open questions banner per jurisdiction | operations | ✅ intelligence_items.open_questions | ➖ | ⛔ | ⛔ no | |
| Facility Data — tariff accordion w/ rows | operations | 🟡 hardcoded in FacilityOptimization | ➖ | 🟡 FacilityOptimization | 🟡 partial | DB-disconnected |
| Right-rail Coverage / Owners / Methodology / Update cadence | operations | ⛔ no methodology table | ➖ | ⛔ | ⛔ no | |
| **MAP** | | | | | | |
| Real Leaflet map with markers | map | ✅ intelligence_items.jurisdictions | ➖ | ✅ MapView | ✅ yes | |
| Abstract editorial SVG style | map | ➖ | ➖ | ⛔ | ⛔ no | |
| Mode filter | map | ✅ | ➖ | ⛔ | ⛔ no | |
| Right-rail jurisdiction list | map | ✅ | ➖ | ⛔ | ⛔ no | |
| **SETTINGS** | | | | | | |
| 5-tab structure — General/Dashboard/Exports/Data/Archive | settings | ✅ workspace_settings | ➖ | ⛔ tab structure missing | ⛔ no | |
| Notifications — 6 toggles | settings | 🟡 alert_config JSONB exists | ➖ | ⛔ | ⛔ no | |
| Briefing schedule — day/time/format/include market | settings | 🟡 alert_config | ➖ | ⛔ | ⛔ no | |
| Display & appearance — reduce motion / compact / default filters | settings | 🟡 default_filters JSONB | ➖ | ⛔ | ⛔ no | |
| Security — 2FA / session expiry / SSO | settings | ⛔ no security table | ➖ | ⛔ | ⛔ no | |
| Saved searches side-card | settings | ⛔ no saved_searches table | ➖ | ⛔ | ⛔ no | localStorage only currently |
| Dashboard cards — 10 toggles, drag-reorder | settings | ✅ home_sections JSONB | ➖ | 🟡 DashboardSettings | 🟡 partial | 6 of 10 toggles wired; no drag |
| Default sort/view/jurisdiction/confidence | settings | ✅ default_filters | ➖ | 🟡 settingsStore | 🟡 partial | |
| Export defaults — format/detail/branding header/footer | settings | ✅ default_export_format | ➖ | 🟡 | 🟡 partial | |
| Slack delivery — 3 toggles | settings | ⛔ no slack_config table | ➖ | ⛔ | ⛔ no | |
| Data summary — 6 stat rows | settings | ✅ derived counts | ➖ | ✅ DataSummary | ✅ yes | |
| Supersession history with filter chips | settings | ✅ supersessions | ➖ | ✅ SupersessionHistory | ✅ yes | |
| Portable export / JSON download | settings | ➖ | ⛔ no API | ⛔ | ⛔ no | |
| Archive — filter + restore | settings | ✅ workspace_item_overrides (planned) | ⛔ no API write | 🟡 ArchiveViewer | 🟡 partial | Restore is in-memory |
| **PROFILE** | | | | | | |
| 8-tab structure — Personal/Org/Members/Billing/Sectors/Juris/Verifier/Activity | profile | partial | ➖ | ⛔ tab structure missing | ⛔ no | |
| Personal profile form — 9 fields | profile | ✅ profiles (15 cols incl bio/headline) | ➖ | ⛔ | ⛔ no | |
| At-a-glance / Quick links side-cards | profile | ✅ profiles | ➖ | ⛔ | ⛔ no | |
| Owner banner | profile | ✅ org_memberships.role | ➖ | ⛔ | ⛔ no | |
| Organization tab — workspace stats + edit form | profile | ✅ organizations | ➖ | ⛔ | ⛔ no | |
| Members & roles table | profile | ✅ org_memberships | ✅ /api/admin/users | ⛔ | ⛔ no | API exists, UI doesn't call it |
| Add member side panel | profile (STATUS net-new) | ✅ org_memberships | ✅ /api/admin/users | ⛔ | ⛔ no | |
| Billing & plan — 3-tier selector | profile | ✅ organizations.plan | ⛔ no billing API | ⛔ | ⛔ no | |
| Payment method card | profile | ⛔ no payment_methods table | ⛔ | ⛔ | ⛔ no | |
| Invoices table | profile | ⛔ no invoices table | ⛔ | ⛔ | ⛔ no | |
| Sector profile — 40-sector multi-select | profile | ✅ workspace_settings.sector_profile | ➖ | ✅ WorkspaceProfile | ✅ yes | Only tab built |
| Jurisdictions — chips + modes chips | profile | ✅ workspace_settings.jurisdiction_weights (planned) | ➖ | ⛔ | ⛔ no | |
| Verifier badge — credentials form + active verifiers | profile | ✅ profiles.verification_tier | ➖ | ⛔ | ⛔ no | |
| Activity tab — recent actions | profile | ⛔ no activity table | ⛔ | ⛔ | ⛔ no | |
| **ADMIN** | | | | | | |
| 6-tab — Orgs/API/Sources/Staged/Scan/Audit | admin | ✅ | partial | 🟡 AdminDashboard 5-tab | 🟡 partial | Missing API & Audit tabs |
| Caro's Ledge admin-view banner | admin | ➖ | ➖ | ⛔ | ⛔ no | |
| Organizations table with drill | admin | ✅ organizations | partial | 🟡 AdminDashboard | 🟡 partial | No drill, no plan stats |
| API & integrations tab | admin | ⛔ no api_keys table | ⛔ | ⛔ | ⛔ no | |
| Source registry — 7-tier explainer + tier-cards + sub-tabs | admin | ✅ sources | ✅ /api/sources | ✅ SourceHealthDashboard | ✅ yes | |
| Provisional review — approve/reject/defer | admin | ✅ provisional_sources | ⛔ no API endpoint for promote | ✅ visual only | 🟡 partial | Action buttons present but unwired |
| Conflict resolution UI | admin | ✅ source_conflicts | ⛔ no API | ✅ visual only | 🟡 partial | Empty (0 conflicts) |
| Staged updates — list + approve/reject | admin | ✅ staged_updates | ✅ /api/staged-updates | ✅ AdminDashboard | ✅ yes | |
| Regulatory scan — manual trigger | admin | ✅ | ✅ /api/admin/scan | ✅ AdminDashboard | ✅ yes | |
| Audit log — source_trust_events render | admin | ✅ source_trust_events | ⛔ no API | ⛔ | ⛔ no | |
| **COMMUNITY** | | | | | | |
| Community-specific sidebar w/ Starred / Private / Public | community | ✅ forum_sections | ➖ | 🟡 CommunityHub uses tabs | 🟡 partial | Visual differs from preview |
| Forum sections — 8 regional + 9 topical | community | ✅ forum_sections (17 rows) | ➖ | ✅ CommunityHub | ✅ yes | |
| Forum threads with replies | community | ✅ forum_threads/replies | ➖ | 🟡 CommunityHub | 🟡 partial | 0 threads |
| New thread form | community | ✅ | ➖ | ✅ CommunityHub | ✅ yes | |
| Vendor directory with peer-validated badges | community | ✅ vendors | ➖ | 🟡 CommunityHub | 🟡 partial | 0 vendors |
| Vendor endorsement flow | community | ✅ vendor_endorsements | ➖ | ⛔ | ⛔ no | |
| Case studies | community | ✅ case_studies (6 rows) | ➖ | ✅ CommunityHub | ✅ yes | |
| Case study endorsements | community | ✅ case_study_endorsements | ➖ | ⛔ | ⛔ no | |
| Promote-to-public modal | community | ✅ forum_sections.is_public | ➖ | ⛔ | ⛔ no | |
| 3-step onboarding (LinkedIn vs email path) | community | ✅ profiles.linkedin_* | ➖ | ⛔ | ⛔ no | |
| Notification subscriptions UI | community | ✅ notification_subscriptions | ✅ /api/notifications/trigger | ⛔ | ⛔ no | |
| Notification delivery view | community | ✅ notification_deliveries | ⛔ no read API | ⛔ | ⛔ no | |
| **CROSS-CUTTING** | | | | | | |
| Source ↔ regulation bidirectional links | (architectural) | ✅ intelligence_items.source_id | ✅ /api/agent/run | ⛔ no UI render | 🟡 partial | The critical join is unrendered |
| Per-sector synopses (15 sectors × items) | (architectural) | ✅ intelligence_summaries (2,325 rows) | ✅ /api/agent/run generates | ✅ SectorSynopsis | ✅ yes | Core feature, working |
| Workspace overrides (priority/archive) | (architectural) | ✅ workspace_item_overrides | ⛔ no write API | 🟡 in-memory only | 🟡 partial | The override layer is theatre |
| Sector profile sync to AI | (architectural) | ✅ workspace_settings.sector_profile | ✅ /api/ask receives | ✅ AskAssistant | ✅ yes | |
| Source-trust scoring engine | (architectural) | ✅ sources trust_score_* + recompute trigger | ✅ /api/worker/check-sources updates | ✅ SourceHealthDashboard renders | ✅ yes | But cron not scheduled |
| Source discovery → provisional pipeline | (architectural) | ✅ provisional_sources | ✅ /api/admin/scan inserts | ✅ provisional review tab | ✅ yes | Manual scan only — no auto |
| Scheduled monitoring | (architectural) | ✅ monitoring_queue / sources.next_scheduled_check | 🟡 worker route exists; vercel cron broken | ➖ | ⛔ no | Not running |
| Notification dispatch | (architectural) | ✅ 3 tables | 🟡 trigger route exists | ⛔ | ⛔ no | Never called |
| 10-section intelligence brief generation | (architectural) | ✅ intelligence_items.full_brief | ✅ /api/agent/run | ✅ IntelligenceBrief | ✅ yes | 89/119 generated |
| Cross-section unified search via shared tags | (architectural) | ✅ region_tags/topic_tags/vertical_tags | ⛔ no search API | ⛔ no unified UI | ⛔ no | |
| Multi-tenant workspace isolation via RLS | (architectural) | ✅ user_belongs_to_org function + policies | ✅ all routes use service-role | ➖ | ✅ yes | Hardcoded dev orgId is a leak surface |
| Authentication / sign-in flow | (current) | ✅ profiles auto-create trigger | ➖ | ✅ /login + AuthProvider | 🟡 partial | Currently disabled per "TEMPORARILY DISABLED" comments in pages |

### 7.1 Matrix coverage summary

| Category | Total features | ✅ Full | 🟡 Partial | ⛔ Missing |
|---|---|---|---|---|
| Chrome | 9 | 9 | 0 | 0 |
| AI assistant | 3 | 2 | 1 | 0 |
| Dashboard home | 7 | 2 | 4 | 1 |
| Regulations list | 15 | 7 | 4 | 4 |
| Regulation detail | 13 | 0 | 0 | 13 |
| Market intel | 6 | 2 | 2 | 2 |
| Research | 9 | 1 | 2 | 6 |
| Operations | 6 | 1 | 3 | 2 |
| Map | 4 | 1 | 0 | 3 |
| Settings | 14 | 2 | 5 | 7 |
| Profile | 14 | 1 | 0 | 13 |
| Admin | 10 | 4 | 4 | 2 |
| Community | 12 | 3 | 3 | 6 |
| Cross-cutting | 12 | 6 | 4 | 2 |
| **Total** | **134** | **41** | **32** | **61** |

31% fully wired, 24% partial, 45% missing. The "missing" column is dominated by Regulation detail (13/13), Profile (13/14), Settings (7/14), Community (6/12), and Research (6/9).

---

## 8 — Five-paragraph summary

**1 — What Caro's Ledge is built to do.**
Based on the migration history, the schema, the agent route, the design folder, and CLAUDE.md, Caro's Ledge is intended to be a multi-tenant editorial intelligence platform for freight-forwarding sustainability compliance. The architecture treats sources (the EUR-Lex/Federal-Register/IMO portals) as monitored Layer-1 entities and intelligence items (specific regulations, technology findings, regional data points, research) as Layer-2 entities discovered inside them. A scheduled worker checks sources for changes, an AI agent translates each source's content into 15 sector-specific synopses (the `intelligence_summaries` table), and a 7-domain editorial dashboard surfaces those items with urgency-scored stat strips, regulation detail pages, market/operations/research/map cross-sections, and an Ask AI bar that tailors answers to the workspace's sector profile. A community layer (forums, vendor directory, peer-validated case studies) sits alongside, with bidirectional links from regulations to threads/vendors/case studies. The product is gated by tier-based source trust scoring with a discovery pipeline (provisional → confirmed) and an admin console for orgs/integrations/staged-update approval. The design language is light-first editorial, "newspaper-as-software."

**2 — What it actually does today.**
The application loads. The sidebar, masthead, AI prompt bar, and Ask AI assistant work end-to-end. The Dashboard home page reads a mix of new schema (`intelligence_items` via the workspace RPC, `intelligence_summaries` 2,325 rows, `intelligence_changes`, `sector_contexts`) and legacy schema (`changelog`, `disputes`, `cross_references`, `supersessions`, `timelines`) and renders ResourceCards with per-sector synopses. The seven-surface migration has shipped foundational tokens, the StatStrip primitive, the PageMasthead, the SectionHeader, and the home DashboardHero. Sector profile selection works on the Profile page (1 of 8 designed tabs). Admin source health, registry, staged updates, and scan trigger work. The agent route (`/api/agent/run`) functions and has produced the 2,325 synopsis rows; the Ask AI route (`/api/ask`) reads the new schema and returns sector-tailored answers. Regulation detail is a stub. Operations and Market load with empty data on cold load (their pages don't call `getAppData`). Settings and Research load full data but throw away most of it before reaching Dashboard. Map shows the real Leaflet view. Community has working forms but only seeded content (17 forum sections, 6 case studies, 0 threads, 0 vendors). The scheduled monitoring is configured in `vercel.json` but inert (method/auth mismatch). Workspace overrides for priority/archive are in-memory only — the action buttons render but don't persist. Authentication is "temporarily disabled" via comments on every gated page.

**3 — The biggest gaps between intent and reality, ranked by how critical they are to the product working.**
*Tier 1 (the product fails its own architectural premise without these):* (a) **Source monitoring isn't actually monitoring.** Vercel cron points at a POST-only route with no auth header; the worker route has no scheduler attached; `monitoring_queue` is empty despite 24 trust events; `intelligence_changes` is empty. The system that should detect regulatory drift doesn't run. (b) **Workspace override actions are theatre.** Priority override and archive write to a Map in browser memory, never to `workspace_item_overrides`. Reload kills the change. The multi-tenant isolation premise depends on this layer. (c) **Regulation detail is a stub.** The most-promised editorial surface (penalty calculator, exposure, timeline, sources tab) doesn't exist. (d) **The source ↔ regulation join is the architectural innovation but is unrendered in any UI.** `intelligence_items.source_id` is set; no surface displays it. *Tier 2 (significant feature gaps):* (e) **Operations and Market run on hardcoded content.** Five domain components have static data; deep-link cold loads show nothing from the DB. (f) **Settings and Research drop loaded data.** `getAppData` runs on the server, then the page wrappers silently throw away synopses/changes/sectors/disputes/changelog before passing to Dashboard. (g) **Profile renders 1 of 8 designed tabs**; Admin renders 5 of 6 with wrong tab content. (h) **30 of 119 critical regulatory briefs were never generated** (per CLAUDE.md session log — agent ran out of credits). (i) **Legacy schema duplicates new schema** — legacy `changelog/disputes/cross_references/supersessions/timelines` are read; the `item_*` equivalents (declared 2026-04-04) are written by no current code. *Tier 3 (designed but deferred):* (j) Notifications fully schema'd, never delivered. (k) Community has 17 sections, 0 forum threads, 0 vendors. (l) The 40-sector master vs 15 sector_contexts mismatch. (m) Hardcoded org ID `a0000000-…` in 4+ places — cross-tenant exposure surface if RLS ever fails. (n) Per-vendor and per-case-study endorsement flows unbuilt.

**4 — Which gaps are closable in the seven-surface visual migration and which are out of scope.**
*Closable in the seven-surface migration as currently scoped:* the Operations and Market data-wiring fix (pass `getAppData` data through the page wrappers — small surgery). The Settings and Research data-passthrough fix (same surgery). The Regulation detail stub → preview-matching layout (already an explicit migration target, but `STATUS.md` declares it "layout-and-tokens-only" with disputes/calculator/share-menu deferred). The Profile tab structure → 8-tab build (the migration target; sector profile is the existing tab, the other 7 are net-new but mostly form-and-table work). The Admin tab structure → 6-tab adjustment (small).
*Out of scope for the visual migration but blocking minimum working product:* (a) the source monitoring scheduler — needs infrastructure work (Vercel cron config rewrite or external scheduler), not a visual change. (b) Workspace override persistence — requires API-route additions and resourceStore rewiring; this is data-layer work the visual migration doesn't touch. (c) Legacy schema retirement — requires a migration commit to consolidate `changelog→item_changelog` etc. and update `lib/supabase-server.ts` reads. (d) Generating the 30 missing intelligence briefs — content/agent run, requires API credits, not UI. (e) Source ↔ item join rendering — requires building source provenance components (badge with tier+trust score per item) and threading them through resource cards and regulation detail. (f) Notification UI — requires building delivery list, subscription manager, and bell-icon affordance, plus wiring `/api/notifications/trigger` to events.

**5 — Recommended scope of work to reach minimum working product.**
A four-phase sequence, prioritised by what unlocks the next phase.

**Phase 0 — Stabilise (1-2 days).** Replace the broken `vercel.json` cron with either a working cron (path matching the worker route + `x-worker-secret` header injection — requires Vercel cron upgrade or external scheduler) or remove the cron entry. Fix `lib/supabase-server.ts` to read the `item_*` tables instead of the legacy ones, OR consolidate by writing a migration that deletes the `item_*` empty duplicates and re-points the schema to the legacy names — pick one and commit. Wire `resourceStore` priority/archive mutations to actually POST to `workspace_item_overrides`. Replace the hardcoded `a0000000-…` org ID with values resolved from `AuthProvider` context.

**Phase 1 — Surface the architectural premise (3-5 days).** Build a `SourceProvenanceBadge` component that takes a source_id and renders the source name + tier + trust score. Mount it on every ResourceCard. Add a sources tab to the regulation detail page. Add a "source coverage" grid to the research page that JOINs `intelligence_items` to `sources` and shows mode × region coverage from real data. Generate the 30 missing intelligence briefs (one-shot agent run; ~$50–150 in API credits).

**Phase 2 — Complete the seven-surface migration (5-8 days).** Operations and Market: make their page.tsx files call `getAppData()` and pass full data through. Settings: implement the 5-tab structure with the existing components mounted under the right tabs and workspace_settings persistence for the unwired toggles. Research: implement the 2-tab structure with Pipeline reading from `intelligence_items.status` and Source coverage rendering the matrix + expand-cards from `sources`. Profile: ship the 8-tab structure; for tabs without backing schema (Billing payment methods, Activity, Verifier badge form), add the missing tables in a single migration commit. Admin: ship the 6-tab structure; add the Audit log tab reading from `source_trust_events`. Regulation detail: ship the 7-tab preview-matching layout (Summary/Exposure/Calculator/Timeline/Full text/Sources/Notes — the schema gap is the notes table; either add `regulation_notes` or repurpose `forum_replies` linked to the regulation).

**Phase 3 — Activate the surrounding system (1-2 weeks).** Schedule the worker properly (external cron). Implement source-content storage so change detection actually compares — add a `source_versions` table or similar. Wire `/api/notifications/trigger` to source-change events and build the in-app notification bell + delivery view. Promote the 12 provisional sources through the review queue. Generate sector synopses for the 30 newly-created briefs. Build the ⌘K cross-section search using the shared tag arrays (`region_tags / topic_tags / vertical_tags / transport_mode_tags`). Re-enable authentication on all gated pages by removing the "TEMPORARILY DISABLED" comments and verifying the middleware redirects work.

After Phase 2, the app should pass an honest test: a new user signs in to a fresh workspace, picks 5 sectors and 5 jurisdictions on Profile, lands on a Dashboard that shows real intelligence items with sector synopses, clicks a regulation to see a full detail page with sources, exposure, timeline, and a calculator, and asks the AI bar a question that returns a sector-tailored answer with cited regulations and sources. Today, pieces of that test pass; the connective tissue (Phase 0 fixes, Phase 1 source provenance, Phase 2 surface completeness) is what closes the gap from "every component exists somewhere" to "the product works end-to-end."
