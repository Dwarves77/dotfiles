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
};

// Bundle analyzer runs only when ANALYZE=true is set on the build command.
// Outputs static HTML reports to .next/analyze/ that visualize per-route
// chunk composition. Use via `npm run analyze`. Required reading before
// any code-splitting or perf dispatch — see docs/PERF-PLAYBOOK.md.
export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})(nextConfig);
