"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { AskAssistant } from "@/components/AskAssistant";
import { BackToTop } from "@/components/BackToTop";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspaceStore } from "@/stores/workspaceStore";

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
  const { user } = useAuth();
  const orgId = useWorkspaceStore((s) => s.orgId);
  const hideSidebar = NO_SIDEBAR_ROUTES.some((r) => pathname.startsWith(r));

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
        {/* Masthead chrome — 3px navy → red gradient on every page.
            See DESIGN_SYSTEM.md "Masthead rule". Shell chrome, not part
            of the per-screen urgency budget. */}
        <div
          aria-hidden="true"
          style={{
            height: "3px",
            background: "var(--gradient-masthead)",
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
