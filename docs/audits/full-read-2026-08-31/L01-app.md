# Lane L01-app — src/app top-level pages/routes

Repo: /root/work/dotfiles/fsi-app. All 30 files in the lane list are Next.js
route entry points (pages, a route handler, layout/loading/error/not-found
boundaries) — `refs=0` for every file is expected and correctly reflects
"this file is reached by the Next.js router, not by an import graph edge,"
per the brief's own note. No file in this lane needed a WIRING override.

## Per-file verdicts (path order)

`src/app/admin/factors/page.tsx` — WORKING-WIRED — read-only admin table of `emission_factors` (WO-18 first reader).
- NOTE: `emission_factors` has 6 live rows / src=2 (table-usage.txt) — this page is one of the two live readers and will render a populated table, not the empty state, against current data.

`src/app/admin/page.tsx` — WORKING-WIRED — platform-admin dashboard entry (source health, orgs, members, staged updates, MTD spend, error groups).
- NOTE (L27-46, L52-64): `fetchMtdSpend` and `fetchErrorGroups` both wrap their Supabase calls in `try { … } catch { return zeros/[] }` with no `console.error`/log on the caught exception. Documented intent is "soft-fail when the migration hasn't landed yet," but the empty `catch {}` also swallows any *other* runtime error (bad query, auth failure, network) indistinguishably — the admin dashboard would silently show "$0 spend, 0 errors" whether the feature is simply not yet migrated or actually broken, with nothing in the server log to tell the two apart.

`src/app/auth/callback/route.ts` — WORKING-WIRED — Supabase OAuth/magic-link code-exchange callback; calls `ensurePersonalWorkspace` (best-effort, non-blocking) and `sanitizeReturnPath` (both outside this lane).
- No issues found in this file.

`src/app/community/[slug]/page.tsx` — WORKING-WIRED — single community-group detail view (two Promise.all phases, 8 queries total).
- NOTE: relies on `community_group_members` (1 live row), `community_group_invitations` (0 rows) — see lane-wide community note below.

`src/app/community/browse/page.tsx` — WORKING-WIRED — public group directory.
- NOTE (L64, L366-376): `privacyFilter` is parsed from `searchParams.privacy` but is **only** used to decide whether to print an informational banner ("showing public only") — it is never applied to the Supabase query, which always filters `.eq("privacy","public")` regardless of the param's value. This is explicitly by design per the file's own doc-comment ("browse is public-only by design," "privacy filter is informational") — confirmed not a defect, just worth an owner knowing that `?privacy=` has no filtering effect.

`src/app/community/moderation/page.tsx` — WORKING-WIRED — global moderation queue shell (renders `<ModerationQueue/>`, RLS narrows visibility).
- NOTE: `moderation_reports` has 0 live rows (table-usage.txt) — this queue has never had a real report filed in production; the page and its RLS-narrowing logic are unexercised against live data.

`src/app/community/page.tsx` — WORKING-WIRED — community landing: canonical regional rooms + member-created vertical groups + per-room threads/roster/sign-off state.
- NOTE: heaviest reader of the community-schema tables, all of which are near-empty live: `community_groups` (7 rows), `community_group_members` (1 row), `community_posts` (1 row), `community_post_signoff_requests` (0 rows). The room/thread/sign-off assembly logic (L200-442) is real and non-trivial but has essentially never run against populated data in production.

`src/app/error.tsx` — WORKING-WIRED — client error boundary; reports to `reportClientError` with the Next.js digest. No issues found.

`src/app/invitations/[token]/page.tsx` — WORKING-WIRED — public invitation accept/decline landing, redirects unauthenticated users through `/login`. No issues found.

`src/app/layout.tsx` — WORKING-WIRED — root layout; resolves auth/workspace bootstrap server-side, self-hosts fonts via `@fontsource` (documented Vercel-build-reliability fix replacing `next/font/google`), inlines a theme-restoring script.
- NOTE: `<html data-theme="light">` is a hardcoded SSR default; the inline script overwrites it from `localStorage['fsi-theme']` before paint. Standard FOUC-avoidance pattern, not a defect.

`src/app/loading.tsx` — WORKING-WIRED — global route-level skeleton loader. No issues found.

`src/app/login/page.tsx` — WORKING-WIRED — client email/password login; uses `sanitizeReturnPath` for the post-login redirect target (open-redirect fix referenced as "Wave-α A6," outside this lane). No issues found in this file.

`src/app/map/page.tsx` — WORKING-WIRED — map view; fetches listings, coverage gaps, and community-activity-by-region in parallel.
- NOTE (L54-73): `fetchCommunityActivityByRegion` fails soft to `[]` on any error, including RLS-denial for unauthenticated/anon callers — correct, documented behavior, not a defect.

`src/app/market/[slug]/page.tsx` — WORKING-WIRED — market signal detail; resolves item, related signals, price board, carbon-overlay factors, workspace note, owner.
- NOTE: the file's own comment (L161-174) documents a **previously live, now-fixed** defect: the price-board query used to pass a `legacy_id` into a uuid-typed `.eq("item_id", …)` column, causing Postgres error 22P02, and because the destructure dropped `error`, the failure was silent — both live rows in `published_price_statistics` were unreachable via the only route that serves them. This is historical (fixed 2026-08-30 per the comment) — read as evidence, not reported as a current defect. Verified the current code (L174-191) does resolve to uuid first and does capture+log `priceErr`.

`src/app/market/page.tsx` — WORKING-WIRED — market intel index (severity ledger + `market_series` board). No issues found.

`src/app/not-found.tsx` — WORKING-WIRED — global 404 inside app chrome. No issues found.

`src/app/onboarding/page.tsx` — WORKING-WIRED — 4-step onboarding wizard entry; redirects to `/workspace/new` when the user has no org.
- NOTE (L30): `linkedinEnabled` is gated on `process.env.LINKEDIN_CLIENT_ID` — LinkedIn import renders disabled/"coming soon" whenever that env var is unset. Documented, not a defect.

`src/app/operations/[slug]/page.tsx` — WORKING-WIRED — operations item detail; UUID→slug redirect, matrix eligibility, jurisdiction/source-fallback related items.
- NOTE (L217-224): related-items jurisdiction match uses `.contains("jurisdictions", selfJurisdictions)` as "a reasonable proxy" for true array-overlap semantics — the file's own comment admits this "may under-match" for multi-jurisdiction items. Documented as an accepted limitation for a "convenience affordance, not a critical path," not reported as a defect.

`src/app/operations/page.tsx` — WORKING-WIRED — operations index (category-routed items, fail-closed to the gated RPC; fallback payload used only for cross-referenced regulation rows, not as an ungated item-list fallback). No issues found.

`src/app/page.tsx` — WORKING-WIRED — dashboard home; parallel aggregate/coverage fetch, Suspense-deferred watchlist/coverage-gaps promises passed to the client surface. No issues found.

`src/app/privacy/page.tsx` — WORKING-WIRED — static Privacy Policy content page.
- NOTE (L313-317): the policy text itself states "EU/UK GDPR Article 27 representative will be designated upon onboarding of EU/UK data subjects" — i.e., no representative is currently designated. This is a legal/compliance fact, not a code defect, but is the kind of thing an owner should know is still open.

`src/app/profile/page.tsx` — WORKING-WIRED — thin auth-gate wrapper around `<UserProfilePage>`. No issues found.

`src/app/regulations/[slug]/page.tsx` — WORKING-WIRED — regulation detail; UUID→slug redirect, sections, related-items lookup (verified-gated), owner read from `workspace_item_overrides`.
- No issues found beyond the same soft-fail-to-empty pattern used consistently across the detail pages in this lane.

`src/app/regulations/page.tsx` — WORKING-WIRED — regulations index; counts from `get_surface_counts('regulations')` with documented RPC-fallback chain. No issues found (the "Live events · Fine art" vertical copy in the meta line, L75, is real product terminology — confirmed against `VERTICALS`/`ALL_SECTORS` in `src/lib/constants.ts`, not a lane file but checked for context — not a defect).

`src/app/research/[slug]/page.tsx` — WORKING-WIRED — research finding detail.
- DEAD (L153-162, L196-212): the `theme`-column match branch ("Step 1") of the related-findings selector is dead code in production, **by the file's own documented measurement**: "0 of 38 verified/non-archived Research-surface rows populate `theme` today." Every populated "Related findings" panel runs exclusively through the Step 2 same-source fallback (L215-231). The comment states this is a known, deliberate, un-actioned state (WO-25, option (b) not taken) rather than an oversight — reported here as DEAD because the code path cannot execute against current data, per the brief's definition, regardless of intent.

`src/app/research/page.tsx` — WORKING-WIRED — research pipeline index; intersects pipeline rows with the category-routed allow-list.
- INCOMPLETE (L95-96): `owner: null` and `partnerFlagged: false` are hardcoded literals on every `ResearchPipelineItem`, with the adapter comment stating they are "placeholders preserved from the previous fetcher pending the owner-attribution work" — these two fields can never reflect real data regardless of what's in the pipeline row; the UI fields exist but are permanently unpopulated.

`src/app/settings/page.tsx` — WORKING-WIRED — settings page; slim fetcher (`getSettingsData`) intentionally drops ~11 queries not consumed by this surface. No issues found.

`src/app/signup/page.tsx` — WORKING-WIRED — client email/password signup; client-side session check redirects already-authenticated users to `/login`; carries `redirect` param through email verification back to the original invitation flow. No issues found.

`src/app/watchlist/page.tsx` — WORKING-WIRED — per-user/team watchlist; force-dynamic (cookie-scoped read), documented as unable to be prerendered. No issues found.

`src/app/workspace/new/page.tsx` — WORKING-WIRED — "no workspace yet" landing; redirects home if the user already has an org. No issues found.

## Lane summary

**Counts by status:** WORKING-WIRED — 30/30. No STUB, INCOMPLETE-status (whole file), DEAD-HISTORICAL, OPERATOR-TOOL, WORKING-UNWIRED, DEFECTIVE, or TEST files in this lane. Two files carry a sub-file INCOMPLETE/DEAD annotation (see below) while remaining overall WORKING-WIRED, since the page itself renders and is reachable.

**Findings, ranked:**

1. **The entire `/community/*` surface (7 of 30 files in this lane) runs against essentially empty production data.** `community_posts`=1 row, `community_group_members`=1 row, `moderation_reports`=0 rows, `community_group_invitations`=0 rows, `community_post_signoff_requests`=0 rows (table-usage.txt). The room/thread/sign-off/moderation-queue logic in `community/page.tsx`, `community/[slug]/page.tsx`, `community/moderation/page.tsx` is real, non-trivial, well-commented code, but it is effectively unexercised by real usage — a defect in this code path would very likely not have been caught by production traffic. Not a code defect in itself; an owner-visibility finding.
2. **`src/app/research/[slug]/page.tsx` L153-212 — DEAD code, self-documented.** The theme-column match branch of the related-findings selector cannot fire against current data (0/38 rows have non-null `theme`); every "Related findings" render goes through the same-source fallback only. Confirmed by the file's own comment, not inferred.
3. **`src/app/research/page.tsx` L95-96 — INCOMPLETE.** `owner` and `partnerFlagged` are hardcoded `null`/`false` on every research pipeline item; the corresponding UI affordances (if any) can never show real values.
4. **`src/app/admin/page.tsx` L27-64 — silent-failure risk.** `fetchMtdSpend`/`fetchErrorGroups` catch-and-zero with no logging, so "not yet migrated" and "actually broken" are indistinguishable from the admin's perspective — worth a log line even if the fail-soft return value stays the same.
5. **`src/app/market/[slug]/page.tsx` — a previously-live, now-fixed silent-failure defect is documented in the file's own comments** (price-board query passing a legacy_id into a uuid column, swallowed error). Verified the fix is in place in the current code (captures and logs `priceErr`). Reported for completeness/context, not as an open defect.
6. **`src/app/privacy/page.tsx` — no EU/UK GDPR Art. 27 representative currently designated**, per the policy's own text. Compliance fact, not a code defect.
7. `src/app/community/browse/page.tsx` — the `?privacy=` search param is parsed but never used to filter the query (only to toggle a banner). Confirmed intentional/documented, listed for completeness.
8. `src/app/operations/[slug]/page.tsx` — jurisdiction-match related-items query uses `.contains()` as an admitted imprecise proxy for array overlap ("may under-match" per the file's own comment). Documented, accepted limitation, not reported as a defect.

**Coverage attestation:** files read in full: 30/30, lines read: 5,004 (sum of the lane list's line counts; no file exceeded 2,000 lines so none required chunked reads). No file was skipped or partially read.
