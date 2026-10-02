# Sprint 1 Phase 7: Scope Amendment

**Date:** 2026-05-16
**Source:** operator decision Q1 at the Phase 4 prework gate
**Status:** binding amendment; carries into Phase 7 when its turn arrives

## Amendment

The original Sprint 1 brief's Phase 7 charter reads:

> **PHASE 7: ROLE-GATE ADMIN CHROME**
>
> CONTEXT: RC-1 confirmed. Exactly one chrome-level admin gate exists today (the /admin route segment redirect). Every other admin leak renders unconditionally. Phase 7 closes the chrome gap.

That charter is **amended** to:

> **PHASE 7: ROLE-GATE ADMIN CHROME + MINIMUM VIABLE JURISDICTION TRIAGE QUEUE**
>
> CONTEXT: RC-1 confirmed (above). Additionally, Phase 3 deferred operator triage UI for two new tables (`ingest_rejections`, `pending_jurisdiction_review`) to Phase 7 per operator decision Q1 at the Phase 4 prework gate. Phase 7 closes the chrome gap AND builds the minimum viable triage queue that closes the audit count discrepancy on jurisdictions.

The original Phase 7 task list stays. The triage queue is added as task 4 (in addition to the existing 1, 2, 3).

## Minimum viable triage queue: bounded scope

Operator decision Q1 bounded the scope explicitly. The triage queue is a small, focused admin surface. Sprint 1 ships the floor; Sprint 2 (or later) extends if volume justifies.

### IN scope for Phase 7

1. **One admin route**, e.g. `/admin/jurisdiction-queue` or equivalent path
2. **Two-tab list view**: tab A = `ingest_rejections`, tab B = `pending_jurisdiction_review`
3. **Paginated table per tab**:
   - `ingest_rejections` tab columns: `raw_value`, `rejection_reason`, `ingest_attempted_at`, `source_url` (link), `triage_action` (status badge if triaged)
   - `pending_jurisdiction_review` tab columns: `current_value`, `flagged_reason`, `flagged_at`, intelligence_item title (linked), `resolution_value` (if resolved)
4. **Single-row triage modal**:
   - For `ingest_rejections`: autocomplete picker of accepted canonical jurisdiction values, OR "discard" action. Triage writes `triaged_by = auth.uid()`, `triaged_at = NOW()`, `triage_action` ('discarded' | 'reclassified' | 'escalated'), `triage_notes` (optional).
   - For `pending_jurisdiction_review`: autocomplete picker of accepted canonical jurisdiction values. Triage writes `resolved_by = auth.uid()`, `resolved_at = NOW()`, `resolution_value` (the chosen canonical), AND updates the referenced `intelligence_items.jurisdictions` column to replace the flagged value with the resolution.
5. **Role gate**: the route + the data fetch wrapped in `requirePlatformAdmin()` (the new helper from Phase 1 Option C). Non-admins get redirected per the standard pattern.

### OUT of Phase 7 (deferred; Sprint 2 follow-up if volume justifies)

- Bulk actions (select N rows, apply same canonical value)
- Saved filters
- CSV export of pending queue
- Reclassification analytics dashboard
- Real-time updates (page refresh on triage is acceptable)
- Mobile-optimized layout (desktop admin surface only)

### Acceptance criterion

After Phase 7 ships, an operator with `profiles.is_platform_admin = true` can:
1. Log into the admin surface
2. Navigate to `/admin/jurisdiction-queue`
3. See the two queues (which may be ~50 + ~83 rows on first ship per Phase 3 estimates)
4. Triage each row to a canonical value or discard
5. See the affected `intelligence_items` rows update accordingly

This closes the Phase 3 audit count discrepancy from "342 distinct values, inconsistent" through Phase 3 migration's "98 canonical + ~83 in quarantine" intermediate state to "fully reconciled to controlled vocabulary" after operator triage.

## Phase 7 task list (original + amendment)

1. Add `requirePlatformAdmin()` server-side check to leaking components (HomeSurface.tsx:218-251, DashboardCoverageGaps.tsx:36-121, "Suggest a source / Add to registry" CTAs, "OPEN ADMIN QUEUE" CTA) — **unchanged**
2. Replace schema-name literals in operator-facing components with operator-voice strings (KeyMetricsRow.tsx:140-142, OwnersContent.tsx:92, OperationsPage.tsx:331/620, ResearchView.tsx:337) — **unchanged**
3. Strip "Phase D" from /research pagination disclosure — **unchanged**
4. **NEW: build minimum viable jurisdiction triage queue per § 1 above** — adds one route, two tabs, paginated tables, triage modal, write-through to source tables

## Phase 7 dependencies

- Phase 1 split helpers (`requirePlatformAdmin` reads `profiles.is_platform_admin`) — required for the route gate
- Phase 3 migrations (the two tables exist with RLS) — required for the data fetch
- Phase 4 migrations (specifically migration 081 which creates the tables + RLS) — required

## Cost frame for Phase 7 amendment (per rule-cost-weighted-recommendations)

- **One-time agent work:** Low-Medium (+$50-150 vs original Phase 7). One route + two table components + one modal + autocomplete from canonical jurisdictions list (which already exists in `legacyToIso()` after Phase 4 extension). Existing admin chrome patterns (AdminDashboard.tsx) provide the layout scaffold.
- **Ongoing runtime:** Zero. Triage actions are operator-driven, not auto-fired.
- **Ongoing infrastructure:** None.
- **Inheritance:** High. The triage UI pattern (queue → autocomplete → write-through) is reusable for future operator triage surfaces (e.g., source-registry-hygiene queue, integrity_flags review).
- **Value frame:** Revenue-accelerating. Without it, the Phase 3 migration leaves ~83 items quarantined; with it, audit closes.
- **Manual gate:** N/A (per-row operator decisions are the gating).

## Open items deferred to Sprint 2 explicitly

Per operator Q1 OUT scope:
- Bulk triage actions
- Saved filters
- CSV export
- Reclassification analytics dashboard

If `ingest_rejections` volume grows past ~500 rows/month after Sprint 1, Sprint 2 picks up bulk actions first.
