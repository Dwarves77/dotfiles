# Perf Playbook

_The measurement-first workflow for Caro's Ledge perf work. Created 2026-05-06 after the code-split wave shipped a measurable regression because the dispatch was speculative._

## The rule

**No perf dispatch without evidence. No optimization without a measurement that justifies the lever.**

Before any "perf wave," "code-split," "lazy-load," or "reduce X" dispatch, the first deliverable is a measurement showing what's actually slow and which lever moves it. If the measurement says the lever doesn't move the bottleneck, the dispatch is wrong and gets rewritten — not executed anyway.

## Why this exists

Two consecutive sessions optimized in the dark. PR #29 (perf wave) shipped real wins because the ISR fix had a math-confirmed root cause (200K writes / 30 days from a single revalidate=60 + cookie-bucketed cache). The code-split wave on the same branch's lineage shipped no wins because `dynamic({ ssr: true })` from a server component does not actually defer chunks in App Router — it just adds a 1.4 kB loader stub to every wrapped route. We ran the speculative experiment, paid for the cycle, and got the negative result on the actual production build.

The negative result was the right outcome of the experiment. The wrong part was running the experiment without first checking whether the bottleneck it targeted was the actual bottleneck. The instruments we needed already exist on Vercel and in the npm ecosystem; we just hadn't installed them.

## The three instruments

### 1. Vercel Speed Insights (production user latencies)

Wired in `src/app/layout.tsx` via `<SpeedInsights />`. Reports real-user Web Vitals per route to the Vercel dashboard. Free with Pro plan up to 25K events/month.

What it tells you:
- **LCP** (Largest Contentful Paint) — when the main content visible above the fold finishes rendering.
- **FCP** (First Contentful Paint) — when ANYTHING first appears on screen.
- **INP** (Interaction to Next Paint) — how laggy the page feels during input.
- **CLS** (Cumulative Layout Shift) — how much content jumps during load.
- **TTFB** (Time to First Byte) — server response time.

Where to read it: `https://vercel.com/dwarves77s-projects/carosledge/speed-insights`.

What to look at FIRST when something feels slow:
- Compare TTFB vs LCP. If TTFB is 2s and LCP is 2.4s, the bottleneck is server (Supabase queries, RSC payload, server-side rendering). Bundle/JS work won't fix it.
- If TTFB is 200ms and LCP is 4s, the bottleneck is client (JS parse + execute, render-blocking resources, hydration). THEN bundle work might help.
- If INP is bad on a route with heavy interactions, the bottleneck is render thread blocking, not initial load.

### 2. Vercel Analytics (page-level traffic + custom events)

Wired in `src/app/layout.tsx` via `<Analytics />`. Tracks page views, referrers, top routes. Free with Pro plan up to 25K events/month.

What it tells you:
- Which routes actually get traffic. Optimizing `/community/moderation` over `/regulations/[slug]` is wrong if 95% of users live on `/regulations/[slug]`.
- Custom event tracking is available via `track()` from `@vercel/analytics`. Use it sparingly — only when you need to measure a specific user action that Speed Insights doesn't already cover (e.g., "AI bar response time," "tab switch latency").

Where to read it: `https://vercel.com/dwarves77s-projects/carosledge/analytics`.

### 3. @next/bundle-analyzer (composition of each chunk)

Wired in `next.config.ts` behind `ANALYZE=true`. Run with `npm run analyze`. Outputs static HTML reports to `.next/analyze/` showing exactly which dependencies make up each chunk.

What it tells you:
- WHICH transitive imports are the heavy ones (e.g., is the 60 kB on a route the markdown library? lucide icons? Zustand?).
- Where the win actually lives — sometimes a 5 kB micro-component imports a 200 kB lib.
- Whether a "chunk that looks small" is actually pulling in a giant dep tree.

Use it BEFORE proposing what to split or replace. Use `npm run perf:bundles` for the grep-able tabular companion view.

### 4. `scripts/measure-bundles.mjs` (per-route entry vs total inventory)

Run with `npm run perf:bundles` after a build. Prints a clean diffable table of every tracked route showing Entry (First Load JS), route-specific entry, and All client (entry + async chunks). Snapshot before and after a perf change to confirm direction.

This is complementary to the analyzer — analyzer is GUI for composition, this script is CLI for trends.

## The standard workflow for a perf dispatch

1. **State the symptom.** "Page X feels slow," "Vercel Usage shows ISR Writes spiking," "build takes too long," etc. Don't propose a fix yet.

2. **Read the instruments first.**
   - Speed Insights for LCP/FCP/INP/CLS/TTFB on the slow route.
   - Analytics to confirm the route actually has traffic worth optimizing.
   - Bundle analyzer + `perf:bundles` if the symptom looks bundle-related.
   - Vercel Usage tab for ISR/Function/Image quotas.
   - `console.log("[perf] ...")` server timing logs from production logs if the symptom is server-side.

3. **Identify the actual bottleneck.** Map the slow metric to a layer:
   - Server: Supabase round-trips, RSC payload size, ISR misses, no caching.
   - Network: large entry chunks, unoptimized images, blocking fonts.
   - Hydration: client component count, React reconciliation cost.
   - Render thread: heavy synchronous work, large lists without virtualization.
   - Layout: CLS from images without intrinsic dimensions, font swap.

4. **Pick a lever that moves the actual bottleneck.** Not the lever that's culturally fashionable. If LCP is bad because TTFB is bad, the lever is server-side caching or query slimming, not code-splitting.

5. **Pilot ONE change.** Wrap one component, cache one query, lazy-load one widget. Measure before AND after via Speed Insights (give it 24h for prod data) or `perf:bundles` for build-time deltas. If the lever doesn't move the metric, the lever was wrong — abandon it, don't double down by applying it to 5 more components.

6. **Scale only after confirmation.** If the pilot moved the metric meaningfully, scale to similar surfaces. If not, return to step 3 with the new evidence.

## Anti-patterns — these are the failure modes we already paid for

**"Wrap all 6 heavy components in next/dynamic."** Speculative scale-out without a 1-component pilot. We did this; net regression of ~1.4 kB per route plus 3 hours of work.

**"This component is 1054 LOC, surely splitting it helps."** LOC count is not a perf metric. Bundle size and render cost are. Lots of LOC can compress into small JS.

**"Add unstable_cache everywhere."** Cache without measurement adds invalidation complexity and cache-miss latency. Cache only where the query is provably the bottleneck and where staleness is acceptable.

**"Defer everything below the fold."** Deferral has cost (extra round-trip, possible jank). Apply only where the deferred chunk is large enough to matter AND the visual experience can absorb the load delay.

**"This worked in Pages Router so it'll work in App Router."** App Router with React 19 has different chunking and rendering semantics. Verify on the actual stack.

## When to skip this playbook

- A bug, not a perf issue (e.g., the ISR Writes burn was a single buggy revalidate=60 line; fixing it was a 1-line bug fix, not a perf sweep).
- A clear architectural cleanup with a math-confirmed gain (e.g., the auth hydration fix in PR #29 removed 2 client round-trips per page render — math was the proof, not Speed Insights).
- The change is correctness or feature work that happens to also affect perf — perf isn't the primary frame.

In those cases, ship from analysis. The playbook governs work that's perf-FIRST.

## Cost framing

Each speculative perf dispatch burns:
- Claude Opus dispatch tokens (~$5–15 per round-trip with investigation + execution).
- Vercel build minutes (~30s–2min per CI run; included up to limit but eats the limit).
- ISR writes during smoke tests (especially when revalidate is misconfigured — see PR #29).
- The user's review attention (the most expensive resource).

A measurement-first dispatch that produces "the lever was wrong, here's the actual bottleneck, here's the right lever" is a successful dispatch even if no code shipped — because the next dispatch is now correctly targeted. Two such cycles are cheaper than one shipped wrong-lever PR plus the rollback.

## Maintenance

- This file should be referenced by name in dispatches that propose perf work.
- Keep the route list in `scripts/measure-bundles.mjs` current as new routes ship.
- When the Speed Insights or Analytics free tier limits change, update the budget figures here.
- When a new measurement instrument lands (e.g., Vercel Logs API, OpenTelemetry traces, etc.), add it under "The instruments" with the same shape — what it tells you, where to read it, when to use it first.
