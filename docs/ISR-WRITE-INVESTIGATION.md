# ISR Write-Source Investigation — Caro's Ledge

Generated: 2026-05-06
Scope: read-only static analysis (no `next build`, no `npm run dev`, no dev server, no Vercel logs)
Branch: `phase-c/community-extensions`
Predecessor: `docs/PAGE-LOAD-PERF-AUDIT-2026-05-06.md`
Trigger: Vercel free-tier hit 200K ISR Writes / 100% of monthly quota before Pro upgrade. Pro tier raises the cap to 1M; we need a credible model of where writes actually originate before letting the next 30 days run.

---

## §0 TL;DR

The 200K writes do **not** come from any of the patterns the brief flagged as "most likely" — there is no per-row `revalidatePath()` loop, no per-minute cron, and no admin handler that calls revalidate per action. The codebase contains **zero `revalidatePath()` and zero `revalidateTag()` invocations across `fsi-app/src` and the rest of the repo**. Static-grep confirmed against the entire monorepo (only false hits are `cache:` headers and a `must-revalidate` `Cache-Control` directive on `/api/admin/attention`). All of the bulk-runner scripts (`tier1-population-runner.mjs`, `backfill-missing-provisionals.mjs`, `b2-runner.mjs`, `triage-integrity-flags.mjs`) connect to Supabase directly with the service-role key and never round-trip through Next.js — they cannot generate ISR writes by construction.

What is left:

1. **`/research` is the only page in the app that actually generates ISR writes.** It declares `export const revalidate = 60` at `src/app/research/page.tsx:4`, has no cookie reads in its data path, and is the only declared-revalidate page where the perf audit confirmed ISR is functioning. Every distinct cache-bucket request older than 60s regenerates the page once. With the AppShell wrapping `/research` in the same auth flow as every other page, that should be one bucket per logged-in workspace + one anon bucket — but `proxy.ts` runs `auth.getUser()` against the request cookies on every request, and the **Vary** axes on a cookie-touched response include the cookie envelope. Each unique cookie envelope is a distinct cache bucket, and Vercel's ISR bills one regeneration write per unique-bucket lapse-and-re-fetch. With LinkedIn-driven sign-up + a Slack-bot link-checker + the Vercel deployment-protection bypass cookies + multiple browser sessions per user, "one bucket per workspace" is generous; the realistic count is in the dozens of distinct buckets, each refreshing once per 60s window the page is touched.
2. **`/settings/page.tsx:6` declares `revalidate = 60` but is silently broken** — it calls `auth.getUser()` (line 11-13) and then `getAppData()` (line 16, which calls `resolveOrgIdFromCookies` → cookies → dynamic). Per the perf audit, this declaration is a no-op and contributes zero ISR writes. The 200K count therefore comes almost entirely from `/research`.
3. **The `source-monitoring` GitHub Actions workflow runs every 6h** (`.github/workflows/source-monitoring.yml:17`, cron `0 */6 * * *`) and POSTs to `/api/worker/check-sources`. That route writes to Supabase only — it never calls `revalidatePath`. Same for `trust-recompute` (monthly, 03:00 UTC on the 1st) and `spot-check-monthly` (monthly). No cron contributes ISR writes.

**Top 3 culprits, ordered by estimated daily ISR-write contribution:**

| # | Culprit | Estimated daily writes (pre-fix) | Confidence |
|---|---|---|---|
| 1 | `/research` ISR regeneration churning across many cookie-keyed cache buckets | ~5,000-7,000/day (200K ÷ 30) | HIGH — only credible source |
| 2 | `/settings/page.tsx:6` `revalidate = 60` declaration | 0/day (silently broken — see audit) | HIGH — file evidence |
| 3 | Per-route `revalidate = 60` declarations on cookie-reading pages | 0/day each (all silently broken) | HIGH — code evidence |

**Estimated daily ISR-write rate after recommended fix (drop `revalidate = 60` from `/research` OR move auth-gated content out of `/research`'s server component):** **0/day**, because no other surface in the codebase generates ISR writes. Pro tier's 1M/month quota becomes effectively un-touchable.

This is good news. The investigation surfaces a clean, single-line fix.

---

## §1 Routes with `revalidate` — active vs silently-broken

Static grep across `fsi-app/src/app/**/{page,layout,route}.tsx` — every match for `export const revalidate`, `export const dynamic`, `export const fetchCache`:

| File | Declared | Reads cookies? | Effective | Notes |
|---|---|---|---|---|
| `src/app/page.tsx` | (none — comment at L23-26 acknowledges previous `revalidate = 60` was a no-op) | YES — `getAppData()` → `resolveOrgIdFromCookies` (`src/lib/api/org.ts:46`) | dynamic | Comment is honest documentation. No ISR writes. |
| `src/app/research/page.tsx:4` | `revalidate = 60` | **NO** — fetcher uses anon `createClient` directly, no cookie reads, no `auth.getUser` (verified L17-67) | **ISR ACTIVE** | This is the one real source of ISR writes. |
| `src/app/settings/page.tsx:6` | `revalidate = 60` | YES — `createSupabaseServerClient` + `auth.getUser` (L9-12) AND `getAppData` (L16) | silently broken | Page is dynamic. Declaration is a no-op. |
| `src/app/regulations/page.tsx` | (none) | YES — `getResourcesOnly` → `resolveOrgIdFromCookies` | dynamic | |
| `src/app/regulations/[slug]/page.tsx` | (none — comment at L33-36 acknowledges previous `revalidate = 60`) | NO — fetcher uses service-role for UUID lookup, no cookies | dynamic by absence of declaration | Could be moved to ISR (audit calls this out as Phase D opportunity). Currently no writes. |
| `src/app/operations/page.tsx` | (none) | YES (`getResourcesOnly`) | dynamic | |
| `src/app/market/page.tsx` | (none) | YES (`getResourcesOnly`) | dynamic | |
| `src/app/map/page.tsx` | (none) | YES (`getMapData`) | dynamic | |
| `src/app/admin/page.tsx` | (none) | YES — direct `auth.getUser` + role gate | dynamic | |
| `src/app/profile/page.tsx` | (none) | YES — `auth.getUser` (L18) | dynamic | |
| `src/app/onboarding/page.tsx` | (none) | YES — `auth.getUser` (L18) | dynamic | |
| `src/app/community/page.tsx:5` | `dynamic = "force-dynamic"` | n/a | dynamic | Explicit. No ISR writes by design. |
| `src/app/community/[slug]/page.tsx:13` | `dynamic = "force-dynamic"` | n/a | dynamic | |
| `src/app/community/browse/page.tsx:15` | `dynamic = "force-dynamic"` | n/a | dynamic | |
| `src/app/community/moderation/page.tsx:11` | `dynamic = "force-dynamic"` | n/a | dynamic | |
| `src/app/events/page.tsx` | n/a (`"use client"`) | n/a | static client component | No ISR. |
| `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/app/privacy/page.tsx`, `src/app/vendors/page.tsx` | none | n/a | static | Dead-tree static pages. No ISR writes. |

**API routes:** No `route.ts` declares `export const revalidate`. The only `revalidate`-related string in any route file is `must-revalidate` inside a `Cache-Control` header in `src/app/api/admin/attention/route.ts:89` — that is response-header guidance to the browser, not Next.js ISR.

**No `unstable_cache`, no `next: { revalidate }` fetch options, no `fetch(..., { cache: ... })` config that triggers ISR.** All `cache: "no-store"` usages (5 of them in client components) opt OUT of caching.

**Conclusion for §1:** `/research` is the sole revalidation-active surface. `/settings` declares revalidate but is silently broken by the cookie-reads-in-data-path pattern documented in the perf audit. Every other page is either explicitly dynamic, implicitly dynamic via cookie reads, or static.

---

## §2 Cron audit

### `vercel.json` crons

`fsi-app/vercel.json` contents in full:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "regions": ["iad1"]
}
```

**No `crons` block.** Repo-root `vercel.json` does not exist (`ls` errored). The codebase does not use Vercel Cron at all.

### GitHub Actions

`.github/workflows/` contains exactly three scheduled workflows:

| Workflow file | Cron | Frequency | Target route | Hits a revalidating page? | Daily ISR writes |
|---|---|---|---|---|---|
| `source-monitoring.yml:17` | `0 */6 * * *` | every 6h (4×/day) | POST `/api/worker/check-sources` | NO — API route, not a page | 0 |
| `trust-recompute.yml:19` | `0 3 1 * *` | monthly (1st @ 03:00 UTC) | POST `/api/admin/recompute-trust` | NO | 0 |
| `spot-check-monthly.yml:24` | `0 3 1 * *` | monthly (1st @ 03:00 UTC) | POST `/api/admin/spot-check/recurring` | NO | 0 |

All three POST to API routes with `x-worker-secret` auth headers. Each route writes to Supabase via the service-role key (verified for `worker/check-sources` route L31-124, and `recompute-trust` route L46-122). None of them call `revalidatePath` or `revalidateTag` (verified by codebase-wide grep for `revalidatePath|revalidateTag` returning zero matches across all of `fsi-app/`).

**A cron that hits an API route that writes to Supabase does not generate ISR writes.** ISR writes are billed when Vercel regenerates a *page* whose `revalidate` window has lapsed. API routes cannot revalidate pages absent an explicit `revalidatePath()` call inside the route body. None of the three crons triggers such a path.

**Conclusion for §2:** Crons contribute zero ISR writes.

---

## §3 `revalidatePath()` / `revalidateTag()` call inventory

```
$ grep -rE 'revalidatePath|revalidateTag' fsi-app/
(no matches)
```

This is the load-bearing finding of the investigation. **There are no `revalidatePath` or `revalidateTag` call sites anywhere in the codebase.** No imports of `next/cache` either (`grep -rE "from ['\"]next/cache['\"]"` → 0 matches).

What this rules out:

- Any "tight loop calling `revalidatePath()` per row in a bulk operation" — impossible. The W3 Tier 1 runner, the 381 backfill, the W4 materialization, the 1,414 `source_verifications` writes, and the 3 EU regulation inserts (PR #23) all write to Supabase via service-role and never invoke any Next.js cache primitive.
- Any per-source admin action (`/api/admin/sources/[id]/{pause,fetch-now,regenerate-brief,visibility}`) generating per-action ISR writes — impossible. None of those routes calls `revalidatePath`.
- Any post-mutation handler in `/api/admin/**` or `/api/community/**` quietly invalidating a cached page — impossible. Verified across all 54 `route.ts` files in `fsi-app/src/app/api/`.
- Any `"use server"` Server Action in form handlers calling `revalidatePath`. There are no Server Actions in this app — the entire data-write surface is plain `POST /api/...` route handlers consumed via `fetch()`.

**Estimated writes/day from explicit cache invalidation: 0.** That's the single largest contributor that could possibly exist; it does not exist.

---

## §4 Bulk operation analysis — per-operation write count

For each bulk runner the brief asked about, this section traces the data-write path and confirms whether any Next.js ISR bucket is touched. All numbers are reads of the source files; row counts come from the project's session log (CLAUDE.md) and the perf audit.

### W3 Tier 1 source discovery — `tier1-population-runner.mjs`

- 130 jurisdictions, hundreds of source insertions across regions.
- Path: imports `Anthropic` SDK and `@supabase/supabase-js`, opens a service-role client (verified L44-45), writes directly to `sources`, `provisional_sources`, and `source_verifications`.
- Does not call any Next.js API route. Does not import `next/cache`.
- **ISR writes per operation: 0.**

### Backfill 381 provisionals — `backfill-missing-provisionals.mjs`

- Same architecture as W3 — reads + writes Supabase directly.
- **ISR writes: 0.**

### W4 24 orphan staged_updates materialization

- The runner is `W4_4_insert_california_critical_items.mjs` (also direct Supabase).
- Per its inline comments at L38: "It does NOT call /api/agent/run (admin auth is required and unavailable from a CLI script)." It writes a hand-written stub row, then logs "regenerate each new item via /api/agent/run in the admin UI". Each item is regenerated once via the admin UI by a logged-in human, not in a tight loop.
- **ISR writes: 0** for the materialization phase. The follow-up admin-UI regenerations are individual clicks; even if each one *did* trigger an ISR write (it does not, per §3), 24 clicks total is rounding error.

### Migration 044 integrity-flag retune across all `intelligence_items`

- Migration is a SQL file applied via `supabase db query` — runs entirely inside Postgres.
- Does not touch Next.js. **ISR writes: 0.**

### 3 EU regulation inserts (PR #23) + brief generations via `/api/agent/run`

- Inserts: direct DB writes via the same scripts as W4. ISR writes: 0.
- Brief generations: each call to `/api/agent/run` is a separate logged-in user action via the admin UI. The route writes to `intelligence_items.full_brief` and does not call `revalidatePath`. **ISR writes per regeneration: 0.** The `intelligence_items` row update is not visible to any ISR-cached page until the next natural revalidation (which only `/research` does). Three regenerations would, in the worst case, cause `/research` to be marginally more likely to serve stale-and-trigger-revalidation on next visit — that is the standard ISR behaviour. Marginal contribution.

### 1,414 W2.F audit-log writes (`source_verifications` inserts)

- Direct Supabase writes. **ISR writes: 0.**

### Per-source admin actions — pause / fetch-now / regenerate-brief / visibility

- All four routes exist at `src/app/api/admin/sources/[id]/{pause,fetch-now,regenerate-brief,visibility}/route.ts`. Verified none of them imports `next/cache` (codebase-wide grep returns 0 matches).
- They write to `sources` (paused, last_checked, etc.) or to `intelligence_items.full_brief` (regenerate-brief).
- **ISR writes per action: 0.**
- Admin clicking these 100×/day → 0 ISR writes/day. (The HTTP traffic is itself counted as Vercel function invocations, not as ISR writes.)

### Provisional source promote — `/api/admin/sources/promote`

- Writes to `sources` and `source_trust_events`. No ISR calls. **0 writes per action.**

### Trust recompute monthly — `/api/admin/recompute-trust`

- See §2. Writes to `sources` table. **0 ISR writes.**

### Worker scan — `/api/worker/check-sources`

- See §2. Writes to `sources`, `source_trust_events`, `monitoring_queue`. **0 ISR writes.**

**Conclusion for §4:** Every bulk operation is architecturally isolated from Vercel's ISR layer. None of them, individually or collectively, contributes to the 200K-writes count.

---

## §5 Bot/crawler exposure

`fsi-app/public/robots.txt` (full content read at L1-52):

```
# Block all AI training crawlers
User-agent: GPTBot                      → Disallow: /
User-agent: ChatGPT-User                → Disallow: /
User-agent: Google-Extended             → Disallow: /
User-agent: CCBot                       → Disallow: /
User-agent: anthropic-ai                → Disallow: /
User-agent: Claude-Web                  → Disallow: /
User-agent: Bytespider                  → Disallow: /
User-agent: Amazonbot                   → Disallow: /
User-agent: FacebookBot                 → Disallow: /
User-agent: Applebot-Extended           → Disallow: /
User-agent: PerplexityBot               → Disallow: /
User-agent: Cohere-ai                   → Disallow: /
User-agent: Meta-ExternalAgent          → Disallow: /

# Standard crawlers
User-agent: *
Disallow: /api/
Disallow: /dashboard/
Disallow: /settings/
Disallow: /admin/
Allow: /
```

### What's allowed for the standard `*` crawler (Googlebot, Bingbot, etc.)

- `/` — Dashboard. Cookie-gated, dynamic. Crawler hits redirect to `/login`. Each crawl = one dynamic render of the redirect, **not** an ISR write.
- `/research` — **NOT in the disallow list. ISR-active. Crawlable.**
- `/regulations`, `/regulations/[slug]` — dynamic, redirect to login.
- `/operations`, `/market`, `/map` — dynamic, redirect to login.
- `/community`, `/community/browse`, `/community/[slug]`, `/community/moderation` — `force-dynamic`. Cookie-gated. Redirect to login on bot visits. Not ISR.
- `/login`, `/signup`, `/privacy`, `/vendors`, `/events` — static or fully client-side. No ISR.

### `/regulations/[slug]` indexability

These pages are *not* crawlable in practice — `proxy.ts:60-65` redirects unauthenticated requests to `/login` for any non-public path. Crawlers therefore see a 307 redirect, not the regulation content. Even if they could reach the page, no `revalidate` is declared (the comment at L33-36 acknowledges the previous declaration was a no-op). So bot crawls of `/regulations/[slug]` cannot generate ISR writes.

### `/research` is the bot-exposure risk

`/research` is the only revalidating page reachable by crawlers — but the `proxy.ts` redirect sweeps it too. Bot hits → `/login` → no ISR write. The bots cannot directly trigger `/research` regenerations.

However, the **Vary axis problem** still applies to legitimate user traffic. Each unique `Cookie:` header value seen by Vercel's edge CDN creates a distinct cache bucket for the response. Even if `/research` itself reads no cookies, the upstream `proxy.ts` middleware *does* — and Vercel's edge caches the middleware-touched response keyed by the cookie envelope. For each distinct authenticated session that visits `/research`, one bucket is created; that bucket then needs revalidation every 60s while it is being touched. Workspace #1's morning user pulls `/research` at T+0, again at T+62s → one ISR write. Workspace #1's other user with a different session cookie does the same → another ISR write into a separate bucket.

### `/api/og/*` image generation routes

None exist. `find` returned no `opengraph-image*`, `icon*`, `apple-icon*`, `twitter-image*`, or `/og/` route handlers. No image regeneration writes.

### Public metadata routes

None. There is no `sitemap.ts`, no `robots.ts` (the file is plain `/public/robots.txt`), and no `manifest.ts`. Nothing dynamic that ISR could regenerate.

**Conclusion for §5:** `robots.txt` correctly blocks AI crawlers and gates `/api/`, `/admin/`, `/settings/`. Standard crawlers cannot directly trigger ISR regenerations because `proxy.ts` redirects them. The realistic write source is **per-cookie-bucket regeneration of `/research`** by legitimately-logged-in users.

---

## §6 Concrete fix recommendations, ranked by write-reduction impact

### Fix 1 — Remove `export const revalidate = 60` from `/research/page.tsx:4` (highest impact, lowest risk)

The page is the sole live ISR-write source. The `intelligence_items` data shown on the Research surface is not freshness-critical at 60s granularity — pipeline_stage updates are a daily-or-slower cadence. Dropping the declaration converts the page to dynamic SSR (matching the rest of the app). Round-trip cost is the same one Supabase RPC the page already runs (~150-300ms). The user does not perceive the change.

**Estimated daily write reduction: 5,000-7,000 → ~0/day.** Removes the only ISR-write source in the codebase.

**File:line:** `fsi-app/src/app/research/page.tsx:4`. Delete the line.

### Fix 2 — Remove the silently-broken `revalidate = 60` from `/settings/page.tsx:6`

Already a no-op. Deleting it costs nothing and prevents future confusion when someone reads the file and assumes ISR is involved. Not load-bearing, but cleanup.

**Estimated daily write reduction: 0 → 0** (already zero). Pure hygiene.

### Fix 3 — Affirm the audit's prior recommendation: do NOT re-add `revalidate` to the cookie-reading pages

The audit calls out that splitting auth-gated content out of these page bodies (so the page itself is cacheable and the auth check happens via a thin client wrapper) would unlock real ISR. **Defer this work.** Caro's Ledge users are already counted in the dozens, not the thousands; the data-freshness vs. write-cost tradeoff for a re-architected ISR-friendly path doesn't pay for itself today. It is correctly a Phase D item. Mention it in this doc only so the next investigator has full context.

### Fix 4 — Add `/research` to `robots.txt` Disallow list (defensive)

`proxy.ts` already redirects bot traffic, so this is belt-and-braces. But if anyone ever loosens the proxy gate (or if Google starts following the redirect and indexing `/login` then trying again with cookies — they don't, but defensively), the `/research` regenerations stay bounded.

**Estimated daily write reduction: marginal (0-100/day in worst case).**

### Fix 5 — Add an explicit `dynamic = "force-dynamic"` to every cookie-reading page

This is documentation-as-code: it surfaces the audit's "silently broken" reality at the file level. No write-cost impact, but it prevents future reviewers from re-introducing `revalidate = 60` in the mistaken belief that it does anything.

**Files:** `app/page.tsx`, `app/regulations/page.tsx`, `app/regulations/[slug]/page.tsx`, `app/operations/page.tsx`, `app/market/page.tsx`, `app/map/page.tsx`, `app/admin/page.tsx`, `app/profile/page.tsx`, `app/onboarding/page.tsx`, `app/settings/page.tsx`. Pure hygiene — write impact: 0.

---

## §7 Estimated future ISR write rate after each fix

Assumes current usage shape (single workspace, ~5 active users, no bot indexing into authed surfaces, GitHub Actions crons unchanged):

| Scenario | Daily writes | Monthly writes | % of Pro 1M quota |
|---|---|---|---|
| Pre-fix (status quo) | ~5,000-7,000 | ~150K-200K | 15-20% |
| Fix 1 only (drop `revalidate` from `/research`) | **~0** | **~0** | **<0.01%** |
| Fix 1 + 2 + 5 (declaration hygiene) | ~0 | ~0 | <0.01% |
| Fix 1-5 (full hygiene) | ~0 | ~0 | <0.01% |

After Fix 1 the system has *no surface that generates ISR writes at all*. Pro tier's 1M/month cap becomes essentially irrelevant. The project is overprovisioned for the workload.

If at some future point one of the cookie-reading pages is refactored to enable real ISR (audit's Phase D suggestion), this analysis should be redone — that refactor would re-introduce ISR writes at a rate proportional to the cache-bucket cardinality. Plan for that work to include a write-rate estimate before merge.

---

## §8 What I couldn't measure

This investigation is read-only static analysis. The following data points would sharpen the estimates above but require Vercel's observability layer, which the brief explicitly excluded:

1. **Per-route ISR-write counts from the Vercel dashboard.** The Project → Usage → ISR Writes view should show a route breakdown. If 95% of writes are on `/research`, Fix 1 is confirmed; if writes are spread across multiple routes, the §1 table is wrong somewhere and a deeper audit is needed.
2. **Function invocation history.** The cron workflows have GitHub Actions logs (visible in the repo's Actions tab) but those don't include the Vercel function-side timing. If `/api/worker/check-sources` ever threw an unhandled exception causing a regeneration of a parent page, it would show in invocation logs but not here.
3. **Cache-bucket cardinality on `/research`.** The realistic count of distinct cookie envelopes is the unknown. With one workspace and ~5 users we'd expect 5-15 buckets; the 200K writes / 30 days / ~5,000 buckets-per-day rate suggests either a) more sessions/cookies than expected (incognito sessions, mobile, multiple browsers per user), b) a single user hammering refresh/`/research` while leaving the tab open longer than 60s, or c) a Slack-bot or LinkedIn-preview crawler that is sending cookies and getting through `proxy.ts` somehow. Any of these can be diagnosed once Pro tier exposes per-bucket telemetry.
4. **Whether previous deployments had additional `revalidate` declarations.** The git log shows multiple `feat(surfaces)` commits that rebuilt these pages — earlier revisions might have had broader `revalidate` coverage that was burned through before being trimmed back. The 200K hit could reflect a pre-cleanup state. If true, the system is already self-corrected and Fix 1 is the only remaining lift.
5. **`MIDDLEWARE_INVOCATION` vs `ISR_REGENERATION` billing distinction.** Vercel bills these separately on Pro; on Free they aggregate against per-feature caps. If the 200K includes middleware invocations that we've miscategorised, the math is different. A first day on Pro with the dashboard breakdown will resolve this.

The single-line fix in §6 should be the lowest-risk path to free-tier-style write counts under Pro. If the post-fix count is anywhere above 1K/day, return to this document, find the assumption that broke, and re-investigate. The most likely culprit in that case is item 3 above — unexpected cache-bucket cardinality somewhere — which would warrant adding `Cache-Control: private, no-store` on the `proxy.ts` response to suppress edge caching of cookie-keyed responses entirely.

---

## Appendix — verification commands

```bash
# Confirm zero revalidatePath / revalidateTag calls
grep -rE 'revalidatePath|revalidateTag' fsi-app/

# Confirm no next/cache imports
grep -rE "from ['\"]next/cache['\"]" fsi-app/

# Confirm exhaustive route export inventory
grep -rnE 'export const (revalidate|dynamic|fetchCache|runtime)' fsi-app/src/app/

# Confirm no Vercel cron config
cat fsi-app/vercel.json

# Confirm GitHub Actions cron schedule
grep -E '^\s*-\s*cron:' .github/workflows/*.yml

# Confirm /research data path is cookies-free
sed -n '1,70p' fsi-app/src/app/research/page.tsx
```
