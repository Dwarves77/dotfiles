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
  // P4 fix (2026-09-06, docs/audits/perf-load-times-2026-09-03.md §10): "no client-side route
  // cache, every back-navigation re-fetches and shows a ~3s skeleton reload." ROOT CAUSE
  // [CONFIRMED] by reading `node_modules/next/dist/server/config-shared.js`: this Next version
  // (16.1.6) defaults `experimental.staleTimes.dynamic` to 0 — every dynamic route segment (every
  // route in this app: all read cookies()/auth per the redirects() comment below, so all are
  // dynamic) is treated as immediately stale in the CLIENT Router Cache, so a back/forward
  // navigation always re-requests the RSC payload instead of reusing what is already in memory,
  // even though the app just rendered it seconds ago. This is a SEPARATE cache layer from
  // ADR-026's server-side `unstable_cache` item-scoped split (which this does not touch or
  // weaken — that cache still governs what a fresh fetch is allowed to reuse; this governs
  // whether the CLIENT has to issue that fetch at all on a nav the user has already paid for).
  // `dynamic: 30` gives the client a 30s window to serve a back-navigation from its own cache
  // instead of re-fetching and re-rendering the full skeleton; `static` keeps the Next default
  // (300s) — static segments were never the reported problem. Measured before/after with the
  // perf audit's Resource Timing method: see docs/audits/perf-load-times-2026-09-03.md §10.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  // PERF-9 (2026-09-04, item 3, ADR-026 §2): `experimental.ppr` (classic Partial Prerendering) was
  // tested here and found REMOVED in this Next version — the build itself refuses to start:
  // "`experimental.ppr` has been merged into `cacheComponents`... enabled via `cacheComponents`."
  // Next 16's replacement, top-level `cacheComponents: true`, is a materially bigger flag than
  // classic PPR: it changes fetch/data caching semantics for every component in the app (opt-IN
  // caching via "use cache" directives, not opt-out), not a per-route toggle — flipping it needs
  // its own dedicated, adversarially-tested lane, not a one-line addition inside this one. See
  // ADR-026 §2 for the full account of what was tried and why it stops here, decision-ready.
  // PERF-1's `headers()` Cache-Control block (docs/sprint-1/perf-1-design.md) removed, lane
  // MOBILE-2, 2026-09-03: the coordinator's same-origin iframe probe against the deployed build
  // (2026-09-03) found every one of these page routes actually serving `Cache-Control: private,
  // no-cache, no-store` in production — Next overrides a config-level Cache-Control header on a
  // dynamic route (every route here reads cookies()/auth, so all are dynamic) — making this entire
  // block dead configuration; it never reached a client. It was also the reason screenshot
  // 08-regulations-ledger-stale-or-broken.jpg showed the pre-fix layout on the operator's phone
  // AFTER the fix had shipped: something in the client's caching (long since not this config, since
  // it was never live) was serving a stale session. See this lane's REPORT for what next.config.ts
  // does and does not configure around deployment/skew.
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
