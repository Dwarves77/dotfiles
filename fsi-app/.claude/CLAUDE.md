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
- Supabase (PostgreSQL) — live; 25 migrations applied; data model documented in `supabase/migrations/`.
- Zustand stores (resourceStore, navigationStore, settingsStore, exportStore, sourceStore)
- lucide-react icons, GSAP available

## Design System
- **Light-first** (Apple HIG principles from frontend-design skill)
- Body typeface: Plus Jakarta Sans (300-700). Display typeface: Anton, scoped to masthead title, `.card-head h3`, and `.brief-section h3` only — see STATUS.md and the design previews for the canonical surfaces. Do not use Anton in body copy or in arbitrary section headers.
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

Source registry counts and current state visible at /admin Source Health Dashboard. Counts move per commit; static doc claims here would always drift.

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
- Community layer UI (Phase 2). Tables seeded; UI not yet built.
- Phase C surface rebuilds: Operations, Settings, Profile, Market Intel, Research, Admin schema + UI, Regulation detail core + enhancements (planned)
- Phase D system activation: Notifications, Community activation, Cross-section search (planned)

## Phase B Complete
- Supabase deployment (live, 25 migrations applied)
- Migration 010: legacy resources → intelligence_items with source_id FK (148/155 items at current contract)
- Monitoring queue infrastructure (table + worker route at /api/worker/check-sources)
- Source scanning via GitHub Actions (/api/data/scan-all + trust-recompute monthly workflow)
- Format-selected single-brief regeneration (commit 2fecb79 onward)
- Intersection detection (15+ strong cross-regulation pairs detected)

## Key Files

Foundation:
- `src/types/source.ts` — Source trust framework
- `src/types/intelligence.ts` — Intelligence item types
- `src/lib/trust.ts` — Trust scoring engine
- `src/lib/constants.ts` — Domains, modes, jurisdictions, verticals
- `src/data/source-mapping.ts` — Legacy resource → source linkage
- `src/stores/sourceStore.ts` — Source state management
- `src/components/sources/SourceHealthDashboard.tsx` — Source health UI
- `supabase/migrations/004_source_trust_framework.sql` — Trust framework schema
- `supabase/seed/seed-sources.sql` — Source registry seed

Agent runtime (Phase B.2.5 contract — do not modify without reading SKILL.md):
- `src/lib/agent/system-prompt.ts` — agent contract (the 13-field YAML emission spec)
- `src/lib/agent/parse-output.ts` — YAML parser (3-tier fallback for fence/inline drift)
- `src/lib/agent/source-pool.ts` — dynamic per-item source pool
- `src/lib/sources/browserless.ts` — unified Browserless content-fetch helper
- `supabase/seed/b2-runner.mjs` — full-corpus regeneration runner (idempotent, checkpoint-resumable)
- `supabase/seed/canonical-source-discover.mjs` — canonical-source discovery via Claude + web_search

Phase B.2.5 surfaces:
- `src/components/sources/IntersectionDetectionView.tsx` — Intersections sub-tab
- `src/components/sources/CanonicalSourceReview.tsx` — Canonical-source review tab + bulk actions
- `src/components/sources/B2ProgressBanner.tsx` — auto-refreshing regen progress strip
- `src/components/resource/IntelligenceMetadataStrip.tsx` — per-item metadata strip above brief
- `src/app/api/admin/intersections/route.ts` — intersection detection RPC wrapper
- `src/app/api/admin/canonical-sources/{pending,decide,bulk-approve,bulk-classify,recommend-classification}/route.ts` — canonical-source review pipeline
- `src/app/api/admin/b2-progress/route.ts` — regen progress aggregator
- `src/app/api/admin/recompute-trust/route.ts` — trust score Bayesian-prior recompute

## Constraints
- All exports use Blob download (no clipboard API, no window.open)
- Transport mode priority: air → road → ocean → rail
- Staged updates require human approval
- Claude skill runs separately, not embedded
- Light mode is default; dark mode is opt-in variant

## Known data debt

- **3 institutional body rows typed as `tool`** (g3 EEA, g12 ECLAC, t3 OECD Environment) are properly intelligence about institutions, not tools. They likely belong in the sources registry rather than intelligence_items. Defer reclassification or migration to sources until **Phase D** when source-registry-vs-intelligence-item separation is properly addressed. For now they retain `item_type='tool'` and will receive Technology Profile briefs (a poor structural fit but the least-bad option until Phase D).

## API Security Policy
- **All API routes require authentication by default.** Every route must call `requireAuth()` from `src/lib/api/auth.ts` before processing. Unauthenticated requests receive 401.
- **Unauthenticated public routes require explicit justification** documented here with the route path and the reason it is public.
- **Rate limiting is enforced on all API routes.** 60 requests per minute per authenticated user. Exceeding the limit returns 429 with Retry-After header. Violations are logged to console.
- Auth guard: `src/lib/api/auth.ts` — verifies Supabase JWT from Authorization header.
- Rate limiter: `src/lib/api/rate-limit.ts` — in-memory sliding window. Replace with Redis in production.
- `robots.txt` blocks all AI crawlers and all `/api/`, `/dashboard/`, `/settings/`, `/admin/` routes.

### Authenticated Routes

All routes under `src/app/api/` call `requireAuth()` except `/api/auth/callback` (Supabase OAuth callback) and `/api/worker/*` which use worker-secret auth. Admin-only routes additionally check role via the admin role gate (`requirePlatformAdmin` or equivalent).

The route inventory drifts per commit; query it directly with `find src/app/api -name route.ts | sed 's|src/app/api||;s|/route.ts||'`. Listing routes here would always be stale.

---

## AGENT ARCHITECTURE

### Current model (Phase B.2.5+, SKILL.md contract 2026-04-29)

**Format-selected single-brief regeneration.** `/api/agent/run` takes a `sourceUrl`, fetches the `intelligence_items` row that has that URL as its `source_url`, and regenerates ONE brief in the format selected by `item_type`:

- `regulation`, `directive`, `standard`, `guidance`, `framework` → regulatory_fact_document (14 sections, 8 conditional)
- `technology`, `innovation`, `tool` → technology_profile (8 sections)
- `regional_data` → operations_profile (8 sections)
- `market_signal`, `initiative` → market_signal_brief (8 sections)
- `research_finding` → research_summary (6 sections)

The agent emits 13 fields per regeneration: `full_brief` markdown body plus 12 YAML metadata fields. The four intersection-readiness fields — `operational_scenario_tags`, `compliance_object_tags`, `related_items`, `intersection_summary` — drive the platform's intersection detection feature. See SKILL.md and `src/lib/agent/system-prompt.ts` for the contract.

Runtime files (do not modify without reading SKILL.md first):
- System prompt: `src/lib/agent/system-prompt.ts`
- Parser (3-tier YAML fallback): `src/lib/agent/parse-output.ts`
- API route: `POST /api/agent/run`
- Browserless helper: `src/lib/sources/browserless.ts`
- Dynamic source pool: `src/lib/agent/source-pool.ts`
- Full-corpus runner: `supabase/seed/b2-runner.mjs`

Cost: ~$0.15 per item regeneration. 155 eligible items ≈ $23 for a full regeneration pass.

### Archived (pre Phase B.2.5)

**Multi-sector synopsis model.** The agent previously identified all items in a source URL, ran delta detection, and generated 15 sector synopses for all signal items in a single response. `sector_contexts` records were injected into the user message at runtime; `synopsis_prompt` per sector made each synopsis sector-specific. This model was retired when the SectorSynopsisView UI surface was deprecated. The 2,325 `intelligence_summaries` rows generated under that model are stale and pending decision (retire view + delete rows OR regenerate under new contract — see `docs/intelligence_summaries_proposal.md`).

**Anthropic Console Managed Agent.** Earlier CLAUDE.md revisions referenced a Console-side managed agent (`agent_011CZwC8PTbAfM355bVK8w7G`). Current code does not invoke the Managed Agent — `/api/agent/run` calls `api.anthropic.com/v1/messages` directly with `model: claude-sonnet-4-6`. The Managed Agent ID may still exist in the Anthropic Console but is not part of the running architecture.

### Permitted live Claude API calls in this codebase

All other routes read from the `intelligence_items` table. No live Claude API calls happen at page load or on unauthenticated user requests.

| Route | Model | Purpose | Rate limit / cooldown |
|---|---|---|---|
| `/api/agent/run` | claude-sonnet-4-6 | Per-item brief regeneration, format-selected | 1h cooldown per source |
| `/api/ask` | claude-sonnet-4-6 | User natural-language questions | 10/workspace/hour |
| `/api/admin/scan` | claude-sonnet-4-6 + web_search | Admin-triggered regulatory scan; stages results in `staged_updates` for review | 4h cooldown |
| `/api/admin/sources/recommend-classification` | claude-haiku-4-5 | Provisional-source AI classification (cached on row) | per-call |
| `/api/admin/canonical-sources/recommend-classification` | claude-haiku-4-5 | Canonical-source candidate AI classification (cached) | per-call |
| `/api/admin/canonical-sources/bulk-classify` | claude-haiku-4-5 (concurrency=5) | Batch classification of canonical candidates (≤30/call) | maxDuration 60s |

### Non-negotiable rules

- DO NOT change `/api/agent/run` to per-sector calls. The format-selected single-brief contract is the new architecture.
- DO NOT make live Claude API calls outside the routes above.
- DO NOT rebuild the agent runtime files without reading SKILL.md and this section first.
- DO NOT create duplicate intelligence items. `/api/agent/run` UPDATES the existing row matching `source_url`. `/api/admin/scan` stages new items in `staged_updates` for admin review — never auto-inserts.
- DO NOT leave any item without a full_brief. Every regeneration must emit the 13-field contract or fail honestly. Failed regenerations retain the older `regeneration_skill_version` and re-run on the next pass; the runner is idempotent.
- DO NOT process provisional sources. Every API call, scrape job, AI pipeline, embedding generation, health check, and search indexing task MUST gate on: `WHERE status = 'active' AND admin_only = false`. Provisional sources get one URL reachability check on insert and nothing more. Activation is a data change (set `status='active'`, `admin_only=false`), not a code change.

---

## Sector Activation (future feature, placeholder live)

**Status: SHELVED with placeholder UX.** Per-sector reporting is on the platform roadmap but not active. See `docs/intelligence-summaries-proposal.md` for the cost decision (2026-04-30) — the 2,325 `intelligence_summaries` rows stay, the `SectorSynopsisView` component stays, and per-sector synopsis regeneration is deferred until multi-workspace onboarding ships.

### What ships now (placeholder)

- Sector profile selection at `/onboarding` (first-time flow) and `/profile` (revisit/edit). Both surfaces use the shared `SectorSelector` component (`src/components/profile/SectorSelector.tsx`).
- "Notify me when per-sector reporting activates" toggle on both surfaces. Writes:
  - `workspace_settings.notify_on_sector_activation` (boolean)
  - `workspace_settings.sectors_activation_signup_at` (timestamp; stamped on first opt-in only, never overwritten on subsequent toggles)
- Migration 025 (`025_sector_activation_interest.sql`) adds the two columns. Schema migration — apply BEFORE merging the dependent code per STATUS.md rule 12.

### What activates the feature

When per-sector reporting is approved for activation:

1. Pick the per-sector architecture (lazy cache vs precomputed vs runtime synthesis) at activation time against then-current cost and latency constraints. The Path A vs Path B framing in `docs/intelligence-summaries-proposal.md` is a 2026-04-30 snapshot — revisit fresh.
2. Build the per-sector synopsis pipeline (writes back to `intelligence_summaries` or whichever store the architecture picks).
3. Read `workspace_settings WHERE notify_on_sector_activation = true` to drive a one-time email/in-app announcement at activation launch.
4. Wire SectorSynopsisView (currently still rendered against `full_brief` with fallbacks) to consume the per-sector store.

### What NOT to do until activation is approved

- DO NOT regenerate `intelligence_summaries`. Cost is not justified at current single-workspace usage.
- DO NOT delete the 2,325 existing rows. Decision was SHELVE not RETIRE.
- DO NOT remove `SectorSynopsisView`. The UI surface stays — the data path stays the same as today (reads `full_brief`).
- DO NOT auto-mount `/onboarding` on first login until the activation feature ships. The route exists for explicit linking from invite/announce flows; first-login auto-mount is a separate feature decision.

---

## Operating Principle: Creative intelligence, accurate grounding

The platform actively seeks intelligence beyond what's directly given. When source coverage is thin, it searches for additional sources. When canonical sources are broken or missing, it finds replacements. When regulations intersect non-obviously, it identifies and synthesizes the intersection. When a topic suggests sources should exist that aren't in the registry, it surfaces them as candidates.

This is the platform's core value: creative AND accurate. Generic LLMs are creative but unreliable. Conservative compliance tools are reliable but limited. Caro's Ledge does both.

Every component honors this principle:
- Source discovery: actively seeks canonical sources for items missing or broken sources
- Citation extraction: surfaces new sources from agent runs, even when not explicitly given
- Intersection detection: identifies non-obvious regulation interactions before users ask
- Brief generation: does substantive work to populate sections with real content
- Anticipated guidance: identifies what's likely coming based on scheduling sources
- Synthesis briefs: synthesizes cross-jurisdictional patterns from component regulations

But every claim is grounded in a verifiable source. The integrity rule is non-negotiable:
- No invented facts, no hallucinated content, no plausible-sounding generic filler
- When source coverage is thin, sections are honestly omitted (not filled with invented content)
- When canonical sources can't be found, the gap is flagged (not papered over)
- All synthesis is grounded in component sources cited inline
- All discovered sources are verified before integration

The agent's mandate: be creative about WHAT to find, conservative about WHAT to claim. If you can't ground a claim in a verifiable source, omit it. If you find new sources that should be tracked, surface them as provisional. If you notice connections that should be flagged, document them with citations.

The system's mandate: facilitate creative discovery (dynamic source pools, search-for-canonical-sources, citation extraction, intersection detection) within accuracy guardrails (provisional source review, integrity rule enforcement, citation verification, trust scoring).

This principle applies across every phase of platform development. Features should be evaluated against it: does this make the platform more creatively intelligent without compromising accuracy?

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
5. ~~Delete `/api/debug/data-path` diagnostic route~~ — RESOLVED 2026-04-28: directory `src/app/api/debug/` does not exist; route was removed in an earlier session.

### 2026-04-28 — Phase B kickoff: SKILL.md rewrite, system prompt rewrite, Rule 11 deprecation policy

#### Accomplished
- **SKILL.md rewrite to 42,002-byte canonical** (`fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md`, 607 lines, dated 2026-04-28). Major reformat: 14-section regulatory fact document (8 conditional), four format-specific output structures (Technology Profile 8, Operations Profile 8, Market Signal Brief 8, Research Summary 6), the Integrity Rule (no invented content, gaps explicitly labeled, sections omitted not invented), the Workspace-Anchored Rule (no company/personal/product names; generic-but-in-scope language driven by workspace profile), the Cross-Format Lens Requirement (every brief serves substantive, competitive, client-conversation, action lenses), and a markdown storage convention for `intelligence_items.full_brief`.
- **Stale 45,625-byte copy at `~/.claude/skills/environmental-policy-and-innovation/`** — removed. Empty parent directory removed too. Sibling `frontend-design/` left intact. Do not pull skill content from `~/.claude/skills/` for this skill — the operative path is the repo copy at `fsi-app/.claude/skills/...`.
- **System prompt at `src/lib/agent/system-prompt.ts` rewritten end-to-end** (18,667 bytes) to encode the new SKILL.md contract: Integrity Rule, Workspace-Anchored Rule, format-selection logic by `item_type`, full section list per format, Cross-Format Lens, Cause-and-Effect chain (sourced at every link), 5 severity labels in space-separated form, 6-level source hierarchy with inline citation requirement, markdown storage convention, 14 numbered Rules for All Output. Build passes. `/api/agent/run` import unchanged.
- **Rule 11 deprecation sweep executed** (per the working-rules entry added to STATUS.md this session). Tier 1: migration `013_drop_legacy_tables.sql` created (DROPs the 6 legacy tables — `resources`, `timelines`, `changelog`, `disputes`, `cross_references`, `supersessions`); migration `012_deprecate_legacy_tables.sql` deleted (superseded). Tier 2: 8 one-shot migration scripts deleted from `supabase/seed/`. Tier 3: 11 brief-rewrite/synopsis scripts deleted from `supabase/seed/`. Tier 4: `seed-resources.json` retained as seed bundle.
- **Working rule added to STATUS.md** (item 9 in "Migration rules"): "Deprecation means deletion, not annotation." This rule is now in force project-wide.

#### Brief coverage status (out-of-contract under new SKILL.md)
- 155 of 164 `intelligence_items` rows have `full_brief` content. 9 intentional exclusions: 4 archived legacy items (arc1-arc4) and 5 ghost supersession FK targets (ss1-ss5) seeded by migration 011.
- **Existing 155 briefs were generated under the previous 10-section contract.** They are out-of-contract under the new SKILL.md (the 14-section regulatory fact document plus 4 non-regulatory formats, the Integrity Rule, the Workspace-Anchored Rule).
- Sample-test of 5 random briefs against the previous (10-section) contract: 0 of 5 fully passed. 1 of 5 (`g6`, ~12k chars) was structurally close but failed mode order and vertical filtering. 4 of 5 were short summaries (<3k chars) lacking severity labels and most sections.
- Bimodal distribution: 72 long-form (>10k chars, structurally aspirational), 3 intermediate (5-10k), 23 mid summaries (2-5k), 57 short summaries (<2k chars, mostly placeholders).
- Phase B.2 regeneration scope still to be decided. Under the new contract the bar is higher (workspace anchoring, format selection by `item_type`, Integrity Rule). Regeneration will be required, but timing/scope is open.

#### Decisions Made
- The repo `SKILL.md` is the authoritative canonical for build-time work. The Anthropic-internal `/mnt/skills/user/...` mount path is not addressable from Claude Code's filesystem.
- The system prompt's Workspace-Anchored Rule includes the same wrong/right substitution patterns shown in SKILL.md (Dietl/importer, Anthony Fraser/operator interpretation, Rockit/manual-piece-count workspace) as illustrative wrong examples only. The output the prompt produces never names any of those.
- Rule 11 (Deprecation = deletion) is in effect from this date. Pre-flight check between phases sweeps for anything deprecated by that phase's work and deletes it.

#### Next Steps
1. Apply migration 013 via Supabase SQL Editor (committed in commit 3 with SQL in body for copy-paste).
2. Decide Phase B.2 regeneration scope: how many of the 155 existing out-of-contract briefs to regenerate under the new skill, in what priority order.
3. Phase B.3 (`SourceCoverageMatrix` on Research) once B.2 scope is settled.

### 2026-04-28 — Phase B.0: API integration, source discovery pipeline, admin controls

#### Accomplished

- **B.0a audit** — read-only inventory of source-table state, API integration gaps, source-discovery pipeline state. Output drove the rest of B.0.
- **B.0b — API route handler + source-record backfill** (8607bdc): added REGULATIONS_GOV_API_KEY case (X-Api-Key header) and Accept-header support to `fetchViaApi`. Backfilled configs on 5 NULL-endpoint sources (NREL NSRDB, NREL PVWatts, ILOSTAT now api-flagged with proper endpoints; MarineTraffic and Thomson Reuters downgraded to scrape with notes), 2 docs-page sources (Regulations.gov → /v4/documents + key tag; EUR-Lex → SPARQL with `Accept: application/sparql-results+json`), and 3 cargo-culted EIA sources (each now points at its real /v2/ endpoint). Verified end-to-end: 10 of 10 source records return real API data via the route's logic.
- **B.0c — replace 5 scrape sources, expand registry by 17 sources** (9a7ca0a): CDP Supply Chain switched to data.cdp.net Socrata API. NREL System Advisor Model + 3 IMO sources stay scrape with notes documenting why. 17 new expansion sources added across industry interpretation (DNV, Bureau Veritas, ABS, ClassNK, CLECAT, TIACA), trade press (FreightWaves, Lloyd's List, The Loadstar, Splash247, JOC, TradeWinds — RSS feed configured where available), and climate/standards bodies (Smart Freight Centre, ESPO, AAPA, Sabin Center Climate Laws, Maritime Carbon Intelligence). 2 candidates (ITF/OECD, ICCT Freight) already in registry from earlier seed. Reuters Sustainable Business dropped from the original list — 401 paywalled. **IMODOCS deferred**: no public API key model exists for docs.imo.org; see commit 9a7ca0a for the full deferral rationale. IMODOCS_USERNAME/PASSWORD env vars are inert.
- **B.0e — provisional source promotion API + AI-recommended classification UI** (72f4fe1): new `POST /api/admin/sources/promote` (approve/reject/defer with audit trail in source_trust_events), `POST /api/admin/sources/recommend-classification` (Claude Haiku call, cached on `provisional_sources.recommended_classification` JSONB). New `ProvisionalReviewCard` component replaces the read-only provisional list; on expand, fetches and displays AI rationale, pre-fills editable fields, presents Approve/Reject/Defer buttons. Migration 015 (DDL) adds the cache column.
- **B.0f — citation extraction in agent route** (90376c5): system prompt instructs the agent to emit a `## New Sources Identified` markdown table; `/api/agent/run` parses it (before the JSON parse so it survives parse failures) and writes to source_citations (URL matches existing source) or upserts/inserts into provisional_sources (URL is new or already provisional). Synthetic test verified parser + DB writes against a 4-row table; live agent run deferred to B.2.
- **B.0g — trust scoring with Bayesian-prior blend, monthly recompute** (28e7024): refactored `src/lib/trust.ts` to expose `computeEarnedScore(metrics)`, `tierPrior(tier)`, and `computeOverallScore(metrics, tier)`. Blend formula: `overall = priorWeight × tierPrior + (1 − priorWeight) × earned`, where priorWeight = max(0, 1 − signalCount/10). Tier priors: T1=85, T2=75, T3=65, T4=55, T5=45, T6=35, T7=25. Initial 176-source backfill produced honest tier-aligned distribution (T1 avg 84.5, T2-T6 each at exactly their tier prior). New `POST /api/admin/recompute-trust` (worker-secret auth) and `.github/workflows/trust-recompute.yml` (monthly, 03:00 UTC on the 1st). The earned-only formula previously returned uniform 40 for every source because all 7 trust inputs were sparse; the prior blend gives the UI immediate differentiated authority signal while preserving earned-trust dynamics.
- **B.0j — manual pause and on-demand fetch/regenerate controls** (b76a104): per-source `processing_paused` column and singleton `system_state.global_processing_paused` flag (migration 016). Worker scan, agent run, and trust recompute honour both gates; manual admin actions bypass with `bypassPause: true`. New endpoints: `pause-global`, `[id]/pause`, `[id]/fetch-now`, `[id]/regenerate-brief`. New `SourceAdminControls` component adds GlobalPauseToggle banner at dashboard top and Pause/Fetch now/Regenerate brief buttons on every expanded SourceRow.
- **B.0i — admin_only column with UI toggle** (0292910): per CLAUDE.md spec, workspace-facing reads gate on `admin_only = false`; admin contexts read unfiltered. Migration 017 adds the column + a partial index. New endpoints: `GET /api/admin/sources/all` (unfiltered admin read), `POST /api/admin/sources/[id]/visibility`. SourceRowControls grew a fourth button: "Show in workspaces" ↔ "Admin only".
- **B.0h cleanup** — three audit scripts (audit-sources-b0a, audit-api-keys-b0a, audit-discovery-b0a), three B.0b/B.0c probe and backfill scripts, and the B.0g trust backfill script all deleted from `supabase/seed/` per Rule 11. Their work is durable in code or DB.

#### API integration status (post-B.0)

| Source family | Method | Auth | Status |
|---|---|---|---|
| EIA Open Data, Petroleum Spot, STEO | api | EIA_API_KEY (query-string) | Verified end-to-end |
| NREL NSRDB, PVWatts | api | NREL_API_KEY (query-string) | Verified |
| Regulations.gov v4 | api | REGULATIONS_GOV_API_KEY (X-Api-Key header) | Verified |
| DATA_GOV_API_KEY | n/a | (no source uses this key currently) | Key valid, no consumer |
| EUR-Lex SPARQL | api | (none — public, requires `Accept: application/sparql-results+json`) | Verified |
| Federal Register | api | (none — public) | Verified |
| ILOSTAT SDMX | api | (none — public) | Verified |
| CDP Open Data | api | (none — public) | Configured |
| World Bank, IEA, UK Legislation, Climate Watch, EEA, EPA Envirofacts | api | (none — public) | Configured per existing seed |
| 17 new expansion sources | api (RSS) or scrape | (none) | Configured per B.0c |

#### Source-discovery pipeline status

- Citation extraction: live on every agent run via `/api/agent/run` Step 8a-8b. Writes source_citations rows (existing source match) or upserts/inserts into provisional_sources (new URL or already-provisional URL).
- Promotion: live at `POST /api/admin/sources/promote` with three decisions (approve/reject/defer). Approve writes a new sources row + a `source_trust_events` audit row. UI buttons in SourceHealthDashboard provisional view, with AI-recommended classification (Haiku) cached on `provisional_sources.recommended_classification`.
- Trust scoring: backfilled with Bayesian-prior blend (tier priors + earned data). Monthly recompute scheduled. Self-correcting as B.0f populates citation data.
- admin_only column: live with UI toggle. Workspace-facing reads filtered; admin context unfiltered via `/api/admin/sources/all`.

#### Pending USER ACTIONS (apply in this order before next phase work)

1. Apply migration 013 — `DROP TABLE` for the 6 legacy tables (SQL in commit 3edc20b body).
2. Apply migration 015 — `provisional_sources.recommended_classification JSONB` column.
3. Apply migration 016 — `sources.processing_paused` + `system_state` table.
4. Apply migration 017 — `sources.admin_only` column + partial index.
5. Add `WORKER_SECRET` and `APP_URL` repo secrets (already in place from source-monitoring) — the trust-recompute workflow uses the same secrets.
6. **Trust-recompute workflow needs a manual trigger immediately after `redesign/full-migration` merges to master**, to verify end-to-end against the now-deployed route. Until merge, the workflow run will 404 against production because `APP_URL` points to the master deployment, which does not yet contain `/api/admin/recompute-trust`. The workflow definition is verified correct (test run 25063688946 dispatched 2026-04-28: reached the curl step, all secrets and YAML resolved cleanly, only the route was missing on the target).
7. After Supabase deployment, add `IMODOCS_USERNAME` and `IMODOCS_PASSWORD` to Vercel env vars if you ever activate the IMODOCS handler in a future commit (currently inert).
8. **B.0d manual review**: review the 12 currently-pending provisional sources via the new UI buttons. Approve, reject, or defer each.

#### Constraints reaffirmed in B.0
- Per Rule 11, deprecation = deletion not annotation. All B.0a/B.0b/B.0c/B.0g one-shot scripts deleted in commit. No "scheduled for removal" annotations carried forward.
- IMODOCS authenticated access deferred (no public API key model). Public IMO scraping continues for the 3 IMO sources. Workaround: manual document retrieval via Jason's account when a specific compliance question requires exact MEPC text.
- Pause flags honoured by automated paths only. Manual fetch and regenerate actions are explicit admin overrides and bypass pause.

#### Next Steps
1. Apply migrations 013, 015, 016, 017 via Supabase SQL Editor.
2. Trigger trust-recompute workflow once to verify.
3. B.0d manual review of the 12 pending provisionals.
4. Phase B.2 brief regeneration: decide scope (how many of the 155 out-of-contract briefs to regenerate under the new skill).
5. Phase B.3 SourceCoverageMatrix on Research page.

### 2026-04-29 — Phase B.2.5 + B.2 in flight: intersection-readiness contract + full regeneration

**Path B chosen** (intersection-aware regeneration in a single pass) over Path A (regenerate now, re-regenerate later for intersection). Saves ~$19 + 6 hours of duplicate runs and avoids creating 164 briefs that immediately become deprecated under Rule 11.

#### B.2.5 contract extension (DONE)

13-field YAML emission contract now includes 4 intersection-readiness fields:
- `operational_scenario_tags` — open vocabulary, ≤5 tags, lower-case kebab-case. Core glossary of ~36 values across ocean/air/road/customs/carbon/reporting/packaging in SKILL.md. Open vocab so agents can surface new scenarios when the core doesn't fit.
- `compliance_object_tags` — closed vocabulary, ≤4 tags. 18 supply-chain roles: carrier-{ocean,air,road,rail}, vessel/aircraft/road-fleet operator, freight-forwarder, customs-broker, nvocc, shipper/importer/exporter/manufacturer-producer/distributor, port/airport/terminal/warehouse-operator.
- `related_items` — UUID array, MUST come from source pool. No invented UUIDs.
- `intersection_summary` — short markdown ≤800 chars (raised 500→600 after CBAM hit 597; raised 600→800 after a B.2 retry hit 694; substantive items genuinely produce dense intersection content).

Skill version: `2026-04-29`.

#### Migration 020 (applied)
- `operational_scenario_tags TEXT[]`, `compliance_object_tags TEXT[]`, `related_items UUID[]`, `intersection_summary TEXT` on intelligence_items
- GIN indexes on the three array columns for fast intersection queries

#### Migration 021 (applied)
- `detect_intersections(min_strength, max_results)` RPC. Joins intelligence_items against itself (canonicalized A.id < B.id), filters pairs sharing ≥1 op_scenario_tag AND ≥1 compliance_object_tag, scores by 3pts/scenario + 2pts/compliance + 5pts explicit-link + 2pts both-high-priority. STABLE function, read-only.

#### Intersection Detection feature (DONE)
- `GET /api/admin/intersections?minStrength=N&limit=N` wraps the RPC with auth + rate limit.
- New "Intersections" sub-tab in SourceHealthDashboard with stats banner, threshold control, strong/medium/weak grouped cards showing both items + shared tag pills + intersection_summaries.
- Verified: with only 8 items regenerated, 33 pairs detected. Top hits include CII↔IMO GHG (strength 15), Crude/Jet Fuel↔ReFuelEU (12), UK MEES↔NYC Local Law 97 (10, cross-jurisdictional building-emissions match).

#### B.2 progress visibility (DONE)
- `GET /api/admin/b2-progress` returns total/at-current/at-older/never counts, by-format, by-priority, tag-coverage gauges, last 10 regenerations.
- `B2ProgressBanner` component at top of SourceHealthDashboard auto-refreshes every 30s.

#### Full B.2 runner (b2-runner.mjs)
- Sequential, idempotent (skips items already at current contract), checkpoint-resumable.
- Browserless fetch (visible:true dropped — was rejecting valid pages) → Sonnet (max_tokens 24000) → parseAgentOutput → DB update.
- Args: `--limit=N`, `--legacy=g2,g6`, `--dry-run`.
- Progress logged to `supabase/seed/b2-progress.log` (gitignored).
- 152 items remaining; ~$22 estimated; ~6 hours sequential.

#### Pilot + retry-batch validation
- Pilot 5 items: 3 ok (a3 ReFuelEU, c1 CSRD, t1 EU CBAM), 1 fetch-fail (r2 Kuehne dead URL), 1 cap-fail (CBAM 503>500 — fixed by 600 bump).
- 10-item retry batch with all fixes: 7 ok / 1 fail / 2 in flight at last check (87.5%+ rate).

#### Pending USER ACTIONS (apply when convenient)
1. Apply migrations 020 and 021 — both already applied via supabase CLI on the dev DB; production migrations sync naturally on next deploy from master.
2. Manual review of the 210 still-pending canonical_source_candidates (held during B.2.5 — not blocking).
3. Eventually merge `redesign/full-migration` to master so production picks up the contract changes.

#### In flight as of session pause
- Background task: 10-item B.2 retry batch (`b203cd32v`) at 8/10
- Next: kick off full 152-item run when retry validates ≥80%
