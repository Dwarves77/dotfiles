# Perf Playbook

_The measurement-first workflow for Caro's Ledge perf work. Created 2026-05-06 after the code-split wave shipped a measurable regression because the dispatch was speculative._

## The rule

**No perf dispatch without evidence. No optimization without a measurement that justifies the lever.**

Before any "perf wave," "code-split," "lazy-load," or "reduce X" dispatch, the first deliverable is a measurement showing what's actually slow and which lever moves it. If the measurement says the lever doesn't move the bottleneck, the dispatch is wrong and gets rewritten — not executed anyway.

## Why this exists

Two consecutive sessions optimized in the dark. PR #29 (perf wave) shipped real wins because the ISR fix had a math-confirmed root cause (200K writes / 30 days from a single revalidate=60 + cookie-bucketed cache). The code-split wave on the same branch's lineage shipped no wins because `dynamic({ ssr: true })` from a server component does not actually defer chunks in App Router — it just adds a 1.4 kB loader stub to every wrapped route. We ran the speculative experiment, paid for the cycle, and got the negative result on the actual production build.

The negative result was the right outcome of the experiment. The wrong part was running the experiment without first checking whether the bottleneck it targeted was the actual bottleneck. The instruments we needed already exist on Vercel and in the npm ecosystem; we just hadn't installed them.

## The instruments

### Live now (free, build-time)

#### 1. `@next/bundle-analyzer` (composition of each chunk)

Wired in `next.config.ts` behind `ANALYZE=true`. Run with `npm run analyze`. Outputs static HTML reports to `.next/analyze/` showing exactly which dependencies make up each chunk.

What it tells you:
- WHICH transitive imports are the heavy ones (e.g., is the 60 kB on a route the markdown library? lucide icons? Zustand?).
- Where the win actually lives — sometimes a 5 kB micro-component imports a 200 kB lib.
- Whether a "chunk that looks small" is actually pulling in a giant dep tree.

Use it BEFORE proposing what to split or replace. Use `npm run perf:bundles` for the grep-able tabular companion view.

#### 2. `scripts/measure-bundles.mjs` (per-route entry vs total inventory)

Run with `npm run perf:bundles` after a build. Prints a clean diffable table of every tracked route showing Entry (First Load JS), route-specific entry, and All client (entry + async chunks). Snapshot before and after a perf change to confirm direction.

This is complementary to the analyzer — analyzer is GUI for composition, this script is CLI for trends.

### Deferred until traffic warrants it

#### Vercel Speed Insights (real-user Web Vitals)

**Status: deferred, not rejected.** Reports real-user LCP / FCP / INP / CLS / TTFB per route to the Vercel dashboard.

Why deferred: Speed Insights is a real-user-monitoring (RUM) tool. Its value scales with user traffic. At current platform usage (single-tenant pre-pilot), the data would be too sparse to drive decisions — a handful of sessions per route per day produces noise, not signal. Build-time bundle analysis already gives us evidence-grounded perf decisions for the architecture we ship.

Reactivation criteria — **enable when ALL of these hold:**
- Real user traffic on production reaches a level where p75 figures stabilize across days (rule of thumb: ~100+ distinct daily sessions per top route).
- Likely trigger: after Dietl/Rockit pilot expands beyond initial sandbox accounts, or when the platform onboards a second org.
- A specific perf question is on the table that ONLY RUM can answer (e.g., "are real users experiencing slow LCP on cellular networks in EU?").

Cost at reactivation: Speed Insights Plus is $10/month/project on Pro tier as of 2026-05.

How to reactivate: `npm install @vercel/speed-insights`, add `<SpeedInsights />` to `src/app/layout.tsx` body, redeploy. Read at `https://vercel.com/dwarves77s-projects/carosledge/speed-insights`.

#### Vercel Analytics (page traffic + custom events)

**Status: deferred, not rejected.** Tracks page views, referrers, top routes, and custom events.

Why deferred: same reasoning as Speed Insights — RUM-class data needs traffic to be statistically meaningful. With sparse usage, the dashboard would mostly mirror what we already know from access logs.

Reactivation criteria: same as Speed Insights. The two should typically be enabled together — they share the traffic threshold.

Cost at reactivation: Web Analytics Plus is $10/month/project on Pro tier as of 2026-05. Free Web Analytics tier exists with hard limits but is better skipped — if you want the data, pay for the unrestricted tier when you turn it on.

How to reactivate: `npm install @vercel/analytics`, add `<Analytics />` to `src/app/layout.tsx` body, redeploy. Read at `https://vercel.com/dwarves77s-projects/carosledge/analytics`.

### When you're ready to flip RUM on

Don't add Speed Insights and Analytics speculatively to "have data later." They cost recurring money and add ~6.5 kB to the shared layout chunk. Add them when you have a specific perf question RUM is the right tool to answer, and traffic is sufficient to give the answer signal — not noise.

## The standard workflow for a perf dispatch

1. **State the symptom.** "Page X feels slow," "Vercel Usage shows ISR Writes spiking," "build takes too long," etc. Don't propose a fix yet.

2. **Read the instruments first.**
   - Bundle analyzer (`npm run analyze`) + `perf:bundles` if the symptom looks bundle-related.
   - Vercel Usage tab for ISR / Function / Image quotas — this is the cost surface.
   - `console.log("[perf] ...")` server timing logs from production logs if the symptom is server-side. Most slow-page reports today resolve here, not in the bundle.
   - Vercel Function logs for cold-start vs warm-execution timing differences.
   - If RUM is enabled (deferred — see "The instruments" section): Speed Insights for LCP/FCP/INP/CLS/TTFB, Analytics to confirm the route has traffic worth optimizing.
   - If RUM is NOT yet enabled and the question genuinely requires real-user data: that's the trigger to evaluate enabling RUM, not to optimize blind.

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
