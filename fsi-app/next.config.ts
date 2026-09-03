import type { NextConfig } from "next";
import path from "path";
import fs from "fs";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { withWorkflow } from "workflow/next";

// Both outputFileTracingRoot and turbopack.root must resolve to the same path
// (Next.js 16 enforcement). On Vercel, the build context root is /vercel/path0
// (the repo root, NOT the fsi-app subdirectory where next.config.ts lives).
// Vercel auto-detects outputFileTracingRoot to that build-context root. To
// avoid the mismatch warning, anchor both to the REPO root (parent of __dirname),
// matching Vercel's auto-detected value rather than the file's own directory.
// This is also correct semantically: file tracing should span the entire
// repository so any cross-package dependencies are included.
//
// WORKTREE CASE (BUILDGATE, 2026-09-02, F34's named residual / build-graph proof).
// Parallel-lane worktrees under /root/work/lanes/<lane>/ symlink fsi-app/node_modules
// to the single shared install in the primary checkout (see CLAUDE.md "no npm install
// in a worktree"), e.g. /root/work/dotfiles/fsi-app/node_modules. That target sits
// OUTSIDE the worktree's own directory tree, and Turbopack refuses a project root
// whose node_modules symlink resolves outside the configured root ("Symlink
// fsi-app/node_modules is invalid, it points out of the filesystem root") — `next
// build` (Turbopack, default) cannot run at all in a worktree until this is widened.
// `next build --webpack` does not hit this (webpack's resolver dereferences the
// symlink instead of sandboxing to a project root), so it already works unmodified
// and remains the worktree build proof either way; this widening additionally
// restores parity with `next build`'s Turbopack default there.
//
// The widening is COMPUTED, never hardcoded to a container path: resolve the real
// (symlink-following) target of fsi-app/node_modules and, only when that target
// falls outside the normal REPO_ROOT (the worktree case), raise APP_ROOT to the
// nearest common ancestor of REPO_ROOT and the target. On Vercel and on a normal
// clone, node_modules is a real directory inside the repo (`npm ci`), the target
// resolves inside REPO_ROOT, and this is a no-op — APP_ROOT stays REPO_ROOT exactly
// as before. A missing node_modules (not yet installed) also no-ops to REPO_ROOT.
function computeAppRoot(): string {
  const repoRoot = path.resolve(__dirname, "..");
  let target: string;
  try {
    target = fs.realpathSync(path.join(__dirname, "node_modules"));
  } catch {
    return repoRoot; // node_modules absent (not yet installed): normal repo root
  }
  const rel = path.relative(repoRoot, target);
  if (!rel.startsWith("..")) return repoRoot; // target is inside repoRoot: no-op
  let common = repoRoot;
  while (common !== path.dirname(common)) {
    common = path.dirname(common);
    if (!path.relative(common, target).startsWith("..")) return common;
  }
  return repoRoot; // no common ancestor short of "/": fall back rather than widen to "/"
}

const APP_ROOT = computeAppRoot();

const nextConfig: NextConfig = {
  outputFileTracingRoot: APP_ROOT,
  turbopack: {
    root: APP_ROOT,
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
  // Config-level redirects. /events is not one of the five customer surfaces — community
  // events live under /community. The prior src/app/events/page.tsx stub redirected to a
  // nonexistent /community/events (404); it is removed and this config redirect is the
  // correct home for the bookmark/crawler catch (a redirect, not a page-surface).
  async redirects() {
    return [
      { source: "/events", destination: "/community", permanent: true },
      // V-09 (2026-07-11): /account has no page (latent 404, zero inbound links). Account
      // settings live at /profile; a permanent redirect closes the 404 for any bookmark/crawler.
      { source: "/account", destination: "/profile", permanent: true },
    ];
  },
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
// Sprint 4 Block 1 (task 1.0b): wrap the Next.js config with withWorkflow()
// from the Workflow DevKit. This enables the "use workflow" / "use step"
// directives (consumed by src/workflows/* in later Block 1 tasks) and stands
// up the SDK's internal route handlers under /.well-known/workflow/, against
// which `npx workflow health` runs its queue-based check. Composition order:
// withWorkflow wraps the bundle-analyzer-wrapped config so both plugins apply.
export default withWorkflow(
  withBundleAnalyzer({
    enabled: process.env.ANALYZE === "true",
  })(nextConfig)
);
