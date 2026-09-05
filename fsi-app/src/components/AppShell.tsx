"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { AskAssistant } from "@/components/AskAssistant";
import { BackToTop } from "@/components/BackToTop";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspaceOverridesHydration } from "@/lib/hooks/useWorkspaceOverridesHydration";
import { computeShowNoWorkspaceBanner } from "@/components/app-shell-banner";

const NO_SIDEBAR_ROUTES = ["/login", "/auth"];
// Routes where the no-workspace banner is suppressed (the user is already
// going through the setup flow, no need to nag).
const NO_WORKSPACE_BANNER_SUPPRESS = [
  "/workspace/new",
  "/invitations/",
  "/onboarding",
  "/login",
  "/auth",
  "/signup",
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Sprint 3 SF-WS-1 (2026-05-27): read orgId from AuthContext rather
  // than useWorkspaceStore. AuthContext hydrates orgId synchronously
  // from server props; the workspaceStore hydrates in a useEffect, so
  // its server-side value is null and the banner condition triggered
  // a flash even for users with populated workspaces.
  const { user, orgId } = useAuth();
  const hideSidebar = NO_SIDEBAR_ROUTES.some((r) => pathname.startsWith(r));

  // STEP 2(b) FIX (PERF-MERGE, 2026-09-04) [CONFIRMED root cause]: `orgId` is now three-valued
  // (undefined = unknown/unresolved, null = resolved-no-org, string = resolved-with-org — see
  // AuthContext's own doc comment in AuthProvider.tsx for the full mechanism). This banner used to
  // read `!orgId`, which is true for BOTH "unresolved" and "resolved: no org" — and since PERF-9
  // moved bootstrap into a Suspense-gated flow (now: a client `fetch` in AuthProvider's `useEffect`),
  // `AuthProvider`'s `onAuthStateChange` listener sets `user` independently and typically faster than
  // `orgId` resolves, producing a real `user: truthy, orgId: unresolved` window on every load for a
  // signed-in operator whose org DOES exist. `docs/design/ux-laws.md` forbids showing a false state
  // while data is loading — `orgId === null` (a RESOLVED null, never `undefined`) is the only state
  // this banner may render for; `orgId === undefined` renders nothing, same as the loading chrome
  // everywhere else on this shell.

  // PERF-10 (2026-09-04, ADR-026 Follow-up / migration 306): mounted ONCE here rather than
  // per-surface (unlike usePersonalStateHydration, which each of RegulationsLedger/HomeSurface/
  // SettingsPage calls individually) because the four index pages AND the four detail pages
  // (OwnerTeamCard, NotesField) all now read the same resourceStore.overrides map that used to
  // arrive as a per-page SSR prop. One mount point here — always rendered except the two
  // no-sidebar auth routes, neither of which reads workspace overrides — replaces N per-page
  // mounts and guarantees no surface forgets to wire it. Fail-soft/no-op when signed out (see
  // the hook's own header).
  useWorkspaceOverridesHydration();

  // Workstream B: render a banner for authenticated-no-workspace state.
  // FOUR-state machine (STEP 2(b), PERF-MERGE 2026-09-04 — was documented as three, the missing
  // state was exactly the bug): signed-out -> regular chrome (data is anonymous); signed-in +
  // orgId unresolved (undefined) -> regular chrome, banner withheld until we actually know;
  // signed-in + orgId resolved null -> banner inviting them to /workspace/new; signed-in + orgId
  // resolved to an id -> normal product surface. Predicate lives in app-shell-banner.ts, not inline,
  // so it is unit-testable with node --test + jiti (this repo has no JSX mount infra — see that
  // file's own header) — see AppShell.npmtest.mjs for the four-state proof.
  const showNoWorkspaceBanner = computeShowNoWorkspaceBanner({
    user,
    orgId,
    pathname,
    suppressRoutes: NO_WORKSPACE_BANNER_SUPPRESS,
  });

  if (hideSidebar) {
    return <>{children}</>;
  }

  // PERF-13 (2026-09-04, docs/audits/perf-clickthrough-2026-09-04.md §(f), root cause):
  // `min-h-screen` (a MINIMUM height) does not bound this container's height — it lets the whole
  // shell auto-grow to fit `<main>`'s content, so `<main className="flex-1 overflow-y-auto">`
  // below never actually overflows (`scrollHeight === clientHeight`, confirmed this lane via an
  // isolated CSS reproduction) and the browser scrolls `window`/`document.documentElement` instead
  // — while EVERY comment in this codebase that references AppShell's scroll container
  // (useNearestScrollParent.ts, VirtualizedRowList.tsx, both PERF-12) already assumes `<main>` is
  // the real, internally-scrolling page-level container (the standard "fixed sidebar + header,
  // internally-scrolling content" app-shell pattern this component is named for). `h-screen` (a
  // FIXED 100vh) is the one-word fix that makes that assumption true: it bounds this flex row so
  // `<main>`'s `flex-1` share of the remaining vertical space is itself bounded, `overflow-y-auto`
  // then does real work, and `main.scrollTop` correctly tracks the user's actual scroll position —
  // which is what TanStack Virtual's `useVirtualizer({ getScrollElement: () => main })` needs to
  // ever render past its initial visible+overscan window, and what makes a scroll gesture actually
  // move the infinite-scroll sentinel through the viewport instead of leaving it (and `<main>`'s
  // `scrollTop`) pinned wherever they started.
  return (
    <div className="flex h-screen" style={{ backgroundColor: "var(--color-bg-base)" }}>
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Masthead chrome — 4px orange → blue brand rule on every page
            (redesign T02, HANDOFF §5). Identical on every surface. Shell
            chrome, not part of the per-screen urgency budget. */}
        <div
          aria-hidden="true"
          style={{
            height: "4px",
            background: "var(--gradient-brand)",
            flexShrink: 0,
          }}
        />
        {showNoWorkspaceBanner && (
          <div
            role="status"
            style={{
              padding: "10px 16px",
              backgroundColor: "var(--color-active-bg)",
              borderBottom: "1px solid var(--color-border)",
              fontSize: 12,
              color: "var(--color-text-primary)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span>
              <b>No workspace yet.</b> Accept an invitation or create your own to start collaborating.
            </span>
            <a
              href="/workspace/new"
              style={{
                fontSize: 11,
                fontWeight: 600,
                textDecoration: "underline",
                color: "var(--color-primary)",
              }}
            >
              Set up workspace
            </a>
          </div>
        )}
        <main className="flex-1 overflow-y-auto w-full max-w-[1280px] mx-auto">
          {children}
        </main>
        <footer className="px-6 py-3 text-center" style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
          <p className="text-[10px]">For informational purposes only. Not legal advice. Regulations move fast, always verify with official sources before acting.</p>
        </footer>
      </div>
      {user && <AskAssistant />}
      {/* PR-D F8: jump-to-top FAB. Component already existed; PR-D
          mounts it in the shell so every authenticated surface gets
          it after 400px scroll. Self-gates via internal scrollY listener. */}
      <BackToTop />
    </div>
  );
}
