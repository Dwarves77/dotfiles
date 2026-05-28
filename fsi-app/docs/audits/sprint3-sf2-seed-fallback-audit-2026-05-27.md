---
title: SF-2 Seed-Fallback Audit
date: 2026-05-27
scope: Read-only investigation of all seed-data fallback paths in Caro's Ledge fsi-app
status: Investigation complete; awaiting operator fix-shape pick
related_dispatches: SF-1 (silent-fallback fail-fast, shipped 130af41)
---

# Sprint 3 SF-2 — Seed-Fallback Audit

## Executive Summary

The platform implements **six fallback paths** where the 119-row seed array (`src/data/seed-resources.json`) surfaces as live data when database reads fail. Of these:

- **Three render directly to customers** (Dashboard `/`, Regulations `/regulations`, Settings `/settings`, Map `/map`) — actually **four**, see Section 2.
- **Three degrade to empty-state safely** (Watchlist, Coverage Gaps, Awaiting Review widgets).

**Risk profile: MEDIUM-HIGH.** The seed array pre-dates the source-trust schema and carries no `source_id`, tier classification, or integrity flags. When live Supabase reads fail or are skipped, the entire 119-row seed becomes the authoritative dataset for that surface — full-corpus replacement, not partial merge.

**Trigger conditions across the four customer-visible paths:** null `orgId`, RPC error, 10s timeout, missing `SUPABASE_SERVICE_ROLE_KEY` (post-SF-1 this now throws cleanly but the seed-fallback catch still fires), Supabase URL/anon-key misconfiguration.

**Integrity-rule concern:** The standing rule (CLAUDE.md) — "no fabricated data may render as fact" — is at risk because seed content renders without source provenance when failures occur. The 119 rows have no visual signal distinguishing them from live DB content.

## Section 1 — Inventory Table

| Route | Data Fetcher | Fallback Trigger | Customer Visibility | Leakage Shape | Risk |
|-------|---|---|---|---|---|
| `/` | `getAppData()` → `fetchDashboardData()` | Timeout (10s) / RPC error / null `orgId` / svc-role key missing | **Yes — primary** | Full 119 rows + changelog + disputes + xrefs + supersessions | **HIGH** |
| `/regulations` | `getListingsOnly()` → `fetchListingsOnly()` | Timeout / RPC error / null `orgId` | **Yes — primary** | Full 119 rows (domain=1 filter → ~80 items render) | **HIGH** |
| `/settings` | `getSettingsData()` → `fetchSettingsData()` | Timeout / RPC error / null `orgId` | **Yes — archive viewer** | Full 119 rows + archived (~4) + supersessions | **HIGH** |
| `/map` | `getMapData()` → `fetchMapData()` | Timeout / RPC error / null `orgId` | **Yes — geographic viz** | Full 119 rows + xrefPairs (drive edge topology) | **HIGH** |
| Dashboard Watchlist | `getWatchlist()` | Migration 060 missing / RPC error / userId null | No | Empty `[]` | LOW |
| Dashboard Coverage Gaps | `getCoverageGaps()` | Migration 061 missing / RPC error / orgId null | No | Empty `[]` | LOW |
| Dashboard Awaiting Review | `getAwaitingReview()` | Migration 063 missing / RPC error / userId null | No | Empty `[]` | LOW |

## Section 2 — Customer-Visible Leakage Paths (detailed)

### Path 1: Dashboard Home (`/`) — `getAppData()`

- **Location:** [data.ts:114-125](../../src/lib/data.ts#L114-L125) (catch block at line 121 calls `appDataSeedFallback()`)
- **Render:** [page.tsx:109](../../src/app/page.tsx#L109) → `<HomeSurface initialResources={data.resources} />`
- **Triggers:** 10s timeout (`Promise.race()` at lines 71-79), null `orgId` from `resolveOrgIdFromCookies()`, RPC error from `get_workspace_intelligence_dashboard`, missing `SUPABASE_SERVICE_ROLE_KEY` (post-SF-1 throws), Supabase URL/anon-key unconfigured
- **What renders:** All 119 seed rows + seed changelog + seed disputes + seed xrefPairs + seed supersessions
- **Customer visibility:** Home is the primary landing surface; data appears on every visit without source attribution
- **Integrity risk:** HIGH — `DashboardHero` tiles count seed data; `WeeklyBriefing` renders seed briefs directly

### Path 2: Regulations Index (`/regulations`) — `getListingsOnly()`

- **Location:** [data.ts:176-200](../../src/lib/data.ts#L176-L200)
- **Render:** [page.tsx:96](../../src/app/regulations/page.tsx#L96) → `<RegulationsSurface initialResources={regulationResources} />`
- **Domain filter:** client-side `domain === 1` (`REGULATIONS_DOMAIN`) on the seed
- **Triggers:** Same as Path 1
- **What renders:** Filtered to ~80 regulation items from the 119-row seed
- **Customer visibility:** Regulations is a primary page; kanban, search, and chip filters operate on seed data
- **Integrity risk:** HIGH — Masthead meta counts jurisdictions from seed items

### Path 3: Settings + Archive (`/settings`) — `getSettingsData()`

- **Location:** [data.ts:287-311](../../src/lib/data.ts#L287-L311)
- **Render:** [page.tsx](../../src/app/settings/page.tsx) → `<SettingsPage initialResources={data.resources} initialArchived={data.archived} />`
- **Triggers:** Same as Paths 1-2
- **What renders:** All 119 seed rows + archived set (~4 ghost items) + supersessions
- **Customer visibility:** Archive Viewer allows users to search and filter seed archived items; Export Builder operates on seed data
- **Integrity risk:** HIGH — Archive is a user-facing data store; seed items are treated as durable workspace state

### Path 4: Map View (`/map`) — `getMapData()` + `getListingsMapData()`

- **Location:** [data.ts:210-240](../../src/lib/data.ts#L210-L240) and [data.ts:248-278](../../src/lib/data.ts#L248-L278)
- **Render:** [page.tsx](../../src/app/map/page.tsx) → `<MapPageView resources={data.resources} />`
- **Triggers:** Same as Paths 1-3
- **What renders:** All 119 seed rows + xrefPairs (drive cross-reference edges on map)
- **Customer visibility:** Geographic intelligence surface; seed items render as spatial nodes with phantom connections
- **Integrity risk:** HIGH — Seed xrefPairs (e.g., `["g2", "c1"]`) connect seed items without validation; can create confusing topology if user's workspace has neither item

## Section 3 — Null-orgId × SF-1 Interaction

**SF-1 hardened `getServiceSupabase()`** to throw on missing service-role key. This is upstream of the four leakage paths. The four customer-visible fetchers (`getAppData`, `getListingsOnly`, `getSettingsData`, `getMapData`) wrap the call in try/catch + seed fallback. When service-role key is missing, the throw is caught and seed renders — same shape as the null-orgId path.

**Null-orgId path (independent of SF-1):**

1. `resolveOrgIdFromCookies()` returns null for unauthenticated or no-org-membership users
2. `cachedAppData(null)` still executes the RPC with `p_org_id = null`
3. RPC returns zero rows (no workspace for null org)
4. Fetcher checks `if (error || !items?.length)` and returns empty array
5. `getAppData()` catch block enters because the empty array doesn't raise an error — it's silently caught
6. **`appDataSeedFallback()` activates**

Null-orgId is treated identically to RPC error or timeout — all three result in the catch block and seed fallback. No upstream guard says "if `orgId` is null, render empty/error state" before the RPC fires.

**Service-role callers that bypass seed fallback (widget paths):** `getCriticalItemsSnapshot()`, `getSurfaceCoverageSnapshot()`, `getDashboardCredibility()` wrap `getServiceSupabase()` in try/catch and return empty objects on throw — they **do NOT leak seed data**, they degrade to empty state (safe).

## Section 4 — Anonymous-User Posture

**Open question:** Is `src/middleware.ts` enforcing authentication on the four primary surfaces?

- **If surfaces are public previews:** Seed fallback is a feature (preview data for non-members). Action: label seed data visually ("Preview data — log in for live intelligence") and document the intent in CLAUDE.md.
- **If surfaces are members-only:** Seed fallback is a leakage (preview data leaks to anonymous viewers). Action: move the fallback check upstream (middleware or layout) and render auth-required state instead.

The audit cannot resolve this from static analysis alone — operator-side check of middleware + intent declaration needed.

## Section 5 — Recommended Fix Shapes

**Option A: Remove fallback entirely (members-only surfaces).**
- Delete `appDataSeedFallback()` function.
- Return `{ resources: [], archived: [], ... }` on error.
- Result: empty-state rendering; no seed leaks.
- Trade-off: connection-blip users see blank pages.
- Best for: member-only surfaces where downtime is acceptable.

**Option B: Replace fallback with explicit error UI (RECOMMENDED).**
- Return sentinel shape like `{ resources: [], archived: [], _error: "Data temporarily unavailable" }`.
- Add error banner to pages: "Database temporarily unavailable. Please try again."
- Keep page from blank-screening; signal degradation to user.
- Trade-off: requires UI changes on 4 pages.
- Best for: any surface where graceful degradation matters.

**Option C: Keep fallback but log/alert on activation (RECOMMENDED for observability).**
- Add `console.warn("[seed-fallback] Rendering seed data, trigger=<reason>")` to `appDataSeedFallback()`.
- Optional: POST to Slack webhook (worker secret) when fallback triggers in production.
- Retain current user-facing behavior; add operational visibility.
- Trade-off: minimal code change; requires monitoring discipline.
- Best for: single-tenant pre-pilot when seed fallback is intentional last-resort.

**Option D: Conditional fallback by role (complex, not recommended).**
- Admins see seed fallback with banner; regular members see error state.
- Trade-off: role-aware logic adds complexity.
- Best for: only if tiered degradation is required.

**Pairing:** B and C are not mutually exclusive. The cleanest composition is **B + C** — render the error banner to the customer, log + Slack-alert for ops, drop the seed render entirely (or behind an admin-only flag).

## Section 6 — Risks + Open Questions

**R1 — Integrity-Rule violation.** Standing rule: "no fabricated data may render as fact." Gap: seed data renders without visual signal that it's cached/preview. Mitigation: Option B (banner) OR Option C (log activation) OR retroactively add `source_id` to seed JSON.

**R2 — Source-attribution gap.** Seed resources pre-date source-trust schema; carry no `source_id`, tier, or integrity flags. Consequence: appear source-less to customer.

**R3 — Null-orgId ambiguity.** Are primary surfaces public previews or members-only? Current state: unclear from code alone (operator-side middleware check needed).

**R4 — Map xref topology.** Seed `xrefPairs` reference legacy IDs; edges may link to "ghost" nodes if workspace has neither endpoint. Mitigation: filter `xrefPairs` to exclude dangling references before map render.

**R5 — Production trigger status.** Is seed fallback currently activating in production Vercel? Verification options: (a) visit prod `/` as unauth user, (b) check browser console, (c) query Vercel function logs, (d) verify `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel env vars.

## Section 7 — Call Sites Quick Reference

| Surface | Page Component | Fetcher | Fallback Function | Render |
|---------|---|---|---|---|
| Dashboard | `src/app/page.tsx` | `getAppData()` ([data.ts:114](../../src/lib/data.ts#L114)) | `appDataSeedFallback()` ([data.ts:86](../../src/lib/data.ts#L86)) | `<HomeSurface>` ([page.tsx:109](../../src/app/page.tsx#L109)) |
| Regulations | `src/app/regulations/page.tsx` | `getListingsOnly()` ([data.ts:176](../../src/lib/data.ts#L176)) | `appDataSeedFallback()` | `<RegulationsSurface>` ([page.tsx:96](../../src/app/regulations/page.tsx#L96)) |
| Settings | `src/app/settings/page.tsx` | `getSettingsData()` ([data.ts:287](../../src/lib/data.ts#L287)) | `appDataSeedFallback()` | `<SettingsPage>` |
| Map | `src/app/map/page.tsx` | `getMapData()` ([data.ts:210](../../src/lib/data.ts#L210)) | `appDataSeedFallback()` | `<MapPageView>` |

## Section 8 — Next Steps for Operator

1. **Verify middleware** — check whether `src/middleware.ts` enforces auth on primary surfaces.
2. **Clarify intent** — are surfaces public previews or members-only?
3. **Check production status** — is `SUPABASE_SERVICE_ROLE_KEY` set in Vercel? Is seed fallback currently triggering?
4. **Pick fix shape** — A / B / C / B+C / D.
5. **Implement + test** — verify fallback behavior in dev (force the trigger) and production (post-deploy).

Investigation-only. No code changes recommended in this audit; fix shapes are for operator decision before implementation lands.
