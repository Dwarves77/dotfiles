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
  // Cache-Control pilot (2026-05-10): operator measurement showed every
  // protected HTML route returns `private, no-cache, no-store, max-age=0,
  // must-revalidate` with `x-vercel-cache: MISS`, so browser back/forward
  // and quick re-visits pay a full server round trip even though the
  // /regulations payload is small post-PR #90.
  //
  // Header rationale,
  //   `private`                     authenticated content, never share via CDN
  //   `max-age=30`                  30s fresh window for back/forward + quick re-visit
  //   `stale-while-revalidate=300`  5 min background revalidation grace
  //
  // Scope limit, ONLY `/regulations` in this PR (single-route pilot). If
  // post-deploy measurement looks clean, expand to other protected HTML
  // routes in a follow-up.
  //
  // Risk, a 30s fresh window delays mutation visibility on /regulations.
  // Existing `revalidateTag(APP_DATA_TAG)` flows handle server-side cache
  // invalidation, but the BROWSER cache is independent of those tags. If
  // an in-page mutation must be visible immediately, ensure the mutating
  // action triggers a client-side `router.refresh()` (which bypasses the
  // browser cache for the RSC payload).
  async headers() {
    return [
      {
        source: "/regulations",
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
