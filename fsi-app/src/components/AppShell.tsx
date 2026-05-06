"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { AskAssistant } from "@/components/AskAssistant";
import { useAuth } from "@/components/auth/AuthProvider";

const NO_SIDEBAR_ROUTES = ["/login", "/auth"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const hideSidebar = NO_SIDEBAR_ROUTES.some((r) => pathname.startsWith(r));

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
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
        <footer className="px-6 py-3 text-center" style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
          <p className="text-[10px]">For informational purposes only. Not legal advice. Regulations move fast, always verify with official sources before acting.</p>
        </footer>
      </div>
      {user && <AskAssistant />}
    </div>
  );
}
