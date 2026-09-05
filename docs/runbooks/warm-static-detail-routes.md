# Runbook: warm static detail routes after a deploy

**Status:** documented, decision-ready — NOT wired into CI by this lane. Referenced from PERF-13's
code comments (`fsi-app/src/app/{regulations,market,operations,research}/[slug]/page.tsx`,
`fsi-app/src/components/regulations/RegulationsLedger.tsx`). Whoever lands this decides whether/when
to wire it; this file exists so the reference in those comments points at something real instead of a
promise, per CLAUDE.md rule 13 ("there is no small follow-up fix, fix it now").

## Problem this closes

PERF-13 (2026-09-04, `docs/audits/perf-clickthrough-2026-09-04.md` §(b)/(c)) made
`generateStaticParams` for all four `[slug]` detail routes enumerate every verified, non-archived
slug at build time (`getPublicSurfaceSlugs`, `fsi-app/src/lib/data.ts`) instead of returning `[]`.
That closes the on-demand-generation gap for the ENTIRE corpus that existed at the last build —
1,431 items measured 2026-09-04 (1,312 regulations / 55 market / 25 operations / 39 research, via
Supabase MCP against `get_workspace_intelligence_listings_public`/the three domain-specific public
RPCs).

The residual: an item minted AFTER the last deploy has no static page yet. `dynamicParams` stays at
its Next.js default (`true`), so that item still renders correctly on its first request — but that
first request pays the on-demand static generation cost the operator measured (760-950ms, nothing on
screen for ~900ms of it — see `docs/audits/perf-clickthrough-2026-09-04.md` §(c) and this lane's own
`RegulationDetailPage`/`generateStaticParams` comment for the `loading.tsx`-doesn't-stream citation,
[CONFIRMED] via github.com/vercel/next.js/issues/77322, a confirmed Next.js architectural limitation
for ISR/on-demand-static routes, not something fixable inside this route). Enabling `cacheComponents`
(Next 16's PPR replacement) would let a static shell stream around that gap, but PERF-9 already
scoped that out as "a materially bigger flag... needs its own dedicated, adversarially-tested lane"
(`fsi-app/next.config.ts`, PERF-9 comment block, citing `ADR-026` §2) — a binding prior decision this
lane respects rather than reopens (CLAUDE.md rule B2).

So: shrink the population that ever pays the on-demand cost down to zero, by requesting every current
slug once, right after each deploy finishes — the same "just build it now instead of waiting for a
real visitor to trigger it" idea `generateStaticParams` already uses at BUILD time, applied again
right after a deploy for whatever minted between the branch cut and the deploy landing.

## Why this is a warm step, not a schedule

CLAUDE.md forbids new schedules. This is not one: it runs exactly once per deploy, triggered by the
deploy event itself (a GitHub Actions job `on: deployment_status` / `workflow_run` keyed to the
production deploy workflow, or a Vercel Deploy Hook / `vercel-build-output` webhook — whichever this
repo's existing deploy pipeline already exposes; see `.github/workflows/build-proof.yml` and
`.github/workflows/uptime-probes.yml` for this repo's existing post-deploy-triggered job shapes to
extend rather than inventing a new trigger mechanism). It never runs on a timer, and it is idempotent
— re-running it after a deploy that added nothing new just re-requests already-built pages (cheap:
Full Route Cache hits, not regenerations).

## What it does

1. Enumerate the current slug set for all four surfaces via the SAME function `generateStaticParams`
   already calls — `getPublicSurfaceSlugs(surface)` (`fsi-app/src/lib/data.ts`) — reused, not
   reimplemented (CLAUDE.md: no copies of logic). One writer of "what are the real slugs": that
   function.
2. Issue one `GET` (not `HEAD` — a HEAD request does not trigger on-demand static generation for a
   `dynamicParams: true` fallback path; the route must actually be rendered) to
   `https://<deployed-origin>/<surface>/<slug>` for each slug, against the JUST-DEPLOYED origin. A
   response already served from cache costs nothing extra; a response for a slug minted since the
   last build triggers exactly the generation this runbook exists to move off the first real
   visitor's click.
3. Run these requests with bounded concurrency (a handful in flight at once — the same "one cache
   population, N cache hits" reasoning as the row-link prefetch comment in
   `RegulationsLedger.tsx` applies here too: concurrent requests for the SAME not-yet-built slug
   share the one `unstable_cache`-backed generation, so concurrency only needs to be bounded to avoid
   hammering the deploy target, not to avoid duplicate work).
4. Log a simple count (slugs requested, non-2xx count) to the workflow's own output — no new
   database table, no new dataset, nothing for CLAUDE.md's "one writer per dataset" rule to police.

## Reference shape (illustrative — not wired into CI by this lane)

```js
// scripts/ops/warm-static-detail-routes.mjs (NOT created by this lane — shape only)
import { getPublicSurfaceSlugs } from "../../src/lib/data.ts"; // via tsx/jiti, same as other scripts/*
const ORIGIN = process.env.WARM_ORIGIN; // the just-deployed URL, from the deploy event payload
const SURFACES = ["regulations", "market", "operations", "research"];
const CONCURRENCY = 8;

async function warmSurface(surface) {
  const slugs = await getPublicSurfaceSlugs(surface);
  let ok = 0, fail = 0;
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    const batch = slugs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((slug) => fetch(`${ORIGIN}/${surface}/${encodeURIComponent(slug)}`))
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.ok) ok += 1; else fail += 1;
    }
  }
  console.log(`[warm] ${surface}: ${ok} ok, ${fail} failed of ${slugs.length}`);
}

for (const surface of SURFACES) await warmSurface(surface);
```

## Who decides when to wire it

This lane's dispatch says "consider streaming the detail body behind Suspense inside a static shell"
for item 2 — investigated and rejected above (no benefit without `cacheComponents`, which is
out of scope here) — and separately to close the residual gap `generateStaticParams`'s own comment
promises a warm step for. Wiring THIS runbook into an actual deploy-triggered CI job is a coordinator
landing decision (which deploy-event hook this repo's real pipeline exposes is infrastructure this
lane's sandboxed worktree cannot observe or test against a live deploy) — this file makes that
decision reviewable rather than leaving the code comments point at nothing.
