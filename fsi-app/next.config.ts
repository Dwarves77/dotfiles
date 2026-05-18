import type { NextConfig } from "next";
import path from "path";
import withBundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // PR-D IA refactor (2026-05-06): /events and /vendors moved under
  // /community/* per design intent (visual-reconciliation §3.8). 308
  // permanent redirects preserve any external bookmarks while the
  // route files at /events and /vendors are also kept as
  // server-component redirects for defense-in-depth.
  async redirects() {
    return [
      {
        source: "/events",
        destination: "/community/events",
        permanent: true,
      },
      {
        source: "/vendors",
        destination: "/community/vendors",
        permanent: true,
      },
    ];
  },
  // Cache-Control: see docs/sprint-1/perf-1-design.md for the full design.
  //
  // PERF-1 (2026-05-18) supersedes the prior perf/cache-headers-swr-expansion
  // pilot (2026-05-10) for the 7 PERF-1 routes specifically. The pilot used
  // a content-blind universal `private, max-age=30, swr=300` across the
  // protected HTML routes. PERF-1 replaces that with content-aware TTLs
  // anchored on the observed payload-stability windows for each route:
  //
  //   /regulations          max-age=300, swr=60   (index, refreshes with ingest)
  //   /regulations/:slug    max-age=900, swr=120  (detail, stable per item)
  //   /market               max-age=3600, swr=300 (weekly-aggregation payload)
  //   /research             max-age=300, swr=60   (index, refreshes with ingest)
  //   /operations           max-age=300, swr=60   (index, refreshes with ingest)
  //   /map                  max-age=900, swr=120  (slim geo payload, stable)
  //   /                     max-age=120, swr=30   (dashboard, lightest cache)
  //
  // All entries use `private` to keep responses out of any shared CDN cache;
  // edge / shared-cache work is captured as PERF-2 in the design doc and
  // requires middleware-driven cache keys (deferred).
  //
  // OUT OF PERF-1 SCOPE (left untouched):
  //   /community(/.*)?      retains the pilot's 30s/300s pattern; PERF-1 has
  //                         no scope to modify this surface and the prior
  //                         pilot's posture is a working baseline. Community
  //                         is mutate-on-action; longer cache windows need a
  //                         mutation-invalidation hook design that PERF-1
  //                         intentionally skips.
  //   /admin, /login, /settings  not cached. Triage / auth / settings
  //                         surfaces need fresh data; design doc lists them
  //                         as OUT.
  //
  // Risk (unchanged from pilot): browser caches are independent of
  // `revalidateTag(APP_DATA_TAG)`. In-page mutations that must be immediately
  // visible should call `router.refresh()` to bypass the browser cache for
  // the RSC payload.
  //
  // Q1-Q6 resolved in docs/sprint-1/perf-1-design.md; no operator decisions
  // required at PR review.
  async headers() {
    return [
      // ── PERF-1 (2026-05-18): content-aware TTLs per design doc ──
      // /regulations/:slug listed BEFORE /regulations so the more specific
      // pattern matches first (Next.js evaluates headers entries in order).
      {
        source: "/regulations/:slug",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=900, stale-while-revalidate=120",
          },
        ],
      },
      {
        source: "/regulations",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=300, stale-while-revalidate=60",
          },
        ],
      },
      {
        source: "/market",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=3600, stale-while-revalidate=300",
          },
        ],
      },
      {
        source: "/research",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=300, stale-while-revalidate=60",
          },
        ],
      },
      {
        source: "/operations",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=300, stale-while-revalidate=60",
          },
        ],
      },
      {
        source: "/map",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=900, stale-while-revalidate=120",
          },
        ],
      },
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=120, stale-while-revalidate=30",
          },
        ],
      },
      // ── OUT OF PERF-1 scope: pilot baseline preserved ──
      {
        source: "/community(/.*)?",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=30, stale-while-revalidate=300",
          },
        ],
      },
    ];
  },
};

// Bundle analyzer runs only when ANALYZE=true is set on the build command.
// Outputs static HTML reports to .next/analyze/ that visualize per-route
// chunk composition. Use via `npm run analyze`. Required reading before
// any code-splitting or perf dispatch — see docs/PERF-PLAYBOOK.md.
export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})(nextConfig);
