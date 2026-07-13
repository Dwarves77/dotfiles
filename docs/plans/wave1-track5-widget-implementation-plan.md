> **Historical:** 2026-05-09 to 2026-05-11 wave decision-snapshot. Kept for cross-reference. Not a current-architecture spec.

# Phase 3 Widget Implementation Plan (PR-G3)

Generated 2026-05-09 by Plan subagent during walk-away dispatch v2.
This is the input for the build agent that will implement the four dashboard sidebar widgets after Wave 1a foundation lands.

## 0. Context

Implements the four widgets and layout reshape specified in `dashboard-sidebar-spec.html` and the README playbook. Layout A only, Layout B is out of scope. Mobile pass deferred. Reuses `EditorialMasthead` + `DashboardHero` + the existing AI prompt bar (already live above `HomeSurface`); does not touch `WeeklyBriefing` / `WhatChanged` / `Supersessions` internals.

Note on the pulse animation: a Grep for `@keyframes pulse` across `fsi-app/src` returns nothing; `MapPageView.tsx` only references "pulse" descriptively. There is no extant keyframes block. We are not lifting an existing primitive, we are introducing one and naming it as the spec instructs.

## 1. Layout reshape, HomeSurface.tsx

The masthead, hero, and AI prompt bar are already full-width above `HomeSurface` (page.tsx renders `EditorialMasthead` + `belowSlot={<DashboardHero />}` outside the surface, and the surface comment confirms the AI bar lives at the page level). The reshape is therefore confined to the inside of HomeSurface.tsx, splitting the current single-column body into a 1fr 300px grid.

JSX scaffolding (replaces the current return body, keeping the outer wrapper that sets `max-w-[1280px] mx-auto px-9 pt-8 pb-16`):

```tsx
return (
  <div className="px-9 pt-8 pb-16 max-w-[1280px] mx-auto">
    <div
      className="cl-home-body-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 300px",
        gap: 0,
        alignItems: "start",
      }}
    >
      <style>{`
        @media (max-width: 1024px) {
          .cl-home-body-grid { grid-template-columns: 1fr !important; }
          .cl-home-body-rail { border-left: 0 !important; padding-left: 0 !important; padding-top: 32px !important; border-top: 1px solid var(--border-sub); }
          .cl-home-body-main { padding-right: 0 !important; }
        }
      `}</style>

      <div className="cl-home-body-main" style={{ paddingRight: 32, minWidth: 0 }}>
        <Suspense fallback={null}>
          {/* This Week section, unchanged WeeklyBriefing + WhatChanged grid */}
        </Suspense>
        {supersessions.length > 0 && (/* Replaced section, unchanged */)}

        <HousekeepingSection
          coverageGapsSlot={<Suspense fallback={<HousekeepingSkeleton />}><DashboardCoverageGaps promise={coverageGapsPromise} /></Suspense>}
          awaitingReviewSlot={<Suspense fallback={<HousekeepingSkeleton />}><DashboardAwaitingReview promise={awaitingReviewPromise} /></Suspense>}
        />
      </div>

      <aside
        className="cl-home-body-rail"
        style={{
          paddingLeft: 32,
          borderLeft: "1px solid var(--border-sub)",
          display: "flex",
          flexDirection: "column",
          gap: 36,
        }}
      >
        <Suspense fallback={<RailSkeleton label="Watchlist" />}>
          <DashboardWatchlist promise={watchlistPromise} />
        </Suspense>
        <Suspense fallback={<RailSkeleton label="By Owner" />}>
          <DashboardByOwner resources={resources} />
        </Suspense>
      </aside>
    </div>

    <Toast ... />
  </div>
);
```

`HomeSurface` accepts four new props (promises, not resolved data): `watchlistPromise`, `coverageGapsPromise`, `awaitingReviewPromise`. `DashboardByOwner` is computed from already-hydrated `resources` (no extra fetch), so it does not need a promise. The `useEffect` resource-store hydration block is unchanged.

## 2. Six new components in src/components/home/

All in fsi-app/src/components/home/.

### TypesetSection.tsx (shared shell)

Non-card grouping primitive. Props: `{ eyebrow: string; title: string; count?: string; deck?: string; footer?: ReactNode; children: ReactNode }`. Renders `<section class="cl-typeset">` with `.cl-typeset-eyebrow`, `.cl-typeset-h` (Anton 22px), `.cl-typeset-count` (sans 11px muted, in the headline row), optional `.cl-typeset-deck`, body slot, and `.cl-typeset-foot` if footer present. No card chrome, no border, background, or shadow. Used by `DashboardWatchlist` and `DashboardByOwner`.

### DashboardWatchlist.tsx (rail, top)

Props: `{ promise: Promise<WatchlistItem[]> }` where `WatchlistItem = { id: string; type: 'source' | 'reg' | 'signal'; title: string; source: string; jurisdiction?: string; lastChangedAt: string }`. `use(promise)` to read inside Suspense.

- Wrapped in `<TypesetSection eyebrow="Tracked by you" title="Watchlist" count="{n} of {total}" footer={<a href="/watchlist">View all {total} →</a>}>`.
- Item: `<li class="cl-wl-item {fresh}">` with `.src`, `.t`, `.meta` containing `<span class="pulse-dot">` + relative time + `<span class="cl-typetag">{type}</span>`.
- First item gets `.fresh` class (animated pulse dot, critical-color).
- Empty state copy verbatim: `"Watch any source, regulation, or market signal to see updates here."` plus link `"Browse what to watch →"` routing to `/regulations`.
- Error state: `"Couldn't load watchlist · retry"` with retry link.
- Click row routes to `/regulations/{id}`, `/sources/{id}`, or `/market#{id}` based on type.

### DashboardByOwner.tsx (rail, bottom)

Props: `{ resources: Resource[] }`. No fetcher. Aggregates over `resources.actionOwner` (confirmed at `src/types/resource.ts:158` as `actionOwner?: string`). Resolves the README open question 3 in favor of `actionOwner`.

- Display-layer normalization: `name.trim().toLowerCase()` as group key, display the most-frequent original casing.
- Output `OwnerGroup[] = { name; count; top: { id; title; priority } }`. Sort by count desc, ties broken by highest priority of `top`. Slice to top 3.
- Wrapped in `<TypesetSection eyebrow="On whose plate" title="By Owner" count="{totalItems} items · {ownerCount} owners" footer={<a href="/profile?tab=owners">View all owners →</a>}>`.
- Item: `<li class="cl-ow-item">` with `.row` (name + `.ct` Anton 18px count + `<sub>items</sub>`) and `.top.{crit|high|mod}` line containing severity dot + top-item title (single-line truncate).
- Owner click routes to `/regulations?owner={encodeURIComponent(displayName)}`. Top-item subtitle click routes to `/regulations/{topId}`.
- Empty state copy verbatim: `"Assign owners to regulations from any detail page to populate this view."` plus CTA `"Pick a regulation to assign →"` routing to `/regulations`.

### DashboardCoverageGaps.tsx (Housekeeping body, left)

Props: `{ promise: Promise<CoverageGap[]> }`. `CoverageGap = { id: string; title: string; jurisdiction: string | null; sectorAffinity: string[]; severity: 'high' | 'medium' | 'low'; description: string; suggestedAction: { label: string; href: string } }`.

- Uses card chrome (white surface, 1px border, --r-lg radius, --shadow). Body widgets get card chrome, rail widgets do not.
- Eyebrow `"What you might be missing"`, title `"Coverage gaps"`, count `"{n} flagged"`.
- Deck copy verbatim: `"Heuristic — severity is a recommendation, not a precise score."`
- Items hard-capped at 2 (sorted high then medium then low). High-severity item: `.cov-item.high-sev` (filled --high-bg, --high-bd border, 3px --high left rule). Other: muted (.cov-item, --bg background, subtle border, 3px --moderate left rule).
- Each item: .row with .t + .sev. .desc paragraph rendering description with `<i>` callouts. Action link.
- Caveat copy verbatim at the bottom: `"We're still expanding our source registry; check back as jurisdictions are added."`
- Empty state copy verbatim: `"Coverage looks complete for your active sectors."` plus the same caveat.
- Error state: hide the widget silently (advisory).

### DashboardAwaitingReview.tsx (Housekeeping body, right)

Props: `{ promise: Promise<ReviewItem[]> }`. `ReviewItem = { id: string; type: 'provisional' | 'integrity' | 'spotcheck'; title: string; daysWaiting: number; href: string }`.

- Uses card chrome (same treatment as Coverage gaps).
- Eyebrow `"What you should do today"`, title `"Awaiting review"`, count `"{n} items"`.
- Stale flag: if any item daysWaiting > 7, show `(stale)` pill in header and add high-sev fill to that item.
- Type chips: .cl-rev-chip.prov (accent palette), .intg (high palette), .spot (low palette). Mapping: provisional, integrity, spotcheck.
- Item layout grid-template-columns: auto 1fr auto: chip + title/.ago + chevron.
- Sorted by daysWaiting desc, top 3 shown.
- Footer: `<a href="/admin">Open admin queue →</a>`.
- Empty state copy verbatim: `"Caught up. No items awaiting review."`
- Error state: `"Couldn't load review queue · retry"`.
- Permission gate: hide entirely for non-admins. Show skeleton during the permission check, not "empty."

### HousekeepingSection.tsx

Wrapper with the same `<section style={{ marginBottom: 40 }}>` rhythm as "This Week" and "Replaced". Props: `{ coverageGapsSlot: ReactNode; awaitingReviewSlot: ReactNode }`. Renders `<SectionHeader title="Housekeeping" aside="Registry health · review queue" />` followed by a .cl-two grid (`grid-template-columns: 1fr 1fr; gap: 18px`) holding the two slots. Reuses `SectionHeader` from src/components/shell/SectionHeader.tsx.

Also export tiny `HousekeepingSkeleton` and `RailSkeleton` from this file (or co-locate as `home/widgetSkeletons.tsx`) for the Suspense fallbacks.

## 3. Data layer additions in src/lib/data.ts

Pattern matches the existing `getResourcesOnly` / `getMapData` / `getSettingsData` shape: a `getX()` exported function does `resolveOrgIdFromCookies` + delegates to a `fetchX(orgId)` in `supabase-server.ts`, with a 10s timeout race and seed fallback.

Path C data-split: `page.tsx` calls `getAppData()` and awaits it (hero needs `resources` for tile counts), but for the four new widgets it constructs unawaited promises and passes them as props. `HomeSurface` Suspense-wraps each. Editorial body + hero paint at the original time-to-first-paint; rail/Housekeeping resolve as their independent queries return.

New exports in data.ts:

- `getWatchlist(): Promise<WatchlistItem[]>`. Joins user_watchlist on resources/sources/market signals; returns the heterogeneous union sorted by lastChangedAt desc, hard-cap 14. For anon users (no userId), returns `[]`.
- `getCoverageGaps(): Promise<CoverageGap[]>`. Selects from coverage_gaps filtered by overlap between sectorAffinity and the workspace's active sectors. Sorted high then medium then low, then created_at desc. Cap 2.
- `getAwaitingReview(): Promise<ReviewItem[]>`. Composes from three sources (provisional sources, integrity flags, staged updates) since no unified RPC exists today. Returns top 3 oldest. Returns `[]` if non-admin.

Each wrapped in unstable_cache keyed by appropriate identity (orgId for watchlist + coverage gaps; userId for awaiting-review), 60s revalidate, tagged APP_DATA_TAG.

In page.tsx (already needs editing for prop wiring):

```tsx
const data = await getAppData();
const watchlistPromise = getWatchlist();
const coverageGapsPromise = getCoverageGaps();
const awaitingReviewPromise = getAwaitingReview();
<HomeSurface
  /* existing props */
  watchlistPromise={watchlistPromise}
  coverageGapsPromise={coverageGapsPromise}
  awaitingReviewPromise={awaitingReviewPromise}
/>
```

`HomeSurface` is "use client". Promises pass through the RSC boundary. Widgets use React 19 use() to unwrap inside Suspense boundaries.

## 4. Schema migrations

Two new files (last existing is 051; use 060 + 061 to leave headroom for Wave 1a 052-059).

### 060_user_watchlist.sql

```sql
create table public.user_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.orgs(id) on delete cascade,
  item_type text not null check (item_type in ('source','reg','signal')),
  item_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);
create index user_watchlist_user_idx on public.user_watchlist (user_id);
create index user_watchlist_org_idx on public.user_watchlist (org_id);
alter table public.user_watchlist enable row level security;
create policy user_watchlist_select on public.user_watchlist for select using (auth.uid() = user_id);
create policy user_watchlist_insert on public.user_watchlist for insert with check (auth.uid() = user_id);
create policy user_watchlist_delete on public.user_watchlist for delete using (auth.uid() = user_id);
```

`item_id` is text (not uuid) because resource IDs in this codebase are slug-like strings.

### 061_coverage_gaps.sql

```sql
create table public.coverage_gaps (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  jurisdiction text,
  sector_affinity text[] not null default '{}',
  severity text not null check (severity in ('high','medium','low')),
  description text not null,
  suggested_action_label text not null,
  suggested_action_href text not null,
  created_at timestamptz not null default now()
);
create index coverage_gaps_severity_idx on public.coverage_gaps (severity);
alter table public.coverage_gaps enable row level security;
create policy coverage_gaps_select on public.coverage_gaps for select using (true);

insert into public.coverage_gaps (title, jurisdiction, sector_affinity, severity, description, suggested_action_label, suggested_action_href) values
  ('Switzerland packaging waste regulation', 'CH', array['packaging','waste'], 'high',
   'Federal ordinance update suggests new alignment requirements; <i>no current source in registry.</i>',
   'Suggest a source', '/admin?tab=coverage&suggest=ch-packaging-waste'),
  ('CA SB 261 climate-related financial risk', 'US-CA', array['finance','climate-disclosure'], 'medium',
   'Sister regulation to SB 253; <i>tracked partially.</i>',
   'Add to registry', '/admin?tab=coverage&add=ca-sb-261');
```

Description column rendered with `<i>` callouts the spec shows verbatim.

## 5. Style additions to globals.css

Append:

```css
/* TYPESET SECTION (typeset, not boxed, sidebar widget grammar) */
.cl-typeset { display: flex; flex-direction: column; }
.cl-typeset-eyebrow { font-size: 9px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
.cl-typeset-h { font-family: var(--font-display); font-size: 20px; font-weight: 400; letter-spacing: 0.04em; text-transform: uppercase; line-height: 1.08; margin: 0 0 6px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.cl-typeset-h .count { font-family: var(--font-sans); font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 0; flex: 1 0 100%; margin-top: -2px; }
.cl-typeset-deck { font-size: 12px; color: var(--text-2); line-height: 1.5; margin: 0 0 14px; }
.cl-typeset-list { list-style: none; padding: 0; margin: 0; }
.cl-typeset-list li { padding: 10px 0; border-top: 1px solid var(--border-sub); }
.cl-typeset-list li:first-child { border-top: 0; padding-top: 4px; }
.cl-typeset-foot { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--text); }
.cl-typeset-foot a { font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); text-decoration: none; }
.cl-typeset-foot a:hover { color: var(--accent-hover); }

/* TYPETAG, small inline type marker */
.cl-typetag { font-size: 9px; font-weight: 700; letter-spacing: 0.06em; padding: 1px 6px; border-radius: 3px; border: 1px solid var(--border-sub); color: var(--text-2); text-transform: uppercase; }

/* PULSE DOT, shared utility */
.pulse-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--low); display: inline-block; }
.pulse-dot.fresh { background: var(--critical); animation: pulse-dot 1.6s ease-in-out infinite; }
@keyframes pulse-dot {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.6); opacity: 0.5; }
}
@media (prefers-reduced-motion: reduce) {
  .pulse-dot.fresh { animation: none; }
}
```

## 6. Hard file-scope boundary (Phase 3 enforcement)

Every file the implementation may touch:

1. fsi-app/src/app/page.tsx, wire 3 new promises into HomeSurface props.
2. fsi-app/src/components/home/HomeSurface.tsx, layout reshape, accept new promise props, mount widgets in Suspense.
3. fsi-app/src/components/home/TypesetSection.tsx, new.
4. fsi-app/src/components/home/DashboardWatchlist.tsx, new.
5. fsi-app/src/components/home/DashboardByOwner.tsx, new.
6. fsi-app/src/components/home/DashboardCoverageGaps.tsx, new.
7. fsi-app/src/components/home/DashboardAwaitingReview.tsx, new.
8. fsi-app/src/components/home/HousekeepingSection.tsx, new (also exports HousekeepingSkeleton, RailSkeleton).
9. fsi-app/src/lib/data.ts, add getWatchlist, getCoverageGaps, getAwaitingReview.
10. fsi-app/src/lib/supabase-server.ts, add corresponding fetchWatchlist, fetchCoverageGaps, fetchAwaitingReview.
11. fsi-app/src/app/globals.css, append section 5 block.
12. fsi-app/supabase/migrations/060_user_watchlist.sql, new.
13. fsi-app/supabase/migrations/061_coverage_gaps.sql, new.

Out of bounds: WeeklyBriefing.tsx, WhatChanged.tsx, Supersessions.tsx, DashboardHero.tsx, EditorialMasthead.tsx, SectionHeader.tsx, MapPageView.tsx, the /market WatchlistSidebar / OwnersContent (distinct components, avoid one-component-fits-all temptation), the /admin queue page, anything under /api/admin/attention. Other migrations are append-only.

## 7. PR title and body skeleton

Title: `feat(dashboard): four sidebar widgets + Housekeeping section (Layout A)`

Body: see plan source for full template.

## Related

- [spec-audit-dashboard-2026-05-23](./spec-audit-dashboard-2026-05-23.md) — That plan builds the exact widgets audited here (DashboardWatchlist, DashboardByOwner, DashboardCoverageGaps, DashboardAwaitingReview,…
- [components](../inventories/components.md) — Adds six new src/components/home components that the components inventory tracks
- [migrations](../inventories/migrations.md) — Adds migrations 060 user_watchlist and 061 coverage_gaps recorded in the migrations inventory
- [dashboard-payload-audit-2026-05-11](../audits/dashboard-payload-audit-2026-05-11.md) — Both concern the Dashboard data path / getAppData feeding these widgets
- [wave1-step1-verification](../audits/wave1-step1-verification.md) — Shares the Wave 1 dispatch series and the migration-headroom (060/061 leave room for Wave 1a 052-059) coordination
