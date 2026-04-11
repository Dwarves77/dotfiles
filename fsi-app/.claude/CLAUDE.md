# Caro's Ledge — Project Status

## What This Is
Sustainability intelligence platform for international freight forwarding.
Not a regulation tracker — a source monitoring system covering 7 intelligence domains.

## Architecture Model
- **Layer 1: Sources** — Public portals where legislation lives (EUR-Lex, Federal Register, IMO, etc.)
- **Layer 2: Intelligence Items** — Specific regulations/findings that live INSIDE sources
- The system monitors sources. Sources produce intelligence items. Manual entry is not the model.
- Source trust: 7-tier hierarchy, trust scoring (accuracy 40% / timeliness 20% / reliability 20% / citation 20%)
- Promotion requires ALL criteria met + human review. Demotion triggered by ANY single condition.

## Tech Stack
- Next.js 16 / React 19 / TypeScript / Tailwind v4
- Supabase (PostgreSQL) — schema defined, not yet deployed
- Zustand stores (resourceStore, navigationStore, settingsStore, exportStore, sourceStore)
- lucide-react icons, GSAP available

## Design System
- **Light-first** (Apple HIG principles from frontend-design skill)
- Single typeface: Plus Jakarta Sans (300-700)
- Semantic color tokens only — no raw hex in components
- 8pt spacing grid, WCAG AA contrast, 44pt touch targets
- No Anton font, no ambient orbs, no dark-first aesthetic

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

## Completed
- Source trust types (`src/types/source.ts`, 520 lines)
- Intelligence item types (`src/types/intelligence.ts`)
- Trust scoring engine (`src/lib/trust.ts`, 370 lines)
- Database migration: 12 tables (`supabase/migrations/004_source_trust_framework.sql`)
- Source registry seed: 73 sources (`supabase/seed/seed-sources.sql`)
- Source-to-resource mapping (`src/data/source-mapping.ts`)
- Light-first theme (`src/app/theme.css`, `globals.css`)
- Layout: Anton removed, single typeface, viewport meta
- 7-domain TabBar navigation with domain-specific empty states
- Source Health Dashboard with tier summaries, registry browser, health monitor, provisional review, conflict viewer
- Source store (Zustand)
- All UI primitives: Badge, Tag, Pill, ModeBadge, Button, Toast, Toggle, Section
- All home sections: SummaryStrip, WeeklyBriefing, WhatChanged, TopUrgency, DueThisQuarter, Supersessions
- All explore components: FilterBar, SearchBar, SortSelector
- Settings components: DataSummary, SupersessionHistory
- ResourceDetail, ImpactScores, TimelineBar, ShareMenu (legacy token compat)
- MapView updated
- Dashboard restructured for domain tabs
- Build passing (zero errors)

## All Domain Views Built
- Domain 1 Regulations: Resource explorer with 119 legacy items
- Domain 2 Technology: TechnologyTracker (battery/EV, SAF, hydrogen, marine fuels, solar/BESS, autonomous)
- Domain 3 Regional: RegionalIntelligence (Dubai, UK, EU, US, Singapore, HK profiles)
- Domain 4 Geopolitical: GeopoliticalSignals (crude/fuel, carbon markets, LNG, petrochems, minerals, chokepoints, trade)
- Domain 5 Sources: SourceHealthDashboard (tier summaries, registry, health, provisional, conflicts)
- Domain 6 Facilities: FacilityOptimization (electricity, solar, BESS, labor, green building)
- Domain 7 Research: ResearchPipeline (MIT ClimateMachine baselines, 7 research partners)

## Accessibility (WCAG AA)
- 9 aria-labels on all icon-only buttons
- focus-visible:ring-2 on all interactive elements
- Semantic heading hierarchy (h1→h2→h3)
- prefers-reduced-motion: global coverage for all animations/transitions
- Empty states on FocusView, ArchiveViewer (zero + filtered)

## Not Started
- Supabase deployment and live data connection
- Execute migration: 119 resources → intelligence_items with source_id FK
- Monitoring queue implementation
- Worker/cron for source scanning
- Community layer (Phase 2)

## Key Files
- `src/types/source.ts` — Source trust framework
- `src/types/intelligence.ts` — Intelligence item types
- `src/lib/trust.ts` — Trust scoring engine
- `src/lib/constants.ts` — Domains, modes, jurisdictions, verticals
- `src/data/source-mapping.ts` — Legacy resource → source linkage
- `src/stores/sourceStore.ts` — Source state management
- `src/components/sources/SourceHealthDashboard.tsx` — Source health UI
- `supabase/migrations/004_source_trust_framework.sql` — Full schema
- `supabase/seed/seed-sources.sql` — 73 source entries

## Constraints
- All exports use Blob download (no clipboard API, no window.open)
- Transport mode priority: air → road → ocean → rail
- Staged updates require human approval
- Claude skill runs separately, not embedded
- Light mode is default; dark mode is opt-in variant

## API Security Policy
- **All API routes require authentication by default.** Every route must call `requireAuth()` from `src/lib/api/auth.ts` before processing. Unauthenticated requests receive 401.
- **Unauthenticated public routes require explicit justification** documented here with the route path and the reason it is public.
- **Rate limiting is enforced on all API routes.** 60 requests per minute per authenticated user. Exceeding the limit returns 429 with Retry-After header. Violations are logged to console.
- Auth guard: `src/lib/api/auth.ts` — verifies Supabase JWT from Authorization header.
- Rate limiter: `src/lib/api/rate-limit.ts` — in-memory sliding window. Replace with Redis in production.
- `robots.txt` blocks all AI crawlers and all `/api/`, `/dashboard/`, `/settings/`, `/admin/` routes.

### Currently Authenticated Routes
| Route | Methods | Purpose |
|---|---|---|
| `/api/sources` | GET | List sources with trust metrics |
| `/api/staged-updates` | GET, POST | List pending updates, approve/reject |

### Currently Public Routes (with justification)
None. No unauthenticated API routes exist.

---

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

The sector breakdown into 15 operationally distinct sectors happens because all 15 
sector_contexts records are injected into the user message at runtime. The 
synopsis_prompt field in each sector context record is what makes each sector 
synopsis specific rather than generic. Never remove sector_contexts injection from 
the route.

Permitted live Claude API calls in this codebase:
- /api/ask — user natural language questions, rate limited 10 per workspace per hour
- /api/admin/scan — admin triggered source scan, 4 hour cooldown minimum

Everything else reads from intelligence_summaries in the database.

---

## Session Log

### 2026-04-04 — Major Renovation Session

#### Accomplished
- **Source Trust Framework**: types (520 lines), scoring engine (370 lines), 7-tier hierarchy with promotion/demotion criteria, immutable audit trail
- **Database**: Migration 004 (12 new tables), Migration 005 (RLS policies), 73 sources seeded across T1-T6
- **Legacy migration script**: SQL to convert 119 resources → intelligence_items with source_id FK (`supabase/seed/migrate-resources-to-items.sql`)
- **Design system swap**: Dark luxury editorial → light-first Apple HIG. Anton removed, single typeface, semantic tokens throughout
- **7-domain navigation**: TabBar restructured from 4 tabs to 9 (Home + 7 domains + Settings)
- **All 7 domain views built**: TechnologyTracker, RegionalIntelligence, GeopoliticalSignals, SourceHealthDashboard, FacilityOptimization, ResearchPipeline + Regulations (legacy explorer)
- **Accessibility fixes (P1-P3)**: 9 aria-labels, ring-2 focus rings, semantic h3 headings, global prefers-reduced-motion
- **Empty states**: FocusView, ArchiveViewer (zero + filtered results)
- **Source mapping**: 95/119 legacy resources mapped to source portals by URL pattern
- **New components**: Skeleton loaders, ErrorState with retry, confidence filter in FilterBar
- **Supabase server**: Source data fetching functions added to supabase-server.ts
- **39 new Domain 2-7 sources added** to seed (IEA, IRENA, NREL, EIA, ICAP, DEWA, ILOSTAT, BREEAM, MIT, Tyndall, etc.)
- **Dark-theme cleanup**: Zero `border-white`, `var(--sage)`, `font-display`, `btn-invert` patterns remaining
- **Build passing**: Zero TypeScript errors, zero build errors throughout

#### Decisions Made
- Source ≠ regulation. Source = portal where legislation lives. This distinction is the architecture.
- Trust score weights: accuracy 40%, timeliness 20%, reliability 20%, citation 20%
- T2→T1 promotion is impossible via the trust system (T1 is an institutional fact)
- DEWA Shams Dubai marked provisional — needs live verification before active
- 24 unmapped resource URLs → provisional source candidates (not silently added)
- Domain views use static seed data for now; will pull from intelligence_items table after Supabase deploy
- `btn-invert` CSS class removed; replaced with semantic token styles

#### Blockers / Open Questions
- Supabase not yet deployed — all data is static seed. Need to deploy schema + run seed + migration
- DEWA Shams Dubai solar: Version 4 (June 2022) says commercial solar permitted with net metering — contradicts prior claim. Needs live verification
- 24 legacy resources have URLs to sources not in the registry — need provisional source review
- Touch targets on Pill/Tag flagged but not fixed — needs design review against rendered UI

### 2026-04-04 (session 3) — Multi-Tenant + Strategic Redefinition

#### Accomplished
- **Phase 1 — Multi-tenant schema deployed**: organizations, org_memberships, workspace_item_overrides, workspace_settings tables. `get_workspace_intelligence(p_org_id)` function with org-scoped JOIN (no cross-org data leakage). RLS policies enforcing workspace isolation. Dietl/Rockit dev workspace seeded.
- **Phase 2 — Hardcoded verticals removed**: VERTICALS replaced with ALL_SECTORS master list (16 sectors: fine-art, live-events, luxury, film-tv, automotive, humanitarian, bulk-commodity, cold-chain, pharma, ecommerce, industrial, chemicals, electronics, textiles, agriculture, energy). Workspace store provides active sector profile. FilterBar pulls from workspace config.
- **Phase 3 — Workspace overlay pattern**: resourceStore no longer mutates platform data. updatePriority() and archiveResource() write to workspace overrides Map. mergeWithOverrides() combines platform items + workspace overrides for the UI. Platform intelligence_items are immutable from the frontend.
- **Phase 4 — Content cleanup**: Rockit branding removed from all platform-level text (ResearchPipeline, source.ts, Dashboard, seed-sources.sql). Domain 7 description neutralized. Export template colors updated (#171e19 → #1A1A1A). seed-resources.json whyMatters text flagged for future neutral rewrite (not done this session).
- **Phase 5 — Workspace jurisdiction weights**: urgencyScore() accepts optional workspace weights parameter. Dashboard passes workspace weights from workspaceStore. Platform defaults used when no workspace override.
- **API Security**: Auth guard + rate limiting (60/min/user) on all API routes. robots.txt blocking AI crawlers.

### 2026-04-04 (session 4) — Source Attribution + Auth + Profiles

#### Accomplished
- **Source attribution on ALL data points** across all 4 domain views: Geopolitical (22 indicators), Technology (24 metrics + 24 policy signals), Regional (12 jurisdictions), Facilities (27 data points). Every metric shows: what it measures, unit, source name (clickable URL), update frequency, and why it matters.
- **Regional Intelligence expanded**: Added China, India, Japan, Australia, Brazil, Germany profiles. Region filter navigation. 12 jurisdictions across 4 regions.
- **Regulatory topics expanded**: 7 → 21 categories covering all freight sectors (customs, trade, sanctions, dangerous goods, food safety, pharma, security, cabotage, labor, infrastructure, digital, insurance, standards).
- **Global jurisdictions**: 30 → 84 covering all continents, major countries, and international bodies.
- **Auth flow**: Login page, Next.js middleware, AuthProvider, UserMenu with dropdown.
- **Admin panel**: User management, org view, staged updates approval/rejection.
- **Workspace profile page**: Sector selection from 16 freight sectors, persists to Supabase.
- **Monitoring worker**: POST /api/worker/check-sources with accessibility checks and trust events.
- **Admin user created**: jasonlosh@hotmail.com as owner of Dietl/Rockit workspace.
- **Seed content neutralized**: All 17 biased whyMatters entries rewritten to be sector-neutral.
- **Map tab restored**.
- **View in dashboard bug fixed** (was routing to defunct 'explore' tab).

#### Routes
| Route | Type | Auth |
|---|---|---|
| `/` | Dashboard | Required (middleware) |
| `/login` | Login page | Public |
| `/admin` | Admin panel | Required |
| `/profile` | Workspace sector config | Required |
| `/auth/callback` | OAuth callback | Public |
| `/api/sources` | Source registry | JWT required |
| `/api/staged-updates` | Update approval | JWT required |
| `/api/admin/users` | User management | JWT required |
| `/api/worker/check-sources` | Monitoring worker | Worker secret required |

#### Flagged for Future
- MapView still has #171e19 references (map tile styling) — cosmetic, not blocking

#### Next Steps
1. Deploy Supabase migrations (see instructions below)
2. Verify DEWA Shams Dubai status — live portal check
3. Review and confirm 24 unmapped sources as provisional entries
4. Build monitoring queue worker (cron job to scan sources on schedule)
5. Community layer planning (Phase 2 — forums, vendor directory, case studies)

### 2026-04-04 (continued) — Supabase Integration + Final Polish

#### Accomplished
- Supabase `.env.local` configured with live project credentials (kwrsbpiseruzbfwjpvsp)
- Verified Supabase connection: 123 resources in legacy `resources` table confirmed
- Source data fetching functions added to `supabase-server.ts` (fetchSources, fetchProvisionalSources, fetchOpenConflicts)
- RLS policies written for all 13 new tables (`005_rls_trust_framework.sql`)
- Legacy resource → intelligence_items migration SQL script (`migrate-resources-to-items.sql`)
- API routes: `/api/sources` (GET), `/api/staged-updates` (GET/POST with approve/reject)
- Source data prop flow wired: page.tsx → Dashboard → SourceHealthDashboard via Zustand
- `loading.tsx` — page-level skeleton loading state
- `error.tsx` — page-level error boundary with retry
- Skeleton components: ResourceCardSkeleton, ResourceListSkeleton, SourceRowSkeleton, DomainViewSkeleton
- ErrorState component with configurable title, message, retry action
- ExportBuilder fully restyled for light theme (rounded-md, semantic shadows, semantic tokens)
- FocusView card styling fixed (light-appropriate shadows)
- All `rounded-[2px]` (sharp dark editorial) → `rounded-md` across 6 files
- Last two `var(--cyan)` references → `var(--color-primary)`
- Build clean, zero errors

#### Blocker
- **Migrations 004-005 + seeds not deployed** — cannot run SQL from CLI without database password or Supabase access token
- The service role JWT authenticates to REST API only, not to the postgres database directly

#### How to Deploy Migrations
Option A — Supabase CLI:
```bash
cd /c/Users/jason/dotfiles/fsi-app
npx supabase link --project-ref kwrsbpiseruzbfwjpvsp
# Enter database password when prompted
npx supabase db query --linked -f supabase/migrations/004_source_trust_framework.sql
npx supabase db query --linked -f supabase/migrations/005_rls_trust_framework.sql
npx supabase db query --linked -f supabase/seed/seed-sources.sql
npx supabase db query --linked -f supabase/seed/migrate-resources-to-items.sql
```

Option B — Dashboard SQL Editor:
1. Go to https://supabase.com/dashboard/project/kwrsbpiseruzbfwjpvsp/sql/new
2. Open each file in VS Code, copy all contents, paste into editor, run
3. Run in order: 004 → 005 → seed-sources → migrate-resources

After deployment, the app will automatically use live data (no code changes needed).

### 2026-04-04 (final) — Supabase Live

#### Accomplished
- **Supabase fully deployed and populated** via programmatic migration (`supabase/seed/run-migration.mjs`)
- All 7 migration steps completed successfully:
  - 73 sources in registry
  - 123 intelligence items (45 linked to sources, 78 unlinked — need provisional source review)
  - 110 timelines migrated (partial dates fixed: "2023-07" → "2023-07-01")
  - 9 changelog entries, 7 disputes, 49 cross-references, 24 trust events
- RLS policies active — anon key has read access, service role has write access
- Legacy `resources` table preserved for backward compatibility
- Cross-reference relationship values mapped: `'references'` → `'related'`

#### Database Status
| Table | Rows | Status |
|---|---|---|
| sources | 73 | Live |
| intelligence_items | 123 | Live (45 linked, 78 unlinked) |
| item_timelines | 110 | Live |
| item_changelog | 9 | Live |
| item_disputes | 7 | Live |
| item_cross_references | 49 | Live |
| source_trust_events | 24 | Live |
| source_conflicts | 0 | Ready |
| monitoring_queue | 0 | Ready |
| provisional_sources | 0 | Ready |
| staged_updates | 0 | Ready |

#### Next Steps
1. Review 78 unlinked items — add their source portals to the registry or mark as provisional
2. Start dev server (`npm run dev`) and verify live data renders in all views
3. Build monitoring queue worker (cron to scan sources)
4. Community layer planning (Phase 2)

### 2026-04-10/11 — Intelligence Agent + Content Overhaul + UI Fixes

#### Accomplished
- **Intelligence Agent route** (`POST /api/agent/run`): Single Claude API call per source URL. Delta detection + 15 sector synopses in one response. System prompt at `src/lib/agent/system-prompt.ts`. Writes to `intelligence_items`, `intelligence_changes`, `intelligence_summaries`.
- **Full intelligence briefs**: 89 of 119 resources generated via Claude API with web search. 10,000-16,000 chars each with tables, risk registers, recommended actions, source citations. Synced to seed JSON.
- **Sector-specific synopsis display**: New `SectorSynopsisView` component replaces old `whatIsIt`/`whyMatters`/`keyData` and `fullBrief` display. Primary sector synopsis shown by default; "View all my sectors" toggle for multi-sector accordion. Fallback to old fields when no synopsis exists.
- **Database migration 007**: `full_brief` TEXT column on `intelligence_items`, `resources`, `staged_updates`. RPC function updated.
- **IntelligenceBrief component**: Markdown renderer with TOC, color-coded tables (green exempt / red required), Action Required callouts (#FFF7F0 orange), shaded H2 section bars, risk badge pills, source citations.
- **Sector-aware AI assistant**: `/api/ask` now receives workspace sector profile + jurisdictions. System prompt generates sector-specific responses. Multi-sector workspaces get per-sector translations.
- **Urgency scoring updated**: Sector multipliers from skill standard (1.0 / 0.9 / 0.6 / 0.3 / 0.1).
- **40 freight sectors** (was 20): Added flowers, wine/spirits, retail/FMCG, furniture, construction, metals, mining, aerospace, medical devices, live animals, forestry, general road, rail, oversized/OOG, personal effects, government/military, sports, precious goods, nuclear, liquid bulk.
- **Filter system fixed**: Priority pills always show color. Topic pills show left-border accent. Search skips sector filter for cross-sector regulations.
- **Tailwind classes fixed**: 187 usages of `text-text-primary` etc. now resolve via `@theme` block.
- **Admin role dynamic**: Reads from `org_memberships` via AuthProvider, not hardcoded.
- **Theme toggle**: Sun/Moon in UserMenu dropdown.
- **Data resilience**: `fetchDashboardData` + `fetchSourceData` have 8-second timeouts. `getAppData` has 10-second overall timeout. Seed fallback on failure.
- **19 orphan duplicate items** deleted from `intelligence_items` (scan results with null legacy_id).
- **Duplicate reasoning text** fixed in ResourceCard (skip when same as focus view `why`).

#### Decisions Made
- `generate-briefs.mjs` is **retired**. Intelligence generation happens via agent route, not seed scripts.
- `full_brief` field is superseded by `intelligence_summaries`. Users read sector-specific synopses, not monolithic briefs.
- ONE Claude API call per source URL — not per item, not per sector. 73 sources = max 73 calls per full scan.
- Permitted live Claude API calls: `/api/ask` (user questions) and `/api/admin/scan` (admin scan) only. Everything else reads from database.
- Synopsis quality benchmark: PPWR v7 Regulatory Fact Document standard.
- Sector contexts read from `sector_contexts` table at runtime — not hardcoded. 15 sectors with `synopsis_prompt` per sector.

#### Blockers / Open Questions
- **30 intelligence briefs not generated** (17 CRITICAL including EU ETS, CSRD, CII, ISO 14083, IMO NZF, CBAM, ReFuelEU Aviation). API credits ran out during generation. Agent route is ready to generate sector synopses for these — needs credits.
- **Agent route fetch failures**: IMO.org returns 500 to server-side fetches. Some EC pages return parseable content but Claude response may exceed token limit. `max_tokens` increased to 16000.
- **Dashboard still reads `full_brief`** in some home sections (WeeklyBriefing, WhatChanged). These need updating to read from `intelligence_summaries`.
- **Sector impact matrices** not yet appended to completed briefs — now superseded by `intelligence_summaries` approach.

#### Next Steps
1. Run agent route against remaining 12 CRITICAL source URLs (after credits restored)
2. Run agent route against 13 MODERATE/LOW source URLs
3. Update WeeklyBriefing and WhatChanged home sections to read from `intelligence_summaries`
4. Test full synopsis display on production — verify sector-specific content renders correctly
5. Delete `/api/debug/data-path` diagnostic route (no longer needed)
