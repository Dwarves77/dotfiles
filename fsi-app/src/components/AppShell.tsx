"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { AskAssistant } from "@/components/AskAssistant";
import { BackToTop } from "@/components/BackToTop";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspaceOverridesHydration } from "@/lib/hooks/useWorkspaceOverridesHydration";

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
  // Three-state machine: signed-out -> regular chrome (data is anonymous);
  // signed-in + no org -> banner inviting them to /workspace/new; signed-in
  // + org -> normal product surface.
  const showNoWorkspaceBanner =
    !!user &&
    !orgId &&
    !NO_WORKSPACE_BANNER_SUPPRESS.some((r) => pathname.startsWith(r));

  if (hideSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-bg-base)" }}>
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
