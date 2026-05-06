# Stream A+B audit-driven polish

Branch: `polish/audit-fixes` (off `master`)
Date: 2026-05-05

## Summary

Nine audit-driven data + UX fixes (A1–A9) covering the regulations
detail page, regulations index page, admin organizations tab, events
page, and one orphan-data migration.

## Files modified

- `fsi-app/supabase/migrations/045_orphan_slugs_and_acf_dedup.sql` (new)
- `fsi-app/src/lib/constants.ts` — appended priority display label
  vocabulary (PRIORITY_DISPLAY_LABEL, PRIORITY_DISPLAY_LABEL_SHORT,
  PriorityKey type).
- `fsi-app/src/types/resource.ts` — added optional `jurisdictionIso`
  field on Resource so detail surface can render ISO 3166-2 labels.
- `fsi-app/src/lib/supabase-server.ts` — populate `jurisdictionIso` on
  the Resource returned by fetchIntelligenceItem from the
  `jurisdiction_iso` DB column.
- `fsi-app/src/components/regulations/RegulationDetailSurface.tsx`
  — A2 ISO jurisdiction display; A3 editorial priority labels in
  hero pill + sidebar Priority KV; A6 hide effective stat tile, hide
  effective KV row, and hide the right-rail DeadlineCard when no real
  deadline data exists.
- `fsi-app/src/components/regulations/RegulationsSurface.tsx`
  — A3 editorial priority labels on column headers + filter chips;
  A4 toggle-to-isolate semantics for priority/topic/mode/region
  chips; A5 count tooltip + footnote showing platform total alongside
  sector-filtered count.
- `fsi-app/src/app/regulations/page.tsx` — wires `platformTotal` from
  a head/count query into RegulationsSurface.
- `fsi-app/src/app/regulations/[slug]/page.tsx` — A7 UUID → slug
  redirect; eyebrow uses ISO labels.
- `fsi-app/src/components/admin/AdminDashboard.tsx` — A8 embed
  user_profiles via FK, render member name with fallback to truncated
  user_id, original user_id available in the title attribute.
- `fsi-app/src/app/admin/page.tsx` — same embed for first-paint
  members data.
- `fsi-app/src/app/events/page.tsx` — A9 past-event styling
  (muted color, PAST badge, RSVP closed pill).

## Migration 045 actions

1. **DELETE** the orphan ACF row (id =
   4688fc47-9c55-45ef-91e6-3524df3d95a7) when it still has
   `legacy_id IS NULL`. Idempotent: second run finds no matching row.
2. **Slug assignment** for orphan intelligence_items rows where
   `legacy_id IS NULL AND source_url IS NOT NULL`. Slug = lower(title)
   with non-alnum collapsed to `-`, capped at 80 chars, with a
   country-code prefix if the bare slug collides with an existing
   `legacy_id`. Numeric suffix loop bounded to 50 attempts as a final
   tie-breaker. Idempotent: WHERE clause filters on `legacy_id IS NULL`
   so a second run skips already-slugged rows.
3. **UPDATE** r10 (Journal of Sustainable Transport) setting
   `is_archived=true`, `archive_reason='source_url_unverifiable_no_replacement_found'`,
   `archived_date=CURRENT_DATE`. Idempotent: identical write is a no-op.

Schema verification — column names match migration 004
(intelligence_items uses `archived_date DATE`, NOT `archived_at`).

## Per-task changes

### A1 — Migration 045
File: `fsi-app/supabase/migrations/045_orphan_slugs_and_acf_dedup.sql`.
Three-step idempotent SQL covering ACF dedup, slug backfill, r10 archive.

### A2 — Jurisdiction display fix
File: `RegulationDetailSurface.tsx` (around the `jurisdictionLabels`
declaration). Prefers `r.jurisdictionIso` when populated, mapping each
ISO code through `isoToDisplayLabel`. SB 253 with
`jurisdiction_iso=['US-CA']` now renders "California, United States"
instead of "United States". Multi-jurisdiction rows render as
"Label A · Label B".

Also wired into `[slug]/page.tsx` eyebrow (`Regulations · {jurisLabel}`).

### A3 — Priority vocabulary unification
- Vocabulary added to `lib/constants.ts` (PRIORITY_DISPLAY_LABEL +
  PRIORITY_DISPLAY_LABEL_SHORT). DB enum unchanged.
- `RegulationsSurface.tsx`: kanban column titles now read from
  PRIORITY_DISPLAY_LABEL; priority filter chips render
  PRIORITY_DISPLAY_LABEL_SHORT.
- `RegulationDetailSurface.tsx`: PRIORITY_TONE.label values use
  PRIORITY_DISPLAY_LABEL_SHORT; sidebar Priority KV maps the enum
  through PRIORITY_DISPLAY_LABEL_SHORT before display.
- DashboardHero already used editorial labels — verified, untouched.

### A4 — Filter chip toggle-to-isolate
File: `RegulationsSurface.tsx`. Replaced the generic `toggle()` helper
with `isolate()` (and `isolatePriority()` for the priority chips
because their initial state is "all priorities active"). First click
narrows to that chip; second click on the same chip restores the
default state.

### A5 — 182 vs 123 count tooltip
- `app/regulations/page.tsx` runs a `select(id, count: 'exact', head)`
  query against intelligence_items where `domain=1 AND is_archived=false`,
  passes the result into RegulationsSurface as `platformTotal`.
- `RegulationsSurface.tsx` heading renders a `title` attribute with
  the gap message AND inlines a small "of N platform total" footnote
  next to the headline when the numbers diverge.

### A6 — Empty effective hidden
File: `RegulationDetailSurface.tsx`. Three changes:
- 4-stat strip: skip the Effective tile when `effective.value` is "—".
- Right-rail Identification card: skip the Effective KV row in the
  same condition.
- Right-rail DeadlineCard: hidden entirely when no real deadline data.

### A7 — UUID → slug redirect
File: `app/regulations/[slug]/page.tsx`. UUID_RE constant. When the
URL slug parses as a uuid AND the row has a populated legacy_id, we
`redirect()` to the slug URL. Implemented with a `redirectTo`
intermediate so the redirect call is outside the try/catch (Next's
redirect throws a magic error). Falls through to render-by-uuid when
the row exists but lacks a legacy_id.

### A8 — Member name in admin Organizations tab
File: `AdminDashboard.tsx` (loadData) + `app/admin/page.tsx` (initial
fetch). org_memberships query embeds `user:user_profiles(name,
headshot_url)` via the user_id FK. Render path uses `m.user?.name`,
falls back to `${user_id.slice(0,8)}…`, with the full user_id available
on hover via title attribute.

### A9 — Past events styling
File: `app/events/page.tsx`. Added MONTH_TOKEN_TO_INDEX,
parseEventYear(), isPastEvent(). Renders muted opacity, PAST badge,
and "RSVP closed" pill for events whose calendar day is before today's
UTC midnight.

## Risks + ambiguities

- **A8 — user_profiles row missing**: older accounts created before
  migration 027 may have no user_profiles row. The embed returns
  `user: null`; the render falls back to a truncated user_id with the
  full uuid in the title attribute. Email is *not* shown because
  auth.users.email isn't readable via anon RLS.

- **A8 — FK alias name**: chose the simpler embed form
  `user:user_profiles(name, headshot_url)` rather than the
  `user_profiles!org_memberships_user_id_fkey(...)` form. PostgREST
  needs to be able to infer the relationship from the user_id column;
  if RLS rejects the join the field arrives as `user: null` and the
  fallback path kicks in.

- **A2 — Missing data path**: the dashboard list view
  (fetchWorkspaceResources path in supabase-server.ts) wasn't
  populated with `jurisdictionIso` because the change is only on
  `fetchIntelligenceItem` (the detail-page fetcher). The kanban card
  in RegulationsSurface still uses the legacy `r.jurisdiction` short
  string. The audit issue was on the detail page; touching the list
  card is out of scope and would expand the change footprint.

- **A5 — Platform total scope**: the count uses
  `domain=1 AND is_archived=false` to define "platform total
  regulations". If the audit's "182 regulations tracked" used a
  different definition (e.g. including domain 0 or archived) the
  number will differ slightly. Adjust the predicate if the orchestrator
  reports a mismatch.

- **A9 — Date semantics**: time-of-day is opaque on the static stub
  (only day + month + monthFull are stored). isPastEvent treats an
  event as past when its calendar day strictly precedes today's UTC
  midnight; same-day events count as future. Server/client agree
  because the input array is static.

- **A4 — Behavioral change**: filter chip semantics flip from "toggle
  this priority in/out of the visible set" to "isolate to this
  priority". Users used to the toggle behavior may find this jarring,
  but the audit explicitly requested this change.
