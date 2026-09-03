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
